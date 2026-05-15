import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { getFirebaseDb } from "./firebase";
import { sanitizeForFirestore } from "./phr-firebase-sync";
import { emptyReactionCounts, type PublicHandPost, type PublicReaction } from "./phr-public-feed";

export type SpotCategory =
  | "open"
  | "3bet"
  | "bvb"
  | "icm"
  | "ko"
  | "preflop"
  | "flop"
  | "turn"
  | "river";

export type SpotHeroAction = "fold" | "call" | "raise";

export type SpotSourceValidation = "coach" | "gto" | "population" | "unvalidated";

export type SpotVisibility = "public" | "private" | "group";

export const SPOT_CATEGORIES: { id: SpotCategory; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "3bet", label: "3bet" },
  { id: "bvb", label: "BvB" },
  { id: "icm", label: "ICM" },
  { id: "ko", label: "KO" },
  { id: "preflop", label: "Preflop" },
  { id: "flop", label: "Flop" },
  { id: "turn", label: "Turn" },
  { id: "river", label: "River" },
];

export const SPOT_SOURCE_OPTIONS: { id: SpotSourceValidation; label: string }[] = [
  { id: "coach", label: "Coach" },
  { id: "gto", label: "GTO" },
  { id: "population", label: "Population" },
  { id: "unvalidated", label: "Pas encore validé" },
];

/** État du replayer au moment où l’utilisateur clique sur « Publier le spot ». */
export type SpotReplayContext = {
  handId: string;
  hand: Record<string, unknown>;
  uiStepIndex: number;
  transportLabel: string;
  stepLabel: string;
  street: string;
  visibleBoard: string[];
  pot: number;
  potLabel: string;
  displayUnit: "bb" | "chips";
};

export type SpotPublishInput = {
  authorUid: string;
  authorPseudo: string;
  replay: SpotReplayContext;
  question: string;
  category: SpotCategory;
  heroAction: SpotHeroAction;
  heroAmount: number | null;
  sourceValidation: SpotSourceValidation;
  visibility: SpotVisibility;
  /** Requis si visibility === "group". */
  groupId?: string;
  /** Buy-in tournoi (EUR) au moment de la publication. */
  buyIn?: string;
};

export type SpotTournamentInfo = {
  tournamentName: string | null;
  buyIn: string | null;
  blindsLabel: string | null;
  levelLabel: string | null;
};

function readHandBlinds(hand: Record<string, unknown>): { sb: number | null; bb: number | null } {
  const blinds = hand.blinds;
  if (!blinds || typeof blinds !== "object") return { sb: null, bb: null };
  const b = blinds as Record<string, unknown>;
  const sb = typeof b.sb === "number" && Number.isFinite(b.sb) ? b.sb : null;
  const bb = typeof b.bb === "number" && Number.isFinite(b.bb) ? b.bb : null;
  return { sb, bb };
}

export function formatSpotBlindsLabel(sb: number | null, bb: number | null): string | null {
  if (sb != null && bb != null) return `${sb}/${bb}`;
  if (bb != null) return String(bb);
  if (sb != null) return String(sb);
  return null;
}

export function extractTournamentFieldsFromHand(hand: Record<string, unknown>): {
  tournamentName: string | null;
  levelLabel: string | null;
  blindsSb: number | null;
  blindsBb: number | null;
} {
  const tournamentName =
    typeof hand.tournamentName === "string" && hand.tournamentName.trim().length > 0
      ? hand.tournamentName.trim()
      : null;
  const levelLabel =
    typeof hand.levelLabel === "string" && hand.levelLabel.trim().length > 0
      ? hand.levelLabel.trim()
      : null;
  const { sb, bb } = readHandBlinds(hand);
  return { tournamentName, levelLabel, blindsSb: sb, blindsBb: bb };
}

/** Infos tournoi pour l’affichage spot (meta Firestore ou main embarquée). */
export function resolveSpotTournamentInfo(post: PublicHandPost): SpotTournamentInfo {
  const meta = post.spotMeta;
  const fromHand = extractTournamentFieldsFromHand(post.hand);

  const tournamentName =
    (typeof meta?.tournamentName === "string" && meta.tournamentName.trim()) ||
    fromHand.tournamentName ||
    null;
  const buyIn =
    typeof meta?.buyIn === "string" && meta.buyIn.trim().length > 0 ? meta.buyIn.trim() : null;
  const levelLabel =
    (typeof meta?.levelLabel === "string" && meta.levelLabel.trim()) || fromHand.levelLabel || null;

  const metaSb =
    typeof meta?.blindsSb === "number" && Number.isFinite(meta.blindsSb) ? meta.blindsSb : null;
  const metaBb =
    typeof meta?.blindsBb === "number" && Number.isFinite(meta.blindsBb) ? meta.blindsBb : null;
  const blindsLabel = formatSpotBlindsLabel(
    metaSb ?? fromHand.blindsSb,
    metaBb ?? fromHand.blindsBb,
  );

  return { tournamentName, buyIn, blindsLabel, levelLabel };
}

export function spotCategoryFromStreet(street: string): SpotCategory {
  const s = street.toLowerCase();
  if (
    s === "preflop" ||
    s === "flop" ||
    s === "turn" ||
    s === "river" ||
    s === "open" ||
    s === "3bet" ||
    s === "bvb" ||
    s === "icm" ||
    s === "ko"
  ) {
    return s;
  }
  return "preflop";
}

export type SpotStepOption = {
  uiStepIndex: number;
  label: string;
};

