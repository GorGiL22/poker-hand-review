"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";

import { firebaseConfigured, getFirebaseAuth } from "./firebase";

export function usePhrFirebase() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      queueMicrotask(() => setAuthLoading(false));
      return;
    }
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setAuthLoading(false);
    });
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase n’est pas configuré (variables NEXT_PUBLIC_FIREBASE_*).");
    await createUserWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase n’est pas configuré (variables NEXT_PUBLIC_FIREBASE_*).");
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signOutUser = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await signOut(auth);
  }, []);

  return {
    user,
    authLoading,
    firebaseConfigured,
    signUpWithEmail,
    signInWithEmail,
    signOutUser,
  };
}
