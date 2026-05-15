"use client";

import { useState } from "react";

import { toggleSpotCommentLike } from "@/lib/phr-spot-review";
import { usePhrFirebase } from "@/lib/use-phr-firebase";

type PhrSpotCommentLikeProps = {
  spotId: string;
  commentId: string;
  likeCount: number;
  liked: boolean;
  onAuthRequired?: () => void;
};

export function PhrSpotCommentLike({
  spotId,
  commentId,
  likeCount,
  liked,
  onAuthRequired,
}: PhrSpotCommentLikeProps) {
  const { user } = usePhrFirebase();
  const [busy, setBusy] = useState(false);

  async function onToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) {
      onAuthRequired?.();
      return;
    }
    setBusy(true);
    try {
      await toggleSpotCommentLike(spotId, commentId, user.uid);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={(e) => void onToggle(e)}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition disabled:opacity-50 ${
        liked
          ? "border-violet-400/50 bg-violet-600/25 text-violet-100"
          : "border-white/10 bg-zinc-800/60 text-zinc-400 hover:border-white/18 hover:text-zinc-200"
      }`}
      title={user ? (liked ? "Retirer ton like" : "Utile") : "Connecte-toi pour liker"}
    >
      <span aria-hidden>👍</span>
      <span className="tabular-nums">{likeCount}</span>
    </button>
  );
}
