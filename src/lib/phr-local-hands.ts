/**
 * Bibliothèque de mains sur le poste (IndexedDB) — hors quota Firestore.
 */

const DB_NAME = "spotlab-local";
const DB_VERSION = 1;
const HANDS_STORE = "hands";

type StoredHandRow = {
  stableKey: string;
  hand: Record<string, unknown>;
  updatedAtMs: number;
};

export function localHandStableKey(hand: { id: string; sourceFile?: string }): string {
  return `${hand.sourceFile ?? "local"}::${hand.id}`;
}

/** Mains importées / bibliothèque — pas les previews fil ou tournoi publié. */
export function isPersistableLocalHand(hand: { id: string; sourceFile?: string }): boolean {
  if (hand.id === "__empty__") return false;
  const src = hand.sourceFile ?? "";
  if (src.startsWith("spotlab-feed/")) return false;
  if (src.startsWith("spotlab-tournament/")) return false;
  return true;
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB indisponible dans cet environnement."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Ouverture IndexedDB impossible."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDS_STORE)) {
        db.createObjectStore(HANDS_STORE, { keyPath: "stableKey" });
      }
    };
  });
}

/** Demande un stockage persistant (moins de risque d’éviction par le navigateur). */
export async function requestPersistentLocalStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function loadLocalHands(): Promise<Record<string, unknown>[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDS_STORE, "readonly");
    const store = tx.objectStore(HANDS_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error ?? new Error("Lecture IndexedDB impossible."));
    request.onsuccess = () => {
      const rows = (request.result as StoredHandRow[]) ?? [];
      resolve(rows.map((row) => row.hand).filter((h) => h && typeof h === "object"));
    };
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Transaction IndexedDB impossible."));
    };
  });
}

export async function saveLocalHands(hands: Record<string, unknown>[]): Promise<void> {
  const persistable = hands.filter((h) => {
    const id = typeof h.id === "string" ? h.id : "";
    const sourceFile = typeof h.sourceFile === "string" ? h.sourceFile : undefined;
    return isPersistableLocalHand({ id, sourceFile });
  });

  if (persistable.length === 0) return;

  const db = await openDb();
  const wantKeys = new Set<string>();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDS_STORE, "readwrite");
    const store = tx.objectStore(HANDS_STORE);
    const now = Date.now();

    for (const hand of persistable) {
      const id = hand.id as string;
      const sourceFile = typeof hand.sourceFile === "string" ? hand.sourceFile : undefined;
      const stableKey = localHandStableKey({ id, sourceFile });
      wantKeys.add(stableKey);
      store.put({
        stableKey,
        hand,
        updatedAtMs: now,
      } satisfies StoredHandRow);
    }

    const cursorReq = store.openCursor();
    cursorReq.onerror = () => reject(cursorReq.error ?? new Error("Sync IndexedDB impossible."));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      const key = cursor.key as string;
      if (!wantKeys.has(key)) {
        cursor.delete();
      }
      cursor.continue();
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Écriture IndexedDB impossible."));
  });

  db.close();
}

export async function clearLocalHands(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDS_STORE, "readwrite");
    const request = tx.objectStore(HANDS_STORE).clear();
    request.onerror = () => reject(request.error ?? new Error("Vidage IndexedDB impossible."));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Vidage IndexedDB impossible."));
  });
  db.close();
}
