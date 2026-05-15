"use client";

import { type DragEvent, useEffect, useState } from "react";

import {
  createReviewGroup,
  formatFirestoreGroupError,
  generateInviteCode,
  joinReviewGroupByInviteCode,
  normalizeInviteCode,
  subscribeUserReviewGroups,
  type ReviewGroupMembership,
} from "@/lib/phr-review-groups";
import {
  hasDismissedImportPanel,
  hasSeenWelcomePanel,
  markImportPanelDismissed,
  markWelcomePanelSeen,
} from "@/lib/phr-welcome";
import { usePhrFirebase } from "@/lib/use-phr-firebase";

const PHR_FIELD =
  "w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500/45 focus:ring-1 focus:ring-violet-500/25";

const PHR_BTN =
  "rounded-xl border border-white/10 bg-zinc-800/55 px-3.5 py-2 text-sm font-semibold text-zinc-100 transition hover:border-white/18 hover:bg-zinc-700/70 disabled:opacity-50";

const PHR_BTN_TOOL =
  "rounded-xl border border-white/10 bg-zinc-800/55 px-3.5 py-2 text-sm font-semibold text-zinc-100 shadow-sm transition hover:border-white/18 hover:bg-zinc-700/70 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";

type PhrGroupsHubProps = {
  onOpenGroup: (groupId: string) => void;
  welcomeDropActive?: boolean;
  onImportClick?: () => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  cloudLoading?: boolean;
  cloudLoadError?: string | null;
  cloudSyncWarning?: string | null;
  importError?: string | null;
  hasImportedHands?: boolean;
};

