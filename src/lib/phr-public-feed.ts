import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Query,
  type QuerySnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { getFirebaseDb } from "./firebase";
import { isFirestoreQuotaError } from "./phr-firestore-quota";
import { isFirestoreQuotaPaused, markFirestoreQuotaExceeded } from "./phr-firestore-quota";
import { parseStoredHand, sanitizeForFirestore } from "./phr-firebase-sync";

export const FEED_VIEWER_SOURCE_PREFIX = "spotlab-feed/";

export type FeedReplayerSession = {
  handRecord: Record<string, unknown>;
  uiStepIndex: number;
  displayUnit: "bb" | "chips";
};

export type PublicReaction = "like" | "fire" | "think";

export type PublicFeedSource = "publicPosts" | "spots";

export type PublicHandPost = {
  id: string;
  authorUid: string;
  authorPseudo: string;
  summary: string;
  hand: Record<string, unknown>;
  createdAtMs: number;
  reactions: Record<string, PublicReaction>;
  reactionCounts: Record<PublicReaction, number>;
  feedSource: PublicFeedSource;
  spotMeta?: {
    question: string;
    category: string;
    stepLabel: string;
    heroAction: string;
    heroAmount: number | null;
    sourceValidation: string;
    visibleBoard: string[];
    potLabel: string;
    tournamentName?: string;
    buyIn?: string;
    levelLabel?: string;
    blindsSb?: number | null;
    blindsBb?: number | null;
  };
};

const REACTIONS: PublicReaction[] = ["like", "fire", "think"];

export function emptyReactionCounts(): Record<PublicReaction, number> {
  return { like: 0, fire: 0, think: 0 };
}

export function isFeedViewerHandRecord(hand: Record<string, unknown>): boolean {
  return typeof hand.sourceFile === "string" && hand.sourceFile.startsWith(FEED_VIEWER_SOURCE_PREFIX);
}

/** Prépare une main du fil pour le replayer (étape + unité au moment de la publication). */
export function parseFeedPostForReplayer(post: PublicHandPost): FeedReplayerSession | null {
  const raw = { ...post.hand };
  const replay = raw.phrReplayAtPublish;
  delete raw.phrReplayAtPublish;

  raw.sourceFile = `${FEED_VIEWER_SOURCE_PREFIX}${post.feedSource}/${post.id}`;
  if (typeof raw.id !== "string" || raw.id.trim().length === 0) {
    raw.id = `feed-${post.id}`;
  }

  if (!parseStoredHand(raw)) return null;

  let uiStepIndex = 0;
  let displayUnit: "bb" | "chips" = "bb";
  if (replay && typeof replay === "object") {
    const r = replay as Record<string, unknown>;
    if (typeof r.uiStepIndex === "number" && Number.isFinite(r.uiStepIndex)) {
      uiStepIndex = Math.max(0, Math.round(r.uiStepIndex));
    }
    if (r.displayUnit === "chips" || r.displayUnit === "bb") {
      displayUnit = r.displayUnit;
    }
  }

  return { handRecord: raw, uiStepIndex, displayUnit };
}

function isFirestoreIndexError(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err && typeof err.code === "string" ? err.code : "";
  const message = err instanceof Error ? err.message : "";
  return code === "failed-precondition" && /index/i.test(message);
}

function mapSpotSnapshot(snap: QuerySnapshot): PublicHandPost[] {
  return snap.docs
    .map((d) => parseFeedDocument(d.id, d.data() as Record<string, unknown>, "spots"))
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, 40);
}

