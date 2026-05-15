"use client";

import {
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
  type MutableRefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { PhrAccountSettingsCard, PhrAuthBar } from "@/components/phr-auth-bar";
import { PhrPublishSpotModal } from "@/components/phr-publish-spot-modal";
import { PhrPublicHome } from "@/components/phr-public-home";
import { PhrSpotReviewShell } from "@/components/phr-spot-review-shell";
import { PhrHandFiltersPanel } from "@/components/phr-hand-filters";
import {
  EMPTY_PHR_HAND_FILTER_SELECTION,
  handMatchesPhrFilters,
  phrFiltersAreActive,
  type PhrHandFilterSelection,
} from "@/lib/phr-hand-filter-meta";
import {
  PHR_DOCK_ICON,
  PHR_DOCK_POD,
  PHR_DOCK_TILE,
  PHR_DOCK_TILE_ACTIVE,
  PHR_MON_ESPACE_BTN,
  PHR_MON_ESPACE_BTN_ACTIVE,
  PHR_REVIEW_TOPBAR,
} from "@/lib/phr-chrome";
import {
  handStableKeyFromRecord,
  loadUserCloudData,
  parseStoredHand,
  saveUserHandsOnly,
  saveUserReplaySession,
} from "@/lib/phr-firebase-sync";
import {
  parseFeedPostForReplayer,
  publishPublicPost,
  type PublicHandPost,
} from "@/lib/phr-public-feed";
import { buildSpotReplayContext, type SpotReplayContext } from "@/lib/phr-spots";
import { usePhrFirebase } from "@/lib/use-phr-firebase";

type Street = "preflop" | "flop" | "turn" | "river";
type ActionType = "post" | "fold" | "check" | "call" | "bet" | "raise" | "all-in";

type Player = {
  name: string;
  position: string;
  stack: number;
  bounty?: number;
};

type ParsedAction = {
  street: Street;
  actor: string;
  type: ActionType;
  amount?: number;
  raw: string;
};

type ParsedHand = {
  id: string;
  heroName?: string;
  buttonPlayerName?: string;
  levelLabel?: string;
  tournamentName?: string;
  tournamentVariant?: "PKO" | "SKO" | "VANILLA";
  sourceFile?: string;
  players: Player[];
  blinds: { sb?: number; bb?: number };
  actions: Record<Street, ParsedAction[]>;
  board: { flop: string[]; turn: string[]; river: string[] };
  holeCardsByPlayer: Record<string, string[]>;
  totalPot?: number;
  dateTime?: string;
  tag: "3-bet" | "river" | "all-in" | "standard";
};

/** Main factice uniquement quand aucune main n’est importée (évite les accès undefined). */
const EMPTY_HAND: ParsedHand = {
  id: "__empty__",
  players: [],
  blinds: {},
  actions: { preflop: [], flop: [], turn: [], river: [] },
  board: { flop: [], turn: [], river: [] },
  holeCardsByPlayer: {},
  tag: "standard",
};

function handStableKey(hand: ParsedHand): string {
  return `${hand.sourceFile ?? "local"}::${hand.id}`;
}

function isFeedViewerHand(hand: ParsedHand): boolean {
  return hand.sourceFile?.startsWith("spotlab-feed/") ?? false;
}

function dedupeSortParsedHands(hands: ParsedHand[]): ParsedHand[] {
  const deduped = new Map<string, ParsedHand>();
  hands.forEach((hand) => deduped.set(handStableKey(hand), hand));
  return Array.from(deduped.values()).sort((a, b) => {
    const ta = deriveTournamentKey(a);
    const tb = deriveTournamentKey(b);
    const byTournament = ta.localeCompare(tb, "fr");
    if (byTournament !== 0) return byTournament;
    return (a.dateTime ?? "").localeCompare(b.dateTime ?? "");
  });
}

function mergeParsedHandLists(...lists: ParsedHand[][]): ParsedHand[] {
  return dedupeSortParsedHands(lists.flat());
}

function parsedHandsToCloudRecords(hands: ParsedHand[]): Record<string, unknown>[] {
  return hands.map((hand) => hand as unknown as Record<string, unknown>);
}

function storedRecordToParsedHand(raw: Record<string, unknown>): ParsedHand | null {
  if (!parseStoredHand(raw)) return null;
  return raw as ParsedHand;
}

// --- Design global (hors dock) ---
const PHR_PAGE_BG =
  "bg-zinc-950 bg-[radial-gradient(ellipse_110%_65%_at_50%_-12%,rgba(139,92,246,0.1),transparent_52%)] bg-[radial-gradient(ellipse_80%_50%_at_100%_100%,rgba(16,185,129,0.04),transparent_45%)]";

const PHR_APP_SHELL =
  "flex min-h-0 flex-1 flex-col rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-zinc-900/88 via-zinc-950/95 to-[#0f0e12] p-3 shadow-[0_28px_100px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md sm:rounded-3xl sm:p-4";

/** Boutons barre principale (import / filtres / outils) — même hauteur et même base visuelle. */
const PHR_TOOLBAR_BTN =
  "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-zinc-800/55 px-3.5 text-sm font-semibold text-zinc-100 shadow-sm transition hover:border-white/18 hover:bg-zinc-700/70 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";

const PHR_TOOLBAR_BTN_ON_FILTERS =
  "border-emerald-500/45 bg-emerald-950/25 text-emerald-50 shadow-[0_0_0_1px_rgba(16,185,129,0.12)] hover:border-emerald-400/55 hover:bg-emerald-950/35";

const PHR_TOOLBAR_BTN_ON_CALC =
  "border-amber-500/45 bg-gradient-to-b from-amber-950/40 to-zinc-950/90 text-amber-50 shadow-[0_0_0_1px_rgba(245,158,11,0.14)] hover:border-amber-400/55 hover:from-amber-950/50";

/** Variante barre : deux lignes centrées dans la même hauteur que les autres boutons. */
const PHR_TOOLBAR_BTN_CALC =
  "inline-flex h-11 min-w-[10.5rem] shrink-0 flex-col items-center justify-center gap-0 rounded-xl border border-white/10 bg-zinc-800/55 px-3 py-0.5 text-center shadow-sm transition hover:border-white/18 hover:bg-zinc-700/70 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 sm:min-w-[11.5rem] sm:px-4";

const PHR_BTN_TOOL =
  "rounded-xl border border-white/10 bg-zinc-800/55 px-3.5 py-2 text-sm font-semibold text-zinc-100 shadow-sm transition hover:border-white/18 hover:bg-zinc-700/70 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";

const PHR_POPOVER =
  "absolute left-0 top-12 z-40 w-[min(100vw-2rem,22rem)] rounded-2xl border border-white/12 bg-zinc-950/96 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.58)] backdrop-blur-xl sm:top-14";

const PHR_TOURNAMENT_RAIL =
  "mb-2 flex flex-col gap-1 rounded-2xl border border-white/10 bg-zinc-950/45 px-2.5 py-1.5 shadow-inner backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:gap-2";

const PHR_TABLE_FRAME =
  "relative min-h-[340px] flex-1 rounded-3xl border border-white/10 bg-gradient-to-b from-[#2f2d38] via-[#232228] to-[#141318] p-3 pb-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_40px_rgba(0,0,0,0.35)]";

const PHR_TRANSPORT_BTN =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-gradient-to-b from-zinc-600/35 to-zinc-900/92 text-sm font-black text-zinc-100 shadow-md transition hover:border-white/22 hover:from-zinc-500/42 active:scale-[0.95] disabled:pointer-events-none disabled:opacity-35";

const PHR_TRANSPORT_READOUT =
  "inline-flex h-11 min-w-[4.75rem] items-center justify-center rounded-full border border-white/10 bg-zinc-950/70 px-2 text-sm font-bold tabular-nums text-zinc-200 shadow-inner backdrop-blur-sm";

const PHR_FIELD_SELECT =
  "w-full rounded-lg border border-white/10 bg-zinc-950/70 px-2 py-2 text-sm font-semibold text-zinc-100 outline-none transition focus:border-emerald-500/45 focus:ring-1 focus:ring-emerald-500/25";

const PHR_FIELD_SELECT_COMPACT =
  "w-full rounded-lg border border-white/10 bg-zinc-950/70 px-2 py-2 text-xs font-semibold text-zinc-100 outline-none transition focus:border-emerald-500/45 focus:ring-1 focus:ring-emerald-500/25";

const PHR_FIELD_INPUT =
  "rounded-lg border border-white/10 bg-zinc-950/70 px-2 py-1.5 text-sm text-zinc-100 outline-none transition focus:border-emerald-500/45 focus:ring-1 focus:ring-emerald-500/25";

const PHR_FORM_RESULT =
  "rounded-lg border border-white/8 bg-zinc-950/55 px-2 py-1.5 text-xs text-zinc-200";

const PHR_POPOVER_TITLE = "mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500";

const PHR_CALC_MENU_ITEM =
  "w-full rounded-xl border border-white/10 bg-zinc-900/65 px-3 py-2.5 text-left text-sm font-bold text-zinc-100 transition hover:border-violet-400/35 hover:bg-zinc-800/80 active:scale-[0.99]";

type ReplayStep = {
  index: number;
  action: ParsedAction;
  pot: number;
  stacksByPlayer: Record<string, number>;
  visibleBoard: string[];
};

type PendingContributionState = {
  pendingByPlayer: Record<string, number>;
};
const STREET_ORDER: Street[] = ["preflop", "flop", "turn", "river"];
type CanonicalSeat = "BTN" | "SB" | "BB" | "UTG" | "MP" | "CO";
const SEAT_ORDER: CanonicalSeat[] = ["BTN", "SB", "BB", "UTG", "MP", "CO"];
type VisualSeat = "BOTTOM" | "BOTTOM_RIGHT" | "TOP_RIGHT" | "TOP" | "TOP_LEFT" | "BOTTOM_LEFT";
const VISUAL_SEAT_ORDER: VisualSeat[] = [
  "BOTTOM",
  "BOTTOM_LEFT",
  "TOP_LEFT",
  "TOP",
  "TOP_RIGHT",
  "BOTTOM_RIGHT",
];
const VISUAL_SEAT_COORDINATES: Record<VisualSeat, { x: number; y: number }> = {
  BOTTOM: { x: 50, y: 84 },
  BOTTOM_RIGHT: { x: 86, y: 70 },
  TOP_RIGHT: { x: 86, y: 20 },
  TOP: { x: 50, y: 8 },
  TOP_LEFT: { x: 14, y: 20 },
  BOTTOM_LEFT: { x: 14, y: 70 },
};

type EvaluatedHand = {
  category: number;
  kickers: number[];
};

function rankValue(rank: string): number {
  const map: Record<string, number> = {
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    T: 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14,
  };
  return map[rank.toUpperCase()] ?? 0;
}

function compareEvaluatedHands(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < len; i += 1) {
    const av = a.kickers[i] ?? 0;
    const bv = b.kickers[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function evaluateFive(cards: string[]): EvaluatedHand {
  const ranks = cards.map((c) => rankValue(c[0])).sort((a, b) => b - a);
  const suits = cards.map((c) => c[c.length - 1].toLowerCase());
  const counts = new Map<number, number>();
  ranks.forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1));
  const grouped = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const uniqueDesc = Array.from(new Set(ranks)).sort((a, b) => b - a);
  const flush = suits.every((s) => s === suits[0]);
  let straightHigh = 0;
  for (let i = 0; i <= uniqueDesc.length - 5; i += 1) {
    const seq = uniqueDesc.slice(i, i + 5);
    if (seq[0] - seq[4] === 4 && new Set(seq).size === 5) {
      straightHigh = seq[0];
      break;
    }
  }
  if (!straightHigh && uniqueDesc.includes(14)) {
    const wheel = [5, 4, 3, 2];
    if (wheel.every((v) => uniqueDesc.includes(v))) straightHigh = 5;
  }

  if (flush && straightHigh) return { category: 8, kickers: [straightHigh] };
  if (grouped[0]?.[1] === 4) {
    const quad = grouped[0][0];
    const kicker = grouped[1][0];
    return { category: 7, kickers: [quad, kicker] };
  }
  if (grouped[0]?.[1] === 3 && grouped[1]?.[1] === 2) {
    return { category: 6, kickers: [grouped[0][0], grouped[1][0]] };
  }
  if (flush) return { category: 5, kickers: ranks };
  if (straightHigh) return { category: 4, kickers: [straightHigh] };
  if (grouped[0]?.[1] === 3) {
    const trips = grouped[0][0];
    const kickers = grouped.slice(1).map((g) => g[0]).sort((a, b) => b - a);
    return { category: 3, kickers: [trips, ...kickers] };
  }
  if (grouped[0]?.[1] === 2 && grouped[1]?.[1] === 2) {
    const pairHigh = Math.max(grouped[0][0], grouped[1][0]);
    const pairLow = Math.min(grouped[0][0], grouped[1][0]);
    const kicker = grouped.find((g) => g[1] === 1)?.[0] ?? 0;
    return { category: 2, kickers: [pairHigh, pairLow, kicker] };
  }
  if (grouped[0]?.[1] === 2) {
    const pair = grouped[0][0];
    const kickers = grouped.slice(1).map((g) => g[0]).sort((a, b) => b - a);
    return { category: 1, kickers: [pair, ...kickers] };
  }
  return { category: 0, kickers: ranks };
}

function evaluateBestOfSeven(cards: string[]): EvaluatedHand {
  let best: EvaluatedHand | null = null;
  for (let i = 0; i < cards.length - 4; i += 1) {
    for (let j = i + 1; j < cards.length - 3; j += 1) {
      for (let k = j + 1; k < cards.length - 2; k += 1) {
        for (let l = k + 1; l < cards.length - 1; l += 1) {
          for (let m = l + 1; m < cards.length; m += 1) {
            const hand = evaluateFive([cards[i], cards[j], cards[k], cards[l], cards[m]]);
            if (!best || compareEvaluatedHands(hand, best) > 0) best = hand;
          }
        }
      }
    }
  }
  return best ?? { category: 0, kickers: [0] };
}

function chooseCombinations(items: string[], k: number): string[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const out: string[][] = [];
  function rec(start: number, pick: string[]) {
    if (pick.length === k) {
      out.push([...pick]);
      return;
    }
    for (let i = start; i <= items.length - (k - pick.length); i += 1) {
      pick.push(items[i]);
      rec(i + 1, pick);
      pick.pop();
    }
  }
  rec(0, []);
  return out;
}

function computeAllInEquity(
  players: { name: string; cards: string[] }[],
  visibleBoard: string[],
): Record<string, number> | null {
  if (players.length < 2) return null;
  if (players.some((p) => p.cards.length !== 2)) return null;
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  const suits = ["s", "h", "d", "c"];
  const deck: string[] = [];
  ranks.forEach((r) => suits.forEach((s) => deck.push(`${r}${s}`)));
  const used = new Set<string>([...visibleBoard, ...players.flatMap((p) => p.cards)]);
  const remaining = deck.filter((card) => !used.has(card));
  const missing = Math.max(0, 5 - visibleBoard.length);
  const runouts = chooseCombinations(remaining, missing);
  if (runouts.length === 0) return null;

  const shares: Record<string, number> = Object.fromEntries(players.map((p) => [p.name, 0]));
  runouts.forEach((runout) => {
    const board = [...visibleBoard, ...runout];
    const scores = players.map((p) => ({
      name: p.name,
      score: evaluateBestOfSeven([...p.cards, ...board]),
    }));
    let best = scores[0].score;
    scores.slice(1).forEach((s) => {
      if (compareEvaluatedHands(s.score, best) > 0) best = s.score;
    });
    const winners = scores.filter((s) => compareEvaluatedHands(s.score, best) === 0);
    const share = 1 / winners.length;
    winners.forEach((w) => {
      shares[w.name] += share;
    });
  });

  const total = runouts.length;
  return Object.fromEntries(
    Object.entries(shares).map(([name, value]) => [name, (value / total) * 100]),
  );
}

function normalizeAmount(raw: string): number {
  return Number.parseFloat(raw.replace(",", "."));
}

function extractBoardCards(line: string): string[] {
  const cards = line.match(/\[([^\]]+)\]/)?.[1];
  return cards ? cards.split(" ").filter(Boolean) : [];
}

