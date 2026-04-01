"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { TournamentPreview } from "@/components/tournament-preview/TournamentPreview";
import type {
  TournamentPreviewData,
  TournamentPreviewGroup,
  TournamentPreviewPlacementSection,
  TournamentPreviewRound,
  TournamentPreviewStandingRow,
} from "@/components/tournament-preview/types";

type ManualTournamentState = {
  name: string;
  date: string;
  teamsCount: number;
  teamEntries: string[];
  groupAssignments: (string | null)[][];
  groupsCount: number;
  qualification: "top1" | "top2" | "best3";
  tournamentPhaseType: "simple" | "double";
  bracketType: "round_of_32" | "round_of_16" | "quarter" | "semi";
  consolationBracketType: "round_of_32" | "round_of_16" | "quarter" | "semi";
  placementMatches: boolean;
  fieldCount: number;
  categories: string[];
  levels: string[];
};

type ManualControlTab = "teams" | "groups" | "qualification" | "bracket" | "general";
type GroupSlotTarget = { groupIndex: number; slotIndex: number };

const TEAM_COUNT_OPTIONS = [6, 8, 10, 12, 16, 24, 25, 32, 64] as const;
const GROUP_COUNT_OPTIONS = [2, 3, 4, 5] as const;
const QUALIFICATION_OPTIONS = [
  { key: "top1" as const, label: "1er" },
  { key: "top2" as const, label: "2eme" },
  { key: "best3" as const, label: "Meilleur 3eme" },
] as const;
const BRACKET_OPTIONS = [
  { key: "round_of_32" as const, label: "16eme" },
  { key: "round_of_16" as const, label: "8eme" },
  { key: "quarter" as const, label: "Quart" },
  { key: "semi" as const, label: "Demi" },
] as const;
const CATEGORY_OPTIONS = ["U7", "U8", "U9", "U10", "U11", "U12", "U13"] as const;
const LEVEL_OPTIONS = ["Niv 1", "Niv 2", "Niv 3", "Tous"] as const;

const DEFAULT_STATE: ManualTournamentState = {
  name: "",
  date: "",
  teamsCount: 16,
  teamEntries: [],
  groupAssignments: [],
  groupsCount: 4,
  qualification: "top2",
  tournamentPhaseType: "simple",
  bracketType: "quarter",
  consolationBracketType: "semi",
  placementMatches: true,
  fieldCount: 2,
  categories: ["U11"],
  levels: ["Tous"],
};

type CalendarCell = {
  iso: string | null;
  day: number | null;
  isCurrentMonth: boolean;
};

function buildCalendarWeeks(visibleMonth: Date): CalendarCell[][] {
  const startOfMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const endOfMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);
  const startOffset = (startOfMonth.getDay() + 6) % 7;
  const totalCells = Math.max(35, Math.ceil((startOffset + endOfMonth.getDate()) / 7) * 7);

  const cells: CalendarCell[] = Array.from({ length: totalCells }, (_, index) => {
    const dayNumber = index - startOffset + 1;
    if (dayNumber < 1 || dayNumber > endOfMonth.getDate()) {
      return {
        iso: null,
        day: null,
        isCurrentMonth: false,
      };
    }

    const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), dayNumber);
    return {
      iso: `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`,
      day: date.getDate(),
      isCurrentMonth: true,
    };
  });

  const weeks: CalendarCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return weeks;
}

const getQualificationRank = (qualification: ManualTournamentState["qualification"]) =>
  qualification === "top1" ? 1 : qualification === "top2" ? 2 : 3;

const getAvailableGroupCounts = (teamsCount: number) =>
  GROUP_COUNT_OPTIONS.filter((option) => teamsCount / option >= 2);

const getAvailableQualifications = (teamsCount: number, groupsCount: number) =>
  QUALIFICATION_OPTIONS.filter(
    (option) => getQualificationRank(option.key) <= Math.max(1, Math.floor(teamsCount / groupsCount)),
  );

const getGroupCapacities = (teamsCount: number, groupsCount: number) => {
  const safeGroupsCount = Math.max(1, groupsCount);
  const baseSize = Math.floor(teamsCount / safeGroupsCount);
  const remainder = teamsCount % safeGroupsCount;

  return Array.from({ length: safeGroupsCount }, (_, index) => baseSize + (index < remainder ? 1 : 0));
};

const buildTeams = (teamsCount: number) =>
  Array.from({ length: teamsCount }, (_, index) => `Equipe ${index + 1}`);

const normalizeTeamEntries = (teamEntries: string[], teamsCount: number) => {
  const seen = new Set<string>();
  const normalizedEntries: string[] = [];

  teamEntries.forEach((entry) => {
    const normalized = entry.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    normalizedEntries.push(normalized);
  });

  return normalizedEntries.slice(0, Math.max(0, teamsCount));
};

const buildResolvedTeams = (teamEntries: string[], teamsCount: number) => {
  const normalizedEntries = normalizeTeamEntries(teamEntries, teamsCount);
  const fallbackCount = Math.max(0, teamsCount - normalizedEntries.length);
  const fallbackTeams = Array.from(
    { length: fallbackCount },
    (_, index) => `Equipe ${normalizedEntries.length + index + 1}`,
  );

  return [...normalizedEntries, ...fallbackTeams];
};

const stripDuplicateSuffix = (teamName: string) => teamName.replace(/\s+\((\d+)\)$/i, "").trim();

const buildUniqueTeamName = (teamName: string, existingNames: string[]) => {
  const normalized = teamName.trim();
  if (!normalized) return "";

  const baseName = stripDuplicateSuffix(normalized);
  const matchingNames = existingNames.filter((entry) => stripDuplicateSuffix(entry) === baseName);

  if (matchingNames.length === 0) {
    return baseName;
  }

  let suffix = 2;
  let candidate = `${baseName} (${suffix})`;

  while (existingNames.includes(candidate)) {
    suffix += 1;
    candidate = `${baseName} (${suffix})`;
  }

  return candidate;
};

const normalizeGroupAssignments = (
  groupAssignments: (string | null)[][],
  teamsCount: number,
  groupsCount: number,
  resolvedTeams: string[],
) => {
  const capacities = getGroupCapacities(teamsCount, groupsCount);
  const allowedTeams = new Set(resolvedTeams);
  const usedTeams = new Set<string>();

  const assignments = capacities.map((capacity, groupIndex) =>
    Array.from({ length: capacity }, (_, slotIndex) => {
      const candidate = groupAssignments[groupIndex]?.[slotIndex] ?? null;
      if (!candidate || !allowedTeams.has(candidate) || usedTeams.has(candidate)) {
        return null;
      }

      usedTeams.add(candidate);
      return candidate;
    }),
  );

  const remainingTeams = resolvedTeams.filter((team) => !usedTeams.has(team));

  return assignments.map((group) =>
    group.map((team) => {
      if (team) return team;
      return remainingTeams.shift() ?? null;
    }),
  );
};

const normalizeManualTournamentState = (state: ManualTournamentState): ManualTournamentState => {
  const teamEntries = normalizeTeamEntries(state.teamEntries, state.teamsCount);
  const resolvedTeams = buildResolvedTeams(teamEntries, state.teamsCount);
  const groupAssignments = normalizeGroupAssignments(
    state.groupAssignments,
    state.teamsCount,
    state.groupsCount,
    resolvedTeams,
  );

  if (
    teamEntries.length === state.teamEntries.length &&
    groupAssignments.length === state.groupAssignments.length &&
    groupAssignments.every(
      (group, groupIndex) =>
        group.length === (state.groupAssignments[groupIndex]?.length ?? 0) &&
        group.every((team, slotIndex) => team === state.groupAssignments[groupIndex]?.[slotIndex]),
    )
  ) {
    return state;
  }

  return {
    ...state,
    teamEntries,
    groupAssignments,
  };
};

const buildGroupsFromAssignments = (groupAssignments: (string | null)[][]) =>
  groupAssignments.map((groupSlots, index) => ({
    id: `group-${index + 1}`,
    label: `Poule ${String.fromCharCode(65 + index)}`,
    teams: groupSlots.filter((team): team is string => Boolean(team)),
  }));

const buildStandings = (teams: string[]): TournamentPreviewStandingRow[] =>
  teams.map((team, index) => ({
    team,
    rank: index + 1,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    diff: 0,
    points: 0,
  }));

