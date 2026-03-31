"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import DashboardLayout from "@/app/_components/DashboardLayout";
import GameCardShell from "@/app/_components/cards/GameCardShell";
import {
  getMatchesByTeam,
  type TeamEvent,
} from "@/lib/api/teamEvents";
import { supabase } from "@/lib/supabaseClient";
import {
  buildTeamNameAliases,
  buildTeamProfileMetaWithOptions,
  getTeamProfile,
  getTeamDisplayName,
  type TeamProfile,
} from "@/lib/teamProfile";

type MatchSheetListClientProps = {
  teamId: string;
};

type MatchSheetListItem =
  | {
      id: string;
      title: string | null;
      start_at: string;
      location: string | null;
      status: TeamEvent["status"] | null;
      source: "team-event";
      competitionLabel: string;
      teams: string[];
    }
  | {
      id: string;
      title: string;
      start_at: string;
      location: null;
      status: "scheduled";
      source: "plateau-day";
      competitionLabel: string;
      teams: string[];
    };

type MatchDetailsRow = {
  event_id: string;
  competition: string | null;
  opponent_name: string;
  home_away: string | null;
};

type PlateauStorageData = {
  plateau?: Array<{
    id: string;
    name?: string;
    date: string;
    time?: string;
    teams?: string[];
    matches: Array<{
      id: string;
      homeTeam: string;
      awayTeam: string;
      date: string;
      time: string;
      status?: "draft" | "in_progress" | "finished";
      score?: string;
    }>;
  }>;
};

type PlateauDayListItem = {
  id: string;
  name?: string;
  date: string;
  time?: string;
  teams: string[];
  matches: Array<{
    id: string;
    homeTeam: string;
    awayTeam: string;
    date: string;
    time: string;
    status?: "draft" | "in_progress" | "finished";
    score?: string;
  }>;
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const supabaseError = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };

    const parts = [
      supabaseError.message,
      supabaseError.details,
      supabaseError.hint,
      supabaseError.code ? `code: ${supabaseError.code}` : null,
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(" | ");
    }
  }

  if (typeof error === "string") {
    return error;
  }

  return "Erreur inconnue";
}

function isMissingColumnError(
  error: unknown,
  table: string,
  column: string,
) {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: string; message?: string };
  if (
    maybeError.code !== "PGRST204" &&
    maybeError.code !== "42703"
  ) {
    return false;
  }

  if (typeof maybeError.message !== "string") return false;

  return (
    maybeError.message.includes(`'${column}'`) ||
    maybeError.message.includes(`.${column}`)
  ) && maybeError.message.toLowerCase().includes(table.toLowerCase());
}

function buildPlateauDayLabel(index: number) {
  return `Journée ${index + 1}`;
}

function parsePlateauDayOrder(name?: string | null) {
  if (!name) return null;

  const match = name.match(/(\d+)/);
  if (!match) return null;

  const dayNumber = Number(match[1]);
  return Number.isFinite(dayNumber) && dayNumber > 0 ? dayNumber : null;
}

function getPlateauDayTitle(
  day: Pick<PlateauDayListItem, "id" | "name">,
  allDays: PlateauDayListItem[],
) {
  const storedOrder = parsePlateauDayOrder(day.name);
  if (storedOrder) {
    return `Journée ${storedOrder}`;
  }

  const fallbackIndex = allDays.findIndex((entry) => entry.id === day.id);
  return buildPlateauDayLabel(Math.max(0, fallbackIndex));
}

