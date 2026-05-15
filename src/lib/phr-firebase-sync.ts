import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";

import { getFirebaseDb } from "./firebase";
import {
  handleFirestoreQuotaError,
  isFirestoreQuotaPaused,
  isFirestoreQuotaError,
} from "./phr-firestore-quota";

export { isFirestoreQuotaError } from "./phr-firestore-quota";

/** Préférences utilisateur persistées sur `users/{uid}` (champs préfixés `phr`). */
export type PhrCloudPrefsWrite = {
  userNotes: string;
  markedHandKeys: string[];
  errorHandKeys: string[];
  chipVisualStyle: string;
  uiAccent: string;
  tableTheme: string;
  cardBackTheme: string;
  cardBackStyle: string;
  cardFaceTheme: string;
  cardDesignTheme: string;
  displayUnit: string;
  soundEnabled: boolean;
  selectedTournament: string;
  selectedHandId: string;
  stepIndex: number;
  heroMoveFilter: string;
  heroPositionFilter: string;
  versusPositionFilter: string;
  boardTextureFilter: string;
  heroResultFilter: string;
  heroResultSort: string;
  markedHandsOnly: boolean;
  errorHandsOnly: boolean;
  oddsPotInput: string;
  oddsCallInput: string;
  oddsOutsInput: string;
  oddsStreet: string;
  targetBountyInput: string;
  bountyCalcMode: string;
  baseBountyInput: string;
  pkoTournamentMoment: string;
  mkoTournamentMoment: string;
  mkoBigBountiesFellFast: boolean;
  buyInInput: string;
  startingStackInput: string;
  currentBbInput: string;
  geoPotInput: string;
  geoStackInput: string;
  geoStreetsInput: string;
};

const F = {
  userNotes: "phrUserNotes",
  markedHandKeys: "phrMarkedHandKeys",
  errorHandKeys: "phrErrorHandKeys",
  chipVisualStyle: "phrChipVisualStyle",
  uiAccent: "phrUiAccent",
  tableTheme: "phrTableTheme",
  cardBackTheme: "phrCardBackTheme",
  cardBackStyle: "phrCardBackStyle",
  cardFaceTheme: "phrCardFaceTheme",
  cardDesignTheme: "phrCardDesignTheme",
  displayUnit: "phrDisplayUnit",
  soundEnabled: "phrSoundEnabled",
  selectedTournament: "phrSelectedTournament",
  selectedHandId: "phrSelectedHandId",
  stepIndex: "phrStepIndex",
  heroMoveFilter: "phrHeroMoveFilter",
  heroPositionFilter: "phrHeroPositionFilter",
  versusPositionFilter: "phrVersusPositionFilter",
  boardTextureFilter: "phrBoardTextureFilter",
  heroResultFilter: "phrHeroResultFilter",
  heroResultSort: "phrHeroResultSort",
  markedHandsOnly: "phrMarkedHandsOnly",
  errorHandsOnly: "phrErrorHandsOnly",
  oddsPotInput: "phrOddsPotInput",
  oddsCallInput: "phrOddsCallInput",
  oddsOutsInput: "phrOddsOutsInput",
  oddsStreet: "phrOddsStreet",
  targetBountyInput: "phrTargetBountyInput",
  bountyCalcMode: "phrBountyCalcMode",
  baseBountyInput: "phrBaseBountyInput",
  pkoTournamentMoment: "phrPkoTournamentMoment",
  mkoTournamentMoment: "phrMkoTournamentMoment",
  mkoBigBountiesFellFast: "phrMkoBigBountiesFellFast",
  buyInInput: "phrBuyInInput",
  startingStackInput: "phrStartingStackInput",
  currentBbInput: "phrCurrentBbInput",
  geoPotInput: "phrGeoPotInput",
  geoStackInput: "phrGeoStackInput",
  geoStreetsInput: "phrGeoStreetsInput",
} as const satisfies Record<keyof PhrCloudPrefsWrite, string>;

