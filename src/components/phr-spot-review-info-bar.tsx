"use client";

import { useState } from "react";

import type { PublicHandPost } from "@/lib/phr-public-feed";
import {
  categoryLabel,
  resolveSpotTournamentInfo,
  sourceValidationLabel,
  type SpotCategory,
  type SpotSourceValidation,
  type SpotTournamentInfo,
} from "@/lib/phr-spots";

const RAIL =
  "mb-2 flex min-h-0 shrink-0 flex-col gap-1.5 rounded-2xl border border-white/10 bg-zinc-950/50 px-2.5 py-2 backdrop-blur-sm sm:mb-3 sm:px-3";

const TOUR_CHIP_ROW =
  "flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-medium leading-tight text-zinc-300";

function SpotTournamentRail({ tour }: { tour: SpotTournamentInfo }) {
  const hasAny = tour.tournamentName || tour.buyIn || tour.blindsLabel || tour.levelLabel;
  if (!hasAny) return null;

  return (
    <div className={TOUR_CHIP_ROW}>
      {tour.tournamentName ? (
        <span className="max-w-[min(100%,14rem)] truncate font-semibold text-zinc-100" title={tour.tournamentName}>
          {tour.tournamentName}
        </span>
      ) : null}
      {tour.buyIn ? (
        <span className="whitespace-nowrap">
          <span className="text-zinc-500">Buy-in </span>
          <span className="text-zinc-100">{tour.buyIn} €</span>
        </span>
      ) : null}
      {tour.blindsLabel ? (
        <span className="whitespace-nowrap">
          <span className="text-zinc-500">Blinds </span>
          <span className="text-zinc-100">{tour.blindsLabel}</span>
        </span>
      ) : null}
      {tour.levelLabel ? (
        <span className="max-w-[9rem] truncate text-zinc-500" title={tour.levelLabel}>
          {tour.levelLabel}
        </span>
      ) : null}
    </div>
  );
}

type PhrSpotReviewInfoBarProps = {
  post: PublicHandPost;
};

export function PhrSpotReviewInfoBar({ post }: PhrSpotReviewInfoBarProps) {
  const [open, setOpen] = useState(false);
  const meta = post.spotMeta;
  const tour = resolveSpotTournamentInfo(post);

  const authorLine = meta?.heroAction
    ? `${meta.heroAction.toUpperCase()}${meta.heroAmount != null ? ` ${meta.heroAmount}` : ""}`
    : "—";

  const questionPreview =
    meta?.question?.trim() ||
    post.summary.split("\n").find((line) => line.trim().length > 0) ||
    "Spot sans question";

  return (
    <div className={RAIL}>
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-row sm:items-center sm:gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="phr-spot-info-panel"
          title="Infos sur le spot"
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition ${
            open
              ? "border-violet-500/70 bg-violet-600/25 text-violet-100"
              : "border-zinc-600/70 bg-zinc-800/60 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800"
          }`}
        >
          <svg
            className="size-3.5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 7h.01" strokeLinecap="round" />
          </svg>
          Info
        </button>
        <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-zinc-400" title={questionPreview}>
          {questionPreview}
        </p>
      </div>

      <SpotTournamentRail tour={tour} />

      {open ? (
        <div
          id="phr-spot-info-panel"
          className="w-full rounded-xl border border-violet-500/25 bg-violet-950/20 px-3 py-2.5 text-sm"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-300/90">
            {meta?.category ? categoryLabel(meta.category as SpotCategory) : "Spot"}
            {meta?.stepLabel ? ` · ${meta.stepLabel}` : ""}
          </p>
          <p className="mt-2 font-semibold leading-snug text-zinc-100">
            {meta?.question?.trim() || "Aucune question renseignée."}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Ligne de {post.authorPseudo} :{" "}
            <span className="font-semibold text-zinc-200">{authorLine}</span>
            {meta?.sourceValidation ? (
              <>
                {" "}
                · {sourceValidationLabel(meta.sourceValidation as SpotSourceValidation)}
              </>
            ) : null}
          </p>
        </div>
      ) : (
        <div className="flex shrink-0 items-center">
          <div className={`${TOUR_CHIP_ROW} border-zinc-700/40`}>
            <span className="text-zinc-500">Réponse</span>
            <span className="font-semibold text-zinc-100">{authorLine}</span>
            {meta?.sourceValidation ? (
              <span className="truncate text-zinc-500">
                {sourceValidationLabel(meta.sourceValidation as SpotSourceValidation)}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