const getDesiredEntrantCount = (bracketType: ManualTournamentState["bracketType"]) =>
  bracketType === "round_of_32"
    ? 32
    : bracketType === "round_of_16"
      ? 16
      : bracketType === "quarter"
        ? 8
        : 4;

const getHighestPowerOfTwoAtOrBelow = (value: number) => {
  if (value < 2) return 0;

  let power = 1;
  while (power * 2 <= value) {
    power *= 2;
  }

  return power;
};

const getRoundMeta = (entrantCount: number) => {
  if (entrantCount === 32) {
    return { id: "round-of-32", label: "16emes", matchLabel: "16eme", prefix: "16E" };
  }
  if (entrantCount === 16) {
    return { id: "round-of-16", label: "8emes", matchLabel: "8eme", prefix: "8E" };
  }
  if (entrantCount === 8) {
    return { id: "quarter", label: "Quarts", matchLabel: "Quart", prefix: "QF" };
  }
  if (entrantCount === 4) {
    return { id: "semi", label: "Demi-finales", matchLabel: "Demi", prefix: "SF" };
  }
  return { id: "final", label: "Finale", matchLabel: "Finale", prefix: "F" };
};

const buildAllSeedLabelsFromGroups = (groups: TournamentPreviewGroup[]) => {
  const maxGroupSize = Math.max(0, ...groups.map((group) => group.standings.length));
  const labels: string[] = [];

  for (let rank = 1; rank <= maxGroupSize; rank += 1) {
    groups.forEach((group) => {
      if (group.standings.length >= rank) {
        const letter = group.label.replace(/^Poule\s+/i, "").trim();
        labels.push(`${rank}${letter}`);
      }
    });
  }

  return labels;
};

const buildQualifiedLabelsFromGroups = (
  groups: TournamentPreviewGroup[],
  bracketType: ManualTournamentState["bracketType"],
) => {
  const desiredEntrants = getDesiredEntrantCount(bracketType);
  const maxGroupSize = Math.max(0, ...groups.map((group) => group.standings.length));
  const selectedSeedLabels: string[] = [];
  const displayLabels: string[] = [];
  let resolvedQualificationLabel = "Auto";
  let lastFullRank = 0;
  let partialRank = 0;
  let partialCount = 0;

  for (let rank = 1; rank <= maxGroupSize && selectedSeedLabels.length < desiredEntrants; rank += 1) {
    const rankLabels = groups
      .filter((group) => group.standings.length >= rank)
      .map((group) => {
        const letter = group.label.replace(/^Poule\s+/i, "").trim();
        return `${rank}${letter}`;
      });

    if (selectedSeedLabels.length + rankLabels.length <= desiredEntrants) {
      selectedSeedLabels.push(...rankLabels);
      displayLabels.push(...rankLabels);
      lastFullRank = rank;
      continue;
    }

    const remainingSlots = desiredEntrants - selectedSeedLabels.length;
    const partialLabels = rankLabels.slice(0, remainingSlots);
    selectedSeedLabels.push(...partialLabels);
    displayLabels.push(...partialLabels.map((label) => `⭐ ${label}`));
    partialRank = rank;
    partialCount = partialLabels.length;
  }

  if (selectedSeedLabels.length !== desiredEntrants) {
    return {
      desiredEntrants,
      directQualifiedCount: selectedSeedLabels.length,
      resolvedQualificationLabel,
      selectedSeedLabels: [] as string[],
      displayLabels: [] as string[],
      isValid: false,
      errorMessage: "Bracket impossible sous ce format",
    };
  }

  if (partialRank > 0) {
    const baseLabel =
      lastFullRank > 0 ? `Top ${lastFullRank}` : "Top 1";
    resolvedQualificationLabel = `${baseLabel} + ⭐ ${partialCount} ${partialRank}e`;
  } else if (lastFullRank > 0) {
    resolvedQualificationLabel = lastFullRank === 1 ? "Top 1" : `Top ${lastFullRank}`;
  }

  return {
    desiredEntrants,
    directQualifiedCount: selectedSeedLabels.length,
    resolvedQualificationLabel,
    selectedSeedLabels,
    displayLabels,
    isValid: true,
    errorMessage: undefined,
  };
};

const getPlacementLabel = (startRank: number, count: number) =>
  count === 2 ? `${startRank}e place` : `${startRank}e-${startRank + count - 1}e`;

const buildPlacementBand = (
  startRank: number,
  participants: string[],
  prefix: string,
): TournamentPreviewRound[] => {
  if (participants.length < 2) {
    return [];
  }

  const highestPower = getHighestPowerOfTwoAtOrBelow(participants.length);

  if (participants.length > highestPower) {
    const barrageMatchCount = participants.length - highestPower;
    const byeCount = participants.length - barrageMatchCount * 2;
    const barrageParticipants = participants.slice(byeCount);
    const barrageMatches = Array.from({ length: barrageMatchCount }, (_, index) => ({
      id: `${prefix}-play-in-${index + 1}`,
      label: `Barrage ${index + 1}`,
      homeTeam: barrageParticipants[index] ?? `Seed ${index + 1}`,
      awayTeam:
        barrageParticipants[barrageParticipants.length - 1 - index] ??
        `Seed ${barrageParticipants.length - index}`,
    }));

    const upperBandParticipants = [
      ...participants.slice(0, byeCount),
      ...barrageMatches.map((_, index) => `Vainqueur ${prefix}B${index + 1}`),
    ];
    const lowerBandParticipants = barrageMatches.map(
      (_, index) => `Perdant ${prefix}B${index + 1}`,
    );

    return [
      {
        id: `${prefix}-play-in-round`,
        label: `Barrages ${startRank}e-${startRank + participants.length - 1}e`,
        matches: barrageMatches,
      },
      ...buildPlacementBand(startRank + highestPower, lowerBandParticipants, `${prefix}L`),
      ...buildPlacementBand(startRank, upperBandParticipants, `${prefix}W`),
    ];
  }

  if (participants.length === 2) {
    return [
      {
        id: `${prefix}-final-round`,
        label: `Classement ${getPlacementLabel(startRank, 2)}`,
        matches: [
          {
            id: `${prefix}-final`,
            label: getPlacementLabel(startRank, 2),
            homeTeam: participants[0] ?? "Equipe 1",
            awayTeam: participants[1] ?? "Equipe 2",
          },
        ],
      },
    ];
  }

  const matches = Array.from({ length: participants.length / 2 }, (_, index) => ({
    id: `${prefix}-match-${index + 1}`,
    label: getPlacementLabel(startRank, participants.length),
    homeTeam: participants[index] ?? `Seed ${index + 1}`,
    awayTeam:
      participants[participants.length - 1 - index] ??
      `Seed ${participants.length - index}`,
  }));
  const winners = matches.map((_, index) => `Vainqueur ${prefix}${index + 1}`);
  const losers = matches.map((_, index) => `Perdant ${prefix}${index + 1}`);
  const halfSize = participants.length / 2;

  return [
    {
      id: `${prefix}-round`,
      label: `Classement ${getPlacementLabel(startRank, participants.length)}`,
      matches,
    },
    ...buildPlacementBand(startRank + halfSize, losers, `${prefix}L`),
    ...buildPlacementBand(startRank, winners, `${prefix}W`),
  ];
};

const buildMainBracketPlacementRounds = (startRank: number, drawSize: number, prefix: string) => {
  const rounds: TournamentPreviewRound[] = [];

  if (drawSize >= 8) {
    rounds.push(
      ...buildPlacementBand(
        startRank + 4,
        Array.from({ length: 4 }, (_, index) => `Perdant ${prefix}QF${index + 1}`),
        `${prefix}CL5`,
      ),
    );
  }

  if (drawSize >= 4) {
    rounds.push(
      ...buildPlacementBand(
        startRank + 2,
        [`Perdant ${prefix}SF1`, `Perdant ${prefix}SF2`],
        `${prefix}CL3`,
      ),
    );
  }

  if (drawSize >= 16) {
    rounds.push(
      ...buildPlacementBand(
        startRank + 8,
        Array.from({ length: 8 }, (_, index) => `Perdant ${prefix}8E${index + 1}`),
        `${prefix}CL9`,
      ),
    );
  }

  if (drawSize >= 32) {
    rounds.push(
      ...buildPlacementBand(
        startRank + 16,
        Array.from({ length: 16 }, (_, index) => `Perdant ${prefix}16E${index + 1}`),
        `${prefix}CL17`,
      ),
    );
  }

  return rounds;
};