export function handStableKeyToFirestoreDocId(stableKey: string): string {
  try {
    const u8 = new TextEncoder().encode(stableKey);
    let bin = "";
    u8.forEach((byte) => {
      bin += String.fromCharCode(byte);
    });
    const enc = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    if (enc.length <= 1200) return `h_${enc}`;
  } catch {
    /* ignore */
  }
  let h = 2166136261 >>> 0;
  for (let i = 0; i < stableKey.length; i += 1) {
    h ^= stableKey.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const tail = stableKey.replace(/[/./#[\]`$]/g, "_").slice(0, 100);
  return `h_${h.toString(16)}_${tail}`;
}

function readString(data: Record<string, unknown>, key: string, fallback: string): string {
  const v = data[key];
  return typeof v === "string" ? v : fallback;
}

function readStringArray(data: Record<string, unknown>, key: string): string[] {
  const v = data[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

function readBoolean(data: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = data[key];
  return typeof v === "boolean" ? v : fallback;
}

function readNumber(data: Record<string, unknown>, key: string, fallback: number): number {
  const v = data[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Indique si le compte a déjà des données côté cloud (mains ou préférences enregistrées). */
export function cloudHasUserData(prefs: Record<string, unknown> | null, handsCount: number): boolean {
  if (handsCount > 0) return true;
  if (!prefs) return false;
  if (prefs.phrLibraryVersion != null) return true;
  const notes = prefs.phrUserNotes;
  return typeof notes === "string" && notes.length > 0;
}

export type PhrCloudPrefsRead = Partial<PhrCloudPrefsWrite> & { raw: Record<string, unknown> };

export function parsePrefsFromUserDoc(data: Record<string, unknown>): PhrCloudPrefsRead {
  return {
    raw: data,
    userNotes: readString(data, F.userNotes, ""),
    markedHandKeys: readStringArray(data, F.markedHandKeys),
    errorHandKeys: readStringArray(data, F.errorHandKeys),
    chipVisualStyle: readString(data, F.chipVisualStyle, "CLASSIC"),
    uiAccent: readString(data, F.uiAccent, "VIOLET"),
    tableTheme: readString(data, F.tableTheme, "GREEN"),
    cardBackTheme: readString(data, F.cardBackTheme, "RED"),
    cardBackStyle: readString(data, F.cardBackStyle, "DOTS"),
    cardFaceTheme: readString(data, F.cardFaceTheme, "CLASSIC"),
    cardDesignTheme: readString(data, F.cardDesignTheme, "CLASSIC"),
    displayUnit: readString(data, F.displayUnit, "bb"),
    soundEnabled: readBoolean(data, F.soundEnabled, true),
    selectedTournament: readString(data, F.selectedTournament, ""),
    selectedHandId: readString(data, F.selectedHandId, ""),
    stepIndex: readNumber(data, F.stepIndex, 0),
    heroMoveFilter: readString(data, F.heroMoveFilter, "ALL"),
    heroPositionFilter: readString(data, F.heroPositionFilter, "ALL"),
    versusPositionFilter: readString(data, F.versusPositionFilter, "ALL"),
    boardTextureFilter: readString(data, F.boardTextureFilter, "ALL"),
    heroResultFilter: readString(data, F.heroResultFilter, "ALL"),
    heroResultSort: readString(data, F.heroResultSort, "NONE"),
    markedHandsOnly: readBoolean(data, F.markedHandsOnly, false),
    errorHandsOnly: readBoolean(data, F.errorHandsOnly, false),
    oddsPotInput: readString(data, F.oddsPotInput, "10"),
    oddsCallInput: readString(data, F.oddsCallInput, "5"),
    oddsOutsInput: readString(data, F.oddsOutsInput, "9"),
    oddsStreet: readString(data, F.oddsStreet, "FLOP"),
    targetBountyInput: readString(data, F.targetBountyInput, "10"),
    bountyCalcMode: readString(data, F.bountyCalcMode, "SKO"),
    baseBountyInput: readString(data, F.baseBountyInput, "5"),
    pkoTournamentMoment: readString(data, F.pkoTournamentMoment, "DEBUT"),
    mkoTournamentMoment: readString(data, F.mkoTournamentMoment, "ITM"),
    mkoBigBountiesFellFast: readBoolean(data, F.mkoBigBountiesFellFast, false),
    buyInInput: readString(data, F.buyInInput, "10"),
    startingStackInput: readString(data, F.startingStackInput, "20000"),
    currentBbInput: readString(data, F.currentBbInput, "1000"),
    geoPotInput: readString(data, F.geoPotInput, "10"),
    geoStackInput: readString(data, F.geoStackInput, "30"),
    geoStreetsInput: readString(data, F.geoStreetsInput, "2"),
  };
}

export async function loadUserCloudData(uid: string): Promise<{
  hands: Record<string, unknown>[];
  prefs: PhrCloudPrefsRead | null;
}> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");

  const userRef = doc(db, "users", uid);
  const [userSnap, handsSnap] = await Promise.all([getDoc(userRef), getDocs(collection(db, "users", uid, "hands"))]);

  const prefs = userSnap.exists() ? parsePrefsFromUserDoc(userSnap.data() as Record<string, unknown>) : null;
  const hands: Record<string, unknown>[] = [];
  handsSnap.forEach((d) => {
    const row = d.data() as { hand?: Record<string, unknown> };
    if (row.hand && typeof row.hand === "object") hands.push(row.hand);
  });

  function deriveTournamentKeyFromHandData(h: Record<string, unknown>): string {
    const tn = h.tournamentName;
    if (typeof tn === "string" && tn.trim().length > 0) return tn.trim();
    const raw = typeof h.sourceFile === "string" ? h.sourceFile : "Tournoi inconnu";
    const cleaned = raw
      .replace(/\.[^.]+$/, "")
      .replace(/_real_holdem_no-limit(_summary)?$/i, "")
      .replace(/^\d{8}_/, "")
      .trim();
    return cleaned || "Tournoi inconnu";
  }

  hands.sort((a, b) => {
    const ta = deriveTournamentKeyFromHandData(a);
    const tb = deriveTournamentKeyFromHandData(b);
    const c = ta.localeCompare(tb, "fr");
    if (c !== 0) return c;
    const da = String(a.dateTime ?? "");
    const dbi = String(b.dateTime ?? "");
    return da.localeCompare(dbi);
  });

  return { hands, prefs };
}

function prefsToFirestoreFields(prefs: PhrCloudPrefsWrite): Record<string, unknown> {
  return {
    phrLibraryVersion: 1,
    [F.userNotes]: prefs.userNotes,
    [F.markedHandKeys]: prefs.markedHandKeys,
    [F.errorHandKeys]: prefs.errorHandKeys,
    [F.chipVisualStyle]: prefs.chipVisualStyle,
    [F.uiAccent]: prefs.uiAccent,
    [F.tableTheme]: prefs.tableTheme,
    [F.cardBackTheme]: prefs.cardBackTheme,
    [F.cardBackStyle]: prefs.cardBackStyle,
    [F.cardFaceTheme]: prefs.cardFaceTheme,
    [F.cardDesignTheme]: prefs.cardDesignTheme,
    [F.displayUnit]: prefs.displayUnit,
    [F.soundEnabled]: prefs.soundEnabled,
    [F.selectedTournament]: prefs.selectedTournament,
    [F.selectedHandId]: prefs.selectedHandId,
    [F.stepIndex]: prefs.stepIndex,
    [F.heroMoveFilter]: prefs.heroMoveFilter,
    [F.heroPositionFilter]: prefs.heroPositionFilter,
    [F.versusPositionFilter]: prefs.versusPositionFilter,
    [F.boardTextureFilter]: prefs.boardTextureFilter,
    [F.heroResultFilter]: prefs.heroResultFilter,
    [F.heroResultSort]: prefs.heroResultSort,
    [F.markedHandsOnly]: prefs.markedHandsOnly,
    [F.errorHandsOnly]: prefs.errorHandsOnly,
    [F.oddsPotInput]: prefs.oddsPotInput,
    [F.oddsCallInput]: prefs.oddsCallInput,
    [F.oddsOutsInput]: prefs.oddsOutsInput,
    [F.oddsStreet]: prefs.oddsStreet,
    [F.targetBountyInput]: prefs.targetBountyInput,
    [F.bountyCalcMode]: prefs.bountyCalcMode,
    [F.baseBountyInput]: prefs.baseBountyInput,
    [F.pkoTournamentMoment]: prefs.pkoTournamentMoment,
    [F.mkoTournamentMoment]: prefs.mkoTournamentMoment,
    [F.mkoBigBountiesFellFast]: prefs.mkoBigBountiesFellFast,
    [F.buyInInput]: prefs.buyInInput,
    [F.startingStackInput]: prefs.startingStackInput,
    [F.currentBbInput]: prefs.currentBbInput,
    [F.geoPotInput]: prefs.geoPotInput,
    [F.geoStackInput]: prefs.geoStackInput,
    [F.geoStreetsInput]: prefs.geoStreetsInput,
    phrUpdatedAt: serverTimestamp(),
  };
}

const BATCH_SAFE = 400;

export function isFirestoreQuotaError(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err && typeof err.code === "string"
      ? err.code
      : "";
  const message =
    err && typeof err === "object" && "message" in err && typeof err.message === "string"
      ? err.message
      : "";
  return code === "resource-exhausted" || /quota exceeded/i.test(message);
}

/** Empreinte du contenu d’une main — évite les réécritures Firestore inutiles. */
export function handCloudFingerprint(hand: Record<string, unknown>): string {
  const s = JSON.stringify(hand);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${s.length}:${h >>> 0}`;
}

export function handStableKeyFromRecord(hand: Record<string, unknown>): string {
  const id = typeof hand.id === "string" ? hand.id : "unknown";
  const source = typeof hand.sourceFile === "string" ? hand.sourceFile : "local";
  return `${source}::${id}`;
}

export function parseStoredHand(raw: Record<string, unknown>): Record<string, unknown> | null {
  if (typeof raw.id !== "string") return null;
  if (!Array.isArray(raw.players)) return null;
  if (!raw.actions || typeof raw.actions !== "object") return null;
  if (!raw.board || typeof raw.board !== "object") return null;
  return raw;
}

export function handStableKeyFromParsedFields(sourceFile: string | undefined, id: string): string {
  return `${sourceFile ?? "local"}::${id}`;
}

/** Firestore rejette `undefined` — retire les champs absents récursivement. */
export function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) return value;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (nested === undefined) continue;
    out[key] = sanitizeForFirestore(nested);
  }
  return out as T;
}

async function syncUserHandsCollection(
  uid: string,
  hands: Record<string, unknown>[],
  stableKeyForHand: (hand: Record<string, unknown>) => string,
): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");

  const colRef = collection(db, "users", uid, "hands");
  const want = new Map<
    string,
    { stableKey: string; hand: Record<string, unknown>; contentFp: string }
  >();
  for (const hand of hands) {
    const stableKey = stableKeyForHand(hand);
    const id = handStableKeyToFirestoreDocId(stableKey);
    const sanitized = sanitizeForFirestore(hand);
    want.set(id, {
      stableKey,
      hand: sanitized,
      contentFp: handCloudFingerprint(sanitized),
    });
  }

  const existingSnap = await getDocs(colRef);
  const existingById = new Map(
    existingSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]),
  );

  const toDelete = existingSnap.docs.filter((d) => !want.has(d.id));
  for (let i = 0; i < toDelete.length; i += BATCH_SAFE) {
    const batch = writeBatch(db);
    toDelete.slice(i, i + BATCH_SAFE).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  const toWrite = [...want.entries()].filter(([id, next]) => {
    const prev = existingById.get(id);
    if (!prev) return true;
    const prevStable = typeof prev.stableKey === "string" ? prev.stableKey : "";
    const prevFp = typeof prev.phrContentFp === "string" ? prev.phrContentFp : null;
    return prevStable !== next.stableKey || prevFp !== next.contentFp;
  });

  for (let i = 0; i < toWrite.length; i += BATCH_SAFE) {
    const batch = writeBatch(db);
    toWrite.slice(i, i + BATCH_SAFE).forEach(([id, { stableKey, hand, contentFp }]) => {
      batch.set(doc(colRef, id), {
        stableKey,
        hand,
        phrContentFp: contentFp,
        phrUpdatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }
}

export async function saveUserHandsOnly(
  uid: string,
  hands: Record<string, unknown>[],
  stableKeyForHand: (hand: Record<string, unknown>) => string,
): Promise<void> {
  await syncUserHandsCollection(uid, hands, stableKeyForHand);
}

/** État de replayer minimal (main courante, tournoi filtré). */
export type PhrReplaySessionWrite = {
  selectedHandId: string;
  stepIndex: number;
  selectedTournament: string;
  displayUnit: string;
  soundEnabled: boolean;
};

export async function saveUserReplaySession(uid: string, session: PhrReplaySessionWrite): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");

  await setDoc(
    doc(db, "users", uid),
    {
      [F.selectedHandId]: session.selectedHandId,
      [F.stepIndex]: session.stepIndex,
      [F.selectedTournament]: session.selectedTournament,
      [F.displayUnit]: session.displayUnit,
      [F.soundEnabled]: session.soundEnabled,
      phrUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function saveUserCloudData(
  uid: string,
  hands: Record<string, unknown>[],
  prefs: PhrCloudPrefsWrite,
  stableKeyForHand: (hand: Record<string, unknown>) => string,
): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");

  const userRef = doc(db, "users", uid);
  await syncUserHandsCollection(uid, hands, stableKeyForHand);
  await setDoc(userRef, prefsToFirestoreFields(prefs), { merge: true });
}
