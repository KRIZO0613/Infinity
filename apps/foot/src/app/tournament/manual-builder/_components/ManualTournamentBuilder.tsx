"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import Image from "next/image";

import { TournamentPreview } from "@/components/tournament-preview/TournamentPreview";
import type {
  TournamentPreviewData,
  TournamentPreviewGroup,
  TournamentPreviewPlacementSection,
  TournamentPreviewRound,
  TournamentPreviewSlot,
  TournamentPreviewStandingRow,
} from "@/components/tournament-preview/types";
import {
  upsertStoredManualTournamentProduct,
  type StoredManualTournamentProduct,
} from "@/app/tournament/_lib/manualTournamentProducts";
import {
  deleteTournamentPlayer,
  loadTournament as loadTournamentFromSupabase,
  loadTournamentPlayers,
  saveTournamentPlayer,
  saveTournament as saveTournamentToSupabase,
} from "@/lib/tournamentService";
import type {
  TournamentProductCoachMealSubmission,
  TournamentProductCoachMealStatus,
  TournamentProductGroup,
  TournamentProductMatchState,
  TournamentProductSavedTournament,
  TournamentProductScheduleMatch,
  TournamentProductShareSettings,
  TournamentProductTeam,
  TournamentProductTeamPlayer,
} from "@/app/app/teams/[id]/matches/_components/tournament-product/types";

type ManualTournamentState = {
  name: string;
  date: string;
  dayCount: number;
  matchDurationMinutes: number;
  breakBetweenMatchesMinutes: number;
  lunchBreakMinutes: number;
  lunchBreakStartTime: string;
  dayStartTimes: string[];
  dayEndTimes: string[];
  teamsCount: number;
  teamEntries: string[];
  validatedTeams: Record<string, boolean>;
  maxPlayersPerTeam: number;
  groupAssignments: (string | null)[][];
  groupsCount: number;
  qualification: "top1" | "top2" | "best3";
  tournamentPhaseType: "simple" | "double";
  bracketType: "round_of_32" | "round_of_16" | "quarter" | "semi";
  consolationBracketType: "round_of_32" | "round_of_16" | "quarter" | "semi";
  placementMatches: boolean;
  fieldCount: number;
  refereeCount: number;
  refereeAssignmentMode: "auto" | "manual";
  referees: Array<{
    id: string;
    firstName: string;
    lastName: string;
  }>;
  mealsPerTeam: number;
  mealItems: Array<{
    id: string;
    label: string;
    price: string;
    link: string;
  }>;
  categories: string[];
  levels: string[];
  categoryOrganization: "separate" | "alternated";
  matchesViewMode: "division" | "alternated";
  matchesSharedFields: boolean;
  levelGroupsByCategory: Record<string, string[][]>;
  divisionFieldAllocations: Record<string, number>;
  fieldDivisionAssignments: Record<string, string>;
  shareSettings: TournamentProductShareSettings;
  teamPlayersByTeam: Record<
    string,
    Array<{
      lastName: string;
      firstName: string;
      license: string;
      number: string;
    }>
  >;
};

type ManualControlTab =
  | "teams"
  | "groups"
  | "qualification"
  | "bracket"
  | "general"
  | "matches"
  | "share";
type TeamsControlSubTab = "count" | "teams" | "players";
type GeneralControlSubTab = "general" | "planning" | "categories" | "referees" | "meals";
type GroupSlotTarget = { groupIndex: number; slotIndex: number };
type CalendarCell = {
  iso: string | null;
  day: number | null;
  isCurrentMonth: boolean;
};
type ManualScheduledMatchSource = {
  id: string;
  stage: string;
  roundLabel: string;
  label: string;
  homeTeam: string;
  awayTeam: string;
  homeSlot?: TournamentPreviewSlot;
  awaySlot?: TournamentPreviewSlot;
  divisionId?: string;
  divisionName?: string;
  preferredFieldIndex?: number;
};
type ManualScheduleBlock = {
  order: number;
  matches: ManualScheduledMatchSource[];
  section: "group" | "final";
};
type ManualScheduledMatch = ManualScheduledMatchSource & {
  dayIndex: number;
  dayLabel: string;
  dateLabel: string | null;
  fieldIndex: number;
  fieldLabel: string;
  startTime: string;
  endTime: string;
};
type DisplayedScheduledMatch = ManualScheduledMatch & {
  originalMatchId: string;
};
type ScheduledMatchSection = {
  key: string;
  label: string;
  matches: DisplayedScheduledMatch[];
};
type ManualDivisionState = Pick<
  ManualTournamentState,
  | "teamsCount"
  | "teamEntries"
  | "validatedTeams"
  | "maxPlayersPerTeam"
  | "teamPlayersByTeam"
  | "groupAssignments"
  | "groupsCount"
  | "qualification"
  | "tournamentPhaseType"
  | "bracketType"
  | "consolationBracketType"
  | "placementMatches"
>;
type DivisionDefinition = {
  id: string;
  category: string;
  levels: string[];
  name: string;
};

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
const LEVEL_OPTIONS = ["Tout niveau", "Niv 1", "Niv 2", "Niv 3", "Niv 4"] as const;
const DAY_COUNT_OPTIONS = [1, 2, 3, 4, 5] as const;
const DEFAULT_DAY_START_TIME = "09:00";
const DEFAULT_DAY_END_TIME = "17:00";
const DEFAULT_LUNCH_BREAK_START_TIME = "12:30";
const SCHEDULE_ORDER_VERSION = "manual-match-order-v3";
const MANUAL_TOURNAMENT_DEFAULT_LOCATION = "Tournoi manuel";
const CLASSIC_TOURNAMENT_STORAGE_PREFIX = "infinity:tournaments:";

const buildManualTournamentId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const isAbortError = (error: unknown) => {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");

  return name === "AbortError" || message.includes("AbortError") || message.toLowerCase().includes("operation was aborted");
};

const buildDefaultManualShareSettings = (
  current?: Partial<TournamentProductShareSettings> | null,
): TournamentProductShareSettings => ({
  tournamentPublished: current?.tournamentPublished ?? false,
  coachAccessEnabled: current?.coachAccessEnabled ?? false,
  parentAccessEnabled: current?.parentAccessEnabled ?? false,
  coachToken: current?.coachToken ?? buildManualTournamentId(),
  parentToken: current?.parentToken ?? buildManualTournamentId(),
  votesEnabled: current?.votesEnabled ?? false,
  coachTeamSubmissions: current?.coachTeamSubmissions ?? {},
  coachMealSubmissions: current?.coachMealSubmissions ?? {},
});

const getMealOrderFilledCount = (
  submission?: TournamentProductCoachMealSubmission | null,
) =>
  (submission?.rows ?? []).filter((row) =>
    Object.values(row.quantities ?? {}).some((quantity) => quantity > 0),
  ).length;

const getMealOrderStatus = (
  filledCount: number,
  maxCount: number,
): TournamentProductCoachMealStatus => {
  const safeMaxCount = Math.max(1, maxCount);

  if (filledCount <= 0) return "pending";
  if (filledCount >= safeMaxCount) return "validated";
  return "partial";
};

const mealOrderStatusView: Record<
  TournamentProductCoachMealStatus,
  { label: string; dotClassName: string; className: string }
> = {
  pending: {
    label: "Non recu",
    dotClassName: "bg-rose-300",
    className: "border-rose-300/20 bg-rose-500/12 text-rose-100",
  },
  partial: {
    label: "En cours",
    dotClassName: "bg-amber-300",
    className: "border-amber-300/20 bg-amber-500/12 text-amber-100",
  },
  validated: {
    label: "Valide",
    dotClassName: "bg-emerald-300",
    className: "border-emerald-300/20 bg-emerald-500/12 text-emerald-100",
  },
};

const getManualScheduleSection = (
  match: Pick<ManualScheduledMatch, "stage">,
): TournamentProductScheduleMatch["scheduleSection"] =>
  /^Poule\s+/i.test(match.stage) ? "group" : "final";

const saveManualTournamentToClassicStorage = (
  teamId: string,
  tournament: TournamentProductSavedTournament,
) => {
  if (typeof window === "undefined") return;

  const storageKey = `${CLASSIC_TOURNAMENT_STORAGE_PREFIX}${teamId}`;

  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    const existingEntries = Array.isArray(parsed) ? parsed : [];
    const nextEntries = existingEntries.some(
      (entry) => typeof entry === "object" && entry !== null && "id" in entry && entry.id === tournament.id,
    )
      ? existingEntries.map((entry) =>
          typeof entry === "object" && entry !== null && "id" in entry && entry.id === tournament.id
            ? tournament
            : entry,
        )
      : [tournament, ...existingEntries];

    window.localStorage.setItem(storageKey, JSON.stringify(nextEntries));
  } catch {
    window.localStorage.setItem(storageKey, JSON.stringify([tournament]));
  }
};

const getScheduledMatchSectionLabel = (match: Pick<ManualScheduledMatch, "stage">) => {
  if (/^Poule\s+/i.test(match.stage)) return "Matchs de poule";
  return "Phase finale";
};

const buildScheduledMatchSections = (
  dayKey: string,
  matches: DisplayedScheduledMatch[],
): ScheduledMatchSection[] =>
  matches.reduce<ScheduledMatchSection[]>((sections, match) => {
    const label = getScheduledMatchSectionLabel(match);
    const lastSection = sections[sections.length - 1];

    if (!lastSection || lastSection.label !== label) {
      sections.push({
        key: `${dayKey}-${sections.length}-${label}`,
        label,
        matches: [match],
      });
      return sections;
    }

    lastSection.matches.push(match);
    return sections;
  }, []);

const DEFAULT_STATE: ManualTournamentState = {
  name: "",
  date: "",
  dayCount: 1,
  matchDurationMinutes: 10,
  breakBetweenMatchesMinutes: 5,
  lunchBreakMinutes: 60,
  lunchBreakStartTime: DEFAULT_LUNCH_BREAK_START_TIME,
  dayStartTimes: [DEFAULT_DAY_START_TIME],
  dayEndTimes: [DEFAULT_DAY_END_TIME],
  teamsCount: 16,
  teamEntries: [],
  validatedTeams: {},
  maxPlayersPerTeam: 10,
  teamPlayersByTeam: {},
  groupAssignments: [],
  groupsCount: 4,
  qualification: "top2",
  tournamentPhaseType: "simple",
  bracketType: "quarter",
  consolationBracketType: "semi",
  placementMatches: true,
  fieldCount: 2,
  refereeCount: 2,
  refereeAssignmentMode: "auto",
  referees: [
    { id: "ref-1", firstName: "", lastName: "" },
    { id: "ref-2", firstName: "", lastName: "" },
  ],
  mealsPerTeam: 12,
  mealItems: [],
  categories: ["U11"],
  levels: ["Niv 1"],
  categoryOrganization: "separate",
  matchesViewMode: "division",
  matchesSharedFields: false,
  levelGroupsByCategory: {
    U11: [["Niv 1"]],
  },
  divisionFieldAllocations: {},
  fieldDivisionAssignments: {},
  shareSettings: buildDefaultManualShareSettings(),
};

const ORGANIZER_CLUB_LOGO_SRC = "/icons/logocclubp.png";

const createDefaultDivisionState = (): ManualDivisionState => ({
  teamsCount: DEFAULT_STATE.teamsCount,
  teamEntries: [],
  validatedTeams: {},
  maxPlayersPerTeam: DEFAULT_STATE.maxPlayersPerTeam,
  teamPlayersByTeam: {},
  groupAssignments: [],
  groupsCount: DEFAULT_STATE.groupsCount,
  qualification: DEFAULT_STATE.qualification,
  tournamentPhaseType: DEFAULT_STATE.tournamentPhaseType,
  bracketType: DEFAULT_STATE.bracketType,
  consolationBracketType: DEFAULT_STATE.consolationBracketType,
  placementMatches: DEFAULT_STATE.placementMatches,
});

const getDivisionStateSlice = (state: ManualTournamentState): ManualDivisionState => ({
  teamsCount: state.teamsCount,
  teamEntries: state.teamEntries,
  validatedTeams: state.validatedTeams,
  maxPlayersPerTeam: state.maxPlayersPerTeam,
  teamPlayersByTeam: state.teamPlayersByTeam,
  groupAssignments: state.groupAssignments,
  groupsCount: state.groupsCount,
  qualification: state.qualification,
  tournamentPhaseType: state.tournamentPhaseType,
  bracketType: state.bracketType,
  consolationBracketType: state.consolationBracketType,
  placementMatches: state.placementMatches,
});

const buildDivisionId = (category: string, levels: string[]) =>
  `${category}-${levels.map((level) => level.replace(/\s+/g, "").toLowerCase()).join("-")}`;

const buildDivisionName = (category: string, levels: string[]) => {
  const compactLevels = levels.map((level) => level.replace(/^Niv\s*/i, "N")).join("-");
  return `${category} - ${compactLevels}`;
};

const normalizeLevelGroupsByCategory = (
  categories: string[],
  levelGroupsByCategory: Record<string, string[][]>,
) =>
  Object.fromEntries(
    categories.map((category) => {
      const normalizedGroups =
        levelGroupsByCategory[category]
          ?.map((group) =>
            group
              .map((level) => level.trim())
              .filter(Boolean)
              .filter((level, index, array) => array.indexOf(level) === index),
          ) ?? [];

      return [category, normalizedGroups.length > 0 ? normalizedGroups : [[]]];
    }),
  );

const buildDivisionDefinitions = (state: ManualTournamentState): DivisionDefinition[] => {
  const categories =
    state.categories.length > 0 ? state.categories : [DEFAULT_STATE.categories[0]];
  const normalizedGroupsByCategory = normalizeLevelGroupsByCategory(
    categories,
    state.levelGroupsByCategory,
  );

  return categories.flatMap((category) =>
    (normalizedGroupsByCategory[category] ?? [])
      .filter((levels) => levels.length > 0)
      .map((levels) => ({
        id: buildDivisionId(category, levels),
        category,
        levels,
        name: buildDivisionName(category, levels),
      })),
  );
};

const getDivisionDefinitionMatchScore = (
  source: DivisionDefinition,
  candidate: DivisionDefinition,
) => {
  if (source.category !== candidate.category) return -1;

  const overlapCount = source.levels.filter((level) => candidate.levels.includes(level)).length;
  if (overlapCount === 0) return -1;

  const sourceSet = new Set(source.levels);
  const candidateSet = new Set(candidate.levels);
  const sameSizeBonus = source.levels.length === candidate.levels.length ? 5 : 0;
  const subsetBonus =
    source.levels.every((level) => candidateSet.has(level)) ||
    candidate.levels.every((level) => sourceSet.has(level))
      ? 10
      : 0;

  return overlapCount * 100 + subsetBonus + sameSizeBonus;
};

const findBestMatchingDivisionId = (
  source: DivisionDefinition,
  candidates: DivisionDefinition[],
  excludedIds: Set<string> = new Set(),
) =>
  candidates
    .filter((candidate) => !excludedIds.has(candidate.id))
    .map((candidate) => ({
      id: candidate.id,
      score: getDivisionDefinitionMatchScore(source, candidate),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score)[0]?.id ?? null;

const areDivisionStateMapsEqual = (
  left: Record<string, ManualDivisionState>,
  right: Record<string, ManualDivisionState>,
) => {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  if (leftKeys.length !== rightKeys.length) return false;
  if (!leftKeys.every((key, index) => key === rightKeys[index])) return false;

  return leftKeys.every(
    (key) => JSON.stringify(left[key]) === JSON.stringify(right[key]),
  );
};

const buildDefaultDivisionFieldAllocations = (
  divisions: DivisionDefinition[],
  fieldCount: number,
) => {
  const safeFieldCount = Math.max(1, fieldCount);
  const divisionCount = divisions.length;
  if (divisionCount === 0) return {};

  const baseAllocation = Math.floor(safeFieldCount / divisionCount);
  let remainder = safeFieldCount % divisionCount;

  return Object.fromEntries(
    divisions.map((division) => {
      const allocation = baseAllocation + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
      return [division.id, allocation];
    }),
  );
};

const normalizeDivisionFieldAllocations = (
  divisions: DivisionDefinition[],
  fieldCount: number,
  rawAllocations: Record<string, number>,
) => {
  const defaultAllocations = buildDefaultDivisionFieldAllocations(divisions, fieldCount);
  if (divisions.length === 0) return {};

  const nextAllocations = Object.fromEntries(
    divisions.map((division) => [
      division.id,
      Math.max(0, Math.min(fieldCount, Math.round(rawAllocations[division.id] ?? defaultAllocations[division.id] ?? 0))),
    ]),
  );

  const totalAllocatedFields = Object.values(nextAllocations).reduce(
    (sum, value) => sum + value,
    0,
  );

  if (totalAllocatedFields !== Math.max(1, fieldCount)) {
    return defaultAllocations;
  }

  return nextAllocations;
};

const normalizeFieldDivisionAssignments = (
  divisions: DivisionDefinition[],
  fieldCount: number,
  rawAssignments: Record<string, string>,
) => {
  const safeFieldCount = Math.max(1, fieldCount);
  const divisionIds = divisions.map((division) => division.id);
  const defaults = buildDefaultDivisionFieldAllocations(divisions, safeFieldCount);
  const defaultAssignments: Record<string, string> = {};

  let fieldIndex = 1;
  divisions.forEach((division) => {
    const allocation = defaults[division.id] ?? 0;
    for (let count = 0; count < allocation && fieldIndex <= safeFieldCount; count += 1) {
      defaultAssignments[String(fieldIndex)] = division.id;
      fieldIndex += 1;
    }
  });

  while (fieldIndex <= safeFieldCount) {
    defaultAssignments[String(fieldIndex)] = divisions[0]?.id ?? "";
    fieldIndex += 1;
  }

  if (divisionIds.length === 0) return {};

  return Object.fromEntries(
    Array.from({ length: safeFieldCount }, (_, index) => {
      const key = String(index + 1);
      const assignedDivisionId = rawAssignments[key];
      return [key, divisionIds.includes(assignedDivisionId) ? assignedDivisionId : defaultAssignments[key] ?? divisionIds[0]!];
    }),
  );
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

const formatTournamentDateRange = (dateValue: string, dayCount: number) => {
  if (!dateValue) return "";

  const startDate = new Date(`${dateValue}T00:00:00`);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + Math.max(1, dayCount) - 1);

  const shortFormatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  });

  const startLabel = shortFormatter.format(startDate);
  const endLabel = shortFormatter.format(endDate);

  return dayCount <= 1 ? startLabel : `${startLabel} - ${endLabel}`;
};

const parseTimeToMinutes = (value: string, fallback: string) => {
  const source = /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
  const [hours, minutes] = source.split(":").map(Number);
  return hours * 60 + minutes;
};

const formatMinutesToTime = (value: number) => {
  const safeValue = Math.min(Math.max(0, Math.round(value)), 23 * 60 + 59);
  const hours = Math.floor(safeValue / 60);
  const minutes = safeValue % 60;
  return `${`${hours}`.padStart(2, "0")}:${`${minutes}`.padStart(2, "0")}`;
};

const normalizeTimeInput = (value: string | undefined, fallback: string) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value ?? "") ? (value as string) : fallback;

const shiftTimeValue = (value: string, deltaMinutes: number, fallbackValue: string) =>
  formatMinutesToTime(
    parseTimeToMinutes(value || fallbackValue, fallbackValue) + deltaMinutes,
  );

const normalizeDayTimeValues = (values: string[], dayCount: number, fallback: string) => {
  const safeDayCount = Math.max(1, dayCount);
  return Array.from({ length: safeDayCount }, (_, index) =>
    normalizeTimeInput(values[index] ?? values[values.length - 1], fallback),
  );
};

const sanitizeDayTimeRange = (startTime: string, endTime: string) => {
  const startMinutes = parseTimeToMinutes(startTime, DEFAULT_DAY_START_TIME);
  const endMinutes = parseTimeToMinutes(endTime, DEFAULT_DAY_END_TIME);
  if (endMinutes > startMinutes) {
    return {
      startTime: formatMinutesToTime(startMinutes),
      endTime: formatMinutesToTime(endMinutes),
    };
  }

  const fallbackEndMinutes = parseTimeToMinutes(DEFAULT_DAY_END_TIME, DEFAULT_DAY_END_TIME);
  const safeEndMinutes =
    fallbackEndMinutes > startMinutes ? fallbackEndMinutes : Math.min(startMinutes + 60, 23 * 60 + 59);

  return {
    startTime: formatMinutesToTime(startMinutes),
    endTime: formatMinutesToTime(safeEndMinutes),
  };
};

const formatScheduleDayLabel = (dateValue: string | null, dayIndex: number) => {
  if (!dateValue) {
    return `Jour ${dayIndex + 1}`;
  }

  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + dayIndex);

  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date);

  return dateLabel.replace(".", "").replace(/^\w/, (character) => character.toUpperCase());
};

const buildEditorId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const buildRoundRobinRoundsForGroup = (teams: string[]) => {
  if (teams.length < 2) return [] as Array<Array<{ homeTeam: string; awayTeam: string }>>;

  const entries = [...teams];
  if (entries.length % 2 === 1) {
    entries.push("BYE");
  }

  const rounds: Array<Array<{ homeTeam: string; awayTeam: string }>> = [];
  const rotating = [...entries];
  const totalRounds = rotating.length - 1;

  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    const matches: Array<{ homeTeam: string; awayTeam: string }> = [];

    for (let pairIndex = 0; pairIndex < rotating.length / 2; pairIndex += 1) {
      const homeTeam = rotating[pairIndex];
      const awayTeam = rotating[rotating.length - 1 - pairIndex];

      if (homeTeam !== "BYE" && awayTeam !== "BYE") {
        matches.push({
          homeTeam: roundIndex % 2 === 0 ? homeTeam! : awayTeam!,
          awayTeam: roundIndex % 2 === 0 ? awayTeam! : homeTeam!,
        });
      }
    }

    rounds.push(matches);

    const fixed = rotating[0];
    const tail = rotating.slice(1);
    tail.unshift(tail.pop() as string);
    rotating.splice(0, rotating.length, fixed!, ...tail);
  }

  return rounds;
};

const chunkScheduleBlockMatches = (
  matches: ManualScheduledMatchSource[],
  chunkSize: number,
) => {
  const chunks: ManualScheduledMatchSource[][] = [];

  for (let index = 0; index < matches.length; index += chunkSize) {
    chunks.push(matches.slice(index, index + chunkSize));
  }

  return chunks;
};

const getPlacementRoundDepth = (roundId: string) => {
  const normalizedRoundId = roundId.replace(/-(?:final-)?round$/, "");
  const suffixMatch = normalizedRoundId.match(/(?:Q)?([WL]+)$/);
  return suffixMatch?.[1]?.length ?? 0;
};

const getPlacementSchedulePhase = (roundLabel: string, roundId: string) => {
  const placementDepth = getPlacementRoundDepth(roundId);
  const isRangePlacementRound = /Classement\s+\d+e-\d+e/i.test(roundLabel);
  const isPlayInRound = /Barrages/i.test(roundLabel) || /play-in-round/i.test(roundId);
  const isSinglePlacementRound = /\d+e place/i.test(roundLabel);
  const isPlacementFinalRound = /-final-round$/.test(roundId);

  if (isPlayInRound || (placementDepth === 0 && isRangePlacementRound)) {
    return 0;
  }

  if (isSinglePlacementRound && isPlacementFinalRound) {
    return placementDepth + 1;
  }

  if (placementDepth === 0 && isSinglePlacementRound) {
    return 1;
  }

  return Math.max(1, placementDepth);
};

const getRoundCodeFromMatchId = (matchId: string) => {
  const codeMatch = matchId.match(/-(16E|8E|QF|SF|F)\d+$/);
  return codeMatch?.[1] ?? null;
};

const getPlacementRootId = (roundId: string) => {
  const normalizedRoundId = roundId.replace(/-(?:final-)?round$/, "");
  return normalizedRoundId.replace(/(?:Q)?([WL]+)$/, "");
};

const getBracketOpeningLevel = (roundIndex = 0) => 1 + roundIndex * 2;

const getPlacementSourceOpeningLevel = ({
  stage,
  roundId,
  mainRoundOpeningLevels,
  secondaryRoundOpeningLevels,
}: {
  stage: string;
  roundId: string;
  mainRoundOpeningLevels: Record<string, number>;
  secondaryRoundOpeningLevels: Record<string, number>;
}) => {
  if (/Classement poules/i.test(stage)) {
    return 0;
  }

  const rootId = getPlacementRootId(roundId);
  const placementRankMatch = rootId.match(/(?:CONS\.\s*)?CL(\d+)/i);
  const placementRank = Number(placementRankMatch?.[1] ?? 0);
  const sourceRoundCode =
    placementRank === 3
      ? "SF"
      : placementRank === 5
        ? "QF"
        : placementRank === 9
          ? "8E"
          : placementRank === 17
            ? "16E"
            : null;

  if (!sourceRoundCode) {
    return 0;
  }

  if (/Matchs de classement consolante/i.test(stage)) {
    return secondaryRoundOpeningLevels[sourceRoundCode] ?? 0;
  }

  return mainRoundOpeningLevels[sourceRoundCode] ?? 0;
};

