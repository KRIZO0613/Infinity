import type {
  ChampionshipMatchSyncInput,
  TeamEventStatus,
} from "@/lib/api/teamEvents";

export type PlateauMatchStatus = "draft" | "in_progress" | "finished";

export type PlateauStoredMatch = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  time: string;
  status?: PlateauMatchStatus;
  score?: string;
};

export type PlateauStoredDay = {
  id: string;
  date: string;
  matches: PlateauStoredMatch[];
};

type PlateauTeamContext = {
  teamAliases: string[];
};

function normalizeTeamName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isLocalTeamName(name: string, teamAliases: string[]) {
  const normalized = normalizeTeamName(name);
  if (!normalized) return false;
  return teamAliases.includes(normalized);
}

function buildPlateauMatchTitle(homeTeam: string, awayTeam: string) {
  if (homeTeam && awayTeam) return `${homeTeam} vs ${awayTeam}`;
  if (homeTeam) return homeTeam;
  if (awayTeam) return awayTeam;
  return "Match de plateau";
}

function buildPlateauMatchStartAt(dayDate: string, matchTime?: string | null) {
  const base = new Date(dayDate);
  if (Number.isNaN(base.getTime())) return dayDate;

  const [hoursRaw, minutesRaw] = (matchTime || "10:00").split(":");
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

function parseScore(score?: string | null) {
  if (!score) return null;
  const match = score.match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return null;
  return {
    home: Number(match[1]),
    away: Number(match[2]),
  };
}

function resolveGoalsFor(match: PlateauStoredMatch, homeAway: "home" | "away") {
  const parsed = parseScore(match.score);
  if (!parsed) return 0;
  return homeAway === "away" ? parsed.away : parsed.home;
}

function resolveGoalsAgainst(
  match: PlateauStoredMatch,
  homeAway: "home" | "away",
) {
  const parsed = parseScore(match.score);
  if (!parsed) return 0;
  return homeAway === "away" ? parsed.home : parsed.away;
}

function resolveResult(goalsFor: number, goalsAgainst: number) {
  if (goalsFor > goalsAgainst) return "win";
  if (goalsFor < goalsAgainst) return "loss";
  return "draw";
}

function mapPlateauStatusToTeamEventStatus(
  status?: PlateauMatchStatus,
): TeamEventStatus {
  if (status === "finished") return "played";
  return "scheduled";
}

export function buildPlateauMatchLinkId(dayId: string, matchId: string) {
  return `plateau:${dayId}:${matchId}`;
}

export function mapPlateauMatchesToTeamEvents(
  days: PlateauStoredDay[],
  context: PlateauTeamContext,
): ChampionshipMatchSyncInput[] {
  return days.flatMap((day) =>
    (Array.isArray(day.matches) ? day.matches : []).flatMap((match) => {
      const isHomeLocal = isLocalTeamName(match.homeTeam, context.teamAliases);
      const isAwayLocal = isLocalTeamName(match.awayTeam, context.teamAliases);

      if (!isHomeLocal && !isAwayLocal) {
        return [];
      }

      const homeAway = isHomeLocal ? "home" : "away";
      const goalsFor = resolveGoalsFor(match, homeAway);
      const goalsAgainst = resolveGoalsAgainst(match, homeAway);

      return [
        {
          championshipMatchId: buildPlateauMatchLinkId(day.id, match.id),
          title: buildPlateauMatchTitle(match.homeTeam, match.awayTeam),
          startAt: buildPlateauMatchStartAt(match.date || day.date, match.time),
          opponentName: isHomeLocal ? match.awayTeam : match.homeTeam,
          competition: "plateau",
          location: null,
          homeAway,
          goalsFor,
          goalsAgainst,
          result: resolveResult(goalsFor, goalsAgainst),
          status: mapPlateauStatusToTeamEventStatus(match.status),
        },
      ];
    }),
  );
}