function parseCards(raw: string): string[] {
  return raw
    .replace(/,/g, " ")
    .split(/\s+/)
    .map((card) => card.trim())
    .filter(Boolean);
}

function extractShowdownCards(lines: string[]): Record<string, string[]> {
  const cardsByPlayer: Record<string, string[]> = {};
  for (const line of lines) {
    const directShown = line.match(/^(.+?)\s+shows\s+\[([^\]]+)\]/i);
    if (directShown) {
      cardsByPlayer[directShown[1].trim()] = parseCards(directShown[2]);
      continue;
    }
    const summaryShown = line.match(/^Seat\s+\d+:\s+(.+?)\s+(?:showed|mucked)\s+\[([^\]]+)\]/i);
    if (summaryShown) {
      cardsByPlayer[summaryShown[1].trim()] = parseCards(summaryShown[2]);
    }
  }
  return cardsByPlayer;
}

function detectActionType(text: string): ActionType {
  const lower = text.toLowerCase();
  if (lower.includes("fold")) return "fold";
  if (lower.includes("check")) return "check";
  if (lower.includes("call")) return "call";
  if (lower.includes("raise") || lower.includes("raises")) return "raise";
  if (lower.includes("bets")) return "bet";
  if (lower.includes("all-in")) return "all-in";
  return "post";
}

function detectTournamentVariant(tournamentName?: string): "PKO" | "SKO" | "VANILLA" {
  const upper = (tournamentName ?? "").toUpperCase();
  if (upper.includes("SKO") || upper.includes("SUPER KO")) return "SKO";
  if (upper.includes("PKO") || upper.includes("KO")) return "PKO";
  return "VANILLA";
}

function parseBetclicHand(rawHand: string, fallbackIndex: number, sourceFile?: string): ParsedHand {
  const lines = rawHand
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const id =
    lines.find((line) => line.startsWith("Hand ID:"))?.replace("Hand ID:", "").trim() ??
    `hand-${fallbackIndex + 1}`;
  const totalPotText = lines.find((line) => line.startsWith("Total Pot:"));
  const totalPot = totalPotText
    ? normalizeAmount(totalPotText.replace("Total Pot:", "").trim())
    : undefined;
  const dateTime = lines
    .find((line) => line.startsWith("Date & Time:"))
    ?.replace("Date & Time:", "")
    .trim();
  const levelLabel = lines.find((line) => line.startsWith("Blinds:"))?.replace("Blinds:", "").trim();
  const tournamentName = lines
    .find((line) => line.startsWith("Game Name:"))
    ?.replace("Game Name:", "")
    .trim();
  const tournamentVariant = detectTournamentVariant(tournamentName);

  const players: Player[] = [];
  let heroName: string | undefined;
  const seatRegex = /^Seat\s+\d+:\s+(.+?)\s+\((\d+(?:[.,]\d+)?)\)\s+\[(.+)\]$/i;

  for (const line of lines) {
    const match = line.match(seatRegex);
    if (!match) continue;
    const name = match[1].trim();
    const stack = normalizeAmount(match[2]);
    const position = match[3].replace(" Hero", "").trim();
    if (match[3].includes("Hero")) heroName = name;
    players.push({ name, position, stack });
  }

  const holeCardsByPlayer: Record<string, string[]> = {};
  for (const line of lines) {
    const hole = line.match(/^([^:]+):\s+\[([^\]]+)\]$/);
    if (hole) {
      holeCardsByPlayer[hole[1].trim()] = parseCards(hole[2]);
    }
  }
  Object.assign(holeCardsByPlayer, extractShowdownCards(lines));

  const boardFlop = extractBoardCards(lines.find((line) => line.startsWith("*** FLOP ***")) ?? "");
  const boardTurn = extractBoardCards(lines.find((line) => line.startsWith("*** TURN ***")) ?? "");
  const boardRiver = extractBoardCards(lines.find((line) => line.startsWith("*** RIVER ***")) ?? "");

  const actions: Record<Street, ParsedAction[]> = {
    preflop: [],
    flop: [],
    turn: [],
    river: [],
  };

  const blinds: { sb?: number; bb?: number } = {};
  let currentStreet: Street = "preflop";

  for (const line of lines) {
    if (line.startsWith("*** PRE-FLOP ***")) {
      currentStreet = "preflop";
      continue;
    }
    if (line.startsWith("*** FLOP ***")) {
      currentStreet = "flop";
      continue;
    }
    if (line.startsWith("*** TURN ***")) {
      currentStreet = "turn";
      continue;
    }
    if (line.startsWith("*** RIVER ***")) {
      currentStreet = "river";
      continue;
    }

    const actionMatch = line.match(/^\d{2}:\d{2}:\d{2}\s+-\s+(.+?):\s+(.+)$/);
    if (!actionMatch) continue;

    const actor = actionMatch[1].trim();
    const raw = actionMatch[2].trim();
    const amountMatch = raw.match(/(\d+(?:[.,]\d+)?)/);
    const amount = amountMatch ? normalizeAmount(amountMatch[1]) : undefined;
    const type = detectActionType(raw);

    if (raw.toLowerCase().includes("posts sb") && typeof amount === "number") {
      blinds.sb = amount;
    }
    if (raw.toLowerCase().includes("posts bb") && typeof amount === "number") {
      blinds.bb = amount;
    }

    actions[currentStreet].push({ street: currentStreet, actor, type, amount, raw });
  }

  const combinedText = lines.join(" ").toLowerCase();
  const hasAllIn = combinedText.includes("all-in");
  const hasRiverAction = actions.river.length > 0 || boardRiver.length === 5;
  const hasRaise = actions.preflop.some((action) => action.type === "raise");
  const tag: ParsedHand["tag"] = hasAllIn ? "all-in" : hasRiverAction ? "river" : hasRaise ? "3-bet" : "standard";
  const buttonPlayerName = players.find((player) => player.position.toUpperCase().includes("BTN"))?.name;

  if (players.length === 0) {
    throw new Error("Aucun joueur detecte dans la main.");
  }

  return {
    id,
    heroName,
    buttonPlayerName,
    levelLabel,
    tournamentName,
    tournamentVariant,
    sourceFile,
    players,
    blinds,
    actions,
    board: {
      flop: boardFlop.slice(0, 3),
      turn: boardTurn.slice(0, 4),
      river: boardRiver.slice(0, 5),
    },
    holeCardsByPlayer,
    totalPot,
    dateTime,
    tag,
  };
}

function buildWinamaxPositions(
  players: { seat: number; name: string; stack: number; bounty?: number }[],
  buttonSeat: number | null,
  sbName?: string,
  bbName?: string,
): Player[] {
  const byName = new Map(players.map((p) => [p.name, p]));
  const occupiedSeats = players.map((p) => p.seat).sort((a, b) => a - b);

  let btnName: string | undefined;
  if (buttonSeat !== null) {
    btnName = players.find((p) => p.seat === buttonSeat)?.name;
  }

  const positions: Record<string, string> = {};
  if (btnName) positions[btnName] = "BTN";
  if (sbName) positions[sbName] = "SB";
  if (bbName) positions[bbName] = "BB";

  const remaining = players.filter((p) => !positions[p.name]);
  const ringLabels = ["UTG", "MP", "CO"];
  if (buttonSeat !== null) {
    const seatAfterBb =
      bbName && byName.get(bbName)
        ? byName.get(bbName)!.seat
        : buttonSeat;
    const ordered = occupiedSeats
      .slice()
      .sort((a, b) => ((a - seatAfterBb + 6) % 6) - ((b - seatAfterBb + 6) % 6));
    const remainingOrdered = ordered
      .map((seat) => players.find((p) => p.seat === seat)!)
      .filter((p) => !positions[p.name]);
    remainingOrdered.forEach((player, idx) => {
      positions[player.name] = ringLabels[Math.min(idx, ringLabels.length - 1)];
    });
  } else {
    remaining.forEach((player, idx) => {
      positions[player.name] = ringLabels[Math.min(idx, ringLabels.length - 1)];
    });
  }

  return players.map((player) => ({
    name: player.name,
    stack: player.stack,
    position: positions[player.name] ?? "UTG",
    bounty: player.bounty,
  }));
}

function parseWinamaxHand(rawHand: string, fallbackIndex: number, sourceFile?: string): ParsedHand {
  const lines = rawHand
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error("Main Winamax vide.");

  const header = lines[0];
  const id = header.match(/HandId:\s*(#[^-]+-[^-]+-\d+)/)?.[1] ?? `wina-${fallbackIndex + 1}`;
  const levelLabel = header.match(/level:\s*([^-]+)\s*-/i)?.[1]?.trim();
  const tournamentName = header.match(/Tournament\s+"([^"]+)"/i)?.[1]?.trim();
  const tournamentVariant = detectTournamentVariant(tournamentName);
  const blindMatch = header.match(/\((\d+)\/(\d+)\/(\d+)\)/);
  const sb = blindMatch ? normalizeAmount(blindMatch[2]) : undefined;
  const bb = blindMatch ? normalizeAmount(blindMatch[3]) : undefined;
  const dateTime = header.match(/-\s(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\s+UTC)$/)?.[1];

  const buttonSeat =
    lines.find((line) => line.includes("is the button"))?.match(/Seat\s+#(\d+)/)?.[1];
  const buttonSeatNumber = buttonSeat ? Number.parseInt(buttonSeat, 10) : null;

  const seatLines = lines.filter((line) => /^Seat\s+\d+:/.test(line));
  const seatPlayers = seatLines.map((line) => {
    const match = line.match(/^Seat\s+(\d+):\s+(.+?)\s+\((\d+(?:[.,]\d+)?)(?:,\s*(\d+(?:[.,]\d+)?)€\s+bounty)?\)/i);
    if (!match) return null;
    return {
      seat: Number.parseInt(match[1], 10),
      name: match[2].trim(),
      stack: normalizeAmount(match[3]),
      bounty: match[4] ? normalizeAmount(match[4]) : undefined,
    };
  }).filter(Boolean) as { seat: number; name: string; stack: number }[];

  const heroName = lines.find((line) => line.startsWith("Dealt to "))?.match(/^Dealt to\s+(.+?)\s+\[/)?.[1];

  const holeCardsByPlayer: Record<string, string[]> = {};
  const dealt = lines.find((line) => line.startsWith("Dealt to "));
  if (dealt) {
    const m = dealt.match(/^Dealt to\s+(.+?)\s+\[([^\]]+)\]/);
    if (m) holeCardsByPlayer[m[1].trim()] = parseCards(m[2]);
  }
  Object.assign(holeCardsByPlayer, extractShowdownCards(lines));

  let sbName: string | undefined;
  let bbName: string | undefined;
  for (const line of lines) {
    const s = line.match(/^(.+?)\s+posts small blind\s+(\d+(?:[.,]\d+)?)/i);
    if (s) sbName = s[1].trim();
    const b = line.match(/^(.+?)\s+posts big blind\s+(\d+(?:[.,]\d+)?)/i);
    if (b) bbName = b[1].trim();
  }

  const players = buildWinamaxPositions(seatPlayers, buttonSeatNumber, sbName, bbName);
  const buttonPlayerName = players.find((player) => player.position === "BTN")?.name;

  const actions: Record<Street, ParsedAction[]> = { preflop: [], flop: [], turn: [], river: [] };
  const board = { flop: [] as string[], turn: [] as string[], river: [] as string[] };
  let street: Street = "preflop";

  for (const line of lines) {
    if (line.startsWith("*** PRE-FLOP ***")) {
      street = "preflop";
      continue;
    }
    if (line.startsWith("*** FLOP ***")) {
      street = "flop";
      board.flop = extractBoardCards(line).slice(0, 3);
      continue;
    }
    if (line.startsWith("*** TURN ***")) {
      street = "turn";
      const cards = line.match(/\[([^\]]+)\]\[([^\]]+)\]/);
      board.turn = cards ? `${cards[1]} ${cards[2]}`.split(" ").filter(Boolean) : extractBoardCards(line);
      continue;
    }
    if (line.startsWith("*** RIVER ***")) {
      street = "river";
      const cards = line.match(/\[([^\]]+)\]\[([^\]]+)\]/);
      board.river = cards ? `${cards[1]} ${cards[2]}`.split(" ").filter(Boolean) : extractBoardCards(line);
      continue;
    }
    if (line.startsWith("***")) continue;
    const actorMatch = line.match(/^(.+?)\s+(posts|folds|checks|calls|bets|raises|collected|shows)\b/i);
    if (!actorMatch) continue;
    const actor = actorMatch[1].trim();
    if (!players.some((p) => p.name === actor)) continue;

    const amountMatch = line.match(/(\d+(?:[.,]\d+)?)(?!.*\d)/);
    const amount = amountMatch ? normalizeAmount(amountMatch[1]) : undefined;
    const type = detectActionType(line);
    actions[street].push({ street, actor, type, amount, raw: line });
  }

  const totalPot = normalizeAmount(lines.find((line) => line.startsWith("Total pot "))?.match(/Total pot\s+(\d+(?:[.,]\d+)?)/)?.[1] ?? "0");
  const hasAllIn = lines.some((line) => line.toLowerCase().includes("all-in"));
  const hasRiver = board.river.length === 5 || actions.river.length > 0;
  const hasRaise = actions.preflop.some((action) => action.type === "raise");
  const tag: ParsedHand["tag"] = hasAllIn ? "all-in" : hasRiver ? "river" : hasRaise ? "3-bet" : "standard";

  return {
    id,
    heroName,
    buttonPlayerName,
    levelLabel,
    tournamentName,
    tournamentVariant,
    sourceFile,
    players,
    blinds: { sb, bb },
    actions,
    board: {
      flop: board.flop,
      turn: board.turn.length > 0 ? board.turn : board.flop,
      river: board.river.length > 0 ? board.river : board.turn,
    },
    holeCardsByPlayer,
    totalPot: Number.isFinite(totalPot) ? totalPot : undefined,
    dateTime,
    tag,
  };
}

