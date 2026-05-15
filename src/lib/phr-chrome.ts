/**
 * Styles partagés : barre d’auth (haut) et pastilles dock (Discord / partage / paramètres).
 */

/** Boutons auth — même hauteur, largeur min identique, même base visuelle. */
export const PHR_TOPBAR_BTN =
  "inline-flex h-10 min-w-[9.25rem] shrink-0 items-center justify-center rounded-xl border border-white/12 bg-zinc-800/80 px-4 text-sm font-semibold text-zinc-100 shadow-sm transition hover:border-white/22 hover:bg-zinc-700/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45";

export const PHR_TOPBAR_BTN_SIGNOUT = `${PHR_TOPBAR_BTN} hover:border-rose-400/40 hover:bg-rose-950/30 hover:text-rose-100`;

/** Variante panneau Paramètres (plus étroit, même langage). */
export const PHR_TOPBAR_BTN_COMPACT =
  "inline-flex h-9 w-full items-center justify-center rounded-xl border border-white/12 bg-zinc-800/80 px-3 text-xs font-semibold text-zinc-100 shadow-sm transition hover:border-white/22 hover:bg-zinc-700/90 active:scale-[0.98] disabled:opacity-45 sm:w-auto sm:min-w-[8.75rem] sm:text-sm";

export const PHR_TOPBAR_BTN_COMPACT_SIGNOUT = `${PHR_TOPBAR_BTN_COMPACT} hover:border-rose-400/40 hover:bg-rose-950/30 hover:text-rose-100`;

export const PHR_TOPBAR_USER_STRIP =
  "inline-flex h-10 max-w-[min(100vw-12rem,15rem)] items-center truncate rounded-xl border border-white/10 bg-zinc-900/55 px-3 text-xs font-medium text-zinc-400";

/** Barre dock horizontale : verre léger, pas de contour noir lourd. */
export const PHR_DOCK_POD =
  "pointer-events-auto inline-flex flex-row items-center gap-0.5 rounded-full border border-white/[0.08] bg-zinc-900/30 p-1 shadow-[0_6px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl sm:gap-1 sm:p-1.5";

/** Pastille : surface mate / verre, sans bordure sombre ni halo noir au focus. */
export const PHR_DOCK_TILE =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-zinc-200 outline-none transition-[transform,background-color,color,box-shadow] duration-200 hover:bg-white/[0.13] hover:text-zinc-50 active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:ring-offset-0 sm:size-12";

export const PHR_DOCK_TILE_ACTIVE = `${PHR_DOCK_TILE} bg-emerald-500/16 text-emerald-100 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.32)] hover:bg-emerald-500/24 hover:text-emerald-50`;

/** Toutes les icônes dock au même gabarit optique. */
export const PHR_DOCK_ICON = "size-5 shrink-0";

/** Barre haute (accueil ou review) — cadre commun. */
export const PHR_REVIEW_TOPBAR =
  "flex min-h-[52px] shrink-0 items-center rounded-2xl border border-white/10 bg-zinc-950/88 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md sm:px-4";

/** CTA principal « Mon espace » — plus visible que les boutons standards. */
export const PHR_MON_ESPACE_BTN =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-violet-400/55 bg-gradient-to-r from-violet-600/65 via-fuchsia-600/50 to-violet-600/65 px-6 text-sm font-bold tracking-tight text-white shadow-[0_4px_28px_rgba(139,92,246,0.42),inset_0_1px_0_rgba(255,255,255,0.18)] transition hover:border-violet-300/75 hover:from-violet-500/75 hover:via-fuchsia-500/55 hover:to-violet-500/75 hover:shadow-[0_6px_34px_rgba(139,92,246,0.5)] active:scale-[0.97] sm:px-7";

export const PHR_MON_ESPACE_BTN_ACTIVE = `${PHR_MON_ESPACE_BTN} border-emerald-400/60 from-emerald-700/65 via-teal-600/50 to-emerald-700/65 shadow-[0_4px_28px_rgba(16,185,129,0.38),inset_0_1px_0_rgba(255,255,255,0.16)] hover:border-emerald-300/70`;

/** CTA « Replayer » — à côté de Mon espace sur l’accueil. */
export const PHR_REPLAYER_BTN =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-emerald-500/45 bg-emerald-600/22 px-5 text-sm font-bold text-emerald-100 shadow-[0_4px_20px_rgba(16,185,129,0.22),inset_0_1px_0_rgba(255,255,255,0.1)] transition hover:border-emerald-400/60 hover:bg-emerald-600/32 active:scale-[0.97] sm:px-6";
