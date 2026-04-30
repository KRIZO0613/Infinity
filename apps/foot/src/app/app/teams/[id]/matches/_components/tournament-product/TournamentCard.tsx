"use client";

import type { TournamentProductSavedTournament, TournamentProductStatus } from "./types";

type TournamentCardProps = {
  tournament: TournamentProductSavedTournament;
  onView: () => void;
  onManage: () => void;
  onManageTeams?: () => void;
  onDelete: () => void;
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
  onManage,
  onManageTeams,
  onDelete,
}: TournamentCardProps) {
  const status = tournament.status ?? "draft";
  const realMatchCount = tournament.schedule.filter((match) => !match.isPause && match.type !== "pause").length;
  const realTeamCount = tournament.teams.filter(
    (team) => team.name.trim().length > 0 && !/^equipe\s+\d+$/i.test(team.name.trim()),
  ).length;
  const missingTeams = realTeamCount < tournament.teamCount;
  const statusLabel = status === "finished" ? "Termine" : status === "live" ? "En cours" : "Programme";

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[28px] border border-white/10 bg-black/20 shadow-[0_14px_34px_rgba(0,0,0,0.28)]">
      <div className="relative min-h-[118px] px-5 py-5">
        <div className="flex items-start">
          <span className={["rounded-full border px-3 py-1 text-[11px] font-semibold", STATUS_TONES[status]].join(" ")}>
            {statusLabel}
          </span>
        </div>

        <div className="pointer-events-none absolute left-1/2 top-5 flex -translate-x-1/2 flex-col items-center gap-3 text-center">
          <div className="relative flex items-center justify-center">
            <h3 className="text-[1.45rem] font-bold leading-none text-white">{tournament.name}</h3>
            <p className="absolute left-full ml-2 whitespace-nowrap text-[11px] font-medium text-slate-500">
              {formatDate(tournament.date)}
            </p>
          </div>

          <div className="pointer-events-auto inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] p-1">
            <button
              type="button"
              onClick={onView}
              className="rounded-full bg-violet-600 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-violet-500"
            >
              Live
            </button>
            <button
              type="button"
              onClick={onManage}
              className="rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              Gestion
            </button>
          </div>
        </div>
      </div>
      <div className="mt-auto flex w-full flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-white/[0.04] px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-1 text-[9px] font-medium text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5">
            {getCategoryLabel(tournament)}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5">
            {tournament.fieldCount} terrain{tournament.fieldCount > 1 ? "s" : ""}
          </span>
          {onManageTeams ? (
            <button
              type="button"
              onClick={onManageTeams}
              className={[
                "rounded-full border px-2.5 py-0.5 transition",
                missingTeams
                  ? "border-rose-300/30 bg-rose-500/15 text-rose-100 hover:bg-rose-500/20"
                  : "border-white/10 bg-white/5 hover:bg-white/10",
              ].join(" ")}
            >
              {realTeamCount}/{tournament.teamCount} equipes
            </button>
          ) : (
            <span
              className={[
                "rounded-full border px-2.5 py-0.5",
                missingTeams ? "border-rose-300/30 bg-rose-500/15 text-rose-100" : "border-white/10 bg-white/5",
              ].join(" ")}
            >
              {realTeamCount}/{tournament.teamCount} equipes
            </span>
          )}
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5">
            {realMatchCount} matchs
          </span>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-6 w-6 items-center justify-center text-rose-100 transition hover:text-rose-200"
          aria-label="Supprimer le tournoi"
          title="Supprimer le tournoi"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-4.5 w-4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4.75 6.25h10.5" />
            <path d="M7.25 3.75h5.5" />
            <path d="M6.25 6.25v8a1 1 0 0 0 1 1h5.5a1 1 0 0 0 1-1v-8" />
            <path d="M8.25 8.75v4.5M11.75 8.75v4.5" />
          </svg>
        </button>
      </div>
    </article>
  );
}
