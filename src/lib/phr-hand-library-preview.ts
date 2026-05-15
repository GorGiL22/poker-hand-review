import type { PhrHandFilterShape } from "@/lib/phr-hand-filter-meta";
import { handHeroResultLabel } from "@/lib/phr-hand-filter-meta";

export type HandLibraryData = PhrHandFilterShape & {
  holeCardsByPlayer?: Record<string, string[]>;
  board?: { flop: string[]; turn?: string[]; river?: string[] };
  blinds?: { sb?: number; bb?: number };
  levelLabel?: string;
};

export type HandLibraryPreview = {
  heroCards: string[];
  villainCards: string[];
  villainName: string | null;
  flop: string[];
  turn: string[];
  river: string[];
  blindsLabel: string;
  resultLabel: string;
  resultTone: "win" | "loss" | "neutral";
};

function readCards(cards: string[] | undefined): string[] {
  if (!cards) return [];
  return cards.filter((c) => typeof c === "string" && c.length >= 2);
}

function pickVillain(hand: HandLibraryData): { name: string; cards: string[] } | null {
  const hero = hand.heroName;
  const hole = hand.holeCardsByPlayer ?? {};
  let best: { name: string; cards: string[] } | null = null;
  for (const [name, raw] of Object.entries(hole)) {
    if (hero && name === hero) continue;
    const cards = readCards(raw).slice(0, 2);
    if (cards.length === 0) continue;
    if (!best || cards.length > best.cards.length) best = { name, cards };
  }
  return best;
}

function splitBoard(hand: HandLibraryData): { flop: string[]; turn: string[]; river: string[] } {
  const flop = readCards(hand.board?.flop).slice(0, 3);
  const turnLine = readCards(hand.board?.turn);
  const riverLine = readCards(hand.board?.river);

  const turn = turnLine.length >= 4 ? turnLine.slice(3, 4) : turnLine.length === 1 ? turnLine : [];
  const river =
    riverLine.length >= 5 ? riverLine.slice(4, 5) : riverLine.length === 1 ? riverLine : [];

  return { flop, turn, river };
}

function formatBlinds(hand: HandLibraryData): string {
  const { sb, bb } = hand.blinds ?? {};
  if (sb != null && bb != null) return `${sb}/${bb}`;
  if (bb != null) return `${bb} BB`;
  if (hand.levelLabel?.trim()) return hand.levelLabel.trim();
  return "—";
}

export function getHandLibraryPreview(hand: HandLibraryData): HandLibraryPreview {
  const hero = hand.heroName;
  const heroCards = hero && hand.holeCardsByPlayer?.[hero] ? readCards(hand.holeCardsByPlayer[hero]).slice(0, 2) : [];
  const villain = pickVillain(hand);
  const board = splitBoard(hand);
  const resultLabel = handHeroResultLabel(hand);
  const resultTone: HandLibraryPreview["resultTone"] =
    resultLabel === "Gagné" ? "win" : resultLabel === "Perdu" ? "loss" : "neutral";

  return {
    heroCards,
    villainCards: villain?.cards ?? [],
    villainName: villain?.name ?? null,
    flop: board.flop,
    turn: board.turn,
    river: board.river,
    blindsLabel: formatBlinds(hand),
    resultLabel,
    resultTone,
  };
}
