/** Métadonnées tournoi dérivées des mains importées (Mon espace). */

export type TournamentLibraryHand = {
  tournamentName?: string;
  sourceFile?: string;
  dateTime?: string;
  buyInEuro?: number | null;
  platform?: string;
};

export type TournamentLibraryEntry = {
  key: string;
  name: string;
  handCount: number;
  /** YYYY-MM-DD pour tri / filtre date */
  dateIso: string | null;
  dateLabel: string | null;
  buyInEuro: number | null;
  platform: string;
};

const PLATFORM_LABELS: Record<string, string> = {
  winamax: "Winamax",
  betclic: "Betclic",
};

export function normalizePlatformLabel(raw?: string): string {
  if (!raw?.trim()) return "Autre";
  const lower = raw.trim().toLowerCase();
  if (lower.includes("winamax")) return "Winamax";
  if (lower.includes("betclic")) return "Betclic";
  return raw.trim();
}

export function inferPlatformFromSource(sourceFile?: string): string {
  if (!sourceFile) return "Autre";
  const lower = sourceFile.toLowerCase();
  if (lower.includes("winamax") || lower.includes("wina")) return "Winamax";
  if (lower.includes("betclic")) return "Betclic";
  return "Autre";
}

const MAX_REASONABLE_BUY_IN_EURO = 50_000;

function roundEuro(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseNumberToken(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Corrige l’encodage cassé du symbole € (ex. « 0.11â‚¬ »). */
export function normalizeEuroMojibake(text: string): string {
  return text
    .replace(/\u00e2\u0082\u00ac/g, "€")
    .replace(/â‚¬/g, "€")
    .replace(/â\x82¬/g, "€");
}

/**
 * Somme toutes les parts d’un buy-in Winamax.
 * Ex. « 0.11€ + 0.11€ + 0.03€ » → 0.25, « €9 + €1 » → 10.
 */
export function parseBuyInExpression(fragment: string): number | null {
  const normalized = normalizeEuroMojibake(fragment.trim());
  if (!normalized) return null;

  const parts = normalized.split(/\s*\+\s*/).filter(Boolean);
  if (parts.length === 0) return null;

  let total = 0;
  for (const part of parts) {
    const p = part.trim();
    const fromBeforeEuro = p.match(/^€\s*([\d.,]+)/i)?.[1];
    const fromAfterEuro = p.match(/^([\d.,]+)\s*€/i)?.[1];
    const bare = p.match(/^([\d.,]+)$/)?.[1];
    const token = fromBeforeEuro ?? fromAfterEuro ?? bare;
    const n = token ? parseNumberToken(token) : null;
    if (n == null) return null;
    total += n;
  }

  if (total > 0 && total <= MAX_REASONABLE_BUY_IN_EURO) return roundEuro(total);
  return null;
}

/** @deprecated Utiliser parseBuyInExpression */
function parseStakePlusFee(fragment: string): number | null {
  return parseBuyInExpression(fragment);
}

/** Parse un montant € depuis un fragment (ex. « 5€ », « €4,50 »). */
export function parseEuroAmount(text: string): number | null {
  const t = normalizeEuroMojibake(text);
  const after = t.match(/(\d+(?:[.,]\d+)?)\s*€/i);
  if (after) {
    const n = parseNumberToken(after[1]!);
    if (n != null && n <= MAX_REASONABLE_BUY_IN_EURO) return roundEuro(n);
  }
  const before = t.match(/€\s*(\d+(?:[.,]\d+)?)/i);
  if (before) {
    const n = parseNumberToken(before[1]!);
    if (n != null && n <= MAX_REASONABLE_BUY_IN_EURO) return roundEuro(n);
  }
  return null;
}

/**
 * Buy-in Winamax sur la 1ʳᵉ ligne de main.
 * Formats courants : `buyIn: €9 + €1`, `buyIn: 9€ + 1€`, `buyIn: 9 + 1`.
 */
export function parseWinamaxHeaderBuyIn(headerLine: string): number | null {
  const chunk =
    headerLine.match(/buyIn:\s*(.+?)(?:\s+level:|\s+HandId:)/i)?.[1] ??
    headerLine.match(/buyIn:\s*(.+)$/i)?.[1];
  if (chunk) {
    const fromChunk = parseBuyInExpression(chunk.trim());
    if (fromChunk != null) return fromChunk;
  }
  return parseEuroAmount(headerLine);
}

export type WinamaxTournamentSummaryMeta = {
  tournamentName: string;
  tournamentId: string | null;
  buyInEuro: number | null;
};

export function extractTournamentIdFromLabel(label: string): string | null {
  const m = label.match(/\((\d+)\)/);
  return m?.[1] ?? null;
}

export function normalizeTournamentBaseName(label: string): string {
  return label.replace(/\s*\(\d+\)\s*$/, "").trim();
}

export function isWinamaxTournamentSummaryText(rawText: string, sourceFile?: string): boolean {
  if (sourceFile?.toLowerCase().includes("_summary")) return true;
  return /Winamax Poker\s*-\s*Tournament summary/i.test(rawText);
}

/** Fichier `*_summary.txt` Winamax (buy-in tournoi, nom, etc.). */
export function parseWinamaxTournamentSummary(rawText: string): WinamaxTournamentSummaryMeta | null {
  if (!isWinamaxTournamentSummaryText(rawText)) return null;

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => normalizeEuroMojibake(line.trim()))
    .filter(Boolean);

  const header = lines[0] ?? "";
  const nameMatch = header.match(/Tournament summary\s*:\s*(.+?)(?:\s*-\s*|$)/i);
  const tournamentName = nameMatch?.[1]?.trim() ?? "";
  if (!tournamentName) return null;

  const tournamentId = extractTournamentIdFromLabel(tournamentName);

  let buyInEuro: number | null = null;
  for (const line of lines) {
    if (!/buy[\s-]?in\s*:/i.test(line)) continue;
    const valuePart = line.split(":").slice(1).join(":").trim();
    buyInEuro = parseBuyInExpression(valuePart);
    break;
  }

  return { tournamentName, tournamentId, buyInEuro };
}

/** Applique le buy-in du summary à toutes les mains du même tournoi (ID ou nom). */
export function applyWinamaxSummaryBuyIns<T extends TournamentLibraryHand>(
  hands: T[],
  summaries: WinamaxTournamentSummaryMeta[],
): T[] {
  if (summaries.length === 0) return hands;

  const byId = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const summary of summaries) {
    if (summary.buyInEuro == null) continue;
    if (summary.tournamentId) byId.set(summary.tournamentId, summary.buyInEuro);
    byName.set(normalizeTournamentBaseName(summary.tournamentName), summary.buyInEuro);
  }

  return hands.map((hand) => {
    const fileId = extractTournamentIdFromLabel(hand.sourceFile ?? "");
    const nameId = extractTournamentIdFromLabel(hand.tournamentName ?? "");
    const summaryBuyIn =
      (fileId && byId.get(fileId)) ??
      (nameId && byId.get(nameId)) ??
      byName.get(normalizeTournamentBaseName(hand.tournamentName ?? ""));

    if (summaryBuyIn == null) return hand;
    return { ...hand, buyInEuro: summaryBuyIn };
  });
}