export function buildSpotReplayContext(input: {
  hand: Record<string, unknown>;
  handId: string;
  clampedStepIndex: number;
  maxUiStepIndex: number;
  replaySteps: { action: { actor: string; type: string; street: string; amount?: number } }[];
  visibleBoard: string[];
  pot: number;
  potLabel: string;
  displayUnit: "bb" | "chips";
  formatActionLabel: (action: { actor: string; type: string; street: string; amount?: number }) => string;
}): SpotReplayContext {
  const total = input.replaySteps.length;
  const transportLabel = `${input.clampedStepIndex + 1} / ${input.maxUiStepIndex + 1}`;
  const uiStepIndex = input.clampedStepIndex > 0 ? input.clampedStepIndex : 1;

  let stepLabel: string;
  let street = "preflop";

  if (input.clampedStepIndex <= 0 || total === 0) {
    stepLabel =
      total > 0
        ? `Situation initiale · prochaine action : ${input.formatActionLabel(input.replaySteps[0]!.action)}`
        : "Situation initiale";
    street = input.replaySteps[0]?.action.street ?? "preflop";
  } else {
    const step = input.replaySteps[input.clampedStepIndex - 1];
    street = step?.action.street ?? "preflop";
    stepLabel = step
      ? `${uiStepIndex}/${total} · ${street.toUpperCase()} · ${step.action.actor}: ${input.formatActionLabel(step.action)}`
      : transportLabel;
  }

  return {
    handId: input.handId,
    hand: input.hand,
    uiStepIndex,
    transportLabel,
    stepLabel,
    street,
    visibleBoard: input.visibleBoard,
    pot: input.pot,
    potLabel: input.potLabel,
    displayUnit: input.displayUnit,
  };
}

export function buildSpotStepOptions(
  steps: { action: { actor: string; type: string; street: string; amount?: number } }[],
  formatActionLabel: (action: { actor: string; type: string; street: string; amount?: number }) => string,
): SpotStepOption[] {
  const total = steps.length;
  if (total === 0) return [];
  return steps.map((step, index) => {
    const ui = index + 1;
    const street = step.action.street.toUpperCase();
    return {
      uiStepIndex: ui,
      label: `${ui}/${total} · ${street} · ${step.action.actor}: ${formatActionLabel(step.action)}`,
    };
  });
}

export function categoryLabel(id: SpotCategory): string {
  return SPOT_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function sourceValidationLabel(id: SpotSourceValidation): string {
  return SPOT_SOURCE_OPTIONS.find((s) => s.id === id)?.label ?? id;
}

export async function publishSpot(input: SpotPublishInput): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");

  if (input.visibility === "group" && !input.groupId?.trim()) {
    throw new Error("Choisis un groupe pour publier le spot.");
  }

  const { replay } = input;
  const boardLine =
    replay.visibleBoard.length > 0 ? replay.visibleBoard.join(" ") : "—";
  const summary = [
    `[${categoryLabel(input.category)}]`,
    `${replay.transportLabel} · ${replay.stepLabel}`,
    `Pot ${replay.potLabel} · Board ${boardLine}`,
    "",
    input.question.trim(),
    "",
    `Ma ligne: ${input.heroAction.toUpperCase()}${input.heroAmount != null ? ` ${input.heroAmount}` : ""}`,
    `Source: ${sourceValidationLabel(input.sourceValidation)}`,
  ].join("\n");

  const tour = extractTournamentFieldsFromHand(replay.hand);
  const buyIn = input.buyIn?.trim() || null;

  const handWithReplay = sanitizeForFirestore({
    ...replay.hand,
    phrReplayAtPublish: {
      uiStepIndex: replay.uiStepIndex,
      transportLabel: replay.transportLabel,
      stepLabel: replay.stepLabel,
      street: replay.street,
      visibleBoard: replay.visibleBoard,
      pot: replay.pot,
      potLabel: replay.potLabel,
      displayUnit: replay.displayUnit,
    },
  });

  const payload = sanitizeForFirestore({
    authorUid: input.authorUid,
    authorPseudo: input.authorPseudo.trim() || "Joueur",
    handId: replay.handId,
    hand: handWithReplay,
    uiStepIndex: replay.uiStepIndex,
    stepLabel: replay.stepLabel,
    transportLabel: replay.transportLabel,
    visibleBoard: replay.visibleBoard,
    pot: replay.pot,
    potLabel: replay.potLabel,
    question: input.question.trim(),
    category: input.category,
    heroAction: input.heroAction,
    heroAmount: input.heroAmount,
    sourceValidation: input.sourceValidation,
    visibility: input.visibility,
    groupId: input.visibility === "group" ? input.groupId!.trim() : undefined,
    summary,
    tournamentName: tour.tournamentName ?? undefined,
    levelLabel: tour.levelLabel ?? undefined,
    blindsSb: tour.blindsSb ?? undefined,
    blindsBb: tour.blindsBb ?? undefined,
    buyIn: buyIn ?? undefined,
    reactions: {},
    reactionCounts: emptyReactionCounts(),
  });

  await addDoc(collection(db, "spots"), {
    ...payload,
    createdAt: serverTimestamp(),
  });
}

export async function deleteSpot(spotId: string, requesterUid: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");

  const ref = doc(db, "spots", spotId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Spot introuvable.");

  const data = snap.data() as Record<string, unknown>;
  if (data.authorUid !== requesterUid) {
    throw new Error("Tu ne peux supprimer que tes propres spots.");
  }

  await deleteDoc(ref);
}

export async function toggleSpotReaction(
  spotId: string,
  uid: string,
  reaction: PublicReaction,
): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");

  const ref = doc(db, "spots", spotId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Spot introuvable.");
    const data = snap.data() as Record<string, unknown>;
    const reactions = { ...(data.reactions as Record<string, PublicReaction> | undefined) };
    const counts = {
      ...emptyReactionCounts(),
      ...(data.reactionCounts as Record<PublicReaction, number> | undefined),
    };

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
