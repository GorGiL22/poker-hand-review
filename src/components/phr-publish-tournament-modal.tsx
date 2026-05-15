"use client";

import { useEffect, useState } from "react";

import { publishTournament, type PublishedTournamentVisibility } from "@/lib/phr-published-tournaments";

const PHR_FIELD =
  "w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-violet-500/45 focus:ring-1 focus:ring-violet-500/25";

const PHR_SECTION_TITLE =
  "text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500";

const PHR_CHOICE_BTN =
  "rounded-lg border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-white/18 hover:bg-zinc-800/80";

const PHR_CHOICE_BTN_ON =
  "border-violet-500/55 bg-violet-600/25 text-violet-100 shadow-[0_0_0_1px_rgba(139,92,246,0.2)]";

type PhrPublishTournamentModalProps = {
  open: boolean;
  onClose: () => void;
  tournamentKey: string;
  tournamentName: string;
  tournamentVariant?: string;
  buyIn?: string;
  hands: Record<string, unknown>[];
  authorUid: string;
  authorPseudo: string;
  onPublished?: (tournamentId: string, visibility: PublishedTournamentVisibility) => void;
};

export function PhrPublishTournamentModal({
  open,
  onClose,
  tournamentKey,
  tournamentName,
  tournamentVariant,
  buyIn,
  hands,
  authorUid,
  authorPseudo,
  onPublished,
}: PhrPublishTournamentModalProps) {
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<PublishedTournamentVisibility>("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDescription("");
    setVisibility("public");
    setError(null);
    setBusy(false);
  }, [open, tournamentKey]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      const id = await publishTournament({
        authorUid,
        authorPseudo,
        tournamentKey,
        tournamentName,
        tournamentVariant,
        buyIn,
        description: description.trim() || undefined,
        visibility,
        hands,
      });
      onPublished?.(id, visibility);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Publication impossible.";
      const code =
        err && typeof err === "object" && "code" in err && typeof err.code === "string"
          ? err.code
          : "";
      if (code === "permission-denied" || /insufficient permissions/i.test(message)) {
        setError(
          "Permissions Firestore insuffisantes. Déploie les règles et index Firebase puis réessaie.",
        );
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center p-3 sm:items-center sm:p-5"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={() => !busy && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="phr-publish-tournament-title"
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/12 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <h2 id="phr-publish-tournament-title" className="text-base font-bold text-zinc-50">
            Publier le tournoi
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
          >
            Fermer
          </button>
        </header>

        <div className="space-y-4 px-4 py-4">
          <section className="space-y-2 rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-3 py-3">
            <p className={PHR_SECTION_TITLE}>Tournoi</p>
            <p className="text-sm font-semibold text-emerald-100">{tournamentName}</p>
            <p className="text-xs text-zinc-400">
              {hands.length} main{hands.length > 1 ? "s" : ""}
              {buyIn?.trim() ? ` · Buy-in ${buyIn.trim()} €` : ""}
              {tournamentVariant ? ` · ${tournamentVariant}` : ""}
            </p>
          </section>

          <section className="space-y-2">
            <p className={PHR_SECTION_TITLE}>Introduction (optionnel)</p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Contexte ICM, phase du tournoi, ce que tu cherches comme retours…"
              className={`${PHR_FIELD} resize-none`}
            />
          </section>

          <section className="space-y-2">
            <p className={PHR_SECTION_TITLE}>Visibilité</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setVisibility("public")}
                className={`${PHR_CHOICE_BTN} ${visibility === "public" ? PHR_CHOICE_BTN_ON : ""}`}
              >
                Public
              </button>
              <button
                type="button"
                onClick={() => setVisibility("private")}
                className={`${PHR_CHOICE_BTN} ${visibility === "private" ? PHR_CHOICE_BTN_ON : ""}`}
              >
                Privé
              </button>
            </div>
          </section>

          <p className="text-xs leading-relaxed text-zinc-500">
            Les autres pourront parcourir toutes les mains et rédiger un compte rendu sur celles qu’ils
            souhaitent commenter.
          </p>

          {error ? (
            <p className="rounded-xl border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="border-t border-white/10 p-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSubmit()}
            className="w-full rounded-xl border border-emerald-500/50 bg-gradient-to-r from-emerald-600/80 to-teal-600/70 py-2.5 text-sm font-bold text-white shadow-[0_4px_24px_rgba(16,185,129,0.28)] transition hover:border-emerald-400/60 disabled:opacity-50"
          >
            {busy ? "Publication…" : visibility === "public" ? "Publier le tournoi" : "Enregistrer en privé"}
          </button>
        </footer>
      </div>
    </div>
  );
}
