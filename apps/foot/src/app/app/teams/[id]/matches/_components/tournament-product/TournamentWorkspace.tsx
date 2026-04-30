"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TournamentPreviewSlot } from "@/components/tournament-preview/types";

import type {
  TournamentProductCoachMealRow,
  TournamentProductCoachMealSubmission,
  TournamentProductCoachTeamSubmission,
  TournamentProductGroup,
  TournamentProductMatchState,
  TournamentProductMealItem,
  TournamentProductSavedTournament,
  TournamentProductScheduleMatch,
  TournamentProductShareSettings,
  TournamentProductStatus,
  TournamentProductTeamPlayer,
  TournamentWorkspaceTab,
} from "./types";
import { TournamentPreview } from "@/components/tournament-preview/TournamentPreview";
import {
  getTournamentMatchDatabaseId,
  loadTournament,
  loadTournamentMatchLiveStates,
  loadTournamentPlayers,
  replaceTournament,
  saveTournamentMatchesLiveStates,
  saveTournamentPlayer,
} from "@/lib/tournamentService";
import { supabase } from "@/lib/supabaseClient";

type TournamentWorkspaceProps = {
  tournament: TournamentProductSavedTournament;
  groups: TournamentProductGroup[];
  structurePreview: ReactNode | null;
  structurePreviewByDivision?: Array<{
    id: string;
    label: string;
    content: ReactNode | null;
  }>;
  onClose: () => void;
  onEditStructure: () => void;
  onSave: (nextTournament: TournamentProductSavedTournament) => Promise<void> | void;
  viewMode?: "organizer" | "coach" | "parent";
  initialCoachTeamName?: string | null;
  initialVoterTeamName?: string | null;
};

type StandingRow = {
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  diff: number;
  points: number;
};

type LivePickerMode = "scorer" | null;
type LivePickerTeam = "home" | "away";
type MatchDisplayState = "idle" | "live" | "completed";
type VoteRole = "parent" | "coach" | "admin";
type MvpVote = NonNullable<TournamentProductMatchState["mvpVotes"]>[number];
type ParentVoteSession = {
  teamId: string;
  unlockedByCode: true;
  votedMatchIds: string[];
};

const PUBLIC_MVP_VOTE_WINDOW_MS = 5 * 60 * 1000;

type LiveRuntime = {
  elapsedSeconds: number;
  running: boolean;
  startedAt: number | null;
};

type LiveGoalEvent = {
  team: LivePickerTeam;
  number: number;
  elapsedSeconds: number;
};

type PenaltyEvent = NonNullable<TournamentProductMatchState["penaltyShootout"]>["events"][number];

const summarizeLiveGoalEvents = (events: LiveGoalEvent[]) =>
  Array.from(
    events
      .reduce((map, event) => {
        const key = `${event.team}-${event.number}`;
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
          existing.times.push(formatLiveDuration(event.elapsedSeconds));
          return map;
        }
        map.set(key, {
          team: event.team,
          number: event.number,
          count: 1,
          times: [formatLiveDuration(event.elapsedSeconds)],
        });
        return map;
      }, new Map<string, { team: LivePickerTeam; number: number; count: number; times: string[] }>())
      .values(),
  );

const renderTeamBadge = (teamName: string) => (
  <span
    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-300/20 text-xs font-semibold uppercase text-white shadow-[0_0_12px_rgba(124,58,237,0.42)]"
    style={{ background: "linear-gradient(135deg, #7C3AED, #4C1D95)" }}
  >
    {teamName.slice(0, 2)}
  </span>
);

const renderRankingBadge = (position: number) =>
  position === 1 ? (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500/20 px-1.5 text-[10px] font-bold text-emerald-200 shadow-[0_0_10px_rgba(34,197,94,0.18)]">
      {position}
    </span>
  ) : (
    <span className="inline-flex min-w-4 items-center justify-center text-[10px] font-semibold text-white/55">
      {position}
    </span>
  );

const TEAM_NAME_BLOCK_CLASS =
  "block min-w-0 max-w-[112px] text-[10.5px] font-black leading-[1.05] tracking-[-0.03em] text-white sm:max-w-[132px] sm:text-[11px] md:max-w-[180px] md:text-[14px] xl:max-w-[210px]";

const getGroupShortcutLabel = (label: string) => {
  const compactLabel = label.replace(/^poule\s+/i, "").trim();
  return compactLabel || label;
};

const formatLiveDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
};

const formatFinalRankLabel = (rank: number) => `${rank}${rank === 1 ? "er" : "e"}`;

const STATUS_OPTIONS: Array<{ value: TournamentProductStatus; label: string }> = [
  { value: "draft", label: "Brouillon" },
  { value: "published", label: "Publié" },
  { value: "live", label: "En cours" },
  { value: "finished", label: "Terminé" },
];

const MATCH_STATUS_OPTIONS: Array<{ value: TournamentProductMatchState["status"]; label: string }> = [
  { value: "idle", label: "À venir" },
  { value: "live", label: "En direct" },
  { value: "completed", label: "Terminé" },
];

const MATCH_STATUS_BADGES: Record<
  TournamentProductMatchState["status"],
  { label: string; className: string; dotClassName: string }
> = {
  idle: {
    label: "À jouer",
    className: "bg-white/[0.05] text-white/60",
    dotClassName: "bg-white/45",
  },
  scheduled: {
    label: "À jouer",
    className: "bg-white/[0.05] text-white/60",
    dotClassName: "bg-white/45",
  },
  live: {
    label: "En cours",
    className: "bg-[#22C55E]/15 text-[#22C55E]",
    dotClassName: "bg-[#22C55E]",
  },
  paused: {
    label: "En pause",
    className: "bg-amber-500/15 text-amber-300",
    dotClassName: "bg-amber-300",
  },
  completed: {
    label: "Terminé",
    className: "bg-sky-500/15 text-sky-300",
    dotClassName: "bg-sky-300",
  },
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

const isPause = (match: TournamentProductScheduleMatch) =>
  match.isPause === true || match.type === "pause";

const toMinutes = (value: string) => {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
};

const toTimeLabel = (value: number) => {
  const safeValue = Math.max(0, value);
  const hours = Math.floor(safeValue / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (safeValue % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

const addMinutes = (value: string, minutes: number) => toTimeLabel(toMinutes(value) + minutes);

const getMatchDuration = (match: TournamentProductScheduleMatch, fallbackDuration: number) => {
  const duration = toMinutes(match.endTime) - toMinutes(match.startTime);
  return duration > 0 ? duration : fallbackDuration;
};

const getCompetitionPath = (match: Pick<TournamentProductScheduleMatch, "roundLabel" | "stage">) => {
  const source = `${match.roundLabel} ${match.stage ?? ""}`.toLowerCase();
  if (source.includes("europa")) return "EUROPA";
  if (source.includes("uefa")) return "UEFA";
  return null;
};

const isTrueThirdPlace = (match: Pick<TournamentProductScheduleMatch, "roundLabel" | "stage">) => {
  const roundLabel = match.roundLabel.toLowerCase();
  const stage = (match.stage ?? "").toLowerCase();
  return roundLabel.includes("3e place") && !roundLabel.includes("13e") && stage !== "bracket16_bottom_final";
};

const isPlacementMatch = (match: Pick<TournamentProductScheduleMatch, "roundLabel" | "stage">) => {
  if (isTrueThirdPlace(match)) return false;
  const source = `${match.roundLabel} ${match.stage ?? ""}`.toLowerCase();
  return source.includes("classement") || /\b(?:5e|7e|9e|11e|13e|15e)\b/.test(source);
};

const getPhaseLabel = (match: TournamentProductScheduleMatch) => {
  const source = `${match.roundLabel} ${match.stage ?? ""}`.toLowerCase();
  if (source.includes("amical")) return "Amical";
  if (source.includes("poule") || source.includes("round robin")) return "Poule";
  if (source.includes("huitième") || source.includes("8e")) return "8e";
  if (source.includes("quart")) return "Quart";
  if (source.includes("demi")) return "Demi";
  if (source.includes("finale")) return "Finale";
  if (isPlacementMatch(match)) return "Classement";
  return "Phase finale";
};

const getMatchOrderValue = (match: Pick<TournamentProductScheduleMatch, "slotIndex" | "startTime">) =>
  Number.isFinite(match.slotIndex) ? Number(match.slotIndex) : null;

const sortMatchesByTime = (matches: TournamentProductScheduleMatch[]) =>
  [...matches].sort((left, right) => {
    const leftOrder = getMatchOrderValue(left);
    const rightOrder = getMatchOrderValue(right);
    const timeGap = toMinutes(left.startTime) - toMinutes(right.startTime);

    if (timeGap !== 0) return timeGap;

    if (leftOrder !== null || rightOrder !== null) {
      const safeLeftOrder = leftOrder ?? Number.MAX_SAFE_INTEGER;
      const safeRightOrder = rightOrder ?? Number.MAX_SAFE_INTEGER;
      const orderGap = safeLeftOrder - safeRightOrder;
      if (orderGap !== 0) return orderGap;
    }

    return left.fieldLabel.localeCompare(right.fieldLabel, "fr");
  });

const buildGroupKey = (match: TournamentProductScheduleMatch) => {
  const source = `${match.roundLabel.trim()} ${match.stage ?? ""}`.trim();
  const explicitGroup = source.match(/Poule\s+([A-Z])/i);
  const baseLabel = explicitGroup
    ? `Poule ${explicitGroup[1].toUpperCase()}`
    : /round robin/i.test(source)
      ? "Classement général"
      : null;
  if (!baseLabel) return null;
  return match.divisionName ? `${match.divisionName} • ${baseLabel}` : baseLabel;
};

const isGroupScheduleMatch = (match: TournamentProductScheduleMatch) =>
  match.scheduleSection === "group" || buildGroupKey(match) !== null || getPhaseLabel(match) === "Poule";

const getCompactRoundLabel = (match: TournamentProductScheduleMatch) => {
  const groupKey = buildGroupKey(match);
  if (groupKey) {
    const parts = groupKey
      .split("•")
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.at(-1) ?? groupKey;
  }
  return match.roundLabel;
};

const getDivisionBadgeClasses = (divisionName: string) => {
  if (/u11/i.test(divisionName)) {
    return "border-violet-300/25 bg-[linear-gradient(135deg,rgba(168,85,247,0.24),rgba(139,92,246,0.18))] text-violet-100 shadow-[0_0_18px_rgba(168,85,247,0.16)]";
  }

  if (/u12/i.test(divisionName)) {
    return "border-sky-300/25 bg-[linear-gradient(135deg,rgba(56,189,248,0.22),rgba(59,130,246,0.18))] text-sky-100 shadow-[0_0_18px_rgba(56,189,248,0.16)]";
  }

  return "border-indigo-300/25 bg-[linear-gradient(135deg,rgba(125,138,255,0.22),rgba(139,92,246,0.2))] text-indigo-100 shadow-[0_0_18px_rgba(129,140,248,0.16)]";
};

const isPenaltyEligibleMatch = (match: TournamentProductScheduleMatch) =>
  match.scheduleSection === "final" && !isPause(match);

const getPlacementRanks = (match: Pick<TournamentProductScheduleMatch, "roundLabel" | "stage">) => {
  const source = `${match.roundLabel} ${match.stage ?? ""}`.toLowerCase();

  if (isTrueThirdPlace(match)) return { winnerRank: 3, loserRank: 4 };
  if (/classement 5e place|\b5e place\b/i.test(source)) return { winnerRank: 5, loserRank: 6 };
  if (/classement 7e place|\b7e place\b/i.test(source)) return { winnerRank: 7, loserRank: 8 };
  if (/classement 9e place|\b9e place\b/i.test(source)) return { winnerRank: 9, loserRank: 10 };
  if (/classement 11e place|\b11e place\b/i.test(source)) return { winnerRank: 11, loserRank: 12 };
  if (/classement 13e place|\b13e place\b/i.test(source)) return { winnerRank: 13, loserRank: 14 };
  if (/classement 15e place|\b15e place\b/i.test(source)) return { winnerRank: 15, loserRank: 16 };
  if (
    /finale/i.test(source) &&
    !/consolante|cons\.|classement/i.test(source) &&
    !isTrueThirdPlace(match)
  ) {
    return { winnerRank: 1, loserRank: 2 };
  }

  return null;
};

const getPenaltyTargetAttempts = (
  state: TournamentProductMatchState | null | undefined,
  fallback = 5,
) => Math.max(1, state?.penaltyShootout?.targetAttempts ?? fallback);

const getPenaltyShootoutScore = (shootout?: TournamentProductMatchState["penaltyShootout"]) => {
  const events = shootout?.events ?? [];
  return events.reduce(
    (acc, event) => {
      acc[`${event.team}Attempts` as const] += 1;
      if (event.scored) {
        acc[`${event.team}Score` as const] += 1;
      }
      return acc;
    },
    {
      homeScore: 0,
      awayScore: 0,
      homeAttempts: 0,
      awayAttempts: 0,
    },
  );
};

const getPenaltyWinnerFromEvents = (events: PenaltyEvent[], targetAttempts = 5): LivePickerTeam | null => {
  let homeScore = 0;
  let awayScore = 0;
  let homeAttempts = 0;
  let awayAttempts = 0;

  for (const event of events) {
    if (event.team === "home") {
      homeAttempts += 1;
      if (event.scored) homeScore += 1;
    } else {
      awayAttempts += 1;
      if (event.scored) awayScore += 1;
    }

    if (homeAttempts < targetAttempts || awayAttempts < targetAttempts) {
      const remainingHome = targetAttempts - homeAttempts;
      const remainingAway = targetAttempts - awayAttempts;
      if (homeScore > awayScore + remainingAway) return "home";
      if (awayScore > homeScore + remainingHome) return "away";
      if (homeAttempts === targetAttempts && awayAttempts === targetAttempts && homeScore !== awayScore) {
        return homeScore > awayScore ? "home" : "away";
      }
      continue;
    }

    if (homeAttempts === awayAttempts && homeScore !== awayScore) {
      return homeScore > awayScore ? "home" : "away";
    }
  }

  return null;
};

const getNextPenaltyTeam = (shootout?: TournamentProductMatchState["penaltyShootout"]): LivePickerTeam => {
  const { homeAttempts, awayAttempts } = getPenaltyShootoutScore(shootout);
  return homeAttempts <= awayAttempts ? "home" : "away";
};

const getResolvedKnockoutOutcome = (state: TournamentProductMatchState | null | undefined) => {
  if (!state) {
    return null;
  }

  if (getMatchDisplayState(state) !== "completed") {
    return null;
  }

  const penaltyWinner =
    state.penaltyShootout?.winner ??
    getPenaltyWinnerFromEvents(
      state.penaltyShootout?.events ?? [],
      getPenaltyTargetAttempts(state),
    );

  if (state.homeScore === null || state.awayScore === null) {
    if (!penaltyWinner) return null;
    return {
      winner: penaltyWinner,
      loser: penaltyWinner === "home" ? ("away" as const) : ("home" as const),
    };
  }

  if (state.homeScore > state.awayScore) {
    return { winner: "home" as const, loser: "away" as const };
  }
  if (state.homeScore < state.awayScore) {
    return { winner: "away" as const, loser: "home" as const };
  }
  if (!penaltyWinner) return null;
  return {
    winner: penaltyWinner,
    loser: penaltyWinner === "home" ? ("away" as const) : ("home" as const),
  };
};

const normalizeTeamNameForComparison = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();

const getGroupStandingMatches = (
  group: TournamentProductGroup,
  matches: TournamentProductScheduleMatch[],
) => {
  const exactMatches = matches.filter((match) => buildGroupKey(match) === group.label);
  if (exactMatches.length > 0) return exactMatches;

  const groupTeamKeys = new Set(group.teams.map(normalizeTeamNameForComparison));
  return matches.filter(
    (match) =>
      groupTeamKeys.has(normalizeTeamNameForComparison(match.homeTeam)) &&
      groupTeamKeys.has(normalizeTeamNameForComparison(match.awayTeam)),
  );
};

const buildStandingTable = (
  group: TournamentProductGroup,
  matches: TournamentProductScheduleMatch[],
  states: Record<string, TournamentProductMatchState>,
) => {
  const table = new Map<string, StandingRow>();
  const teamNameByNormalizedKey = new Map<string, string>();

  group.teams.forEach((team) => {
    teamNameByNormalizedKey.set(normalizeTeamNameForComparison(team), team);
    table.set(team, {
      team,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      diff: 0,
      points: 0,
    });
  });

  matches.forEach((match) => {
    const state = getStoredMatchState(states, match);
    if (!state) return;
    if (state.homeScore === null || state.awayScore === null) return;

    const homeTeamName = table.has(match.homeTeam)
      ? match.homeTeam
      : teamNameByNormalizedKey.get(normalizeTeamNameForComparison(match.homeTeam));
    const awayTeamName = table.has(match.awayTeam)
      ? match.awayTeam
      : teamNameByNormalizedKey.get(normalizeTeamNameForComparison(match.awayTeam));
    if (!homeTeamName || !awayTeamName) return;

    const home = table.get(homeTeamName);
    const away = table.get(awayTeamName);
    if (!home || !away) return;

    home.played += 1;
    away.played += 1;
    home.goalsFor += state.homeScore;
    home.goalsAgainst += state.awayScore;
    away.goalsFor += state.awayScore;
    away.goalsAgainst += state.homeScore;

    if (state.homeScore > state.awayScore) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else if (state.homeScore < state.awayScore) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }

    home.diff = home.goalsFor - home.goalsAgainst;
    away.diff = away.goalsFor - away.goalsAgainst;
  });

  return [...table.values()].sort((left, right) => {
    if (right.points !== left.points) return right.points - left.points;
    if (right.diff !== left.diff) return right.diff - left.diff;
    if (right.goalsFor !== left.goalsFor) return right.goalsFor - left.goalsFor;
    return left.team.localeCompare(right.team, "fr");
  });
};

const getFinalMatchReferenceId = (
  match: Pick<TournamentProductScheduleMatch, "roundLabel">,
  counters: Record<string, number>,
) => {
  const next = (prefix: string) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}${counters[prefix]}`;
  };

  if (/Huiti[eè]me de finale/i.test(match.roundLabel)) return next("H");
  if (/Quart de finale/i.test(match.roundLabel)) return next("QF");
  if (/Demi-finale/i.test(match.roundLabel)) return next("DF");
  if (/Classement 5e-8e/i.test(match.roundLabel)) return next("C");
  if (/Classement 9e-16e|Classement 9e-12e|Classement 13e-16e/i.test(match.roundLabel)) return next("B");
  if (/Classement 5e place/i.test(match.roundLabel)) return next("P5");
  if (/Classement 7e place/i.test(match.roundLabel)) return next("P7");
  if (/Classement 9e place/i.test(match.roundLabel)) return next("P9");
  if (/Classement 11e place/i.test(match.roundLabel)) return next("P11");
  if (/Classement 13e place/i.test(match.roundLabel)) return next("P13");
  if (/Classement 15e place/i.test(match.roundLabel)) return next("P15");
  if (/3e place/i.test(match.roundLabel)) return next("TP");
  if (/Finale/i.test(match.roundLabel)) return next("F");
  return next("M");
};

const matchFinalReferenceKey = (
  match: Pick<TournamentProductScheduleMatch, "roundLabel" | "label" | "stage">,
  referenceKey: string,
) => {
  const normalizedRef = referenceKey.trim().toUpperCase();
  const roundLabel = match.roundLabel.toUpperCase();
  const matchLabel = (match.label ?? "").toUpperCase();

  const numberedRef = normalizedRef.match(/^(QF|SF|DF|8E|16E|H|P|F|CF|TP)(\d+)$/);
  if (!numberedRef) return false;

  const [, prefix, rawIndex] = numberedRef;
  const index = Number(rawIndex);
  if (!Number.isFinite(index)) return false;

  if (prefix === "QF") {
    return /QUART/i.test(roundLabel) && matchLabel.includes(`QUART ${index}`);
  }
  if (prefix === "SF" || prefix === "DF") {
    return /DEMI/i.test(roundLabel) && matchLabel.includes(`DEMI ${index}`);
  }
  if (prefix === "8E" || prefix === "H") {
    return /(8EME|HUITI)/i.test(roundLabel) && matchLabel.includes(`${index}`);
  }
  if (prefix === "16E") {
    return /16EME/i.test(roundLabel) && matchLabel.includes(`${index}`);
  }
  if (prefix === "CF") {
    return /FINALE/i.test(roundLabel) && /CONSOLANTE/i.test(roundLabel) && index === 1;
  }
  if (prefix === "F") {
    return /FINALE/i.test(roundLabel) && !/CONSOLANTE/i.test(roundLabel) && index === 1;
  }
  if (prefix === "TP") {
    return /3E PLACE/i.test(roundLabel) && index === 1;
  }
  if (prefix === "P") {
    return roundLabel.includes(`${index}E PLACE`) || matchLabel.includes(`${index}E PLACE`);
  }

  return false;
};

const getDefaultMatchState = (): TournamentProductMatchState => ({
  homeScore: null,
  awayScore: null,
  status: "idle",
  startedAt: null,
  completedAt: null,
});

const getMatchDisplayState = (state: TournamentProductMatchState): MatchDisplayState => {
  const status = state.status as string;
  if (status === "live") return "live";
  if (status === "completed" || status === "finished") return "completed";
  return "idle";
};

const getStoredMatchState = (
  states: Record<string, TournamentProductMatchState> | undefined,
  match: Pick<TournamentProductScheduleMatch, "id" | "divisionId">,
) => {
  if (!states) return null;

  const previewSourceMatchId = getPreviewSourceMatchId(match.id);
  return (
    states[match.id] ??
    states[previewSourceMatchId] ??
    (match.divisionId ? states[`${match.divisionId}__${match.id}`] : undefined) ??
    (match.divisionId ? states[`${match.divisionId}__${previewSourceMatchId}`] : undefined) ??
    null
  );
};

const toServerMatchState = (state: TournamentProductMatchState, goalEvents: LiveGoalEvent[] = []) => {
  const status = getMatchDisplayState(state);

  return {
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    status,
    startedAt: status === "idle" ? null : (state.startedAt ?? null),
    completedAt: status === "completed" ? (state.completedAt ?? null) : null,
    goalEvents: toServerGoalEvents(goalEvents),
  };
};

const toServerGoalEvents = (events: LiveGoalEvent[]) =>
  events.map((event) => ({
    team: event.team,
    number: event.number,
    elapsedSeconds: event.elapsedSeconds,
  }));

type SyncedMatchState = ReturnType<typeof toServerMatchState>;

const areSyncedMatchStatesEqual = (left: SyncedMatchState, right: SyncedMatchState) =>
  left.homeScore === right.homeScore &&
  left.awayScore === right.awayScore &&
  left.status === right.status &&
  (left.startedAt ?? null) === (right.startedAt ?? null) &&
  (left.completedAt ?? null) === (right.completedAt ?? null) &&
  JSON.stringify(left.goalEvents ?? []) === JSON.stringify(right.goalEvents ?? []);

const normalizeSyncedMatchStatus = (status: unknown): SyncedMatchState["status"] => {
  if (status === "live") return "live";
  if (status === "completed" || status === "finished") return "completed";
  return "idle";
};

const createEmptyRosterPlayer = (index: number): TournamentProductTeamPlayer => ({
  lastName: "",
  firstName: "",
  license: "",
  number: `${index + 1}`,
});

const countFilledRosterPlayers = (players: TournamentProductTeamPlayer[]) =>
  players.filter(
    (player) =>
      player.lastName.trim() ||
      player.firstName.trim() ||
      player.license.trim(),
  ).length;

const formatTournamentPlayerFullName = (player: TournamentProductTeamPlayer | null | undefined) =>
  [player?.lastName?.trim() ?? "", player?.firstName?.trim() ?? ""].filter(Boolean).join(" ");

const areRosterPlayersEqual = (
  leftPlayers: TournamentProductTeamPlayer[] = [],
  rightPlayers: TournamentProductTeamPlayer[] = [],
) => {
  if (leftPlayers.length !== rightPlayers.length) return false;

  return leftPlayers.every((player, index) => {
    const candidate = rightPlayers[index];
    return (
      (candidate?.id ?? "") === (player.id ?? "") &&
      candidate?.lastName === player.lastName &&
      candidate?.firstName === player.firstName &&
      candidate?.license === player.license &&
      candidate?.number === player.number
    );
  });
};

const isPlaceholderTournamentTeamName = (teamName: string) => /^equipe\s+\d+$/i.test(teamName.trim());

const isUnresolvedTournamentParticipant = (teamName?: string | null) => {
  const value = (teamName ?? "").trim();
  if (!value) return true;
  if (isPlaceholderTournamentTeamName(value)) return true;

  return (
    /^winner\b/i.test(value) ||
    /^gagnant\b/i.test(value) ||
    /^vainqueur\b/i.test(value) ||
    /^perdant\b/i.test(value) ||
    /^meilleur\s+\d+/i.test(value) ||
    /^\d+(?:er|e|eme)\s*\(dsqf(?:\s+\d+)?\)$/i.test(value) ||
    /^seed\s+\d+/i.test(value) ||
    /^\d+[A-Z]$/i.test(value) ||
    /^\d+(?:er|e)\s+poule\b/i.test(value)
  );
};

const getPreviewSourceMatchId = (matchId: string) => matchId.split("__").at(-1) ?? matchId;

const getBracketReferenceKeys = (matchId: string) => {
  const rawId = getPreviewSourceMatchId(matchId).trim();
  const upperRawId = rawId.toUpperCase();
  const keys = new Set<string>([upperRawId, matchId.trim().toUpperCase()]);
  const wrappedIdMatch = upperRawId.match(/^(MAIN|SECONDARY|PLACEMENT)-(.+)$/i);
  if (wrappedIdMatch) {
    keys.add(wrappedIdMatch[2].toUpperCase());
    if (wrappedIdMatch[1].toUpperCase() === "SECONDARY") {
      keys.add(`CONS. ${wrappedIdMatch[2].toUpperCase()}`);
    }
  }

  const compactRawId = wrappedIdMatch ? wrappedIdMatch[2].toUpperCase() : upperRawId;
  const placementMatch = compactRawId.match(/^(.*)-MATCH-(\d+)$/i);
  if (placementMatch) {
    keys.add(`${placementMatch[1]}${placementMatch[2]}`.toUpperCase());
  }

  const playInMatch = compactRawId.match(/^(.*)-PLAY-IN-(\d+)$/i);
  if (playInMatch) {
    keys.add(`${playInMatch[1]}B${playInMatch[2]}`.toUpperCase());
  }

  const placementFinalMatch = compactRawId.match(/^(.*)-FINAL$/i);
  if (placementFinalMatch) {
    keys.add(`${placementFinalMatch[1]}F1`.toUpperCase());
  }

  return [...keys];
};

const getDependencyReferenceKeysFromLabel = (value: string) => {
  const normalizedLabel = value.trim().toUpperCase();
  const keys = new Set<string>([normalizedLabel]);

  const parenthesizedCode = normalizedLabel.match(/\b(16E\d+|8E\d+|QF\d+|SF\d+|DF\d+|F\d+|P\d+|TP\d+|C\d+|B\d+|H\d+|CL[A-Z0-9]+)\b/gi);
  parenthesizedCode?.forEach((code) => keys.add(code.toUpperCase()));

  const rawCodeMatch = normalizedLabel.match(/\(([^)]+)\)/);
  if (rawCodeMatch?.[1]) {
    keys.add(rawCodeMatch[1].trim().toUpperCase());
  }

  return [...keys];
};

const formatQualificationSourceLabel = (label: string) => label.trim();

const ALL_PENALTY_MATCHES_KEY = "__all__";

const buildPublicToken = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now()}${Math.random().toString(16).slice(2)}`;

const buildParentTeamCode = () =>
  Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z0-9]/g, "X");

const normalizeParentTeamCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "");

const buildDefaultShareSettings = (
  current?: TournamentProductShareSettings,
): TournamentProductShareSettings => ({
  tournamentPublished: current?.tournamentPublished ?? false,
  coachAccessEnabled: current?.coachAccessEnabled ?? false,
  parentAccessEnabled: current?.parentAccessEnabled ?? false,
  coachTournamentAccessEnabled: current?.coachTournamentAccessEnabled ?? false,
  parentTournamentAccessEnabled: current?.parentTournamentAccessEnabled ?? false,
  publicMvpLeaderboardEnabled: current?.publicMvpLeaderboardEnabled ?? false,
  topScorerVisibility: current?.topScorerVisibility ?? "always",
  coachToken: current?.coachToken ?? buildPublicToken(),
  parentToken: current?.parentToken ?? buildPublicToken(),
  parentTeamCodes: current?.parentTeamCodes ?? {},
  votesEnabled: current?.votesEnabled ?? false,
  coachTeamSubmissions: current?.coachTeamSubmissions ?? {},
  coachMealSubmissions: current?.coachMealSubmissions ?? {},
});

const buildDefaultMealRows = (
  maxMealRows: number,
  mealItems: TournamentProductMealItem[],
  currentRows?: TournamentProductCoachMealRow[],
) =>
  Array.from({ length: maxMealRows }, (_, index) => {
    const existing = currentRows?.[index];
    return {
      id: existing?.id ?? `meal-row-${index + 1}`,
      participantLabel: existing?.participantLabel ?? "",
      quantities: Object.fromEntries(
        mealItems.map((item) => [item.id, Math.max(0, existing?.quantities?.[item.id] ?? 0)]),
      ),
    };
  });

const countFilledMealRows = (rows: TournamentProductCoachMealRow[] = []) =>
  rows.filter((row) =>
    Object.values(row.quantities ?? {}).some((quantity) => quantity > 0),
  ).length;

const getVoteWeight = (role: VoteRole): 1 | 3 | 5 => {
  if (role === "admin") return 5;
  if (role === "coach") return 3;
  return 1;
};

const formatRelativeMinuteLabel = (value?: string | null) => {
  if (!value) return "Aucun vote";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Aucun vote";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes <= 0) return "Dernier vote : maintenant";
  if (minutes === 1) return "Dernier vote : il y a 1 min";
  return `Dernier vote : il y a ${minutes} min`;
};

const getWeightedMvp = (state: TournamentProductMatchState) => {
  const votes = state.mvpVotes ?? [];
  if (votes.length === 0) return state.mvp ?? null;

  const totals = new Map<string, { team: LivePickerTeam; number: number; score: number; lastVoteAt: string }>();

  votes.forEach((vote) => {
    const key = `${vote.team}-${vote.number}`;
    const existing = totals.get(key);
    totals.set(key, {
      team: vote.team,
      number: vote.number,
      score: (existing?.score ?? 0) + getVoteWeight(vote.role),
      lastVoteAt:
        !existing || vote.createdAt > existing.lastVoteAt
          ? vote.createdAt
          : existing.lastVoteAt,
    });
  });

  return (
    [...totals.values()].sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.lastVoteAt.localeCompare(left.lastVoteAt);
    })[0] ?? null
  );
};

const mergeMvpVotes = (leftVotes: MvpVote[] = [], rightVotes: MvpVote[] = []) => {
  const merged = new Map<string, MvpVote>();

  [...leftVotes, ...rightVotes].forEach((vote) => {
    const previous = merged.get(vote.id);
    if (!previous) {
      merged.set(vote.id, vote);
      return;
    }

    const previousTime = Date.parse(previous.createdAt);
    const nextTime = Date.parse(vote.createdAt);
    if (!Number.isFinite(previousTime) || nextTime >= previousTime) {
      merged.set(vote.id, vote);
    }
  });

  return [...merged.values()].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt);
    const rightTime = Date.parse(right.createdAt);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.id.localeCompare(right.id, "fr");
  });
};

const areMvpVotesEqual = (leftVotes: MvpVote[] = [], rightVotes: MvpVote[] = []) => {
  if (leftVotes.length !== rightVotes.length) return false;

  return leftVotes.every((vote, index) => {
    const candidate = rightVotes[index];
    return (
      candidate?.id === vote.id &&
      candidate.role === vote.role &&
      candidate.team === vote.team &&
      candidate.number === vote.number &&
      candidate.weight === vote.weight &&
      (candidate.voterTeamId ?? null) === (vote.voterTeamId ?? null) &&
      candidate.createdAt === vote.createdAt
    );
  });
};

const getCoachMealStatus = (rows: TournamentProductCoachMealRow[] = [], maxMeals: number) => {
  const filledMealRows = countFilledMealRows(rows);
  const safeMaxMeals = Math.max(1, maxMeals);

  if (filledMealRows <= 0) return "pending";
  if (filledMealRows >= safeMaxMeals) return "validated";
  return "partial";
};

const mealOrderStatusView = {
  pending: {
    label: "Non reçu",
    className: "border-rose-300/20 bg-rose-500/12 text-rose-100",
    dotClassName: "bg-rose-300",
  },
  partial: {
    label: "En cours",
    className: "border-amber-300/20 bg-amber-500/12 text-amber-100",
    dotClassName: "bg-amber-300",
  },
  validated: {
    label: "Validé",
    className: "border-emerald-300/20 bg-emerald-500/12 text-emerald-100",
    dotClassName: "bg-emerald-300",
  },
} as const;

const normalizeTeamLookupValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "");

const findTournamentTeamByIdentifier = (
  teams: TournamentProductSavedTournament["teams"],
  identifier: string,
) => {
  const normalizedIdentifier = normalizeTeamLookupValue(identifier);
  return (
    teams.find((team) => team.id === identifier) ??
    teams.find((team) => team.name === identifier) ??
    teams.find((team) => normalizeTeamLookupValue(team.name) === normalizedIdentifier) ??
    null
  );
};

const normalizeTournamentWorkspaceDraft = (
  tournament: TournamentProductSavedTournament,
): TournamentProductSavedTournament => {
  const shareSettings = buildDefaultShareSettings(tournament.shareSettings);

  return {
    ...tournament,
    mealItems: tournament.mealItems ?? [],
    shareSettings,
  };
};