const getPlacementRankValue = (roundLabel: string) => {
  const rankMatch = roundLabel.match(/(\d+)e place/i);
  return Number(rankMatch?.[1] ?? 0);
};

const getPlacementFinalSubOrder = (rankValue: number) => {
  if (rankValue === 15) return 0.01;
  if (rankValue === 13) return 0.02;
  if (rankValue === 11) return 0.03;
  if (rankValue === 9) return 0.04;
  if (rankValue === 7) return 0.05;
  if (rankValue === 5) return 0.06;
  return (20 - rankValue) / 100;
};

const normalizeScheduleLabel = (value: string) => value.trim().toLowerCase();

const isStrictThirdPlaceLabel = (value: string) => {
  const normalized = normalizeScheduleLabel(value);
  return normalized === "3e place" || normalized === "classement 3e place";
};

const isMainFinalLabel = (value: string) => normalizeScheduleLabel(value) === "finale";

const isConsolationFinalLabel = (value: string) =>
  normalizeScheduleLabel(value) === "finale consolante";

const isAnyFinalScheduledMatch = (match: Pick<ManualScheduledMatchSource, "roundLabel" | "label">) =>
  isMainFinalLabel(match.roundLabel) ||
  isMainFinalLabel(match.label) ||
  isConsolationFinalLabel(match.roundLabel) ||
  isConsolationFinalLabel(match.label);

const attachDivisionToMatches = (
  matches: ManualScheduledMatch[],
  division: DivisionDefinition | null,
) =>
  matches.map((match) => ({
    ...match,
    id: division ? `${division.id}__${match.id}` : match.id,
    homeSlot:
      division && match.homeSlot?.sourceMatchId
        ? {
            ...match.homeSlot,
            sourceMatchId: `${division.id}__${match.homeSlot.sourceMatchId}`,
          }
        : match.homeSlot,
    awaySlot:
      division && match.awaySlot?.sourceMatchId
        ? {
            ...match.awaySlot,
            sourceMatchId: `${division.id}__${match.awaySlot.sourceMatchId}`,
          }
        : match.awaySlot,
    divisionId: division?.id ?? match.divisionId,
    divisionName: division?.name ?? match.divisionName,
  }));

const isPlacementFinalRound = (roundId: string) => /-final-round$/.test(roundId);

const sortPlacementFinalMatches = (matches: ManualScheduledMatchSource[]) =>
  [...matches].sort((left, right) => {
    const leftRank = getPlacementRankValue(left.roundLabel || left.label);
    const rightRank = getPlacementRankValue(right.roundLabel || right.label);
    return getPlacementFinalSubOrder(leftRank) - getPlacementFinalSubOrder(rightRank);
  });

const getManualFinalBlockOrder = ({
  stage,
  roundLabel,
  roundId,
  roundIndex,
  mainRoundOpeningLevels,
  secondaryRoundOpeningLevels,
}: {
  stage: string;
  roundLabel: string;
  roundId: string;
  roundIndex?: number;
  mainRoundOpeningLevels: Record<string, number>;
  secondaryRoundOpeningLevels: Record<string, number>;
}) => {
  const isThirdPlaceRound =
    typeof roundLabel === "string" && isStrictThirdPlaceLabel(roundLabel);
  const isMainFinalRound = /Phase finale principale/i.test(stage) && /\bFinale\b/i.test(roundLabel);
  if (isMainFinalRound) return 999;
  if (isThirdPlaceRound) return 998;

  if (/Classement poules/i.test(stage)) {
    const phaseIndex = getPlacementSchedulePhase(roundLabel, roundId);
    const rankValue = getPlacementRankValue(roundLabel);
    const roundLevel = 1 + phaseIndex;
    return roundLevel * 100 + 10 + (isPlacementFinalRound(roundId) ? 0 : (20 - rankValue) / 100);
  }

  if (/Phase finale principale/i.test(stage)) {
    return getBracketOpeningLevel(roundIndex) * 100 + 30;
  }

  if (/Matchs de classement consolante/i.test(stage)) {
    const phaseIndex = getPlacementSchedulePhase(roundLabel, roundId);
    const rankValue = getPlacementRankValue(roundLabel);
    if (rankValue === 7) {
      const mainSemiLevel =
        mainRoundOpeningLevels.SF ??
        Math.max(0, ...Object.values(mainRoundOpeningLevels));
      return mainSemiLevel * 100 + 40.05;
    }
    const sourceOpeningLevel = getPlacementSourceOpeningLevel({
      stage,
      roundId,
      mainRoundOpeningLevels,
      secondaryRoundOpeningLevels,
    });
    const roundLevel = sourceOpeningLevel + 1 + phaseIndex;
    return roundLevel * 100 + 20 + (isPlacementFinalRound(roundId) ? 0 : (20 - rankValue) / 100);
  }

  if (/Consolante/i.test(stage)) {
    if (
      typeof roundIndex === "number" &&
      typeof roundLabel === "string" &&
      isConsolationFinalLabel(roundLabel)
    ) {
      return 998.5;
    }
    return getBracketOpeningLevel(roundIndex) * 100 + 20;
  }

  if (/Matchs de classement des phases finales/i.test(stage)) {
    const phaseIndex = getPlacementSchedulePhase(roundLabel, roundId);
    const rankValue = getPlacementRankValue(roundLabel);
    const sourceOpeningLevel = getPlacementSourceOpeningLevel({
      stage,
      roundId,
      mainRoundOpeningLevels,
      secondaryRoundOpeningLevels,
    });
    const roundLevel = sourceOpeningLevel + 1 + phaseIndex;
    return roundLevel * 100 + 30 + (isPlacementFinalRound(roundId) ? 0 : (20 - rankValue) / 100);
  }

  if (/Matchs de classement/i.test(stage)) {
    const phaseIndex = getPlacementSchedulePhase(roundLabel, roundId);
    const rankValue = getPlacementRankValue(roundLabel);
    const roundLevel = 1 + phaseIndex;
    return roundLevel * 100 + 30 + (isPlacementFinalRound(roundId) ? 0 : (20 - rankValue) / 100);
  }

  return 999;
};

const buildManualScheduleBlocks = (
  previewData: TournamentPreviewData,
  fieldCount: number,
): ManualScheduleBlock[] => {
  const normalizedFieldCount = Math.max(1, fieldCount);
  const groupRounds = previewData.groups.map((group) =>
    buildRoundRobinRoundsForGroup(group.standings.map((standing) => standing.team)),
  );
  const maxGroupRoundCount = Math.max(0, ...groupRounds.map((rounds) => rounds.length));
  const blocks: ManualScheduleBlock[] = [];
  const mainRoundOpeningLevels = Object.fromEntries(
    previewData.bracket
      .map((round, roundIndex) => {
        const roundCode = getRoundCodeFromMatchId(round.matches[0]?.id ?? "");
        return roundCode ? [roundCode, getBracketOpeningLevel(roundIndex)] : null;
      })
      .filter((entry): entry is [string, number] => Boolean(entry)),
  );
  const secondaryRoundOpeningLevels = Object.fromEntries(
    (previewData.secondaryBracket ?? [])
      .map((round, roundIndex) => {
        const roundCode = getRoundCodeFromMatchId(round.matches[0]?.id ?? "");
        return roundCode ? [roundCode, getBracketOpeningLevel(roundIndex)] : null;
      })
      .filter((entry): entry is [string, number] => Boolean(entry)),
  );
  for (let roundIndex = 0; roundIndex < maxGroupRoundCount; roundIndex += 1) {
    const roundMatches: ManualScheduledMatchSource[] = [];

    previewData.groups.forEach((group, groupIndex) => {
      const groupRoundMatches = groupRounds[groupIndex]?.[roundIndex] ?? [];
      groupRoundMatches.forEach((match, matchIndex) => {
        roundMatches.push({
          id: `${group.id}-round-${roundIndex + 1}-match-${matchIndex + 1}`,
          stage: group.label,
          roundLabel: `Round ${roundIndex + 1}`,
          label: `Match ${matchIndex + 1}`,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
        });
      });
    });

    chunkScheduleBlockMatches(roundMatches, normalizedFieldCount).forEach((matches, chunkIndex) => {
      blocks.push({
        order: 10 + roundIndex * 10 + chunkIndex,
        matches,
        section: "group",
      });
    });
  }

  const finalRoundBlocks: ManualScheduleBlock[] = [
    ...previewData.bracket.map((round, roundIndex) => ({
      order: getManualFinalBlockOrder({
        stage: "Phase finale principale",
        roundLabel: round.label,
        roundId: round.id,
        roundIndex,
        mainRoundOpeningLevels,
        secondaryRoundOpeningLevels,
      }),
      matches: round.matches.map((match) => ({
        id: `main-${match.id}`,
        stage: "Phase finale principale",
        roundLabel: round.label,
        label: match.label,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeSlot: match.homeSlot,
        awaySlot: match.awaySlot,
      })),
      section: "final" as const,
    })),
    ...(previewData.secondaryBracket ?? []).map((round, roundIndex) => ({
      order: getManualFinalBlockOrder({
        stage: "Consolante",
        roundLabel: round.label,
        roundId: round.id,
        roundIndex,
        mainRoundOpeningLevels,
        secondaryRoundOpeningLevels,
      }),
      matches: round.matches.map((match) => ({
        id: `secondary-${match.id}`,
        stage: "Consolante",
        roundLabel: round.label,
        label: match.label,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeSlot: match.homeSlot,
        awaySlot: match.awaySlot,
      })),
      section: "final" as const,
    })),
    ...(previewData.classementSections ?? []).flatMap((section) =>
      section.rounds.map((round) => ({
        order: getManualFinalBlockOrder({
          stage: section.title,
          roundLabel: round.label,
          roundId: round.id,
          mainRoundOpeningLevels,
          secondaryRoundOpeningLevels,
        }),
        matches: round.matches.map((match) => ({
          id: `placement-${match.id}`,
          stage: section.title,
          roundLabel: round.label,
          label: match.label,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeSlot: match.homeSlot,
          awaySlot: match.awaySlot,
        })),
        section: "final" as const,
      })),
    ),
  ];

  const groupedFinalBlocks = new Map<number, ManualScheduledMatchSource[]>();
  finalRoundBlocks
    .sort((left, right) => left.order - right.order)
    .forEach((block) => {
      const existingMatches = groupedFinalBlocks.get(block.order) ?? [];
      existingMatches.push(...block.matches);
      groupedFinalBlocks.set(block.order, existingMatches);
    });

  [...groupedFinalBlocks.entries()]
    .sort((left, right) => left[0] - right[0])
    .forEach(([order, matchesAtOrder]) => {
      const finalMatches = matchesAtOrder.filter((match) => isAnyFinalScheduledMatch(match));
      const standardMatches = sortPlacementFinalMatches(
        matchesAtOrder.filter((match) => !isAnyFinalScheduledMatch(match)),
      );

      chunkScheduleBlockMatches(standardMatches, normalizedFieldCount).forEach((matches, chunkIndex) => {
        blocks.push({
          order: order + chunkIndex * 0.01,
          matches,
          section: "final",
        });
      });

      if (finalMatches.length > 0) {
        const finalChunkSize =
          finalMatches.length > 1 ? Math.min(normalizedFieldCount, finalMatches.length) : 1;

        chunkScheduleBlockMatches(finalMatches, finalChunkSize).forEach((matches, chunkIndex) => {
          blocks.push({
            order: order + 0.09 + chunkIndex * 0.01,
            matches,
            section: "final",
          });
        });
      }
    });

  return blocks;
};

const buildScheduledMatchesFromBlocks = (
  scheduleBlocks: ManualScheduleBlock[],
  state: Pick<
    ManualTournamentState,
    | "fieldCount"
    | "matchDurationMinutes"
    | "breakBetweenMatchesMinutes"
    | "lunchBreakMinutes"
    | "lunchBreakStartTime"
    | "dayCount"
    | "dayStartTimes"
    | "dayEndTimes"
    | "date"
  >,
): ManualScheduledMatch[] => {
  if (scheduleBlocks.length === 0) return [];

  const matchDuration = Math.max(1, Math.round(state.matchDurationMinutes));
  const breakBetweenMatches = Math.max(0, Math.round(state.breakBetweenMatchesMinutes));
  const lunchBreakMinutes = Math.max(0, Math.round(state.lunchBreakMinutes));
  const lunchBreakStart = parseTimeToMinutes(
    state.lunchBreakStartTime,
    DEFAULT_LUNCH_BREAK_START_TIME,
  );
  const selectedDayCount = Math.max(1, state.dayCount || 1);

  const getDayWindow = (dayIndex: number) => {
    const lastStartTime = state.dayStartTimes[state.dayStartTimes.length - 1] ?? DEFAULT_DAY_START_TIME;
    const lastEndTime = state.dayEndTimes[state.dayEndTimes.length - 1] ?? DEFAULT_DAY_END_TIME;
    const configuredStartTime = state.dayStartTimes[dayIndex] ?? lastStartTime;
    const configuredEndTime = state.dayEndTimes[dayIndex] ?? lastEndTime;
    const sanitized = sanitizeDayTimeRange(configuredStartTime, configuredEndTime);

    const startMinutes = parseTimeToMinutes(sanitized.startTime, DEFAULT_DAY_START_TIME);
    const rawEndMinutes = parseTimeToMinutes(sanitized.endTime, DEFAULT_DAY_END_TIME);
    const endMinutes =
      rawEndMinutes - startMinutes >= matchDuration
        ? rawEndMinutes
        : Math.min(startMinutes + matchDuration, 23 * 60 + 59);

    return {
      startMinutes,
      endMinutes,
      dayLabel: formatScheduleDayLabel(state.date || null, dayIndex),
      dateLabel: state.date
        ? (() => {
            const date = new Date(`${state.date}T00:00:00`);
            date.setDate(date.getDate() + dayIndex);
            return new Intl.DateTimeFormat("fr-FR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            }).format(date);
          })()
        : null,
    };
  };

  const scheduledMatches: ManualScheduledMatch[] = [];
  let dayIndex = 0;
  let currentDay = getDayWindow(dayIndex);
  let currentMinutes = currentDay.startMinutes;
  let lunchApplied = false;
  let finalDayReservationApplied = false;
  const fieldUsage = Array.from({ length: Math.max(1, state.fieldCount) }, () => 0);

  const moveToNextDay = () => {
    if (dayIndex + 1 >= selectedDayCount) {
      currentDay = {
        ...currentDay,
        // Keep the planner responsive even if the configured day window is too short.
        endMinutes: Number.MAX_SAFE_INTEGER,
      };
      lunchApplied = true;
      return;
    }

    dayIndex += 1;
    currentDay = getDayWindow(dayIndex);
    currentMinutes = currentDay.startMinutes;
    lunchApplied = false;
  };

  let blockIndex = 0;

  while (blockIndex < scheduleBlocks.length) {
    const currentBlock = scheduleBlocks[blockIndex];
    if (
      !finalDayReservationApplied &&
      selectedDayCount > 1 &&
      dayIndex === 0 &&
      currentBlock?.section === "final"
    ) {
      finalDayReservationApplied = true;
      moveToNextDay();
      continue;
    }

    if (currentMinutes + matchDuration > currentDay.endMinutes) {
      moveToNextDay();
      continue;
    }

    if (lunchBreakMinutes > 0 && !lunchApplied) {
      if (currentMinutes < lunchBreakStart && currentMinutes + matchDuration > lunchBreakStart) {
        currentMinutes = lunchBreakStart;
      }

      if (currentMinutes >= lunchBreakStart) {
        if (currentMinutes + lunchBreakMinutes >= currentDay.endMinutes) {
          moveToNextDay();
          continue;
        }

        currentMinutes += lunchBreakMinutes;
        lunchApplied = true;

        if (currentMinutes + matchDuration > currentDay.endMinutes) {
          moveToNextDay();
          continue;
        }
      }
    }

    const slotMatches = currentBlock?.matches ?? [];
    const slotHasFinal = slotMatches.some((match) => isAnyFinalScheduledMatch(match));
    const slotContainsOnlyFinals = slotHasFinal && slotMatches.every((match) => isAnyFinalScheduledMatch(match));
    const slotIsSolo = slotContainsOnlyFinals && slotMatches.length === 1;
    const availableTerrainIndexes = slotIsSolo
      ? [0]
      : Array.from({ length: Math.max(1, state.fieldCount) }, (_, terrainIndex) => terrainIndex).sort(
          (left, right) => {
            const usageGap = (fieldUsage[left] ?? 0) - (fieldUsage[right] ?? 0);
            if (usageGap !== 0) return usageGap;
            return left - right;
          },
        );
    const remainingTerrainIndexes = [...availableTerrainIndexes];

    slotMatches.forEach((match) => {
      const preferredTerrainIndex =
        typeof match.preferredFieldIndex === "number" ? match.preferredFieldIndex - 1 : null;
      const preferredTerrainPosition =
        preferredTerrainIndex === null ? -1 : remainingTerrainIndexes.indexOf(preferredTerrainIndex);
      const terrainIndex =
        preferredTerrainPosition >= 0
          ? (remainingTerrainIndexes.splice(preferredTerrainPosition, 1)[0] ?? 0)
          : (remainingTerrainIndexes.shift() ?? 0);
      scheduledMatches.push({
        ...match,
        dayIndex,
        dayLabel: currentDay.dayLabel,
        dateLabel: currentDay.dateLabel,
        fieldIndex: terrainIndex + 1,
        fieldLabel: `Terrain ${terrainIndex + 1}`,
        startTime: formatMinutesToTime(currentMinutes),
        endTime: formatMinutesToTime(currentMinutes + matchDuration),
      });
      fieldUsage[terrainIndex] = (fieldUsage[terrainIndex] ?? 0) + 1;
    });

    blockIndex += 1;
    currentMinutes += matchDuration;

    if (blockIndex < scheduleBlocks.length && breakBetweenMatches > 0) {
      currentMinutes += breakBetweenMatches;
    }
  }

  return scheduledMatches;
};

const buildScheduledMatches = (
  previewData: TournamentPreviewData,
  state: ManualTournamentState,
): ManualScheduledMatch[] => {
  const scheduleBlocks = buildManualScheduleBlocks(previewData, state.fieldCount);
  return buildScheduledMatchesFromBlocks(scheduleBlocks, state);
};

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

const createEmptyTeamPlayer = (index: number) => ({
  lastName: "",
  firstName: "",
  license: "",
  number: `${index + 1}`,
});

const countFilledPlayers = (
  players: Array<{
    lastName: string;
    firstName: string;
    license: string;
    number: string;
  }>,
) =>
  players.filter(
    (player) =>
      player.lastName.trim() ||
      player.firstName.trim() ||
      player.license.trim(),
  ).length;

const normalizeTeamPlayersByTeam = (
  teamEntries: string[],
  teamPlayersByTeam: ManualTournamentState["teamPlayersByTeam"],
  maxPlayersPerTeam: number,
) =>
  Object.fromEntries(
    teamEntries.map((teamName) => {
      const normalizedPlayers = (teamPlayersByTeam[teamName] ?? [])
        .slice(0, Math.max(1, maxPlayersPerTeam))
        .map((player, index) => ({
          lastName: player.lastName ?? "",
          firstName: player.firstName ?? "",
          license: player.license ?? "",
          number: player.number ?? `${index + 1}`,
        }));

      return [teamName, normalizedPlayers];
    }),
  );

const normalizeValidatedTeams = (
  teamEntries: string[],
  validatedTeams: ManualTournamentState["validatedTeams"],
) =>
  Object.fromEntries(
    teamEntries.map((teamName) => [teamName, Boolean(validatedTeams[teamName])]),
  );

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
  const dayCount = Math.max(1, Math.round(state.dayCount || 1));
  const categories = state.categories.length > 0 ? state.categories : [DEFAULT_STATE.categories[0]];
  const levelGroupsByCategory = normalizeLevelGroupsByCategory(categories, state.levelGroupsByCategory);
  const levels = Array.from(
    new Set(
      Object.values(levelGroupsByCategory)
        .flatMap((groups) => groups.flatMap((group) => group))
        .map((level) => level.trim())
        .filter(Boolean),
    ),
  );
  const divisionDefinitions = buildDivisionDefinitions({
    ...state,
    categories,
    levelGroupsByCategory,
  } as ManualTournamentState);
  const teamEntries = normalizeTeamEntries(state.teamEntries, state.teamsCount);
  const maxPlayersPerTeam = Math.max(
    1,
    Math.round(state.maxPlayersPerTeam || DEFAULT_STATE.maxPlayersPerTeam),
  );
  const refereeCount = Math.max(0, Math.round(state.refereeCount || 0));
  const referees = Array.from({ length: refereeCount }, (_, index) => {
    const existingReferee = state.referees[index];
    return existingReferee ?? { id: buildEditorId("ref"), firstName: "", lastName: "" };
  });
  const mealsPerTeam = Math.max(1, Math.round(state.mealsPerTeam || DEFAULT_STATE.mealsPerTeam));
  const mealItems = (state.mealItems ?? []).map((item) => ({
    id: item.id || buildEditorId("meal"),
    label: item.label ?? "",
    price: item.price ?? "",
    link: item.link ?? "",
  }));
  const teamPlayersByTeam = normalizeTeamPlayersByTeam(
    teamEntries,
    state.teamPlayersByTeam,
    maxPlayersPerTeam,
  );
  const validatedTeams = normalizeValidatedTeams(teamEntries, state.validatedTeams ?? {});
  const resolvedTeams = buildResolvedTeams(teamEntries, state.teamsCount);
  const normalizedDayStartTimes = normalizeDayTimeValues(
    state.dayStartTimes,
    dayCount,
    DEFAULT_DAY_START_TIME,
  );
  const normalizedDayEndTimes = normalizeDayTimeValues(
    state.dayEndTimes,
    dayCount,
    DEFAULT_DAY_END_TIME,
  ).map((endTime, index) => sanitizeDayTimeRange(normalizedDayStartTimes[index]!, endTime).endTime);
  const groupAssignments = normalizeGroupAssignments(
    state.groupAssignments,
    state.teamsCount,
    state.groupsCount,
    resolvedTeams,
  );

  return {
    ...state,
    dayCount,
    matchDurationMinutes: Math.max(1, Math.round(state.matchDurationMinutes || DEFAULT_STATE.matchDurationMinutes)),
    breakBetweenMatchesMinutes: Math.max(
      0,
      Math.round(state.breakBetweenMatchesMinutes ?? DEFAULT_STATE.breakBetweenMatchesMinutes),
    ),
    lunchBreakMinutes: Math.max(0, Math.round(state.lunchBreakMinutes ?? DEFAULT_STATE.lunchBreakMinutes)),
    lunchBreakStartTime: normalizeTimeInput(
      state.lunchBreakStartTime,
      DEFAULT_LUNCH_BREAK_START_TIME,
    ),
    dayStartTimes: normalizedDayStartTimes,
    dayEndTimes: normalizedDayEndTimes,
    teamEntries,
    validatedTeams,
    maxPlayersPerTeam,
    teamPlayersByTeam,
    refereeCount,
    refereeAssignmentMode: state.refereeAssignmentMode === "manual" ? "manual" : "auto",
    referees,
    mealsPerTeam,
    mealItems,
    groupAssignments,
    categories,
    levels: levels.length > 0 ? levels : [LEVEL_OPTIONS[0]],
    categoryOrganization: state.categoryOrganization === "alternated" ? "alternated" : "separate",
    matchesViewMode: state.matchesViewMode === "alternated" ? "alternated" : "division",
    matchesSharedFields: Boolean(state.matchesSharedFields),
    levelGroupsByCategory,
    divisionFieldAllocations: normalizeDivisionFieldAllocations(
      divisionDefinitions,
      Math.max(1, Math.round(state.fieldCount || DEFAULT_STATE.fieldCount)),
      state.divisionFieldAllocations ?? {},
    ),
    fieldDivisionAssignments: normalizeFieldDivisionAssignments(
      divisionDefinitions,
      Math.max(1, Math.round(state.fieldCount || DEFAULT_STATE.fieldCount)),
      state.fieldDivisionAssignments ?? {},
    ),
    shareSettings: buildDefaultManualShareSettings(state.shareSettings),
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

const buildPreviewSlotFromLabel = (
  label: string,
  groups: TournamentPreviewGroup[],
): TournamentPreviewSlot => {
  const trimmedLabel = label.trim();
  const seedMatch = trimmedLabel.match(/^(\d+)([A-Z])$/i);
  if (seedMatch) {
    const rank = Number(seedMatch[1]);
    const groupLetter = seedMatch[2].toUpperCase();
    const group = groups.find(
      (entry) => entry.label.replace(/^Poule\s+/i, "").trim().toUpperCase() === groupLetter,
    );

    return {
      type: "seed",
      sourceMatchId: null,
      groupId: group?.id ?? null,
      rank,
      label: trimmedLabel,
      seedIndex: null,
    };
  }

  const bestRankMatch = trimmedLabel.match(/^Meilleur\s+(\d+)(?:er|e|eme)(?:\s*\((\d+)\))?$/i);
  if (bestRankMatch) {
    return {
      type: "seed",
      sourceMatchId: null,
      groupId: null,
      rank: Number(bestRankMatch[1]),
      label: trimmedLabel,
      seedIndex: Number(bestRankMatch[2] ?? "1"),
    };
  }

  const dsqfRankMatch = trimmedLabel.match(/^(\d+)(?:er|e|eme)\s*\(DSQF(?:\s+(\d+))?\)$/i);
  if (dsqfRankMatch) {
    return {
      type: "seed",
      sourceMatchId: null,
      groupId: null,
      rank: Number(dsqfRankMatch[1]),
      label: trimmedLabel,
      seedIndex: Number(dsqfRankMatch[2] ?? "1"),
    };
  }

  const dependencyMatch = trimmedLabel.match(/^(Vainqueur|Perdant)\s+(.+)$/i);
  if (dependencyMatch) {
    return {
      type: dependencyMatch[1].toLowerCase() === "vainqueur" ? "winner" : "loser",
      sourceMatchId: dependencyMatch[2]?.trim() ?? null,
      groupId: null,
      rank: null,
      label: trimmedLabel,
      seedIndex: null,
    };
  }

  return {
    type: "seed",
    sourceMatchId: null,
    groupId: null,
    rank: null,
    label: trimmedLabel,
    seedIndex: null,
  };
};

const attachPreviewSlotsToRounds = (
  rounds: TournamentPreviewRound[],
  groups: TournamentPreviewGroup[],
) =>
  rounds.map((round) => ({
    ...round,
    matches: round.matches.map((match) => ({
      ...match,
      homeSlot: buildPreviewSlotFromLabel(match.homeTeam, groups),
      awaySlot: buildPreviewSlotFromLabel(match.awayTeam, groups),
    })),
  }));

const attachPreviewSlotsToPlacementSections = (
  sections: TournamentPreviewPlacementSection[],
  groups: TournamentPreviewGroup[],
) =>
  sections.map((section) => ({
    ...section,
    rounds: attachPreviewSlotsToRounds(section.rounds, groups),
  }));

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
    displayLabels.push(
      ...partialLabels.map((_, index) => `Meilleur ${rank}eme (${index + 1})`),
    );
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
      partialRank: 0,
      partialCount: 0,
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
    partialRank,
    partialCount,
    isValid: true,
    errorMessage: undefined,
  };
};

