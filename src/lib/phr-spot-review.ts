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
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";

import { getFirebaseDb } from "./firebase";
import type { SpotHeroAction } from "./phr-spots";

export type SpotComment = {
  id: string;
  authorUid: string;
  authorPseudo: string;
  text: string;
  createdAtMs: number;
  likes: Record<string, boolean>;
  likeCount: number;
};

function parseCommentLikes(raw: unknown): Record<string, boolean> {
  const likes: Record<string, boolean> = {};
  if (!raw || typeof raw !== "object") return likes;
  for (const [uid, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === true) likes[uid] = true;
  }
  return likes;
}

export type SpotViewerResponse = {
  authorUid: string;
  action: SpotHeroAction;
  amount: number | null;
  authorPseudo: string;
  analysisText: string | null;
  updatedAtMs: number;
};

/** Entrée affichée dans le fil : commentaire ou analyse publiée. */
export type SpotFeedDiscussionItem =
  | {
      kind: "comment";
      id: string;
      authorUid: string;
      authorPseudo: string;
      text: string;
      createdAtMs: number;
      likes: Record<string, boolean>;
      likeCount: number;
    }
  | {
      kind: "analysis";
      id: string;
      authorUid: string;
      authorPseudo: string;
      action: SpotHeroAction;
      amount: number | null;
      analysisText: string | null;
      createdAtMs: number;
    };

export type SpotResponseStats = Record<SpotHeroAction, number>;

function commentsCol(spotId: string) {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");
  return collection(db, "spots", spotId, "comments");
}

function responsesCol(spotId: string) {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");
  return collection(db, "spots", spotId, "responses");
}

export function subscribeSpotComments(
  spotId: string,
  onData: (comments: SpotComment[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) {
    queueMicrotask(() => onData([]));
    return () => {};
  }

  const q = query(commentsCol(spotId), orderBy("createdAt", "desc"), limit(80));
  return onSnapshot(
    q,
    (snap) => {
      const comments = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
        const likes = parseCommentLikes(data.likes);
        const likeCount =
          typeof data.likeCount === "number" && Number.isFinite(data.likeCount)
            ? Math.max(0, Math.round(data.likeCount))
            : Object.keys(likes).length;
        return {
          id: d.id,
          authorUid: typeof data.authorUid === "string" ? data.authorUid : "",
          authorPseudo: typeof data.authorPseudo === "string" ? data.authorPseudo : "Joueur",
          text: typeof data.text === "string" ? data.text : "",
          createdAtMs:
            typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : Date.now(),
          likes,
          likeCount,
        } satisfies SpotComment;
      });
      onData(comments);
    },
    (err) => onError?.(err instanceof Error ? err : new Error("Erreur commentaires")),
  );
}

export async function submitSpotComment(
  spotId: string,
  authorUid: string,
  authorPseudo: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Commentaire vide.");
  await addDoc(commentsCol(spotId), {
    authorUid,
    authorPseudo: authorPseudo.trim() || "Joueur",
    text: trimmed,
    likes: {},
    likeCount: 0,
    createdAt: serverTimestamp(),
  });
}

export async function toggleSpotCommentLike(
  spotId: string,
  commentId: string,
  uid: string,
): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");

  const ref = doc(db, "spots", spotId, "comments", commentId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Commentaire introuvable.");
    const data = snap.data() as Record<string, unknown>;
    const likes = parseCommentLikes(data.likes);
    let likeCount =
      typeof data.likeCount === "number" && Number.isFinite(data.likeCount)
        ? Math.max(0, Math.round(data.likeCount))
        : Object.keys(likes).length;

    if (likes[uid]) {
      delete likes[uid];
      likeCount = Math.max(0, likeCount - 1);
    } else {
      likes[uid] = true;
      likeCount += 1;
    }

    tx.update(ref, { likes, likeCount });
  });
}

export function subscribeSpotViewerResponse(
  spotId: string,
  uid: string | null,
  onData: (response: SpotViewerResponse | null) => void,
): Unsubscribe {
  if (!uid) {
    queueMicrotask(() => onData(null));
    return () => {};
  }
  const db = getFirebaseDb();
  if (!db) {
    queueMicrotask(() => onData(null));
    return () => {};
  }

  const ref = doc(db, "spots", spotId, "responses", uid);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      onData(null);
      return;
    }
    const data = snap.data() as Record<string, unknown>;
    const action = data.action;
    if (action !== "fold" && action !== "call" && action !== "raise") {
      onData(null);
      return;
    }
    const updatedAt = data.updatedAt as { toMillis?: () => number } | undefined;
    onData({
      authorUid: uid,
      action,
      amount:
        typeof data.amount === "number" && Number.isFinite(data.amount) ? data.amount : null,
      authorPseudo: typeof data.authorPseudo === "string" ? data.authorPseudo : "Joueur",
      analysisText: typeof data.analysisText === "string" ? data.analysisText : null,
      updatedAtMs:
        typeof updatedAt?.toMillis === "function" ? updatedAt.toMillis() : Date.now(),
    });
  });
}

