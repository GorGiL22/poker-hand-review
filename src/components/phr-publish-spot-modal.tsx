"use client";

import { useEffect, useRef, useState } from "react";

const PUBLISH_TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

import type { ReviewGroupMembership } from "@/lib/phr-review-groups";
import {
  publishSpot,
  SPOT_CATEGORIES,
  SPOT_SOURCE_OPTIONS,
  spotCategoryFromStreet,
  type SpotCategory,
  type SpotHeroAction,
  type SpotReplayContext,
  type SpotSourceValidation,
  type SpotVisibility,
} from "@/lib/phr-spots";

const PHR_FIELD =
  "w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-violet-500/45 focus:ring-1 focus:ring-violet-500/25";

const PHR_SECTION_TITLE =
  "text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500";

const PHR_CHOICE_BTN =
  "rounded-lg border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-white/18 hover:bg-zinc-800/80";

const PHR_CHOICE_BTN_ON =
  "border-violet-500/55 bg-violet-600/25 text-violet-100 shadow-[0_0_0_1px_rgba(139,92,246,0.2)]";

type PhrPublishSpotModalProps = {
  open: boolean;
  onClose: () => void;
  replay: SpotReplayContext;
  authorUid: string;
  authorPseudo: string;
  /** Buy-in tournoi (EUR) configuré dans le replayer. */
  buyIn?: string;
  myGroups?: ReviewGroupMembership[];
  onPublished?: (visibility: SpotVisibility, groupId?: string) => void;
};

