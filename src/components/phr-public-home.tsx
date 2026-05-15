"use client";

import { type DragEvent, useEffect, useState } from "react";

import {
  PUBLIC_REACTION_META,
  subscribePublicPosts,
  toggleFeedReaction,
  type PublicHandPost,
  type PublicReaction,
} from "@/lib/phr-public-feed";
import { hasSeenWelcomePanel, markWelcomePanelSeen } from "@/lib/phr-welcome";
import { usePhrFirebase } from "@/lib/use-phr-firebase";

const PHR_BTN_TOOL =
  "rounded-xl border border-white/10 bg-zinc-800/55 px-3.5 py-2 text-sm font-semibold text-zinc-100 shadow-sm transition hover:border-white/18 hover:bg-zinc-700/70 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";

function formatRelativeTime(ms: number): string {
  const delta = Date.now() - ms;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "À l’instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days} j`;
}

function handPreviewLine(hand: Record<string, unknown>): string {
  const hero = typeof hand.heroName === "string" ? hand.heroName : "Hero";
  const tournament =
    typeof hand.tournamentName === "string" && hand.tournamentName.trim().length > 0
      ? hand.tournamentName
      : "Main partagée";
  const tag = typeof hand.tag === "string" ? hand.tag.toUpperCase() : "MAIN";
  return `${hero} · ${tag} · ${tournament}`;
}

type PhrPublicHomeProps = {
  welcomeDropActive: boolean;
  onImportClick: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  cloudLoading?: boolean;
  cloudLoadError?: string | null;
  importError?: string | null;
};

export function PhrPublicHome({
  welcomeDropActive,
  onImportClick,
  onDragOver,
  onDragLeave,
  onDrop,
  cloudLoading = false,
  cloudLoadError = null,
  importError = null,
}: PhrPublicHomeProps) {
  const { user, authLoading, firebaseConfigured } = usePhrFirebase();
  const [posts, setPosts] = useState<PublicHandPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [reactBusyId, setReactBusyId] = useState<string | null>(null);
  const [showWelcomePanel, setShowWelcomePanel] = useState(false);

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
    if (!firebaseConfigured) {
      queueMicrotask(() => {
        setLoading(false);
        setPosts([]);
      });
      return;
    }

    setLoading(true);
    const unsub = subscribePublicPosts(
      (next) => {
        setPosts(next);
        setLoading(false);
        setFeedError(null);
      },
      (err) => {
        setFeedError(err.message);
        setLoading(false);
      },
    );
    return unsub;
  }, [firebaseConfigured]);

  async function onReact(postId: string, reaction: PublicReaction) {
    if (!user) {
      setFeedError("Connecte-toi pour réagir aux mains.");
      return;
    }
    setReactBusyId(postId);
    setFeedError(null);
    try {
      const post = posts.find((p) => p.id === postId);
      if (!post) throw new Error("Publication introuvable.");
      await toggleFeedReaction(post.feedSource, postId, user.uid, reaction);
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : "Impossible d’enregistrer la réaction.");
    } finally {
      setReactBusyId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {showWelcomePanel ? (
        <header className="shrink-0 rounded-2xl border border-white/10 bg-zinc-950/50 px-4 py-4 backdrop-blur-sm sm:px-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300/90">Fil public</p>
          <h1 className="mt-1 text-xl font-black tracking-tight text-zinc-50 sm:text-2xl">Bienvenue sur SpotLab</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Analyse tes mains simplement et partage-les avec les autres pour obtenir leur avis.
          </p>
        </header>
      ) : (
        <p className="shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300/90">Fil public</p>
      )}

      {user && cloudLoading && (
        <p className="shrink-0 rounded-xl border border-violet-500/25 bg-violet-950/25 px-3 py-2 text-sm text-violet-100">
          Chargement de tes mains depuis ton compte…
        </p>
      )}
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

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {loading && (
          <p className="rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-6 text-center text-sm text-zinc-500">
            Chargement du fil…
          </p>
        )}
        {!loading && feedError && (
          <p className="rounded-2xl border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
            {feedError}
          </p>
        )}
        {!loading && !feedError && posts.length === 0 && (
          <p className="rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-8 text-center text-sm text-zinc-500">
            Aucune main publiée pour l’instant. Importe tes historiques puis publie une main pour lancer la
            discussion.
          </p>
        )}
        {posts.map((post) => (
          <article
            key={post.id}
            className="rounded-2xl border border-white/10 bg-zinc-950/55 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-zinc-100">{post.authorPseudo}</p>
                <p className="text-[11px] text-zinc-500">{formatRelativeTime(post.createdAtMs)}</p>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                {post.spotMeta?.category
                  ? post.spotMeta.category.toUpperCase()
                  : handPreviewLine(post.hand)}
              </p>
            </div>
            {post.spotMeta ? (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] font-medium text-violet-300/90">{post.spotMeta.stepLabel}</p>
                <p className="text-sm leading-relaxed text-zinc-200">{post.spotMeta.question}</p>
                <p className="text-xs text-zinc-500">
                  Ma ligne :{" "}
                  <span className="font-semibold text-zinc-300">
                    {post.spotMeta.heroAction.toUpperCase()}
                    {post.spotMeta.heroAmount != null ? ` ${post.spotMeta.heroAmount}` : ""}
                  </span>
                  {" · "}
                  {post.spotMeta.sourceValidation}
                </p>
              </div>
            ) : (
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-black/25 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
                {post.summary}
              </pre>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.keys(PUBLIC_REACTION_META) as PublicReaction[]).map((reaction) => {
                const meta = PUBLIC_REACTION_META[reaction];
                const active = user ? post.reactions[user.uid] === reaction : false;
                const count = post.reactionCounts[reaction] ?? 0;
                return (
                  <button
                    key={`${post.id}-${reaction}`}
                    type="button"
                    disabled={reactBusyId === post.id}
                    onClick={() => void onReact(post.id, reaction)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                      active
                        ? "border-violet-400/50 bg-violet-600/25 text-violet-100"
                        : "border-white/10 bg-zinc-900/70 text-zinc-200 hover:border-white/18 hover:bg-zinc-800/80"
                    }`}
                    title={user ? meta.label : "Connecte-toi pour réagir"}
                  >
                    <span aria-hidden>{meta.emoji}</span>
                    <span>{meta.label}</span>
                    <span className="tabular-nums text-zinc-400">{count}</span>
                  </button>
                );
              })}
            </div>
          </article>
        ))}
      </div>

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
    </div>
  );
}
