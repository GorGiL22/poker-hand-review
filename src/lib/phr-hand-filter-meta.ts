/**
 * Métadonnées et logique de filtrage multi-critères pour le replayer (OR intra-groupe, AND inter-groupes).
 */

export const HERO_PREFLOP_IDS = ["OPEN", "3BET", "4BET", "CALL", "ALL-IN"] as const;
export const HERO_POSTFLOP_IDS = ["C-BET", "BET", "CHECK", "FOLD"] as const;
export const POSITION_IDS = ["BTN", "SB", "BB", "CO", "UTG"] as const;
export const RESULT_IDS = ["GAIN", "PERTE"] as const;
export const BOARD_TEXTURE_IDS = ["DRY", "WET", "MONOTONE", "PAIRED"] as const;

export type HeroPreflopId = (typeof HERO_PREFLOP_IDS)[number];
export type HeroPostflopId = (typeof HERO_POSTFLOP_IDS)[number];
export type PositionId = (typeof POSITION_IDS)[number];
export type ResultId = (typeof RESULT_IDS)[number];
export type BoardTextureId = (typeof BOARD_TEXTURE_IDS)[number];

export type PhrHandFilterShape = {
  heroName?: string;
  players: { name: string; position: string }[];
  actions: {
    preflop: { actor: string; type: string; raw: string; amount?: number }[];
    flop: { actor: string; type: string; raw: string; amount?: number }[];
    turn: { actor: string; type: string; raw: string; amount?: number }[];
    river: { actor: string; type: string; raw: string; amount?: number }[];
  };
  board: { flop: string[] };
};

type Street = "preflop" | "flop" | "turn" | "river";

const STREETS: Street[] = ["preflop", "flop", "turn", "river"];

function isAggressive(t: string): boolean {
  return t === "raise" || t === "bet" || t === "all-in";
}

function rawAllIn(raw: string): boolean {
  return raw.toLowerCase().includes("all-in");
}

/** Regroupe MP / HJ / EP sur UTG pour coller aux 5 boutons UI. */
export function coarsePositionLabel(positionRaw: string): PositionId | null {
  const p = positionRaw.toUpperCase();
  if (p.includes("BTN") || p.includes("BUTTON")) return "BTN";
  if (p.includes("SB") && !p.includes("BB")) return "SB";
  if (p.includes("BB")) return "BB";
  if (p.includes("CO")) return "CO";
  if (p.includes("UTG") || p.includes("EP") || p.includes("LJ") || p.includes("MP") || p.includes("HJ"))
    return "UTG";
  return null;
}

function playerPositions(hand: PhrHandFilterShape): Record<string, string> {
  return Object.fromEntries(hand.players.map((pl) => [pl.name, pl.position]));
}

function lastPreflopAggressor(hand: PhrHandFilterShape): string | null {
  let last: string | null = null;
  for (const a of hand.actions.preflop) {
    if (isAggressive(a.type) || rawAllIn(a.raw)) last = a.actor;
  }
  return last;
}

function heroCollectedNet(hand: PhrHandFilterShape): "GAIN" | "PERTE" | "UNKNOWN" {
  const hero = hand.heroName;
  if (!hero) return "UNKNOWN";
  let win = 0;
  for (const s of STREETS) {
    for (const a of hand.actions[s]) {
      if (a.actor !== hero) continue;
      const r = a.raw.toLowerCase();
      if (r.includes("collected") || r.includes("wins") || r.includes("won") || r.includes("gagne")) {
        win += a.amount ?? 0;
      }
    }
  }
  if (win > 0) return "GAIN";
  for (const s of STREETS) {
    for (const a of hand.actions[s]) {
      if (a.actor === hero && a.type === "fold") return "PERTE";
    }
  }
  return "UNKNOWN";
}

function cardRank(card: string): number {
  const t = card.trim().toUpperCase();
  const r = t.startsWith("10") ? "T" : t[0];
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
  return map[r] ?? 0;
}

function cardSuit(card: string): string {
  const t = card.trim().toLowerCase();
  return t.slice(-1);
}

