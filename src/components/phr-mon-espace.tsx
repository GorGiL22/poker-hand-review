"use client";

import { useEffect, useMemo, useState } from "react";

import { PhrHandFiltersPanel } from "@/components/phr-hand-filters";
import { PhrHandLibraryRow } from "@/components/phr-hand-library-row";
import { PhrSpotFeedPreview } from "@/components/phr-spot-feed-preview";
import {
  handMatchesPhrFilters,
  phrFiltersAreActive,
  type PhrHandFilterSelection,
  type PhrHandFilterShape,
} from "@/lib/phr-hand-filter-meta";
import { subscribeUserSpots, type PublicHandPost } from "@/lib/phr-public-feed";
import { categoryLabel, sourceValidationLabel, type SpotCategory, type SpotSourceValidation } from "@/lib/phr-spots";
import {
  buildTournamentLibrary,
  EMPTY_TOURNAMENT_LIBRARY_FILTERS,
  filterTournamentLibrary,
  formatMonthLabel,
  uniqueBuyIns,
  uniqueDateMonths,
  uniquePlatforms,
  type TournamentLibraryFilters,
} from "@/lib/phr-tournament-library";
import { usePhrFirebase } from "@/lib/use-phr-firebase";

const PHR_BTN =
  "rounded-xl border border-white/10 bg-zinc-800/55 px-3.5 py-2 text-sm font-semibold text-zinc-100 transition hover:border-white/18 hover:bg-zinc-700/70";

const PHR_TAB =
  "rounded-xl border px-4 py-2 text-sm font-bold transition";
const PHR_TAB_ON =
  "border-violet-500/50 bg-violet-600/25 text-violet-100";
const PHR_TAB_OFF =
  "border-white/10 bg-zinc-900/50 text-zinc-400 hover:border-white/18 hover:text-zinc-200";

const PHR_FIELD_SELECT =
  "rounded-lg border border-white/10 bg-zinc-950/70 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-violet-500/40";

export type MonEspaceHand = PhrHandFilterShape & {
  id: string;
  tournamentName?: string;
  sourceFile?: string;
  dateTime?: string;
  levelLabel?: string;
  buyInEuro?: number | null;
  platform?: string;
};

type PhrMonEspaceProps = {
  onBack: () => void;
  onOpenSpot: (post: PublicHandPost) => boolean;
  onDeleteSpot?: (post: PublicHandPost) => void;
  onOpenHand: (handId: string) => void;
  onReplayTournament: (tournamentKey: string) => void;
  onPublishTournament?: (tournamentKey: string) => void;
  onDeleteTournament?: (tournamentKey: string) => void;
  onImportClick: () => void;
  libraryHands: MonEspaceHand[];
  rowLabel: (hand: MonEspaceHand) => string;
  tournamentKey: (hand: MonEspaceHand) => string;
  handFilters: PhrHandFilterSelection;
  onHandFiltersChange: (next: PhrHandFilterSelection) => void;
  selectedHandId?: string;
  overlay?: boolean;
};

type TabId = "spots" | "mains" | "tournois";

function formatRelativeTime(ms: number): string {
  const delta = Date.now() - ms;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "À l’instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  return `Il y a ${Math.floor(hours / 24)} j`;
}

function visibilityLabel(vis: string | undefined): string {
  if (vis === "group") return "Groupe";
  if (vis === "private") return "Perso";
  if (vis === "public") return "Public";
  return "Spot";
}

