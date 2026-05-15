"use client";

import { useEffect, useState } from "react";

import {
  createReviewGroup,
  joinReviewGroupByInviteCode,
  subscribeUserReviewGroups,
  type ReviewGroupMembership,
} from "@/lib/phr-review-groups";
import { usePhrFirebase } from "@/lib/use-phr-firebase";

const PHR_FIELD =
  "w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500/45 focus:ring-1 focus:ring-violet-500/25";

const PHR_BTN =
  "rounded-xl border border-white/10 bg-zinc-800/55 px-3.5 py-2 text-sm font-semibold text-zinc-100 transition hover:border-white/18 hover:bg-zinc-700/70 disabled:opacity-50";

type PhrGroupsHubProps = {
  onOpenGroup: (groupId: string) => void;
  onClose: () => void;
};

export function PhrGroupsHub({ onOpenGroup, onClose }: PhrGroupsHubProps) {
  const { user, pseudo, firebaseConfigured } = usePhrFirebase();
  const [groups, setGroups] = useState<ReviewGroupMembership[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<string | null>(null);

  const displayName = pseudo ?? user?.displayName ?? "Joueur";

  useEffect(() => {
    if (!user || !firebaseConfigured) {
      queueMicrotask(() => setGroups([]));
      return;
    }
    return subscribeUserReviewGroups(user.uid, setGroups);
  }, [user, firebaseConfigured]);

  async function onCreate() {
    if (!user) {
      setError("Connecte-toi pour créer un groupe.");
      return;
    }
    setBusy(true);
    setError(null);
    setCreatedInvite(null);
    try {
      const { groupId, inviteCode: code } = await createReviewGroup({
        ownerUid: user.uid,
        ownerPseudo: displayName,
        name,
        description,
      });
      setCreatedInvite(code);
      setName("");
      setDescription("");
      onOpenGroup(groupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible.");
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
        inviteCode,
      });
      setInviteCode("");
      onOpenGroup(groupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invitation invalide.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300/90">Groupes privés</p>
          <h2 className="text-lg font-black text-zinc-50">Review entre joueurs</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Spots et tournois partagés uniquement avec les membres — pas de chat.
          </p>
        </div>
        <button type="button" onClick={onClose} className={PHR_BTN}>
          Fermer
        </button>
      </div>

      {!user ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
          Connecte-toi pour créer ou rejoindre un groupe.
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
        <button
          type="button"
          disabled={!user || busy || !name.trim()}
          onClick={() => void onCreate()}
          className={`${PHR_BTN} w-full border-sky-500/40 bg-sky-600/20 text-sky-100`}
        >
          Créer le groupe
        </button>
        {createdInvite ? (
          <p className="text-xs text-sky-200">
            Code d’invitation : <span className="font-mono font-bold">{createdInvite}</span>
          </p>
        ) : null}
      </section>

      <section className="space-y-2 rounded-2xl border border-white/10 bg-zinc-950/50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Rejoindre avec un code</p>
        <input
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          placeholder="Code à 8 caractères"
          disabled={!user || busy}
          className={`${PHR_FIELD} font-mono uppercase tracking-widest`}
        />
        <button
          type="button"
          disabled={!user || busy || inviteCode.trim().length < 6}
          onClick={() => void onJoin()}
          className={`${PHR_BTN} w-full`}
        >
          Rejoindre
        </button>
      </section>

      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

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
    </div>
  );
}