/** Abonnement aux spots publics ; repli sans `orderBy` tant que l’index composite se construit. */
function subscribePublicSpots(
  onData: (posts: PublicHandPost[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (isFirestoreQuotaPaused()) {
    queueMicrotask(() => onData([]));
    return () => {};
  }
  const db = getFirebaseDb();
  if (!db) {
    queueMicrotask(() => onData([]));
    return () => {};
  }

  const col = collection(db, "spots");
  const primaryQuery = query(
    col,
    where("visibility", "==", "public"),
    orderBy("createdAt", "desc"),
    limit(25),
  );
  const fallbackQuery = query(col, where("visibility", "==", "public"), limit(40));

  let activeUnsub: Unsubscribe | null = null;

  const attach = (q: Query, useFallback: boolean) => {
    activeUnsub?.();
    activeUnsub = onSnapshot(
      q,
      (snap) => onData(mapSpotSnapshot(snap)),
      (err) => {
        if (isFirestoreQuotaError(err)) {
          onError?.(
            new Error("Quota Firestore dépassé. Le fil public se mettra à jour quand le quota sera rétabli."),
          );
          onData([]);
          return;
        }
        if (!useFallback && isFirestoreIndexError(err)) {
          attach(fallbackQuery, true);
          return;
        }
        onError?.(err instanceof Error ? err : new Error("Erreur chargement des spots"));
        onData([]);
      },
    );
  };

  attach(primaryQuery, false);
  return () => {
    activeUnsub?.();
    activeUnsub = null;
  };
}

export function parseFeedDocument(
  id: string,
  data: Record<string, unknown>,
  feedSource: PublicFeedSource,
): PublicHandPost {
  const rawReactions = data.reactions;
  const reactions: Record<string, PublicReaction> = {};
  if (rawReactions && typeof rawReactions === "object") {
    for (const [uid, value] of Object.entries(rawReactions as Record<string, unknown>)) {
      if (value === "like" || value === "fire" || value === "think") reactions[uid] = value;
    }
  }

  const rawCounts = data.reactionCounts;
  const counts = emptyReactionCounts();
  if (rawCounts && typeof rawCounts === "object") {
    for (const key of REACTIONS) {
      const n = (rawCounts as Record<string, unknown>)[key];
      if (typeof n === "number" && Number.isFinite(n)) counts[key] = Math.max(0, Math.round(n));
    }
  }

  const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
  const createdAtMs =
    typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : Date.now();

  const question = typeof data.question === "string" ? data.question : "";
  const handRecord =
    data.hand && typeof data.hand === "object" ? (data.hand as Record<string, unknown>) : null;
  const replayAtPublish =
    handRecord?.phrReplayAtPublish && typeof handRecord.phrReplayAtPublish === "object"
      ? (handRecord.phrReplayAtPublish as Record<string, unknown>)
      : null;

  const visibleBoardRaw = Array.isArray(data.visibleBoard)
    ? data.visibleBoard
    : Array.isArray(replayAtPublish?.visibleBoard)
      ? replayAtPublish?.visibleBoard
      : [];
  const visibleBoard = visibleBoardRaw.filter(
    (c): c is string => typeof c === "string" && c.length >= 2,
  );

  const potLabel =
    typeof data.potLabel === "string"
      ? data.potLabel
      : typeof replayAtPublish?.potLabel === "string"
        ? replayAtPublish.potLabel
        : "";

  const tournamentName =
    typeof data.tournamentName === "string" ? data.tournamentName.trim() : "";
  const buyIn = typeof data.buyIn === "string" ? data.buyIn.trim() : "";
  const levelLabel = typeof data.levelLabel === "string" ? data.levelLabel.trim() : "";
  const blindsSb =
    typeof data.blindsSb === "number" && Number.isFinite(data.blindsSb) ? data.blindsSb : null;
  const blindsBb =
    typeof data.blindsBb === "number" && Number.isFinite(data.blindsBb) ? data.blindsBb : null;

  const spotMeta =
    feedSource === "spots" || question.length > 0
      ? {
          question,
          category: typeof data.category === "string" ? data.category : "",
          stepLabel: typeof data.stepLabel === "string" ? data.stepLabel : "",
          heroAction: typeof data.heroAction === "string" ? data.heroAction : "",
          heroAmount:
            typeof data.heroAmount === "number" && Number.isFinite(data.heroAmount)
              ? data.heroAmount
              : null,
          sourceValidation:
            typeof data.sourceValidation === "string" ? data.sourceValidation : "",
          visibleBoard,
          potLabel,
          tournamentName: tournamentName || undefined,
          buyIn: buyIn || undefined,
          levelLabel: levelLabel || undefined,
          blindsSb,
          blindsBb,
        }
      : undefined;

  return {
    id,
    authorUid: typeof data.authorUid === "string" ? data.authorUid : "",
    authorPseudo: typeof data.authorPseudo === "string" ? data.authorPseudo : "Joueur",
    summary: typeof data.summary === "string" ? data.summary : "",
    hand: data.hand && typeof data.hand === "object" ? (data.hand as Record<string, unknown>) : {},
    createdAtMs,
    reactions,
    reactionCounts: counts,
    feedSource,
    spotMeta,
  };
}

export function subscribePublicPosts(
  onData: (posts: PublicHandPost[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) {
    queueMicrotask(() => onData([]));
    return () => {};
  }

  let legacyPosts: PublicHandPost[] = [];
  let spotPosts: PublicHandPost[] = [];
  let spotsFeedError: Error | null = null;

  const emit = () => {
    const merged = [...spotPosts, ...legacyPosts]
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, 40);
    onData(merged);
    if (spotsFeedError && legacyPosts.length === 0 && spotPosts.length === 0) {
      onError?.(spotsFeedError);
    }
  };

  const postsQuery = query(collection(db, "publicPosts"), orderBy("createdAt", "desc"), limit(40));

  const unsubPosts = onSnapshot(
    postsQuery,
    (snap) => {
      legacyPosts = snap.docs.map((d) =>
        parseFeedDocument(d.id, d.data() as Record<string, unknown>, "publicPosts"),
      );
      emit();
    },
    (err) => onError?.(err instanceof Error ? err : new Error("Erreur fil public")),
  );

  const unsubSpots = subscribePublicSpots(
    (next) => {
      spotsFeedError = null;
      spotPosts = next;
      emit();
    },
    (err) => {
      spotsFeedError = err instanceof Error ? err : new Error("Erreur chargement des spots");
      spotPosts = [];
      emit();
    },
  );

  return () => {
    unsubPosts();
    unsubSpots();
  };
}

export async function toggleFeedReaction(
  feedSource: PublicFeedSource,
  postId: string,
  uid: string,
  reaction: PublicReaction,
): Promise<void> {
  if (feedSource === "spots") {
    const { toggleSpotReaction } = await import("./phr-spots");
    await toggleSpotReaction(postId, uid, reaction);
    return;
  }
  await togglePublicReaction(postId, uid, reaction);
}

export async function publishPublicPost(input: {
  authorUid: string;
  authorPseudo: string;
  summary: string;
  hand: Record<string, unknown>;
}): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");

  await addDoc(collection(db, "publicPosts"), {
    authorUid: input.authorUid,
    authorPseudo: input.authorPseudo.trim() || "Joueur",
    summary: input.summary.trim(),
    hand: sanitizeForFirestore(input.hand),
    reactions: {},
    reactionCounts: emptyReactionCounts(),
    createdAt: serverTimestamp(),
  });
}

export async function togglePublicReaction(
  postId: string,
  uid: string,
  reaction: PublicReaction,
): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");

  const ref = doc(db, "publicPosts", postId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Publication introuvable.");
    const data = snap.data() as Record<string, unknown>;
    const reactions = { ...(data.reactions as Record<string, PublicReaction> | undefined) };
    const counts = { ...emptyReactionCounts(), ...(data.reactionCounts as Record<PublicReaction, number> | undefined) };

    const previous = reactions[uid];
    if (previous === reaction) {
      delete reactions[uid];
      counts[previous] = Math.max(0, (counts[previous] ?? 1) - 1);
    } else {
      if (previous) counts[previous] = Math.max(0, (counts[previous] ?? 1) - 1);
      reactions[uid] = reaction;
      counts[reaction] = (counts[reaction] ?? 0) + 1;
    }

    tx.update(ref, { reactions, reactionCounts: counts });
  });
}

export const PUBLIC_REACTION_META: Record<
  PublicReaction,
  { label: string; emoji: string }
> = {
  like: { label: "Utile", emoji: "👍" },
  fire: { label: "Grosse main", emoji: "🔥" },
  think: { label: "À discuter", emoji: "🤔" },
};
