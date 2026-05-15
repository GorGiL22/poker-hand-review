"use client";

import { useEffect, useState } from "react";

import { PhrSpotCommentLike } from "@/components/phr-spot-comment-like";
import {
  saveSpotViewerResponse,
  submitSpotComment,
  subscribeSpotFeedDiscussion,
  subscribeSpotViewerResponse,
  type SpotFeedDiscussionItem,
} from "@/lib/phr-spot-review";
import type { SpotHeroAction } from "@/lib/phr-spots";
import type { PublicHandPost } from "@/lib/phr-public-feed";
import { usePhrFirebase } from "@/lib/use-phr-firebase";

const BAR_BTN =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-white/10 bg-zinc-800/70 px-2 text-xs font-bold uppercase tracking-wide text-zinc-100 transition hover:border-white/18 hover:bg-zinc-700/80 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 sm:text-sm";

const BAR_BTN_ON =
  "border-violet-500/55 bg-violet-600/30 text-violet-100 shadow-[0_0_0_1px_rgba(139,92,246,0.25)]";

const BAR_BTN_ACCENT =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-violet-500/45 bg-violet-600/35 px-3 text-xs font-bold text-violet-50 transition hover:bg-violet-600/50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 sm:px-4 sm:text-sm";

const PHR_FIELD =
  "w-full rounded-lg border border-white/10 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500/45 focus:ring-1 focus:ring-violet-500/25";

type PhrSpotReviewBottomBarProps = {
  post: PublicHandPost;
  onBack: () => void;
};