/** Buy-in depuis le nom du tournoi (ex. « Sunday Surprise 10€ », « PKO 5+5 »). */
export function parseBuyInFromTournamentName(tournamentName?: string): number | null {
  if (!tournamentName?.trim()) return null;
  const t = tournamentName.trim();

  const embedded = t.match(
    /(?:^|[\s_(])(\d+(?:[.,]\d+)?)\s*€?\s*\+\s*(\d+(?:[.,]\d+)?)\s*€?(?:[\s_)]|$)/i,
  );
  if (embedded) {
    const base = parseNumberToken(embedded[1]!);
    const fee = parseNumberToken(embedded[2]!);
    if (base != null && fee != null) {
      const total = base + fee;
      if (total <= MAX_REASONABLE_BUY_IN_EURO) return roundEuro(total);
    }
  }

  const euro = parseEuroAmount(t);
  if (euro != null) return euro;

  return null;
}

/** Buy-in agrégé pour un lot de mains (mode statistique, comme la bibliothèque tournois). */
export function buyInEuroFromHands(hands: TournamentLibraryHand[]): number | null {
  const buyIns = hands
    .map((h) => h.buyInEuro ?? parseBuyInFromTournamentName(h.tournamentName))
    .filter((b): b is number => b != null && b > 0);
  return modeNumber(buyIns);
}