export function PhrPublishSpotModal({
  open,
  onClose,
  replay,
  authorUid,
  authorPseudo,
  buyIn,
  myGroups = [],
  onPublished,
}: PhrPublishSpotModalProps) {
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState<SpotCategory>(() => spotCategoryFromStreet(replay.street));
  const [heroAction, setHeroAction] = useState<SpotHeroAction | null>(null);
  const [heroAmount, setHeroAmount] = useState("");
  const [sourceValidation, setSourceValidation] = useState<SpotSourceValidation>("unvalidated");
  const [visibility, setVisibility] = useState<SpotVisibility>("group");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closedRef = useRef(false);

  function handleClose() {
    closedRef.current = true;
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    closedRef.current = false;
    setQuestion("");
    setCategory(spotCategoryFromStreet(replay.street));
    setHeroAction(null);
    setHeroAmount("");
    setSourceValidation("unvalidated");
    setVisibility(myGroups.length > 0 ? "group" : "private");
    setSelectedGroupId(myGroups[0]?.groupId ?? "");
    setError(null);
    setBusy(false);
  }, [open, replay, myGroups]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const needsAmount = heroAction === "call" || heroAction === "raise";
  const boardLine = replay.visibleBoard.length > 0 ? replay.visibleBoard.join(" ") : "—";

  async function onSubmit() {
    if (!question.trim()) {
      setError("Écris une question pour le spot.");
      return;
    }
    if (!heroAction) {
      setError("Choisis ta ligne (Fold, Call ou Raise).");
      return;
    }
    if (needsAmount && !heroAmount.trim()) {
      setError("Indique le montant de ta ligne.");
      return;
    }
    const parsedAmount = needsAmount ? Number.parseFloat(heroAmount.replace(",", ".")) : null;
    if (needsAmount && (!Number.isFinite(parsedAmount) || (parsedAmount ?? 0) < 0)) {
      setError("Montant invalide.");
      return;
    }

    if (visibility === "group" && !selectedGroupId) {
      setError("Choisis un groupe ou crée-en un depuis l’accueil.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await withTimeout(
        publishSpot({
          authorUid,
          authorPseudo,
          replay,
          question: question.trim(),
          category,
          heroAction,
          heroAmount: needsAmount ? parsedAmount : null,
          sourceValidation,
          visibility,
          groupId: visibility === "group" ? selectedGroupId : undefined,
          buyIn,
        }),
        PUBLISH_TIMEOUT_MS,
        "La publication a pris trop de temps. Vérifie ta connexion et réessaie.",
      );
      handleClose();
      onPublished?.(visibility, visibility === "group" ? selectedGroupId : undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Publication impossible.";
      const code =
        err && typeof err === "object" && "code" in err && typeof err.code === "string"
          ? err.code
          : "";
      if (code === "permission-denied" || /insufficient permissions/i.test(message)) {
        setError(
          "Permissions Firestore insuffisantes. Déploie les règles du projet (firebase deploy --only firestore:rules,firestore:indexes) puis réessaie.",
        );
      } else {
        setError(message);
      }
    } finally {
      if (!closedRef.current) setBusy(false);
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
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="phr-publish-spot-title"
        className="relative flex max-h-[min(92vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/12 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <h2 id="phr-publish-spot-title" className="text-base font-bold text-zinc-50">
            Publier le spot
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
          >
            {busy ? "Annuler" : "Fermer"}
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <section className="space-y-2 rounded-xl border border-violet-500/25 bg-violet-950/20 px-3 py-3">
            <p className={PHR_SECTION_TITLE}>Spot affiché sur le replayer</p>
            <p className="text-sm font-semibold text-violet-100">
              Étape {replay.transportLabel}
            </p>
            <p className="text-sm text-zinc-200">{replay.stepLabel}</p>
            <p className="text-xs text-zinc-400">
              Pot {replay.potLabel}
              {boardLine !== "—" ? ` · Board ${boardLine}` : ""}
            </p>
          </section>

          <section className="space-y-2">
            <p className={PHR_SECTION_TITLE}>Question</p>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              placeholder="Quelle ligne prends-tu ici et pourquoi ?"
              className={`${PHR_FIELD} resize-none`}
            />
          </section>

          <section className="space-y-2">
            <p className={PHR_SECTION_TITLE}>Catégorie</p>
            <div className="flex flex-wrap gap-1.5">
              {SPOT_CATEGORIES.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCategory(opt.id)}
                  className={`${PHR_CHOICE_BTN} ${category === opt.id ? PHR_CHOICE_BTN_ON : ""}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <p className={PHR_SECTION_TITLE}>Ma réponse</p>
            <div className="flex flex-wrap gap-2">
              {(["fold", "call", "raise"] as const).map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => setHeroAction(action)}
                  className={`${PHR_CHOICE_BTN} min-w-[4.5rem] capitalize ${heroAction === action ? PHR_CHOICE_BTN_ON : ""}`}
                >
                  {action === "fold" ? "Fold" : action === "call" ? "Call" : "Raise"}
                </button>
              ))}
            </div>
            {needsAmount && (
              <label className="block space-y-1">
                <span className="text-xs text-zinc-500">Montant (BB ou jetons)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={heroAmount}
                  onChange={(e) => setHeroAmount(e.target.value)}
                  placeholder="ex. 2.5"
                  className={PHR_FIELD}
                />
              </label>
            )}
          </section>

          <section className="space-y-2">
            <p className={PHR_SECTION_TITLE}>Source / validation</p>
            <div className="flex flex-wrap gap-1.5">
              {SPOT_SOURCE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSourceValidation(opt.id)}
                  className={`${PHR_CHOICE_BTN} ${sourceValidation === opt.id ? PHR_CHOICE_BTN_ON : ""}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
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
                onClick={() => setVisibility("group")}
                disabled={myGroups.length === 0}
                className={`${PHR_CHOICE_BTN} ${visibility === "group" ? "border-sky-500/55 bg-sky-600/25 text-sky-100" : ""} disabled:opacity-40`}
              >
                Groupe privé
              </button>
              <button
                type="button"
                onClick={() => setVisibility("private")}
                className={`${PHR_CHOICE_BTN} ${visibility === "private" ? PHR_CHOICE_BTN_ON : ""}`}
              >
                Perso
              </button>
            </div>
            {visibility === "group" && myGroups.length > 0 ? (
              <label className="mt-2 block space-y-1">
                <span className="text-xs text-zinc-500">Groupe</span>
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className={PHR_FIELD}
                >
                  {myGroups.map((g) => (
                    <option key={g.groupId} value={g.groupId}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </section>

          {error && (
            <p className="rounded-xl border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}
        </div>

        <footer className="shrink-0 border-t border-white/10 p-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSubmit()}
            className="w-full rounded-xl border border-violet-500/50 bg-gradient-to-r from-violet-600/80 to-fuchsia-600/70 py-2.5 text-sm font-bold text-white shadow-[0_4px_24px_rgba(139,92,246,0.35)] transition hover:border-violet-400/60 disabled:opacity-50"
          >
            {busy
              ? "Publication…"
              : visibility === "public"
                ? "Publier le spot"
                : visibility === "group"
                  ? "Publier dans le groupe"
                  : "Enregistrer en perso"}
          </button>
        </footer>
      </div>
    </div>
  );
}