const buildBracket = (
  bracketType: ManualTournamentState["bracketType"],
  displayLabels: string[],
  selectedSeedLabels: string[],
  prefix: string,
  errorMessage?: string,
) => {
  const entrantCount = selectedSeedLabels.length;

  if (displayLabels.length === 0) {
    return {
      rounds: [] as TournamentPreviewRound[],
      entrantCount: 0,
      mainDrawSize: 0,
      selectedSeedLabels: [] as string[],
      bracketLabel: "Phase finale indisponible",
      errorMessage,
    };
  }

  const rounds: TournamentPreviewRound[] = [];
  const mainDrawSize = displayLabels.length;
  let currentEntrants = mainDrawSize;
  let currentLabels = [...displayLabels];

  while (currentEntrants >= 2) {
    const meta = getRoundMeta(currentEntrants);
    const matchCount = Math.floor(currentEntrants / 2);
    const matches = Array.from({ length: matchCount }, (_, index) => ({
      id: `${prefix}-${meta.prefix}${index + 1}`,
      label: currentEntrants === 2 ? "Finale" : `${meta.matchLabel} ${index + 1}`,
      homeTeam: currentLabels[index] ?? `Seed ${index + 1}`,
      awayTeam:
        currentLabels[currentLabels.length - 1 - index] ??
        `Seed ${currentLabels.length - index}`,
    }));

    rounds.push({
      id: `${prefix}-${meta.id}`,
      label: meta.label,
      matches,
    });

    if (currentEntrants === 2) break;

    currentLabels = matches.map((match) => `Vainqueur ${match.id}`);
    currentEntrants /= 2;
  }

  const topRound = rounds[0];
  const baseBracketLabel =
    topRound?.label === "16emes"
      ? "16eme + 8eme + Quart + Demi + Finale"
      : topRound?.label === "8emes"
        ? "8eme + Quart + Demi + Finale"
        : topRound?.label === "Quarts"
          ? "Quart + Demi + Finale"
          : topRound?.label === "Demi-finales"
            ? "Demi + Finale"
              : "Finale";

  return {
    rounds,
    entrantCount,
    mainDrawSize,
    selectedSeedLabels,
    bracketLabel: baseBracketLabel,
    errorMessage,
  };
};

const relabelConsolationRounds = (rounds: TournamentPreviewRound[]) =>
  rounds.map((round, index) => {
    const isFirstRound = index === 0;
    const isFinalRound = index === rounds.length - 1;

    return {
      ...round,
      label: isFinalRound
        ? "Finale consolante"
        : isFirstRound
          ? `${round.label.replace(/s$/, "")} consolante`
          : round.label,
      matches: round.matches.map((match) => ({
        ...match,
        label: isFinalRound
          ? "Finale consolante"
          : isFirstRound
            ? `${match.label} consolante`
            : match.label,
      })),
    };
  });

const buildSecondaryBracket = (
  bracketType: ManualTournamentState["bracketType"],
  remainingSeedLabels: string[],
  startRank: number,
) => {
  const desiredEntrants = getDesiredEntrantCount(bracketType);

  if (remainingSeedLabels.length < desiredEntrants) {
    return {
      rounds: [] as TournamentPreviewRound[],
      bracketLabel: "Consolante indisponible",
      errorMessage: "Bracket impossible sous ce format",
      selectedSeedLabels: [] as string[],
      drawSize: 0,
    };
  }

  const selectedSeedLabels = remainingSeedLabels.slice(0, desiredEntrants);
  const displayLabels = [...selectedSeedLabels];

  const result = buildBracket(
    bracketType,
    displayLabels,
    selectedSeedLabels,
    "secondary",
  );

  return {
    rounds: relabelConsolationRounds(result.rounds),
    bracketLabel: `Consolante • ${startRank}e-${startRank + desiredEntrants - 1}e`,
    errorMessage: undefined,
    selectedSeedLabels,
    drawSize: desiredEntrants,
  };
};

const buildClassementSections = (
  totalSeedLabels: string[],
  selectedSeedLabels: string[],
  entrantCount: number,
  mainDrawSize: number,
  secondarySelectedSeedLabels: string[],
  secondaryDrawSize: number,
  phaseType: ManualTournamentState["tournamentPhaseType"],
  enabled: boolean,
) => {
  if (!enabled) return [];

  const sections: TournamentPreviewPlacementSection[] = [];
  const mainBracketPlacementRounds = buildMainBracketPlacementRounds(1, mainDrawSize, "");
  if (mainBracketPlacementRounds.length > 0) {
    sections.push({
      id: "main-bracket-placement",
      title: "Matchs de classement des phases finales",
      rounds: mainBracketPlacementRounds,
    });
  }

  const secondaryBracketPlacementRounds =
    phaseType === "double"
      ? buildMainBracketPlacementRounds(
          selectedSeedLabels.length + 1,
          secondaryDrawSize,
          "CONS. ",
        )
      : [];
  if (secondaryBracketPlacementRounds.length > 0) {
    sections.push({
      id: "secondary-bracket-placement",
      title: "Matchs de classement consolante",
      rounds: secondaryBracketPlacementRounds,
    });
  }

  const excludedFromMain = totalSeedLabels.filter((seed) => !selectedSeedLabels.includes(seed));
  const poolRemainingSeeds =
    phaseType === "double"
      ? excludedFromMain.filter((seed) => !secondarySelectedSeedLabels.includes(seed))
      : excludedFromMain;
  if (poolRemainingSeeds.length >= 2) {
    sections.push({
      id: "group-placement",
      title: "Classement poules",
      rounds: buildPlacementBand(
        entrantCount + 1,
        poolRemainingSeeds,
        `CL${entrantCount + 1}Q`,
      ),
    });
  }

  return sections;
};

const buildPreviewData = (state: ManualTournamentState): TournamentPreviewData => {
  const groups = buildGroupsFromAssignments(state.groupAssignments);
  const previewGroups: TournamentPreviewGroup[] = groups.map((group) => ({
    id: group.id,
    label: group.label,
    standings: buildStandings(group.teams),
  }));
  const allSeedLabels = buildAllSeedLabelsFromGroups(previewGroups);
  const qualifiedBracket = buildQualifiedLabelsFromGroups(
    previewGroups,
    state.bracketType,
  );
  const bracketResult = buildBracket(
    state.bracketType,
    qualifiedBracket.displayLabels,
    qualifiedBracket.selectedSeedLabels,
    "main",
    qualifiedBracket.errorMessage,
  );
  const secondarySeedLabels =
    state.tournamentPhaseType === "double" && qualifiedBracket.isValid
      ? allSeedLabels.filter((seed) => !qualifiedBracket.selectedSeedLabels.includes(seed))
      : [];
  const secondaryBracketResult = buildSecondaryBracket(
    state.consolationBracketType,
    secondarySeedLabels,
    bracketResult.entrantCount + 1,
  );
  const classementSections = buildClassementSections(
    allSeedLabels,
    bracketResult.selectedSeedLabels,
    bracketResult.entrantCount,
    bracketResult.mainDrawSize,
    secondaryBracketResult.selectedSeedLabels,
    secondaryBracketResult.drawSize,
    state.tournamentPhaseType,
    state.placementMatches,
  );

  return {
    name: state.name.trim() || "Builder tournoi",
    date: state.date || undefined,
    teamsCount: state.teamsCount,
    groupsCount: state.groupsCount,
    phaseType: state.tournamentPhaseType,
    qualificationLabel: qualifiedBracket.resolvedQualificationLabel,
    bracketLabel: bracketResult.bracketLabel,
    bracketError: bracketResult.errorMessage,
    secondaryBracketLabel: secondaryBracketResult.bracketLabel,
    secondaryBracketError: secondaryBracketResult.errorMessage,
    placementMatches: state.placementMatches,
    groups: previewGroups,
    bracket: bracketResult.rounds,
    secondaryBracket: secondaryBracketResult.rounds,
    classementSections,
    classement: classementSections.flatMap((section) => section.rounds),
  };
};

