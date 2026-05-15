"use client";

import { useEffect, useState } from "react";

import { PhrFeedSpotDiscussion } from "@/components/phr-feed-spot-discussion";
import { PhrSpotFeedPreview } from "@/components/phr-spot-feed-preview";
import {
  generateInviteCode,
  getGroupInviteCode,
  normalizeInviteCode,
  setGroupInviteCode,
  subscribeGroupMembers,
  subscribeGroupSpots,
  subscribeReviewGroup,
  type ReviewGroup,
  type ReviewGroupMember,
} from "@/lib/phr-review-groups";
import type { PublicHandPost } from "@/lib/phr-public-feed";
import { sourceValidationLabel, type SpotSourceValidation } from "@/lib/phr-spots";
import { usePhrFirebase } from "@/lib/use-phr-firebase";

function formatRelativeTime(ms: number): string {
  const delta = Date.now() - ms;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "À l’instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  return `Il y a ${Math.floor(hours / 24)} j`;
}

type PhrGroupViewProps = {
  groupId: string;
  onBack: () => void;
  onOpenSpot: (post: PublicHandPost) => boolean;
};

export function PhrGroupView({ groupId, onBack, onOpenSpot }: PhrGroupViewProps) {
  const { user, firebaseConfigured } = usePhrFirebase();
  const [group, setGroup] = useState<ReviewGroup | null>(null);
  const [members, setMembers] = useState<ReviewGroupMember[]>([]);
  const [posts, setPosts] = useState<PublicHandPost[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteDraft, setInviteDraft] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteToast, setInviteToast] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showInviteSettings, setShowInviteSettings] = useState(false);
  const [discussionPostId, setDiscussionPostId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOwner = user && group?.ownerUid === user.uid;

  useEffect(() => {
    if (!firebaseConfigured) return;
    const unsubGroup = subscribeReviewGroup(groupId, setGroup);
    const unsubMembers = subscribeGroupMembers(groupId, setMembers);
    const unsubPosts = subscribeGroupSpots(groupId, setPosts, (err) => setError(err.message));
    return () => {
      unsubGroup();
      unsubMembers();
      unsubPosts();
    };
  }, [groupId, firebaseConfigured]);

  useEffect(() => {
    if (!user || !firebaseConfigured) return;
    void getGroupInviteCode(groupId, user.uid)
      .then((code) => {
        setInviteCode(code);
        if (code) setInviteDraft(code);
      })
      .catch(() => setInviteCode(null));
  }, [groupId, user, firebaseConfigured]);

  async function copyInvite() {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setInviteToast("Code copié.");
      window.setTimeout(() => setInviteToast(null), 2000);
    } catch {
      /* ignore */
    }
  }

  async function saveInviteCode() {
    if (!user || !isOwner) return;
    setInviteBusy(true);
    setError(null);
    try {
      const code = await setGroupInviteCode(groupId, user.uid, inviteDraft);
      setInviteCode(code);
      setInviteDraft(code);
      setInviteToast("Code mis à jour.");
      window.setTimeout(() => setInviteToast(null), 2400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de modifier le code.");
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="text-xs font-semibold text-zinc-500 hover:text-zinc-300">
            ← Groupes
          </button>
          <h2 className="mt-1 text-lg font-black text-zinc-50">{group?.name ?? "Groupe"}</h2>
          {group?.description ? (
            <p className="mt-1 text-sm text-zinc-400">{group.description}</p>
          ) : null}
          <p className="mt-1 text-[11px] text-zinc-600">
            {members.length} membre{members.length > 1 ? "s" : ""} · {posts.length} spot
            {posts.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowMembers((v) => !v)}
            className="rounded-lg border border-white/10 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
          >
            Membres
          </button>
          {inviteCode ? (
            <button
              type="button"
              onClick={() => void copyInvite()}
              className="rounded-lg border border-sky-500/40 bg-sky-950/30 px-2.5 py-1 font-mono text-xs font-bold text-sky-100"
              title="Copier le code d’invitation"
            >
              {inviteCode}
            </button>
          ) : null}
          {isOwner ? (
            <button
              type="button"
              onClick={() => setShowInviteSettings((v) => !v)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                showInviteSettings
                  ? "border-sky-500/50 bg-sky-600/25 text-sky-100"
                  : "border-white/10 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              Code
            </button>
          ) : null}
        </div>
      </div>

      {inviteToast ? (
        <p className="rounded-lg border border-sky-500/30 bg-sky-950/25 px-3 py-1.5 text-xs text-sky-100">
          {inviteToast}
        </p>
      ) : null}

      {showInviteSettings && isOwner ? (
        <section className="space-y-2 rounded-xl border border-sky-500/25 bg-sky-950/20 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-sky-300/80">Configurer le code</p>
          <div className="flex gap-2">
            <input
              value={inviteDraft}
              onChange={(e) => setInviteDraft(normalizeInviteCode(e.target.value))}
              maxLength={12}
              disabled={inviteBusy}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-950/80 px-3 py-2 font-mono text-sm uppercase tracking-widest text-zinc-100 outline-none focus:border-sky-500/45"
            />
            <button
              type="button"
              disabled={inviteBusy}
              onClick={() => setInviteDraft(generateInviteCode())}
              className="shrink-0 rounded-lg border border-white/10 px-2.5 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              Aléa.
            </button>
          </div>
          <button
            type="button"
            disabled={inviteBusy || inviteDraft.length < 6}
            onClick={() => void saveInviteCode()}
            className="w-full rounded-lg border border-sky-500/40 bg-sky-600/25 py-2 text-sm font-semibold text-sky-100 disabled:opacity-50"
          >
            {inviteBusy ? "Enregistrement…" : "Enregistrer le code"}
          </button>
        </section>
      ) : null}

      {showMembers ? (
        <ul className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-zinc-950/50 p-3">
          {members.map((m) => (
            <li
              key={m.uid}
              className="rounded-full border border-white/10 bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-300"
            >
              {m.pseudo}
              {m.role === "owner" ? " · admin" : ""}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {posts.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-8 text-center text-sm text-zinc-500">
          Aucun spot dans ce groupe. Publie depuis le replayer en choisissant « Groupe privé ».
        </p>
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => {
            const discussionOpen = discussionPostId === post.id;
            return (
              <li
                key={post.id}
                className="flex flex-col gap-0 rounded-2xl border border-white/10 bg-zinc-950/55 sm:flex-row"
              >
                <button
                  type="button"
                  onClick={() => setDiscussionPostId((id) => (id === post.id ? null : post.id))}
                  className={`flex w-12 shrink-0 flex-col items-center justify-center rounded-l-2xl border-r border-white/10 text-center text-[10px] font-bold ${
                    discussionOpen ? "bg-sky-600/25 text-sky-100" : "text-zinc-500 hover:bg-zinc-900"
                  }`}
                >
                  💬
                </button>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!onOpenSpot(post)) setError("Impossible d’ouvrir ce spot.");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (!onOpenSpot(post)) setError("Impossible d’ouvrir ce spot.");
                    }
                  }}
                  className="min-w-0 flex-1 cursor-pointer p-4"
                >
                  <p className="text-sm font-bold text-zinc-100">{post.authorPseudo}</p>
                  <p className="text-[11px] text-zinc-500">{formatRelativeTime(post.createdAtMs)}</p>
                  {post.spotMeta ? (
                    <div className="mt-3 flex gap-3">
                      <PhrSpotFeedPreview post={post} />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm text-zinc-200">{post.spotMeta.question}</p>
                        <p className="text-xs text-zinc-500">
                          {post.spotMeta.heroAction.toUpperCase()}
                          {post.spotMeta.heroAmount != null ? ` ${post.spotMeta.heroAmount}` : ""}
                          {" · "}
                          {sourceValidationLabel(
                            post.spotMeta.sourceValidation as SpotSourceValidation,
                          )}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
                {discussionOpen ? (
                  <div className="w-full border-t border-white/10 p-3 sm:border-l sm:border-t-0">
                    <PhrFeedSpotDiscussion post={post} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
