import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";

import { getFirebaseDb } from "./firebase";
import {
  handStableKeyToFirestoreDocId,
  sanitizeForFirestore,
} from "./phr-firebase-sync";
import { extractTournamentFieldsFromHand } from "./phr-spots";

export const TOURNAMENT_VIEWER_SOURCE_PREFIX = "spotlab-tournament/";

export type PublishedTournamentVisibility = "public" | "private";

export type PublishedTournament = {
  id: string;
  authorUid: string;
  authorPseudo: string;
  tournamentKey: string;
  tournamentName: string;
  tournamentVariant?: string;
  buyIn?: string;
  description?: string;
  handCount: number;
  visibility: PublishedTournamentVisibility;
  createdAtMs: number;
  summary: string;
};

export type PublishedTournamentHand = {
  id: string;
  handStableKey: string;
  sortIndex: number;
  label: string;
  hand: Record<string, unknown>;
};

export type TournamentHandReport = {
  id: string;
  handDocId: string;
  authorUid: string;
  authorPseudo: string;
  text: string;
  createdAtMs: number;
  updatedAtMs: number;
};

export type PublishTournamentInput = {
  authorUid: string;
  authorPseudo: string;
  tournamentKey: string;
  tournamentName: string;
  tournamentVariant?: string;
  buyIn?: string;
  description?: string;
  visibility: PublishedTournamentVisibility;
  hands: Record<string, unknown>[];
};

const BATCH_SAFE = 400;

function tournamentsCol() {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");
  return collection(db, "publishedTournaments");
}

function handsCol(tournamentId: string) {
  return collection(getFirebaseDb()!, "publishedTournaments", tournamentId, "hands");
}

function reportsCol(tournamentId: string, handDocId: string) {
  return collection(
    getFirebaseDb()!,
    "publishedTournaments",
    tournamentId,
    "hands",
    handDocId,
    "reports",
  );
}

export function isTournamentViewerHandRecord(hand: Record<string, unknown>): boolean {
  return (
    typeof hand.sourceFile === "string" &&
    hand.sourceFile.startsWith(TOURNAMENT_VIEWER_SOURCE_PREFIX)
  );
}

export function tournamentViewerSourceFile(tournamentId: string, handDocId: string): string {
  return `${TOURNAMENT_VIEWER_SOURCE_PREFIX}${tournamentId}/${handDocId}`;
}

