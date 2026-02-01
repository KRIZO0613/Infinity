"use client";

import { useEffect, useState } from "react";

import { getTrainingsByTeam, type TeamEvent } from "@/lib/api/teamEvents";

type TeamTrainingsClientProps = {
  teamId: string;
};

const formatDayLabel = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

const formatTime = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

const getStatusBadge = (status?: TeamEvent["status"]) => {
  switch (status) {
    case "played":
      return {
        label: "Terminé",
        className:
          "border-emerald-300/30 bg-emerald-500/15 text-emerald-200",
      };
    case "cancelled":
      return {
        label: "Annulé",
        className: "border-rose-300/30 bg-rose-500/15 text-rose-200",
      };
    case "postponed":
      return {
        label: "Reporté",
        className: "border-amber-300/30 bg-amber-500/15 text-amber-200",
      };
    default:
      return {
        label: "Prévu",
        className:
          "border-violet-300/30 bg-violet-500/15 text-violet-200",
      };
  }
};

export default function TeamTrainingsClient({
  teamId,
}: TeamTrainingsClientProps) {
  const [trainings, setTrainings] = useState<TeamEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadTrainings() {
      setLoading(true);
      setError(null);
      try {
        const data = await getTrainingsByTeam(teamId);
        if (!cancelled) setTrainings(data ?? []);
      } catch (err) {
        if (!cancelled) {
          console.error("Erreur chargement entraînements:", err);
          setError("Impossible de charger les entraînements.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (teamId) {
      loadTrainings();
    } else {
      setLoading(false);
      setError("Impossible de charger les entraînements.");
    }

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return (
    <div className="min-h-screen bg-[#070a14] text-slate-100">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Calendrier de l’équipe
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-100">
              Entraînements
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Séances d’entraînement de l’équipe
            </p>
          </div>
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
          >
            + Nouvel entraînement
          </button>
        </div>

        <div className="mt-8 rounded-[28px] border border-white/10 bg-black/35 p-6 shadow-[0_26px_60px_rgba(0,0,0,0.6)]">
          {error ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6 text-sm text-rose-200">
              {error}
            </div>
          ) : loading ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
              Chargement des entraînements…
            </div>
          ) : trainings.length === 0 ? (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-slate-400">
              Aucun entraînement enregistré pour l’instant.
            </div>
          ) : (
            <div className="max-h-[calc(100vh-240px)] space-y-3 overflow-y-auto pr-1">
              {trainings.map((training) => {
                const start = new Date(training.start_at);
                const statusBadge = getStatusBadge(training.status ?? null);
                const typeBadge = {
                  label: "Entraînement",
                  className:
                    "border-sky-300/30 bg-sky-500/15 text-sky-200",
                };

                return (
                  <div
                    key={training.id}
                    className="flex flex-wrap items-start gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:bg-black/40"
                  >
                    <div className="min-w-[140px] text-xs text-slate-300">
                      <div className="font-medium text-slate-200">
                        {formatDayLabel(start)}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {formatTime(start)}
                      </div>
                    </div>

                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-100">
                          {training.title ?? "Entraînement"}
                        </h3>
                        <span
                          className={[
                            "rounded-full border px-2.5 py-0.5 text-[11px]",
                            typeBadge.className,
                          ].join(" ")}
                        >
                          {typeBadge.label}
                        </span>
                        <span
                          className={[
                            "rounded-full border px-2.5 py-0.5 text-[11px]",
                            statusBadge.className,
                          ].join(" ")}
                        >
                          {statusBadge.label}
                        </span>
                      </div>

                      {training.location ? (
                        <p className="mt-1 text-xs text-slate-400">
                          {training.location}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