function parseHandHistoryText(rawText: string, sourceFile?: string): ParsedHand[] {
  if (rawText.includes("Winamax Poker -")) {
    const hands = rawText
      .replace(/\r\n/g, "\n")
      .split(/(?=^Winamax Poker - )/gm)
      .map((chunk) => chunk.trim())
      .filter(Boolean);
    const parsedWina: ParsedHand[] = [];
    hands.forEach((hand, index) => {
      try {
        parsedWina.push(parseWinamaxHand(hand, index, sourceFile));
      } catch {
        // ignore malformed hands
      }
    });
    if (parsedWina.length > 0) return parsedWina;
  }

  const chunks = rawText
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n-{6,}\n/gm)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const parsed: ParsedHand[] = [];
  chunks.forEach((chunk, index) => {
    try {
      parsed.push(parseBetclicHand(chunk, index, sourceFile));
    } catch {
      // ignore malformed hands
    }
  });

  if (parsed.length === 0) {
    throw new Error("Aucune main valide detectee.");
  }

  return parsed;
}

/** Titre court pour une ligne de la bibliothèque de mains. */
function mesMainsRowLabel(hand: ParsedHand): string {
  const lvl = hand.levelLabel?.trim();
  const dt = hand.dateTime?.replace("T", " ").slice(0, 16);
  const idShort = hand.id.length > 24 ? `…${hand.id.slice(-20)}` : hand.id;
  return [lvl, dt, idShort].filter(Boolean).join(" · ");
}

function deriveTournamentKey(hand: ParsedHand): string {
  if (hand.tournamentName && hand.tournamentName.trim().length > 0) return hand.tournamentName.trim();
  const raw = hand.sourceFile ?? "Tournoi inconnu";
  const cleaned = raw
    .replace(/\.[^.]+$/, "")
    .replace(/_real_holdem_no-limit(_summary)?$/i, "")
    .replace(/^\d{8}_/, "")
    .trim();
  return cleaned || "Tournoi inconnu";
}

function formatTournamentDate(dateTime?: string): string | null {
  if (!dateTime) return null;
  const isoMatch = dateTime.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (!isoMatch) return null;
  return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
}

function buildReplaySteps(hand: ParsedHand): ReplayStep[] {
  const stacks: Record<string, number> = {};
  hand.players.forEach((player) => {
    stacks[player.name] = player.stack;
  });

  const actions = STREET_ORDER.flatMap((street) => hand.actions[street]);
  const forcedAction = (action: ParsedAction): boolean => {
    const raw = action.raw.toLowerCase();
    return (
      raw.includes("posts ante") ||
      raw.includes("posts small blind") ||
      raw.includes("posts big blind") ||
      raw.includes("posts sb") ||
      raw.includes("posts bb")
    );
  };

  const forcedActions = actions.filter(forcedAction);
  const replayActions = actions.filter((action) => !forcedAction(action));

  let pot = 0;
  const steps: ReplayStep[] = [];

  forcedActions.forEach((action) => {
    const amount = action.amount ?? 0;
    if (amount > 0) {
      pot += amount;
      if (stacks[action.actor] !== undefined) {
        stacks[action.actor] = Math.max(stacks[action.actor] - amount, 0);
      }
    }
  });

  replayActions.forEach((action, index) => {
    const amount = action.amount ?? 0;
    const raw = action.raw.toLowerCase();
    const isSettlementAction =
      raw.includes("collected") ||
      raw.includes(" won ") ||
      raw.includes("wins ") ||
      raw.includes("remporte") ||
      raw.includes("gagne");
    if (isSettlementAction) {
      const wonAmount = amount > 0 ? amount : pot;
      if (wonAmount > 0 && stacks[action.actor] !== undefined) {
        stacks[action.actor] += wonAmount;
      }
      pot = Math.max(0, pot - wonAmount);
    } else if (amount > 0 && action.type !== "fold" && action.type !== "check") {
      pot += amount;
      if (stacks[action.actor] !== undefined) {
        stacks[action.actor] = Math.max(stacks[action.actor] - amount, 0);
      }
    }

    const visibleBoard =
      action.street === "preflop"
        ? []
        : action.street === "flop"
          ? hand.board.flop
          : action.street === "turn"
            ? hand.board.turn
            : hand.board.river;

    steps.push({
      index,
      action,
      pot: Number(pot.toFixed(2)),
      stacksByPlayer: { ...stacks },
      visibleBoard,
    });
  });

  return steps;
}

/** Texte lisible pour coller sur Discord / forums (reconstruit depuis la main parsée). */
function formatHandForShare(hand: ParsedHand): string {
  if (hand.id === "__empty__" || hand.players.length === 0) return "";
  const steps = buildReplaySteps(hand);
  const finalBoard = steps.length > 0 ? steps[steps.length - 1]!.visibleBoard : hand.board.flop;
  const boardLine =
    finalBoard.length > 0 ? `Plateau: ${finalBoard.join(" ")}` : "Plateau: (preflop)";

  const lines: string[] = ["--- SpotLab ---"];
  if (hand.tournamentName) lines.push(`Tournoi: ${hand.tournamentName}`);
  if (hand.dateTime) lines.push(`Date: ${hand.dateTime}`);
  if (hand.levelLabel) lines.push(`Niveau: ${hand.levelLabel}`);
  if (hand.blinds.sb != null && hand.blinds.bb != null) {
    lines.push(`Blinds: ${hand.blinds.sb} / ${hand.blinds.bb}`);
  }
  lines.push("", "Joueurs:");
  hand.players.forEach((p) => {
    const cards = hand.holeCardsByPlayer[p.name];
    const shown = cards?.length ? cards.join(" ") : "?";
    const hero = p.name === hand.heroName ? " (Hero)" : "";
    lines.push(`- ${p.name}${hero} [${p.position}] — ${shown} — stack ${p.stack}`);
  });
  lines.push("", boardLine, "", "Actions:");

  for (const street of STREET_ORDER) {
    const acts = hand.actions[street];
    if (acts.length === 0) continue;
    lines.push(`--- ${street.toUpperCase()} ---`);
    acts.forEach((a) => lines.push(a.raw));
  }
  lines.push("", `Fichier: ${hand.sourceFile ?? "—"}`);
  return lines.join("\n");
}

function computePendingContributions(
  steps: ReplayStep[],
  appliedStepCount: number,
  allPlayerNames: string[],
): PendingContributionState {
  const pendingByPlayer: Record<string, number> = {};
  const contributedByPlayer: Record<string, number> = {};
  const activePlayers = new Set<string>(allPlayerNames);
  const actedPlayers = new Set<string>();
  let currentStreet: Street | null = null;
  let currentBet = 0;

  function resetStreetState() {
    Object.keys(pendingByPlayer).forEach((k) => delete pendingByPlayer[k]);
    Object.keys(contributedByPlayer).forEach((k) => delete contributedByPlayer[k]);
    actedPlayers.clear();
    currentBet = 0;
  }

  for (let i = 0; i < appliedStepCount; i += 1) {
    const step = steps[i];
    const action = step.action;

    if (currentStreet !== action.street) {
      resetStreetState();
      currentStreet = action.street;
    }

    const amount = action.amount ?? 0;
    const currentContribution = contributedByPlayer[action.actor] ?? 0;

    if (action.type === "fold") {
      activePlayers.delete(action.actor);
      delete pendingByPlayer[action.actor];
      delete contributedByPlayer[action.actor];
      actedPlayers.add(action.actor);
    } else if (
      amount > 0 &&
      (action.type === "bet" || action.type === "raise" || action.type === "all-in" || action.type === "call")
    ) {
      const nextContribution = currentContribution + amount;
      contributedByPlayer[action.actor] = nextContribution;
      pendingByPlayer[action.actor] = nextContribution;

      if (nextContribution > currentBet && (action.type === "bet" || action.type === "raise" || action.type === "all-in")) {
        currentBet = nextContribution;
        actedPlayers.clear();
        actedPlayers.add(action.actor);
      } else {
        actedPlayers.add(action.actor);
      }
    } else if (action.type === "check") {
      actedPlayers.add(action.actor);
    } else {
      actedPlayers.add(action.actor);
    }

    const remainingPlayers = Array.from(activePlayers);
    const roundComplete =
      remainingPlayers.length <= 1 ||
      (currentBet > 0
        ? remainingPlayers.every((name) => (contributedByPlayer[name] ?? 0) === currentBet)
        : remainingPlayers.every((name) => actedPlayers.has(name)));

    if (roundComplete) {
      resetStreetState();
    }
  }

  return { pendingByPlayer: { ...pendingByPlayer } };
}

function normalizePositionToSeat(position: string): CanonicalSeat {
  const pos = position.toUpperCase();
  if (pos.includes("BTN") || pos.includes("BUTTON")) return "BTN";
  if (pos.includes("SB")) return "SB";
  if (pos.includes("BB")) return "BB";
  if (pos.includes("UTG") || pos.includes("EP") || pos.includes("LJ")) return "UTG";
  if (pos.includes("MP") || pos.includes("HJ")) return "MP";
  if (pos.includes("CO")) return "CO";
  return "UTG";
}

function buildSeatLayout(players: Player[], heroName?: string): Record<
  string,
  { originalSeat: CanonicalSeat; visualSeat: VisualSeat | "HU_TOP" | "HU_BOTTOM"; x: number; y: number }
> {
  const layout: Record<
    string,
    { originalSeat: CanonicalSeat; visualSeat: VisualSeat | "HU_TOP" | "HU_BOTTOM"; x: number; y: number }
  > = {};

  if (players.length === 2 && heroName) {
    players.forEach((player) => {
      const originalSeat = normalizePositionToSeat(player.position);
      const isHero = player.name === heroName;
      layout[player.name] = {
        originalSeat,
        visualSeat: isHero ? "HU_BOTTOM" : "HU_TOP",
        x: 40,
        y: isHero ? 90 : 10,
      };
    });
    return layout;
  }

  const hero = players.find((player) => player.name === heroName);
  const heroSeat = normalizePositionToSeat(hero?.position ?? "BB");
  const heroSeatIndex = SEAT_ORDER.indexOf(heroSeat);

  players.forEach((player) => {
    const originalSeat = normalizePositionToSeat(player.position);
    const originalIndex = SEAT_ORDER.indexOf(originalSeat);
    const relativeIndex = (originalIndex - heroSeatIndex + SEAT_ORDER.length) % SEAT_ORDER.length;
    const visualSeat = VISUAL_SEAT_ORDER[relativeIndex];
    const coord = VISUAL_SEAT_COORDINATES[visualSeat];
    layout[player.name] = {
      originalSeat,
      visualSeat,
      x: coord.x,
      y: coord.y,
    };
  });
  return layout;
}

const CARD_SIZE_STYLES = {
  md: {
    box: "h-16 w-11 rounded-lg",
    rank: "text-[1.05rem]",
    cornerSuit: "text-[0.55rem]",
    centerSuit: "text-[1.65rem]",
    corner: "left-1 top-1 gap-0",
    cornerBottom: "bottom-1 right-1 gap-0",
  },
  lg: {
    box: "h-[5.5rem] w-[3.85rem] rounded-xl",
    rank: "text-[1.35rem]",
    cornerSuit: "text-[0.6rem]",
    centerSuit: "text-[2.35rem]",
    corner: "left-1.5 top-1.5 gap-0",
    cornerBottom: "bottom-1.5 right-1.5 gap-0",
  },
  hero: {
    box: "h-[5.5rem] w-[3.85rem] rounded-xl",
    rank: "text-[1.35rem]",
    cornerSuit: "text-[0.6rem]",
    centerSuit: "text-[2.35rem]",
    corner: "left-1.5 top-1.5 gap-0",
    cornerBottom: "bottom-1.5 right-1.5 gap-0",
  },
} as const;

