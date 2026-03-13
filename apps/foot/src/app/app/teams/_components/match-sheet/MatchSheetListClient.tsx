"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import DashboardLayout from "@/app/_components/DashboardLayout";
import GameCardShell from "@/app/_components/cards/GameCardShell";
import { getMatchesByTeam, type TeamEvent } from "@/lib/api/teamEvents";
import {
  buildTeamNameAliases,
  buildTeamProfileMetaWithOptions,
  getTeamProfile,
  getTeamDisplayName,
  type TeamProfile,
} from "@/lib/teamProfile";
import type { MatchSheetMatch } from "./types";

type MatchSheetListClientProps = {
  teamId: string;
};

const weekdayFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
});

const shortDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
});

const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMatchHeading(date: Date) {
  const weekday = capitalize(weekdayFormatter.format(date));
  const time = timeFormatter
    .format(date)
    .replace(":", "h")
    .replace(/h00$/, "h");
  return `${weekday} ${time}`;
}

function getStatusBadge(status?: TeamEvent["status"]) {
  switch (status) {
    case "played":
      return "border-emerald-300/30 bg-emerald-500/15 text-emerald-200";
    case "cancelled":
      return "border-rose-300/30 bg-rose-500/15 text-rose-200";
    default:
      return "border-violet-300/30 bg-violet-500/15 text-violet-200";
  }
}

function getMatchDisplayTitle(
  title: string | null,
  team: TeamProfile | null,
) {
  const teamDisplayName = getTeamDisplayName(team);
  if (!title?.trim()) return "Match de l’équipe";
  if (!teamDisplayName || !team) return title;

  const aliases = buildTeamNameAliases({
    clubName: team.clubName,
    name: team.name,
    category: team.category,
    squadNumber: team.squadNumber,
    fallback: "Mon équipe",
  }).sort((a, b) => b.length - a.length);

  for (const alias of aliases) {
    if (!alias || alias === teamDisplayName) continue;

    const normalizedTitle = title.toLowerCase();
    const normalizedAlias = alias.toLowerCase();
    const index = normalizedTitle.indexOf(normalizedAlias);

    if (index >= 0) {
      return `${title.slice(0, index)}${teamDisplayName}${title.slice(index + alias.length)}`;
    }
  }

  return title;
}

export default function MatchSheetListClient({
  teamId,
}: MatchSheetListClientProps) {
  const [team, setTeam] = useState<TeamProfile | null>(null);
  const [matches, setMatches] = useState<MatchSheetMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const teamMeta = buildTeamProfileMetaWithOptions(team, {
    includeSquadNumber: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [teamResponse, matchesResponse] = await Promise.all([
          getTeamProfile(teamId),
          getMatchesByTeam(teamId),
        ]);

        if (matchesResponse instanceof Error) throw matchesResponse;

        const upcomingMatches = (matchesResponse ?? [])
          .filter((match) => {
            const matchTime = new Date(match.start_at).getTime();
            return matchTime >= Date.now() && match.status !== "cancelled";
          })
          .map((match) => ({
            id: match.id,
            title: match.title,
            start_at: match.start_at,
            location: match.location ?? null,
            status: match.status,
            source: "team-event" as const,
          }));

        if (!cancelled) {
          setTeam(teamResponse);
          setMatches(upcomingMatches);
        }
      } catch (loadError) {
        console.error("Erreur chargement feuille de match:", loadError);
        if (!cancelled) {
          setError("Impossible de charger les matchs à venir.");
          setMatches([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return (
    <DashboardLayout
      eyebrow="Feuille de match"
      title="Matchs à venir"
      subtitle={
        team
          ? `${getTeamDisplayName(team)}${teamMeta.length ? ` · ${teamMeta.join(" · ")}` : ""}`
          : "Prépare rapidement la composition de ton équipe."
      }
    >
      <GameCardShell className="border-white/10 bg-black/25">
        <div className="p-6 sm:p-8">
          {error ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5 text-sm text-rose-200">
              {error}
            </div>
          ) : loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-24 rounded-3xl border border-white/10 bg-white/5"
                />
              ))}
            </div>
          ) : matches.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] px-6 text-center">
              <CalendarDays className="h-10 w-10 text-slate-500" strokeWidth={1.6} />
              <h2 className="mt-4 text-lg font-semibold text-slate-100">
                Aucun match à venir
              </h2>
              <p className="mt-2 max-w-md text-sm text-slate-400">
                Dès qu’un match futur est planifié pour cette équipe, il
                apparaîtra ici pour préparer la feuille de match.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map((match) => {
                const startDate = new Date(match.start_at);

                return (
                  <Link
                    key={match.id}
                    href={`/app/teams/${teamId}/match-sheet/${match.id}`}
                    className="group flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.06] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                          {formatMatchHeading(startDate)}
                        </span>
                        <span
                          className={[
                            "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
                            getStatusBadge(match.status),
                          ].join(" ")}
                        >
                          {match.status === "played"
                            ? "Joué"
                            : match.status === "cancelled"
                              ? "Annulé"
                              : "Prévu"}
                        </span>
                      </div>

                      <h2 className="text-xl font-semibold text-slate-100">
                        {getMatchDisplayTitle(match.title, team)}
                      </h2>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
                        <span>{shortDateFormatter.format(startDate)}</span>
                        {match.location ? (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" strokeWidth={1.7} />
                            {match.location}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-violet-200 transition group-hover:text-violet-100">
                      Ouvrir la composition
                      <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </GameCardShell>
    </DashboardLayout>
  );
}
