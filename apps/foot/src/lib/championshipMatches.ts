import type { TeamEventStatus } from "@/lib/api/teamEvents";

export type ChampionshipSyncStatus = "draft" | "in_progress" | "finished" | null | undefined;

export type ChampionshipSyncMatchInput = {
  dayId: string;
  matchId: string;
  dayDate: string;
  time?: string | null;
  opponentName?: string | null;
  homeAway?: "home" | "away" | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  score?: string | null;
  status?: ChampionshipSyncStatus;
};

const CHAMPIONSHIP_MATCH_LINK_PREFIX = "championship";

export function buildChampionshipMatchLinkId(dayId: string, matchId: string) {
  return `${CHAMPIONSHIP_MATCH_LINK_PREFIX}:${dayId}:${matchId}`;
}

export function buildChampionshipMatchTitle(
  homeTeam?: string | null,
  awayTeam?: string | null,
) {
  if (homeTeam && awayTeam) return `${homeTeam} vs ${awayTeam}`;
  if (homeTeam) return homeTeam;
  if (awayTeam) return awayTeam;
  return "Match de championnat";
}

export function buildChampionshipMatchStartAt(
  dayDate: string,
  matchTime?: string | null,
) {
  const base = new Date(dayDate);
  if (Number.isNaN(base.getTime())) return dayDate;

  const [hoursRaw, minutesRaw] = (matchTime || "18:00").split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  base.setHours(
    Number.isNaN(hours) ? 18 : hours,
    Number.isNaN(minutes) ? 0 : minutes,
    0,
    0,
  );

  return base.toISOString();
}

export function mapChampionshipStatusToTeamEventStatus(
  status?: ChampionshipSyncStatus,
): TeamEventStatus {
  if (status === "finished") return "played";
  return "scheduled";
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

function resolveGoalsFor(match: ChampionshipSyncMatchInput) {
  const parsed = parseScore(match.score);
  if (!parsed) return 0;
  return match.homeAway === "away" ? parsed.away : parsed.home;
}

function resolveGoalsAgainst(match: ChampionshipSyncMatchInput) {
  const parsed = parseScore(match.score);
  if (!parsed) return 0;
  return match.homeAway === "away" ? parsed.home : parsed.away;
}

function resolveResult(match: ChampionshipSyncMatchInput) {
  const goalsFor = resolveGoalsFor(match);
  const goalsAgainst = resolveGoalsAgainst(match);
  if (goalsFor > goalsAgainst) return "win";
  if (goalsFor < goalsAgainst) return "loss";
  return "draw";
}

export function mapChampionshipMatchesToTeamEvents(
  matches: ChampionshipSyncMatchInput[],
) {
  return matches.map((match) => ({
    championshipMatchId: buildChampionshipMatchLinkId(match.dayId, match.matchId),
    title: buildChampionshipMatchTitle(match.homeTeam, match.awayTeam),
    startAt: buildChampionshipMatchStartAt(match.dayDate, match.time),
    opponentName: match.opponentName ?? "Adversaire",
    competition: "championnat",
    location: null,
    homeAway: match.homeAway ?? "home",
    goalsFor: resolveGoalsFor(match),
    goalsAgainst: resolveGoalsAgainst(match),
    result: resolveResult(match),
    status: mapChampionshipStatusToTeamEventStatus(match.status),
  }));
}