function flopTextureTags(flop: string[]): Set<BoardTextureId> {
  const tags = new Set<BoardTextureId>();
  if (flop.length < 3) return tags;
  const ranks = flop.map(cardRank).filter((r) => r > 0);
  if (ranks.length < 3) return tags;
  const suits = flop.map(cardSuit);
  const uniqR = new Set(ranks);
  if (uniqR.size < 3) tags.add("PAIRED");
  if (suits[0] === suits[1] && suits[1] === suits[2]) tags.add("MONOTONE");

  const hi = Math.max(...ranks);
  const lo = Math.min(...ranks);
  const span = hi - lo;
  const suitCounts = suits.reduce<Record<string, number>>((acc, s) => {
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  const maxSuit = Math.max(...Object.values(suitCounts));
  const twoSuited = maxSuit >= 2;
  const straighty = span <= 4 && uniqR.size === 3;
  if (twoSuited || straighty) tags.add("WET");
  if (!tags.has("WET")) tags.add("DRY");
  return tags;
}

/** Dernier agresseur avant l’action du hero (open / 3bet / etc.). */
function vsPositionFromPreflop(hand: PhrHandFilterShape, hero: string): string | null {
  const positions = playerPositions(hand);
  let lastOtherAggressor: string | null = null;
  for (const a of hand.actions.preflop) {
    const agg = isAggressive(a.type) || rawAllIn(a.raw);
    if (!agg) continue;
    if (a.actor !== hero) lastOtherAggressor = a.actor;
    else if (lastOtherAggressor) return positions[lastOtherAggressor] ?? null;
  }
  return null;
}

export function computeHandFilterTags(hand: PhrHandFilterShape): {
  heroPreflop: Set<HeroPreflopId>;
  heroPostflop: Set<HeroPostflopId>;
  heroPosition: Set<PositionId>;
  villainPosition: Set<PositionId>;
  result: Set<ResultId>;
  boardTexture: Set<BoardTextureId>;
} {
  const heroPreflop = new Set<HeroPreflopId>();
  const heroPostflop = new Set<HeroPostflopId>();
  const heroPosition = new Set<PositionId>();
  const villainPosition = new Set<PositionId>();
  const result = new Set<ResultId>();
  const boardTexture = new Set<BoardTextureId>();

  const hero = hand.heroName;
  const positions = playerPositions(hand);
  if (hero) {
    const hp = coarsePositionLabel(positions[hero] ?? "");
    if (hp) heroPosition.add(hp);
  }

  const vsRaw = hero ? vsPositionFromPreflop(hand, hero) : null;
  const vsCoarse = vsRaw ? coarsePositionLabel(vsRaw) : null;
  if (vsCoarse) villainPosition.add(vsCoarse);

  const net = heroCollectedNet(hand);
  if (net === "GAIN" || net === "PERTE") result.add(net);

  flopTextureTags(hand.board.flop ?? []).forEach((t) => boardTexture.add(t));

  if (!hero) {
    return { heroPreflop, heroPostflop, heroPosition, villainPosition, result, boardTexture };
  }

  const pre = hand.actions.preflop;
  let raisesBeforeHero = 0;
  let seenHeroAggression = false;
  for (const a of pre) {
    const agg = isAggressive(a.type) || rawAllIn(a.raw);
    if (agg && a.actor !== hero) raisesBeforeHero += 1;
    if (agg && a.actor === hero) {
      seenHeroAggression = true;
      if (rawAllIn(a.raw) || a.type === "all-in") heroPreflop.add("ALL-IN");
      if (raisesBeforeHero === 0) heroPreflop.add("OPEN");
      else if (raisesBeforeHero === 1) heroPreflop.add("3BET");
      else heroPreflop.add("4BET");
      break;
    }
    if (a.actor === hero && a.type === "call") {
      heroPreflop.add("CALL");
      break;
    }
  }
  if (!seenHeroAggression) {
    for (const a of pre) {
      if (a.actor === hero && a.type === "call") {
        heroPreflop.add("CALL");
        break;
      }
    }
  }
  for (const a of pre) {
    if (a.actor === hero && (rawAllIn(a.raw) || a.type === "all-in")) heroPreflop.add("ALL-IN");
  }

  const pfr = lastPreflopAggressor(hand) === hero;
  const postStreets: Street[] = ["flop", "turn", "river"];
  let sawFlop = hand.actions.flop.length > 0 || (hand.board.flop?.length ?? 0) >= 3;
  if (!sawFlop) {
    return { heroPreflop, heroPostflop, heroPosition, villainPosition, result, boardTexture };
  }

  let firstFlopAggDone = false;
  for (const a of hand.actions.flop) {
    if (a.type === "fold" && a.actor === hero) heroPostflop.add("FOLD");
    if (a.type === "check" && a.actor === hero) heroPostflop.add("CHECK");
    const flopAgg = a.type === "bet" || a.type === "raise" || a.type === "all-in";
    if (flopAgg && a.actor === hero) heroPostflop.add("BET");
    if (flopAgg && !firstFlopAggDone) {
      firstFlopAggDone = true;
      if (a.actor === hero && pfr) heroPostflop.add("C-BET");
    }
  }

  for (const s of ["turn", "river"] as const) {
    for (const a of hand.actions[s]) {
      if (a.actor !== hero) continue;
      if (a.type === "fold") heroPostflop.add("FOLD");
      if (a.type === "check") heroPostflop.add("CHECK");
      if (a.type === "bet" || a.type === "raise" || a.type === "all-in") heroPostflop.add("BET");
    }
  }

  return { heroPreflop, heroPostflop, heroPosition, villainPosition, result, boardTexture };
}

function matchesGroup<T extends string>(selected: readonly T[], tags: Set<T>): boolean {
  if (selected.length === 0) return true;
  return selected.some((id) => tags.has(id));
}

export type PhrHandFilterSelection = {
  heroPreflop: HeroPreflopId[];
  heroPostflop: HeroPostflopId[];
  heroPosition: PositionId[];
  villainPosition: PositionId[];
  result: ResultId[];
  boardTexture: BoardTextureId[];
};

export const EMPTY_PHR_HAND_FILTER_SELECTION: PhrHandFilterSelection = {
  heroPreflop: [],
  heroPostflop: [],
  heroPosition: [],
  villainPosition: [],
  result: [],
  boardTexture: [],
};

export function handMatchesPhrFilters(hand: PhrHandFilterShape, sel: PhrHandFilterSelection): boolean {
  const tags = computeHandFilterTags(hand);
  return (
    matchesGroup(sel.heroPreflop, tags.heroPreflop) &&
    matchesGroup(sel.heroPostflop, tags.heroPostflop) &&
    matchesGroup(sel.heroPosition, tags.heroPosition) &&
    matchesGroup(sel.villainPosition, tags.villainPosition) &&
    matchesGroup(sel.result, tags.result) &&
    matchesGroup(sel.boardTexture, tags.boardTexture)
  );
}

export function phrFiltersAreActive(sel: PhrHandFilterSelection): boolean {
  return (
    sel.heroPreflop.length > 0 ||
    sel.heroPostflop.length > 0 ||
    sel.heroPosition.length > 0 ||
    sel.villainPosition.length > 0 ||
    sel.result.length > 0 ||
    sel.boardTexture.length > 0
  );
}
