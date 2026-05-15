import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

import { isFirestoreQuotaPaused } from "./phr-firestore-quota";

const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim();

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  ...(measurementId ? { measurementId } : {}),
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

/** `1` ou `true` : Auth + Firestore pointent vers les émulateurs locaux (voir `npm run emulators`). */
const firebaseUseEmulator =
  process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR === "1" ||
  process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR === "true";

let appInstance: FirebaseApp | null = null;
let emulatorsLinked = false;

function getOrInitApp(): FirebaseApp | null {
  if (!firebaseConfigured) return null;
  if (appInstance) return appInstance;
  if (getApps().length > 0) {
    appInstance = getApp();
    return appInstance;
  }
  appInstance = initializeApp(firebaseConfig);

  if (typeof window !== "undefined" && measurementId) {
    void import("firebase/analytics").then(({ getAnalytics, isSupported }) => {
      void isSupported().then((supported) => {
        if (!supported || !appInstance) return;
        try {
          getAnalytics(appInstance);
        } catch {
          /* Analytics indisponible (navigateur, bloqueurs, etc.) */
        }
      });
    });
  }

  return appInstance;
}

function linkEmulatorsIfNeeded(auth: Auth, db: Firestore) {
  if (emulatorsLinked) return;
  if (typeof window === "undefined") return;
  if (!firebaseUseEmulator) return;

  emulatorsLinked = true;

  const authUrl =
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL?.trim() || "http://127.0.0.1:9099";
  connectAuthEmulator(auth, authUrl, { disableWarnings: true });

  const host = process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST?.trim() || "127.0.0.1";
  const portRaw = process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT?.trim() || "8080";
  const port = Number.parseInt(portRaw, 10);
  connectFirestoreEmulator(db, host, Number.isFinite(port) ? port : 8080);
}

export function getFirebaseApp(): FirebaseApp | null {
  return getOrInitApp();
}

export function getFirebaseAuth(): Auth | null {
  const app = getOrInitApp();
  if (!app) return null;
  const auth = getAuth(app);
  const db = getFirestore(app);
  linkEmulatorsIfNeeded(auth, db);
  return auth;
}

export function getFirebaseDb(): Firestore | null {
  if (isFirestoreQuotaPaused()) return null;
  const app = getOrInitApp();
  if (!app) return null;
  const auth = getAuth(app);
  const db = getFirestore(app);
  linkEmulatorsIfNeeded(auth, db);
  return db;
}