function formatCompetitionLabel(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "Match";
  if (normalized === "championnat") return "Championnat";
  if (normalized === "plateau") return "Plateau";
  if (normalized === "coupe") return "Coupe";
  if (normalized === "amical" || normalized === "friendly") return "Amical";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function extractTeamsFromTitle(title: string | null) {
  if (!title?.trim()) return [];
  return title
    .split(/\s+vs\s+|\s+v\s+|\s*-\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildMatchTeams(options: {
  homeAway?: string | null;
  opponentName?: string | null;
  teamDisplayName: string;
  title: string | null;
}) {
  const opponentName = options.opponentName?.trim() ?? "";
  if (opponentName) {
    return options.homeAway === "away"
      ? [opponentName, options.teamDisplayName]
      : [options.teamDisplayName, opponentName];
  }

  const fallbackTeams = extractTeamsFromTitle(options.title);
  return fallbackTeams.length > 0 ? fallbackTeams : [options.teamDisplayName];
}

function normalizeCardTeams(value: unknown, title?: string | null) {
  if (Array.isArray(value)) {
    const teams = value.filter(
      (teamName): teamName is string =>
        typeof teamName === "string" && teamName.trim().length > 0,
    );

    if (teams.length > 0) return teams;
  }

  return extractTeamsFromTitle(title ?? null);
}

function sanitizePlateauDays(value: unknown): PlateauDayListItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((day) => {
      if (!day || typeof day !== "object") return null;

      const rawDay = day as {
        id?: unknown;
        name?: unknown;
        date?: unknown;
        time?: unknown;
        teams?: unknown;
        matches?: unknown;
      };

      if (typeof rawDay.id !== "string" || typeof rawDay.date !== "string") {
        return null;
      }

      const teams = Array.isArray(rawDay.teams)
        ? rawDay.teams.filter(
            (teamName): teamName is string =>
              typeof teamName === "string" && teamName.trim().length > 0,
          )
        : [];

      const matches = Array.isArray(rawDay.matches)
        ? rawDay.matches
            .map((match) => {
              if (!match || typeof match !== "object") return null;

              const rawMatch = match as {
                id?: unknown;
                homeTeam?: unknown;
                awayTeam?: unknown;
                date?: unknown;
                time?: unknown;
                status?: unknown;
                score?: unknown;
              };

              if (
                typeof rawMatch.id !== "string" ||
                typeof rawMatch.homeTeam !== "string" ||
                typeof rawMatch.awayTeam !== "string"
              ) {
                return null;
              }

              return {
                id: rawMatch.id,
                homeTeam: rawMatch.homeTeam,
                awayTeam: rawMatch.awayTeam,
                date:
                  typeof rawMatch.date === "string" ? rawMatch.date : rawDay.date,
                time: typeof rawMatch.time === "string" ? rawMatch.time : "10:00",
                status:
                  rawMatch.status === "draft" ||
                  rawMatch.status === "in_progress" ||
                  rawMatch.status === "finished"
                    ? rawMatch.status
                    : undefined,
                score: typeof rawMatch.score === "string" ? rawMatch.score : undefined,
              };
            })
            .filter(
              (match): match is PlateauDayListItem["matches"][number] =>
                Boolean(match),
            )
        : [];

      return {
        id: rawDay.id,
        name: typeof rawDay.name === "string" ? rawDay.name : undefined,
        date: rawDay.date,
        time: typeof rawDay.time === "string" ? rawDay.time : undefined,
        teams,
        matches,
      };
    })
    .filter((day): day is PlateauDayListItem => Boolean(day));
}

function buildPlateauStartAt(date: string, time?: string) {
  const base = new Date(date);
  if (Number.isNaN(base.getTime())) return date;

  const [hoursRaw, minutesRaw] = (time || "10:00").split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  base.setHours(
    Number.isNaN(hours) ? 10 : hours,
    Number.isNaN(minutes) ? 0 : minutes,
    0,
    0,
  );

  return base.toISOString();
}

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
  const [matches, setMatches] = useState<MatchSheetListItem[]>([]);
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
        let teamResponse: TeamProfile | null = null;
        let plateauDays: PlateauDayListItem[] = [];
        let matchesResponse: Awaited<ReturnType<typeof getMatchesByTeam>> = [];

        try {
          teamResponse = await getTeamProfile(teamId);
        } catch (teamError) {
          console.error(
            "Erreur chargement équipe feuille de match:",
            getErrorMessage(teamError),
          );
        }

        try {
          const plateauResponse = await supabase
            .from("championships")
            .select("data")
            .eq("team_id", teamId)
            .maybeSingle();

          if (plateauResponse.error) {
            throw plateauResponse.error;
          }

          const plateauData = (plateauResponse.data?.data ?? {}) as PlateauStorageData;
          plateauDays = sanitizePlateauDays(plateauData.plateau);
        } catch (plateauError) {
          console.error(
            "Erreur chargement journées plateau feuille de match:",
            getErrorMessage(plateauError),
          );
        }

        try {
          matchesResponse = await getMatchesByTeam(teamId);
        } catch (matchesError) {
          console.error(
            "Erreur chargement matchs feuille de match:",
            getErrorMessage(matchesError),
          );
        }

        const teamEventIds = (matchesResponse ?? []).map((match) => match.id);
        let matchDetailsByEventId = new Map<string, MatchDetailsRow>();

        if (teamEventIds.length > 0) {
          try {
            const fullResponse = await supabase
              .from("matches")
              .select("event_id,competition,opponent_name,home_away")
              .in("event_id", teamEventIds);

            if (fullResponse.error) {
              if (
                !isMissingColumnError(fullResponse.error, "matches", "competition")
              ) {
                throw fullResponse.error;
              }

              const fallbackResponse = await supabase
                .from("matches")
                .select("event_id,opponent_name")
                .in("event_id", teamEventIds);

              if (fallbackResponse.error) throw fallbackResponse.error;

              matchDetailsByEventId = new Map(
                ((fallbackResponse.data ?? []) as Array<{
                  event_id: string;
                  opponent_name: string;
                }>).map((row) => [
                  row.event_id,
                  {
                    event_id: row.event_id,
                    opponent_name: row.opponent_name,
                    competition: null,
                    home_away: null,
                  },
                ]),
              );
            } else {
              matchDetailsByEventId = new Map(
                ((fullResponse.data ?? []) as MatchDetailsRow[]).map((row) => [
                  row.event_id,
                  row,
                ]),
              );
            }
          } catch (matchDetailsError) {
            console.error(
              "Erreur chargement détails matchs feuille de match:",
              getErrorMessage(matchDetailsError),
            );
          }
        }

        const teamDisplayName = getTeamDisplayName(teamResponse);

        const upcomingMatches = (matchesResponse ?? [])
          .filter((match) => {
            const matchTime = new Date(match.start_at).getTime();
            return (
              matchTime >= Date.now() &&
              match.status !== "cancelled" &&
              !match.championship_match_id?.startsWith("plateau:")
            );
          })
          .map((match) => {
            const details = matchDetailsByEventId.get(match.id);
            const competitionLabel = match.championship_match_id?.startsWith(
              "championship:",
            )
              ? "Championnat"
              : formatCompetitionLabel(details?.competition);

            return {
              id: match.id,
              title: match.title,
              start_at: match.start_at,
              location: match.location ?? null,
              status: match.status,
              source: "team-event" as const,
              competitionLabel,
              teams: buildMatchTeams({
                homeAway: details?.home_away,
                opponentName: details?.opponent_name,
                teamDisplayName: teamDisplayName || "Mon équipe",
                title: getMatchDisplayTitle(match.title, teamResponse),
              }),
            };
          });

        const upcomingPlateauDays = plateauDays
          .filter((day) => {
            const startAt = buildPlateauStartAt(day.date, day.time);
            const startTime = new Date(startAt).getTime();
            return startTime >= Date.now();
          })
          .map((day) => ({
            id: `plateau-day:${day.id}`,
            title: getPlateauDayTitle(day, plateauDays),
            start_at: buildPlateauStartAt(day.date, day.time),
            location: null,
            status: "scheduled" as const,
            source: "plateau-day" as const,
            competitionLabel: "Plateau",
            teams:
              Array.isArray(day.teams) && day.teams.length > 0
                ? day.teams
                : Array.from(
                    new Set(
                      (day.matches ?? []).flatMap((match) =>
                        [match.homeTeam, match.awayTeam].filter(Boolean),
                      ),
                    ),
                  ),
          }));

        const upcomingItems = [...upcomingMatches, ...upcomingPlateauDays].sort(
          (a, b) =>
            new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
        );

        if (!cancelled) {
          setTeam(teamResponse);
          setMatches(upcomingItems);
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
                const cardTeams = normalizeCardTeams(match.teams, match.title);

                if (match.source === "plateau-day") {
                  return (
                    <Link
                      key={match.id}
                      href={`/app/teams/${teamId}/match-sheet/${encodeURIComponent(match.id)}`}
                      className="group flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.06] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            {formatMatchHeading(startDate)}
                          </span>
                          <span className="rounded-full border border-sky-300/30 bg-sky-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100">
                            {match.competitionLabel}
                          </span>
                        </div>

                        <h2 className="text-xl font-semibold text-slate-100">
                          {match.title}
                        </h2>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
                          <span>{shortDateFormatter.format(startDate)}</span>
                        </div>

                        {cardTeams.length > 0 ? (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {cardTeams.map((teamName) => (
                              <span
                                key={`${match.id}-${teamName}`}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200"
                              >
                                {teamName}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-violet-200 transition group-hover:text-violet-100">
                        Ouvrir la journée
                        <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
                      </span>
                    </Link>
                  );
                }

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
                        <span className="rounded-full border border-sky-300/30 bg-sky-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100">
                          {match.competitionLabel}
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

                      {cardTeams.length > 0 ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {cardTeams.map((teamName) => (
                            <span
                              key={`${match.id}-${teamName}`}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200"
                            >
                              {teamName}
                            </span>
                          ))}
                        </div>
                      ) : null}
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
