"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { type FirebaseError } from "firebase/app";

import {
  PHR_MON_ESPACE_BTN,
  PHR_REPLAYER_BTN,
  PHR_REVIEW_TOPBAR,
  PHR_TOPBAR_BTN,
  PHR_TOPBAR_BTN_COMPACT,
  PHR_TOPBAR_BTN_COMPACT_SIGNOUT,
  PHR_TOPBAR_BTN_SIGNOUT,
  PHR_TOPBAR_USER_STRIP,
} from "@/lib/phr-chrome";
import { usePhrFirebase } from "@/lib/use-phr-firebase";

type AuthMode = "signin" | "signup";

function mapAuthError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as FirebaseError).code;
    switch (code) {
      case "auth/invalid-email":
        return "Adresse e-mail invalide.";
      case "auth/user-disabled":
        return "Ce compte a été désactivé.";
      case "auth/user-not-found":
        return "Aucun compte pour cette adresse.";
      case "auth/wrong-password":
        return "Mot de passe incorrect.";
      case "auth/invalid-credential":
        return "E-mail ou mot de passe incorrect.";
      case "auth/email-already-in-use":
        return "Un compte existe déjà avec cet e-mail.";
      case "auth/weak-password":
        return "Mot de passe trop court (minimum 6 caractères).";
      case "auth/too-many-requests":
        return "Trop de tentatives. Réessaie plus tard.";
      case "auth/network-request-failed":
        return "Erreur réseau. Vérifie ta connexion.";
      default:
        break;
    }
  }
  if (error instanceof Error) return error.message;
  return "Une erreur est survenue.";
}

function usePhrAuthForm() {
  const { user, pseudo, authLoading, firebaseConfigured, signUpWithEmail, signInWithEmail, signOutUser } =
    usePhrFirebase();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pseudoInput, setPseudoInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const closeModal = useCallback(() => {
    setOpen(false);
    setFormError(null);
    setPassword("");
    setPseudoInput("");
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUpWithEmail(email, password, pseudoInput);
      } else {
        await signInWithEmail(email, password);
      }
      closeModal();
      setEmail("");
      setPseudoInput("");
    } catch (err) {
      setFormError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setBusy(true);
    try {
      await signOutUser();
    } finally {
      setBusy(false);
    }
  }

  const shortEmail =
    user?.email && user.email.length > 28 ? `${user.email.slice(0, 26)}…` : user?.email ?? "";
  const displayLabel = pseudo?.trim() || shortEmail;
  const displayTitle = pseudo?.trim()
    ? user?.email
      ? `${pseudo} (${user.email})`
      : pseudo
    : user?.email ?? undefined;

  return {
    user,
    pseudo,
    authLoading,
    firebaseConfigured,
    busy,
    open,
    setOpen,
    mode,
    setMode,
    email,
    setEmail,
    password,
    setPassword,
    pseudoInput,
    setPseudoInput,
    formError,
    setFormError,
    closeModal,
    onSubmit,
    onSignOut,
    shortEmail,
    displayLabel,
    displayTitle,
  };
}

