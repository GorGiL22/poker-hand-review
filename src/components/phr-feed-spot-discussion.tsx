"use client";

import { useEffect, useState } from "react";

import { PhrSpotCommentLike } from "@/components/phr-spot-comment-like";
import {
  submitSpotComment,
  subscribeSpotFeedDiscussion,
  type SpotFeedDiscussionItem,
} from "@/lib/phr-spot-review";
import type { PublicHandPost } from "@/lib/phr-public-feed";
import { usePhrFirebase } from "@/lib/use-phr-firebase";

const PHR_FIELD =
  "w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500/45 focus:ring-1 focus:ring-violet-500/25";

function formatRelativeTime(ms: number): string {
  const delta = Date.now() - ms;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "À l’instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  return `Il y a ${Math.floor(hours / 24)} j`;
}

function formatActionLine(action: string, amount: number | null): string {
  const label = action.toUpperCase();
  return amount != null ? `${label} ${amount}` : label;
}

type PhrFeedSpotDiscussionProps = {
  post: PublicHandPost;
  onClose?: () => void;
};

export function PhrFeedSpotDiscussion({ post, onClose }: PhrFeedSpotDiscussionProps) {
  const { user, pseudo, firebaseConfigured } = usePhrFirebase();
  const [items, setItems] = useState<SpotFeedDiscussionItem[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured || post.feedSource !== "spots") {
      queueMicrotask(() => setItems([]));
      return;
    }
    return subscribeSpotFeedDiscussion(post.id, setItems);
  }, [post.id, post.feedSource, firebaseConfigured]);

  async function onSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      setError("Connecte-toi pour commenter.");
      return;
    }
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await submitSpotComment(post.id, user.uid, pseudo ?? user.displayName ?? "Joueur", draft);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mt-2 rounded-xl border border-white/10 bg-black/35 p-3"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-300/90">
          Analyses & commentaires
        </p>
        <button
          type="button"
          onClick={() => onClose?.()}
          className="rounded-lg px-2 py-0.5 text-xs font-semibold text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
        >
          Fermer
        </button>
      </div>

      <ul className="max-h-52 space-y-2 overflow-y-auto">
        {items.length === 0 && (
          <li className="py-2 text-center text-xs text-zinc-500">Aucune analyse pour l’instant.</li>
        )}
        {items.map((item) =>
          item.kind === "analysis" ? (
            <li
              key={`analysis-${item.id}`}
              className="rounded-lg border border-violet-500/20 bg-violet-950/20 px-3 py-2"
            >
              <p className="text-xs font-semibold text-zinc-300">
                {item.authorPseudo}{" "}
                <span className="font-normal text-zinc-500">{formatRelativeTime(item.createdAtMs)}</span>
              </p>
              <p className="mt-1 text-sm font-bold text-violet-100">
                {formatActionLine(item.action, item.amount)}
              </p>
              {item.analysisText ? (
                <p className="mt-1 text-sm leading-relaxed text-zinc-200">{item.analysisText}</p>
              ) : null}
            </li>
          ) : (
            <li key={`comment-${item.id}`} className="rounded-lg border border-white/8 bg-zinc-900/50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-zinc-300">
                  {item.authorPseudo}{" "}
                  <span className="font-normal text-zinc-500">{formatRelativeTime(item.createdAtMs)}</span>
                </p>
                <PhrSpotCommentLike
                  spotId={post.id}
                  commentId={item.id}
                  likeCount={item.likeCount}
                  liked={user ? Boolean(item.likes[user.uid]) : false}
                  onAuthRequired={() => setError("Connecte-toi pour liker.")}
                />
              </div>
              <p className="mt-1 text-sm leading-relaxed text-zinc-200">{item.text}</p>
            </li>
          ),
        )}
      </ul>

      <form onSubmit={(e) => void onSubmitComment(e)} className="mt-3 space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder={user ? "Ajouter un commentaire…" : "Connecte-toi pour commenter"}
          disabled={!user || busy}
          className={`${PHR_FIELD} resize-none`}
        />
        <button
          type="submit"
          disabled={!user || busy || !draft.trim()}
          className="w-full rounded-lg border border-white/12 bg-zinc-800/80 px-3 py-2 text-sm font-semibold text-zinc-100 disabled:opacity-50"
        >
          Envoyer
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </div>
  );
}
