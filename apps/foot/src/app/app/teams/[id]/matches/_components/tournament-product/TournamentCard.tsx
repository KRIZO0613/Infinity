"use client";

import type { TournamentProductSavedTournament, TournamentProductStatus } from "./types";

type TournamentCardProps = {
  tournament: TournamentProductSavedTournament;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
};

const STATUS_LABELS: Record<TournamentProductStatus, string> = {
  draft: "Brouillon",
  published: "Publié",
  live: "En cours",
  finished: "Terminé",
};

const STATUS_TONES: Record<TournamentProductStatus, string> = {
  draft: "border-white/10 bg-white/5 text-slate-200",
  published: "border-sky-300/30 bg-sky-500/15 text-sky-100",
  live: "border-emerald-300/30 bg-emerald-500/15 text-emerald-100",
  finished: "border-amber-300/30 bg-amber-500/15 text-amber-100",
};

const formatDate = (value: string) => {
  if (!value) return "Date à définir";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
};

const getCategoryLabel = (tournament: TournamentProductSavedTournament) => {
  if (tournament.categories.length === 0) return "Catégorie à définir";
  return tournament.categories.join(" / ");
};

export function TournamentCard({
  tournament,
  onView,
  onEdit,
  onDelete,
  onTogglePublish,
}: TournamentCardProps) {
  const status = tournament.status ?? "draft";
  const realMatchCount = tournament.schedule.filter((match) => !match.isPause && match.type !== "pause").length;

  return (
    <article className="rounded-[28px] border border-white/10 bg-black/20 p-5 shadow-[0_14px_34px_rgba(0,0,0,0.28)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={["rounded-full border px-3 py-1 text-[11px] font-semibold", STATUS_TONES[status]].join(" ")}>
              {STATUS_LABELS[status]}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-300">
              {tournament.windowFits ? "Planning OK" : "Planning serré"}
            </span>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-white">{tournament.name}</h3>
            <p className="mt-1 text-sm text-slate-400">{formatDate(tournament.date)}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{getCategoryLabel(tournament)}</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              {tournament.teams.length} équipes
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              {tournament.fieldCount} terrains
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              {realMatchCount} matchs
            </span>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onView}
            className="rounded-full border border-violet-300/30 bg-violet-600 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-violet-500"
          >
            Afficher le tournoi
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            Éditer
          </button>
          <button
            type="button"
            onClick={onTogglePublish}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            {status === "published" ? "Dépublier" : "Publier"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-full border border-rose-300/20 bg-rose-500/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-100 transition hover:bg-rose-500/20"
          >
            Supprimer
          </button>
        </div>
      </div>
    </article>
  );
}