export function PhrSpotReviewBottomBar({ post, onBack }: PhrSpotReviewBottomBarProps) {
  const { user, pseudo, firebaseConfigured } = usePhrFirebase();
  const [heroAction, setHeroAction] = useState<SpotHeroAction | null>(null);
  const [heroAmount, setHeroAmount] = useState("");
  const [commentText, setCommentText] = useState("");
  const [discussion, setDiscussion] = useState<SpotFeedDiscussionItem[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needsAmount = heroAction === "call" || heroAction === "raise";
  const displayName = pseudo ?? user?.displayName ?? "Joueur";

  useEffect(() => {
    if (!firebaseConfigured) return;
    const unsubDiscussion = subscribeSpotFeedDiscussion(post.id, setDiscussion);
    const unsubMine = subscribeSpotViewerResponse(post.id, user?.uid ?? null, (response) => {
      if (response) {
        setHeroAction(response.action);
        setHeroAmount(response.amount != null ? String(response.amount) : "");
      }
    });
    return () => {
      unsubDiscussion();
      unsubMine();
    };
  }, [post.id, user?.uid, firebaseConfigured]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }

  function requireAuth(): boolean {
    if (user) return true;
    setError("Connecte-toi pour participer au spot.");
    return false;
  }

  async function onPublishAnalysis() {
    if (!requireAuth()) return;
    if (!heroAction) {
      setError("Choisis Fold, Call ou Raise.");
      return;
    }
    const parsedAmount = needsAmount ? Number.parseFloat(heroAmount.replace(",", ".")) : null;
    if (needsAmount && (!Number.isFinite(parsedAmount) || (parsedAmount ?? 0) < 0)) {
      setError("Indique un montant pour Call ou Raise.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const analysisText = commentText.trim() || null;
      await saveSpotViewerResponse(
        post.id,
        user!.uid,
        displayName,
        heroAction,
        needsAmount ? parsedAmount : null,
        analysisText,
      );
      setCommentText("");
      setShowComments(false);
      flash("Analyse publiée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publication impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function onPublishCommentOnly() {
    if (!requireAuth()) return;
    if (!commentText.trim()) {
      setError("Écris un commentaire.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitSpotComment(post.id, user!.uid, displayName, commentText);
      setCommentText("");
      flash("Commentaire publié.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commentaire impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {showComments && (
        <div
          className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[80] mx-auto max-h-[min(50vh,22rem)] w-full max-w-lg px-3 sm:px-5"
          role="dialog"
          aria-label="Commentaires"
        >
          <div className="flex max-h-[min(50vh,22rem)] flex-col overflow-hidden rounded-2xl border border-white/12 bg-zinc-950/95 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <p className="text-sm font-bold text-zinc-100">Analyses & commentaires</p>
              <button
                type="button"
                onClick={() => setShowComments(false)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              >
                Fermer
              </button>
            </div>
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {discussion.length === 0 && (
                <li className="text-center text-xs text-zinc-500">Aucune analyse pour l’instant.</li>
              )}
              {discussion.map((item) =>
                item.kind === "analysis" ? (
                  <li
                    key={`analysis-${item.id}`}
                    className="rounded-lg border border-violet-500/20 bg-violet-950/25 px-3 py-2 text-sm text-zinc-200"
                  >
                    <p className="text-xs font-semibold text-zinc-400">{item.authorPseudo}</p>
                    <p className="mt-1 font-bold text-violet-100">
                      {item.action.toUpperCase()}
                      {item.amount != null ? ` ${item.amount}` : ""}
                    </p>
                    {item.analysisText ? <p className="mt-1 leading-relaxed">{item.analysisText}</p> : null}
                  </li>
                ) : (
                  <li
                    key={`comment-${item.id}`}
                    className="rounded-lg border border-white/8 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-zinc-400">{item.authorPseudo}</p>
                      <PhrSpotCommentLike
                        spotId={post.id}
                        commentId={item.id}
                        likeCount={item.likeCount}
                        liked={user ? Boolean(item.likes[user.uid]) : false}
                        onAuthRequired={() => setError("Connecte-toi pour liker.")}
                      />
                    </div>
                    <p className="mt-1 leading-relaxed">{item.text}</p>
                  </li>
                ),
              )}
            </ul>
            <div className="shrink-0 space-y-2 border-t border-white/10 p-3">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={2}
                placeholder="Ton avis…"
                disabled={!user || busy}
                className={`${PHR_FIELD} resize-none`}
              />
              <button
                type="button"
                disabled={!user || busy || !commentText.trim()}
                onClick={() => void onPublishCommentOnly()}
                className="w-full rounded-lg border border-white/12 bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-100 disabled:opacity-50"
              >
                Envoyer
              </button>
            </div>
          </div>
        </div>
      )}

      {(needsAmount || error || toast) && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[75] px-3 sm:px-5">
          <div className="mx-auto max-w-lg space-y-2">
            {needsAmount && (
              <input
                value={heroAmount}
                onChange={(e) => setHeroAmount(e.target.value)}
                inputMode="decimal"
                placeholder="Montant (Call / Raise)"
                className={`${PHR_FIELD} shadow-lg`}
              />
            )}
            {error && (
              <p className="rounded-lg border border-rose-500/35 bg-rose-950/90 px-3 py-2 text-xs text-rose-100">
                {error}
              </p>
            )}
            {toast && (
              <p className="rounded-lg border border-emerald-500/35 bg-emerald-950/90 px-3 py-2 text-xs text-emerald-100">
                {toast}
              </p>
            )}
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-[85] border-t border-white/10 bg-zinc-950/92 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl sm:px-4"
        aria-label="Actions spot"
      >
        <div className="mx-auto flex max-w-3xl items-stretch gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onBack}
            title="Retour au fil"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-zinc-800/70 text-lg text-zinc-200 transition hover:bg-zinc-700/80"
          >
            ←
          </button>
          {(["fold", "call", "raise"] as const).map((action) => (
            <button
              key={action}
              type="button"
              disabled={busy}
              onClick={() => {
                setError(null);
                setHeroAction(action);
              }}
              className={`${BAR_BTN} ${heroAction === action ? BAR_BTN_ON : ""}`}
            >
              {action === "fold" ? "Fold" : action === "call" ? "Call" : "Raise"}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
              setShowComments((v) => !v);
            }}
            className={`${BAR_BTN} max-w-[5.5rem] sm:max-w-none ${showComments ? BAR_BTN_ON : ""}`}
          >
            Commentaire
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onPublishAnalysis()}
            className={BAR_BTN_ACCENT}
          >
            Publier mon analyse
          </button>
        </div>
      </nav>
    </>
  );
}