export function PhrMonEspace({
  onBack,
  onOpenSpot,
  onDeleteSpot,
  onOpenHand,
  onReplayTournament,
  onPublishTournament,
  onDeleteTournament,
  onImportClick,
  libraryHands,
  rowLabel,
  tournamentKey,
  handFilters,
  onHandFiltersChange,
  selectedHandId,
  overlay = false,
}: PhrMonEspaceProps) {
  const { user, authLoading, firebaseConfigured } = usePhrFirebase();
  const [tab, setTab] = useState<TabId>("spots");
  const [spots, setSpots] = useState<PublicHandPost[]>([]);
  const [spotsLoading, setSpotsLoading] = useState(true);
  const [spotsError, setSpotsError] = useState<string | null>(null);
  const [espaceTournament, setEspaceTournament] = useState("ALL");
  const [mainsFiltersOpen, setMainsFiltersOpen] = useState(false);
  const [confirmDeleteTournamentKey, setConfirmDeleteTournamentKey] = useState<string | null>(null);
  const [confirmDeleteSpotId, setConfirmDeleteSpotId] = useState<string | null>(null);
  const [tournamentFilters, setTournamentFilters] = useState<TournamentLibraryFilters>(
    EMPTY_TOURNAMENT_LIBRARY_FILTERS,
  );

  useEffect(() => {
    if (!firebaseConfigured || authLoading) return;
    if (!user) {
      queueMicrotask(() => {
        setSpots([]);
        setSpotsLoading(false);
      });
      return;
    }
    setSpotsLoading(true);
    const unsub = subscribeUserSpots(
      user.uid,
      (next) => {
        setSpots(next);
        setSpotsLoading(false);
        setSpotsError(null);
      },
      (err) => {
        setSpotsError(err.message);
        setSpotsLoading(false);
      },
    );
    return unsub;
  }, [user, authLoading, firebaseConfigured]);

  const tournamentOptions = useMemo(() => {
    const keys = new Map<string, string>();
    for (const hand of libraryHands) {
      const key = tournamentKey(hand);
      if (!keys.has(key)) keys.set(key, hand.tournamentName?.trim() || key);
    }
    return [
      { key: "ALL", label: "Tous les tournois" },
      ...Array.from(keys.entries()).map(([key, label]) => ({ key, label })),
    ];
  }, [libraryHands, tournamentKey]);

  const filteredHands = useMemo(() => {
    let list = libraryHands.filter((hand) => handMatchesPhrFilters(hand, handFilters));
    if (espaceTournament !== "ALL") {
      list = list.filter((hand) => tournamentKey(hand) === espaceTournament);
    }
    return list;
  }, [libraryHands, handFilters, espaceTournament, tournamentKey]);

  const tournamentLibrary = useMemo(
    () => buildTournamentLibrary(libraryHands, (hand) => tournamentKey(hand as MonEspaceHand)),
    [libraryHands, tournamentKey],
  );

  const platformOptions = useMemo(() => uniquePlatforms(tournamentLibrary), [tournamentLibrary]);
  const buyInOptions = useMemo(() => uniqueBuyIns(tournamentLibrary), [tournamentLibrary]);
  const dateMonthOptions = useMemo(() => uniqueDateMonths(tournamentLibrary), [tournamentLibrary]);

  const filteredTournaments = useMemo(
    () => filterTournamentLibrary(tournamentLibrary, tournamentFilters),
    [tournamentLibrary, tournamentFilters],
  );

  const shellClass = overlay
    ? "fixed inset-0 z-[90] flex flex-col border border-white/10 bg-zinc-950/98 text-zinc-100 shadow-[0_0_0_1px_rgba(0,0,0,0.5)] backdrop-blur-xl"
    : "flex min-h-0 flex-1 flex-col gap-4";

  return (
    <div
      data-phr-mes-mains-page
      className={shellClass}
      role={overlay ? "dialog" : undefined}
      aria-modal={overlay ? true : undefined}
      aria-labelledby="phr-mon-espace-title"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 bg-black/20 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={onBack} className={PHR_BTN}>
          {overlay ? "Fermer" : "Accueil"}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-300/80">SpotLab</p>
          <h1 id="phr-mon-espace-title" className="text-lg font-black text-zinc-50">
            Mon espace
          </h1>
        </div>
      </header>

      <nav className="flex shrink-0 flex-wrap gap-2 border-b border-white/10 px-4 py-3">
        {(
          [
            ["spots", "Mes spots"],
            ["mains", "Mains"],
            ["tournois", "Tournois"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`${PHR_TAB} ${tab === id ? PHR_TAB_ON : PHR_TAB_OFF}`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {tab === "spots" && (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {!firebaseConfigured ? (
              <p className="rounded-xl border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-sm text-rose-200">
                Firebase non configuré — tes spots ne peuvent pas être chargés.
              </p>
            ) : null}
            {authLoading ? (
              <p className="text-sm text-zinc-500">Chargement…</p>
            ) : !user ? (
              <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
                Connecte-toi pour voir tes spots publiés.
              </p>
            ) : spotsError ? (
              <p className="rounded-xl border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-sm text-rose-200">
                {spotsError}
              </p>
            ) : spotsLoading ? (
              <p className="text-sm text-zinc-500">Chargement de tes spots…</p>
            ) : spots.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/15 bg-zinc-950/40 px-4 py-10 text-center text-sm text-zinc-500">
                Aucun spot enregistré. Publie depuis le replayer.
              </p>
            ) : (
              spots.map((post) => (
                <article
                  key={post.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenSpot(post)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenSpot(post);
                    }
                  }}
                  className="cursor-pointer rounded-2xl border border-white/10 bg-zinc-950/55 p-4 transition hover:border-violet-500/35 hover:bg-zinc-900/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500/50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-violet-300/80">
                        {post.spotMeta?.category
                          ? categoryLabel(post.spotMeta.category as SpotCategory)
                          : "Spot"}
                        {" · "}
                        {visibilityLabel(post.visibility)}
                      </p>
                      <p className="text-[11px] text-zinc-500">{formatRelativeTime(post.createdAtMs)}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[11px] font-semibold text-violet-300/90">Replayer →</span>
                      {onDeleteSpot ? (
                        confirmDeleteSpotId === post.id ? (
                          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-rose-500/35 bg-rose-950/25 px-2 py-1">
                            <span className="text-[10px] text-rose-100">Supprimer ?</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteSpotId(null);
                              }}
                              className={`${PHR_BTN} border-white/15 px-2 py-0.5 text-[10px]`}
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSpot(post);
                                setConfirmDeleteSpotId(null);
                              }}
                              className={`${PHR_BTN} border-rose-500/50 bg-rose-600/25 px-2 py-0.5 text-[10px] text-rose-100`}
                            >
                              Oui
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteSpotId(post.id);
                            }}
                            className={`${PHR_BTN} border-rose-500/40 px-2 py-0.5 text-[10px] text-rose-200 hover:bg-rose-950/35`}
                          >
                            Supprimer
                          </button>
                        )
                      ) : null}
                    </div>
                  </div>
                  {post.spotMeta ? (
                    <div className="mt-3 flex gap-3">
                      <PhrSpotFeedPreview post={post} />
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-sm leading-relaxed text-zinc-200">{post.spotMeta.question}</p>
                        <p className="text-xs text-zinc-500">
                          {post.spotMeta.stepLabel}
                          {" · "}
                          {sourceValidationLabel(post.spotMeta.sourceValidation as SpotSourceValidation)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 line-clamp-3 text-sm text-zinc-400">{post.summary}</p>
                  )}
                </article>
              ))
            )}
          </div>
        )}

        {tab === "mains" && (
          <div className="relative flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                Mains ({filteredHands.length})
              </h2>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  <span className="hidden sm:inline">Tournoi</span>
                  <select
                    value={espaceTournament}
                    onChange={(e) => setEspaceTournament(e.target.value)}
                    className={`${PHR_FIELD_SELECT} max-w-[14rem]`}
                  >
                    {tournamentOptions.map((o) => (
                      <option key={`espace-t-${o.key}`} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setMainsFiltersOpen(true)}
                  className={`${PHR_BTN} relative shrink-0 border-violet-500/35 text-violet-100 ${
                    phrFiltersAreActive(handFilters) ? "ring-1 ring-violet-400/50" : ""
                  }`}
                >
                  Filtres
                  {phrFiltersAreActive(handFilters) ? (
                    <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-violet-400" aria-hidden />
                  ) : null}
                </button>
              </div>
            </div>

            {mainsFiltersOpen ? (
              <>
                <button
                  type="button"
                  aria-label="Fermer les filtres"
                  className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]"
                  onClick={() => setMainsFiltersOpen(false)}
                />
                <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur-md">
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <p className="text-sm font-bold text-zinc-100">Filtres des mains</p>
                    <button
                      type="button"
                      onClick={() => setMainsFiltersOpen(false)}
                      className="rounded-lg border border-white/10 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/70"
                    >
                      Fermer
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    <PhrHandFiltersPanel
                      value={handFilters}
                      onChange={onHandFiltersChange}
                      filteredCount={filteredHands.length}
                    />
                  </div>
                </aside>
              </>
            ) : null}

            {libraryHands.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-zinc-950/40 px-4 py-10 text-center">
                <p className="text-sm text-zinc-400">Aucune main importée sur cet appareil.</p>
                <button
                  type="button"
                  onClick={onImportClick}
                  className={`${PHR_BTN} mt-4 border-emerald-500/40 text-emerald-100`}
                >
                  Importer un historique
                </button>
              </div>
            ) : filteredHands.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-zinc-950/50 px-4 py-8 text-center text-sm text-zinc-500">
                Aucune main ne correspond à ces filtres.
              </p>
            ) : (
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
                {filteredHands.map((hand) => (
                  <PhrHandLibraryRow
                    key={`espace-hand-${hand.sourceFile ?? "local"}::${hand.id}`}
                    hand={hand}
                    label={rowLabel(hand)}
                    active={hand.id === selectedHandId}
                    onOpen={() => onOpenHand(hand.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "tournois" && (
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {tournamentLibrary.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-zinc-950/40 px-4 py-10 text-center">
                <p className="text-sm text-zinc-400">Importe un historique pour rejouer un tournoi entier.</p>
                <button
                  type="button"
                  onClick={onImportClick}
                  className={`${PHR_BTN} mt-4 border-emerald-500/40 text-emerald-100`}
                >
                  Importer
                </button>
              </div>
            ) : (
              <>
                <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    Plateforme
                    <select
                      value={tournamentFilters.platform}
                      onChange={(e) =>
                        setTournamentFilters((f) => ({ ...f, platform: e.target.value }))
                      }
                      className={PHR_FIELD_SELECT}
                    >
                      <option value="ALL">Toutes</option>
                      {platformOptions.map((p) => (
                        <option key={`plat-${p}`} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    Buy-in
                    <select
                      value={tournamentFilters.buyIn}
                      onChange={(e) =>
                        setTournamentFilters((f) => ({ ...f, buyIn: e.target.value }))
                      }
                      className={PHR_FIELD_SELECT}
                    >
                      <option value="ALL">Tous</option>
                      {buyInOptions.map((b) => (
                        <option key={`bi-${b}`} value={String(b)}>
                          {b} €
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    Date
                    <select
                      value={tournamentFilters.dateMonth}
                      onChange={(e) =>
                        setTournamentFilters((f) => ({ ...f, dateMonth: e.target.value }))
                      }
                      className={PHR_FIELD_SELECT}
                    >
                      <option value="ALL">Toutes</option>
                      {dateMonthOptions.map((ym) => (
                        <option key={`ym-${ym}`} value={ym}>
                          {formatMonthLabel(ym)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {filteredTournaments.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-zinc-950/50 px-4 py-8 text-center text-sm text-zinc-500">
                    Aucun tournoi ne correspond à ces filtres.
                  </p>
                ) : (
                  filteredTournaments.map((row) => (
                    <article
                      key={row.key}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-950/50 px-4 py-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-zinc-100">{row.name}</p>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                          <span>{row.handCount} mains</span>
                          {row.platform ? <span>{row.platform}</span> : null}
                          {row.buyInEuro != null ? <span>Buy-in {row.buyInEuro} €</span> : null}
                          {row.dateLabel ? <span>{row.dateLabel}</span> : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {confirmDeleteTournamentKey === row.key ? (
                          <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-rose-500/35 bg-rose-950/25 px-2.5 py-2">
                            <span className="text-[11px] text-rose-100">
                              Supprimer {row.handCount} main{row.handCount > 1 ? "s" : ""} ?
                            </span>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTournamentKey(null)}
                              className={`${PHR_BTN} border-white/15 px-2.5 py-1 text-xs`}
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteTournament?.(row.key);
                                setConfirmDeleteTournamentKey(null);
                              }}
                              className={`${PHR_BTN} border-rose-500/50 bg-rose-600/25 px-2.5 py-1 text-xs text-rose-100`}
                            >
                              Supprimer
                            </button>
                          </div>
                        ) : null}
                        <div className="flex flex-wrap justify-end gap-2">
                          {onPublishTournament ? (
                            <button
                              type="button"
                              onClick={() => onPublishTournament(row.key)}
                              className={`${PHR_BTN} border-violet-500/45 bg-violet-600/20 text-violet-100`}
                            >
                              Publier le tournoi
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => onReplayTournament(row.key)}
                            className={`${PHR_BTN} border-emerald-500/45 bg-emerald-600/20 text-emerald-100`}
                          >
                            Rejouer le tournoi
                          </button>
                          {onDeleteTournament ? (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTournamentKey(row.key)}
                              className={`${PHR_BTN} border-rose-500/40 text-rose-200 hover:bg-rose-950/35`}
                            >
                              Supprimer
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