function PillOption({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
        active
          ? "border border-violet-300/30 bg-violet-500/18 text-white shadow-[0_0_18px_rgba(124,58,237,0.24)]"
          : "border border-white/10 bg-black/20 text-slate-300 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function ManualTournamentBuilder({
  registeredTeamOptions,
}: {
  registeredTeamOptions: string[];
}) {
  const router = useRouter();
  const datePickerPanelRef = useRef<HTMLDivElement | null>(null);
  const [manualTournamentState, setManualTournamentState] =
    useState<ManualTournamentState>(DEFAULT_STATE);
  const [isEditingTournamentName, setIsEditingTournamentName] = useState(true);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [activeControlTab, setActiveControlTab] = useState<ManualControlTab | null>(null);
  const [manualTeamCountDraft, setManualTeamCountDraft] = useState("");
  const [registeredTeamSearch, setRegisteredTeamSearch] = useState("");
  const [manualTeamNameDraft, setManualTeamNameDraft] = useState("");
  const [slotManualTeamNameDraft, setSlotManualTeamNameDraft] = useState("");
  const [showAddTeamPanel, setShowAddTeamPanel] = useState(false);
  const [manualGroupCountDraft, setManualGroupCountDraft] = useState("");
  const [manualFieldCountDraft, setManualFieldCountDraft] = useState("");
  const [manualCategoryDraft, setManualCategoryDraft] = useState("");
  const [manualLevelDraft, setManualLevelDraft] = useState("");
  const [editingSlotTarget, setEditingSlotTarget] = useState<GroupSlotTarget | null>(null);
  const [movingSlotTarget, setMovingSlotTarget] = useState<GroupSlotTarget | null>(null);
  const [hoveredSeedCode, setHoveredSeedCode] = useState<string | null>(null);
  const [pinnedSeedCode, setPinnedSeedCode] = useState<string | null>(null);
  const [shuffleFeedbackActive, setShuffleFeedbackActive] = useState(false);
  const previousPhaseTypeRef = useRef<ManualTournamentState["tournamentPhaseType"]>(
    DEFAULT_STATE.tournamentPhaseType,
  );
  const shuffleFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToSecondaryBracket = () => {
    window.requestAnimationFrame(() => {
      document
        .getElementById("manual-builder-secondary-bracket")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const availableGroupCounts = useMemo(
    () => getAvailableGroupCounts(manualTournamentState.teamsCount),
    [manualTournamentState.teamsCount],
  );
  const groupsCount =
    Number.isFinite(manualTournamentState.groupsCount) && manualTournamentState.groupsCount >= 1
      ? Math.round(manualTournamentState.groupsCount)
      : (availableGroupCounts[0] ?? 2);
  const availableQualifications = useMemo(
    () => getAvailableQualifications(manualTournamentState.teamsCount, groupsCount),
    [groupsCount, manualTournamentState.teamsCount],
  );
  const groupCapacities = useMemo(
    () => getGroupCapacities(manualTournamentState.teamsCount, groupsCount),
    [groupsCount, manualTournamentState.teamsCount],
  );
  const qualification = availableQualifications.some(
    (option) => option.key === manualTournamentState.qualification,
  )
    ? manualTournamentState.qualification
    : (availableQualifications[0]?.key ?? "top1");

  const normalizedState = useMemo(
    () =>
      normalizeManualTournamentState({
        ...manualTournamentState,
        groupsCount,
        qualification,
      }),
    [groupsCount, manualTournamentState, qualification],
  );

  const previewData = useMemo(
    () => buildPreviewData(normalizedState),
    [normalizedState],
  );

  useEffect(() => {
    const wasDouble = previousPhaseTypeRef.current === "double";
    previousPhaseTypeRef.current = normalizedState.tournamentPhaseType;

    if (wasDouble || normalizedState.tournamentPhaseType !== "double") {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      document
        .getElementById("manual-builder-secondary-bracket")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [normalizedState.tournamentPhaseType]);

  const effectiveSelectedGroupId =
    selectedGroupId && previewData.groups.some((group) => group.id === selectedGroupId)
      ? selectedGroupId
      : (previewData.groups[0]?.id ?? null);
  const effectiveHighlightedSeed = pinnedSeedCode ?? hoveredSeedCode;
  const tournamentName = manualTournamentState.name.trim();
  const tournamentDate = manualTournamentState.date.trim();
  const formattedTournamentDate = tournamentDate
    ? new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(`${tournamentDate}T00:00:00`))
    : "";
  const filteredRegisteredTeams = useMemo(() => {
    const query = registeredTeamSearch.trim().toLowerCase();

    return registeredTeamOptions.filter((team) => {
      if (!query) return true;

      return team.toLowerCase().includes(query);
    });
  }, [registeredTeamOptions, registeredTeamSearch]);

  const [visibleCalendarMonth, setVisibleCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  useEffect(() => {
    if (!isDatePickerOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        datePickerPanelRef.current?.contains(target) ||
        target?.closest?.("[data-calendar-toggle='true']")
      ) {
        return;
      }
      setIsDatePickerOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isDatePickerOpen, tournamentDate]);

  const calendarWeeks = useMemo(() => {
    return buildCalendarWeeks(visibleCalendarMonth);
  }, [visibleCalendarMonth]);

  const shuffleGroupAssignments = () => {
    setManualTournamentState((current) => {
      const normalizedCurrent = normalizeManualTournamentState(current);
      const flattenedTeams = normalizedCurrent.groupAssignments.flat().filter((team): team is string => Boolean(team));
      if (flattenedTeams.length <= 1) return normalizedCurrent;

      const shuffledTeams = [...flattenedTeams];
      for (let index = shuffledTeams.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        const currentValue = shuffledTeams[index];
        shuffledTeams[index] = shuffledTeams[swapIndex] ?? currentValue;
        shuffledTeams[swapIndex] = currentValue;
      }

      const nextAssignments = normalizedCurrent.groupAssignments.map((group) =>
        group.map(() => shuffledTeams.shift() ?? null),
      );

      return normalizeManualTournamentState({
        ...normalizedCurrent,
        groupAssignments: nextAssignments,
      });
    });
    setEditingSlotTarget(null);
    setMovingSlotTarget(null);
    setPinnedSeedCode(null);
    setShuffleFeedbackActive(true);
    if (shuffleFeedbackTimeoutRef.current) {
      clearTimeout(shuffleFeedbackTimeoutRef.current);
    }
    shuffleFeedbackTimeoutRef.current = setTimeout(() => {
      setShuffleFeedbackActive(false);
    }, 900);
  };

  const addTeamEntry = (teamName: string) => {
    const normalized = teamName.trim();
    if (!normalized) return;

    setManualTournamentState((current) =>
      normalizeManualTournamentState({
        ...current,
        teamEntries:
          current.teamEntries.length >= current.teamsCount
            ? current.teamEntries
            : [...current.teamEntries, buildUniqueTeamName(normalized, current.teamEntries)],
      }),
    );
  };

  const removeTeamEntry = (teamName: string) => {
    setManualTournamentState((current) =>
      normalizeManualTournamentState({
        ...current,
        teamEntries: current.teamEntries.filter((entry) => entry !== teamName),
      }),
    );
    setEditingSlotTarget(null);
  };

  const swapGroupSlots = (source: GroupSlotTarget, target: GroupSlotTarget) => {
    setManualTournamentState((current) => {
      const normalizedCurrent = normalizeManualTournamentState(current);
      const nextAssignments = normalizedCurrent.groupAssignments.map((group) => [...group]);
      const sourceValue = nextAssignments[source.groupIndex]?.[source.slotIndex] ?? null;
      const targetValue = nextAssignments[target.groupIndex]?.[target.slotIndex] ?? null;

      if (!sourceValue || !nextAssignments[source.groupIndex] || !nextAssignments[target.groupIndex]) {
        return normalizedCurrent;
      }

      nextAssignments[source.groupIndex][source.slotIndex] = targetValue;
      nextAssignments[target.groupIndex][target.slotIndex] = sourceValue;

      const placeholderTeams = new Set(buildTeams(normalizedCurrent.teamsCount));
      const nextTeamEntries = nextAssignments
        .flat()
        .filter((team): team is string => Boolean(team) && !placeholderTeams.has(team));

      return normalizeManualTournamentState({
        ...normalizedCurrent,
        groupAssignments: nextAssignments,
        teamEntries: nextTeamEntries,
      });
    });
    setMovingSlotTarget(null);
    setPinnedSeedCode(null);
  };

  const removeGroupSlotTeam = (target: GroupSlotTarget) => {
    setManualTournamentState((current) => {
      const normalizedCurrent = normalizeManualTournamentState(current);
      const nextAssignments = normalizedCurrent.groupAssignments.map((group) => [...group]);
      const removedTeam = nextAssignments[target.groupIndex]?.[target.slotIndex] ?? null;

      if (!removedTeam || !nextAssignments[target.groupIndex]) {
        return normalizedCurrent;
      }

      nextAssignments[target.groupIndex][target.slotIndex] = null;

      return normalizeManualTournamentState({
        ...normalizedCurrent,
        teamEntries: normalizedCurrent.teamEntries.filter((entry) => entry !== removedTeam),
        groupAssignments: nextAssignments,
      });
    });
    setMovingSlotTarget(null);
    setPinnedSeedCode(null);
  };

  const replaceGroupSlotTeam = (target: GroupSlotTarget, teamName: string) => {
    setManualTournamentState((current) => {
      const normalizedCurrent = normalizeManualTournamentState(current);
      const nextAssignments = normalizedCurrent.groupAssignments.map((group) => [...group]);
      const targetCurrentValue = nextAssignments[target.groupIndex]?.[target.slotIndex] ?? null;
      const existingAssignedNames = nextAssignments
        .flat()
        .filter((team): team is string => Boolean(team))
        .filter((team) => team !== targetCurrentValue);
      const resolvedTeamName = buildUniqueTeamName(teamName, existingAssignedNames);
      let existingTarget: GroupSlotTarget | null = null;

      nextAssignments.forEach((group, groupIndex) => {
        group.forEach((entry, slotIndex) => {
          if (entry === resolvedTeamName) {
            existingTarget = { groupIndex, slotIndex };
          }
        });
      });

      if (!nextAssignments[target.groupIndex]) {
        return normalizedCurrent;
      }

      if (existingTarget) {
        nextAssignments[existingTarget.groupIndex][existingTarget.slotIndex] = targetCurrentValue;
      }

      const nextState = {
        ...normalizedCurrent,
        groupAssignments: nextAssignments.map((group, groupIndex) =>
          groupIndex === target.groupIndex
            ? group.map((entry, slotIndex) => (slotIndex === target.slotIndex ? resolvedTeamName : entry))
            : group,
        ),
      };

      const placeholderTeams = new Set(buildTeams(normalizedCurrent.teamsCount));
      const nextTeamEntries = nextState.groupAssignments
        .flat()
        .filter((team): team is string => Boolean(team) && !placeholderTeams.has(team));

      return normalizeManualTournamentState({
        ...nextState,
        teamEntries: nextTeamEntries,
      });
    });
    setEditingSlotTarget(null);
    setSlotManualTeamNameDraft("");
    setMovingSlotTarget(null);
    setPinnedSeedCode(null);
  };

  const applyManualTeamCount = () => {
    const parsed = Number(manualTeamCountDraft);
    if (!Number.isFinite(parsed) || parsed < 2) return;
    setManualTournamentState((current) => ({
      ...current,
      teamsCount: Math.max(2, Math.round(parsed)),
    }));
    setManualTeamCountDraft("");
    setActiveControlTab(null);
  };

  const applyManualGroupCount = () => {
    const parsed = Number(manualGroupCountDraft);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    setManualTournamentState((current) => ({
      ...current,
      groupsCount: Math.max(1, Math.round(parsed)),
    }));
    setManualGroupCountDraft("");
    setActiveControlTab(null);
  };

  const applyManualFieldCount = () => {
    const parsed = Number(manualFieldCountDraft);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    setManualTournamentState((current) => ({
      ...current,
      fieldCount: Math.max(1, Math.round(parsed)),
    }));
    setManualFieldCountDraft("");
    setActiveControlTab(null);
  };

  const applyManualCategory = () => {
    const value = manualCategoryDraft.trim();
    if (!value) return;
    setManualTournamentState((current) => ({
      ...current,
      categories: current.categories.includes(value)
        ? current.categories
        : [...current.categories, value],
    }));
    setManualCategoryDraft("");
    setActiveControlTab(null);
  };

  const applyManualLevel = () => {
    const value = manualLevelDraft.trim();
    if (!value) return;
    setManualTournamentState((current) => ({
      ...current,
      levels: current.levels.includes(value) ? current.levels : [...current.levels, value],
    }));
    setManualLevelDraft("");
    setActiveControlTab(null);
  };

  const controlTabs: Array<{ key: ManualControlTab; label: string }> = [
    { key: "teams", label: "Equipes" },
    { key: "groups", label: "Groupes" },
    { key: "qualification", label: "Qualif" },
    { key: "bracket", label: "Bracket" },
    { key: "general", label: "Info general" },
  ];
  const controlPanelContent =
    activeControlTab === "teams" ? (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Source unique</p>
            <p className="mt-1 text-sm text-slate-300">
              {normalizedState.teamEntries.length} / {normalizedState.teamsCount} equipes
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddTeamPanel((current) => !current)}
            className="rounded-full border border-violet-300/20 bg-violet-500/14 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-100 transition hover:bg-violet-500/20 hover:text-white"
          >
            Ajouter equipe
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {TEAM_COUNT_OPTIONS.map((option) => (
            <PillOption
              key={option}
              active={normalizedState.teamsCount === option}
              onClick={() => {
                    setManualTournamentState((current) => ({
                      ...normalizeManualTournamentState({
                        ...current,
                        teamsCount: option,
                      }),
                    }));
                setActiveControlTab(null);
              }}
            >
              {option}
            </PillOption>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">Manuel</span>
          <input
            value={manualTeamCountDraft}
            onChange={(event) => setManualTeamCountDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyManualTeamCount();
            }}
            placeholder=""
            className="h-9 w-20 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
          />
          <button
            type="button"
            onClick={applyManualTeamCount}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            Valider
          </button>
        </div>
        {showAddTeamPanel ? (
          <div className="grid gap-4 rounded-[22px] border border-white/8 bg-black/20 p-4 xl:grid-cols-[1fr_auto]">
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  Equipes enregistrees
                </p>
                <div className="space-y-2">
                  <input
                    value={registeredTeamSearch}
                    onChange={(event) => setRegisteredTeamSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && filteredRegisteredTeams.length > 0) {
                        addTeamEntry(filteredRegisteredTeams[0] ?? "");
                        setRegisteredTeamSearch("");
                      }
                    }}
                    placeholder="Rechercher un club"
                    className="h-10 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                  />
                  <div className="max-h-60 overflow-y-auto rounded-[20px] border border-white/8 bg-white/[0.03] p-2">
                    <div className="space-y-2">
                      {filteredRegisteredTeams.length > 0 ? (
                        filteredRegisteredTeams.map((team) => (
                          <button
                            key={team}
                            type="button"
                            onClick={() => {
                              addTeamEntry(team);
                              setRegisteredTeamSearch("");
                            }}
                            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-3 py-2.5 text-left text-sm text-white transition hover:border-violet-300/20 hover:bg-violet-500/10"
                          >
                            <span className="line-clamp-2">{team}</span>
                            <span className="rounded-full border border-violet-300/20 bg-violet-500/14 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100">
                              Ajouter
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="px-2 py-3 text-sm text-slate-400">
                          Aucun club ne correspond a la recherche.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Ajout manuel</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={manualTeamNameDraft}
                    onChange={(event) => setManualTeamNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        addTeamEntry(manualTeamNameDraft);
                        setManualTeamNameDraft("");
                      }
                    }}
                    placeholder="Rentrer nom equipe"
                    className="h-10 min-w-[240px] flex-1 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      addTeamEntry(manualTeamNameDraft);
                      setManualTeamNameDraft("");
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            </div>
            <div className="min-w-[260px] space-y-2 rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Equipes ajoutees</p>
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {normalizedState.teamEntries.length > 0 ? (
                  normalizedState.teamEntries.map((team) => (
                    <div
                      key={team}
                      className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/20 px-3 py-2"
                    >
                      <span className="text-sm text-white">{team}</span>
                      <button
                        type="button"
                        onClick={() => removeTeamEntry(team)}
                        className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
                      >
                        Retirer
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">
                    Aucune equipe personnalisee. Le preview utilise Equipe 1, Equipe 2, etc.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    ) : activeControlTab === "groups" ? (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {GROUP_COUNT_OPTIONS.map((option) => (
            <PillOption
              key={option}
              active={groupsCount === option}
              onClick={() => {
                setManualTournamentState((current) => ({
                  ...current,
                  groupsCount: option,
                }));
                setActiveControlTab(null);
              }}
            >
              {option}
            </PillOption>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">Manuel</span>
          <input
            value={manualGroupCountDraft}
            onChange={(event) => setManualGroupCountDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyManualGroupCount();
            }}
            placeholder=""
            className="h-9 w-20 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
          />
          <button
            type="button"
            onClick={applyManualGroupCount}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            Valider
          </button>
        </div>
      </div>
    ) : activeControlTab === "qualification" ? (
      <div className="flex flex-wrap gap-2">
        {availableQualifications.map((option) => (
          <PillOption
            key={option.key}
            active={qualification === option.key}
            onClick={() => {
              setManualTournamentState((current) => ({
                ...current,
                qualification: option.key,
              }));
              setActiveControlTab(null);
            }}
          >
            {option.label}
          </PillOption>
        ))}
      </div>
    ) : activeControlTab === "bracket" ? (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Type de phase finale
          </p>
          <div className="flex flex-wrap gap-2">
            <PillOption
              active={normalizedState.tournamentPhaseType === "simple"}
              onClick={() =>
                setManualTournamentState((current) => ({
                  ...current,
                  tournamentPhaseType: "simple",
                }))
              }
            >
              Simple
            </PillOption>
            <PillOption
              active={normalizedState.tournamentPhaseType === "double"}
              onClick={() => {
                setManualTournamentState((current) => ({
                  ...current,
                  tournamentPhaseType: "double",
                }));
                setActiveControlTab(null);
                scrollToSecondaryBracket();
              }}
            >
              Double (avec consolante)
            </PillOption>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Bracket principal</p>
          <div className="flex flex-wrap gap-2">
            {BRACKET_OPTIONS.map((option) => (
              <PillOption
                key={option.key}
                active={normalizedState.bracketType === option.key}
                onClick={() => {
                  setManualTournamentState((current) => ({
                    ...current,
                    bracketType: option.key,
                  }));
                  setActiveControlTab(null);
                }}
              >
                {option.label}
              </PillOption>
            ))}
          </div>
        </div>
        {normalizedState.tournamentPhaseType === "double" ? (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Consolante</p>
            <div className="flex flex-wrap gap-2">
              {BRACKET_OPTIONS.map((option) => (
                <PillOption
                  key={`consolation-${option.key}`}
                  active={normalizedState.consolationBracketType === option.key}
                  onClick={() => {
                    setManualTournamentState((current) => ({
                      ...current,
                      consolationBracketType: option.key,
                      tournamentPhaseType: "double",
                    }));
                    setActiveControlTab(null);
                    scrollToSecondaryBracket();
                  }}
                >
                  {option.label}
                </PillOption>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-4 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Matchs de classement
            </p>
            <p className="mt-1 text-sm text-slate-300">
              Activer le classement des equipes eliminees
            </p>
          </div>
          <button
            type="button"
            aria-pressed={normalizedState.placementMatches}
            onClick={() =>
              setManualTournamentState((current) => ({
                ...current,
                placementMatches: !current.placementMatches,
              }))
            }
            className={[
              "relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border transition",
              normalizedState.placementMatches
                ? "border-emerald-300/25 bg-emerald-500/20 shadow-[0_0_18px_rgba(34,197,94,0.18)]"
                : "border-rose-300/20 bg-rose-500/14 shadow-[0_0_18px_rgba(244,63,94,0.12)]",
            ].join(" ")}
          >
            <span
              className={[
                "inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white transition",
                normalizedState.placementMatches
                  ? "translate-x-[34px] bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.45)]"
                  : "translate-x-[2px] bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.38)]",
              ].join(" ")}
            />
          </button>
        </div>
      </div>
    ) : (
      <div className="grid gap-3 xl:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Nom tournoi</p>
          <input
            value={manualTournamentState.name}
            onChange={(event) =>
              setManualTournamentState((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            className="h-9 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
            placeholder="Nom du tournoi"
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Nb de terrain</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setManualTournamentState((current) => ({
                  ...current,
                  fieldCount: Math.max(1, current.fieldCount - 1),
                }))
              }
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              -
            </button>
            <div className="inline-flex h-9 min-w-10 items-center justify-center rounded-xl border border-violet-300/30 bg-violet-500/18 px-3 text-sm font-semibold text-white">
              {normalizedState.fieldCount}
            </div>
            <button
              type="button"
              onClick={() =>
                setManualTournamentState((current) => ({
                  ...current,
                  fieldCount: current.fieldCount + 1,
                }))
              }
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              +
            </button>
            <input
              value={manualFieldCountDraft}
              onChange={(event) => setManualFieldCountDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyManualFieldCount();
              }}
              placeholder="manuel"
              className="h-9 w-20 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Categorie</p>
          <details className="rounded-xl border border-white/10 bg-white/5 p-2.5">
            <summary className="cursor-pointer list-none text-sm font-medium text-white">
              Choisir categories
            </summary>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((category) => (
                <PillOption
                  key={category}
                  active={normalizedState.categories.includes(category)}
                  onClick={() =>
                    setManualTournamentState((current) => ({
                      ...current,
                      categories: current.categories.includes(category)
                        ? current.categories.filter((entry) => entry !== category)
                        : [...current.categories, category],
                    }))
                  }
                >
                  {category}
                </PillOption>
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <input
                value={manualCategoryDraft}
                onChange={(event) => setManualCategoryDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyManualCategory();
                }}
                placeholder="Categorie manuelle"
                className="h-9 min-w-[180px] flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
              />
              <button
                type="button"
                onClick={applyManualCategory}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                Valider
              </button>
            </div>
          </details>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Niveau</p>
          <div className="flex flex-wrap gap-2">
            {LEVEL_OPTIONS.map((level) => (
              <PillOption
                key={level}
                active={normalizedState.levels.includes(level)}
                onClick={() =>
                  setManualTournamentState((current) => ({
                    ...current,
                    levels: current.levels.includes(level)
                      ? current.levels.filter((entry) => entry !== level)
                      : level === "Tous"
                        ? ["Tous"]
                        : [...current.levels.filter((entry) => entry !== "Tous"), level],
                  }))
                }
              >
                {level}
              </PillOption>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={manualLevelDraft}
              onChange={(event) => setManualLevelDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyManualLevel();
              }}
              placeholder="Niveau manuel"
              className="h-9 min-w-[180px] flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
            />
            <button
              type="button"
              onClick={applyManualLevel}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              Valider
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="flex min-h-screen flex-col bg-[#070a14] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[rgba(7,10,20,0.82)] backdrop-blur-2xl">
        <div className="relative mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-3 px-4 py-2 md:px-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <span>←</span>
            Retour
          </button>

          <div
            ref={datePickerPanelRef}
            className="relative inline-flex overflow-visible items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-slate-200"
          >
            <button
              type="button"
              data-calendar-toggle="true"
              onClick={() => {
                setIsDatePickerOpen((current) => {
                  const nextOpen = !current;
                  if (nextOpen) {
                    const sourceDate = tournamentDate
                      ? new Date(`${tournamentDate}T00:00:00`)
                      : new Date();
                    setVisibleCalendarMonth(
                      new Date(sourceDate.getFullYear(), sourceDate.getMonth(), 1),
                    );
                  }
                  return nextOpen;
                });
              }}
              className="inline-flex items-center justify-center text-slate-100 transition hover:text-white"
              aria-label="Choisir une date"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3.25" y="4.75" width="13.5" height="12" rx="2.5" />
                <path d="M6.5 2.75v4M13.5 2.75v4M3.5 8h13" />
              </svg>
            </button>
            {formattedTournamentDate ? (
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200">
                {formattedTournamentDate}
              </span>
            ) : null}
            {isDatePickerOpen ? (
              <div
                className="absolute left-1/2 z-30 -translate-x-1/2 overflow-hidden rounded-[14px] p-3"
                style={{
                  top: "48px",
                  width: "fit-content",
                  background:
                    "linear-gradient(180deg, rgba(22,24,36,0.96) 0%, rgba(13,15,24,0.96) 100%)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleCalendarMonth((current) =>
                        new Date(current.getFullYear(), current.getMonth() - 1, 1),
                      )
                    }
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.03] text-white/85 transition hover:bg-white/[0.06] hover:text-white"
                    aria-label="Mois precedent"
                  >
                    ‹
                  </button>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/85">
                    {new Intl.DateTimeFormat("fr-FR", {
                      month: "long",
                      year: "numeric",
                    }).format(visibleCalendarMonth)}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleCalendarMonth((current) =>
                        new Date(current.getFullYear(), current.getMonth() + 1, 1),
                      )
                    }
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.03] text-white/85 transition hover:bg-white/[0.06] hover:text-white"
                    aria-label="Mois suivant"
                  >
                    ›
                  </button>
                </div>

                <div className="mt-2 flex flex-col gap-2">
                  <div
                    className="grid grid-cols-7 justify-center gap-2"
                    style={{ gridTemplateColumns: "repeat(7, 24px)" }}
                  >
                    {["L", "M", "M", "J", "V", "S", "D"].map((dayLabel, index) => (
                      <span
                        key={`${dayLabel}-${index}`}
                        className="inline-flex h-4 w-6 items-center justify-center text-[8px] font-semibold uppercase tracking-[0.08em] text-white/45"
                      >
                        {dayLabel}
                      </span>
                    ))}
                  </div>

                  {calendarWeeks.map((week, weekIndex) => (
                    <div
                      key={`week-${weekIndex}`}
                      className="grid grid-cols-7 justify-center gap-2"
                      style={{ gridTemplateColumns: "repeat(7, 24px)" }}
                    >
                      {week.map((day, dayIndex) => {
                        const isSelected = day.iso === tournamentDate;

                        return day.iso ? (
                          <button
                            key={day.iso}
                            type="button"
                            onClick={() => {
                              setManualTournamentState((current) => ({
                                ...current,
                                date: day.iso!,
                              }));
                              setIsDatePickerOpen(false);
                            }}
                            className={[
                              "inline-flex h-6 w-6 items-center justify-center rounded-[8px] border text-[11px] font-medium leading-none transition",
                              isSelected
                                ? "border-violet-400/30 bg-violet-500/22 text-violet-50 shadow-[0_0_18px_rgba(124,58,237,0.24)]"
                                : day.isCurrentMonth
                                  ? "border-white/[0.04] bg-white/[0.04] text-white/85 hover:border-white/[0.08] hover:bg-white/[0.08] hover:text-white"
                                  : "border-transparent bg-slate-700/25 text-white/35",
                            ].join(" ")}
                          >
                            {day.day}
                          </button>
                        ) : (
                          <span
                            key={`empty-${weekIndex}-${dayIndex}`}
                            className="inline-flex h-6 w-6 rounded-[8px] border border-transparent bg-slate-700/18"
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {isEditingTournamentName || !tournamentName ? (
            <input
              value={manualTournamentState.name}
              onChange={(event) =>
                setManualTournamentState((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              onBlur={() => {
                if (manualTournamentState.name.trim()) {
                  setIsEditingTournamentName(false);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && manualTournamentState.name.trim()) {
                  setIsEditingTournamentName(false);
                }
              }}
              className="ml-1 w-full max-w-[220px] rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
              placeholder="Nom du tournoi"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingTournamentName(true)}
              className="ml-auto flex w-full max-w-[280px] items-center justify-end gap-2 truncate text-right"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Nom du tournoi
              </span>
              <span className="truncate text-sm font-semibold text-white">{tournamentName}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setManualTournamentState(DEFAULT_STATE);
              setSelectedGroupId(null);
              setManualTeamNameDraft("");
              setSlotManualTeamNameDraft("");
              setShowAddTeamPanel(false);
              setManualTeamCountDraft("");
              setManualGroupCountDraft("");
              setManualFieldCountDraft("");
              setManualCategoryDraft("");
              setManualLevelDraft("");
              setEditingSlotTarget(null);
              setMovingSlotTarget(null);
              setPinnedSeedCode(null);
              setIsEditingTournamentName(true);
            }}
            className="ml-auto rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            Reset
          </button>

          <span className="rounded-full border border-violet-300/20 bg-violet-500/14 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100">
            Mode manuel
          </span>

          <button
            type="button"
            onClick={() => setShowSettingsPanel((current) => !current)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Options du mode manuel"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6h12M4 10h12M4 14h12" />
            </svg>
          </button>

          {showSettingsPanel ? (
            <div className="absolute right-6 top-[calc(100%+8px)] z-30 w-[280px] rounded-[20px] border border-white/10 bg-[rgba(10,12,20,0.96)] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.32)] backdrop-blur-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Parametres
              </p>
              <div className="mt-3 space-y-2">
                {[
                  "Enregistrer modele tournoi",
                  "Vue parent",
                  "Qr code et liens tournoi",
                  "Administrateur",
                ].map((label) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-300"
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center justify-between gap-3 px-4 pt-5 md:px-6">
        <div className="flex flex-wrap gap-2">
          {controlTabs.map((tab) => (
            <PillOption
              key={tab.key}
              active={activeControlTab === tab.key}
              onClick={() => setActiveControlTab(tab.key)}
            >
              {tab.label}
            </PillOption>
          ))}
        </div>

        <div className="flex flex-wrap gap-2" />
      </div>

      {activeControlTab ? (
        <div
          className="fixed inset-0 z-30 bg-black/45 backdrop-blur-[2px]"
          onClick={() => setActiveControlTab(null)}
          role="presentation"
        >
          <div className="mx-auto flex h-full w-full max-w-[1800px] items-start justify-center px-4 pt-[126px] md:px-6">
            <div
              className="max-h-[calc(100vh-148px)] w-full max-w-5xl overflow-y-auto rounded-[24px] border border-white/10 bg-[rgba(10,12,20,0.92)] p-3 shadow-[0_28px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
              onClick={(event) => event.stopPropagation()}
              role="presentation"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    {controlTabs.find((tab) => tab.key === activeControlTab)?.label}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    Les changements s’appliquent en direct derriere.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveControlTab(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Fermer"
                >
                  ×
                </button>
              </div>

              <div className="mt-3">{controlPanelContent}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto grid w-full max-w-[1800px] flex-1 gap-5 px-4 py-5 md:px-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="h-fit rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.08),transparent_52%),rgba(255,255,255,0.03)] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.28)] backdrop-blur-2xl xl:sticky xl:top-[92px] xl:flex xl:h-[calc(100vh-112px)] xl:flex-col xl:overflow-hidden">
          <div className="space-y-3 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:space-y-0">
            <section className="space-y-3 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Poules
                </h2>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    shuffleGroupAssignments();
                  }}
                  className={[
                    "inline-flex items-center gap-1 rounded-full px-2 py-[5px] text-[9px] font-semibold uppercase tracking-[0.1em] transition active:scale-95",
                    shuffleFeedbackActive
                      ? "border border-violet-300/10 bg-violet-500/18 text-violet-50 shadow-[0_0_16px_rgba(124,58,237,0.22)]"
                      : "border border-white/8 bg-[#a7afbb] text-slate-100 shadow-[0_0_14px_rgba(15,23,42,0.08)] hover:scale-105 hover:bg-[#b4bcc8] hover:text-white",
                  ].join(" ")}
                  aria-label="Tirage au sort des poules"
                >
                  <span className="text-[11px]">🎲</span>
                  Tirage au sort
                </button>
              </div>
              <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1 xl:min-h-0 xl:max-h-none xl:flex-1">
                {groupCapacities.map((capacity, groupIndex) => {
                  const group = previewData.groups[groupIndex] ?? {
                    id: `group-${groupIndex + 1}`,
                    label: `Poule ${String.fromCharCode(65 + groupIndex)}`,
                    standings: [],
                  };
                  const groupLetter = group.label.replace(/^Poule\s+/i, "").trim();
                  const active = effectiveSelectedGroupId === group.id;
                  const assignedSlots = normalizedState.groupAssignments[groupIndex] ?? Array.from({ length: capacity }, () => null);

                  return (
                    <div
                      key={group.id}
                      onClick={() => setSelectedGroupId(group.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedGroupId(group.id);
                        }
                      }}
                      className={[
                        "w-full rounded-[20px] border px-3 py-3 text-left transition",
                        active
                          ? "border-violet-300/30 bg-violet-500/14 shadow-[0_0_22px_rgba(124,58,237,0.18)]"
                          : "border-white/10 bg-black/20 hover:bg-white/10",
                      ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-white">{group.label}</p>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                            {assignedSlots.filter(Boolean).length}/{capacity}
                          </span>
                        </div>
                        <div className="mt-3 space-y-1.5">
                          {assignedSlots.map((team, slotIndex) => {
                            const displayedTeam =
                              team ?? group.standings[slotIndex]?.team ?? `Equipe ${slotIndex + 1}`;
                            const isPlaceholder = /^Equipe\s+\d+$/i.test(displayedTeam);
                            const seedCode = `${slotIndex + 1}${groupLetter}`.toUpperCase();
                            const isHighlighted = effectiveHighlightedSeed === seedCode;
                            const isMovingSelected =
                              movingSlotTarget?.groupIndex === groupIndex &&
                              movingSlotTarget?.slotIndex === slotIndex;

                            return (
                              <div
                                key={`${group.id}-slot-${slotIndex}`}
                                role="button"
                                tabIndex={0}
                                onMouseEnter={() => setHoveredSeedCode(seedCode)}
                                onMouseLeave={() => setHoveredSeedCode((current) => (current === seedCode ? null : current))}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (movingSlotTarget && !isMovingSelected) {
                                    swapGroupSlots(movingSlotTarget, { groupIndex, slotIndex });
                                    return;
                                  }

                                  if (!isPlaceholder) {
                                    setMovingSlotTarget((current) =>
                                      current &&
                                      current.groupIndex === groupIndex &&
                                      current.slotIndex === slotIndex
                                        ? null
                                        : { groupIndex, slotIndex }
                                    );
                                    setPinnedSeedCode((current) => (current === seedCode ? null : seedCode));
                                    return;
                                  }
                                  setEditingSlotTarget((current) =>
                                    current &&
                                    current.groupIndex === groupIndex &&
                                    current.slotIndex === slotIndex
                                      ? null
                                        : { groupIndex, slotIndex }
                                  );
                                }}
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter" && event.key !== " ") return;
                                  event.preventDefault();
                                  if (movingSlotTarget && !isMovingSelected) {
                                    swapGroupSlots(movingSlotTarget, { groupIndex, slotIndex });
                                    return;
                                  }

                                  if (!isPlaceholder) {
                                    setMovingSlotTarget((current) =>
                                      current &&
                                      current.groupIndex === groupIndex &&
                                      current.slotIndex === slotIndex
                                        ? null
                                        : { groupIndex, slotIndex }
                                    );
                                    setPinnedSeedCode((current) => (current === seedCode ? null : seedCode));
                                    return;
                                  }

                                  setEditingSlotTarget((current) =>
                                    current &&
                                    current.groupIndex === groupIndex &&
                                    current.slotIndex === slotIndex
                                      ? null
                                      : { groupIndex, slotIndex }
                                  );
                                }}
                                className={[
                                  "group flex w-full items-center gap-2 rounded-2xl border px-2.5 py-2 text-left text-sm transition duration-200 active:scale-[0.985]",
                                  isMovingSelected
                                    ? "border-amber-300/30 bg-amber-500/12 text-white shadow-[0_0_20px_rgba(251,191,36,0.16)]"
                                    : editingSlotTarget?.groupIndex === groupIndex &&
                                        editingSlotTarget?.slotIndex === slotIndex
                                      ? "border-violet-300/30 bg-violet-500/14 text-white"
                                    : isHighlighted
                                      ? "border-violet-300/28 bg-violet-500/12 text-white shadow-[0_0_18px_rgba(139,92,246,0.16)]"
                                      : "border-white/8 bg-black/20 text-slate-300 hover:scale-[1.02] hover:bg-white/10 hover:shadow-[0_0_16px_rgba(255,255,255,0.06)]",
                                ].join(" ")}
                              >
                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/5 px-1.5 text-[10px] font-semibold text-slate-400">
                                  {slotIndex + 1}
                                </span>
                                <span
                                  className={[
                                    "line-clamp-2 text-left leading-5 transition duration-200",
                                    isPlaceholder
                                      ? "text-white/38 group-hover:text-white/72"
                                      : "text-inherit",
                                  ].join(" ")}
                                >
                                  {isPlaceholder ? "+ Ajouter equipe" : displayedTeam}
                                </span>
                                {isMovingSelected ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      removeGroupSlotTeam({ groupIndex, slotIndex });
                                    }}
                                    className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-300/24 bg-rose-500/14 text-xs text-rose-100 shadow-[0_0_14px_rgba(244,63,94,0.18)] transition hover:scale-105 hover:bg-rose-500/20"
                                    aria-label="Supprimer l'equipe"
                                  >
                                    🗑
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </aside>

        <main className="min-w-0">
          <div className="space-y-5">
            <TournamentPreview
              data={previewData}
              focusedGroupId={effectiveSelectedGroupId}
              onGroupSelect={setSelectedGroupId}
              showGroups={false}
              showHeader={false}
              highlightedSeed={effectiveHighlightedSeed}
            />
          </div>
        </main>
      </div>

      {editingSlotTarget ? (
        <div
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]"
          onClick={() => setEditingSlotTarget(null)}
          role="presentation"
        >
          <div className="mx-auto flex h-full w-full max-w-[1800px] items-start justify-center px-4 pt-[126px] md:px-6">
            <div
              className="w-full max-w-3xl rounded-[24px] border border-white/10 bg-[rgba(10,12,20,0.94)] p-3 shadow-[0_28px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
              onClick={(event) => event.stopPropagation()}
              role="presentation"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Choisir une equipe
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    Meme logique que dans Equipes. Le swap se fait automatiquement si besoin.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingSlotTarget(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Fermer"
                >
                  ×
                </button>
              </div>

              <div className="mt-3 space-y-3">
                <input
                  value={registeredTeamSearch}
                  onChange={(event) => setRegisteredTeamSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && filteredRegisteredTeams.length > 0) {
                      replaceGroupSlotTeam(editingSlotTarget, filteredRegisteredTeams[0] ?? "");
                      setRegisteredTeamSearch("");
                    }
                  }}
                  placeholder="Rechercher un club"
                  className="h-10 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                />

                <div className="flex flex-wrap gap-2">
                  <input
                    value={slotManualTeamNameDraft}
                    onChange={(event) => setSlotManualTeamNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        replaceGroupSlotTeam(editingSlotTarget, slotManualTeamNameDraft);
                      }
                    }}
                    placeholder="Rentrer nom equipe"
                    className="h-10 min-w-[220px] flex-1 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                  />
                  <button
                    type="button"
                    onClick={() => replaceGroupSlotTeam(editingSlotTarget, slotManualTeamNameDraft)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
                  >
                    Ajouter
                  </button>
                </div>

                <div className="max-h-[46vh] overflow-y-auto rounded-[20px] border border-white/8 bg-white/[0.03] p-2">
                  <div className="space-y-2">
                    {filteredRegisteredTeams.length > 0 ? (
                      filteredRegisteredTeams.map((team) => (
                        <button
                          key={`picker-${team}`}
                          type="button"
                          onClick={() => {
                            replaceGroupSlotTeam(editingSlotTarget, team);
                            setRegisteredTeamSearch("");
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-3 py-2.5 text-left text-sm text-white transition hover:border-violet-300/20 hover:bg-violet-500/10"
                        >
                          <span className="line-clamp-2">{team}</span>
                          <span className="rounded-full border border-violet-300/20 bg-violet-500/14 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100">
                            Choisir
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="px-2 py-3 text-sm text-slate-400">
                        Aucun club ne correspond a la recherche.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
