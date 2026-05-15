"use client";

const PHR_HOME_BTN_BASE =
  "group flex w-full max-w-lg flex-col items-start gap-2 rounded-2xl border px-6 py-6 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition active:scale-[0.98] sm:px-8 sm:py-8";

type PhrHomeLandingProps = {
  onGroups: () => void;
  onMonEspace: () => void;
  onReplayer: () => void;
  hasHands: boolean;
  cloudLoading?: boolean;
  cloudSyncWarning?: string | null;
  importError?: string | null;
};

export function PhrHomeLanding({
  onGroups,
  onMonEspace,
  onReplayer,
  hasHands,
  cloudLoading = false,
  cloudSyncWarning = null,
  importError = null,
}: PhrHomeLandingProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-2 py-6 sm:gap-8 sm:py-10">
      <div className="w-full max-w-lg text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300/80">SpotLab</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-zinc-50 sm:text-3xl">
          Review poker entre joueurs
        </h1>
        <p className="mt-2 text-sm text-zinc-500">Choisis où tu veux aller.</p>
      </div>

      {cloudSyncWarning ? (
        <p className="w-full max-w-lg rounded-xl border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
          {cloudSyncWarning}
        </p>
      ) : null}
      {cloudLoading ? (
        <p className="w-full max-w-lg rounded-xl border border-violet-500/25 bg-violet-950/25 px-3 py-2 text-sm text-violet-100">
          Chargement de ta session…
        </p>
      ) : null}
      {importError ? (
        <p className="w-full max-w-lg rounded-xl border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-sm text-rose-200">
          {importError}
        </p>
      ) : null}

      <nav className="flex w-full max-w-lg flex-col gap-3 sm:gap-4" aria-label="Navigation principale">
        <button
          type="button"
          onClick={onGroups}
          className={`${PHR_HOME_BTN_BASE} border-sky-500/45 bg-gradient-to-br from-sky-600/35 via-sky-950/50 to-zinc-950/80 hover:border-sky-400/60 hover:from-sky-500/45 hover:shadow-[0_8px_40px_rgba(14,165,233,0.25)]`}
        >
          <span className="text-lg font-black text-sky-50 sm:text-xl">Groupes de travail</span>
          <span className="text-sm leading-relaxed text-sky-100/75">
            Crée ou rejoins un groupe, partage des spots en privé.
          </span>
        </button>

        <button
          type="button"
          onClick={onMonEspace}
          className={`${PHR_HOME_BTN_BASE} border-violet-500/45 bg-gradient-to-br from-violet-600/40 via-fuchsia-900/30 to-zinc-950/80 hover:border-violet-400/60 hover:shadow-[0_8px_40px_rgba(139,92,246,0.3)]`}
        >
          <span className="text-lg font-black text-violet-50 sm:text-xl">Mon espace</span>
          <span className="text-sm leading-relaxed text-violet-100/75">
            {hasHands
              ? "Tes spots publiés, toutes tes mains et rejouer un tournoi entier."
              : "Spots publiés et bibliothèque — importe un .txt pour les mains."}
          </span>
        </button>

        <button
          type="button"
          onClick={onReplayer}
          className={`${PHR_HOME_BTN_BASE} border-emerald-500/45 bg-gradient-to-br from-emerald-600/35 via-emerald-950/40 to-zinc-950/80 hover:border-emerald-400/60 hover:shadow-[0_8px_40px_rgba(16,185,129,0.25)]`}
        >
          <span className="text-lg font-black text-emerald-50 sm:text-xl">Replayer</span>
          <span className="text-sm leading-relaxed text-emerald-100/75">
            {hasHands
              ? "Ouvre la table et avance dans la main."
              : "Importe des mains pour activer le replayer."}
          </span>
        </button>
      </nav>
    </div>
  );
}