function Card({ card, size = "md" }: { card: string; size?: "md" | "lg" | "hero" }) {
  const rank = card.slice(0, -1).toUpperCase();
  const suit = card.slice(-1).toLowerCase();
  const suitMap: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
  const symbol = suitMap[suit] ?? "?";
  const isRed = suit === "h" || suit === "d";
  const tone = isRed ? "text-rose-600" : "text-zinc-900";
  const s = CARD_SIZE_STYLES[size === "hero" ? "hero" : size === "lg" ? "lg" : "md"];

  const corner = (
    <span className={`flex flex-col items-center leading-none ${tone}`}>
      <span className={`font-black tabular-nums tracking-tighter ${s.rank}`}>{rank}</span>
      <span className={`leading-none ${s.cornerSuit}`} aria-hidden>
        {symbol}
      </span>
    </span>
  );

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center border border-zinc-200/90 bg-gradient-to-br from-white via-white to-zinc-100 shadow-[0_6px_18px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-zinc-950/5 ${s.box}`}
    >
      <span className={`absolute ${s.corner}`}>{corner}</span>
      <span
        className={`select-none leading-none ${tone} ${s.centerSuit}`}
        style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
        aria-hidden
      >
        {symbol}
      </span>
      <span className={`absolute rotate-180 ${s.cornerBottom}`}>{corner}</span>
    </span>
  );
}

function BackCard({ size = "md" }: { size?: "md" | "hero" | "lg" }) {
  const large = size === "hero" || size === "lg";
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center border border-rose-300/40 bg-gradient-to-br from-rose-600 via-rose-700 to-red-950 shadow-[0_6px_18px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.12)] ${
        large ? "h-[5.5rem] w-[3.85rem] rounded-xl" : "h-16 w-11 rounded-lg"
      }`}
    >
      <span
        className={`rounded-md border border-rose-200/35 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.2)_1px,_transparent_1px)] bg-[length:4px_4px] ${
          large ? "h-[3.6rem] w-[2.55rem]" : "h-9 w-6"
        }`}
      />
    </span>
  );
}

async function getOrResumeAudioContext(ref: MutableRefObject<AudioContext | null>): Promise<AudioContext | null> {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ref.current) ref.current = new Ctor();
    if (ref.current.state === "suspended") await ref.current.resume();
    return ref.current;
  } catch {
    return null;
  }
}

function playTableCheckSound(ctx: AudioContext) {
  const t = ctx.currentTime;
  const doorKnock = (offset: number, baseHz: number) => {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(520, t + offset);
    filter.Q.value = 0.6;
    osc.type = "triangle";
    osc.frequency.setValueAtTime(baseHz, t + offset);
    osc.frequency.exponentialRampToValueAtTime(baseHz * 0.55, t + offset + 0.045);
    gain.gain.setValueAtTime(0, t + offset);
    gain.gain.linearRampToValueAtTime(0.42, t + offset + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.1);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + offset);
    osc.stop(t + offset + 0.11);

    const bufferSize = Math.ceil(ctx.sampleRate * 0.02);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    const noiseFilter = ctx.createBiquadFilter();
    const noiseGain = ctx.createGain();
    noise.buffer = noiseBuffer;
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 380;
    noiseFilter.Q.value = 0.9;
    noiseGain.gain.setValueAtTime(0, t + offset);
    noiseGain.gain.linearRampToValueAtTime(0.14, t + offset + 0.0015);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.018);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(t + offset);
    noise.stop(t + offset + 0.022);
  };
  doorKnock(0, 205);
  doorKnock(0.11, 185);
}

function playTableChipSound(ctx: AudioContext) {
  const t = ctx.currentTime;
  const sampleRate = ctx.sampleRate;
  const makeNoiseBuffer = (durationSec: number) => {
    const len = Math.max(1, Math.ceil(sampleRate * durationSec));
    const buf = ctx.createBuffer(1, len, sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      ch[i] = Math.random() * 2 - 1;
    }
    return buf;
  };
  const coinClack = (offset: number, centerHz: number, volume: number) => {
    const src = ctx.createBufferSource();
    const bp = ctx.createBiquadFilter();
    const hp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = makeNoiseBuffer(0.018);
    bp.type = "bandpass";
    bp.frequency.value = centerHz;
    bp.Q.value = 3.2;
    hp.type = "highpass";
    hp.frequency.value = 1400;
    hp.Q.value = 0.7;
    const start = t + offset;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(volume, start + 0.0006);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.03);
    src.connect(bp);
    bp.connect(hp);
    hp.connect(g);
    g.connect(ctx.destination);
    src.start(start);
    src.stop(start + 0.035);

    const ring = ctx.createOscillator();
    const ringG = ctx.createGain();
    ring.type = "triangle";
    ring.frequency.setValueAtTime(centerHz * 1.08, start);
    ring.frequency.exponentialRampToValueAtTime(centerHz * 0.86, start + 0.045);
    ringG.gain.setValueAtTime(0, start);
    ringG.gain.linearRampToValueAtTime(volume * 0.16, start + 0.0008);
    ringG.gain.exponentialRampToValueAtTime(0.001, start + 0.05);
    ring.connect(ringG);
    ringG.connect(ctx.destination);
    ring.start(start);
    ring.stop(start + 0.055);
  };
  coinClack(0, 4200, 0.12);
  coinClack(0.016, 5100, 0.1);
  coinClack(0.033, 3600, 0.1);
  coinClack(0.052, 4700, 0.085);
  coinClack(0.074, 3300, 0.07);
}

