"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type {
  TournamentProductGroup,
  TournamentProductMatchState,
  TournamentProductSavedTournament,
  TournamentProductScheduleMatch,
  TournamentProductStatus,
  TournamentWorkspaceTab,
} from "./types";

type TournamentWorkspaceProps = {
  tournament: TournamentProductSavedTournament;
  groups: TournamentProductGroup[];
  structurePreview: ReactNode | null;
  onClose: () => void;
  onEditStructure: () => void;
  onSave: (nextTournament: TournamentProductSavedTournament) => void;
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
    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-violet-300/20 text-[10px] font-semibold uppercase text-white shadow-[0_0_8px_rgba(124,58,237,0.4)]"
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

const STATUS_OPTIONS: Array<{ value: TournamentProductStatus; label: string }> = [
  { value: "draft", label: "Brouillon" },
  { value: "published", label: "Publié" },
  { value: "live", label: "En cours" },
  { value: "finished", label: "Terminé" },
];

const MATCH_STATUS_OPTIONS: Array<{ value: TournamentProductMatchState["status"]; label: string }> = [
  { value: "scheduled", label: "À venir" },
  { value: "live", label: "En direct" },
  { value: "completed", label: "Terminé" },
];

const MATCH_STATUS_BADGES: Record<
  TournamentProductMatchState["status"],
  { label: string; className: string; dotClassName: string }
> = {
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

const sortMatchesByTime = (matches: TournamentProductScheduleMatch[]) =>
  [...matches].sort((left, right) => {
    const timeGap = toMinutes(left.startTime) - toMinutes(right.startTime);
    if (timeGap !== 0) return timeGap;
    return left.fieldLabel.localeCompare(right.fieldLabel, "fr");
  });

const buildGroupKey = (match: TournamentProductScheduleMatch) => {
  const roundLabel = match.roundLabel.trim();
  const explicitGroup = roundLabel.match(/Poule\s+([A-Z])/i);
  if (explicitGroup) return `Poule ${explicitGroup[1].toUpperCase()}`;
  if (/round robin/i.test(roundLabel)) return "Classement général";
  return null;
};

const getCompactRoundLabel = (match: TournamentProductScheduleMatch) => {
  const groupKey = buildGroupKey(match);
  if (groupKey) return groupKey;
  return match.roundLabel;
};

const isPenaltyEligibleMatch = (match: TournamentProductScheduleMatch) =>
  match.scheduleSection === "final" && !isPause(match);

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
  if (!state || state.status !== "completed" || state.homeScore === null || state.awayScore === null) {
    return null;
  }
  if (state.homeScore > state.awayScore) {
    return { winner: "home" as const, loser: "away" as const };
  }
  if (state.homeScore < state.awayScore) {
    return { winner: "away" as const, loser: "home" as const };
  }
  const penaltyWinner =
    state.penaltyShootout?.winner ??
    getPenaltyWinnerFromEvents(
      state.penaltyShootout?.events ?? [],
      getPenaltyTargetAttempts(state),
    );
  if (!penaltyWinner) return null;
  return {
    winner: penaltyWinner,
    loser: penaltyWinner === "home" ? ("away" as const) : ("home" as const),
  };
};

const buildStandingTable = (
  group: TournamentProductGroup,
  matches: TournamentProductScheduleMatch[],
  states: Record<string, TournamentProductMatchState>,
) => {
  const table = new Map<string, StandingRow>();
  group.teams.forEach((team) => {
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
    const state = states[match.id];
    if (!state || state.status !== "completed") return;
    if (state.homeScore === null || state.awayScore === null) return;

    const home = table.get(match.homeTeam);
    const away = table.get(match.awayTeam);
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

const getDefaultMatchState = (): TournamentProductMatchState => ({
  homeScore: null,
  awayScore: null,
  status: "scheduled",
});

const ALL_PENALTY_MATCHES_KEY = "__all__";

export function TournamentWorkspace({
  tournament,
  groups,
  structurePreview,
  onClose,
  onEditStructure,
  onSave,
}: TournamentWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TournamentWorkspaceTab>("overview");
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<TournamentProductSavedTournament>(tournament);
  const overviewGroupsScrollerRef = useRef<HTMLDivElement | null>(null);
  const overviewGroupCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeOverviewGroup, setActiveOverviewGroup] = useState<string | null>(null);
  const [overviewScrollMask, setOverviewScrollMask] = useState({ left: false, right: true });
  const overviewAutoScrollTargetRef = useRef<string | null>(null);
  const [selectedLiveMatchId, setSelectedLiveMatchId] = useState<string | null>(null);
  const [liveRuntimeByMatch, setLiveRuntimeByMatch] = useState<Record<string, LiveRuntime>>({});
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
  const [recentGoalByMatch, setRecentGoalByMatch] = useState<
    Record<string, { team: LivePickerTeam; number: number }>
  >({});
  const [lastGoalTeamByMatch, setLastGoalTeamByMatch] = useState<Record<string, LivePickerTeam>>({});
  const goalFeedbackTimeoutRef = useRef<Record<string, number>>({});
  const penaltyFeedbackTimeoutRef = useRef<Record<string, number>>({});
  const goalCommitGuardRef = useRef<Record<string, number>>({});
  const latestOnSaveRef = useRef(onSave);
  const lastSavedSnapshotRef = useRef(JSON.stringify(tournament));

  useEffect(() => {
    latestOnSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    const draftSnapshot = JSON.stringify(draft);
    if (draftSnapshot === lastSavedSnapshotRef.current) {
      return;
    }

    lastSavedSnapshotRef.current = draftSnapshot;
    latestOnSaveRef.current(draft);
  }, [draft]);

  const realMatches = useMemo(
    () => sortMatchesByTime(draft.schedule.filter((match) => !isPause(match))),
    [draft.schedule],
  );
  const friendlyMatches = useMemo(
    () => realMatches.filter((match) => getPhaseLabel(match) === "Amical"),
    [realMatches],
  );
  const groupMatches = useMemo(
    () => realMatches.filter((match) => match.scheduleSection === "group"),
    [realMatches],
  );
  const finalMatches = useMemo(
    () => realMatches.filter((match) => match.scheduleSection === "final" && getPhaseLabel(match) !== "Amical"),
    [realMatches],
  );
  const currentLiveMatch = useMemo(
    () =>
      realMatches.find((match) => draft.liveMatchId === match.id) ??
      realMatches.find((match) => draft.matchStates?.[match.id]?.status === "live") ??
      null,
    [draft.liveMatchId, draft.matchStates, realMatches],
  );
  const groupedScheduleSlots = useMemo(() => {
    const slotMap = new Map<
      string,
      { key: string; startTime: string; matches: TournamentProductScheduleMatch[] }
    >();

    realMatches.forEach((match) => {
      const key = `${match.slotIndex ?? match.startTime}-${match.startTime}`;
      const existing = slotMap.get(key);
      if (existing) {
        existing.matches.push(match);
        return;
      }

      slotMap.set(key, {
        key,
        startTime: match.startTime,
        matches: [match],
      });
    });

    return [...slotMap.values()]
      .map((slot) => ({
        ...slot,
        matches: [...slot.matches].sort((left, right) =>
          left.fieldLabel.localeCompare(right.fieldLabel, "fr"),
        ),
      }))
      .sort((left, right) => toMinutes(left.startTime) - toMinutes(right.startTime));
  }, [realMatches]);
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
        slot.matches.some((match) => (draft.matchStates?.[match.id] ?? getDefaultMatchState()).status === "scheduled"),
      ) ?? groupedScheduleSlots[0] ?? null
    );
  }, [currentLiveMatch, draft.matchStates, groupedScheduleSlots]);
  const nextSlot = useMemo(() => {
    if (!currentSlot) return groupedScheduleSlots[1] ?? null;
    const currentIndex = groupedScheduleSlots.findIndex((slot) => slot.key === currentSlot.key);
    if (currentIndex < 0) return null;

    const minimumMatchesForOverview = Math.min(Math.max(draft.fieldCount, 1), 2);
    const followingSlots = groupedScheduleSlots.slice(currentIndex + 1);

    return (
      followingSlots.find((slot) => slot.matches.length >= minimumMatchesForOverview) ??
      followingSlots[0] ??
      null
    );
  }, [currentSlot, draft.fieldCount, groupedScheduleSlots]);

  const groupTables = useMemo(() => {
    if (groups.length > 0) {
      return groups.map((group) => ({
        label: group.label,
        rows: buildStandingTable(
          group,
          groupMatches.filter((match) => buildGroupKey(match) === group.label),
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
  }, [draft.matchStates, draft.teams, groupMatches, groups]);
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
  const resolveQualifiedTeamName = useMemo(() => {
    const groupCompletionByLabel = new Map(
      groupTables.map((group) => [
        group.label,
        groupMatches
          .filter((match) => buildGroupKey(match) === group.label)
          .every((match) => (draft.matchStates?.[match.id]?.status ?? "scheduled") === "completed"),
      ]),
    );
    const finalMatchRefCounters: Record<string, number> = {};
    const finalMatchByRefId = new Map(
      finalMatches.map((match) => [getFinalMatchReferenceId(match, finalMatchRefCounters), match] as const),
    );
    const resolvedTeamCache = new Map<string, string>();

    const resolve = (label: string, stack: Set<string> = new Set()): string => {
      if (resolvedTeamCache.has(label)) {
        return resolvedTeamCache.get(label) ?? label;
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
        resolvedTeamCache.set(label, resolved);
        return resolved;
      }

      const bestRankMatch = compactLabel.match(/^Meilleur\s+(\d+)(?:er|e)$/i);
      if (bestRankMatch) {
        if ([...groupCompletionByLabel.values()].some((completed) => !completed)) return label;
        const rank = Number(bestRankMatch[1]);
        const team = rank > 0 ? bestGroupRankByPosition.get(rank)?.[0]?.team : null;
        const resolved = team ?? label;
        resolvedTeamCache.set(label, resolved);
        return resolved;
      }

      const dependencyMatch = compactLabel.match(/^(Vainqueur|Perdant)\s+([A-Z]+\d+)$/i);
      if (dependencyMatch) {
        const [, dependencyType, dependencyIdRaw] = dependencyMatch;
        const dependencyId = dependencyIdRaw.toUpperCase();
        if (stack.has(dependencyId)) return label;

        const sourceMatch = finalMatchByRefId.get(dependencyId);
        const sourceState = sourceMatch ? draft.matchStates?.[sourceMatch.id] : null;
        const outcome = getResolvedKnockoutOutcome(sourceState);
        if (!sourceMatch || !sourceState || !outcome) {
          return label;
        }

        const nextStack = new Set(stack);
        nextStack.add(dependencyId);
        const resolvedHome = resolve(sourceMatch.homeTeam, nextStack);
        const resolvedAway = resolve(sourceMatch.awayTeam, nextStack);
        const resolved =
          dependencyType.toLowerCase() === "vainqueur"
            ? outcome.winner === "home"
              ? resolvedHome
              : resolvedAway
            : outcome.loser === "home"
              ? resolvedHome
              : resolvedAway;

        resolvedTeamCache.set(label, resolved);
        return resolved;
      }

      return label;
    };

    return resolve;
  }, [bestGroupRankByPosition, draft.matchStates, finalMatches, groupMatches, groupTables]);
  const getResolvedMatchTeams = (match: TournamentProductScheduleMatch) => ({
    homeTeam: resolveQualifiedTeamName(match.homeTeam),
    awayTeam: resolveQualifiedTeamName(match.awayTeam),
  });

  const liveTabMatch = useMemo(() => {
    if (realMatches.length === 0) return null;
    return (
      realMatches.find((match) => match.id === selectedLiveMatchId) ??
      realMatches.find((match) => match.id === draft.liveMatchId) ??
      realMatches[0]
    );
  }, [draft.liveMatchId, realMatches, selectedLiveMatchId]);

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
  const expandedHomeStatsSummary = useMemo(
    () => expandedStatsSummary.filter((entry) => entry.team === "home"),
    [expandedStatsSummary],
  );
  const expandedAwayStatsSummary = useMemo(
    () => expandedStatsSummary.filter((entry) => entry.team === "away"),
    [expandedStatsSummary],
  );

  const updateDraft = (updater: (current: TournamentProductSavedTournament) => TournamentProductSavedTournament) => {
    setDraft((current) => updater(current));
  };

  const updateMatchState = (matchId: string, patch: Partial<TournamentProductMatchState>) => {
    updateDraft((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      matchStates: {
        ...(current.matchStates ?? {}),
        [matchId]: {
          ...(current.matchStates?.[matchId] ?? getDefaultMatchState()),
          ...patch,
        },
      },
    }));
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

    let nearestLabel = groupTables[0]?.label ?? null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    groupTables.forEach((group) => {
      const card = overviewGroupCardRefs.current[group.label];
      if (!card) return;

      const distance = Math.abs(card.offsetLeft - container.scrollLeft);
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
  const activeLiveRuntime = draft.liveMatchId ? liveRuntimeByMatch[draft.liveMatchId] : null;

  useEffect(() => {
    if (!draft.liveMatchId || !activeLiveRuntime?.running || activeLiveRuntime.startedAt === null) {
      return;
    }

    const liveMatchId = draft.liveMatchId;
    const startedAt = activeLiveRuntime.startedAt;
    const intervalId = window.setInterval(() => {
      setLiveRuntimeByMatch((current) => {
        const runtime = current[liveMatchId];
        if (!runtime?.running || runtime.startedAt !== startedAt) {
          return current;
        }

        return {
          ...current,
          [liveMatchId]: {
            ...runtime,
            elapsedSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
          },
        };
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeLiveRuntime?.running, activeLiveRuntime?.startedAt, draft.liveMatchId]);

  useEffect(() => {
    const feedbackTimeouts = goalFeedbackTimeoutRef.current;
    return () => {
      Object.values(feedbackTimeouts).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
    };
  }, []);

  const getLiveRuntime = (matchId: string) =>
    liveRuntimeByMatch[matchId] ?? {
      elapsedSeconds: 0,
      running: false,
      startedAt: null,
    };

  const launchLiveMatch = (match: TournamentProductScheduleMatch) => {
    const liveSlot =
      groupedScheduleSlots.find((slot) => slot.matches.some((slotMatch) => slotMatch.id === match.id)) ??
      null;
    const slotMatches = liveSlot?.matches ?? [match];
    const driverMatch = slotMatches[0] ?? match;
    const currentRuntime = getLiveRuntime(driverMatch.id);

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
        elapsedSeconds: currentRuntime.elapsedSeconds,
        running: true,
        startedAt: Date.now() - currentRuntime.elapsedSeconds * 1000,
      };

      return next;
    });
    slotMatches.forEach((slotMatch) => {
      updateMatchState(slotMatch.id, { status: "live" });
    });
  };

  const pauseLiveMatch = (match: TournamentProductScheduleMatch) => {
    const liveSlot =
      groupedScheduleSlots.find((slot) => slot.matches.some((slotMatch) => slotMatch.id === match.id)) ??
      null;
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
  };

  const finishLiveMatch = (match: TournamentProductScheduleMatch) => {
    const liveSlot =
      groupedScheduleSlots.find((slot) => slot.matches.some((slotMatch) => slotMatch.id === match.id)) ??
      null;
    const slotMatches = liveSlot?.matches ?? [match];
    const driverMatch = slotMatches[0] ?? match;

    pauseLiveMatch(driverMatch);
    setDraft((current) => ({
      ...current,
      liveMatchId: current.liveMatchId === driverMatch.id ? null : current.liveMatchId,
      updatedAt: new Date().toISOString(),
    }));
    slotMatches.forEach((slotMatch) => {
      const state = draft.matchStates?.[slotMatch.id] ?? getDefaultMatchState();
      updateMatchState(slotMatch.id, {
        status: "completed",
        homeScore: state.homeScore ?? 0,
        awayScore: state.awayScore ?? 0,
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

  const openGoalPicker = (match: TournamentProductScheduleMatch) => {
    setLivePickerMode("scorer");
    setLivePickerTeam(lastGoalTeamByMatch[match.id] ?? "home");
    setLivePickerMatchId(match.id);
  };

  const setMatchMvp = (matchId: string, team: LivePickerTeam, number: number) => {
    const state = draft.matchStates?.[matchId] ?? getDefaultMatchState();
    updateMatchState(matchId, {
      ...state,
      mvp: {
        team,
        number,
      },
    });
  };
  const commitLiveReviewNumber = (matchId: string, team: LivePickerTeam, rawValue: string) => {
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 15) return;
    setMatchMvp(matchId, team, parsed);
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
    eventTimestamp?: number,
  ) => {
    if (livePickerMode === null) return;
    const now = eventTimestamp ?? 0;
    if (now - (goalCommitGuardRef.current[match.id] ?? 0) < 450) {
      return;
    }
    goalCommitGuardRef.current[match.id] = now;

    if (livePickerMode === "scorer") {
      const driverRuntime = getLiveRuntime(livePrimaryMatch?.id ?? match.id);
      setLiveScorersByMatch((current) => ({
        ...current,
        [match.id]: [
          ...(current[match.id] ?? []),
          {
            team: livePickerTeam,
            number,
            elapsedSeconds: driverRuntime.elapsedSeconds,
          },
        ],
      }));
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

      const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
      updateMatchState(match.id, {
        status: "live",
        homeScore: livePickerTeam === "home" ? (state.homeScore ?? 0) + 1 : state.homeScore ?? 0,
        awayScore: livePickerTeam === "away" ? (state.awayScore ?? 0) + 1 : state.awayScore ?? 0,
      });
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
      [match.id]: (current[match.id] ?? []).slice(0, -1),
    }));

    const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
    updateMatchState(match.id, {
      status: state.status,
      homeScore:
        lastEvent.team === "home"
          ? Math.max(0, (state.homeScore ?? 0) - 1)
          : (state.homeScore ?? 0),
      awayScore:
        lastEvent.team === "away"
          ? Math.max(0, (state.awayScore ?? 0) - 1)
          : (state.awayScore ?? 0),
    });
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
  ) => {
    const displayHomeTeam = resolveQualifiedTeamName(match.homeTeam);
    const displayAwayTeam = resolveQualifiedTeamName(match.awayTeam);
    const phaseLabel = getCompactRoundLabel(match);
    const resolvedTimeTone =
      timeTone === "auto"
        ? state.status === "live"
          ? "live"
          : state.status === "completed"
            ? "past"
            : "next"
        : timeTone;
    const timeClassName =
      resolvedTimeTone === "live"
        ? "text-sm font-semibold text-[#22C55E] [text-shadow:0_0_6px_rgba(34,197,94,0.5)]"
        : resolvedTimeTone === "past"
          ? "text-sm font-medium text-white/40"
          : "text-sm font-medium text-white/80";
    const statusBadge = MATCH_STATUS_BADGES[state.status];
    const shouldShowScore =
      state.status === "completed" || state.homeScore !== null || state.awayScore !== null;
    const shouldShowCenterScore = state.status === "completed";
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

    return (
      <>
        <div className="space-y-3 md:hidden">
          <div className="flex min-w-0 flex-col text-left">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/95">
              {match.fieldLabel}
            </span>
            <span className="mt-1 text-[11px] font-medium text-white/45">{phaseLabel}</span>
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
          <div className="flex items-center justify-end gap-2">
            {shouldShowScore && !shouldShowCenterScore ? (
              <span className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-sm font-semibold text-white backdrop-blur-[8px]">
                {(state.homeScore ?? 0)} - {(state.awayScore ?? 0)}
              </span>
            ) : null}
            {scorerIndicator}
            <span className={["shrink-0", timeClassName].join(" ")}>{match.startTime}</span>
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

        <div className="hidden min-w-0 grid-cols-[10rem_minmax(0,1fr)_10rem] items-center gap-4 md:grid lg:grid-cols-[10.5rem_minmax(0,1fr)_10.5rem]">
          <div className="flex min-w-0 flex-col text-left">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/95">
              {match.fieldLabel}
            </span>
            <span className="mt-1 text-[11px] font-medium text-white/45">{phaseLabel}</span>
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

          <div className="flex min-w-0 items-center justify-end gap-2 text-right">
            {shouldShowScore && !shouldShowCenterScore ? (
              <span className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-sm font-semibold text-white backdrop-blur-[8px]">
                {(state.homeScore ?? 0)} - {(state.awayScore ?? 0)}
              </span>
            ) : null}
            {scorerIndicator}
            <span className={["shrink-0", timeClassName].join(" ")}>{match.startTime}</span>
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
      </>
    );
  };

  const renderMatchRow = (match: TournamentProductScheduleMatch) => {
    const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
    const competitionPath = getCompetitionPath(match);
    const phaseLabel = getPhaseLabel(match);

    if (!editMode) {
      return (
        <div
          key={match.id}
          className="mb-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-5 py-4 backdrop-blur-[8px] transition-all duration-200 ease-out hover:border-white/[0.1] hover:bg-white/[0.04]"
        >
          {renderCompactReadOnlyMatchRow(match, state, "auto", true)}
        </div>
      );
    }

    return (
      <div
        key={match.id}
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
              {resolveQualifiedTeamName(match.homeTeam)} <span className="text-slate-500">vs</span>{" "}
              {resolveQualifiedTeamName(match.awayTeam)}
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
  ) => (
    <section className="space-y-4 overflow-hidden rounded-[28px] border border-white/[0.06] bg-white/[0.015] p-5">
      <p className="text-lg font-semibold text-white">{title}</p>

      {slot ? (
        <div className="space-y-3">
          {slot.matches.map((match) => {
            const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();

            return (
              <div
                key={`overview-${match.id}`}
                className="mb-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] px-5 py-4 backdrop-blur-[8px] transition-all duration-200 ease-out hover:border-white/[0.12] hover:bg-white/[0.05]"
              >
                {renderCompactReadOnlyMatchRow(
                  match,
                  state,
                  title === "Match en cours" ? "live" : title === "Match suivant" ? "next" : "auto",
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

  const tabs: Array<{ key: TournamentWorkspaceTab; label: string }> = [
    { key: "overview", label: "Vue d’ensemble" },
    { key: "live", label: "Pilotage match" },
    { key: "matches", label: "Matchs" },
    { key: "pools", label: "Poules" },
    { key: "bracket", label: "Phases finales" },
  ];
  const liveTournamentActive = !editMode;

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
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex flex-1 items-center gap-3">
              <h2 className="min-w-0 truncate text-lg font-semibold text-white md:text-[22px]">{draft.name}</h2>
            </div>
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
          </div>
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
            <div className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0 grid gap-8 xl:h-full">
                  {renderOverviewSlot(
                    "Match en cours",
                    currentSlot,
                    "Aucun match en cours pour le moment.",
                  )}
                  {renderOverviewSlot(
                    "Match suivant",
                    nextSlot,
                    "Aucun prochain créneau disponible.",
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
          ) : null}

          {activeTab === "matches" ? (
            <div className="space-y-6">
              <section className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-white">Phase de poule</p>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
                    {groupMatches.length} matchs
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {groupMatches.length > 0 ? groupMatches.map(renderMatchRow) : (
                    <p className="text-sm text-slate-500">Aucun match de poule sur ce tournoi.</p>
                  )}
                </div>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-white">Phase finale</p>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
                    {finalMatches.length} matchs
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {finalMatches.length > 0 ? finalMatches.map(renderMatchRow) : (
                    <p className="text-sm text-slate-500">Aucun match de phase finale.</p>
                  )}
                </div>
              </section>

              {friendlyMatches.length > 0 ? (
                <section className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-lg font-semibold text-white">Amicaux</p>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
                      {friendlyMatches.length} matchs
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">{friendlyMatches.map(renderMatchRow)}</div>
                </section>
              ) : null}
            </div>
          ) : null}

          {activeTab === "pools" ? (
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
          ) : null}

          {activeTab === "bracket" ? (
            <div className="space-y-6">
              <section className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Phases finales</p>
                    <h3 className="mt-2 text-lg font-semibold text-white">Bracket du tournoi</h3>
                  </div>
                  <button
                    type="button"
                    onClick={onEditStructure}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:bg-white/10 hover:text-white"
                  >
                    Ajuster la structure
                  </button>
                </div>
                <div className="mt-5 rounded-[28px] border border-white/10 bg-[#0f1016] p-3 md:p-4">
                  {structurePreview ?? (
                    <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-slate-500">
                      Aucun aperçu de bracket disponible pour ce tournoi.
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "live" ? (
            <div className="space-y-2">
              <section>
                <h3 className="text-lg font-semibold text-white">Pilotage match</h3>
                {livePrimaryMatch ? (() => {
                  const runtime = getLiveRuntime(livePrimaryMatch.id);
                  const isLive = draft.liveMatchId === livePrimaryMatch.id && runtime.running;
                  const countdownSeconds = Math.max(0, draft.matchDuration * 60 - runtime.elapsedSeconds);
                  const isTimeElapsed = countdownSeconds === 0;
                  const pickerMatch =
                    liveSlotMatches.find((match) => match.id === livePickerMatchId) ??
                    liveSlotMatches[0] ??
                    livePrimaryMatch;
                  const resolvedPickerMatchTeams = getResolvedMatchTeams(pickerMatch);
                  const liveActionHint = isTimeElapsed ? "TEMPS ÉCOULÉ" : isLive ? "Pause" : "Démarrer";
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
                            onClick={(event) => applyLiveSelection(pickerMatch, number, event.timeStamp)}
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
                            const resolvedTeams = getResolvedMatchTeams(match);

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
                                      But • N° {recentGoal.number}
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
                                    {liveScorers.length > 0 ? (
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
                              <button
                                type="button"
                                onClick={() => {
                                  if (isTimeElapsed) return;
                                  if (isLive) {
                                    pauseLiveMatch(livePrimaryMatch);
                                    return;
                                  }
                                  launchLiveMatch(livePrimaryMatch);
                                }}
                                className={[
                                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition md:h-12 md:w-12 xl:self-center",
                                  isTimeElapsed
                                    ? "border-white/10 bg-transparent text-white/45"
                                    : isLive
                                      ? "border-violet-400/40 bg-violet-600 text-white shadow-[0_0_16px_rgba(124,58,237,0.28)] hover:bg-violet-500"
                                      : "border-violet-400/40 bg-violet-600 text-white shadow-[0_0_16px_rgba(124,58,237,0.28)] hover:bg-violet-500",
                                ].join(" ")}
                                aria-label={liveActionHint}
                              >
                                {isLive ? (
                                  <span className="text-[14px] leading-none md:text-[18px]">❚❚</span>
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
                                      : "bg-white/30",
                                    ].join(" ")}
                                  />
                                </div>
                                <div className="mt-0.5 font-mono text-[17px] font-black text-white [text-shadow:0_0_10px_rgba(255,255,255,0.08)] md:text-[22px] xl:text-[26px]">
                                  {formatLiveDuration(countdownSeconds)}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => finishLiveMatch(livePrimaryMatch)}
                                className={[
                                  "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-full px-2 transition md:h-10 md:gap-2 md:px-3 xl:-ml-1 xl:self-center",
                                  isTimeElapsed
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
                            </div>
                          </div>

                          {liveSlotMatches.slice(1, 2).map((match) => {
                            const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
                            const liveScorers = liveScorersByMatch[match.id] ?? [];
                            const recentGoal = recentGoalByMatch[match.id] ?? null;
                            const resolvedTeams = getResolvedMatchTeams(match);

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
                                      But • N° {recentGoal.number}
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
                                    {liveScorers.length > 0 ? (
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
                                  const resolvedTeams = getResolvedMatchTeams(match);
                                  const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
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
                                  const resolvedTeams = getResolvedMatchTeams(match);
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
                                          <p className="text-[12px] font-semibold text-white/78">{resolvedTeams.homeTeam}</p>
                                          <div className="mt-2 flex flex-wrap justify-end gap-1">
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
                                          <p className="text-[12px] font-semibold text-white/78">{resolvedTeams.awayTeam}</p>
                                          <div className="mt-2 flex flex-wrap justify-start gap-1">
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
                                  onClick={() => setCompletedLiveSlotMatchIds(null)}
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

                              <div className="mt-2 grid flex-1 gap-2 overflow-y-auto pb-2 xl:grid-cols-2">
                                {completedLiveReviewMatches.map((match) => {
                                  const state = draft.matchStates?.[match.id] ?? getDefaultMatchState();
                                  const selectedMvp = state.mvp ?? null;
                                  const selectedTeam =
                                    liveReviewTeamByMatch[match.id] ?? selectedMvp?.team ?? "home";
                                  const selectedNumberValue =
                                    liveReviewNumberByMatch[match.id] ?? (selectedMvp ? String(selectedMvp.number) : "");
                                  const resolvedTeams = getResolvedMatchTeams(match);
                                  const penaltyOutcome = getResolvedKnockoutOutcome(state);
                                  const penaltyScore = getPenaltyShootoutScore(state.penaltyShootout);
                                  const penaltyWinnerTeam = penaltyOutcome?.winner ?? null;

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
                                        <button
                                          type="button"
                                          onClick={() => promptReviewScoreEdit(match)}
                                          className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/75 transition hover:bg-white/[0.08] hover:text-white"
                                        >
                                          Modifier le score
                                        </button>
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
                                            </div>
                                          ) : null}
                                        </div>
                                        <div className="mt-1 rounded-[12px] border border-white/10 bg-black/20 p-1.5">
                                          <div className="flex flex-wrap items-center justify-center gap-1">
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
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="mt-2 flex shrink-0 justify-end border-t border-white/8 pt-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCompletedLiveSlotMatchIds(null);
                                    setPendingReviewSlotMatchIds(null);
                                    setPendingPenaltySlotMatchIds(null);
                                    if (nextLiveSlot?.matches[0]) {
                                      setSelectedLiveMatchId(nextLiveSlot.matches[0].id);
                                    }
                                  }}
                                  className="rounded-full border border-fuchsia-300/30 bg-violet-600 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-violet-500"
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
                                  <p className="truncate text-sm font-semibold text-white">{resolveQualifiedTeamName(scoreEditorMatch.homeTeam)}</p>
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
                                  <p className="truncate text-sm font-semibold text-white">{resolveQualifiedTeamName(scoreEditorMatch.awayTeam)}</p>
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
                          {nextLiveSlot?.matches.length ? (
                            <div className="min-w-0 flex-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
                              <div className="flex w-max snap-x snap-mandatory items-center gap-3 pr-2 [&::-webkit-scrollbar]:hidden">
                                {nextLiveSlot.matches.map((match, index) => (
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
                                      <span className="font-semibold text-white/88">{match.fieldLabel}</span> • {resolveQualifiedTeamName(match.homeTeam)} vs {resolveQualifiedTeamName(match.awayTeam)}
                                    </button>
                                  </Fragment>
                                ))}
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
          ) : null}
        </div>

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
                      <p className="text-sm font-semibold text-white">{expandedStatsMatch.homeTeam}</p>
                      <div className="grid gap-3">
                        {expandedHomeStatsSummary.map((entry) => (
                          <div
                            key={`live-goal-modal-home-${expandedStatsMatch.id}-${entry.number}`}
                            className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                          >
                            <div className="grid grid-cols-[64px_56px_minmax(0,1fr)] items-center gap-3">
                              <p className="text-sm font-semibold text-white">N°{entry.number}</p>
                              <span className="flex items-center gap-0.5 text-[13px] leading-none [text-shadow:0_0_8px_rgba(255,255,255,0.08)]">
                                {Array.from({ length: entry.count }).map((_, index) => (
                                  <span key={`goal-icon-home-${expandedStatsMatch.id}-${entry.number}-${index}`}>⚽</span>
                                ))}
                              </span>
                              <div className="flex flex-wrap justify-end gap-1.5">
                                {entry.times.map((time) => (
                                  <span
                                    key={`goal-time-home-${expandedStatsMatch.id}-${entry.number}-${time}`}
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
                      <p className="text-sm font-semibold text-white">{expandedStatsMatch.awayTeam}</p>
                      <div className="grid gap-3">
                        {expandedAwayStatsSummary.map((entry) => (
                          <div
                            key={`live-goal-modal-away-${expandedStatsMatch.id}-${entry.number}`}
                            className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                          >
                            <div className="grid grid-cols-[64px_56px_minmax(0,1fr)] items-center gap-3">
                              <p className="text-sm font-semibold text-white">N°{entry.number}</p>
                              <span className="flex items-center gap-0.5 text-[13px] leading-none [text-shadow:0_0_8px_rgba(255,255,255,0.08)]">
                                {Array.from({ length: entry.count }).map((_, index) => (
                                  <span key={`goal-icon-away-${expandedStatsMatch.id}-${entry.number}-${index}`}>⚽</span>
                                ))}
                              </span>
                              <div className="flex flex-wrap justify-end gap-1.5">
                                {entry.times.map((time) => (
                                  <span
                                    key={`goal-time-away-${expandedStatsMatch.id}-${entry.number}-${time}`}
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
