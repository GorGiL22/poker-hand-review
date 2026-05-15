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
import { loadUserPseudo, saveUserPseudo, validatePseudo } from "./phr-user-profile";

export function usePhrFirebase() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [pseudo, setPseudo] = useState<string | null>(null);

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

  useEffect(() => {
    if (!user) {
      queueMicrotask(() => setPseudo(null));
      return;
    }

    const fromAuth = user.displayName?.trim();
    if (fromAuth) {
      queueMicrotask(() => setPseudo(fromAuth));
      return;
    }

    let cancelled = false;
    void loadUserPseudo(user.uid)
      .then((loaded) => {
        if (!cancelled) setPseudo(loaded);
      })
      .catch(() => {
        if (!cancelled) setPseudo(null);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const signUpWithEmail = useCallback(async (email: string, password: string, pseudoInput: string) => {
    const pseudoError = validatePseudo(pseudoInput);
    if (pseudoError) throw new Error(pseudoError);

    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase n’est pas configuré (variables NEXT_PUBLIC_FIREBASE_*).");
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const savedPseudo = await saveUserPseudo(cred.user.uid, pseudoInput);
    setPseudo(savedPseudo);
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