export function PhrGroupsHub({
  onOpenGroup,
  welcomeDropActive = false,
  onImportClick,
  onDragOver,
  onDragLeave,
  onDrop,
  cloudLoading = false,
  cloudLoadError = null,
  cloudSyncWarning = null,
  importError = null,
  hasImportedHands = false,
}: PhrGroupsHubProps) {
  const { user, pseudo, authLoading, firebaseConfigured } = usePhrFirebase();
  const [groups, setGroups] = useState<ReviewGroupMembership[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [createInviteCode, setCreateInviteCode] = useState(() => generateInviteCode());
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showWelcomePanel, setShowWelcomePanel] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);

  const displayName = pseudo ?? user?.displayName ?? "Joueur";
  const createDisabled =
    !firebaseConfigured ||
    authLoading ||
    !user ||
    busy ||
    !name.trim() ||
    createInviteCode.length < 6;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      queueMicrotask(() => setShowWelcomePanel(false));
      return;
    }
    queueMicrotask(() => setShowWelcomePanel(!hasSeenWelcomePanel(user.uid)));
  }, [user, authLoading]);

  useEffect(() => {
    if (!showWelcomePanel || !user) return;
    return () => {
      markWelcomePanelSeen(user.uid);
    };
  }, [showWelcomePanel, user]);

  useEffect(() => {
    if (hasImportedHands) {
      markImportPanelDismissed();
      setShowImportPanel(false);
      return;
    }
    setShowImportPanel(!hasDismissedImportPanel());
  }, [hasImportedHands]);

  useEffect(() => {
    if (!firebaseConfigured || authLoading) return;
    if (!user) {
      queueMicrotask(() => setGroups([]));
      return;
    }
    return subscribeUserReviewGroups(user.uid, setGroups);
  }, [user, authLoading, firebaseConfigured]);

  async function onCreate() {
    if (!firebaseConfigured) {
      setError("Firebase n’est pas configuré (variables NEXT_PUBLIC_FIREBASE_*).");
      return;
    }
    if (authLoading) {
      setError("Connexion en cours… réessaie dans un instant.");
      return;
    }
    if (!user) {
      setError("Connecte-toi pour créer un groupe.");
      return;
    }
    if (!name.trim()) {
      setError("Indique un nom de groupe.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    setCreatedInvite(null);
    try {
      const { groupId, inviteCode: code } = await createReviewGroup({
        ownerUid: user.uid,
        ownerPseudo: displayName,
        name: name.trim(),
        description,
        inviteCode: createInviteCode,
      });
      setCreatedInvite(code);
      setCreateInviteCode(code);
      setSuccess(`Groupe « ${name.trim()} » créé. Ouverture…`);
      setName("");
      setDescription("");
      onOpenGroup(groupId);
    } catch (err) {
      setError(formatFirestoreGroupError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function onJoin() {
    if (!user) {
      setError("Connecte-toi pour rejoindre un groupe.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const groupId = await joinReviewGroupByInviteCode({
        uid: user.uid,
        pseudo: displayName,
        inviteCode: joinInviteCode,
      });
      setJoinInviteCode("");
      onOpenGroup(groupId);
    } catch (err) {
      setError(formatFirestoreGroupError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      {showWelcomePanel ? (
        <header className="shrink-0 rounded-2xl border border-white/10 bg-zinc-950/50 px-4 py-4 backdrop-blur-sm sm:px-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-300/90">Groupes de travail</p>
          <h1 className="mt-1 text-xl font-black tracking-tight text-zinc-50 sm:text-2xl">Bienvenue sur SpotLab</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Crée ou rejoins un groupe pour partager des spots et faire review entre joueurs.
          </p>
        </header>
      ) : (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300/90">Groupes de travail</p>
          <h2 className="text-lg font-black text-zinc-50">Review entre joueurs</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Spots partagés uniquement avec les membres du groupe.
          </p>
        </div>
      )}

      {user && cloudLoading && (
        <p className="shrink-0 rounded-xl border border-violet-500/25 bg-violet-950/25 px-3 py-2 text-sm text-violet-100">
          Chargement de tes préférences de session…
        </p>
      )}
      {cloudSyncWarning ? (
        <p className="shrink-0 rounded-xl border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
          {cloudSyncWarning}
        </p>
      ) : null}
      {user && !cloudLoading && cloudLoadError && (
        <p className="shrink-0 rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-sm text-rose-200">
          {cloudLoadError}
        </p>
      )}
      {importError && (
        <p className="shrink-0 rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
          {importError}
        </p>
      )}

      {!firebaseConfigured ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-sm text-rose-200">
          Firebase n’est pas configuré — les groupes ne peuvent pas être enregistrés.
        </p>
      ) : null}

      {authLoading ? (
        <p className="rounded-xl border border-violet-500/30 bg-violet-950/25 px-3 py-2 text-sm text-violet-100">
          Connexion en cours…
        </p>
      ) : !user ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
          Connecte-toi pour créer ou rejoindre un groupe.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-950/25 px-3 py-2 text-sm text-emerald-100">
          {success}
        </p>
      ) : null}

      <section className="space-y-2 rounded-2xl border border-white/10 bg-zinc-950/50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Créer un groupe</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom du groupe"
          disabled={!user || busy}
          className={PHR_FIELD}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Description (optionnel)"
          disabled={!user || busy}
          className={`${PHR_FIELD} resize-none`}
        />
        <label className="block space-y-1">
          <span className="text-xs text-zinc-500">Code d’invitation</span>
          <motion.div className="flex gap-2">
            <input
              value={createInviteCode}
              onChange={(e) => setCreateInviteCode(normalizeInviteCode(e.target.value))}
              placeholder="Ex. SPOTLAB1"
              disabled={!user || busy}
              maxLength={12}
              className={`${PHR_FIELD} min-w-0 flex-1 font-mono uppercase tracking-widest`}
            />
            <button
              type="button"
              disabled={!user || busy}
              onClick={() => setCreateInviteCode(generateInviteCode())}
              title="Générer un code aléatoire"
              className={`${PHR_BTN} shrink-0 px-2.5 text-xs`}
            >
              Aléa.
            </button>
          </motion.div>
          <p className="text-[10px] text-zinc-600">6 à 12 caractères (A–Z, 2–9). Partage ce code pour inviter.</p>
        </label>
        <button
          type="button"
          disabled={createDisabled}
          onClick={() => void onCreate()}
          className={`${PHR_BTN} w-full border-sky-500/40 bg-sky-600/20 text-sky-100`}
        >
          {busy ? "Création en cours…" : "Créer le groupe"}
        </button>
        {createDisabled && !busy ? (
          <p className="text-[11px] text-zinc-500">
            {!firebaseConfigured
              ? "Configuration Firebase manquante."
              : authLoading
                ? "Attends la fin de la connexion."
                : !user
                  ? "Connecte-toi d’abord."
                  : !name.trim()
                    ? "Indique un nom de groupe."
                    : "Le code doit faire au moins 6 caractères."}
          </p>
        ) : null}
        {createdInvite ? (
          <p className="text-xs text-sky-200">
            Groupe créé · code : <span className="font-mono font-bold">{createdInvite}</span>
          </p>
        ) : null}
      </section>

      <section className="space-y-2 rounded-2xl border border-white/10 bg-zinc-950/50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Rejoindre avec un code</p>
        <input
          value={joinInviteCode}
          onChange={(e) => setJoinInviteCode(normalizeInviteCode(e.target.value))}
          placeholder="Code du groupe"
          disabled={!user || busy}
          maxLength={12}
          className={`${PHR_FIELD} font-mono uppercase tracking-widest`}
        />
        <button
          type="button"
          disabled={!user || busy || joinInviteCode.length < 6}
          onClick={() => void onJoin()}
          className={`${PHR_BTN} w-full`}
        >
          Rejoindre
        </button>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Mes groupes</p>
        {groups.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucun groupe pour l’instant.</p>
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => (
              <li key={g.groupId}>
                <button
                  type="button"
                  onClick={() => onOpenGroup(g.groupId)}
                  className="w-full rounded-xl border border-white/10 bg-zinc-900/50 px-3 py-3 text-left transition hover:border-sky-500/35 hover:bg-zinc-800/60"
                >
                  <p className="font-semibold text-zinc-100">{g.name}</p>
                  {g.description ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{g.description}</p>
                  ) : null}
                  <p className="mt-1 text-[10px] text-zinc-600">
                    {g.role === "owner" ? "Propriétaire" : "Membre"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showImportPanel && onImportClick && onDragOver && onDragLeave && onDrop ? (
        <div
          className={`shrink-0 rounded-2xl border-2 border-dashed px-4 py-5 transition ${
            welcomeDropActive
              ? "border-emerald-400/85 bg-emerald-500/10"
              : "border-white/15 bg-zinc-950/35"
          }`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <p className="text-sm font-semibold text-zinc-100">Analyser tes propres mains</p>
              <p className="text-xs text-zinc-500">Importe un historique .txt pour ouvrir le replayer.</p>
            </div>
            <button type="button" onClick={onImportClick} className={PHR_BTN_TOOL}>
              Importer des fichiers
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
