"use client";

import { useEffect, useState } from "react";

import {
  saveTournamentHandReport,
  subscribeTournamentHandReports,
  type PublishedTournament,
  type PublishedTournamentHand,
  type TournamentHandReport,
} from "@/lib/phr-published-tournaments";
import { usePhrFirebase } from "@/lib/use-phr-firebase";

const PHR_FIELD =
  "w-full rounded-lg border border-white/10 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/45 focus:ring-1 focus:ring-emerald-500/25";

function formatRelativeTime(ms: number): string {
  const delta = Date.now() - ms;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "À l’instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  return `Il y a ${Math.floor(hours / 24)} j`;
}

type PhrTournamentReviewPanelProps = {
  tournament: PublishedTournament;
  hands: PublishedTournamentHand[];
  selectedHandDocId: string | null;
  onSelectHand: (handDocId: string) => void;
  onBack: () => void;
};

export function PhrTournamentReviewPanel({
  tournament,
  hands,
  selectedHandDocId,
  onSelectHand,
  onBack,
}: PhrTournamentReviewPanelProps) {
  const { user, pseudo, firebaseConfigured } = usePhrFirebase();
  const [reports, setReports] = useState<TournamentHandReport[]>([]);
  const [reportText, setReportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const displayName = pseudo ?? user?.displayName ?? "Joueur";
  const selectedHand = hands.find((h) => h.id === selectedHandDocId) ?? null;
  const myReport = user ? reports.find((r) => r.authorUid === user.uid) : null;

  useEffect(() => {
    if (!firebaseConfigured || !selectedHandDocId) {
      queueMicrotask(() => setReports([]));
      return;
    }
    return subscribeTournamentHandReports(tournament.id, selectedHandDocId, setReports);
  }, [tournament.id, selectedHandDocId, firebaseConfigured]);

  useEffect(() => {
    setReportText(myReport?.text ?? "");
    setError(null);
  }, [selectedHandDocId, myReport?.text]);

  async function onSaveReport() {
    if (!user) {
      setError("Connecte-toi pour publier un compte rendu.");
      return;
    }
    if (!selectedHandDocId) return;
    if (!reportText.trim()) {
      setError("Écris ton compte rendu.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveTournamentHandReport(
        tournament.id,
        selectedHandDocId,
        user.uid,
        displayName,
        reportText,
      );
      setToast("Compte rendu enregistré.");
      window.setTimeout(() => setToast(null), 2400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col border-t border-white/10 bg-zinc-950/95 sm:w-72 sm:border-l sm:border-t-0 lg:w-80">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-emerald-100">{tournament.tournamentName}</p>
          <p className="text-[10px] text-zinc-500">
            {tournament.handCount} mains · {tournament.authorPseudo}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800"
        >
          ← Fil
        </button>
      </div>

      {tournament.description ? (
        <p className="border-b border-white/8 px-3 py-2 text-xs leading-relaxed text-zinc-400">
          {tournament.description}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="sticky top-0 z-[1] bg-zinc-950/95 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Mains du tournoi
        </p>
        <ul className="space-y-0.5 px-2 pb-2">
          {hands.map((hand) => {
            const active = hand.id === selectedHandDocId;
            return (
              <li key={hand.id}>
                <button
                  type="button"
                  onClick={() => onSelectHand(hand.id)}
                  className={`w-full rounded-lg px-2 py-1.5 text-left text-[11px] transition ${
                    active
                      ? "bg-emerald-600/25 font-semibold text-emerald-100"
                      : "text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  {hand.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="shrink-0 border-t border-white/10 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Compte rendu {selectedHand ? `· ${selectedHand.label}` : ""}
        </p>
        <textarea
          value={reportText}
          onChange={(e) => setReportText(e.target.value)}
          rows={4}
          disabled={!user || !selectedHand || busy}
          placeholder={
            user
              ? "Ton analyse sur cette main (optionnel)…"
              : "Connecte-toi pour commenter une main"
          }
          className={`${PHR_FIELD} mt-2 resize-none`}
        />
        <button
          type="button"
          disabled={!user || !selectedHand || busy || !reportText.trim()}
          onClick={() => void onSaveReport()}
          className="mt-2 w-full rounded-lg border border-emerald-500/40 bg-emerald-600/30 px-3 py-2 text-sm font-semibold text-emerald-50 disabled:opacity-50"
        >
          {busy ? "Enregistrement…" : myReport ? "Mettre à jour" : "Publier mon compte rendu"}
        </button>

        {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
        {toast ? <p className="mt-2 text-xs text-emerald-300">{toast}</p> : null}

        {reports.length > 0 ? (
          <ul className="mt-3 max-h-36 space-y-2 overflow-y-auto">
            {reports.map((report) => (
              <li
                key={report.id}
                className="rounded-lg border border-white/8 bg-zinc-900/50 px-2 py-1.5 text-xs text-zinc-200"
              >
                <p className="font-semibold text-zinc-400">
                  {report.authorPseudo}{" "}
                  <span className="font-normal text-zinc-600">
                    {formatRelativeTime(report.updatedAtMs)}
                  </span>
                </p>
                <p className="mt-1 leading-relaxed">{report.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11px] text-zinc-600">Aucun compte rendu sur cette main.</p>
        )}
      </div>
    </aside>
  );
}
