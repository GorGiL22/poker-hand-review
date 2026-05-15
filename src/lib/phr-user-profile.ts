import { updateProfile } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { getFirebaseAuth, getFirebaseDb } from "./firebase";

export const PHR_PSEUDO_FIELD = "phrPseudo";

export function normalizePseudo(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function validatePseudo(raw: string): string | null {
  const pseudo = normalizePseudo(raw);
  if (pseudo.length < 2) return "Le pseudo doit faire au moins 2 caractères.";
  if (pseudo.length > 24) return "Le pseudo est limité à 24 caractères.";
  if (/[<>]/.test(pseudo)) return "Caractères invalides dans le pseudo.";
  return null;
}

export async function loadUserPseudo(uid: string): Promise<string | null> {
  const db = getFirebaseDb();
  if (!db) return null;
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const value = snap.data()[PHR_PSEUDO_FIELD];
  return typeof value === "string" && value.trim().length > 0 ? normalizePseudo(value) : null;
}

export async function saveUserPseudo(uid: string, pseudo: string): Promise<string> {
  const normalized = normalizePseudo(pseudo);
  const validationError = validatePseudo(normalized);
  if (validationError) throw new Error(validationError);

  const auth = getFirebaseAuth();
  const db = getFirebaseDb();
  if (!auth?.currentUser || auth.currentUser.uid !== uid) {
    throw new Error("Session utilisateur invalide.");
  }
  if (!db) throw new Error("Firestore non initialisé.");

  await updateProfile(auth.currentUser, { displayName: normalized });
  await setDoc(
    doc(db, "users", uid),
    { [PHR_PSEUDO_FIELD]: normalized, phrUpdatedAt: serverTimestamp() },
    { merge: true },
  );
  return normalized;
}