function PhrAuthModal({
  auth,
  titleId,
}: {
  auth: ReturnType<typeof usePhrAuthForm>;
  titleId: string;
}) {
  const {
    firebaseConfigured,
    open,
    closeModal,
    mode,
    setMode,
    email,
    setEmail,
    password,
    setPassword,
    pseudoInput,
    setPseudoInput,
    formError,
    busy,
    onSubmit,
    setFormError,
  } = auth;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeModal]);

  if (!open || !firebaseConfigured) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl border border-zinc-700/90 bg-[#1e1d24] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-bold text-zinc-50">
          {mode === "signin" ? "Connexion" : "Créer un compte"}
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          {mode === "signin"
            ? "Connecte-toi avec ton e-mail et ton mot de passe."
            : "Choisis un pseudo pour t’identifier, puis crée ton compte."}
        </p>
        <form className="mt-4 space-y-3" onSubmit={(e) => void onSubmit(e)}>
          {mode === "signup" && (
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Pseudo
              <input
                type="text"
                autoComplete="nickname"
                value={pseudoInput}
                onChange={(e) => setPseudoInput(e.target.value)}
                required
                minLength={2}
                maxLength={24}
                placeholder="Ex. Shark42"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-500/30 focus:border-emerald-600/60 focus:ring-2"
              />
            </label>
          )}
          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
            E-mail
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-500/30 focus:border-emerald-600/60 focus:ring-2"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Mot de passe
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-500/30 focus:border-emerald-600/60 focus:ring-2"
            />
          </label>
          {formError && <p className="text-sm text-rose-400">{formError}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg border border-emerald-600/70 bg-emerald-700/35 px-4 py-2 text-sm font-bold text-emerald-50 transition hover:bg-emerald-600/40 disabled:opacity-50"
            >
              {busy ? "Patienter…" : mode === "signin" ? "Se connecter" : "S’inscrire"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={closeModal}
              className="rounded-lg border border-zinc-600 bg-zinc-800/60 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700/60 disabled:opacity-50"
            >
              Annuler
            </button>
          </div>
        </form>
        <p className="mt-4 border-t border-zinc-800 pt-3 text-center text-xs text-zinc-500">
          {mode === "signin" ? (
            <>
              Pas encore de compte ?{" "}
              <button
                type="button"
                className="font-semibold text-emerald-400 underline-offset-2 hover:underline"
                onClick={() => {
                  setMode("signup");
                  setFormError(null);
                  setPseudoInput("");
                }}
              >
                Inscription
              </button>
            </>
          ) : (
            <>
              Déjà inscrit ?{" "}
              <button
                type="button"
                className="font-semibold text-emerald-400 underline-offset-2 hover:underline"
                onClick={() => {
                  setMode("signin");
                  setFormError(null);
                  setPseudoInput("");
                }}
              >
                Connexion
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/** Bloc compte + modale pour le panneau Paramètres (review sans barre du haut). */
export function PhrAccountSettingsCard() {
  const auth = usePhrAuthForm();

  return (
    <>
      <div className="mt-3 border-t border-zinc-800 pt-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Compte</p>
        {!auth.firebaseConfigured && (
          <p className="text-xs text-amber-200/90">Firebase non configuré (variables NEXT_PUBLIC_FIREBASE_*).</p>
        )}
        {auth.firebaseConfigured && auth.authLoading && (
          <p className="text-xs text-zinc-500">Chargement…</p>
        )}
        {auth.firebaseConfigured && !auth.authLoading && !auth.user && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-zinc-400">Connecte-toi pour lier ton espace.</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-nowrap sm:items-stretch">
              <button
                type="button"
                onClick={() => {
                  auth.setMode("signin");
                  auth.setFormError(null);
                  auth.setOpen(true);
                }}
                className={PHR_TOPBAR_BTN_COMPACT}
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => {
                  auth.setMode("signup");
                  auth.setFormError(null);
                  auth.setOpen(true);
                }}
                className={PHR_TOPBAR_BTN_COMPACT}
              >
                Inscription
              </button>
            </div>
          </div>
        )}
        {auth.firebaseConfigured && !auth.authLoading && auth.user && (
          <div className="flex flex-col gap-2">
            <p className="truncate text-xs text-zinc-400" title={auth.displayTitle}>
              {auth.displayLabel}
            </p>
            <button
              type="button"
              disabled={auth.busy}
              onClick={() => void auth.onSignOut()}
              className={`${PHR_TOPBAR_BTN_COMPACT_SIGNOUT} w-fit sm:min-w-0`}
            >
              Déconnexion
            </button>
          </div>
        )}
      </div>
      <PhrAuthModal auth={auth} titleId="phr-settings-auth-title" />
    </>
  );
}

type PhrAuthBarProps = {
  onMonEspaceClick?: () => void;
  onReplayerClick?: () => void;
};

export function PhrAuthBar({ onMonEspaceClick, onReplayerClick }: PhrAuthBarProps) {
  const auth = usePhrAuthForm();

  function onMonEspace() {
    if (auth.user && onMonEspaceClick) {
      onMonEspaceClick();
      return;
    }
    auth.setMode("signin");
    auth.setFormError(null);
    auth.setOpen(true);
  }

  return (
    <>
      <header className="shrink-0 border-b border-white/10 bg-zinc-950/90 shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-2 px-3 py-2 sm:px-5">
          <div className={`${PHR_REVIEW_TOPBAR} grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2`}>
            <span className="min-w-0 justify-self-start truncate text-xs font-black tracking-tight text-zinc-100 sm:text-sm">
              SpotLab
            </span>
            <div className="flex flex-wrap items-center justify-center gap-2 justify-self-center">
              <button type="button" onClick={onMonEspace} className={PHR_MON_ESPACE_BTN}>
                Mon espace
              </button>
              {onReplayerClick ? (
                <button type="button" onClick={onReplayerClick} className={PHR_REPLAYER_BTN}>
                  Replayer
                </button>
              ) : null}
            </motion.div>
            <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end justify-self-end gap-2">
              {!auth.firebaseConfigured && (
                <span className="max-w-[min(100vw-12rem,12rem)] text-right text-[10px] leading-snug text-amber-200/90 sm:max-w-[14rem] sm:text-[11px]">
                  Firebase indisponible.
                </span>
              )}
              {auth.firebaseConfigured && auth.authLoading && (
                <span className="text-xs text-zinc-500">Chargement…</span>
              )}
              {auth.firebaseConfigured && !auth.authLoading && !auth.user && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      auth.setMode("signin");
                      auth.setFormError(null);
                      auth.setOpen(true);
                    }}
                    className={PHR_TOPBAR_BTN}
                  >
                    Connexion
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      auth.setMode("signup");
                      auth.setFormError(null);
                      auth.setOpen(true);
                    }}
                    className={PHR_TOPBAR_BTN}
                  >
                    Inscription
                  </button>
                </>
              )}
              {auth.firebaseConfigured && !auth.authLoading && auth.user && (
                <>
                  <span
                    className={`${PHR_TOPBAR_USER_STRIP} hidden max-w-[10rem] sm:inline-flex sm:max-w-[14rem]`}
                    title={auth.displayTitle}
                  >
                    {auth.displayLabel}
                  </span>
                  <button
                    type="button"
                    disabled={auth.busy}
                    onClick={() => void auth.onSignOut()}
                    className={PHR_TOPBAR_BTN_SIGNOUT}
                  >
                    Déconnexion
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <PhrAuthModal auth={auth} titleId="phr-auth-title" />
    </>
  );
}
