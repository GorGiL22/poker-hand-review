"use client";

import {
  BOARD_TEXTURE_IDS,
  EMPTY_PHR_HAND_FILTER_SELECTION,
  HERO_POSTFLOP_IDS,
  HERO_PREFLOP_IDS,
  POSITION_IDS,
  RESULT_IDS,
  type BoardTextureId,
  type HeroPostflopId,
  type HeroPreflopId,
  type PhrHandFilterSelection,
  type PositionId,
  type ResultId,
} from "@/lib/phr-hand-filter-meta";

const PILL =
  "rounded-full border border-white/12 bg-zinc-800/60 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-zinc-700/70 active:scale-[0.98]";
const PILL_ON =
  "border-emerald-500/55 bg-emerald-950/35 text-emerald-50 shadow-[0_0_0_1px_rgba(16,185,129,0.2)] hover:border-emerald-400/65 hover:bg-emerald-950/45";

function toggle<T extends string>(list: T[], id: T): T[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function FilterRow<T extends string>({
  label,
  ids,
  selected,
  onChange,
}: {
  label: string;
  ids: readonly T[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => {
          const on = selected.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(toggle(selected, id))}
              className={`${PILL} ${on ? PILL_ON : ""}`}
            >
              {id}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PhrHandFiltersPanel({
  value,
  onChange,
  filteredCount,
}: {
  value: PhrHandFilterSelection;
  onChange: (next: PhrHandFilterSelection) => void;
  filteredCount: number;
}) {
  const reset = () => onChange({ ...EMPTY_PHR_HAND_FILTER_SELECTION });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Filtres mains</p>
        <button type="button" onClick={reset} className={`${PILL} text-[11px]`}>
          Reset filtres
        </button>
      </div>

      <FilterRow<HeroPreflopId>
        label="Action du héros (preflop)"
        ids={HERO_PREFLOP_IDS}
        selected={value.heroPreflop}
        onChange={(heroPreflop) => onChange({ ...value, heroPreflop })}
      />
      <FilterRow<HeroPostflopId>
        label="Action postflop"
        ids={HERO_POSTFLOP_IDS}
        selected={value.heroPostflop}
        onChange={(heroPostflop) => onChange({ ...value, heroPostflop })}
      />
      <FilterRow<PositionId>
        label="Position héros"
        ids={POSITION_IDS}
        selected={value.heroPosition}
        onChange={(heroPosition) => onChange({ ...value, heroPosition })}
      />
      <FilterRow<PositionId>
        label="Vs position"
        ids={POSITION_IDS}
        selected={value.villainPosition}
        onChange={(villainPosition) => onChange({ ...value, villainPosition })}
      />
      <FilterRow<ResultId>
        label="Résultat"
        ids={RESULT_IDS}
        selected={value.result}
        onChange={(result) => onChange({ ...value, result })}
      />
      <FilterRow<BoardTextureId>
        label="Texture flop"
        ids={BOARD_TEXTURE_IDS}
        selected={value.boardTexture}
        onChange={(boardTexture) => onChange({ ...value, boardTexture })}
      />

      <p className="rounded-xl border border-white/10 bg-black/25 px-2 py-2 text-center text-xs text-zinc-400 backdrop-blur-sm">
        {filteredCount} main{filteredCount !== 1 ? "s" : ""} après filtres
      </p>
    </div>
  );
}