export default function Home() {
  const { user, pseudo, authLoading, firebaseConfigured } = usePhrFirebase();
  const [hands, setHands] = useState<ParsedHand[]>([]);
  const [selectedHandId, setSelectedHandId] = useState<string>("");
  const [stepIndex, setStepIndex] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudLoadError, setCloudLoadError] = useState<string | null>(null);
  const [chipTick, setChipTick] = useState(0);
  const [displayUnit, setDisplayUnit] = useState<"bb" | "chips">("bb");
  const [selectedTournament, setSelectedTournament] = useState<string>("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [showMesMainsFullPage, setShowMesMainsFullPage] = useState(false);
  /** Fil public / accueil (distinct du replayer quand des mains sont chargées). */
  const [showPublicHome, setShowPublicHome] = useState(true);
  const viewPublicHome = hands.length === 0 || showPublicHome;
  /** Mise en avant de la zone drop sur l’accueil (aucune main). */
  const [welcomeDropActive, setWelcomeDropActive] = useState(false);
  /** Message court après partage de main (presse-papiers / partage natif). */
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showPublishSpotModal, setShowPublishSpotModal] = useState(false);
  const [spotPublishContext, setSpotPublishContext] = useState<SpotReplayContext | null>(null);
  const [blurHandActions, setBlurHandActions] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showOddsModule, setShowOddsModule] = useState(false);
  const [showBountyModule, setShowBountyModule] = useState(false);
  const [showGeometricModule, setShowGeometricModule] = useState(false);
  /** Menu du gros bouton « Outils de calculs » (Cotes / Bounty / Géométrique). */
  const [showCalcToolsMenu, setShowCalcToolsMenu] = useState(false);
  const [handFilters, setHandFilters] = useState<PhrHandFilterSelection>(EMPTY_PHR_HAND_FILTER_SELECTION);
  const [oddsPotInput, setOddsPotInput] = useState<string>("10");
  const [oddsCallInput, setOddsCallInput] = useState<string>("5");
  const [oddsOutsInput, setOddsOutsInput] = useState<string>("9");
  const [oddsStreet, setOddsStreet] = useState<"FLOP" | "TURN">("FLOP");
  const [targetBountyInput, setTargetBountyInput] = useState<string>("10");
  const [buyInInput, setBuyInInput] = useState<string>("10");
  const [startingStackInput, setStartingStackInput] = useState<string>("20000");
  const [currentBbInput, setCurrentBbInput] = useState<string>("1000");
  const [geoPotInput, setGeoPotInput] = useState<string>("10");
  const [geoStackInput, setGeoStackInput] = useState<string>("30");
  const [geoStreetsInput, setGeoStreetsInput] = useState<"1" | "2" | "3">("2");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastActionSoundSigRef = useRef<string>("");
  const prevUserRef = useRef<typeof user>(null);
  const userRef = useRef(user);
  const handsRef = useRef(hands);
  const skipCloudSaveRef = useRef(true);
  userRef.current = user;
  handsRef.current = hands;

  async function persistHandsToCloud(handsToSave?: ParsedHand[]): Promise<void> {
    const uid = userRef.current?.uid;
    if (!uid || !firebaseConfigured || skipCloudSaveRef.current) return;
    const list = (handsToSave ?? handsRef.current).filter((hand) => !isFeedViewerHand(hand));
    if (list.length === 0) return;
    await saveUserHandsOnly(uid, parsedHandsToCloudRecords(list), handStableKeyFromRecord);
  }

  async function persistReplaySessionToCloud(session?: {
    selectedHandId?: string;
    stepIndex?: number;
    selectedTournament?: string;
    displayUnit?: "bb" | "chips";
    soundEnabled?: boolean;
  }): Promise<void> {
    const uid = userRef.current?.uid;
    if (!uid || !firebaseConfigured || skipCloudSaveRef.current) return;
    if (handsRef.current.length === 0) return;
    const activeHand =
      handsRef.current.find((hand) => hand.id === (session?.selectedHandId ?? selectedHandId)) ??
      handsRef.current[0];
    if (activeHand && isFeedViewerHand(activeHand)) return;
    await saveUserReplaySession(uid, {
      selectedHandId: session?.selectedHandId ?? selectedHandId,
      stepIndex: session?.stepIndex ?? stepIndex,
      selectedTournament: session?.selectedTournament ?? selectedTournament,
      displayUnit: session?.displayUnit ?? displayUnit,
      soundEnabled: session?.soundEnabled ?? soundEnabled,
    });
  }

  function parseNumericInput(value: string): number {
    const normalized = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(normalized) ? Math.max(0, normalized) : 0;
  }

  const tournamentOptions = useMemo(() => {
    const groups = new Map<string, { name: string; date: string | null; count: number }>();
    hands.forEach((hand) => {
      const key = deriveTournamentKey(hand);
      const date = formatTournamentDate(hand.dateTime);
      const prev = groups.get(key);
      if (!prev) {
        groups.set(key, { name: key, date, count: 1 });
      } else {
        groups.set(key, { name: key, date: prev.date ?? date, count: prev.count + 1 });
      }
    });
    return [
      { key: "ALL", label: `Tous les tournois (${hands.length} mains)` },
      ...Array.from(groups.entries())
        .sort((a, b) => a[0].localeCompare(b[0], "fr"))
        .map(([key, value]) => ({
          key,
          label: value.date ? `${value.name} - ${value.date} (${value.count})` : `${value.name} (${value.count})`,
        })),
    ];
  }, [hands]);
  const tournamentFilteredHands = useMemo(() => {
    if (selectedTournament === "ALL") return hands;
    return hands.filter((hand) => deriveTournamentKey(hand) === selectedTournament);
  }, [hands, selectedTournament]);
  const filteredHands = useMemo(() => {
    return tournamentFilteredHands.filter((hand) => handMatchesPhrFilters(hand, handFilters));
  }, [handFilters, tournamentFilteredHands]);
  const selectedHand = useMemo(
    () =>
      filteredHands.find((hand) => hand.id === selectedHandId) ??
      filteredHands[0] ??
      hands[0] ??
      EMPTY_HAND,
    [filteredHands, hands, selectedHandId],
  );
  const selectedHandIndex = useMemo(
    () => filteredHands.findIndex((hand) => hand.id === selectedHand.id),
    [filteredHands, selectedHand.id],
  );

  const replaySteps = useMemo(() => buildReplaySteps(selectedHand), [selectedHand]);
  const maxUiStepIndex = replaySteps.length;
  const clampedStepIndex = Math.max(0, Math.min(stepIndex, maxUiStepIndex));
  const currentStep = clampedStepIndex === 0 ? null : replaySteps[clampedStepIndex - 1];
  const initialForcedState = useMemo(() => {
    const initialStacks: Record<string, number> = Object.fromEntries(
      selectedHand.players.map((p) => [p.name, p.stack]),
    );
    let initialPot = 0;
    const allActions = STREET_ORDER.flatMap((street) => selectedHand.actions[street]);
    const isForcedPost = (action: ParsedAction) => {
      const raw = action.raw.toLowerCase();
      return (
        raw.includes("posts ante") ||
        raw.includes("posts small blind") ||
        raw.includes("posts big blind") ||
        raw.includes("posts sb") ||
        raw.includes("posts bb")
      );
    };
    allActions.filter(isForcedPost).forEach((action) => {
      const amount = action.amount ?? 0;
      if (amount <= 0) return;
      initialPot += amount;
      if (initialStacks[action.actor] !== undefined) {
        initialStacks[action.actor] = Math.max(initialStacks[action.actor] - amount, 0);
      }
    });
    return {
      pot: Number(initialPot.toFixed(2)),
      stacksByPlayer: initialStacks,
    };
  }, [selectedHand.actions, selectedHand.players]);
  const currentPot = currentStep?.pot ?? initialForcedState.pot;

  useEffect(() => {
    if (!currentStep || clampedStepIndex <= 0) return;
    const sig = `${selectedHand.id}:${clampedStepIndex}:${currentStep.action.raw}`;
    if (sig === lastActionSoundSigRef.current) return;
    lastActionSoundSigRef.current = sig;

    void (async () => {
      if (!soundEnabled) return;
      const ctx = await getOrResumeAudioContext(audioCtxRef);
      if (!ctx) return;
      const { type, amount } = currentStep.action;
      if (type === "check") {
        playTableCheckSound(ctx);
        return;
      }
      const hasMoney =
        type === "bet" ||
        type === "call" ||
        type === "raise" ||
        type === "all-in" ||
        (type === "post" && typeof amount === "number" && amount > 0);
      if (hasMoney) {
        playTableChipSound(ctx);
      }
    })();
  }, [clampedStepIndex, currentStep, selectedHand.id, soundEnabled]);

  useEffect(() => {
    if (!showMesMainsFullPage) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMesMainsFullPage(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showMesMainsFullPage]);

  useEffect(() => {
    if (hands.length === 0) setShowMesMainsFullPage(false);
  }, [hands.length]);

  useEffect(() => {
    if (authLoading) return;
    const hadUser = prevUserRef.current;
    prevUserRef.current = user;
    if (hadUser && !user) {
      setHands([]);
      setSelectedHandId("");
      setStepIndex(0);
      setCloudLoadError(null);
      setCloudLoading(false);
      skipCloudSaveRef.current = true;
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) {
      queueMicrotask(() => {
        setCloudLoading(false);
        setCloudLoadError(null);
      });
      return;
    }

    let cancelled = false;
    skipCloudSaveRef.current = true;
    setCloudLoading(true);
    setCloudLoadError(null);

    let handsToPersist: ParsedHand[] | null = null;

    void loadUserCloudData(user.uid)
      .then(({ hands: rawHands, prefs }) => {
        if (cancelled) return;
        const parsed: ParsedHand[] = [];
        for (const raw of rawHands) {
          const hand = storedRecordToParsedHand(raw);
          if (hand) parsed.push(hand);
        }

        const local = handsRef.current;
        const merged = mergeParsedHandLists(local, parsed);
        if (merged.length === 0) return;

        handsToPersist = merged;

        if (local.length === 0 && parsed.length > 0) {
          setShowPublicHome(false);
          const preferredId = prefs?.selectedHandId?.trim();
          const pick =
            preferredId && merged.some((h) => h.id === preferredId) ? preferredId : merged[0].id;
          setSelectedHandId(pick);
          if (typeof prefs?.stepIndex === "number" && Number.isFinite(prefs.stepIndex)) {
            setStepIndex(Math.max(0, prefs.stepIndex));
          }
          if (prefs?.selectedTournament?.trim()) {
            setSelectedTournament(prefs.selectedTournament);
          }
          if (prefs?.displayUnit === "bb" || prefs?.displayUnit === "chips") {
            setDisplayUnit(prefs.displayUnit);
          }
          if (typeof prefs?.soundEnabled === "boolean") {
            setSoundEnabled(prefs.soundEnabled);
          }
        }

        if (parsed.length > 0 || merged.length !== local.length) {
          setHands(merged);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCloudLoadError(error instanceof Error ? error.message : "Impossible de charger tes mains.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCloudLoading(false);
          if (handsToPersist && handsToPersist.length > 0) {
            void persistHandsToCloud(handsToPersist).catch(() => {
              /* retry au prochain changement */
            });
          } else if (handsRef.current.length > 0) {
            void persistHandsToCloud().catch(() => {
              /* retry au prochain changement */
            });
          }
          queueMicrotask(() => {
            skipCloudSaveRef.current = false;
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user || skipCloudSaveRef.current || cloudLoading) return;

    const flushAll = () => {
      void persistHandsToCloud().catch(() => {
        /* sauvegarde silencieuse */
      });
      void persistReplaySessionToCloud().catch(() => {
        /* sauvegarde silencieuse */
      });
    };

    const timer = window.setTimeout(flushAll, 800);
    return () => {
      window.clearTimeout(timer);
      if (!skipCloudSaveRef.current && handsRef.current.length > 0) {
        flushAll();
      }
    };
  }, [user, hands, cloudLoading, selectedHandId, stepIndex, selectedTournament, displayUnit, soundEnabled, firebaseConfigured]);

  useEffect(() => {
    function flushOnLeave() {
      if (document.visibilityState !== "hidden") return;
      if (!userRef.current || skipCloudSaveRef.current || handsRef.current.length === 0) return;
      void persistHandsToCloud().catch(() => {});
      void persistReplaySessionToCloud().catch(() => {});
    }

    window.addEventListener("pagehide", flushOnLeave);
    document.addEventListener("visibilitychange", flushOnLeave);
    return () => {
      window.removeEventListener("pagehide", flushOnLeave);
      document.removeEventListener("visibilitychange", flushOnLeave);
    };
  }, [firebaseConfigured]);

  useEffect(() => {
    if (!showSettingsPanel) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSettingsPanel(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSettingsPanel]);

  const currentStacks = currentStep?.stacksByPlayer ?? initialForcedState.stacksByPlayer;
  const activePlayer = currentStep?.action.actor;
  const visibleBoard = useMemo(() => currentStep?.visibleBoard ?? [], [currentStep]);
  const foldedPlayers = useMemo(() => {
    const folded = new Set<string>();
    replaySteps.slice(0, clampedStepIndex).forEach((step) => {
      if (step.action.type === "fold") folded.add(step.action.actor);
    });
    return folded;
  }, [clampedStepIndex, replaySteps]);
  const lastActionByPlayer = useMemo(() => {
    const map: Record<string, ParsedAction> = {};
    replaySteps.slice(0, clampedStepIndex).forEach((step) => {
      map[step.action.actor] = step.action;
    });
    return map;
  }, [clampedStepIndex, replaySteps]);
  const seatLayout = useMemo(
    () => buildSeatLayout(selectedHand.players, selectedHand.heroName),
    [selectedHand.heroName, selectedHand.players],
  );
  const pendingNow = useMemo(
    () => computePendingContributions(replaySteps, clampedStepIndex, selectedHand.players.map((p) => p.name)),
    [clampedStepIndex, replaySteps, selectedHand.players],
  );
  const pendingPrev = useMemo(
    () =>
      computePendingContributions(
        replaySteps,
        Math.max(clampedStepIndex - 1, 0),
        selectedHand.players.map((p) => p.name),
      ),
    [clampedStepIndex, replaySteps, selectedHand.players],
  );
  const dealerSeat = selectedHand.buttonPlayerName ? seatLayout[selectedHand.buttonPlayerName] : null;
  const potAnchor = { x: 50, y: 32 };
  const betStopPlayerWeight = 0.7;
  const betStopCenterWeight = 1 - betStopPlayerWeight;
  const getBetStopPoint = (playerName: string, seat: { x: number; y: number }) => {
    const isHero = playerName === selectedHand.heroName;
    const playerWeight = isHero ? 0.34 : betStopPlayerWeight;
    const centerWeight = 1 - playerWeight;
    const targetCenterY = !isHero && seat.y <= 22 ? 58 : isHero ? 42 : 54;
    return {
      x: seat.x * playerWeight + 50 * centerWeight,
      y: seat.y * playerWeight + targetCenterY * centerWeight,
    };
  };
  const chipAnimation = useMemo(() => {
    if (!currentStep) return null;
    const raw = currentStep.action.raw.toLowerCase();
    const isSettlementAction =
      raw.includes("collected") ||
      raw.includes(" won ") ||
      raw.includes("wins ") ||
      raw.includes("remporte") ||
      raw.includes("gagne");
    if (isSettlementAction) return null;
    const isMoneyAction =
      (currentStep.action.type === "call" ||
        currentStep.action.type === "bet" ||
        currentStep.action.type === "raise" ||
        currentStep.action.type === "all-in" ||
        currentStep.action.type === "post") &&
      typeof currentStep.action.amount === "number" &&
      currentStep.action.amount > 0;
    if (!isMoneyAction) return null;
    const anchor = seatLayout[currentStep.action.actor];
    if (!anchor) return null;
    return {
      key: `${selectedHand.id}-${clampedStepIndex}-${chipTick}`,
      amount: currentStep.action.amount ?? 0,
      startX: anchor.x,
      startY: anchor.y,
      endX: getBetStopPoint(currentStep.action.actor, anchor).x,
      endY: getBetStopPoint(currentStep.action.actor, anchor).y,
    };
  }, [chipTick, clampedStepIndex, currentStep, seatLayout, selectedHand.heroName, selectedHand.id]);
  const potWinAnimation = useMemo(() => {
    if (!currentStep) return null;
    const raw = currentStep.action.raw.toLowerCase();
    const isWinAction =
      raw.includes("collected") ||
      raw.includes(" won ") ||
      raw.includes("wins ") ||
      raw.includes("remporte") ||
      raw.includes("gagne");
    if (!isWinAction) return null;
    const winnerFromRaw = selectedHand.players.find((player) =>
      raw.includes(player.name.toLowerCase()),
    )?.name;
    const winnerName = seatLayout[currentStep.action.actor]
      ? currentStep.action.actor
      : (winnerFromRaw ?? currentStep.action.actor);
    const winnerSeat = seatLayout[winnerName];
    if (!winnerSeat) return null;
    return {
      key: `${selectedHand.id}-potwin-${clampedStepIndex}`,
      winner: winnerName,
      endX: winnerSeat.x,
      endY: winnerSeat.y + 6,
      amount: Math.max(currentPot, currentStep.action.amount ?? 0),
    };
  }, [clampedStepIndex, currentPot, currentStep, seatLayout, selectedHand.id, selectedHand.players]);
  const sweepAnimation = useMemo(() => {
    const prevEntries = Object.entries(pendingPrev.pendingByPlayer);
    const nowEntries = Object.entries(pendingNow.pendingByPlayer);
    if (prevEntries.length === 0 || nowEntries.length > 0) return null;
    const sweepByPlayer: Record<string, number> = Object.fromEntries(prevEntries);
    const currentAmount = currentStep?.action.amount ?? 0;
    const isMoneyAction =
      !!currentStep &&
      (currentStep.action.type === "call" ||
        currentStep.action.type === "bet" ||
        currentStep.action.type === "raise" ||
        currentStep.action.type === "all-in" ||
        currentStep.action.type === "post") &&
      typeof currentStep.action.amount === "number" &&
      currentStep.action.amount > 0;
    if (isMoneyAction && currentStep) {
      const actor = currentStep.action.actor;
      sweepByPlayer[actor] = (sweepByPlayer[actor] ?? 0) + currentAmount;
    }
    return {
      key: `${selectedHand.id}-sweep-${clampedStepIndex}`,
      entries: Object.entries(sweepByPlayer).map(([player, amount]) => {
        const seat = seatLayout[player];
        const stop = seat ? getBetStopPoint(player, seat) : { x: 50, y: 54 };
        const x = stop.x;
        const y = stop.y;
        return { player, amount, x, y };
      }),
    };
  }, [
    clampedStepIndex,
    currentStep,
    pendingNow.pendingByPlayer,
    pendingPrev.pendingByPlayer,
    seatLayout,
    selectedHand.id,
    selectedHand.heroName,
  ]);
  const bbValue = selectedHand.blinds.bb && selectedHand.blinds.bb > 0 ? selectedHand.blinds.bb : 1;
  const initialBlindChips = useMemo(() => {
    const entries: { player: string; amount: number }[] = [];
    selectedHand.players.forEach((player) => {
      const pos = player.position.toUpperCase();
      if (pos.includes("SB") && (selectedHand.blinds.sb ?? 0) > 0) {
        entries.push({ player: player.name, amount: selectedHand.blinds.sb ?? 0 });
      } else if (pos.includes("BB") && (selectedHand.blinds.bb ?? 0) > 0) {
        entries.push({ player: player.name, amount: selectedHand.blinds.bb ?? 0 });
      }
    });
    return entries;
  }, [selectedHand.blinds.bb, selectedHand.blinds.sb, selectedHand.players]);
  const initialBlindByPlayer = useMemo(
    () => Object.fromEntries(initialBlindChips.map((chip) => [chip.player, chip.amount])),
    [initialBlindChips],
  );
  const oddsPot = useMemo(() => parseNumericInput(oddsPotInput), [oddsPotInput]);
  const oddsCall = useMemo(() => parseNumericInput(oddsCallInput), [oddsCallInput]);
  const oddsOutsRaw = useMemo(() => parseNumericInput(oddsOutsInput), [oddsOutsInput]);
  const oddsOuts = useMemo(() => Math.min(15, Math.max(0, Math.round(oddsOutsRaw))), [oddsOutsRaw]);
  const hitProbability = useMemo(() => {
    if (oddsOuts <= 0) return 0;
    if (oddsStreet === "TURN") {
      return Math.min(1, oddsOuts / 46);
    }
    const missTurn = (47 - oddsOuts) / 47;
    const missRiver = (46 - oddsOuts) / 46;
    return Math.min(1, 1 - missTurn * missRiver);
  }, [oddsOuts, oddsStreet]);
  const requiredEquity = useMemo(() => {
    if (oddsCall <= 0) return 0;
    return oddsCall / Math.max(oddsPot + oddsCall, 0.0001);
  }, [oddsCall, oddsPot]);
  const callEv = useMemo(
    () => hitProbability * (oddsPot + oddsCall) - oddsCall,
    [hitProbability, oddsCall, oddsPot],
  );
  const callIsPlusEv = callEv >= 0;
  const targetBounty = useMemo(() => parseNumericInput(targetBountyInput), [targetBountyInput]);
  const buyIn = useMemo(() => parseNumericInput(buyInInput), [buyInInput]);
  const startingStack = useMemo(() => Math.max(1, parseNumericInput(startingStackInput)), [startingStackInput]);
  const currentBb = useMemo(() => Math.max(1, parseNumericInput(currentBbInput)), [currentBbInput]);
  const koMoyenDiv2 = useMemo(() => targetBounty / 2, [targetBounty]);
  const ratioSurBuyIn = useMemo(() => koMoyenDiv2 / Math.max(buyIn, 0.0001), [buyIn, koMoyenDiv2]);
  const jetonsEquivalents = useMemo(
    () => ratioSurBuyIn * startingStack,
    [ratioSurBuyIn, startingStack],
  );
  const bountyBbEquivalent = useMemo(
    () => jetonsEquivalents / Math.max(currentBb, 0.0001),
    [currentBb, jetonsEquivalents],
  );
  const geoPot = useMemo(() => Math.max(0.0001, parseNumericInput(geoPotInput)), [geoPotInput]);
  const geoStack = useMemo(() => Math.max(0, parseNumericInput(geoStackInput)), [geoStackInput]);
  const geoStreets = useMemo(() => Number.parseInt(geoStreetsInput, 10), [geoStreetsInput]);
  const geoRatio = useMemo(
    () => (Math.pow(1 + (2 * geoStack) / geoPot, 1 / Math.max(geoStreets, 1)) - 1) / 2,
    [geoPot, geoStack, geoStreets],
  );
  const geoSizes = useMemo(() => {
    const sizes: number[] = [];
    let pot = geoPot;
    for (let i = 0; i < geoStreets; i += 1) {
      const bet = pot * geoRatio;
      sizes.push(bet);
      pot += 2 * bet;
    }
    return sizes;
  }, [geoPot, geoRatio, geoStreets]);
  const allInTriggered = useMemo(
    () =>
      replaySteps.slice(0, clampedStepIndex).some((step) => {
        const raw = step.action.raw.toLowerCase();
        return step.action.type === "all-in" || raw.includes("all-in");
      }),
    [clampedStepIndex, replaySteps],
  );
  const equityByPlayer = useMemo(() => {
    if (!allInTriggered) return null;
    const contenders = selectedHand.players
      .filter((player) => !foldedPlayers.has(player.name))
      .map((player) => ({
        name: player.name,
        cards: selectedHand.holeCardsByPlayer[player.name] ?? [],
      }))
      .filter((player) => player.cards.length === 2);
    return computeAllInEquity(contenders, visibleBoard);
  }, [allInTriggered, foldedPlayers, selectedHand.holeCardsByPlayer, selectedHand.players, visibleBoard]);

  function formatAmount(value: number): string {
    if (displayUnit === "chips") return `${value.toFixed(1)}`;
    return `${(value / bbValue).toFixed(1)} BB`;
  }

  function actionLabelUi(action: ParsedAction): string {
    const base = action.type === "all-in" ? "ALL-IN" : action.type.toUpperCase();
    if (typeof action.amount !== "number") return base;
    return `${base} ${formatAmount(action.amount)}`;
  }

  function captureSpotReplayContext(): SpotReplayContext {
    return buildSpotReplayContext({
      hand: selectedHand as unknown as Record<string, unknown>,
      handId: selectedHand.id,
      clampedStepIndex,
      maxUiStepIndex,
      replaySteps,
      visibleBoard,
      pot: currentPot,
      potLabel: formatAmount(currentPot),
      displayUnit,
      formatActionLabel: (action) => {
        const base = action.type === "all-in" ? "ALL-IN" : action.type.toUpperCase();
        if (typeof action.amount !== "number") return base;
        return `${base} ${formatAmount(action.amount)}`;
      },
    });
  }

  async function importHandHistoryFiles(files: File[]) {
    if (files.length === 0) return;
    try {
      const parsedAll: ParsedHand[] = [];
      for (const file of files) {
        const text = await file.text();
        const parsed = parseHandHistoryText(text, file.name);
        parsedAll.push(...parsed);
      }
      if (parsedAll.length === 0) throw new Error("Aucune main valide detectee.");
      const sorted = dedupeSortParsedHands([...handsRef.current, ...parsedAll]);
      setShowPublicHome(false);
      setHands(sorted);
      if (sorted.length > 0) {
        setSelectedHandId(sorted[0].id);
      }
      setStepIndex(0);
      setImportError(null);
      if (user && firebaseConfigured) {
        await persistHandsToCloud(sorted);
        await persistReplaySessionToCloud({
          selectedHandId: sorted[0]?.id ?? "",
          stepIndex: 0,
        });
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import impossible");
    }
  }

  async function onImportFile(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    await importHandHistoryFiles(files);
    event.target.value = "";
  }

  async function onWelcomeDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setWelcomeDropActive(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    await importHandHistoryFiles(files);
  }

  function onWelcomeDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setWelcomeDropActive(true);
  }

  function onWelcomeDragLeave(event: DragEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setWelcomeDropActive(false);
  }

  const discordInviteHref =
    process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim() || "https://discord.com";

  async function publishCurrentHandToFeed() {
    const text = formatHandForShare(selectedHand);
    const clearToast = () => {
      window.setTimeout(() => setShareToast(null), 2800);
    };
    if (!text) {
      setShareToast("Importe une main pour la publier.");
      clearToast();
      return;
    }
    if (!user) {
      setShareToast("Connecte-toi pour publier sur le fil public.");
      clearToast();
      return;
    }
    try {
      await publishPublicPost({
        authorUid: user.uid,
        authorPseudo: pseudo?.trim() || user.email?.split("@")[0] || "Joueur",
        summary: text.slice(0, 4000),
        hand: selectedHand as unknown as Record<string, unknown>,
      });
      setShareToast("Main publiée sur le fil SpotLab.");
      clearToast();
    } catch (err) {
      setShareToast(err instanceof Error ? err.message : "Publication impossible.");
      clearToast();
    }
  }

  async function shareCurrentHand() {
    const text = formatHandForShare(selectedHand);
    const clearToast = () => {
      window.setTimeout(() => setShareToast(null), 2800);
    };
    if (!text) {
      setShareToast("Importe une main pour la partager.");
      clearToast();
      return;
    }
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({ title: "Main poker", text });
          setShareToast("Partage effectué.");
          clearToast();
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setShareToast("Main copiée dans le presse-papiers.");
      } else {
        window.prompt("Copie ce texte :", text);
        setShareToast("Utilise Ctrl+C dans la fenêtre pour copier.");
      }
      clearToast();
    } catch {
      setShareToast("Copie impossible (permissions navigateur ?).");
      clearToast();
    }
  }

  function loadHand(handId: string) {
    setSelectedHandId(handId);
    setStepIndex(0);
    setChipTick((value) => value + 1);
  }

  function goToPublicHome() {
    setShowPublicHome(true);
    setShowMesMainsFullPage(false);
    setShowFilters(false);
    setShowCalcToolsMenu(false);
    setShowOddsModule(false);
    setShowBountyModule(false);
    setShowGeometricModule(false);
    setShowSettingsPanel(false);
  }

  function goToReplayer() {
    if (hands.length === 0) return;
    setShowPublicHome(false);
  }

  function openFeedPost(post: PublicHandPost): boolean {
    const session = parseFeedPostForReplayer(post);
    if (!session) return false;
    const parsed = storedRecordToParsedHand(session.handRecord);
    if (!parsed) return false;

    const stableKey = handStableKey(parsed);
    setHands((prev) => {
      const withoutSame = prev.filter((hand) => handStableKey(hand) !== stableKey);
      return mergeParsedHandLists(withoutSame, [parsed]);
    });
    setSelectedHandId(parsed.id);
    setStepIndex(session.uiStepIndex);
    setDisplayUnit(session.displayUnit);
    setShowPublicHome(false);
    setShowMesMainsFullPage(false);
    setChipTick((tick) => tick + 1);
    return true;
  }

  function handleMonEspaceClick() {
    if (cloudLoading) return;
    if (hands.length > 0) {
      setShowMesMainsFullPage(true);
      return;
    }
    fileInputRef.current?.click();
  }

  function prevHand() {
    if (selectedHandIndex <= 0) return;
    loadHand(filteredHands[selectedHandIndex - 1].id);
  }

  function nextHand() {
    if (selectedHandIndex >= filteredHands.length - 1) return;
    loadHand(filteredHands[selectedHandIndex + 1].id);
  }

  function prevStep() {
    setStepIndex((value) => {
      const next = Math.max(value - 1, 0);
      if (next !== value) setChipTick((tick) => tick + 1);
      return next;
    });
  }

  function nextStep() {
    setStepIndex((value) => {
      const next = Math.min(value + 1, maxUiStepIndex);
      if (next !== value) setChipTick((tick) => tick + 1);
      return next;
    });
  }

  const mesMainsFiltersColumn = (
    <PhrHandFiltersPanel
      value={handFilters}
      onChange={(next) => {
        setHandFilters(next);
        setStepIndex(0);
      }}
      filteredCount={filteredHands.length}
    />
  );

  return (
    <main className={`flex h-screen flex-col overflow-hidden text-zinc-100 ${PHR_PAGE_BG}`}>
      {viewPublicHome && (
        <PhrAuthBar
          onMonEspaceClick={handleMonEspaceClick}
          onReplayerClick={hands.length > 0 ? goToReplayer : undefined}
        />
      )}
      {hands.length > 0 && showMesMainsFullPage && (
        <div
          data-phr-mes-mains-page
          className="fixed inset-0 z-[90] flex flex-col border border-white/10 bg-zinc-950/98 text-zinc-100 shadow-[0_0_0_1px_rgba(0,0,0,0.5)] backdrop-blur-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="phr-mon-espace-title"
        >
          <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 bg-black/20 px-4 py-3 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setShowMesMainsFullPage(false)}
              className={PHR_BTN_TOOL}
            >
              Fermer
            </button>
            <h1 id="phr-mon-espace-title" className="text-lg font-black tracking-tight text-zinc-50">
              Mon espace
            </h1>
            <div className="ml-auto flex min-w-[12rem] flex-1 flex-wrap items-center justify-end gap-2 sm:max-w-md">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500 sm:flex-none sm:min-w-[14rem]">
                Tournoi
                <select
                  value={selectedTournament}
                  onChange={(event) => {
                    setSelectedTournament(event.target.value);
                    setStepIndex(0);
                  }}
                  className={PHR_FIELD_SELECT_COMPACT}
                >
                  {tournamentOptions.map((option) => (
                    <option key={`mesmains-t-${option.key}`} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </header>
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(17rem,22rem)_1fr]">
            <aside className="max-h-[40vh] overflow-y-auto border-b border-white/10 bg-black/20 p-4 lg:max-h-none lg:border-b-0 lg:border-r lg:border-white/10">
              {mesMainsFiltersColumn}
            </aside>
            <div className="flex min-h-0 flex-col gap-2 p-4">
              <h2 className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">Toutes les mains filtrées</h2>
              {filteredHands.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-zinc-950/50 px-4 py-8 text-center text-sm text-zinc-500 backdrop-blur-sm">
                  Aucune main ne correspond à ces filtres.
                </p>
              ) : (
                <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto rounded-2xl border border-white/10 bg-black/25 py-1 backdrop-blur-sm">
                  {filteredHands.map((hand) => {
                    const active = hand.id === selectedHand.id;
                    return (
                      <li key={`mesmains-li-${hand.sourceFile ?? "local"}::${hand.id}`}>
                        <button
                          type="button"
                          onClick={() => {
                            loadHand(hand.id);
                            setShowMesMainsFullPage(false);
                          }}
                          className={`w-full px-3 py-2.5 text-left text-sm transition hover:bg-zinc-800/60 ${
                            active ? "bg-violet-600/20 text-violet-100" : "text-zinc-200"
                          }`}
                        >
                          <span className="block truncate font-medium">{mesMainsRowLabel(hand)}</span>
                          {hand.tournamentName && (
                            <span className="mt-0.5 block truncate text-[11px] text-zinc-500">{hand.tournamentName}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto flex min-h-0 w-full max-w-[1520px] flex-1 flex-col px-3 pb-3 pt-2 sm:px-5 sm:pb-4 sm:pt-3">
        <section className={PHR_APP_SHELL}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,text/plain"
            onChange={onImportFile}
            className="hidden"
            aria-hidden
          />
          {hands.length > 0 && !viewPublicHome && (
          <header className={`${PHR_REVIEW_TOPBAR} mb-2 flex flex-wrap items-center gap-2 sm:mb-3`}>
            <button
              type="button"
              onClick={goToPublicHome}
              title="Retour à l’accueil"
              className="min-w-0 max-w-[11rem] shrink-0 truncate text-left text-[11px] font-black tracking-tight text-zinc-500 transition hover:text-zinc-200 sm:max-w-[13rem] sm:text-sm"
            >
              SpotLab
            </button>
            <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowFilters(false);
                  setShowCalcToolsMenu(false);
                  setShowOddsModule(false);
                  setShowBountyModule(false);
                  setShowGeometricModule(false);
                  setShowMesMainsFullPage(true);
                }}
                className={showMesMainsFullPage ? PHR_MON_ESPACE_BTN_ACTIVE : PHR_MON_ESPACE_BTN}
              >
                Mon espace
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={PHR_TOOLBAR_BTN}
              >
                Importer fichiers
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCalcToolsMenu(false);
                  setShowFilters((v) => !v);
                }}
                className={`${PHR_TOOLBAR_BTN} ${
                  showFilters || phrFiltersAreActive(handFilters) ? PHR_TOOLBAR_BTN_ON_FILTERS : ""
                }`}
              >
                Filtres
              </button>
              <button
                type="button"
                aria-expanded={showCalcToolsMenu}
                aria-haspopup="menu"
                onClick={() => {
                  setShowFilters(false);
                  setShowCalcToolsMenu((v) => !v);
                }}
                className={`${PHR_TOOLBAR_BTN_CALC} ${
                  showOddsModule || showBountyModule || showGeometricModule || showCalcToolsMenu
                    ? PHR_TOOLBAR_BTN_ON_CALC
                    : ""
                }`}
              >
                <span className="text-sm font-bold leading-none">Outils de calculs</span>
                <span
                  className={`mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.08em] leading-none ${
                    showOddsModule || showBountyModule || showGeometricModule || showCalcToolsMenu
                      ? "text-amber-200/80"
                      : "text-zinc-500"
                  }`}
                >
                  Cotes · Bounty · Géo
                </span>
              </button>
              {showFilters && (
                <div className={`${PHR_POPOVER} max-h-[min(72vh,34rem)] overflow-y-auto`}>
                  <PhrHandFiltersPanel
                    value={handFilters}
                    onChange={(next) => {
                      setHandFilters(next);
                      setStepIndex(0);
                    }}
                    filteredCount={filteredHands.length}
                  />
                </div>
              )}
              {showOddsModule && (
                <div className={PHR_POPOVER}>
                  <div className={PHR_POPOVER_TITLE}>Calcul cote / outs / EV call</div>
                  <div className="grid gap-2">
                    <label className="flex flex-col gap-1 text-xs text-zinc-300">
                      Pot actuel
                      <input
                        value={oddsPotInput}
                        onChange={(event) => setOddsPotInput(event.target.value)}
                        inputMode="decimal"
                        className={PHR_FIELD_INPUT}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-zinc-300">
                      Montant a call
                      <input
                        value={oddsCallInput}
                        onChange={(event) => setOddsCallInput(event.target.value)}
                        inputMode="decimal"
                        className={PHR_FIELD_INPUT}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-zinc-300">
                      Outs
                      <input
                        value={oddsOutsInput}
                        onChange={(event) => setOddsOutsInput(event.target.value)}
                        inputMode="numeric"
                        className={PHR_FIELD_INPUT}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-zinc-300">
                      Street
                      <select
                        value={oddsStreet}
                        onChange={(event) => setOddsStreet(event.target.value as "FLOP" | "TURN")}
                        className={PHR_FIELD_INPUT}
                      >
                        <option value="FLOP">Flop (2 cartes a venir)</option>
                        <option value="TURN">Turn (1 carte a venir)</option>
                      </select>
                    </label>
                    <div className={PHR_FORM_RESULT}>
                      <p>Equite requise: {(requiredEquity * 100).toFixed(1)}%</p>
                      <p>Proba de hit: {(hitProbability * 100).toFixed(1)}%</p>
                      <p className={callIsPlusEv ? "text-emerald-300" : "text-rose-300"}>
                        EV call: {callEv >= 0 ? "+" : ""}
                        {callEv.toFixed(2)} ({callIsPlusEv ? "EV+" : "EV-"})
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {showBountyModule && (
                <div className={PHR_POPOVER}>
                  <div className={PHR_POPOVER_TITLE}>Calcul bounty PKO</div>
                  <div className="grid gap-2">
                    <label className="flex flex-col gap-1 text-xs text-zinc-300">
                      Bounty vilain (EUR)
                      <input
                        value={targetBountyInput}
                        onChange={(event) => setTargetBountyInput(event.target.value)}
                        inputMode="decimal"
                        className={PHR_FIELD_INPUT}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-zinc-300">
                      Buy-in tournoi (EUR)
                      <input
                        value={buyInInput}
                        onChange={(event) => setBuyInInput(event.target.value)}
                        inputMode="decimal"
                        className={PHR_FIELD_INPUT}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-zinc-300">
                      Stack de depart (jetons)
                      <input
                        value={startingStackInput}
                        onChange={(event) => setStartingStackInput(event.target.value)}
                        inputMode="decimal"
                        className={PHR_FIELD_INPUT}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-zinc-300">
                      BB actuelle (jetons)
                      <input
                        value={currentBbInput}
                        onChange={(event) => setCurrentBbInput(event.target.value)}
                        inputMode="decimal"
                        className={PHR_FIELD_INPUT}
                      />
                    </label>
                    <div className={PHR_FORM_RESULT}>
                      <p>Etape 1 (KO moyen / 2): {koMoyenDiv2.toFixed(2)}</p>
                      <p>Etape 2 ((Etape 1 / buy-in) * stack depart): {jetonsEquivalents.toFixed(0)} jetons</p>
                      <p className="text-emerald-300">
                        Etape 3 (Etape 2 / BB actuelle): {bountyBbEquivalent.toFixed(2)} BB
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {showGeometricModule && (
                <div className={PHR_POPOVER}>
                  <div className={PHR_POPOVER_TITLE}>Sizing geometrique</div>
                  <div className="grid gap-2">
                    <label className="flex flex-col gap-1 text-xs text-zinc-300">
                      Pot de depart
                      <input
                        value={geoPotInput}
                        onChange={(event) => setGeoPotInput(event.target.value)}
                        inputMode="decimal"
                        className={PHR_FIELD_INPUT}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-zinc-300">
                      Stack effectif a investir
                      <input
                        value={geoStackInput}
                        onChange={(event) => setGeoStackInput(event.target.value)}
                        inputMode="decimal"
                        className={PHR_FIELD_INPUT}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-zinc-300">
                      Streets restantes
                      <select
                        value={geoStreetsInput}
                        onChange={(event) => setGeoStreetsInput(event.target.value as "1" | "2" | "3")}
                        className={PHR_FIELD_SELECT}
                      >
                        <option value="1">1 street</option>
                        <option value="2">2 streets</option>
                        <option value="3">3 streets</option>
                      </select>
                    </label>
                    <div className={PHR_FORM_RESULT}>
                      <p>Sizing de base: {(geoRatio * 100).toFixed(1)}% pot</p>
                      {geoSizes[0] !== undefined && <p>Bet 1: {geoSizes[0].toFixed(2)}</p>}
                      {geoSizes[1] !== undefined && <p>Bet 2: {geoSizes[1].toFixed(2)}</p>}
                      {geoSizes[2] !== undefined && <p>Bet 3: {geoSizes[2].toFixed(2)}</p>}
                      <p className="text-zinc-400">Hypothese: vilain call chaque mise.</p>
                    </div>
                  </div>
                </div>
              )}
              {showCalcToolsMenu && (
                <div
                  className={`${PHR_POPOVER} z-[50] w-[min(100vw-2rem,20rem)] p-2`}
                  role="menu"
                  aria-label="Choisir un outil de calcul"
                >
                  <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                    Ouvrir un panneau
                  </p>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowCalcToolsMenu(false);
                        setShowBountyModule(false);
                        setShowGeometricModule(false);
                        setShowOddsModule(true);
                      }}
                      className={PHR_CALC_MENU_ITEM}
                    >
                      Cotes
                      <span className="mt-0.5 block text-[11px] font-normal text-zinc-500">
                        Outs, équité requise, EV call
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowCalcToolsMenu(false);
                        setShowOddsModule(false);
                        setShowGeometricModule(false);
                        setShowBountyModule(true);
                      }}
                      className={PHR_CALC_MENU_ITEM}
                    >
                      Bounty PKO
                      <span className="mt-0.5 block text-[11px] font-normal text-zinc-500">
                        Équivalent jetons / BB
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowCalcToolsMenu(false);
                        setShowOddsModule(false);
                        setShowBountyModule(false);
                        setShowGeometricModule(true);
                      }}
                      className={PHR_CALC_MENU_ITEM}
                    >
                      Géométrique
                      <span className="mt-0.5 block text-[11px] font-normal text-zinc-500">
                        Sizing % pot par street
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </header>
          )}
          {importError && (
            <p className="mb-2 rounded-xl border border-rose-500/25 bg-rose-950/25 px-3 py-2 text-xs text-rose-200 backdrop-blur-sm">
              {importError}
            </p>
          )}

          {hands.length > 0 && !viewPublicHome && (
            <div className={PHR_TOURNAMENT_RAIL}>
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="shrink-0 text-[9px] font-bold uppercase leading-none tracking-wide text-zinc-500">
                  Tournois
                </span>
                <div
                  className="flex min-h-0 min-w-0 gap-1 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:[scrollbar-width:thin] [&::-webkit-scrollbar]:h-0.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-600"
                  role="tablist"
                  aria-label="Filtrer par tournoi"
                >
                  {tournamentOptions.map((option) => {
                    const active = selectedTournament === option.key;
                    return (
                      <button
                        key={`tbar-${option.key}`}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => {
                          setSelectedTournament(option.key);
                          setStepIndex(0);
                        }}
                        title={option.label}
                        className={`max-w-[min(100%,12rem)] shrink-0 truncate rounded-full border px-2 py-0.5 text-left text-[11px] font-semibold leading-tight transition sm:max-w-[16rem] sm:py-1 ${
                          active
                            ? "border-violet-500/70 bg-violet-600/25 text-violet-100"
                            : "border-zinc-600/70 bg-zinc-800/60 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex shrink-0 items-center border-t border-zinc-700/60 pt-1 sm:border-l sm:border-t-0 sm:pl-2 sm:pt-0">
                <div className="flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-medium leading-tight text-zinc-300 backdrop-blur-sm">
                  <span className="whitespace-nowrap">
                    <span className="text-zinc-500">Blinds </span>
                    <span className="text-zinc-100">
                      {selectedHand.blinds.sb != null && selectedHand.blinds.bb != null
                        ? `${selectedHand.blinds.sb}/${selectedHand.blinds.bb}`
                        : "—"}
                    </span>
                  </span>
                  {selectedHand.levelLabel?.trim() ? (
                    <span className="max-w-[9rem] truncate text-zinc-500" title={selectedHand.levelLabel}>
                      {selectedHand.levelLabel.trim()}
                    </span>
                  ) : null}
                  <span className="whitespace-nowrap text-zinc-500">
                    Fmt <span className="text-zinc-200">{selectedHand.tournamentVariant ?? "VANILLA"}</span>
                  </span>
                  {phrFiltersAreActive(handFilters) && (
                    <span className="whitespace-nowrap text-zinc-500">
                      filtres <span className="text-zinc-200">{filteredHands.length}</span>/
                      {tournamentFilteredHands.length}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {hands.length > 0 && !viewPublicHome && allInTriggered && (
            <div className="mb-2 rounded-2xl border border-amber-400/25 bg-amber-950/20 px-3 py-2 text-xs shadow-inner backdrop-blur-sm">
              <p className="font-medium text-amber-200">Equite all-in</p>
              {equityByPlayer ? (
                <div className="mt-1 flex flex-wrap gap-2">
                  {Object.entries(equityByPlayer).map(([name, equity]) => (
                    <span
                      key={`equity-${name}`}
                      className="rounded-full border border-amber-300/40 bg-black/30 px-2 py-0.5 text-amber-100"
                    >
                      {name}: {equity.toFixed(1)}%
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-amber-100/90">
                  Equite dispo quand au moins 2 mains sont connues.
                </p>
              )}
            </div>
          )}

          {viewPublicHome ? (
            <PhrPublicHome
              welcomeDropActive={welcomeDropActive}
              onImportClick={() => fileInputRef.current?.click()}
              onOpenPost={openFeedPost}
              onDragOver={onWelcomeDragOver}
              onDragLeave={onWelcomeDragLeave}
              onDrop={onWelcomeDrop}
              cloudLoading={cloudLoading}
              cloudLoadError={cloudLoadError}
              importError={importError}
            />
          ) : (
          <div className={PHR_TABLE_FRAME}>
            <div className="absolute inset-4 rounded-[999px] border-[6px] border-white/18 bg-[radial-gradient(circle_at_50%_45%,rgba(61,110,52,0.95),rgba(32,62,29,0.96))] shadow-[inset_0_0_70px_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(255,255,255,0.04)]" />
            <button
              type="button"
              onClick={() => setDisplayUnit((u) => (u === "bb" ? "chips" : "bb"))}
              title={displayUnit === "bb" ? "Passer en jetons" : "Passer en BB"}
              className="absolute bottom-2 right-2 z-[45] rounded-full border border-white/12 bg-gradient-to-b from-zinc-700/50 to-zinc-950/90 px-3 py-2 text-xs font-bold text-zinc-100 shadow-[0_4px_20px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition hover:border-white/20 sm:bottom-3 sm:right-3 sm:px-3.5 sm:py-2.5 sm:text-sm"
            >
              {displayUnit === "bb" ? "BB ◎" : "Jetons ◉"}
            </button>
            {chipAnimation && !sweepAnimation && (
              <div
                key={chipAnimation.key}
                className="pointer-events-none absolute z-20 text-lg font-black tracking-wide text-zinc-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)]"
                style={
                  {
                    left: `${chipAnimation.startX}%`,
                    top: `${chipAnimation.startY}%`,
                    "--chip-start-x": `${chipAnimation.startX}%`,
                    "--chip-start-y": `${chipAnimation.startY}%`,
                    "--chip-end-x": `${chipAnimation.endX}%`,
                    "--chip-end-y": `${chipAnimation.endY}%`,
                    animation: "chip-to-pot 700ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
                    transform: "translate(-50%, -50%)",
                  } as CSSProperties
                }
              >
                {displayUnit === "bb"
                  ? (chipAnimation.amount / bbValue).toFixed(1)
                  : chipAnimation.amount.toFixed(1)}
              </div>
            )}
            {potWinAnimation && (
              <div
                key={potWinAnimation.key}
                className="pointer-events-none absolute z-30 text-2xl font-black tracking-wide text-zinc-100 drop-shadow-[0_3px_8px_rgba(0,0,0,0.8)]"
                style={
                  {
                    left: "50%",
                    top: `${potAnchor.y}%`,
                    "--pot-start-x": "50%",
                    "--pot-start-y": `${potAnchor.y}%`,
                    "--pot-end-x": `${potWinAnimation.endX}%`,
                    "--pot-end-y": `${potWinAnimation.endY}%`,
                    animation: "pot-to-winner 1250ms cubic-bezier(0.15, 0.85, 0.2, 1) forwards",
                    transform: "translate(-50%, -50%)",
                  } as CSSProperties
                }
              >
                POT{" "}
                {displayUnit === "bb"
                  ? `${(potWinAnimation.amount / bbValue).toFixed(1)} BB`
                  : `${potWinAnimation.amount.toFixed(1)}`}
              </div>
            )}
            {Object.entries(pendingNow.pendingByPlayer).map(([playerName, amount]) => {
              const seat = seatLayout[playerName];
              if (!seat) return null;
              const isPreflop = (currentStep?.action.street ?? "preflop") === "preflop";
              if (isPreflop && initialBlindByPlayer[playerName] !== undefined) return null;
              const stop = getBetStopPoint(playerName, seat);
              const x = stop.x;
              const y = stop.y;
              return (
                <div
                  key={`pending-${playerName}`}
                  className="pointer-events-none absolute z-10 text-lg font-black tracking-wide text-zinc-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)]"
                  style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
                >
                  {displayUnit === "bb" ? (amount / bbValue).toFixed(1) : amount.toFixed(1)}
                </div>
              );
            })}
            {(clampedStepIndex === 0 || currentStep?.action.street === "preflop") &&
              initialBlindChips.map((chip) => {
                const seat = seatLayout[chip.player];
                if (!seat) return null;
                const isHeroBlind = chip.player === selectedHand.heroName;
                const playerWeight = isHeroBlind ? 0.46 : 0.64;
                const centerWeight = 1 - playerWeight;
                const x = seat.x * playerWeight + 50 * centerWeight;
                const y = seat.y * playerWeight + (isHeroBlind ? 50 : 54) * centerWeight;
                const isPreflop = (currentStep?.action.street ?? "preflop") === "preflop";
                const addedPreflop = isPreflop ? (pendingNow.pendingByPlayer[chip.player] ?? 0) : 0;
                const displayedAmount = chip.amount + addedPreflop;
                return (
                  <div
                    key={`initial-blind-${chip.player}`}
                    className="pointer-events-none absolute z-10 text-xl font-black tracking-wide text-zinc-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)]"
                    style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
                  >
                    {displayUnit === "bb"
                      ? (displayedAmount / bbValue).toFixed(1)
                      : displayedAmount.toFixed(1)}
                  </div>
                );
              })}
            {sweepAnimation && !potWinAnimation &&
              sweepAnimation.entries.map((entry) => (
                <div
                  key={`${sweepAnimation.key}-${entry.player}`}
                  className="pointer-events-none absolute z-20 text-lg font-black tracking-wide text-zinc-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)]"
                  style={
                    {
                      left: `${entry.x}%`,
                      top: `${entry.y}%`,
                      "--chip-start-x": `${entry.x}%`,
                      "--chip-start-y": `${entry.y}%`,
                      "--chip-end-x": `${potAnchor.x}%`,
                      "--chip-end-y": `${potAnchor.y}%`,
                      animation: "chip-to-pot 520ms ease-in forwards",
                      transform: "translate(-50%, -50%)",
                    } as CSSProperties
                  }
                >
                  {displayUnit === "bb" ? (entry.amount / bbValue).toFixed(1) : entry.amount.toFixed(1)}
                </div>
              ))}

            <div className="absolute left-1/2 top-[49%] -translate-x-1/2 -translate-y-1/2">
              <div className="flex items-center gap-4">
                {visibleBoard.length > 0 ? (
                  visibleBoard.map((card) => <Card key={`board-${card}`} card={card} size="lg" />)
                ) : (
                  <span className="h-[5.5rem] w-[20rem]" />
                )}
              </div>
            </div>
            {!potWinAnimation && hands.length > 0 && (
              <div className="absolute left-1/2 top-[32%] -translate-x-1/2 -translate-y-1/2 text-xl font-black tracking-wide text-zinc-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]">
                Pot {formatAmount(currentPot)}
              </div>
            )}
            {dealerSeat && (
              <div
                className="pointer-events-none absolute z-10 rounded-full border border-zinc-200/90 bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-900 shadow transition-all duration-500"
                style={{
                  left: `${dealerSeat.x + 9}%`,
                  top: `${dealerSeat.y - 6}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                D
              </div>
            )}

            {selectedHand.players.map((player) => {
              const seatInfo = seatLayout[player.name];
              if (!seatInfo) return null;
              const isActive = player.name === activePlayer;
              const isFolded = foldedPlayers.has(player.name);
              const lastAction = lastActionByPlayer[player.name];
              const cards = selectedHand.holeCardsByPlayer[player.name] ?? [];
              const isHero = player.name === selectedHand.heroName;
              return (
                <div
                  key={`${selectedHand.id}-${player.name}`}
                  style={{ left: `${seatInfo.x}%`, top: `${seatInfo.y}%`, transform: "translate(-50%, -50%)" }}
                  className={`absolute min-w-[108px] text-xs transition ${isFolded ? "opacity-55" : ""}`}
                >
                  <div className="relative mb-1 flex justify-center gap-1">
                    {cards.length > 0 ? (
                      cards.map((card, index) => (
                        <span
                          key={`${player.name}-${card}`}
                          className={
                            isHero
                              ? index === 0
                                ? "origin-bottom-right rotate-[-9deg] translate-x-0.5"
                                : "origin-bottom-left rotate-[9deg] -translate-x-0.5 -ml-7"
                              : ""
                          }
                        >
                          <Card card={card} size={isHero ? "hero" : "md"} />
                        </span>
                      ))
                    ) : (
                      <>
                        <span className={isHero ? "origin-bottom-right rotate-[-9deg] translate-x-0.5" : ""}>
                          <BackCard size={isHero ? "hero" : "md"} />
                        </span>
                        <span
                          className={
                            isHero
                              ? "-ml-8 origin-bottom-left rotate-[9deg] -translate-x-0.5"
                              : "-ml-2"
                          }
                        >
                          <BackCard size={isHero ? "hero" : "md"} />
                        </span>
                      </>
                    )}
                    {typeof player.bounty === "number" && (
                      <span className="absolute -right-3 -top-2 inline-flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-amber-200/90 bg-amber-400 px-2 text-[10px] font-black text-zinc-900 shadow-md">
                        {player.bounty.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div
                    className={`mx-auto w-fit rounded-2xl border px-2.5 py-1.5 text-center shadow-md backdrop-blur-sm ${
                      isActive
                        ? "border-cyan-400/50 bg-cyan-950/35 ring-1 ring-cyan-400/25"
                        : "border-white/10 bg-zinc-900/75"
                    }`}
                  >
                    <p className="font-semibold text-zinc-100">{player.name}</p>
                    {player.name === selectedHand.heroName && (
                      <p className="text-[10px] uppercase tracking-wide text-emerald-300">Hero</p>
                    )}
                    <p className="text-base font-black text-zinc-100">
                      {formatAmount(currentStacks[player.name] ?? player.stack)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          )}
          {hands.length > 0 && !viewPublicHome && (
          <div className="mt-3 border-t border-white/10 bg-black/15 pt-3 backdrop-blur-sm">
            <div className="mx-auto flex w-fit max-w-full flex-col items-center gap-2 px-1">
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={prevHand}
                  disabled={selectedHandIndex <= 0}
                  title="Main precedente"
                  className={PHR_TRANSPORT_BTN}
                >
                  ⏮
                </button>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={prevStep}
                    title="Etape precedente"
                    className={PHR_TRANSPORT_BTN}
                  >
                    ◀
                  </button>
                  <span className={`${PHR_TRANSPORT_READOUT}${blurHandActions ? " blur-sm" : ""}`}>
                    {`${clampedStepIndex + 1} / ${maxUiStepIndex + 1}`}
                  </span>
                  <button
                    type="button"
                    onClick={nextStep}
                    title="Etape suivante"
                    className={PHR_TRANSPORT_BTN}
                  >
                    ▶
                  </button>
                </div>
                <button
                  type="button"
                  onClick={nextHand}
                  disabled={selectedHandIndex >= filteredHands.length - 1}
                  title="Main suivante"
                  className={PHR_TRANSPORT_BTN}
                >
                  ⏭
                </button>
              </div>
              <span className="text-[11px] font-semibold tabular-nums text-zinc-500">
                {`Main ${Math.max(selectedHandIndex + 1, 1)} / ${Math.max(filteredHands.length, 1)}`}
              </span>
            </div>
          </div>
          )}
          <style jsx>{`
            @keyframes chip-to-pot {
              from {
                left: var(--chip-start-x);
                top: var(--chip-start-y);
                opacity: 0.95;
                transform: translate(-50%, -50%) scale(1);
              }
              70% {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1.05);
              }
              to {
                left: var(--chip-end-x);
                top: var(--chip-end-y);
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.85);
              }
            }
            @keyframes pot-to-winner {
              from {
                left: var(--pot-start-x);
                top: var(--pot-start-y);
                opacity: 1;
                transform: translate(-50%, -50%) scale(1.12);
              }
              38% {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1.2);
              }
              85% {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1.08);
              }
              to {
                left: var(--pot-end-x);
                top: var(--pot-end-y);
                opacity: 0;
                transform: translate(-50%, -50%) scale(1.08);
              }
            }
          `}</style>
        </section>
      </div>

      {hands.length > 0 && !viewPublicHome && (
        <div className="pointer-events-none fixed bottom-4 left-3 z-[70] flex flex-col gap-2 sm:bottom-5 sm:left-5">
          <button
            type="button"
            onClick={() => {
              if (!user) {
                setShareToast("Connecte-toi pour publier un spot.");
                window.setTimeout(() => setShareToast(null), 2800);
                return;
              }
              setSpotPublishContext(captureSpotReplayContext());
              setShowPublishSpotModal(true);
            }}
            title="Publier le spot affiché sur le replayer"
            className="pointer-events-auto inline-flex h-11 items-center justify-center gap-2 rounded-full border border-violet-500/45 bg-violet-600/30 px-4 text-xs font-bold text-violet-100 shadow-[0_4px_24px_rgba(139,92,246,0.28)] backdrop-blur-md transition hover:border-violet-400/55 hover:bg-violet-600/40 active:scale-[0.98]"
          >
            <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Publier le spot
          </button>
          <button
            type="button"
            onClick={() => setBlurHandActions((value) => !value)}
            title={blurHandActions ? "Afficher les actions de la main" : "Flouter les actions de la main"}
            aria-pressed={blurHandActions}
            className={`pointer-events-auto ${blurHandActions ? PHR_DOCK_TILE_ACTIVE : PHR_DOCK_TILE}`}
          >
            {blurHandActions ? (
              <svg className={PHR_DOCK_ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M3 3l18 18" />
                <path d="M10.6 10.6a3 3 0 0 0 4.24 4.24" />
                <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c5 0 9.27 3.11 11 7a11.76 11.76 0 0 1-4.04 4.83" />
                <path d="M6.61 6.61A11.81 11.81 0 0 0 1 12a11.8 11.8 0 0 0 8.32 6.65" />
              </svg>
            ) : (
              <svg className={PHR_DOCK_ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
            <span className="sr-only">Flouter les actions</span>
          </button>
        </div>
      )}
      {!viewPublicHome && (
      <div className="pointer-events-none fixed inset-x-3 bottom-4 z-[70] flex flex-col items-end gap-2 pr-4 sm:inset-x-5 sm:bottom-5 sm:pr-7">
        {shareToast ? (
          <p className="pointer-events-none max-w-[min(100%,20rem)] rounded-xl border border-white/[0.09] bg-zinc-900/70 px-3 py-2 text-right text-xs font-medium text-zinc-100 shadow-[0_4px_24px_rgba(0,0,0,0.12)] backdrop-blur-md">
            {shareToast}
          </p>
        ) : null}
        {showSettingsPanel ? (
          <div
            className="pointer-events-auto w-[min(calc(100vw-2rem),18rem)] rounded-2xl border border-white/[0.1] bg-zinc-900/80 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.2)] backdrop-blur-xl"
            role="dialog"
            aria-labelledby="phr-settings-title"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="phr-settings-title" className="text-sm font-bold text-zinc-50">
                Paramètres
              </h2>
              <button
                type="button"
                onClick={() => setShowSettingsPanel(false)}
                className="rounded-lg border border-white/[0.1] bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.1]"
              >
                Fermer
              </button>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 transition hover:border-white/[0.12]">
              <span className="text-sm text-zinc-200">Sons des actions</span>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-500 accent-emerald-500"
              />
            </label>
            <PhrAccountSettingsCard />
          </div>
        ) : null}
        <nav className={PHR_DOCK_POD} aria-label="Raccourcis et paramètres">
          {hands.length > 0 && (
            <>
              <a
                href={discordInviteHref}
                target="_blank"
                rel="noopener noreferrer"
                title="Discord — communauté"
                className={PHR_DOCK_TILE}
              >
                <svg className={PHR_DOCK_ICON} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.105 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.876 19.876 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                <span className="sr-only">Discord</span>
              </a>
              <button
                type="button"
                onClick={() => void publishCurrentHandToFeed()}
                disabled={selectedHand.id === "__empty__"}
                title="Publier sur le fil public SpotLab"
                className={PHR_DOCK_TILE}
              >
                <svg
                  className={PHR_DOCK_ICON}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span className="sr-only">Publier sur le fil</span>
              </button>
              <button
                type="button"
                onClick={() => void shareCurrentHand()}
                disabled={selectedHand.id === "__empty__"}
                title="Partager la main (copie ou menu natif)"
                className={PHR_DOCK_TILE}
              >
                <svg
                  className={PHR_DOCK_ICON}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" x2="12" y1="2" y2="15" />
                </svg>
                <span className="sr-only">Partager la main</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowSettingsPanel((v) => !v)}
            title={showSettingsPanel ? "Fermer les paramètres" : "Paramètres"}
            aria-expanded={showSettingsPanel}
            className={showSettingsPanel ? PHR_DOCK_TILE_ACTIVE : PHR_DOCK_TILE}
          >
            <svg
              className={PHR_DOCK_ICON}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span className="sr-only">Paramètres</span>
          </button>
        </nav>
      </div>
      )}
      {showPublishSpotModal && user && spotPublishContext && (
        <PhrPublishSpotModal
          open={showPublishSpotModal}
          onClose={() => {
            setShowPublishSpotModal(false);
            setSpotPublishContext(null);
          }}
          replay={spotPublishContext}
          authorUid={user.uid}
          authorPseudo={pseudo?.trim() || user.email?.split("@")[0] || "Joueur"}
          onPublished={(vis) => {
            setShareToast(vis === "public" ? "Spot publié sur le fil." : "Spot enregistré en privé.");
            window.setTimeout(() => setShareToast(null), 2800);
            setSpotPublishContext(null);
          }}
        />
      )}
    </main>
  );
}