const getPlacementLabel = (startRank: number, count: number) =>
  count === 2 ? `${startRank}e place` : `${startRank}e-${startRank + count - 1}e`;

const buildDisqualifiedRankPlaceholderLabel = (
  rank: number,
  slotIndex: number,
  totalCount: number,
) => (totalCount <= 1 ? `${rank}eme (DSQF)` : `${rank}eme (DSQF ${slotIndex})`);

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

const relabelConsolationRounds = (rounds: TournamentPreviewRound[], startRank: number) =>
  rounds.map((round, index) => {
    const isFirstRound = index === 0;
    const isFinalRound = index === rounds.length - 1;
    const isSemiRound = /Demi-finales?/i.test(round.label);
    const nextRoundLabel = isFinalRound
      ? "Finale consolante"
      : isSemiRound
        ? "Demi-finales consolante"
        : isFirstRound
          ? `${round.label.replace(/s$/, "")} consolante`
          : round.label;

    return {
      ...round,
      label: nextRoundLabel,
      matches: round.matches.map((match) => ({
        ...match,
        label: isFinalRound
          ? `${startRank}e place`
          : isSemiRound
            ? `${match.label} consolante`
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
    rounds: relabelConsolationRounds(result.rounds, startRank),
    bracketLabel: `Consolante • ${startRank}e-${startRank + desiredEntrants - 1}e`,
    errorMessage: undefined,
    selectedSeedLabels,
    drawSize: desiredEntrants,
  };
};

const buildClassementSections = (
  poolRemainingParticipants: string[],
  entrantCount: number,
  mainDrawSize: number,
  secondaryBracketRounds: TournamentPreviewRound[],
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
          entrantCount + 1,
          secondaryDrawSize,
          "CONS. ",
        ).map((round, index) =>
          index === 0
            ? {
                ...round,
                label: `Classement ${entrantCount + 1}e-${entrantCount + secondaryDrawSize}e`,
              }
            : round,
        )
      : [];
  const secondaryBracketFinalPlacementRounds =
    phaseType === "double" && secondaryBracketRounds.length > 0
      ? [secondaryBracketRounds[secondaryBracketRounds.length - 1]!]
      : [];
  if (secondaryBracketPlacementRounds.length > 0) {
    sections.push({
      id: "secondary-bracket-placement",
      title: "Matchs de classement consolante",
      rounds: [...secondaryBracketPlacementRounds, ...secondaryBracketFinalPlacementRounds],
    });
  } else if (secondaryBracketFinalPlacementRounds.length > 0) {
    sections.push({
      id: "secondary-bracket-placement",
      title: "Matchs de classement consolante",
      rounds: secondaryBracketFinalPlacementRounds,
    });
  }

  if (poolRemainingParticipants.length >= 2) {
    sections.push({
      id: "group-placement",
      title: "Classement poules",
      rounds: buildPlacementBand(
        entrantCount + 1,
        poolRemainingParticipants,
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
  const excludedFromMain = allSeedLabels.filter(
    (seed) => !qualifiedBracket.selectedSeedLabels.includes(seed),
  );
  const poolRemainingSeeds =
    state.tournamentPhaseType === "double"
      ? excludedFromMain.filter((seed) => !secondaryBracketResult.selectedSeedLabels.includes(seed))
      : excludedFromMain;
  const partialRankPrefix =
    qualifiedBracket.partialRank > 0 ? `${qualifiedBracket.partialRank}` : null;
  const partialRankExcludedSeeds = partialRankPrefix
    ? poolRemainingSeeds.filter((seed) => seed.startsWith(partialRankPrefix))
    : [];
  const poolRemainingDisplayLabels = poolRemainingSeeds.map((seed) => {
    if (!partialRankPrefix || !seed.startsWith(partialRankPrefix)) return seed;

    const dsqfIndex = partialRankExcludedSeeds.indexOf(seed);
    if (dsqfIndex < 0) return seed;

    return buildDisqualifiedRankPlaceholderLabel(
      qualifiedBracket.partialRank,
      dsqfIndex + 1,
      partialRankExcludedSeeds.length,
    );
  });
  const classementSections = buildClassementSections(
    poolRemainingDisplayLabels,
    bracketResult.entrantCount,
    bracketResult.mainDrawSize,
    secondaryBracketResult.rounds,
    secondaryBracketResult.drawSize,
    state.tournamentPhaseType,
    state.placementMatches,
  );
  const bracketWithSlots = attachPreviewSlotsToRounds(bracketResult.rounds, previewGroups);
  const secondaryBracketWithSlots = attachPreviewSlotsToRounds(
    secondaryBracketResult.rounds,
    previewGroups,
  );
  const classementSectionsWithSlots = attachPreviewSlotsToPlacementSections(
    classementSections,
    previewGroups,
  );

  return {
    name: state.name.trim() || "Builder tournoi",
    date: state.date || undefined,
    teamsCount: state.teamsCount,
    groupsCount: state.groupsCount,
    phaseType: state.tournamentPhaseType,
    qualificationLabel: qualifiedBracket.resolvedQualificationLabel,
    qualificationEntries: qualifiedBracket.displayLabels,
    bracketLabel: bracketResult.bracketLabel,
    bracketError: bracketResult.errorMessage,
    secondaryBracketLabel: secondaryBracketResult.bracketLabel,
    secondaryBracketError: secondaryBracketResult.errorMessage,
    placementMatches: state.placementMatches,
    groups: previewGroups,
    bracket: bracketWithSlots,
    secondaryBracket: secondaryBracketWithSlots,
    classementSections: classementSectionsWithSlots,
    classement: classementSectionsWithSlots.flatMap((section) => section.rounds),
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

function ScheduledMatchCard({
  match,
  dragging = false,
  insertionPosition = null,
}: {
  match: DisplayedScheduledMatch;
  dragging?: boolean;
  insertionPosition?: "before" | "after" | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: match.originalMatchId,
    disabled: dragging,
  });
  const showSourcePlaceholder = isDragging && !dragging;
  const resolvedTransform = showSourcePlaceholder ? undefined : CSS.Transform.toString(transform);
  const resolvedTransition = showSourcePlaceholder ? undefined : transition;

  const cardContent = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-violet-300/20 bg-violet-500/14 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100">
            {match.startTime} - {match.endTime}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
            {match.fieldLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
            {match.stage}
          </span>
          <div
            {...attributes}
            {...listeners}
            className="flex h-8 w-6 cursor-grab items-center justify-center text-slate-500 opacity-25 transition group-hover:opacity-60 active:cursor-grabbing"
            aria-label={`Reordonner ${match.label}`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 12 18"
              className="h-4.5 w-3"
              fill="currentColor"
            >
              <circle cx="3" cy="3" r="1" />
              <circle cx="9" cy="3" r="1" />
              <circle cx="3" cy="9" r="1" />
              <circle cx="9" cy="9" r="1" />
              <circle cx="3" cy="15" r="1" />
              <circle cx="9" cy="15" r="1" />
            </svg>
          </div>
        </div>
      </div>
      <p className="mt-2 text-sm font-semibold text-white">{match.label}</p>
      {match.divisionId ? (
        <div className="mt-2">
          <span className="rounded-full border border-violet-300/20 bg-violet-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100">
            {match.divisionName}
          </span>
        </div>
      ) : null}
      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
        {/Round\s+\d+/i.test(match.roundLabel) ? "Match de poule" : match.roundLabel}
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <p className="text-sm text-white md:text-right">{match.homeTeam}</p>
        <span className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          VS
        </span>
        <p className="text-sm text-white md:text-left">{match.awayTeam}</p>
      </div>
    </>
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: resolvedTransform,
        transition: resolvedTransition,
      }}
      className={[
        "group relative rounded-[18px] border border-white/8 bg-white/[0.04] px-3 py-3 transition",
        isDragging || dragging
          ? "scale-[1.02] shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
          : "shadow-[0_10px_22px_rgba(0,0,0,0.18)]",
      ].join(" ")}
    >
      {insertionPosition ? (
        <div
          className={[
            "pointer-events-none absolute left-3 right-3 z-10 h-[3px] rounded-full bg-violet-300 shadow-[0_0_18px_rgba(167,139,250,0.45)]",
            insertionPosition === "before" ? "-top-[7px]" : "-bottom-[7px]",
          ].join(" ")}
        />
      ) : null}
      {showSourcePlaceholder ? (
        <>
          <div className="invisible">{cardContent}</div>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[18px] bg-[#0f1320]/88">
            <div className="h-[52px] w-[82%] rounded-[16px] border border-dashed border-violet-300/30 bg-violet-500/[0.05]" />
          </div>
        </>
      ) : (
        cardContent
      )}
    </div>
  );
}

function ManualTimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const minuteInputRef = useRef<HTMLInputElement | null>(null);
  const [hourDraft, setHourDraft] = useState(value.slice(0, 2));
  const [minuteDraft, setMinuteDraft] = useState(value.slice(3, 5));

  useEffect(() => {
    setHourDraft(value.slice(0, 2));
    setMinuteDraft(value.slice(3, 5));
  }, [value]);

  const commit = (nextHours: string, nextMinutes: string) => {
    const normalizedHours = nextHours.replace(/\D/g, "").slice(0, 2);
    const normalizedMinutes = nextMinutes.replace(/\D/g, "").slice(0, 2);

    setHourDraft(normalizedHours);
    setMinuteDraft(normalizedMinutes);

    if (normalizedHours.length === 2 && normalizedMinutes.length === 2) {
      const safeHours = String(Math.min(23, Number(normalizedHours))).padStart(2, "0");
      const safeMinutes = String(Math.min(59, Number(normalizedMinutes))).padStart(2, "0");
      onChange(`${safeHours}:${safeMinutes}`);
      return;
    }

    onChange("");
  };

  return (
    <div className="flex h-9 items-center gap-1 rounded-2xl border border-white/10 bg-black/25 px-2">
      <input
        value={hourDraft}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").slice(0, 2);
          setHourDraft(digits);
          if (digits.length === 2) {
            window.requestAnimationFrame(() => {
              minuteInputRef.current?.focus();
              minuteInputRef.current?.select();
            });
          }
        }}
        onBlur={() => commit(hourDraft, minuteDraft)}
        inputMode="numeric"
        placeholder="--"
        className="w-6 bg-transparent text-center text-sm font-semibold text-slate-100 outline-none placeholder:text-slate-500"
      />
      <span className="text-sm font-semibold text-slate-500">:</span>
      <input
        ref={minuteInputRef}
        value={minuteDraft}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").slice(0, 2);
          setMinuteDraft(digits);
          if (digits.length === 2) {
            commit(hourDraft, digits);
          }
        }}
        onBlur={() => commit(hourDraft, minuteDraft)}
        inputMode="numeric"
        placeholder="--"
        className="w-6 bg-transparent text-center text-sm font-semibold text-slate-100 outline-none placeholder:text-slate-500"
      />
    </div>
  );
}

function ManualTimeStepperField({
  value,
  onChange,
  fallbackValue,
  emptyByDefault = false,
}: {
  value: string;
  onChange: (value: string) => void;
  fallbackValue: string;
  emptyByDefault?: boolean;
}) {
  const displayedValue = emptyByDefault && value === fallbackValue ? "" : value;

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(shiftTimeValue(value, -15, fallbackValue))}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
        aria-label="Retirer 15 minutes"
      >
        -
      </button>
      <div className="shrink-0">
        <ManualTimeField value={displayedValue} onChange={onChange} />
      </div>
      <button
        type="button"
        onClick={() => onChange(shiftTimeValue(value, 15, fallbackValue))}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
        aria-label="Ajouter 15 minutes"
      >
        +
      </button>
    </div>
  );
}

export function ManualTournamentBuilder({
  registeredTeamOptions,
}: {
  registeredTeamOptions: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/tournament";
  const classicTeamId = searchParams.get("teamId") || "";
  const manageTournamentId = searchParams.get("manageTournamentId") || "";
  const requestedControlTab = searchParams.get("controlTab");
  const requestedTeamsSubTab = searchParams.get("teamsSubTab");
  const datePickerPanelRef = useRef<HTMLDivElement | null>(null);
  const mealSheetPreviewRef = useRef<HTMLDivElement | null>(null);
  const [manualTournamentState, setManualTournamentState] =
    useState<ManualTournamentState>(DEFAULT_STATE);
  const [activeDivisionId, setActiveDivisionId] = useState<string>(
    buildDivisionDefinitions(DEFAULT_STATE)[0]?.id ?? "default-division",
  );
  const [divisionStates, setDivisionStates] = useState<Record<string, ManualDivisionState>>(() => {
    const firstDivisionId = buildDivisionDefinitions(DEFAULT_STATE)[0]?.id ?? "default-division";
    return {
      [firstDivisionId]: createDefaultDivisionState(),
    };
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showMatchesSettingsPanel, setShowMatchesSettingsPanel] = useState(false);
  const [showFriendlyMatchesPanel, setShowFriendlyMatchesPanel] = useState(false);
  const [showFieldDistributionModal, setShowFieldDistributionModal] = useState(false);
  const [showMealsSheet, setShowMealsSheet] = useState(false);
  const [selectedMealOrderTeam, setSelectedMealOrderTeam] = useState<string | null>(null);
  const [activeFriendlySlotKey, setActiveFriendlySlotKey] = useState<string | null>(null);
  const [friendlyMatchDrafts, setFriendlyMatchDrafts] = useState<
    Record<string, { homeTeam: string; awayTeam: string; fieldLabel: string }>
  >({});
  const [shareCopiedKey, setShareCopiedKey] = useState<string | null>(null);
  const [activeDraggedScheduledMatchId, setActiveDraggedScheduledMatchId] = useState<string | null>(null);
  const [activeOverScheduledMatchId, setActiveOverScheduledMatchId] = useState<string | null>(null);
  const [collapsedMatchSectionKeys, setCollapsedMatchSectionKeys] = useState<Record<string, boolean>>({});
  const [scheduledMatchOrderIds, setScheduledMatchOrderIds] = useState<string[] | null>(null);
  const [scheduledMatchOrderSignature, setScheduledMatchOrderSignature] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [activeControlTab, setActiveControlTab] = useState<ManualControlTab | null>(null);
  const [activeTeamsControlSubTab, setActiveTeamsControlSubTab] =
    useState<TeamsControlSubTab>("count");
  const [activeGeneralControlSubTab, setActiveGeneralControlSubTab] =
    useState<GeneralControlSubTab>("general");
  const [customLevelDrafts, setCustomLevelDrafts] = useState<Record<string, string>>({});
  const [manualTeamCountDraft, setManualTeamCountDraft] = useState("");
  const [registeredTeamSearch, setRegisteredTeamSearch] = useState("");
  const [manualTeamNameDraft, setManualTeamNameDraft] = useState("");
  const [slotManualTeamNameDraft, setSlotManualTeamNameDraft] = useState("");
  const [isGeneratingTournament, setIsGeneratingTournament] = useState(false);
  const [showAddTeamPanel, setShowAddTeamPanel] = useState(false);
  const [manualGroupCountDraft, setManualGroupCountDraft] = useState("");
  const [manualFieldCountDraft, setManualFieldCountDraft] = useState("");
  const [editingSlotTarget, setEditingSlotTarget] = useState<GroupSlotTarget | null>(null);
  const [selectedRosterTeam, setSelectedRosterTeam] = useState<string | null>(null);
  const [viewRosterTeam, setViewRosterTeam] = useState<string | null>(null);
  const [viewRosterDraft, setViewRosterDraft] = useState<{
    lastName: string;
    firstName: string;
    license: string;
    number: string;
  } | null>(null);
  const [viewRosterSupabasePlayers, setViewRosterSupabasePlayers] = useState<TournamentProductTeamPlayer[]>([]);
  const [isViewRosterLoading, setIsViewRosterLoading] = useState(false);
  const [isViewRosterSupabaseSource, setIsViewRosterSupabaseSource] = useState(false);
  const [rosterSupabasePlayersByTeam, setRosterSupabasePlayersByTeam] = useState<
    Record<string, TournamentProductTeamPlayer[]>
  >({});
  const [loadingRosterTeamName, setLoadingRosterTeamName] = useState<string | null>(null);
  const [movingSlotTarget, setMovingSlotTarget] = useState<GroupSlotTarget | null>(null);
  const [hoveredSeedCode, setHoveredSeedCode] = useState<string | null>(null);
  const [pinnedSeedCode, setPinnedSeedCode] = useState<string | null>(null);
  const [shuffleFeedbackActive, setShuffleFeedbackActive] = useState(false);
  const previousPhaseTypeRef = useRef<ManualTournamentState["tournamentPhaseType"]>(
    DEFAULT_STATE.tournamentPhaseType,
  );
  const mealLabelInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const hasLoadedManagedTournamentRef = useRef(false);
  const previousActiveDivisionIdRef = useRef<string | null>(
    buildDivisionDefinitions(DEFAULT_STATE)[0]?.id ?? null,
  );
  const skipNextDivisionStateSyncRef = useRef(false);
  const skipNextDivisionHydrationRef = useRef(false);
  const ignoreNextMealOrderCloseRef = useRef(false);
  const ignoreNextActiveControlTabCloseRef = useRef(false);
  const previousDivisionDefinitionsRef = useRef<DivisionDefinition[]>(
    buildDivisionDefinitions(DEFAULT_STATE),
  );
  const rosterPrefetchSignatureRef = useRef<string | null>(null);
  const shuffleFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToSecondaryBracket = () => {
    window.requestAnimationFrame(() => {
      document
        .getElementById("manual-builder-secondary-bracket")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const closeFloatingPanels = () => {
    setActiveControlTab(null);
    setEditingSlotTarget(null);
    setMovingSlotTarget(null);
    setPinnedSeedCode(null);
    setShowSettingsPanel(false);
    setShowMatchesSettingsPanel(false);
    setShowFriendlyMatchesPanel(false);
    setShowFieldDistributionModal(false);
    setActiveFriendlySlotKey(null);
    setShowAddTeamPanel(false);
    setIsDatePickerOpen(false);
    setActiveDraggedScheduledMatchId(null);
    setActiveOverScheduledMatchId(null);
    setViewRosterDraft(null);
  };
  const updateManualShareSettings = (
    updater:
      | TournamentProductShareSettings
      | ((current: TournamentProductShareSettings) => TournamentProductShareSettings),
  ) => {
    setManualTournamentState((current) => ({
      ...current,
      shareSettings:
        typeof updater === "function"
          ? updater(buildDefaultManualShareSettings(current.shareSettings))
          : buildDefaultManualShareSettings(updater),
    }));
  };

  useEffect(() => {
    if (hasLoadedManagedTournamentRef.current) return;
    if (!manageTournamentId || !classicTeamId || typeof window === "undefined") return;

    hasLoadedManagedTournamentRef.current = true;

    const hydrateFromSnapshot = (
      snapshot: TournamentProductSavedTournament["manualBuilderSnapshot"],
      liveShareSettings?: TournamentProductShareSettings | null,
    ) => {
      if (!snapshot || typeof snapshot !== "object") return false;

      const snapshotState = snapshot.manualTournamentState as Partial<ManualTournamentState>;
      const nextState = normalizeManualTournamentState({
        ...DEFAULT_STATE,
        ...snapshotState,
        shareSettings: buildDefaultManualShareSettings(
          liveShareSettings ?? snapshotState.shareSettings,
        ),
      });
      const loadedDivisionStates =
        snapshot.divisionStates && typeof snapshot.divisionStates === "object"
          ? (snapshot.divisionStates as Record<string, ManualDivisionState>)
          : {};
      const nextDivisionDefinitions = buildDivisionDefinitions(nextState);
      const fallbackDivisionId = nextDivisionDefinitions[0]?.id ?? "default-division";

      setManualTournamentState(nextState);
      setDivisionStates(
        Object.keys(loadedDivisionStates).length > 0
          ? loadedDivisionStates
          : {
              [fallbackDivisionId]: createDefaultDivisionState(),
            },
      );
      setActiveDivisionId(
        snapshot.activeDivisionId &&
          nextDivisionDefinitions.some((division) => division.id === snapshot.activeDivisionId)
          ? snapshot.activeDivisionId
          : fallbackDivisionId,
      );

      return true;
    };

    const loadManagedTournament = async () => {
      console.log("GESTION LOAD START", manageTournamentId);
      try {
        const remoteTournament = await loadTournamentFromSupabase<TournamentProductSavedTournament>(
          manageTournamentId,
        );

        if (
          remoteTournament?.mode === "manual" &&
          hydrateFromSnapshot(remoteTournament.manualBuilderSnapshot, remoteTournament.shareSettings)
        ) {
          console.log("GESTION LOAD DONE", manageTournamentId);
          return;
        }
      } catch (error) {
        console.log("GESTION LOAD ERROR", error);
        if (isAbortError(error)) {
          console.warn("Chargement tournoi interrompu");
        } else {
          console.error("Erreur chargement tournoi manuel Supabase:", error);
        }
      }

      try {
        const raw = window.localStorage.getItem(`${CLASSIC_TOURNAMENT_STORAGE_PREFIX}${classicTeamId}`);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;

        const tournamentEntry = parsed.find(
          (entry) =>
            typeof entry === "object" &&
            entry !== null &&
            "id" in entry &&
            entry.id === manageTournamentId &&
            "mode" in entry &&
            entry.mode === "manual",
        ) as TournamentProductSavedTournament | undefined;

        if (!tournamentEntry) return;
        const didHydrate = hydrateFromSnapshot(
          tournamentEntry.manualBuilderSnapshot,
          tournamentEntry.shareSettings,
        );

        if (didHydrate) {
          console.log("GESTION LOAD DONE", manageTournamentId);
          try {
            await saveTournamentToSupabase({
              ...tournamentEntry,
              teamId: classicTeamId,
            });
          } catch (error) {
            console.log("GESTION LOAD ERROR", error);
            if (isAbortError(error)) {
              console.warn("Chargement tournoi interrompu");
              return;
            }

            console.error("Erreur migration tournoi manuel Supabase:", error);
          }
        }
      } catch (error) {
        console.log("GESTION LOAD ERROR", error);
        if (isAbortError(error)) {
          console.warn("Chargement tournoi interrompu");
          return;
        }
        console.error("Erreur fallback tournoi manuel local:", error);
      }
    };

    void loadManagedTournament();
  }, [classicTeamId, manageTournamentId]);

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
  const divisionDefinitions = useMemo(
    () => buildDivisionDefinitions(normalizedState),
    [normalizedState],
  );
  const effectiveFieldDivisionAssignments = useMemo(
    () =>
      normalizeFieldDivisionAssignments(
        divisionDefinitions,
        normalizedState.fieldCount,
        normalizedState.fieldDivisionAssignments ?? {},
      ),
    [divisionDefinitions, normalizedState.fieldCount, normalizedState.fieldDivisionAssignments],
  );
  const effectiveAssignedFieldIndexesByDivision = useMemo(
    () =>
      Object.fromEntries(
        divisionDefinitions.map((division) => [
          division.id,
          Object.entries(effectiveFieldDivisionAssignments)
            .filter(([, assignedDivisionId]) => assignedDivisionId === division.id)
            .map(([fieldKey]) => Number(fieldKey))
            .filter((value) => Number.isFinite(value))
            .sort((left, right) => left - right),
        ]),
      ) as Record<string, number[]>,
    [divisionDefinitions, effectiveFieldDivisionAssignments],
  );
  const effectiveActiveDivisionId =
    divisionDefinitions.find((division) => division.id === activeDivisionId)?.id ??
    divisionDefinitions[0]?.id ??
    null;

  useEffect(() => {
    const previousDivisionDefinitions = previousDivisionDefinitionsRef.current;
    const previousDivisionIdsSignature = previousDivisionDefinitions
      .map((division) => division.id)
      .join("|");
    const nextDivisionIdsSignature = divisionDefinitions.map((division) => division.id).join("|");
    const nextDivisionIds = new Set(divisionDefinitions.map((division) => division.id));
    const previousActiveDivision = activeDivisionId
      ? previousDivisionDefinitions.find((division) => division.id === activeDivisionId) ?? null
      : null;
    const activeDivisionNeedsRemap =
      Boolean(previousActiveDivision) && Boolean(activeDivisionId) && !nextDivisionIds.has(activeDivisionId);

    if (!activeDivisionNeedsRemap && previousDivisionIdsSignature === nextDivisionIdsSignature) {
      return;
    }

    const nextActiveDivisionId =
      activeDivisionId && nextDivisionIds.has(activeDivisionId)
        ? activeDivisionId
        : previousActiveDivision
          ? findBestMatchingDivisionId(previousActiveDivision, divisionDefinitions) ??
            divisionDefinitions[0]?.id ??
            null
          : divisionDefinitions[0]?.id ?? null;

    const previousStates = {
      ...divisionStates,
      ...(activeDivisionNeedsRemap && activeDivisionId
        ? { [activeDivisionId]: getDivisionStateSlice(normalizedState) }
        : {}),
    };
    const usedPreviousIds = new Set<string>();
    const nextDivisionStates = Object.fromEntries(
      divisionDefinitions.map((division) => {
        if (previousStates[division.id]) {
          usedPreviousIds.add(division.id);
          return [division.id, previousStates[division.id]];
        }

        const bestMatchingPreviousDivisionId = findBestMatchingDivisionId(
          division,
          previousDivisionDefinitions.filter((candidate) => previousStates[candidate.id]),
          usedPreviousIds,
        );

        if (bestMatchingPreviousDivisionId) {
          usedPreviousIds.add(bestMatchingPreviousDivisionId);
          return [division.id, previousStates[bestMatchingPreviousDivisionId]];
        }

        return [division.id, createDefaultDivisionState()];
      }),
    ) as Record<string, ManualDivisionState>;

    if (!areDivisionStateMapsEqual(divisionStates, nextDivisionStates)) {
      skipNextDivisionHydrationRef.current = activeDivisionNeedsRemap;
      setDivisionStates(nextDivisionStates);
    }

    if (nextActiveDivisionId && nextActiveDivisionId !== activeDivisionId) {
      skipNextDivisionHydrationRef.current = true;
      setActiveDivisionId(nextActiveDivisionId);
    }

    previousDivisionDefinitionsRef.current = divisionDefinitions;
  }, [activeDivisionId, divisionDefinitions, divisionStates, normalizedState]);

  useEffect(() => {
    if (!effectiveActiveDivisionId) return;
    if (previousActiveDivisionIdRef.current !== effectiveActiveDivisionId) {
      previousActiveDivisionIdRef.current = effectiveActiveDivisionId;
      return;
    }
    if (skipNextDivisionStateSyncRef.current) {
      skipNextDivisionStateSyncRef.current = false;
      return;
    }
    const currentSlice = getDivisionStateSlice(normalizedState);
    setDivisionStates((current) => {
      const existing = current[effectiveActiveDivisionId];
      if (existing && JSON.stringify(existing) === JSON.stringify(currentSlice)) {
        return current;
      }
      return {
        ...current,
        [effectiveActiveDivisionId]: currentSlice,
      };
    });
  }, [effectiveActiveDivisionId, normalizedState]);

  useEffect(() => {
    if (!effectiveActiveDivisionId) return;
    if (skipNextDivisionHydrationRef.current) {
      skipNextDivisionHydrationRef.current = false;
      return;
    }
    const targetDivisionState = divisionStates[effectiveActiveDivisionId];
    if (!targetDivisionState) return;

    const currentSlice = getDivisionStateSlice(manualTournamentState);
    if (JSON.stringify(currentSlice) === JSON.stringify(targetDivisionState)) {
      return;
    }

    skipNextDivisionStateSyncRef.current = true;
    setManualTournamentState((current) => ({
      ...current,
      ...targetDivisionState,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveActiveDivisionId, divisionStates]);

  const divisionEntries = useMemo(() => {
    return divisionDefinitions.map((division) => {
      const divisionStateSlice =
        division.id === effectiveActiveDivisionId
          ? getDivisionStateSlice(normalizedState)
          : (divisionStates[division.id] ?? createDefaultDivisionState());
      const divisionState = normalizeManualTournamentState({
        ...normalizedState,
        ...divisionStateSlice,
      });
      const previewData = buildPreviewData(divisionState);

      return {
        division,
        state: divisionState,
        previewData: {
          ...previewData,
          name: division.name,
        },
      };
    });
  }, [divisionDefinitions, divisionStates, effectiveActiveDivisionId, normalizedState]);
  const activeDivisionEntry = useMemo(
    () =>
      divisionEntries.find((entry) => entry.division.id === effectiveActiveDivisionId) ??
      divisionEntries[0] ??
      null,
    [divisionEntries, effectiveActiveDivisionId],
  );
  const previewData = activeDivisionEntry?.previewData ?? buildPreviewData(normalizedState);
  const effectiveQualificationPreviewKey =
    previewData.qualificationLabel === "Top 1"
      ? "top1"
      : previewData.qualificationLabel === "Top 2"
        ? "top2"
        : previewData.qualificationLabel === "Meilleur 3e"
          ? "best3"
          : null;
  const scheduledMatches = useMemo(() => {
    if (divisionEntries.length <= 1) {
      return attachDivisionToMatches(
        buildScheduledMatches(previewData, normalizedState),
        activeDivisionEntry?.division ?? null,
      );
    }

    if (normalizedState.matchesViewMode === "alternated") {
      const perDivisionBlocks = divisionEntries.map((entry) =>
        buildManualScheduleBlocks(
          entry.previewData,
          normalizedState.matchesSharedFields
            ? Math.max(1, effectiveAssignedFieldIndexesByDivision[entry.division.id]?.length ?? 1)
            : normalizedState.fieldCount,
        ).map((block) => ({
          ...block,
          matches: block.matches.map((match) => ({
            ...match,
            id: `${entry.division.id}__${match.id}`,
            divisionId: entry.division.id,
            divisionName: entry.division.name,
          })),
        })),
      );

      const interleavedBlocks: ManualScheduleBlock[] = [];
      let blockIndex = 0;
      while (perDivisionBlocks.some((blocks) => blockIndex < blocks.length)) {
        if (normalizedState.matchesSharedFields) {
          const slotBlocks = perDivisionBlocks
            .map((blocks, divisionIndex) => {
              const divisionId = divisionEntries[divisionIndex]?.division.id;
              const allocation = divisionId
                ? effectiveAssignedFieldIndexesByDivision[divisionId]?.length ?? 0
                : 0;
              if (allocation <= 0) return null;
              return blocks[blockIndex] ?? null;
            })
            .filter((block): block is ManualScheduleBlock => Boolean(block));

          if (slotBlocks.length > 0) {
            const mergedMatches = slotBlocks.flatMap((block) =>
              block.matches.map((match, matchIndex) => {
                const assignedFieldIndexes =
                  match.divisionId
                    ? effectiveAssignedFieldIndexesByDivision[match.divisionId] ?? []
                    : [];
                return {
                  ...match,
                  preferredFieldIndex: assignedFieldIndexes[matchIndex],
                };
              }),
            );
            interleavedBlocks.push({
              order: blockIndex,
              matches: mergedMatches,
              section: slotBlocks.some((block) => block.section === "final") ? "final" : "group",
            });
          }
        } else {
          perDivisionBlocks.forEach((blocks) => {
            const block = blocks[blockIndex];
            if (block) interleavedBlocks.push(block);
          });
        }
        blockIndex += 1;
      }

      return attachDivisionToMatches(buildScheduledMatchesFromBlocks(interleavedBlocks, normalizedState), null);
    }

    const sequentialBlocks = divisionEntries.flatMap((entry, divisionIndex) =>
      buildManualScheduleBlocks(entry.previewData, normalizedState.fieldCount).map((block) => ({
        ...block,
        order: block.order + divisionIndex * 10000,
        matches: block.matches.map((match) => ({
          ...match,
          id: `${entry.division.id}__${match.id}`,
          divisionId: entry.division.id,
          divisionName: entry.division.name,
        })),
      })),
    );

    return attachDivisionToMatches(buildScheduledMatchesFromBlocks(sequentialBlocks, normalizedState), null);
  }, [activeDivisionEntry, divisionEntries, effectiveAssignedFieldIndexesByDivision, normalizedState, previewData]);
  const scheduledMatchesSignature = useMemo(
    () => `${SCHEDULE_ORDER_VERSION}:${scheduledMatches.map((match) => match.id).join("|")}`,
    [scheduledMatches],
  );
  const effectiveScheduledMatchOrderIds = useMemo(() => {
    const baseIds = scheduledMatches.map((match) => match.id);
    if (
      !scheduledMatchOrderIds ||
      scheduledMatchOrderIds.length !== baseIds.length ||
      scheduledMatchOrderSignature !== scheduledMatchesSignature
    ) {
      return baseIds;
    }

    const currentIds = [...scheduledMatchOrderIds];
    if (baseIds.some((id) => !currentIds.includes(id))) {
      return baseIds;
    }

    return currentIds;
  }, [scheduledMatchOrderIds, scheduledMatchOrderSignature, scheduledMatches, scheduledMatchesSignature]);
  const displayedScheduledMatches = useMemo(() => {
    const scheduledMatchMap = new Map(scheduledMatches.map((match) => [match.id, match]));
    const orderedMatches = effectiveScheduledMatchOrderIds
      .map((id) => scheduledMatchMap.get(id))
      .filter((match): match is ManualScheduledMatch => Boolean(match));

    return scheduledMatches.map((slotMatch, index) => {
      const orderedMatch = orderedMatches[index] ?? slotMatch;

      return {
        ...orderedMatch,
        id: `${slotMatch.id}__${orderedMatch.id}`,
        originalMatchId: orderedMatch.id,
        dayIndex: slotMatch.dayIndex,
        dayLabel: slotMatch.dayLabel,
        dateLabel: slotMatch.dateLabel,
        fieldIndex: slotMatch.fieldIndex,
        fieldLabel: slotMatch.fieldLabel,
        startTime: slotMatch.startTime,
        endTime: slotMatch.endTime,
      };
    });
  }, [effectiveScheduledMatchOrderIds, scheduledMatches]);
  const dragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 120,
        tolerance: 8,
      },
    }),
  );
  const activeDraggedScheduledMatch = useMemo(
    () =>
      activeDraggedScheduledMatchId
        ? displayedScheduledMatches.find(
            (match) => match.originalMatchId === activeDraggedScheduledMatchId,
          ) ?? null
        : null,
    [activeDraggedScheduledMatchId, displayedScheduledMatches],
  );
  const scheduledMatchesByDay = useMemo(() => {
    const groupedMatches = new Map<
      string,
      {
        dayIndex: number;
        dayLabel: string;
        dateLabel: string | null;
        matches: (ManualScheduledMatch & { originalMatchId: string })[];
      }
    >();

    displayedScheduledMatches.forEach((match) => {
      const groupKey = `${match.dayIndex}-${match.dayLabel}`;
      const existingGroup = groupedMatches.get(groupKey);
      if (existingGroup) {
        existingGroup.matches.push(match);
        return;
      }

      groupedMatches.set(groupKey, {
        dayIndex: match.dayIndex,
        dayLabel: match.dayLabel,
        dateLabel: match.dateLabel,
        matches: [match],
      });
    });

    return Array.from(groupedMatches.values());
  }, [displayedScheduledMatches]);
  const handleScheduledMatchDragStart = ({ active }: DragStartEvent) => {
    setActiveDraggedScheduledMatchId(String(active.id));
    setActiveOverScheduledMatchId(String(active.id));
  };
  const handleScheduledMatchDragOver = ({ over }: DragOverEvent) => {
    setActiveOverScheduledMatchId(over ? String(over.id) : null);
  };
  const handleScheduledMatchDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDraggedScheduledMatchId(null);
    setActiveOverScheduledMatchId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = effectiveScheduledMatchOrderIds.indexOf(String(active.id));
    const newIndex = effectiveScheduledMatchOrderIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    setScheduledMatchOrderIds(arrayMove(effectiveScheduledMatchOrderIds, oldIndex, newIndex));
    setScheduledMatchOrderSignature(scheduledMatchesSignature);
  };
  const tournamentTeamOptions = useMemo(
    () =>
      Array.from(
        new Set(
          normalizedState.groupAssignments
            .flat()
            .filter((team): team is string => Boolean(team)),
        ),
      ),
    [normalizedState.groupAssignments],
  );
  const availableFriendlySlots = useMemo(() => {
    const slotMap = new Map<
      string,
      {
        key: string;
        dayLabel: string;
        dateLabel: string | null;
        startTime: string;
        endTime: string;
        usedFields: Set<number>;
        occupiedMatches: { fieldIndex: number; fieldLabel: string; label: string }[];
      }
    >();

    scheduledMatches.forEach((match) => {
      const slotKey = `${match.dayIndex}-${match.startTime}-${match.endTime}`;
      const existingSlot = slotMap.get(slotKey);
      if (existingSlot) {
        existingSlot.usedFields.add(match.fieldIndex);
        existingSlot.occupiedMatches.push({
          fieldIndex: match.fieldIndex,
          fieldLabel: match.fieldLabel,
          label: match.label,
        });
        return;
      }

      slotMap.set(slotKey, {
        key: slotKey,
        dayLabel: match.dayLabel,
        dateLabel: match.dateLabel,
        startTime: match.startTime,
        endTime: match.endTime,
        usedFields: new Set([match.fieldIndex]),
        occupiedMatches: [
          {
            fieldIndex: match.fieldIndex,
            fieldLabel: match.fieldLabel,
            label: match.label,
          },
        ],
      });
    });

    return [...slotMap.values()]
      .map((slot) => ({
        ...slot,
        occupiedMatches: [...slot.occupiedMatches].sort((left, right) => left.fieldIndex - right.fieldIndex),
        freeFields: Array.from(
          { length: Math.max(1, normalizedState.fieldCount) },
          (_, index) => index + 1,
        )
          .filter((fieldIndex) => !slot.usedFields.has(fieldIndex))
          .map((fieldIndex) => ({
            fieldIndex,
            fieldLabel: `Terrain ${fieldIndex}`,
          })),
      }))
      .filter((slot) => slot.freeFields.length > 0);
  }, [normalizedState.fieldCount, scheduledMatches]);

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
  const tournamentDayCount = Math.max(1, normalizedState.dayCount ?? 1);
  const formattedTournamentDate = formatTournamentDateRange(tournamentDate, tournamentDayCount);
  const tournamentDayStartTimes = normalizedState.dayStartTimes;
  const tournamentDayEndTimes = normalizedState.dayEndTimes;
  const manualTournamentProduct = useMemo<StoredManualTournamentProduct | null>(() => {
    if (displayedScheduledMatches.length === 0 || divisionEntries.length === 0) {
      return null;
    }

    const hasMultipleDivisions = divisionEntries.length > 1;
    const tournamentId = manageTournamentId || buildManualTournamentId();
    const previewDataByDivision = divisionEntries.map((entry) => ({
      id: entry.division.id,
      name: entry.division.name,
      data: entry.previewData,
    }));
    const groups: TournamentProductGroup[] = divisionEntries.flatMap((entry) =>
      entry.previewData.groups.map((group) => ({
        label: hasMultipleDivisions ? `${entry.division.name} • ${group.label}` : group.label,
        teams: group.standings.map((standing) => standing.team),
      })),
    );

    const teamsMap = new Map<string, TournamentProductTeam>();
    divisionEntries.forEach((entry) => {
      const groupedTeams = entry.state.groupAssignments
        .flat()
        .filter((team): team is string => Boolean(team));
      const fallbackTeams = entry.state.teamEntries;
      const divisionTeams = groupedTeams.length > 0 ? groupedTeams : fallbackTeams;

      divisionTeams.forEach((teamName, teamIndex) => {
        const teamKey = `${entry.division.id}::${teamName}`;
        if (teamsMap.has(teamKey)) return;
        teamsMap.set(teamKey, {
          id: `${entry.division.id}__team_${teamIndex + 1}`,
          name: teamName,
          officialId: null,
          source: "manual",
        });
      });
    });

    const slotIndexByKey = new Map<string, number>();
    let slotCounter = 0;
    const now = new Date();
    const matchStates: Record<string, TournamentProductMatchState> = {};

    const schedule: TournamentProductScheduleMatch[] = displayedScheduledMatches.map((match) => {
      const slotKey = `${match.dayIndex}-${match.startTime}`;
      if (!slotIndexByKey.has(slotKey)) {
        slotCounter += 1;
        slotIndexByKey.set(slotKey, slotCounter);
      }

      matchStates[match.originalMatchId] = {
        homeScore: null,
        awayScore: null,
        status: "idle",
        completedAt: null,
      };

      return {
        id: match.originalMatchId,
        roundLabel: getManualScheduleSection(match) === "group" ? match.stage : match.roundLabel,
        fieldLabel: match.fieldLabel,
        startTime: match.startTime,
        endTime: match.endTime,
        slotIndex: slotIndexByKey.get(slotKey),
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        divisionId: match.divisionId,
        divisionName: match.divisionName,
        stage: match.stage,
        label: match.label,
        scheduleSection: getManualScheduleSection(match),
      };
    });

    const hasScheduledMatch = schedule.some((match) => matchStates[match.id]?.status === "idle");
    const nextTournament: TournamentProductSavedTournament = {
      id: tournamentId,
      name: tournamentName || "Tournoi manuel",
      date: tournamentDate,
      categories: normalizedState.categories,
      levels: normalizedState.levels,
      groups,
      manualPreviewDataByDivision: previewDataByDivision,
      manualBuilderSnapshot: {
        manualTournamentState,
        divisionStates,
        activeDivisionId: effectiveActiveDivisionId,
      },
      mode: "manual",
      teamCount: teamsMap.size,
      autoFormat: "group_knockout",
      groupCount: groups.length,
      teamsPerGroup:
        groups.length > 0
          ? Math.max(1, ...groups.map((group) => group.teams.length))
          : Math.max(1, normalizedState.teamsCount),
      startTime: tournamentDayStartTimes[0] ?? DEFAULT_DAY_START_TIME,
      endTime: tournamentDayEndTimes[tournamentDayEndTimes.length - 1] ?? DEFAULT_DAY_END_TIME,
      teams: [...teamsMap.values()],
      maxPlayersPerTeam: normalizedState.maxPlayersPerTeam,
      mealsPerTeam: normalizedState.mealsPerTeam,
      mealItems: normalizedState.mealItems.map((item) => ({
        id: item.id,
        label: item.label,
        price: item.price,
        link: item.link,
      })),
      shareSettings: buildDefaultManualShareSettings(normalizedState.shareSettings),
      schedule,
      fieldCount: Math.max(1, normalizedState.fieldCount),
      matchDuration: Math.max(1, normalizedState.matchDurationMinutes),
      breakMinutes: Math.max(0, normalizedState.breakBetweenMatchesMinutes),
      lunchBreakMinutes: Math.max(0, normalizedState.lunchBreakMinutes),
      groupHomeAway: false,
      qualificationRule: normalizedState.qualification,
      finalPhase: normalizedState.tournamentPhaseType,
      placementMatches: normalizedState.placementMatches ? "Oui" : "Non",
      manualMatches: [],
      windowFits: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      status: hasScheduledMatch ? "published" : "finished",
      location: MANUAL_TOURNAMENT_DEFAULT_LOCATION,
      publishedAt: now.toISOString(),
      liveMatchId: null,
      matchStates,
    };

    return {
      id: tournamentId,
      source: "manual",
      tournament: nextTournament,
      groups,
      previewDataByDivision,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }, [
    displayedScheduledMatches,
    divisionEntries,
    divisionStates,
    effectiveActiveDivisionId,
    manageTournamentId,
    manualTournamentState,
    normalizedState.breakBetweenMatchesMinutes,
    normalizedState.categories,
    normalizedState.fieldCount,
    normalizedState.levels,
    normalizedState.lunchBreakMinutes,
    normalizedState.matchDurationMinutes,
    normalizedState.maxPlayersPerTeam,
    normalizedState.mealsPerTeam,
    normalizedState.mealItems,
    normalizedState.placementMatches,
    normalizedState.qualification,
    normalizedState.shareSettings,
    normalizedState.teamsCount,
    normalizedState.tournamentPhaseType,
    tournamentDate,
    tournamentDayEndTimes,
    tournamentDayStartTimes,
    tournamentName,
  ]);
  const activeShareSettings = useMemo(
    () => buildDefaultManualShareSettings(normalizedState.shareSettings),
    [normalizedState.shareSettings],
  );
  const shareTournamentId = manualTournamentProduct?.tournament.id || manageTournamentId || null;
  const shareOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const coachShareLink =
    shareOrigin && shareTournamentId && activeShareSettings.coachToken
      ? `${shareOrigin}/tournament/${shareTournamentId}/coach?token=${encodeURIComponent(activeShareSettings.coachToken)}`
      : null;
  const parentShareLink =
    shareOrigin && shareTournamentId && activeShareSettings.parentToken
      ? `${shareOrigin}/tournament/${shareTournamentId}/parent?token=${encodeURIComponent(activeShareSettings.parentToken)}`
      : null;
  const handleShareCopy = async (key: "coach" | "parent", link: string | null) => {
    if (!link || typeof navigator === "undefined" || !navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(link);
      setShareCopiedKey(key);
      window.setTimeout(() => {
        setShareCopiedKey((current) => (current === key ? null : current));
      }, 1600);
    } catch (error) {
      console.error("Erreur copie lien partage:", error);
    }
  };
  const generateManualTournament = async () => {
    if (!manualTournamentProduct || isGeneratingTournament) return;
    setIsGeneratingTournament(true);
    console.log("GENERATE SAVE START", manualTournamentProduct.tournament.id);

    if (classicTeamId) {
      const separator = returnTo.includes("?") ? "&" : "?";
      const targetReturnTo = returnTo.includes("tab=")
        ? returnTo
        : `${returnTo}${separator}tab=tournament`;
      try {
        saveManualTournamentToClassicStorage(
          classicTeamId,
          manualTournamentProduct.tournament,
        );
        await saveTournamentToSupabase({
          ...manualTournamentProduct.tournament,
          teamId: classicTeamId,
        });
        console.log("GENERATE SAVE DONE", manualTournamentProduct.tournament.id);
        router.push(targetReturnTo);
      } catch (error) {
        console.log("GENERATE SAVE ERROR", error);
        if (isAbortError(error)) {
          console.warn("Sauvegarde tournoi interrompue, fallback local conservé.");
          console.log("GENERATE SAVE DONE", manualTournamentProduct.tournament.id);
          router.push(targetReturnTo);
          return;
        }

        console.error("Erreur sauvegarde tournoi manuel Supabase:", error);
      } finally {
        setIsGeneratingTournament(false);
      }
      return;
    }

    try {
      upsertStoredManualTournamentProduct(manualTournamentProduct);
      await saveTournamentToSupabase(manualTournamentProduct.tournament);
      console.log("GENERATE SAVE DONE", manualTournamentProduct.tournament.id);
      router.push(`/tournament?returnTo=${encodeURIComponent(returnTo)}`);
    } catch (error) {
      console.log("GENERATE SAVE ERROR", error);
      if (isAbortError(error)) {
        console.warn("Sauvegarde tournoi interrompue, fallback local conservé.");
        console.log("GENERATE SAVE DONE", manualTournamentProduct.tournament.id);
        router.push(`/tournament?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }

      console.error("Erreur sauvegarde tournoi manuel Supabase:", error);
    } finally {
      setIsGeneratingTournament(false);
    }
  };

  useEffect(() => {
    if (!manualTournamentProduct || !manageTournamentId) return;

    const timeoutId = window.setTimeout(() => {
      if (classicTeamId) {
        saveManualTournamentToClassicStorage(classicTeamId, manualTournamentProduct.tournament);
      }

      void saveTournamentToSupabase({
        ...manualTournamentProduct.tournament,
        teamId: classicTeamId || undefined,
      }).catch((error) => {
        console.error("Erreur auto-save tournoi manuel Supabase:", error);
      });
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [classicTeamId, manageTournamentId, manualTournamentProduct]);
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

  useEffect(() => {
    if (activeControlTab !== "teams") return;
    if (selectedRosterTeam && !normalizedState.teamEntries.includes(selectedRosterTeam)) {
      setSelectedRosterTeam(null);
    }
  }, [activeControlTab, normalizedState.teamEntries, selectedRosterTeam]);

  useEffect(() => {
    if (activeControlTab !== "teams" || activeTeamsControlSubTab !== "players") return;
    const tournament = manualTournamentProduct?.tournament;
    if (!tournament || normalizedState.teamEntries.length === 0) return;

    const signature = [
      tournament.id,
      normalizedState.teamEntries.join("|"),
      tournament.teams.map((team) => `${team.id}:${team.name}`).join("|"),
    ].join("::");

    if (rosterPrefetchSignatureRef.current === signature) return;
    rosterPrefetchSignatureRef.current = signature;

    normalizedState.teamEntries.forEach((teamName) => {
      if (rosterSupabasePlayersByTeam[teamName] !== undefined) return;

      const tournamentTeam = tournament.teams.find((team) => team.name === teamName);
      if (!tournamentTeam) return;

      void loadTournamentPlayers(tournament.id, {
        id: tournamentTeam.id,
        name: tournamentTeam.name,
      })
        .then((players) => {
          setRosterSupabasePlayersByTeam((current) => ({
            ...current,
            [teamName]: players,
          }));

          if (players.length === 0) return;

          setManualTournamentState((current) => {
            if (!current.teamEntries.includes(teamName)) return current;

            return normalizeManualTournamentState({
              ...current,
              teamPlayersByTeam: {
                ...current.teamPlayersByTeam,
                [teamName]: players.map((player) => ({
                  lastName: player.lastName,
                  firstName: player.firstName,
                  license: player.license,
                  number: player.number,
                })),
              },
            });
          });
        })
        .catch((error) => {
          console.error("Erreur prechargement joueurs manuel:", error);
          setRosterSupabasePlayersByTeam((current) => ({
            ...current,
            [teamName]: current[teamName] ?? [],
          }));
        });
    });
  }, [
    activeControlTab,
    activeTeamsControlSubTab,
    manualTournamentProduct?.tournament,
    normalizedState.teamEntries,
    rosterSupabasePlayersByTeam,
  ]);

  useEffect(() => {
    if (requestedControlTab === "teams") {
      setActiveControlTab("teams");
      if (
        requestedTeamsSubTab === "count" ||
        requestedTeamsSubTab === "teams" ||
        requestedTeamsSubTab === "players"
      ) {
        setActiveTeamsControlSubTab(requestedTeamsSubTab);
      }
      if (requestedTeamsSubTab === "teams") {
        setShowAddTeamPanel(true);
      }
    }
  }, [requestedControlTab, requestedTeamsSubTab]);

  useEffect(() => {
    if (viewRosterTeam && !normalizedState.teamEntries.includes(viewRosterTeam)) {
      setViewRosterTeam(null);
    }
  }, [normalizedState.teamEntries, viewRosterTeam]);

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

  const openRosterTeam = (teamName: string) => {
    setSelectedRosterTeam(teamName);
    const tournament = manualTournamentProduct?.tournament;
    const tournamentTeam = tournament?.teams.find((team) => team.name === teamName);
    if (!tournament || !tournamentTeam) return;

    setLoadingRosterTeamName(teamName);
    void loadTournamentPlayers(tournament.id, {
      id: tournamentTeam.id,
      name: tournamentTeam.name,
    })
      .then((players) => {
        setRosterSupabasePlayersByTeam((current) => ({
          ...current,
          [teamName]: players,
        }));

        if (players.length === 0) return;

        setManualTournamentState((current) => {
          if (!current.teamEntries.includes(teamName)) return current;

          return normalizeManualTournamentState({
            ...current,
            teamPlayersByTeam: {
              ...current.teamPlayersByTeam,
              [teamName]: players.map((player) => ({
                lastName: player.lastName,
                firstName: player.firstName,
                license: player.license,
                number: player.number,
              })),
            },
          });
        });
      })
      .catch((error) => {
        console.error("Erreur chargement joueurs equipe manuel:", error);
        setRosterSupabasePlayersByTeam((current) => ({
          ...current,
          [teamName]: current[teamName] ?? [],
        }));
      })
      .finally(() => {
        setLoadingRosterTeamName((current) => (current === teamName ? null : current));
      });
  };
  const closeRosterTeam = () => setSelectedRosterTeam(null);
  const openRosterViewer = (teamName: string) => {
    setViewRosterTeam(teamName);
    setViewRosterDraft(null);
    setViewRosterSupabasePlayers([]);

    const tournament = manualTournamentProduct?.tournament;
    const tournamentTeam = tournament?.teams.find((team) => team.name === teamName);
    if (!tournament || !tournamentTeam) {
      setIsViewRosterSupabaseSource(false);
      return;
    }

    setIsViewRosterSupabaseSource(true);
    setIsViewRosterLoading(true);
    void loadTournamentPlayers(tournament.id, {
      id: tournamentTeam.id,
      name: tournamentTeam.name,
    })
      .then((players) => {
        console.log("MANUAL ADMIN RENDER PLAYERS", players);
        setViewRosterSupabasePlayers(players);
        setRosterSupabasePlayersByTeam((current) => ({
          ...current,
          [teamName]: players,
        }));
      })
      .catch((error) => {
        console.error("Erreur chargement joueurs manuel:", error);
        setViewRosterSupabasePlayers([]);
      })
      .finally(() => {
        setIsViewRosterLoading(false);
      });
  };
  const closeRosterViewer = () => {
    setViewRosterTeam(null);
    setViewRosterDraft(null);
    setViewRosterSupabasePlayers([]);
    setIsViewRosterLoading(false);
    setIsViewRosterSupabaseSource(false);
  };
  const findManualTournamentTeam = (teamName: string) => {
    const tournament = manualTournamentProduct?.tournament;
    const tournamentTeam = tournament?.teams.find((team) => team.name === teamName);
    if (!tournament || !tournamentTeam) return null;

    return {
      tournament,
      team: tournamentTeam,
    };
  };
  const hasFilledManualRosterPlayer = (player: TournamentProductTeamPlayer) =>
    player.lastName.trim() || player.firstName.trim() || player.license.trim();
  const getManualRosterSourcePlayers = (teamName: string) =>
    rosterSupabasePlayersByTeam[teamName] ??
    (viewRosterTeam === teamName ? viewRosterSupabasePlayers : undefined) ??
    normalizedState.teamPlayersByTeam[teamName] ??
    [];
  const getNextManualRosterIndex = (teamName: string) => {
    const sourcePlayers = getManualRosterSourcePlayers(teamName);
    const firstEmptyIndex = sourcePlayers.findIndex((player) => !hasFilledManualRosterPlayer(player));

    if (firstEmptyIndex >= 0) return firstEmptyIndex;
    if (sourcePlayers.length >= normalizedState.maxPlayersPerTeam) return -1;

    return sourcePlayers.length;
  };
  const setManualRosterPlayerAtIndex = (
    players: TournamentProductTeamPlayer[],
    playerIndex: number,
    player: TournamentProductTeamPlayer,
  ) => {
    const nextPlayers = Array.from(
      { length: Math.max(players.length, playerIndex + 1) },
      (_, index) => players[index] ?? createEmptyTeamPlayer(index),
    );
    nextPlayers[playerIndex] = player;
    return nextPlayers.slice(0, normalizedState.maxPlayersPerTeam);
  };
  const openViewerRosterDraft = (teamName: string) => {
    const nextPlayerIndex = getNextManualRosterIndex(teamName);
    if (nextPlayerIndex < 0) return;

    setViewRosterDraft({
      lastName: "",
      firstName: "",
      license: "",
      number: `${nextPlayerIndex + 1}`,
    });
  };
  const persistManualRosterPlayer = (
    teamName: string,
    playerIndex: number,
    player: TournamentProductTeamPlayer,
  ) => {
    const target = findManualTournamentTeam(teamName);
    if (!target) return;

    void saveTournamentToSupabase({
      ...target.tournament,
      teamId: classicTeamId || undefined,
    })
      .then(() =>
        hasFilledManualRosterPlayer(player)
          ? saveTournamentPlayer(target.tournament.id, target.team, playerIndex, player)
          : deleteTournamentPlayer(target.tournament.id, target.team, playerIndex),
      )
      .catch((error) => {
      console.error("Erreur sauvegarde joueur builder manuel:", error);
      });
  };
  const saveViewerRosterDraft = () => {
    if (!viewRosterTeam || !viewRosterDraft) return;

    const hasContent =
      viewRosterDraft.lastName.trim() ||
      viewRosterDraft.firstName.trim() ||
      viewRosterDraft.license.trim();

    if (!hasContent) {
      setViewRosterDraft(null);
      return;
    }

    const nextPlayerIndex = getNextManualRosterIndex(viewRosterTeam);
    if (nextPlayerIndex < 0) {
      setViewRosterDraft(null);
      return;
    }

    setManualTournamentState((current) => {
      const currentPlayers = current.teamPlayersByTeam[viewRosterTeam] ?? [];
      const nextPlayers = setManualRosterPlayerAtIndex(
        currentPlayers,
        nextPlayerIndex,
        viewRosterDraft,
      );

      return {
        ...current,
        teamPlayersByTeam: {
          ...current.teamPlayersByTeam,
          [viewRosterTeam]: nextPlayers,
        },
      };
    });
    setRosterSupabasePlayersByTeam((current) => {
      const currentPlayers = current[viewRosterTeam] ?? [];
      const nextPlayers = setManualRosterPlayerAtIndex(
        currentPlayers,
        nextPlayerIndex,
        viewRosterDraft,
      );

      return {
        ...current,
        [viewRosterTeam]: nextPlayers,
      };
    });
    setViewRosterSupabasePlayers((current) => {
      return setManualRosterPlayerAtIndex(current, nextPlayerIndex, viewRosterDraft);
    });
    persistManualRosterPlayer(viewRosterTeam, nextPlayerIndex, viewRosterDraft);
    setViewRosterDraft(null);
  };

  const addTeamEntry = (teamName: string) => {
    const normalized = teamName.trim();
    if (!normalized) return;

    setManualTournamentState((current) => {
      if (current.teamEntries.length >= current.teamsCount) {
        return normalizeManualTournamentState(current);
      }

      const nextTeamName = buildUniqueTeamName(normalized, current.teamEntries);

      return normalizeManualTournamentState({
        ...current,
        teamEntries: [...current.teamEntries, nextTeamName],
        validatedTeams: {
          ...current.validatedTeams,
          [nextTeamName]: Boolean(current.validatedTeams[nextTeamName]),
        },
        teamPlayersByTeam: {
          ...current.teamPlayersByTeam,
          [nextTeamName]: current.teamPlayersByTeam[nextTeamName] ?? [],
        },
      });
    });
  };

  const removeTeamEntry = (teamName: string) => {
    setManualTournamentState((current) => {
      const nextPlayersByTeam = { ...current.teamPlayersByTeam };
      const nextValidatedTeams = { ...current.validatedTeams };
      delete nextPlayersByTeam[teamName];
      delete nextValidatedTeams[teamName];

      return normalizeManualTournamentState({
        ...current,
        teamEntries: current.teamEntries.filter((entry) => entry !== teamName),
        validatedTeams: nextValidatedTeams,
        teamPlayersByTeam: nextPlayersByTeam,
      });
    });
    setEditingSlotTarget(null);
    setSelectedRosterTeam((current) => (current === teamName ? null : current));
  };

  const updateMaxPlayersPerTeam = (nextCount: number) => {
    setManualTournamentState((current) => {
      const safeCount = Math.max(1, nextCount);
      const nextPlayersByTeam = Object.fromEntries(
        Object.entries(current.teamPlayersByTeam).map(([teamName, players]) => [
          teamName,
          players.slice(0, safeCount),
        ]),
      );

      return {
        ...current,
        maxPlayersPerTeam: safeCount,
        teamPlayersByTeam: nextPlayersByTeam,
      };
    });
  };

  const toggleValidatedTeam = (teamName: string) => {
    setManualTournamentState((current) => ({
      ...current,
      validatedTeams: {
        ...current.validatedTeams,
        [teamName]: !current.validatedTeams[teamName],
      },
    }));
  };

  const updateTeamPlayerField = (
    teamName: string,
    playerIndex: number,
    field: "lastName" | "firstName" | "license" | "number",
    value: string,
  ) => {
    let playerToPersist: TournamentProductTeamPlayer | null = null;

    setManualTournamentState((current) => {
      const currentPlayers = current.teamPlayersByTeam[teamName] ?? [];
      const targetLength = Math.max(current.maxPlayersPerTeam, playerIndex + 1);
      const nextPlayers = Array.from({ length: targetLength }, (_, index) => {
        const existingPlayer = currentPlayers[index] ?? createEmptyTeamPlayer(index);
        return index === playerIndex ? { ...existingPlayer, [field]: value } : existingPlayer;
      });
      playerToPersist = nextPlayers[playerIndex] ?? null;

      return {
        ...current,
        teamPlayersByTeam: {
          ...current.teamPlayersByTeam,
          [teamName]: nextPlayers,
        },
      };
    });

    if (!playerToPersist) return;

    setRosterSupabasePlayersByTeam((current) => {
      const nextPlayers = [...(current[teamName] ?? [])];
      nextPlayers[playerIndex] = playerToPersist;

      return {
        ...current,
        [teamName]: nextPlayers,
      };
    });
    persistManualRosterPlayer(teamName, playerIndex, playerToPersist);
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
      const nextValidatedTeams = normalizeValidatedTeams(
        nextTeamEntries,
        normalizedCurrent.validatedTeams,
      );

      return normalizeManualTournamentState({
        ...normalizedCurrent,
        groupAssignments: nextAssignments,
        teamEntries: nextTeamEntries,
        validatedTeams: nextValidatedTeams,
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

      const nextPlayersByTeam = { ...normalizedCurrent.teamPlayersByTeam };
      const nextValidatedTeams = { ...normalizedCurrent.validatedTeams };
      if (removedTeam) {
        delete nextPlayersByTeam[removedTeam];
        delete nextValidatedTeams[removedTeam];
      }

      return normalizeManualTournamentState({
        ...normalizedCurrent,
        teamEntries: normalizedCurrent.teamEntries.filter((entry) => entry !== removedTeam),
        validatedTeams: nextValidatedTeams,
        teamPlayersByTeam: nextPlayersByTeam,
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
      const nextPlayersByTeam = Object.fromEntries(
        nextTeamEntries.map((team) => [
          team,
          normalizedCurrent.teamPlayersByTeam[team] ??
            (team === resolvedTeamName && targetCurrentValue
              ? (normalizedCurrent.teamPlayersByTeam[targetCurrentValue] ?? [])
              : []),
        ]),
      );
      const nextValidatedTeams = Object.fromEntries(
        nextTeamEntries.map((team) => [
          team,
          Boolean(
            normalizedCurrent.validatedTeams[team] ??
              (team === resolvedTeamName && targetCurrentValue
                ? normalizedCurrent.validatedTeams[targetCurrentValue]
                : false),
          ),
        ]),
      );

      return normalizeManualTournamentState({
        ...nextState,
        teamEntries: nextTeamEntries,
        validatedTeams: nextValidatedTeams,
        teamPlayersByTeam: nextPlayersByTeam,
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
    setManualTournamentState((current) =>
      normalizeManualTournamentState({
        ...current,
        teamsCount: Math.max(2, Math.round(parsed)),
      }),
    );
    closeFloatingPanels();
    setManualTeamCountDraft("");
  };

  const applyManualGroupCount = () => {
    const parsed = Number(manualGroupCountDraft);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    setManualTournamentState((current) =>
      normalizeManualTournamentState({
        ...current,
        groupsCount: Math.max(1, Math.round(parsed)),
      }),
    );
    closeFloatingPanels();
    setManualGroupCountDraft("");
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

  const updateDayStartTime = (dayIndex: number, value: string) => {
    setManualTournamentState((current) => {
      const safeDayCount = Math.max(1, current.dayCount);
      const nextDayStartTimes = normalizeDayTimeValues(
        current.dayStartTimes,
        safeDayCount,
        DEFAULT_DAY_START_TIME,
      );
      const nextDayEndTimes = normalizeDayTimeValues(
        current.dayEndTimes,
        safeDayCount,
        DEFAULT_DAY_END_TIME,
      );
      nextDayStartTimes[dayIndex] = value || nextDayStartTimes[dayIndex]!;
      const sanitized = sanitizeDayTimeRange(
        nextDayStartTimes[dayIndex]!,
        nextDayEndTimes[dayIndex]!,
      );

      nextDayStartTimes[dayIndex] = sanitized.startTime;
      nextDayEndTimes[dayIndex] = sanitized.endTime;

      return {
        ...current,
        dayStartTimes: nextDayStartTimes,
        dayEndTimes: nextDayEndTimes,
      };
    });
  };

  const updateDayEndTime = (dayIndex: number, value: string) => {
    setManualTournamentState((current) => {
      const safeDayCount = Math.max(1, current.dayCount);
      const nextDayStartTimes = normalizeDayTimeValues(
        current.dayStartTimes,
        safeDayCount,
        DEFAULT_DAY_START_TIME,
      );
      const nextDayEndTimes = normalizeDayTimeValues(
        current.dayEndTimes,
        safeDayCount,
        DEFAULT_DAY_END_TIME,
      );
      nextDayEndTimes[dayIndex] = value || nextDayEndTimes[dayIndex]!;
      const sanitized = sanitizeDayTimeRange(
        nextDayStartTimes[dayIndex]!,
        nextDayEndTimes[dayIndex]!,
      );

      nextDayStartTimes[dayIndex] = sanitized.startTime;
      nextDayEndTimes[dayIndex] = sanitized.endTime;

      return {
        ...current,
        dayStartTimes: nextDayStartTimes,
        dayEndTimes: nextDayEndTimes,
      };
    });
  };

  const updateRefereeCount = (nextCount: number) => {
    setManualTournamentState((current) => {
      const safeCount = Math.max(0, nextCount);
      const nextReferees = Array.from({ length: safeCount }, (_, index) => {
        const existingReferee = current.referees[index];
        return existingReferee ?? { id: buildEditorId("ref"), firstName: "", lastName: "" };
      });

      return {
        ...current,
        refereeCount: safeCount,
        referees: nextReferees,
      };
    });
  };

  const updateRefereeField = (
    refereeId: string,
    field: "firstName" | "lastName",
    value: string,
  ) => {
    setManualTournamentState((current) => ({
      ...current,
      referees: current.referees.map((referee) =>
        referee.id === refereeId ? { ...referee, [field]: value } : referee,
      ),
    }));
  };

  const updateCategoryGroupLevel = (category: string, groupIndex: number, level: string) => {
    const normalizedLevel = level.trim();
    if (!normalizedLevel) return;

    setManualTournamentState((current) => {
      const nextGroups = {
        ...current.levelGroupsByCategory,
        [category]: (current.levelGroupsByCategory[category] ?? []).map((group) => [...group]),
      };
      const currentGroups = nextGroups[category] ?? [];
      const groupLevelsAtIndex = currentGroups[groupIndex] ?? [];
      const levelExists = groupLevelsAtIndex.includes(normalizedLevel);

      nextGroups[category] = currentGroups.map((group, index) => {
        if (index !== groupIndex) {
          return normalizedLevel === "Tout niveau"
            ? group.filter((entry) => entry !== "Tout niveau")
            : group;
        }

        if (normalizedLevel === "Tout niveau") {
          return levelExists ? [] : ["Tout niveau"];
        }

        const withoutGlobalLevel = group
          .filter((entry) => entry !== normalizedLevel)
          .filter((entry) => entry !== "Tout niveau");

        return levelExists ? withoutGlobalLevel : [...withoutGlobalLevel, normalizedLevel];
      });

      return {
        ...current,
        levelGroupsByCategory: nextGroups,
      };
    });
  };

  const addCustomLevelToCategoryGroup = (category: string, groupIndex: number) => {
    const draftKey = `${category}-${groupIndex}`;
    const customLevel = customLevelDrafts[draftKey]?.trim() ?? "";
    if (!customLevel) return;

    updateCategoryGroupLevel(category, groupIndex, customLevel);
    setCustomLevelDrafts((current) => ({
      ...current,
      [draftKey]: "",
    }));
  };

  const updateMealsPerTeam = (nextCount: number) => {
    setManualTournamentState((current) => ({
      ...current,
      mealsPerTeam: Math.max(1, Math.min(12, Math.round(nextCount || 1))),
    }));
  };

  const addMealItem = () => {
    const mealId = buildEditorId("meal");
    setManualTournamentState((current) => ({
      ...current,
      mealItems: [
        ...current.mealItems,
        { id: mealId, label: "", price: "", link: "" },
      ],
    }));
    return mealId;
  };

  const updateMealItem = (
    mealId: string,
    field: "label" | "price" | "link",
    value: string,
  ) => {
    setManualTournamentState((current) => ({
      ...current,
      mealItems: current.mealItems.map((meal) =>
        meal.id === mealId ? { ...meal, [field]: value } : meal,
      ),
    }));
  };

  const removeMealItem = (mealId: string) => {
    setManualTournamentState((current) => ({
      ...current,
      mealItems: current.mealItems.filter((meal) => meal.id !== mealId),
    }));
  };
  const ensureFirstMealItemAndFocus = () => {
    if (normalizedState.mealItems.length > 0) return;

    const mealId = addMealItem();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const input = mealLabelInputRefs.current[mealId];
        if (!input) return;
        input.focus();
      });
    });
  };

  const updateFieldDivisionAssignment = (fieldIndex: number, divisionId: string) => {
    setManualTournamentState((current) => ({
      ...current,
      matchesViewMode: "alternated",
      matchesSharedFields: true,
      fieldDivisionAssignments: {
        ...(current.fieldDivisionAssignments ?? {}),
        [String(fieldIndex)]: divisionId,
      },
    }));
  };

  const applySequentialDivisionFieldAllocation = () => {
    setManualTournamentState((current) => ({
      ...current,
      matchesViewMode: "division",
      matchesSharedFields: false,
    }));
  };

  const applyAlternatedDivisionScheduling = () => {
    setManualTournamentState((current) => ({
      ...current,
      matchesViewMode: "alternated",
    }));
  };

  const downloadMealsSheetPdf = async () => {
    const exportMeals = mealSheetItems.length > 0 ? mealSheetItems : [{ id: "meal-export-empty", label: "Produit", price: "" }];
    const exportRows = mealSheetRows;
    const clubLogoUrl = `${window.location.origin}${ORGANIZER_CLUB_LOGO_SRC}`;
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    const exportNode = document.createElement("div");
    exportNode.style.position = "fixed";
    exportNode.style.left = "-10000px";
    exportNode.style.top = "0";
    exportNode.style.width = "1120px";
    exportNode.style.padding = "24px";
    exportNode.style.background = "#ffffff";
    exportNode.style.color = "#111111";
    exportNode.style.fontFamily = "Arial, Helvetica, sans-serif";

    const productHeaders = exportMeals
      .map(
        (meal) => `
          <th style="border-right:2px solid #111;border-bottom:2px solid #111;padding:10px 8px;font-size:12px;text-transform:uppercase;font-weight:700;text-align:center;">
            <div>${meal.label || "Produit"}</div>
            <div style="margin-top:4px;font-size:10px;font-weight:500;">${meal.price ? `(${meal.price} EUR)` : "(Prix)"}</div>
          </th>
        `,
      )
      .join("");

    const bodyRows = exportRows
      .map(
        () => `
          <tr>
            <td style="border-right:1px solid #111;border-bottom:1px solid #111;padding:14px 10px;height:42px;"></td>
            ${exportMeals
              .map(
                () => `
                  <td style="border-right:1px solid #111;border-bottom:1px solid #111;padding:14px 10px;height:42px;"></td>
                `,
              )
              .join("")}
            <td style="border-right:1px solid #111;border-bottom:1px solid #111;padding:14px 10px;height:42px;"></td>
            <td style="border-bottom:1px solid #111;padding:14px 10px;height:42px;"></td>
          </tr>
        `,
      )
      .join("");

    exportNode.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr auto;align-items:start;column-gap:16px;margin-bottom:12px;">
        <div style="min-width:0;">
          <div style="text-align:center;">
            <div style="font-size:28px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">FICHE REPAS</div>
            ${tournamentName ? `<div style="margin-top:4px;font-size:13px;">${tournamentName}</div>` : ""}
          </div>
          <div style="margin-top:10px;font-size:18px;font-weight:700;">CLUB : ______________________________</div>
          <div style="margin-top:4px;font-size:13px;">Categorie : ______________________________</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:center;width:86px;height:86px;border:1.5px solid #111;border-radius:18px;overflow:hidden;background:#fff;">
          <img src="${clubLogoUrl}" alt="Logo club" style="max-width:74px;max-height:74px;object-fit:contain;" />
        </div>
      </div>
      <div style="border:1.5px solid #111;border-radius:18px;overflow:hidden;">
        <table style="width:100%;border-collapse:separate;border-spacing:0;background:#fff;">
          <thead>
            <tr>
              <th style="width:200px;border-right:2px solid #111;border-bottom:2px solid #111;padding:10px 8px;font-size:12px;text-transform:uppercase;font-weight:700;text-align:left;">Joueur / Coach</th>
              ${productHeaders}
              <th style="width:95px;border-right:2px solid #111;border-bottom:2px solid #111;padding:10px 8px;font-size:12px;text-transform:uppercase;font-weight:700;text-align:center;">Total produit</th>
              <th style="width:105px;border-bottom:2px solid #111;padding:10px 8px;font-size:12px;text-transform:uppercase;font-weight:700;text-align:center;">Total euro</th>
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
            <tr>
              <td style="border-right:1px solid #111;padding:12px 10px;font-size:12px;font-weight:700;text-transform:uppercase;">Total</td>
              ${exportMeals
                .map(
                  () => `
                    <td style="border-right:1px solid #111;padding:12px 10px;height:42px;"></td>
                  `,
                )
                .join("")}
              <td style="border-right:1px solid #111;padding:12px 10px;height:42px;"></td>
              <td style="padding:12px 10px;height:42px;"></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    document.body.appendChild(exportNode);

    try {
      const canvas = await html2canvas(exportNode, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const orientation = canvas.width > canvas.height ? "landscape" : "portrait";
      const pdf = new jsPDF({
        orientation,
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;
      const imageRatio = canvas.width / canvas.height;
      let renderWidth = maxWidth;
      let renderHeight = renderWidth / imageRatio;

      if (renderHeight > maxHeight) {
        renderHeight = maxHeight;
        renderWidth = renderHeight * imageRatio;
      }

      const offsetX = (pageWidth - renderWidth) / 2;
      const offsetY = (pageHeight - renderHeight) / 2;

      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        offsetX,
        offsetY,
        renderWidth,
        renderHeight,
        undefined,
        "FAST",
      );

      const safeName = (tournamentName || activeDivisionEntry?.division.name || "fiche-repas-equipe")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      pdf.save(`${safeName || "fiche-repas-equipe"}.pdf`);
    } finally {
      document.body.removeChild(exportNode);
    }
  };

  const controlTabLabels: Record<ManualControlTab, string> = {
    teams: "Equipes",
    groups: "Groupes",
    qualification: "Qualif",
    bracket: "Bracket",
    general: "Info general",
    matches: "Matchs",
    share: "Partage",
  };
  const activeRosterPlayers =
    selectedRosterTeam && normalizedState.teamEntries.includes(selectedRosterTeam)
      ? Array.from(
          {
            length: Math.max(
              normalizedState.maxPlayersPerTeam,
              rosterSupabasePlayersByTeam[selectedRosterTeam]?.length ?? 0,
            ),
          },
          (_, index) => {
            const existingPlayer =
              rosterSupabasePlayersByTeam[selectedRosterTeam]?.[index] ??
              normalizedState.teamPlayersByTeam[selectedRosterTeam]?.[index];
            return existingPlayer ?? createEmptyTeamPlayer(index);
          },
        )
      : [];
  const viewedRosterPlayers =
    isViewRosterSupabaseSource
      ? viewRosterSupabasePlayers
      : viewRosterTeam && normalizedState.teamEntries.includes(viewRosterTeam)
      ? (normalizedState.teamPlayersByTeam[viewRosterTeam] ?? []).filter(
          (player) =>
            player.lastName.trim() ||
            player.firstName.trim() ||
            player.license.trim(),
        )
      : [];
  const hasMealItems = normalizedState.mealItems.some(
    (meal) => meal.label.trim() || meal.price.trim(),
  );
  const mealSheetItems = normalizedState.mealItems.filter(
    (meal) => meal.label.trim() || meal.price.trim(),
  );
  const mealSheetRows = Array.from(
    { length: Math.max(1, normalizedState.mealsPerTeam) },
    (_, index) => `meal-row-${index + 1}`,
  );
  const teamMealOrders = useMemo(() => {
    const submissions = activeShareSettings.coachMealSubmissions;
    const tournamentTeams = manualTournamentProduct?.tournament.teams ?? [];
    const maxCount = Math.max(1, normalizedState.mealsPerTeam);

    return normalizedState.teamEntries.map((teamName) => {
      const team = tournamentTeams.find((entry) => entry.name === teamName);
      const submission =
        (team ? submissions[team.id] : undefined) ??
        submissions[teamName] ??
        Object.values(submissions).find((entry) => entry.teamName === teamName) ??
        null;
      const filledCount = Math.min(getMealOrderFilledCount(submission), maxCount);
      const status = getMealOrderStatus(filledCount, maxCount);

      return {
        teamName,
        submission,
        filledCount,
        maxCount,
        status,
      };
    });
  }, [
    activeShareSettings.coachMealSubmissions,
    manualTournamentProduct?.tournament.teams,
    normalizedState.mealsPerTeam,
    normalizedState.teamEntries,
  ]);
  const selectedMealOrder = useMemo(
    () => teamMealOrders.find((order) => order.teamName === selectedMealOrderTeam) ?? null,
    [selectedMealOrderTeam, teamMealOrders],
  );
  const selectedMealOrderRows = useMemo(
    () =>
      (selectedMealOrder?.submission?.rows ?? []).filter(
        (row) =>
          row.participantLabel.trim() ||
          Object.values(row.quantities ?? {}).some((quantity) => quantity > 0),
      ),
    [selectedMealOrder],
  );
  const selectedMealOrderTotal = useMemo(
    () =>
      selectedMealOrderRows.reduce(
        (total, row) =>
          total +
          mealSheetItems.reduce((lineTotal, meal) => {
            const quantity = row.quantities?.[meal.id] ?? 0;
            const price = Number(meal.price || 0);
            return lineTotal + quantity * price;
          }, 0),
        0,
      ),
    [mealSheetItems, selectedMealOrderRows],
  );
  const controlPanelContent =
    activeControlTab === "teams" ? (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Equipes ajoutees</p>
            <p className="mt-1 text-sm text-slate-300">
              {normalizedState.teamEntries.length} / {normalizedState.teamsCount} equipes
            </p>
          </div>
          <div className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
            {activeDivisionEntry?.division.name ?? "Division"}
          </div>
        </div>

        <div className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-black/20 p-1">
          {[
            { key: "count" as const, label: "Nombre d'equipes" },
            { key: "teams" as const, label: "Equipes" },
            { key: "players" as const, label: "Liste joueurs" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTeamsControlSubTab(tab.key)}
              className={[
                "inline-flex h-9 items-center rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
                activeTeamsControlSubTab === tab.key
                  ? "bg-violet-500/20 text-violet-50 shadow-[0_0_18px_rgba(124,58,237,0.24)]"
                  : "text-slate-300 hover:bg-white/10 hover:text-white",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTeamsControlSubTab === "count" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {TEAM_COUNT_OPTIONS.map((option) => (
                <PillOption
                  key={option}
                  active={normalizedState.teamsCount === option}
                  onClick={() => {
                    setManualTournamentState((current) =>
                      normalizeManualTournamentState({
                        ...current,
                        teamsCount: option,
                      }),
                    );
                    closeFloatingPanels();
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
          </div>
        ) : null}

        {activeTeamsControlSubTab === "teams" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Ajout equipe</p>
                <p className="mt-1 text-sm text-slate-300">
                  {normalizedState.teamEntries.length} equipe(s) dans cette division
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

            {showAddTeamPanel ? (
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
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
              </div>
            ) : null}

            <div className="min-w-[260px] space-y-2 rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Liste des equipes</p>
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {normalizedState.teamEntries.length > 0 ? (
                  normalizedState.teamEntries.map((team) => (
                    <div
                      key={team}
                      className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/20 px-3 py-2"
                    >
                      <span className="text-sm text-white">{team}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openRosterViewer(team)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-violet-300/20 bg-violet-500/14 text-violet-100 transition hover:bg-violet-500/20 hover:text-white"
                          aria-label={`Voir les joueurs de ${team}`}
                          title={`Voir les joueurs de ${team}`}
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
                            <path d="M10 10.25a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                            <path d="M4.75 16.25a5.25 5.25 0 0 1 10.5 0" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleValidatedTeam(team)}
                          className="inline-flex items-center gap-2"
                          aria-pressed={normalizedState.validatedTeams[team]}
                        >
                          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                            {normalizedState.validatedTeams[team] ? "Inscription OK" : "Inscription en attente"}
                          </span>
                          <span
                            className={[
                              "relative inline-flex h-6 w-11 items-center rounded-full border transition",
                              normalizedState.validatedTeams[team]
                                ? "border-emerald-300/25 bg-emerald-500/25"
                                : "border-white/10 bg-white/10",
                            ].join(" ")}
                          >
                            <span
                              className={[
                                "inline-block h-4.5 w-4.5 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.28)] transition",
                                normalizedState.validatedTeams[team]
                                  ? "translate-x-[22px] bg-emerald-100"
                                  : "translate-x-[3px]",
                              ].join(" ")}
                            />
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTeamEntry(team)}
                          className="inline-flex h-7 w-7 items-center justify-center text-slate-300 transition hover:text-white"
                          aria-label={`Supprimer ${team}`}
                          title={`Supprimer ${team}`}
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            className="h-4 w-4"
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
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">Aucune equipe ajoutee.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {activeTeamsControlSubTab === "players" ? (
          <div className="space-y-3">
            <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Parametre joueurs</p>
                  <p className="mt-1 text-sm text-slate-300">
                    Nb max de joueurs par equipe
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateMaxPlayersPerTeam(normalizedState.maxPlayersPerTeam - 1)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    -
                  </button>
                  <div className="inline-flex h-8 min-w-10 items-center justify-center rounded-xl bg-[#171b2d] px-3 text-sm font-semibold text-white">
                    {normalizedState.maxPlayersPerTeam}
                  </div>
                  <button
                    type="button"
                    onClick={() => updateMaxPlayersPerTeam(normalizedState.maxPlayersPerTeam + 1)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-white/8 bg-black/20 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Liste des equipes</p>
              <div className="mt-3 space-y-2">
                {normalizedState.teamEntries.length > 0 ? (
                  normalizedState.teamEntries.map((team) => {
                    const playersForTeam =
                      rosterSupabasePlayersByTeam[team] ?? normalizedState.teamPlayersByTeam[team] ?? [];
                    const filledPlayers = countFilledPlayers(playersForTeam);
                    const isSelected = selectedRosterTeam === team;
                    const isLoadingRoster = loadingRosterTeamName === team;

                    return (
                      <div
                        key={team}
                        className={[
                          "rounded-[18px] border px-3 py-3 transition",
                          isSelected
                            ? "border-violet-300/20 bg-violet-500/10"
                            : "border-white/8 bg-white/[0.03]",
                        ].join(" ")}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => openRosterTeam(team)}
                            className="text-left"
                          >
                            <p className="text-sm font-semibold text-white">{team}</p>
                            <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                              {isLoadingRoster ? "Chargement..." : `${filledPlayers} joueurs`}
                            </p>
                          </button>

                          <div className="flex items-center gap-2">
                            <div className="rounded-full bg-[#171b2d] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                              {filledPlayers}/{normalizedState.maxPlayersPerTeam}
                            </div>
                            <button
                              type="button"
                              onClick={() => openRosterTeam(team)}
                              className="rounded-full border border-violet-300/20 bg-violet-500/14 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-100 transition hover:bg-violet-500/20 hover:text-white"
                            >
                              Joueurs
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[18px] bg-white/[0.03] px-3 py-3 text-sm text-slate-400">
                    Ajoute d’abord des equipes dans cette division.
                  </div>
                )}
              </div>
            </div>

            {selectedRosterTeam && normalizedState.teamEntries.includes(selectedRosterTeam)
              ? createPortal(
                  <div
                    className="fixed inset-0 z-[140] flex items-center justify-center bg-black/55 px-4"
                    onClick={closeRosterTeam}
                  >
                    <div
                      className="w-full max-w-4xl rounded-[26px] border border-white/10 bg-[#0b0f19] p-4 shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-white">{selectedRosterTeam}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                            Nom • Prenom • Licence • N° • max {normalizedState.maxPlayersPerTeam}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={closeRosterTeam}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
                          aria-label="Fermer la liste des joueurs"
                        >
                          ×
                        </button>
                      </div>

                      <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                        {loadingRosterTeamName === selectedRosterTeam ? (
                          <div className="rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-slate-400">
                            Chargement des joueurs...
                          </div>
                        ) : null}
                        {activeRosterPlayers.map((player, playerIndex) => (
                          <div
                            key={`${selectedRosterTeam}-player-${playerIndex + 1}`}
                            className="grid gap-2 rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-3 md:grid-cols-[1fr_1fr_1fr_80px]"
                          >
                            <input
                              value={player.lastName}
                              onChange={(event) =>
                                updateTeamPlayerField(
                                  selectedRosterTeam,
                                  playerIndex,
                                  "lastName",
                                  event.target.value,
                                )
                              }
                              placeholder="Nom"
                              className="h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                            />
                            <input
                              value={player.firstName}
                              onChange={(event) =>
                                updateTeamPlayerField(
                                  selectedRosterTeam,
                                  playerIndex,
                                  "firstName",
                                  event.target.value,
                                )
                              }
                              placeholder="Prenom"
                              className="h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                            />
                            <input
                              value={player.license}
                              onChange={(event) =>
                                updateTeamPlayerField(
                                  selectedRosterTeam,
                                  playerIndex,
                                  "license",
                                  event.target.value,
                                )
                              }
                              placeholder="Licence"
                              className="h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                            />
                            <input
                              value={player.number}
                              onChange={(event) =>
                                updateTeamPlayerField(
                                  selectedRosterTeam,
                                  playerIndex,
                                  "number",
                                  event.target.value,
                                )
                              }
                              placeholder="N°"
                              className="h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>,
                  document.body,
                )
              : null}
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
                setManualTournamentState((current) =>
                  normalizeManualTournamentState({
                    ...current,
                    groupsCount: option,
                  }),
                );
                closeFloatingPanels();
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
      <div className="space-y-4">
        <div className="rounded-[20px] border border-violet-300/16 bg-violet-500/8 px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Qualifies retenus</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-violet-300/24 bg-violet-500/14 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-100">
              {previewData.qualificationLabel}
            </span>
            {(previewData.qualificationEntries ?? []).map((entry) => (
              <span
                key={`qualification-entry-${entry}`}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white"
              >
                {entry}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Reglage manuel</p>
          <div className="flex flex-wrap gap-2">
            {availableQualifications.map((option) => (
              <PillOption
                key={option.key}
                active={effectiveQualificationPreviewKey === option.key}
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
        </div>
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
    ) : activeControlTab === "matches" ? (
      <div className="space-y-4">
        <div className="relative space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowMatchesSettingsPanel((current) => !current);
                  setShowFriendlyMatchesPanel(false);
                }}
                className="inline-flex h-10 items-center gap-2 rounded-[18px] border border-white/8 bg-[#121626] px-3 text-sm font-medium text-white transition hover:bg-[#171c30]"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 6h12M4 10h12M4 14h12" />
                </svg>
                Parametres matchs
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowFriendlyMatchesPanel((current) => !current);
                  setShowMatchesSettingsPanel(false);
                }}
                className="inline-flex h-10 items-center gap-2 rounded-[18px] border border-white/8 bg-[#151a2c] px-3 text-sm font-medium text-white transition hover:bg-[#1a2036]"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="h-5 w-5 text-violet-300"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="10" cy="10" r="6.75" />
                  <path d="m10 5.4 2 1.5-.7 2.4H8.7L8 6.9 10 5.4Z" />
                  <path d="m8 9.3-2.4.3-1.1 2.1L6 13.8l2-.9" />
                  <path d="m12 9.3 2.4.3 1.1 2.1-1.5 2.1-2-.9" />
                  <path d="m8 12.9.7 2.3h2.6l.7-2.3" />
                  <path d="M5.6 9.6 4.4 8M14.4 9.6 15.6 8M8.9 6.9 7.8 5.2M11.1 6.9l1.1-1.7" />
                </svg>
                Match amical
              </button>
            </div>

            {divisionDefinitions.length > 1 ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-black/20 p-1">
                  <button
                    type="button"
                    onClick={applySequentialDivisionFieldAllocation}
                    className={[
                      "inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold uppercase tracking-[0.14em] transition",
                      normalizedState.matchesViewMode === "division"
                        ? "bg-violet-500/20 text-violet-50 shadow-[0_0_18px_rgba(124,58,237,0.24)]"
                        : "text-slate-300 hover:bg-white/10 hover:text-white",
                    ].join(" ")}
                  >
                    📂 Par division
                  </button>
                  <button
                    type="button"
                    onClick={applyAlternatedDivisionScheduling}
                    className={[
                      "inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold uppercase tracking-[0.14em] transition",
                      normalizedState.matchesViewMode === "alternated"
                        ? "bg-violet-500/20 text-violet-50 shadow-[0_0_18px_rgba(124,58,237,0.24)]"
                        : "text-slate-300 hover:bg-white/10 hover:text-white",
                    ].join(" ")}
                  >
                    🔀 Alterne
                  </button>
                </div>

                {normalizedState.matchesViewMode === "alternated" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setManualTournamentState((current) => ({
                          ...current,
                          matchesViewMode: "alternated",
                          matchesSharedFields: true,
                        }));
                        setShowFieldDistributionModal(true);
                      }}
                      className={[
                        "inline-flex h-9 items-center gap-2 rounded-full border border-white/8 px-3 text-xs font-semibold uppercase tracking-[0.14em] transition",
                        normalizedState.matchesSharedFields
                          ? "bg-white/10 text-white"
                          : "bg-black/20 text-slate-300 hover:bg-white/10 hover:text-white",
                      ].join(" ")}
                    >
                      Repartition terrain
                    </button>
                  </div>
                ) : null}

                {normalizedState.matchesViewMode === "alternated" &&
                normalizedState.matchesSharedFields ? (
                  <div className="rounded-full border border-white/8 bg-black/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                    {divisionDefinitions
                      .map(
                        (division) =>
                          `${division.name} ${effectiveAssignedFieldIndexesByDivision[division.id]?.length ?? 0}T`,
                      )
                      .join(" · ")}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {Array.from({ length: tournamentDayCount }, (_, dayIndex) => (
              <button
                key={`matches-day-time-${dayIndex + 1}`}
                type="button"
                onClick={() =>
                  document
                    .getElementById(`manual-matches-day-${dayIndex}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                className="inline-flex h-9 items-center gap-2 rounded-full border border-white/8 bg-black/20 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <span className="text-white">Jour {dayIndex + 1}</span>
                <span className="text-slate-500">
                  {tournamentDayStartTimes[dayIndex] ?? DEFAULT_DAY_START_TIME}
                  {" - "}
                  {tournamentDayEndTimes[dayIndex] ?? DEFAULT_DAY_END_TIME}
                </span>
              </button>
            ))}
          </div>

          {showMatchesSettingsPanel ? (
            <div className="rounded-[22px] border border-white/8 bg-[#0f1320] p-3 shadow-[0_18px_40px_rgba(0,0,0,0.32)]">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[18px] bg-[#151a2b] px-3 py-3 shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Duree match
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={normalizedState.matchDurationMinutes}
                      onChange={(event) =>
                        setManualTournamentState((current) => ({
                          ...current,
                          matchDurationMinutes: Math.max(1, Number(event.target.value) || 1),
                        }))
                      }
                      className="h-10 w-20 rounded-2xl bg-[#0b0f19] px-3 text-center text-sm font-semibold text-white outline-none"
                    />
                    <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                      min
                    </span>
                  </div>
                </div>

                <div className="rounded-[18px] bg-[#151a2b] px-3 py-3 shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Pause entre matchs
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={normalizedState.breakBetweenMatchesMinutes}
                      onChange={(event) =>
                        setManualTournamentState((current) => ({
                          ...current,
                          breakBetweenMatchesMinutes: Math.max(0, Number(event.target.value) || 0),
                        }))
                      }
                      className="h-10 w-20 rounded-2xl bg-[#0b0f19] px-3 text-center text-sm font-semibold text-white outline-none"
                    />
                    <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                      min
                    </span>
                  </div>
                </div>

                <div className="rounded-[18px] bg-[#151a2b] px-3 py-3 shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Pause repas
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={normalizedState.lunchBreakMinutes}
                      onChange={(event) =>
                        setManualTournamentState((current) => ({
                          ...current,
                          lunchBreakMinutes: Math.max(0, Number(event.target.value) || 0),
                        }))
                      }
                      className="h-10 w-20 rounded-2xl bg-[#0b0f19] px-3 text-center text-sm font-semibold text-white outline-none"
                    />
                    <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                      min
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {Array.from({ length: tournamentDayCount }, (_, dayIndex) => (
                  <div
                    key={`match-settings-day-${dayIndex + 1}`}
                    className="rounded-[18px] bg-[#151a2b] px-3 py-3 shadow-[0_12px_24px_rgba(0,0,0,0.22)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          Jour {dayIndex + 1}
                        </p>
                        {tournamentDate ? (
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">
                            {formatScheduleDayLabel(tournamentDate || null, dayIndex)}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                          Heure debut
                        </p>
                        <ManualTimeStepperField
                          value={tournamentDayStartTimes[dayIndex] ?? DEFAULT_DAY_START_TIME}
                          onChange={(value) => updateDayStartTime(dayIndex, value)}
                          fallbackValue={DEFAULT_DAY_START_TIME}
                          emptyByDefault
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                          Heure fin
                        </p>
                        <ManualTimeStepperField
                          value={tournamentDayEndTimes[dayIndex] ?? DEFAULT_DAY_END_TIME}
                          onChange={(value) => updateDayEndTime(dayIndex, value)}
                          fallbackValue={DEFAULT_DAY_END_TIME}
                          emptyByDefault
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {showFriendlyMatchesPanel ? (
            <div className="rounded-[22px] border border-white/8 bg-[#0f1320] p-3 shadow-[0_18px_40px_rgba(0,0,0,0.32)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Creneaux libres
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    Match amical possible quand un terrain reste libre.
                  </p>
                </div>
                <span className="rounded-full bg-violet-500/14 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100">
                  {availableFriendlySlots.length} dispo
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {availableFriendlySlots.length > 0 ? (
                  availableFriendlySlots.map((slot) => (
                    <div
                      key={slot.key}
                      className="rounded-[18px] border border-white/[0.04] bg-[#151a2b] px-3 py-3 shadow-[0_12px_24px_rgba(0,0,0,0.22)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {slot.dayLabel}
                            {slot.dateLabel ? ` • ${slot.dateLabel}` : ""}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">
                            {slot.startTime} - {slot.endTime}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {slot.occupiedMatches.map((match) => (
                          <div
                            key={`${slot.key}-${match.fieldLabel}`}
                            className="rounded-[16px] border border-white/[0.04] bg-[#0f1320] px-3 py-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                {match.fieldLabel}
                              </span>
                              <span className="rounded-full bg-slate-700/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                                Pris
                              </span>
                            </div>
                            <p className="mt-2 text-sm font-semibold text-white">{match.label}</p>
                          </div>
                        ))}

                        {slot.freeFields.map((field) => {
                          const draftKey = `${slot.key}-${field.fieldLabel}`;
                          const draft = friendlyMatchDrafts[draftKey] ?? {
                            homeTeam: "",
                            awayTeam: "",
                            fieldLabel: field.fieldLabel,
                          };
                          const isOpen = activeFriendlySlotKey === draftKey;

                          return (
                            <div
                              key={draftKey}
                              className="rounded-[16px] border border-white/[0.04] bg-[#0f1320] px-3 py-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                  {field.fieldLabel}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActiveFriendlySlotKey((current) =>
                                      current === draftKey ? null : draftKey,
                                    )
                                  }
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/16 text-emerald-200 transition hover:bg-emerald-500/24"
                                  aria-label={`Ajouter un match amical sur ${field.fieldLabel}`}
                                >
                                  +
                                </button>
                              </div>
                              <p className="mt-2 text-sm font-semibold text-emerald-100">
                                Libre
                              </p>

                              {isOpen ? (
                                <div className="mt-3 space-y-2">
                                  <select
                                    value={draft.homeTeam}
                                    onChange={(event) =>
                                      setFriendlyMatchDrafts((current) => ({
                                        ...current,
                                        [draftKey]: {
                                          ...draft,
                                          homeTeam: event.target.value,
                                        },
                                      }))
                                    }
                                    className="h-10 w-full rounded-2xl border border-white/[0.04] bg-[#181d31] px-3 text-sm text-white outline-none"
                                  >
                                    <option value="">Equipe 1</option>
                                    {tournamentTeamOptions.map((team) => (
                                      <option key={`${draftKey}-${team}-home`} value={team}>
                                        {team}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={draft.awayTeam}
                                    onChange={(event) =>
                                      setFriendlyMatchDrafts((current) => ({
                                        ...current,
                                        [draftKey]: {
                                          ...draft,
                                          awayTeam: event.target.value,
                                        },
                                      }))
                                    }
                                    className="h-10 w-full rounded-2xl border border-white/[0.04] bg-[#181d31] px-3 text-sm text-white outline-none"
                                  >
                                    <option value="">Equipe 2</option>
                                    {tournamentTeamOptions.map((team) => (
                                      <option key={`${draftKey}-${team}-away`} value={team}>
                                        {team}
                                      </option>
                                    ))}
                                  </select>
                                  <p className="text-xs text-slate-400">
                                    {draft.homeTeam && draft.awayTeam
                                      ? `${draft.homeTeam} vs ${draft.awayTeam}`
                                      : "Choisis deux equipes du tournoi"}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[18px] bg-[#151a2b] px-3 py-3 text-sm text-slate-300 shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
                    Aucun terrain libre pour ajouter un match amical.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {showFieldDistributionModal && divisionDefinitions.length > 1 ? (
            <div
              className="absolute inset-0 z-20 flex items-start justify-center rounded-[24px] bg-[#05070f]/88 px-4 py-6 backdrop-blur-sm"
              onClick={() => setShowFieldDistributionModal(false)}
            >
              <div
                className="w-full max-w-xl rounded-[24px] border border-white/10 bg-[#0f1320] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.4)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">Repartition terrain</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                      Choisis quelle division joue sur chaque terrain
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFieldDistributionModal(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
                    aria-label="Fermer la repartition terrain"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {Array.from({ length: Math.max(1, normalizedState.fieldCount) }, (_, index) => {
                    const fieldIndex = index + 1;
                    const assignedDivisionId =
                      effectiveFieldDivisionAssignments[String(fieldIndex)] ?? divisionDefinitions[0]?.id ?? "";

                    return (
                      <div
                        key={`field-distribution-${fieldIndex}`}
                        className="flex items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3"
                      >
                        <p className="text-sm font-semibold text-white">{`Terrain ${fieldIndex}`}</p>
                        <select
                          value={assignedDivisionId}
                          onChange={(event) => updateFieldDivisionAssignment(fieldIndex, event.target.value)}
                          className="h-10 min-w-[180px] rounded-2xl border border-white/10 bg-[#171b2d] px-3 text-sm text-white outline-none"
                        >
                          {divisionDefinitions.map((division) => (
                            <option key={`field-division-option-${fieldIndex}-${division.id}`} value={division.id}>
                              {division.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <DndContext
          sensors={dragSensors}
          collisionDetection={pointerWithin}
          onDragStart={handleScheduledMatchDragStart}
          onDragOver={handleScheduledMatchDragOver}
          onDragEnd={handleScheduledMatchDragEnd}
          onDragCancel={() => {
            setActiveDraggedScheduledMatchId(null);
            setActiveOverScheduledMatchId(null);
          }}
          autoScroll={false}
        >
          <SortableContext
            items={effectiveScheduledMatchOrderIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {scheduledMatchesByDay.length > 0 ? (
                scheduledMatchesByDay.map((dayGroup) => (
                  <section
                    key={`${dayGroup.dayLabel}-${dayGroup.dateLabel ?? "none"}`}
                    id={`manual-matches-day-${dayGroup.dayIndex}`}
                    className="rounded-[22px] border border-white/8 bg-black/20 p-3"
                  >
                    {(() => {
                      const dayKey = `${dayGroup.dayLabel}-${dayGroup.dateLabel ?? "none"}`;
                      const daySections = buildScheduledMatchSections(dayKey, dayGroup.matches);

                      return (
                        <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{dayGroup.dayLabel}</p>
                        <p className="mt-1 text-sm text-white">
                          {dayGroup.dateLabel ?? "Sans date"} • {dayGroup.matches.length} matchs
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-3">
                      {daySections.map((section) => {
                        const isCollapsed = collapsedMatchSectionKeys[section.key] === true;

                        return (
                          <div
                            key={section.key}
                            className="overflow-hidden rounded-[18px] border border-white/[0.05] bg-white/[0.02]"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setCollapsedMatchSectionKeys((current) => ({
                                  ...current,
                                  [section.key]: !isCollapsed,
                                }))
                              }
                              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-white/[0.03]"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/78">
                                  {section.label}
                                </span>
                                <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                  {section.matches.length}
                                </span>
                              </div>
                              <span
                                className={[
                                  "text-xs text-slate-400 transition",
                                  isCollapsed ? "" : "rotate-90",
                                ].join(" ")}
                              >
                                ›
                              </span>
                            </button>

                            {!isCollapsed ? (
                              <div className="space-y-2 px-2 pb-2">
                                {section.matches.map((match) => (
                                  <ScheduledMatchCard
                                    key={match.id}
                                    match={match}
                                    insertionPosition={
                                      activeDraggedScheduledMatchId &&
                                      activeOverScheduledMatchId === match.originalMatchId &&
                                      activeDraggedScheduledMatchId !== match.originalMatchId
                                        ? (() => {
                                            const draggedIndex = effectiveScheduledMatchOrderIds.indexOf(
                                              activeDraggedScheduledMatchId,
                                            );
                                            const overIndex = effectiveScheduledMatchOrderIds.indexOf(
                                              match.originalMatchId,
                                            );
                                            if (draggedIndex === -1 || overIndex === -1) return null;
                                            return draggedIndex < overIndex ? "after" : "before";
                                          })()
                                        : null
                                    }
                                  />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                        </>
                      );
                    })()}
                  </section>
                ))
              ) : (
                <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-slate-400">
                  Aucun match a planifier pour l’instant.
                </div>
              )}
            </div>
          </SortableContext>

          {typeof document !== "undefined"
            ? createPortal(
                <DragOverlay>
                  {activeDraggedScheduledMatch ? (
                    <div className="pointer-events-none w-[min(100%,720px)]">
                      <ScheduledMatchCard match={activeDraggedScheduledMatch} dragging />
                    </div>
                  ) : null}
                </DragOverlay>,
                document.body,
              )
            : null}
        </DndContext>
      </div>
    ) : activeControlTab === "share" ? (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Publication</p>
                <p className="mt-1 text-sm text-slate-300">
                  {activeShareSettings.tournamentPublished ? "Tournoi publie" : "Tournoi non publie"}
                </p>
              </div>
              <button
                type="button"
                aria-pressed={activeShareSettings.tournamentPublished}
                onClick={() =>
                  updateManualShareSettings((current) => ({
                    ...current,
                    tournamentPublished: !current.tournamentPublished,
                  }))
                }
                className={[
                  "relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border transition",
                  activeShareSettings.tournamentPublished
                    ? "border-emerald-300/25 bg-emerald-500/20"
                    : "border-white/10 bg-white/10",
                ].join(" ")}
              >
                <span
                  className={[
                    "inline-block h-6 w-6 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.28)] transition",
                    activeShareSettings.tournamentPublished ? "translate-x-[34px]" : "translate-x-[2px]",
                  ].join(" ")}
                />
              </button>
            </div>
          </div>

          <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Votes fin de match</p>
                <p className="mt-1 text-sm text-slate-300">
                  {activeShareSettings.votesEnabled ? "Votes actifs" : "Votes inactifs"}
                </p>
              </div>
              <button
                type="button"
                aria-pressed={activeShareSettings.votesEnabled}
                onClick={() =>
                  updateManualShareSettings((current) => ({
                    ...current,
                    votesEnabled: !current.votesEnabled,
                  }))
                }
                className={[
                  "relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border transition",
                  activeShareSettings.votesEnabled
                    ? "border-emerald-300/25 bg-emerald-500/20"
                    : "border-white/10 bg-white/10",
                ].join(" ")}
              >
                <span
                  className={[
                    "inline-block h-6 w-6 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.28)] transition",
                    activeShareSettings.votesEnabled ? "translate-x-[34px]" : "translate-x-[2px]",
                  ].join(" ")}
                />
              </button>
            </div>
          </div>
        </div>

        {!shareTournamentId ? (
          <div className="rounded-[22px] border border-amber-300/15 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Genere d’abord le tournoi pour activer les liens publics coach et parent.
          </div>
        ) : null}

        {[
          {
            key: "coach" as const,
            title: "Coach",
            summary: "Acces equipe + repas + vue tournoi",
            enabled: activeShareSettings.coachAccessEnabled,
            link: coachShareLink,
            token: activeShareSettings.coachToken,
          },
          {
            key: "parent" as const,
            title: "Parent",
            summary: activeShareSettings.votesEnabled ? "Vue tournoi + vote" : "Vue tournoi uniquement",
            enabled: activeShareSettings.parentAccessEnabled,
            link: parentShareLink,
            token: activeShareSettings.parentToken,
          },
        ].map((card) => (
          <article
            key={`manual-share-${card.key}`}
            className="rounded-[22px] border border-white/8 bg-black/20 p-4"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-white">{card.title}</p>
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                      card.enabled
                        ? "border border-emerald-300/20 bg-emerald-500/15 text-emerald-100"
                        : "border border-white/10 bg-white/5 text-slate-400",
                    ].join(" ")}
                  >
                    {card.enabled ? "Actif" : "Inactif"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-300">{card.summary}</p>
                <p className="mt-2 break-all text-xs text-slate-500">
                  {card.link ?? "Lien disponible apres generation du tournoi"}
                </p>
              </div>

              <div className="flex w-full flex-col items-stretch gap-3 md:w-auto md:min-w-[178px]">
                <button
                  type="button"
                  onClick={() =>
                    updateManualShareSettings((current) => ({
                      ...current,
                      ...(card.key === "coach"
                        ? { coachAccessEnabled: !current.coachAccessEnabled }
                        : { parentAccessEnabled: !current.parentAccessEnabled }),
                    }))
                  }
                  className={[
                    "rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
                    card.enabled
                      ? "border border-emerald-300/20 bg-emerald-500/15 text-emerald-100"
                      : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                >
                  {card.enabled ? "Desactiver acces" : "Activer acces"}
                </button>
                <button
                  type="button"
                  onClick={() => handleShareCopy(card.key, card.link)}
                  disabled={!card.link}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {shareCopiedKey === card.key ? "Lien copie" : "Copier lien"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateManualShareSettings((current) => ({
                      ...current,
                      ...(card.key === "coach"
                        ? { coachToken: buildManualTournamentId() }
                        : { parentToken: buildManualTournamentId() }),
                    }))
                  }
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  Regenerer token
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="grid gap-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <p>Fiches equipe : {Object.values(activeShareSettings.coachTeamSubmissions).filter((entry) => entry.teamName).length}</p>
                <p>Fiches repas : {Object.values(activeShareSettings.coachMealSubmissions).filter((entry) => entry.rows.some((row) => row.participantLabel.trim() || Object.values(row.quantities ?? {}).some((quantity) => quantity > 0))).length}</p>
                <p>Token : <span className="normal-case tracking-normal text-slate-400">{card.token ?? "—"}</span></p>
              </div>
              {card.link ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=144x144&data=${encodeURIComponent(card.link)}`}
                  alt={`QR code ${card.title}`}
                  className="h-28 w-28 rounded-[20px] border border-white/10 bg-white p-2"
                />
              ) : null}
            </div>
          </article>
        ))}
      </div>
    ) : activeControlTab === "general" ? (
      <div className="space-y-4">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-white/8 bg-black/20 p-1">
          {[
            { key: "general" as const, label: "General" },
            { key: "planning" as const, label: "Planning" },
            { key: "categories" as const, label: "Categorie" },
            { key: "referees" as const, label: "Arbitrage" },
            { key: "meals" as const, label: "Repas" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveGeneralControlSubTab(tab.key)}
              className={[
                "inline-flex h-9 items-center rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
                activeGeneralControlSubTab === tab.key
                  ? "bg-violet-500/20 text-violet-50 shadow-[0_0_18px_rgba(124,58,237,0.24)]"
                  : "text-slate-300 hover:bg-white/10 hover:text-white",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeGeneralControlSubTab === "general" ? (
          <div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]">
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
                className="h-9 w-full max-w-[260px] rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
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
          </div>
        ) : null}

        {activeGeneralControlSubTab === "planning" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Date</p>
              <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-white/8 bg-black/20 px-3 py-3">
                <div
                  ref={datePickerPanelRef}
                  className="relative inline-flex overflow-visible items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-slate-200"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                    Jour du tournoi
                  </span>
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
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Jour</span>
                  {DAY_COUNT_OPTIONS.map((option) => (
                    <PillOption
                      key={`day-count-${option}`}
                      active={tournamentDayCount === option}
                      onClick={() =>
                        setManualTournamentState((current) => ({
                          ...current,
                          dayCount: option,
                        }))
                      }
                    >
                      {option}
                    </PillOption>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-[20px] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-3 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Duree match</p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={normalizedState.matchDurationMinutes}
                    onChange={(event) =>
                      setManualTournamentState((current) => ({
                        ...current,
                        matchDurationMinutes: Math.max(1, Number(event.target.value) || 1),
                      }))
                    }
                    className="h-10 w-20 rounded-2xl bg-[#171b2d] px-3 text-center text-sm font-semibold text-white outline-none"
                  />
                  <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">min</span>
                </div>
              </div>

              <div className="rounded-[20px] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-3 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Pause entre matchs</p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={normalizedState.breakBetweenMatchesMinutes}
                    onChange={(event) =>
                      setManualTournamentState((current) => ({
                        ...current,
                        breakBetweenMatchesMinutes: Math.max(0, Number(event.target.value) || 0),
                      }))
                    }
                    className="h-10 w-20 rounded-2xl bg-[#171b2d] px-3 text-center text-sm font-semibold text-white outline-none"
                  />
                  <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">min</span>
                </div>
              </div>

              <div className="rounded-[20px] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-3 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Pause repas</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={normalizedState.lunchBreakMinutes}
                    onChange={(event) =>
                      setManualTournamentState((current) => ({
                        ...current,
                        lunchBreakMinutes: Math.max(0, Number(event.target.value) || 0),
                      }))
                    }
                    className="h-10 w-20 rounded-2xl bg-[#171b2d] px-3 text-center text-sm font-semibold text-white outline-none"
                  />
                  <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">min</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Horaires du tournoi</p>
              <div className="space-y-2 rounded-[18px] border border-white/8 bg-black/20 px-3 py-3">
                {Array.from({ length: tournamentDayCount }, (_, dayIndex) => (
                  <div
                    key={`day-schedule-${dayIndex + 1}`}
                    className="grid gap-3 rounded-[16px] border border-white/8 bg-white/[0.04] px-3 py-3 md:grid-cols-[140px_1fr_1fr]"
                  >
                    <div className="flex flex-col justify-center">
                      <span className="text-xs uppercase tracking-[0.16em] text-slate-300">
                        Jour {dayIndex + 1}
                      </span>
                      {tournamentDate ? (
                        <span className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                          {formatScheduleDayLabel(tournamentDate || null, dayIndex)}
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Heure debut</p>
                      <ManualTimeStepperField
                        value={tournamentDayStartTimes[dayIndex] ?? DEFAULT_DAY_START_TIME}
                        onChange={(value) => updateDayStartTime(dayIndex, value)}
                        fallbackValue={DEFAULT_DAY_START_TIME}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Heure fin</p>
                      <ManualTimeStepperField
                        value={tournamentDayEndTimes[dayIndex] ?? DEFAULT_DAY_END_TIME}
                        onChange={(value) => updateDayEndTime(dayIndex, value)}
                        fallbackValue={DEFAULT_DAY_END_TIME}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {activeGeneralControlSubTab === "categories" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Categories</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_OPTIONS.map((category) => (
                  <PillOption
                    key={category}
                    active={normalizedState.categories.includes(category)}
                    onClick={() =>
                      setManualTournamentState((current) => {
                        const nextCategories = current.categories.includes(category)
                          ? current.categories.filter((entry) => entry !== category)
                          : [...current.categories, category];
                        const safeCategories = nextCategories.length > 0 ? nextCategories : [category];
                        const nextGroups = { ...current.levelGroupsByCategory };

                        if (!nextGroups[category]) {
                          nextGroups[category] = [[]];
                        }

                        Object.keys(nextGroups).forEach((key) => {
                          if (!safeCategories.includes(key)) {
                            delete nextGroups[key];
                          }
                        });

                        return {
                          ...current,
                          categories: safeCategories,
                          levelGroupsByCategory: nextGroups,
                        };
                      })
                    }
                  >
                    {category}
                  </PillOption>
                ))}
              </div>
            </div>

            {normalizedState.categories.length > 1 ? (
              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Organisation</p>
                <div className="flex flex-wrap gap-2">
                  <PillOption
                    active={normalizedState.categoryOrganization === "separate"}
                    onClick={() =>
                      setManualTournamentState((current) => ({
                        ...current,
                        categoryOrganization: "separate",
                      }))
                    }
                  >
                    Separe
                  </PillOption>
                  <PillOption
                    active={normalizedState.categoryOrganization === "alternated"}
                    onClick={() =>
                      setManualTournamentState((current) => ({
                        ...current,
                        categoryOrganization: "alternated",
                      }))
                    }
                  >
                    Alterne
                  </PillOption>
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              {normalizedState.categories.map((category) => {
                const levelGroups = normalizedState.levelGroupsByCategory[category] ?? [[]];
                const availableLevels = Array.from(
                  new Set([
                    ...LEVEL_OPTIONS,
                    ...levelGroups.flatMap((group) => group.map((level) => level.trim()).filter(Boolean)),
                  ]),
                );

                return (
                  <div
                    key={category}
                    className="rounded-[20px] border border-white/8 bg-black/20 px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{category}</p>
                      <button
                        type="button"
                        onClick={() =>
                          setManualTournamentState((current) => ({
                            ...current,
                            levelGroupsByCategory: {
                              ...current.levelGroupsByCategory,
                              [category]: [
                                ...(current.levelGroupsByCategory[category] ?? [[]]),
                                [],
                              ],
                            },
                          }))
                        }
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
                      >
                        + Ajouter groupe
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {levelGroups.map((groupLevels, groupIndex) => (
                        <div
                          key={`${category}-group-${groupIndex + 1}`}
                          className="rounded-[18px] border border-white/[0.06] bg-white/[0.03] px-3 py-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              Groupe {groupIndex + 1}
                            </p>
                            {levelGroups.length > 1 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setManualTournamentState((current) => ({
                                    ...current,
                                    levelGroupsByCategory: {
                                      ...current.levelGroupsByCategory,
                                      [category]: (current.levelGroupsByCategory[category] ?? []).filter(
                                        (_, index) => index !== groupIndex,
                                      ),
                                    },
                                  }))
                                }
                                className="text-xs text-slate-500 transition hover:text-white"
                                aria-label={`Supprimer le groupe ${groupIndex + 1}`}
                              >
                                ×
                              </button>
                            ) : null}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            {availableLevels.map((level) => (
                              <PillOption
                                key={`${category}-${groupIndex}-${level}`}
                                active={groupLevels.includes(level)}
                                onClick={() => updateCategoryGroupLevel(category, groupIndex, level)}
                              >
                                {level}
                              </PillOption>
                            ))}
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <input
                              value={customLevelDrafts[`${category}-${groupIndex}`] ?? ""}
                              onChange={(event) =>
                                setCustomLevelDrafts((current) => ({
                                  ...current,
                                  [`${category}-${groupIndex}`]: event.target.value,
                                }))
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  addCustomLevelToCategoryGroup(category, groupIndex);
                                }
                              }}
                              placeholder="Niveau libre : D1, Elite..."
                              className="h-10 min-w-[180px] flex-1 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                            />
                            <button
                              type="button"
                              onClick={() => addCustomLevelToCategoryGroup(category, groupIndex)}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
                            >
                              Ajouter niveau
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {activeGeneralControlSubTab === "referees" ? (
          <div className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-[20px] border border-white/8 bg-black/20 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Nb d&apos;arbitres</p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateRefereeCount(normalizedState.refereeCount - 1)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    -
                  </button>
                  <div className="inline-flex h-9 min-w-10 items-center justify-center rounded-xl bg-[#171b2d] px-3 text-sm font-semibold text-white">
                    {normalizedState.refereeCount}
                  </div>
                  <button
                    type="button"
                    onClick={() => updateRefereeCount(normalizedState.refereeCount + 1)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="rounded-[20px] border border-white/8 bg-black/20 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Gestion heure terrain</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <PillOption
                    active={normalizedState.refereeAssignmentMode === "auto"}
                    onClick={() =>
                      setManualTournamentState((current) => ({
                        ...current,
                        refereeAssignmentMode: "auto",
                      }))
                    }
                  >
                    Auto
                  </PillOption>
                  <PillOption
                    active={normalizedState.refereeAssignmentMode === "manual"}
                    onClick={() =>
                      setManualTournamentState((current) => ({
                        ...current,
                        refereeAssignmentMode: "manual",
                      }))
                    }
                  >
                    Manuel
                  </PillOption>
                </div>
              </div>
            </div>

            <div className="rounded-[20px] border border-white/8 bg-black/20 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Infos arbitres</p>
              <div className="mt-3 space-y-2">
                {normalizedState.referees.length > 0 ? (
                  normalizedState.referees.map((referee, index) => (
                    <div
                      key={referee.id}
                      className="grid gap-2 rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-3 md:grid-cols-[90px_1fr_1fr]"
                    >
                      <div className="flex items-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Arbitre {index + 1}
                      </div>
                      <input
                        value={referee.lastName}
                        onChange={(event) =>
                          updateRefereeField(referee.id, "lastName", event.target.value)
                        }
                        placeholder="Nom"
                        className="h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                      />
                      <input
                        value={referee.firstName}
                        onChange={(event) =>
                          updateRefereeField(referee.id, "firstName", event.target.value)
                        }
                        placeholder="Prenom"
                        className="h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                      />
                    </div>
                  ))
                ) : (
                  <div className="rounded-[16px] bg-white/[0.03] px-3 py-3 text-sm text-slate-400">
                    Aucun arbitre configure.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {activeGeneralControlSubTab === "meals" ? (
          <div className="space-y-3">
            <div className="rounded-[20px] border border-white/8 bg-black/20 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <p className="text-sm text-slate-300">Nombre repas equipe :</p>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={normalizedState.mealsPerTeam}
                    onChange={(event) => updateMealsPerTeam(Number(event.target.value))}
                    className="h-10 w-16 rounded-2xl border border-white/10 bg-white/[0.04] px-2 text-center text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                  />
                </div>

                {hasMealItems ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMealsSheet(true);
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-slate-200 transition hover:bg-white/[0.08] hover:text-white"
                    aria-label="Ouvrir la fiche repas"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M7 3.75h7.5L19.25 8.5V20a.75.75 0 0 1-.75.75H7A2.25 2.25 0 0 1 4.75 18.5V6A2.25 2.25 0 0 1 7 3.75Z" />
                      <path d="M14 3.75V8.5h4.75" />
                      <path d="M8 12h8" />
                      <path d="M8 15.5h8" />
                    </svg>
                  </button>
                ) : null}
              </div>

              <p className="mt-4 text-sm text-slate-300">Ajoute tes produit :</p>

              <div className="mt-3 space-y-2">
                {(normalizedState.mealItems.length > 0 ? normalizedState.mealItems : [{ id: "meal-empty", label: "", price: "", link: "" }]).map((meal, index, array) => {
                  const isRealItem = meal.id !== "meal-empty";

                  return (
                    <div
                      key={meal.id}
                      className="flex items-center gap-2"
                    >
                      <input
                        ref={(node) => {
                          if (!isRealItem) return;
                          mealLabelInputRefs.current[meal.id] = node;
                        }}
                        value={isRealItem ? meal.label : ""}
                        onFocus={() => {
                          if (!isRealItem) {
                            ensureFirstMealItemAndFocus();
                          }
                        }}
                        onChange={(event) => {
                          if (!isRealItem) {
                            ensureFirstMealItemAndFocus();
                            return;
                          }
                          updateMealItem(meal.id, "label", event.target.value);
                        }}
                        placeholder={index % 2 === 0 ? "Frite, sandwich, merguez..." : "Boisson..."}
                        className="h-10 min-w-0 max-w-[280px] flex-[1_1_240px] rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                      />
                      <input
                        value={isRealItem ? meal.price : ""}
                        onChange={(event) => {
                          if (!isRealItem) return;
                          updateMealItem(meal.id, "price", event.target.value);
                        }}
                        placeholder="Prix"
                        className="h-10 w-14 shrink-0 rounded-[14px] border border-white/10 bg-white/[0.04] px-1 text-center text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                      />
                      <div className="flex shrink-0 items-center gap-2">
                        {isRealItem ? (
                          <>
                            <button
                              type="button"
                              onClick={addMealItem}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-500/14 text-base font-semibold text-violet-100 transition hover:bg-violet-500/20 hover:text-white"
                              aria-label="Ajouter une ligne produit"
                            >
                              +
                            </button>
                            {array.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => removeMealItem(meal.id)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
                                aria-label={`Supprimer le produit ${index + 1}`}
                              >
                                ×
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={addMealItem}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-500/14 text-base font-semibold text-violet-100 transition hover:bg-violet-500/20 hover:text-white"
                            aria-label="Ajouter une ligne produit"
                          >
                            +
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[20px] border border-white/8 bg-black/20 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Commandes repas equipes</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Statut calcule automatiquement selon les repas remplis.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                  Max {Math.max(1, normalizedState.mealsPerTeam)}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {teamMealOrders.length > 0 ? (
                  teamMealOrders.map((order) => {
                    const statusView = mealOrderStatusView[order.status];

                    return (
                      <button
                        key={`meal-order-${order.teamName}`}
                        type="button"
                        onClick={() => setSelectedMealOrderTeam(order.teamName)}
                        className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border border-white/8 bg-white/[0.035] px-3 py-3 text-left transition hover:border-violet-300/20 hover:bg-white/[0.06]"
                      >
                        <div className="min-w-0 space-y-1.5">
                          <p className="truncate text-[15px] font-semibold text-white">
                            {order.teamName || "Equipe sans nom"}
                          </p>
                          <span className="inline-flex rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-slate-200">
                            Repas : {order.filledCount}/{order.maxCount}
                          </span>
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
                  <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.025] px-4 py-4 text-sm text-slate-400">
                    Ajoute des equipes pour suivre les commandes repas.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#070a14] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[rgba(7,10,20,0.82)] backdrop-blur-2xl">
        <div className="relative mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-3 px-4 py-2 md:px-6">
          <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => router.push(returnTo)}
              className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <span>←</span>
              Retour
            </button>

            <button
              type="button"
              onClick={() => {
                setManualTournamentState(DEFAULT_STATE);
                const defaultDivisionId = buildDivisionDefinitions(DEFAULT_STATE)[0]?.id ?? "default-division";
                setDivisionStates({ [defaultDivisionId]: createDefaultDivisionState() });
                setActiveDivisionId(defaultDivisionId);
                setSelectedGroupId(null);
                setManualTeamNameDraft("");
                setSlotManualTeamNameDraft("");
                setShowAddTeamPanel(false);
                setManualTeamCountDraft("");
                setManualGroupCountDraft("");
                setManualFieldCountDraft("");
                setEditingSlotTarget(null);
                setMovingSlotTarget(null);
                setPinnedSeedCode(null);
              }}
              className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              Reset
            </button>

            <button
              type="button"
              onClick={() => setActiveControlTab("matches")}
              className={[
                "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                activeControlTab === "matches"
                  ? "bg-violet-500/20 text-violet-50 shadow-[0_0_18px_rgba(124,58,237,0.24)]"
                  : "text-slate-300 hover:bg-white/10 hover:text-white",
              ].join(" ")}
            >
              Matchs
            </button>

            <button
              type="button"
              onClick={() => setActiveControlTab("share")}
              className={[
                "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                activeControlTab === "share"
                  ? "bg-violet-500/20 text-violet-50 shadow-[0_0_18px_rgba(124,58,237,0.24)]"
                  : "text-slate-300 hover:bg-white/10 hover:text-white",
              ].join(" ")}
            >
              Partage
            </button>

            <button
              type="button"
              onClick={() => setActiveControlTab("general")}
              className={[
                "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                activeControlTab === "general"
                  ? "bg-violet-500/20 text-violet-50 shadow-[0_0_18px_rgba(124,58,237,0.24)]"
                  : "text-slate-300 hover:bg-white/10 hover:text-white",
              ].join(" ")}
            >
              Info general
            </button>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-2 text-center">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Nom du tournoi
            </span>
            {tournamentName ? (
              <span className="truncate text-sm font-semibold text-white">{tournamentName}</span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={generateManualTournament}
            disabled={!manualTournamentProduct || isGeneratingTournament}
            className={[
              "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
              manualTournamentProduct && !isGeneratingTournament
                ? "border border-fuchsia-300/30 bg-violet-600 text-white shadow-[0_0_24px_rgba(124,58,237,0.32)] hover:bg-violet-500"
                : "cursor-not-allowed border border-white/8 bg-white/5 text-slate-500",
            ].join(" ")}
          >
            {isGeneratingTournament ? "Sauvegarde..." : "Generer le tournoi"}
          </button>

          <span className="ml-auto rounded-full bg-violet-500/14 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100">
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

      {activeControlTab ? (
        <div
          className="fixed inset-0 z-30 bg-black/45 backdrop-blur-[2px]"
          onClick={() => {
            if (ignoreNextActiveControlTabCloseRef.current) {
              ignoreNextActiveControlTabCloseRef.current = false;
              return;
            }
            setActiveControlTab(null);
          }}
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
                    {activeControlTab ? controlTabLabels[activeControlTab] : ""}
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
        <aside className="-mt-2 h-fit rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.08),transparent_52%),rgba(255,255,255,0.03)] px-5 pb-5 pt-4 shadow-[0_20px_50px_rgba(0,0,0,0.28)] backdrop-blur-2xl xl:-mt-2 xl:sticky xl:top-[72px] xl:flex xl:h-[calc(100vh-92px)] xl:flex-col xl:overflow-hidden">
          <div className="space-y-3 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:space-y-0">
            <section className="space-y-3 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
              <div className="flex min-h-[72px] items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Poules
                  </p>
                  <p className="mt-1 text-sm text-transparent select-none">.</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="rounded-full border border-white/[0.06] bg-black/20 p-1 shadow-[0_14px_30px_rgba(0,0,0,0.18)]">
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          shuffleGroupAssignments();
                        }}
                        className={[
                          "flex flex-col items-center justify-center gap-0.5 rounded-full px-2.5 py-2 text-center transition duration-200 hover:scale-[1.02] active:scale-[0.98]",
                          shuffleFeedbackActive
                            ? "bg-violet-500/20 text-violet-50 shadow-[0_0_18px_rgba(124,58,237,0.24)]"
                            : "bg-white/[0.03] text-slate-200 hover:bg-white/[0.06] active:bg-white/[0.08]",
                        ].join(" ")}
                        aria-label="Tirage au sort des poules"
                      >
                        <span className="text-[16px] leading-none">🎲</span>
                        <span className="text-[7px] font-semibold uppercase tracking-[0.14em] text-white/35">
                          Tirage
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveControlTab("teams")}
                        className={[
                          "flex flex-col items-center justify-center gap-0.5 rounded-full px-2.5 py-2 text-center transition duration-200 hover:scale-[1.02] active:scale-[0.98]",
                          activeControlTab === "teams"
                            ? "border border-violet-300/18 bg-violet-500/20 text-violet-50 shadow-[0_0_18px_rgba(124,58,237,0.24)]"
                            : "bg-white/[0.03] text-slate-200 hover:bg-white/[0.06] active:bg-white/[0.08]",
                        ].join(" ")}
                        aria-label="Ouvrir les equipes"
                      >
                        <span className="text-[16px] leading-none">👥</span>
                        <span className="text-[7px] font-semibold uppercase tracking-[0.14em] text-white/35">
                          Equipes
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveControlTab("groups")}
                        className={[
                          "flex flex-col items-center justify-center gap-0.5 rounded-full px-2.5 py-2 text-center transition duration-200 hover:scale-[1.02] active:scale-[0.98]",
                          activeControlTab === "groups"
                            ? "border border-violet-300/18 bg-violet-500/20 text-violet-50 shadow-[0_0_18px_rgba(124,58,237,0.24)]"
                            : "bg-white/[0.03] text-slate-200 hover:bg-white/[0.06] active:bg-white/[0.08]",
                        ].join(" ")}
                        aria-label="Ouvrir les groupes"
                      >
                        <span className="text-[18px] leading-none">◫</span>
                        <span className="text-[7px] font-semibold uppercase tracking-[0.14em] text-white/35">
                          Groupes
                        </span>
                      </button>
                    </div>
                  </div>
                  <span className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-transparent">
                    spacer
                  </span>
                </div>
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
                                    "line-clamp-2 min-w-0 flex-1 text-left leading-5 transition duration-200",
                                    isPlaceholder
                                      ? "text-white/38 group-hover:text-white/72"
                                      : "text-inherit",
                                  ].join(" ")}
                                >
                                  {isPlaceholder ? "+ Ajouter equipe" : displayedTeam}
                                </span>
                                {!isPlaceholder && !isMovingSelected ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openRosterViewer(displayedTeam);
                                    }}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                                    aria-label={`Voir les joueurs de ${displayedTeam}`}
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
                                      <path d="M10 10.4a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                                      <path d="M4.8 15.8a5.6 5.6 0 0 1 10.4 0" />
                                    </svg>
                                  </button>
                                ) : null}
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
            {divisionDefinitions.length > 1 ? (
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-2">
                <div className="flex flex-wrap gap-2">
                  {divisionDefinitions.map((division) => (
                    <button
                      key={division.id}
                      type="button"
                      onClick={() => setActiveDivisionId(division.id)}
                      className={[
                        "rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
                        effectiveActiveDivisionId === division.id
                          ? "border border-violet-300/30 bg-violet-500/18 text-white shadow-[0_0_18px_rgba(124,58,237,0.24)]"
                          : "border border-white/10 bg-black/20 text-slate-300 hover:bg-white/10 hover:text-white",
                      ].join(" ")}
                    >
                      {division.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <TournamentPreview
              data={previewData}
              focusedGroupId={effectiveSelectedGroupId}
              onGroupSelect={setSelectedGroupId}
              showGroups={false}
              showHeader={false}
              highlightedSeed={effectiveHighlightedSeed}
              onQualificationClick={() => setActiveControlTab("qualification")}
              onBracketClick={() => setActiveControlTab("bracket")}
              qualificationActive={activeControlTab === "qualification"}
              bracketActive={activeControlTab === "bracket"}
            />
          </div>
        </main>
      </div>

      {viewRosterTeam && normalizedState.teamEntries.includes(viewRosterTeam)
        ? createPortal(
            <div
              className="fixed inset-0 z-[145] flex items-center justify-center bg-black/55 px-4"
              onClick={closeRosterViewer}
            >
              <div
                className="w-full max-w-3xl rounded-[26px] border border-white/10 bg-[#0b0f19] p-4 shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{viewRosterTeam}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                      Liste des joueurs
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openViewerRosterDraft(viewRosterTeam)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-300/20 bg-violet-500/14 text-base font-semibold text-violet-100 transition hover:bg-violet-500/20 hover:text-white"
                      aria-label={`Ajouter une carte joueur pour ${viewRosterTeam}`}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={closeRosterViewer}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
                      aria-label="Fermer la liste des joueurs"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="mt-4 max-h-[70vh] overflow-y-auto pr-1">
                  {viewRosterDraft ? (
                    <div className="mb-3 rounded-[18px] border border-violet-300/20 bg-violet-500/[0.06] p-3">
                      <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_80px]">
                        <input
                          value={viewRosterDraft.lastName}
                          onChange={(event) =>
                            setViewRosterDraft((current) =>
                              current ? { ...current, lastName: event.target.value } : current,
                            )
                          }
                          placeholder="Nom"
                          className="h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                        />
                        <input
                          value={viewRosterDraft.firstName}
                          onChange={(event) =>
                            setViewRosterDraft((current) =>
                              current ? { ...current, firstName: event.target.value } : current,
                            )
                          }
                          placeholder="Prenom"
                          className="h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                        />
                        <input
                          value={viewRosterDraft.license}
                          onChange={(event) =>
                            setViewRosterDraft((current) =>
                              current ? { ...current, license: event.target.value } : current,
                            )
                          }
                          placeholder="Licence"
                          className="h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                        />
                        <input
                          value={viewRosterDraft.number}
                          onChange={(event) =>
                            setViewRosterDraft((current) =>
                              current ? { ...current, number: event.target.value } : current,
                            )
                          }
                          placeholder="N°"
                          className="h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                        />
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setViewRosterDraft(null)}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={saveViewerRosterDraft}
                          className="rounded-full border border-violet-300/20 bg-violet-500/14 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-100 transition hover:bg-violet-500/20 hover:text-white"
                        >
                          Ajouter
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {isViewRosterLoading ? (
                    <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-slate-400">
                      Chargement...
                    </div>
                  ) : viewedRosterPlayers.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {viewedRosterPlayers.map((player, playerIndex) => (
                        <div
                          key={`${viewRosterTeam}-viewer-${playerIndex + 1}`}
                          className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-white">
                              {[player.firstName, player.lastName].filter(Boolean).join(" ").trim() ||
                                "Joueur"}
                            </p>
                            <span className="rounded-full bg-[#171b2d] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                              N° {player.number || "-"}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-2xl bg-black/20 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Prenom</p>
                              <p className="mt-1 text-sm text-white">{player.firstName || "-"}</p>
                            </div>
                            <div className="rounded-2xl bg-black/20 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Nom</p>
                              <p className="mt-1 text-sm text-white">{player.lastName || "-"}</p>
                            </div>
                            <div className="rounded-2xl bg-black/20 px-3 py-2 sm:col-span-2">
                              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Licence</p>
                              <p className="mt-1 text-sm text-white">{player.license || "-"}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-slate-400">
                      Aucun joueur renseigne pour cette equipe.
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {selectedMealOrder
        ? createPortal(
            <div
              className={[
                "fixed inset-0 z-[170] flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm",
                showMealsSheet ? "pointer-events-none" : "",
              ].join(" ")}
              onClick={() => {
                if (ignoreNextMealOrderCloseRef.current) {
                  ignoreNextMealOrderCloseRef.current = false;
                  return;
                }
                setSelectedMealOrderTeam(null);
              }}
            >
              <div
                className="w-full max-w-5xl rounded-[28px] border border-white/10 bg-[#0b0f19] p-5 text-white shadow-[0_30px_90px_rgba(0,0,0,0.58)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-white">{selectedMealOrder.teamName}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                      Fiche repas equipe
                    </p>
                    <p className="mt-2 text-sm text-slate-300">
                      Repas : {selectedMealOrder.filledCount}/{selectedMealOrder.maxCount}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={[
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
                        mealOrderStatusView[selectedMealOrder.status].className,
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "h-1.5 w-1.5 rounded-full",
                          mealOrderStatusView[selectedMealOrder.status].dotClassName,
                        ].join(" ")}
                      />
                      {mealOrderStatusView[selectedMealOrder.status].label}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedMealOrderTeam(null)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                      aria-label="Fermer la fiche repas equipe"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="mt-5 overflow-x-auto">
                  {selectedMealOrderRows.length > 0 ? (
                    <table className="min-w-[760px] w-full border-separate border-spacing-0 overflow-hidden rounded-[22px] border border-white/10 text-sm">
                      <thead>
                        <tr className="bg-white/[0.04] text-left text-[11px] uppercase tracking-[0.14em] text-white/45">
                          <th className="border-b border-white/10 px-3 py-3">Identite</th>
                          {mealSheetItems.map((meal) => (
                            <th
                              key={`admin-meal-head-${meal.id}`}
                              className="border-b border-white/10 px-3 py-3 text-center"
                            >
                              {meal.label}
                            </th>
                          ))}
                          <th className="border-b border-white/10 px-3 py-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedMealOrderRows.map((row) => {
                          const rowTotal = mealSheetItems.reduce((total, meal) => {
                            const quantity = row.quantities?.[meal.id] ?? 0;
                            const price = Number(meal.price || 0);
                            return total + quantity * price;
                          }, 0);

                          return (
                            <tr key={`admin-meal-row-${row.id}`} className="[&_td]:border-b [&_td]:border-white/[0.06]">
                              <td className="px-3 py-3 font-medium text-white">
                                {row.participantLabel || "Sans nom"}
                              </td>
                              {mealSheetItems.map((meal) => (
                                <td
                                  key={`admin-meal-cell-${row.id}-${meal.id}`}
                                  className="px-3 py-3 text-center text-slate-200"
                                >
                                  {row.quantities?.[meal.id] ?? 0}
                                </td>
                              ))}
                              <td className="px-3 py-3 text-right font-semibold text-white">
                                {rowTotal.toFixed(2)} €
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-white/[0.035] text-sm font-semibold text-white">
                          <td className="px-3 py-3">Total</td>
                          {mealSheetItems.map((meal) => (
                            <td key={`admin-meal-total-${meal.id}`} className="px-3 py-3 text-center">
                              {selectedMealOrderRows.reduce(
                                (total, row) => total + (row.quantities?.[meal.id] ?? 0),
                                0,
                              )}
                            </td>
                          ))}
                          <td className="px-3 py-3 text-right">{selectedMealOrderTotal.toFixed(2)} €</td>
                        </tr>
                      </tfoot>
                    </table>
                  ) : (
                    <div className="rounded-[22px] border border-white/10 bg-white/[0.035] px-4 py-5 text-sm text-slate-400">
                      Aucune ligne repas remplie pour cette equipe.
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {showMealsSheet
        ? createPortal(
            <div
              className="fixed inset-0 z-[180] overflow-y-auto bg-black/70 px-4 py-8"
              onClick={() => {
                ignoreNextMealOrderCloseRef.current = true;
                ignoreNextActiveControlTabCloseRef.current = true;
                setShowMealsSheet(false);
                window.setTimeout(() => {
                  ignoreNextMealOrderCloseRef.current = false;
                  ignoreNextActiveControlTabCloseRef.current = false;
                }, 0);
              }}
            >
              <div
                className="mx-auto w-full max-w-5xl rounded-[26px] border border-black/10 bg-white p-5 text-slate-900 shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Fiche repas equipe</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                      Apercu avant impression
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                      {normalizedState.mealsPerTeam} repas prevus par equipe
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void downloadMealsSheetPdf();
                      }}
                      className="inline-flex rounded-full border border-black/10 bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700 transition hover:bg-slate-200 hover:text-slate-900"
                    >
                      Telecharger PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        ignoreNextMealOrderCloseRef.current = true;
                        ignoreNextActiveControlTabCloseRef.current = true;
                        setShowMealsSheet(false);
                        window.setTimeout(() => {
                          ignoreNextMealOrderCloseRef.current = false;
                          ignoreNextActiveControlTabCloseRef.current = false;
                        }, 0);
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-slate-100 text-sm text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
                      aria-label="Fermer la fiche repas"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div
                  ref={mealSheetPreviewRef}
                  data-meal-sheet-preview="true"
                  className="mt-4 rounded-[20px] bg-white text-black"
                >
                  <div className="mb-3 grid grid-cols-[1fr_auto] items-start gap-4">
                    <div className="min-w-0">
                      <div className="text-center">
                        <p className="text-[28px] font-bold uppercase tracking-[0.06em]">FICHE REPAS</p>
                        {tournamentName ? <p className="mt-1 text-sm">{tournamentName}</p> : null}
                      </div>
                      <p className="mt-2 text-xl font-bold">CLUB : ______________________________</p>
                      <p className="mt-1 text-sm">Categorie : ______________________________</p>
                    </div>
                    <div className="flex h-[86px] w-[86px] items-center justify-center overflow-hidden rounded-[18px] border-[1.5px] border-black bg-white">
                      <Image
                        src={ORGANIZER_CLUB_LOGO_SRC}
                        alt="Logo Puget FC"
                        width={74}
                        height={74}
                        className="max-h-[74px] max-w-[74px] object-contain"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <div className="overflow-hidden rounded-[18px] border-[1.5px] border-black">
                      <table className="w-full border-separate border-spacing-0 bg-white text-black">
                        <thead>
                          <tr>
                            <th className="border-b-2 border-r-2 border-black px-2 py-2 text-left text-[12px] font-bold uppercase">
                              Joueur / Coach
                            </th>
                            {(mealSheetItems.length > 0 ? mealSheetItems : [{ id: "meal-preview-empty", label: "Produit", price: "" }]).map((meal) => (
                              <th
                                key={`meal-preview-head-${meal.id}`}
                                className="border-b-2 border-r-2 border-black px-2 py-2 text-center text-[12px] font-bold uppercase"
                              >
                                <div>{meal.label || "Produit"}</div>
                                <div className="mt-1 text-[10px] font-medium normal-case">
                                  {meal.price ? `(${meal.price} EUR)` : "(Prix)"}
                                </div>
                              </th>
                            ))}
                            <th className="border-b-2 border-r-2 border-black px-2 py-2 text-center text-[12px] font-bold uppercase">
                              Total produit
                            </th>
                            <th className="border-b-2 border-black px-2 py-2 text-center text-[12px] font-bold uppercase">
                              Total euro
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {mealSheetRows.map((rowKey) => (
                            <tr key={`meal-preview-row-${rowKey}`}>
                              <td className="h-[42px] border-b border-r border-black px-2 py-2" />
                              {(mealSheetItems.length > 0 ? mealSheetItems : [{ id: "meal-preview-empty-row", label: "Produit", price: "" }]).map((meal) => (
                                <td
                                  key={`meal-preview-cell-${rowKey}-${meal.id}`}
                                  className="h-[42px] border-b border-r border-black px-2 py-2"
                                />
                              ))}
                              <td className="h-[42px] border-b border-r border-black px-2 py-2" />
                              <td className="h-[42px] border-b border-black px-2 py-2" />
                            </tr>
                          ))}
                          <tr>
                            <td className="h-[42px] border-r border-black px-2 py-2 text-[12px] font-bold uppercase">
                              Total
                            </td>
                            {(mealSheetItems.length > 0 ? mealSheetItems : [{ id: "meal-preview-empty-total", label: "Produit", price: "" }]).map((meal) => (
                              <td
                                key={`meal-preview-total-${meal.id}`}
                                className="h-[42px] border-r border-black px-2 py-2"
                              />
                            ))}
                            <td className="h-[42px] border-r border-black px-2 py-2" />
                            <td className="h-[42px] px-2 py-2" />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

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