function parseResponseDoc(id: string, data: Record<string, unknown>): SpotViewerResponse | null {
  const action = data.action;
  if (action !== "fold" && action !== "call" && action !== "raise") return null;
  const updatedAt = data.updatedAt as { toMillis?: () => number } | undefined;
  return {
    authorUid: typeof data.authorUid === "string" ? data.authorUid : id,
    action,
    amount: typeof data.amount === "number" && Number.isFinite(data.amount) ? data.amount : null,
    authorPseudo: typeof data.authorPseudo === "string" ? data.authorPseudo : "Joueur",
    analysisText: typeof data.analysisText === "string" ? data.analysisText : null,
    updatedAtMs:
      typeof updatedAt?.toMillis === "function" ? updatedAt.toMillis() : Date.now(),
  };
}

export function subscribeSpotPublicAnalyses(
  spotId: string,
  onData: (items: SpotViewerResponse[]) => void,
): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) {
    queueMicrotask(() => onData([]));
    return () => {};
  }

  return onSnapshot(responsesCol(spotId), (snap) => {
    const items = snap.docs
      .map((d) => parseResponseDoc(d.id, d.data() as Record<string, unknown>))
      .filter((item): item is SpotViewerResponse => item != null)
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    onData(items);
  });
}

export function subscribeSpotDiscussionCount(
  spotId: string,
  onCount: (count: number) => void,
): Unsubscribe {
  let commentCount = 0;
  let analysisCount = 0;
  const emit = () => onCount(commentCount + analysisCount);

  const unsubComments = subscribeSpotComments(spotId, (list) => {
    commentCount = list.length;
    emit();
  });
  const unsubAnalyses = subscribeSpotPublicAnalyses(spotId, (list) => {
    analysisCount = list.length;
    emit();
  });

  return () => {
    unsubComments();
    unsubAnalyses();
  };
}

export function subscribeSpotFeedDiscussion(
  spotId: string,
  onData: (items: SpotFeedDiscussionItem[]) => void,
): Unsubscribe {
  let comments: SpotComment[] = [];
  let analyses: SpotViewerResponse[] = [];

  const emit = () => {
    const merged: SpotFeedDiscussionItem[] = [
      ...comments.map(
        (c): SpotFeedDiscussionItem => ({
          kind: "comment",
          id: c.id,
          authorUid: c.authorUid,
          authorPseudo: c.authorPseudo,
          text: c.text,
          createdAtMs: c.createdAtMs,
          likes: c.likes,
          likeCount: c.likeCount,
        }),
      ),
      ...analyses.map(
        (a): SpotFeedDiscussionItem => ({
          kind: "analysis",
          id: a.authorUid,
          authorUid: a.authorUid,
          authorPseudo: a.authorPseudo,
          action: a.action,
          amount: a.amount,
          analysisText: a.analysisText,
          createdAtMs: a.updatedAtMs,
        }),
      ),
    ].sort((a, b) => b.createdAtMs - a.createdAtMs);
    onData(merged);
  };

  const unsubComments = subscribeSpotComments(spotId, (next) => {
    comments = next;
    emit();
  });
  const unsubAnalyses = subscribeSpotPublicAnalyses(spotId, (next) => {
    analyses = next;
    emit();
  });

  return () => {
    unsubComments();
    unsubAnalyses();
  };
}

export function subscribeSpotResponseStats(
  spotId: string,
  onData: (stats: SpotResponseStats) => void,
): Unsubscribe {
  const empty = (): SpotResponseStats => ({ fold: 0, call: 0, raise: 0 });
  const db = getFirebaseDb();
  if (!db) {
    queueMicrotask(() => onData(empty()));
    return () => {};
  }

  return onSnapshot(responsesCol(spotId), (snap) => {
    const stats = empty();
    for (const d of snap.docs) {
      const raw = d.data().action;
      if (raw === "fold") stats.fold += 1;
      else if (raw === "call") stats.call += 1;
      else if (raw === "raise") stats.raise += 1;
    }
    onData(stats);
  });
}

export async function saveSpotViewerResponse(
  spotId: string,
  uid: string,
  authorPseudo: string,
  action: SpotHeroAction,
  amount: number | null,
  analysisText?: string | null,
): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");

  const ref = doc(db, "spots", spotId, "responses", uid);
  const payload: Record<string, unknown> = {
    authorUid: uid,
    authorPseudo: authorPseudo.trim() || "Joueur",
    action,
    updatedAt: serverTimestamp(),
  };
  if (action === "call" || action === "raise") {
    if (amount == null || !Number.isFinite(amount) || amount < 0) {
      throw new Error("Montant invalide.");
    }
    payload.amount = amount;
  }
  const trimmedAnalysis = analysisText?.trim();
  if (trimmedAnalysis) payload.analysisText = trimmedAnalysis;

  await setDoc(ref, payload, { merge: true });
}