export function formatBuyInEuroLabel(buyInEuro: number | null | undefined): string | null {
  if (buyInEuro == null || !Number.isFinite(buyInEuro) || buyInEuro <= 0) return null;
  return `${buyInEuro.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

/** Lignes Betclic : « Buy-in », « Entry », etc. */
export function parseBetclicHandBuyIn(lines: string[]): number | null {
  for (const line of lines) {
    if (!/buy[\s-]?in|entry fee|frais d'inscription|mise initiale/i.test(line)) continue;
    const valuePart = line.includes(":") ? line.split(":").slice(1).join(":").trim() : line;
    const fromStake = parseBuyInExpression(valuePart);
    if (fromStake != null) return fromStake;
    const euro = parseEuroAmount(line);
    if (euro != null) return euro;
  }
  return null;
}

function parseDateIso(dateTime?: string): string | null {
  if (!dateTime?.trim()) return null;
  const iso = dateTime.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = dateTime.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (slash) return `${slash[1]}-${slash[2]}-${slash[3]}`;
  return null;
}

function formatDateLabel(dateIso: string | null): string | null {
  if (!dateIso) return null;
  const [y, m, d] = dateIso.split("-");
  if (!y || !m || !d) return null;
  return `${d}/${m}/${y}`;
}

function modeValue(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0]!;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

function modeNumber(values: number[]): number | null {
  if (values.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0]!;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

export function buildTournamentLibrary(
  hands: TournamentLibraryHand[],
  tournamentKey: (hand: TournamentLibraryHand) => string,
): TournamentLibraryEntry[] {
  const groups = new Map<
    string,
    {
      name: string;
      hands: TournamentLibraryHand[];
    }
  >();

  for (const hand of hands) {
    const key = tournamentKey(hand);
    const name = hand.tournamentName?.trim() || key;
    const prev = groups.get(key);
    if (!prev) groups.set(key, { name, hands: [hand] });
    else prev.hands.push(hand);
  }

  const entries: TournamentLibraryEntry[] = [];
  for (const [key, group] of groups) {
    const dates = group.hands.map((h) => parseDateIso(h.dateTime)).filter((d): d is string => !!d);
    const dateIso = dates.length > 0 ? dates.sort()[0]! : null;

    const buyIns = group.hands
      .map((h) => h.buyInEuro ?? parseBuyInFromTournamentName(h.tournamentName))
      .filter((b): b is number => b != null && b > 0);
    const buyInEuro = modeNumber(buyIns);

    const platforms = group.hands.map(
      (h) => normalizePlatformLabel(h.platform) || inferPlatformFromSource(h.sourceFile),
    );
    const platform = modeValue(platforms) ?? "Autre";

    entries.push({
      key,
      name: group.name,
      handCount: group.hands.length,
      dateIso,
      dateLabel: formatDateLabel(dateIso),
      buyInEuro,
      platform,
    });
  }

  return entries.sort((a, b) => {
    const byDate = (b.dateIso ?? "").localeCompare(a.dateIso ?? "");
    if (byDate !== 0) return byDate;
    return a.name.localeCompare(b.name, "fr");
  });
}

export type TournamentLibraryFilters = {
  platform: string;
  buyIn: string;
  dateMonth: string;
};

export const EMPTY_TOURNAMENT_LIBRARY_FILTERS: TournamentLibraryFilters = {
  platform: "ALL",
  buyIn: "ALL",
  dateMonth: "ALL",
};

export function filterTournamentLibrary(
  entries: TournamentLibraryEntry[],
  filters: TournamentLibraryFilters,
): TournamentLibraryEntry[] {
  return entries.filter((entry) => {
    if (filters.platform !== "ALL" && entry.platform !== filters.platform) return false;
    if (filters.buyIn !== "ALL") {
      const target = Number.parseFloat(filters.buyIn);
      if (!Number.isFinite(target) || entry.buyInEuro == null || Math.abs(entry.buyInEuro - target) > 0.01) {
        return false;
      }
    }
    if (filters.dateMonth !== "ALL") {
      const month = entry.dateIso?.slice(0, 7);
      if (month !== filters.dateMonth) return false;
    }
    return true;
  });
}

export function uniquePlatforms(entries: TournamentLibraryEntry[]): string[] {
  return [...new Set(entries.map((e) => e.platform))].sort((a, b) => a.localeCompare(b, "fr"));
}

export function uniqueBuyIns(entries: TournamentLibraryEntry[]): number[] {
  const set = new Set<number>();
  for (const e of entries) {
    if (e.buyInEuro != null && e.buyInEuro > 0) set.add(e.buyInEuro);
  }
  return [...set].sort((a, b) => a - b);
}

export function uniqueDateMonths(entries: TournamentLibraryEntry[]): string[] {
  const set = new Set<string>();
  for (const e of entries) {
    const m = e.dateIso?.slice(0, 7);
    if (m) set.add(m);
  }
  return [...set].sort((a, b) => b.localeCompare(a));
}

export function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  if (!y || !m) return ym;
  const months = [
    "janv.",
    "févr.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc.",
  ];
  const idx = Number.parseInt(m, 10) - 1;
  return `${months[idx] ?? m} ${y}`;
}
