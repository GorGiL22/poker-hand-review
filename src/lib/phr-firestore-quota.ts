/** Pause Firestore après quota dépassé — évite de saturer le plan gratuit. */

const STORAGE_KEY = "phr-firestore-quota-pause-until";
/** 6 h : le quota Spark se réinitialise en général à minuit PT ; on évite de spammer jusqu’au lendemain. */
const PAUSE_MS = 6 * 60 * 60 * 1000;

export const FIRESTORE_QUOTA_USER_MESSAGE =
  "Quota Firestore dépassé (plan gratuit). Synchro cloud en pause — l’app fonctionne en local. Réessaie dans quelques heures ou active Blaze dans la console Firebase.";

let memoryPauseUntil = 0;

function readPauseUntil(): number {
  if (typeof window === "undefined") return memoryPauseUntil;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return memoryPauseUntil;
  const until = Number.parseInt(raw, 10);
  if (!Number.isFinite(until) || Date.now() >= until) {
    sessionStorage.removeItem(STORAGE_KEY);
    return 0;
  }
  memoryPauseUntil = until;
  return until;
}

export function isFirestoreQuotaPaused(): boolean {
  return Date.now() < readPauseUntil();
}

export function markFirestoreQuotaExceeded(): void {
  const until = Date.now() + PAUSE_MS;
  memoryPauseUntil = until;
  if (typeof window !== "undefined") {
    sessionStorage.setItem(STORAGE_KEY, String(until));
  }
}

export function clearFirestoreQuotaPause(): void {
  memoryPauseUntil = 0;
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

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

export function handleFirestoreQuotaError(err: unknown): boolean {
  if (!isFirestoreQuotaError(err)) return false;
  markFirestoreQuotaExceeded();
  return true;
}