export function publishedTournamentHandLabel(hand: Record<string, unknown>): string {
  const level =
    typeof hand.levelLabel === "string" && hand.levelLabel.trim().length > 0
      ? hand.levelLabel.trim()
      : null;
  const id = typeof hand.id === "string" ? hand.id : "";
  const shortId = id.length > 6 ? id.slice(-6) : id;
  let datePart = "";
  if (typeof hand.dateTime === "string" && hand.dateTime.length >= 10) {
    const d = new Date(hand.dateTime);
    if (!Number.isNaN(d.getTime())) {
      datePart = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
    }
  }
  const parts = [level, datePart, shortId ? `#${shortId}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Main";
}

function parseTournamentDoc(id: string, data: Record<string, unknown>): PublishedTournament {
  const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
  return {
    id,
    authorUid: typeof data.authorUid === "string" ? data.authorUid : "",
    authorPseudo: typeof data.authorPseudo === "string" ? data.authorPseudo : "Joueur",
    tournamentKey: typeof data.tournamentKey === "string" ? data.tournamentKey : "",
    tournamentName: typeof data.tournamentName === "string" ? data.tournamentName : "Tournoi",
    tournamentVariant:
      typeof data.tournamentVariant === "string" ? data.tournamentVariant : undefined,
    buyIn: typeof data.buyIn === "string" && data.buyIn.trim() ? data.buyIn.trim() : undefined,
    description:
      typeof data.description === "string" && data.description.trim()
        ? data.description.trim()
        : undefined,
    handCount:
      typeof data.handCount === "number" && Number.isFinite(data.handCount)
        ? Math.max(0, Math.round(data.handCount))
        : 0,
    visibility: data.visibility === "private" ? "private" : "public",
    createdAtMs:
      typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : Date.now(),
    summary: typeof data.summary === "string" ? data.summary : "",
  };
}

function parseHandDoc(id: string, data: Record<string, unknown>): PublishedTournamentHand | null {
  const hand = data.hand;
  if (!hand || typeof hand !== "object") return null;
  const handRecord = hand as Record<string, unknown>;
  return {
    id,
    handStableKey:
      typeof data.handStableKey === "string" ? data.handStableKey : handStableKeyFromRecord(handRecord),
    sortIndex:
      typeof data.sortIndex === "number" && Number.isFinite(data.sortIndex)
        ? Math.round(data.sortIndex)
        : 0,
    label:
      typeof data.label === "string" && data.label.trim()
        ? data.label.trim()
        : publishedTournamentHandLabel(handRecord),
    hand: handRecord,
  };
}

function handStableKeyFromRecord(hand: Record<string, unknown>): string {
  const id = typeof hand.id === "string" ? hand.id : "unknown";
  const source = typeof hand.sourceFile === "string" ? hand.sourceFile : "local";
  return `${source}::${id}`;
}

export async function publishTournament(input: PublishTournamentInput): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");
  if (input.hands.length === 0) throw new Error("Aucune main à publier.");

  const tour = extractTournamentFieldsFromHand(input.hands[0]!);
  const summary = [
    `Tournoi : ${input.tournamentName}`,
    `${input.hands.length} main${input.hands.length > 1 ? "s" : ""}`,
    input.buyIn?.trim() ? `Buy-in ${input.buyIn.trim()} €` : null,
    input.description?.trim() || null,
  ]
    .filter(Boolean)
    .join("\n");

  const parentRef = await addDoc(tournamentsCol(), sanitizeForFirestore({
    authorUid: input.authorUid,
    authorPseudo: input.authorPseudo.trim() || "Joueur",
    tournamentKey: input.tournamentKey,
    tournamentName: input.tournamentName,
    tournamentVariant: input.tournamentVariant ?? undefined,
    buyIn: input.buyIn?.trim() || undefined,
    description: input.description?.trim() || undefined,
    handCount: input.hands.length,
    visibility: input.visibility,
    summary,
    blindsSb: tour.blindsSb ?? undefined,
    blindsBb: tour.blindsBb ?? undefined,
    levelLabel: tour.levelLabel ?? undefined,
    createdAt: serverTimestamp(),
  }));

  const tournamentId = parentRef.id;
  const sortedHands = [...input.hands].sort((a, b) => {
    const da = typeof a.dateTime === "string" ? a.dateTime : "";
    const db_ = typeof b.dateTime === "string" ? b.dateTime : "";
    return da.localeCompare(db_);
  });

  for (let offset = 0; offset < sortedHands.length; offset += BATCH_SAFE) {
    const chunk = sortedHands.slice(offset, offset + BATCH_SAFE);
    const batch = writeBatch(db);
    chunk.forEach((rawHand, i) => {
      const hand = sanitizeForFirestore({ ...rawHand });
      const stableKey = handStableKeyFromRecord(hand);
      const handDocId = handStableKeyToFirestoreDocId(stableKey);
      const handRef = doc(handsCol(tournamentId), handDocId);
      batch.set(handRef, sanitizeForFirestore({
        handStableKey: stableKey,
        sortIndex: offset + i,
        label: publishedTournamentHandLabel(hand),
        hand,
      }));
    });
    await batch.commit();
  }

  return tournamentId;
}

export function subscribePublicTournaments(
  onData: (items: PublishedTournament[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) {
    queueMicrotask(() => onData([]));
    return () => {};
  }

  const q = query(
    tournamentsCol(),
    where("visibility", "==", "public"),
    orderBy("createdAt", "desc"),
    limit(30),
  );

  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => parseTournamentDoc(d.id, d.data() as Record<string, unknown>)));
    },
    (err) => onError?.(err instanceof Error ? err : new Error("Erreur tournois publics")),
  );
}

export async function loadPublishedTournamentHands(
  tournamentId: string,
): Promise<PublishedTournamentHand[]> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");

  const snap = await getDocs(query(handsCol(tournamentId), orderBy("sortIndex", "asc")));
  return snap.docs
    .map((d) => parseHandDoc(d.id, d.data() as Record<string, unknown>))
    .filter((h): h is PublishedTournamentHand => h !== null);
}

export function subscribePublishedTournament(
  tournamentId: string,
  onData: (tournament: PublishedTournament | null) => void,
): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) {
    queueMicrotask(() => onData(null));
    return () => {};
  }

  const ref = doc(db, "publishedTournaments", tournamentId);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      onData(null);
      return;
    }
    onData(parseTournamentDoc(snap.id, snap.data() as Record<string, unknown>));
  });
}

export function subscribeTournamentHandReports(
  tournamentId: string,
  handDocId: string,
  onData: (reports: TournamentHandReport[]) => void,
): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) {
    queueMicrotask(() => onData([]));
    return () => {};
  }

  const q = query(reportsCol(tournamentId, handDocId), orderBy("updatedAt", "desc"), limit(80));
  return onSnapshot(q, (snap) => {
    const reports = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
      const updatedAt = data.updatedAt as { toMillis?: () => number } | undefined;
      return {
        id: d.id,
        handDocId,
        authorUid: typeof data.authorUid === "string" ? data.authorUid : "",
        authorPseudo: typeof data.authorPseudo === "string" ? data.authorPseudo : "Joueur",
        text: typeof data.text === "string" ? data.text : "",
        createdAtMs:
          typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : Date.now(),
        updatedAtMs:
          typeof updatedAt?.toMillis === "function"
            ? updatedAt.toMillis()
            : typeof createdAt?.toMillis === "function"
              ? createdAt.toMillis()
              : Date.now(),
      } satisfies TournamentHandReport;
    });
    onData(reports);
  });
}

export async function saveTournamentHandReport(
  tournamentId: string,
  handDocId: string,
  authorUid: string,
  authorPseudo: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Compte rendu vide.");

  const ref = doc(reportsCol(tournamentId, handDocId), authorUid);
  const snap = await getDoc(ref);
  const payload = sanitizeForFirestore({
    handDocId,
    authorUid,
    authorPseudo: authorPseudo.trim() || "Joueur",
    text: trimmed,
    updatedAt: serverTimestamp(),
  });
  if (snap.exists()) {
    await updateDoc(ref, payload);
  } else {
    await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
  }
}

export function prepareTournamentHandForViewer(
  tournamentId: string,
  handDocId: string,
  hand: Record<string, unknown>,
): Record<string, unknown> {
  const raw = { ...hand };
  raw.sourceFile = tournamentViewerSourceFile(tournamentId, handDocId);
  if (typeof raw.id !== "string" || raw.id.trim().length === 0) {
    raw.id = `tournament-${handDocId}`;
  }
  return raw;
}