export function TournamentWorkspace({
  tournament,
  groups,
  structurePreview,
  structurePreviewByDivision = [],
  onClose,
  onEditStructure,
  onSave,
  viewMode = "organizer",
  initialCoachTeamName = null,
  initialVoterTeamName = null,
}: TournamentWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TournamentWorkspaceTab>("overview");
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<TournamentProductSavedTournament>(() =>
    normalizeTournamentWorkspaceDraft(tournament),
  );
  const overviewGroupsScrollerRef = useRef<HTMLDivElement | null>(null);
  const overviewGroupCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const matchRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeOverviewGroup, setActiveOverviewGroup] = useState<string | null>(null);
  const [overviewScrollMask, setOverviewScrollMask] = useState({ left: false, right: true });
  const overviewAutoScrollTargetRef = useRef<string | null>(null);
  const [selectedLiveMatchId, setSelectedLiveMatchId] = useState<string | null>(null);
  const [liveRuntimeByMatch, setLiveRuntimeByMatch] = useState<Record<string, LiveRuntime>>({});
  const [liveClockNow, setLiveClockNow] = useState(0);
  const [voteWindowNow, setVoteWindowNow] = useState(() => Date.now());
  const [liveScorersByMatch, setLiveScorersByMatch] = useState<Record<string, LiveGoalEvent[]>>({});
  const [livePickerMode, setLivePickerMode] = useState<LivePickerMode>(null);
  const [livePickerTeam, setLivePickerTeam] = useState<LivePickerTeam>("home");
  const [livePickerMatchId, setLivePickerMatchId] = useState<string | null>(null);
  const [expandedLiveStatsMatchId, setExpandedLiveStatsMatchId] = useState<string | null>(null);
  const [completedLiveSlotMatchIds, setCompletedLiveSlotMatchIds] = useState<string[] | null>(null);
  const [pendingReviewSlotMatchIds, setPendingReviewSlotMatchIds] = useState<string[] | null>(null);
  const [pendingPenaltySlotMatchIds, setPendingPenaltySlotMatchIds] = useState<string[] | null>(null);
  const [activePenaltyMatchId, setActivePenaltyMatchId] = useState<string | null>(null);
  const [penaltyStepByMatch, setPenaltyStepByMatch] = useState<
    Record<string, "setup" | "team" | "attempt">
  >({});
  const [recentPenaltyFeedbackByMatch, setRecentPenaltyFeedbackByMatch] = useState<
    Record<string, { order: number; scored: boolean }>
  >({});
  const [livePenaltyTeamByMatch, setLivePenaltyTeamByMatch] = useState<Record<string, LivePickerTeam>>({});
  const [liveReviewTeamByMatch, setLiveReviewTeamByMatch] = useState<Record<string, LivePickerTeam>>({});
  const [liveReviewNumberByMatch, setLiveReviewNumberByMatch] = useState<Record<string, string>>({});
  const [livePenaltyNumberByMatch, setLivePenaltyNumberByMatch] = useState<Record<string, string>>({});
  const [scoreEditorMatchId, setScoreEditorMatchId] = useState<string | null>(null);
  const [scoreEditorHomeValue, setScoreEditorHomeValue] = useState("");
  const [scoreEditorAwayValue, setScoreEditorAwayValue] = useState("");
  const [mandatoryMvpWarning, setMandatoryMvpWarning] = useState(false);
  const [isResettingTournament, setIsResettingTournament] = useState(false);
  const [isFloatingControlExpanded, setIsFloatingControlExpanded] = useState(false);
  const [floatingControlMatchId, setFloatingControlMatchId] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [activeDivisionView, setActiveDivisionView] = useState<string>("all");
  const [alternateMatchesView, setAlternateMatchesView] = useState(false);
  const [activeMealsOrganizerTab, setActiveMealsOrganizerTab] = useState<"sheets" | "service">("sheets");
  const [activeStatsTab, setActiveStatsTab] = useState<"scorers" | "mvp">("scorers");
  const [activeStatsViewMode, setActiveStatsViewMode] = useState<"simple" | "detail">("simple");
  const [statsTopFiveOnly, setStatsTopFiveOnly] = useState(false);
  const [parentVoteCodeDraft, setParentVoteCodeDraft] = useState("");
  const [parentVoteCodeError, setParentVoteCodeError] = useState<string | null>(null);
  const [parentVoteSession, setParentVoteSession] = useState<ParentVoteSession | null>(null);
  const [parentVoteCodeModalOpen, setParentVoteCodeModalOpen] = useState(false);
  const [teamDraftName, setTeamDraftName] = useState("");
  const [activeRosterTeamName, setActiveRosterTeamName] = useState<string | null>(null);
  const [activeMealOrderTeamId, setActiveMealOrderTeamId] = useState<string | null>(null);
  const [activeCoachTeamName, setActiveCoachTeamName] = useState<string | null>(null);
  const [editingCoachTeamName, setEditingCoachTeamName] = useState<string | null>(null);
  const [playersByTeamId, setPlayersByTeamId] = useState<Record<string, TournamentProductTeamPlayer[]>>({});
  const [selectedPlayers, setSelectedPlayers] = useState<TournamentProductTeamPlayer[]>([]);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [shareCopiedKey, setShareCopiedKey] = useState<string | null>(null);
  const [recentGoalByMatch, setRecentGoalByMatch] = useState<
    Record<string, { team: LivePickerTeam; number: number }>
  >({});
  const [lastGoalTeamByMatch, setLastGoalTeamByMatch] = useState<Record<string, LivePickerTeam>>({});
  const goalFeedbackTimeoutRef = useRef<Record<string, number>>({});
  const penaltyFeedbackTimeoutRef = useRef<Record<string, number>>({});
  const liveScorersByMatchRef = useRef<Record<string, LiveGoalEvent[]>>({});
  const pendingLocalMatchSyncRef = useRef<Record<string, SyncedMatchState>>({});
  const latestOnSaveRef = useRef(onSave);
  const lastSavedSnapshotRef = useRef(JSON.stringify(normalizeTournamentWorkspaceDraft(tournament)));

  useEffect(() => {
    latestOnSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    liveScorersByMatchRef.current = liveScorersByMatch;
  }, [liveScorersByMatch]);

  useEffect(() => {
    const normalizedTournament = normalizeTournamentWorkspaceDraft(tournament);
    const hasPendingLocalLiveSync = Object.keys(pendingLocalMatchSyncRef.current).length > 0;

    if (!hasPendingLocalLiveSync) {
      setLiveRuntimeByMatch({});
      setLiveClockNow(0);
      setSelectedLiveMatchId(null);
    }

    setDraft((current) => {
      const shouldPreserveLiveMatchStates =
        current.id === normalizedTournament.id && hasPendingLocalLiveSync;
      const shouldPreserveRealtimeLiveState =
        viewMode !== "organizer" && current.id === normalizedTournament.id;

      if (!shouldPreserveLiveMatchStates && !shouldPreserveRealtimeLiveState) {
        lastSavedSnapshotRef.current = JSON.stringify(normalizedTournament);
        return normalizedTournament;
      }

      const mergedMatchStates = {
        ...(normalizedTournament.matchStates ?? {}),
        ...(current.matchStates ?? {}),
      };

      const nextTournament = normalizeTournamentWorkspaceDraft({
        ...normalizedTournament,
        liveMatchId:
          shouldPreserveLiveMatchStates || shouldPreserveRealtimeLiveState
            ? (current.liveMatchId ?? normalizedTournament.liveMatchId ?? null)
            : (normalizedTournament.liveMatchId ?? null),
        matchStates:
          shouldPreserveLiveMatchStates || shouldPreserveRealtimeLiveState
            ? mergedMatchStates
            : (normalizedTournament.matchStates ?? {}),
      });

      lastSavedSnapshotRef.current = JSON.stringify(nextTournament);
      return nextTournament;
    });
  }, [tournament, viewMode]);

  useEffect(() => {
    if (viewMode === "organizer") return;
    setEditMode(false);
  }, [viewMode]);

  const divisionViewOptions = useMemo(() => {
    const labels = new Set<string>();
    draft.manualPreviewDataByDivision?.forEach((entry) => {
      if (entry.name) labels.add(entry.name);
    });
    structurePreviewByDivision.forEach((entry) => {
      if (entry.label) labels.add(entry.label);
    });
    draft.schedule.forEach((match) => {
      if (match.divisionName) labels.add(match.divisionName);
    });
    return [...labels];
  }, [draft.manualPreviewDataByDivision, draft.schedule, structurePreviewByDivision]);

  const isOrganizerView = viewMode === "organizer";
  const isCoachView = viewMode === "coach";
  const isParentView = viewMode === "parent";
  const shareSettings = useMemo(
    () => buildDefaultShareSettings(draft.shareSettings),
    [draft.shareSettings],
  );

  useEffect(() => {
    if (!isParentView || typeof window === "undefined") return;
    const rawSession = window.localStorage.getItem(`tournament-parent-vote-session:${draft.id}`);
    if (!rawSession) return;

    try {
      const parsed = JSON.parse(rawSession) as ParentVoteSession;
      if (parsed?.teamId && parsed.unlockedByCode) {
        setParentVoteSession({
          teamId: parsed.teamId,
          unlockedByCode: true,
          votedMatchIds: Array.isArray(parsed.votedMatchIds) ? parsed.votedMatchIds : [],
        });
      }
    } catch {
      window.localStorage.removeItem(`tournament-parent-vote-session:${draft.id}`);
    }
  }, [draft.id, isParentView]);

  useEffect(() => {
    if (!isParentView || typeof window === "undefined" || !parentVoteSession) return;
    window.localStorage.setItem(
      `tournament-parent-vote-session:${draft.id}`,
      JSON.stringify(parentVoteSession),
    );
  }, [draft.id, isParentView, parentVoteSession]);

  useEffect(() => {
    if (activeDivisionView === "all") return;
    if (divisionViewOptions.includes(activeDivisionView)) return;
    setActiveDivisionView("all");
  }, [activeDivisionView, divisionViewOptions]);

  useEffect(() => {
    if (activeDivisionView !== "all" && alternateMatchesView) {
      setAlternateMatchesView(false);
    }
  }, [activeDivisionView, alternateMatchesView]);

  const divisionTeamNamesByLabel = useMemo(() => {
    const nextMap = new Map<string, Set<string>>();

    draft.manualPreviewDataByDivision?.forEach((entry) => {
      const teamNames = new Set<string>();
      entry.data.groups.forEach((group) => {
        group.standings.forEach((standing) => {
          teamNames.add(standing.team);
        });
      });
      nextMap.set(entry.name, teamNames);
    });

    draft.schedule.forEach((match) => {
      if (!match.divisionName) return;
      const teamNames = nextMap.get(match.divisionName) ?? new Set<string>();
      teamNames.add(match.homeTeam);
      teamNames.add(match.awayTeam);
      nextMap.set(match.divisionName, teamNames);
    });

    return nextMap;
  }, [draft.manualPreviewDataByDivision, draft.schedule]);

  const filteredTournamentTeams = useMemo(() => {
    if (activeDivisionView === "all") return draft.teams;
    const allowedNames = divisionTeamNamesByLabel.get(activeDivisionView);
    if (!allowedNames) return draft.teams;
    return draft.teams.filter((team) => allowedNames.has(team.name));
  }, [activeDivisionView, divisionTeamNamesByLabel, draft.teams]);

  const registeredTournamentTeams = useMemo(
    () => filteredTournamentTeams.filter((team) => !isPlaceholderTournamentTeamName(team.name)),
    [filteredTournamentTeams],
  );

  const filteredSchedule = useMemo(
    () =>
      activeDivisionView === "all"
        ? draft.schedule
        : draft.schedule.filter((match) => match.divisionName === activeDivisionView),
    [activeDivisionView, draft.schedule],
  );

  useEffect(() => {
    const draftSnapshot = JSON.stringify(draft);
    if (draftSnapshot === lastSavedSnapshotRef.current) {
      return;
    }

    lastSavedSnapshotRef.current = draftSnapshot;
    void Promise.resolve(latestOnSaveRef.current(draft)).catch((error) => {
      console.error("Erreur sauvegarde tournoi:", error);
    });
  }, [draft]);

  const realMatches = useMemo(
    () => filteredSchedule.filter((match) => !isPause(match)),
    [filteredSchedule],
  );
  const friendlyMatches = useMemo(
    () => realMatches.filter((match) => getPhaseLabel(match) === "Amical"),
    [realMatches],
  );
  const groupMatches = useMemo(
    () => realMatches.filter(isGroupScheduleMatch),
    [realMatches],
  );
  const finalMatches = useMemo(
    () => realMatches.filter((match) => match.scheduleSection === "final" && getPhaseLabel(match) !== "Amical"),
    [realMatches],
  );
  const liveOrderedMatches = useMemo(
    () => realMatches,
    [realMatches],
  );

  const alternateMatchesByDivision = (
    matches: TournamentProductScheduleMatch[],
    divisionLabels: string[],
  ) => {
    const slotBuckets = new Map<string, TournamentProductScheduleMatch[][]>();
    const fallback: TournamentProductScheduleMatch[] = [];

    matches.forEach((match) => {
      if (!match.divisionName) {
        fallback.push(match);
        return;
      }

      const bucket = slotBuckets.get(match.divisionName) ?? [];
      const slotKey = `${match.slotIndex ?? match.startTime}-${match.startTime}`;
      const lastSlot = bucket[bucket.length - 1];
      const lastSlotKey =
        lastSlot && lastSlot[0]
          ? `${lastSlot[0].slotIndex ?? lastSlot[0].startTime}-${lastSlot[0].startTime}`
          : null;

      if (lastSlot && lastSlotKey === slotKey) {
        lastSlot.push(match);
      } else {
        bucket.push([match]);
      }

      slotBuckets.set(match.divisionName, bucket);
    });

    const orderedLabels = divisionLabels.filter((label) => (slotBuckets.get(label)?.length ?? 0) > 0);
    const remainingLabels = [...slotBuckets.keys()].filter((label) => !orderedLabels.includes(label));
    const allLabels = [...orderedLabels, ...remainingLabels];
    const alternated: TournamentProductScheduleMatch[] = [];
    let hasSlots = true;
    let slotIndex = 0;

    while (hasSlots) {
      hasSlots = false;
      allLabels.forEach((label) => {
        const slotGroup = slotBuckets.get(label)?.[slotIndex];
        if (!slotGroup || slotGroup.length === 0) return;
        alternated.push(
          ...slotGroup.sort((left, right) => left.fieldLabel.localeCompare(right.fieldLabel, "fr")),
        );
        hasSlots = true;
      });
      slotIndex += 1;
    }

    return [...alternated, ...fallback];
  };

  const displayedGroupMatches = useMemo(() => {
    if (!alternateMatchesView || activeDivisionView !== "all") return groupMatches;
    return alternateMatchesByDivision(groupMatches, divisionViewOptions);
  }, [activeDivisionView, alternateMatchesView, divisionViewOptions, groupMatches]);

  const displayedFinalMatches = useMemo(() => {
    if (!alternateMatchesView || activeDivisionView !== "all") return finalMatches;
    return alternateMatchesByDivision(finalMatches, divisionViewOptions);
  }, [activeDivisionView, alternateMatchesView, divisionViewOptions, finalMatches]);

  const displayedFriendlyMatches = useMemo(() => {
    if (!alternateMatchesView || activeDivisionView !== "all") return friendlyMatches;
    return alternateMatchesByDivision(friendlyMatches, divisionViewOptions);
  }, [activeDivisionView, alternateMatchesView, divisionViewOptions, friendlyMatches]);
  const currentLiveMatch = useMemo(
    () =>
      realMatches.find(
        (match) => getMatchDisplayState(draft.matchStates?.[match.id] ?? getDefaultMatchState()) === "live",
      ) ?? null,
    [draft.matchStates, realMatches],
  );

  const matchIdByDatabaseId = useMemo(
    () =>
      new Map(
        realMatches.map((match) => [getTournamentMatchDatabaseId(draft.id, match.id), match.id] as const),
      ),
    [draft.id, realMatches],
  );

  const applyServerMatchStates = useCallback((serverStates: Record<string, SyncedMatchState>) => {
    setLiveScorersByMatch((current) => {
      let changed = false;
      const next = { ...current };

      Object.entries(serverStates).forEach(([matchId, serverState]) => {
        console.log("SERVER APPLY MATCH", {
          matchId,
          serverState,
          pendingLocal: pendingLocalMatchSyncRef.current[matchId] ?? null,
        });
        const pendingLocalState = pendingLocalMatchSyncRef.current[matchId];
        if (pendingLocalState && !areSyncedMatchStatesEqual(serverState, pendingLocalState)) {
          return;
        }
        if (pendingLocalState) {
          delete pendingLocalMatchSyncRef.current[matchId];
        }
        if (!serverState.goalEvents) return;
        const currentEvents = current[matchId] ?? [];
        const nextEvents = serverState.goalEvents;
        if (JSON.stringify(currentEvents) === JSON.stringify(nextEvents)) return;
        next[matchId] = nextEvents;
        changed = true;
      });

      return changed ? next : current;
    });

    setLiveRuntimeByMatch((current) => {
      let changed = false;
      const next = { ...current };

      Object.entries(serverStates).forEach(([matchId, serverState]) => {
        if (serverState.status === "live" && serverState.startedAt) {
          const startedAtTime = Date.parse(serverState.startedAt);
          if (!Number.isFinite(startedAtTime)) return;

          const previous = next[matchId];
          if (!previous || previous.startedAt !== startedAtTime || !previous.running) {
            next[matchId] = {
              elapsedSeconds: Math.max(0, Math.floor((Date.now() - startedAtTime) / 1000)),
              running: true,
              startedAt: startedAtTime,
            };
            changed = true;
          }
          return;
        }

        if (serverState.status === "idle") {
          const previous = next[matchId];
          if (!previous || (previous.elapsedSeconds === 0 && !previous.running && previous.startedAt === null)) {
            return;
          }
          next[matchId] = {
            elapsedSeconds: 0,
            running: false,
            startedAt: null,
          };
          changed = true;
          return;
        }

        if (next[matchId]?.running) {
          const runtime = next[matchId];
          next[matchId] = {
            ...runtime,
            elapsedSeconds:
              runtime.startedAt !== null
                ? Math.max(0, Math.floor((Date.now() - runtime.startedAt) / 1000))
                : runtime.elapsedSeconds,
            running: false,
            startedAt: null,
          };
          changed = true;
        }
      });

      return changed ? next : current;
    });

    setDraft((current) => {
      let changed = false;
      const nextMatchStates = { ...(current.matchStates ?? {}) };

      Object.entries(serverStates).forEach(([matchId, serverState]) => {
        const pendingLocalState = pendingLocalMatchSyncRef.current[matchId];
        if (pendingLocalState && !areSyncedMatchStatesEqual(serverState, pendingLocalState)) {
          return;
        }
        const previous = nextMatchStates[matchId] ?? getDefaultMatchState();
        const isResetServerState =
          serverState.status === "idle" &&
          serverState.homeScore === null &&
          serverState.awayScore === null &&
          serverState.startedAt === null &&
          serverState.completedAt === null &&
          (serverState.goalEvents?.length ?? 0) === 0;

        const nextState: TournamentProductMatchState = {
          ...previous,
          homeScore: serverState.homeScore,
          awayScore: serverState.awayScore,
          status: serverState.status,
          startedAt: serverState.status === "idle" ? null : serverState.startedAt,
          completedAt: serverState.status === "completed" ? serverState.completedAt : null,
          ...(isResetServerState
            ? {
                mvp: undefined,
                mvpVotes: [],
              }
            : {}),
        };

        if (
          previous.homeScore !== nextState.homeScore ||
          previous.awayScore !== nextState.awayScore ||
          getMatchDisplayState(previous) !== getMatchDisplayState(nextState) ||
          (previous.startedAt ?? null) !== (nextState.startedAt ?? null) ||
          (previous.completedAt ?? null) !== (nextState.completedAt ?? null) ||
          (isResetServerState && (previous.mvpVotes?.length ?? 0) > 0) ||
          (isResetServerState && previous.mvp)
        ) {
          nextMatchStates[matchId] = nextState;
          changed = true;
        }
      });

      const nextLiveMatchId =
        realMatches.find(
          (match) => getMatchDisplayState(nextMatchStates[match.id] ?? getDefaultMatchState()) === "live",
        )?.id ?? null;

      if ((current.liveMatchId ?? null) !== nextLiveMatchId) {
        changed = true;
      }

      if (!changed) return current;

      return {
        ...current,
        liveMatchId: nextLiveMatchId,
        matchStates: nextMatchStates,
      };
    });
  }, [realMatches]);

  useEffect(() => {
    if (realMatches.length === 0) return;

    let cancelled = false;

    const refetchMatchStates = async () => {
      try {
        const serverStates = await loadTournamentMatchLiveStates(draft.id, realMatches);
        if (!cancelled) {
          applyServerMatchStates(serverStates);
        }
      } catch (error) {
        console.error("Erreur refresh statuts matchs:", error);
      }
    };

    void refetchMatchStates();
    const intervalId = window.setInterval(() => {
      void refetchMatchStates();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [applyServerMatchStates, draft.id, realMatches]);

  useEffect(() => {
    if (realMatches.length === 0) return;

    let cancelled = false;

    const refetchPersistedVotes = async () => {
      try {
        const persistedTournament = await loadTournament<TournamentProductSavedTournament>(draft.id);
        if (cancelled || !persistedTournament?.matchStates) return;

        setDraft((current) => {
          const currentMatchStates = current.matchStates ?? {};
          let changed = false;
          const nextMatchStates = { ...currentMatchStates };

          realMatches.forEach((match) => {
            const matchId = match.id;
            const persistedState = persistedTournament.matchStates?.[matchId] ?? null;
            const currentState = nextMatchStates[matchId] ?? getDefaultMatchState();
            const nextVotes = persistedState?.mvpVotes ?? [];
            const nextMvp =
              nextVotes.length > 0
                ? getWeightedMvp({
                    ...currentState,
                    ...persistedState,
                    mvpVotes: nextVotes,
                  })
                : null;

            if (
              !areMvpVotesEqual(currentState.mvpVotes ?? [], nextVotes) ||
              (currentState.mvp?.team ?? null) !== (nextMvp?.team ?? null) ||
              (currentState.mvp?.number ?? null) !== (nextMvp?.number ?? null)
            ) {
              nextMatchStates[matchId] = {
                ...currentState,
                mvpVotes: nextVotes,
                mvp: nextMvp ?? undefined,
              };
              changed = true;
            }
          });

          if (!changed) return current;

          return {
            ...current,
            matchStates: nextMatchStates,
          };
        });
      } catch (error) {
        console.error("Erreur refresh votes MVP:", error);
      }
    };

    void refetchPersistedVotes();
    const intervalId = window.setInterval(() => {
      void refetchPersistedVotes();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [draft.id, realMatches]);

  useEffect(() => {
    if (realMatches.length === 0) return;

    const channel = supabase
      .channel(`tournament-matches-${draft.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_matches",
          filter: `tournament_id=eq.${draft.id}`,
        },
        (payload) => {
          console.log("REALTIME EVENT", payload);

          const row = payload.new as Record<string, unknown> | null;
          if (!row || typeof row.id !== "string") return;

          const matchId =
            typeof row.ui_match_id === "string"
              ? row.ui_match_id
              : matchIdByDatabaseId.get(row.id);
          if (!matchId) return;

          applyServerMatchStates({
            [matchId]: {
              homeScore: typeof row.score_a === "number" ? row.score_a : null,
              awayScore: typeof row.score_b === "number" ? row.score_b : null,
              status: normalizeSyncedMatchStatus(row.status),
              startedAt: typeof row.started_at === "string" ? row.started_at : null,
              completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
              goalEvents: Array.isArray(row.goal_events)
                ? row.goal_events
                    .map((event) => {
                      if (!event || typeof event !== "object") return null;
                      const entry = event as { team?: unknown; number?: unknown; elapsedSeconds?: unknown };
                      if (entry.team !== "home" && entry.team !== "away") return null;
                      const number = typeof entry.number === "number" ? entry.number : Number(entry.number);
                      const elapsedSeconds =
                        typeof entry.elapsedSeconds === "number"
                          ? entry.elapsedSeconds
                          : Number(entry.elapsedSeconds);
                      if (!Number.isFinite(number) || !Number.isFinite(elapsedSeconds)) return null;
                      return { team: entry.team, number, elapsedSeconds };
                    })
                    .filter(
                      (event): event is LiveGoalEvent => event !== null,
                    )
                : [],
            },
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [applyServerMatchStates, draft.id, matchIdByDatabaseId, realMatches.length]);

  const groupedScheduleSlots = useMemo(() => {
    const slots: Array<{ key: string; startTime: string; matches: TournamentProductScheduleMatch[] }> = [];

    liveOrderedMatches.forEach((match) => {
      const key = `${match.slotIndex ?? match.startTime}-${match.startTime}`;
      const previousSlot = slots.at(-1);

      if (previousSlot?.key === key) {
        previousSlot.matches.push(match);
        return;
      }

      slots.push({
        key,
        startTime: match.startTime,
        matches: [match],
      });
    });

    return slots;
  }, [liveOrderedMatches]);
  const getSlotCompletionState = useCallback(
    (slot: { matches: TournamentProductScheduleMatch[] } | null) => {
      if (!slot || slot.matches.length === 0) return "empty" as const;

      const states = slot.matches.map((match) =>
        getMatchDisplayState(draft.matchStates?.[match.id] ?? getDefaultMatchState()),
      );

      if (states.some((state) => state === "live")) return "live" as const;
      if (states.every((state) => state === "completed")) return "completed" as const;
      return "incomplete" as const;
    },
    [draft.matchStates],
  );
  const currentSlot = useMemo(() => {
    if (currentLiveMatch) {
      return (
        groupedScheduleSlots.find((slot) =>
          slot.matches.some((match) => match.id === currentLiveMatch.id),
        ) ?? null
      );
    }

    return (
      groupedScheduleSlots.find((slot) =>
        getSlotCompletionState(slot) !== "completed",
      ) ?? groupedScheduleSlots[0] ?? null
    );
  }, [currentLiveMatch, getSlotCompletionState, groupedScheduleSlots]);
  const nextSlot = useMemo(() => {
    if (!currentSlot) return groupedScheduleSlots[1] ?? null;
    const currentIndex = groupedScheduleSlots.findIndex((slot) => slot.key === currentSlot.key);
    if (currentIndex < 0) return null;

    const minimumMatchesForOverview = Math.min(Math.max(draft.fieldCount, 1), 2);
    const followingSlots = groupedScheduleSlots.slice(currentIndex + 1);

    return (
      followingSlots.find(
        (slot) =>
          getSlotCompletionState(slot) !== "completed" &&
          slot.matches.length >= minimumMatchesForOverview,
      ) ??
      followingSlots.find((slot) => getSlotCompletionState(slot) !== "completed") ??
      null
    );
  }, [currentSlot, draft.fieldCount, getSlotCompletionState, groupedScheduleSlots]);
  const getLiveRuntime = (matchId: string) =>
    liveRuntimeByMatch[matchId] ?? {
      elapsedSeconds: 0,
      running: false,
      startedAt: null,
    };
  const floatingControlSlot = currentSlot;
  const floatingControlMatches = useMemo(
    () => floatingControlSlot?.matches ?? [],
    [floatingControlSlot],
  );
  const floatingControlPrimaryMatch = floatingControlMatches[0] ?? null;
  const floatingControlPrimaryState = floatingControlPrimaryMatch
    ? draft.matchStates?.[floatingControlPrimaryMatch.id] ?? getDefaultMatchState()
    : getDefaultMatchState();
  const floatingControlDisplayState = getMatchDisplayState(floatingControlPrimaryState);
  const floatingControlIsLive = floatingControlDisplayState === "live";
  const floatingControlRuntime = floatingControlPrimaryMatch
    ? getLiveRuntime(floatingControlPrimaryMatch.id)
    : { elapsedSeconds: 0, running: false, startedAt: null };
  const floatingControlStartedAtTime = floatingControlPrimaryState.startedAt
    ? Date.parse(floatingControlPrimaryState.startedAt)
    : Number.NaN;
  const floatingControlElapsedSeconds =
    floatingControlIsLive && Number.isFinite(floatingControlStartedAtTime) && liveClockNow > 0
      ? Math.max(0, Math.floor((liveClockNow - floatingControlStartedAtTime) / 1000))
      : floatingControlRuntime.elapsedSeconds;
  const floatingControlCountdown = Math.max(0, draft.matchDuration * 60 - floatingControlElapsedSeconds);
  const floatingControlGoalMatch =
    floatingControlMatches.find((match) => match.id === floatingControlMatchId) ??
    floatingControlPrimaryMatch;
  const filteredGroups = useMemo(
    () =>
      activeDivisionView === "all"
        ? groups
        : groups.filter(
            (group) =>
              group.label === activeDivisionView ||
              group.label.startsWith(`${activeDivisionView} • `),
          ),
    [activeDivisionView, groups],
  );
  const groupTables = useMemo(() => {
    if (filteredGroups.length > 0) {
      return filteredGroups.map((group) => ({
        label: group.label,
        rows: buildStandingTable(
          group,
          getGroupStandingMatches(group, groupMatches),
          draft.matchStates ?? {},
        ),
      }));
    }

    if (groupMatches.length === 0) return [];

    const singleGroup: TournamentProductGroup = {
      label: "Classement général",
      teams: draft.teams.map((team) => team.name),
    };

    return [
      {
        label: singleGroup.label,
        rows: buildStandingTable(singleGroup, groupMatches, draft.matchStates ?? {}),
      },
    ];
  }, [draft.matchStates, draft.teams, filteredGroups, groupMatches]);
  const bestGroupRankByPosition = useMemo(() => {
    const byRank = new Map<number, Array<StandingRow & { groupLabel: string }>>();

    groupTables.forEach((group) => {
      group.rows.forEach((row, index) => {
        const rank = index + 1;
        const current = byRank.get(rank) ?? [];
        current.push({ ...row, groupLabel: group.label });
        byRank.set(rank, current);
      });
    });

    byRank.forEach((entries, rank) => {
      byRank.set(
        rank,
        [...entries].sort((left, right) => {
          if (right.points !== left.points) return right.points - left.points;
          if (right.diff !== left.diff) return right.diff - left.diff;
          if (right.goalsFor !== left.goalsFor) return right.goalsFor - left.goalsFor;
          return left.groupLabel.localeCompare(right.groupLabel, "fr");
        }),
      );
    });

    return byRank;
  }, [groupTables]);
  const groupMetaById = useMemo(() => {
    const nextMap = new Map<string, { id: string; label: string }>();
    draft.manualPreviewDataByDivision?.forEach((division) => {
      division.data.groups.forEach((group) => {
        nextMap.set(group.id, { id: group.id, label: group.label });
      });
    });
    return nextMap;
  }, [draft.manualPreviewDataByDivision]);
  const resolveLegacyLabel = useMemo(() => {
    const groupCompletionByLabel = new Map(
      groupTables.map((group) => {
        const sourceMatches = getGroupStandingMatches(
          {
            label: group.label,
            teams: group.rows.map((row) => row.team),
          },
          groupMatches,
        );
        return [
          group.label,
          sourceMatches.length > 0 &&
            sourceMatches.every(
              (match) =>
                getMatchDisplayState(getStoredMatchState(draft.matchStates, match) ?? getDefaultMatchState()) ===
                "completed",
            ),
        ] as const;
      }),
    );
    const finalMatchRefCountersByDivision = new Map<string, Record<string, number>>();
    const finalMatchByRefIdByDivision = new Map<string, Map<string, TournamentProductScheduleMatch>>();
    const ensureDivisionRefMap = (divisionKey: string) => {
      const existing = finalMatchByRefIdByDivision.get(divisionKey);
      if (existing) return existing;
      const next = new Map<string, TournamentProductScheduleMatch>();
      finalMatchByRefIdByDivision.set(divisionKey, next);
      return next;
    };
    finalMatches.forEach((match) => {
      const divisionKey = match.divisionId ?? "__global__";
      const divisionCounters = finalMatchRefCountersByDivision.get(divisionKey) ?? {};
      finalMatchRefCountersByDivision.set(divisionKey, divisionCounters);
      const derivedRefId = getFinalMatchReferenceId(match, divisionCounters).toUpperCase();
      ensureDivisionRefMap(divisionKey).set(derivedRefId, match);
      ensureDivisionRefMap("__all__").set(derivedRefId, match);
      getBracketReferenceKeys(match.id).forEach((key) => {
        ensureDivisionRefMap(divisionKey).set(key, match);
        ensureDivisionRefMap("__all__").set(key, match);
      });
    });
    const findMatchByReference = (referenceKeys: string[], divisionId?: string) => {
      const divisionCandidates = divisionId
        ? finalMatches.filter((match) => match.divisionId === divisionId)
        : finalMatches;
      const candidates = divisionCandidates.length > 0 ? divisionCandidates : finalMatches;

      return (
        referenceKeys
          .map((referenceKey) =>
            candidates.find((match) => matchFinalReferenceKey(match, referenceKey)) ?? null,
          )
          .find((match): match is TournamentProductScheduleMatch => Boolean(match)) ?? null
      );
    };
    const bestRankPlaceholderCountByRank = new Map<number, number>();
    finalMatches.forEach((match) => {
      [match.homeTeam, match.awayTeam].forEach((participant) => {
        const bestRankMatch = participant.trim().match(/^Meilleur\s+(\d+)(?:er|e|eme)(?:\s*\((\d+)\))?$/i);
        if (!bestRankMatch) return;

        const rank = Number(bestRankMatch[1]);
        const slotIndex = Number(bestRankMatch[2] ?? "1");
        const currentMax = bestRankPlaceholderCountByRank.get(rank) ?? 0;
        bestRankPlaceholderCountByRank.set(rank, Math.max(currentMax, slotIndex));
      });
    });
    const resolvedTeamCache = new Map<string, string>();

    const resolve = (label: string, divisionId?: string, stack: Set<string> = new Set()): string => {
      const cacheKey = `${divisionId ?? "__all__"}::${label}`;
      if (resolvedTeamCache.has(cacheKey)) {
        return resolvedTeamCache.get(cacheKey) ?? label;
      }

      const compactLabel = label.trim();
      const seedMatch = compactLabel.match(/^(\d+)([A-Z])$/i);
      if (seedMatch) {
        const rank = Number(seedMatch[1]);
        const groupLetter = seedMatch[2].toUpperCase();
        const group = groupTables.find((entry) => getGroupShortcutLabel(entry.label).toUpperCase() === groupLetter);
        if (!group || !groupCompletionByLabel.get(group.label)) return label;
        const team = rank > 0 ? group.rows[rank - 1]?.team : null;
        const resolved = team ?? label;
        resolvedTeamCache.set(cacheKey, resolved);
        return resolved;
      }

      const bestRankMatch = compactLabel.match(/^Meilleur\s+(\d+)(?:er|e|eme)(?:\s*\((\d+)\))?$/i);
      if (bestRankMatch) {
        if ([...groupCompletionByLabel.values()].some((completed) => !completed)) return label;
        const rank = Number(bestRankMatch[1]);
        const slotIndex = Number(bestRankMatch[2] ?? "1");
        const team = rank > 0 ? bestGroupRankByPosition.get(rank)?.[slotIndex - 1]?.team : null;
        const resolved = team ?? label;
        resolvedTeamCache.set(cacheKey, resolved);
        return resolved;
      }

      const dsqfRankMatch = compactLabel.match(/^(\d+)(?:er|e|eme)\s*\(DSQF(?:\s+(\d+))?\)$/i);
      if (dsqfRankMatch) {
        if ([...groupCompletionByLabel.values()].some((completed) => !completed)) return label;
        const rank = Number(dsqfRankMatch[1]);
        const slotIndex = Number(dsqfRankMatch[2] ?? "1");
        const qualifiedBestCount = bestRankPlaceholderCountByRank.get(rank) ?? 0;
        const team =
          rank > 0 ? bestGroupRankByPosition.get(rank)?.[qualifiedBestCount + slotIndex - 1]?.team : null;
        const resolved = team ?? label;
        resolvedTeamCache.set(cacheKey, resolved);
        return resolved;
      }

      const dependencyMatch = compactLabel.match(/^(Vainqueur|Perdant)\s+(.+)$/i);
      if (dependencyMatch) {
        const [, dependencyType, dependencyIdRaw] = dependencyMatch;
        const normalizedLabel = dependencyIdRaw.trim().toUpperCase();
        const dependencyKeys = getDependencyReferenceKeysFromLabel(normalizedLabel);
        const dependencyId = dependencyKeys[0] ?? normalizedLabel;
        if (stack.has(dependencyId)) return label;

        const divisionMatchRefs = divisionId ? finalMatchByRefIdByDivision.get(divisionId) : null;
        const sourceMatch =
          dependencyKeys
            .map(
              (key) =>
                divisionMatchRefs?.get(key) ??
                finalMatchByRefIdByDivision.get("__all__")?.get(key) ??
                null,
            )
            .find((match): match is TournamentProductScheduleMatch => Boolean(match)) ??
          findMatchByReference(dependencyKeys, divisionId);
        const sourceState = sourceMatch ? getStoredMatchState(draft.matchStates, sourceMatch) : null;
        const outcome = getResolvedKnockoutOutcome(sourceState);
        if (/QF1/i.test(compactLabel) || dependencyKeys.some((key) => /QF1/i.test(key))) {
          console.log("RESOLVE SOURCE DEBUG", {
            label,
            normalizedLabel,
            foundMatchId: sourceMatch?.id ?? null,
            foundMatchLabel: sourceMatch?.roundLabel ?? null,
            foundState: sourceState ?? null,
            homeTeam: sourceMatch?.homeTeam ?? null,
            awayTeam: sourceMatch?.awayTeam ?? null,
            winner: outcome?.winner ?? null,
            loser: outcome?.loser ?? null,
          });
        }
        if (!sourceMatch || !sourceState || !outcome) {
          return label;
        }

        const nextStack = new Set(stack);
        nextStack.add(dependencyId);
        const resolvedHome = resolve(sourceMatch.homeTeam, sourceMatch.divisionId, nextStack);
        const resolvedAway = resolve(sourceMatch.awayTeam, sourceMatch.divisionId, nextStack);
        const resolved =
          dependencyType.toLowerCase() === "vainqueur"
            ? outcome.winner === "home"
              ? resolvedHome
              : resolvedAway
            : outcome.loser === "home"
              ? resolvedHome
              : resolvedAway;

        resolvedTeamCache.set(cacheKey, resolved);
        return resolved;
      }

      return label;
    };

    return resolve;
  }, [bestGroupRankByPosition, draft.matchStates, finalMatches, groupMatches, groupTables]);
  const finalMatchBySourceIdByDivision = useMemo(() => {
    const nextMap = new Map<string, Map<string, TournamentProductScheduleMatch>>();
    const ensureDivisionMap = (divisionKey: string) => {
      const existing = nextMap.get(divisionKey);
      if (existing) return existing;
      const created = new Map<string, TournamentProductScheduleMatch>();
      nextMap.set(divisionKey, created);
      return created;
    };

    const countersByDivision = new Map<string, Record<string, number>>();

    finalMatches.forEach((match) => {
      const divisionKey = match.divisionId ?? "__global__";
      const divisionCounters = countersByDivision.get(divisionKey) ?? {};
      countersByDivision.set(divisionKey, divisionCounters);

      const divisionMap = ensureDivisionMap(divisionKey);
      const globalMap = ensureDivisionMap("__all__");
      const derivedRefId = getFinalMatchReferenceId(match, divisionCounters).toUpperCase();

      [match.id, getPreviewSourceMatchId(match.id), derivedRefId, ...getBracketReferenceKeys(match.id)].forEach((key) => {
        divisionMap.set(key, match);
        globalMap.set(key, match);
      });
    });

    return nextMap;
  }, [finalMatches]);
  const findStructuredMatchByReference = useCallback(
    (referenceKeys: string[], divisionId?: string) => {
      const divisionCandidates = divisionId
        ? finalMatches.filter((match) => match.divisionId === divisionId)
        : finalMatches;
      const candidates = divisionCandidates.length > 0 ? divisionCandidates : finalMatches;

      return (
        referenceKeys
          .map((referenceKey) =>
            candidates.find((match) => matchFinalReferenceKey(match, referenceKey)) ?? null,
          )
          .find((match): match is TournamentProductScheduleMatch => Boolean(match)) ?? null
      );
    },
    [finalMatches],
  );
  const resolveSlot = useCallback(
    (
      slot: TournamentPreviewSlot | undefined,
      fallbackLabel: string,
      divisionId?: string,
      stack: Set<string> = new Set(),
    ): string => {
      if (!slot) {
        return resolveLegacyLabel(fallbackLabel, divisionId, stack);
      }

      if (slot.type === "seed") {
        if (slot.groupId) {
          const groupMeta = groupMetaById.get(slot.groupId);
          const groupTable = groupMeta ? groupTables.find((entry) => entry.label === groupMeta.label) : null;
          const sourceMatches = groupMeta
            ? getGroupStandingMatches(
                {
                  label: groupMeta.label,
                  teams: groupTable?.rows.map((row) => row.team) ?? [],
                },
                groupMatches,
              )
            : [];
          const isGroupCompleted =
            sourceMatches.length > 0 &&
            sourceMatches.every(
              (match) =>
                getMatchDisplayState(getStoredMatchState(draft.matchStates, match) ?? getDefaultMatchState()) ===
                "completed",
            );

          if (!groupTable || !isGroupCompleted || !slot.rank) {
            return slot.label || fallbackLabel;
          }

          return groupTable.rows[slot.rank - 1]?.team ?? slot.label ?? fallbackLabel;
        }

        const allGroupsCompleted =
          groupTables.length > 0 &&
          groupTables.every((group) => {
            const sourceMatches = getGroupStandingMatches(
              {
                label: group.label,
                teams: group.rows.map((row) => row.team),
              },
              groupMatches,
            );
            return (
              sourceMatches.length > 0 &&
              sourceMatches.every(
                (match) =>
                  getMatchDisplayState(getStoredMatchState(draft.matchStates, match) ?? getDefaultMatchState()) ===
                  "completed",
              )
            );
          });

        if (!allGroupsCompleted || !slot.rank) {
          return slot.label || fallbackLabel;
        }

        const seedIndex = slot.seedIndex ?? 1;
        if (/^Meilleur\s+/i.test(slot.label)) {
          return bestGroupRankByPosition.get(slot.rank)?.[seedIndex - 1]?.team ?? slot.label;
        }

        if (/DSQF/i.test(slot.label)) {
          const qualifiedBestCount = finalMatches.reduce((count, match) => {
            const participants = [match.homeSlot, match.awaySlot];
            return (
              count +
              participants.filter(
                (participant) =>
                  participant?.type === "seed" &&
                  participant.rank === slot.rank &&
                  /^Meilleur\s+/i.test(participant.label),
              ).length
            );
          }, 0);
          return bestGroupRankByPosition.get(slot.rank)?.[qualifiedBestCount + seedIndex - 1]?.team ?? slot.label;
        }

        return slot.label || fallbackLabel;
      }

      const sourceMatchId = slot.sourceMatchId
        ? divisionId && !slot.sourceMatchId.startsWith(`${divisionId}__`)
          ? `${divisionId}__${slot.sourceMatchId}`
          : slot.sourceMatchId
        : null;
      if (!sourceMatchId || stack.has(sourceMatchId)) {
        return slot.label || fallbackLabel;
      }

      const divisionMatchMap = divisionId ? finalMatchBySourceIdByDivision.get(divisionId) : null;
      const globalMatchMap = finalMatchBySourceIdByDivision.get("__all__");
      const sourceLookupKeys = [
        sourceMatchId,
        getPreviewSourceMatchId(sourceMatchId),
        ...getDependencyReferenceKeysFromLabel(sourceMatchId),
      ];
      const sourceMatch =
        sourceLookupKeys
          .map((key) => divisionMatchMap?.get(key) ?? globalMatchMap?.get(key) ?? null)
          .find((match): match is TournamentProductScheduleMatch => Boolean(match)) ??
        findStructuredMatchByReference(sourceLookupKeys, divisionId);
      const sourceState = sourceMatch ? getStoredMatchState(draft.matchStates, sourceMatch) : null;
      if (!sourceMatch || !sourceState || getMatchDisplayState(sourceState) !== "completed") {
        return slot.label || fallbackLabel;
      }

      const outcome = getResolvedKnockoutOutcome(sourceState);
      if (!outcome) {
        return slot.label || fallbackLabel;
      }

      const nextStack = new Set(stack);
      nextStack.add(sourceMatchId);
      const resolvedHome = resolveSlot(
        sourceMatch.homeSlot,
        sourceMatch.homeTeam,
        sourceMatch.divisionId,
        nextStack,
      );
      const resolvedAway = resolveSlot(
        sourceMatch.awaySlot,
        sourceMatch.awayTeam,
        sourceMatch.divisionId,
        nextStack,
      );

      if (slot.type === "winner") {
        return outcome.winner === "home" ? resolvedHome : resolvedAway;
      }

      return outcome.loser === "home" ? resolvedHome : resolvedAway;
    },
    [
      bestGroupRankByPosition,
      draft.matchStates,
      finalMatchBySourceIdByDivision,
      findStructuredMatchByReference,
      finalMatches,
      groupMetaById,
      groupMatches,
      groupTables,
      resolveLegacyLabel,
    ],
  );
  const previewSourceTeamsByMatchId = useMemo(() => {
    const nextMap = new Map<
      string,
      {
        homeTeam: string;
        awayTeam: string;
        homeSlot?: TournamentPreviewSlot;
        awaySlot?: TournamentPreviewSlot;
      }
    >();
    const addSourceMatch = (
      divisionId: string | undefined,
      schedulePrefix: "main" | "secondary" | "placement",
      previewMatchId: string,
      teams: { homeTeam: string; awayTeam: string; homeSlot?: TournamentPreviewSlot; awaySlot?: TournamentPreviewSlot },
    ) => {
      const scheduleMatchId = `${schedulePrefix}-${previewMatchId}`;
      nextMap.set(scheduleMatchId, teams);
      if (divisionId) {
        nextMap.set(`${divisionId}__${scheduleMatchId}`, teams);
      }
    };

    draft.manualPreviewDataByDivision?.forEach((entry) => {
      entry.data.bracket.forEach((round) => {
        round.matches.forEach((match) => {
          addSourceMatch(entry.id, "main", match.id, {
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            homeSlot: match.homeSlot,
            awaySlot: match.awaySlot,
          });
        });
      });

      entry.data.secondaryBracket?.forEach((round) => {
        round.matches.forEach((match) => {
          addSourceMatch(entry.id, "secondary", match.id, {
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            homeSlot: match.homeSlot,
            awaySlot: match.awaySlot,
          });
        });
      });

      entry.data.classementSections?.forEach((section) => {
        section.rounds.forEach((round) => {
          round.matches.forEach((match) => {
            addSourceMatch(entry.id, "placement", match.id, {
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              homeSlot: match.homeSlot,
              awaySlot: match.awaySlot,
            });
          });
        });
      });
    });

    return nextMap;
  }, [draft.manualPreviewDataByDivision]);
  const getDisplayMatchTeams = useCallback(
    (match: TournamentProductScheduleMatch) => {
      const sourceTeams =
        previewSourceTeamsByMatchId.get(match.id) ??
        previewSourceTeamsByMatchId.get(getPreviewSourceMatchId(match.id));
      const sourceHomeTeam = sourceTeams?.homeTeam ?? match.homeTeam;
      const sourceAwayTeam = sourceTeams?.awayTeam ?? match.awayTeam;
      const resolvedHomeTeam = resolveSlot(
        sourceTeams?.homeSlot ?? match.homeSlot,
        sourceHomeTeam,
        match.divisionId,
      );
      const resolvedAwayTeam = resolveSlot(
        sourceTeams?.awaySlot ?? match.awaySlot,
        sourceAwayTeam,
        match.divisionId,
      );

      return {
        homeTeam: resolvedHomeTeam || formatQualificationSourceLabel(sourceHomeTeam) || "Qualifié 1",
        awayTeam: resolvedAwayTeam || formatQualificationSourceLabel(sourceAwayTeam) || "Qualifié 2",
      };
    },
    [previewSourceTeamsByMatchId, resolveSlot],
  );

  const liveTabMatch = useMemo(() => {
    if (liveOrderedMatches.length === 0) return null;
    return (
      currentLiveMatch ??
      currentSlot?.matches[0] ??
      realMatches.find((match) => match.id === selectedLiveMatchId) ??
      liveOrderedMatches[0]
    );
  }, [currentLiveMatch, currentSlot, liveOrderedMatches, realMatches, selectedLiveMatchId]);

  const liveTabSlot = useMemo(() => {
    if (!liveTabMatch) return currentSlot;
    return (
      groupedScheduleSlots.find((slot) => slot.matches.some((match) => match.id === liveTabMatch.id)) ??
      currentSlot
    );
  }, [currentSlot, groupedScheduleSlots, liveTabMatch]);

  const liveSlotMatches = useMemo(
    () => liveTabSlot?.matches ?? (liveTabMatch ? [liveTabMatch] : []),
    [liveTabMatch, liveTabSlot],
  );

  const livePrimaryMatch = liveSlotMatches[0] ?? liveTabMatch ?? null;

  const nextLiveSlot = useMemo(() => {
    if (!liveTabSlot) return nextSlot;
    const currentIndex = groupedScheduleSlots.findIndex((slot) => slot.key === liveTabSlot.key);
    if (currentIndex < 0) return nextSlot;
    return groupedScheduleSlots[currentIndex + 1] ?? null;
  }, [groupedScheduleSlots, liveTabSlot, nextSlot]);
  const reviewedLiveSlot = useMemo(() => {
    const reviewedMatchId = completedLiveSlotMatchIds?.[0] ?? pendingReviewSlotMatchIds?.[0] ?? null;
    if (!reviewedMatchId) return null;

    return (
      groupedScheduleSlots.find((slot) => slot.matches.some((match) => match.id === reviewedMatchId)) ?? null
    );
  }, [completedLiveSlotMatchIds, groupedScheduleSlots, pendingReviewSlotMatchIds]);
  const nextLiveSlotAfterReview = useMemo(() => {
    if (!reviewedLiveSlot) return nextLiveSlot;

    const reviewedIndex = groupedScheduleSlots.findIndex((slot) => slot.key === reviewedLiveSlot.key);
    if (reviewedIndex < 0) return nextLiveSlot;

    return groupedScheduleSlots[reviewedIndex + 1] ?? null;
  }, [groupedScheduleSlots, nextLiveSlot, reviewedLiveSlot]);

  useEffect(() => {
    if (!floatingControlPrimaryMatch) {
      setFloatingControlMatchId(null);
      return;
    }

    if (floatingControlMatchId && floatingControlMatches.some((match) => match.id === floatingControlMatchId)) {
      return;
    }

    setFloatingControlMatchId(floatingControlPrimaryMatch.id);
  }, [floatingControlMatchId, floatingControlMatches, floatingControlPrimaryMatch]);

  const completedLiveReviewMatches = useMemo(
    () =>
      completedLiveSlotMatchIds
        ? completedLiveSlotMatchIds
            .map((matchId) => realMatches.find((match) => match.id === matchId) ?? null)
            .filter((match): match is TournamentProductScheduleMatch => match !== null)
        : [],
    [completedLiveSlotMatchIds, realMatches],
  );
  const pendingPenaltyMatches = useMemo(
    () =>
      pendingPenaltySlotMatchIds
        ? pendingPenaltySlotMatchIds
            .map((matchId) => realMatches.find((match) => match.id === matchId) ?? null)
            .filter((match): match is TournamentProductScheduleMatch => match !== null)
        : [],
    [pendingPenaltySlotMatchIds, realMatches],
  );
  const allPendingPenaltyResolved = useMemo(
    () =>
      pendingPenaltyMatches.every((match) => {
        const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
        return getResolvedKnockoutOutcome(state) !== null;
      }),
    [draft.matchStates, pendingPenaltyMatches],
  );
  const activePenaltyMatch = useMemo(
    () =>
      activePenaltyMatchId && activePenaltyMatchId !== ALL_PENALTY_MATCHES_KEY
        ? pendingPenaltyMatches.find((match) => match.id === activePenaltyMatchId) ??
          realMatches.find((match) => match.id === activePenaltyMatchId) ??
          null
        : null,
    [activePenaltyMatchId, pendingPenaltyMatches, realMatches],
  );
  const activePenaltyEditorMatches = useMemo(() => {
    if (!activePenaltyMatchId) return [];
    if (activePenaltyMatchId === ALL_PENALTY_MATCHES_KEY) {
      return pendingPenaltyMatches;
    }
    return activePenaltyMatch ? [activePenaltyMatch] : [];
  }, [activePenaltyMatch, activePenaltyMatchId, pendingPenaltyMatches]);
  const scoreEditorMatch = useMemo(
    () =>
      scoreEditorMatchId
        ? completedLiveReviewMatches.find((match) => match.id === scoreEditorMatchId) ??
          realMatches.find((match) => match.id === scoreEditorMatchId) ??
          null
        : null,
    [completedLiveReviewMatches, realMatches, scoreEditorMatchId],
  );
  const expandedStatsMatch = useMemo(
    () =>
      expandedLiveStatsMatchId
        ? realMatches.find((match) => match.id === expandedLiveStatsMatchId) ?? null
        : null,
    [expandedLiveStatsMatchId, realMatches],
  );
  const expandedStatsSummary = useMemo(
    () =>
      expandedStatsMatch ? summarizeLiveGoalEvents(liveScorersByMatch[expandedStatsMatch.id] ?? []) : [],
    [expandedStatsMatch, liveScorersByMatch],
  );
  const expandedStatsTeams = useMemo(() => {
    if (!expandedStatsMatch) return null;
    const state = draft.matchStates?.[expandedStatsMatch.id] ?? getDefaultMatchState();
    return getDisplayMatchTeams(expandedStatsMatch, state);
  }, [draft.matchStates, expandedStatsMatch, getDisplayMatchTeams]);
  const expandedHomeStatsSummary = useMemo(
    () => expandedStatsSummary.filter((entry) => entry.team === "home"),
    [expandedStatsSummary],
  );
  const expandedAwayStatsSummary = useMemo(
    () => expandedStatsSummary.filter((entry) => entry.team === "away"),
    [expandedStatsSummary],
  );
  const scorerLeaderboard = useMemo(() => {
    const rows = new Map<
      string,
      { team: LivePickerTeam; teamName: string; number: number; goals: number; matches: Set<string> }
    >();

    realMatches.forEach((match) => {
      const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
      const resolvedTeams = getDisplayMatchTeams(match, state);

      (liveScorersByMatch[match.id] ?? []).forEach((event) => {
        const teamName = event.team === "home" ? resolvedTeams.homeTeam : resolvedTeams.awayTeam;
        const key = `${teamName}-${event.number}`;
        const current = rows.get(key) ?? {
          team: event.team,
          teamName,
          number: event.number,
          goals: 0,
          matches: new Set<string>(),
        };

        current.goals += 1;
        current.matches.add(match.id);
        rows.set(key, current);
      });
    });

    return [...rows.values()]
      .map((row) => ({
        ...row,
        matchCount: row.matches.size,
      }))
      .sort((left, right) => {
        if (right.goals !== left.goals) return right.goals - left.goals;
        if (right.matchCount !== left.matchCount) return right.matchCount - left.matchCount;
        return left.teamName.localeCompare(right.teamName, "fr");
      });
  }, [draft.matchStates, getDisplayMatchTeams, liveScorersByMatch, realMatches]);
  const mvpLeaderboard = useMemo(() => {
    const rows = new Map<
      string,
      {
        team: LivePickerTeam;
        teamName: string;
        number: number;
        parentPoints: number;
        coachPoints: number;
        adminPoints: number;
        parentVotes: number;
        coachVotes: number;
        adminVotes: number;
        totalPoints: number;
        votes: number;
        lastVoteAt: string | null;
      }
    >();

    realMatches.forEach((match) => {
      const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
      const resolvedTeams = getDisplayMatchTeams(match, state);

      (state.mvpVotes ?? []).forEach((vote) => {
        const teamName = vote.team === "home" ? resolvedTeams.homeTeam : resolvedTeams.awayTeam;
        const key = `${teamName}-${vote.number}`;
        const current = rows.get(key) ?? {
          team: vote.team,
          teamName,
          number: vote.number,
          parentPoints: 0,
          coachPoints: 0,
          adminPoints: 0,
          parentVotes: 0,
          coachVotes: 0,
          adminVotes: 0,
          totalPoints: 0,
          votes: 0,
          lastVoteAt: null,
        };

        const voteWeight = getVoteWeight(vote.role);

        if (vote.role === "parent") {
          current.parentPoints += voteWeight;
          current.parentVotes += 1;
        }
        if (vote.role === "coach") {
          current.coachPoints += voteWeight;
          current.coachVotes += 1;
        }
        if (vote.role === "admin") {
          current.adminPoints += voteWeight;
          current.adminVotes += 1;
        }
        current.totalPoints += voteWeight;
        current.votes += 1;
        current.lastVoteAt =
          !current.lastVoteAt || vote.createdAt > current.lastVoteAt
            ? vote.createdAt
            : current.lastVoteAt;
        rows.set(key, current);
      });
    });

    return [...rows.values()].sort((left, right) => {
      if (right.totalPoints !== left.totalPoints) return right.totalPoints - left.totalPoints;
      if (right.adminPoints !== left.adminPoints) return right.adminPoints - left.adminPoints;
      if (right.coachPoints !== left.coachPoints) return right.coachPoints - left.coachPoints;
      if (right.parentPoints !== left.parentPoints) return right.parentPoints - left.parentPoints;
      return left.teamName.localeCompare(right.teamName, "fr");
    });
  }, [draft.matchStates, getDisplayMatchTeams, realMatches]);
  const maxScorerGoals = scorerLeaderboard[0]?.goals ?? 0;
  const maxMvpPoints = mvpLeaderboard[0]?.totalPoints ?? 0;
  const statsRole: VoteRole = isOrganizerView ? "admin" : isCoachView ? "coach" : "parent";
  const statsTopFiveActive = isParentView || statsTopFiveOnly;
  const statsViewMode = isParentView ? "simple" : activeStatsViewMode;
  const visibleScorerLeaderboard = statsTopFiveActive ? scorerLeaderboard.slice(0, 5) : scorerLeaderboard;
  const visibleMvpLeaderboard = statsTopFiveActive ? mvpLeaderboard.slice(0, 5) : mvpLeaderboard;
  const publicScorerVisibility = shareSettings.topScorerVisibility ?? "always";
  const allPlayableMatchesCompleted =
    realMatches.length > 0 &&
    realMatches.every(
      (match) => getMatchDisplayState(draft.matchStates?.[match.id] ?? getDefaultMatchState()) === "completed",
    );
  const isTournamentFinished = draft.status === "finished" || allPlayableMatchesCompleted;
  const finalStandings = useMemo(() => {
    const rankToTeam = new Map<number, { team: string; matchLabel: string }>();

    finalMatches.forEach((match) => {
      const placementRanks = getPlacementRanks(match);
      if (!placementRanks) return;

      const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
      if (getMatchDisplayState(state) !== "completed") return;

      const outcome = getResolvedKnockoutOutcome(state);
      if (!outcome) return;

      const resolvedTeams = getDisplayMatchTeams(match);
      const winnerTeam = outcome.winner === "home" ? resolvedTeams.homeTeam : resolvedTeams.awayTeam;
      const loserTeam = outcome.loser === "home" ? resolvedTeams.homeTeam : resolvedTeams.awayTeam;

      rankToTeam.set(placementRanks.winnerRank, {
        team: winnerTeam,
        matchLabel: match.roundLabel,
      });
      rankToTeam.set(placementRanks.loserRank, {
        team: loserTeam,
        matchLabel: match.roundLabel,
      });
    });

    if (rankToTeam.size === 0 && groupTables.length === 1) {
      return groupTables[0].rows.map((row, index) => ({
        rank: index + 1,
        team: row.team,
        matchLabel: groupTables[0]?.label ?? "Classement général",
      }));
    }

    return [...rankToTeam.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([rank, entry]) => ({
        rank,
        team: entry.team,
        matchLabel: entry.matchLabel,
      }));
  }, [draft.matchStates, finalMatches, getDisplayMatchTeams, groupTables]);
  const scorerStatsVisible =
    isOrganizerView ||
    publicScorerVisibility === "always" ||
    (publicScorerVisibility === "end_of_tournament" && isTournamentFinished);
  const mvpStatsVisible = isOrganizerView || Boolean(shareSettings.publicMvpLeaderboardEnabled);
  const statsTabOptions = useMemo(
    () =>
      isOrganizerView
        ? [
            { key: "scorers" as const, label: "Buteurs" },
            { key: "mvp" as const, label: "Meilleurs joueurs" },
          ]
        : [
            ...(scorerStatsVisible ? [{ key: "scorers" as const, label: "Buteurs" }] : []),
            ...(mvpStatsVisible ? [{ key: "mvp" as const, label: "Meilleurs joueurs" }] : []),
          ],
    [isOrganizerView, mvpStatsVisible, scorerStatsVisible],
  );
  const publicStatsBlockedMessage =
    !isOrganizerView && !scorerStatsVisible && !mvpStatsVisible
      ? "Classement disponible à la fin du tournoi"
      : null;
  const overviewCurrentSlot = isTournamentFinished ? null : currentSlot;
  const overviewNextSlot = isTournamentFinished ? null : nextSlot;

  useEffect(() => {
    if (statsTabOptions.length === 0) return;
    if (!statsTabOptions.some((tab) => tab.key === activeStatsTab)) {
      setActiveStatsTab(statsTabOptions[0]!.key);
    }
  }, [activeStatsTab, statsTabOptions]);

  const updateDraft = useCallback(
    (updater: (current: TournamentProductSavedTournament) => TournamentProductSavedTournament) => {
      setDraft((current) => {
        const nextTournament = normalizeTournamentWorkspaceDraft(updater(current));
        lastSavedSnapshotRef.current = JSON.stringify(nextTournament);
        window.queueMicrotask(() => {
          void Promise.resolve(latestOnSaveRef.current(nextTournament)).catch((error) => {
            console.error("Erreur sauvegarde tournoi:", error);
          });
        });
        return nextTournament;
      });
    },
    [],
  );
  const canGroupCurrentAndNextSlot = Boolean(
    isOrganizerView &&
      currentSlot &&
      nextLiveSlot &&
      getSlotCompletionState(currentSlot) === "incomplete" &&
      getSlotCompletionState(nextLiveSlot) === "incomplete" &&
      currentSlot.matches.length + nextLiveSlot.matches.length <= Math.max(draft.fieldCount, 1),
  );
  const groupCurrentAndNextSlot = useCallback(() => {
    if (!currentSlot || !nextLiveSlot || !canGroupCurrentAndNextSlot) return;

    const targetSlotIndex = currentSlot.matches[0]?.slotIndex;
    const targetStartTime = currentSlot.matches[0]?.startTime ?? currentSlot.startTime;
    const targetEndTime = currentSlot.matches[0]?.endTime ?? addMinutes(targetStartTime, draft.matchDuration);
    const nextSlotMatchIds = new Set(nextLiveSlot.matches.map((match) => match.id));

    updateDraft((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      schedule: current.schedule.map((match) =>
        nextSlotMatchIds.has(match.id)
          ? {
              ...match,
              slotIndex: targetSlotIndex,
              startTime: targetStartTime,
              endTime: targetEndTime,
            }
          : match,
      ),
    }));
  }, [canGroupCurrentAndNextSlot, currentSlot, draft.matchDuration, nextLiveSlot, updateDraft]);

  const syncMatchStateToServer = useCallback(
    async (
      tournamentId: string,
      scheduleMatch: TournamentProductScheduleMatch,
      nextMatchState: TournamentProductMatchState,
      nextGoalEvents: LiveGoalEvent[],
    ) => {
      const syncedState = toServerMatchState(nextMatchState, nextGoalEvents);
      pendingLocalMatchSyncRef.current[scheduleMatch.id] = syncedState;
      await saveTournamentMatchesLiveStates(tournamentId, [scheduleMatch], {
        [scheduleMatch.id]: syncedState,
      });
    },
    [],
  );

  const addGoalAtomic = useCallback(
    (matchId: string, side: LivePickerTeam, scorer: { number: number; elapsedSeconds: number }) => {
      const scheduleMatch = realMatches.find((match) => match.id === matchId);
      if (!scheduleMatch) return;

      const currentGoalEvents = liveScorersByMatchRef.current[matchId] ?? [];
      const nextGoalEvents = [
        ...currentGoalEvents,
        {
          team: side,
          number: scorer.number,
          elapsedSeconds: scorer.elapsedSeconds,
        },
      ];

      setLiveScorersByMatch((current) => ({
        ...current,
        [matchId]: nextGoalEvents,
      }));

      updateDraft((current) => {
        const previous = current.matchStates?.[matchId] ?? getDefaultMatchState();
        const nextMatchState: TournamentProductMatchState = {
          ...previous,
          status: "live",
          homeScore: side === "home" ? (previous.homeScore ?? 0) + 1 : previous.homeScore ?? 0,
          awayScore: side === "away" ? (previous.awayScore ?? 0) + 1 : previous.awayScore ?? 0,
          startedAt: previous.startedAt ?? new Date().toISOString(),
          completedAt: null,
        };

        console.log("ADD GOAL ATOMIC", {
          matchId,
          side,
          scorer,
          nextMatchState,
          nextGoalEvents,
        });

        window.queueMicrotask(() => {
          void syncMatchStateToServer(current.id, scheduleMatch, nextMatchState, nextGoalEvents).catch((error) => {
            delete pendingLocalMatchSyncRef.current[matchId];
            console.error("Erreur sync but serveur:", error);
          });
        });

        return {
          ...current,
          updatedAt: new Date().toISOString(),
          matchStates: {
            ...(current.matchStates ?? {}),
            [matchId]: nextMatchState,
          },
        };
      });
    },
    [realMatches, syncMatchStateToServer, updateDraft],
  );

  const updateMatchState = (
    matchId: string,
    patch:
      | Partial<TournamentProductMatchState>
      | ((previous: TournamentProductMatchState) => Partial<TournamentProductMatchState>),
    serverGoalEvents?: LiveGoalEvent[],
  ) => {
    updateDraft((current) => {
      const updatedAt = new Date().toISOString();
      const nextMatchStates = (() => {
        const previous = current.matchStates?.[matchId] ?? getDefaultMatchState();
        const resolvedPatch = typeof patch === "function" ? patch(previous) : patch;
        const requestedStatus = resolvedPatch.status ?? previous.status;
        const nextStatus: TournamentProductMatchState["status"] =
          requestedStatus === "live"
            ? "live"
            : requestedStatus === "completed"
              ? "completed"
              : "idle";
        const nextState = {
          ...previous,
          ...resolvedPatch,
          status: nextStatus,
        };
        const nextMatchState = {
          ...nextState,
          startedAt:
            nextStatus === "live"
              ? (resolvedPatch.startedAt ?? previous.startedAt ?? updatedAt)
              : nextStatus === "completed"
                ? (resolvedPatch.startedAt ?? previous.startedAt ?? null)
                : null,
          completedAt:
            nextStatus === "completed"
              ? (resolvedPatch.completedAt ?? previous.completedAt ?? updatedAt)
              : null,
        };
        const shouldPersistServerState =
          nextMatchState.status !== previous.status ||
          nextMatchState.startedAt !== (previous.startedAt ?? null) ||
          nextMatchState.completedAt !== (previous.completedAt ?? null) ||
          nextMatchState.homeScore !== previous.homeScore ||
          nextMatchState.awayScore !== previous.awayScore;
        const scheduleMatch = current.schedule.find((match) => match.id === matchId);

        if (scheduleMatch && shouldPersistServerState) {
          window.queueMicrotask(() => {
            void syncMatchStateToServer(
              current.id,
              scheduleMatch,
              nextMatchState,
              serverGoalEvents ?? liveScorersByMatchRef.current[matchId] ?? [],
            ).catch((error) => {
              delete pendingLocalMatchSyncRef.current[matchId];
              console.error("Erreur sync statut match serveur:", error);
            });
          });
        }

        return {
          ...(current.matchStates ?? {}),
          [matchId]: nextMatchState,
        };
      })();

      return {
        ...current,
        updatedAt,
        matchStates: nextMatchStates,
      };
    });
  };

  const updateScheduleMatch = (matchId: string, patch: Partial<TournamentProductScheduleMatch>) => {
    updateDraft((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      schedule: current.schedule.map((match) =>
        match.id === matchId
          ? {
              ...match,
              ...patch,
            }
          : match,
      ),
    }));
  };

  const removeFriendlyMatch = (matchId: string) => {
    updateDraft((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      schedule: current.schedule.filter((match) => match.id !== matchId),
    }));
  };

  const maxPlayersPerTeam = Math.max(1, draft.maxPlayersPerTeam ?? 10);
  const maxMealsPerTeam = Math.max(
    1,
    draft.mealsPerTeam ??
      (typeof draft.manualBuilderSnapshot?.manualTournamentState?.mealsPerTeam === "number"
        ? Math.round(draft.manualBuilderSnapshot.manualTournamentState.mealsPerTeam)
        : 12),
  );
  const mealItems = useMemo(() => draft.mealItems ?? [], [draft.mealItems]);
  const isPublicTournamentAccessEnabled =
    shareSettings.tournamentPublished ||
    (isCoachView && Boolean(shareSettings.coachTournamentAccessEnabled)) ||
    (isParentView && Boolean(shareSettings.parentTournamentAccessEnabled));
  const publicTournamentBlocked = (isCoachView || isParentView) && !isPublicTournamentAccessEnabled;
  const tournamentTeamsById = useMemo(
    () => new Map((draft.teams ?? []).map((team) => [team.id, team])),
    [draft.teams],
  );
  const findTournamentTeam = useCallback(
    (identifier: string) =>
      tournamentTeamsById.get(identifier) ??
      findTournamentTeamByIdentifier(draft.teams ?? [], identifier) ??
      null,
    [draft.teams, tournamentTeamsById],
  );
  const resolveTeamId = useCallback(
    (identifier: string) => findTournamentTeam(identifier)?.id ?? null,
    [findTournamentTeam],
  );
  const resolveTeamStorageKey = useCallback(
    (identifier: string) => findTournamentTeam(identifier)?.id ?? identifier,
    [findTournamentTeam],
  );
  const resolveTeamLabel = useCallback(
    (identifier: string) => findTournamentTeam(identifier)?.name ?? identifier,
    [findTournamentTeam],
  );
  const getLoadedPlayers = useCallback(
    (identifier: string) => {
      const teamId = resolveTeamId(identifier);
      return teamId ? (playersByTeamId[teamId] ?? []) : [];
    },
    [playersByTeamId, resolveTeamId],
  );
  const getTournamentPlayerByTeamAndNumber = useCallback(
    (teamIdentifier: string, number: string | number) => {
      const normalizedNumber = String(number ?? "").trim();
      if (!normalizedNumber) return null;

      return (
        getLoadedPlayers(teamIdentifier).find(
          (player) => String(player.number ?? "").trim() === normalizedNumber,
        ) ?? null
      );
    },
    [getLoadedPlayers],
  );
  const getTournamentPlayerDisplayLabel = useCallback(
    (teamIdentifier: string, number: string | number) => {
      const normalizedNumber = String(number ?? "").trim();
      const fallbackLabel = normalizedNumber ? `N°${normalizedNumber}` : "Joueur";
      const player = getTournamentPlayerByTeamAndNumber(teamIdentifier, number);
      const fullName = formatTournamentPlayerFullName(player);
      return fullName ? `${fallbackLabel} • ${fullName}` : fallbackLabel;
    },
    [getTournamentPlayerByTeamAndNumber],
  );

  const publicVisibleTeams = useMemo(
    () =>
      (isCoachView ? filteredTournamentTeams : registeredTournamentTeams).map((team) => ({
        id: team.id,
        name: team.name,
      })),
    [filteredTournamentTeams, isCoachView, registeredTournamentTeams],
  );

  useEffect(() => {
    if (!draft.id || draft.teams.length === 0) return;

    const teamsToLoad = draft.teams.filter((team) => playersByTeamId[team.id] === undefined);
    if (teamsToLoad.length === 0) return;

    let cancelled = false;

    const preloadTournamentPlayers = async () => {
      const results = await Promise.allSettled(
        teamsToLoad.map(async (team) => ({
          teamId: team.id,
          players: await loadTournamentPlayers(draft.id, {
            id: team.id,
            name: team.name,
          }),
        })),
      );

      if (cancelled) return;

      setPlayersByTeamId((current) => {
        let changed = false;
        const next = { ...current };

        results.forEach((result) => {
          if (result.status !== "fulfilled") return;
          const { teamId, players } = result.value;
          if (areRosterPlayersEqual(current[teamId] ?? [], players)) return;
          next[teamId] = players;
          changed = true;
        });

        return changed ? next : current;
      });
    };

    void preloadTournamentPlayers();

    return () => {
      cancelled = true;
    };
  }, [draft.id, draft.teams, playersByTeamId]);
  const lockedCoachTeamName =
    isCoachView &&
    initialCoachTeamName &&
    publicVisibleTeams.some(
      (team) => team.id === initialCoachTeamName || team.name === initialCoachTeamName,
    )
      ? resolveTeamStorageKey(initialCoachTeamName)
      : null;
  const voteRole: VoteRole = isOrganizerView ? "admin" : isCoachView ? "coach" : "parent";
  const publicVoterTeamId = useMemo(() => {
    if (isOrganizerView) return null;
    if (isCoachView) {
      return lockedCoachTeamName ? resolveTeamId(lockedCoachTeamName) : null;
    }
    if (isParentView) {
      return parentVoteSession?.teamId ?? null;
    }
    return initialVoterTeamName ? resolveTeamId(initialVoterTeamName) : null;
  }, [
    initialVoterTeamName,
    isCoachView,
    isOrganizerView,
    isParentView,
    lockedCoachTeamName,
    parentVoteSession?.teamId,
    resolveTeamId,
  ]);
  const publicVoterTeamLabel = publicVoterTeamId ? resolveTeamLabel(publicVoterTeamId) : null;
  const getMatchSideTeamId = useCallback(
    (match: TournamentProductScheduleMatch, side: LivePickerTeam) => {
      const rawTeamName = side === "home" ? match.homeTeam : match.awayTeam;
      const resolvedTeamName = resolveSlot(side === "home" ? match.homeSlot : match.awaySlot, rawTeamName, match.divisionId);
      return findTournamentTeam(resolvedTeamName)?.id ?? findTournamentTeam(rawTeamName)?.id ?? null;
    },
    [findTournamentTeam, resolveSlot],
  );
  const canVoteForMatchSide = useCallback(
    (match: TournamentProductScheduleMatch, side: LivePickerTeam) => {
      if (isOrganizerView) return true;
      if (!publicVoterTeamId) return false;
      const homeTeamId = getMatchSideTeamId(match, "home");
      const awayTeamId = getMatchSideTeamId(match, "away");
      if (homeTeamId !== publicVoterTeamId && awayTeamId !== publicVoterTeamId) return false;
      return getMatchSideTeamId(match, side) !== publicVoterTeamId;
    },
    [getMatchSideTeamId, isOrganizerView, publicVoterTeamId],
  );
  const getAllowedVoteSides = useCallback(
    (match: TournamentProductScheduleMatch) =>
      (["home", "away"] as LivePickerTeam[]).filter((side) => canVoteForMatchSide(match, side)),
    [canVoteForMatchSide],
  );
  const getVoteVoterKey = useCallback(
    () => `${voteRole}:${publicVoterTeamId ?? "anonymous"}`,
    [publicVoterTeamId, voteRole],
  );
  const hasCurrentUserVotedMatch = useCallback(
    (state: TournamentProductMatchState, matchId: string) =>
      (state.mvpVotes ?? []).some((vote) => vote.id === `${getVoteVoterKey()}:${matchId}`),
    [getVoteVoterKey],
  );

  const loadPlayersForTeam = useCallback(
    async (identifier: string) => {
      const team = findTournamentTeam(identifier);
      if (!team) return;

      const players = await loadTournamentPlayers(draft.id, {
        id: team.id,
        name: team.name,
      });

      setPlayersByTeamId((current) => ({
        ...current,
        [team.id]: players,
      }));

      return players;
    },
    [draft.id, findTournamentTeam],
  );

  const applyPersistedCoachSync = useCallback(
    (persistedTournament: TournamentProductSavedTournament) => {
      const persistedShareSettings = buildDefaultShareSettings(persistedTournament.shareSettings);

      setDraft((current) => {
        const currentShareSettings = buildDefaultShareSettings(current.shareSettings);
        const nextShareSettings = {
          ...currentShareSettings,
          ...persistedShareSettings,
          parentTeamCodes: {
            ...(currentShareSettings.parentTeamCodes ?? {}),
            ...(persistedShareSettings.parentTeamCodes ?? {}),
          },
          coachTeamSubmissions: {
            ...currentShareSettings.coachTeamSubmissions,
            ...persistedShareSettings.coachTeamSubmissions,
          },
          coachMealSubmissions: {
            ...currentShareSettings.coachMealSubmissions,
            ...persistedShareSettings.coachMealSubmissions,
          },
        };

        if (JSON.stringify(nextShareSettings) === JSON.stringify(currentShareSettings)) {
          return current;
        }

        return {
          ...current,
          shareSettings: nextShareSettings,
        };
      });

      setPlayersByTeamId((current) => {
        let changed = false;
        const next = { ...current };

        Object.entries(persistedShareSettings.coachTeamSubmissions ?? {}).forEach(([, submission]) => {
          const team =
            findTournamentTeam(submission.teamName) ??
            (submission.teamName
              ? (draft.teams ?? []).find((entry) => entry.name === submission.teamName) ?? null
              : null);
          if (!team) return;

          const submittedPlayers = (submission.players ?? []).slice(0, maxPlayersPerTeam);
          if (countFilledRosterPlayers(submittedPlayers) === 0) return;

          if (!areRosterPlayersEqual(next[team.id] ?? [], submittedPlayers)) {
            next[team.id] = submittedPlayers;
            changed = true;
          }
        });

        return changed ? next : current;
      });
    },
    [draft.teams, findTournamentTeam, maxPlayersPerTeam],
  );

  useEffect(() => {
    if (activeCoachTeamName && publicVisibleTeams.some((team) => team.id === activeCoachTeamName)) return;
    if (lockedCoachTeamName) {
      setActiveCoachTeamName(lockedCoachTeamName);
      return;
    }
    setActiveCoachTeamName(publicVisibleTeams[0]?.id ?? null);
  }, [activeCoachTeamName, lockedCoachTeamName, publicVisibleTeams]);

  useEffect(() => {
    if (!activeCoachTeamName) return;

    void loadPlayersForTeam(activeCoachTeamName).catch((error) => {
      console.error("Erreur chargement joueurs coach:", error);
    });
  }, [activeCoachTeamName, loadPlayersForTeam]);

  useEffect(() => {
    let cancelled = false;

    const refreshTournamentShareSettings = async () => {
      try {
        const persistedTournament = await loadTournament<TournamentProductSavedTournament>(draft.id);
        if (!persistedTournament || cancelled) return;
        applyPersistedCoachSync(persistedTournament);
      } catch (error) {
        console.error("Erreur refresh partage tournoi:", error);
      }
    };

    void refreshTournamentShareSettings();

    const channel = supabase
      .channel(`tournament-share-${draft.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tournaments",
          filter: `id=eq.${draft.id}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row || typeof row.data !== "object" || row.data === null) return;
          applyPersistedCoachSync(row.data as TournamentProductSavedTournament);
        },
      )
      .subscribe();

    const intervalId = window.setInterval(() => {
      void refreshTournamentShareSettings();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      void supabase.removeChannel(channel);
    };
  }, [applyPersistedCoachSync, draft.id, isOrganizerView]);

  const handleOpenPlayers = useCallback(
    async (team: { id: string; name: string }) => {
      setIsLoadingPlayers(true);
      setSelectedPlayers([]);
      setActiveRosterTeamName(team.id);

      try {
        const players = (await loadPlayersForTeam(team.id)) ?? [];
        console.log("ADMIN PLAYERS RAW", players);
        const mappedPlayers = players.map((player) => ({
          id: player.id,
          firstName: player.firstName ?? "",
          lastName: player.lastName ?? "",
          license: player.license ?? "",
          number: player.number != null ? String(player.number) : "",
        }));
        console.log("ADMIN PLAYERS MAPPED", mappedPlayers);
        console.log("SET SELECTED PLAYERS", mappedPlayers);
        setSelectedPlayers(mappedPlayers);
      } finally {
        setIsLoadingPlayers(false);
      }
    },
    [loadPlayersForTeam],
  );

  useEffect(() => {
    console.log("RENDER selectedPlayers", selectedPlayers);
  }, [selectedPlayers]);

  useEffect(() => {
    if (!activeRosterTeamName) return;
    const teamId = resolveTeamId(activeRosterTeamName);
    if (!teamId) return;

    const nextPlayers = playersByTeamId[teamId] ?? [];
    setSelectedPlayers((current) => (areRosterPlayersEqual(current, nextPlayers) ? current : nextPlayers));
  }, [activeRosterTeamName, playersByTeamId, resolveTeamId]);

  const activeMealOrderTeam = useMemo(
    () => (activeMealOrderTeamId ? findTournamentTeam(activeMealOrderTeamId) : null),
    [activeMealOrderTeamId, findTournamentTeam],
  );
  const activeMealOrderSubmission = useMemo(() => {
    if (!activeMealOrderTeam) return null;

    return (
      shareSettings.coachMealSubmissions[activeMealOrderTeam.id] ??
      shareSettings.coachMealSubmissions[activeMealOrderTeam.name] ??
      Object.values(shareSettings.coachMealSubmissions).find(
        (entry) => entry.teamName === activeMealOrderTeam.name,
      ) ??
      null
    );
  }, [activeMealOrderTeam, shareSettings.coachMealSubmissions]);
  const activeMealOrderRows = useMemo(
    () =>
      activeMealOrderSubmission
        ? buildDefaultMealRows(maxMealsPerTeam, mealItems, activeMealOrderSubmission.rows).filter(
            (row) =>
              row.participantLabel.trim() ||
              Object.values(row.quantities ?? {}).some((quantity) => quantity > 0),
          )
        : [],
    [activeMealOrderSubmission, maxMealsPerTeam, mealItems],
  );
  const activeMealOrderTotal = useMemo(
    () =>
      activeMealOrderRows.reduce(
        (total, row) =>
          total +
          mealItems.reduce((lineTotal, item) => {
            const quantity = row.quantities?.[item.id] ?? 0;
            const price = Number(item.price || 0);
            return lineTotal + quantity * price;
          }, 0),
        0,
      ),
    [activeMealOrderRows, mealItems],
  );
  const mealServicePlan = useMemo(() => {
    const registeredTeamNames = new Set(registeredTournamentTeams.map((team) => team.name));
    const mealEligibleMatches = realMatches
      .map((match) => {
        const homeTeam = resolveSlot(match.homeSlot, match.homeTeam, match.divisionId);
        const awayTeam = resolveSlot(match.awaySlot, match.awayTeam, match.divisionId);

        if (isUnresolvedTournamentParticipant(homeTeam) || isUnresolvedTournamentParticipant(awayTeam)) {
          return null;
        }

        if (!registeredTeamNames.has(homeTeam) || !registeredTeamNames.has(awayTeam)) {
          return null;
        }

        return {
          ...match,
          homeTeam,
          awayTeam,
        };
      })
      .filter((match): match is TournamentProductScheduleMatch => Boolean(match));
    const sortedMatches = sortMatchesByTime(mealEligibleMatches);
    const sortedPauses = sortMatchesByTime(filteredSchedule.filter(isPause));
    const noonMinutes = toMinutes("12:00");
    const explicitPause =
      sortedPauses
        .map((pause) => ({
          start: toMinutes(pause.startTime),
          end: toMinutes(pause.endTime),
          label: `${pause.startTime} - ${pause.endTime}`,
        }))
        .sort(
          (left, right) =>
            Math.abs(left.start - noonMinutes) - Math.abs(right.start - noonMinutes),
        )[0] ?? null;
    const detectedGap = sortedMatches
      .slice(0, -1)
      .map((match, index) => {
        const nextMatch = sortedMatches[index + 1];
        const start = toMinutes(match.endTime);
        const end = toMinutes(nextMatch.startTime);

        return {
          start,
          end,
          label: `${match.endTime} - ${nextMatch.startTime}`,
          duration: end - start,
        };
      })
      .filter((gap) => gap.duration >= Math.max(15, draft.lunchBreakMinutes || 0))
      .sort((left, right) => {
        const durationGap = right.duration - left.duration;
        if (durationGap !== 0) return durationGap;
        return Math.abs(left.start - noonMinutes) - Math.abs(right.start - noonMinutes);
      })[0];
    const mealBreak = explicitPause ??
      detectedGap ?? {
        start: noonMinutes,
        end: noonMinutes + Math.max(30, draft.lunchBreakMinutes || 60),
        label: `12:00 - ${toTimeLabel(noonMinutes + Math.max(30, draft.lunchBreakMinutes || 60))}`,
      };

    const isTeamMatch = (match: TournamentProductScheduleMatch, teamName: string) =>
      match.homeTeam === teamName || match.awayTeam === teamName;
    const getOpponent = (match: TournamentProductScheduleMatch, teamName: string) =>
      match.homeTeam === teamName ? match.awayTeam : match.homeTeam;

    const teams = registeredTournamentTeams.map((team) => {
      const teamMatches = sortedMatches.filter((match) => isTeamMatch(match, team.name));
      const previousMatch =
        [...teamMatches].reverse().find((match) => toMinutes(match.startTime) < mealBreak.end) ??
        null;
      const nextMatch =
        teamMatches.find((match) => toMinutes(match.startTime) >= mealBreak.end) ??
        null;

      return {
        team,
        previousMatch,
        nextMatch,
        nextMatchMinutes: nextMatch ? toMinutes(nextMatch.startTime) : Number.POSITIVE_INFINITY,
        previousMatchMinutes: previousMatch ? toMinutes(previousMatch.startTime) : Number.NEGATIVE_INFINITY,
        nextOpponent: nextMatch ? getOpponent(nextMatch, team.name) : null,
        previousOpponent: previousMatch ? getOpponent(previousMatch, team.name) : null,
      };
    });

    return {
      breakLabel: mealBreak.label,
      teams: teams.sort((left, right) => {
        const nextMatchGap = left.nextMatchMinutes - right.nextMatchMinutes;
        if (nextMatchGap !== 0) return nextMatchGap;

        const previousMatchGap = right.previousMatchMinutes - left.previousMatchMinutes;
        if (previousMatchGap !== 0) return previousMatchGap;

        return left.team.name.localeCompare(right.team.name, "fr");
      }),
    };
  }, [
    draft.lunchBreakMinutes,
    filteredSchedule,
    realMatches,
    registeredTournamentTeams,
    resolveSlot,
  ]);

  const activeCoachTeamSubmission = useMemo<TournamentProductCoachTeamSubmission | null>(() => {
    if (!activeCoachTeamName) return null;
    const legacyTeamName = findTournamentTeam(activeCoachTeamName)?.name;
    return (
      shareSettings.coachTeamSubmissions[activeCoachTeamName] ??
      (legacyTeamName ? shareSettings.coachTeamSubmissions[legacyTeamName] : null) ?? {
        teamName: resolveTeamLabel(activeCoachTeamName),
        players: [],
      }
    );
  }, [
    activeCoachTeamName,
    findTournamentTeam,
    resolveTeamLabel,
    shareSettings.coachTeamSubmissions,
  ]);
  const activeCoachTeamPlayers = useMemo(
    () => (activeCoachTeamName ? getLoadedPlayers(activeCoachTeamName) : []),
    [activeCoachTeamName, getLoadedPlayers],
  );

  const activeCoachMealSubmission = useMemo<TournamentProductCoachMealSubmission | null>(() => {
    if (!activeCoachTeamName) return null;
    const legacyTeamName = findTournamentTeam(activeCoachTeamName)?.name;
    return (
      shareSettings.coachMealSubmissions[activeCoachTeamName] ??
      (legacyTeamName ? shareSettings.coachMealSubmissions[legacyTeamName] : null) ?? {
        teamName: resolveTeamLabel(activeCoachTeamName),
        rows: buildDefaultMealRows(maxMealsPerTeam, mealItems),
      }
    );
  }, [
    activeCoachTeamName,
    findTournamentTeam,
    maxMealsPerTeam,
    mealItems,
    resolveTeamLabel,
    shareSettings.coachMealSubmissions,
  ]);
  const isCoachTeamReadonly =
    Boolean(activeCoachTeamSubmission?.submittedAt) &&
    Boolean(activeCoachTeamName) &&
    editingCoachTeamName !== activeCoachTeamName;

  const setShareSettings = (
    updater: (current: TournamentProductShareSettings) => TournamentProductShareSettings,
  ) => {
    updateDraft((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      shareSettings: updater(buildDefaultShareSettings(current.shareSettings)),
    }));
  };

  const unlockParentVoteWithCode = async () => {
    const normalizedCode = normalizeParentTeamCode(parentVoteCodeDraft);
    if (!normalizedCode) {
      setParentVoteCodeError("Entre le code de ton équipe.");
      return;
    }

    const findCodeEntry = (settings: TournamentProductShareSettings) =>
      Object.entries(settings.parentTeamCodes ?? {}).find(
        ([, code]) => normalizeParentTeamCode(code) === normalizedCode,
      );

    let matchedEntry = findCodeEntry(shareSettings);

    if (!matchedEntry) {
      try {
        const freshTournament = await loadTournament<TournamentProductSavedTournament>(draft.id);
        const freshShareSettings = buildDefaultShareSettings(freshTournament?.shareSettings);

        if (freshTournament) {
          setDraft((current) => normalizeTournamentWorkspaceDraft({ ...current, ...freshTournament }));
        }

        matchedEntry = findCodeEntry(freshShareSettings);
      } catch (error) {
        console.error("Erreur vérification code vote:", error);
      }
    }

    if (!matchedEntry) {
      setParentVoteCodeError("Code équipe invalide.");
      return;
    }

    setParentVoteSession({
      teamId: matchedEntry[0],
      unlockedByCode: true,
      votedMatchIds: [],
    });
    setParentVoteCodeModalOpen(false);
    setParentVoteCodeDraft("");
    setParentVoteCodeError(null);
  };

  const setCoachMealSubmission = (
    teamName: string,
    updater: (current: TournamentProductCoachMealSubmission) => TournamentProductCoachMealSubmission,
  ) => {
    setShareSettings((current) => ({
      ...current,
      coachMealSubmissions: {
        ...current.coachMealSubmissions,
        [resolveTeamStorageKey(teamName)]: (() => {
          const nextSubmission = updater(
            current.coachMealSubmissions[resolveTeamStorageKey(teamName)] ??
            (findTournamentTeam(teamName)?.name
              ? current.coachMealSubmissions[findTournamentTeam(teamName)!.name]
              : null) ?? {
              teamName: resolveTeamLabel(teamName),
              rows: buildDefaultMealRows(maxMealsPerTeam, mealItems),
            },
          );

          return {
            ...nextSubmission,
            status: getCoachMealStatus(nextSubmission.rows, maxMealsPerTeam),
          };
        })(),
      },
    }));
  };

  const updateCoachTeamPlayer = (
    teamName: string,
    playerIndex: number,
    field: keyof TournamentProductTeamPlayer,
    value: string,
  ) => {
    const team = findTournamentTeam(teamName);
    if (!team) return;

    const existingPlayers = playersByTeamId[team.id] ?? [];
    const nextPlayers = [...existingPlayers];
    const currentPlayer = nextPlayers[playerIndex] ?? createEmptyRosterPlayer(playerIndex);
    nextPlayers[playerIndex] = {
      ...currentPlayer,
      [field]: value,
    };
    const nextPlayer = nextPlayers[playerIndex];

    setPlayersByTeamId((current) => ({
      ...current,
      [team.id]: nextPlayers.slice(0, maxPlayersPerTeam),
    }));

    void saveTournamentPlayer(
      draft.id,
      {
        id: team.id,
        name: team.name,
      },
      playerIndex,
      nextPlayer,
    ).catch((error) => {
      console.error("Erreur sauvegarde joueur coach:", error);
    });
  };

  const updateCoachMealQuantity = (
    teamName: string,
    rowIndex: number,
    mealId: string,
    delta: number,
  ) => {
    setCoachMealSubmission(teamName, (current) => {
      const nextRows = buildDefaultMealRows(maxMealsPerTeam, mealItems, current.rows);
      const targetRow = nextRows[rowIndex];
      if (!targetRow) return current;
      targetRow.quantities = {
        ...targetRow.quantities,
        [mealId]: Math.max(0, (targetRow.quantities[mealId] ?? 0) + delta),
      };
      return {
        ...current,
        rows: nextRows,
      };
    });
  };

  const updateCoachMealLabel = (teamName: string, rowIndex: number, value: string) => {
    setCoachMealSubmission(teamName, (current) => {
      const nextRows = buildDefaultMealRows(maxMealsPerTeam, mealItems, current.rows);
      const targetRow = nextRows[rowIndex];
      if (!targetRow) return current;
      targetRow.participantLabel = value;
      return {
        ...current,
        rows: nextRows,
      };
    });
  };

  const sendCoachInfo = (teamName: string) => {
    const submittedAt = new Date().toISOString();
    updateDraft((current) => {
      const currentShareSettings = buildDefaultShareSettings(current.shareSettings);
      const storageKey = resolveTeamStorageKey(teamName);
      const displayName = resolveTeamLabel(teamName);
      const currentPlayers = getLoadedPlayers(teamName).slice(0, maxPlayersPerTeam);
      const teamSubmission =
        currentShareSettings.coachTeamSubmissions[storageKey] ??
        (findTournamentTeam(teamName)?.name
          ? currentShareSettings.coachTeamSubmissions[findTournamentTeam(teamName)!.name]
          : null) ?? {
          teamName: displayName,
          players: [],
        };
      const mealSubmission =
        currentShareSettings.coachMealSubmissions[storageKey] ??
        (findTournamentTeam(teamName)?.name
          ? currentShareSettings.coachMealSubmissions[findTournamentTeam(teamName)!.name]
          : null) ?? {
          teamName: displayName,
          rows: buildDefaultMealRows(maxMealsPerTeam, mealItems),
        };

      return {
        ...current,
        updatedAt: submittedAt,
        shareSettings: {
          ...currentShareSettings,
          coachTeamSubmissions: {
            ...currentShareSettings.coachTeamSubmissions,
            [storageKey]: {
              ...teamSubmission,
              teamName: displayName,
              players: currentPlayers,
              submittedAt,
            },
          },
          coachMealSubmissions: {
            ...currentShareSettings.coachMealSubmissions,
            [storageKey]: {
              ...mealSubmission,
              teamName: displayName,
              status: getCoachMealStatus(mealSubmission.rows, maxMealsPerTeam),
              submittedAt,
            },
          },
        },
      };
    });
    setEditingCoachTeamName(null);
  };

  const applyCoachInfoToAdmin = async () => {
    await Promise.all(registeredTournamentTeams.map((team) => loadPlayersForTeam(team.id)));
  };

  const addTournamentTeam = () => {
    const normalizedName = teamDraftName.trim() || `Equipe ${draft.teams.length + 1}`;

    updateDraft((current) => {
      if (current.teams.some((team) => team.name.toLowerCase() === normalizedName.toLowerCase())) {
        return current;
      }

      return {
        ...current,
        updatedAt: new Date().toISOString(),
        teamCount: Math.max(current.teamCount, current.teams.length + 1),
        teams: [
          ...current.teams,
          {
            id: `manual-team-${Date.now()}`,
            name: normalizedName,
            officialId: null,
            source: "manual",
          },
        ],
      };
    });

    setTeamDraftName("");
  };

  const removeTournamentTeam = (teamName: string) => {
    updateDraft((current) => {
      const team = findTournamentTeamByIdentifier(current.teams ?? [], teamName);

      return {
        ...current,
        updatedAt: new Date().toISOString(),
        teams: current.teams.filter((currentTeam) => currentTeam.id !== team?.id),
      };
    });

    setActiveRosterTeamName((current) => (current === teamName ? null : current));
    setSelectedPlayers([]);
    setPlayersByTeamId((current) => {
      const team = findTournamentTeam(teamName);
      if (!team) return current;
      const nextPlayers = { ...current };
      delete nextPlayers[team.id];
      return nextPlayers;
    });
  };

  const focusOverviewGroup = (groupLabel: string) => {
    const card = overviewGroupCardRefs.current[groupLabel];
    if (!card) return;

    overviewAutoScrollTargetRef.current = groupLabel;
    setActiveOverviewGroup(groupLabel);
    card.scrollIntoView({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    });
  };
  const syncActiveOverviewGroup = () => {
    const container = overviewGroupsScrollerRef.current;
    if (!container || groupTables.length === 0) return;

    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const nextMask = {
      left: container.scrollLeft > 12,
      right: container.scrollLeft < maxScrollLeft - 12,
    };
    setOverviewScrollMask((current) =>
      current.left === nextMask.left && current.right === nextMask.right ? current : nextMask,
    );

    const autoScrollTarget = overviewAutoScrollTargetRef.current;
    if (autoScrollTarget) {
      const targetCard = overviewGroupCardRefs.current[autoScrollTarget];
      if (targetCard) {
        const targetLeft = Math.max(0, targetCard.offsetLeft - 4);
        if (Math.abs(container.scrollLeft - targetLeft) <= 16) {
          overviewAutoScrollTargetRef.current = null;
        } else {
          setActiveOverviewGroup(autoScrollTarget);
          return;
        }
      } else {
        overviewAutoScrollTargetRef.current = null;
      }
    }

    if (container.scrollLeft >= maxScrollLeft - 16) {
      const lastLabel = groupTables.at(-1)?.label ?? null;
      if (lastLabel) {
        setActiveOverviewGroup(lastLabel);
      }
      return;
    }

    let nearestLabel = groupTables[0]?.label ?? null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const viewportCenter = container.scrollLeft + container.clientWidth / 2;

    groupTables.forEach((group) => {
      const card = overviewGroupCardRefs.current[group.label];
      if (!card) return;

      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const distance = Math.abs(cardCenter - viewportCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestLabel = group.label;
      }
    });

    if (nearestLabel) {
      setActiveOverviewGroup(nearestLabel);
    }
  };
  const currentOverviewGroup =
    activeOverviewGroup && groupTables.some((group) => group.label === activeOverviewGroup)
      ? activeOverviewGroup
      : (groupTables[0]?.label ?? null);
  const activeLiveMatchId = currentLiveMatch?.id ?? null;
  const activeLiveMatchState = activeLiveMatchId
    ? draft.matchStates?.[activeLiveMatchId] ?? getDefaultMatchState()
    : null;
  const activeLiveMatchStatus = activeLiveMatchState?.status ?? null;
  const activeLiveMatchStartedAt = activeLiveMatchState?.startedAt ?? null;
  const activeLiveRuntime = activeLiveMatchId ? liveRuntimeByMatch[activeLiveMatchId] : null;

  useEffect(() => {
    if (
      !activeLiveMatchId ||
      activeLiveMatchStatus !== "live" ||
      !activeLiveMatchStartedAt
    ) {
      return;
    }

    const startedAtTime = Date.parse(activeLiveMatchStartedAt);
    if (!Number.isFinite(startedAtTime)) return;

    setLiveRuntimeByMatch((current) => {
      const runtime = current[activeLiveMatchId];
      if (runtime?.running && runtime.startedAt === startedAtTime) {
        return current;
      }

      return {
        ...current,
        [activeLiveMatchId]: {
          elapsedSeconds: Math.max(0, Math.floor((Date.now() - startedAtTime) / 1000)),
          running: true,
          startedAt: startedAtTime,
        },
      };
    });
  }, [activeLiveMatchId, activeLiveMatchStartedAt, activeLiveMatchStatus]);

  useEffect(() => {
    if (
      !activeLiveMatchId ||
      activeLiveMatchStatus !== "live" ||
      !activeLiveMatchStartedAt
    ) {
      return;
    }

    setLiveClockNow(Date.now());
    const intervalId = window.setInterval(() => {
      setLiveClockNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeLiveMatchId, activeLiveMatchStartedAt, activeLiveMatchStatus]);

  useEffect(() => {
    if (!activeLiveMatchId || !activeLiveRuntime?.running || activeLiveRuntime.startedAt === null) {
      return;
    }

    const liveMatchId = activeLiveMatchId;
    const startedAt = activeLiveRuntime.startedAt;
    const intervalId = window.setInterval(() => {
      setLiveRuntimeByMatch((current) => {
        const runtime = current[liveMatchId];
        if (!runtime?.running || runtime.startedAt !== startedAt) {
          return current;
        }

        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        if (runtime.elapsedSeconds === elapsedSeconds) {
          return current;
        }

        return {
          ...current,
          [liveMatchId]: {
            ...runtime,
            elapsedSeconds,
          },
        };
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeLiveMatchId, activeLiveRuntime?.running, activeLiveRuntime?.startedAt]);

  useEffect(() => {
    const feedbackTimeouts = goalFeedbackTimeoutRef.current;
    return () => {
      Object.values(feedbackTimeouts).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
    };
  }, []);

  const launchLiveMatch = (match: TournamentProductScheduleMatch) => {
    const liveSlot =
      groupedScheduleSlots.find((slot) => slot.matches.some((slotMatch) => slotMatch.id === match.id)) ??
      null;
    const slotMatches = liveSlot?.matches ?? [match];
    const driverMatch = slotMatches[0] ?? match;
    const startedAt = new Date().toISOString();
    const startedAtTime = Date.parse(startedAt);
    const slotMatchIds = new Set(slotMatches.map((slotMatch) => slotMatch.id));

    setLiveClockNow(Date.now());
    setSelectedLiveMatchId(driverMatch.id);
    setLivePickerMode(null);
    setLivePickerMatchId(null);
    setDraft((current) => ({
      ...current,
      liveMatchId: driverMatch.id,
      status: "live",
      updatedAt: new Date().toISOString(),
    }));
    setLiveRuntimeByMatch((current) => {
      const next: Record<string, LiveRuntime> = {};
      Object.entries(current).forEach(([id, runtime]) => {
        next[id] = runtime.running
          ? { ...runtime, running: false, elapsedSeconds: runtime.startedAt ? Math.max(0, Math.floor((Date.now() - runtime.startedAt) / 1000)) : runtime.elapsedSeconds, startedAt: null }
          : runtime;
      });

      next[driverMatch.id] = {
        elapsedSeconds: 0,
        running: true,
        startedAt: startedAtTime,
      };

      return next;
    });
    realMatches.forEach((realMatch) => {
      if (slotMatchIds.has(realMatch.id)) return;
      const state = draft.matchStates?.[realMatch.id] ?? getDefaultMatchState();
      if (getMatchDisplayState(state) !== "live") return;
      updateMatchState(realMatch.id, {
        status: "idle",
        startedAt: null,
        completedAt: null,
      });
    });
    slotMatches.forEach((slotMatch) => {
      updateMatchState(slotMatch.id, {
        status: "live",
        startedAt,
        completedAt: null,
      });
    });
  };

  const pauseLiveMatch = (match: TournamentProductScheduleMatch) => {
    const liveSlot =
      groupedScheduleSlots.find((slot) => slot.matches.some((slotMatch) => slotMatch.id === match.id)) ??
      null;
    const slotMatches = liveSlot?.matches ?? [match];
    const driverMatch = liveSlot?.matches[0] ?? match;
    const runtime = getLiveRuntime(driverMatch.id);
    setLiveRuntimeByMatch((current) => ({
      ...current,
      [driverMatch.id]: {
        elapsedSeconds:
          runtime.running && runtime.startedAt !== null
            ? Math.max(0, Math.floor((Date.now() - runtime.startedAt) / 1000))
            : runtime.elapsedSeconds,
        running: false,
        startedAt: null,
      },
    }));
    slotMatches.forEach((slotMatch) => {
      updateMatchState(slotMatch.id, {
        status: "idle",
        startedAt: null,
        completedAt: null,
      });
    });
  };

  const finishLiveMatch = (match: TournamentProductScheduleMatch) => {
    const liveSlot =
      groupedScheduleSlots.find((slot) => slot.matches.some((slotMatch) => slotMatch.id === match.id)) ??
      null;
    const slotMatches = liveSlot?.matches ?? [match];
    const driverMatch = slotMatches[0] ?? match;
    const driverRuntime = getLiveRuntime(driverMatch.id);
    setLiveRuntimeByMatch((current) => ({
      ...current,
      [driverMatch.id]: {
        elapsedSeconds:
          driverRuntime.running && driverRuntime.startedAt !== null
            ? Math.max(0, Math.floor((Date.now() - driverRuntime.startedAt) / 1000))
            : driverRuntime.elapsedSeconds,
        running: false,
        startedAt: null,
      },
    }));
    setDraft((current) => ({
      ...current,
      liveMatchId: current.liveMatchId === driverMatch.id ? null : current.liveMatchId,
      updatedAt: new Date().toISOString(),
    }));
    const completedAt = new Date().toISOString();
    slotMatches.forEach((slotMatch) => {
      const state = draft.matchStates?.[slotMatch.id] ?? getDefaultMatchState();
      updateMatchState(slotMatch.id, {
        status: "completed",
        homeScore: state.homeScore ?? 0,
        awayScore: state.awayScore ?? 0,
        startedAt: state.startedAt ?? completedAt,
        completedAt,
      });
    });
    setLivePickerMode(null);
    setLivePickerMatchId(null);
    const pendingPenaltyIds = slotMatches
      .filter((slotMatch) => {
        const state = draft.matchStates?.[slotMatch.id] ?? getDefaultMatchState();
        return isPenaltyEligibleMatch(slotMatch) && (state.homeScore ?? 0) === (state.awayScore ?? 0);
      })
      .map((slotMatch) => slotMatch.id);

    if (pendingPenaltyIds.length > 0) {
      setPendingReviewSlotMatchIds(slotMatches.map((slotMatch) => slotMatch.id));
      setPendingPenaltySlotMatchIds(pendingPenaltyIds);
      setActivePenaltyMatchId(null);
      setLivePenaltyTeamByMatch((current) => {
        const next = { ...current };
        pendingPenaltyIds.forEach((matchId) => {
          next[matchId] = "home";
        });
        return next;
      });
      setCompletedLiveSlotMatchIds(null);
      return;
    }

    setCompletedLiveSlotMatchIds(slotMatches.map((slotMatch) => slotMatch.id));
  };

  const requestFinishLiveMatch = (
    match: TournamentProductScheduleMatch,
    options?: { redirectToLive?: boolean },
  ) => {
    const targetMatch = realMatches.find((entry) => entry.id === match.id) ?? match;

    if (options?.redirectToLive) {
      setSelectedLiveMatchId(targetMatch.id);
      setActiveTab("live");
    }

    finishLiveMatch(targetMatch);
  };

  const resetTournamentLive = useCallback(async () => {
    if (!isOrganizerView || isResettingTournament) return;

    setIsResettingTournament(true);
    setResetConfirmOpen(false);
    console.log("RESET LIVE START", {
      tournamentId: draft.id,
      matchCount: realMatches.length,
    });

    Object.values(goalFeedbackTimeoutRef.current).forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    goalFeedbackTimeoutRef.current = {};

    Object.values(penaltyFeedbackTimeoutRef.current).forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    penaltyFeedbackTimeoutRef.current = {};
    pendingLocalMatchSyncRef.current = {};

    setLiveClockNow(0);
    setVoteWindowNow(Date.now());
    setSelectedLiveMatchId(realMatches[0]?.id ?? null);
    setLiveRuntimeByMatch({});
    setLiveScorersByMatch({});
    setLivePickerMode(null);
    setLivePickerMatchId(null);
    setExpandedLiveStatsMatchId(null);
    setCompletedLiveSlotMatchIds(null);
    setPendingReviewSlotMatchIds(null);
    setPendingPenaltySlotMatchIds(null);
    setActivePenaltyMatchId(null);
    setPenaltyStepByMatch({});
    setRecentPenaltyFeedbackByMatch({});
    setLivePenaltyTeamByMatch({});
    setLiveReviewTeamByMatch({});
    setLiveReviewNumberByMatch({});
    setLivePenaltyNumberByMatch({});
    setScoreEditorMatchId(null);
    setScoreEditorHomeValue("");
    setScoreEditorAwayValue("");
    setMandatoryMvpWarning(false);
    setRecentGoalByMatch({});
    setLastGoalTeamByMatch({});

    const updatedAt = new Date().toISOString();
    const resetMatchStates = Object.fromEntries(
      realMatches.map((match) => [
        match.id,
        {
          ...getDefaultMatchState(),
          startedAt: null,
          completedAt: null,
          mvp: undefined,
          mvpVotes: [],
          penaltyShootout: undefined,
          notes: undefined,
        } satisfies TournamentProductMatchState,
      ]),
    ) as Record<string, TournamentProductMatchState>;

    const nextTournament = normalizeTournamentWorkspaceDraft({
      ...draft,
      liveMatchId: null,
      status: draft.status === "finished" || draft.status === "live" ? "published" : (draft.status ?? "draft"),
      updatedAt,
      matchStates: resetMatchStates,
    });

    const resetServerStates = Object.fromEntries(
      realMatches.map((match) => [
        match.id,
        {
          homeScore: null,
          awayScore: null,
          status: "idle" as const,
          startedAt: null,
          completedAt: null,
          goalEvents: [],
        } satisfies SyncedMatchState,
      ]),
    ) as Record<string, SyncedMatchState>;

    pendingLocalMatchSyncRef.current = { ...resetServerStates };

    setDraft(nextTournament);
    lastSavedSnapshotRef.current = JSON.stringify(nextTournament);

    void (async () => {
      try {
        await saveTournamentMatchesLiveStates(nextTournament.id, realMatches, resetServerStates);
        await Promise.resolve(latestOnSaveRef.current(nextTournament));
        await replaceTournament(nextTournament);
        console.log("RESET LIVE END", {
          tournamentId: nextTournament.id,
          firstMatchId: realMatches[0]?.id ?? null,
        });
      } catch (error) {
        pendingLocalMatchSyncRef.current = {};
        console.error("Erreur reset tournoi:", error);
      } finally {
        setIsResettingTournament(false);
      }
    })();
  }, [draft, isOrganizerView, isResettingTournament, realMatches]);

  const openGoalPicker = (match: TournamentProductScheduleMatch) => {
    setLivePickerMode("scorer");
    setLivePickerTeam(lastGoalTeamByMatch[match.id] ?? "home");
    setLivePickerMatchId(match.id);
  };

  const castMvpVote = (matchId: string, team: LivePickerTeam, number: number) => {
    const match = realMatches.find((entry) => entry.id === matchId);
    if (match && !canVoteForMatchSide(match, team)) return;

    const state = draft.matchStates?.[matchId] ?? getDefaultMatchState();
    if (match && !canCurrentUserVoteMatch(match, state)) {
      return;
    }

    const voterKey = getVoteVoterKey();
    const vote: MvpVote = {
      id: `${voterKey}:${matchId}`,
      role: voteRole,
      weight: getVoteWeight(voteRole),
      team,
      number,
      voterTeamId: publicVoterTeamId,
      createdAt: new Date().toISOString(),
    };
    updateDraft((current) => {
      const currentState = current.matchStates?.[matchId] ?? getDefaultMatchState();
      const nextVotes = mergeMvpVotes(
        (currentState.mvpVotes ?? []).filter((entry) => entry.id !== vote.id),
        [vote],
      );
      const nextWeightedMvp = getWeightedMvp({
        ...currentState,
        mvpVotes: nextVotes,
      });

      return {
        ...current,
        updatedAt: new Date().toISOString(),
        matchStates: {
          ...(current.matchStates ?? {}),
          [matchId]: {
            ...currentState,
            mvpVotes: nextVotes,
            mvp: nextWeightedMvp
              ? {
                  team: nextWeightedMvp.team,
                  number: nextWeightedMvp.number,
                }
              : currentState.mvp,
          },
        },
      };
    });
    if (!isOrganizerView && publicVoterTeamId) {
      setParentVoteSession((current) =>
        isParentView && current?.teamId === publicVoterTeamId
          ? {
              ...current,
              votedMatchIds: Array.from(new Set([...current.votedMatchIds, matchId])),
            }
          : current,
      );
    }
    setMandatoryMvpWarning(false);
  };
  const getReviewVoteSelection = (
    match: TournamentProductScheduleMatch,
    state: TournamentProductMatchState,
  ) => {
    const selectedMvp = isOrganizerView ? getWeightedMvp(state) : null;
    const allowedVoteSides = getAllowedVoteSides(match);
    const requestedSelectedTeam =
      liveReviewTeamByMatch[match.id] ?? selectedMvp?.team ?? allowedVoteSides[0] ?? "home";
    const selectedTeam = allowedVoteSides.includes(requestedSelectedTeam)
      ? requestedSelectedTeam
      : allowedVoteSides[0] ?? null;
    const selectedNumberValue = liveReviewNumberByMatch[match.id] ?? "";
    const parsedNumber = Number(selectedNumberValue);

    if (!selectedTeam || !Number.isInteger(parsedNumber) || parsedNumber < 1 || parsedNumber > 15) {
      return null;
    }

    return {
      team: selectedTeam,
      number: parsedNumber,
    };
  };
  const commitPendingAdminMvpVotes = (matches: TournamentProductScheduleMatch[]) => {
    if (!isOrganizerView) return [] as TournamentProductScheduleMatch[];

    const missingMatches: TournamentProductScheduleMatch[] = [];

    matches.forEach((match) => {
      const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
      if (getMatchDisplayState(state) !== "completed" || hasAdminMvpVote(state)) return;

      const selection = getReviewVoteSelection(match, state);
      if (!selection) {
        missingMatches.push(match);
        return;
      }

      castMvpVote(match.id, selection.team, selection.number);
    });

    return missingMatches;
  };
  const hasAdminMvpVote = (state: TournamentProductMatchState) =>
    (state.mvpVotes ?? []).some((vote) => vote.role === "admin");
  const getMissingAdminMvpVoteMatches = () =>
    completedLiveReviewMatches.filter((match) => {
      const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
      return getMatchDisplayState(state) === "completed" && !hasAdminMvpVote(state);
    });
  const hasMissingAdminMvpVote = () =>
    isOrganizerView && getMissingAdminMvpVoteMatches().length > 0;
  const closeCompletedReview = () => {
    const pendingMissingMatches = commitPendingAdminMvpVotes(completedLiveReviewMatches);
    if (pendingMissingMatches.length > 0 || hasMissingAdminMvpVote()) {
      setMandatoryMvpWarning(true);
      return;
    }

    setMandatoryMvpWarning(false);
    setCompletedLiveSlotMatchIds(null);
  };
  const goToNextMatchAfterReview = () => {
    const pendingMissingMatches = commitPendingAdminMvpVotes(completedLiveReviewMatches);
    if (pendingMissingMatches.length > 0 || hasMissingAdminMvpVote()) {
      setMandatoryMvpWarning(true);
      return;
    }

    setMandatoryMvpWarning(false);
    setCompletedLiveSlotMatchIds(null);
    setPendingReviewSlotMatchIds(null);
    setPendingPenaltySlotMatchIds(null);
    if (nextLiveSlotAfterReview?.matches[0]) {
      setSelectedLiveMatchId(nextLiveSlotAfterReview.matches[0].id);
    }
  };
  const getPublicMvpVoteWindowState = useCallback((state: TournamentProductMatchState) => {
    if (getMatchDisplayState(state) !== "completed") return "locked";
    if (!state.completedAt) return "closed";

    const completedAtTime = Date.parse(state.completedAt);
    if (!Number.isFinite(completedAtTime)) return "closed";

    return voteWindowNow - completedAtTime <= PUBLIC_MVP_VOTE_WINDOW_MS ? "open" : "closed";
  }, [voteWindowNow]);
  const getPublicMvpVoteSecondsLeft = useCallback((state: TournamentProductMatchState) => {
    if (!state.completedAt || getPublicMvpVoteWindowState(state) !== "open") return 0;

    const completedAtTime = Date.parse(state.completedAt);
    if (!Number.isFinite(completedAtTime)) return 0;

    return Math.max(
      0,
      Math.ceil((PUBLIC_MVP_VOTE_WINDOW_MS - (voteWindowNow - completedAtTime)) / 1000),
    );
  }, [getPublicMvpVoteWindowState, voteWindowNow]);
  const canCurrentUserVoteMatch = useCallback(
    (match: TournamentProductScheduleMatch, state: TournamentProductMatchState) => {
      if (isOrganizerView) return getMatchDisplayState(state) === "completed";
      if (!publicVoterTeamId) return false;
      if (getPublicMvpVoteWindowState(state) !== "open") return false;
      if (hasCurrentUserVotedMatch(state, match.id)) return false;
      return getAllowedVoteSides(match).length > 0;
    },
    [getAllowedVoteSides, getPublicMvpVoteWindowState, hasCurrentUserVotedMatch, isOrganizerView, publicVoterTeamId],
  );
  const openPublicMvpVoteForMatches = (matches: TournamentProductScheduleMatch[]) => {
    const eligibleMatchIds = matches
      .filter((match) => {
        const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
        return canCurrentUserVoteMatch(match, state);
      })
      .map((match) => match.id);

    if (eligibleMatchIds.length === 0) return;

    setCompletedLiveSlotMatchIds(eligibleMatchIds);
    setMandatoryMvpWarning(false);
  };
  const openPublicMvpVoteForMatch = (match: TournamentProductScheduleMatch) => {
    openPublicMvpVoteForMatches([match]);
  };
  const publicPendingVoteMatches = useMemo(
    () =>
      !isOrganizerView
        ? realMatches
            .map((match) => ({
              match,
              state: draft.matchStates?.[match.id] ?? getDefaultMatchState(),
            }))
            .filter(({ match, state }) => canCurrentUserVoteMatch(match, state))
            .sort((left, right) => {
              const leftCompletedAt = Date.parse(left.state.completedAt ?? "");
              const rightCompletedAt = Date.parse(right.state.completedAt ?? "");
              if (Number.isFinite(leftCompletedAt) && Number.isFinite(rightCompletedAt)) {
                return rightCompletedAt - leftCompletedAt;
              }
              return right.match.startTime.localeCompare(left.match.startTime, "fr");
            })
        : [],
    [canCurrentUserVoteMatch, draft.matchStates, isOrganizerView, realMatches],
  );
  const publicFloatingVoteMatch = publicPendingVoteMatches[0]?.match ?? null;
  const publicFloatingVoteState = publicPendingVoteMatches[0]?.state ?? null;
  const publicFloatingVoteSecondsLeft = publicFloatingVoteState
    ? getPublicMvpVoteSecondsLeft(publicFloatingVoteState)
    : 0;
  const shouldShowPublicFloatingVote = Boolean(publicFloatingVoteMatch) && (
    activeTab !== "live" ||
    !livePrimaryMatch ||
    publicFloatingVoteMatch?.id !== livePrimaryMatch.id
  );
  const matchesAutoScrollTargetId = currentLiveMatch?.id ?? currentSlot?.matches[0]?.id ?? null;
  const matchesAutoScrollSlotKey = currentSlot?.key ?? null;
  useEffect(() => {
    if (!publicFloatingVoteMatch) return;

    setVoteWindowNow(Date.now());
    const intervalId = window.setInterval(() => {
      setVoteWindowNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [publicFloatingVoteMatch]);
  useEffect(() => {
    if (activeTab !== "matches") return;

    const targetMatchId = matchesAutoScrollTargetId;
    if (!targetMatchId) return;

    const targetRow = matchRowRefs.current[targetMatchId];
    if (!targetRow) return;

    const timeoutId = window.setTimeout(() => {
      targetRow.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, matchesAutoScrollSlotKey, matchesAutoScrollTargetId]);
  const commitLiveReviewNumber = (matchId: string, team: LivePickerTeam, rawValue: string) => {
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 15) return;
    castMvpVote(matchId, team, parsed);
    setLiveReviewNumberByMatch((current) => ({
      ...current,
      [matchId]: String(parsed),
    }));
  };

  const recordPenaltyAttempt = (
    match: TournamentProductScheduleMatch,
    scored: boolean,
  ) => {
    const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
    const rawNumber = livePenaltyNumberByMatch[match.id] ?? "";
    const parsedNumber = Number(rawNumber);
    if (!Number.isInteger(parsedNumber) || parsedNumber < 1 || parsedNumber > 15) {
      return;
    }

    const targetAttempts = getPenaltyTargetAttempts(state, draft.penaltyShooters ?? 5);
    const currentShootout = state.penaltyShootout ?? { targetAttempts, events: [], winner: null };
    const nextTeam = livePenaltyTeamByMatch[match.id] ?? getNextPenaltyTeam(currentShootout);
    const nextEvents = [
      ...currentShootout.events,
      {
        team: nextTeam,
        number: parsedNumber,
        scored,
        order: currentShootout.events.length + 1,
        },
    ];
    const winner = getPenaltyWinnerFromEvents(nextEvents, targetAttempts);

    updateMatchState(match.id, {
      penaltyShootout: {
        targetAttempts,
        events: nextEvents,
        winner,
      },
    });

    const latestOrder = nextEvents.length;
    setRecentPenaltyFeedbackByMatch((current) => ({
      ...current,
      [match.id]: {
        order: latestOrder,
        scored,
      },
    }));
    const existingPenaltyTimeout = penaltyFeedbackTimeoutRef.current[match.id];
    if (existingPenaltyTimeout) {
      window.clearTimeout(existingPenaltyTimeout);
    }
    penaltyFeedbackTimeoutRef.current[match.id] = window.setTimeout(() => {
      setRecentPenaltyFeedbackByMatch((current) => {
        const next = { ...current };
        delete next[match.id];
        return next;
      });
      delete penaltyFeedbackTimeoutRef.current[match.id];
    }, 1500);

    setLivePenaltyNumberByMatch((current) => ({
      ...current,
      [match.id]: "",
    }));
    setLivePenaltyTeamByMatch((current) => ({
      ...current,
      [match.id]: nextTeam === "home" ? "away" : "home",
    }));
    setPenaltyStepByMatch((current) => ({
      ...current,
      [match.id]: winner ? "attempt" : "attempt",
    }));
  };

  const applyLiveSelection = (
    match: TournamentProductScheduleMatch,
    number: number,
  ) => {
    if (livePickerMode === null) return;

    if (livePickerMode === "scorer") {
      const driverRuntime = getLiveRuntime(livePrimaryMatch?.id ?? match.id);
      addGoalAtomic(match.id, livePickerTeam, {
        number,
        elapsedSeconds: driverRuntime.elapsedSeconds,
      });
      setLastGoalTeamByMatch((current) => ({
        ...current,
        [match.id]: livePickerTeam,
      }));
      setRecentGoalByMatch((current) => ({
        ...current,
        [match.id]: {
          team: livePickerTeam,
          number,
        },
      }));
      const existingTimeout = goalFeedbackTimeoutRef.current[match.id];
      if (existingTimeout) {
        window.clearTimeout(existingTimeout);
      }
      goalFeedbackTimeoutRef.current[match.id] = window.setTimeout(() => {
        setRecentGoalByMatch((current) => {
          const next = { ...current };
          delete next[match.id];
          return next;
        });
        delete goalFeedbackTimeoutRef.current[match.id];
      }, 1500);
    }

    setLivePickerMode(null);
    setLivePickerMatchId(null);
  };

  const promptReviewScoreEdit = (match: TournamentProductScheduleMatch) => {
    const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
    setScoreEditorMatchId(match.id);
    setScoreEditorHomeValue(String(state.homeScore ?? 0));
    setScoreEditorAwayValue(String(state.awayScore ?? 0));
  };
  const commitReviewScoreEdit = () => {
    if (!scoreEditorMatchId) return;
    const state = draft.matchStates?.[scoreEditorMatchId] ?? getDefaultMatchState();
    const nextHome = Number(scoreEditorHomeValue);
    const nextAway = Number(scoreEditorAwayValue);
    if (!Number.isInteger(nextHome) || !Number.isInteger(nextAway) || nextHome < 0 || nextAway < 0) {
      return;
    }

    updateMatchState(scoreEditorMatchId, {
      homeScore: nextHome,
      awayScore: nextAway,
      status: state.status,
      penaltyShootout: nextHome === nextAway ? state.penaltyShootout : undefined,
      mvp: state.mvp,
      mvpVotes: state.mvpVotes,
      completedAt: state.completedAt,
      notes: state.notes,
    });
    setScoreEditorMatchId(null);
  };

  const closePendingPenaltyFlow = () => {
    setActivePenaltyMatchId(null);
    setPendingPenaltySlotMatchIds(null);
    setPendingReviewSlotMatchIds(null);
  };

  const openPenaltyEditor = (matchIds: string[]) => {
    const nextId = matchIds.length > 1 ? ALL_PENALTY_MATCHES_KEY : (matchIds[0] ?? null);
    if (!nextId) return;
    setActivePenaltyMatchId(nextId);
    setLivePenaltyTeamByMatch((current) => {
      const next = { ...current };
      matchIds.forEach((matchId) => {
        next[matchId] = next[matchId] ?? "home";
      });
      return next;
    });
    setPenaltyStepByMatch((current) => {
      const next = { ...current };
      matchIds.forEach((matchId) => {
        next[matchId] = "setup";
      });
      return next;
    });
  };

  const commitPenaltyReview = () => {
    if (!pendingReviewSlotMatchIds) return;
    const targetMatches = activePenaltyEditorMatches;
    if (
      targetMatches.length === 0 ||
      targetMatches.some((match) => {
        const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
        return !getResolvedKnockoutOutcome(state);
      })
    ) {
      return;
    }

    const resolvedAll = (pendingPenaltySlotMatchIds ?? []).every((matchId) => {
      const targetState = draft.matchStates?.[matchId] ?? getDefaultMatchState();
      return getResolvedKnockoutOutcome(targetState) !== null;
    });

    setActivePenaltyMatchId(null);

    if (!resolvedAll) {
      return;
    }

    setCompletedLiveSlotMatchIds(pendingReviewSlotMatchIds);
    setPendingPenaltySlotMatchIds(null);
    setPendingReviewSlotMatchIds(null);
  };

  const undoLastGoal = (match: TournamentProductScheduleMatch) => {
    const events = liveScorersByMatch[match.id] ?? [];
    const lastEvent = events.at(-1);
    if (!lastEvent) return;
    const nextGoalEvents = events.slice(0, -1);

    const existingTimeout = goalFeedbackTimeoutRef.current[match.id];
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
      delete goalFeedbackTimeoutRef.current[match.id];
    }
    setRecentGoalByMatch((current) => {
      const next = { ...current };
      delete next[match.id];
      return next;
    });

    setLiveScorersByMatch((current) => ({
      ...current,
      [match.id]: nextGoalEvents,
    }));

    updateMatchState(
      match.id,
      (previous) => ({
        ...previous,
        status: previous.status,
        homeScore:
          lastEvent.team === "home"
            ? Math.max(0, (previous.homeScore ?? 0) - 1)
            : (previous.homeScore ?? 0),
        awayScore:
          lastEvent.team === "away"
            ? Math.max(0, (previous.awayScore ?? 0) - 1)
            : (previous.awayScore ?? 0),
      }),
      nextGoalEvents,
    );
  };
  const footerMeta = [
    STATUS_OPTIONS.find((option) => option.value === (draft.status ?? "draft"))?.label ?? "Brouillon",
    `${draft.teams.length} équipes`,
    `${draft.fieldCount} terrains`,
    formatDate(draft.date),
  ].filter(Boolean);
const renderCompactTeam = (
  teamName: string,
  logoSide: "left" | "right",
  isWinner = false,
) => (
  <div
    className={[
      "grid min-w-0 items-center",
      logoSide === "right"
        ? "grid-cols-[minmax(0,1fr)_auto_auto] justify-items-end text-right"
        : "grid-cols-[auto_auto_minmax(0,1fr)] justify-items-start text-left",
    ].join(" ")}
  >
    {logoSide === "left" ? (
      <span className="mr-2.5">{renderTeamBadge(teamName)}</span>
    ) : null}
    {logoSide === "left" ? (
      <span className="mr-2 inline-flex h-2.5 w-2.5 items-center justify-center justify-self-center">
        {isWinner ? (
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.42)]" />
        ) : null}
      </span>
    ) : null}
    <span className={TEAM_NAME_BLOCK_CLASS}>{teamName}</span>
    {logoSide === "right" ? (
      <span className="ml-2 inline-flex h-2.5 w-2.5 items-center justify-center justify-self-center">
        {isWinner ? (
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.42)]" />
        ) : null}
      </span>
    ) : null}
    {logoSide === "right" ? <span className="ml-2.5">{renderTeamBadge(teamName)}</span> : null}
  </div>
);

  const renderCompactReadOnlyMatchRow = (
    match: TournamentProductScheduleMatch,
    state: TournamentProductMatchState,
    timeTone: "auto" | "live" | "next" | "past" = "auto",
    showStatusBadge = false,
    layoutMode: "auto" | "overview" = "auto",
  ) => {
    const { homeTeam: displayHomeTeam, awayTeam: displayAwayTeam } = getDisplayMatchTeams(match, state);
    const phaseLabel = getCompactRoundLabel(match);
    const isPoolPhaseLabel = /^poule\b/i.test(phaseLabel);
    const displayState = getMatchDisplayState(state);
    const resolvedTimeTone =
      timeTone === "auto"
        ? displayState === "live"
          ? "live"
          : displayState === "completed"
            ? "past"
            : "next"
        : timeTone;
    const timeClassName =
      resolvedTimeTone === "live"
        ? "text-sm font-semibold text-[#22C55E] [text-shadow:0_0_6px_rgba(34,197,94,0.5)]"
        : resolvedTimeTone === "past"
          ? "text-sm font-medium text-white/40"
          : "text-sm font-medium text-white/80";
    const showLiveClock = false;
    const timeLabel = match.startTime;
    const statusBadge = MATCH_STATUS_BADGES[displayState];
    const shouldShowScore =
      displayState === "live" ||
      displayState === "completed" ||
      state.homeScore !== null ||
      state.awayScore !== null;
    const shouldShowCenterScore = shouldShowScore;
    const scorerCount = liveScorersByMatch[match.id]?.length ?? 0;
    const hasPenaltyDecision =
      (state.penaltyShootout?.events.length ?? 0) > 0 ||
      state.penaltyShootout?.winner === "home" ||
      state.penaltyShootout?.winner === "away";
    const penaltyOutcome = hasPenaltyDecision ? getResolvedKnockoutOutcome(state) : null;
    const penaltyScore = getPenaltyShootoutScore(state.penaltyShootout);
    const penaltyWinnerTeam = hasPenaltyDecision ? penaltyOutcome?.winner ?? null : null;
    const regularWinnerTeam =
      !hasPenaltyDecision &&
      state.homeScore !== null &&
      state.awayScore !== null &&
      state.homeScore !== state.awayScore
        ? state.homeScore > state.awayScore
          ? "home"
          : "away"
        : null;
    const winnerTeam = penaltyWinnerTeam ?? regularWinnerTeam;
    const scorerIndicator =
      scorerCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpandedLiveStatsMatchId(match.id)}
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-semibold text-white/80 backdrop-blur-[8px] transition hover:bg-white/[0.08] hover:text-white"
          aria-label="Voir les buteurs"
        >
          <span className="text-[11px] leading-none">⚽</span>
          <span className="tabular-nums">{scorerCount}</span>
        </button>
      ) : null;
    const divisionBadgeLabel = isPoolPhaseLabel
      ? [match.divisionName, phaseLabel].filter(Boolean).join(" • ")
      : match.divisionName;
    const divisionBadge = divisionBadgeLabel ? (
      <span
        className={[
          "inline-flex items-center rounded-full border font-semibold uppercase",
          layoutMode === "overview"
            ? "px-2 py-0.5 text-[8px] tracking-[0.1em] opacity-85"
            : "px-2.5 py-1 text-[10px] tracking-[0.12em]",
          getDivisionBadgeClasses(match.divisionName ?? divisionBadgeLabel),
        ].join(" ")}
      >
        {divisionBadgeLabel}
      </span>
    ) : null;
    const mobileLayoutClassName =
      layoutMode === "overview" ? "space-y-3 2xl:hidden" : "space-y-3 md:hidden";
    const desktopLayoutClassName =
      layoutMode === "overview"
        ? "hidden min-w-0 grid-cols-[10rem_minmax(0,1fr)_10rem] items-center gap-4 2xl:grid"
        : "hidden min-w-0 grid-cols-[10rem_minmax(0,1fr)_10rem] items-center gap-4 md:grid lg:grid-cols-[10.5rem_minmax(0,1fr)_10.5rem]";

    return (
      <>
        <div className={mobileLayoutClassName}>
          <div className="flex min-w-0 flex-col gap-1.5 text-left">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/95">
              {match.fieldLabel}
            </span>
            {layoutMode === "overview" ? null : divisionBadge}
            {!isPoolPhaseLabel ? (
              <span className="text-[11px] font-medium text-white/45">{phaseLabel}</span>
            ) : null}
          </div>
          <div className="mx-auto grid min-w-0 w-full max-w-[19.5rem] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center justify-center gap-2">
            <div className="flex min-w-0 items-center justify-end pr-1">
              {renderCompactTeam(displayHomeTeam, "right", winnerTeam === "home")}
            </div>
            {shouldShowCenterScore ? (
              <div className="relative flex items-center justify-center">
                <span className="inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-sm font-semibold text-white backdrop-blur-[8px]">
                  {(state.homeScore ?? 0)} - {(state.awayScore ?? 0)}
                </span>
                {penaltyWinnerTeam ? (
                  <span className="pointer-events-none absolute left-1/2 top-[calc(100%+2px)] -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-200/90">
                    P ({penaltyScore.homeScore} - {penaltyScore.awayScore})
                  </span>
                ) : null}
              </div>
            ) : (
              <span
                className="inline-flex shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#111] shadow-[0_0_12px_rgba(250,204,21,0.4)]"
                style={{ background: "linear-gradient(135deg, #FDE047, #FACC15)" }}
              >
                VS
              </span>
            )}
            <div className="flex min-w-0 items-center justify-start pl-1">
              {renderCompactTeam(displayAwayTeam, "left", winnerTeam === "away")}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">{layoutMode === "overview" ? divisionBadge : null}</div>
            <div className="flex shrink-0 items-center justify-end gap-2">
            {shouldShowScore && !shouldShowCenterScore ? (
              <span className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-sm font-semibold text-white backdrop-blur-[8px]">
                {(state.homeScore ?? 0)} - {(state.awayScore ?? 0)}
              </span>
            ) : null}
            {scorerIndicator}
            <span className={["inline-flex shrink-0 items-center gap-1.5", timeClassName].join(" ")}>
              {showLiveClock ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 7.5v5l3 2" />
                </svg>
              ) : null}
              <span>{timeLabel}</span>
            </span>
            {resolvedTimeTone === "live" ? (
              <span className="ml-1 inline-flex h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
            ) : null}
            {showStatusBadge ? (
              <span
                className={[
                  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium",
                  statusBadge.className,
                ].join(" ")}
              >
                <span className={["inline-flex h-1.5 w-1.5 rounded-full", statusBadge.dotClassName].join(" ")} />
                {statusBadge.label}
              </span>
            ) : null}
            </div>
          </div>
        </div>

        <div className={desktopLayoutClassName}>
          <div className="flex min-w-0 flex-col items-start gap-1.5 text-left">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/95">
              {match.fieldLabel}
            </span>
            {layoutMode === "overview" ? null : divisionBadge}
            {!isPoolPhaseLabel ? (
              <span className="text-[11px] font-medium text-white/45">{phaseLabel}</span>
            ) : null}
          </div>

          <div className="flex min-w-0 items-center justify-center">
            <div className="grid min-w-0 grid-cols-[minmax(0,210px)_auto_minmax(0,210px)] items-center justify-center gap-2 lg:gap-3">
              <div className="flex min-w-0 items-center justify-end">
                {renderCompactTeam(displayHomeTeam, "right", winnerTeam === "home")}
              </div>
              {shouldShowCenterScore ? (
                <div className="relative flex items-center justify-center">
                  <span className="inline-flex h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-2.5 text-sm font-semibold text-white backdrop-blur-[8px]">
                    {(state.homeScore ?? 0)} - {(state.awayScore ?? 0)}
                  </span>
                  {penaltyWinnerTeam ? (
                    <span className="pointer-events-none absolute left-1/2 top-[calc(100%+2px)] -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-200/90">
                      P ({penaltyScore.homeScore} - {penaltyScore.awayScore})
                    </span>
                  ) : null}
                </div>
              ) : (
                <span
                  className="inline-flex h-6 shrink-0 items-center justify-center rounded-full px-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#111] shadow-[0_0_12px_rgba(250,204,21,0.4)]"
                  style={{ background: "linear-gradient(135deg, #FDE047, #FACC15)" }}
                >
                  VS
                </span>
              )}
              <div className="flex min-w-0 items-center justify-start">
                {renderCompactTeam(displayAwayTeam, "left", winnerTeam === "away")}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col items-end gap-2 text-right">
            {layoutMode === "overview" ? (
              <div className="self-start">{divisionBadge}</div>
            ) : null}
            <div className="flex min-w-0 items-center justify-end gap-2 text-right">
            {shouldShowScore && !shouldShowCenterScore ? (
              <span className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-sm font-semibold text-white backdrop-blur-[8px]">
                {(state.homeScore ?? 0)} - {(state.awayScore ?? 0)}
              </span>
            ) : null}
            {scorerIndicator}
            <span className={["inline-flex shrink-0 items-center gap-1.5", timeClassName].join(" ")}>
              {showLiveClock ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 7.5v5l3 2" />
                </svg>
              ) : null}
              <span>{timeLabel}</span>
            </span>
            {resolvedTimeTone === "live" ? (
              <span className="inline-flex h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
            ) : null}
            {showStatusBadge ? (
              <span
                className={[
                  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium",
                  statusBadge.className,
                ].join(" ")}
              >
                <span className={["inline-flex h-1.5 w-1.5 rounded-full", statusBadge.dotClassName].join(" ")} />
                {statusBadge.label}
              </span>
            ) : null}
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderMatchRow = (match: TournamentProductScheduleMatch) => {
    const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
    const competitionPath = getCompetitionPath(match);
    const phaseLabel = getPhaseLabel(match);
    const { homeTeam: displayHomeTeam, awayTeam: displayAwayTeam } = getDisplayMatchTeams(match, state);

    if (!editMode) {
      return (
        <div
          key={match.id}
          ref={(node) => {
            matchRowRefs.current[match.id] = node;
          }}
          className="mb-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-5 py-4 backdrop-blur-[8px] transition-all duration-200 ease-out hover:border-white/[0.1] hover:bg-white/[0.04]"
        >
          {renderCompactReadOnlyMatchRow(match, state, "auto", true, "overview")}
        </div>
      );
    }

    return (
      <div
        key={match.id}
        ref={(node) => {
          matchRowRefs.current[match.id] = node;
        }}
        className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 backdrop-blur-[8px] transition-all duration-200 ease-out hover:-translate-y-px hover:bg-white/[0.04] lg:grid-cols-[minmax(0,1fr)_10rem]"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span className="uppercase tracking-[0.18em] text-slate-500">{match.fieldLabel}</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold text-slate-200">
              {phaseLabel}
            </span>
            {competitionPath ? (
              <span
                className={[
                  "rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                  competitionPath === "UEFA"
                    ? "border border-sky-300/30 bg-sky-500/15 text-sky-100"
                    : "border border-emerald-300/30 bg-emerald-500/15 text-emerald-100",
                ].join(" ")}
              >
                {competitionPath}
              </span>
            ) : null}
            {match.leg ? (
              <span
                className={[
                  "rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                  match.leg === "aller"
                    ? "border border-sky-300/30 bg-sky-500/15 text-sky-100"
                    : "border border-amber-300/30 bg-amber-500/15 text-amber-100",
                ].join(" ")}
              >
                {match.leg === "aller" ? "ALLER" : "RETOUR"}
              </span>
            ) : null}
            {isTrueThirdPlace(match) ? (
              <span className="rounded-full border border-violet-300/30 bg-violet-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-violet-100">
                3e place
              </span>
            ) : null}
            <span>{match.roundLabel}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-white">
              {displayHomeTeam} <span className="text-slate-500">vs</span> {displayAwayTeam}
            </p>
            {(state.homeScore !== null || state.awayScore !== null) ? (
              <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-sm font-semibold text-slate-100">
                {(state.homeScore ?? 0)} - {(state.awayScore ?? 0)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2">
          <input
            type="time"
            value={match.startTime}
            onChange={(event) => {
              const nextStart = event.target.value;
              updateScheduleMatch(match.id, {
                startTime: nextStart,
                endTime: addMinutes(nextStart, getMatchDuration(match, draft.matchDuration)),
              });
            }}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
          />
          <select
            value={match.fieldLabel}
            onChange={(event) => updateScheduleMatch(match.id, { fieldLabel: event.target.value })}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
          >
            {Array.from({ length: Math.max(draft.fieldCount, 1) }, (_, index) => {
              const label = `Terrain ${index + 1}`;
              return (
                <option key={label} value={label}>
                  {label}
                </option>
              );
            })}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min="0"
              value={state.homeScore ?? ""}
              onChange={(event) =>
                updateMatchState(match.id, {
                  homeScore: event.target.value === "" ? null : Number(event.target.value),
                })
              }
              placeholder="Dom."
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
            />
            <input
              type="number"
              min="0"
              value={state.awayScore ?? ""}
              onChange={(event) =>
                updateMatchState(match.id, {
                  awayScore: event.target.value === "" ? null : Number(event.target.value),
                })
              }
              placeholder="Ext."
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
            />
          </div>
          <select
            value={state.status}
            onChange={(event) =>
              updateMatchState(match.id, {
                status: event.target.value as TournamentProductMatchState["status"],
              })
            }
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
          >
            {MATCH_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {phaseLabel === "Amical" ? (
            <button
              type="button"
              onClick={() => removeFriendlyMatch(match.id)}
              className="rounded-xl border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-rose-100 transition hover:bg-rose-500/20"
            >
              Retirer
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  const renderOverviewSlot = (
    title: string,
    slot: { startTime: string; matches: TournamentProductScheduleMatch[] } | null,
    emptyLabel: string,
  ) => {
    const liveMatchInSlot =
      title === "Match en cours" && slot
        ? slot.matches.find((match) =>
            getMatchDisplayState(draft.matchStates?.[match.id] ?? getDefaultMatchState()) === "live",
          ) ?? null
        : null;
    const liveMatchState = liveMatchInSlot
      ? draft.matchStates?.[liveMatchInSlot.id] ?? getDefaultMatchState()
      : null;
    const liveMatchRuntime = liveMatchInSlot ? getLiveRuntime(liveMatchInSlot.id) : null;
    const liveMatchStartedAtTime =
      liveMatchState?.startedAt ? Date.parse(liveMatchState.startedAt) : Number.NaN;
    const liveMatchElapsedSeconds =
      liveMatchInSlot && Number.isFinite(liveMatchStartedAtTime) && liveClockNow > 0
        ? Math.max(0, Math.floor((liveClockNow - liveMatchStartedAtTime) / 1000))
        : liveMatchRuntime?.elapsedSeconds ?? 0;
    const liveMatchCountdown = Math.max(0, draft.matchDuration * 60 - liveMatchElapsedSeconds);

    return (
    <section className="space-y-4 overflow-hidden rounded-[28px] border border-white/[0.06] bg-white/[0.015] p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-semibold text-white">{title}</p>
        {liveMatchInSlot ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-100 [text-shadow:0_0_6px_rgba(34,197,94,0.35)]">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5v5l3 2" />
            </svg>
            <span>{formatLiveDuration(liveMatchCountdown)}</span>
          </span>
        ) : null}
      </div>

      {slot ? (
        <div className="space-y-3">
          {slot.matches.map((match) => {
            const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();

            return (
              <div
                key={`overview-${match.id}`}
                className="mb-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3.5 py-4 backdrop-blur-[8px] transition-all duration-200 ease-out hover:border-white/[0.12] hover:bg-white/[0.05] md:px-4 xl:px-5"
              >
                {renderCompactReadOnlyMatchRow(
                  match,
                  state,
                  title === "Match en cours" ? "live" : title === "Match suivant" ? "next" : "auto",
                  false,
                  "overview",
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">{emptyLabel}</p>
      )}
    </section>
    );
  };

  const tabs: Array<{ key: TournamentWorkspaceTab; label: string }> = useMemo(
    () =>
      isOrganizerView
        ? [
            { key: "overview", label: "Vue d’ensemble" },
            { key: "share", label: "Partage" },
            { key: "live", label: "Pilotage match" },
            { key: "matches", label: "Matchs" },
            { key: "stats", label: "Stats" },
            { key: "teams", label: "Equipes" },
            { key: "pools", label: "Poules" },
            { key: "bracket", label: "Phases finales" },
            { key: "meals", label: "Repas" },
          ]
        : isCoachView
          ? [
              { key: "overview", label: "Vue générale" },
              { key: "pools", label: "Poules" },
              { key: "matches", label: "Matchs" },
              { key: "bracket", label: "Bracket" },
              { key: "live", label: "Direct" },
              { key: "stats", label: "Stats" },
              { key: "teams", label: "Équipe" },
              { key: "meals", label: "Repas" },
            ]
          : [
              { key: "overview", label: "Vue générale" },
              { key: "pools", label: "Poules" },
              { key: "matches", label: "Matchs" },
              { key: "bracket", label: "Bracket" },
              { key: "live", label: "Direct" },
              { key: "stats", label: "Stats" },
            ],
    [isCoachView, isOrganizerView],
  );
  const liveTournamentActive = !editMode && isOrganizerView;
  const renderPublicationBlockedState = () => (
    <section className="rounded-[28px] border border-white/10 bg-black/25 p-6 text-sm text-slate-300">
      <p className="text-lg font-semibold text-white">Tournoi non publié</p>
      <p className="mt-2 text-sm text-slate-400">
        Le tournoi n’est pas encore publié. Vous pouvez déjà compléter votre équipe et les repas.
      </p>
    </section>
  );

  useEffect(() => {
    if (tabs.some((tab) => tab.key === activeTab)) return;
    setActiveTab(tabs[0]?.key ?? "overview");
  }, [activeTab, tabs]);

  useEffect(() => {
    if (!isCoachView || !publicTournamentBlocked) return;
    if (activeTab === "teams" || activeTab === "meals") return;
    setActiveTab("teams");
  }, [activeTab, isCoachView, publicTournamentBlocked]);
  const livePreviewDataByDivision = useMemo(
    () =>
      (draft.manualPreviewDataByDivision ?? []).map((division) => ({
        ...division,
        data: {
          ...division.data,
          bracket: division.data.bracket.map((round) => ({
            ...round,
            matches: round.matches.map((match) => ({
              ...match,
              homeTeam: resolveSlot(match.homeSlot, match.homeTeam, division.id),
              awayTeam: resolveSlot(match.awaySlot, match.awayTeam, division.id),
            })),
          })),
          secondaryBracket: (division.data.secondaryBracket ?? []).map((round) => ({
            ...round,
            matches: round.matches.map((match) => ({
              ...match,
              homeTeam: resolveSlot(match.homeSlot, match.homeTeam, division.id),
              awayTeam: resolveSlot(match.awaySlot, match.awayTeam, division.id),
            })),
          })),
          classementSections: (division.data.classementSections ?? []).map((section) => ({
            ...section,
            rounds: section.rounds.map((round) => ({
              ...round,
              matches: round.matches.map((match) => ({
                ...match,
                homeTeam: resolveSlot(match.homeSlot, match.homeTeam, division.id),
                awayTeam: resolveSlot(match.awaySlot, match.awayTeam, division.id),
              })),
            })),
          })),
          classement: (division.data.classement ?? []).map((round) => ({
            ...round,
            matches: round.matches.map((match) => ({
              ...match,
              homeTeam: resolveSlot(match.homeSlot, match.homeTeam, division.id),
              awayTeam: resolveSlot(match.awaySlot, match.awayTeam, division.id),
            })),
          })),
        },
      })),
    [draft.manualPreviewDataByDivision, resolveSlot],
  );
  const activeStructurePreview = useMemo(() => {
    if (livePreviewDataByDivision.length > 0) {
      const selectedDivisions =
        activeDivisionView === "all"
          ? livePreviewDataByDivision
          : livePreviewDataByDivision.filter((division) => division.name === activeDivisionView);

      if (selectedDivisions.length > 0) {
        return (
          <div className="space-y-6">
            {selectedDivisions.map((division) => (
              <section key={division.id} className="space-y-3">
                {selectedDivisions.length > 1 ? (
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                    {division.name}
                  </div>
                ) : null}
                <TournamentPreview data={division.data} layout="split" showHeader={false} />
              </section>
            ))}
          </div>
        );
      }
    }

    if (activeDivisionView === "all") return structurePreview;
    return structurePreviewByDivision.find((entry) => entry.label === activeDivisionView)?.content ?? null;
  }, [activeDivisionView, livePreviewDataByDivision, structurePreview, structurePreviewByDivision]);
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const coachLink = shareSettings.coachToken
    ? `${origin}/tournament/${draft.id}/coach?token=${encodeURIComponent(shareSettings.coachToken)}`
    : "";
  const parentLink = shareSettings.parentToken
    ? `${origin}/tournament/${draft.id}/parent?token=${encodeURIComponent(shareSettings.parentToken)}`
    : "";
  const submittedCoachTeamCount = Object.values(playersByTeamId).filter(
    (players) => countFilledRosterPlayers(players) > 0,
  ).length;
  const submittedCoachMealCount = Object.values(shareSettings.coachMealSubmissions).filter(
    (entry) =>
      Boolean(entry.submittedAt) ||
      entry.rows.some((row) => row.participantLabel.trim() || Object.values(row.quantities).some((quantity) => quantity > 0)),
  ).length;
  const copyShareLink = async (key: "coach" | "parent") => {
    const link = key === "coach" ? coachLink : parentLink;
    if (!link || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(link);
      setShareCopiedKey(key);
      window.setTimeout(() => setShareCopiedKey((current) => (current === key ? null : current)), 1200);
    } catch {
      setShareCopiedKey(null);
    }
  };
  const floatingControlStatusLabel =
    floatingControlDisplayState === "completed"
      ? "Terminé"
      : floatingControlIsLive
        ? "En cours"
        : "Prêt";
  const globalFloatingPickerMatch =
    activeTab !== "live"
      ? floatingControlMatches.find((match) => match.id === livePickerMatchId) ??
        floatingControlGoalMatch ??
        null
      : null;
  const globalFloatingPickerState = globalFloatingPickerMatch
    ? draft.matchStates?.[globalFloatingPickerMatch.id] ?? getDefaultMatchState()
    : getDefaultMatchState();
  const globalFloatingPickerTeams = globalFloatingPickerMatch
    ? getDisplayMatchTeams(globalFloatingPickerMatch, globalFloatingPickerState)
    : { homeTeam: "", awayTeam: "" };

  return (
    <div className="fixed inset-0 z-[140] bg-black/80 backdrop-blur-md">
      <div
        className="flex h-full flex-col bg-[#05070c]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 20%, rgba(139,92,246,0.04), transparent 60%)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="fixed right-0 top-0 z-[145] inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white transition hover:bg-black/80"
          aria-label="Fermer la vue tournoi"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4.5 w-4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>

        <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 md:px-7">
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0 flex flex-1 items-center gap-3">
              <div className="min-w-0">
                <h2 className="min-w-0 truncate text-lg font-semibold text-white md:text-[22px]">{draft.name}</h2>
              </div>
            </div>
            {lockedCoachTeamName ? (
              <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:block">
                <p className="max-w-[340px] truncate text-center text-lg font-black tracking-[-0.04em] text-violet-200">
                  {resolveTeamLabel(lockedCoachTeamName)}
                </p>
              </div>
            ) : null}
            {isOrganizerView ? (
              <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditMode(false);
                }}
                className={[
                  "rounded-full px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] transition md:px-3 md:text-[10px] md:tracking-[0.14em]",
                  liveTournamentActive
                    ? "border border-emerald-300/30 bg-emerald-500/15 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.28)] animate-pulse"
                    : "border border-white/10 bg-white/5 text-slate-500 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                Pilotage match
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditMode(true);
                }}
                className={[
                  "rounded-full px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] transition md:px-3 md:text-[10px] md:tracking-[0.14em]",
                  editMode
                    ? "border border-violet-300/30 bg-violet-600 text-white shadow-[0_0_20px_rgba(124,58,237,0.3)]"
                    : "border border-white/10 bg-white/5 text-slate-500 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                Modifier le tournoi
              </button>
              </div>
            ) : null}
          </div>
          {lockedCoachTeamName ? (
            <div className="md:hidden">
              <p className="text-center text-base font-black tracking-[-0.04em] text-violet-200">
                {resolveTeamLabel(lockedCoachTeamName)}
              </p>
            </div>
          ) : null}
          {divisionViewOptions.length > 1 ? (
            <div className="flex min-w-0 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
              <div className="inline-flex w-max items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setActiveDivisionView("all")}
                  className={[
                    "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                    activeDivisionView === "all"
                      ? "bg-violet-600 text-white"
                      : "text-slate-300 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                >
                  Tous
                </button>
                {divisionViewOptions.map((divisionLabel) => (
                  <button
                    key={`division-view-${divisionLabel}`}
                    type="button"
                    onClick={() => setActiveDivisionView(divisionLabel)}
                    className={[
                      "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                      activeDivisionView === divisionLabel
                        ? "bg-violet-600 text-white"
                        : "text-slate-300 hover:bg-white/10 hover:text-white",
                    ].join(" ")}
                  >
                    {divisionLabel}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="min-w-0 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="flex w-max min-w-full items-center gap-1.5 [&::-webkit-scrollbar]:hidden">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={[
                    "shrink-0 rounded-full px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] transition md:px-3 md:text-[10px] md:tracking-[0.14em]",
                    activeTab === tab.key
                      ? "border border-violet-300/30 bg-violet-600 text-white"
                      : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-7 md:py-6">
          {activeTab === "overview" ? (
            publicTournamentBlocked ? renderPublicationBlockedState() : (
            <div className="space-y-6">
              {isTournamentFinished ? (
                <section className="rounded-[28px] border border-emerald-300/20 bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(124,58,237,0.14))] p-5 shadow-[0_0_40px_rgba(16,185,129,0.12)]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/80">Tournoi terminé</p>
                      <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">Fin du tournoi</h2>
                      <p className="mt-2 text-sm text-white/70">
                        Classement final disponible, du 1er au dernier selon les matchs de phase finale et de classement.
                      </p>
                    </div>
                  </div>
                  {finalStandings.length > 0 ? (
                    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {finalStandings.map((entry) => (
                        <div
                          key={`finished-standing-${entry.rank}-${entry.team}`}
                          className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-3"
                        >
                              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                            {formatFinalRankLabel(entry.rank)} place
                          </p>
                          <div className="mt-2 flex items-center gap-3">
                            {renderRankingBadge(entry.rank)}
                            {renderTeamBadge(entry.team)}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">{entry.team}</p>
                              <p className="mt-1 truncate text-xs text-white/45">{entry.matchLabel}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0 grid gap-8 xl:h-full">
                  {renderOverviewSlot(
                    "Match en cours",
                    overviewCurrentSlot,
                    isTournamentFinished ? "Tournoi terminé." : "Aucun match en cours pour le moment.",
                  )}
                  {renderOverviewSlot(
                    "Match suivant",
                    overviewNextSlot,
                    isTournamentFinished ? "Tournoi terminé." : "Plus de match.",
                  )}
                </div>
                <section
                  className="min-w-0 flex h-full flex-col rounded-[28px] border border-white/10 p-5"
                  style={{
                    background: "rgba(255,255,255,0.015)",
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-lg font-semibold text-white">Classement</p>
                    {groupTables.length > 0 ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {groupTables.map((group) => (
                          <button
                            key={`overview-group-shortcut-${group.label}`}
                            type="button"
                            onClick={() => focusOverviewGroup(group.label)}
                            className={[
                              "inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition duration-200 active:scale-105",
                              currentOverviewGroup === group.label
                                ? "text-white shadow-[0_0_8px_rgba(124,58,237,0.4)]"
                                : "bg-transparent text-white/40 hover:bg-white/[0.05] hover:text-white/80",
                            ].join(" ")}
                            style={
                              currentOverviewGroup === group.label
                                ? { background: "linear-gradient(135deg, #7C3AED, #4C1D95)" }
                                : undefined
                            }
                          >
                            {getGroupShortcutLabel(group.label)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {groupTables.length > 0 ? (
                    <div className="relative mt-5 min-h-0 flex-1">
                      <div
                        ref={(node) => {
                          overviewGroupsScrollerRef.current = node;
                          if (node) {
                            requestAnimationFrame(() => {
                              syncActiveOverviewGroup();
                            });
                          }
                        }}
                        onScroll={syncActiveOverviewGroup}
                        className="overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                        style={{ scrollSnapType: "x mandatory" }}
                      >
                        <div className="flex w-max min-w-0 gap-4 pr-1">
                        {groupTables.map((group) => (
                          <div
                            key={`overview-group-${group.label}`}
                            ref={(node) => {
                              overviewGroupCardRefs.current[group.label] = node;
                            }}
                            className="w-[392px] shrink-0 snap-start rounded-2xl px-3.5 py-3.5"
                            style={{
                              background: "rgba(255,255,255,0.035)",
                            }}
                          >
                            <p className="text-sm font-semibold text-white">{group.label}</p>
                            <div className="mt-2 overflow-hidden pt-2.5">
                              <table className="min-w-[304px] w-full table-fixed border-separate border-spacing-0 text-left text-sm text-slate-200">
                                <colgroup>
                                  <col style={{ width: "132px" }} />
                                  <col style={{ width: "32px" }} />
                                  <col style={{ width: "32px" }} />
                                  <col style={{ width: "32px" }} />
                                  <col style={{ width: "32px" }} />
                                  <col style={{ width: "24px" }} />
                                  <col style={{ width: "28px" }} />
                                </colgroup>
                                <thead className="text-[10px] uppercase tracking-[0.12em] text-white/60">
                                  <tr>
                                    <th className="border-b border-white/[0.06] pb-3.5 pr-4 font-medium">Équipe</th>
                                    <th className="border-b border-white/[0.06] pb-3.5 pr-1 font-medium">MJ</th>
                                    <th className="border-b border-white/[0.06] pb-3.5 pr-1 font-medium">V</th>
                                    <th className="border-b border-white/[0.06] pb-3.5 pr-1 font-medium">N</th>
                                    <th className="border-b border-white/[0.06] pb-3.5 pr-1 font-medium">D</th>
                                    <th className="border-b border-white/[0.06] pb-3.5 pr-0 font-medium">Diff</th>
                                    <th className="border-b border-white/[0.06] pb-3.5 pr-0 text-right font-medium">Pts</th>
                                  </tr>
                                </thead>
                                <tbody className="[&_tr:not(:last-child)_td]:border-b [&_tr:not(:last-child)_td]:border-white/[0.06]">
                                  {group.rows.map((row, index) => (
                                    <tr
                                      key={`overview-row-${group.label}-${row.team}`}
                                      className="transition-colors duration-200 hover:bg-white/[0.05]"
                                    >
                                      <td className="py-3.5 pr-4">
                                        <div
                                          className={[
                                            "flex min-w-0 items-center gap-2 font-semibold",
                                            index === 0 ? "text-white [text-shadow:0_0_10px_rgba(255,255,255,0.08)]" : "text-white/92",
                                          ].join(" ")}
                                        >
                                          {renderRankingBadge(index + 1)}
                                          {renderTeamBadge(row.team)}
                                          <span className="min-w-0 leading-tight break-words">{row.team}</span>
                                        </div>
                                      </td>
                                      <td className="py-3.5 pr-1 text-white/70">{row.played}</td>
                                      <td className="py-3.5 pr-1 text-white/70">{row.wins}</td>
                                      <td className="py-3.5 pr-1 text-white/70">{row.draws}</td>
                                      <td className="py-3.5 pr-1 text-white/70">{row.losses}</td>
                                      <td className="py-3.5 pr-0 text-white/70">{row.diff}</td>
                                      <td className="py-3.5 pr-0 text-right font-semibold text-white">{row.points}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                      </div>
                      <div
                        className="pointer-events-none absolute inset-y-0 left-0 z-[2] w-[60px] transition-opacity duration-200"
                        style={{
                          opacity: overviewScrollMask.left ? 1 : 0,
                          background:
                            "linear-gradient(to right, rgba(5,7,12,0.82), rgba(5,7,12,0.45), transparent)",
                        }}
                      />
                      <div
                        className="pointer-events-none absolute inset-y-0 right-0 z-[2] w-[60px] transition-opacity duration-200"
                        style={{
                          opacity: overviewScrollMask.right ? 1 : 0.25,
                          background:
                            "linear-gradient(to left, rgba(5,7,12,0.82), rgba(5,7,12,0.45), transparent)",
                        }}
                      />
                      <div className="pointer-events-none absolute inset-y-0 right-0 z-[3] flex w-10 items-center justify-end">
                        <div
                          className="h-16 w-8 rounded-full blur-md transition-opacity duration-200"
                          style={{
                            opacity: overviewScrollMask.right ? 1 : 0.2,
                            background:
                              "linear-gradient(to left, rgba(255,255,255,0.06), rgba(255,255,255,0.02), transparent)",
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">
                      Aucun classement disponible pour ce format.
                    </p>
                  )}
                </section>
              </div>
            </div>
            )
          ) : null}

          {activeTab === "matches" ? (
            publicTournamentBlocked ? renderPublicationBlockedState() : (
            <div className="space-y-6">
              {divisionViewOptions.length > 1 && activeDivisionView === "all" ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setAlternateMatchesView((current) => !current)}
                    className={[
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                      alternateMatchesView
                        ? "border-violet-300/30 bg-violet-600 text-white shadow-[0_0_20px_rgba(124,58,237,0.24)]"
                        : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
                    ].join(" ")}
                  >
                    <span aria-hidden="true">🔀</span>
                    Alterner
                  </button>
                </div>
              ) : null}

              <section className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-white">Phase de poule</p>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
                    {displayedGroupMatches.length} matchs
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {displayedGroupMatches.length > 0 ? displayedGroupMatches.map(renderMatchRow) : (
                    <p className="text-sm text-slate-500">Aucun match de poule sur ce tournoi.</p>
                  )}
                </div>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-white">Phase finale</p>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
                    {displayedFinalMatches.length} matchs
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {displayedFinalMatches.length > 0 ? displayedFinalMatches.map(renderMatchRow) : (
                    <p className="text-sm text-slate-500">Aucun match de phase finale.</p>
                  )}
                </div>
              </section>

              {displayedFriendlyMatches.length > 0 ? (
                <section className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-lg font-semibold text-white">Amicaux</p>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
                      {displayedFriendlyMatches.length} matchs
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">{displayedFriendlyMatches.map(renderMatchRow)}</div>
                </section>
              ) : null}
            </div>
            )
          ) : null}

          {activeTab === "teams" ? (
            isCoachView ? (
              <div className="space-y-6">
                <section className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                  <div className="space-y-4">
                    <div>
                      <p className="text-lg font-semibold text-white">Équipe</p>
                      <p className="mt-1 text-sm text-white/55">
                        {lockedCoachTeamName
                          ? "Complétez la fiche joueurs de votre équipe."
                          : "Choisissez votre équipe puis complétez la fiche joueurs."}
                      </p>
                    </div>
                    {lockedCoachTeamName ? null : (
                      <select
                        value={activeCoachTeamName ?? ""}
                        onChange={(event) => setActiveCoachTeamName(event.target.value || null)}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
                      >
                        <option value="">Choisir une équipe</option>
                        {publicVisibleTeams.map((team) => (
                          <option key={`coach-team-${team.id}`} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    )}

                    {activeCoachTeamName ? (
                      <div className="space-y-3">
                        <div className="rounded-[20px] border border-white/10 bg-white/[0.035] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-white">Code vote parent</p>
                              <p className="mt-1 text-xs text-white/45">
                                À transmettre aux parents pour débloquer uniquement le vote MVP.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const teamId = resolveTeamStorageKey(activeCoachTeamName);
                                setShareSettings((current) => ({
                                  ...current,
                                  parentTeamCodes: {
                                    ...(current.parentTeamCodes ?? {}),
                                    [teamId]: current.parentTeamCodes?.[teamId] ?? buildParentTeamCode(),
                                  },
                                }));
                              }}
                              className="rounded-full border border-violet-300/25 bg-violet-500/14 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100 transition hover:bg-violet-500/20"
                            >
                              Générer code parent
                            </button>
                          </div>
                          <p className="mt-3 font-mono text-lg font-black tracking-[0.2em] text-white">
                            {shareSettings.parentTeamCodes?.[resolveTeamStorageKey(activeCoachTeamName)] ?? "------"}
                          </p>
                        </div>
                        {isCoachTeamReadonly ? (
                          <>
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => setEditingCoachTeamName(activeCoachTeamName)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white transition hover:bg-white/12"
                                aria-label="Modifier la fiche équipe"
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 24 24"
                                  className="h-4.5 w-4.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                              </button>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              {activeCoachTeamPlayers.filter(
                                (player) =>
                                  player.lastName.trim() ||
                                  player.firstName.trim() ||
                                  player.license.trim(),
                              ).length > 0 ? (
                                activeCoachTeamPlayers
                                  .filter(
                                    (player) =>
                                      player.lastName.trim() ||
                                      player.firstName.trim() ||
                                      player.license.trim(),
                                  )
                                  .map((player, index) => (
                                    <article
                                      key={`coach-team-card-${activeCoachTeamName}-${index}`}
                                      className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="truncate text-base font-semibold text-white">
                                            {[player.firstName, player.lastName].filter(Boolean).join(" ").trim() || "Joueur"}
                                          </p>
                                          <p className="mt-1 text-sm text-white/45">
                                            {player.license?.trim() ? `Licence ${player.license}` : "Licence non renseignée"}
                                          </p>
                                        </div>
                                        <span className="rounded-full border border-violet-300/20 bg-violet-500/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-100">
                                          N° {player.number || "—"}
                                        </span>
                                      </div>
                                    </article>
                                  ))
                              ) : (
                                <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-400 md:col-span-2">
                                  Aucun joueur renseigné pour le moment.
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          Array.from({ length: maxPlayersPerTeam }, (_, index) => {
                            const player = activeCoachTeamPlayers[index] ?? createEmptyRosterPlayer(index);
                            return (
                              <div
                                key={`coach-team-player-${activeCoachTeamName}-${index}`}
                                className="grid gap-3 rounded-[22px] border border-white/10 bg-white/[0.03] p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_84px_minmax(0,1fr)]"
                              >
                                <input
                                  type="text"
                                  value={player.lastName}
                                  onChange={(event) =>
                                    updateCoachTeamPlayer(activeCoachTeamName, index, "lastName", event.target.value)
                                  }
                                  placeholder="Nom"
                                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30"
                                />
                                <input
                                  type="text"
                                  value={player.firstName}
                                  onChange={(event) =>
                                    updateCoachTeamPlayer(activeCoachTeamName, index, "firstName", event.target.value)
                                  }
                                  placeholder="Prénom"
                                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30"
                                />
                                <input
                                  type="text"
                                  value={player.number}
                                  onChange={(event) =>
                                    updateCoachTeamPlayer(activeCoachTeamName, index, "number", event.target.value)
                                  }
                                  placeholder="N°"
                                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30"
                                />
                                <input
                                  type="text"
                                  value={player.license}
                                  onChange={(event) =>
                                    updateCoachTeamPlayer(activeCoachTeamName, index, "license", event.target.value)
                                  }
                                  placeholder="Licence"
                                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30"
                                />
                              </div>
                            );
                          })
                        )}
                      </div>
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-400">
                        Choisissez une équipe pour compléter la fiche.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <div className="space-y-6">
                <section className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                  {divisionViewOptions.length > 1 ? (
                    <div className="mb-5 flex min-w-0 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
                      <div className="inline-flex w-max items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 [&::-webkit-scrollbar]:hidden">
                        <button
                          type="button"
                          onClick={() => setActiveDivisionView("all")}
                          className={[
                            "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                            activeDivisionView === "all"
                              ? "bg-violet-600 text-white"
                              : "text-slate-300 hover:bg-white/10 hover:text-white",
                          ].join(" ")}
                        >
                          Tous
                        </button>
                        {divisionViewOptions.map((divisionLabel) => (
                          <button
                            key={`teams-division-view-${divisionLabel}`}
                            type="button"
                            onClick={() => setActiveDivisionView(divisionLabel)}
                            className={[
                              "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                              activeDivisionView === divisionLabel
                                ? "bg-violet-600 text-white"
                                : "text-slate-300 hover:bg-white/10 hover:text-white",
                            ].join(" ")}
                          >
                            {divisionLabel}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-white">Participants</p>
                      <p className="mt-1 text-sm text-white/55">
                        {registeredTournamentTeams.length}/{Math.max(draft.teamCount, draft.teams.length)} equipes
                      </p>
                    </div>
                    <div className="flex w-full max-w-xl items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void applyCoachInfoToAdmin()}
                        className="inline-flex shrink-0 items-center rounded-2xl border border-emerald-300/25 bg-emerald-500/15 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100 transition hover:bg-emerald-500/20 hover:text-white"
                      >
                        Mettre à jour
                      </button>
                      <input
                        type="text"
                        value={teamDraftName}
                        onChange={(event) => setTeamDraftName(event.target.value)}
                        placeholder="Ajouter une equipe"
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
                      />
                      <button
                        type="button"
                        onClick={addTournamentTeam}
                        className="inline-flex shrink-0 items-center rounded-2xl border border-violet-300/25 bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
                      >
                        Ajouter
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {registeredTournamentTeams.length > 0 ? (
                      registeredTournamentTeams.map((team) => {
                        const teamPlayerList = getLoadedPlayers(team.id);
                        const filledPlayers = countFilledRosterPlayers(teamPlayerList);
                        const mealSubmission =
                          shareSettings.coachMealSubmissions[team.id] ??
                          shareSettings.coachMealSubmissions[team.name] ??
                          Object.values(shareSettings.coachMealSubmissions).find(
                            (entry) => entry.teamName === team.name,
                          );
                        const filledMeals = countFilledMealRows(mealSubmission?.rows);

                        return (
                          <div
                            key={`participant-${team.id}`}
                            className="flex items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-3"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-base font-semibold text-white">{team.name}</p>
                              <p className="mt-1 text-sm text-white/50">
                                {filledPlayers}/{maxPlayersPerTeam} joueurs
                              </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleOpenPlayers(team)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-sky-300/20 bg-sky-500/10 text-sky-100 transition hover:bg-sky-500/20"
                                aria-label={`Voir les joueurs de ${team.name}`}
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 24 24"
                                  className="h-4.5 w-4.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                  <circle cx="10" cy="7" r="4" />
                                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveMealOrderTeamId(team.id)}
                                className={[
                                  "inline-flex h-10 w-10 items-center justify-center rounded-full border transition",
                                  filledMeals > 0
                                    ? "border-amber-300/25 bg-amber-500/12 text-amber-100 hover:bg-amber-500/20"
                                    : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white",
                                ].join(" ")}
                                aria-label={`Voir les repas de ${team.name}`}
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 24 24"
                                  className="h-4.5 w-4.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M6 3v8" />
                                  <path d="M10 3v8" />
                                  <path d="M6 7h4" />
                                  <path d="M8 11v10" />
                                  <path d="M17 3v18" />
                                  <path d="M14 3c0 4.2 1.4 6.6 3 7.5" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => removeTournamentTeam(team.id)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
                                aria-label={`Supprimer ${team.name}`}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-slate-500">Aucune equipe sur cette categorie pour le moment.</p>
                    )}
                  </div>
                </section>
              </div>
            )
          ) : null}

          {activeTab === "meals" ? (
            isOrganizerView ? (
              <div className="space-y-6">
                <section className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-white">Repas</p>
                      <p className="mt-1 text-sm text-white/55">
                        Suivi des commandes repas par équipe.
                      </p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                      Max {maxMealsPerTeam}
                    </div>
                  </div>

                  <div className="mt-5 inline-flex flex-wrap items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
                    {[
                      { key: "sheets" as const, label: "Fiche repas" },
                      { key: "service" as const, label: "Gestion repas" },
                    ].map((tab) => (
                      <button
                        key={`meal-admin-tab-${tab.key}`}
                        type="button"
                        onClick={() => setActiveMealsOrganizerTab(tab.key)}
                        className={[
                          "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                          activeMealsOrganizerTab === tab.key
                            ? "bg-violet-600 text-white shadow-[0_0_18px_rgba(124,58,237,0.28)]"
                            : "text-slate-300 hover:bg-white/10 hover:text-white",
                        ].join(" ")}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {activeMealsOrganizerTab === "sheets" ? (
                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      {registeredTournamentTeams.length > 0 ? (
                        registeredTournamentTeams.map((team) => {
                          const mealSubmission =
                            shareSettings.coachMealSubmissions[team.id] ??
                            shareSettings.coachMealSubmissions[team.name] ??
                            Object.values(shareSettings.coachMealSubmissions).find(
                              (entry) => entry.teamName === team.name,
                            );
                          const filledMeals = Math.min(countFilledMealRows(mealSubmission?.rows), maxMealsPerTeam);
                          const status = getCoachMealStatus(mealSubmission?.rows, maxMealsPerTeam);
                          const statusView = mealOrderStatusView[status];

                          return (
                            <button
                              key={`meal-status-${team.id}`}
                              type="button"
                              onClick={() => setActiveMealOrderTeamId(team.id)}
                              className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4 text-left transition hover:border-violet-300/20 hover:bg-white/[0.055]"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-base font-semibold text-white">{team.name}</p>
                                <p className="mt-1 text-sm text-white/50">
                                  Repas : {filledMeals}/{maxMealsPerTeam}
                                </p>
                              </div>
                              <span
                                className={[
                                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] backdrop-blur transition group-hover:scale-[1.02]",
                                  statusView.className,
                                ].join(" ")}
                              >
                                <span className={["h-1.5 w-1.5 rounded-full", statusView.dotClassName].join(" ")} />
                                {statusView.label}
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-400 md:col-span-2">
                          Aucune équipe inscrite pour le moment.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-5 space-y-3">
                      <div className="rounded-[22px] border border-amber-300/15 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                        Pause détectée : {mealServicePlan.breakLabel}. Priorité aux équipes qui rejouent le plus tôt après la pause.
                      </div>
                      {mealServicePlan.teams.length > 0 ? (
                        mealServicePlan.teams.map((entry, index) => (
                          <button
                            key={`meal-service-${entry.team.id}`}
                            type="button"
                            onClick={() => setActiveMealOrderTeamId(entry.team.id)}
                            className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4 text-left transition hover:border-amber-300/25 hover:bg-white/[0.055] md:grid-cols-[auto_minmax(0,1fr)_minmax(170px,auto)]"
                          >
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-300/20 bg-amber-500/12 text-sm font-black text-amber-100">
                              {index + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold text-white">{entry.team.name}</p>
                              <p className="mt-1 text-sm text-white/50">
                                {entry.nextMatch
                                  ? `Prochain match ${entry.nextMatch.startTime} vs ${entry.nextOpponent ?? "adversaire"}`
                                  : "En attente qualification"}
                              </p>
                              <p className="mt-1 text-xs text-white/35">
                                {entry.previousMatch
                                  ? `Dernier match ${entry.previousMatch.startTime} vs ${entry.previousOpponent ?? "adversaire"}`
                                  : "Heure : En attente"}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 md:justify-end">
                              {entry.nextMatch ? (
                                <span className="rounded-full border border-emerald-300/20 bg-emerald-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100">
                                  À servir avant {entry.nextMatch.startTime}
                                </span>
                              ) : (
                                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                  En attente
                                </span>
                              )}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-400">
                          Aucun match ou aucune équipe pour calculer l’ordre de service.
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            ) : isCoachView ? (
              <div className="space-y-6">
                <section className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                  <div className="space-y-4">
                    <div>
                      <p className="text-lg font-semibold text-white">Repas</p>
                      <p className="mt-1 text-sm text-white/55">
                        Remplissez la fiche repas de votre équipe.
                      </p>
                    </div>
                    {lockedCoachTeamName ? null : (
                      <select
                        value={activeCoachTeamName ?? ""}
                        onChange={(event) => setActiveCoachTeamName(event.target.value || null)}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
                      >
                        <option value="">Choisir une équipe</option>
                        {publicVisibleTeams.map((team) => (
                          <option key={`coach-meal-team-${team.id}`} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    )}

                    {!mealItems.length ? (
                      <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-400">
                        Aucun produit repas n’a encore été créé par l’organisateur.
                      </div>
                    ) : activeCoachTeamName && activeCoachMealSubmission ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-[720px] w-full border-separate border-spacing-0 text-sm text-white">
                          <thead>
                            <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-white/45">
                              <th className="border-b border-white/10 px-3 py-3">Identité</th>
                              {mealItems.map((item) => (
                                <th key={`meal-head-${item.id}`} className="border-b border-white/10 px-3 py-3 text-center">
                                  {item.label}
                                </th>
                              ))}
                              <th className="border-b border-white/10 px-3 py-3 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {buildDefaultMealRows(maxMealsPerTeam, mealItems, activeCoachMealSubmission.rows).map((row, rowIndex) => {
                              const lineTotal = mealItems.reduce((total, item) => {
                                const quantity = row.quantities[item.id] ?? 0;
                                const price = Number(item.price || 0);
                                return total + quantity * price;
                              }, 0);

                              return (
                                <tr key={`meal-row-${row.id}`} className="[&_td]:border-b [&_td]:border-white/[0.06]">
                                  <td className="px-3 py-2">
                                    <input
                                      type="text"
                                      value={row.participantLabel}
                                      onChange={(event) =>
                                        updateCoachMealLabel(activeCoachTeamName, rowIndex, event.target.value)
                                      }
                                      placeholder="Nom / Prénom / N° / Coach"
                                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
                                    />
                                  </td>
                                  {mealItems.map((item) => (
                                    <td key={`meal-cell-${row.id}-${item.id}`} className="px-3 py-2">
                                      <div className="flex items-center justify-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => updateCoachMealQuantity(activeCoachTeamName, rowIndex, item.id, -1)}
                                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/75 transition hover:bg-white/10 hover:text-white"
                                        >
                                          -
                                        </button>
                                        <span className="min-w-6 text-center text-sm font-semibold text-white">
                                          {row.quantities[item.id] ?? 0}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => updateCoachMealQuantity(activeCoachTeamName, rowIndex, item.id, 1)}
                                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/75 transition hover:bg-white/10 hover:text-white"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </td>
                                  ))}
                                  <td className="px-3 py-2 text-right text-sm font-semibold text-white">
                                    {lineTotal.toFixed(2)} €
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="text-sm font-semibold text-white">
                              <td className="px-3 py-3">Total</td>
                              {mealItems.map((item) => (
                                <td key={`meal-total-${item.id}`} className="px-3 py-3 text-center">
                                  {buildDefaultMealRows(maxMealsPerTeam, mealItems, activeCoachMealSubmission.rows).reduce(
                                    (total, row) => total + (row.quantities[item.id] ?? 0),
                                    0,
                                  )}
                                </td>
                              ))}
                              <td className="px-3 py-3 text-right">
                                {buildDefaultMealRows(maxMealsPerTeam, mealItems, activeCoachMealSubmission.rows)
                                  .reduce((total, row) => {
                                    return total + mealItems.reduce((line, item) => {
                                      const quantity = row.quantities[item.id] ?? 0;
                                      const price = Number(item.price || 0);
                                      return line + quantity * price;
                                    }, 0);
                                  }, 0)
                                  .toFixed(2)} €
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-400">
                        Choisissez une équipe pour remplir les repas.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : null
          ) : null}

          {activeTab === "pools" ? (
            publicTournamentBlocked ? renderPublicationBlockedState() : (
            <div className="space-y-6">
              {groupTables.length > 0 ? groupTables.map((group) => (
                <section key={group.label} className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-lg font-semibold text-white">{group.label}</p>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
                      {group.rows.length} équipes
                    </span>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-[336px] w-full table-fixed border-separate border-spacing-0 text-left text-sm text-slate-200">
                      <colgroup>
                        <col style={{ width: "136px" }} />
                        <col style={{ width: "32px" }} />
                        <col style={{ width: "32px" }} />
                        <col style={{ width: "32px" }} />
                        <col style={{ width: "32px" }} />
                        <col style={{ width: "32px" }} />
                        <col style={{ width: "32px" }} />
                        <col style={{ width: "24px" }} />
                        <col style={{ width: "28px" }} />
                      </colgroup>
                      <thead className="text-[10px] uppercase tracking-[0.12em] text-white/60">
                        <tr>
                          <th className="border-b border-white/[0.06] pb-3.5 pr-4 font-medium">Équipe</th>
                          <th className="border-b border-white/[0.06] pb-3.5 pr-1 font-medium">MJ</th>
                          <th className="border-b border-white/[0.06] pb-3.5 pr-1 font-medium">V</th>
                          <th className="border-b border-white/[0.06] pb-3.5 pr-1 font-medium">N</th>
                          <th className="border-b border-white/[0.06] pb-3.5 pr-1 font-medium">D</th>
                          <th className="border-b border-white/[0.06] pb-3.5 pr-1 font-medium">BP</th>
                          <th className="border-b border-white/[0.06] pb-3.5 pr-1 font-medium">BC</th>
                          <th className="border-b border-white/[0.06] pb-3.5 pr-0 font-medium">Diff</th>
                          <th className="border-b border-white/[0.06] pb-3.5 pr-0 text-right font-medium">Pts</th>
                        </tr>
                      </thead>
                      <tbody className="[&_tr:not(:last-child)_td]:border-b [&_tr:not(:last-child)_td]:border-white/[0.06]">
                        {group.rows.map((row, index) => (
                          <tr key={row.team} className="transition-colors duration-200 hover:bg-white/[0.05]">
                            <td className="py-3.5 pr-4">
                              <div
                                className={[
                                  "flex min-w-0 items-center gap-2.5 font-semibold",
                                  index === 0 ? "text-white [text-shadow:0_0_10px_rgba(255,255,255,0.08)]" : "text-white/92",
                                ].join(" ")}
                              >
                                {renderRankingBadge(index + 1)}
                                {renderTeamBadge(row.team)}
                                <span className="min-w-0 leading-tight break-words">{row.team}</span>
                              </div>
                            </td>
                            <td className="py-3.5 pr-1 text-white/70">{row.played}</td>
                            <td className="py-3.5 pr-1 text-white/70">{row.wins}</td>
                            <td className="py-3.5 pr-1 text-white/70">{row.draws}</td>
                            <td className="py-3.5 pr-1 text-white/70">{row.losses}</td>
                            <td className="py-3.5 pr-1 text-white/70">{row.goalsFor}</td>
                            <td className="py-3.5 pr-1 text-white/70">{row.goalsAgainst}</td>
                            <td className="py-3.5 pr-0 text-white/70">{row.diff}</td>
                            <td className="py-3.5 pr-0 text-right font-semibold text-white">{row.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )) : (
                <section className="rounded-[28px] border border-white/10 bg-black/25 p-5 text-sm text-slate-400">
                  Aucun classement de poule disponible pour ce format.
                </section>
              )}
            </div>
            )
          ) : null}

          {activeTab === "stats" ? (
            publicTournamentBlocked ? renderPublicationBlockedState() : (
              <div className="space-y-6">
                <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.20),transparent_34%),radial-gradient(circle_at_top_right,rgba(34,197,94,0.13),transparent_30%),rgba(255,255,255,0.035)] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-200/70">
                        {statsRole === "admin"
                          ? "Statistiques live"
                          : statsRole === "coach"
                            ? "Vision sportive"
                            : "Classement officiel du tournoi"}
                      </p>
                      <h3 className="mt-2 text-2xl font-black tracking-[-0.03em] text-white md:text-3xl">
                        Classements tournoi
                      </h3>
                      <p className="mt-2 text-sm text-white/50">
                        {statsRole === "admin"
                          ? "Buteurs, MVP, votes détaillés et pondération officielle."
                          : statsRole === "coach"
                            ? "Lecture rapide des joueurs qui font la différence."
                            : "Les meilleurs joueurs et buteurs à suivre pendant le tournoi."}
                      </p>
                    </div>
                    <div className="flex flex-col items-stretch gap-2 sm:items-end">
                      {statsTabOptions.length > 0 ? (
                      <div className="rounded-full border border-white/10 bg-black/20 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                        {statsTabOptions.map((tab) => (
                          <button
                            key={`stats-tab-${tab.key}`}
                            type="button"
                            onClick={() => setActiveStatsTab(tab.key)}
                            className={[
                              "rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition duration-300",
                              activeStatsTab === tab.key
                                ? "border border-violet-300/25 bg-violet-600 text-white shadow-[0_0_22px_rgba(124,58,237,0.26)]"
                                : "text-slate-400 hover:bg-white/5 hover:text-white",
                            ].join(" ")}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      ) : null}
                      {!isParentView ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <div className="rounded-full border border-white/10 bg-black/20 p-1">
                          {[
                            { key: "simple" as const, label: "Vue simple" },
                            { key: "detail" as const, label: "Vue détaillée" },
                          ].map((tab) => (
                            <button
                              key={`stats-view-${tab.key}`}
                              type="button"
                              onClick={() => setActiveStatsViewMode(tab.key)}
                              className={[
                                "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition duration-300",
                                statsViewMode === tab.key
                                  ? "bg-violet-600 text-white shadow-[0_0_18px_rgba(124,58,237,0.24)]"
                                  : "text-white/45 hover:bg-white/5 hover:text-white",
                              ].join(" ")}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setStatsTopFiveOnly((current) => !current)}
                          className={[
                            "rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition duration-300",
                            statsTopFiveOnly
                              ? "border-amber-200/30 bg-amber-400/15 text-amber-100"
                              : "border-white/10 bg-black/20 text-white/50 hover:bg-white/5 hover:text-white",
                          ].join(" ")}
                        >
                          Top 5
                        </button>
                      </div>
                      ) : (
                        <span className="self-end rounded-full border border-amber-200/25 bg-amber-400/12 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100">
                          Top 5 officiel
                        </span>
                      )}
                    </div>
                  </div>

                  {publicStatsBlockedMessage ? (
                    <div className="mt-6 rounded-[24px] border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-slate-400">
                      {publicStatsBlockedMessage}
                    </div>
                  ) : activeStatsTab === "scorers" && scorerStatsVisible ? (
                    <div className="mt-6 space-y-3">
                      {visibleScorerLeaderboard.length > 0 ? (
                        visibleScorerLeaderboard.map((row, index) => {
                          const progress = maxScorerGoals > 0 ? Math.max(8, Math.round((row.goals / maxScorerGoals) * 100)) : 0;
                          const isFirst = index === 0;
                          const podiumIcon = index === 0 ? "⚽🔥" : index === 1 ? "🥈" : index === 2 ? "🥉" : null;

                          return (
                          <div
                            key={`scorer-rank-${row.teamName}-${row.number}`}
                            className={[
                              "animate-[live-modal-in_360ms_ease-out] rounded-[26px] border px-4 py-4 transition-all duration-300",
                              isFirst
                                ? "border-emerald-200/25 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.22),transparent_38%),rgba(255,255,255,0.055)] shadow-[0_0_42px_rgba(34,197,94,0.16)]"
                                : index === 1
                                  ? "border-emerald-200/16 bg-white/[0.045] shadow-[0_0_28px_rgba(34,197,94,0.08)]"
                                  : index === 2
                                    ? "border-white/12 bg-white/[0.035]"
                                    : "border-white/10 bg-white/[0.025]",
                            ].join(" ")}
                          >
                            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                              <span
                                className={[
                                  "flex h-10 w-10 items-center justify-center rounded-full border text-sm font-black text-white",
                                  isFirst
                                    ? "border-emerald-200/35 bg-emerald-400/18 shadow-[0_0_22px_rgba(34,197,94,0.24)]"
                                    : "border-white/10 bg-white/[0.06]",
                                ].join(" ")}
                              >
                                {podiumIcon ?? index + 1}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-base font-black tracking-[-0.02em] text-white">
                                    {getTournamentPlayerDisplayLabel(row.teamName, row.number)}
                                  </p>
                                  {isFirst ? (
                                    <span className="rounded-full border border-emerald-200/30 bg-emerald-400/14 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-100">
                                      Top buteur
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-0.5 text-xs text-white/45">
                                  {row.teamName} • {row.matchCount} match{row.matchCount > 1 ? "s" : ""} avec but
                                </p>
                              </div>
                              <span className="rounded-full border border-emerald-300/25 bg-emerald-500/12 px-3 py-1 text-sm font-black text-emerald-100">
                                {row.goals} but{row.goals > 1 ? "s" : ""}
                              </span>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                              <div
                                className="h-full rounded-full bg-[linear-gradient(90deg,#22C55E,#A3E635)] shadow-[0_0_18px_rgba(34,197,94,0.45)] transition-[width] duration-500 ease-out"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            {statsViewMode === "detail" ? (
                              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">
                                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                                  Ratio impact : {row.goals}/{row.matchCount}
                                </span>
                              </div>
                            ) : null}
                          </div>
                          );
                        })
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-slate-500">
                          Aucun buteur enregistré pour le moment.
                        </div>
                      )}
                    </div>
                  ) : activeStatsTab === "mvp" && mvpStatsVisible ? (
                    <div className="mt-6 space-y-3">
                      {visibleMvpLeaderboard.length > 0 ? (
                        visibleMvpLeaderboard.map((row, index) => {
                          const progress = maxMvpPoints > 0 ? Math.max(8, Math.round((row.totalPoints / maxMvpPoints) * 100)) : 0;
                          const podiumIcon = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : null;
                          const rankClass =
                            index === 0
                              ? "border-amber-200/30 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.25),transparent_36%),rgba(255,255,255,0.06)] shadow-[0_0_48px_rgba(168,85,247,0.18),0_0_34px_rgba(250,204,21,0.10)]"
                              : index === 1
                                ? "border-violet-200/18 bg-white/[0.045] shadow-[0_0_30px_rgba(168,85,247,0.10)]"
                                : index === 2
                                  ? "border-violet-200/12 bg-white/[0.035] shadow-[0_0_22px_rgba(168,85,247,0.06)]"
                                  : "border-white/10 bg-white/[0.025]";

                          return (
                          <div
                            key={`mvp-rank-${row.teamName}-${row.number}`}
                            className={["animate-[live-modal-in_360ms_ease-out] rounded-[26px] border px-4 py-4 transition-all duration-300", rankClass].join(" ")}
                          >
                            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                              <span
                                className={[
                                  "flex h-10 w-10 items-center justify-center rounded-full border text-sm font-black text-white",
                                  index === 0
                                    ? "border-amber-200/40 bg-amber-300/18 shadow-[0_0_24px_rgba(250,204,21,0.22)]"
                                    : "border-fuchsia-300/20 bg-fuchsia-500/12",
                                ].join(" ")}
                              >
                                {podiumIcon ?? index + 1}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-base font-black tracking-[-0.02em] text-white">
                                    {getTournamentPlayerDisplayLabel(row.teamName, row.number)}
                                  </p>
                                  {index === 0 ? (
                                    <span className="rounded-full border border-amber-200/35 bg-amber-300/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-amber-100">
                                      ⭐ MVP tournoi
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-0.5 text-xs text-white/45">
                                  {row.teamName} • {statsRole === "admin"
                                    ? `${row.votes} vote${row.votes > 1 ? "s" : ""} comptabilisé${row.votes > 1 ? "s" : ""} • ${formatRelativeMinuteLabel(row.lastVoteAt)}`
                                    : statsRole === "coach"
                                      ? `${row.votes} vote${row.votes > 1 ? "s" : ""} officiel${row.votes > 1 ? "s" : ""}`
                                      : "Classement officiel du tournoi"}
                                </p>
                              </div>
                              <span className="rounded-full border border-violet-300/25 bg-violet-500/12 px-3 py-1 text-sm font-black text-violet-100">
                                {row.totalPoints} pts
                              </span>
                            </div>
                            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/8">
                              <div
                                className="h-full rounded-full bg-[linear-gradient(90deg,#7C3AED,#C084FC,#FACC15)] shadow-[0_0_20px_rgba(168,85,247,0.46)] transition-[width] duration-500 ease-out"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            {statsViewMode === "detail" && statsRole === "admin" ? (
                              <div className="mt-3 grid gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60 md:grid-cols-3">
                                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                                  Admin {row.adminVotes} vote{row.adminVotes > 1 ? "s" : ""} • 5 pts chacun • {row.adminPoints} pts
                                </span>
                                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                                  Coach {row.coachVotes} vote{row.coachVotes > 1 ? "s" : ""} • 3 pts chacun • {row.coachPoints} pts
                                </span>
                                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                                  Parent {row.parentVotes} vote{row.parentVotes > 1 ? "s" : ""} • 1 pt chacun • {row.parentPoints} pts
                                </span>
                              </div>
                            ) : statsRole === "parent" ? null : (
                              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
                                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                                  Admin {row.adminPoints}
                                </span>
                                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                                  Coach {row.coachPoints}
                                </span>
                                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                                  Parent {row.parentPoints}
                                </span>
                              </div>
                            )}
                          </div>
                          );
                        })
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-slate-500">
                          Aucun vote MVP enregistré pour le moment.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-6 rounded-[24px] border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-slate-400">
                      {isParentView ? "Classement disponible à la fin du tournoi" : "Statistique masquée par l’organisateur."}
                    </div>
                  )}
                </section>
              </div>
            )
          ) : null}

          {activeTab === "bracket" ? (
            publicTournamentBlocked ? renderPublicationBlockedState() : (
            <div className="space-y-6">
              <section className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Phases finales</p>
                    <h3 className="mt-2 text-lg font-semibold text-white">Bracket du tournoi</h3>
                  </div>
                  {isOrganizerView ? (
                    <button
                      type="button"
                      onClick={onEditStructure}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:bg-white/10 hover:text-white"
                    >
                      Ajuster la structure
                    </button>
                  ) : null}
                </div>
                <div className="mt-5 rounded-[28px] border border-white/10 bg-[#0f1016] p-3 md:p-4">
                  {activeStructurePreview ?? (
                    <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-slate-500">
                      Aucun aperçu de bracket disponible pour ce tournoi.
                    </div>
                  )}
                </div>
              </section>
            </div>
            )
          ) : null}

          {activeTab === "live" ? (
            publicTournamentBlocked ? renderPublicationBlockedState() : (
            <div className="space-y-2">
              {isTournamentFinished ? (
                <section className="rounded-[24px] border border-emerald-300/20 bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(124,58,237,0.14))] p-4 shadow-[0_0_36px_rgba(16,185,129,0.12)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/80">Tournoi terminé</p>
                      <p className="mt-1 text-xl font-black tracking-[-0.04em] text-white">Classement final disponible</p>
                    </div>
                  </div>
                  {finalStandings.length > 0 ? (
                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      {finalStandings.map((entry) => (
                        <div
                          key={`live-finished-standing-${entry.rank}-${entry.team}`}
                          className="flex items-center gap-3 rounded-[18px] border border-white/10 bg-black/20 px-3 py-2.5"
                        >
                          {renderRankingBadge(entry.rank)}
                          {renderTeamBadge(entry.team)}
                          <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">
                              {formatFinalRankLabel(entry.rank)} • {entry.team}
                            </p>
                            <p className="truncate text-xs text-white/45">{entry.matchLabel}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}
              {isParentView ? (
                <section className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4 backdrop-blur-[8px]">
                  {parentVoteSession && publicVoterTeamLabel ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-emerald-100">
                          Vote activé pour {publicVoterTeamLabel}
                        </p>
                        <p className="mt-1 text-xs text-white/45">
                          Vous pouvez voter sur les matchs terminés de votre équipe, uniquement pour un joueur adverse.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setParentVoteSession(null);
                          if (typeof window !== "undefined") {
                            window.localStorage.removeItem(`tournament-parent-vote-session:${draft.id}`);
                          }
                        }}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60 transition hover:bg-white/10 hover:text-white"
                      >
                        Changer de code
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Vote MVP</p>
                        <p className="mt-1 text-xs text-white/45">
                          Le live est accessible sans code. Ajoute le code équipe seulement pour voter.
                        </p>
                        {parentVoteCodeError ? (
                          <p className="mt-2 text-xs font-medium text-rose-200">{parentVoteCodeError}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setParentVoteCodeError(null);
                          setParentVoteCodeModalOpen(true);
                        }}
                        className="h-11 rounded-full border border-violet-300/25 bg-violet-600 px-5 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-[0_0_22px_rgba(124,58,237,0.22)] transition hover:bg-violet-500"
                      >
                        Code vote
                      </button>
                    </div>
                  )}
                </section>
              ) : null}
              <section>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-white">Pilotage match</h3>
                  {isOrganizerView ? (
                    <button
                      type="button"
                      onClick={() => setResetConfirmOpen(true)}
                      disabled={isResettingTournament}
                      className={[
                        "rounded-full border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                        isResettingTournament
                          ? "cursor-wait border-white/10 bg-white/5 text-white/40"
                          : "border-rose-300/25 bg-rose-500/12 text-rose-100 hover:bg-rose-500/18",
                      ].join(" ")}
                    >
                      {isResettingTournament ? "Reset..." : "Reset tournoi"}
                    </button>
                  ) : null}
                </div>
                {livePrimaryMatch ? (() => {
                  const livePrimaryState = draft.matchStates?.[livePrimaryMatch.id] ?? getDefaultMatchState();
                  const livePrimaryDisplayState = getMatchDisplayState(livePrimaryState);
                  const runtime = getLiveRuntime(livePrimaryMatch.id);
                  const isLive = livePrimaryDisplayState === "live";
                  const livePrimaryStartedAtTime = livePrimaryState.startedAt
                    ? Date.parse(livePrimaryState.startedAt)
                    : Number.NaN;
                  const liveElapsedSeconds =
                    isLive && Number.isFinite(livePrimaryStartedAtTime) && liveClockNow > 0
                      ? Math.max(0, Math.floor((liveClockNow - livePrimaryStartedAtTime) / 1000))
                      : runtime.elapsedSeconds;
                  const countdownSeconds = Math.max(0, draft.matchDuration * 60 - liveElapsedSeconds);
                  const pickerMatch =
                    liveSlotMatches.find((match) => match.id === livePickerMatchId) ??
                    liveSlotMatches[0] ??
                    livePrimaryMatch;
                  const pickerMatchState = draft.matchStates?.[pickerMatch.id] ?? getDefaultMatchState();
                  const resolvedPickerMatchTeams = getDisplayMatchTeams(pickerMatch, pickerMatchState);
                  const liveActionHint =
                    livePrimaryDisplayState === "completed"
                      ? "Terminé"
                      : isLive
                        ? "Pause"
                        : "Démarrer";
                  const livePickerPanel = livePickerMode ? (
                    <div className="rounded-2xl border border-white/10 bg-[#101218]/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                          Ajouter un but
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setLivePickerMode(null);
                            setLivePickerMatchId(null);
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
                          aria-label="Fermer"
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </button>
                      </div>
                      {liveSlotMatches.length > 1 && !livePickerMatchId ? (
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          {liveSlotMatches.map((match) => (
                            <button
                              key={`live-picker-match-${match.id}`}
                              type="button"
                              onClick={() => setLivePickerMatchId(match.id)}
                              className={[
                                "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition",
                                pickerMatch.id === match.id
                                  ? "bg-violet-600 text-white"
                                  : "bg-white/5 text-white/55 hover:bg-white/10 hover:text-white",
                              ].join(" ")}
                            >
                              <span
                                className="inline-flex items-center justify-center rounded-full border border-yellow-200/30 px-1.5 py-0 text-[8px] font-semibold uppercase tracking-[0.08em] text-black shadow-[0_0_10px_rgba(250,204,21,0.18)]"
                                style={{ background: "linear-gradient(135deg, #FDE047, #FACC15)" }}
                              >
                                {match.fieldLabel}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : liveSlotMatches.length > 1 ? (
                        <div className="mb-3">
                          <span
                            className="inline-flex items-center justify-center rounded-full border border-yellow-200/30 px-1.5 py-0 text-[8px] font-semibold uppercase tracking-[0.08em] text-black shadow-[0_0_10px_rgba(250,204,21,0.18)]"
                            style={{ background: "linear-gradient(135deg, #FDE047, #FACC15)" }}
                          >
                            {pickerMatch.fieldLabel}
                          </span>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setLivePickerTeam("home")}
                          className={[
                            "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition",
                            livePickerTeam === "home"
                              ? "bg-violet-600 text-white"
                              : "bg-white/5 text-white/55 hover:bg-white/10 hover:text-white",
                          ].join(" ")}
                        >
                          {resolvedPickerMatchTeams.homeTeam}
                        </button>
                        <button
                          type="button"
                          onClick={() => setLivePickerTeam("away")}
                          className={[
                            "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition",
                            livePickerTeam === "away"
                              ? "bg-violet-600 text-white"
                              : "bg-white/5 text-white/55 hover:bg-white/10 hover:text-white",
                          ].join(" ")}
                        >
                          {resolvedPickerMatchTeams.awayTeam}
                        </button>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {Array.from({ length: 15 }, (_, index) => index + 1).map((number) => (
                          <button
                            key={`live-number-${number}`}
                            type="button"
                            onClick={() => applyLiveSelection(pickerMatch, number)}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/80 transition hover:bg-white/[0.08] hover:text-white"
                          >
                            N° {number}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null;

                  return (
                    <div className="mt-2 space-y-5">
                      {livePickerPanel ? (
                        <div className="fixed inset-0 z-[165] flex items-start justify-center bg-black/35 p-4 pt-24 backdrop-blur-[2px] xl:hidden">
                          <div className="w-full max-w-sm">
                            {livePickerPanel}
                          </div>
                        </div>
                      ) : null}
                      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-3.5 backdrop-blur-[8px] md:rounded-[28px] md:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <p className="text-xs uppercase tracking-[0.16em] text-white/45">
                            {liveTabSlot?.startTime ?? livePrimaryMatch.startTime}
                          </p>
                          <div />
                        </div>

                        <div
                          className={[
                            "mt-5 grid gap-4",
                            liveSlotMatches.length > 1
                              ? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_190px_minmax(0,1fr)]"
                              : "grid-cols-1",
                          ].join(" ")}
                        >
                          {liveSlotMatches.slice(0, 1).map((match) => {
                            const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
                            const liveScorers = liveScorersByMatch[match.id] ?? [];
                            const recentGoal = recentGoalByMatch[match.id] ?? null;
                            const resolvedTeams = getDisplayMatchTeams(match, state);

                            return (
                              <div
                                key={`live-slot-${match.id}`}
                                className={[
                                  "flex min-h-[148px] flex-col rounded-[20px] border border-white/10 bg-white/[0.02] px-3 py-3 md:min-h-[174px] md:rounded-[22px] md:px-4 md:py-3.5",
                                  recentGoal ? "animate-[live-goal-flash_650ms_ease-out]" : "",
                                ].join(" ")}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="text-left">
                                    <span
                                      className="inline-flex items-center justify-center rounded-full border border-yellow-200/30 px-1.5 py-0 text-[8px] font-semibold uppercase tracking-[0.08em] text-black shadow-[0_0_10px_rgba(250,204,21,0.18)]"
                                      style={{ background: "linear-gradient(135deg, #FDE047, #FACC15)" }}
                                    >
                                      {match.fieldLabel}
                                    </span>
                                    <p className="mt-0.5 text-[10px] text-white/40">{getCompactRoundLabel(match)}</p>
                                  </div>
                                  {isOrganizerView ? (
                                    <div className="flex shrink-0 items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => openGoalPicker(match)}
                                        className="inline-flex h-6 items-center justify-center rounded-full border border-yellow-200/30 px-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-black shadow-[0_0_10px_rgba(250,204,21,0.2)] transition hover:opacity-90 md:h-7 md:px-2.5 md:text-[10px] md:tracking-[0.14em]"
                                        style={{ background: "linear-gradient(135deg, #FDE047, #FACC15)" }}
                                      >
                                        + Goal
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                                <div className="mt-1.5 flex flex-1 items-center md:mt-2">
                                  <div className="mx-auto grid w-full max-w-[660px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 md:gap-4 xl:flex xl:max-w-[660px] xl:items-center xl:justify-center xl:gap-4">
                                    <div className="flex min-w-0 justify-end">
                                      <div className="flex max-w-full items-center justify-end text-right xl:w-[210px] xl:max-w-none">
                                        <p className="min-w-0 max-w-[150px] text-[11px] font-black leading-[1.05] tracking-[-0.03em] text-white md:max-w-[180px] md:text-[16px] xl:max-w-[210px]">
                                          {resolvedTeams.homeTeam}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-center">
                                      <div
                                        className={[
                                          "flex items-center justify-center rounded-[12px] border border-white/12 bg-white/[0.03] px-2 py-1 shadow-[0_0_18px_rgba(255,255,255,0.04)] backdrop-blur-[8px] md:rounded-[14px] md:px-3 md:py-1.5",
                                          recentGoal ? "scale-[1.03] shadow-[0_0_22px_rgba(250,204,21,0.24)] transition" : "",
                                        ].join(" ")}
                                      >
                                        <p className="whitespace-nowrap text-[19px] font-black tracking-[-0.06em] text-white md:text-[30px]">
                                          {state.homeScore ?? 0} - {state.awayScore ?? 0}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex min-w-0 justify-start">
                                      <div className="flex max-w-full items-center justify-start text-left xl:w-[210px] xl:max-w-none">
                                        <p className="min-w-0 max-w-[150px] text-[11px] font-black leading-[1.05] tracking-[-0.03em] text-white md:max-w-[180px] md:text-[16px] xl:max-w-[210px]">
                                          {resolvedTeams.awayTeam}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                {recentGoal ? (
                                  <div className="mt-1 flex justify-center">
                                    <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100 shadow-[0_0_16px_rgba(74,222,128,0.18)]">
                                      But • {getTournamentPlayerDisplayLabel(
                                        recentGoal.team === "home" ? resolvedTeams.homeTeam : resolvedTeams.awayTeam,
                                        recentGoal.number,
                                      )}
                                    </span>
                                  </div>
                                ) : null}
                                <div className="mt-2.5 flex items-center justify-start md:mt-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedLiveStatsMatchId((current) => (current === match.id ? null : match.id))
                                      }
                                      className={[
                                        "inline-flex h-7 items-center justify-center gap-1 rounded-full border px-2 transition md:h-8 md:gap-1.5 md:px-2.5",
                                        liveScorers.length > 0
                                          ? "border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.1]"
                                          : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white/75",
                                      ].join(" ")}
                                      aria-label="Voir les statistiques"
                                    >
                                      <span className="text-[12px] leading-none md:text-[13px]">⚽</span>
                                      <span className="text-[10px] font-semibold tabular-nums md:text-[11px]">{liveScorers.length}</span>
                                    </button>
                                    {isOrganizerView && liveScorers.length > 0 ? (
                                      <button
                                        type="button"
                                        onClick={() => undoLastGoal(match)}
                                        className="inline-flex h-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-2.5 text-[10px] font-semibold text-white/70 transition hover:bg-white/[0.08] hover:text-white md:h-8"
                                      >
                                        ↩ Annuler dernier but
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          <div
                            className={
                              liveSlotMatches.length > 1
                                ? "relative flex w-full justify-center xl:flex xl:w-auto xl:items-center xl:justify-center"
                                : "mt-5 flex justify-center"
                            }
                          >
                            <div className="inline-flex w-full items-center justify-between gap-1.5 rounded-[20px] border border-white/10 bg-transparent px-1.5 py-1.5 md:rounded-[22px] md:px-2.5 md:py-2.5 xl:w-auto xl:flex-col xl:items-stretch xl:justify-start xl:gap-2">
                              {isOrganizerView ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (livePrimaryDisplayState === "completed") return;
                                    if (isLive) {
                                      pauseLiveMatch(livePrimaryMatch);
                                      return;
                                    }
                                    launchLiveMatch(livePrimaryMatch);
                                  }}
                                  className={[
                                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition md:h-12 md:w-12 xl:self-center",
                                    livePrimaryDisplayState === "completed"
                                      ? "border-white/10 bg-transparent text-white/45"
                                      : isLive
                                        ? "border-violet-400/40 bg-violet-600 text-white shadow-[0_0_16px_rgba(124,58,237,0.28)] hover:bg-violet-500"
                                        : "border-violet-400/40 bg-violet-600 text-white shadow-[0_0_16px_rgba(124,58,237,0.28)] hover:bg-violet-500",
                                  ].join(" ")}
                                  aria-label={liveActionHint}
                                >
                                  {isLive ? (
                                    <span className="text-[14px] leading-none md:text-[18px]">❚❚</span>
                                  ) : livePrimaryDisplayState === "completed" ? (
                                    <span className="text-[14px] leading-none md:text-[18px]">✓</span>
                                  ) : (
                                    <svg
                                      aria-hidden="true"
                                      viewBox="0 0 24 24"
                                      className="h-4 w-4 fill-current md:h-5 md:w-5"
                                    >
                                      <path d="M8 5.5v13l10-6.5-10-6.5Z" />
                                    </svg>
                                  )}
                                </button>
                              ) : null}
                              <div
                                className={[
                                  "mx-0.5 min-w-[92px] flex-1 rounded-[14px] bg-white/[0.04] px-1.5 py-1.5 text-center shadow-[0_0_14px_rgba(255,255,255,0.06)] md:min-w-[130px] md:rounded-[18px] md:px-3 md:py-2.5 xl:mx-0 xl:min-w-[150px] xl:flex-none",
                                  isLive ? "shadow-[0_0_18px_rgba(74,222,128,0.18)]" : "",
                                ].join(" ")}
                              >
                                <div className="flex items-center justify-center gap-2">
                                  <span
                                    className={[
                                      "inline-flex h-2.5 w-2.5 rounded-full",
                                      isLive
                                        ? "animate-pulse bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]"
                                        : livePrimaryDisplayState === "completed"
                                          ? "bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.45)]"
                                          : "bg-white/30",
                                    ].join(" ")}
                                  />
                                </div>
                                <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/45">
                                  {livePrimaryDisplayState === "live"
                                    ? "LIVE"
                                    : livePrimaryDisplayState === "completed"
                                      ? "Terminé"
                                      : "En attente"}
                                </p>
                                <div className="mt-0.5 font-mono text-[17px] font-black text-white [text-shadow:0_0_10px_rgba(255,255,255,0.08)] md:text-[22px] xl:text-[26px]">
                                  {formatLiveDuration(countdownSeconds)}
                                </div>
                              </div>
                              {isOrganizerView ? (
                                <button
                                  type="button"
                                  onClick={() => requestFinishLiveMatch(livePrimaryMatch)}
                                  className={[
                                    "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-full px-2 transition md:h-10 md:gap-2 md:px-3 xl:-ml-1 xl:self-center",
                                    livePrimaryDisplayState === "live"
                                      ? "border border-rose-300/25 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25"
                                      : "border border-white/10 bg-white/8 text-white/70 hover:bg-white/12 hover:text-white",
                                  ].join(" ")}
                                  aria-label="Terminer"
                                >
                                  <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full border border-current/35 md:h-6 md:w-6">
                                    <svg
                                      aria-hidden="true"
                                      viewBox="0 0 24 24"
                                      className="h-3 w-3 fill-current md:h-4 md:w-4"
                                    >
                                      <rect x="7" y="7" width="10" height="10" rx="1.5" />
                                    </svg>
                                  </span>
                                  <span className="text-[8px] font-semibold uppercase tracking-[0.1em] md:text-[10px] md:tracking-[0.14em]">Terminer</span>
                                </button>
                              ) : (() => {
                                const liveVoteState =
                                  draft.matchStates?.[livePrimaryMatch.id] ??
                                  getDefaultMatchState();
                                const directPendingVoteMatch =
                                  publicFloatingVoteMatch && publicFloatingVoteMatch.id !== livePrimaryMatch.id
                                    ? publicFloatingVoteMatch
                                    : null;
                                const voteTargetMatch = canCurrentUserVoteMatch(livePrimaryMatch, liveVoteState)
                                  ? livePrimaryMatch
                                  : (directPendingVoteMatch ?? livePrimaryMatch);
                                const voteTargetState =
                                  voteTargetMatch.id === livePrimaryMatch.id
                                    ? liveVoteState
                                    : (publicFloatingVoteState ??
                                      draft.matchStates?.[voteTargetMatch.id] ??
                                      getDefaultMatchState());
                                const voteState = getPublicMvpVoteWindowState(voteTargetState);
                                const voteOpen = canCurrentUserVoteMatch(voteTargetMatch, voteTargetState);
                                const voteLabel =
                                  !publicVoterTeamId
                                    ? "Code équipe requis"
                                    : hasCurrentUserVotedMatch(voteTargetState, voteTargetMatch.id)
                                      ? "Vote envoyé"
                                      : voteState === "locked"
                                        ? "Vote après match"
                                        : voteState === "closed"
                                          ? "Vote fermé"
                                          : "Voter";

                                return (
                                  <button
                                    type="button"
                                    disabled={!voteOpen}
                                    onClick={() => openPublicMvpVoteForMatch(voteTargetMatch)}
                                    className={[
                                      "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.12em] transition md:h-11 md:px-4",
                                      voteOpen
                                        ? "border-fuchsia-300/35 bg-violet-600 text-white shadow-[0_0_24px_rgba(124,58,237,0.28)] hover:bg-violet-500"
                                        : "cursor-not-allowed border-white/10 bg-white/[0.04] text-white/35",
                                    ].join(" ")}
                                  >
                                    <span>⭐</span>
                                    <span>{voteLabel}</span>
                                  </button>
                                );
                              })()}
                            </div>
                          </div>

                          {liveSlotMatches.slice(1, 2).map((match) => {
                            const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
                            const liveScorers = liveScorersByMatch[match.id] ?? [];
                            const recentGoal = recentGoalByMatch[match.id] ?? null;
                            const resolvedTeams = getDisplayMatchTeams(match, state);

                            return (
                              <div
                                key={`live-slot-${match.id}`}
                                className={[
                                  "flex min-h-[148px] flex-col rounded-[20px] border border-white/10 bg-white/[0.02] px-3 py-3 md:min-h-[174px] md:rounded-[22px] md:px-4 md:py-3.5",
                                  recentGoal ? "animate-[live-goal-flash_650ms_ease-out]" : "",
                                ].join(" ")}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="text-left">
                                    <span
                                      className="inline-flex items-center justify-center rounded-full border border-yellow-200/30 px-1.5 py-0 text-[8px] font-semibold uppercase tracking-[0.08em] text-black shadow-[0_0_10px_rgba(250,204,21,0.18)]"
                                      style={{ background: "linear-gradient(135deg, #FDE047, #FACC15)" }}
                                    >
                                      {match.fieldLabel}
                                    </span>
                                    <p className="mt-0.5 text-[10px] text-white/40">{getCompactRoundLabel(match)}</p>
                                  </div>
                                  {isOrganizerView ? (
                                    <div className="flex shrink-0 items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => openGoalPicker(match)}
                                        className="inline-flex h-6 items-center justify-center rounded-full border border-yellow-200/30 px-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-black shadow-[0_0_10px_rgba(250,204,21,0.2)] transition hover:opacity-90 md:h-7 md:px-2.5 md:text-[10px] md:tracking-[0.14em]"
                                        style={{ background: "linear-gradient(135deg, #FDE047, #FACC15)" }}
                                      >
                                        + Goal
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                                <div className="mt-1.5 flex flex-1 items-center md:mt-2">
                                  <div className="mx-auto grid w-full max-w-[660px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 md:gap-4 xl:flex xl:max-w-[660px] xl:items-center xl:justify-center xl:gap-4">
                                    <div className="flex min-w-0 justify-end">
                                      <div className="flex max-w-full items-center justify-end text-right xl:w-[210px] xl:max-w-none">
                                        <p className="min-w-0 max-w-[150px] text-[11px] font-black leading-[1.05] tracking-[-0.03em] text-white md:max-w-[180px] md:text-[16px] xl:max-w-[210px]">
                                          {resolvedTeams.homeTeam}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-center">
                                      <div
                                        className={[
                                          "flex items-center justify-center rounded-[12px] border border-white/12 bg-white/[0.03] px-2 py-1 shadow-[0_0_18px_rgba(255,255,255,0.04)] backdrop-blur-[8px] md:rounded-[14px] md:px-3 md:py-1.5",
                                          recentGoal ? "scale-[1.03] shadow-[0_0_22px_rgba(250,204,21,0.24)] transition" : "",
                                        ].join(" ")}
                                      >
                                        <p className="whitespace-nowrap text-[19px] font-black tracking-[-0.06em] text-white md:text-[30px]">
                                          {state.homeScore ?? 0} - {state.awayScore ?? 0}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex min-w-0 justify-start">
                                      <div className="flex max-w-full items-center justify-start text-left xl:w-[210px] xl:max-w-none">
                                        <p className="min-w-0 max-w-[150px] text-[11px] font-black leading-[1.05] tracking-[-0.03em] text-white md:max-w-[180px] md:text-[16px] xl:max-w-[210px]">
                                          {resolvedTeams.awayTeam}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                {recentGoal ? (
                                  <div className="mt-1 flex justify-center">
                                    <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100 shadow-[0_0_16px_rgba(74,222,128,0.18)]">
                                      But • {getTournamentPlayerDisplayLabel(
                                        recentGoal.team === "home" ? resolvedTeams.homeTeam : resolvedTeams.awayTeam,
                                        recentGoal.number,
                                      )}
                                    </span>
                                  </div>
                                ) : null}
                                <div className="mt-2.5 flex items-center justify-start md:mt-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedLiveStatsMatchId((current) => (current === match.id ? null : match.id))
                                      }
                                      className={[
                                        "inline-flex h-7 items-center justify-center gap-1 rounded-full border px-2 transition md:h-8 md:gap-1.5 md:px-2.5",
                                        liveScorers.length > 0
                                          ? "border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.1]"
                                          : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white/75",
                                      ].join(" ")}
                                      aria-label="Voir les statistiques"
                                    >
                                      <span className="text-[12px] leading-none md:text-[13px]">⚽</span>
                                      <span className="text-[10px] font-semibold tabular-nums md:text-[11px]">{liveScorers.length}</span>
                                    </button>
                                    {isOrganizerView && liveScorers.length > 0 ? (
                                      <button
                                        type="button"
                                        onClick={() => undoLastGoal(match)}
                                        className="inline-flex h-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-2.5 text-[10px] font-semibold text-white/70 transition hover:bg-white/[0.08] hover:text-white md:h-8"
                                      >
                                        ↩ Annuler dernier but
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>


                        {pendingPenaltyMatches.length > 0 && !activePenaltyMatch ? (
                          <div className="fixed inset-0 z-[190] flex items-start justify-center bg-black/60 p-2 pt-3 backdrop-blur-sm animate-[live-fade-in_180ms_ease-out] md:items-center md:p-4">
                            <div className="flex max-h-[calc(100vh-0.5rem)] w-full max-w-3xl flex-col rounded-[22px] border border-white/10 bg-[#101218] p-3 shadow-[0_24px_100px_rgba(0,0,0,0.5)] animate-[live-modal-in_220ms_ease-out] md:max-h-[calc(100vh-2.5rem)] md:rounded-[30px] md:p-5">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">Séance de tir au but</p>
                                  <h4 className="mt-1 text-sm font-semibold text-white md:text-base">
                                    Termine d&apos;abord les penalties avant la fin des matchs
                                  </h4>
                                </div>
                                <button
                                  type="button"
                                  onClick={closePendingPenaltyFlow}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white md:h-8 md:w-8"
                                  aria-label="Fermer"
                                >
                                  <svg
                                    aria-hidden="true"
                                    viewBox="0 0 24 24"
                                    className="h-3 w-3 md:h-3.5 md:w-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                  </svg>
                                </button>
                              </div>

                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                {pendingPenaltyMatches.map((match) => {
                                  const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
                                  const resolvedTeams = getDisplayMatchTeams(match, state);
                                  const resolved = getResolvedKnockoutOutcome(state);

                                  return (
                                    <div
                                      key={`pending-penalty-${match.id}`}
                                      className="flex h-full flex-col rounded-[20px] border border-yellow-200/18 bg-yellow-400/[0.07] p-3"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span
                                          className="inline-flex items-center justify-center rounded-full border border-yellow-200/30 px-2 py-px text-[9px] font-semibold uppercase tracking-[0.1em] text-black"
                                          style={{ background: "linear-gradient(135deg, #FDE047, #FACC15)" }}
                                        >
                                          {match.fieldLabel}
                                        </span>
                                        {resolved ? (
                                          <span className="rounded-full border border-emerald-300/20 bg-emerald-500/12 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-emerald-100">
                                            Valide
                                          </span>
                                        ) : null}
                                      </div>
                                      <p className="mt-3 flex-1 text-center text-sm font-semibold text-white">
                                        {resolvedTeams.homeTeam} <span className="text-white/35">vs</span> {resolvedTeams.awayTeam}
                                      </p>
                                      {pendingPenaltyMatches.length === 1 ? (
                                        <button
                                          type="button"
                                          onClick={() => openPenaltyEditor([match.id])}
                                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-[16px] border border-rose-300/25 bg-rose-500/12 px-4 py-3 text-center transition hover:bg-rose-500/18"
                                        >
                                          <span className="text-[12px] font-semibold text-rose-100">
                                            ⚽ LANCER LA SÉANCE DE TIRS AU BUT
                                          </span>
                                        </button>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>

                              {pendingPenaltyMatches.length > 1 ? (
                                <div className="mt-3 flex justify-center">
                                  <button
                                    type="button"
                                    onClick={() => openPenaltyEditor(pendingPenaltyMatches.map((match) => match.id))}
                                    className="flex min-w-[320px] items-center justify-center gap-2 rounded-[16px] border border-rose-300/25 bg-rose-500/12 px-5 py-3 text-center transition hover:bg-rose-500/18"
                                  >
                                    <span className="text-[12px] font-semibold text-rose-100">
                                      ⚽ LANCER LA SÉANCE DE TIRS AU BUT
                                    </span>
                                  </button>
                                </div>
                              ) : null}

                              <div className="mt-4 flex justify-end border-t border-white/8 pt-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!pendingReviewSlotMatchIds || !allPendingPenaltyResolved) return;
                                    setCompletedLiveSlotMatchIds(pendingReviewSlotMatchIds);
                                    setPendingPenaltySlotMatchIds(null);
                                    setPendingReviewSlotMatchIds(null);
                                  }}
                                  disabled={!allPendingPenaltyResolved}
                                  className={[
                                    "rounded-full border px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition",
                                    !allPendingPenaltyResolved
                                      ? "cursor-not-allowed border-white/10 bg-white/[0.04] text-white/35"
                                      : "border border-fuchsia-300/30 bg-violet-600 text-white hover:bg-violet-500",
                                  ].join(" ")}
                                >
                                  Continuer
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {activePenaltyEditorMatches.length > 0 ? (
                          <div className="fixed inset-0 z-[191] flex items-start justify-center bg-black/70 p-2 pt-3 backdrop-blur-sm animate-[live-fade-in_180ms_ease-out] md:items-center md:p-4">
                            <div className="w-full max-w-4xl rounded-[24px] border border-white/10 bg-[#101218] p-3 shadow-[0_24px_100px_rgba(0,0,0,0.5)] animate-[live-modal-in_220ms_ease-out] md:rounded-[30px] md:p-5">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                                    Séance de tir au but
                                  </p>
                                  <h4 className="mt-1 text-sm font-semibold text-white md:text-base">
                                    {activePenaltyEditorMatches.length > 1
                                      ? "Gère les deux terrains avant de revenir à la fin des matchs"
                                      : "Valide la séance avant de revenir à la fin des matchs"}
                                  </h4>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setActivePenaltyMatchId(null)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white md:h-8 md:w-8"
                                  aria-label="Fermer"
                                >
                                  <svg
                                    aria-hidden="true"
                                    viewBox="0 0 24 24"
                                    className="h-3 w-3 md:h-3.5 md:w-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                  </svg>
                                </button>
                              </div>

                              <div className={["mt-4 grid gap-3", activePenaltyEditorMatches.length > 1 ? "xl:grid-cols-2" : ""].join(" ")}>
                                {activePenaltyEditorMatches.map((match) => {
                                  const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
                                  const resolvedTeams = getDisplayMatchTeams(match, state);
                                  const penaltyShootout = state.penaltyShootout;
                                  const penaltyScore = getPenaltyShootoutScore(penaltyShootout);
                                  const penaltyWinner = getResolvedKnockoutOutcome(state)?.winner ?? null;
                                  const isPenaltyResolved = penaltyWinner !== null;
                                  const nextPenaltyTeam = getNextPenaltyTeam(penaltyShootout);
                                  const selectedPenaltyTeam =
                                    livePenaltyTeamByMatch[match.id] ?? nextPenaltyTeam;
                                  const penaltyEvents = penaltyShootout?.events ?? [];
                                  const homePenaltyEvents = penaltyEvents.filter((event) => event.team === "home");
                                  const awayPenaltyEvents = penaltyEvents.filter((event) => event.team === "away");
                                  const penaltyNumberValue = livePenaltyNumberByMatch[match.id] ?? "";
                                  const penaltyTargetAttempts = getPenaltyTargetAttempts(
                                    state,
                                    draft.penaltyShooters ?? 5,
                                  );
                                  const penaltyStep = penaltyStepByMatch[match.id] ?? "setup";
                                  const currentPenaltyTeamName =
                                    selectedPenaltyTeam === "home"
                                      ? resolvedTeams.homeTeam
                                      : resolvedTeams.awayTeam;
                                  const recentPenaltyFeedback = recentPenaltyFeedbackByMatch[match.id] ?? null;

                                  return (
                                    <div
                                      key={`active-penalty-${match.id}`}
                                      className={[
                                        "rounded-[18px] border p-3 transition",
                                        isPenaltyResolved
                                          ? "border-white/8 bg-black/10 opacity-80"
                                          : "border-white/14 bg-black/24 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_0_28px_rgba(255,255,255,0.04)]",
                                      ].join(" ")}
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span
                                          className="inline-flex items-center justify-center rounded-full border border-yellow-200/30 px-2 py-px text-[9px] font-semibold uppercase tracking-[0.1em] text-black"
                                          style={{ background: "linear-gradient(135deg, #FDE047, #FACC15)" }}
                                        >
                                          {match.fieldLabel}
                                        </span>
                                        {penaltyWinner ? (
                                          <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-emerald-100">
                                            Valide
                                          </span>
                                        ) : null}
                                      </div>

                                      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                                        <div className="min-w-0 text-right">
                                          <p className="truncate text-[12px] font-semibold text-white/78">
                                            {resolvedTeams.homeTeam}
                                          </p>
                                          <div className="mt-2 flex min-h-[10px] items-center justify-end gap-1">
                                            {homePenaltyEvents.map((event) => (
                                              <span
                                                key={`${match.id}-home-penalty-${event.order}`}
                                                className={[
                                                  "inline-flex h-2.5 w-2.5 rounded-full",
                                                  recentPenaltyFeedback?.order === event.order
                                                    ? "animate-[live-goal-pop_240ms_ease-out]"
                                                    : "",
                                                  event.scored
                                                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.38)]"
                                                    : "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.3)]",
                                                ].join(" ")}
                                              />
                                            ))}
                                          </div>
                                        </div>
                                        <div
                                          className={[
                                            "rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-center transition",
                                            recentPenaltyFeedback?.scored
                                              ? "animate-[live-goal-pop_280ms_ease-out] shadow-[0_0_18px_rgba(74,222,128,0.2)]"
                                              : "",
                                          ].join(" ")}
                                        >
                                          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/45">Penalty</p>
                                          <p className="text-base font-black text-white md:text-lg">
                                            {penaltyScore.homeScore} - {penaltyScore.awayScore}
                                          </p>
                                        </div>
                                        <div className="min-w-0 text-left">
                                          <p className="truncate text-[12px] font-semibold text-white/78">
                                            {resolvedTeams.awayTeam}
                                          </p>
                                          <div className="mt-2 flex min-h-[10px] items-center justify-start gap-1">
                                            {awayPenaltyEvents.map((event) => (
                                              <span
                                                key={`${match.id}-away-penalty-${event.order}`}
                                                className={[
                                                  "inline-flex h-2.5 w-2.5 rounded-full",
                                                  recentPenaltyFeedback?.order === event.order
                                                    ? "animate-[live-goal-pop_240ms_ease-out]"
                                                    : "",
                                                  event.scored
                                                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.38)]"
                                                    : "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.3)]",
                                                ].join(" ")}
                                              />
                                            ))}
                                          </div>
                                        </div>
                                      </div>

                                      {!penaltyWinner ? (
                                        <div className="mt-3 flex items-center justify-center">
                                          <div
                                            className="rounded-full border border-yellow-200/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-black shadow-[0_0_12px_rgba(250,204,21,0.18)]"
                                            style={{ background: "linear-gradient(135deg, #FDE047, #FACC15)" }}
                                          >
                                            Tireur : {currentPenaltyTeamName}
                                          </div>
                                        </div>
                                      ) : null}

                                      {penaltyStep === "setup" && !isPenaltyResolved ? (
                                        <div className="mt-3">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
                                              Nb de tireurs
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setPenaltyStepByMatch((current) => ({
                                                  ...current,
                                                  [match.id]: "team",
                                                }))
                                              }
                                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/80 transition hover:bg-white/[0.1] hover:text-white"
                                              aria-label="Etape suivante"
                                            >
                                              <svg
                                                aria-hidden="true"
                                                viewBox="0 0 24 24"
                                                className="h-4 w-4"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2.2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                              >
                                                <path d="m9 18 6-6-6-6" />
                                              </svg>
                                            </button>
                                          </div>
                                          <div className="mt-2 flex justify-center">
                                            <input
                                              type="number"
                                              min={1}
                                              max={10}
                                              inputMode="numeric"
                                              value={String(penaltyTargetAttempts)}
                                              onChange={(event) => {
                                                const nextTarget = Math.max(1, Number(event.target.value) || 1);
                                                updateMatchState(match.id, {
                                                  penaltyShootout: {
                                                    targetAttempts: nextTarget,
                                                    events: penaltyShootout?.events ?? [],
                                                    winner:
                                                      getPenaltyWinnerFromEvents(
                                                        penaltyShootout?.events ?? [],
                                                        nextTarget,
                                                      ) ?? null,
                                                  },
                                                });
                                              }}
                                              className="h-9 w-[110px] rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-center text-[12px] font-semibold text-white outline-none transition hover:bg-white/[0.06] focus:border-violet-400/35"
                                            />
                                          </div>
                                        </div>
                                      ) : null}

                                      {penaltyStep === "team" && !isPenaltyResolved ? (
                                        <div className="mt-3">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
                                              {penaltyEvents.length + 1}e tireur
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setPenaltyStepByMatch((current) => ({
                                                  ...current,
                                                  [match.id]: "attempt",
                                                }))
                                              }
                                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/80 transition hover:bg-white/[0.1] hover:text-white"
                                              aria-label="Etape suivante"
                                            >
                                              <svg
                                                aria-hidden="true"
                                                viewBox="0 0 24 24"
                                                className="h-4 w-4"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2.2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                              >
                                                <path d="m9 18 6-6-6-6" />
                                              </svg>
                                            </button>
                                          </div>
                                          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setLivePenaltyTeamByMatch((current) => ({
                                                  ...current,
                                                  [match.id]: "home",
                                                }))
                                              }
                                              className={[
                                                "min-w-[132px] rounded-full px-3 py-1 text-[10px] font-semibold transition",
                                                selectedPenaltyTeam === "home"
                                                  ? "bg-violet-600 text-white shadow-[0_0_12px_rgba(124,58,237,0.3)]"
                                                  : "border border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.08] hover:text-white",
                                              ].join(" ")}
                                            >
                                              {resolvedTeams.homeTeam}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setLivePenaltyTeamByMatch((current) => ({
                                                  ...current,
                                                  [match.id]: "away",
                                                }))
                                              }
                                              className={[
                                                "min-w-[132px] rounded-full px-3 py-1 text-[10px] font-semibold transition",
                                                selectedPenaltyTeam === "away"
                                                  ? "bg-violet-600 text-white shadow-[0_0_12px_rgba(124,58,237,0.3)]"
                                                  : "border border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.08] hover:text-white",
                                              ].join(" ")}
                                            >
                                              {resolvedTeams.awayTeam}
                                            </button>
                                          </div>
                                        </div>
                                      ) : null}

                                      {penaltyStep === "attempt" && !isPenaltyResolved ? (
                                        <div className="mt-3">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
                                              Tir
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setPenaltyStepByMatch((current) => ({
                                                  ...current,
                                                  [match.id]: "team",
                                                }))
                                              }
                                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/80 transition hover:bg-white/[0.1] hover:text-white"
                                              aria-label="Retour choix équipe"
                                            >
                                              <svg
                                                aria-hidden="true"
                                                viewBox="0 0 24 24"
                                                className="h-4 w-4"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2.2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                              >
                                                <path d="m15 18-6-6 6-6" />
                                              </svg>
                                            </button>
                                          </div>
                                          <div className="mt-2 flex items-center justify-center gap-2">
                                            <input
                                              type="number"
                                              min={1}
                                              max={15}
                                              inputMode="numeric"
                                              placeholder="N° joueur"
                                              value={penaltyNumberValue}
                                              onChange={(event) =>
                                                setLivePenaltyNumberByMatch((current) => ({
                                                  ...current,
                                                  [match.id]: event.target.value,
                                                }))
                                              }
                                              className="h-9 w-[130px] rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-center text-[12px] font-medium text-white outline-none transition hover:bg-white/[0.06] focus:border-violet-400/35"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => recordPenaltyAttempt(match, true)}
                                              className="inline-flex h-9 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-500/12 px-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100 transition hover:bg-emerald-500/18"
                                            >
                                              But
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => recordPenaltyAttempt(match, false)}
                                              className="inline-flex h-9 items-center justify-center rounded-full border border-rose-300/25 bg-rose-500/12 px-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-100 transition hover:bg-rose-500/18"
                                            >
                                              Raté
                                            </button>
                                          </div>
                                        </div>
                                      ) : null}

                                      {penaltyWinner ? (
                                        <div className="mt-3 rounded-[16px] border border-emerald-300/25 bg-emerald-500/12 px-3 py-2 text-center shadow-[0_0_24px_rgba(74,222,128,0.14)]">
                                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/80">
                                            Seance terminee
                                          </p>
                                          <p className="mt-1 text-[12px] font-semibold text-emerald-50">
                                            ✅ {penaltyWinner === "home" ? resolvedTeams.homeTeam : resolvedTeams.awayTeam} gagne aux penalties
                                          </p>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="mt-4 flex justify-end border-t border-white/8 pt-3">
                                <button
                                  type="button"
                                  onClick={commitPenaltyReview}
                                  disabled={!activePenaltyEditorMatches.every((match) => {
                                    const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
                                    return getResolvedKnockoutOutcome(state) !== null;
                                  })}
                                  className={[
                                    "rounded-full border px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition",
                                    !activePenaltyEditorMatches.every((match) => {
                                      const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
                                      return getResolvedKnockoutOutcome(state) !== null;
                                    })
                                      ? "cursor-not-allowed border-white/8 bg-white/[0.03] text-white/28"
                                      : "border border-fuchsia-300/30 bg-violet-600 text-white shadow-[0_0_18px_rgba(124,58,237,0.18)] hover:bg-violet-500",
                                  ].join(" ")}
                                >
                                  Valider penalty
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {completedLiveReviewMatches.length > 0 ? (
                          <div className="fixed inset-0 z-[190] flex items-start justify-center bg-black/60 p-2 pt-3 backdrop-blur-sm animate-[live-fade-in_180ms_ease-out] md:items-center md:p-4">
                            <div className="flex max-h-[calc(100vh-0.5rem)] w-full max-w-4xl flex-col rounded-[22px] border border-white/10 bg-[#101218] p-2.5 shadow-[0_24px_100px_rgba(0,0,0,0.5)] animate-[live-modal-in_220ms_ease-out] md:max-h-[calc(100vh-2.5rem)] md:rounded-[30px] md:p-5">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">Fin matchs</p>
                                  <h4 className="text-sm font-semibold text-white md:text-base">Choisir le meilleur joueur</h4>
                                </div>
                                <button
                                  type="button"
                                  onClick={closeCompletedReview}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white md:h-8 md:w-8"
                                  aria-label="Fermer"
                                >
                                  <svg
                                    aria-hidden="true"
                                    viewBox="0 0 24 24"
                                    className="h-3 w-3 md:h-3.5 md:w-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                  </svg>
                                </button>
                              </div>
                              {isOrganizerView && getMissingAdminMvpVoteMatches().length > 0 ? (
                                <div
                                  className={[
                                    "mt-3 rounded-[18px] border px-3 py-2 text-sm font-semibold",
                                    mandatoryMvpWarning
                                      ? "border-rose-300/35 bg-rose-500/15 text-rose-100 shadow-[0_0_24px_rgba(244,63,94,0.16)]"
                                      : "border-amber-300/25 bg-amber-500/12 text-amber-100",
                                  ].join(" ")}
                                >
                                  Vote MVP obligatoire avant de passer au match suivant.
                                </div>
                              ) : null}

                              <div className="mt-2 grid flex-1 gap-2 overflow-y-auto pb-2 xl:grid-cols-2">
                                {completedLiveReviewMatches.map((match) => {
                                  const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
                                  const selectedMvp = isOrganizerView ? getWeightedMvp(state) : null;
                                  const allowedVoteSides = getAllowedVoteSides(match);
                                  const requestedSelectedTeam =
                                    liveReviewTeamByMatch[match.id] ?? selectedMvp?.team ?? allowedVoteSides[0] ?? "home";
                                  const selectedTeam = allowedVoteSides.includes(requestedSelectedTeam)
                                    ? requestedSelectedTeam
                                    : allowedVoteSides[0] ?? requestedSelectedTeam;
                                  const selectedNumberValue = liveReviewNumberByMatch[match.id] ?? "";
                                  const resolvedTeams = getDisplayMatchTeams(match, state);
                                  const penaltyOutcome = getResolvedKnockoutOutcome(state);
                                  const penaltyScore = getPenaltyShootoutScore(state.penaltyShootout);
                                  const penaltyWinnerTeam = penaltyOutcome?.winner ?? null;
                                  const publicMvpVoteExpired =
                                    !isOrganizerView && getPublicMvpVoteWindowState(state) === "closed";
                                  const mvpVoteScore = selectedMvp
                                    ? (state.mvpVotes ?? [])
                                        .filter(
                                          (vote) =>
                                            vote.team === selectedMvp.team &&
                                            vote.number === selectedMvp.number,
                                        )
                                        .reduce((total, vote) => total + vote.weight, 0)
                                    : 0;

                                  return (
                                    <div
                                      key={`live-review-${match.id}`}
                                      className="rounded-[16px] border border-white/10 bg-white/[0.03] p-2 md:rounded-[20px] md:p-3"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span
                                          className="inline-flex items-center justify-center rounded-full border border-yellow-200/30 px-2 py-px text-[9px] font-semibold uppercase tracking-[0.1em] text-black shadow-[0_0_10px_rgba(250,204,21,0.18)]"
                                          style={{ background: "linear-gradient(135deg, #FDE047, #FACC15)" }}
                                        >
                                          {match.fieldLabel}
                                        </span>
                                        {isOrganizerView ? (
                                          <button
                                            type="button"
                                            onClick={() => promptReviewScoreEdit(match)}
                                            className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/75 transition hover:bg-white/[0.08] hover:text-white"
                                          >
                                            Modifier le score
                                          </button>
                                        ) : null}
                                      </div>

                                      <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                                        <div className="min-w-0 text-right">
                                          <p className="truncate text-[13px] font-semibold text-white">{resolvedTeams.homeTeam}</p>
                                          {penaltyWinnerTeam === "home" ? (
                                            <p className="mt-1 text-[9px] font-medium text-emerald-200/90">
                                              Victoire aux penalties
                                              <span className="ml-1 text-[8px] text-emerald-100/70">
                                                ({penaltyScore.homeScore} - {penaltyScore.awayScore})
                                              </span>
                                            </p>
                                          ) : null}
                                        </div>
                                        <div className="flex items-center justify-center">
                                          <div className="rounded-[10px] border border-white/10 bg-black/20 px-2 py-1">
                                            <span className="min-w-[28px] text-center text-[13px] font-black text-white md:text-lg">
                                              {state.homeScore ?? 0} - {state.awayScore ?? 0}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="min-w-0 text-left">
                                          <p className="truncate text-[13px] font-semibold text-white">{resolvedTeams.awayTeam}</p>
                                          {penaltyWinnerTeam === "away" ? (
                                            <p className="mt-1 text-[9px] font-medium text-emerald-200/90">
                                              Victoire aux penalties
                                              <span className="ml-1 text-[8px] text-emerald-100/70">
                                                ({penaltyScore.homeScore} - {penaltyScore.awayScore})
                                              </span>
                                            </p>
                                          ) : null}
                                        </div>
                                      </div>

                                      <div className="mt-2 border-t border-white/8 pt-1.5">
                                        <div className="flex items-center justify-between gap-3">
                                          <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
                                            Meilleur joueur
                                          </label>
                                          {selectedMvp ? (
                                            <div className="rounded-full border border-violet-400/25 bg-violet-500/12 px-2 py-0.5 text-[9px] font-medium text-violet-100">
                                              {selectedMvp.team === "home" ? resolvedTeams.homeTeam : resolvedTeams.awayTeam} • N°{selectedMvp.number}
                                              {mvpVoteScore > 0 ? ` • ${mvpVoteScore} pts` : ""}
                                            </div>
                                          ) : null}
                                        </div>
                                        <div className="mt-1 rounded-[12px] border border-white/10 bg-black/20 p-1.5">
                                          {publicMvpVoteExpired ? (
                                            <p className="py-2 text-center text-[10px] font-medium text-white/45">
                                              Vote fermé.
                                            </p>
                                          ) : allowedVoteSides.length > 0 ? (
                                            <>
                                              <div className="flex flex-wrap items-center justify-center gap-1">
                                                {allowedVoteSides.includes("home") ? (
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setLiveReviewTeamByMatch((current) => ({
                                                        ...current,
                                                        [match.id]: "home",
                                                      }))
                                                    }
                                                    className={[
                                                      "min-w-[118px] rounded-full px-2 py-0.5 text-[8px] font-semibold transition",
                                                      selectedTeam === "home"
                                                        ? "bg-violet-600 text-white shadow-[0_0_12px_rgba(124,58,237,0.3)]"
                                                        : "border border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.08] hover:text-white",
                                                    ].join(" ")}
                                                  >
                                                    {resolvedTeams.homeTeam}
                                                  </button>
                                                ) : null}
                                                {allowedVoteSides.includes("away") ? (
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setLiveReviewTeamByMatch((current) => ({
                                                        ...current,
                                                        [match.id]: "away",
                                                      }))
                                                    }
                                                    className={[
                                                      "min-w-[118px] rounded-full px-2 py-0.5 text-[8px] font-semibold transition",
                                                      selectedTeam === "away"
                                                        ? "bg-violet-600 text-white shadow-[0_0_12px_rgba(124,58,237,0.3)]"
                                                        : "border border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.08] hover:text-white",
                                                    ].join(" ")}
                                                  >
                                                    {resolvedTeams.awayTeam}
                                                  </button>
                                                ) : null}
                                              </div>
                                              <div className="mt-1.5 flex justify-center">
                                                <input
                                                  type="number"
                                                  min={1}
                                                  max={15}
                                                  inputMode="numeric"
                                                  placeholder="N° joueur"
                                                  value={selectedNumberValue}
                                                  onChange={(event) =>
                                                    setLiveReviewNumberByMatch((current) => ({
                                                      ...current,
                                                      [match.id]: event.target.value,
                                                    }))
                                                  }
                                                  onBlur={(event) =>
                                                    commitLiveReviewNumber(match.id, selectedTeam, event.target.value)
                                                  }
                                                  onKeyDown={(event) => {
                                                    if (event.key === "Enter") {
                                                      commitLiveReviewNumber(
                                                        match.id,
                                                        selectedTeam,
                                                        (event.currentTarget as HTMLInputElement).value,
                                                      );
                                                    }
                                                  }}
                                                  className="h-7 w-[112px] rounded-2xl border border-white/10 bg-white/[0.04] px-2.5 text-center text-[11px] font-medium text-white outline-none transition hover:bg-white/[0.06] focus:border-violet-400/35"
                                                />
                                              </div>
                                            </>
                                          ) : (
                                            <p className="py-2 text-center text-[10px] font-medium text-white/45">
                                              Aucun joueur éligible au vote pour ce match.
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="mt-2 flex shrink-0 justify-end border-t border-white/8 pt-3">
                                <button
                                  type="button"
                                  onClick={goToNextMatchAfterReview}
                                  aria-disabled={hasMissingAdminMvpVote()}
                                  className={[
                                    "rounded-full border px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition",
                                    hasMissingAdminMvpVote()
                                      ? "border-rose-300/25 bg-rose-500/12 text-rose-100 hover:bg-rose-500/18"
                                      : "border-fuchsia-300/30 bg-violet-600 text-white hover:bg-violet-500",
                                  ].join(" ")}
                                >
                                  Match suivant
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}

                                {scoreEditorMatch ? (
                          <div className="fixed inset-0 z-[195] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm animate-[live-fade-in_180ms_ease-out]">
                            <div className="w-full max-w-sm rounded-[24px] border border-white/10 bg-[#101218] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] animate-[live-modal-in_220ms_ease-out]">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                                    {scoreEditorMatch.fieldLabel}
                                  </p>
                                  <h4 className="mt-1 text-base font-semibold text-white">Modifier le score</h4>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setScoreEditorMatchId(null)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
                                  aria-label="Fermer"
                                >
                                  <svg
                                    aria-hidden="true"
                                    viewBox="0 0 24 24"
                                    className="h-3 w-3"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                  </svg>
                                </button>
                              </div>

                              <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-white">
                                    {
                                      getDisplayMatchTeams(
                                        scoreEditorMatch,
                                        draft.matchStates?.[scoreEditorMatch.id] ?? getDefaultMatchState(),
                                      ).homeTeam
                                    }
                                  </p>
                                  <input
                                    type="number"
                                    min={0}
                                    inputMode="numeric"
                                    value={scoreEditorHomeValue}
                                    onChange={(event) => setScoreEditorHomeValue(event.target.value)}
                                    className="mt-2 h-10 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-center text-sm font-semibold text-white outline-none transition hover:bg-white/[0.06] focus:border-violet-400/35"
                                  />
                                </div>
                                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                                  Score
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-white">
                                    {
                                      getDisplayMatchTeams(
                                        scoreEditorMatch,
                                        draft.matchStates?.[scoreEditorMatch.id] ?? getDefaultMatchState(),
                                      ).awayTeam
                                    }
                                  </p>
                                  <input
                                    type="number"
                                    min={0}
                                    inputMode="numeric"
                                    value={scoreEditorAwayValue}
                                    onChange={(event) => setScoreEditorAwayValue(event.target.value)}
                                    className="mt-2 h-10 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-center text-sm font-semibold text-white outline-none transition hover:bg-white/[0.06] focus:border-violet-400/35"
                                  />
                                </div>
                              </div>

                              <div className="mt-4 flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setScoreEditorMatchId(null)}
                                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                                >
                                  Annuler
                                </button>
                                <button
                                  type="button"
                                  onClick={commitReviewScoreEdit}
                                  className="rounded-full border border-fuchsia-300/30 bg-violet-600 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-violet-500"
                                >
                                  Valider
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {livePickerPanel ? <div className="mt-5 hidden xl:block">{livePickerPanel}</div> : null}

                      </div>

                      <div className="overflow-hidden rounded-full border border-white/10 bg-white/[0.03] px-4 py-3">
                        <div className="flex items-center gap-4">
                          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                            Prochain match
                          </span>
                          {canGroupCurrentAndNextSlot ? (
                            <button
                              type="button"
                              onClick={groupCurrentAndNextSlot}
                              className="shrink-0 rounded-full border border-violet-300/25 bg-violet-600/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-violet-500"
                            >
                              Grouper les matchs
                            </button>
                          ) : null}
                          {nextLiveSlot?.matches.length ? (
                            <div className="min-w-0 flex-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
                              <div className="flex w-max snap-x snap-mandatory items-center gap-3 pr-2 [&::-webkit-scrollbar]:hidden">
                                {nextLiveSlot.matches.map((match, index) => {
                                  const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
                                  const resolvedTeams = getDisplayMatchTeams(match, state);

                                  return (
                                    <Fragment key={`live-upcoming-${match.id}`}>
                                      {index > 0 ? (
                                        <span
                                          aria-hidden="true"
                                          className="h-5 w-px shrink-0 bg-gradient-to-b from-transparent via-violet-400/35 to-transparent"
                                        />
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={() => setSelectedLiveMatchId(match.id)}
                                        className="shrink-0 snap-start rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] font-medium text-white/78 transition hover:bg-white/[0.08] hover:text-white"
                                      >
                                        <span className="font-semibold text-white/88">{match.fieldLabel}</span> •{" "}
                                        {resolvedTeams.homeTeam} vs {resolvedTeams.awayTeam}
                                      </button>
                                    </Fragment>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-white/40">Aucun prochain match.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-slate-500">
                    Aucun match disponible pour le live.
                  </div>
                )}
              </section>
            </div>
            )
          ) : null}

          {activeTab === "share" ? (
            isOrganizerView ? (
              <div className="space-y-6">
                <section className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-white">Partage</p>
                      <p className="mt-1 text-sm text-white/55">
                        Activez les accès Coach et Parent, générez les liens publics et suivez les retours.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setShareSettings((current) => ({
                            ...current,
                            tournamentPublished: !current.tournamentPublished,
                          }))
                        }
                        className={[
                          "rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
                          shareSettings.tournamentPublished
                            ? "border border-emerald-300/25 bg-emerald-500/15 text-emerald-100"
                            : "border border-amber-300/25 bg-amber-500/12 text-amber-100",
                        ].join(" ")}
                      >
                        {shareSettings.tournamentPublished ? "Tournoi publié" : "Tournoi non publié"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setShareSettings((current) => ({
                            ...current,
                            votesEnabled: !current.votesEnabled,
                          }))
                        }
                        className={[
                          "rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
                          shareSettings.votesEnabled
                            ? "border border-sky-300/25 bg-sky-500/15 text-sky-100"
                            : "border border-white/10 bg-white/5 text-slate-300",
                        ].join(" ")}
                      >
                        {shareSettings.votesEnabled ? "Votes actifs" : "Votes inactifs"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <article className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 xl:col-span-2">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-lg font-semibold text-white">Visibilité des stats</p>
                          <p className="mt-1 text-sm text-white/50">
                            Contrôlez ce que les coachs et parents peuvent voir dans l’onglet Stats.
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <div className="rounded-[20px] border border-white/10 bg-black/20 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-white">Stat meilleur joueur</p>
                              <p className="mt-1 text-xs text-white/45">
                                Visible pour coach et parent uniquement si activé.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setShareSettings((current) => ({
                                  ...current,
                                  publicMvpLeaderboardEnabled: !current.publicMvpLeaderboardEnabled,
                                }))
                              }
                              className={[
                                "inline-flex h-6 w-11 items-center rounded-full border p-0.5 transition",
                                shareSettings.publicMvpLeaderboardEnabled
                                  ? "justify-end border-emerald-200/30 bg-emerald-400/25 text-emerald-100"
                                  : "justify-start border-white/10 bg-white/5 text-white/35",
                              ].join(" ")}
                              aria-label="Activer la statistique meilleur joueur"
                            >
                              <span className="h-4.5 w-4.5 rounded-full bg-current shadow-[0_0_10px_currentColor]" />
                            </button>
                          </div>
                        </div>

                        <div className="rounded-[20px] border border-white/10 bg-black/20 p-4">
                          <div>
                            <p className="text-sm font-semibold text-white">Stat buteur</p>
                            <p className="mt-1 text-xs text-white/45">
                              Affichage live, uniquement en fin de tournoi, ou masqué.
                            </p>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {[
                              { key: "always" as const, label: "Live" },
                              { key: "end_of_tournament" as const, label: "Fin tournoi" },
                              { key: "hidden" as const, label: "Caché" },
                            ].map((option) => (
                              <button
                                key={`top-scorer-visibility-${option.key}`}
                                type="button"
                                onClick={() =>
                                  setShareSettings((current) => ({
                                    ...current,
                                    topScorerVisibility: option.key,
                                  }))
                                }
                                className={[
                                  "rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
                                  shareSettings.topScorerVisibility === option.key
                                    ? "border-violet-300/25 bg-violet-600 text-white shadow-[0_0_18px_rgba(124,58,237,0.24)]"
                                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
                                ].join(" ")}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </article>
                    {[
                      {
                        key: "coach" as const,
                        title: "Coach",
                        enabled: shareSettings.coachAccessEnabled,
                        tournamentAccessEnabled: Boolean(shareSettings.coachTournamentAccessEnabled),
                        link: coachLink,
                        token: shareSettings.coachToken,
                        summary: `${submittedCoachTeamCount} fiches équipe • ${submittedCoachMealCount} fiches repas`,
                      },
                      {
                        key: "parent" as const,
                        title: "Parent",
                        enabled: shareSettings.parentAccessEnabled,
                        tournamentAccessEnabled: Boolean(shareSettings.parentTournamentAccessEnabled),
                        link: parentLink,
                        token: shareSettings.parentToken,
                        summary: shareSettings.votesEnabled ? "Accès lecture + vote" : "Accès lecture",
                      },
                    ].map((card) => (
                      <article key={`share-${card.key}`} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-white">{card.title}</p>
                            <p className="mt-1 text-sm text-white/50">{card.summary}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setShareSettings((current) => ({
                                ...current,
                                [card.key === "coach" ? "coachAccessEnabled" : "parentAccessEnabled"]: !card.enabled,
                              }))
                            }
                            className={[
                              "rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
                              card.enabled
                                ? "border border-emerald-300/25 bg-emerald-500/15 text-emerald-100"
                                : "border border-white/10 bg-white/5 text-slate-300",
                            ].join(" ")}
                          >
                            {card.enabled ? "Accès activé" : "Accès désactivé"}
                          </button>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-[120px_minmax(0,1fr)]">
                          <div className="rounded-[20px] border border-white/10 bg-white/5 p-3">
                            {card.link ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(card.link)}`}
                                alt={`QR code ${card.title}`}
                                className="h-full w-full rounded-xl bg-white"
                              />
                            ) : (
                              <div className="flex h-full min-h-[96px] items-center justify-center rounded-xl bg-black/20 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                                QR
                              </div>
                            )}
                          </div>
                          <div className="space-y-3">
                            <div className="rounded-[18px] border border-white/10 bg-black/25 px-3 py-2 text-xs text-slate-300">
                              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Lien</p>
                              <p className="mt-1 break-all">{card.link || "Lien indisponible"}</p>
                            </div>
                            <div className="rounded-[18px] border border-white/10 bg-black/25 px-3 py-2 text-xs text-slate-300">
                              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Token</p>
                              <p className="mt-1 break-all">{card.token}</p>
                            </div>
                            {card.key === "parent" ? (
                              <div className="rounded-[18px] border border-white/10 bg-black/25 px-3 py-3 text-xs text-slate-300">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Codes vote parent</p>
                                    <p className="mt-1 text-white/45">Un code par équipe pour débloquer le vote.</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setShareSettings((current) => ({
                                        ...current,
                                        parentTeamCodes: Object.fromEntries(
                                          registeredTournamentTeams.map((team) => [
                                            team.id,
                                            current.parentTeamCodes?.[team.id] ?? buildParentTeamCode(),
                                          ]),
                                        ),
                                      }))
                                    }
                                    className="shrink-0 rounded-full border border-violet-300/25 bg-violet-500/14 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100 transition hover:bg-violet-500/20"
                                  >
                                    Générer
                                  </button>
                                </div>
                                <div className="mt-3 grid gap-2">
                                  {registeredTournamentTeams.slice(0, 8).map((team) => (
                                    <div
                                      key={`parent-code-${team.id}`}
                                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2"
                                    >
                                      <span className="truncate text-white/75">{team.name}</span>
                                      <span className="font-mono text-[12px] font-black tracking-[0.16em] text-white">
                                        {shareSettings.parentTeamCodes?.[team.id] ?? "------"}
                                      </span>
                                    </div>
                                  ))}
                                  {registeredTournamentTeams.length > 8 ? (
                                    <p className="text-[11px] text-white/35">
                                      +{registeredTournamentTeams.length - 8} équipes. Les codes sont générés pour toutes.
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                            <button
                              type="button"
                              onClick={() =>
                                setShareSettings((current) => ({
                                  ...current,
                                  [card.key === "coach"
                                    ? "coachTournamentAccessEnabled"
                                    : "parentTournamentAccessEnabled"]: !card.tournamentAccessEnabled,
                                }))
                              }
                              className={[
                                "flex w-full items-center justify-between gap-3 rounded-[18px] border px-3 py-2 text-left transition",
                                card.tournamentAccessEnabled || shareSettings.tournamentPublished
                                  ? "border-emerald-300/25 bg-emerald-500/12 text-emerald-100"
                                  : "border-white/10 bg-black/25 text-slate-300 hover:bg-white/[0.04]",
                              ].join(" ")}
                            >
                              <span>
                                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-current/70">
                                  Accès tournoi
                                </span>
                                <span className="mt-0.5 block text-xs">
                                  {shareSettings.tournamentPublished
                                    ? "Ouvert par publication globale"
                                    : card.tournamentAccessEnabled
                                      ? "Coach/parent voit déjà matchs, poules et bracket"
                                      : "Onglets tournoi bloqués"}
                                </span>
                              </span>
                              <span
                                className={[
                                  "inline-flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition",
                                  card.tournamentAccessEnabled || shareSettings.tournamentPublished
                                    ? "justify-end border-emerald-200/30 bg-emerald-400/25"
                                    : "justify-start border-white/10 bg-white/5",
                                ].join(" ")}
                              >
                                <span className="h-3.5 w-3.5 rounded-full bg-current shadow-[0_0_10px_currentColor]" />
                              </span>
                            </button>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void copyShareLink(card.key)}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
                              >
                                {shareCopiedKey === card.key ? "Lien copié" : "Copier lien"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setShareSettings((current) => ({
                                    ...current,
                                    [card.key === "coach" ? "coachToken" : "parentToken"]: buildPublicToken(),
                                  }))
                                }
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
                              >
                                Régénérer token
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            ) : null
          ) : null}
        </div>

        {isOrganizerView && !editMode && activeTab !== "live" && floatingControlPrimaryMatch ? (
          <div className="pointer-events-none fixed bottom-5 left-1/2 z-[154] w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setIsFloatingControlExpanded((current) => !current)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setIsFloatingControlExpanded((current) => !current);
                }
              }}
              className="pointer-events-auto rounded-[30px] border border-white/10 bg-[#10131b]/80 px-4 py-3 text-white shadow-[0_18px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl"
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/65">
                      {floatingControlPrimaryMatch.fieldLabel}
                    </span>
                    <span
                      className={[
                        "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                        floatingControlIsLive
                          ? "border border-emerald-300/20 bg-emerald-500/12 text-emerald-100"
                          : floatingControlDisplayState === "completed"
                            ? "border border-sky-300/20 bg-sky-500/12 text-sky-100"
                            : "border border-white/10 bg-white/[0.04] text-white/60",
                      ].join(" ")}
                    >
                      {floatingControlStatusLabel}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-white/90">
                    {getDisplayMatchTeams(floatingControlPrimaryMatch, floatingControlPrimaryState).homeTeam}
                    <span className="mx-2 text-white/35">vs</span>
                    {getDisplayMatchTeams(floatingControlPrimaryMatch, floatingControlPrimaryState).awayTeam}
                  </p>
                </div>

                <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-center">
                  <div className="flex items-center gap-2">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4 w-4 text-emerald-200"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="8.5" />
                      <path d="M12 7.5v5l3 2" />
                    </svg>
                    <span className="font-mono text-lg font-black tracking-[-0.04em] text-white">
                      {formatLiveDuration(floatingControlCountdown)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (floatingControlDisplayState === "completed") return;
                      if (floatingControlIsLive) {
                        pauseLiveMatch(floatingControlPrimaryMatch);
                        return;
                      }
                      launchLiveMatch(floatingControlPrimaryMatch);
                    }}
                    className={[
                      "inline-flex h-11 w-11 items-center justify-center rounded-full border transition",
                      floatingControlDisplayState === "completed"
                        ? "cursor-not-allowed border-white/10 bg-white/[0.04] text-white/35"
                        : "border-violet-300/25 bg-violet-600 text-white shadow-[0_0_20px_rgba(124,58,237,0.24)] hover:bg-violet-500",
                    ].join(" ")}
                    aria-label={floatingControlIsLive ? "Pause" : "Play"}
                  >
                    {floatingControlIsLive ? (
                      <span className="text-lg leading-none">❚❚</span>
                    ) : (
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                        <path d="M8 5.5v13l10-6.5-10-6.5Z" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!floatingControlGoalMatch || !floatingControlIsLive) return;
                      openGoalPicker(floatingControlGoalMatch);
                    }}
                    disabled={!floatingControlGoalMatch || !floatingControlIsLive}
                    className={[
                      "inline-flex h-11 items-center justify-center rounded-full border px-4 text-[11px] font-black uppercase tracking-[0.14em] transition",
                      !floatingControlGoalMatch || !floatingControlIsLive
                        ? "cursor-not-allowed border-white/10 bg-white/[0.04] text-white/35"
                        : "border-yellow-200/30 text-black shadow-[0_0_18px_rgba(250,204,21,0.22)] hover:opacity-90",
                    ].join(" ")}
                    style={
                      !floatingControlGoalMatch || !floatingControlIsLive
                        ? undefined
                        : { background: "linear-gradient(135deg, #FDE047, #FACC15)" }
                    }
                  >
                    + But
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!floatingControlPrimaryMatch || floatingControlDisplayState === "completed") return;
                      requestFinishLiveMatch(floatingControlPrimaryMatch, { redirectToLive: true });
                    }}
                    disabled={floatingControlDisplayState === "completed"}
                    className={[
                      "inline-flex h-11 items-center justify-center rounded-full border px-4 text-[11px] font-black uppercase tracking-[0.14em] transition",
                      floatingControlDisplayState === "completed"
                        ? "cursor-not-allowed border-white/10 bg-white/[0.04] text-white/35"
                        : "border-rose-300/25 bg-rose-500/12 text-rose-100 hover:bg-rose-500/18",
                    ].join(" ")}
                  >
                    Terminer
                  </button>
                </div>
              </div>

              {isFloatingControlExpanded && floatingControlMatches.length > 1 ? (
                <div className="mt-3 border-t border-white/8 pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                    Match cible pour le but
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {floatingControlMatches.map((match) => {
                      const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
                      const resolvedTeams = getDisplayMatchTeams(match, state);
                      const isSelected = floatingControlGoalMatch?.id === match.id;

                      return (
                        <button
                          key={`floating-control-match-${match.id}`}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setFloatingControlMatchId(match.id);
                          }}
                          className={[
                            "rounded-full px-3 py-1.5 text-[10px] font-semibold transition",
                            isSelected
                              ? "bg-violet-600 text-white shadow-[0_0_16px_rgba(124,58,237,0.24)]"
                              : "border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white",
                          ].join(" ")}
                        >
                          {match.fieldLabel} • {resolvedTeams.homeTeam} vs {resolvedTeams.awayTeam}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {!isOrganizerView && activeTab !== "live" && floatingControlPrimaryMatch && !shouldShowPublicFloatingVote ? (
          <div
            className={[
              "pointer-events-none fixed left-1/2 z-[154] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2",
              shouldShowPublicFloatingVote ? "bottom-28" : "bottom-5",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={() => {
                setSelectedLiveMatchId(floatingControlPrimaryMatch.id);
                setActiveTab("live");
              }}
              className="pointer-events-auto flex w-full items-center gap-3 rounded-[24px] border border-white/10 bg-[#10131b]/82 px-4 py-3 text-left text-white shadow-[0_18px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl transition hover:bg-[#151925]/90"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/60">
                    Direct
                  </span>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]",
                      floatingControlIsLive
                        ? "border border-emerald-300/20 bg-emerald-500/12 text-emerald-100"
                        : floatingControlDisplayState === "completed"
                          ? "border border-sky-300/20 bg-sky-500/12 text-sky-100"
                          : "border border-white/10 bg-white/[0.04] text-white/60",
                    ].join(" ")}
                  >
                    {floatingControlStatusLabel}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs font-semibold text-white/85">
                  {getDisplayMatchTeams(floatingControlPrimaryMatch, floatingControlPrimaryState).homeTeam}
                  <span className="mx-1.5 text-white/35">vs</span>
                  {getDisplayMatchTeams(floatingControlPrimaryMatch, floatingControlPrimaryState).awayTeam}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-sm font-black tracking-[-0.04em] text-white">
                  {(floatingControlPrimaryState.homeScore ?? 0)} - {(floatingControlPrimaryState.awayScore ?? 0)}
                </div>
                <div
                  className={[
                    "mt-1 inline-flex items-center gap-1 text-[10px] font-semibold",
                    floatingControlIsLive
                      ? "text-emerald-200 [text-shadow:0_0_6px_rgba(34,197,94,0.4)]"
                      : "text-white/50",
                  ].join(" ")}
                >
                  {floatingControlIsLive ? (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="8.5" />
                      <path d="M12 7.5v5l3 2" />
                    </svg>
                  ) : null}
                  <span>{floatingControlIsLive ? formatLiveDuration(floatingControlCountdown) : floatingControlPrimaryMatch.startTime}</span>
                </div>
              </div>
            </button>
          </div>
        ) : null}

        {isOrganizerView && activeTab !== "live" && livePickerMode && globalFloatingPickerMatch ? (
          <div className="fixed inset-0 z-[190] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] md:items-center">
            <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#101218]/95 p-4 text-white shadow-[0_20px_80px_rgba(0,0,0,0.46)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                    Ajouter un but
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {globalFloatingPickerMatch.fieldLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLivePickerMode(null);
                    setLivePickerMatchId(null);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
                  aria-label="Fermer"
                >
                  ×
                </button>
              </div>

              {floatingControlMatches.length > 1 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {floatingControlMatches.map((match) => (
                    <button
                      key={`floating-picker-${match.id}`}
                      type="button"
                      onClick={() => setLivePickerMatchId(match.id)}
                      className={[
                        "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition",
                        globalFloatingPickerMatch.id === match.id
                          ? "bg-violet-600 text-white"
                          : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
                      ].join(" ")}
                    >
                      {match.fieldLabel}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLivePickerTeam("home")}
                  className={[
                    "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition",
                    livePickerTeam === "home"
                      ? "bg-violet-600 text-white"
                      : "bg-white/5 text-white/55 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                >
                  {globalFloatingPickerTeams.homeTeam}
                </button>
                <button
                  type="button"
                  onClick={() => setLivePickerTeam("away")}
                  className={[
                    "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition",
                    livePickerTeam === "away"
                      ? "bg-violet-600 text-white"
                      : "bg-white/5 text-white/55 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                >
                  {globalFloatingPickerTeams.awayTeam}
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {Array.from({ length: 15 }, (_, index) => index + 1).map((number) => (
                  <button
                    key={`floating-live-number-${number}`}
                    type="button"
                    onClick={() => applyLiveSelection(globalFloatingPickerMatch, number)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/80 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    N° {number}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {resetConfirmOpen ? (
          <div className="fixed inset-0 z-[192] flex items-end justify-center bg-black/55 p-4 backdrop-blur-[3px] md:items-center">
            <div className="w-full max-w-md rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.12),transparent_46%),#101218] p-5 text-white shadow-[0_24px_90px_rgba(0,0,0,0.5)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-200/70">
                    Reset tournoi
                  </p>
                  <h4 className="mt-2 text-xl font-black tracking-[-0.03em] text-white">
                    Redémarrer le tournoi ?
                  </h4>
                  <p className="mt-2 text-sm text-white/55">
                    Cette action remet à zéro les scores, le live, les buts, les penalties et les votes MVP.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setResetConfirmOpen(false)}
                  disabled={isResettingTournament}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-wait"
                  aria-label="Fermer"
                >
                  ×
                </button>
              </div>

              <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full border border-rose-300/25 bg-rose-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-100">
                    Action sensible
                  </span>
                  <span className="text-[11px] font-medium text-white/45">
                    {draft.name}
                  </span>
                </div>
                <p className="mt-3 text-sm text-white/70">
                  Utilise ce reset uniquement en cas de fausse manipulation ou pour relancer complètement le direct.
                </p>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetConfirmOpen(false)}
                  disabled={isResettingTournament}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-wait"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void resetTournamentLive();
                  }}
                  disabled={isResettingTournament}
                  className="rounded-full border border-rose-300/25 bg-rose-500/15 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-rose-100 shadow-[0_0_18px_rgba(244,63,94,0.16)] transition hover:bg-rose-500/22 disabled:cursor-wait disabled:opacity-70"
                >
                  {isResettingTournament ? "Reset..." : "Valider"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {shouldShowPublicFloatingVote && publicFloatingVoteMatch ? (
          <div className="pointer-events-none fixed bottom-5 left-1/2 z-[155] w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
            <div className="pointer-events-auto rounded-[24px] border border-violet-300/25 bg-[#11131c]/82 p-4 text-white shadow-[0_18px_70px_rgba(124,58,237,0.32)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black">Vote en attente</p>
                  <p className="mt-1 text-xs font-semibold text-white/80">
                    {publicFloatingVoteMatch.homeTeam} VS {publicFloatingVoteMatch.awayTeam}
                  </p>
                  <p className="mt-1 text-xs text-white/55">
                    Vous n&apos;avez pas encore voté pour ce match. {publicFloatingVoteMatch.fieldLabel} • reste{" "}
                    {Math.floor(publicFloatingVoteSecondsLeft / 60)}:
                    {String(publicFloatingVoteSecondsLeft % 60).padStart(2, "0")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLiveMatchId(publicFloatingVoteMatch.id);
                    setActiveTab("live");
                    openPublicMvpVoteForMatch(publicFloatingVoteMatch);
                  }}
                  className="rounded-full border border-violet-200/30 bg-violet-600 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-violet-500"
                >
                  Voter
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {parentVoteCodeModalOpen ? (
          <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#101218] p-5 text-white shadow-[0_24px_90px_rgba(0,0,0,0.5)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-black">Code vote</p>
                  <p className="mt-1 text-sm text-white/50">
                    Entre le code donné par le coach pour débloquer le vote MVP.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setParentVoteCodeModalOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
                  aria-label="Fermer"
                >
                  ×
                </button>
              </div>
              <input
                autoFocus
                value={parentVoteCodeDraft}
                onChange={(event) => {
                  setParentVoteCodeDraft(event.target.value.toUpperCase());
                  setParentVoteCodeError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") unlockParentVoteWithCode();
                }}
                placeholder="ABC123"
                className="mt-5 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-center font-mono text-lg font-black uppercase tracking-[0.22em] text-white outline-none transition placeholder:text-white/20 focus:border-violet-300/40"
              />
              {parentVoteCodeError ? (
                <p className="mt-3 text-center text-sm font-medium text-rose-200">{parentVoteCodeError}</p>
              ) : null}
              <button
                type="button"
                onClick={unlockParentVoteWithCode}
                className="mt-5 h-12 w-full rounded-full border border-violet-300/25 bg-violet-600 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-[0_0_22px_rgba(124,58,237,0.25)] transition hover:bg-violet-500"
              >
                Débloquer l’accès vote
              </button>
            </div>
          </div>
        ) : null}

        {isCoachView && activeCoachTeamName ? (
          <div className="pointer-events-none fixed bottom-5 right-5 z-[150]">
            <button
              type="button"
              onClick={() => {
                sendCoachInfo(activeCoachTeamName);
              }}
              className="pointer-events-auto rounded-full border border-violet-300/25 bg-violet-600 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-[0_14px_40px_rgba(124,58,237,0.35)] transition hover:bg-violet-500"
            >
              Envoyer les infos
            </button>
          </div>
        ) : null}

        {expandedStatsMatch ? (
          <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-[#101218] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span
                    className="inline-flex items-center justify-center rounded-full border border-yellow-200/30 px-2 py-px text-[9px] font-semibold uppercase tracking-[0.1em] text-black shadow-[0_0_10px_rgba(250,204,21,0.18)]"
                    style={{ background: "linear-gradient(135deg, #FDE047, #FACC15)" }}
                  >
                    {expandedStatsMatch.fieldLabel}
                  </span>
                  <h4 className="mt-1 text-lg font-semibold text-white">Buteurs</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedLiveStatsMatchId(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
                  aria-label="Fermer"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-4">
                {expandedStatsSummary.length > 0 ? (
                  <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] md:items-start">
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-white">
                        {expandedStatsTeams?.homeTeam ?? expandedStatsMatch.homeTeam}
                      </p>
                      <div className="grid gap-3">
                        {expandedHomeStatsSummary.map((entry) => (
                          <div
                            key={`live-goal-modal-home-${expandedStatsMatch.id}-${entry.number}`}
                            className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                          >
                            <div className="grid grid-cols-[64px_56px_minmax(0,1fr)] items-center gap-3">
                              <p className="text-sm font-semibold text-white">
                                {getTournamentPlayerDisplayLabel(
                                  expandedStatsTeams?.homeTeam ?? expandedStatsMatch.homeTeam,
                                  entry.number,
                                )}
                              </p>
                              <span className="flex items-center gap-0.5 text-[13px] leading-none [text-shadow:0_0_8px_rgba(255,255,255,0.08)]">
                                {Array.from({ length: entry.count }).map((_, index) => (
                                  <span key={`goal-icon-home-${expandedStatsMatch.id}-${entry.number}-${index}`}>⚽</span>
                                ))}
                              </span>
                              <div className="flex flex-wrap justify-end gap-1.5">
                                {entry.times.map((time, index) => (
                                  <span
                                    key={`goal-time-home-${expandedStatsMatch.id}-${entry.number}-${time}-${index}`}
                                    className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-medium text-white/78 shadow-[0_0_10px_rgba(255,255,255,0.05)]"
                                  >
                                    {time.replace(":", "'")}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="hidden self-stretch bg-white/[0.06] md:block" />
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-white">
                        {expandedStatsTeams?.awayTeam ?? expandedStatsMatch.awayTeam}
                      </p>
                      <div className="grid gap-3">
                        {expandedAwayStatsSummary.map((entry) => (
                          <div
                            key={`live-goal-modal-away-${expandedStatsMatch.id}-${entry.number}`}
                            className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                          >
                            <div className="grid grid-cols-[64px_56px_minmax(0,1fr)] items-center gap-3">
                              <p className="text-sm font-semibold text-white">
                                {getTournamentPlayerDisplayLabel(
                                  expandedStatsTeams?.awayTeam ?? expandedStatsMatch.awayTeam,
                                  entry.number,
                                )}
                              </p>
                              <span className="flex items-center gap-0.5 text-[13px] leading-none [text-shadow:0_0_8px_rgba(255,255,255,0.08)]">
                                {Array.from({ length: entry.count }).map((_, index) => (
                                  <span key={`goal-icon-away-${expandedStatsMatch.id}-${entry.number}-${index}`}>⚽</span>
                                ))}
                              </span>
                              <div className="flex flex-wrap justify-end gap-1.5">
                                {entry.times.map((time, index) => (
                                  <span
                                    key={`goal-time-away-${expandedStatsMatch.id}-${entry.number}-${time}-${index}`}
                                    className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-medium text-white/78 shadow-[0_0_10px_rgba(255,255,255,0.05)]"
                                  >
                                    {time.replace(":", "'")}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-white/45">
                    Aucun but enregistré sur cette manche.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {activeMealOrderTeam ? (
          <div className="absolute inset-0 z-[150] flex items-center justify-center bg-black/55 p-4">
            <div className="flex w-full max-w-5xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#090c14] shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-lg font-semibold text-white">{activeMealOrderTeam.name}</p>
                  <p className="mt-1 text-sm text-white/50">
                    Repas {Math.min(countFilledMealRows(activeMealOrderSubmission?.rows), maxMealsPerTeam)}/{maxMealsPerTeam}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveMealOrderTeamId(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
                  aria-label="Fermer la fiche repas"
                >
                  ×
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
                {!mealItems.length ? (
                  <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/50">
                    Aucun produit repas configuré.
                  </div>
                ) : activeMealOrderRows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-[720px] w-full border-separate border-spacing-0 text-sm text-white">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-white/45">
                          <th className="border-b border-white/10 px-3 py-3">Identité</th>
                          {mealItems.map((item) => (
                            <th key={`admin-live-meal-head-${item.id}`} className="border-b border-white/10 px-3 py-3 text-center">
                              {item.label}
                            </th>
                          ))}
                          <th className="border-b border-white/10 px-3 py-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeMealOrderRows.map((row) => {
                          const lineTotal = mealItems.reduce((total, item) => {
                            const quantity = row.quantities?.[item.id] ?? 0;
                            const price = Number(item.price || 0);
                            return total + quantity * price;
                          }, 0);

                          return (
                            <tr key={`admin-live-meal-row-${row.id}`} className="[&_td]:border-b [&_td]:border-white/[0.06]">
                              <td className="px-3 py-3 font-medium text-white">
                                {row.participantLabel || "Sans nom"}
                              </td>
                              {mealItems.map((item) => (
                                <td key={`admin-live-meal-cell-${row.id}-${item.id}`} className="px-3 py-3 text-center text-white/75">
                                  {row.quantities?.[item.id] ?? 0}
                                </td>
                              ))}
                              <td className="px-3 py-3 text-right font-semibold text-white">
                                {lineTotal.toFixed(2)} €
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="text-sm font-semibold text-white">
                          <td className="px-3 py-3">Total</td>
                          {mealItems.map((item) => (
                            <td key={`admin-live-meal-total-${item.id}`} className="px-3 py-3 text-center">
                              {activeMealOrderRows.reduce(
                                (total, row) => total + (row.quantities?.[item.id] ?? 0),
                                0,
                              )}
                            </td>
                          ))}
                          <td className="px-3 py-3 text-right">{activeMealOrderTotal.toFixed(2)} €</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/50">
                    Aucun repas renseigné pour cette équipe.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
                <p className="text-sm text-white/45">Commande repas envoyée par le coach.</p>
              </div>
            </div>
          </div>
        ) : null}

        {activeRosterTeamName ? (
          <div className="absolute inset-0 z-[150] flex items-center justify-center bg-black/55 p-4">
            <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#090c14] shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-lg font-semibold text-white">{resolveTeamLabel(activeRosterTeamName)}</p>
                  <p className="mt-1 text-sm text-white/50">
                    {countFilledRosterPlayers(selectedPlayers)}/{maxPlayersPerTeam} joueurs
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlayers([]);
                    setIsLoadingPlayers(false);
                    setActiveRosterTeamName(null);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
                  aria-label="Fermer la liste des joueurs"
                >
                  ×
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
                <div className="space-y-3">
                  {isLoadingPlayers ? (
                    <div className="text-sm text-white/60">Chargement...</div>
                  ) : selectedPlayers.length > 0 ? (
                    selectedPlayers.map((player) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                      >
                        <div>
                          <div className="font-semibold text-white">
                            {player.lastName} {player.firstName}
                          </div>
                          <div className="text-sm text-white/60">
                            Licence {player.license || "Non renseignée"}
                          </div>
                        </div>
                        <div className="text-sm font-medium text-white/80">
                          N° {player.number || "-"}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-white/60">
                      Aucun joueur renseigné pour cette équipe.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
                <p className="text-sm text-white/45">Liste joueurs chargée depuis Supabase.</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="border-t border-white/10 bg-[#0f1016]/95 px-5 py-3 md:px-7">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[12px] text-slate-500">
              {footerMeta.join(" • ")}
            </p>
          </div>
        </div>
        <style jsx>{`
          @keyframes live-goal-flash {
            0% {
              transform: scale(1);
              box-shadow: 0 0 0 rgba(250, 204, 21, 0);
            }
            35% {
              transform: scale(1.01);
              box-shadow: 0 0 22px rgba(250, 204, 21, 0.12);
            }
            100% {
              transform: scale(1);
              box-shadow: 0 0 0 rgba(250, 204, 21, 0);
            }
          }

          @keyframes live-fade-in {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @keyframes live-modal-in {
            from {
              opacity: 0;
              transform: translateY(10px) scale(0.98);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}</style>
      </div>
    </div>
  );
}
