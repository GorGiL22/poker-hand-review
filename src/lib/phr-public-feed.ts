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
  type Unsubscribe,
} from "firebase/firestore";

import { getFirebaseDb } from "./firebase";
import { sanitizeForFirestore } from "./phr-firebase-sync";

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
  };
};

const REACTIONS: PublicReaction[] = ["like", "fire", "think"];

export function emptyReactionCounts(): Record<PublicReaction, number> {
  return { like: 0, fire: 0, think: 0 };
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

  const emit = () => {
    const merged = [...spotPosts, ...legacyPosts]
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, 40);
    onData(merged);
  };

  const postsQuery = query(collection(db, "publicPosts"), orderBy("createdAt", "desc"), limit(40));
  const spotsQuery = query(
    collection(db, "spots"),
    where("visibility", "==", "public"),
    orderBy("createdAt", "desc"),
    limit(40),
  );

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

  const unsubSpots = onSnapshot(
    spotsQuery,
    (snap) => {
      spotPosts = snap.docs.map((d) =>
        parseFeedDocument(d.id, d.data() as Record<string, unknown>, "spots"),
      );
      emit();
    },
    (err) => onError?.(err instanceof Error ? err : new Error("Erreur fil public")),
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
    reactionCounts: emptyCounts(),
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
    const counts = { ...emptyCounts(), ...(data.reactionCounts as Record<PublicReaction, number> | undefined) };

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
