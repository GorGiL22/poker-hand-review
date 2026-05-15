"use client";

import { PhrCardBack, PhrPlayingCard } from "@/components/phr-playing-card";
import type { MonEspaceHand } from "@/components/phr-mon-espace";
import { getHandLibraryPreview } from "@/lib/phr-hand-library-preview";

const RESULT_STYLES = {
  win: "border-emerald-500/35 bg-emerald-950/30 text-emerald-100",
  loss: "border-rose-500/35 bg-rose-950/30 text-rose-200",
  neutral: "border-zinc-600/50 bg-zinc-900/50 text-zinc-400",
} as const;

function CardGroup({
  label,
  cards,
  emptySlots = 0,
}: {
  label: string;
  cards: string[];
  emptySlots?: number;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">{label}</span>
      <div className="flex items-center gap-0.5">
        {cards.length > 0
          ? cards.map((card, i) => (
              <PhrPlayingCard key={`${label}-${card}-${i}`} card={card} size="xs" />
            ))
          : Array.from({ length: emptySlots }, (_, i) => <PhrCardBack key={`${label}-empty-${i}`} size="xs" />)}
        {cards.length === 0 && emptySlots === 0 ? (
          <span className="text-[10px] text-zinc-600">—</span>
        ) : null}
      </div>
    </div>
  );
}

type PhrHandLibraryRowProps = {
  hand: MonEspaceHand;
  label: string;
  active?: boolean;
  onOpen: () => void;
};

export function PhrHandLibraryRow({ hand, label, active = false, onOpen }: PhrHandLibraryRowProps) {
  const preview = getHandLibraryPreview(hand);
  const boardAll = [...preview.flop, ...preview.turn, ...preview.river];

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`group w-full rounded-2xl border p-3 text-left transition hover:border-violet-500/35 hover:bg-zinc-900/70 ${
          active
            ? "border-violet-500/50 bg-violet-950/25 shadow-[inset_0_1px_0_rgba(139,92,246,0.15)]"
            : "border-white/10 bg-zinc-950/45"
        }`}
      >
        <div className="flex gap-3">
          <div
            className="relative hidden aspect-[4/3] w-[4.5rem] shrink-0 overflow-hidden rounded-lg border border-emerald-500/20 bg-[radial-gradient(circle_at_50%_42%,rgba(61,110,52,0.9),rgba(28,52,26,0.98))] sm:block"
            aria-hidden
          >
            <div className="absolute inset-[12%] rounded-[999px] border border-white/12" />
            <div className="absolute left-1/2 top-[38%] z-10 flex -translate-x-1/2">
              {boardAll.length > 0 ? (
                boardAll.slice(0, 5).map((card, i) => (
                  <span key={`b-${card}-${i}`} className={i > 0 ? "-ml-1" : ""}>
                    <PhrPlayingCard card={card} size="xs" />
                  </span>
                ))
              ) : (
                <div className="flex gap-0.5 opacity-35">
                  {[0, 1, 2].map((i) => (
                    <PhrCardBack key={`eb-${i}`} size="xs" />
                  ))}
                </div>
              )}
            </div>
            {preview.heroCards.length > 0 ? (
              <div className="absolute bottom-[10%] left-1/2 z-10 flex -translate-x-1/2">
                {preview.heroCards.map((card, i) => (
                  <span
                    key={`h-${card}-${i}`}
                    className={i === 0 ? "origin-bottom-right -rotate-6" : "-ml-2 origin-bottom-left rotate-6"}
                  >
                    <PhrPlayingCard card={card} size="xs" />
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-100">{label}</p>
                {hand.tournamentName ? (
                  <p className="truncate text-[11px] text-zinc-500">{hand.tournamentName}</p>
                ) : null}
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${RESULT_STYLES[preview.resultTone]}`}
              >
                {preview.resultLabel}
              </span>
            </div>

            <div className="flex flex-wrap items-end gap-x-3 gap-y-2 sm:gap-x-4">
              <CardGroup label="Hero" cards={preview.heroCards} emptySlots={2} />
              <CardGroup label="Flop" cards={preview.flop} emptySlots={3} />
              {preview.turn.length > 0 ? <CardGroup label="Turn" cards={preview.turn} /> : null}
              {preview.river.length > 0 ? <CardGroup label="River" cards={preview.river} /> : null}
              {preview.villainCards.length > 0 ? (
                <CardGroup
                  label={preview.villainName ? `Vs ${preview.villainName}` : "Vilain"}
                  cards={preview.villainCards}
                />
              ) : null}
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">BB</span>
                <span className="text-xs font-semibold tabular-nums text-zinc-200">{preview.blindsLabel}</span>
              </div>
            </div>

            <p className="text-[10px] text-violet-300/80 opacity-0 transition group-hover:opacity-100">
              Ouvrir dans le replayer →
            </p>
          </div>
        </div>
      </button>
    </li>
  );
}
