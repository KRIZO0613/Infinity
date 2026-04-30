"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  searchExternalClubs,
  type ExternalClub,
} from "@/lib/api/externalClubs";
import { TournamentPreview as ManualTournamentPreview } from "@/components/tournament-preview/TournamentPreview";
import type { TournamentPreviewData } from "@/components/tournament-preview/types";
import {
  deleteTournament as deleteTournamentFromSupabase,
  loadTournament as loadTournamentFromSupabase,
  listTournaments as listSupabaseTournaments,
  saveTournament as saveTournamentToSupabase,
} from "@/lib/tournamentService";
import { TournamentCard } from "./tournament-product/TournamentCard";
import { TournamentWorkspace } from "./tournament-product/TournamentWorkspace";
import type {
  TournamentProductMealItem,
  TournamentProductShareSettings,
} from "./tournament-product/types";

type TournamentTabProps = {
  teamId: string;
};

const TOURNAMENT_WORKSPACE_RENDER_VERSION = "share-sync-v2";

type TournamentView = "create" | "search" | "chat";
type TournamentMode = "assistant" | "auto" | "manual";
type TournamentAutoFormat = "mini_league" | "group_knockout" | "tournament_bracket";
type TournamentPublicationStatus = "draft" | "published" | "live" | "finished";
type TournamentMatchStatus = "scheduled" | "live" | "completed";

type TournamentTeam = {
  id: string;
  name: string;
  officialId: string | null;
  source: "official" | "manual";
};

type TournamentManualMatch = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  field: number;
  startTime: string;
  duration: number;
};

type TournamentScheduleMatch = {
  id: string;
  roundLabel: string;
  fieldLabel: string;
  startTime: string;
  endTime: string;
  slotIndex?: number;
  homeTeam: string;
  awayTeam: string;
  stage?: string;
  leg?: "aller" | "retour";
  type?: "match" | "pause";
  label?: string;
  isPause?: boolean;
  scheduleSection?: "group" | "final";
};

type TournamentMatchState = {
  homeScore: number | null;
  awayScore: number | null;
  status: TournamentMatchStatus;
  notes?: string;
};

type TournamentGeneratedMatch = {
  phaseLabel: string;
  homeTeam: string;
  awayTeam: string;
  stage?: string;
  leg?: "aller" | "retour";
};

type TournamentScheduleSlotRow = {
  slotIndex: number;
  startTime: string;
  fields: Array<{
    fieldLabel: string;
    match: TournamentScheduleMatch | null;
  }>;
};

type TournamentConfig = {
  name: string;
  date: string;
  categories: string[];
  levels: string[];
  teamCount: number;
  autoFormat: TournamentAutoFormat;
  groupCount: number;
  teamsPerGroup: number;
  startTime: string;
  endTime: string;
  fieldCount: number;
  matchDuration: number;
  penaltyShooters: number;
  breakMinutes: number;
  lunchBreakMinutes: number;
  groupHomeAway: boolean;
  qualificationRule: string;
  finalPhase: string;
  placementMatches: string;
  teams: TournamentTeam[];
  manualMatches: TournamentManualMatch[];
};

type SavedTournament = {
  id: string;
  name: string;
  date: string;
  categories: string[];
  levels: string[];
  groups?: Array<{
    label: string;
    teams: string[];
  }>;
  manualPreviewDataByDivision?: Array<{
    id: string;
    name: string;
    data: TournamentPreviewData;
  }>;
  manualBuilderSnapshot?: {
    manualTournamentState: Record<string, unknown>;
    divisionStates: Record<string, unknown>;
    activeDivisionId?: string | null;
  } | null;
  mode: TournamentMode;
  teamCount: number;
  autoFormat: TournamentAutoFormat;
  groupCount: number;
  teamsPerGroup: number;
  startTime?: string;
  endTime?: string;
  teams: TournamentTeam[];
  maxPlayersPerTeam?: number;
  mealsPerTeam?: number;
  mealItems?: TournamentProductMealItem[];
  shareSettings?: TournamentProductShareSettings;
  schedule: TournamentScheduleMatch[];
  fieldCount: number;
  matchDuration: number;
  penaltyShooters?: number;
  breakMinutes: number;
  lunchBreakMinutes: number;
  groupHomeAway: boolean;
  qualificationRule?: string;
  finalPhase?: string;
  placementMatches?: string;
  manualMatches?: TournamentManualMatch[];
  windowFits: boolean;
  createdAt: string;
  updatedAt?: string;
  status?: TournamentPublicationStatus;
  location?: string;
  publishedAt?: string | null;
  liveMatchId?: string | null;
  matchStates?: Record<string, TournamentMatchState>;
};

type TeamSearchDropdownProps = {
  onSelect: (selection: { name: string; id: string | null }) => void;
  disabled?: boolean;
  placeholder?: string;
};

type TournamentAutoSuggestion = {
  key: string;
  variant: "recommended" | "rapid" | "balanced" | "comfort";
  teamCount: number;
  format: TournamentAutoFormat;
  groupCount: number;
  teamsPerGroup: number;
  matchDuration: number;
  breakMinutes: number;
  lunchBreakMinutes: number;
  groupHomeAway: boolean;
  label: string;
  detail: string;
  meta: string;
  formatLabel: string;
  fits: boolean;
  requiredMatches: number;
  matchesPossible: number;
  estimatedEndTime: string;
  totalDurationUsed: number;
  summary: string;
  minMatchesPerTeam: number;
  maxMatchesPerTeam: number;
  waitingEstimate: number;
  intensity: string;
  optimization: string;
  score: number;
};

type TournamentSuggestionPreset = {
  format: TournamentAutoFormat;
  groupCount: number;
  teamsPerGroup: number;
  matchDuration: number;
  breakMinutes: number;
  lunchBreakMinutes: number;
  variantLabel: string;
  groupHomeAway?: boolean;
};

type TournamentPreviewRound = {
  title: string;
  matches: string[];
};

type TournamentFormatOptionVariant =
  | "round_robin"
  | "group_final"
  | "double_bracket"
  | "direct_elimination";

type TournamentStructureGroup = {
  label: string;
  teams: string[];
  matches: TournamentGeneratedMatch[];
};

type TournamentStructure = {
  groups: TournamentStructureGroup[];
  knockout: TournamentGeneratedMatch[];
  classement: TournamentGeneratedMatch[];
  formatType: string;
};

type TournamentPlanningNode = {
  id: string;
  match: TournamentGeneratedMatch;
  dependsOn: string[];
  stageLevel: number;
  priority: number;
};

type TournamentStandingRow = {
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

type TournamentFormatOption = {
  label: string;
  variant: TournamentFormatOptionVariant;
  autoFormat: TournamentAutoFormat;
  qualificationRule: string;
  finalPhase: string;
  placementMatches: "Oui" | "Non";
  description: string;
};

const buildId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const buildTournamentStandingTable = (
  teams: string[],
  matches: TournamentScheduleMatch[],
  states: Record<string, TournamentMatchState>,
) => {
  const table = new Map<string, TournamentStandingRow>();
  teams.forEach((team) => {
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

const STORAGE_PREFIX = "infinity:tournaments:";

const readLocalSavedTournaments = (storageKey: string) => {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored ? sanitizeSavedTournaments(JSON.parse(stored)) : [];
  } catch {
    return [];
  }
};

const mergeSavedTournamentLists = (localEntries: SavedTournament[], remoteEntries: SavedTournament[]) => {
  const merged = new Map<string, SavedTournament>();

  [...remoteEntries, ...localEntries].forEach((entry) => {
    const existing = merged.get(entry.id);
    if (!existing) {
      merged.set(entry.id, entry);
      return;
    }

    const existingUpdatedAt = new Date(existing.updatedAt ?? existing.createdAt ?? 0).getTime();
    const nextUpdatedAt = new Date(entry.updatedAt ?? entry.createdAt ?? 0).getTime();
    merged.set(entry.id, nextUpdatedAt >= existingUpdatedAt ? entry : existing);
  });

  return [...merged.values()];
};
const TOURNAMENT_CATEGORIES = ["U7", "U8", "U9", "U10", "U11", "U12", "U13"];
const TOURNAMENT_LEVELS = ["1", "2", "3", "4"];

const DEFAULT_CONFIG: TournamentConfig = {
  name: "",
  date: "",
  categories: [],
  levels: [],
  teamCount: 0,
  autoFormat: "mini_league",
  groupCount: 2,
  teamsPerGroup: 4,
  startTime: "",
  endTime: "",
  fieldCount: 2,
  matchDuration: 15,
  penaltyShooters: 5,
  breakMinutes: 2,
  lunchBreakMinutes: 60,
  groupHomeAway: false,
  qualificationRule: "Top 2",
  finalPhase: "Demi-finale + Finale",
  placementMatches: "Oui",
  teams: [],
  manualMatches: [],
};

const toSafeInteger = (value: number, fallback = 0) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.round(value);
};

const toSafeNonNegativeInteger = (value: number, fallback = 0) =>
  Math.max(0, toSafeInteger(value, fallback));

const randomOffset = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const snapToClosest = (value: number, candidates: number[]) =>
  candidates.reduce((closest, candidate) =>
    Math.abs(candidate - value) < Math.abs(closest - value) ? candidate : closest,
  );

const toMinutes = (value: string) => {
  const [hourValue = "0", minuteValue = "0"] = value.split(":");
  const hours = Number(hourValue);
  const minutes = Number(minuteValue);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.round(hours) * 60 + Math.round(minutes));
};

const toTimeLabel = (value: number) => {
  const normalized = toSafeNonNegativeInteger(value, 0);
  const hours = Math.floor(normalized / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (normalized % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

const shiftTimeValue = (value: string, stepMinutes: number, fallbackValue: string) => {
  const baseValue = value && /^\d{2}:\d{2}$/.test(value) ? value : fallbackValue;
  const nextMinutes = Math.max(
    0,
    Math.min(23 * 60 + 59, toMinutes(baseValue) + stepMinutes),
  );
  return toTimeLabel(nextMinutes);
};

const getAutoFormatLabel = (format: TournamentAutoFormat) => {
  if (format === "mini_league") return "Mini League";
  if (format === "group_knockout") return "Group Stage + Knockout";
  return "Tournament Bracket";
};

const getSuggestionFormatLabel = (
  format: TournamentAutoFormat,
  groupCount: number,
  teamsPerGroup: number,
  groupHomeAway: boolean,
) => {
  if (format === "mini_league") {
    if (groupCount === 2 && teamsPerGroup === 3) {
      return groupHomeAway ? "2 groupes de 3 aller-retour" : "2 groupes de 3 + phases finales";
    }
    return "Mini League";
  }

  if (format === "group_knockout") {
    return groupHomeAway
      ? `${groupCount} poules de ${teamsPerGroup} + phases finales aller-retour`
      : `${groupCount} poules de ${teamsPerGroup} + phases finales`;
  }

  return `${groupCount} poules de ${teamsPerGroup} + tableau final`;
};

const mapSavedTournamentToConfig = (tournament: SavedTournament): TournamentConfig => ({
  ...DEFAULT_CONFIG,
  name: tournament.name,
  date: tournament.date,
  categories: tournament.categories,
  levels: tournament.levels,
  teamCount: tournament.teamCount,
  autoFormat: tournament.autoFormat,
  groupCount: tournament.groupCount,
  teamsPerGroup: tournament.teamsPerGroup,
  startTime: tournament.startTime ?? DEFAULT_CONFIG.startTime,
  endTime: tournament.endTime ?? DEFAULT_CONFIG.endTime,
  fieldCount: tournament.fieldCount,
  matchDuration: tournament.matchDuration,
  penaltyShooters: tournament.penaltyShooters ?? DEFAULT_CONFIG.penaltyShooters,
  breakMinutes: tournament.breakMinutes,
  lunchBreakMinutes: tournament.lunchBreakMinutes,
  groupHomeAway: tournament.groupHomeAway,
  qualificationRule: tournament.qualificationRule ?? DEFAULT_CONFIG.qualificationRule,
  finalPhase: tournament.finalPhase ?? DEFAULT_CONFIG.finalPhase,
  placementMatches: tournament.placementMatches ?? DEFAULT_CONFIG.placementMatches,
  teams: tournament.teams,
  manualMatches: tournament.manualMatches ?? [],
});

const getSuggestionMatchRange = (
  teamCount: number,
  format: TournamentAutoFormat,
  groupCount: number,
  teamsPerGroup: number,
  groupHomeAway: boolean,
) => {
  const baseGroupMatches =
    format === "mini_league" && groupCount === 1
      ? groupHomeAway
        ? Math.max(1, (teamCount - 1) * 2)
        : Math.max(1, teamCount - 1)
      : groupHomeAway
        ? Math.max(1, (teamsPerGroup - 1) * 2)
        : Math.max(1, teamsPerGroup - 1);

  if (format === "mini_league") {
    if (teamCount >= 6) {
      return { min: baseGroupMatches + 1, max: baseGroupMatches + 2 };
    }
    return { min: baseGroupMatches, max: baseGroupMatches + 2 };
  }

  if (format === "group_knockout") {
    const maxExtra = teamCount <= 8 ? 2 : 3;
    return { min: baseGroupMatches, max: baseGroupMatches + maxExtra };
  }

  return { min: baseGroupMatches + 1, max: baseGroupMatches + 4 };
};

const buildFinalMatch = (
  homeTeam: string,
  awayTeam: string,
  homeAway: boolean,
): TournamentGeneratedMatch => ({
  phaseLabel: homeAway ? "Finale aller-retour" : "Finale",
  homeTeam,
  awayTeam,
});

const PHASE_ORDER = [
  "Quart de finale",
  "Demi-finale",
  "Finale",
  "Match 3e place",
  "Classement 5e place",
  "Classement 7e place",
];

const STAGE_ORDER: Record<string, number> = {
  group_stage: 10,
  bottom_table: 20,
  quarter_final: 30,
  bottom_table_secondary: 35,
  quarter_losers: 40,
  semi_final: 50,
  placement_mid: 60,
  bottom_table_final: 65,
  placement_3rd: 70,
  final: 80,
  semi_losers: 90,
  semi_winners: 100,
  placement_bracket_losers: 110,
  placement_bracket_winners: 115,
  final_losers: 110,
  placement_bracket_3rd: 120,
  final_winners: 130,
  bracket12_bottom_semi: 140,
  bracket12_europa_semi: 150,
  bracket12_uefa_semi: 160,
  bracket12_bottom_placement: 170,
  bracket12_bottom_final: 170,
  bracket12_europa_placement: 180,
  bracket12_uefa_placement: 190,
  bracket12_europa_final: 200,
  bracket12_uefa_final: 210,
  bracket16_europa_quarter: 220,
  bracket16_uefa_quarter: 230,
  bracket16_bottom_semi: 240,
  bracket16_placement_semi: 250,
  bracket16_europa_semi: 260,
  bracket16_uefa_semi: 260,
  bracket16_bottom_final: 270,
  bracket16_placement_final: 280,
  bracket16_europa_placement: 290,
  bracket16_uefa_placement: 290,
  bracket16_europa_final: 300,
  bracket16_uefa_final: 310,
  tier1_semi: 220,
  tier2_semi: 230,
  tier3_semi: 240,
  tier3_final: 250,
  tier2_final: 260,
  tier1_final: 270,
};

const MIN_TEAM_REST_SLOTS = 2;
const COMFORT_TEAM_REST_SLOTS = 3;

const formatLevelsLabel = (levels: string[]) => {
  if (levels.length === 0) return "Niveau à définir";
  if (levels.length === TOURNAMENT_LEVELS.length) return "Tous niveaux";
  return levels.map((level) => `Niveau ${level}`).join(" / ");
};

const formatAssistantCategoryChip = (categories: string[]) => {
  if (categories.length <= 0) return null;
  return `${categories.length} categorie${categories.length > 1 ? "s" : ""}`;
};

const formatAssistantLevelChip = (levels: string[]) => {
  if (levels.length <= 0) return null;
  if (levels.length === 1) return `niv ${levels[0]}`;
  return "plusieurs niveaux";
};

const splitTimeParts = (value: string) => {
  const [hours = "", minutes = ""] = value.split(":");
  return {
    hours: hours.slice(0, 2),
    minutes: minutes.slice(0, 2),
  };
};

const sanitizeSavedTournaments = (value: unknown): SavedTournament[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("id" in entry) ||
      !("name" in entry) ||
      !("mode" in entry) ||
      !("schedule" in entry) ||
      !Array.isArray((entry as SavedTournament).schedule)
    ) {
      return [];
    }

    const candidate = entry as Partial<SavedTournament>;

    return [
      {
        ...candidate,
        id: typeof candidate.id === "string" ? candidate.id : buildId(),
        name: typeof candidate.name === "string" ? candidate.name : "Tournoi",
        date: typeof candidate.date === "string" ? candidate.date : "",
        categories: Array.isArray(candidate.categories) ? candidate.categories : [],
        levels: Array.isArray(candidate.levels) ? candidate.levels : [],
        groups: Array.isArray(candidate.groups) ? candidate.groups : [],
        manualPreviewDataByDivision: Array.isArray(candidate.manualPreviewDataByDivision)
          ? candidate.manualPreviewDataByDivision
          : [],
        manualBuilderSnapshot:
          candidate.manualBuilderSnapshot && typeof candidate.manualBuilderSnapshot === "object"
            ? candidate.manualBuilderSnapshot
            : null,
        mode:
          candidate.mode === "assistant" ||
          candidate.mode === "auto" ||
          candidate.mode === "manual"
            ? candidate.mode
            : "assistant",
        teamCount: toSafeNonNegativeInteger(candidate.teamCount, 0),
        autoFormat:
          candidate.autoFormat === "mini_league" ||
          candidate.autoFormat === "group_knockout" ||
          candidate.autoFormat === "tournament_bracket"
            ? candidate.autoFormat
            : "group_knockout",
        groupCount: toSafeNonNegativeInteger(candidate.groupCount, 0),
        teamsPerGroup: toSafeNonNegativeInteger(candidate.teamsPerGroup, 0),
        teams: Array.isArray(candidate.teams) ? candidate.teams : [],
        maxPlayersPerTeam: toSafeNonNegativeInteger(candidate.maxPlayersPerTeam, 10),
        mealsPerTeam: toSafeNonNegativeInteger(candidate.mealsPerTeam, 12),
        mealItems: Array.isArray(candidate.mealItems) ? candidate.mealItems : [],
        shareSettings:
          candidate.shareSettings && typeof candidate.shareSettings === "object"
            ? candidate.shareSettings
            : {
                tournamentPublished: false,
                coachAccessEnabled: false,
                parentAccessEnabled: false,
                coachToken: buildId(),
                parentToken: buildId(),
                votesEnabled: false,
                coachTeamSubmissions: {},
                coachMealSubmissions: {},
              },
        schedule: Array.isArray(candidate.schedule) ? candidate.schedule : [],
        fieldCount: toSafeNonNegativeInteger(candidate.fieldCount, 1),
        matchDuration: toSafeNonNegativeInteger(candidate.matchDuration, 12),
        penaltyShooters: Math.max(1, toSafeNonNegativeInteger(candidate.penaltyShooters ?? 5, 5)),
        breakMinutes: toSafeNonNegativeInteger(candidate.breakMinutes, 0),
        lunchBreakMinutes: toSafeNonNegativeInteger(candidate.lunchBreakMinutes, 0),
        groupHomeAway: candidate.groupHomeAway === true,
        manualMatches: Array.isArray(candidate.manualMatches) ? candidate.manualMatches : [],
        windowFits: candidate.windowFits !== false,
        createdAt:
          typeof candidate.createdAt === "string"
            ? candidate.createdAt
            : new Date().toISOString(),
        updatedAt:
          typeof candidate.updatedAt === "string" ? candidate.updatedAt : undefined,
        status:
          candidate.status === "published" ||
          candidate.status === "live" ||
          candidate.status === "finished" ||
          candidate.status === "draft"
            ? candidate.status
            : "draft",
        location: typeof candidate.location === "string" ? candidate.location : "",
        publishedAt:
          typeof candidate.publishedAt === "string" ? candidate.publishedAt : null,
        liveMatchId:
          typeof candidate.liveMatchId === "string" ? candidate.liveMatchId : null,
        matchStates:
          candidate.matchStates && typeof candidate.matchStates === "object"
            ? candidate.matchStates
            : {},
      },
    ];
  });
};

function TeamSearchDropdown({
  onSelect,
  disabled = false,
  placeholder = "Rechercher une équipe officielle…",
}: TeamSearchDropdownProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalClub[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open) return;
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    let active = true;
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchExternalClubs(trimmed);
        if (!active) return;
        setResults(data);
      } catch (error) {
        console.error("Erreur recherche équipes tournoi:", error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [open, query]);

  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-60 blur-[12px]"
      />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(event) => {
          if (disabled) return;
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="relative z-10 w-full rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-4 py-2 text-xs text-white/90 placeholder:text-slate-300 shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md outline-none transition focus:ring-1 focus:ring-violet-400/50 disabled:cursor-not-allowed disabled:text-slate-500"
      />

      {open ? (
        <div className="absolute left-0 right-0 z-20 mt-2 max-h-56 overflow-y-auto rounded-2xl border border-white/10 bg-[#0f111b] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
          {loading ? (
            <p className="px-3 py-2 text-xs text-slate-400">Recherche en cours…</p>
          ) : null}

          {!loading && query.trim().length < 2 ? (
            <p className="px-3 py-2 text-xs text-slate-400">
              Tape au moins 2 lettres pour lancer la recherche.
            </p>
          ) : null}

          {!loading && query.trim().length >= 2 && results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">
              Aucune équipe trouvée.
            </p>
          ) : null}

          {!loading
            ? results.map((club) => (
                <button
                  key={club.id ?? club.name}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onSelect({ name: club.name, id: club.id ?? null });
                    setQuery("");
                    setOpen(false);
                    inputRef.current?.focus();
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/10"
                >
                  <span className="truncate">{club.name}</span>
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}

function TournamentTimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const minuteInputRef = useRef<HTMLInputElement | null>(null);
  const { hours, minutes } = splitTimeParts(value);
  const [hourDraft, setHourDraft] = useState(hours);
  const [minuteDraft, setMinuteDraft] = useState(minutes);

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

function TournamentTimeStepperField({
  label,
  value,
  onChange,
  fallbackValue,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  fallbackValue: string;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(shiftTimeValue(value, -15, fallbackValue))}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
        aria-label={`Retirer 15 minutes ${label.toLowerCase()}`}
      >
        -
      </button>
      <div className="shrink-0">
        <TournamentTimeField value={value} onChange={onChange} />
      </div>
      <button
        type="button"
        onClick={() => onChange(shiftTimeValue(value, 15, fallbackValue))}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
        aria-label={`Ajouter 15 minutes ${label.toLowerCase()}`}
      >
        +
      </button>
    </div>
  );
}

const buildRoundRobinRounds = (teams: TournamentTeam[]) => {
  if (teams.length < 2) return [];

  const entries = [...teams];
  if (entries.length % 2 === 1) {
    entries.push({
      id: "bye",
      name: "BYE",
      officialId: null,
      source: "manual",
    });
  }

  const rounds: Array<Array<{ home: TournamentTeam; away: TournamentTeam }>> = [];
  const rotating = [...entries];
  const totalRounds = rotating.length - 1;

  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    const matches: Array<{ home: TournamentTeam; away: TournamentTeam }> = [];
    for (let pairIndex = 0; pairIndex < rotating.length / 2; pairIndex += 1) {
      const home = rotating[pairIndex];
      const away = rotating[rotating.length - 1 - pairIndex];
      if (home.id !== "bye" && away.id !== "bye") {
        matches.push({
          home: roundIndex % 2 === 0 ? home : away,
          away: roundIndex % 2 === 0 ? away : home,
        });
      }
    }
    rounds.push(matches);

    const fixed = rotating[0];
    const tail = rotating.slice(1);
    tail.unshift(tail.pop() as TournamentTeam);
    rotating.splice(0, rotating.length, fixed, ...tail);
  }

  return rounds;
};

const buildPreviewTeams = (config: TournamentConfig) => {
  const teams = [...config.teams];
  while (teams.length < config.teamCount) {
    teams.push({
      id: `preview-${teams.length + 1}`,
      name: `Équipe ${teams.length + 1}`,
      officialId: null,
      source: "manual",
    });
  }
  return teams.slice(0, config.teamCount);
};

const applyAutoTeamSettings = (
  current: TournamentConfig,
  nextValues: {
    teamCount?: number;
    autoFormat?: TournamentAutoFormat;
    groupCount?: number;
    teamsPerGroup?: number;
  },
) => {
  const nextTeamCount = Math.max(0, nextValues.teamCount ?? current.teamCount);
  const nextTeams = current.teams.slice(0, nextTeamCount);
  const allowedTeamIds = new Set(nextTeams.map((team) => team.id));

  return {
    ...current,
    teamCount: nextTeamCount,
    autoFormat: nextValues.autoFormat ?? current.autoFormat,
    groupCount: nextValues.groupCount ?? current.groupCount,
    teamsPerGroup: nextValues.teamsPerGroup ?? current.teamsPerGroup,
    teams: nextTeams,
    manualMatches: current.manualMatches.filter(
      (match) =>
        allowedTeamIds.has(match.homeTeamId) && allowedTeamIds.has(match.awayTeamId),
    ),
  };
};

const getRecommendedAutoSetup = (teamCount: number) => {
  if (teamCount <= 6) {
    return {
      autoFormat: "mini_league" as const,
      groupCount: teamCount === 6 ? 2 : 1,
      teamsPerGroup: teamCount === 6 ? 3 : teamCount,
    };
  }

  if (teamCount <= 12) {
    return {
      autoFormat: "group_knockout" as const,
      groupCount: teamCount <= 8 ? 2 : teamCount <= 10 ? 2 : 3,
      teamsPerGroup: teamCount <= 8 ? 4 : teamCount <= 10 ? 5 : 4,
    };
  }

  return {
    autoFormat: "tournament_bracket" as const,
    groupCount: teamCount <= 12 ? 3 : 4,
    teamsPerGroup: 4,
  };
};

const getLayoutForFormat = (
  teamCount: number,
  format: TournamentAutoFormat,
) => {
  if (format === "mini_league") {
    return {
      autoFormat: format,
      groupCount: teamCount === 6 ? 2 : 1,
      teamsPerGroup: teamCount === 6 ? 3 : Math.max(2, teamCount),
    };
  }

  if (format === "group_knockout") {
    return {
      autoFormat: format,
      groupCount: teamCount <= 8 ? 2 : teamCount <= 10 ? 2 : teamCount <= 12 ? 3 : 4,
      teamsPerGroup: teamCount <= 8 ? 4 : teamCount <= 10 ? 5 : 4,
    };
  }

  return {
    autoFormat: format,
    groupCount: teamCount <= 8 ? 2 : teamCount <= 10 ? 2 : teamCount <= 12 ? 3 : 4,
    teamsPerGroup: teamCount <= 8 ? 4 : teamCount <= 10 ? 5 : 4,
  };
};

const TOURNAMENT_FORMAT_OPTIONS: TournamentFormatOption[] = [
  {
    label: "Tous contre tous",
    variant: "round_robin",
    autoFormat: "mini_league",
    qualificationRule: "Classement integral",
    finalPhase: "Finale aller-retour + classement",
    placementMatches: "Oui",
    description: "Lecture simple, tout le monde se rencontre avant les matchs de place.",
  },
  {
    label: "Groupes + phase finale",
    variant: "group_final",
    autoFormat: "group_knockout",
    qualificationRule: "Top 8",
    finalPhase: "Quarts + demi + finale",
    placementMatches: "Oui",
    description: "Le format terrain le plus lisible pour les jeunes tournois sur une journee.",
  },
  {
    label: "Double bracket",
    variant: "double_bracket",
    autoFormat: "tournament_bracket",
    qualificationRule: "Top 2 + consolante",
    finalPhase: "Tableau principal + consolante",
    placementMatches: "Oui",
    description: "Un tableau gagnant/perdant pour garder plus d'enjeu apres la premiere elimination.",
  },
  {
    label: "Elimination directe",
    variant: "direct_elimination",
    autoFormat: "tournament_bracket",
    qualificationRule: "Qualification directe",
    finalPhase: "Elimination directe",
    placementMatches: "Non",
    description: "Le tableau le plus dense, sans groupes, pour aller vite vers les phases finales.",
  },
];

const getFormatOptionByVariant = (variant: TournamentFormatOptionVariant) =>
  TOURNAMENT_FORMAT_OPTIONS.find((option) => option.variant === variant) ??
  TOURNAMENT_FORMAT_OPTIONS[0];

const getFormatTeamCount = (teamCount: number, inferredTeamCount: number) =>
  teamCount > 0 ? teamCount : Math.max(inferredTeamCount, 2);

const getRecommendedFormatVariant = (
  teamCount: number,
): TournamentFormatOptionVariant => {
  if (teamCount <= 6) {
    return "round_robin";
  }

  if (teamCount >= 16) {
    return "double_bracket";
  }

  return "group_final";
};

const buildDirectEliminationStructure = (
  teams: TournamentTeam[],
  placementEnabled: boolean,
): TournamentStructure => {
  const safeTeams = teams.map((team) => team.name);
  const bracketSize = Math.max(
    2,
    2 ** Math.ceil(Math.log2(Math.max(2, safeTeams.length))),
  );
  const seededEntries = [
    ...safeTeams,
    ...Array.from({ length: Math.max(0, bracketSize - safeTeams.length) }, (_, index) => {
      return `Exempt ${index + 1}`;
    }),
  ];
  const knockout: TournamentGeneratedMatch[] = [];
  const roundLabels =
    bracketSize >= 16
      ? ["Huitieme de finale", "Quart de finale", "Demi-finale", "Finale"]
      : bracketSize >= 8
        ? ["Quart de finale", "Demi-finale", "Finale"]
        : ["Demi-finale", "Finale"];

  let currentEntries = seededEntries;
  let matchOffset = 0;

  roundLabels.forEach((roundLabel, roundIndex) => {
    const nextEntries: string[] = [];

    for (let index = 0; index < currentEntries.length; index += 2) {
      const matchNumber = matchOffset + index / 2 + 1;
      const homeTeam = currentEntries[index] ?? `Qualifie ${matchNumber}`;
      const awayTeam = currentEntries[index + 1] ?? `Qualifie ${matchNumber + 1}`;

      knockout.push({
        phaseLabel: roundLabel,
        homeTeam,
        awayTeam,
      });

      if (roundIndex === roundLabels.length - 1) {
        continue;
      }

      const winnerPrefix =
        roundLabel === "Huitieme de finale"
          ? "H"
          : roundLabel === "Quart de finale"
            ? "QF"
            : "DF";
      nextEntries.push(`Vainqueur ${winnerPrefix}${matchNumber}`);
    }

    matchOffset += Math.max(1, currentEntries.length / 2);
    currentEntries = nextEntries;
  });

  const classement: TournamentGeneratedMatch[] = placementEnabled
    ? [
        {
          phaseLabel: "Match 3e place",
          homeTeam: "Perdant DF1",
          awayTeam: "Perdant DF2",
        },
      ]
    : [];

  return {
    groups: [],
    knockout,
    classement,
    formatType: "Elimination directe",
  };
};

const buildFormatOptionConfig = (
  config: TournamentConfig,
  option: TournamentFormatOption,
  inferredTeamCount: number,
  preserveToggles = false,
) => {
  const teamCount = Math.max(config.teamCount, inferredTeamCount, 2);
  const nextLayout = getLayoutForFormat(teamCount, option.autoFormat);

  return {
    ...DEFAULT_CONFIG,
    ...config,
    teamCount,
    autoFormat: option.autoFormat,
    groupCount: nextLayout.groupCount,
    teamsPerGroup: nextLayout.teamsPerGroup,
    qualificationRule: preserveToggles ? config.qualificationRule : option.qualificationRule,
    finalPhase: preserveToggles ? config.finalPhase : option.finalPhase,
    placementMatches: preserveToggles ? config.placementMatches : option.placementMatches,
  } satisfies TournamentConfig;
};

const buildFormatOptionStructure = (
  config: TournamentConfig,
  option: TournamentFormatOption,
  inferredTeamCount: number,
  preserveToggles = false,
) => {
  const optionConfig = buildFormatOptionConfig(
    config,
    option,
    inferredTeamCount,
    preserveToggles,
  );
  if (option.variant === "direct_elimination") {
    return buildDirectEliminationStructure(
      buildPreviewTeams(optionConfig),
      optionConfig.placementMatches !== "Non",
    );
  }

  return buildDynamicTournamentStructure(optionConfig);
};

const buildGroupBuckets = (teams: TournamentTeam[], groupCount: number) => {
  const buckets = Array.from({ length: Math.max(1, groupCount) }, () => [] as TournamentTeam[]);
  teams.forEach((team, index) => {
    buckets[index % buckets.length]?.push(team);
  });
  return buckets;
};

const buildRoundRobinMatchList = (
  teams: TournamentTeam[],
  phaseLabel: string,
  homeAway = false,
  stage?: string,
) => {
  const matches: TournamentGeneratedMatch[] = [];
  const returnMatches: TournamentGeneratedMatch[] = [];

  buildRoundRobinRounds(teams).forEach((round) => {
    round.forEach((match) => {
      matches.push({
        phaseLabel: homeAway ? `${phaseLabel} • Aller` : phaseLabel,
        homeTeam: match.home.name,
        awayTeam: match.away.name,
        stage,
        leg: homeAway ? "aller" : undefined,
      });

      if (homeAway) {
        returnMatches.push({
          phaseLabel: `${phaseLabel} • Retour`,
          homeTeam: match.away.name,
          awayTeam: match.home.name,
          stage,
          leg: "retour",
        });
      }
    });
  });

  return homeAway ? [...matches, ...returnMatches] : matches;
};

const flattenTournamentStructure = (structure: TournamentStructure) => [
  ...structure.groups.flatMap((group) => group.matches),
  ...structure.knockout,
  ...structure.classement,
];

const isThirdPlaceRoundLabel = (roundLabel: string) =>
  /\b(?:Match|Classement)\s+3e place\b/i.test(roundLabel);
const isPlacementRoundLabel = (roundLabel: string) =>
  isThirdPlaceRoundLabel(roundLabel) || /classement/i.test(roundLabel);
const getCompetitionPathLabel = (match: Pick<TournamentScheduleMatch, "roundLabel" | "stage">) => {
  const stage = match.stage ?? "";
  const roundLabel = match.roundLabel;

  if (
    /UEFA/i.test(roundLabel) ||
    /semi_winners|final_winners|placement_bracket_3rd|bracket12_uefa_|bracket16_uefa_|bracket16_placement_/i.test(
      stage,
    )
  ) {
    return "UEFA";
  }

  if (
    /EUROPA/i.test(roundLabel) ||
    /semi_losers|final_losers|placement_bracket_winners|placement_bracket_losers|bracket12_europa_|bracket16_europa_|bracket16_bottom_/i.test(
      stage,
    )
  ) {
    return "EUROPA";
  }

  return null;
};
const isGroupStageRoundLabel = (roundLabel: string) => /poule|round robin/i.test(roundLabel);
const isPauseScheduleMatch = (match: TournamentScheduleMatch) => match.isPause === true || match.type === "pause";
const stripLegSuffix = (label: string) => label.replace(/\s*•\s*(Aller|Retour)$/i, "");
const buildScheduleSlotRows = (
  matches: TournamentScheduleMatch[],
  fieldCount: number,
): TournamentScheduleSlotRow[] => {
  const rows = new Map<number, TournamentScheduleSlotRow>();

  matches.forEach((match) => {
    const slotIndex = match.slotIndex ?? 0;
    const existing =
      rows.get(slotIndex) ??
      ({
        slotIndex,
        startTime: match.startTime,
        fields: Array.from({ length: Math.max(1, fieldCount) }, (_, index) => ({
          fieldLabel: `Terrain ${index + 1}`,
          match: null,
        })),
      } satisfies TournamentScheduleSlotRow);

    const fieldIndex = Math.max(0, Number(match.fieldLabel.replace(/\D+/g, "")) - 1);
    if (existing.fields[fieldIndex]) {
      existing.fields[fieldIndex] = {
        fieldLabel: match.fieldLabel,
        match,
      };
    }
    existing.startTime = match.startTime;
    rows.set(slotIndex, existing);
  });

  return [...rows.values()].sort((left, right) => left.slotIndex - right.slotIndex);
};

const buildStageBlocks = (matches: TournamentGeneratedMatch[]) => {
  const stageMap = new Map<string, TournamentGeneratedMatch[]>();

  matches.forEach((match) => {
    const stageOrder =
      typeof match.stage === "string" ? STAGE_ORDER[match.stage] : undefined;
    const stageKey =
      typeof stageOrder === "number" ? `order:${stageOrder}` : `phase:${match.phaseLabel}`;
    const existing = stageMap.get(stageKey) ?? [];
    existing.push(match);
    stageMap.set(stageKey, existing);
  });

  return [...stageMap.entries()]
    .sort((left, right) => {
      const leftOrder = left[0].startsWith("order:")
        ? Number(left[0].slice("order:".length))
        : Number.MAX_SAFE_INTEGER;
      const rightOrder = right[0].startsWith("order:")
        ? Number(right[0].slice("order:".length))
        : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left[0].localeCompare(right[0], "fr");
    })
    .map(([, stageMatches]) => stageMatches);
};

const interleaveStageMatches = (
  primary: TournamentGeneratedMatch[],
  secondary: TournamentGeneratedMatch[],
) => {
  const interleaved: TournamentGeneratedMatch[] = [];
  const maxLength = Math.max(primary.length, secondary.length);

  for (let index = 0; index < maxLength; index += 1) {
    const primaryMatch = primary[index];
    const secondaryMatch = secondary[index];
    if (primaryMatch) interleaved.push(primaryMatch);
    if (secondaryMatch) interleaved.push(secondaryMatch);
  }

  return interleaved;
};

const buildStageMatch = (
  phaseLabel: string,
  homeTeam: string,
  awayTeam: string,
  stage: string,
): TournamentGeneratedMatch => ({
  phaseLabel,
  homeTeam,
  awayTeam,
  stage,
});

const buildHomeAwayFinalStageMatch = (
  homeTeam: string,
  awayTeam: string,
  stage: string,
): TournamentGeneratedMatch => ({
  ...buildFinalMatch(homeTeam, awayTeam, true),
  stage,
});

const buildNamedHomeAwayStageMatch = (
  phaseLabel: string,
  homeTeam: string,
  awayTeam: string,
  stage: string,
): TournamentGeneratedMatch => ({
  phaseLabel,
  homeTeam,
  awayTeam,
  stage,
});

const buildDynamicTournamentStructure = (config: TournamentConfig): TournamentStructure => {
  const teams = buildPreviewTeams(config);
  const teamCount = teams.length;
  const placementEnabled = config.placementMatches !== "Non";
  const directEliminationEnabled = config.finalPhase
    .toLowerCase()
    .includes("elimination directe");

  if (directEliminationEnabled) {
    return buildDirectEliminationStructure(teams, placementEnabled);
  }

  if (config.autoFormat === "mini_league" && teamCount > 7) {
    const directClassement = config.finalPhase.toLowerCase().includes("classement direct");
    const finalHomeAway = config.finalPhase.toLowerCase().includes("aller-retour");

    return {
      formatType: directClassement
        ? "Tous contre tous + TOP 2"
        : finalHomeAway
          ? "Tous contre tous + finale aller-retour"
          : "Tous contre tous + finale",
      groups: [
        {
          label: "Round Robin",
          teams: teams.map((team) => team.name),
          matches: buildRoundRobinMatchList(
            teams,
            "Round Robin",
            config.groupHomeAway,
            "group_stage",
          ),
        },
      ],
      knockout: directClassement
        ? []
        : finalHomeAway
          ? [buildHomeAwayFinalStageMatch("1", "2", "final")]
          : [
              {
                phaseLabel: "Finale",
                homeTeam: "1",
                awayTeam: "2",
                stage: "final",
              },
            ],
      classement: [],
    };
  }

  if (teamCount <= 7) {
    const directClassement = config.finalPhase.toLowerCase().includes("classement direct");

    return {
      formatType: directClassement
        ? "Round Robin + classement direct"
        : "Round Robin + finale aller-retour",
      groups: [
        {
          label: "Round Robin",
          teams: teams.map((team) => team.name),
          matches: buildRoundRobinMatchList(
            teams,
            "Round Robin",
            config.groupHomeAway,
            "group_stage",
          ),
        },
      ],
      knockout: directClassement
        ? []
        : [
            buildHomeAwayFinalStageMatch("1", "2", "final"),
          ],
      classement: directClassement
        ? []
        : [
            {
              phaseLabel: "Classement 3e place",
              homeTeam: "3",
              awayTeam: "4",
              stage: "placement_3rd",
            },
            ...(teamCount >= 6
              ? [
                  {
                    phaseLabel: "Classement 5e place",
                    homeTeam: "5",
                    awayTeam: "6",
                    stage: "placement_mid",
                  } satisfies TournamentGeneratedMatch,
                ]
              : []),
          ],
    };
  }

  if (config.autoFormat === "tournament_bracket" && teamCount === 8) {
    const finalHomeAway = config.finalPhase.toLowerCase().includes("aller-retour");
    const groups = buildGroupBuckets(teams, 2);

    return {
      formatType: "2 groupes + UEFA / EUROPA",
      groups: groups.map((groupTeams, index) => ({
        label: `Poule ${String.fromCharCode(65 + index)}`,
        teams: groupTeams.map((team) => team.name),
        matches: buildRoundRobinMatchList(
          groupTeams,
          `Poule ${String.fromCharCode(65 + index)}`,
          config.groupHomeAway,
          "group_stage",
        ),
      })),
      knockout: [
        buildStageMatch("Demi-finale UEFA", "1A", "2B", "semi_winners"),
        buildStageMatch("Demi-finale UEFA", "1B", "2A", "semi_winners"),
        ...(finalHomeAway
          ? [
              buildNamedHomeAwayStageMatch(
                "Finale UEFA aller-retour",
                "Vainqueur DF1",
                "Vainqueur DF2",
                "final_winners",
              ),
            ]
          : [
              buildStageMatch(
                "Finale UEFA",
                "Vainqueur DF1",
                "Vainqueur DF2",
                "final_winners",
              ),
            ]),
      ],
      classement: [
        buildStageMatch("Demi-finale EUROPA", "3A", "4B", "semi_losers"),
        buildStageMatch("Demi-finale EUROPA", "3B", "4A", "semi_losers"),
        ...(placementEnabled
          ? [
              buildStageMatch(
                "Classement 5e place EUROPA",
                "Vainqueur DE1",
                "Vainqueur DE2",
                "placement_bracket_winners",
              ),
              buildStageMatch(
                "Classement 3e place UEFA",
                "Perdant DF1",
                "Perdant DF2",
                "placement_bracket_3rd",
              ),
              buildStageMatch(
                "Classement 7e place EUROPA",
                "Perdant DE1",
                "Perdant DE2",
                "placement_bracket_losers",
              ),
            ]
          : []),
      ],
    };
  }

  if (teamCount >= 8 && teamCount <= 12) {
    const groupCount = teamCount <= 10 ? 2 : 3;
    const finalHomeAway = config.finalPhase.toLowerCase().includes("aller-retour");
    const groups = buildGroupBuckets(teams, groupCount);
    const groupStructures = groups.map((groupTeams, index) => ({
      label: `Poule ${String.fromCharCode(65 + index)}`,
      teams: groupTeams.map((team) => team.name),
      matches: buildRoundRobinMatchList(
        groupTeams,
        `Poule ${String.fromCharCode(65 + index)}`,
        config.groupHomeAway,
        "group_stage",
      ),
    }));

    if (config.autoFormat === "tournament_bracket" && teamCount === 12) {
      return {
        formatType: "3 groupes + brackets par tiers",
        groups: groupStructures,
        knockout: [
          buildStageMatch("Demi-finale UEFA", "1A", "Meilleur 2e", "bracket12_uefa_semi"),
          buildStageMatch("Demi-finale UEFA", "1B", "1C", "bracket12_uefa_semi"),
          ...(finalHomeAway
            ? [
                buildNamedHomeAwayStageMatch(
                  "Finale UEFA aller-retour",
                  "Vainqueur TU1",
                  "Vainqueur TU2",
                  "bracket12_uefa_final",
                ),
              ]
            : [
                buildStageMatch(
                  "Finale UEFA",
                  "Vainqueur TU1",
                  "Vainqueur TU2",
                  "bracket12_uefa_final",
                ),
              ]),
        ],
        classement: [
          buildStageMatch("Match classement 9-12", "4A", "4C", "bracket12_bottom_semi"),
          buildStageMatch(
            "Match classement 9-12",
            "4B",
            "Meilleur 3e non qualifié",
            "bracket12_bottom_semi",
          ),
          buildStageMatch("Demi-finale EUROPA", "2A", "3B", "bracket12_europa_semi"),
          buildStageMatch("Demi-finale EUROPA", "2B", "3C", "bracket12_europa_semi"),
          buildStageMatch("Match 9e place", "Vainqueur TB1", "Vainqueur TB2", "bracket12_bottom_final"),
          buildStageMatch("Finale EUROPA", "Vainqueur TN1", "Vainqueur TN2", "bracket12_europa_final"),
          ...(placementEnabled
            ? [
                buildStageMatch(
                  "Match 11e place",
                  "Perdant TB1",
                  "Perdant TB2",
                  "bracket12_bottom_placement",
                ),
                buildStageMatch(
                  "Match 7e place",
                  "Perdant TN1",
                  "Perdant TN2",
                  "bracket12_europa_placement",
                ),
                buildStageMatch(
                  "Match 3e place",
                  "Perdant TU1",
                  "Perdant TU2",
                  "bracket12_uefa_placement",
                ),
              ]
            : []),
        ],
      };
    }

    const knockout: TournamentGeneratedMatch[] = [
      {
        phaseLabel: "Quart de finale",
        homeTeam: "1A",
        awayTeam: groupCount === 2 ? "4B" : "2C",
        stage: "quarter_final",
      },
      {
        phaseLabel: "Quart de finale",
        homeTeam: groupCount === 2 ? "2A" : "1B",
        awayTeam: groupCount === 2 ? "3B" : "Meilleur 3e",
        stage: "quarter_final",
      },
      {
        phaseLabel: "Quart de finale",
        homeTeam: groupCount === 2 ? "1B" : "1C",
        awayTeam: groupCount === 2 ? "4A" : "2A",
        stage: "quarter_final",
      },
      {
        phaseLabel: "Quart de finale",
        homeTeam: groupCount === 2 ? "2B" : "2B",
        awayTeam: groupCount === 2 ? "3A" : "2C",
        stage: "quarter_final",
      },
      {
        phaseLabel: "Demi-finale",
        homeTeam: "Vainqueur QF1",
        awayTeam: "Vainqueur QF2",
        stage: "semi_final",
      },
      {
        phaseLabel: "Demi-finale",
        homeTeam: "Vainqueur QF3",
        awayTeam: "Vainqueur QF4",
        stage: "semi_final",
      },
      ...(finalHomeAway
        ? [buildHomeAwayFinalStageMatch("Vainqueur DF1", "Vainqueur DF2", "final")]
        : [
            {
              phaseLabel: "Finale",
              homeTeam: "Vainqueur DF1",
              awayTeam: "Vainqueur DF2",
              stage: "final",
            },
          ]),
      {
        phaseLabel: "Match 3e place",
        homeTeam: "Perdant DF1",
        awayTeam: "Perdant DF2",
        stage: "placement_3rd",
      },
    ];

    const classement: TournamentGeneratedMatch[] = placementEnabled
      ? [
          {
            phaseLabel: "Classement 5e-8e",
            homeTeam: "Perdant QF1",
            awayTeam: "Perdant QF2",
            stage: "quarter_losers",
          },
          {
            phaseLabel: "Classement 5e-8e",
            homeTeam: "Perdant QF3",
            awayTeam: "Perdant QF4",
            stage: "quarter_losers",
          },
          {
            phaseLabel: "Classement 5e place",
            homeTeam: "Vainqueur C1",
            awayTeam: "Vainqueur C2",
            stage: "placement_mid",
          },
          {
            phaseLabel: "Classement 7e place",
            homeTeam: "Perdant C1",
            awayTeam: "Perdant C2",
            stage: "placement_mid",
          },
          ...(teamCount === 10
            ? [
                {
                  phaseLabel: "Classement 9e place",
                  homeTeam: "5A",
                  awayTeam: "5B",
                  stage: "bottom_table",
                } satisfies TournamentGeneratedMatch,
              ]
            : []),
          ...(teamCount === 12
            ? [
                {
                  phaseLabel: "Classement 9e-12e",
                  homeTeam: "4A",
                  awayTeam: "4B",
                  stage: "bottom_table",
                } satisfies TournamentGeneratedMatch,
                {
                  phaseLabel: "Classement 9e-12e",
                  homeTeam: "4C",
                  awayTeam: "Meilleur 3e non qualifié",
                  stage: "bottom_table",
                } satisfies TournamentGeneratedMatch,
                {
                  phaseLabel: "Classement 9e place",
                  homeTeam: "Vainqueur C3",
                  awayTeam: "Vainqueur C4",
                  stage: "placement_mid",
                } satisfies TournamentGeneratedMatch,
                {
                  phaseLabel: "Classement 11e place",
                  homeTeam: "Perdant C3",
                  awayTeam: "Perdant C4",
                  stage: "placement_mid",
                } satisfies TournamentGeneratedMatch,
              ]
            : []),
        ]
      : [];

    return {
      formatType:
        teamCount === 12 && config.autoFormat === "tournament_bracket"
          ? "Groupes + double tableau"
          : "Groupes + quarts + classement",
      groups: groupStructures,
      knockout,
      classement,
    };
  }

  if (teamCount === 16) {
    const finalHomeAway = config.finalPhase.toLowerCase().includes("aller-retour");
    const groups = buildGroupBuckets(teams, 4);
    const groupStructures = groups.map((groupTeams, index) => ({
      label: `Poule ${String.fromCharCode(65 + index)}`,
      teams: groupTeams.map((team) => team.name),
      matches: buildRoundRobinMatchList(
        groupTeams,
        `Poule ${String.fromCharCode(65 + index)}`,
        config.groupHomeAway,
        "group_stage",
      ),
    }));

    if (config.autoFormat === "tournament_bracket") {
      return {
        formatType: "4 groupes + UEFA / EUROPA + classements",
        groups: groupStructures,
        knockout: [
          buildStageMatch("Quart de finale UEFA", "1A", "2B", "bracket16_uefa_quarter"),
          buildStageMatch("Quart de finale UEFA", "1B", "2A", "bracket16_uefa_quarter"),
          buildStageMatch("Quart de finale UEFA", "1C", "2D", "bracket16_uefa_quarter"),
          buildStageMatch("Quart de finale UEFA", "1D", "2C", "bracket16_uefa_quarter"),
          buildStageMatch("Demi-finale UEFA", "Vainqueur QF1", "Vainqueur QF2", "bracket16_uefa_semi"),
          buildStageMatch("Demi-finale UEFA", "Vainqueur QF3", "Vainqueur QF4", "bracket16_uefa_semi"),
          ...(finalHomeAway
            ? [
                buildNamedHomeAwayStageMatch(
                  "Finale UEFA aller-retour",
                  "Vainqueur DF1",
                  "Vainqueur DF2",
                  "bracket16_uefa_final",
                ),
              ]
            : [
                buildStageMatch(
                  "Finale UEFA",
                  "Vainqueur DF1",
                  "Vainqueur DF2",
                  "bracket16_uefa_final",
                ),
              ]),
          buildStageMatch(
            "Match 3e place UEFA",
            "Perdant DF1",
            "Perdant DF2",
            "bracket16_uefa_placement",
          ),
        ],
        classement: [
          buildStageMatch("Quart de finale EUROPA", "3A", "4B", "bracket16_europa_quarter"),
          buildStageMatch("Quart de finale EUROPA", "3B", "4A", "bracket16_europa_quarter"),
          buildStageMatch("Quart de finale EUROPA", "3C", "4D", "bracket16_europa_quarter"),
          buildStageMatch("Quart de finale EUROPA", "3D", "4C", "bracket16_europa_quarter"),
          buildStageMatch("Classement 13e-16e", "Perdant QE1", "Perdant QE2", "bracket16_bottom_semi"),
          buildStageMatch("Classement 13e-16e", "Perdant QE3", "Perdant QE4", "bracket16_bottom_semi"),
          buildStageMatch("Classement 5e-8e", "Perdant QF1", "Perdant QF2", "bracket16_placement_semi"),
          buildStageMatch("Classement 5e-8e", "Perdant QF3", "Perdant QF4", "bracket16_placement_semi"),
          buildStageMatch("Demi-finale EUROPA", "Vainqueur QE1", "Vainqueur QE2", "bracket16_europa_semi"),
          buildStageMatch("Demi-finale EUROPA", "Vainqueur QE3", "Vainqueur QE4", "bracket16_europa_semi"),
          buildStageMatch("Classement 15e place", "Perdant B1", "Perdant B2", "bracket16_bottom_final"),
          buildStageMatch("Classement 13e place", "Vainqueur B1", "Vainqueur B2", "bracket16_bottom_final"),
          buildStageMatch("Classement 7e place", "Perdant C1", "Perdant C2", "bracket16_placement_final"),
          buildStageMatch("Classement 5e place", "Vainqueur C1", "Vainqueur C2", "bracket16_placement_final"),
          buildStageMatch(
            "Classement 11e place EUROPA",
            "Perdant DE1",
            "Perdant DE2",
            "bracket16_europa_placement",
          ),
          buildStageMatch(
            "Finale EUROPA",
            "Vainqueur DE1",
            "Vainqueur DE2",
            "bracket16_europa_final",
          ),
        ],
      };
    }

    if (config.autoFormat === "group_knockout") {
      return {
        formatType: "4 groupes de 4 + huitièmes + classement 5-16",
        groups: groupStructures,
        knockout: [
          {
            phaseLabel: "Huitième de finale",
            homeTeam: "1A",
            awayTeam: "4B",
            stage: "round_of_16",
          },
          {
            phaseLabel: "Huitième de finale",
            homeTeam: "2A",
            awayTeam: "3B",
            stage: "round_of_16",
          },
          {
            phaseLabel: "Huitième de finale",
            homeTeam: "1B",
            awayTeam: "4A",
            stage: "round_of_16",
          },
          {
            phaseLabel: "Huitième de finale",
            homeTeam: "2B",
            awayTeam: "3A",
            stage: "round_of_16",
          },
          {
            phaseLabel: "Huitième de finale",
            homeTeam: "1C",
            awayTeam: "4D",
            stage: "round_of_16",
          },
          {
            phaseLabel: "Huitième de finale",
            homeTeam: "2C",
            awayTeam: "3D",
            stage: "round_of_16",
          },
          {
            phaseLabel: "Huitième de finale",
            homeTeam: "1D",
            awayTeam: "4C",
            stage: "round_of_16",
          },
          {
            phaseLabel: "Huitième de finale",
            homeTeam: "2D",
            awayTeam: "3C",
            stage: "round_of_16",
          },
          {
            phaseLabel: "Quart de finale",
            homeTeam: "Vainqueur H1",
            awayTeam: "Vainqueur H2",
            stage: "quarter_final",
          },
          {
            phaseLabel: "Quart de finale",
            homeTeam: "Vainqueur H3",
            awayTeam: "Vainqueur H4",
            stage: "quarter_final",
          },
          {
            phaseLabel: "Quart de finale",
            homeTeam: "Vainqueur H5",
            awayTeam: "Vainqueur H6",
            stage: "quarter_final",
          },
          {
            phaseLabel: "Quart de finale",
            homeTeam: "Vainqueur H7",
            awayTeam: "Vainqueur H8",
            stage: "quarter_final",
          },
          {
            phaseLabel: "Demi-finale",
            homeTeam: "Vainqueur QF1",
            awayTeam: "Vainqueur QF2",
            stage: "semi_final",
          },
          {
            phaseLabel: "Demi-finale",
            homeTeam: "Vainqueur QF3",
            awayTeam: "Vainqueur QF4",
            stage: "semi_final",
          },
          ...(finalHomeAway
            ? [buildHomeAwayFinalStageMatch("Vainqueur DF1", "Vainqueur DF2", "final")]
            : [
                {
                  phaseLabel: "Finale",
                  homeTeam: "Vainqueur DF1",
                  awayTeam: "Vainqueur DF2",
                  stage: "final",
                },
              ]),
          {
            phaseLabel: "Match 3e place",
            homeTeam: "Perdant DF1",
            awayTeam: "Perdant DF2",
            stage: "placement_3rd",
          },
        ],
        classement: placementEnabled
          ? [
              {
                phaseLabel: "Classement 9e-16e",
                homeTeam: "Perdant H1",
                awayTeam: "Perdant H2",
                stage: "bottom_table",
              },
              {
                phaseLabel: "Classement 9e-16e",
                homeTeam: "Perdant H3",
                awayTeam: "Perdant H4",
                stage: "bottom_table",
              },
              {
                phaseLabel: "Classement 9e-16e",
                homeTeam: "Perdant H5",
                awayTeam: "Perdant H6",
                stage: "bottom_table",
              },
              {
                phaseLabel: "Classement 9e-16e",
                homeTeam: "Perdant H7",
                awayTeam: "Perdant H8",
                stage: "bottom_table",
              },
              {
                phaseLabel: "Classement 5e-8e",
                homeTeam: "Perdant QF1",
                awayTeam: "Perdant QF2",
                stage: "quarter_losers",
              },
              {
                phaseLabel: "Classement 5e-8e",
                homeTeam: "Perdant QF3",
                awayTeam: "Perdant QF4",
                stage: "quarter_losers",
              },
              {
                phaseLabel: "Classement 9e-12e",
                homeTeam: "Vainqueur B1",
                awayTeam: "Vainqueur B2",
                stage: "bottom_table_secondary",
              },
              {
                phaseLabel: "Classement 9e-12e",
                homeTeam: "Vainqueur B3",
                awayTeam: "Vainqueur B4",
                stage: "bottom_table_secondary",
              },
              {
                phaseLabel: "Classement 13e-16e",
                homeTeam: "Perdant B1",
                awayTeam: "Perdant B2",
                stage: "bottom_table_secondary",
              },
              {
                phaseLabel: "Classement 13e-16e",
                homeTeam: "Perdant B3",
                awayTeam: "Perdant B4",
                stage: "bottom_table_secondary",
              },
              {
                phaseLabel: "Classement 5e place",
                homeTeam: "Vainqueur C1",
                awayTeam: "Vainqueur C2",
                stage: "placement_mid",
              },
              {
                phaseLabel: "Classement 7e place",
                homeTeam: "Perdant C1",
                awayTeam: "Perdant C2",
                stage: "placement_mid",
              },
              {
                phaseLabel: "Classement 9e place",
                homeTeam: "Vainqueur B5",
                awayTeam: "Vainqueur B6",
                stage: "bottom_table_final",
              },
              {
                phaseLabel: "Classement 11e place",
                homeTeam: "Perdant B5",
                awayTeam: "Perdant B6",
                stage: "bottom_table_final",
              },
              {
                phaseLabel: "Classement 13e place",
                homeTeam: "Vainqueur B7",
                awayTeam: "Vainqueur B8",
                stage: "bottom_table_final",
              },
              {
                phaseLabel: "Classement 15e place",
                homeTeam: "Perdant B7",
                awayTeam: "Perdant B8",
                stage: "bottom_table_final",
              },
            ]
          : [],
      };
    }

    return {
      formatType: "4 groupes de 4 + quarts + classement 5-16",
      groups: groupStructures,
      knockout: [
        {
          phaseLabel: "Quart de finale",
          homeTeam: "1A",
          awayTeam: "2B",
          stage: "quarter_final",
        },
        {
          phaseLabel: "Quart de finale",
          homeTeam: "1B",
          awayTeam: "2A",
          stage: "quarter_final",
        },
        {
          phaseLabel: "Quart de finale",
          homeTeam: "1C",
          awayTeam: "2D",
          stage: "quarter_final",
        },
        {
          phaseLabel: "Quart de finale",
          homeTeam: "1D",
          awayTeam: "2C",
          stage: "quarter_final",
        },
        {
          phaseLabel: "Demi-finale",
          homeTeam: "Vainqueur QF1",
          awayTeam: "Vainqueur QF2",
          stage: "semi_final",
        },
        {
          phaseLabel: "Demi-finale",
          homeTeam: "Vainqueur QF3",
          awayTeam: "Vainqueur QF4",
          stage: "semi_final",
        },
        ...(finalHomeAway
          ? [buildHomeAwayFinalStageMatch("Vainqueur DF1", "Vainqueur DF2", "final")]
          : [
              {
                phaseLabel: "Finale",
                homeTeam: "Vainqueur DF1",
                awayTeam: "Vainqueur DF2",
                stage: "final",
              },
            ]),
        {
          phaseLabel: "Match 3e place",
          homeTeam: "Perdant DF1",
          awayTeam: "Perdant DF2",
          stage: "placement_3rd",
        },
      ],
      classement: placementEnabled
        ? [
            {
              phaseLabel: "Classement 9e-16e",
              homeTeam: "3A",
              awayTeam: "4B",
              stage: "bottom_table",
            },
            {
              phaseLabel: "Classement 9e-16e",
              homeTeam: "3B",
              awayTeam: "4A",
              stage: "bottom_table",
            },
            {
              phaseLabel: "Classement 9e-16e",
              homeTeam: "3C",
              awayTeam: "4D",
              stage: "bottom_table",
            },
            {
              phaseLabel: "Classement 9e-16e",
              homeTeam: "3D",
              awayTeam: "4C",
              stage: "bottom_table",
            },
            {
              phaseLabel: "Classement 5e-8e",
              homeTeam: "Perdant QF1",
              awayTeam: "Perdant QF2",
              stage: "quarter_losers",
            },
            {
              phaseLabel: "Classement 5e-8e",
              homeTeam: "Perdant QF3",
              awayTeam: "Perdant QF4",
              stage: "quarter_losers",
            },
            {
              phaseLabel: "Classement 9e-12e",
              homeTeam: "Vainqueur B1",
              awayTeam: "Vainqueur B2",
              stage: "bottom_table_secondary",
            },
            {
              phaseLabel: "Classement 9e-12e",
              homeTeam: "Vainqueur B3",
              awayTeam: "Vainqueur B4",
              stage: "bottom_table_secondary",
            },
            {
              phaseLabel: "Classement 13e-16e",
              homeTeam: "Perdant B1",
              awayTeam: "Perdant B2",
              stage: "bottom_table_secondary",
            },
            {
              phaseLabel: "Classement 13e-16e",
              homeTeam: "Perdant B3",
              awayTeam: "Perdant B4",
              stage: "bottom_table_secondary",
            },
            {
              phaseLabel: "Classement 5e place",
              homeTeam: "Vainqueur C1",
              awayTeam: "Vainqueur C2",
              stage: "placement_mid",
            },
            {
              phaseLabel: "Classement 7e place",
              homeTeam: "Perdant C1",
              awayTeam: "Perdant C2",
              stage: "placement_mid",
            },
            {
              phaseLabel: "Classement 9e place",
              homeTeam: "Vainqueur B5",
              awayTeam: "Vainqueur B6",
              stage: "bottom_table_final",
            },
            {
              phaseLabel: "Classement 11e place",
              homeTeam: "Perdant B5",
              awayTeam: "Perdant B6",
              stage: "bottom_table_final",
            },
            {
              phaseLabel: "Classement 13e place",
              homeTeam: "Vainqueur B7",
              awayTeam: "Vainqueur B8",
              stage: "bottom_table_final",
            },
            {
              phaseLabel: "Classement 15e place",
              homeTeam: "Perdant B7",
              awayTeam: "Perdant B8",
              stage: "bottom_table_final",
            },
          ]
        : [],
    };
  }

  const groupCount = Math.max(4, Math.ceil(teamCount / 4));
  const finalHomeAway = config.finalPhase.toLowerCase().includes("aller-retour");
  const groups = buildGroupBuckets(teams, groupCount);
  const qualifiersCount = teamCount > 16 ? 16 : 8;
  const topSeedLabels = groups.flatMap((_, index) => [`1${String.fromCharCode(65 + index)}`]);
  const secondSeedLabels = groups.flatMap((_, index) => [`2${String.fromCharCode(65 + index)}`]);
  const qualifiedLabels = [...topSeedLabels, ...secondSeedLabels].slice(0, qualifiersCount);
  const knockout: TournamentGeneratedMatch[] = [];

  for (let index = 0; index < Math.floor(qualifiedLabels.length / 2); index += 1) {
    knockout.push({
      phaseLabel: qualifiersCount === 16 ? "Huitième de finale" : "Quart de finale",
      homeTeam: qualifiedLabels[index] ?? `Qualifié ${index + 1}`,
      awayTeam:
        qualifiedLabels[qualifiedLabels.length - 1 - index] ??
        `Qualifié ${qualifiedLabels.length - index}`,
    });
  }

  if (qualifiersCount === 16) {
    knockout.push(
      {
        phaseLabel: "Quart de finale",
        homeTeam: "Vainqueur H1",
        awayTeam: "Vainqueur H2",
      },
      {
        phaseLabel: "Quart de finale",
        homeTeam: "Vainqueur H3",
        awayTeam: "Vainqueur H4",
      },
      {
        phaseLabel: "Quart de finale",
        homeTeam: "Vainqueur H5",
        awayTeam: "Vainqueur H6",
      },
      {
        phaseLabel: "Quart de finale",
        homeTeam: "Vainqueur H7",
        awayTeam: "Vainqueur H8",
      },
    );
  }

  knockout.push(
    {
      phaseLabel: "Demi-finale",
      homeTeam: qualifiersCount === 16 ? "Vainqueur QF1" : "Vainqueur QF1",
      awayTeam: qualifiersCount === 16 ? "Vainqueur QF2" : "Vainqueur QF2",
    },
    {
      phaseLabel: "Demi-finale",
      homeTeam: qualifiersCount === 16 ? "Vainqueur QF3" : "Vainqueur QF3",
      awayTeam: qualifiersCount === 16 ? "Vainqueur QF4" : "Vainqueur QF4",
    },
    ...(finalHomeAway
      ? [buildFinalMatch("Vainqueur DF1", "Vainqueur DF2", true)]
      : [
          {
            phaseLabel: "Finale",
            homeTeam: "Vainqueur DF1",
            awayTeam: "Vainqueur DF2",
          },
        ]),
    {
      phaseLabel: "Match 3e place",
      homeTeam: "Perdant DF1",
      awayTeam: "Perdant DF2",
    },
  );

  return {
    formatType:
      qualifiersCount === 16
        ? "Groupes + huitièmes + tableau final"
        : "Groupes + tableau final",
    groups: groups.map((groupTeams, index) => ({
      label: `Poule ${String.fromCharCode(65 + index)}`,
      teams: groupTeams.map((team) => team.name),
      matches: buildRoundRobinMatchList(
        groupTeams,
        `Poule ${String.fromCharCode(65 + index)}`,
        config.groupHomeAway,
      ),
    })),
    knockout,
    classement: placementEnabled
      ? [
          {
            phaseLabel: "Classement",
            homeTeam: "Éliminé 1",
            awayTeam: "Éliminé 2",
          },
        ]
      : [],
  };
};

const buildMiniLeagueMatches = (config: TournamentConfig) => {
  return flattenTournamentStructure(buildDynamicTournamentStructure(config));
};

const countGroupStageMatches = (config: TournamentConfig) => {
  const teams = buildPreviewTeams(config);
  const groups =
    config.autoFormat === "mini_league" && config.groupCount === 1
      ? [teams]
      : buildGroupBuckets(teams, config.groupCount);

  return groups.reduce((total, groupTeams) => {
    const size = groupTeams.length;
    return total + (size * (size - 1)) / 2;
  }, 0);
};

const buildGroupKnockoutMatches = (config: TournamentConfig) => {
  return flattenTournamentStructure(buildDynamicTournamentStructure(config));
};

const buildTournamentBracketMatches = (config: TournamentConfig) => {
  return flattenTournamentStructure(buildDynamicTournamentStructure(config));
};

const calculateTournamentCapacity = (
  startTime: string,
  endTime: string,
  matchDuration: number,
  breakMinutes: number,
  lunchBreakMinutes: number,
  fieldCount: number,
) => {
  const normalizedMatchDuration = Math.max(1, toSafeNonNegativeInteger(matchDuration, 1));
  const normalizedBreakMinutes = Math.max(0, toSafeNonNegativeInteger(breakMinutes, 0));
  const normalizedLunchBreakMinutes = Math.max(0, toSafeNonNegativeInteger(lunchBreakMinutes, 0));
  const normalizedFieldCount = Math.max(1, toSafeNonNegativeInteger(fieldCount, 1));
  const slotDuration = Math.max(1, normalizedMatchDuration + normalizedBreakMinutes);
  const totalMinutes = Math.max(
    0,
    toMinutes(endTime) - toMinutes(startTime) - normalizedLunchBreakMinutes,
  );
  const slots = Math.floor(totalMinutes / slotDuration);
  const matchesPossible = slots * normalizedFieldCount;

  return {
    slotDuration,
    totalMinutes,
    slots,
    matchesPossible,
  };
};

const buildPhaseBlocks = (matches: TournamentGeneratedMatch[]) => {
  const blocks: TournamentGeneratedMatch[][] = [];
  matches.forEach((match) => {
    const lastBlock = blocks.at(-1);
    if (!lastBlock || lastBlock[0]?.phaseLabel !== match.phaseLabel) {
      blocks.push([match]);
      return;
    }
    lastBlock.push(match);
  });
  return blocks;
};

const chunkMatches = (matches: TournamentGeneratedMatch[], chunkSize: number) => {
  const chunks: TournamentGeneratedMatch[][] = [];

  for (let index = 0; index < matches.length; index += chunkSize) {
    chunks.push(matches.slice(index, index + chunkSize));
  }

  return chunks;
};

const buildInterleavedGroupStageBlocks = (
  structure: TournamentStructure,
  groupHomeAway: boolean,
) => {
  const roundsByGroup = structure.groups.map((group) => {
    const matchesPerRound = Math.max(1, Math.floor(group.teams.length / 2));
    const validMatches = group.matches.filter(isValidGeneratedMatch);

    if (!groupHomeAway) {
      return chunkMatches(validMatches, matchesPerRound);
    }

    const baseRoundCount = Math.max(
      1,
      Math.floor(validMatches.length / Math.max(1, matchesPerRound * 2)),
    );
    const firstLegMatchCount = baseRoundCount * matchesPerRound;
    const firstLegRounds = chunkMatches(validMatches.slice(0, firstLegMatchCount), matchesPerRound);
    const returnLegRounds = chunkMatches(validMatches.slice(firstLegMatchCount), matchesPerRound);

    return [...firstLegRounds, ...returnLegRounds];
  });

  const maxRoundCount = Math.max(0, ...roundsByGroup.map((rounds) => rounds.length));
  const interleavedBlocks: TournamentGeneratedMatch[][] = [];

  for (let roundIndex = 0; roundIndex < maxRoundCount; roundIndex += 1) {
    const roundBlock: TournamentGeneratedMatch[] = [];

    roundsByGroup.forEach((groupRounds) => {
      const roundMatches = groupRounds[roundIndex] ?? [];
      roundBlock.push(...roundMatches);
    });

    if (roundBlock.length > 0) {
      interleavedBlocks.push(roundBlock);
    }
  }

  return interleavedBlocks;
};

const getPlanningNodeId = (
  match: TournamentGeneratedMatch,
  counters: Record<string, number>,
) => {
  const next = (prefix: string) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}${counters[prefix]}`;
  };

  if (/Huiti[eè]me de finale/i.test(match.phaseLabel)) return next("H");
  if (/Quart de finale/i.test(match.phaseLabel)) return next("QF");
  if (/Demi-finale/i.test(match.phaseLabel)) return next("DF");
  if (/Classement 5e-8e/i.test(match.phaseLabel)) return next("C");
  if (/Classement 9e-16e|Classement 9e-12e|Classement 13e-16e/i.test(match.phaseLabel)) return next("B");
  if (/Classement 5e place/i.test(match.phaseLabel)) return next("P5");
  if (/Classement 7e place/i.test(match.phaseLabel)) return next("P7");
  if (/Classement 9e place/i.test(match.phaseLabel)) return next("P9");
  if (/Classement 11e place/i.test(match.phaseLabel)) return next("P11");
  if (/Classement 13e place/i.test(match.phaseLabel)) return next("P13");
  if (/Classement 15e place/i.test(match.phaseLabel)) return next("P15");
  if (/3e place/i.test(match.phaseLabel)) return next("TP");
  if (/Finale/i.test(match.phaseLabel)) return next("F");
  return next("M");
};

const getPlanningNodeStageLevel = (match: TournamentGeneratedMatch, teamCount: number) => {
  const isBottomTablePlacementFinalLabel =
    /Classement 9e place|Classement 11e place|Classement 13e place|Classement 15e place/i.test(
      match.phaseLabel,
    );
  if (teamCount >= 16 && /Huiti[eè]me de finale/i.test(match.phaseLabel)) return 1;
  if (/Classement 9e-16e/i.test(match.phaseLabel)) return teamCount >= 16 ? 2 : 1;
  if (/Classement 9e-12e|Classement 13e-16e/i.test(match.phaseLabel))
    return teamCount >= 16 ? 4 : 1;
  if (teamCount === 10 && /Classement 9e place/i.test(match.phaseLabel)) return 1;
  if (/Huiti[eè]me de finale|Quart de finale/i.test(match.phaseLabel)) return teamCount >= 16 ? 3 : 2;
  if (/Classement 13e place|Classement 15e place/i.test(match.phaseLabel))
    return teamCount >= 16 ? 5 : 3;
  if (/Classement 5e-8e|Classement 9e place|Classement 11e place/i.test(match.phaseLabel)) {
    if (teamCount >= 16) return 6;
    return 3;
  }
  if (/Demi-finale/i.test(match.phaseLabel)) return teamCount >= 16 ? 7 : 4;
  if (
    /Classement 5e place|Classement 7e place/i.test(match.phaseLabel) ||
    (teamCount >= 16 && isBottomTablePlacementFinalLabel)
  ) {
    if (teamCount >= 16 && isBottomTablePlacementFinalLabel) return 6;
    return teamCount >= 16 ? 8 : 5;
  }
  if (/3e place/i.test(match.phaseLabel)) return teamCount >= 16 ? 9 : 6;
  if (/Finale/i.test(match.phaseLabel)) return teamCount >= 16 ? 10 : 7;
  return 99;
};

const getPlanningNodeInStagePriority = (
  match: TournamentGeneratedMatch,
  teamCount: number,
) => {
  if (teamCount >= 16 && /Huiti[eè]me de finale/i.test(match.phaseLabel)) return 5;
  if (/Classement 9e-16e/i.test(match.phaseLabel)) return teamCount >= 16 ? 20 : 5;
  if (/Classement 13e-16e/i.test(match.phaseLabel)) return teamCount >= 16 ? 40 : 25;
  if (/Classement 9e-12e/i.test(match.phaseLabel)) return teamCount >= 16 ? 45 : 10;
  if (teamCount === 10 && /Classement 9e place/i.test(match.phaseLabel)) return 10;
  if (/Huiti[eè]me de finale|Quart de finale/i.test(match.phaseLabel)) return teamCount >= 16 ? 30 : 20;
  if (/Classement 15e place/i.test(match.phaseLabel)) return teamCount >= 16 ? 55 : 55;
  if (/Classement 13e place/i.test(match.phaseLabel)) return teamCount >= 16 ? 56 : 56;
  if (/Classement 5e-8e/i.test(match.phaseLabel)) return teamCount >= 16 ? 60 : 30;
  if (teamCount >= 16 && /Classement 11e place/i.test(match.phaseLabel)) return 61;
  if (teamCount >= 16 && /Classement 9e place/i.test(match.phaseLabel)) return 62;
  if (!teamCount || teamCount < 16) {
    if (/Classement 11e place/i.test(match.phaseLabel)) return 40;
    if (/Classement 9e place/i.test(match.phaseLabel)) return 50;
  }
  if (/Demi-finale/i.test(match.phaseLabel)) return teamCount >= 16 ? 70 : 60;
  if (/Classement 7e place/i.test(match.phaseLabel)) return teamCount >= 16 ? 80 : 70;
  if (/Classement 5e place/i.test(match.phaseLabel)) return teamCount >= 16 ? 81 : 80;
  if (/3e place/i.test(match.phaseLabel)) return teamCount >= 16 ? 90 : 90;
  if (/Finale/i.test(match.phaseLabel)) return teamCount >= 16 ? 100 : 100;
  return 999;
};

const extractPlanningDependencies = (match: TournamentGeneratedMatch) => {
  const references = `${match.homeTeam} ${match.awayTeam}`;
  const dependencies = new Set<string>();
  const dependencyPatterns = [
    /(?:Vainqueur|Perdant)\s+(H\d+)/gi,
    /(?:Vainqueur|Perdant)\s+(QF\d+)/gi,
    /(?:Vainqueur|Perdant)\s+(DF\d+)/gi,
    /(?:Vainqueur|Perdant)\s+(C\d+)/gi,
  ];

  dependencyPatterns.forEach((pattern) => {
    const matches = references.matchAll(pattern);
    for (const matchResult of matches) {
      const dependencyId = matchResult[1];
      if (dependencyId) {
        dependencies.add(dependencyId);
      }
    }
  });

  return [...dependencies];
};

const buildPlanningBlocksFromNodes = (nodes: TournamentPlanningNode[]) => {
  const blocks: TournamentGeneratedMatch[][] = [];
  const pending = new Map(nodes.map((node) => [node.id, node]));
  const resolved = new Set<string>();

  while (pending.size > 0) {
    const availableNodes = [...pending.values()].filter((node) =>
      node.dependsOn.every((dependency) => resolved.has(dependency)),
    );
    const sourceNodes = availableNodes.length > 0 ? availableNodes : [...pending.values()];
    const currentStageLevel = Math.min(
      ...sourceNodes.map((node) => node.stageLevel),
    );
    const blockNodes = sourceNodes
      .filter((node) => node.stageLevel === currentStageLevel)
      .sort((left, right) => {
        const priorityGap = left.priority - right.priority;
        if (priorityGap !== 0) return priorityGap;
        return left.id.localeCompare(right.id, "fr");
      });

    if (blockNodes.length === 0) {
      break;
    }

    blocks.push(blockNodes.map((node) => node.match));
    blockNodes.forEach((node) => {
      pending.delete(node.id);
      resolved.add(node.id);
    });
  }

  return blocks;
};

const buildGroupKnockoutFinalStageBlocks = (
  config: TournamentConfig,
  structure: TournamentStructure,
) => {
  const counters: Record<string, number> = {};
  const nodes = [...structure.knockout, ...structure.classement]
    .filter(isValidGeneratedMatch)
    .map((match, index) => {
      const id = getPlanningNodeId(match, counters);
      return {
        id,
        match,
        dependsOn: extractPlanningDependencies(match),
        stageLevel: getPlanningNodeStageLevel(match, Math.max(0, config.teamCount)),
        priority:
          getPlanningNodeInStagePriority(match, Math.max(0, config.teamCount)) * 100 +
          index,
      } satisfies TournamentPlanningNode;
    });

  return buildPlanningBlocksFromNodes(nodes);
};

const buildAutoPhaseBlocks = (
  config: TournamentConfig,
  structure: TournamentStructure,
) => {
  const groupBlocks = buildInterleavedGroupStageBlocks(
    structure,
    config.groupHomeAway,
  ).map((block) => block.filter(isValidGeneratedMatch));
  const allFinalStageMatches = [...structure.knockout, ...structure.classement].filter(isValidGeneratedMatch);
  const blocks: TournamentGeneratedMatch[][] = [];

  if (config.autoFormat === "group_knockout") {
    blocks.push(...groupBlocks);
    blocks.push(...buildGroupKnockoutFinalStageBlocks(config, structure));
    return blocks.filter((block) => block.length > 0);
  } else if (config.autoFormat === "tournament_bracket") {
    if (config.teamCount === 16) {
      const uefaQuarterMatches = structure.knockout.filter(
        (match) => match.stage === "bracket16_uefa_quarter",
      );
      const europaQuarterMatches = structure.classement.filter(
        (match) => match.stage === "bracket16_europa_quarter",
      );
      const bottomSemiMatches = structure.classement.filter(
        (match) => match.stage === "bracket16_bottom_semi",
      );
      const placementSemiMatches = structure.classement.filter(
        (match) => match.stage === "bracket16_placement_semi",
      );
      const uefaSemiMatches = structure.knockout.filter(
        (match) => match.stage === "bracket16_uefa_semi",
      );
      const europaSemiMatches = structure.classement.filter(
        (match) => match.stage === "bracket16_europa_semi",
      );
      const bottomFinalMatches = structure.classement.filter(
        (match) => match.stage === "bracket16_bottom_final",
      );
      const placementFinalMatches = structure.classement.filter(
        (match) => match.stage === "bracket16_placement_final",
      );
      const placementEuropaMatches = structure.classement.filter(
        (match) => match.stage === "bracket16_europa_placement",
      );
      const placementUefaMatches = structure.knockout.filter(
        (match) => match.stage === "bracket16_uefa_placement",
      );
      const europaFinalMatches = structure.classement.filter(
        (match) => match.stage === "bracket16_europa_final",
      );
      const uefaFinalMatches = structure.knockout.filter(
        (match) => match.stage === "bracket16_uefa_final",
      );

      blocks.push(...groupBlocks);
      blocks.push(
        europaQuarterMatches,
        uefaQuarterMatches,
        bottomSemiMatches,
        placementSemiMatches,
        interleaveStageMatches(europaSemiMatches, uefaSemiMatches),
        bottomFinalMatches,
        placementFinalMatches,
        interleaveStageMatches(placementEuropaMatches, placementUefaMatches),
        europaFinalMatches,
        uefaFinalMatches,
      );
      return blocks.filter((block) => block.length > 0);
    }

    blocks.push(...groupBlocks);
    blocks.push(...buildStageBlocks(allFinalStageMatches));
    return blocks.filter((block) => block.length > 0);
  } else {
    blocks.push(...groupBlocks);
    const genericFinalBlocks = allFinalStageMatches.some((match) => Boolean(match.stage))
      ? buildStageBlocks(allFinalStageMatches)
      : buildPhaseBlocks(allFinalStageMatches);
    blocks.push(...genericFinalBlocks);
  }

  return blocks.filter((block) => block.length > 0);
};

const getMatchTeams = (match: TournamentGeneratedMatch) => [match.homeTeam, match.awayTeam];

const getGeneratedMatchDuration = (
  match: TournamentGeneratedMatch,
  baseDuration: number,
) => (/Finale.*aller-retour/i.test(match.phaseLabel) ? baseDuration * 2 : baseDuration);

const getMatchRestScore = (
  match: TournamentGeneratedMatch,
  slotIndex: number,
  teamLastSlotMap: Record<string, number>,
  teamRestBalance: Record<string, number>,
) => {
  const teams = getMatchTeams(match);
  let score = 0;
  const balanceValues = Object.values(teamRestBalance);
  const averageBalance =
    balanceValues.length > 0
      ? balanceValues.reduce((total, value) => total + value, 0) / balanceValues.length
      : 0;

  teams.forEach((team) => {
    const lastSlot = teamLastSlotMap[team];

    if (typeof lastSlot !== "number") {
      score += 75;
      return;
    }

    const restSlots = slotIndex - lastSlot - 1;

    if (restSlots >= COMFORT_TEAM_REST_SLOTS) {
      score += 150;
      return;
    }

    if (restSlots >= MIN_TEAM_REST_SLOTS) {
      score += 100;
      return;
    }

    if (restSlots === 1) {
      score -= 50;
      return;
    }

    score -= 100;
  });

  teams.forEach((team) => {
    const currentBalance = teamRestBalance[team] ?? averageBalance;
    score -= Math.abs(currentBalance - averageBalance);
  });

  return score;
};

const getMatchImportance = (match: TournamentGeneratedMatch) => {
  if (/Finale/i.test(match.phaseLabel)) return 100;
  if (/Demi-finale/i.test(match.phaseLabel)) return 80;
  if (/Huiti[eè]me de finale|Quart de finale/i.test(match.phaseLabel)) return 60;
  if (/3e place/i.test(match.phaseLabel)) return 50;
  if (/Classement/i.test(match.phaseLabel)) return 30;
  return 20;
};

const getScheduleSlotDisplayPriority = (phaseLabel: string) => {
  if (/Classement 15e place/i.test(phaseLabel)) return 10;
  if (/Classement 13e place/i.test(phaseLabel)) return 20;
  if (/Classement 11e place/i.test(phaseLabel)) return 30;
  if (/Classement 9e place/i.test(phaseLabel)) return 40;
  if (/Classement 7e place/i.test(phaseLabel)) return 50;
  if (/Classement 5e place/i.test(phaseLabel)) return 60;
  if (/3e place/i.test(phaseLabel)) return 70;
  if (/Finale/i.test(phaseLabel)) return 80;
  return 999;
};

const isValidGeneratedMatch = (
  match: TournamentGeneratedMatch | null | undefined,
): match is TournamentGeneratedMatch =>
  Boolean(
    match &&
      typeof match.phaseLabel === "string" &&
      match.phaseLabel.trim() &&
      typeof match.homeTeam === "string" &&
      match.homeTeam.trim() &&
      typeof match.awayTeam === "string" &&
      match.awayTeam.trim(),
  );

const getScheduleFinalEndMinutes = (schedule: TournamentScheduleMatch[]) =>
  schedule.reduce((latest, match) => Math.max(latest, toMinutes(match.endTime)), 0);

const isScheduleCoherent = (schedule: TournamentScheduleMatch[]) => {
  if (schedule.length === 0) return true;

  const matchesByField = new Map<string, TournamentScheduleMatch[]>();
  const matchesByStart = new Map<string, TournamentScheduleMatch[]>();

  for (const match of schedule) {
    const start = toMinutes(match.startTime);
    const end = toMinutes(match.endTime);
    const isPause = isPauseScheduleMatch(match);

    if (
      !match.fieldLabel ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start
    ) {
      return false;
    }

    if (!isPause && (!match.homeTeam || !match.awayTeam)) {
      return false;
    }

    const fieldMatches = matchesByField.get(match.fieldLabel) ?? [];
    fieldMatches.push(match);
    matchesByField.set(match.fieldLabel, fieldMatches);

    const slotMatches = matchesByStart.get(match.startTime) ?? [];
    slotMatches.push(match);
    matchesByStart.set(match.startTime, slotMatches);
  }

  for (const fieldMatches of matchesByField.values()) {
    const orderedMatches = [...fieldMatches].sort(
      (left, right) => toMinutes(left.startTime) - toMinutes(right.startTime),
    );

    for (let index = 1; index < orderedMatches.length; index += 1) {
      const previousEnd = toMinutes(orderedMatches[index - 1]?.endTime ?? "00:00");
      const currentStart = toMinutes(orderedMatches[index]?.startTime ?? "00:00");
      if (currentStart < previousEnd) {
        return false;
      }
    }
  }

  for (const slotMatches of matchesByStart.values()) {
    const teamsInSlot = new Set<string>();
    for (const match of slotMatches) {
      if (isPauseScheduleMatch(match)) {
        continue;
      }
      const teams = [match.homeTeam, match.awayTeam];
      if (teams.some((team) => teamsInSlot.has(team))) {
        return false;
      }
      teams.forEach((team) => teamsInSlot.add(team));
    }
  }

  return true;
};

const buildScheduledSlots = (
  matches: TournamentGeneratedMatch[],
  fieldCount: number,
  startSlotIndex: number,
  initialTeamLastSlotMap: Record<string, number>,
  initialTeamRestBalance: Record<string, number>,
) => {
  const normalizedFieldCount = Math.max(1, toSafeNonNegativeInteger(fieldCount, 1));
  const remaining = [...matches].filter(isValidGeneratedMatch);
  const slots: TournamentGeneratedMatch[][] = [];
  const teamLastSlotMap = { ...initialTeamLastSlotMap };
  const teamRestBalance = { ...initialTeamRestBalance };
  let currentSlotIndex = startSlotIndex;
  let lastSlotTeams = new Set<string>();

  const getBestCandidateScoreForSlot = (slotIndex: number) => {
    let bestScore = Number.NEGATIVE_INFINITY;

    remaining.forEach((candidate, candidateIndex) => {
      const teams = getMatchTeams(candidate);
      const restScore = getMatchRestScore(
        candidate,
        slotIndex,
        teamLastSlotMap,
        teamRestBalance,
      );
      const placeholderPenalty = teams.some(
        (team) =>
          team.startsWith("Vainqueur") ||
          team.startsWith("Perdant") ||
          /^[1-9][A-Z]$/.test(team) ||
          team.includes("Meilleur"),
      )
        ? -5
        : 0;
      const noPreviousSlotConflictBonus =
        lastSlotTeams.size > 0 && teams.every((team) => !lastSlotTeams.has(team)) ? 200 : 0;
      const importanceBonus = getMatchImportance(candidate) * 0.2;
      const candidateScore =
        restScore +
        placeholderPenalty +
        importanceBonus +
        noPreviousSlotConflictBonus -
        candidateIndex * 0.001;
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
      }
    });

    return bestScore;
  };

  while (remaining.length > 0) {
    const currentBestScore = getBestCandidateScoreForSlot(currentSlotIndex);
    const allRemainingConflictWithPreviousSlot =
      lastSlotTeams.size > 0 &&
      remaining.every((match) =>
        getMatchTeams(match).some((team) => lastSlotTeams.has(team)),
      );

    if (currentBestScore < 0 && allRemainingConflictWithPreviousSlot) {
      const nextBestScore = getBestCandidateScoreForSlot(currentSlotIndex + 1);
      slots.push([]);
      currentSlotIndex += 1;

      if (nextBestScore >= currentBestScore) {
        continue;
      }
    }

    const slotTeams = new Set<string>();
    const slotMatches: TournamentGeneratedMatch[] = [];
    const slotScores: number[] = [];

    while (slotMatches.length < normalizedFieldCount && remaining.length > 0) {
      let bestIndex = -1;
      let bestScore = Number.NEGATIVE_INFINITY;

      remaining.forEach((candidate, candidateIndex) => {
        const teams = getMatchTeams(candidate);
        const hasConflict = teams.some((team) => slotTeams.has(team));
        if (hasConflict) return;

        const restScore = getMatchRestScore(
          candidate,
          currentSlotIndex,
          teamLastSlotMap,
          teamRestBalance,
        );
        const placeholderPenalty = teams.some(
          (team) =>
            team.startsWith("Vainqueur") ||
            team.startsWith("Perdant") ||
            /^[1-9][A-Z]$/.test(team) ||
            team.includes("Meilleur"),
        )
          ? -5
          : 0;
        const noPreviousSlotConflictBonus =
          lastSlotTeams.size > 0 && teams.every((team) => !lastSlotTeams.has(team)) ? 200 : 0;
        const importanceBonus = getMatchImportance(candidate) * 0.2;
        const candidateScore =
          restScore +
          placeholderPenalty +
          importanceBonus +
          noPreviousSlotConflictBonus -
          candidateIndex * 0.001;

        if (candidateScore > bestScore) {
          bestScore = candidateScore;
          bestIndex = candidateIndex;
        }
      });

      if (bestIndex < 0) break;

      const [selected] = remaining.splice(bestIndex, 1);
      slotMatches.push(selected);
      slotScores.push(bestScore);
      getMatchTeams(selected).forEach((team) => slotTeams.add(team));
    }

    if (slotMatches.length === 0) {
      const forcedMatch = remaining.shift();
      if (!forcedMatch) {
        break;
      }
      slots.push([forcedMatch]);
      getMatchTeams(forcedMatch).forEach((team) => {
        teamLastSlotMap[team] = currentSlotIndex;
      });
      lastSlotTeams = new Set(getMatchTeams(forcedMatch));
      currentSlotIndex += 1;
      continue;
    }

    if (slotScores.some((score) => score < 0) && allRemainingConflictWithPreviousSlot) {
      slotMatches
        .slice()
        .reverse()
        .forEach((match) => {
          remaining.unshift(match);
        });
      slots.push([]);
      currentSlotIndex += 1;
      continue;
    }

    slots.push(slotMatches);
    slotMatches.forEach((match) => {
      getMatchTeams(match).forEach((team) => {
        const previousSlot = teamLastSlotMap[team];
        if (typeof previousSlot === "number") {
          const restSlots = currentSlotIndex - previousSlot - 1;
          teamRestBalance[team] = (teamRestBalance[team] ?? 0) + restSlots;
        }
        teamLastSlotMap[team] = currentSlotIndex;
      });
    });
    lastSlotTeams = new Set(
      slotMatches.flatMap((match) => getMatchTeams(match)),
    );
    currentSlotIndex += 1;
  }

  return {
    slots,
    teamLastSlotMap,
    teamRestBalance,
    nextSlotIndex: currentSlotIndex,
  };
};

const canMergeScheduledSlots = (
  left: { matches: TournamentGeneratedMatch[]; section: "group" | "final"; blockIndex: number },
  right: { matches: TournamentGeneratedMatch[]; section: "group" | "final"; blockIndex: number },
  fieldCount: number,
) => {
  if (left.section !== right.section) return false;
  if (left.blockIndex !== right.blockIndex) return false;
  if (left.matches.length === 0 || right.matches.length === 0) return false;
  if (left.matches.length + right.matches.length > Math.max(1, fieldCount)) return false;

  const leftHasFinal = left.matches.some((match) => /Finale/i.test(match.phaseLabel));
  const rightHasFinal = right.matches.some((match) => /Finale/i.test(match.phaseLabel));
  if (leftHasFinal || rightHasFinal) return false;

  const teams = new Set(left.matches.flatMap((match) => getMatchTeams(match)));
  return right.matches.every((match) =>
    getMatchTeams(match).every((team) => !teams.has(team)),
  );
};

const compactScheduledSlots = (
  slots: Array<{ matches: TournamentGeneratedMatch[]; section: "group" | "final"; blockIndex: number }>,
  fieldCount: number,
) => {
  const compacted: Array<{
    matches: TournamentGeneratedMatch[];
    section: "group" | "final";
    blockIndex: number;
  }> = [];

  slots.forEach((slot) => {
    const lastSlot = compacted.at(-1);
    if (lastSlot && canMergeScheduledSlots(lastSlot, slot, fieldCount)) {
      lastSlot.matches.push(...slot.matches);
      return;
    }

    compacted.push({
      section: slot.section,
      blockIndex: slot.blockIndex,
      matches: [...slot.matches],
    });
  });

  return compacted;
};

const rebalanceScheduledSlots = (
  slots: Array<{ matches: TournamentGeneratedMatch[]; section: "group" | "final"; blockIndex: number }>,
  fieldCount: number,
) => {
  const rebalanced = slots.map((slot) => ({
    section: slot.section,
    blockIndex: slot.blockIndex,
    matches: [...slot.matches],
  }));

  for (let slotIndex = 0; slotIndex < rebalanced.length; slotIndex += 1) {
    const currentSlot = rebalanced[slotIndex];
    if (!currentSlot) continue;

    const currentHasFinal = currentSlot.matches.some((match) => /Finale/i.test(match.phaseLabel));
    if (currentHasFinal) continue;

    while (currentSlot.matches.length < Math.max(1, fieldCount)) {
      const currentTeams = new Set(
        currentSlot.matches.flatMap((match) => getMatchTeams(match)),
      );

      let moved = false;

      for (let lookaheadIndex = slotIndex + 1; lookaheadIndex < rebalanced.length; lookaheadIndex += 1) {
        const lookaheadSlot = rebalanced[lookaheadIndex];
        if (
          !lookaheadSlot ||
          lookaheadSlot.section !== currentSlot.section ||
          lookaheadSlot.blockIndex !== currentSlot.blockIndex
        ) {
          break;
        }

        if (lookaheadSlot.matches.some((match) => /Finale/i.test(match.phaseLabel))) {
          break;
        }

        const candidateIndex = lookaheadSlot.matches.findIndex((match) => {
          const teams = getMatchTeams(match);
          return teams.every((team) => !currentTeams.has(team));
        });

        if (candidateIndex < 0) {
          continue;
        }

        const [candidate] = lookaheadSlot.matches.splice(candidateIndex, 1);
        currentSlot.matches.push(candidate);
        moved = true;

        if (lookaheadSlot.matches.length === 0) {
          rebalanced.splice(lookaheadIndex, 1);
        }
        break;
      }

      if (!moved) {
        break;
      }
    }
  }

  return rebalanced;
};

const buildAutoSchedule = (config: TournamentConfig) => {
  const structure = buildDynamicTournamentStructure(config);
  const sourceMatches = flattenTournamentStructure(structure).filter(isValidGeneratedMatch);
  const capacity = calculateTournamentCapacity(
    config.startTime,
    config.endTime,
    config.matchDuration,
    config.breakMinutes,
    config.lunchBreakMinutes,
    config.fieldCount,
  );
  const schedule: TournamentScheduleMatch[] = [];
  const normalizedFieldCount = Math.max(1, toSafeNonNegativeInteger(config.fieldCount, 1));
  const normalizedMatchDuration = Math.max(1, toSafeNonNegativeInteger(config.matchDuration, 1));
  const normalizedLunchBreak = Math.max(0, toSafeNonNegativeInteger(config.lunchBreakMinutes, 0));
  const startMinutes = toMinutes(config.startTime);
  const phaseBlocks = buildAutoPhaseBlocks(config, structure);
  const scheduledSlots: Array<{
    matches: TournamentGeneratedMatch[];
    section: "group" | "final";
    blockIndex: number;
  }> = [];
  let teamLastSlotMap: Record<string, number> = {};
  let teamRestBalance: Record<string, number> = {};
  let nextSlotIndex = 0;

  phaseBlocks.forEach((phaseMatches, blockIndex) => {
    const section: "group" | "final" =
      phaseMatches.every((match) => isGroupStageRoundLabel(match.phaseLabel))
        ? "group"
        : "final";
    const {
      slots,
      teamLastSlotMap: nextTeamLastSlotMap,
      teamRestBalance: nextTeamRestBalance,
      nextSlotIndex: updatedSlotIndex,
    } = buildScheduledSlots(
      phaseMatches,
      normalizedFieldCount,
      nextSlotIndex,
      teamLastSlotMap,
      teamRestBalance,
    );
    scheduledSlots.push(...slots.map((matches) => ({ matches, section, blockIndex })));
    teamLastSlotMap = nextTeamLastSlotMap;
    teamRestBalance = nextTeamRestBalance;
    nextSlotIndex = updatedSlotIndex;
  });

  const compactedScheduledSlots = compactScheduledSlots(
    scheduledSlots,
    normalizedFieldCount,
  );
  const optimizedScheduledSlots = rebalanceScheduledSlots(
    compactedScheduledSlots,
    normalizedFieldCount,
  );

  const noonMinutes = 12 * 60;
  const slotDurations = optimizedScheduledSlots.map((slot) =>
    slot.matches.length > 0
      ? Math.max(
          ...slot.matches.map((match) =>
            getGeneratedMatchDuration(match, normalizedMatchDuration),
          ),
        )
      : normalizedMatchDuration,
  );
  const slotGapMinutes = Math.max(0, toSafeNonNegativeInteger(config.breakMinutes, 0));
  const provisionalSlotStartTimes: number[] = [];
  let provisionalCurrentSlotStart = startMinutes;

  slotDurations.forEach((slotDuration, slotIndex) => {
    provisionalSlotStartTimes[slotIndex] = provisionalCurrentSlotStart;
    provisionalCurrentSlotStart += slotDuration + slotGapMinutes;
  });

  const lunchBreakAfterSlot =
    normalizedLunchBreak > 0 &&
    optimizedScheduledSlots.length > 0 &&
    startMinutes < noonMinutes
      ? provisionalSlotStartTimes.findIndex((slotStart) => slotStart >= noonMinutes)
      : -1;

  const slotStartTimes: number[] = [];
  let currentSlotStart = startMinutes;

  slotDurations.forEach((slotDuration, slotIndex) => {
    if (lunchBreakAfterSlot >= 0 && slotIndex === lunchBreakAfterSlot) {
      currentSlotStart += normalizedLunchBreak;
    }

    slotStartTimes[slotIndex] = currentSlotStart;
    currentSlotStart += slotDuration + slotGapMinutes;
  });

  const fieldUsage = Array.from({ length: normalizedFieldCount }, () => 0);
  const teamLastTerrainMap: Record<string, string> = {};

  optimizedScheduledSlots.forEach((slot, slotIndex) => {
    const slotMatches = [...slot.matches].sort((left, right) => {
      const priorityGap =
        getScheduleSlotDisplayPriority(left.phaseLabel) -
        getScheduleSlotDisplayPriority(right.phaseLabel);
      if (priorityGap !== 0) return priorityGap;
      return left.phaseLabel.localeCompare(right.phaseLabel, "fr");
    });
    const slotStart = slotStartTimes[slotIndex] ?? startMinutes;

    if (
      lunchBreakAfterSlot >= 0 &&
      normalizedLunchBreak > 0 &&
      slotIndex === lunchBreakAfterSlot
    ) {
      const lunchStart = slotStart - normalizedLunchBreak;
      Array.from({ length: normalizedFieldCount }, (_, terrainIndex) => {
        schedule.push({
          id: `lunch-${slotIndex}-${terrainIndex + 1}`,
          roundLabel: "Pause repas",
          slotIndex: slotIndex - 0.5,
          fieldLabel: `Terrain ${terrainIndex + 1}`,
          startTime: toTimeLabel(lunchStart),
          endTime: toTimeLabel(slotStart),
          homeTeam: "",
          awayTeam: "",
          type: "pause",
          isPause: true,
          label: "Pause repas",
          scheduleSection: slot.section,
        });
      });
    }

    const remainingTerrainIndexes = new Set(
      Array.from({ length: normalizedFieldCount }, (_, terrainIndex) => terrainIndex),
    );

    const finalMatchIndex = slotMatches.findIndex((match) => /Finale/i.test(match.phaseLabel));
    if (finalMatchIndex > 0) {
      const [finalMatch] = slotMatches.splice(finalMatchIndex, 1);
      slotMatches.unshift(finalMatch);
    }

    slotMatches.forEach((match) => {
      const terrainIndex =
        /Finale/i.test(match.phaseLabel) && remainingTerrainIndexes.has(0)
          ? 0
          : [...remainingTerrainIndexes].sort((left, right) => {
              const leftFieldLabel = `Terrain ${left + 1}`;
              const rightFieldLabel = `Terrain ${right + 1}`;
              const usageGap = fieldUsage[left] - fieldUsage[right];
              const leftTeams = getMatchTeams(match);
              const rightTeams = getMatchTeams(match);
              const leftTerrainBonus = leftTeams.reduce((total, team) => {
                return total + (teamLastTerrainMap[team] !== leftFieldLabel ? 20 : 0);
              }, 0);
              const rightTerrainBonus = rightTeams.reduce((total, team) => {
                return total + (teamLastTerrainMap[team] !== rightFieldLabel ? 20 : 0);
              }, 0);
              const scoreGap = rightTerrainBonus - leftTerrainBonus;

              if (usageGap !== 0) return usageGap;
              if (scoreGap !== 0) return scoreGap;
              return left - right;
            })[0] ?? 0;
      remainingTerrainIndexes.delete(terrainIndex);
      const matchDuration = getGeneratedMatchDuration(match, normalizedMatchDuration);
      const fieldLabel = `Terrain ${terrainIndex + 1}`;
      schedule.push({
        id: buildId(),
        roundLabel: match.phaseLabel,
        slotIndex,
        stage: match.stage,
        leg: match.leg,
        fieldLabel,
        startTime: toTimeLabel(slotStart),
        endTime: toTimeLabel(slotStart + matchDuration),
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        type: "match",
        scheduleSection: slot.section,
      });
      fieldUsage[terrainIndex] = (fieldUsage[terrainIndex] ?? 0) + 1;
      getMatchTeams(match).forEach((team) => {
        teamLastTerrainMap[team] = fieldLabel;
      });
    });

    const shouldShowEmptyTerrain =
      slotMatches.some((match) => /Finale/i.test(match.phaseLabel)) &&
      remainingTerrainIndexes.size > 0;

    if (shouldShowEmptyTerrain) {
      [...remainingTerrainIndexes].forEach((terrainIndex) => {
        schedule.push({
          id: `pause-${slotIndex}-${terrainIndex + 1}`,
          roundLabel: "Pause",
          slotIndex,
          fieldLabel: `Terrain ${terrainIndex + 1}`,
          startTime: toTimeLabel(slotStart),
          endTime: toTimeLabel(slotStart + normalizedMatchDuration),
          homeTeam: "",
          awayTeam: "",
          type: "pause",
          isPause: true,
          label: "Pas de match",
          scheduleSection: slot.section,
        });
      });
    }
  });

  const orderedSchedule = [...schedule].sort((left, right) => {
    const startGap = toMinutes(left.startTime) - toMinutes(right.startTime);
    if (startGap !== 0) return startGap;
    return left.fieldLabel.localeCompare(right.fieldLabel, "fr");
  });
  const finalEndMinutes = getScheduleFinalEndMinutes(orderedSchedule);
  const startWindowMinutes = toMinutes(config.startTime);
  const endWindowMinutes = toMinutes(config.endTime);
  const hasTimeWindow =
    Boolean(config.startTime && config.endTime) && endWindowMinutes > startWindowMinutes;
  const totalWindowMinutes = hasTimeWindow
    ? Math.max(0, endWindowMinutes - startWindowMinutes)
    : Number.POSITIVE_INFINITY;
  const scheduleDuration = Math.max(0, finalEndMinutes - startMinutes);
  const endWithinWindow = !hasTimeWindow || finalEndMinutes <= endWindowMinutes;
  const durationCoherent =
    Number.isFinite(scheduleDuration) && scheduleDuration <= totalWindowMinutes;
  const requiredMatches = toSafeNonNegativeInteger(sourceMatches.length, 0);
  const matchesPossible = toSafeNonNegativeInteger(capacity.matchesPossible, 0);
  const scheduleCoherent = isScheduleCoherent(orderedSchedule);

  return {
    schedule: orderedSchedule,
    capacity,
    requiredMatches,
    windowFits:
      requiredMatches <= matchesPossible &&
      endWithinWindow &&
      durationCoherent &&
      scheduleCoherent,
  };
};

const buildSuggestionPreview = (
  config: TournamentConfig,
  suggestion: TournamentAutoSuggestion,
) => {
  const previewConfig: TournamentConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    teamCount: suggestion.teamCount,
    autoFormat: suggestion.format,
    groupCount: suggestion.groupCount,
    teamsPerGroup: suggestion.teamsPerGroup,
    matchDuration: suggestion.matchDuration,
    breakMinutes: suggestion.breakMinutes,
    lunchBreakMinutes: suggestion.lunchBreakMinutes,
    groupHomeAway: suggestion.groupHomeAway,
  };
  const previewTeams = buildPreviewTeams(previewConfig);
  const groups =
    suggestion.format === "mini_league" && suggestion.groupCount === 1
      ? [
          {
            title: "Mini League",
            teams: previewTeams.map((team, index) => `${index + 1}. ${team.name}`),
          },
        ]
      : buildGroupBuckets(previewTeams, suggestion.groupCount).map((groupTeams, index) => ({
          title: `Poule ${String.fromCharCode(65 + index)}`,
          teams: groupTeams.map((team, teamIndex) => `${teamIndex + 1}. ${team.name}`),
        }));

  const sourceMatches =
    suggestion.format === "mini_league"
      ? buildMiniLeagueMatches(previewConfig)
      : suggestion.format === "group_knockout"
        ? buildGroupKnockoutMatches(previewConfig)
        : buildTournamentBracketMatches(previewConfig);

  const phaseMap = new Map<string, string[]>();
  sourceMatches.forEach((match) => {
    if (
      match.phaseLabel.startsWith("Groupe") ||
      match.phaseLabel.startsWith("Poule") ||
      match.phaseLabel === "Mini League"
    ) {
      return;
    }

    const existing = phaseMap.get(match.phaseLabel) ?? [];
    existing.push(`${match.homeTeam} vs ${match.awayTeam}`);
    phaseMap.set(match.phaseLabel, existing);
  });

  const rounds: TournamentPreviewRound[] = PHASE_ORDER.filter((phase) => phaseMap.has(phase)).map(
    (phase) => ({
      title: phase,
      matches: phaseMap.get(phase) ?? [],
    }),
  );

  const note =
    suggestion.groupHomeAway
      ? "Avec aller-retour en phase de poules"
      : config.finalPhase.toLowerCase().includes("consolante") ||
          config.finalPhase.toLowerCase().includes("uefa") ||
          config.finalPhase.toLowerCase().includes("europa")
      ? "Avec tableau principal + consolante"
      : null;

  return { groups, rounds, note };
};

function TournamentFormatPreview({
  config,
  suggestion,
}: {
  config: TournamentConfig;
  suggestion: TournamentAutoSuggestion;
}) {
  const preview = useMemo(
    () => buildSuggestionPreview(config, suggestion),
    [config, suggestion],
  );

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="flex min-w-max items-start gap-3">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Poules
          </p>
          <div className="grid gap-2">
            {preview.groups.map((group) => (
              <div
                key={group.title}
                className="min-w-[150px] rounded-xl border border-white/10 bg-white/[0.04] p-3"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                  {group.title}
                </p>
                <div className="mt-2 space-y-1.5 text-[11px] text-slate-400">
                  {group.teams.map((team) => (
                    <div key={`${group.title}-${team}`} className="truncate">
                      {team}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {preview.rounds.length > 0 ? (
          <>
            <div className="pt-14 text-slate-600">→</div>
            <div className="flex items-start gap-3">
              {preview.rounds.map((round) => (
                <div key={round.title} className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {round.title}
                  </p>
                  <div className="space-y-2">
                    {round.matches.map((match, index) => (
                      <div
                        key={`${round.title}-${index + 1}`}
                        className="min-w-[152px] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-slate-200"
                      >
                        {match}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {preview.note ? (
        <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-violet-200">
          {preview.note}
        </p>
      ) : null}
    </div>
  );
}

function TournamentSuggestionCard({
  config,
  suggestion,
  selected,
  recommended,
  open,
  onTogglePreview,
  onSelect,
}: {
  config: TournamentConfig;
  suggestion: TournamentAutoSuggestion;
  selected: boolean;
  recommended: boolean;
  open: boolean;
  onTogglePreview: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      className={[
        "min-w-[380px] max-w-[380px] shrink-0 rounded-lg border px-3.5 py-3 text-left transition",
        selected
          ? "border-violet-400/40 bg-violet-500/15 text-white shadow-[0_0_18px_rgba(124,58,237,0.25)]"
          : recommended
            ? "border-violet-400/35 bg-violet-600/18 text-white shadow-[0_0_18px_rgba(124,58,237,0.22)]"
          : "border-white/10 bg-black/20 text-slate-200 hover:bg-white/[0.06]",
      ].join(" ")}
    >
      {recommended ? (
        <div className="mb-2 flex items-center gap-2">
          <div className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#f5c400]/35 bg-[#f5c400]/16 text-[#f5c400] shadow-[0_0_16px_rgba(245,196,0,0.28)]">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="currentColor"
            >
              <path d="m12 2 2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 14l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76L12 2Z" />
            </svg>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f5c400]">
            Recommandé
          </span>
        </div>
      ) : null}
      <p className="text-[18px] font-semibold tracking-[-0.03em] text-slate-50">
        {suggestion.label}
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {suggestion.formatLabel}
      </p>
      <p className="mt-2 text-[11px] leading-snug text-slate-300/85">
        Duree match : {suggestion.matchDuration} min
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate-300/85">
        Pause entre match : {suggestion.breakMinutes} min - Pause repas :{" "}
        {suggestion.lunchBreakMinutes} min
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate-300/85">
        {suggestion.requiredMatches} matchs - fin estimee {suggestion.estimatedEndTime || "--:--"}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate-300/75">
        Duree totale utilisee : {suggestion.totalDurationUsed} min
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate-300/75">
        Chaque equipe joue {suggestion.minMatchesPerTeam} à {suggestion.maxMatchesPerTeam} matchs
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate-300/75">
        Intensité : {suggestion.intensity}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate-300/75">
        Optimisation : {suggestion.optimization}
      </p>
      <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        {suggestion.detail}
      </p>
      <p
        className={[
          "mt-1.5 text-[10px] font-semibold",
          suggestion.fits ? "text-emerald-200" : "text-amber-200",
        ].join(" ")}
      >
        {suggestion.requiredMatches} matchs • {suggestion.matchesPossible} possibles
      </p>

      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
        <button
          type="button"
          onClick={onTogglePreview}
          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-200 transition hover:bg-white/10"
        >
          {open ? "Masquer" : "Voir"}
        </button>
        <button
          type="button"
          onClick={onSelect}
          className="rounded-full border border-fuchsia-300/30 bg-violet-600 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-white shadow-[0_0_18px_rgba(124,58,237,0.25)] transition hover:bg-violet-500"
        >
          Choisir
        </button>
      </div>

      {open ? <TournamentFormatPreview config={config} suggestion={suggestion} /> : null}
    </div>
  );
}

function AssistantQuestionCard({
  question,
  response,
  icon = "teams",
  layout = "split",
}: {
  question: string;
  response: ReactNode;
  icon?: "teams" | "time";
  layout?: "split" | "stacked";
}) {
  return (
    <div className="px-1 py-3">
      <div
        className={
          layout === "stacked"
            ? "flex flex-col gap-5"
            : "flex flex-col gap-4 md:grid md:grid-cols-[minmax(290px,360px)_auto] md:items-center md:gap-16"
        }
      >
        <div className="w-full min-w-0">
          <div className="flex items-center justify-center gap-3 md:justify-start">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-400/30 bg-violet-500/18 shadow-[0_0_24px_rgba(124,58,237,0.32)]">
              {icon === "time" ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-violet-100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 8v4l3 2" />
                </svg>
              ) : (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-violet-100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
                  <circle cx="9.5" cy="7" r="3" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              )}
            </div>
            <p className="whitespace-nowrap text-center text-[28px] font-semibold tracking-[-0.03em] text-white md:text-left md:text-[24px]">
              {question}
            </p>
          </div>
        </div>
        <div
          className={
            layout === "stacked"
              ? "w-full"
              : "w-full min-w-0 md:justify-self-start md:pl-12"
          }
        >
          {response}
        </div>
      </div>
    </div>
  );
}

function TournamentTypeOptionPreview({
  structure,
  compact = true,
  onExpand,
  compactVariant,
  compactTeamCount,
  roundRobinMode,
  fullSize = false,
  fullSizeViewportInset = 0,
  fullSizeScaleCap,
  fullSizeVerticalOffset = 0,
  showPhaseMatchTeams = false,
}: {
  structure: TournamentStructure;
  compact?: boolean;
  onExpand?: (() => void) | null;
  compactVariant?: TournamentFormatOptionVariant;
  compactTeamCount?: number;
  roundRobinMode?: "classement" | "finale";
  fullSize?: boolean;
  fullSizeViewportInset?: number;
  fullSizeScaleCap?: number;
  fullSizeVerticalOffset?: number;
  showPhaseMatchTeams?: boolean;
}) {
  const groupCardClass = compact
    ? "min-w-[140px] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
    : "min-w-[190px] rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3";
  const matchCardClass = compact
    ? "min-w-[150px] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] text-slate-300"
    : "min-w-[190px] rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-[11px] text-slate-200";
  const lineWidthClass = compact ? "w-6" : "w-10";
  const connectorHeightClass = compact ? "h-10" : "h-14";
  const roundGapClass = compact ? "gap-2" : "gap-3";
  const titleClass = compact
    ? "text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400"
    : "text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300";
  const groupFinalViewportRef = useRef<HTMLDivElement | null>(null);
  const groupFinalCanvasRef = useRef<HTMLDivElement | null>(null);
  const groupFinalNodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [groupFinalPaths, setGroupFinalPaths] = useState<
    Array<{ id: string; d: string; dots?: Array<{ x: number; y: number }> }>
  >([]);
  const doubleBracketViewportRef = useRef<HTMLDivElement | null>(null);
  const doubleBracketCanvasRef = useRef<HTMLDivElement | null>(null);
  const doubleBracketNodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [doubleBracketPaths, setDoubleBracketPaths] = useState<
    Array<{ id: string; d: string; tone: "winner" | "loser" }>
  >([]);
  const [previewViewportWidth, setPreviewViewportWidth] = useState(1600);
  const [groupFinalAvailableWidth, setGroupFinalAvailableWidth] = useState(0);
  const [groupFinalAvailableHeight, setGroupFinalAvailableHeight] = useState(0);
  const [doubleBracketAvailableWidth, setDoubleBracketAvailableWidth] = useState(0);
  const [doubleBracketAvailableHeight, setDoubleBracketAvailableHeight] = useState(0);
  const effectiveGroupFinalViewportWidth =
    !compact && groupFinalAvailableWidth > 0 ? groupFinalAvailableWidth : previewViewportWidth;
  const effectiveDoubleBracketViewportWidth =
    !compact && doubleBracketAvailableWidth > 0 ? doubleBracketAvailableWidth : previewViewportWidth;
  const groupFinalVariantMode = `${compactVariant}:${
    fullSize
      ? ((compactVariant === "group_final"
          ? effectiveGroupFinalViewportWidth
          : compactVariant === "double_bracket"
            ? effectiveDoubleBracketViewportWidth
            : previewViewportWidth) < 980
          ? "reduced"
          : "modal")
      : "preview"
  }`;
  const getPreviewMatchLabel = (
    match: { homeTeam: string; awayTeam: string },
    fallbackLabel: string,
  ) => (showPhaseMatchTeams ? `${match.homeTeam} vs ${match.awayTeam}` : fallbackLabel);

  const setGroupFinalNodeRef = (key: string) => (node: HTMLDivElement | null) => {
    groupFinalNodeRefs.current[key] = node;
  };
  const setDoubleBracketNodeRef = (key: string) => (node: HTMLDivElement | null) => {
    doubleBracketNodeRefs.current[key] = node;
  };

  useEffect(() => {
    const updateViewportSize = () => {
      setPreviewViewportWidth(window.innerWidth);
    };

    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);

    return () => {
      window.removeEventListener("resize", updateViewportSize);
    };
  }, []);

  const expandButton = onExpand ? (
    <div className="flex justify-end">
      <span
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onExpand();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onExpand();
          }
        }}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
        aria-label="Agrandir le graphique"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 3h6v6" />
          <path d="M9 21H3v-6" />
          <path d="m21 3-7 7" />
          <path d="m3 21 7-7" />
        </svg>
      </span>
    </div>
  ) : null;

  const knockoutRounds = Array.from(
    structure.knockout.reduce((map, match) => {
      const existing = map.get(match.phaseLabel) ?? [];
      existing.push(match);
      map.set(match.phaseLabel, existing);
      return map;
    }, new Map<string, TournamentGeneratedMatch[]>()),
  ).map(([phaseLabel, matches]) => ({
    phaseLabel,
    matches,
  }));

  const classementRounds = Array.from(
    structure.classement.reduce((map, match) => {
      const existing = map.get(match.phaseLabel) ?? [];
      existing.push(match);
      map.set(match.phaseLabel, existing);
      return map;
    }, new Map<string, TournamentGeneratedMatch[]>()),
  ).map(([phaseLabel, matches]) => ({
    phaseLabel,
    matches,
  }));
  const mainKnockoutRounds = knockoutRounds.filter(
    (round) => !round.phaseLabel.toLowerCase().includes("3e place"),
  );
  const doubleBracketDisplayedTeamCount = Math.max(
    0,
    compactTeamCount ?? structure.groups.reduce((total, group) => total + group.teams.length, 0),
  );
  const doubleBracketHasQuarterStage = doubleBracketDisplayedTeamCount >= 16;
  const doubleBracketExpectedGroupCount =
    doubleBracketDisplayedTeamCount <= 8
      ? 2
      : doubleBracketDisplayedTeamCount <= 10
        ? 2
        : doubleBracketDisplayedTeamCount <= 12
          ? 3
          : 4;
  const doubleBracketPreviewGroups = useMemo(
    () => {
      const sourceTeamNames = structure.groups.flatMap((group) => group.teams);
      while (sourceTeamNames.length < Math.max(4, doubleBracketDisplayedTeamCount || 4)) {
        sourceTeamNames.push(`Equipe ${sourceTeamNames.length + 1}`);
      }

      const normalizedGroupCount = Math.max(1, doubleBracketExpectedGroupCount);
      const needsNormalization =
        structure.groups.length !== normalizedGroupCount || structure.groups.length === 0;

      if (!needsNormalization) {
        return structure.groups;
      }

      const groups = Array.from({ length: normalizedGroupCount }, (_, index) => ({
        label: `Poule ${String.fromCharCode(65 + index)}`,
        teams: [] as string[],
        matches: [] as TournamentGeneratedMatch[],
      }));

      sourceTeamNames.slice(0, doubleBracketDisplayedTeamCount || sourceTeamNames.length).forEach((team, index) => {
        groups[index % normalizedGroupCount]?.teams.push(team);
      });

      return groups;
    },
    [doubleBracketDisplayedTeamCount, doubleBracketExpectedGroupCount, structure.groups],
  );
  const buildDoubleBracketPreviewRounds = (
    rounds: Array<{ phaseLabel: string; matches: TournamentGeneratedMatch[] }>,
  ) =>
    rounds.map((round) => ({
      phaseLabel: round.phaseLabel,
      matches: round.matches.map((match) => `${match.homeTeam} vs ${match.awayTeam}`),
    }));
  const twoGroupDoubleBracketSeededRounds = useMemo(
    () => ({
      winnerRounds: [
        {
          phaseLabel: "Demi gagnant",
          matches: ["1A vs 2B", "1B vs 2A"],
        },
        {
          phaseLabel: "Finale gagnant",
          matches: ["Finale"],
        },
      ],
      loserRounds:
        doubleBracketDisplayedTeamCount >= 8
          ? [
              {
                phaseLabel: "Demi perdant",
                matches: ["3A vs 4B", "3B vs 4A"],
              },
              {
                phaseLabel: "Finale perdant",
                matches: ["Finale"],
              },
            ]
          : [
              {
                phaseLabel: "Demi perdant",
                matches: ["3A vs 3B", "4A vs 4B"],
              },
              {
                phaseLabel: "Finale perdant",
                matches: ["Finale"],
              },
            ],
    }),
    [doubleBracketDisplayedTeamCount],
  );
  const doubleBracketWinnerRounds = useMemo(
    () => {
      if (doubleBracketExpectedGroupCount === 2 && doubleBracketDisplayedTeamCount <= 10) {
        return twoGroupDoubleBracketSeededRounds.winnerRounds;
      }

      if (structure.knockout.length > 0) {
        const previewKnockoutMatches =
          doubleBracketExpectedGroupCount === 4 && doubleBracketDisplayedTeamCount >= 16
            ? structure.knockout.filter((match) =>
                typeof match.stage === "string" &&
                (match.stage === "bracket16_uefa_quarter" ||
                  match.stage === "bracket16_uefa_semi" ||
                  match.stage === "bracket16_uefa_final"),
              )
            : structure.knockout;
        const winnerRounds = Array.from(
          previewKnockoutMatches.reduce((map, match) => {
            if (/3e place/i.test(match.phaseLabel)) {
              return map;
            }
            const existing = map.get(match.phaseLabel) ?? [];
            existing.push(match);
            map.set(match.phaseLabel, existing);
            return map;
          }, new Map<string, TournamentGeneratedMatch[]>()),
        ).map(([phaseLabel, matches]) => ({ phaseLabel, matches }));

        if (winnerRounds.length > 0) {
          return buildDoubleBracketPreviewRounds(winnerRounds);
        }
      }

      return doubleBracketHasQuarterStage
        ? [
            {
              phaseLabel: "Quart gagnant",
              matches: ["Quart de finale 1", "Quart de finale 2", "Quart de finale 3", "Quart de finale 4"],
            },
            { phaseLabel: "Demi gagnant", matches: ["Demi-finale 1", "Demi-finale 2"] },
            { phaseLabel: "Finale gagnant", matches: ["Finale"] },
          ]
        : [
            { phaseLabel: "Demi gagnant", matches: ["Demi-finale 1", "Demi-finale 2"] },
            { phaseLabel: "Finale gagnant", matches: ["Finale"] },
          ];
    },
    [
      doubleBracketDisplayedTeamCount,
      doubleBracketExpectedGroupCount,
      doubleBracketHasQuarterStage,
      twoGroupDoubleBracketSeededRounds,
      structure.knockout,
    ],
  );
  const doubleBracketLoserRounds = useMemo(
    () => {
      if (doubleBracketExpectedGroupCount === 2 && doubleBracketDisplayedTeamCount <= 10) {
        return twoGroupDoubleBracketSeededRounds.loserRounds;
      }

      if (structure.classement.length > 0) {
        if (doubleBracketExpectedGroupCount === 4 && doubleBracketDisplayedTeamCount >= 16) {
          const loserQuarterMatches = structure.classement.filter(
            (match) =>
              typeof match.stage === "string" && match.stage === "bracket16_europa_quarter",
          );
          const loserSemiMatches = structure.classement.filter(
            (match) => typeof match.stage === "string" && match.stage === "bracket16_europa_semi",
          );
          const loserFinalMatches = structure.classement.filter(
            (match) => typeof match.stage === "string" && match.stage === "bracket16_europa_final",
          );

          if (
            loserQuarterMatches.length > 0 ||
            loserSemiMatches.length > 0 ||
            loserFinalMatches.length > 0
          ) {
            return buildDoubleBracketPreviewRounds(
              [
                loserQuarterMatches.length > 0
                  ? {
                      phaseLabel: "Quart perdant",
                      matches: loserQuarterMatches,
                    }
                  : null,
                loserSemiMatches.length > 0
                  ? {
                      phaseLabel: "Demi perdant",
                      matches: loserSemiMatches,
                    }
                  : null,
                loserFinalMatches.length > 0
                  ? {
                      phaseLabel: "Finale perdant",
                      matches: loserFinalMatches,
                    }
                  : null,
              ].filter(
                (
                  round,
                ): round is { phaseLabel: string; matches: TournamentGeneratedMatch[] } =>
                  round !== null,
              ),
            );
          }
        }

        const previewClassementMatches =
          doubleBracketExpectedGroupCount === 3 && doubleBracketDisplayedTeamCount === 12
            ? structure.classement.filter((match) =>
                typeof match.stage === "string" &&
                (match.stage === "bracket12_europa_semi" ||
                  match.stage === "bracket12_europa_final"),
              )
            : structure.classement;
        const loserRounds = Array.from(
          previewClassementMatches.reduce((map, match) => {
            const existing = map.get(match.phaseLabel) ?? [];
            existing.push(match);
            map.set(match.phaseLabel, existing);
            return map;
          }, new Map<string, TournamentGeneratedMatch[]>()),
        ).map(([phaseLabel, matches]) => ({ phaseLabel, matches }));

        if (loserRounds.length > 0) {
          return buildDoubleBracketPreviewRounds(loserRounds);
        }
      }

      return doubleBracketHasQuarterStage
        ? [
            {
              phaseLabel: "Quart perdant",
              matches: ["Quart de finale 1", "Quart de finale 2", "Quart de finale 3", "Quart de finale 4"],
            },
            { phaseLabel: "Demi perdant", matches: ["Demi-finale 1", "Demi-finale 2"] },
            { phaseLabel: "Finale perdant", matches: ["Finale"] },
          ]
        : [
            { phaseLabel: "Demi perdant", matches: ["Demi-finale 1", "Demi-finale 2"] },
            { phaseLabel: "Finale perdant", matches: ["Finale"] },
          ];
    },
    [
      doubleBracketDisplayedTeamCount,
      doubleBracketExpectedGroupCount,
      doubleBracketHasQuarterStage,
      twoGroupDoubleBracketSeededRounds,
      structure.classement,
    ],
  );

  useLayoutEffect(() => {
    if (compact || compactVariant !== "group_final") {
      return;
    }

    const updateViewportBounds = () => {
      const viewport = groupFinalViewportRef.current;
      if (!viewport) {
        return;
      }

      const rect = viewport.getBoundingClientRect();
      setGroupFinalAvailableWidth(rect.width);
      setGroupFinalAvailableHeight(rect.height);
    };

    const frame = window.requestAnimationFrame(updateViewportBounds);
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => updateViewportBounds())
        : null;

    if (groupFinalViewportRef.current && resizeObserver) {
      resizeObserver.observe(groupFinalViewportRef.current);
    }

    window.addEventListener("resize", updateViewportBounds);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateViewportBounds);
      resizeObserver?.disconnect();
    };
  }, [compact, compactVariant]);

  useLayoutEffect(() => {
    if (compact || !groupFinalVariantMode.startsWith("group_final:")) {
      return;
    }

    const computePaths = () => {
      const container = groupFinalCanvasRef.current;
      if (!container) {
        setGroupFinalPaths([]);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const scaleX =
        container.offsetWidth > 0 ? containerRect.width / container.offsetWidth : 1;
      const scaleY =
        container.offsetHeight > 0 ? containerRect.height / container.offsetHeight : 1;
      const nextPaths: Array<{ id: string; d: string; dots?: Array<{ x: number; y: number }> }> = [];
      const getAnchor = (key: string, side: "left" | "right") => {
        const node = groupFinalNodeRefs.current[key];
        if (!node) {
          return null;
        }

        const rect = node.getBoundingClientRect();
        return {
          x:
            (side === "right" ? rect.right - containerRect.left : rect.left - containerRect.left) /
            Math.max(scaleX, 0.0001),
          y:
            (rect.top - containerRect.top + rect.height / 2) /
            Math.max(scaleY, 0.0001),
        };
      };
      const addConnection = (id: string, fromKey: string, toKey: string) => {
        const from = getAnchor(fromKey, "right");
        const to = getAnchor(toKey, "left");
        if (!from || !to) {
          return;
        }

        const elbowX = from.x + Math.max(10, (to.x - from.x) * 0.36);
        const d = `M ${from.x} ${from.y} H ${elbowX} V ${to.y} H ${to.x}`;
        nextPaths.push({ id, d, dots: [from, to] });
      };

      const firstRound = mainKnockoutRounds[0];
      if (structure.groups.length > 0 && firstRound) {
        const groupAnchors = structure.groups
          .map((_, groupIndex) => getAnchor(`group-${groupIndex}`, "right"))
          .filter((anchor): anchor is { x: number; y: number } => anchor !== null);
        const quarterAnchors = firstRound.matches
          .map((_, matchIndex) => getAnchor(`round-0-${matchIndex}`, "left"))
          .filter((anchor): anchor is { x: number; y: number } => anchor !== null);

        if (groupAnchors.length > 0 && quarterAnchors.length > 0) {
          const groupMaxX = Math.max(...groupAnchors.map((anchor) => anchor.x));
          const quarterMinX = Math.min(...quarterAnchors.map((anchor) => anchor.x));
          const busX = groupMaxX + Math.max(8, (quarterMinX - groupMaxX) * 0.32);
          const busTop = Math.min(
            ...groupAnchors.map((anchor) => anchor.y),
            ...quarterAnchors.map((anchor) => anchor.y),
          );
          const busBottom = Math.max(
            ...groupAnchors.map((anchor) => anchor.y),
            ...quarterAnchors.map((anchor) => anchor.y),
          );

          nextPaths.push({
            id: "groups-bus",
            d: `M ${busX} ${busTop} V ${busBottom}`,
          });

          groupAnchors.forEach((anchor, groupIndex) => {
            nextPaths.push({
              id: `group-${groupIndex}-to-bus`,
              d: `M ${anchor.x} ${anchor.y} H ${busX}`,
              dots: [anchor],
            });
          });

          quarterAnchors.forEach((anchor, matchIndex) => {
            nextPaths.push({
              id: `bus-to-first-${matchIndex}`,
              d: `M ${busX} ${anchor.y} H ${anchor.x}`,
              dots: [anchor],
            });
          });
        }
      }

      mainKnockoutRounds.forEach((round, roundIndex) => {
        const nextRound = mainKnockoutRounds[roundIndex + 1];
        if (!nextRound) {
          return;
        }

        round.matches.forEach((_, matchIndex) => {
          const nextMatchIndex =
            nextRound.matches.length <= 1
              ? 0
              : Math.min(
                  nextRound.matches.length - 1,
                  Math.floor((matchIndex * nextRound.matches.length) / round.matches.length),
                );
          addConnection(
            `round-${roundIndex}-${matchIndex}-to-${roundIndex + 1}-${nextMatchIndex}`,
            `round-${roundIndex}-${matchIndex}`,
            `round-${roundIndex + 1}-${nextMatchIndex}`,
          );
        });
      });

      setGroupFinalPaths(nextPaths);
    };

    const frame = window.requestAnimationFrame(computePaths);
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => computePaths()) : null;

    if (groupFinalCanvasRef.current && resizeObserver) {
      resizeObserver.observe(groupFinalCanvasRef.current);
    }

    Object.values(groupFinalNodeRefs.current).forEach((node) => {
      if (node && resizeObserver) {
        resizeObserver.observe(node);
      }
    });

    window.addEventListener("resize", computePaths);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", computePaths);
      resizeObserver?.disconnect();
    };
  }, [compact, groupFinalVariantMode, mainKnockoutRounds, structure.groups]);

  useLayoutEffect(() => {
    if (compact || compactVariant !== "double_bracket") {
      return;
    }

    const updateViewportBounds = () => {
      const viewport = doubleBracketViewportRef.current;
      if (!viewport) {
        return;
      }

      const rect = viewport.getBoundingClientRect();
      setDoubleBracketAvailableWidth(rect.width);
      setDoubleBracketAvailableHeight(rect.height);
    };

    const frame = window.requestAnimationFrame(updateViewportBounds);
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => updateViewportBounds())
        : null;

    if (doubleBracketViewportRef.current && resizeObserver) {
      resizeObserver.observe(doubleBracketViewportRef.current);
    }

    window.addEventListener("resize", updateViewportBounds);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateViewportBounds);
      resizeObserver?.disconnect();
    };
  }, [compact, compactVariant]);

  useLayoutEffect(() => {
    if (compact || compactVariant !== "double_bracket") {
      return;
    }

    const computePaths = () => {
      const container = doubleBracketCanvasRef.current;
      if (!container) {
        setDoubleBracketPaths([]);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const scaleX =
        container.offsetWidth > 0 ? containerRect.width / container.offsetWidth : 1;
      const scaleY =
        container.offsetHeight > 0 ? containerRect.height / container.offsetHeight : 1;
      const nextPaths: Array<{ id: string; d: string; tone: "winner" | "loser" }> = [];
      const getAnchor = (key: string, side: "left" | "right") => {
        const node = doubleBracketNodeRefs.current[key];
        if (!node) {
          return null;
        }

        const rect = node.getBoundingClientRect();
        return {
          x:
            (side === "right" ? rect.right - containerRect.left : rect.left - containerRect.left) /
            Math.max(scaleX, 0.0001),
          y:
            (rect.top - containerRect.top + rect.height / 2) /
            Math.max(scaleY, 0.0001),
        };
      };

      const addConnection = (
        id: string,
        fromKey: string,
        toKey: string,
        tone: "winner" | "loser",
      ) => {
        const from = getAnchor(fromKey, "right");
        const to = getAnchor(toKey, "left");
        if (!from || !to) {
          return;
        }

        const elbowX = from.x + Math.max(8, (to.x - from.x) * 0.42);
        nextPaths.push({
          id,
          tone,
          d: `M ${from.x} ${from.y} H ${elbowX} V ${to.y} H ${to.x}`,
        });
      };

      const addSharedGroupSplit = () => {
        const groupAnchors = doubleBracketPreviewGroups
          .map((_, groupIndex) => getAnchor(`db-group-${groupIndex}`, "right"))
          .filter((anchor): anchor is { x: number; y: number } => anchor !== null);
        const winnerAnchors = doubleBracketWinnerRounds[0].matches
          .map((_, matchIndex) => getAnchor(`winner-round-0-${matchIndex}`, "left"))
          .filter((anchor): anchor is { x: number; y: number } => anchor !== null);
        const loserAnchors = doubleBracketLoserRounds[0].matches
          .map((_, matchIndex) => getAnchor(`loser-round-0-${matchIndex}`, "left"))
          .filter((anchor): anchor is { x: number; y: number } => anchor !== null);

        if (groupAnchors.length === 0 || winnerAnchors.length === 0 || loserAnchors.length === 0) {
          return;
        }

        const groupMaxX = Math.max(...groupAnchors.map((anchor) => anchor.x));
        const firstMinX = Math.min(
          ...winnerAnchors.map((anchor) => anchor.x),
          ...loserAnchors.map((anchor) => anchor.x),
        );
        const busX = groupMaxX + Math.max(8, (firstMinX - groupMaxX) * 0.38);
        const busTop = Math.min(
          ...groupAnchors.map((anchor) => anchor.y),
          ...winnerAnchors.map((anchor) => anchor.y),
          ...loserAnchors.map((anchor) => anchor.y),
        );
        const busBottom = Math.max(
          ...groupAnchors.map((anchor) => anchor.y),
          ...winnerAnchors.map((anchor) => anchor.y),
          ...loserAnchors.map((anchor) => anchor.y),
        );

        nextPaths.push({ id: "double-bracket-groups-bus", tone: "winner", d: `M ${busX} ${busTop} V ${busBottom}` });
        groupAnchors.forEach((anchor, groupIndex) => {
          nextPaths.push({
            id: `double-bracket-group-${groupIndex}-to-bus`,
            tone: "winner",
            d: `M ${anchor.x} ${anchor.y} H ${busX}`,
          });
        });

        winnerAnchors.forEach((anchor, matchIndex) => {
          nextPaths.push({
            id: `double-bracket-bus-to-winner-${matchIndex}`,
            tone: "winner",
            d: `M ${busX} ${anchor.y} H ${anchor.x}`,
          });
        });
        loserAnchors.forEach((anchor, matchIndex) => {
          nextPaths.push({
            id: `double-bracket-bus-to-loser-${matchIndex}`,
            tone: "loser",
            d: `M ${busX} ${anchor.y} H ${anchor.x}`,
          });
        });
      };

      const connectRoundSet = (
        prefix: "winner" | "loser",
        rounds: typeof doubleBracketWinnerRounds,
        tone: "winner" | "loser",
      ) => {
        rounds.forEach((round, roundIndex) => {
          const nextRound = rounds[roundIndex + 1];
          if (!nextRound) {
            return;
          }

          round.matches.forEach((_, matchIndex) => {
            const nextMatchIndex =
              nextRound.matches.length <= 1
                ? 0
                : Math.min(
                    nextRound.matches.length - 1,
                    Math.floor((matchIndex * nextRound.matches.length) / round.matches.length),
                  );
            addConnection(
              `${prefix}-${roundIndex}-${matchIndex}-to-${roundIndex + 1}-${nextMatchIndex}`,
              `${prefix}-round-${roundIndex}-${matchIndex}`,
              `${prefix}-round-${roundIndex + 1}-${nextMatchIndex}`,
              tone,
            );
          });
        });
      };

      addSharedGroupSplit();
      connectRoundSet("winner", doubleBracketWinnerRounds, "winner");
      connectRoundSet("loser", doubleBracketLoserRounds, "loser");

      setDoubleBracketPaths(nextPaths);
    };

    const frame = window.requestAnimationFrame(computePaths);
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => computePaths()) : null;

    if (doubleBracketCanvasRef.current && resizeObserver) {
      resizeObserver.observe(doubleBracketCanvasRef.current);
    }

    Object.values(doubleBracketNodeRefs.current).forEach((node) => {
      if (node && resizeObserver) {
        resizeObserver.observe(node);
      }
    });

    window.addEventListener("resize", computePaths);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", computePaths);
      resizeObserver?.disconnect();
    };
  }, [
    compact,
    compactVariant,
    doubleBracketLoserRounds,
    doubleBracketPreviewGroups,
    doubleBracketWinnerRounds,
  ]);

  if (compact) {
    const compactPreviewFrameClass =
      "rounded-2xl border border-white/10 bg-black/20 px-3.5 py-3.5";
    const compactPreviewHeightClass = "h-[182px] overflow-hidden";
    const compactContent =
      compactVariant === "round_robin" ? (
        <div className={compactPreviewFrameClass}>
          <div className={`flex items-center justify-center ${compactPreviewHeightClass}`}>
            <div className="flex flex-col items-center">
              <div className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-slate-400">
                {Math.max(0, compactTeamCount ?? structure.groups[0]?.teams.length ?? 0)} equipes
              </div>
              <div className="flex items-center gap-2">
                {Array.from({ length: 5 }, (_, index) => (
                  <div
                    key={`round-robin-node-${index + 1}`}
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-white/15 bg-white/[0.05]"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-100" />
                  </div>
                ))}
              </div>

              <div className="mt-2 flex flex-col items-center">
                <div className="text-violet-300">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 4v12" />
                    <path d="m7 11 5 5 5-5" />
                  </svg>
                </div>
                <div className="mt-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-center">
                  <div className="text-[10px] font-semibold tracking-[0.12em] text-white">
                    TOP 2
                  </div>
                </div>
              </div>

              {roundRobinMode === "finale" ? (
                <>
                  <div className="mt-2 text-violet-300">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 4v12" />
                      <path d="m7 11 5 5 5-5" />
                    </svg>
                  </div>
                  <div className="mt-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-center">
                    <div className="text-[10px] font-semibold tracking-[0.12em] text-white">
                      Finale
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : compactVariant === "group_final" ? (
        <div className={compactPreviewFrameClass}>
          <div className={`flex flex-col items-center justify-center ${compactPreviewHeightClass}`}>
            {(() => {
              const firstStageLabel = knockoutRounds.some((round) =>
                round.phaseLabel.toLowerCase().includes("huit"),
              )
                ? "8e"
                : knockoutRounds.some((round) =>
                round.phaseLabel.toLowerCase().includes("quart"),
                )
                  ? "Quart"
                  : "Demi";
              const compactStepClass =
                "w-[44px] shrink-0 whitespace-nowrap rounded-xl px-1 py-2 text-center text-[7px] font-semibold tracking-[0.04em]";

              return (
            <div className="flex w-full min-w-0 items-center justify-center gap-1 overflow-hidden">
              <div
                className={`${compactStepClass} border border-violet-400/20 bg-violet-500/[0.08] text-violet-100 shadow-[0_0_18px_rgba(124,58,237,0.18)]`}
              >
                Groupes
              </div>

              <div className="flex w-[8px] shrink-0 items-center">
                <div className="h-px flex-1 bg-white/20" />
                <div className="h-1.5 w-1.5 rounded-full bg-violet-400/85 shadow-[0_0_10px_rgba(139,92,246,0.55)]" />
              </div>

              <div
                className={`${compactStepClass} border border-violet-400/20 bg-violet-500/[0.08] text-violet-100 shadow-[0_0_18px_rgba(124,58,237,0.18)]`}
              >
                {firstStageLabel}
              </div>

              <div className="flex w-[8px] shrink-0 items-center">
                <div className="h-px flex-1 bg-white/20" />
                <div className="h-1.5 w-1.5 rounded-full bg-violet-400/85 shadow-[0_0_10px_rgba(139,92,246,0.55)]" />
              </div>

              <div
                className={`${compactStepClass} border border-violet-400/20 bg-violet-500/[0.08] text-violet-100 shadow-[0_0_18px_rgba(124,58,237,0.18)]`}
              >
                Demi
              </div>

              <div className="flex w-[8px] shrink-0 items-center">
                <div className="h-px flex-1 bg-white/20" />
                <div className="h-1.5 w-1.5 rounded-full bg-violet-400/85 shadow-[0_0_10px_rgba(139,92,246,0.55)]" />
              </div>

              <div
                className={`${compactStepClass} border border-violet-400/25 bg-violet-500/[0.12] text-violet-50 shadow-[0_0_22px_rgba(124,58,237,0.22)]`}
              >
                Finale
              </div>
            </div>
              );
            })()}
          </div>
        </div>
      ) : compactVariant === "double_bracket" ? (
        <div className={compactPreviewFrameClass}>
          <div className={`flex items-center gap-2 ${compactPreviewHeightClass}`}>
            {(() => {
              const hasQuarterStage = (compactTeamCount ?? 0) >= 16;
              const stageLabels = hasQuarterStage
                ? ["Quart", "Demi", "Finale"]
                : ["Demi 1", "Demi 2", "Finale"];
              const renderPhaseCard = (title: string, tone: "winner" | "loser") => (
                <div
                  className={
                    tone === "winner"
                      ? "rounded-xl border border-violet-400/20 bg-violet-500/[0.08] px-2 py-2 shadow-[0_0_18px_rgba(124,58,237,0.18)]"
                      : "rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2"
                  }
                >
                  <div
                    className={
                      tone === "winner"
                        ? "text-center text-[8px] font-semibold uppercase tracking-[0.1em] text-violet-100"
                        : "text-center text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-300"
                    }
                  >
                    {title}
                  </div>
                  <div className="mt-1.5 flex flex-wrap justify-center gap-1">
                    {stageLabels.map((label, index) => (
                      <div
                        key={`${title}-${label}-${index}`}
                        className={
                          tone === "winner"
                            ? label === "Finale"
                              ? "rounded-lg border border-violet-400/25 bg-violet-500/[0.12] px-2 py-1 text-[7px] font-semibold tracking-[0.06em] text-violet-50"
                              : "rounded-lg border border-violet-400/20 bg-violet-500/[0.08] px-2 py-1 text-[7px] font-semibold tracking-[0.06em] text-violet-100"
                            : "rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[7px] font-semibold tracking-[0.06em] text-slate-300"
                        }
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              );

              return (
                <>
                  <div className="flex min-w-[72px] shrink-0 flex-col gap-1.5">
                    {doubleBracketPreviewGroups.map((_, index) => (
                      <div
                        key={`compact-double-group-${index + 1}`}
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5 text-center text-[8px] font-semibold tracking-[0.08em] text-slate-200"
                      >
                        Groupe {index + 1}
                      </div>
                    ))}
                  </div>

                  <div className="flex w-7 shrink-0 items-center gap-1">
                    <div className="h-px flex-1 bg-white/20" />
                    <div className="h-1.5 w-1.5 rounded-full bg-violet-400/85 shadow-[0_0_10px_rgba(139,92,246,0.55)]" />
                    <div className="text-[11px] text-violet-200">→</div>
                  </div>

                  <div className="grid min-w-0 flex-1 gap-2">
                    {renderPhaseCard("Phase finale FIFA", "winner")}
                    {renderPhaseCard("Phase finale Europe (5 a 8)", "loser")}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
          <div className="flex min-h-[132px] items-center gap-3">
            <div className="flex flex-1 flex-col gap-2">
              {["Quart", "Quart", "Quart", "Quart"].slice(0, 4).map((label, index) => (
                <div
                  key={`${label}-${index}`}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[10px] font-semibold tracking-[0.12em] text-slate-300"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="flex w-8 flex-col items-center gap-2">
              <div className="h-px w-full bg-white/15" />
              <div className="h-10 w-px bg-white/15" />
              <div className="h-px w-full bg-white/15" />
            </div>
            <div className="flex flex-1 flex-col gap-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[10px] font-semibold tracking-[0.12em] text-slate-200">
                Demi
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[10px] font-semibold tracking-[0.12em] text-slate-200">
                Demi
              </div>
            </div>
            <div className="flex w-8 flex-col items-center gap-2">
              <div className="h-px w-full bg-white/15" />
              <div className="h-6 w-px bg-white/15" />
              <div className="h-px w-full bg-white/15" />
            </div>
            <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.08] px-3 py-2 text-center text-[10px] font-semibold tracking-[0.12em] text-violet-100">
              Finale
            </div>
          </div>
        </div>
      );

    return (
      <div className="mt-3 space-y-3">
        {expandButton}
        {compactContent}
      </div>
    );
  }

  if (compactVariant === "round_robin") {
    const displayedTeamCount = Math.max(
      0,
      compactTeamCount ?? structure.groups[0]?.teams.length ?? 0,
    );
    const roundRobinTeams = Array.from({ length: displayedTeamCount }, (_, index) => {
      return structure.groups[0]?.teams[index] ?? `Equipe ${index + 1}`;
    });

    return (
      <div className="mt-3 space-y-3">
        {expandButton}
        <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-black/20 p-5">
          <div className="flex min-w-[620px] items-center gap-6">
            <div className="w-[280px] rounded-[22px] border border-white/10 bg-white/[0.05] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white">
                  Groupe
                </p>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-slate-300">
                  {displayedTeamCount} equipes
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {roundRobinTeams.map((team, index) => (
                  <div
                    key={`${team}-${index + 1}`}
                    className="flex h-10 items-center rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-[11px] font-medium text-slate-200"
                  >
                    <span className="mr-3 inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-white/10 bg-black/20 px-1 text-[10px] text-slate-300">
                      {index + 1}
                    </span>
                    <span className="truncate">{team}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-px w-16 bg-white/15" />
              <div className="h-2.5 w-2.5 rounded-full bg-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.6)]" />
              <div className="text-violet-200 text-[18px]">→</div>
            </div>

            {roundRobinMode === "classement" ? (
              <div className="w-[220px] rounded-[22px] border border-white/10 bg-white/[0.05] p-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white">
                  Classement
                </p>
                <div className="mt-4 space-y-2">
                  {roundRobinTeams.map((_, index) => (
                    <div
                      key={`classement-${index + 1}`}
                      className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-slate-200"
                    >
                      {index + 1}e
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="w-[220px] rounded-[22px] border border-violet-400/20 bg-violet-500/[0.08] p-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-violet-100">
                  Finale
                </p>
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center text-[12px] text-slate-100">
                  1er contre 2eme
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (compactVariant === "group_final") {
    const desktopAvailableWidth = !compact && groupFinalAvailableWidth > 0 ? groupFinalAvailableWidth : 0;
    const isUniformModalLayout = fullSize && !compact;
    const effectiveViewportWidth = effectiveGroupFinalViewportWidth;
    const fullSizeDesignWidth = 1320;
    const layoutSizingWidth = compact
      ? effectiveViewportWidth
      : isUniformModalLayout
        ? fullSizeDesignWidth
        : Math.max(effectiveViewportWidth, desktopAvailableWidth + 360, 1600);
    const isReducedPreview = isUniformModalLayout && effectiveViewportWidth < 980;
    const isFullSizeDesktop = isUniformModalLayout && !isReducedPreview;
    const displayedKnockoutRounds = mainKnockoutRounds;
    const modalKnockoutRounds = isUniformModalLayout
      ? mainKnockoutRounds.slice(
          0,
          mainKnockoutRounds.some((round) => round.phaseLabel.toLowerCase().includes("huit")) ? 4 : 3,
        )
      : [];
    const bracketRoundsForLayout = isUniformModalLayout ? modalKnockoutRounds : displayedKnockoutRounds;
    const previewFactor = compact
      ? 1
      : isUniformModalLayout
        ? 1
        : layoutSizingWidth >= 1800
          ? 1.62
          : layoutSizingWidth >= 1600
            ? 1.46
            : layoutSizingWidth >= 1450
              ? 1.34
              : layoutSizingWidth >= 1320
                ? 1.2
                : layoutSizingWidth >= 1180
                  ? 0.92
                  : layoutSizingWidth >= 1020
                    ? 0.78
                    : layoutSizingWidth >= 900
                      ? 0.64
                      : layoutSizingWidth >= 760
                        ? 0.42
                        : 0.36;
    const previewGroupCount = Math.max(1, structure.groups.length);
    const groupSizeFactor = isUniformModalLayout
      ? previewGroupCount <= 2
        ? 1.06
        : previewGroupCount === 3
          ? 1
          : previewGroupCount === 4
            ? 0.92
            : 0.84
      : previewGroupCount <= 2
        ? 1.24
        : previewGroupCount === 3
          ? 1.12
          : 1;
    const groupDensityFactor = isUniformModalLayout
      ? previewGroupCount >= 5
        ? 0.74
        : previewGroupCount === 4
          ? 0.84
          : previewGroupCount === 3
            ? 0.94
            : 1
      : 1;
    const reducedGroupBoost =
      isReducedPreview
        ? previewGroupCount <= 2
          ? 1.34
          : previewGroupCount === 3
            ? 1.18
            : previewGroupCount === 4
              ? 1
              : 0.92
        : 1;
    const narrowFactor =
      layoutSizingWidth < 820 ? 0.72 : layoutSizingWidth < 980 ? 0.84 : 1;
    const reducedModeBoost =
      !compact && effectiveViewportWidth < 760 ? 1.42 : !compact && effectiveViewportWidth < 980 ? 1.26 : 1;
    const fullSizeDesktopWidthBoost =
      isUniformModalLayout && isFullSizeDesktop
        ? Math.min(1.28, Math.max(1.06, effectiveViewportWidth / 1280))
        : 1;
    const desktopSpaceBoost =
      isUniformModalLayout
        ? 1
        : !compact && desktopAvailableWidth > 0
          ? Math.min(1.52, Math.max(1, desktopAvailableWidth / 1080))
          : 1;
    const desktopSpacingBoost =
      isUniformModalLayout
        ? 1
        : !compact && layoutSizingWidth >= 1600
          ? 1.86
          : !compact && layoutSizingWidth >= 1450
            ? 1.62
            : !compact && layoutSizingWidth >= 1280
              ? 1.38
              : 1;
    const desktopBoost =
      isUniformModalLayout
        ? 1
        : !compact && layoutSizingWidth >= 1600
          ? 1.42 * desktopSpaceBoost
          : !compact && layoutSizingWidth >= 1320
            ? 1.24 * desktopSpaceBoost
            : 1;
    const desktopGroupBoost =
      isUniformModalLayout
        ? 1
        : !compact && layoutSizingWidth >= 1600
          ? 1.38 * desktopSpaceBoost
          : !compact && layoutSizingWidth >= 1450
            ? 1.28 * desktopSpaceBoost
            : !compact && layoutSizingWidth >= 1320
              ? 1.18 * desktopSpaceBoost
              : 1;
    const firstRoundMatchCount = Math.max(1, bracketRoundsForLayout[0]?.matches.length ?? 1);
    const bracketRowCount = Math.max(1, firstRoundMatchCount * 2 - 1);
    const maxTeamsPerGroup = Math.max(1, ...structure.groups.map((group) => group.teams.length));
    const getGroupFinalPreviewLabel = (phaseLabel: string) => {
      const normalizedLabel = phaseLabel.toLowerCase();

      if (normalizedLabel.includes("huit")) {
        return "Huitième de finale";
      }

      if (normalizedLabel.includes("quart")) {
        return "Quart de finale";
      }

      if (normalizedLabel.includes("demi")) {
        return "Demi-finale";
      }

      if (normalizedLabel.includes("final")) {
        return "Finale";
      }

      return phaseLabel;
    };
    const usesDetailedPhaseCards = showPhaseMatchTeams && !compact;
    const hasRoundOf16Stage = bracketRoundsForLayout.some((round) =>
      round.phaseLabel.toLowerCase().includes("huit"),
    );
    const roundPreviewLabels = bracketRoundsForLayout.map((round) =>
      getGroupFinalPreviewLabel(round.phaseLabel),
    );
    const longestMatchLabelLength = Math.max(
      8,
      ...roundPreviewLabels.map((label) => label.length),
    );
    const matchBlockHeight = Math.max(
      hasRoundOf16Stage
        ? usesDetailedPhaseCards
          ? 52
          : 44
        : usesDetailedPhaseCards
          ? 46
          : 38,
      Math.round(
        (hasRoundOf16Stage
          ? usesDetailedPhaseCards
            ? 84
            : 74
          : usesDetailedPhaseCards
            ? 78
            : 66) * previewFactor * narrowFactor,
      ),
    );
    const groupCardPaddingY = Math.max(
      7,
      Math.round(
        (hasRoundOf16Stage ? 12 : 9) *
          previewFactor *
          Math.min(groupSizeFactor, 1.14) *
          Math.max(narrowFactor, 0.9) *
          desktopGroupBoost *
          (isReducedPreview ? 1.26 * reducedGroupBoost : 1),
      ),
    );
    const groupCardPaddingX = Math.max(
      12,
      Math.round(
        (hasRoundOf16Stage ? 22 : 16) *
          previewFactor *
          Math.min(groupSizeFactor, 1.14) *
          Math.max(narrowFactor, 0.9) *
          desktopGroupBoost *
          (isReducedPreview ? 1.22 * reducedGroupBoost : 1),
      ),
    );
    const groupCardGap = Math.max(
      isFullSizeDesktop ? 22 : 14,
      Math.round(
        18 *
          previewFactor *
          Math.min(groupSizeFactor, 1.1) *
          groupDensityFactor *
          Math.max(narrowFactor, 0.92) *
          (isFullSizeDesktop ? 1.8 : isReducedPreview ? 1.28 : 1.08),
      ),
    );
    const reducedGroupCardGap = isReducedPreview
      ? Math.max(30, Math.round(groupCardGap * 2.2))
      : groupCardGap;
    const visibleReducedGroupGap = isReducedPreview
      ? Math.max(38, Math.round(reducedGroupCardGap * 1.35))
      : reducedGroupCardGap;
    const groupTeamGap = Math.max(
      3,
      Math.round(
        4 *
          previewFactor *
          Math.min(groupSizeFactor, 1.08) *
          groupDensityFactor *
          narrowFactor *
          reducedGroupBoost,
      ),
    );
    const estimatedGroupCardHeight =
      (
        (isUniformModalLayout ? 34 : 18) +
        groupCardPaddingY * 2 +
        maxTeamsPerGroup * (isUniformModalLayout ? 30 : 16) +
        Math.max(0, maxTeamsPerGroup - 1) *
          Math.max(groupTeamGap, isUniformModalLayout ? 8 : 4)
      ) *
      previewFactor;
    const estimatedGroupStackHeight =
      structure.groups.length * estimatedGroupCardHeight +
      Math.max(0, structure.groups.length - 1) * groupCardGap +
      20 * previewFactor;
    const rowHeight = Math.max(matchBlockHeight, Math.ceil(estimatedGroupStackHeight / bracketRowCount));
    const roundSlots: number[][] = [];
    bracketRoundsForLayout.forEach((round, roundIndex) => {
      if (roundIndex === 0) {
        roundSlots.push(Array.from({ length: round.matches.length }, (_, index) => 1 + index * 2));
        return;
      }

      const previousRound = bracketRoundsForLayout[roundIndex - 1];
      const previousSlots = roundSlots[roundIndex - 1] ?? [];
      roundSlots.push(
        Array.from({ length: round.matches.length }, (_, index) => {
          const fromIndex = Math.floor((index * previousRound.matches.length) / round.matches.length);
          const toIndex = Math.min(
            previousRound.matches.length - 1,
            Math.floor((((index + 1) * previousRound.matches.length) / round.matches.length) - 1),
          );
          const startSlot = previousSlots[fromIndex] ?? 1;
          const endSlot = previousSlots[toIndex] ?? startSlot;
          return Math.round((startSlot + endSlot) / 2);
        }),
      );
    });
    const groupColumnWidth = Math.max(
      hasRoundOf16Stage
        ? isReducedPreview
          ? 300
          : 228
        : isReducedPreview
          ? 216
          : 172,
      Math.round(
        (hasRoundOf16Stage ? 406 : 264) *
          previewFactor *
          groupSizeFactor *
          groupDensityFactor *
          Math.max(narrowFactor, 0.9) *
          Math.max(desktopGroupBoost, 1) *
          fullSizeDesktopWidthBoost *
          reducedGroupBoost,
      ),
    );
    const phaseCardPaddingX = Math.max(
      hasRoundOf16Stage
        ? isReducedPreview
          ? 16
          : 14
        : isReducedPreview
          ? 16
          : 12,
      Math.round(
        (hasRoundOf16Stage ? 16 : 14) *
          previewFactor *
          previewFactor *
          Math.min(narrowFactor * desktopBoost, 1.1) *
          (isReducedPreview ? 1.1 : 1),
      ),
    );
    const phaseCardTextWidth = Math.round(
      longestMatchLabelLength *
        Math.max(
          16,
          Math.round(
            20 *
              previewFactor *
              narrowFactor *
              desktopBoost *
              reducedModeBoost,
          ),
        ) *
        0.56,
    );
    const sideLabelFontSize = Math.max(
      14,
      Math.round(18 * previewFactor * narrowFactor * desktopBoost * reducedModeBoost),
    );
    const groupNameFontSize = Math.max(
      hasRoundOf16Stage ? 16 : 15,
      Math.round(
        (hasRoundOf16Stage ? 21 : 20) *
          previewFactor *
          narrowFactor *
          desktopBoost *
          fullSizeDesktopWidthBoost *
          reducedModeBoost *
          (isReducedPreview ? 1.14 : 1),
      ),
    );
    const teamFontSize = Math.max(
      hasRoundOf16Stage ? 16 : 16,
      Math.round(
        (hasRoundOf16Stage ? 21 : 21) *
          previewFactor *
          narrowFactor *
          desktopBoost *
          fullSizeDesktopWidthBoost *
          reducedModeBoost *
          (isReducedPreview ? 1.16 : 1),
      ),
    );
    const matchFontSize = Math.max(
      hasRoundOf16Stage
        ? usesDetailedPhaseCards
          ? 15
          : 17
        : usesDetailedPhaseCards
          ? 14
          : 16,
      Math.round(
        (hasRoundOf16Stage
          ? usesDetailedPhaseCards
            ? 18
            : 22
          : usesDetailedPhaseCards
            ? 18
            : 21) *
          previewFactor *
          narrowFactor *
          desktopBoost *
          fullSizeDesktopWidthBoost *
          reducedModeBoost,
      ),
    );
    const groupSideLabelWidth = Math.max(
      isReducedPreview ? 0 : 22,
      Math.round((isReducedPreview ? 0 : sideLabelFontSize) + (isReducedPreview ? 0 : 12) * previewFactor),
    );
    const groupSectionGap = Math.max(
      hasRoundOf16Stage
        ? isReducedPreview
          ? 2
          : isFullSizeDesktop
            ? 4
            : 6
        : isReducedPreview
          ? 4
          : isFullSizeDesktop
            ? 6
            : 8,
      Math.round(
        (hasRoundOf16Stage
          ? isReducedPreview
            ? 4
            : isFullSizeDesktop
              ? 6
              : 8
          : isReducedPreview
            ? 6
            : isFullSizeDesktop
              ? 8
              : 10) * previewFactor,
      ),
    );
    const groupSectionWidth = groupSideLabelWidth + groupSectionGap + groupColumnWidth;
    const groupCardVisualWidth = groupColumnWidth;
    const groupCardVisualPaddingX = groupCardPaddingX;
    const groupCardVisualPaddingY = groupCardPaddingY;
    const groupCardContentPaddingY = isFullSizeDesktop
      ? Math.max(4, groupCardVisualPaddingY - 6)
      : groupCardVisualPaddingY;
    const groupCardContentGap = isFullSizeDesktop
      ? Math.max(2, groupTeamGap - 3)
      : groupTeamGap;
    const groupCardTeamFontSize = teamFontSize;
    const groupCardNameFontSize = groupNameFontSize;
    const roundColumnWidth = Math.max(
      hasRoundOf16Stage
        ? isReducedPreview
          ? usesDetailedPhaseCards
            ? 208
            : 176
          : usesDetailedPhaseCards
            ? 188
            : 134
        : isReducedPreview
          ? usesDetailedPhaseCards
            ? 214
            : 168
          : usesDetailedPhaseCards
            ? 196
            : 126,
      phaseCardTextWidth +
        phaseCardPaddingX * 2 +
        (isReducedPreview
            ? usesDetailedPhaseCards
              ? hasRoundOf16Stage
                ? 46
                : 70
            : hasRoundOf16Stage
              ? 24
              : 34
          : usesDetailedPhaseCards
            ? hasRoundOf16Stage
              ? 44
              : 64
            : hasRoundOf16Stage
              ? 24
              : 30),
    );
    const fullSizeColumnGap = isFullSizeDesktop
      ? Math.max(
          hasRoundOf16Stage
            ? usesDetailedPhaseCards
              ? 40
              : 32
            : usesDetailedPhaseCards
              ? 92
              : 72,
          Math.round(
            desktopAvailableWidth *
              (hasRoundOf16Stage
                ? usesDetailedPhaseCards
                  ? 0.03
                  : 0.026
                : usesDetailedPhaseCards
                  ? 0.07
                  : 0.06),
          ),
        )
      : null;
    const reducedRoundDescriptors = isUniformModalLayout
      ? modalKnockoutRounds.map((round, roundIndex) => ({
          round,
          roundIndex,
          label: getGroupFinalPreviewLabel(round.phaseLabel),
        }))
      : [];
    const reducedRoundCount = reducedRoundDescriptors.length;
    const reducedGroupToBracketGap = Math.max(
      hasRoundOf16Stage
        ? usesDetailedPhaseCards
          ? 22
          : 18
        : usesDetailedPhaseCards
          ? 52
          : 38,
      Math.round(
        (hasRoundOf16Stage
          ? usesDetailedPhaseCards
            ? 34
            : 28
          : usesDetailedPhaseCards
            ? 74
            : 56) * previewFactor * Math.max(narrowFactor, 0.92) * fullSizeDesktopWidthBoost,
      ),
    );
    const reducedInterRoundGap = Math.max(
      hasRoundOf16Stage
        ? usesDetailedPhaseCards
          ? 10
          : 8
        : usesDetailedPhaseCards
          ? 22
          : 16,
      Math.round(
        (hasRoundOf16Stage
          ? usesDetailedPhaseCards
            ? 14
            : 12
          : usesDetailedPhaseCards
            ? 34
            : 24) * previewFactor * Math.max(narrowFactor, 0.92) * fullSizeDesktopWidthBoost,
      ),
    );
    const reducedFinalJoinGap = Math.max(
      6,
      Math.round(10 * previewFactor * Math.max(narrowFactor, 0.9)),
    );
    const reducedRoundColumnWidth = isUniformModalLayout
      ? Math.max(
          isFullSizeDesktop
            ? Math.round((usesDetailedPhaseCards ? 226 : 188) * fullSizeDesktopWidthBoost)
            : usesDetailedPhaseCards
              ? 202
              : 166,
          roundColumnWidth - Math.max(usesDetailedPhaseCards ? 2 : 8, Math.round((usesDetailedPhaseCards ? 6 : 12) * previewFactor)),
        )
      : roundColumnWidth;
    const reducedRoundCardMinHeight = Math.max(
      hasRoundOf16Stage
        ? usesDetailedPhaseCards
          ? 80
          : 68
        : usesDetailedPhaseCards
          ? 76
          : 62,
      Math.round(
        (hasRoundOf16Stage
          ? usesDetailedPhaseCards
            ? 96
            : 84
          : usesDetailedPhaseCards
            ? 102
            : 84) *
          previewFactor *
          Math.max(narrowFactor, 0.92) *
          (isReducedPreview ? 1.08 : 1),
      ),
    );
    const reducedRoundCardVisualHeight = isFullSizeDesktop
      ? Math.max(62, reducedRoundCardMinHeight - 14)
      : reducedRoundCardMinHeight;
    const reducedRoundCardPaddingY = isFullSizeDesktop
      ? Math.max(10, Math.round(13 * previewFactor * (isReducedPreview ? 1.2 : 1)))
      : Math.max(19, Math.round(23 * previewFactor * (isReducedPreview ? 1.28 : 1)));
    const standardRoundCardPaddingY = isFullSizeDesktop
      ? Math.max(4, Math.round(6 * previewFactor))
      : Math.max(6, Math.round(8 * previewFactor));
    const reducedFirstRoundStackGap = Math.max(
      20,
      Math.round(
        (isFullSizeDesktop ? 28 : 22) *
          previewFactor *
          Math.max(narrowFactor, 0.92),
      ),
    );
    const reducedQuarterFinalStackGap = hasRoundOf16Stage
      ? Math.max(
          40,
          reducedRoundCardVisualHeight + reducedFirstRoundStackGap * 2,
        )
      : 0;
    const reducedSemiFinalStackGap = hasRoundOf16Stage
      ? Math.max(
          56,
          reducedRoundCardVisualHeight + reducedQuarterFinalStackGap * 2,
        )
      : Math.max(
          48,
          reducedRoundCardMinHeight + reducedFirstRoundStackGap * 3,
        );
    const getReducedRoundHorizontalOffset = (roundIndex: number) =>
      !usesDetailedPhaseCards
        ? 0
        : hasRoundOf16Stage
          ? roundIndex === 1
            ? Math.max(8, Math.round(10 * previewFactor))
            : roundIndex === 2
              ? Math.max(18, Math.round(24 * previewFactor))
              : roundIndex === 3
                ? Math.max(30, Math.round(38 * previewFactor))
                : 0
        : roundIndex === 1
          ? Math.max(22, Math.round(30 * previewFactor))
          : roundIndex === 2
            ? Math.max(50, Math.round(66 * previewFactor))
            : 0;
    const getStandardRoundHorizontalOffset = (roundIndex: number) =>
      !usesDetailedPhaseCards
        ? 0
        : hasRoundOf16Stage
          ? roundIndex === 1
            ? Math.max(6, Math.round(10 * previewFactor))
            : roundIndex === 2
              ? Math.max(16, Math.round(22 * previewFactor))
              : roundIndex === 3
                ? Math.max(26, Math.round(34 * previewFactor))
                : 0
        : roundIndex === 1
          ? Math.max(18, Math.round(26 * previewFactor))
          : roundIndex === 2
            ? Math.max(42, Math.round(58 * previewFactor))
            : 0;
    const getDetailedRoundCardWidth = (roundIndex: number, reduced: boolean) => {
      if (!usesDetailedPhaseCards) {
        return null;
      }

      if (roundIndex <= 0) {
        return reduced
          ? Math.max(
              reducedRoundColumnWidth,
              hasRoundOf16Stage ? 256 : 252,
            )
          : roundColumnWidth;
      }

      const baseWidth = reduced ? reducedRoundColumnWidth : roundColumnWidth;
      const compactWidth = hasRoundOf16Stage
        ? roundIndex === 1
          ? 0.88
          : roundIndex === 2
            ? 0.8
            : 0.76
        : roundIndex === 1
          ? 0.82
          : 0.72;
      return Math.max(132, Math.round(baseWidth * compactWidth));
    };
    const reducedSemiRoundIndex = hasRoundOf16Stage ? 2 : 1;
    const reducedQuarterRoundIndex = hasRoundOf16Stage ? 1 : -1;
    const getReducedRoundStackGap = (roundIndex: number) =>
      roundIndex === 0
        ? reducedFirstRoundStackGap
        : roundIndex === reducedQuarterRoundIndex
          ? reducedQuarterFinalStackGap
        : roundIndex === reducedSemiRoundIndex
          ? reducedSemiFinalStackGap
          : 0;
    const reducedRoundGridColumnStart = (roundIndex: number) => 3 + roundIndex * 2;
    const reducedGridTemplateColumns = [
      `${groupSectionWidth}px`,
      ...Array.from({ length: Math.max(reducedRoundCount, 1) }, (_, index) => {
        const spacer =
          index === 0
            ? reducedGroupToBracketGap
            : index === Math.max(reducedRoundCount, 1) - 1
              ? reducedFinalJoinGap
              : reducedInterRoundGap;
        return [`${spacer}px`, `${reducedRoundColumnWidth}px`];
      }).flat(),
    ].join(" ");
    const columnTemplate = [
      `${groupSectionWidth}px`,
      ...displayedKnockoutRounds.map(() => `${roundColumnWidth}px`),
    ].join(" ");
    const columnGap = Math.max(
      fullSizeColumnGap ?? 28,
      Math.round(
        (usesDetailedPhaseCards ? 92 : 72) *
          previewFactor *
          Math.max(narrowFactor, 0.92) *
          Math.max(desktopSpaceBoost, 1) *
          desktopSpacingBoost,
      ),
    );
    const reducedRowHeight = isUniformModalLayout
      ? Math.max(rowHeight, Math.round(rowHeight * (isFullSizeDesktop ? 1.28 : 1.1)))
      : rowHeight;
    const rowTemplate = `repeat(${bracketRowCount}, minmax(0, ${reducedRowHeight}px))`;
    const previewClassName = compact
      ? "relative overflow-x-auto pb-2"
      : isReducedPreview
        ? "relative flex h-full w-full items-center justify-center overflow-hidden px-2 py-2"
        : isFullSizeDesktop
          ? "flex h-full min-h-[560px] w-full items-center justify-center overflow-hidden px-6 py-3 xl:px-8 xl:py-4"
          : "relative h-full w-full overflow-hidden px-5 py-4 xl:px-6 xl:py-5";
    const coreLayoutWidth = isUniformModalLayout
      ? groupSectionWidth +
        reducedGroupToBracketGap +
        Math.max(0, reducedRoundCount - 2) * reducedInterRoundGap +
        (reducedRoundCount > 1 ? reducedFinalJoinGap : 0) +
        Math.max(reducedRoundCount, 1) * reducedRoundColumnWidth
      : groupSectionWidth +
        Math.max(0, displayedKnockoutRounds.length) * roundColumnWidth +
        Math.max(0, displayedKnockoutRounds.length) * columnGap;
    const desktopVisualPaddingLeft = isFullSizeDesktop ? 88 : 0;
    const desktopVisualPaddingRight = isFullSizeDesktop ? 176 : 0;
    const totalLayoutWidth =
      coreLayoutWidth + desktopVisualPaddingLeft + desktopVisualPaddingRight;
    const gridContentHeight = bracketRowCount * rowHeight;
    const verticalFramePadding =
      Math.max(hasRoundOf16Stage ? 12 : 24, Math.round((hasRoundOf16Stage ? 14 : 26) * previewFactor)) +
      (isUniformModalLayout
        ? Math.max(hasRoundOf16Stage ? 26 : 72, Math.round((hasRoundOf16Stage ? 34 : 92) * previewFactor))
        : 0);
    const totalLayoutHeight =
      Math.max(estimatedGroupStackHeight, gridContentHeight) + verticalFramePadding;
    const reducedOuterMargin = isUniformModalLayout
      ? Math.max(
          hasRoundOf16Stage ? (isFullSizeDesktop ? 4 : 8) : isFullSizeDesktop ? 14 : 18,
          Math.round(
            (hasRoundOf16Stage
              ? isFullSizeDesktop
                ? 6
                : 12
              : isFullSizeDesktop
                ? 20
                : 34) * previewFactor * Math.max(narrowFactor, 0.92),
          ),
        )
      : 0;
    const GROUP_FINAL_SAFE_X = 96;
    const GROUP_FINAL_SAFE_Y = 48;
    const viewportInnerWidth = Math.max(
      0,
      isFullSizeDesktop
        ? groupFinalAvailableWidth - GROUP_FINAL_SAFE_X
        : groupFinalAvailableWidth -
            (isUniformModalLayout ? reducedOuterMargin * 2 : isFullSizeDesktop ? 24 : 52),
    );
    const viewportInnerHeight = Math.max(
      0,
      isFullSizeDesktop
        ? groupFinalAvailableHeight - GROUP_FINAL_SAFE_Y
        : groupFinalAvailableHeight -
            (isUniformModalLayout
              ? reducedOuterMargin * 2 + fullSizeViewportInset
              : isFullSizeDesktop
                ? 24
                : 40),
    );
    const widthScale =
      compact || viewportInnerWidth <= 0 ? 1 : viewportInnerWidth / Math.max(totalLayoutWidth, 1);
    const heightScale =
      compact || viewportInnerHeight <= 0 ? 1 : viewportInnerHeight / Math.max(totalLayoutHeight, 1);
    const minScale = compact ? 1 : effectiveViewportWidth < 560 ? 0.12 : effectiveViewportWidth < 760 ? 0.17 : 0.23;
    const maxScale = compact
      ? 1
      : isFullSizeDesktop
        ? fullSizeScaleCap ?? 1.16
        : isReducedPreview
          ? 0.56
          : effectiveViewportWidth >= 1400
            ? 1.02
            : 0.9;
    const layoutScale = compact
      ? 1
      : isFullSizeDesktop
        ? Math.min(widthScale, heightScale, 1)
        : Math.min(maxScale, Math.max(minScale, Math.min(widthScale, heightScale)));
    const layoutScaleX = compact
      ? 1
      : isFullSizeDesktop
        ? Math.min(widthScale, 1) * 0.97
        : layoutScale;
    const layoutScaleY = compact
      ? 1
      : isFullSizeDesktop
        ? Math.min(heightScale, 1)
        : layoutScale;
    const scaledLayoutWidth = totalLayoutWidth * layoutScaleX;
    const scaledLayoutHeight = totalLayoutHeight * layoutScaleY;
    return (
      <div
        className={
          compact
            ? "mt-3 space-y-3"
            : fullSize
              ? "flex h-full min-h-0 flex-col gap-3"
              : "mt-3 flex h-full min-h-0 flex-col gap-3"
        }
      >
        {expandButton}
        <div ref={groupFinalViewportRef} className={previewClassName}>
          <div
            className={
              compact
                ? "mx-auto"
                : isFullSizeDesktop
                  ? "flex h-full w-full items-center justify-center"
                  : "relative h-full w-full"
            }
            style={
              compact
                ? {
                    width: `${scaledLayoutWidth}px`,
                    minWidth: `${totalLayoutWidth}px`,
                    height: `${scaledLayoutHeight}px`,
                  }
                : undefined
            }
          >
            <div
              className={
                compact
                  ? undefined
                  : isFullSizeDesktop
                    ? "flex h-full w-full max-w-[1800px] items-center justify-center overflow-hidden"
                    : isReducedPreview
                      ? "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                      : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              }
              style={
                compact
                  ? undefined
                  : isFullSizeDesktop
                    ? {
                        width: "100%",
                        height: "100%",
                      }
                    : {
                        width: `${scaledLayoutWidth}px`,
                        height: `${scaledLayoutHeight}px`,
                        marginTop:
                          isUniformModalLayout && isFullSizeDesktop
                            ? `${fullSizeVerticalOffset}px`
                            : undefined,
                      }
              }
            >
              <div
                className={isFullSizeDesktop ? "flex h-full w-full items-center justify-center overflow-hidden" : undefined}
              >
                <div
                  className={isFullSizeDesktop ? "flex w-full justify-center" : undefined}
                  style={
                    isFullSizeDesktop
                      ? {
                          width: `${totalLayoutWidth}px`,
                          height: `${totalLayoutHeight}px`,
                          transform: `scale(${layoutScaleX}, ${layoutScaleY})`,
                          transformOrigin: "center center",
                        }
                      : undefined
                  }
                >
                  <div
                    ref={groupFinalCanvasRef}
                    className="relative origin-top-left"
                    style={{
                      width: `${totalLayoutWidth}px`,
                      minHeight: `${totalLayoutHeight}px`,
                      transform: compact || isFullSizeDesktop ? undefined : `scale(${layoutScale})`,
                      transformOrigin: isFullSizeDesktop ? undefined : "top left",
                    }}
                  >
                <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                {groupFinalPaths.map((path) => (
                  <Fragment key={path.id}>
                    <path
                      d={path.d}
                      fill="none"
                      stroke="rgba(139,92,246,0.42)"
                      strokeWidth={
                        compact
                          ? 4
                          : effectiveViewportWidth < 760
                            ? Math.max(0.7, 2.4 * layoutScale)
                            : Math.max(1.2, 4.2 * layoutScale)
                      }
                      strokeLinecap="square"
                      strokeLinejoin="miter"
                    />
                    <path
                      d={path.d}
                      fill="none"
                      stroke="rgba(196,181,253,0.98)"
                      strokeWidth={
                        compact
                          ? 1.6
                          : effectiveViewportWidth < 760
                            ? Math.max(0.42, 0.92 * layoutScale)
                            : Math.max(0.7, 1.6 * layoutScale)
                      }
                      strokeLinecap="square"
                      strokeLinejoin="miter"
                    />
                    {path.dots?.map((dot, dotIndex) => (
                      <Fragment key={`${path.id}-dot-${dotIndex}`}>
                        <circle
                          cx={dot.x}
                          cy={dot.y}
                          r={compact ? 4.5 : effectiveViewportWidth < 760 ? Math.max(1.8, 4.2 * layoutScale) : Math.max(2.8, 6.5 * layoutScale)}
                          fill="rgba(139,92,246,0.22)"
                        />
                        <circle
                          cx={dot.x}
                          cy={dot.y}
                          r={compact ? 2.2 : effectiveViewportWidth < 760 ? Math.max(1.1, 2.2 * layoutScale) : Math.max(1.6, 3.4 * layoutScale)}
                          fill="rgba(196,181,253,0.98)"
                        />
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
                </svg>

                <div
                  className="space-y-3"
                  style={
                    isFullSizeDesktop
                      ? {
                          width: `${coreLayoutWidth}px`,
                          paddingLeft: `${desktopVisualPaddingLeft}px`,
                          paddingRight: `${desktopVisualPaddingRight}px`,
                          boxSizing: "content-box",
                        }
                      : undefined
                  }
                >
                  <div
                    className="grid"
                    style={
                      isUniformModalLayout
                        ? {
                            gridTemplateColumns: reducedGridTemplateColumns,
                            columnGap: "0px",
                            minHeight: `${Math.max(estimatedGroupStackHeight, gridContentHeight)}px`,
                            alignItems: "stretch",
                          }
                        : {
                            gridTemplateColumns: columnTemplate,
                            gridTemplateRows: rowTemplate,
                            columnGap: `${columnGap}px`,
                            minHeight: `${Math.max(estimatedGroupStackHeight, gridContentHeight)}px`,
                            justifyContent: isFullSizeDesktop ? "start" : undefined,
                          }
                    }
                  >
                    <div
                      className={
                        isUniformModalLayout
                          ? "flex items-center justify-center gap-2 self-stretch"
                          : "flex items-start gap-2 self-start"
                      }
                      style={{
                        gridColumn: 1,
                        gridRow: isUniformModalLayout ? "1 / -1" : "1 / span 1",
                        height: isUniformModalLayout
                          ? `${Math.max(estimatedGroupStackHeight, gridContentHeight)}px`
                          : "auto",
                        alignSelf: isUniformModalLayout ? "stretch" : "start",
                      }}
                    >
                      <div
                        className="shrink-0 font-semibold uppercase tracking-[0.18em] text-violet-100 [writing-mode:vertical-rl] rotate-180"
                        style={{
                          fontSize: `${sideLabelFontSize}px`,
                          width: `${Math.max(groupSideLabelWidth, Math.round(sideLabelFontSize + 10))}px`,
                        }}
                      >
                        Groupes
                      </div>
                      <div
                        className={isUniformModalLayout ? "self-center" : "self-start"}
                        style={{
                          marginLeft: "0px",
                          flex: "0 0 auto",
                          display: "flex",
                          flexDirection: "column",
                          justifyItems: "start",
                          alignItems: isUniformModalLayout ? "flex-start" : undefined,
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            rowGap: `${visibleReducedGroupGap}px`,
                            alignContent: isUniformModalLayout ? "center" : "start",
                          }}
                        >
                          {structure.groups.map((group, groupIndex) => (
                            <div
                              key={group.label}
                              ref={setGroupFinalNodeRef(`group-${groupIndex}`)}
                            className="relative z-10 rounded-[18px] border border-violet-300/28 bg-white/[0.08] shadow-[0_0_24px_rgba(124,58,237,0.12)]"
                              style={{
                                width: `${groupCardVisualWidth}px`,
                                justifySelf: "start",
                                paddingLeft: `${groupCardVisualPaddingX}px`,
                                paddingRight: `${groupCardVisualPaddingX}px`,
                                paddingTop: `${groupCardContentPaddingY}px`,
                                paddingBottom: `${groupCardContentPaddingY}px`,
                              }}
                            >
                              <p
                                className="text-center font-semibold uppercase tracking-[0.14em] text-white"
                                style={{ fontSize: `${groupCardNameFontSize}px` }}
                              >
                                {group.label}
                              </p>
                              <div className="mt-1" style={{ display: "grid", rowGap: `${groupCardContentGap}px` }}>
                                {group.teams.map((team, index) => (
                                  <div
                                    key={`${group.label}-team-${team}-${index + 1}`}
                                    className="flex w-full items-center justify-center rounded-full border border-white/12 bg-black/20 text-center whitespace-normal break-words text-slate-200"
                                    style={{
                                      fontSize: `${Math.max(12, groupCardTeamFontSize - 3)}px`,
                                      lineHeight: "1",
                                      minHeight: `${Math.max(26, Math.round(32 * previewFactor))}px`,
                                      maxWidth: `${Math.max(120, groupCardVisualWidth - groupCardVisualPaddingX * 2 - 12)}px`,
                                      justifySelf: "center",
                                      paddingLeft: `${Math.max(12, Math.round(15 * previewFactor * (isUniformModalLayout ? 1.14 : 1)))}px`,
                                      paddingRight: `${Math.max(12, Math.round(15 * previewFactor * (isUniformModalLayout ? 1.14 : 1)))}px`,
                                      paddingTop: `${Math.max(4, Math.round(4 * previewFactor * (isUniformModalLayout ? 1.14 : 1)))}px`,
                                      paddingBottom: `${Math.max(4, Math.round(4 * previewFactor * (isUniformModalLayout ? 1.14 : 1)))}px`,
                                    }}
                                  >
                                  {team}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {isUniformModalLayout ? (
                      <>
                        {reducedRoundDescriptors.map(({ round, roundIndex, label }) => (
                          <div
                            key={`reduced-round-${round.phaseLabel}-${roundIndex}`}
                            className="flex flex-col items-center justify-center self-stretch"
                            style={{
                              gridColumn: reducedRoundGridColumnStart(roundIndex),
                              gridRow: "1 / -1",
                              gap: `${Math.max(12, Math.round(14 * previewFactor))}px`,
                              transform: `translateX(${getReducedRoundHorizontalOffset(roundIndex)}px)`,
                            }}
                          >
                            <p
                              className="text-center font-semibold uppercase tracking-[0.16em] text-violet-100"
                              style={{ fontSize: `${Math.max(14, Math.round(matchFontSize * 0.78))}px` }}
                            >
                              {label === "Huitième de finale"
                                ? "8e"
                                : label === "Quart de finale"
                                ? "Quart"
                                : label === "Demi-finale"
                                  ? "Demi"
                                  : label}
                            </p>
                            <div
                              className="flex flex-col items-center"
                              style={{ gap: `${getReducedRoundStackGap(roundIndex)}px` }}
                            >
                              {round.matches.map((match, matchIndex) => (
                                <div
                                  key={`${round.phaseLabel}-${match.homeTeam}-${match.awayTeam}-${matchIndex}`}
                                  ref={setGroupFinalNodeRef(`round-${roundIndex}-${matchIndex}`)}
                                  className={`relative z-10 rounded-[18px] text-white shadow-[0_0_34px_rgba(124,58,237,0.22)] ${
                                    roundIndex === reducedRoundCount - 1
                                      ? "border border-violet-300/50 bg-violet-500/[0.18] text-violet-50 shadow-[0_0_34px_rgba(124,58,237,0.26)]"
                                      : "border border-violet-300/45 bg-white/[0.1]"
                                  } ${showPhaseMatchTeams ? "whitespace-normal break-words leading-[1.15]" : "leading-tight"}`}
                                  style={{
                                    fontSize: `${Math.max(showPhaseMatchTeams ? matchFontSize - 3 : matchFontSize, 16)}px`,
                                    width: showPhaseMatchTeams
                                      ? `${getDetailedRoundCardWidth(roundIndex, true) ?? Math.max(reducedRoundColumnWidth, 252)}px`
                                      : "fit-content",
                                    maxWidth: `${
                                      getDetailedRoundCardWidth(roundIndex, true) ??
                                      Math.max(reducedRoundColumnWidth, 252)
                                    }px`,
                                    height: `${reducedRoundCardVisualHeight}px`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    textAlign: "center",
                                    paddingLeft: `${Math.max(34, Math.round(phaseCardPaddingX * 2.05))}px`,
                                    paddingRight: `${Math.max(34, Math.round(phaseCardPaddingX * 2.05))}px`,
                                    paddingTop: `${reducedRoundCardPaddingY}px`,
                                    paddingBottom: `${reducedRoundCardPaddingY}px`,
                                  }}
                                >
                                  {getPreviewMatchLabel(match, label)}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </>
                    ) : (
                      displayedKnockoutRounds.map((round, roundIndex) =>
                        round.matches.map((match, matchIndex) => (
                          <div
                            key={`${round.phaseLabel}-${match.homeTeam}-${match.awayTeam}-${matchIndex}`}
                            ref={setGroupFinalNodeRef(`round-${roundIndex}-${matchIndex}`)}
                            className={`relative z-10 rounded-xl text-[8px] ${
                              roundIndex === mainKnockoutRounds.length - 1
                                ? "border border-violet-400/25 bg-violet-500/[0.12] text-violet-50 shadow-[0_0_22px_rgba(124,58,237,0.22)]"
                                : "border border-white/10 bg-black/20 text-slate-200 shadow-[0_0_18px_rgba(15,23,42,0.18)]"
                            } ${showPhaseMatchTeams ? "whitespace-normal break-words leading-[1.15]" : "leading-tight"}`}
                            style={{
                              gridColumn: roundIndex + 2,
                              gridRow: `${roundSlots[roundIndex]?.[matchIndex] ?? 1} / span 1`,
                              fontSize: `${Math.max(showPhaseMatchTeams ? matchFontSize - 3 : matchFontSize, 13)}px`,
                              width: showPhaseMatchTeams
                                ? `${getDetailedRoundCardWidth(roundIndex, false) ?? roundColumnWidth}px`
                                : "fit-content",
                              maxWidth: `${getDetailedRoundCardWidth(roundIndex, false) ?? roundColumnWidth}px`,
                              justifySelf: "center",
                              textAlign: "center",
                              transform: `translateX(${getStandardRoundHorizontalOffset(roundIndex)}px)`,
                              paddingLeft: `${phaseCardPaddingX}px`,
                              paddingRight: `${phaseCardPaddingX}px`,
                              paddingTop: `${standardRoundCardPaddingY}px`,
                              paddingBottom: `${standardRoundCardPaddingY}px`,
                            }}
                          >
                            {getPreviewMatchLabel(
                              match,
                              roundPreviewLabels[roundIndex] ?? getGroupFinalPreviewLabel(round.phaseLabel),
                            )}
                          </div>
                        )),
                      )
                    )}
                  </div>
                </div>
              </div>
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (compactVariant === "double_bracket") {
    const effectiveViewportWidth = effectiveDoubleBracketViewportWidth;
    const fullSizeDesignWidth = 1320;
    const layoutSizingWidth = compact
      ? effectiveViewportWidth
      : fullSizeDesignWidth;
    const isReducedPreview = !compact && effectiveViewportWidth < 980;
    const previewFactor = compact
      ? 1
      : effectiveViewportWidth >= 1600
        ? 1.04
        : effectiveViewportWidth >= 1400
          ? 0.96
          : effectiveViewportWidth >= 1200
            ? 0.88
            : effectiveViewportWidth >= 1020
              ? 0.8
              : effectiveViewportWidth >= 900
                ? 0.72
                : effectiveViewportWidth >= 760
                  ? 0.6
                  : 0.5;
    const previewGroups = doubleBracketPreviewGroups;
    const previewGroupCount = Math.max(1, previewGroups.length);
    const groupSizeFactor =
      previewGroupCount <= 2 ? 1.24 : previewGroupCount === 3 ? 1.12 : 1;
    const narrowFactor =
      layoutSizingWidth < 820 ? 0.72 : layoutSizingWidth < 980 ? 0.84 : 1;
    const reducedModeBoost =
      !compact && effectiveViewportWidth < 760 ? 1.38 : !compact && effectiveViewportWidth < 980 ? 1.24 : 1;
    const desktopSpaceBoost = 1;
    const desktopSpacingBoost = 1;
    const desktopBoost = 1;
    const desktopFrameBoost = 1;
    const desktopGroupBoost = 1;
    const sideLabelFontSize = Math.max(
      12,
      Math.round(16 * previewFactor * narrowFactor * desktopBoost * reducedModeBoost),
    );
    const groupNameFontSize = Math.max(
      20,
      Math.round(28 * previewFactor * narrowFactor * desktopBoost * reducedModeBoost),
    );
    const teamFontSize = Math.max(
      22,
      Math.round(30 * previewFactor * narrowFactor * desktopBoost * reducedModeBoost),
    );
    const matchFontSize = Math.max(
      18,
      Math.round(24 * previewFactor * narrowFactor * desktopBoost * reducedModeBoost),
    );
    const previewClassName = compact
      ? "relative overflow-x-auto pb-2"
      : isReducedPreview
        ? "relative flex h-full w-full items-center justify-center overflow-hidden px-2 py-1.5"
        : "relative flex h-full w-full items-center justify-center overflow-hidden px-2 py-3 xl:px-3 xl:py-4";
    const winnerFirstRoundMatchCount = Math.max(1, doubleBracketWinnerRounds[0]?.matches.length ?? 1);
    const loserFirstRoundMatchCount = Math.max(1, doubleBracketLoserRounds[0]?.matches.length ?? 1);
    const phaseRowCount = Math.max(
      Math.max(1, winnerFirstRoundMatchCount * 2 - 1),
      Math.max(1, loserFirstRoundMatchCount * 2 - 1),
    );
    const maxTeamsPerGroup = Math.max(1, ...previewGroups.map((group) => group.teams.length));
    const longestMatchLabelLength = Math.max(
      8,
      ...doubleBracketWinnerRounds.flatMap((round) => round.matches.map((match) => match.length)),
      ...doubleBracketLoserRounds.flatMap((round) => round.matches.map((match) => match.length)),
    );
    const matchBlockHeight = Math.max(34, Math.round(58 * previewFactor * narrowFactor));
    const phaseTitleHeight = Math.max(12, Math.round(20 * previewFactor * narrowFactor));
    const phaseSectionGap = Math.max(8, Math.round(16 * previewFactor * Math.max(narrowFactor, 0.92)));
    const phaseMatchGap = Math.max(6, Math.round(10 * previewFactor * Math.max(narrowFactor, 0.92)));
    const groupsHeaderHeight = Math.max(11, Math.round(20 * previewFactor * narrowFactor));
    const sectionPadding = Math.max(2, Math.round(5 * previewFactor * narrowFactor));
    const groupFrameExtra = Math.max(
      4,
      Math.round(10 * previewFactor * Math.max(desktopBoost, 1) * narrowFactor),
    );
    const phaseFrameInsetX = Math.max(
      3,
      Math.round(8 * previewFactor * Math.max(desktopBoost, 1) * narrowFactor),
    );
    const phaseFrameInsetY = Math.max(
      3,
      Math.round(5 * previewFactor * Math.max(desktopBoost, 1) * narrowFactor),
    );
    const groupCardPaddingY = Math.max(
      isReducedPreview ? 14 : 10,
      Math.round(
        (isReducedPreview ? 22 : 18) *
          previewFactor *
          Math.min(groupSizeFactor, 1.14) *
          Math.max(narrowFactor, 0.9) *
          desktopGroupBoost,
      ),
    );
    const groupCardPaddingX = Math.max(
      isReducedPreview ? 34 : 30,
      Math.round(
        (isReducedPreview ? 56 : 48) *
          previewFactor *
          Math.min(groupSizeFactor, 1.14) *
          Math.max(narrowFactor, 0.9) *
          desktopGroupBoost,
      ),
    );
    const groupCardGap = Math.max(
      isReducedPreview ? 10 : 4,
      Math.round(
        (isReducedPreview ? 14 : 7) *
          previewFactor *
          Math.min(groupSizeFactor, 1.1) *
          Math.max(narrowFactor, 0.92),
      ),
    );
    const groupTeamGap = Math.max(
      1,
      Math.round(2 * previewFactor * Math.min(groupSizeFactor, 1.08) * narrowFactor),
    );
    const estimatedGroupCardHeight =
      (12 + groupCardPaddingY * 2 + maxTeamsPerGroup * 13 + Math.max(0, maxTeamsPerGroup - 1) * groupTeamGap) *
      previewFactor;
    const groupColumnWidth = Math.max(
      isReducedPreview ? 430 : 370,
      Math.round(
        (isReducedPreview ? 640 : 560) *
          previewFactor *
          groupSizeFactor *
          Math.max(narrowFactor, 0.9) *
          Math.max(desktopGroupBoost, 1),
      ),
    );
    const groupCardVisualWidth = groupColumnWidth;
    const groupCardVisualPaddingX = groupCardPaddingX;
    const groupCardVisualPaddingY = groupCardPaddingY;
    const groupCardNameFontSize = groupNameFontSize;
    const groupCardTeamFontSize = teamFontSize;
    const estimatedGroupStackHeight =
      previewGroups.length * estimatedGroupCardHeight +
      Math.max(0, previewGroups.length - 1) * groupCardGap +
      groupsHeaderHeight;
    const phaseContentHeight =
      phaseRowCount * matchBlockHeight + Math.max(0, phaseRowCount - 1) * phaseMatchGap;
    const phaseHeight = Math.max(
      Math.round(216 * previewFactor * narrowFactor),
      phaseTitleHeight +
        (sectionPadding + phaseFrameInsetY) * 2 +
        phaseSectionGap +
        phaseContentHeight,
    );
    const totalGridHeight = Math.max(
      estimatedGroupStackHeight + Math.max(6, Math.round(10 * previewFactor)),
      phaseHeight * 2 + phaseSectionGap,
    );
    const phaseContentOffset = 0;
    const phaseVerticalLift = 0;
    const buildRoundSlots = (
      rounds: Array<{ phaseLabel: string; matches: string[] }>,
    ) => {
      const slots: number[][] = [];
      rounds.forEach((round, roundIndex) => {
        if (roundIndex === 0) {
          slots.push(Array.from({ length: round.matches.length }, (_, index) => 1 + index * 2));
          return;
        }

        const previousRound = rounds[roundIndex - 1];
        const previousSlots = slots[roundIndex - 1] ?? [];
        slots.push(
          Array.from({ length: round.matches.length }, (_, index) => {
            const fromIndex = Math.floor((index * previousRound.matches.length) / round.matches.length);
            const toIndex = Math.min(
              previousRound.matches.length - 1,
              Math.floor((((index + 1) * previousRound.matches.length) / round.matches.length) - 1),
            );
            const startSlot = previousSlots[fromIndex] ?? 1;
            const endSlot = previousSlots[toIndex] ?? startSlot;
            return Math.round((startSlot + endSlot) / 2);
          }),
        );
      });
      return slots;
    };
    const winnerSlots = buildRoundSlots(doubleBracketWinnerRounds);
    const loserSlots = buildRoundSlots(doubleBracketLoserRounds);
    const phaseColumnGap = Math.max(4, Math.round(11 * previewFactor * narrowFactor));
    const phaseCardPaddingX = Math.max(
      8,
      Math.round(12 * previewFactor * Math.min(narrowFactor * desktopBoost, 1.08)),
    );
    const phaseCardTextWidth = Math.round(longestMatchLabelLength * matchFontSize * 0.54);
    const phaseCardWidth = Math.max(
      104,
      phaseCardTextWidth + phaseCardPaddingX * 2 + 28,
    );
    const roundColumnWidth = phaseCardWidth;
    const phaseRoundCount = Math.max(
      1,
      doubleBracketWinnerRounds.length,
      doubleBracketLoserRounds.length,
    );
    const phaseColumnTemplate = Array.from({ length: phaseRoundCount }, () => `${roundColumnWidth}px`).join(" ");
    const phaseRowTemplate = `repeat(${phaseRowCount}, minmax(${matchBlockHeight}px, 1fr))`;
    const containerColumnGap = Math.max(
      28,
      Math.round(
        72 *
          previewFactor *
          Math.max(narrowFactor, 0.92) *
          Math.max(desktopSpaceBoost, 1) *
          desktopSpacingBoost,
      ),
    );
    const rightColumnOffset = Math.max(
      34,
      Math.round(
        96 *
          previewFactor *
          Math.max(narrowFactor, 0.92) *
          Math.max(desktopSpaceBoost, 1) *
          desktopSpacingBoost,
      ),
    );
    const reducedOuterMargin = Math.max(
      isReducedPreview ? 8 : 14,
      Math.round((isReducedPreview ? 16 : 20) * previewFactor * Math.max(narrowFactor, 0.92)),
    );
    const effectiveRightColumnOffset = isReducedPreview ? 0 : rightColumnOffset;
    const bracketRightEdgePadding = Math.max(
      18,
      Math.round(36 * previewFactor * Math.max(narrowFactor, 0.92)),
    );
    const bracketLeftEdgePadding = isReducedPreview ? bracketRightEdgePadding : 0;
    const phaseContentWidth =
      phaseRoundCount * roundColumnWidth +
      Math.max(0, phaseRoundCount - 1) * phaseColumnGap;
    const phaseFrameWidth = Math.max(
      phaseContentWidth + (sectionPadding + phaseFrameInsetX) * 2 + groupFrameExtra,
      Math.round(320 * desktopFrameBoost),
    );
    const phaseColumnWidth =
      phaseFrameWidth + effectiveRightColumnOffset + bracketRightEdgePadding;
    const totalLayoutWidth =
      bracketLeftEdgePadding + groupColumnWidth + containerColumnGap + phaseColumnWidth;
    const viewportInnerWidth = Math.max(0, doubleBracketAvailableWidth - reducedOuterMargin * 2);
    const viewportInnerHeight = Math.max(0, doubleBracketAvailableHeight - reducedOuterMargin * 2);
    const widthScale =
      compact || viewportInnerWidth <= 0 ? 1 : viewportInnerWidth / totalLayoutWidth;
    const heightScale =
      compact || viewportInnerHeight <= 0 ? 1 : viewportInnerHeight / totalGridHeight;
    const minScale = compact ? 1 : effectiveViewportWidth < 560 ? 0.24 : effectiveViewportWidth < 760 ? 0.28 : 0.36;
    const layoutScale =
      compact
        ? 1
        : Math.min(isReducedPreview ? 1.06 : 0.9, Math.max(minScale, Math.min(widthScale, heightScale)));
    const bracketStrokeWidth = compact
      ? 4
      : effectiveViewportWidth < 760
        ? Math.max(0.38, 1.7 * layoutScale)
        : Math.max(0.8, 3.2 * layoutScale);
    const bracketAccentStrokeWidth = compact
      ? 1.4
      : effectiveViewportWidth < 760
        ? Math.max(0.22, 0.58 * layoutScale)
        : Math.max(0.42, 1.05 * layoutScale);
    const scaledLayoutWidth = totalLayoutWidth * layoutScale;
    const scaledLayoutHeight = totalGridHeight * layoutScale;
    const fullSizeVerticalLift =
      !compact && !isReducedPreview
        ? Math.max(10, Math.round(18 * previewFactor))
        : 0;
    const reducedVerticalLift =
      !compact && isReducedPreview
        ? Math.max(8, Math.round(14 * previewFactor))
        : 0;
    const containerGridStyle = {
      display: "grid",
      gridTemplateColumns: `${groupColumnWidth}px ${phaseColumnWidth}px`,
      gridTemplateRows: `${phaseHeight}px ${phaseHeight}px`,
      columnGap: `${containerColumnGap}px`,
      rowGap: `${phaseSectionGap}px`,
      alignItems: "stretch",
      minHeight: `${totalGridHeight}px`,
      width: `${totalLayoutWidth}px`,
      paddingLeft: `${bracketLeftEdgePadding}px`,
      paddingRight: `${isReducedPreview ? bracketRightEdgePadding : 0}px`,
    };
    const sectionTitleClass =
      "text-center font-semibold uppercase tracking-[0.18em]";
    const renderPhaseSection = (
      tone: "winner" | "loser",
      title: string,
      rounds: Array<{ phaseLabel: string; matches: string[] }>,
      slots: number[][],
      phaseKey: "uefa" | "europa",
    ) => (
      <section
        className={`flex min-h-0 flex-col rounded-[20px] border ${
          tone === "winner"
            ? "border-violet-400/18 bg-violet-500/[0.04] shadow-[0_0_28px_rgba(124,58,237,0.12)]"
            : "border-white/10 bg-white/[0.02] shadow-[0_0_18px_rgba(15,23,42,0.12)]"
        }`}
        style={{
          gap: `${phaseSectionGap}px`,
          minHeight: `${phaseHeight}px`,
          height: "100%",
          padding: `${sectionPadding + phaseFrameInsetY}px ${sectionPadding + phaseFrameInsetX}px`,
          width: `${phaseFrameWidth}px`,
          maxWidth: "100%",
          justifySelf: "start",
          alignSelf: "start",
        }}
      >
        <p
          className={`${sectionTitleClass} ${
            tone === "winner" ? "text-violet-100" : "text-slate-300"
          }`}
          style={{
            fontSize: `${Math.max(10, Math.round(12 * previewFactor * Math.max(desktopBoost, 1)))}px`,
            lineHeight: `${phaseTitleHeight}px`,
            minHeight: `${phaseTitleHeight}px`,
          }}
        >
          {title}
        </p>
        <div
          className="relative flex min-h-0 flex-1 justify-center"
          style={{
            width: `${phaseContentWidth}px`,
          }}
        >
          <div
            className="grid h-full items-center"
            style={{
              gridTemplateColumns: phaseColumnTemplate,
              gridTemplateRows: phaseRowTemplate,
              columnGap: `${phaseColumnGap}px`,
              rowGap: `${phaseMatchGap}px`,
              width: `${phaseContentWidth}px`,
            }}
          >
            {rounds.map((round, roundIndex) =>
              round.matches.map((match, matchIndex) => (
                <div
                  key={`${phaseKey}-${round.phaseLabel}-${matchIndex}`}
                  ref={setDoubleBracketNodeRef(
                    `${tone}-round-${roundIndex}-${matchIndex}`,
                  )}
                    className={`relative z-10 flex items-center justify-center rounded-xl text-center whitespace-normal break-words leading-[1.05] ${
                      tone === "winner"
                      ? roundIndex === rounds.length - 1
                        ? "border border-violet-400/25 bg-violet-500/[0.12] text-violet-50 shadow-[0_0_22px_rgba(124,58,237,0.22)]"
                        : "border border-violet-400/20 bg-violet-500/[0.08] text-violet-100 shadow-[0_0_18px_rgba(124,58,237,0.18)]"
                      : "border border-white/10 bg-black/20 text-slate-200 shadow-[0_0_18px_rgba(15,23,42,0.18)]"
                  }`}
                    style={{
                      gridColumn: roundIndex + 1,
                      gridRow: `${slots[roundIndex]?.[matchIndex] ?? 1} / span 1`,
                      fontSize: `${Math.max(matchFontSize - 3, 13)}px`,
                      height: `${matchBlockHeight}px`,
                      width: `${phaseCardWidth}px`,
                      minWidth: `${phaseCardWidth}px`,
                      maxWidth: `${phaseCardWidth}px`,
                      justifySelf: "center",
                      paddingLeft: `${phaseCardPaddingX}px`,
                      paddingRight: `${phaseCardPaddingX}px`,
                    }}
                  >
                    {match}
                </div>
              )),
            )}
          </div>
        </div>
      </section>
    );

    return (
      <div className={compact ? "mt-3 space-y-3" : "mt-3 flex h-full min-h-0 flex-col gap-3"}>
        {expandButton}
        <div ref={doubleBracketViewportRef} className={previewClassName}>
          <div
            className={compact ? "mx-auto" : "relative h-full w-full"}
            style={{
              width: compact ? `${scaledLayoutWidth}px` : undefined,
              minWidth: compact ? `${totalLayoutWidth}px` : undefined,
              height: compact ? `${scaledLayoutHeight}px` : undefined,
            }}
          >
            <div
              className={
                compact
                  ? undefined
                  : isReducedPreview
                    ? "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                    : "absolute left-0 top-1/2 -translate-y-1/2"
              }
              style={
                compact
                  ? undefined
                  : {
                      width: `${scaledLayoutWidth}px`,
                      height: `${scaledLayoutHeight}px`,
                      marginLeft: !isReducedPreview ? "0px" : undefined,
                      marginTop: isReducedPreview
                        ? `-${reducedVerticalLift}px`
                        : `-${fullSizeVerticalLift}px`,
                    }
              }
            >
              <div
                ref={doubleBracketCanvasRef}
                className="relative origin-top-left"
                style={{
                  width: `${totalLayoutWidth}px`,
                  minHeight: `${totalGridHeight}px`,
                  transform: `scale(${layoutScale})`,
                  transformOrigin: "top left",
                }}
              >
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                {doubleBracketPaths.map((path) => (
                  <Fragment key={path.id}>
                    <path
                      d={path.d}
                      fill="none"
                      stroke={
                    path.tone === "winner"
                      ? "rgba(139,92,246,0.22)"
                      : "rgba(148,163,184,0.18)"
                  }
                      strokeWidth={bracketStrokeWidth}
                      strokeLinecap="square"
                      strokeLinejoin="miter"
                    />
                    <path
                      d={path.d}
                      fill="none"
                      stroke={
                    path.tone === "winner"
                      ? "rgba(167,139,250,0.92)"
                      : "rgba(203,213,225,0.72)"
                  }
                      strokeWidth={bracketAccentStrokeWidth}
                      strokeLinecap="square"
                      strokeLinejoin="miter"
                    />
                  </Fragment>
                ))}
              </svg>
                <div
                  className={`flex ${
                    compact ? "min-w-max justify-center" : isReducedPreview ? "justify-center" : "justify-start"
                  }`}
                >
                  <div style={containerGridStyle}>
                  <section
                    className="flex min-h-0"
                    style={{
                      gridColumn: 1,
                      gridRow: "1 / span 2",
                      gap: `${Math.max(4, Math.round(6 * previewFactor))}px`,
                      minHeight: `${totalGridHeight}px`,
                      alignItems: "center",
                    }}
                  >
                    <div
                      className="shrink-0 font-semibold uppercase tracking-[0.18em] text-violet-100"
                      style={{
                        fontSize: `${sideLabelFontSize}px`,
                        lineHeight: `${groupsHeaderHeight}px`,
                        writingMode: "vertical-rl",
                        transform: "rotate(180deg)",
                        alignSelf: "center",
                      }}
                    >
                      Groupes
                    </div>
                    <div
                      className="flex min-h-0 flex-1 flex-col"
                      style={{
                        gap: `${groupCardGap}px`,
                        paddingTop: "0px",
                        paddingBottom: "0px",
                        justifyContent: isReducedPreview ? "space-evenly" : "center",
                        alignSelf: "center",
                        minHeight: `${totalGridHeight}px`,
                      }}
                    >
                      {previewGroups.map((group, groupIndex) => (
                        <div
                          key={group.label}
                          ref={setDoubleBracketNodeRef(`db-group-${groupIndex}`)}
                          className="relative z-10 rounded-[14px] border border-white/10 bg-white/[0.04]"
                          style={{
                            paddingLeft: `${groupCardVisualPaddingX}px`,
                            paddingRight: `${groupCardVisualPaddingX}px`,
                            paddingTop: `${groupCardVisualPaddingY}px`,
                            paddingBottom: `${groupCardVisualPaddingY}px`,
                            width: `${groupCardVisualWidth}px`,
                          }}
                        >
                          <p
                            className="font-semibold uppercase tracking-[0.16em] text-white"
                            style={{
                              fontSize: `${groupCardNameFontSize}px`,
                              lineHeight: "1",
                            }}
                          >
                            {group.label}
                          </p>
                          <div className="mt-1.5 flex flex-col" style={{ gap: `${groupTeamGap}px` }}>
                            {group.teams.map((team, teamIndex) => (
                          <div
                            key={`${group.label}-${team}-${teamIndex + 1}`}
                            className="flex w-full max-w-full self-center items-center justify-center rounded-full border border-white/10 bg-black/20 text-center whitespace-normal break-words text-slate-300"
                            style={{
                              fontSize: `${Math.max(13, groupCardTeamFontSize - 3)}px`,
                              lineHeight: "1",
                              minHeight: `${Math.max(26, Math.round(32 * previewFactor))}px`,
                              maxWidth: `${Math.max(120, groupCardVisualWidth - groupCardVisualPaddingX * 2 - 12)}px`,
                              letterSpacing: `${Math.max(0.12, groupCardTeamFontSize * 0.11)}px`,
                              fontStretch: "expanded",
                              paddingLeft: `${Math.max(
                                7,
                                Math.round(12 * previewFactor * narrowFactor),
                              )}px`,
                              paddingRight: `${Math.max(
                                7,
                                Math.round(12 * previewFactor * narrowFactor),
                              )}px`,
                              paddingTop: `${Math.max(
                                2,
                                Math.round((isReducedPreview ? 3 : 2) * previewFactor * narrowFactor),
                              )}px`,
                              paddingBottom: `${Math.max(
                                2,
                                Math.round((isReducedPreview ? 3 : 2) * previewFactor * narrowFactor),
                              )}px`,
                            }}
                          >
                                {team}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

              <div
                style={{
                  gridColumn: 2,
                  gridRow: 1,
                  paddingTop: `${phaseContentOffset}px`,
                  display: "flex",
                  justifyContent: "flex-start",
                  alignItems: "center",
                  transform: `translateY(-${phaseVerticalLift}px)`,
                  paddingLeft: `${effectiveRightColumnOffset}px`,
                  paddingRight: `${bracketRightEdgePadding}px`,
                }}
              >
                    {renderPhaseSection(
                      "winner",
                      "PHASE FINALE UEFA (TOP 4)",
                      doubleBracketWinnerRounds,
                      winnerSlots,
                      "uefa",
                    )}
                  </div>

              <div
                style={{
                  gridColumn: 2,
                  gridRow: 2,
                  paddingTop: `${phaseContentOffset}px`,
                  display: "flex",
                  justifyContent: "flex-start",
                  alignItems: "center",
                  transform: `translateY(-${phaseVerticalLift}px)`,
                  paddingLeft: `${effectiveRightColumnOffset}px`,
                  paddingRight: `${bracketRightEdgePadding}px`,
                }}
              >
                    {renderPhaseSection(
                      "loser",
                      "PHASE FINALE EUROPA (5-8)",
                      doubleBracketLoserRounds,
                      loserSlots,
                      "europa",
                    )}
                  </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {expandButton}

      {structure.groups.length > 0 ? (
        <div className="space-y-2">
          <p className={titleClass}>Groupes</p>
          <div className={`flex items-start overflow-x-auto ${roundGapClass}`}>
            {structure.groups.map((group) => (
              <div key={group.label} className={groupCardClass}>
                <p className={titleClass}>{group.label}</p>
                <div className="mt-2 space-y-1.5">
                  {group.teams.map((team) => (
                    <div
                      key={`${group.label}-${team}`}
                      className={compact ? "text-[10px] text-slate-300" : "text-[11px] text-slate-200"}
                    >
                      {team}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {knockoutRounds.length > 0 ? (
        <div className="space-y-2">
          <p className={titleClass}>Phase finale</p>
          <div className={`flex items-start overflow-x-auto ${roundGapClass}`}>
            {knockoutRounds.map((round, roundIndex) => (
              <div key={round.phaseLabel} className={`flex items-center ${roundGapClass}`}>
                <div className={compact ? "space-y-2" : "space-y-3"}>
                  <p className={titleClass}>{round.phaseLabel}</p>
                  {round.matches.map((match, index) => (
                    <div key={`${round.phaseLabel}-${index + 1}`} className={matchCardClass}>
                      {match.homeTeam} vs {match.awayTeam}
                    </div>
                  ))}
                </div>
                {roundIndex < knockoutRounds.length - 1 ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className={`h-px ${lineWidthClass} bg-white/15`} />
                    <div className={`${connectorHeightClass} w-px bg-white/15`} />
                    <div className={`h-px ${lineWidthClass} bg-white/15`} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {classementRounds.length > 0 ? (
        <div className="space-y-2">
          <p className={titleClass}>Classement</p>
          <div className={`flex items-start overflow-x-auto ${roundGapClass}`}>
            {classementRounds.map((round) => (
              <div key={round.phaseLabel} className={compact ? "space-y-2" : "space-y-3"}>
                <p className={titleClass}>{round.phaseLabel}</p>
                {round.matches.map((match, index) => (
                  <div key={`${round.phaseLabel}-${index + 1}`} className={matchCardClass}>
                    {match.homeTeam} vs {match.awayTeam}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const buildAutoSuggestions = (
  config: TournamentConfig,
  preferredFormat: TournamentAutoFormat | null = null,
  assistantState?: {
    durationConfirmed: boolean;
    breakConfirmed: boolean;
    lunchBreakConfirmed: boolean;
    formatConfirmed: boolean;
  },
  inferredTeamCount = 0,
) => {
  const durationLocked = assistantState?.durationConfirmed ?? false;
  const breakLocked = assistantState?.breakConfirmed ?? false;
  const lunchLocked = assistantState?.lunchBreakConfirmed ?? false;
  const targetTeamCount =
    config.teamCount > 0
      ? config.teamCount
      : inferredTeamCount >= 2
        ? inferredTeamCount
      : config.fieldCount <= 1
        ? 6
      : config.fieldCount === 2
        ? 8
        : 12;
  const safeFieldCount = Math.max(1, toSafeNonNegativeInteger(config.fieldCount, 1));
  const safeMatchDuration = Math.max(
    1,
    toSafeNonNegativeInteger(config.matchDuration, DEFAULT_CONFIG.matchDuration),
  );
  const safeBreakMinutes = Math.max(
    1,
    toSafeNonNegativeInteger(config.breakMinutes, DEFAULT_CONFIG.breakMinutes),
  );
  const safeLunchBreakMinutes = Math.max(
    0,
    toSafeNonNegativeInteger(config.lunchBreakMinutes, DEFAULT_CONFIG.lunchBreakMinutes),
  );
  const recommendedSetup = getRecommendedAutoSetup(targetTeamCount);

  type TimingVariant = "rapid" | "balanced" | "comfort" | "intense";

  const resolveVariantMatchDuration = (candidate: number) => {
    if (durationLocked) {
      return safeMatchDuration;
    }

    return safeMatchDuration > 20 ? Math.max(10, candidate) : Math.min(20, Math.max(10, candidate));
  };

  const resolveVariantBreakMinutes = (candidate: number) =>
    breakLocked
      ? safeBreakMinutes
      : safeBreakMinutes > 3
        ? Math.max(1, candidate)
        : Math.min(3, Math.max(1, candidate));

  const resolveVariantLunchBreakMinutes = (candidate: number) => {
    if (lunchLocked) {
      return safeLunchBreakMinutes;
    }

    if (safeLunchBreakMinutes > 60) {
      return Math.max(0, candidate);
    }

    return snapToClosest(Math.min(60, Math.max(30, candidate)), [30, 45, 60]);
  };

  const recommendedDurationCandidates = durationLocked
    ? [safeMatchDuration]
    : [10, 12, 15, 18, 20].filter((value) => value <= 20);
  const recommendedBreakCandidates = breakLocked
    ? [safeBreakMinutes]
    : safeBreakMinutes > 3
      ? [safeBreakMinutes]
      : [1, 2, 3];
  const recommendedLunchCandidates = lunchLocked
    ? [safeLunchBreakMinutes]
    : safeLunchBreakMinutes > 60
      ? [safeLunchBreakMinutes]
      : [60, 45, 30];

  const variantTimings: Record<
    TimingVariant,
    {
      matchDuration: number;
      breakMinutes: number;
      lunchBreakMinutes: number;
    }
  > = {
    rapid: {
      matchDuration: resolveVariantMatchDuration(
        Math.max(10, safeMatchDuration - 2 + randomOffset(-1, 0)),
      ),
      breakMinutes: resolveVariantBreakMinutes(
        safeBreakMinutes > 3 ? safeBreakMinutes : 1 + randomOffset(0, 1),
      ),
      lunchBreakMinutes: resolveVariantLunchBreakMinutes(
        Math.min(45, (safeLunchBreakMinutes || 45) + randomOffset(-10, 5)),
      ),
    },
    balanced: {
      matchDuration: resolveVariantMatchDuration(safeMatchDuration + randomOffset(0, 1)),
      breakMinutes: resolveVariantBreakMinutes(Math.max(2, safeBreakMinutes + randomOffset(0, 1))),
      lunchBreakMinutes: resolveVariantLunchBreakMinutes(
        (safeLunchBreakMinutes || 60) + randomOffset(-10, 10),
      ),
    },
    comfort: {
      matchDuration: resolveVariantMatchDuration(safeMatchDuration + 4 + randomOffset(0, 2)),
      breakMinutes: resolveVariantBreakMinutes(Math.max(3, safeBreakMinutes + 1 + randomOffset(0, 1))),
      lunchBreakMinutes: resolveVariantLunchBreakMinutes(
        Math.max(60, safeLunchBreakMinutes || 60) + randomOffset(0, 10),
      ),
    },
    intense: {
      matchDuration: resolveVariantMatchDuration(
        Math.max(10, safeMatchDuration - 5 + randomOffset(0, 1)),
      ),
      breakMinutes: resolveVariantBreakMinutes(
        safeBreakMinutes > 3 ? safeBreakMinutes : 1 + randomOffset(0, 1),
      ),
      lunchBreakMinutes: resolveVariantLunchBreakMinutes(30 + randomOffset(0, 10)),
    },
  };

  const getVariantTiming = (variant: TimingVariant) => variantTimings[variant];

  const applyVariantTiming = <
    T extends TournamentSuggestionPreset,
  >(
    preset: T,
    variant: TimingVariant,
  ) => ({
    ...preset,
    ...getVariantTiming(variant),
  });

  const tunePresetTiming = <T extends TournamentSuggestionPreset>(
    preset: T,
    overrides: Partial<
      Pick<TournamentSuggestionPreset, "matchDuration" | "breakMinutes" | "lunchBreakMinutes">
    >,
    labelSuffix: string,
  ) => ({
    ...preset,
    matchDuration: resolveVariantMatchDuration(
      overrides.matchDuration ?? preset.matchDuration,
    ),
    breakMinutes: resolveVariantBreakMinutes(overrides.breakMinutes ?? preset.breakMinutes),
    lunchBreakMinutes: resolveVariantLunchBreakMinutes(
      overrides.lunchBreakMinutes ?? preset.lunchBreakMinutes,
    ),
    variantLabel: `${preset.variantLabel} • ${labelSuffix}`,
  });

  const buildExtraPresetVariants = (basePresets: TournamentSuggestionPreset[]) => {
    const seeds = basePresets.slice(0, 4);
    const extras: TournamentSuggestionPreset[] = [];

    if (seeds[0]) {
      extras.push(
        tunePresetTiming(
          seeds[0],
          {
            matchDuration: Math.max(10, seeds[0].matchDuration - 2),
            breakMinutes:
              seeds[0].breakMinutes > 3
                ? seeds[0].breakMinutes - 1
                : Math.max(1, seeds[0].breakMinutes),
            lunchBreakMinutes: Math.max(30, seeds[0].lunchBreakMinutes - 15),
          },
          "pause courte",
        ),
      );
    }

    if (seeds[1]) {
      extras.push(
        tunePresetTiming(
          seeds[1],
          {
            matchDuration: seeds[1].matchDuration + 4,
          },
          "match plus long",
        ),
      );
    }

    if (seeds[2]) {
      extras.push(
        tunePresetTiming(
          seeds[2],
          {
            matchDuration: seeds[2].matchDuration + 2,
            lunchBreakMinutes: seeds[2].lunchBreakMinutes + 15,
          },
          "repas long",
        ),
      );
    }

    if (seeds[3]) {
      extras.push(
        tunePresetTiming(
          seeds[3],
          {
            matchDuration: Math.max(10, seeds[3].matchDuration - 3),
            breakMinutes:
              seeds[3].breakMinutes > 3
                ? seeds[3].breakMinutes + 1
                : Math.min(3, seeds[3].breakMinutes + 1),
          },
          "rotation rapide",
        ),
      );
    }

    if (seeds[0]) {
      extras.push(
        tunePresetTiming(
          seeds[0],
          {
            matchDuration: seeds[0].matchDuration + 3,
            lunchBreakMinutes: Math.max(30, seeds[0].lunchBreakMinutes - 10),
          },
          "match allonge",
        ),
      );
    }

    if (seeds[1]) {
      extras.push(
        tunePresetTiming(
          seeds[1],
          {
            breakMinutes:
              seeds[1].breakMinutes > 3
                ? seeds[1].breakMinutes - 1
                : Math.max(1, seeds[1].breakMinutes - 1),
            lunchBreakMinutes: seeds[1].lunchBreakMinutes + 10,
          },
          "pause optimisee",
        ),
      );
    }

    if (seeds[2]) {
      extras.push(
        tunePresetTiming(
          seeds[2],
          {
            matchDuration: Math.max(10, seeds[2].matchDuration - 2),
            breakMinutes:
              seeds[2].breakMinutes > 3
                ? seeds[2].breakMinutes + 1
                : Math.min(3, seeds[2].breakMinutes + 1),
          },
          "tempo alterne",
        ),
      );
    }

    return [...basePresets, ...extras];
  };

  const expandPresetPool = (
    basePresets: TournamentSuggestionPreset[],
    targetCount = 16,
  ) => {
    const expanded = [...basePresets];
    const signatures = new Set(
      expanded.map((preset) =>
        [
          preset.format,
          preset.groupCount,
          preset.teamsPerGroup,
          preset.matchDuration,
          preset.breakMinutes,
          preset.lunchBreakMinutes,
          preset.groupHomeAway ? "home-away" : "single",
        ].join("-"),
      ),
    );

    const variationMatrix = [
      { duration: -4, breakOffset: 0, lunchOffset: -15, suffix: "court" },
      { duration: -2, breakOffset: -1, lunchOffset: 0, suffix: "dense" },
      { duration: 2, breakOffset: 0, lunchOffset: 10, suffix: "souple" },
      { duration: 4, breakOffset: 1, lunchOffset: 15, suffix: "long" },
      { duration: 6, breakOffset: 0, lunchOffset: -10, suffix: "rythme" },
      { duration: -3, breakOffset: 1, lunchOffset: 20, suffix: "pause" },
      { duration: 1, breakOffset: -1, lunchOffset: 5, suffix: "tempo" },
    ];

    for (const preset of basePresets) {
      for (const variation of variationMatrix) {
        if (expanded.length >= targetCount) {
          break;
        }

        const candidate = tunePresetTiming(
          preset,
          {
            matchDuration: preset.matchDuration + variation.duration,
            breakMinutes:
              preset.breakMinutes > 3
                ? preset.breakMinutes + variation.breakOffset
                : Math.min(3, Math.max(1, preset.breakMinutes + variation.breakOffset)),
            lunchBreakMinutes: preset.lunchBreakMinutes + variation.lunchOffset,
          },
          variation.suffix,
        );
        const signature = [
          candidate.format,
          candidate.groupCount,
          candidate.teamsPerGroup,
          candidate.matchDuration,
          candidate.breakMinutes,
          candidate.lunchBreakMinutes,
          candidate.groupHomeAway ? "home-away" : "single",
        ].join("-");

        if (!signatures.has(signature)) {
          signatures.add(signature);
          expanded.push(candidate);
        }
      }
    }

    return expanded;
  };

  const getPresetSignature = (preset: TournamentSuggestionPreset) =>
    [
      preset.format,
      preset.groupCount,
      preset.teamsPerGroup,
      preset.matchDuration,
      preset.breakMinutes,
      preset.lunchBreakMinutes,
      preset.groupHomeAway ? "home-away" : "single",
    ].join("-");

  const ensurePresetVariation = (basePresets: TournamentSuggestionPreset[]) => {
    const usedDurations = new Set<number>();
    const usedSignatures = new Set<string>();

    return basePresets.map((preset) => {
      const durationCandidates = [
        preset.matchDuration,
        preset.matchDuration - 4,
        preset.matchDuration + 4,
        preset.matchDuration - 2,
        preset.matchDuration + 2,
        preset.matchDuration - 6,
        preset.matchDuration + 6,
      ];
      const breakCandidates = [
        preset.breakMinutes,
        preset.breakMinutes - 1,
        preset.breakMinutes + 1,
      ];
      const lunchCandidates = [
        preset.lunchBreakMinutes,
        preset.lunchBreakMinutes - 15,
        preset.lunchBreakMinutes + 15,
      ];

      let selectedPreset: TournamentSuggestionPreset | null = null;

      for (const durationCandidate of durationCandidates) {
        for (const breakCandidate of breakCandidates) {
          for (const lunchCandidate of lunchCandidates) {
            const candidate = {
              ...preset,
              matchDuration: resolveVariantMatchDuration(durationCandidate),
              breakMinutes: resolveVariantBreakMinutes(breakCandidate),
              lunchBreakMinutes: resolveVariantLunchBreakMinutes(lunchCandidate),
            };
            const signature = getPresetSignature(candidate);

            if (
              !usedSignatures.has(signature) &&
              !usedDurations.has(candidate.matchDuration)
            ) {
              selectedPreset = candidate;
              break;
            }
          }
          if (selectedPreset) break;
        }
        if (selectedPreset) break;
      }

      if (!selectedPreset) {
        for (const durationCandidate of durationCandidates) {
          for (const breakCandidate of breakCandidates) {
            for (const lunchCandidate of lunchCandidates) {
              const candidate = {
                ...preset,
                matchDuration: resolveVariantMatchDuration(durationCandidate),
                breakMinutes: resolveVariantBreakMinutes(breakCandidate),
                lunchBreakMinutes: resolveVariantLunchBreakMinutes(lunchCandidate),
              };
              const signature = getPresetSignature(candidate);

              if (!usedSignatures.has(signature)) {
                selectedPreset = candidate;
                break;
              }
            }
            if (selectedPreset) break;
          }
          if (selectedPreset) break;
        }
      }

      const finalPreset = selectedPreset ?? preset;
      usedDurations.add(finalPreset.matchDuration);
      usedSignatures.add(getPresetSignature(finalPreset));
      return finalPreset;
    });
  };

  const buildMeta = (
    matchDuration: number,
    breakMinutes: number,
    lunchBreakMinutes: number,
    estimatedEndTime: string,
  ) => {
    const parts = [];

    if (estimatedEndTime) {
      parts.push(`fin estimee ${estimatedEndTime}`);
    } else if (config.startTime && config.endTime) {
      parts.push(`de ${config.startTime} a ${config.endTime}`);
    }

    parts.push(`${matchDuration} min par match`);
    parts.push(`${breakMinutes} min de pause`);
    if (lunchBreakMinutes > 0) {
      parts.push(
        lunchBreakMinutes % 60 === 0
          ? `${lunchBreakMinutes / 60}h de pause repas`
          : `${lunchBreakMinutes} min de pause repas`,
      );
    }

    return parts.join(" - ");
  };

  const maybeAddHomeAwayVariant = (
    basePresets: Array<{
      format: TournamentAutoFormat;
      groupCount: number;
      teamsPerGroup: number;
      matchDuration: number;
      breakMinutes: number;
      lunchBreakMinutes: number;
      variantLabel: string;
      groupHomeAway?: boolean;
    }>,
  ) => {
    const candidate = basePresets.find(
      (preset) => preset.format === "group_knockout" || preset.format === "mini_league",
    );
    if (!candidate) return basePresets;

    const baseConfig: TournamentConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      teamCount: targetTeamCount,
      autoFormat: candidate.format,
      groupCount: candidate.groupCount,
      teamsPerGroup: candidate.teamsPerGroup,
      matchDuration: candidate.matchDuration,
      breakMinutes: candidate.breakMinutes,
      lunchBreakMinutes: candidate.lunchBreakMinutes,
      groupHomeAway: false,
    };
    const basePreview = buildAutoSchedule(baseConfig);
    const extraGroupMatches = countGroupStageMatches(baseConfig);
    const remainingSlots = basePreview.capacity.matchesPossible - basePreview.requiredMatches;

    if (remainingSlots < extraGroupMatches) {
      return basePresets;
    }

    return [
      ...basePresets,
      {
        ...candidate,
        groupHomeAway: true,
        variantLabel: "Aller-retour en poules",
      },
    ];
  };

  const buildPresetPreview = (preset: {
    format: TournamentAutoFormat;
    groupCount: number;
    teamsPerGroup: number;
    matchDuration: number;
    breakMinutes: number;
    lunchBreakMinutes: number;
    groupHomeAway?: boolean;
  }) =>
    buildAutoSchedule({
      ...DEFAULT_CONFIG,
      ...config,
      teamCount: targetTeamCount,
      autoFormat: preset.format,
      groupCount: preset.groupCount,
      teamsPerGroup: preset.teamsPerGroup,
      matchDuration: preset.matchDuration,
      breakMinutes: preset.breakMinutes,
      lunchBreakMinutes: preset.lunchBreakMinutes,
      groupHomeAway: preset.groupHomeAway ?? false,
    });

  const buildRecommendedPreset = () => {
    const basePreset = applyVariantTiming({
      format: preferredFormat ?? recommendedSetup.autoFormat,
      groupCount: preferredFormat
        ? getLayoutForFormat(targetTeamCount, preferredFormat).groupCount
        : recommendedSetup.groupCount,
      teamsPerGroup: preferredFormat
        ? getLayoutForFormat(targetTeamCount, preferredFormat).teamsPerGroup
        : recommendedSetup.teamsPerGroup,
      matchDuration: safeMatchDuration,
      breakMinutes: safeBreakMinutes,
      lunchBreakMinutes: safeLunchBreakMinutes,
      groupHomeAway: false,
      variantLabel: "Version recommandée",
    }, "balanced");

    const candidatePresets = [basePreset];
    if (basePreset.format === "group_knockout" || basePreset.format === "mini_league") {
      candidatePresets.push({
        ...basePreset,
        groupHomeAway: true,
        variantLabel: "Version recommandée",
      });
    }

    let bestPreset = basePreset;
    let bestScore = Number.POSITIVE_INFINITY;
    const targetStartMinutes = config.startTime ? toMinutes(config.startTime) : null;
    const targetEndMinutes = config.endTime ? toMinutes(config.endTime) : null;

    candidatePresets.forEach((candidate) => {
      for (const duration of recommendedDurationCandidates) {
        for (const pause of recommendedBreakCandidates) {
          for (const lunchBreakMinutes of recommendedLunchCandidates) {
          const tunedPreset = {
            ...candidate,
            matchDuration: duration,
            breakMinutes: pause,
            lunchBreakMinutes,
          };
          const preview = buildPresetPreview(tunedPreset);
          if (!preview.windowFits) continue;
          const previewEndMinutes = getScheduleFinalEndMinutes(preview.schedule);
          const endGap =
            targetStartMinutes !== null &&
            targetEndMinutes !== null &&
            targetEndMinutes > targetStartMinutes
              ? Math.abs(targetEndMinutes - previewEndMinutes)
              : 0;
          const usage =
            targetStartMinutes !== null &&
            targetEndMinutes !== null &&
            previewEndMinutes > targetStartMinutes &&
            targetEndMinutes > targetStartMinutes
              ? (previewEndMinutes - targetStartMinutes) /
                (targetEndMinutes - targetStartMinutes)
              : 0;
          const usageGap = Math.abs(0.95 - Math.max(0, Math.min(1, usage)));
          const score =
            endGap * 8 +
            usageGap * 220 +
            Math.abs(duration - safeMatchDuration) * 4 +
            Math.abs(pause - Math.max(2, safeBreakMinutes)) * 6 +
            Math.abs(lunchBreakMinutes - (lunchLocked ? safeLunchBreakMinutes : 60)) * 1.5 +
            (candidate.groupHomeAway ? -12 : 0);

          if (score < bestScore) {
            bestScore = score;
            bestPreset = tunedPreset;
          }
        }
      }
      }
    });

    return {
      ...bestPreset,
      variantLabel: bestPreset.groupHomeAway
        ? "Version recommandée • aller-retour"
        : "Version recommandée",
    };
  };

  const presets = ensurePresetVariation(expandPresetPool(buildExtraPresetVariants(preferredFormat
    ? (() => {
        const preferredLayout = getLayoutForFormat(targetTeamCount, preferredFormat);

        return maybeAddHomeAwayVariant([
          applyVariantTiming({
            format: preferredFormat,
            groupCount: preferredLayout.groupCount,
            teamsPerGroup: preferredLayout.teamsPerGroup,
            variantLabel: "Version ultra rapide",
            matchDuration: safeMatchDuration,
            breakMinutes: safeBreakMinutes,
            lunchBreakMinutes: safeLunchBreakMinutes,
          }, "intense"),
          applyVariantTiming({
            format: preferredFormat,
            groupCount: preferredLayout.groupCount,
            teamsPerGroup: preferredLayout.teamsPerGroup,
            variantLabel: "Version rapide",
            matchDuration: safeMatchDuration,
            breakMinutes: safeBreakMinutes,
            lunchBreakMinutes: safeLunchBreakMinutes,
          }, "rapid"),
          applyVariantTiming({
            format: preferredFormat,
            groupCount: preferredLayout.groupCount,
            teamsPerGroup: preferredLayout.teamsPerGroup,
            variantLabel: "Version équilibrée",
            matchDuration: safeMatchDuration,
            breakMinutes: safeBreakMinutes,
            lunchBreakMinutes: safeLunchBreakMinutes,
          }, "balanced"),
          applyVariantTiming({
            format: preferredFormat,
            groupCount: preferredLayout.groupCount,
            teamsPerGroup: preferredLayout.teamsPerGroup,
            variantLabel: "Version confort",
            matchDuration: safeMatchDuration,
            breakMinutes: safeBreakMinutes,
            lunchBreakMinutes: safeLunchBreakMinutes,
          }, "comfort"),
          applyVariantTiming({
            format: preferredFormat,
            groupCount: preferredLayout.groupCount,
            teamsPerGroup: preferredLayout.teamsPerGroup,
            variantLabel: "Version longue",
            matchDuration: safeMatchDuration,
            breakMinutes: safeBreakMinutes,
            lunchBreakMinutes: safeLunchBreakMinutes,
          }, "comfort"),
        ])
      })()
    : assistantState && !assistantState.durationConfirmed
      ? maybeAddHomeAwayVariant([
          applyVariantTiming({
            format: getRecommendedAutoSetup(targetTeamCount).autoFormat,
            groupCount: getRecommendedAutoSetup(targetTeamCount).groupCount,
            teamsPerGroup: getRecommendedAutoSetup(targetTeamCount).teamsPerGroup,
            variantLabel: "Version ultra rapide",
            matchDuration: safeMatchDuration,
            breakMinutes: safeBreakMinutes,
            lunchBreakMinutes: safeLunchBreakMinutes,
          }, "intense"),
          applyVariantTiming({
            format: getRecommendedAutoSetup(targetTeamCount).autoFormat,
            groupCount: getRecommendedAutoSetup(targetTeamCount).groupCount,
            teamsPerGroup: getRecommendedAutoSetup(targetTeamCount).teamsPerGroup,
            variantLabel: "Version rapide",
            matchDuration: safeMatchDuration,
            breakMinutes: safeBreakMinutes,
            lunchBreakMinutes: safeLunchBreakMinutes,
          }, "rapid"),
          applyVariantTiming({
            format: getRecommendedAutoSetup(targetTeamCount).autoFormat,
            groupCount: getRecommendedAutoSetup(targetTeamCount).groupCount,
            teamsPerGroup: getRecommendedAutoSetup(targetTeamCount).teamsPerGroup,
            variantLabel: "Version confort",
            matchDuration: safeMatchDuration,
            breakMinutes: safeBreakMinutes,
            lunchBreakMinutes: safeLunchBreakMinutes,
          }, "comfort"),
          applyVariantTiming({
            format: targetTeamCount <= 6 ? "mini_league" : "group_knockout",
            groupCount:
              targetTeamCount <= 6
                ? 1
                : getLayoutForFormat(targetTeamCount, "group_knockout").groupCount,
            teamsPerGroup:
              targetTeamCount <= 6
                ? targetTeamCount
                : getLayoutForFormat(targetTeamCount, "group_knockout").teamsPerGroup,
            variantLabel: "Autre variante",
            matchDuration: safeMatchDuration,
            breakMinutes: safeBreakMinutes,
            lunchBreakMinutes: safeLunchBreakMinutes,
          }, "balanced"),
        ])
      : assistantState && !assistantState.lunchBreakConfirmed
        ? maybeAddHomeAwayVariant([
            applyVariantTiming({
              format: getRecommendedAutoSetup(targetTeamCount).autoFormat,
              groupCount: getRecommendedAutoSetup(targetTeamCount).groupCount,
              teamsPerGroup: getRecommendedAutoSetup(targetTeamCount).teamsPerGroup,
              variantLabel: "Pause repas courte",
              matchDuration: safeMatchDuration,
              breakMinutes: safeBreakMinutes,
              lunchBreakMinutes: safeLunchBreakMinutes,
            }, "rapid"),
            applyVariantTiming({
              format: getRecommendedAutoSetup(targetTeamCount).autoFormat,
              groupCount: getRecommendedAutoSetup(targetTeamCount).groupCount,
              teamsPerGroup: getRecommendedAutoSetup(targetTeamCount).teamsPerGroup,
              variantLabel: "Pause repas standard",
              matchDuration: safeMatchDuration,
              breakMinutes: safeBreakMinutes,
              lunchBreakMinutes: safeLunchBreakMinutes,
            }, "balanced"),
            applyVariantTiming({
              format: getRecommendedAutoSetup(targetTeamCount).autoFormat,
              groupCount: getRecommendedAutoSetup(targetTeamCount).groupCount,
              teamsPerGroup: getRecommendedAutoSetup(targetTeamCount).teamsPerGroup,
              variantLabel: "Pause repas confort",
              matchDuration: safeMatchDuration,
              breakMinutes: safeBreakMinutes,
              lunchBreakMinutes: safeLunchBreakMinutes,
            }, "comfort"),
            applyVariantTiming({
              format: getRecommendedAutoSetup(targetTeamCount).autoFormat,
              groupCount: getRecommendedAutoSetup(targetTeamCount).groupCount,
              teamsPerGroup: getRecommendedAutoSetup(targetTeamCount).teamsPerGroup,
              variantLabel: "Autre variante",
              matchDuration: safeMatchDuration,
              breakMinutes: safeBreakMinutes,
              lunchBreakMinutes: safeLunchBreakMinutes,
            }, "intense"),
          ])
        : assistantState && !assistantState.formatConfirmed
          ? maybeAddHomeAwayVariant([
              applyVariantTiming({
                format: "mini_league" as const,
                groupCount: getLayoutForFormat(targetTeamCount, "mini_league").groupCount,
                teamsPerGroup: getLayoutForFormat(targetTeamCount, "mini_league").teamsPerGroup,
                variantLabel: "Rencontre direct",
                matchDuration: safeMatchDuration,
                breakMinutes: safeBreakMinutes,
                lunchBreakMinutes: safeLunchBreakMinutes,
              }, "rapid"),
              applyVariantTiming({
                format: "group_knockout" as const,
                groupCount: getLayoutForFormat(targetTeamCount, "group_knockout").groupCount,
                teamsPerGroup: getLayoutForFormat(targetTeamCount, "group_knockout").teamsPerGroup,
                variantLabel: "Knockout",
                matchDuration: safeMatchDuration,
                breakMinutes: safeBreakMinutes,
                lunchBreakMinutes: safeLunchBreakMinutes,
              }, "balanced"),
              applyVariantTiming({
                format: "tournament_bracket" as const,
                groupCount: getLayoutForFormat(targetTeamCount, "tournament_bracket").groupCount,
                teamsPerGroup: getLayoutForFormat(targetTeamCount, "tournament_bracket").teamsPerGroup,
                variantLabel: "Bracket",
                matchDuration: safeMatchDuration,
                breakMinutes: safeBreakMinutes,
                lunchBreakMinutes: safeLunchBreakMinutes,
              }, "comfort"),
              applyVariantTiming({
                format: getRecommendedAutoSetup(targetTeamCount).autoFormat,
                groupCount: getRecommendedAutoSetup(targetTeamCount).groupCount,
                teamsPerGroup: getRecommendedAutoSetup(targetTeamCount).teamsPerGroup,
                variantLabel: "Autre variante",
                matchDuration: safeMatchDuration,
                breakMinutes: safeBreakMinutes,
                lunchBreakMinutes: safeLunchBreakMinutes,
              }, "intense"),
            ])
    : targetTeamCount <= 6
      ? maybeAddHomeAwayVariant([
          applyVariantTiming({
            format: "mini_league" as const,
            groupCount: 1,
            teamsPerGroup: targetTeamCount,
            variantLabel: "Round Robin",
            matchDuration: safeMatchDuration,
            breakMinutes: safeBreakMinutes,
            lunchBreakMinutes: safeLunchBreakMinutes,
          }, "balanced"),
          applyVariantTiming({
            format: "mini_league" as const,
            groupCount: 1,
            teamsPerGroup: targetTeamCount,
            variantLabel: "Version ultra rapide",
            matchDuration: safeMatchDuration,
            breakMinutes: safeBreakMinutes,
            lunchBreakMinutes: safeLunchBreakMinutes,
          }, "intense"),
          ...(targetTeamCount === 6
            ? [
                applyVariantTiming({
                  format: "mini_league" as const,
                  groupCount: 2,
                  teamsPerGroup: 3,
                  variantLabel: "2 groupes de 3 aller-retour",
                  matchDuration: safeMatchDuration,
                  breakMinutes: safeBreakMinutes,
                  lunchBreakMinutes: safeLunchBreakMinutes,
                }, "rapid"),
              ]
            : []),
        ])
      : targetTeamCount <= 12
        ? maybeAddHomeAwayVariant([
            applyVariantTiming({
              format: "group_knockout" as const,
              groupCount: targetTeamCount <= 8 ? 2 : targetTeamCount <= 10 ? 2 : 3,
              teamsPerGroup: targetTeamCount <= 8 ? 4 : targetTeamCount <= 10 ? 5 : 4,
              variantLabel: "Version rapide",
              matchDuration: safeMatchDuration,
              breakMinutes: safeBreakMinutes,
              lunchBreakMinutes: safeLunchBreakMinutes,
            }, "rapid"),
            applyVariantTiming({
              format: "group_knockout" as const,
              groupCount: targetTeamCount <= 8 ? 2 : targetTeamCount <= 10 ? 2 : 3,
              teamsPerGroup: targetTeamCount <= 8 ? 4 : targetTeamCount <= 10 ? 5 : 4,
              variantLabel: "Version équilibrée",
              matchDuration: safeMatchDuration,
              breakMinutes: safeBreakMinutes,
              lunchBreakMinutes: safeLunchBreakMinutes,
            }, "balanced"),
            applyVariantTiming({
              format: "group_knockout" as const,
              groupCount: targetTeamCount <= 8 ? 2 : targetTeamCount <= 10 ? 2 : 3,
              teamsPerGroup: targetTeamCount <= 8 ? 4 : targetTeamCount <= 10 ? 5 : 4,
              variantLabel: "Version confort",
              matchDuration: safeMatchDuration,
              breakMinutes: safeBreakMinutes,
              lunchBreakMinutes: safeLunchBreakMinutes,
            }, "comfort"),
            applyVariantTiming({
              format: "group_knockout" as const,
              groupCount: targetTeamCount <= 8 ? 2 : targetTeamCount <= 10 ? 2 : 3,
              teamsPerGroup: targetTeamCount <= 8 ? 4 : targetTeamCount <= 10 ? 5 : 4,
              variantLabel: "Version longue",
              matchDuration: safeMatchDuration,
              breakMinutes: safeBreakMinutes,
              lunchBreakMinutes: safeLunchBreakMinutes,
            }, "intense"),
          ])
        : maybeAddHomeAwayVariant([
            applyVariantTiming({
              format: "tournament_bracket" as const,
              groupCount: targetTeamCount <= 12 ? 3 : 4,
              teamsPerGroup: 4,
              variantLabel: "Version ultra rapide",
              matchDuration: safeMatchDuration,
              breakMinutes: safeBreakMinutes,
              lunchBreakMinutes: safeLunchBreakMinutes,
            }, "intense"),
            applyVariantTiming({
              format: "tournament_bracket" as const,
              groupCount: targetTeamCount <= 12 ? 3 : 4,
              teamsPerGroup: 4,
              variantLabel: "Version rapide",
              matchDuration: safeMatchDuration,
              breakMinutes: safeBreakMinutes,
              lunchBreakMinutes: safeLunchBreakMinutes,
            }, "rapid"),
            applyVariantTiming({
              format: "tournament_bracket" as const,
              groupCount: targetTeamCount <= 12 ? 3 : 4,
              teamsPerGroup: 4,
              variantLabel: "Version confort",
              matchDuration: safeMatchDuration,
              breakMinutes: safeBreakMinutes,
              lunchBreakMinutes: safeLunchBreakMinutes,
            }, "comfort"),
            applyVariantTiming({
              format: "tournament_bracket" as const,
              groupCount: targetTeamCount <= 12 ? 3 : 4,
              teamsPerGroup: 4,
              variantLabel: "Version longue",
              matchDuration: safeMatchDuration,
              breakMinutes: safeBreakMinutes,
              lunchBreakMinutes: safeLunchBreakMinutes,
            }, "balanced"),
        ]))));

  const recommendedPreset = buildRecommendedPreset();

  const suggestions = [recommendedPreset, ...presets].map((preset, index) => {
    const suggestionConfig: TournamentConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      teamCount: targetTeamCount,
      autoFormat: preset.format,
      groupCount: preset.groupCount,
      teamsPerGroup: preset.teamsPerGroup,
      matchDuration: preset.matchDuration,
      breakMinutes: preset.breakMinutes,
      lunchBreakMinutes: preset.lunchBreakMinutes,
      groupHomeAway: preset.groupHomeAway ?? false,
    };
    const preview = buildAutoSchedule(suggestionConfig);
    const cycleTime = Math.max(
      1,
      toSafeNonNegativeInteger(preset.matchDuration, 1) +
        toSafeNonNegativeInteger(preset.breakMinutes, 0),
    );
    const roundsNeeded = Math.ceil(preview.requiredMatches / safeFieldCount);
    const totalDurationUsed = Math.max(
      0,
      toSafeNonNegativeInteger(preset.lunchBreakMinutes, 0) + roundsNeeded * cycleTime,
    );
    const estimatedEndTime = config.startTime
      ? toTimeLabel(toMinutes(config.startTime) + totalDurationUsed)
      : "";
    const formatLabel = getSuggestionFormatLabel(
      preset.format,
      preset.groupCount,
      preset.teamsPerGroup,
      preset.groupHomeAway ?? false,
    );
    const matchRange = getSuggestionMatchRange(
      targetTeamCount,
      preset.format,
      preset.groupCount,
      preset.teamsPerGroup,
      preset.groupHomeAway ?? false,
    );
    const minMatchesPerTeam = Math.max(0, toSafeNonNegativeInteger(matchRange.min, 0));
    const maxMatchesPerTeam = Math.max(
      minMatchesPerTeam,
      toSafeNonNegativeInteger(matchRange.max, minMatchesPerTeam),
    );
    const averageMatchesPerTeam = (minMatchesPerTeam + maxMatchesPerTeam) / 2;
    const playingWindow = Math.max(0, totalDurationUsed - preset.lunchBreakMinutes);
    const averagePlayingTime = Math.max(0, averageMatchesPerTeam * preset.matchDuration);
    const waitingEstimate = Math.max(
      0,
      (playingWindow - averagePlayingTime) / Math.max(1, averageMatchesPerTeam),
    );
    const matchGap = Math.max(0, maxMatchesPerTeam - minMatchesPerTeam);
    const overflow = preview.windowFits ? 0 : 1;
    const bonusEquilibre = minMatchesPerTeam === maxMatchesPerTeam ? 5 : 0;
    const surcharge = Math.max(0, averageMatchesPerTeam - 6);
    const usageRatio =
      preview.capacity.matchesPossible > 0
        ? preview.requiredMatches / preview.capacity.matchesPossible
        : 0;
    const usageBonus = usageRatio > 0.85 ? 3 : 0;
    const intensity =
      averageMatchesPerTeam <= 4
        ? "⚡ faible"
        : averageMatchesPerTeam <= 6
          ? "⚖️ equilibree"
          : "🔥 elevee";
    const rawScore =
      averageMatchesPerTeam * 2 +
      bonusEquilibre -
      waitingEstimate * 1.5 -
      matchGap * 3 -
      surcharge * 2 -
      overflow * 1000 +
      usageBonus;
    const score = Number.isFinite(rawScore) ? rawScore : 0;
    const optimization =
      score > 15 ? "🟢 excellente" : score > 8 ? "🟡 bonne" : "🔴 faible";
    const hasTimeWindow = Boolean(config.startTime && config.endTime);
    const totalTournamentMinutes = hasTimeWindow
      ? Math.max(0, toMinutes(config.endTime) - toMinutes(config.startTime))
      : Number.POSITIVE_INFINITY;
    const endWithinWindow =
      !hasTimeWindow ||
      toMinutes(config.startTime) + totalDurationUsed <= toMinutes(config.endTime);
    const validCard =
      preview.requiredMatches <= preview.capacity.matchesPossible &&
      totalDurationUsed <= totalTournamentMinutes &&
      endWithinWindow &&
      Number.isFinite(totalDurationUsed) &&
      Number.isFinite(preview.requiredMatches) &&
      Number.isFinite(preview.capacity.matchesPossible);
    const summary =
      preset.variantLabel.includes("rapide")
        ? "Ideal pour un tournoi condense sur une demi-journee"
        : preset.variantLabel.includes("confort")
          ? "Ideal pour une organisation plus souple et moins dense"
          : "Bon compromis entre rythme, lisibilite et plaisir de jeu";

    return {
      key: `${targetTeamCount}-${preset.format}-${preset.groupCount}-${preset.teamsPerGroup}-${preset.matchDuration}-${preset.breakMinutes}-${preset.lunchBreakMinutes}-${preset.variantLabel}-${index}`,
      variant: preset.variantLabel.includes("rapide")
        ? "rapid"
        : preset.variantLabel.includes("confort")
          ? "comfort"
          : "balanced",
      teamCount: targetTeamCount,
      format: preset.format,
      groupCount: preset.groupCount,
      teamsPerGroup: preset.teamsPerGroup,
      matchDuration: preset.matchDuration,
      breakMinutes: preset.breakMinutes,
      lunchBreakMinutes: preset.lunchBreakMinutes,
      groupHomeAway: preset.groupHomeAway ?? false,
      label: `${targetTeamCount} equipes - ${
        preset.variantLabel.includes("rapide")
          ? "format rapide"
          : preset.variantLabel.includes("confort")
            ? "format confort"
            : "format equilibre"
      }`,
      detail: preset.variantLabel,
      meta: buildMeta(
        preset.matchDuration,
        preset.breakMinutes,
        preset.lunchBreakMinutes,
        estimatedEndTime,
      ),
      formatLabel,
      fits: preview.windowFits && validCard,
      requiredMatches: toSafeNonNegativeInteger(preview.requiredMatches, 0),
      matchesPossible: toSafeNonNegativeInteger(preview.capacity.matchesPossible, 0),
      estimatedEndTime,
      totalDurationUsed,
      summary,
      minMatchesPerTeam,
      maxMatchesPerTeam,
      waitingEstimate,
      intensity,
      optimization,
      score,
    } satisfies TournamentAutoSuggestion;
  });

  const uniqueSuggestions = Array.from(
    new Map(
      suggestions.map((suggestion) => [
        `${suggestion.teamCount}-${suggestion.format}-${suggestion.groupCount}-${suggestion.teamsPerGroup}-${suggestion.matchDuration}-${suggestion.breakMinutes}-${suggestion.lunchBreakMinutes}-${suggestion.groupHomeAway ? "home-away" : "single"}`,
        suggestion,
      ]),
    ).values(),
  ).filter(
    (suggestion) =>
      suggestion.fits &&
      suggestion.requiredMatches <= suggestion.matchesPossible &&
      suggestion.minMatchesPerTeam >= 0 &&
      suggestion.maxMatchesPerTeam >= suggestion.minMatchesPerTeam &&
      Number.isFinite(suggestion.score),
  );

  const sortedSuggestions = uniqueSuggestions.sort((left, right) => {
    if (left.fits !== right.fits) {
      return left.fits ? -1 : 1;
    }

    const targetEndMinutes = config.endTime ? toMinutes(config.endTime) : null;
    const targetStartMinutes = config.startTime ? toMinutes(config.startTime) : null;
    const getCoherenceScore = (suggestion: TournamentAutoSuggestion) => {
      const estimatedEndMinutes = suggestion.estimatedEndTime
        ? toMinutes(suggestion.estimatedEndTime)
        : null;
      const endGap =
        targetEndMinutes !== null && estimatedEndMinutes !== null
          ? Math.abs(targetEndMinutes - estimatedEndMinutes)
          : 0;
      const usageRatio =
        targetStartMinutes !== null &&
        targetEndMinutes !== null &&
        estimatedEndMinutes !== null &&
        targetEndMinutes > targetStartMinutes
          ? (estimatedEndMinutes - targetStartMinutes) /
            (targetEndMinutes - targetStartMinutes)
          : 0;
      const usageGap = Math.abs(0.9 - Math.max(0, Math.min(1, usageRatio)));
      const durationGap = Math.abs(suggestion.matchDuration - config.matchDuration);
      const breakGap = Math.abs(suggestion.breakMinutes - config.breakMinutes);
      const lunchGap = Math.abs(suggestion.lunchBreakMinutes - config.lunchBreakMinutes);
      const balanceBonus =
        suggestion.detail.startsWith("Version recommandée")
          ? -140
        : suggestion.groupHomeAway && usageRatio > 0.72
          ? -90
          : suggestion.detail === "Version équilibrée" ||
              suggestion.detail === "Pause repas standard"
            ? -20
          : suggestion.detail === "Version confort" || suggestion.detail === "Version rapide"
            ? -8
            : 0;

      return endGap * 3 + usageGap * 140 + durationGap * 5 + breakGap * 4 + lunchGap + balanceBonus;
    };

    const leftScore = getCoherenceScore(left);
    const rightScore = getCoherenceScore(right);
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    return left.requiredMatches - right.requiredMatches;
  });

  const getRecommendedPriority = (suggestion: TournamentAutoSuggestion) => {
    const targetStartMinutes = config.startTime ? toMinutes(config.startTime) : null;
    const targetEndMinutes = config.endTime ? toMinutes(config.endTime) : null;
    const estimatedEndMinutes = suggestion.estimatedEndTime
      ? toMinutes(suggestion.estimatedEndTime)
      : null;
    const hasWindow =
      targetStartMinutes !== null &&
      targetEndMinutes !== null &&
      targetEndMinutes > targetStartMinutes &&
      estimatedEndMinutes !== null;

    const endGap = hasWindow ? Math.abs(targetEndMinutes - estimatedEndMinutes) : 0;
    const underRun =
      hasWindow && estimatedEndMinutes < targetEndMinutes
        ? targetEndMinutes - estimatedEndMinutes
        : 0;
    const usageRatio =
      hasWindow
        ? Math.max(
            0,
            Math.min(
              1,
              (estimatedEndMinutes - targetStartMinutes) /
                Math.max(1, targetEndMinutes - targetStartMinutes),
            ),
          )
        : 0;
    const usageGap = Math.abs(0.96 - usageRatio);
    const lunchGap =
      assistantState?.lunchBreakConfirmed ? 0 : Math.abs(60 - suggestion.lunchBreakMinutes);
    const breakGap =
      assistantState?.breakConfirmed ? 0 : Math.abs(Math.max(2, safeBreakMinutes) - suggestion.breakMinutes);
    const durationGap =
      assistantState?.durationConfirmed ? 0 : Math.abs(safeMatchDuration - suggestion.matchDuration);

    return (
      underRun * 12 +
      endGap * 4 +
      usageGap * 260 +
      lunchGap * 1.5 +
      breakGap * 6 +
      durationGap * 5 -
      suggestion.score * 0.25
    );
  };

  const rapidSuggestion =
    [...sortedSuggestions].sort(
      (left, right) =>
        left.requiredMatches - right.requiredMatches ||
        left.totalDurationUsed - right.totalDurationUsed,
    )[0] ?? null;

  const recommendedSource =
    sortedSuggestions.find(
      (suggestion) =>
        suggestion.format === recommendedPreset.format &&
        suggestion.groupCount === recommendedPreset.groupCount &&
        suggestion.teamsPerGroup === recommendedPreset.teamsPerGroup &&
        suggestion.matchDuration === recommendedPreset.matchDuration &&
        suggestion.breakMinutes === recommendedPreset.breakMinutes &&
        suggestion.lunchBreakMinutes === recommendedPreset.lunchBreakMinutes &&
        suggestion.groupHomeAway === (recommendedPreset.groupHomeAway ?? false),
    ) ??
    [...sortedSuggestions].sort((left, right) => {
      const leftPriority = getRecommendedPriority(left);
      const rightPriority = getRecommendedPriority(right);
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return right.score - left.score;
    })[0] ??
    null;

  const balancedSuggestion =
    [...sortedSuggestions].sort(
      (left, right) =>
        (left.maxMatchesPerTeam - left.minMatchesPerTeam) -
          (right.maxMatchesPerTeam - right.minMatchesPerTeam) ||
        right.score - left.score ||
        Math.abs(left.matchesPossible - left.requiredMatches) -
          Math.abs(right.matchesPossible - right.requiredMatches),
    )[0] ?? null;

  const comfortSuggestion =
    [...sortedSuggestions].sort(
      (left, right) =>
        right.totalDurationUsed - left.totalDurationUsed ||
        right.lunchBreakMinutes - left.lunchBreakMinutes ||
        right.matchDuration - left.matchDuration,
    )[0] ?? null;

  const picked = [balancedSuggestion, rapidSuggestion, comfortSuggestion].filter(
    (suggestion): suggestion is TournamentAutoSuggestion => Boolean(suggestion),
  );

  const deduped = Array.from(
    new Map(picked.map((suggestion) => [suggestion.key, suggestion])).values(),
  ).filter((suggestion) => suggestion.key !== recommendedSource?.key);
  const completed = [...deduped];
  for (const suggestion of sortedSuggestions) {
    if (completed.length >= 11) break;
    if (
      suggestion.key !== recommendedSource?.key &&
      !completed.some((entry) => entry.key === suggestion.key)
    ) {
      completed.push(suggestion);
    }
  }

  const mapped = completed.slice(0, 10).map((suggestion) => {
    if (suggestion.key === rapidSuggestion?.key) {
      return {
        ...suggestion,
        variant: "rapid",
        detail: "⚡ Rapide",
        label: `${suggestion.teamCount} equipes - format rapide`,
        summary: "Ideal pour un tournoi condense sur une demi-journee",
      };
    }
    if (suggestion.key === comfortSuggestion?.key) {
      return {
        ...suggestion,
        variant: "comfort",
        detail: "🧘 Confort",
        label: `${suggestion.teamCount} equipes - format confort`,
        summary: "Ideal pour une organisation plus souple avec davantage de respiration",
      };
    }
    return {
      ...suggestion,
      variant: "balanced",
      detail: "⚖️ Equilibre",
      label: `${suggestion.teamCount} equipes - format equilibre`,
      summary: "Bon compromis entre rythme, lisibilite et plaisir de jeu",
    };
  });

  const recommendedSuggestion = recommendedSource
    ? {
        ...recommendedSource,
        key: `${recommendedSource.key}-recommended`,
        variant: "recommended" as const,
        detail: "Recommandé",
        label: `${recommendedSource.teamCount} equipes`,
      }
    : null;

  return [recommendedSuggestion, ...mapped].filter(
    (suggestion): suggestion is TournamentAutoSuggestion => Boolean(suggestion),
  );
};

const estimateAssistantTeamCount = (config: TournamentConfig) => {
  const candidates = [6, 8, 10, 12, 16];

  const fittingCandidates = candidates.filter((candidate) => {
    const recommended = getRecommendedAutoSetup(candidate);
    const preview = buildAutoSchedule({
      ...DEFAULT_CONFIG,
      ...config,
      teamCount: candidate,
      autoFormat: recommended.autoFormat,
      groupCount: recommended.groupCount,
      teamsPerGroup: recommended.teamsPerGroup,
    });

    return preview.windowFits;
  });

  return fittingCandidates.at(-1) ?? 0;
};

const buildManualSchedule = (config: TournamentConfig) => {
  const teamsById = new Map(config.teams.map((team) => [team.id, team.name]));
  const capacity = calculateTournamentCapacity(
    config.startTime,
    config.endTime,
    config.matchDuration,
    config.breakMinutes,
    config.lunchBreakMinutes,
    config.fieldCount,
  );
  const schedule = [...config.manualMatches]
    .sort((left, right) => toMinutes(left.startTime) - toMinutes(right.startTime))
    .map((match, index) => {
      const start = toMinutes(match.startTime);
      const end = start + match.duration;
      return {
        id: match.id,
        roundLabel: `Match ${index + 1}`,
        fieldLabel: `Terrain ${match.field}`,
        startTime: toTimeLabel(start),
        endTime: toTimeLabel(end),
        homeTeam: teamsById.get(match.homeTeamId) ?? "Équipe",
        awayTeam: teamsById.get(match.awayTeamId) ?? "Équipe",
      };
    });

  return {
    schedule,
    capacity,
    requiredMatches: schedule.length,
    windowFits: schedule.length <= capacity.matchesPossible,
  };
};

function TournamentAssistant({
  config,
  onConfigChange,
  onBack,
  knowsTeamCount,
  onKnowsTeamCountChange,
  teamCountDraft,
  onTeamCountDraftChange,
  knowsTimeRange,
  onKnowsTimeRangeChange,
  timeRangeConfirmed,
  onTimeRangeConfirm,
  durationConfirmed,
  onDurationConfirm,
  breakConfirmed,
  onBreakConfirm,
  lunchBreakConfirmed,
  onLunchBreakConfirm,
  formatConfirmed,
  onFormatConfirm,
  estimatedTeamCount,
  autoSuggestions,
}: {
  config: TournamentConfig;
  onConfigChange: (updater: (current: TournamentConfig) => TournamentConfig) => void;
  onBack: () => void;
  knowsTeamCount: boolean | null;
  onKnowsTeamCountChange: (value: boolean) => void;
  teamCountDraft: string;
  onTeamCountDraftChange: (value: string) => void;
  knowsTimeRange: boolean | null;
  onKnowsTimeRangeChange: (value: boolean) => void;
  timeRangeConfirmed: boolean;
  onTimeRangeConfirm: () => void;
  durationConfirmed: boolean;
  onDurationConfirm: () => void;
  breakConfirmed: boolean;
  onBreakConfirm: () => void;
  lunchBreakConfirmed: boolean;
  onLunchBreakConfirm: () => void;
  formatConfirmed: boolean;
  onFormatConfirm: () => void;
  estimatedTeamCount: number;
  autoSuggestions: TournamentAutoSuggestion[];
}) {
  const [openSuggestionKey, setOpenSuggestionKey] = useState<string | null>(null);
  const [openFormatPreview, setOpenFormatPreview] = useState<
    TournamentFormatOptionVariant | null
  >(null);
  const [selectedFormatCardVariant, setSelectedFormatCardVariant] = useState<
    TournamentFormatOptionVariant | null
  >(null);
  const [formatCardConfirmed, setFormatCardConfirmed] = useState(false);
  const assistantContentRef = useRef<HTMLDivElement | null>(null);
  const assistantSummaryChips: string[] = [];

  const commitTeamCount = () => {
    const parsedTeamCount = Number(teamCountDraft);
    if (!Number.isFinite(parsedTeamCount)) return;

    const nextTeamCount = Math.max(2, Math.min(32, Math.round(parsedTeamCount)));
    const recommended = getRecommendedAutoSetup(nextTeamCount);
    onKnowsTeamCountChange(true);

    onConfigChange((current) =>
      applyAutoTeamSettings(current, {
        teamCount: nextTeamCount,
        autoFormat: recommended.autoFormat,
        groupCount: recommended.groupCount,
        teamsPerGroup: recommended.teamsPerGroup,
      }),
    );
  };

  const teamCountReady =
    knowsTeamCount === false || (knowsTeamCount === true && config.teamCount >= 2);
  const timeQuestionReady = knowsTimeRange !== null;
  const suggestionsReady =
    knowsTeamCount !== null ||
    (knowsTimeRange === true && timeRangeConfirmed) ||
    knowsTimeRange === false;
  const durationQuestionReady =
    teamCountReady &&
    timeQuestionReady &&
    (knowsTimeRange === false || timeRangeConfirmed);
  const canGoBack =
    formatConfirmed ||
    lunchBreakConfirmed ||
    breakConfirmed ||
    durationConfirmed ||
    knowsTimeRange !== null ||
    knowsTeamCount !== null;

  useEffect(() => {
    if (!formatCardConfirmed || formatConfirmed) {
      return;
    }

    assistantContentRef.current?.scrollIntoView({
      block: "start",
      behavior: "auto",
    });
  }, [formatCardConfirmed, formatConfirmed]);

  assistantSummaryChips.push(
    `${config.fieldCount} terrain${config.fieldCount > 1 ? "s" : ""}`,
  );

  const categoryChip = formatAssistantCategoryChip(config.categories);
  if (categoryChip) {
    assistantSummaryChips.push(categoryChip);
  }

  const levelChip = formatAssistantLevelChip(config.levels);
  if (levelChip) {
    assistantSummaryChips.push(levelChip);
  }

  if (knowsTeamCount === true && config.teamCount > 0) {
    assistantSummaryChips.push(`${config.teamCount} equipes`);
  }
  if (knowsTimeRange === true && timeRangeConfirmed) {
    assistantSummaryChips.push(`de ${config.startTime} a ${config.endTime}`);
  }
  if (durationConfirmed && config.matchDuration > 0) {
    assistantSummaryChips.push(`${config.matchDuration} min`);
  }
  if (lunchBreakConfirmed && config.lunchBreakMinutes > 0) {
    assistantSummaryChips.push(`pause repas ${config.lunchBreakMinutes} min`);
  }

  let currentQuestion: ReactNode = null;

  if (!teamCountReady) {
    currentQuestion = (
      <AssistantQuestionCard
        question="Combien d'equipes participantes"
        response={
          <div className="flex flex-nowrap items-center justify-start gap-1.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onTeamCountDraftChange(
                      String(Math.max(0, (Number(teamCountDraft) || 0) - 1)),
                    );
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                >
                  -
                </button>
                <div className="flex h-8 min-w-10 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/18 px-2">
                  <input
                    type="number"
                    min={0}
                    max={32}
                    value={teamCountDraft}
                    onChange={(event) => {
                      onTeamCountDraftChange(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitTeamCount();
                      }
                    }}
                    className="w-9 bg-transparent text-center text-[14px] font-semibold text-slate-50 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    placeholder="0"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onTeamCountDraftChange(
                      String(Math.min(32, Math.max(0, Number(teamCountDraft) || 0) + 1)),
                    );
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  onKnowsTeamCountChange(false);
                  onTeamCountDraftChange("");
                }}
                className="inline-flex h-9 items-center whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  Je sais pas
                </button>
              <button
                type="button"
                onClick={commitTeamCount}
                disabled={!teamCountDraft.trim()}
                className={[
                  "inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition",
                  teamCountDraft.trim()
                    ? "border border-fuchsia-300/30 bg-violet-600 shadow-[0_0_18px_rgba(124,58,237,0.35)] hover:bg-violet-500"
                    : "cursor-not-allowed border border-white/10 bg-white/5 text-slate-500 shadow-none",
                ].join(" ")}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 12 5 5L20 7" />
                </svg>
                Valider
              </button>
              {canGoBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Retour"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 14 4 9l5-5" />
                    <path d="M4 9h9a7 7 0 1 1 0 14h-1" />
                  </svg>
                </button>
              ) : null}
          </div>
        }
      />
    );
  } else if (!durationQuestionReady) {
    currentQuestion = (
      <AssistantQuestionCard
        question="Quelle plage horaire veux-tu ?"
        icon="time"
        response={
          <div className="flex flex-nowrap items-center justify-start gap-2 overflow-visible">
              <div className="flex shrink-0 flex-col items-start gap-2">
                <TournamentTimeStepperField
                  key={`start-${config.startTime}`}
                  label="Début"
                  value={config.startTime ?? ""}
                  fallbackValue="09:00"
                  onChange={(nextValue) => {
                    onKnowsTimeRangeChange(true);
                    onConfigChange((current) => ({
                      ...current,
                      startTime: nextValue,
                    }));
                  }}
                />
                <TournamentTimeStepperField
                  key={`end-${config.endTime}`}
                  label="Fin"
                  value={config.endTime ?? ""}
                  fallbackValue="17:00"
                  onChange={(nextValue) => {
                    onKnowsTimeRangeChange(true);
                    onConfigChange((current) => ({
                      ...current,
                      endTime: nextValue,
                    }));
                  }}
                />
              </div>
              <div className="flex shrink-0 items-center gap-1 self-center">
                <button
                  type="button"
                  onClick={() => onKnowsTimeRangeChange(false)}
                  className="inline-flex h-8 items-center whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  Je sais pas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onKnowsTimeRangeChange(true);
                    onTimeRangeConfirm();
                  }}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-fuchsia-300/30 bg-violet-600 px-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_0_18px_rgba(124,58,237,0.35)] transition hover:bg-violet-500"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                  Valider
                </button>
                {canGoBack ? (
                  <button
                    type="button"
                    onClick={onBack}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                    aria-label="Retour"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 14 4 9l5-5" />
                      <path d="M4 9h9a7 7 0 1 1 0 14h-1" />
                    </svg>
                  </button>
                ) : null}
              </div>
          </div>
        }
      />
    );
  } else if (!durationConfirmed) {
    currentQuestion = (
      <AssistantQuestionCard
        question="Quelle durée pour les matchs ?"
        response={
          <div className="flex flex-nowrap items-center justify-start gap-1.5">
              <div className="flex h-9 shrink-0 items-center gap-1 rounded-2xl border border-violet-400/20 bg-violet-500/12 px-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <button
                  type="button"
                  onClick={() =>
                    onConfigChange((current) => ({
                      ...current,
                      matchDuration: Math.max(5, current.matchDuration - 1),
                    }))
                  }
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                >
                  -
                </button>
                <input
                  type="number"
                  min={5}
                  max={90}
                  value={config.matchDuration ?? 15}
                  onChange={(event) =>
                    onConfigChange((current) => ({
                      ...current,
                      matchDuration: Math.max(5, Number(event.target.value) || 5),
                    }))
                  }
                  className="w-8 bg-transparent text-center text-[13px] font-semibold text-slate-50 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-300">
                  min
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onConfigChange((current) => ({
                      ...current,
                      matchDuration: Math.min(90, current.matchDuration + 1),
                    }))
                  }
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={onDurationConfirm}
                className="inline-flex h-9 items-center rounded-full border border-white/10 bg-white/5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                Je sais pas
              </button>
              <button
                type="button"
                onClick={onDurationConfirm}
                className="inline-flex h-9 items-center gap-1 rounded-full border border-fuchsia-300/30 bg-violet-600 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_0_18px_rgba(124,58,237,0.35)] transition hover:bg-violet-500"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 12 5 5L20 7" />
                </svg>
                Valider
              </button>
              {canGoBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Retour"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 14 4 9l5-5" />
                    <path d="M4 9h9a7 7 0 1 1 0 14h-1" />
                  </svg>
                </button>
              ) : null}
          </div>
        }
      />
    );
  } else if (!breakConfirmed) {
    currentQuestion = (
      <AssistantQuestionCard
        question="Combien de temps entre les matchs ?"
        response={
          <div className="flex flex-nowrap items-center justify-start gap-1.5">
              <div className="flex h-9 shrink-0 items-center gap-1 rounded-2xl border border-violet-400/20 bg-violet-500/12 px-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <button
                  type="button"
                  onClick={() =>
                    onConfigChange((current) => ({
                      ...current,
                      breakMinutes: Math.max(1, current.breakMinutes - 1),
                    }))
                  }
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                >
                  -
                </button>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={config.breakMinutes ?? 2}
                  onChange={(event) =>
                    onConfigChange((current) => ({
                      ...current,
                      breakMinutes: Math.max(1, Number(event.target.value) || 1),
                    }))
                  }
                  className="w-8 bg-transparent text-center text-[13px] font-semibold text-slate-50 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-300">
                  min
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onConfigChange((current) => ({
                      ...current,
                      breakMinutes: Math.min(30, current.breakMinutes + 1),
                    }))
                  }
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={onBreakConfirm}
                className="inline-flex h-9 items-center rounded-full border border-white/10 bg-white/5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                Je sais pas
              </button>
              <button
                type="button"
                onClick={onBreakConfirm}
                className="inline-flex h-9 items-center gap-1 rounded-full border border-fuchsia-300/30 bg-violet-600 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_0_18px_rgba(124,58,237,0.35)] transition hover:bg-violet-500"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 12 5 5L20 7" />
                </svg>
                Valider
              </button>
              {canGoBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Retour"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 14 4 9l5-5" />
                    <path d="M4 9h9a7 7 0 1 1 0 14h-1" />
                  </svg>
                </button>
              ) : null}
          </div>
        }
      />
    );
  } else if (!lunchBreakConfirmed) {
    currentQuestion = (
      <AssistantQuestionCard
        question="Combien de temps pour la pause repas ?"
        response={
          <div className="flex flex-wrap items-center justify-start gap-2">
              <input
                type="number"
                min={0}
                max={180}
                value={config.lunchBreakMinutes ?? 60}
                onChange={(event) =>
                  onConfigChange((current) => ({
                    ...current,
                    lunchBreakMinutes: Math.max(0, Number(event.target.value) || 0),
                  }))
                }
                className="h-11 w-20 rounded-2xl border border-white/10 bg-black/25 px-3 text-center text-base text-slate-100 outline-none focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
              />
              <button
                type="button"
                onClick={onLunchBreakConfirm}
                className="inline-flex h-9 items-center rounded-full border border-white/10 bg-white/5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                Je sais pas
              </button>
              <button
                type="button"
                onClick={onLunchBreakConfirm}
                className="inline-flex h-9 items-center gap-1 rounded-full border border-fuchsia-300/30 bg-violet-600 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_0_18px_rgba(124,58,237,0.35)] transition hover:bg-violet-500"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 12 5 5L20 7" />
                </svg>
                Valider
              </button>
              {canGoBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Retour"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 14 4 9l5-5" />
                    <path d="M4 9h9a7 7 0 1 1 0 14h-1" />
                  </svg>
                </button>
              ) : null}
          </div>
        }
      />
    );
  } else if (!selectedFormatCardVariant || !formatCardConfirmed) {
    const formatOptions = TOURNAMENT_FORMAT_OPTIONS.filter(
      (option) => option.variant !== "direct_elimination",
    );
    const selectedFormatOption = openFormatPreview
      ? getFormatOptionByVariant(openFormatPreview)
      : null;
    const resolvedFormatTeamCount = getFormatTeamCount(config.teamCount, estimatedTeamCount);
    const selectedFormatConfig = selectedFormatOption
      ? buildFormatOptionConfig(
          config,
          selectedFormatOption,
          resolvedFormatTeamCount,
          true,
        )
      : null;
    const selectedFormatStructure =
      selectedFormatOption && selectedFormatConfig
        ? buildFormatOptionStructure(
            selectedFormatConfig,
            selectedFormatOption,
            resolvedFormatTeamCount,
            true,
          )
        : null;
    const selectedRoundRobinMode =
      selectedFormatOption?.variant === "round_robin" &&
      config.finalPhase.toLowerCase().includes("classement direct")
        ? "classement"
        : "finale";
    const recommendedFormatVariant = getRecommendedFormatVariant(resolvedFormatTeamCount);
    const visualSelectedVariant = selectedFormatCardVariant;
    const selectFormatCard = (option: TournamentFormatOption) => {
      setSelectedFormatCardVariant(option.variant);
      setFormatCardConfirmed(false);
      onConfigChange((current) => {
        const nextConfig = buildFormatOptionConfig(
          current,
          option,
          getFormatTeamCount(current.teamCount, estimatedTeamCount),
        );
        return applyAutoTeamSettings(
          {
            ...current,
            qualificationRule: nextConfig.qualificationRule,
            finalPhase: nextConfig.finalPhase,
            placementMatches: nextConfig.placementMatches,
            groupHomeAway: nextConfig.groupHomeAway,
          },
          {
            teamCount: nextConfig.teamCount,
            autoFormat: nextConfig.autoFormat,
            groupCount: nextConfig.groupCount,
            teamsPerGroup: nextConfig.teamsPerGroup,
          },
        );
      });
    };

    currentQuestion = (
      <div className="space-y-4 rounded-[30px] border border-white/10 bg-white/[0.04] px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-400/30 bg-violet-500/18 shadow-[0_0_24px_rgba(124,58,237,0.32)]">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5 text-violet-100"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 7h16" />
                <path d="M4 12h10" />
                <path d="M4 17h7" />
                <path d="M17 10 20 7l-3-3" />
              </svg>
            </div>
            <p className="text-[24px] font-semibold tracking-[-0.03em] text-white">
              Quel type de tournoi veux-tu ?
            </p>
          </div>

          {selectedFormatCardVariant ? (
            <button
              type="button"
              onClick={() => setFormatCardConfirmed(true)}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-fuchsia-300/30 bg-violet-600 px-3.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_0_18px_rgba(124,58,237,0.35)] transition hover:bg-violet-500"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 12 5 5L20 7" />
              </svg>
              Valider
            </button>
          ) : null}
        </div>

        <div className="overflow-x-auto overflow-y-hidden py-1.5">
          <div className="inline-flex min-w-max gap-3">
            {formatOptions.map((option) => {
            const active = visualSelectedVariant !== null && option.variant === visualSelectedVariant;
            const roundRobinMode =
              option.variant === "round_robin" &&
              config.finalPhase.toLowerCase().includes("classement direct")
                ? "classement"
                : "finale";
            const previewConfig = buildFormatOptionConfig(
              config,
              option,
              resolvedFormatTeamCount,
              option.variant === "round_robin" || option.variant === "group_final",
            );
            const previewStructure = buildFormatOptionStructure(
              previewConfig,
              option,
              resolvedFormatTeamCount,
              option.variant === "round_robin" || option.variant === "group_final",
            );

            return (
              <div
                key={option.label}
                onClick={() => selectFormatCard(option)}
                className={[
                  "group w-[328px] shrink-0 cursor-pointer rounded-[26px] border px-3.5 py-3.5 text-left transition duration-150",
                  active
                    ? "border-violet-400/40 bg-violet-500/14 text-white shadow-[0_0_24px_rgba(124,58,237,0.26)]"
                    : "border-white/10 bg-white/5 text-slate-300 hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.08] hover:text-white",
                ].join(" ")}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectFormatCard(option);
                  }
                }}
              >
                <div className="flex h-full w-full flex-col text-left">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] font-semibold tracking-[-0.01em] text-white">
                      {option.label}
                    </p>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenFormatPreview(option.variant);
                      }}
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300 transition group-hover:bg-white/10 group-hover:text-white"
                    >
                      Apercu
                    </button>
                  </div>
                  <TournamentTypeOptionPreview
                    structure={previewStructure}
                    compactVariant={option.variant}
                    compactTeamCount={previewConfig.teamCount}
                    roundRobinMode={roundRobinMode}
                  />
                  <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                    {option.variant === recommendedFormatVariant ? (
                      <div className="flex items-center gap-2">
                        <div
                          className={[
                            "inline-flex h-6 w-6 items-center justify-center rounded-full text-violet-100",
                            active
                              ? "border border-fuchsia-300/30 bg-violet-500/18 shadow-[0_0_18px_rgba(124,58,237,0.35)]"
                              : "border border-white/10 bg-white/5",
                          ].join(" ")}
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5"
                            fill="currentColor"
                          >
                            <path d="m12 2 2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 14l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76L12 2Z" />
                          </svg>
                        </div>
                        <span
                          className={[
                            "text-[10px] font-semibold uppercase tracking-[0.14em]",
                            active ? "text-violet-100" : "text-slate-300",
                          ].join(" ")}
                        >
                          Recommandé
                        </span>
                      </div>
                    ) : (
                      <div />
                    )}

                    <div
                      className={[
                        "inline-flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-[7px] border transition",
                        active
                          ? "border-violet-300/45 bg-violet-500/18 text-violet-100 shadow-[0_0_16px_rgba(124,58,237,0.28)]"
                          : "border-white/15 bg-black/20 text-transparent",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m5 12 4.5 4.5L19 7.5" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            );
            })}
          </div>
        </div>

        {selectedFormatCardVariant ? (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => setFormatCardConfirmed(true)}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-fuchsia-300/30 bg-violet-600 px-3.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_0_18px_rgba(124,58,237,0.35)] transition hover:bg-violet-500"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 12 5 5L20 7" />
              </svg>
              Valider
            </button>
          </div>
        ) : null}

        {openFormatPreview && selectedFormatOption && selectedFormatConfig && selectedFormatStructure ? (
          <div
            className="fixed inset-0 z-[120] overflow-hidden bg-black/78"
            onClick={() => setOpenFormatPreview(null)}
            role="presentation"
          >
            <button
              type="button"
              onClick={() => setOpenFormatPreview(null)}
              className="fixed right-4 top-4 z-[130] flex h-12 w-12 items-center justify-center rounded-full border border-violet-200/25 bg-black/70 text-white shadow-[0_0_30px_rgba(124,58,237,0.28)] backdrop-blur-md transition hover:bg-black/85 hover:text-violet-100 md:right-5 md:top-5"
              aria-label="Fermer l'aperçu"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
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
            <div className="flex h-screen w-screen items-stretch justify-stretch">
              <div
                className="relative flex h-screen w-screen max-h-screen max-w-none flex-col overflow-hidden rounded-none border-0 bg-[#0f1016] shadow-none"
                onClick={(event) => event.stopPropagation()}
                role="presentation"
              >
                <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-2.5 md:px-6 xl:px-8">
                <div>
                  <p className="text-[18px] font-semibold text-white">
                    {selectedFormatOption.label}
                  </p>
                </div>
                <div className="h-8 w-8 shrink-0 md:h-12 md:w-12" aria-hidden="true" />
                </div>

                <div
                  className={`min-h-0 flex-1 px-4 py-2 md:px-5 md:py-2 xl:px-6 ${
                    selectedFormatOption.variant === "double_bracket" ||
                    selectedFormatOption.variant === "group_final"
                      ? "overflow-hidden"
                      : "overflow-y-auto"
                  }`}
                >
                  <TournamentTypeOptionPreview
                    structure={selectedFormatStructure}
                    compact={false}
                    compactVariant={selectedFormatOption.variant}
                    compactTeamCount={selectedFormatConfig.teamCount}
                    roundRobinMode={selectedRoundRobinMode}
                    fullSize={selectedFormatOption.variant === "group_final"}
                    fullSizeViewportInset={
                      selectedFormatOption.variant === "group_final" ? 12 : 0
                    }
                    fullSizeScaleCap={
                      selectedFormatOption.variant === "group_final" ? 1.42 : undefined
                    }
                    fullSizeVerticalOffset={
                      selectedFormatOption.variant === "group_final" ? -18 : 0
                    }
                  />
                </div>

                <div className="border-t border-white/10 px-5 py-1.5 md:px-6 xl:px-8">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFormatCardVariant(selectedFormatOption.variant);
                      onConfigChange((current) => {
                        const nextConfig = buildFormatOptionConfig(
                          current,
                          selectedFormatOption,
                          getFormatTeamCount(current.teamCount, estimatedTeamCount),
                          true,
                        );
                        return applyAutoTeamSettings(
                          {
                            ...current,
                            qualificationRule: nextConfig.qualificationRule,
                            finalPhase: nextConfig.finalPhase,
                            placementMatches: nextConfig.placementMatches,
                          },
                          {
                            teamCount: nextConfig.teamCount,
                            autoFormat: nextConfig.autoFormat,
                            groupCount: nextConfig.groupCount,
                            teamsPerGroup: nextConfig.teamsPerGroup,
                          },
                        );
                      });
                      setOpenFormatPreview(null);
                    }}
                    className="inline-flex h-8 items-center rounded-full border border-fuchsia-300/30 bg-violet-600 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_0_18px_rgba(124,58,237,0.35)] transition hover:bg-violet-500"
                  >
                    Utiliser ce format
                  </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {canGoBack ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onBack}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Retour"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 14 4 9l5-5" />
                <path d="M4 9h9a7 7 0 1 1 0 14h-1" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>
    );
  } else if (!formatConfirmed) {
    const finalHomeAwayEnabled = config.finalPhase.toLowerCase().includes("aller-retour");
    const placementEnabled = config.placementMatches !== "Non";

    currentQuestion = (
      <AssistantQuestionCard
        question="Options du format"
        layout="stacked"
        response={
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
              <button
                type="button"
                onClick={() =>
                  onConfigChange((current) => ({
                    ...current,
                    groupHomeAway: !current.groupHomeAway,
                  }))
                }
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-medium transition",
                  config.groupHomeAway
                    ? "border-fuchsia-300/30 bg-violet-600 text-white shadow-[0_0_18px_rgba(124,58,237,0.35)]"
                  : "border-white/10 bg-white/[0.04] text-slate-300",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-4 w-4 items-center justify-center rounded-[4px] border transition",
                    config.groupHomeAway
                      ? "border-white/40 bg-white/15 text-white"
                      : "border-white/15 bg-transparent text-transparent",
                  ].join(" ")}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                </span>
                Match allé retour groupe
              </button>
              <button
                type="button"
                onClick={() =>
                  onConfigChange((current) => ({
                    ...current,
                    finalPhase: current.finalPhase.toLowerCase().includes("classement direct")
                      ? "Finale + match de classement"
                      : current.finalPhase.toLowerCase().includes("aller-retour")
                        ? current.finalPhase.replace(" aller-retour", "")
                        : `${current.finalPhase} aller-retour`,
                  }))
                }
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-medium transition",
                  finalHomeAwayEnabled
                    ? "border-fuchsia-300/30 bg-violet-600 text-white shadow-[0_0_18px_rgba(124,58,237,0.35)]"
                    : "border-white/10 bg-white/[0.04] text-slate-300",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-4 w-4 items-center justify-center rounded-[4px] border transition",
                    finalHomeAwayEnabled
                      ? "border-white/40 bg-white/15 text-white"
                      : "border-white/15 bg-transparent text-transparent",
                  ].join(" ")}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                </span>
                Match aller retour finale
              </button>
              <button
                type="button"
                onClick={() =>
                  onConfigChange((current) => ({
                    ...current,
                    placementMatches: current.placementMatches === "Non" ? "Oui" : "Non",
                    finalPhase:
                      current.finalPhase.toLowerCase().includes("classement direct") &&
                      current.placementMatches === "Non"
                        ? "Finale + match de classement"
                        : current.finalPhase,
                  }))
                }
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-medium transition",
                  placementEnabled
                    ? "border-fuchsia-300/30 bg-violet-600 text-white shadow-[0_0_18px_rgba(124,58,237,0.35)]"
                    : "border-white/10 bg-white/[0.04] text-slate-300",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-4 w-4 items-center justify-center rounded-[4px] border transition",
                    placementEnabled
                      ? "border-white/40 bg-white/15 text-white"
                      : "border-white/15 bg-transparent text-transparent",
                  ].join(" ")}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                </span>
                Match de classement
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setFormatCardConfirmed(false);
                  setSelectedFormatCardVariant(null);
                }}
                className="inline-flex h-9 items-center rounded-full border border-white/10 bg-white/5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                Retour formats
              </button>
              <button
                type="button"
                onClick={onFormatConfirm}
                className="inline-flex h-9 items-center gap-1 rounded-full border border-fuchsia-300/30 bg-violet-600 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_0_18px_rgba(124,58,237,0.35)] transition hover:bg-violet-500"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 12 5 5L20 7" />
                </svg>
                Valider
              </button>
            </div>
          </div>
        }
      />
    );
  }

  return (
    <div ref={assistantContentRef} className="space-y-5 pt-2">
      {currentQuestion}

      {assistantSummaryChips.length > 0 ? (
        <div className="flex justify-start">
          <div className="flex flex-wrap gap-2">
            {assistantSummaryChips.map((chip) => (
              <div
                key={chip}
                className="rounded-full border border-violet-400/20 bg-violet-500/12 px-3 py-1.5 text-[11px] font-medium tracking-[0.04em] text-violet-100"
              >
                {chip}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {suggestionsReady && !formatConfirmed && !selectedFormatCardVariant ? (
        <div className="min-w-0 max-w-full space-y-3">
          <div className="h-px w-full bg-white/8" />
          <p className="text-center text-[12px] tracking-[0.16em] text-slate-400">
            Propositions generees
          </p>
          <div className="max-w-full overflow-x-auto overflow-y-hidden pb-2">
            <div className="inline-flex min-w-max gap-3">
              {autoSuggestions.slice(0, 11).map((suggestion) => (
                <TournamentSuggestionCard
                  key={`assistant-${suggestion.key}`}
                  config={config}
                  suggestion={suggestion}
                  selected={
                    config.teamCount === suggestion.teamCount &&
                    config.autoFormat === suggestion.format &&
                    config.matchDuration === suggestion.matchDuration &&
                    config.breakMinutes === suggestion.breakMinutes &&
                    config.lunchBreakMinutes === suggestion.lunchBreakMinutes &&
                    config.groupHomeAway === suggestion.groupHomeAway &&
                    config.groupCount === suggestion.groupCount &&
                    config.teamsPerGroup === suggestion.teamsPerGroup
                  }
                  recommended={suggestion.variant === "recommended"}
                  open={openSuggestionKey === suggestion.key}
                  onTogglePreview={() =>
                    setOpenSuggestionKey((current) =>
                      current === suggestion.key ? null : suggestion.key,
                    )
                  }
                  onSelect={() =>
                    onConfigChange((current) => ({
                      ...applyAutoTeamSettings(current, {
                        teamCount: suggestion.teamCount,
                        autoFormat: suggestion.format,
                        groupCount: suggestion.groupCount || current.groupCount,
                        teamsPerGroup: suggestion.teamsPerGroup || current.teamsPerGroup,
                      }),
                      matchDuration: suggestion.matchDuration,
                      breakMinutes: suggestion.breakMinutes,
                      lunchBreakMinutes: suggestion.lunchBreakMinutes,
                      groupHomeAway: suggestion.groupHomeAway,
                    }))
                  }
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TournamentAutoGenerator({
  config,
  onConfigChange,
  autoSuggestions,
  autoSuggestionsOpen,
  onGenerate,
  recommendedFormatLabel,
}: {
  config: TournamentConfig;
  onConfigChange: (updater: (current: TournamentConfig) => TournamentConfig) => void;
  autoSuggestions: TournamentAutoSuggestion[];
  autoSuggestionsOpen: boolean;
  onGenerate: () => void;
  recommendedFormatLabel: string;
}) {
  const [openSuggestionKey, setOpenSuggestionKey] = useState<string | null>(null);

  return (
    <>
      <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
              Génération automatique
            </p>
            <p className="mt-2 text-sm text-slate-300">
              L&apos;application propose automatiquement les meilleurs formats de tournoi.
            </p>
          </div>
          <button
            type="button"
            onClick={onGenerate}
            className="rounded-full border border-fuchsia-300/30 bg-violet-600 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-[0_0_18px_rgba(124,58,237,0.35)] transition hover:bg-violet-500"
          >
            Généré auto
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Nombre d’équipes
            </span>
            <input
              type="number"
              min={0}
              max={32}
              value={config.teamCount ?? 0}
              onChange={(event) =>
                onConfigChange((current) => {
                  const rawValue = Number(event.target.value) || 0;
                  const nextTeamCount = rawValue <= 0 ? 0 : Math.max(4, rawValue);
                  const recommended = nextTeamCount > 0
                    ? getRecommendedAutoSetup(nextTeamCount)
                    : getRecommendedAutoSetup(8);
                  return applyAutoTeamSettings(current, {
                    teamCount: nextTeamCount,
                    autoFormat: recommended.autoFormat,
                    groupCount: recommended.groupCount,
                    teamsPerGroup: recommended.teamsPerGroup,
                  });
                })
              }
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
            />
          </label>

          <label className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Terrains
            </span>
            <input
              type="number"
              min={1}
              max={12}
              value={config.fieldCount ?? 1}
              onChange={(event) =>
                onConfigChange((current) => ({
                  ...current,
                  fieldCount: Math.max(1, Number(event.target.value) || 1),
                }))
              }
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
            />
          </label>

          <label className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Heure début
            </span>
            <input
              type="time"
              value={config.startTime ?? "09:00"}
              onChange={(event) =>
                onConfigChange((current) => ({
                  ...current,
                  startTime: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
            />
          </label>

          <label className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Heure fin
            </span>
            <input
              type="time"
              value={config.endTime ?? "17:00"}
              onChange={(event) =>
                onConfigChange((current) => ({
                  ...current,
                  endTime: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
            />
          </label>

          <label className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Durée match
            </span>
            <input
              type="number"
              min={5}
              max={90}
              value={config.matchDuration ?? 15}
              onChange={(event) =>
                onConfigChange((current) => ({
                  ...current,
                  matchDuration: Math.max(5, Number(event.target.value) || 5),
                }))
              }
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
            />
          </label>
        </div>
      </div>

      <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
          {recommendedFormatLabel}
        </div>

        {autoSuggestionsOpen ? (
          <div className="mt-4 min-w-0 max-w-full space-y-3">
            <div className="h-px w-full bg-white/8" />
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Propositions recommandées
            </p>
            <div className="max-w-full overflow-x-auto overflow-y-hidden pb-2">
              <div className="inline-flex min-w-max gap-3">
                {autoSuggestions.slice(0, 11).map((suggestion) => (
                  <TournamentSuggestionCard
                    key={suggestion.key}
                    config={config}
                    suggestion={suggestion}
                    selected={
                      config.teamCount === suggestion.teamCount &&
                      config.autoFormat === suggestion.format &&
                      config.matchDuration === suggestion.matchDuration &&
                      config.breakMinutes === suggestion.breakMinutes &&
                      config.lunchBreakMinutes === suggestion.lunchBreakMinutes &&
                      config.groupHomeAway === suggestion.groupHomeAway &&
                      config.groupCount === suggestion.groupCount &&
                      config.teamsPerGroup === suggestion.teamsPerGroup
                    }
                    recommended={suggestion.variant === "recommended"}
                    open={openSuggestionKey === suggestion.key}
                    onTogglePreview={() =>
                      setOpenSuggestionKey((current) =>
                        current === suggestion.key ? null : suggestion.key,
                      )
                    }
                    onSelect={() =>
                      onConfigChange((current) => ({
                        ...applyAutoTeamSettings(current, {
                          teamCount: suggestion.teamCount,
                          autoFormat: suggestion.format,
                          groupCount: suggestion.groupCount || current.groupCount,
                          teamsPerGroup: suggestion.teamsPerGroup || current.teamsPerGroup,
                        }),
                        matchDuration: suggestion.matchDuration,
                        breakMinutes: suggestion.breakMinutes,
                        lunchBreakMinutes: suggestion.lunchBreakMinutes,
                        groupHomeAway: suggestion.groupHomeAway,
                      }))
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

type ManualTournamentState = {
  name: string;
  date: string;
  teamsCount: number;
  groupsCount: number;
  qualification: number;
  bracketType: "semi" | "quarter";
  placementMatches: boolean;
  shuffleSeed: number;
};

type TournamentPreviewCardData = {
  id: string;
  label: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
};

type TournamentPreviewGroupData = {
  label: string;
  standings: TournamentStandingRow[];
  matches: TournamentGeneratedMatch[];
};

type TournamentPreviewData = {
  name: string;
  date: string;
  teamCount: number;
  groupsCount: number;
  qualification: number;
  bracketLabel: string;
  placementMatches: boolean;
  groups: TournamentPreviewGroupData[];
  featuredMatches: TournamentPreviewCardData[];
  structure: TournamentStructure;
  variant: TournamentFormatOptionVariant;
  roundRobinMode: "classement" | "finale";
};

const MANUAL_TEAM_COUNT_OPTIONS = [8, 12, 16, 24] as const;
const MANUAL_GROUP_COUNT_OPTIONS = [2, 4, 8] as const;
const MANUAL_QUALIFICATION_OPTIONS = [1, 2, 3] as const;
const MANUAL_TEAM_NAMES = [
  "A.S. Cannes",
  "FC Antibes",
  "OGC Nice Jeunes",
  "Etoile Frejus",
  "Racing Toulon",
  "SC Draguignan",
  "ES Menton",
  "Valbonne United",
  "Mougins Academy",
  "RC Grasse",
  "US Cagnes",
  "AC Vence",
  "Hyeres Elite",
  "FC Provence",
  "Marseille Campus",
  "Aubagne Vision",
  "Sporting Arles",
  "Union Nimoise",
  "Rodez Formation",
  "Montpellier Next",
  "Sete Horizon",
  "Beziers Sud",
  "Narbonne Mediterranee",
  "Perpignan Catalan",
  "Bastia Mediterra",
  "Ajaccio Tempo",
  "Monaco Performance",
  "Saint-Raphael Foot",
] as const;

const DEFAULT_MANUAL_TOURNAMENT_STATE: ManualTournamentState = {
  name: "Preview tournoi",
  date: "",
  teamsCount: 16,
  groupsCount: 4,
  qualification: 2,
  bracketType: "quarter",
  placementMatches: true,
  shuffleSeed: 0,
};

const getManualGroupCountOptions = (teamsCount: number) =>
  MANUAL_GROUP_COUNT_OPTIONS.filter((option) => teamsCount / option >= 2);

const getManualQualificationOptions = (teamsCount: number, groupsCount: number) =>
  MANUAL_QUALIFICATION_OPTIONS.filter(
    (option) => option <= Math.max(1, Math.floor(teamsCount / groupsCount)),
  );

const buildManualPreviewTeams = (teamsCount: number, shuffleSeed: number): TournamentTeam[] =>
  Array.from({ length: teamsCount }, (_, index) => {
    const sourceIndex = shuffleSeed + index;
    const baseName = MANUAL_TEAM_NAMES[sourceIndex % MANUAL_TEAM_NAMES.length] ?? `Equipe ${index + 1}`;
    const cycle = Math.floor(sourceIndex / MANUAL_TEAM_NAMES.length);

    return {
      id: `manual-preview-${shuffleSeed}-${index + 1}`,
      name: cycle > 0 ? `${baseName} ${cycle + 1}` : baseName,
      officialId: null,
      source: "manual",
    };
  });

const buildManualStandingRows = (teams: string[]): TournamentStandingRow[] =>
  teams.map((team) => ({
    team,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    diff: 0,
    points: 0,
  }));

const buildManualQualifiedSeeds = (
  groupsCount: number,
  qualification: number,
  target: number,
) => {
  const letters = Array.from({ length: groupsCount }, (_, index) =>
    String.fromCharCode(65 + index),
  );
  const seeds: string[] = [];

  for (let rank = 1; rank <= qualification; rank += 1) {
    letters.forEach((letter) => {
      seeds.push(`${rank}${letter}`);
    });
  }

  while (seeds.length < target) {
    seeds.push(`Wild Card ${seeds.length + 1}`);
  }

  return seeds.slice(0, target);
};

const buildManualPreviewStructure = (
  state: ManualTournamentState,
): { structure: TournamentStructure; teams: TournamentTeam[] } => {
  const teams = buildManualPreviewTeams(state.teamsCount, state.shuffleSeed);
  const groups = buildGroupBuckets(teams, state.groupsCount);
  const groupStructures = groups.map((groupTeams, index) => ({
    label: `Poule ${String.fromCharCode(65 + index)}`,
    teams: groupTeams.map((team) => team.name),
    matches: buildRoundRobinMatchList(
      groupTeams,
      `Poule ${String.fromCharCode(65 + index)}`,
      false,
      "group_stage",
    ),
  }));

  if (state.bracketType === "semi") {
    const seeds = buildManualQualifiedSeeds(state.groupsCount, state.qualification, 4);

    return {
      teams,
      structure: {
        formatType: "Groupes + demi + finale",
        groups: groupStructures,
        knockout: [
          buildStageMatch("Demi-finale", seeds[0] ?? "1A", seeds[3] ?? "2B", "semi_final"),
          buildStageMatch("Demi-finale", seeds[1] ?? "1B", seeds[2] ?? "2A", "semi_final"),
          buildStageMatch("Finale", "Vainqueur DF1", "Vainqueur DF2", "final"),
        ],
        classement: state.placementMatches
          ? [
              buildStageMatch(
                "Match 3e place",
                "Perdant DF1",
                "Perdant DF2",
                "placement_3rd",
              ),
            ]
          : [],
      },
    };
  }

  const seeds = buildManualQualifiedSeeds(state.groupsCount, state.qualification, 8);

  return {
    teams,
    structure: {
      formatType: "Groupes + quart + demi + finale",
      groups: groupStructures,
      knockout: [
        buildStageMatch("Quart de finale", seeds[0] ?? "1A", seeds[7] ?? "2D", "quarter_final"),
        buildStageMatch("Quart de finale", seeds[3] ?? "1D", seeds[4] ?? "2A", "quarter_final"),
        buildStageMatch("Quart de finale", seeds[1] ?? "1B", seeds[6] ?? "2C", "quarter_final"),
        buildStageMatch("Quart de finale", seeds[2] ?? "1C", seeds[5] ?? "2B", "quarter_final"),
        buildStageMatch("Demi-finale", "Vainqueur QF1", "Vainqueur QF2", "semi_final"),
        buildStageMatch("Demi-finale", "Vainqueur QF3", "Vainqueur QF4", "semi_final"),
        buildStageMatch("Finale", "Vainqueur DF1", "Vainqueur DF2", "final"),
      ],
      classement: state.placementMatches
        ? [
            buildStageMatch("Match 3e place", "Perdant DF1", "Perdant DF2", "placement_3rd"),
            buildStageMatch("Classement 5e-8e", "Perdant QF1", "Perdant QF2", "quarter_losers"),
            buildStageMatch("Classement 5e-8e", "Perdant QF3", "Perdant QF4", "quarter_losers"),
            buildStageMatch("Classement 5e place", "Vainqueur C1", "Vainqueur C2", "placement_mid"),
            buildStageMatch("Classement 7e place", "Perdant C1", "Perdant C2", "placement_mid"),
          ]
        : [],
    },
  };
};

const buildTournamentPreviewData = (state: ManualTournamentState): TournamentPreviewData => {
  const { structure } = buildManualPreviewStructure(state);
  const featuredMatches = flattenTournamentStructure(structure)
    .filter(isValidGeneratedMatch)
    .slice(0, 12)
    .map((match, index) => ({
      id: `preview-match-${index + 1}`,
      label: match.phaseLabel,
      time: toTimeLabel(9 * 60 + index * 18),
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
    }));

  return {
    name: state.name.trim() || "Preview tournoi",
    date: state.date,
    teamCount: state.teamsCount,
    groupsCount: state.groupsCount,
    qualification: state.qualification,
    bracketLabel:
      state.bracketType === "semi" ? "Demi + Finale" : "Quart + Demi + Finale",
    placementMatches: state.placementMatches,
    groups: structure.groups.map((group) => ({
      label: group.label,
      standings: buildManualStandingRows(group.teams),
      matches: group.matches,
    })),
    featuredMatches,
    structure,
    variant: "group_final",
    roundRobinMode: "finale",
  };
};

function TournamentPreview({ data }: { data: TournamentPreviewData }) {
  return (
    <div className="space-y-5">
      <div className="rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.16),transparent_52%),rgba(255,255,255,0.03)] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">
              Preview live
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">
              {data.name}
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              {[
                data.date || "Date libre",
                `${data.teamCount} equipes`,
                `${data.groupsCount} groupes`,
                `Qualif Top ${data.qualification}`,
                data.bracketLabel,
              ].join(" • ")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
              {data.bracketLabel}
            </span>
            <span
              className={[
                "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                data.placementMatches
                  ? "border border-emerald-300/30 bg-emerald-500/12 text-emerald-100"
                  : "border border-white/10 bg-white/5 text-slate-400",
              ].join(" ")}
            >
              {data.placementMatches ? "Classement on" : "Classement off"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="space-y-5">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                  Poules
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  Vue builder du futur rendu tournoi.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold text-slate-300">
                {data.groups.length} cartes
              </span>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {data.groups.map((group) => (
                <div
                  key={group.label}
                  className="rounded-[22px] border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{group.label}</p>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {group.standings.length} equipes
                    </span>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-[18px] border border-white/8 bg-white/[0.02]">
                    <table className="w-full table-fixed">
                      <thead className="border-b border-white/6">
                        <tr className="text-left text-[10px] uppercase tracking-[0.16em] text-slate-500">
                          <th className="px-3 py-2.5 font-medium">Equipe</th>
                          <th className="w-12 px-2 py-2.5 text-center font-medium">MJ</th>
                          <th className="w-12 px-2 py-2.5 text-center font-medium">Diff</th>
                          <th className="w-12 px-2 py-2.5 text-center font-medium">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.standings.map((row, index) => (
                          <tr
                            key={`${group.label}-${row.team}`}
                            className="border-b border-white/5 last:border-b-0"
                          >
                            <td className="px-3 py-3 text-sm font-medium text-white">
                              <div className="flex items-center gap-2">
                                <span
                                  className={[
                                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
                                    index === 0
                                      ? "bg-emerald-500/18 text-emerald-100"
                                      : "bg-white/5 text-slate-300",
                                  ].join(" ")}
                                >
                                  {index + 1}
                                </span>
                                <span className="break-words leading-5">{row.team}</span>
                              </div>
                            </td>
                            <td className="px-2 py-3 text-center text-sm text-slate-400">
                              {row.played}
                            </td>
                            <td className="px-2 py-3 text-center text-sm text-slate-400">
                              {row.diff}
                            </td>
                            <td className="px-2 py-3 text-center text-sm font-semibold text-white">
                              {row.points}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 space-y-2">
                    {group.matches.slice(0, 3).map((match, index) => (
                      <div
                        key={`${group.label}-match-${index + 1}`}
                        className="rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-3"
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {match.phaseLabel}
                        </p>
                        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                          <p className="text-right text-sm font-semibold leading-5 text-white">
                            {match.homeTeam}
                          </p>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                            VS
                          </span>
                          <p className="text-sm font-semibold leading-5 text-white">
                            {match.awayTeam}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                  Matchs générés
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  Impact visuel immédiat après chaque clic d’option.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold text-slate-300">
                {data.featuredMatches.length} apercus
              </span>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {data.featuredMatches.map((match) => (
                <div
                  key={match.id}
                  className="rounded-[20px] border border-white/8 bg-black/20 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    <span>{match.label}</span>
                    <span>{match.time}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <p className="text-right text-sm font-semibold leading-5 text-white">
                      {match.homeTeam}
                    </p>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                      VS
                    </div>
                    <p className="text-sm font-semibold leading-5 text-white">
                      {match.awayTeam}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                Bracket
              </p>
              <p className="mt-1 text-sm text-slate-300">
                Le meme composant pourra etre reutilise ensuite ailleurs.
              </p>
            </div>
            <span className="rounded-full border border-violet-300/25 bg-violet-500/14 px-3 py-1 text-[11px] font-semibold text-violet-100">
              Preview first
            </span>
          </div>

          <div className="mt-4 overflow-hidden rounded-[24px] border border-white/8 bg-[#0b0d13] p-3">
            <TournamentTypeOptionPreview
              structure={data.structure}
              compact={false}
              compactVariant={data.variant}
              compactTeamCount={data.teamCount}
              roundRobinMode={data.roundRobinMode}
              showPhaseMatchTeams
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TournamentManualC(props: {
  config: TournamentConfig;
  onConfigChange: (updater: (current: TournamentConfig) => TournamentConfig) => void;
}) {
  void props;
  const [manualTournamentState, setManualTournamentState] = useState<ManualTournamentState>(
    DEFAULT_MANUAL_TOURNAMENT_STATE,
  );

  const availableGroupCounts = useMemo(
    () => getManualGroupCountOptions(manualTournamentState.teamsCount),
    [manualTournamentState.teamsCount],
  );
  const effectiveGroupsCount = availableGroupCounts.includes(manualTournamentState.groupsCount)
    ? manualTournamentState.groupsCount
    : (availableGroupCounts[0] ?? 2);
  const availableQualifications = useMemo(
    () =>
      getManualQualificationOptions(
        manualTournamentState.teamsCount,
        effectiveGroupsCount,
      ),
    [effectiveGroupsCount, manualTournamentState.teamsCount],
  );
  const effectiveQualification = availableQualifications.includes(
    manualTournamentState.qualification,
  )
    ? manualTournamentState.qualification
    : (availableQualifications[0] ?? 1);

  const previewData = useMemo(
    () =>
      buildTournamentPreviewData({
        ...manualTournamentState,
        groupsCount: effectiveGroupsCount,
        qualification: effectiveQualification,
      }),
    [effectiveGroupsCount, effectiveQualification, manualTournamentState],
  );

  const randomizeBuilder = () => {
    const teamsCount =
      MANUAL_TEAM_COUNT_OPTIONS[
        Math.floor(Math.random() * MANUAL_TEAM_COUNT_OPTIONS.length)
      ] ?? DEFAULT_MANUAL_TOURNAMENT_STATE.teamsCount;
    const groupsOptions = getManualGroupCountOptions(teamsCount);
    const groupsCount =
      groupsOptions[Math.floor(Math.random() * groupsOptions.length)] ?? 2;
    const qualificationOptions = getManualQualificationOptions(teamsCount, groupsCount);
    const qualification =
      qualificationOptions[Math.floor(Math.random() * qualificationOptions.length)] ?? 1;

    setManualTournamentState((current) => ({
      ...current,
      teamsCount,
      groupsCount,
      qualification,
      bracketType: Math.random() > 0.5 ? "quarter" : "semi",
      placementMatches: Math.random() > 0.35,
      shuffleSeed: current.shuffleSeed + randomOffset(1, 7),
    }));
  };

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-white/10 bg-white/[0.03] px-4 py-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={manualTournamentState.name}
            onChange={(event) =>
              setManualTournamentState((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            placeholder="Nom du tournoi"
            className="min-w-[220px] flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
          />
          <input
            type="date"
            value={manualTournamentState.date}
            onChange={(event) =>
              setManualTournamentState((current) => ({
                ...current,
                date: event.target.value,
              }))
            }
            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
          />
          <span className="rounded-full border border-violet-300/25 bg-violet-500/14 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-100">
            Sandbox manuel
          </span>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[290px_minmax(0,1fr)]">
        <div className="space-y-4 xl:order-1">
          <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
              Options
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Chaque clic met a jour le preview immediatement.
            </p>

            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Nombre d’equipes
                </p>
                <div className="flex flex-wrap gap-2">
                  {MANUAL_TEAM_COUNT_OPTIONS.map((option) => {
                    const active = manualTournamentState.teamsCount === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() =>
                          setManualTournamentState((current) => ({
                            ...current,
                            teamsCount: option,
                          }))
                        }
                        className={[
                          "rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
                          active
                            ? "border border-violet-300/30 bg-violet-500/18 text-white"
                            : "border border-white/10 bg-black/20 text-slate-300 hover:bg-white/10 hover:text-white",
                        ].join(" ")}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Nombre de groupes
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableGroupCounts.map((option) => {
                    const active = effectiveGroupsCount === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() =>
                          setManualTournamentState((current) => ({
                            ...current,
                            groupsCount: option,
                          }))
                        }
                        className={[
                          "rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
                          active
                            ? "border border-violet-300/30 bg-violet-500/18 text-white"
                            : "border border-white/10 bg-black/20 text-slate-300 hover:bg-white/10 hover:text-white",
                        ].join(" ")}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Qualification
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableQualifications.map((option) => {
                    const active = effectiveQualification === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() =>
                          setManualTournamentState((current) => ({
                            ...current,
                            qualification: option,
                          }))
                        }
                        className={[
                          "rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
                          active
                            ? "border border-violet-300/30 bg-violet-500/18 text-white"
                            : "border border-white/10 bg-black/20 text-slate-300 hover:bg-white/10 hover:text-white",
                        ].join(" ")}
                      >
                        Top {option}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Type de bracket
                </p>
                <div className="grid gap-2">
                  {[
                    { value: "semi" as const, label: "Demi + Finale" },
                    { value: "quarter" as const, label: "Quart + Demi + Finale" },
                  ].map((option) => {
                    const active = manualTournamentState.bracketType === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setManualTournamentState((current) => ({
                            ...current,
                            bracketType: option.value,
                          }))
                        }
                        className={[
                          "rounded-[18px] border px-3 py-2 text-left text-sm font-medium transition",
                          active
                            ? "border-violet-300/30 bg-violet-500/18 text-white"
                            : "border-white/10 bg-black/20 text-slate-300 hover:bg-white/10 hover:text-white",
                        ].join(" ")}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Matchs de classement
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setManualTournamentState((current) => ({
                      ...current,
                      placementMatches: !current.placementMatches,
                    }))
                  }
                  className={[
                    "flex w-full items-center justify-between rounded-[18px] border px-3 py-2 text-sm font-medium transition",
                    manualTournamentState.placementMatches
                      ? "border-emerald-300/30 bg-emerald-500/12 text-emerald-100"
                      : "border-white/10 bg-black/20 text-slate-300 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                >
                  <span>{manualTournamentState.placementMatches ? "Active" : "Desactive"}</span>
                  <span className="text-[11px] uppercase tracking-[0.14em]">
                    {manualTournamentState.placementMatches ? "ON" : "OFF"}
                  </span>
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setManualTournamentState(DEFAULT_MANUAL_TOURNAMENT_STATE)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={randomizeBuilder}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                Generation aleatoire
              </button>
            </div>

            <button
              type="button"
              onClick={() => console.log("manual-preview-format", previewData)}
              className="mt-4 w-full rounded-full border border-fuchsia-300/30 bg-violet-600 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-[0_0_24px_rgba(124,58,237,0.32)] transition hover:bg-violet-500"
            >
              Utiliser ce format
            </button>
          </div>
        </div>

        <div className="min-w-0 xl:order-2">
          <TournamentPreview data={previewData} />
        </div>
      </div>
    </div>
  );
}

function TournamentCreationMode({
  mode,
  showModeContent,
  showModeCards = true,
  onModeChange,
  onOpenManualBuilder,
  config,
  onConfigChange,
  onAssistantBack,
  autoSuggestions,
  autoSuggestionsOpen,
  onGenerate,
  recommendedFormatLabel,
  assistantKnowsTeamCount,
  onAssistantKnowsTeamCountChange,
  assistantTeamCountDraft,
  onAssistantTeamCountDraftChange,
  assistantKnowsTimeRange,
  onAssistantKnowsTimeRangeChange,
  assistantTimeRangeConfirmed,
  onAssistantTimeRangeConfirm,
  assistantDurationConfirmed,
  onAssistantDurationConfirm,
  assistantBreakConfirmed,
  onAssistantBreakConfirm,
  assistantLunchBreakConfirmed,
  onAssistantLunchBreakConfirm,
  assistantFormatConfirmed,
  onAssistantFormatConfirm,
  assistantEstimatedTeamCount,
  assistantWizardSessionKey,
}: {
  mode: TournamentMode;
  showModeContent: boolean;
  showModeCards?: boolean;
  onModeChange: (mode: TournamentMode) => void;
  onOpenManualBuilder: () => void;
  config: TournamentConfig;
  onConfigChange: (updater: (current: TournamentConfig) => TournamentConfig) => void;
  onAssistantBack: () => void;
  autoSuggestions: TournamentAutoSuggestion[];
  autoSuggestionsOpen: boolean;
  onGenerate: () => void;
  recommendedFormatLabel: string;
  assistantKnowsTeamCount: boolean | null;
  onAssistantKnowsTeamCountChange: (value: boolean) => void;
  assistantTeamCountDraft: string;
  onAssistantTeamCountDraftChange: (value: string) => void;
  assistantKnowsTimeRange: boolean | null;
  onAssistantKnowsTimeRangeChange: (value: boolean) => void;
  assistantTimeRangeConfirmed: boolean;
  onAssistantTimeRangeConfirm: () => void;
  assistantDurationConfirmed: boolean;
  onAssistantDurationConfirm: () => void;
  assistantBreakConfirmed: boolean;
  onAssistantBreakConfirm: () => void;
  assistantLunchBreakConfirmed: boolean;
  onAssistantLunchBreakConfirm: () => void;
  assistantFormatConfirmed: boolean;
  onAssistantFormatConfirm: () => void;
  assistantEstimatedTeamCount: number;
  assistantWizardSessionKey: number;
}) {
  const modes = [
    {
      key: "assistant" as const,
      title: "Utilise l'assistant",
      description: "Laisse l'assistant te guider pas à pas selon ton tournoi.",
      icon: (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3 4 7v6c0 4.4 3.3 7.7 8 8 4.7-.3 8-3.6 8-8V7l-8-4Z" />
          <path d="m9.5 12 1.7 1.7L14.8 10" />
        </svg>
      ),
    },
    {
      key: "auto" as const,
      title: "Mode auto",
      description: "Infinity propose automatiquement la structure la plus adaptée.",
      icon: (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12h7" />
          <path d="M14 6h7" />
          <path d="M14 18h7" />
          <path d="m8 8 2 4-2 4" />
          <path d="m16 4-2 2 2 2" />
          <path d="m16 16-2 2 2 2" />
        </svg>
      ),
    },
    {
      key: "manual" as const,
      title: "Mode manuel",
      description: "Construis ton tournoi toi-même, match par match et équipe par équipe.",
      icon: (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4 20 4.5-1 9.8-9.8a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z" />
          <path d="m13.5 6.5 4 4" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {showModeCards ? (
        <div className="grid gap-3 md:grid-cols-3">
          {modes.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => {
                if (entry.key === "manual") {
                  onOpenManualBuilder();
                  return;
                }

                onModeChange(entry.key);
              }}
              className={[
                "flex min-h-[132px] flex-col items-start rounded-[22px] border p-4 text-left transition",
                mode === entry.key
                  ? "border-violet-300/30 bg-violet-600 text-white shadow-[0_0_22px_rgba(124,58,237,0.24)]"
                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-flex h-10 w-10 items-center justify-center rounded-2xl border",
                  mode === entry.key
                    ? "border-white/15 bg-white/10 text-white"
                    : "border-white/10 bg-black/20 text-slate-200",
                ].join(" ")}
              >
                {entry.icon}
              </span>
              <span className="mt-4 text-sm font-semibold">{entry.title}</span>
              <span
                className={[
                  "mt-2 text-xs leading-5",
                  mode === entry.key ? "text-white/78" : "text-slate-400",
                ].join(" ")}
              >
                {entry.description}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {!showModeContent ? null : mode === "assistant" ? (
        <TournamentAssistant
          key={assistantWizardSessionKey}
          config={config}
          onConfigChange={onConfigChange}
          onBack={onAssistantBack}
          knowsTeamCount={assistantKnowsTeamCount}
          onKnowsTeamCountChange={onAssistantKnowsTeamCountChange}
          teamCountDraft={assistantTeamCountDraft}
          onTeamCountDraftChange={onAssistantTeamCountDraftChange}
          knowsTimeRange={assistantKnowsTimeRange}
          onKnowsTimeRangeChange={onAssistantKnowsTimeRangeChange}
          timeRangeConfirmed={assistantTimeRangeConfirmed}
          onTimeRangeConfirm={onAssistantTimeRangeConfirm}
          durationConfirmed={assistantDurationConfirmed}
          onDurationConfirm={onAssistantDurationConfirm}
          breakConfirmed={assistantBreakConfirmed}
          onBreakConfirm={onAssistantBreakConfirm}
          lunchBreakConfirmed={assistantLunchBreakConfirmed}
          onLunchBreakConfirm={onAssistantLunchBreakConfirm}
          formatConfirmed={assistantFormatConfirmed}
          onFormatConfirm={onAssistantFormatConfirm}
          estimatedTeamCount={assistantEstimatedTeamCount}
          autoSuggestions={autoSuggestions}
        />
      ) : mode === "auto" ? (
        <TournamentAutoGenerator
          config={config}
          onConfigChange={onConfigChange}
          autoSuggestions={autoSuggestions}
          autoSuggestionsOpen={autoSuggestionsOpen}
          onGenerate={onGenerate}
          recommendedFormatLabel={recommendedFormatLabel}
        />
      ) : (
        <TournamentManualC config={config} onConfigChange={onConfigChange} />
      )}
    </div>
  );
}

export default function TournamentTab({ teamId }: TournamentTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const storageKey = `${STORAGE_PREFIX}${teamId}`;
  const tournamentDateInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<TournamentView>("create");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [modeContentOpen, setModeContentOpen] = useState(false);
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const wizardContentRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<TournamentMode>("assistant");
  const [config, setConfig] = useState<TournamentConfig>({ ...DEFAULT_CONFIG });
  const [savedTournaments, setSavedTournaments] = useState<SavedTournament[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [manualTeamName, setManualTeamName] = useState("");
  const [autoSuggestionsOpen, setAutoSuggestionsOpen] = useState(false);
  const [assistantKnowsTeamCount, setAssistantKnowsTeamCount] = useState<boolean | null>(null);
  const [assistantTeamCountDraft, setAssistantTeamCountDraft] = useState("");
  const [assistantKnowsTimeRange, setAssistantKnowsTimeRange] = useState<boolean | null>(null);
  const [assistantTimeRangeConfirmed, setAssistantTimeRangeConfirmed] = useState(false);
  const [assistantDurationConfirmed, setAssistantDurationConfirmed] = useState(false);
  const [assistantBreakConfirmed, setAssistantBreakConfirmed] = useState(false);
  const [assistantLunchBreakConfirmed, setAssistantLunchBreakConfirmed] = useState(false);
  const [assistantFormatConfirmed, setAssistantFormatConfirmed] = useState(false);
  const [assistantWizardSessionKey, setAssistantWizardSessionKey] = useState(0);
  const [previewTab, setPreviewTab] = useState<"structure" | "planning">("structure");
  const [previewGroupMatchesOpen, setPreviewGroupMatchesOpen] = useState(false);
  const [previewFinalMatchesOpen, setPreviewFinalMatchesOpen] = useState(false);
  const [previewShowAller, setPreviewShowAller] = useState(true);
  const [previewShowRetour, setPreviewShowRetour] = useState(true);

  useEffect(() => {
    if (tournamentsLoading) return;
    window.localStorage.setItem(storageKey, JSON.stringify(savedTournaments));
  }, [savedTournaments, storageKey, tournamentsLoading]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      setSavedTournaments(readLocalSavedTournaments(storageKey));
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [storageKey]);

  useEffect(() => {
    let cancelled = false;

    const syncTournaments = async () => {
      const localEntries = readLocalSavedTournaments(storageKey);

      try {
        const remoteEntries = sanitizeSavedTournaments(await listSupabaseTournaments(teamId));
        if (cancelled) return;

        const mergedEntries = mergeSavedTournamentLists(localEntries, remoteEntries);
        setSavedTournaments(mergedEntries);

        const remoteIds = new Set(remoteEntries.map((entry) => entry.id));
        const localEntriesToMigrate = localEntries.filter((entry) => !remoteIds.has(entry.id));

        if (localEntriesToMigrate.length > 0) {
          await Promise.allSettled(
            localEntriesToMigrate.map((entry) =>
              saveTournamentToSupabase({
                ...entry,
                teamId,
              }),
            ),
          );
        }
      } catch (error) {
        console.error("Erreur sync tournois Supabase:", error);
        if (!cancelled) {
          setSavedTournaments(localEntries);
        }
      } finally {
        if (!cancelled) {
          setTournamentsLoading(false);
        }
      }
    };

    void syncTournaments();

    return () => {
      cancelled = true;
    };
  }, [storageKey, teamId]);

  useEffect(() => {
    if (!selectedTournamentId) return;
    let cancelled = false;

    const refreshSelectedTournament = async () => {
      try {
        const remoteTournament = await loadTournamentFromSupabase<SavedTournament>(selectedTournamentId);
        if (cancelled || !remoteTournament) return;

        setSavedTournaments((current) => {
          const existing = current.find((entry) => entry.id === remoteTournament.id);
          if (existing && JSON.stringify(existing) === JSON.stringify(remoteTournament)) {
            return current;
          }
          return current.some((entry) => entry.id === remoteTournament.id)
            ? current.map((entry) => (entry.id === remoteTournament.id ? remoteTournament : entry))
            : [remoteTournament, ...current];
        });
      } catch (error) {
        console.error("Erreur rafraichissement tournoi Supabase:", error);
      }
    };

    void refreshSelectedTournament();
    const intervalId = window.setInterval(refreshSelectedTournament, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedTournamentId]);

  useEffect(() => {
    const queryTournamentId = searchParams.get("tournamentId");
    if (!queryTournamentId) return;
    if (!savedTournaments.some((entry) => entry.id === queryTournamentId)) return;
    setSelectedTournamentId((current) =>
      current === queryTournamentId ? current : queryTournamentId,
    );
  }, [savedTournaments, searchParams]);

  const preview = useMemo(() => {
    return mode === "manual" ? buildManualSchedule(config) : buildAutoSchedule(config);
  }, [config, mode]);
  const tournamentPreviewStructure = useMemo(
    () => (mode === "manual" ? null : buildDynamicTournamentStructure(config)),
    [config, mode],
  );
  const previewFormatVariant = useMemo<TournamentFormatOptionVariant>(() => {
    if (tournamentPreviewStructure?.formatType === "Elimination directe") {
      return "direct_elimination";
    }

    if (config.autoFormat === "mini_league") {
      return "round_robin";
    }

    if (config.autoFormat === "tournament_bracket") {
      return "double_bracket";
    }

    return "group_final";
  }, [config.autoFormat, tournamentPreviewStructure?.formatType]);
  const previewRoundRobinMode = useMemo<"classement" | "finale">(
    () =>
      config.finalPhase.toLowerCase().includes("classement direct")
        ? "classement"
        : "finale",
    [config.finalPhase],
  );
  const previewGroupScheduleMatches = useMemo(
    () => preview.schedule.filter((match) => match.scheduleSection === "group"),
    [preview.schedule],
  );
  const previewFinalScheduleMatches = useMemo(
    () => preview.schedule.filter((match) => match.scheduleSection === "final"),
    [preview.schedule],
  );
  const previewGroupScheduleByField = useMemo(() => {
    return Array.from({ length: Math.max(1, config.fieldCount) }, (_, index) => {
      const fieldLabel = `Terrain ${index + 1}`;
      return {
        fieldLabel,
        matches: previewGroupScheduleMatches.filter((match) => match.fieldLabel === fieldLabel),
      };
    });
  }, [config.fieldCount, previewGroupScheduleMatches]);
  const previewFinalScheduleByField = useMemo(() => {
    return Array.from({ length: Math.max(1, config.fieldCount) }, (_, index) => {
      const fieldLabel = `Terrain ${index + 1}`;
      return {
        fieldLabel,
        matches: previewFinalScheduleMatches.filter((match) => match.fieldLabel === fieldLabel),
      };
    });
  }, [config.fieldCount, previewFinalScheduleMatches]);
  const previewGroupMatchCount = useMemo(
    () =>
      previewGroupScheduleByField.reduce(
        (total, field) =>
          total + field.matches.filter((match) => !isPauseScheduleMatch(match)).length,
        0,
      ),
    [previewGroupScheduleByField],
  );
  const previewFinalMatchCount = useMemo(
    () =>
      previewFinalScheduleByField.reduce(
        (total, field) =>
          total + field.matches.filter((match) => !isPauseScheduleMatch(match)).length,
        0,
      ),
    [previewFinalScheduleByField],
  );
  const previewHasReturnLegs = useMemo(
    () =>
      previewGroupScheduleMatches.some(
        (match) => !isPauseScheduleMatch(match) && match.leg === "retour",
      ),
    [previewGroupScheduleMatches],
  );
  const previewGroupLegSections = useMemo(() => {
    const buildSection = (
      key: string,
      title: string,
      subtitle: string,
      tone: "blue" | "yellow" | "neutral",
      matcher: (match: TournamentScheduleMatch) => boolean,
    ) => {
      const matches = previewGroupScheduleMatches.filter(matcher);
      const matchCount = matches.filter((match) => !isPauseScheduleMatch(match)).length;
      const rows = buildScheduleSlotRows(matches, config.fieldCount);

      return { key, title, subtitle, tone, rows, matchCount };
    };

    if (!previewHasReturnLegs) {
      return [
        buildSection(
          "group-stage",
          "",
          "",
          "neutral",
          () => true,
        ),
      ];
    }

    const sections = [];

    if (previewShowAller) {
      sections.push(
        buildSection(
          "aller",
          "PHASE ALLER",
          "",
          "blue",
          (match) => isPauseScheduleMatch(match) || match.leg === "aller",
        ),
      );
    }

    if (previewShowRetour) {
      sections.push(
        buildSection(
          "retour",
          "PHASE RETOUR",
          "",
          "yellow",
          (match) => isPauseScheduleMatch(match) || match.leg === "retour",
        ),
      );
    }

    return sections;
  }, [
    config.fieldCount,
    previewGroupScheduleMatches,
    previewHasReturnLegs,
    previewShowAller,
    previewShowRetour,
  ]);
  const previewFinalScheduleRows = useMemo(
    () => buildScheduleSlotRows(previewFinalScheduleMatches, config.fieldCount),
    [config.fieldCount, previewFinalScheduleMatches],
  );
  const assistantEstimatedTeamCount = useMemo(
    () => estimateAssistantTeamCount(config),
    [config],
  );
  const autoSuggestions = useMemo(
    () =>
      buildAutoSuggestions(
        config,
        mode === "assistant" && assistantFormatConfirmed ? config.autoFormat : null,
        mode === "assistant"
          ? {
              durationConfirmed: assistantDurationConfirmed,
              breakConfirmed: assistantBreakConfirmed,
              lunchBreakConfirmed: assistantLunchBreakConfirmed,
              formatConfirmed: assistantFormatConfirmed,
            }
          : undefined,
        mode === "assistant"
          ? assistantKnowsTeamCount === true
            ? Math.max(0, Number(assistantTeamCountDraft) || config.teamCount || 0)
            : assistantKnowsTeamCount === false
              ? assistantEstimatedTeamCount
              : 0
          : 0,
      ),
    [
      assistantDurationConfirmed,
      assistantBreakConfirmed,
      assistantFormatConfirmed,
      assistantKnowsTeamCount,
      assistantTeamCountDraft,
      assistantLunchBreakConfirmed,
      assistantEstimatedTeamCount,
      config,
      mode,
    ],
  );
  const selectedTournament = useMemo(
    () =>
      selectedTournamentId
        ? savedTournaments.find((entry) => entry.id === selectedTournamentId) ?? null
        : null,
    [savedTournaments, selectedTournamentId],
  );
  const selectedTournamentConfig = useMemo(
    () => (selectedTournament ? mapSavedTournamentToConfig(selectedTournament) : null),
    [selectedTournament],
  );
  const selectedTournamentStructure = useMemo(
    () =>
      selectedTournament && selectedTournament.mode !== "manual"
        ? buildDynamicTournamentStructure(
            selectedTournamentConfig ?? mapSavedTournamentToConfig(selectedTournament),
          )
        : null,
    [selectedTournament, selectedTournamentConfig],
  );
  const selectedTournamentVariant = useMemo<TournamentFormatOptionVariant | undefined>(() => {
    if (!selectedTournament || !selectedTournamentStructure) return undefined;
    if (selectedTournamentStructure.formatType === "Elimination directe") {
      return "direct_elimination";
    }

    if (selectedTournament.autoFormat === "mini_league") {
      return "round_robin";
    }

    if (selectedTournament.autoFormat === "tournament_bracket") {
      return "double_bracket";
    }

    return "group_final";
  }, [selectedTournament, selectedTournamentStructure]);
  const selectedTournamentRoundRobinMode = useMemo<"classement" | "finale">(
    () =>
      selectedTournament?.finalPhase?.toLowerCase().includes("classement direct")
        ? "classement"
        : "finale",
    [selectedTournament?.finalPhase],
  );
  const selectedTournamentGroups = useMemo(
    () =>
      selectedTournament?.groups?.length
        ? selectedTournament.groups.map((group) => ({
            label: group.label,
            teams: group.teams,
          }))
        : selectedTournamentStructure?.groups.map((group) => ({
            label: group.label,
            teams: group.teams,
          })) ?? [],
    [selectedTournament, selectedTournamentStructure],
  );
  const selectedTournamentResolvedStructure = useMemo(() => {
    if (!selectedTournamentStructure || !selectedTournament) {
      return null;
    }

    const matchStates = selectedTournament.matchStates ?? {};
    const finalScheduleMatches = selectedTournament.schedule.filter(
      (match) =>
        match.scheduleSection === "final" &&
        !(match.isPause === true || match.type === "pause"),
    );
    const groupedScheduleGroups = new Map<
      string,
      { teams: Set<string>; matches: TournamentScheduleMatch[] }
    >();

    selectedTournament.schedule.forEach((match) => {
      if (
        match.scheduleSection !== "group" ||
        match.isPause === true ||
        match.type === "pause"
      ) {
        return;
      }

      const explicitGroup = match.roundLabel.trim().match(/Poule\s+([A-Z])/i);
      const groupLabel = explicitGroup ? `Poule ${explicitGroup[1].toUpperCase()}` : "Classement général";
      const existing = groupedScheduleGroups.get(groupLabel) ?? {
        teams: new Set<string>(),
        matches: [],
      };
      existing.teams.add(match.homeTeam);
      existing.teams.add(match.awayTeam);
      existing.matches.push(match);
      groupedScheduleGroups.set(groupLabel, existing);
    });

    const groupSources =
      groupedScheduleGroups.size > 0
        ? [...groupedScheduleGroups.entries()].map(([label, group]) => ({
            label,
            teams: [...group.teams],
            matches: group.matches,
          }))
        : selectedTournamentStructure.groups.map((group) => {
            const groupMatches = selectedTournament.schedule.filter(
              (match) =>
                match.scheduleSection === "group" &&
                group.teams.includes(match.homeTeam) &&
                group.teams.includes(match.awayTeam),
            );
            return {
              label: group.label,
              teams: group.teams,
              matches: groupMatches,
            };
          });

    const groupTables = groupSources.map((group) => ({
      label: group.label,
      rows: buildTournamentStandingTable(group.teams, group.matches, matchStates),
      isCompleted:
        group.matches.length > 0 &&
        group.matches.every((match) => (matchStates[match.id]?.status ?? "scheduled") === "completed"),
    }));

    const bestRankByPosition = new Map<number, Array<TournamentStandingRow & { groupLabel: string }>>();
    groupTables.forEach((group) => {
      group.rows.forEach((row, index) => {
        const rank = index + 1;
        const current = bestRankByPosition.get(rank) ?? [];
        current.push({ ...row, groupLabel: group.label });
        bestRankByPosition.set(rank, current);
      });
    });

    bestRankByPosition.forEach((entries, rank) => {
      bestRankByPosition.set(
        rank,
        [...entries].sort((left, right) => {
          if (right.points !== left.points) return right.points - left.points;
          if (right.diff !== left.diff) return right.diff - left.diff;
          if (right.goalsFor !== left.goalsFor) return right.goalsFor - left.goalsFor;
          return left.groupLabel.localeCompare(right.groupLabel, "fr");
        }),
      );
    });

    const finalMatchCounters: Record<string, number> = {};
    const generatedFinalMatches = [
      ...selectedTournamentStructure.knockout,
      ...selectedTournamentStructure.classement,
    ].map((match) => ({
      id: getPlanningNodeId(match, finalMatchCounters),
      match,
    }));

    const buildGeneratedDescriptor = (match: TournamentGeneratedMatch) =>
      `${match.phaseLabel}::${match.homeTeam}::${match.awayTeam}`;
    const buildScheduleDescriptor = (match: TournamentScheduleMatch) =>
      `${match.roundLabel}::${match.homeTeam}::${match.awayTeam}`;

    const scheduleBuckets = new Map<string, TournamentScheduleMatch[]>();
    finalScheduleMatches.forEach((match) => {
      const descriptor = buildScheduleDescriptor(match);
      const current = scheduleBuckets.get(descriptor) ?? [];
      current.push(match);
      scheduleBuckets.set(descriptor, current);
    });

    const scheduleMatchByGeneratedId = new Map<string, TournamentScheduleMatch>();
    generatedFinalMatches.forEach(({ id, match }) => {
      const descriptor = buildGeneratedDescriptor(match);
      const bucket = scheduleBuckets.get(descriptor);
      const linkedScheduleMatch = bucket?.shift();
      if (linkedScheduleMatch) {
        scheduleMatchByGeneratedId.set(id, linkedScheduleMatch);
      }
    });

    const generatedMatchById = new Map(generatedFinalMatches.map((entry) => [entry.id, entry.match]));
    const resolvedTeamCache = new Map<string, string>();
    const getKnockoutOutcome = (state: (typeof matchStates)[string] | null | undefined) => {
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
        (() => {
          const events = state.penaltyShootout?.events ?? [];
          const targetAttempts = Math.max(1, state.penaltyShootout?.targetAttempts ?? 5);
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
              if (homeScore > awayScore + remainingAway) return "home" as const;
              if (awayScore > homeScore + remainingHome) return "away" as const;
              if (homeAttempts === targetAttempts && awayAttempts === targetAttempts && homeScore !== awayScore) {
                return homeScore > awayScore ? ("home" as const) : ("away" as const);
              }
              continue;
            }

            if (homeAttempts === awayAttempts && homeScore !== awayScore) {
              return homeScore > awayScore ? ("home" as const) : ("away" as const);
            }
          }

          return null;
        })();

      if (!penaltyWinner) return null;
      return {
        winner: penaltyWinner,
        loser: penaltyWinner === "home" ? ("away" as const) : ("home" as const),
      };
    };

    const resolveQualifiedTeam = (label: string, stack: Set<string> = new Set()) => {
      if (resolvedTeamCache.has(label)) {
        return resolvedTeamCache.get(label) ?? label;
      }

      const compactLabel = label.trim();
      const seedMatch = compactLabel.match(/^(\d+)([A-Z])$/i);
      if (seedMatch) {
        const rank = Number(seedMatch[1]);
        const groupLetter = seedMatch[2].toUpperCase();
        const group = groupTables.find(
          (entry) => entry.label.replace(/^Poule\s+/i, "").trim().toUpperCase() === groupLetter,
        );
        if (!group?.isCompleted) return label;
        const team = rank > 0 ? group?.rows[rank - 1]?.team : null;
        const resolved = team ?? label;
        resolvedTeamCache.set(label, resolved);
        return resolved;
      }

      const bestRankMatch = compactLabel.match(/^Meilleur\s+(\d+)(?:er|e)$/i);
      if (bestRankMatch) {
        if (groupTables.some((group) => !group.isCompleted)) return label;
        const rank = Number(bestRankMatch[1]);
        const team = rank > 0 ? bestRankByPosition.get(rank)?.[0]?.team : null;
        const resolved = team ?? label;
        resolvedTeamCache.set(label, resolved);
        return resolved;
      }

      const dependencyMatch = compactLabel.match(/^(Vainqueur|Perdant)\s+([A-Z]+\d+)$/i);
      if (dependencyMatch) {
        const [, dependencyType, dependencyIdRaw] = dependencyMatch;
        const dependencyId = dependencyIdRaw.toUpperCase();
        if (stack.has(dependencyId)) {
          return label;
        }

        const sourceGeneratedMatch = generatedMatchById.get(dependencyId);
        const sourceScheduleMatch = scheduleMatchByGeneratedId.get(dependencyId);
        const sourceState = sourceScheduleMatch ? matchStates[sourceScheduleMatch.id] : null;
        const outcome = getKnockoutOutcome(sourceState);

        if (!sourceGeneratedMatch || !sourceScheduleMatch || !sourceState || !outcome) {
          return label;
        }

        const nextStack = new Set(stack);
        nextStack.add(dependencyId);
        const resolvedHome = resolveQualifiedTeam(sourceGeneratedMatch.homeTeam, nextStack);
        const resolvedAway = resolveQualifiedTeam(sourceGeneratedMatch.awayTeam, nextStack);
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

    const resolveGeneratedMatch = (match: TournamentGeneratedMatch): TournamentGeneratedMatch => ({
      ...match,
      homeTeam: resolveQualifiedTeam(match.homeTeam),
      awayTeam: resolveQualifiedTeam(match.awayTeam),
    });

    return {
      ...selectedTournamentStructure,
      knockout: selectedTournamentStructure.knockout.map(resolveGeneratedMatch),
      classement: selectedTournamentStructure.classement.map(resolveGeneratedMatch),
    };
  }, [selectedTournament, selectedTournamentStructure]);
  const selectedTournamentStructurePreviewByDivision = useMemo(
    () =>
      selectedTournament?.manualPreviewDataByDivision?.map((division) => ({
        id: division.id,
        label: division.name,
        content: <ManualTournamentPreview data={division.data} layout="split" showHeader={false} />,
      })) ?? [],
    [selectedTournament],
  );
  const selectedTournamentStructurePreview = useMemo(() => {
    if (selectedTournament?.mode === "manual") {
      if (selectedTournamentStructurePreviewByDivision.length === 0) {
        return null;
      }

      return (
        <div className="space-y-6">
          {selectedTournamentStructurePreviewByDivision.map((division) => (
            <section key={division.id} className="space-y-3">
              {selectedTournamentStructurePreviewByDivision.length > 1 ? (
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                  {division.label}
                </div>
              ) : null}
              {division.content}
            </section>
          ))}
        </div>
      );
    }

    if (!selectedTournamentResolvedStructure || !selectedTournament || !selectedTournamentVariant) {
      return null;
    }

    return (
      <TournamentTypeOptionPreview
        structure={selectedTournamentResolvedStructure}
        compact={false}
        compactVariant={selectedTournamentVariant}
        compactTeamCount={selectedTournament.teamCount}
        roundRobinMode={selectedTournamentRoundRobinMode}
        fullSize={selectedTournamentVariant === "group_final"}
        fullSizeViewportInset={selectedTournamentVariant === "group_final" ? 12 : 0}
        fullSizeScaleCap={selectedTournamentVariant === "group_final" ? 1.42 : undefined}
        fullSizeVerticalOffset={selectedTournamentVariant === "group_final" ? -18 : 0}
        showPhaseMatchTeams={selectedTournamentVariant === "group_final"}
      />
    );
  }, [
    selectedTournament,
    selectedTournamentRoundRobinMode,
    selectedTournamentResolvedStructure,
    selectedTournamentStructurePreviewByDivision,
    selectedTournamentVariant,
  ]);

  const teamSlotsRemaining = Math.max(0, config.teamCount - config.teams.length);
  const teamCountReached = config.teamCount > 0
    ? config.teams.length >= config.teamCount
    : false;
  const recommendedFormatLabel =
    config.autoFormat === "group_knockout"
      ? `Format recommandé : ${config.groupCount} groupe${config.groupCount > 1 ? "s" : ""} de ${config.teamsPerGroup}`
      : config.autoFormat === "tournament_bracket"
        ? `Format recommandé : tableau final avec ${config.groupCount} groupe${config.groupCount > 1 ? "s" : ""}`
        : "Format recommandé : Mini League";
  const selectedSuggestion = autoSuggestions.find(
    (suggestion) =>
      suggestion.teamCount === config.teamCount &&
      suggestion.format === config.autoFormat &&
      suggestion.matchDuration === config.matchDuration &&
      suggestion.breakMinutes === config.breakMinutes &&
      suggestion.lunchBreakMinutes === config.lunchBreakMinutes &&
      suggestion.groupHomeAway === config.groupHomeAway &&
      (suggestion.format === "mini_league" ||
        (suggestion.groupCount === config.groupCount &&
          suggestion.teamsPerGroup === config.teamsPerGroup)),
  );

  const canCreateTournament =
    config.name.trim().length > 0 &&
    config.date.trim().length > 0 &&
    preview.windowFits &&
    (mode !== "manual"
      ? config.teamCount >= 2 && config.teams.length === config.teamCount
      : config.teams.length >= 2 && config.manualMatches.length > 0);
  const hasGeneralInfoCompleted =
    config.name.trim().length > 0 &&
    config.date.trim().length > 0 &&
    config.categories.length > 0 &&
    config.levels.length > 0 &&
    config.fieldCount >= 1;
  const canContinueStep1 = modeContentOpen;
  const canContinueStep2 =
    mode === "manual"
      ? false
      : hasGeneralInfoCompleted &&
        (mode === "assistant"
          ? assistantKnowsTeamCount !== null &&
            assistantKnowsTimeRange !== null &&
            (assistantKnowsTeamCount ? config.teamCount >= 2 : assistantEstimatedTeamCount >= 2) &&
            (assistantKnowsTimeRange ? assistantTimeRangeConfirmed : true) &&
            assistantDurationConfirmed &&
            assistantBreakConfirmed &&
            assistantLunchBreakConfirmed &&
            assistantFormatConfirmed &&
            autoSuggestions.length > 0
          : autoSuggestionsOpen && autoSuggestions.length > 0);
  const canGenerateTournamentPreview =
    config.teamCount >= 2 && config.teams.length === config.teamCount;
  const showStepSummary = wizardStep === 2 && mode === "auto";

  const renderGeneralInfoFields = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-[18rem_9rem]">
        <label className="space-y-2.5">
          <span className="text-[17px] font-medium text-slate-200">Nom du tournoi</span>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-3 bottom-1 h-6 rounded-full bg-white/20 blur-xl"
            />
            <input
              value={config.name ?? ""}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Tournoi de printemps"
              className={[
                "relative z-10 w-full rounded-2xl border px-3 py-2 text-[14px] text-slate-50 outline-none placeholder:text-slate-500 focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30 md:max-w-[18rem]",
                config.name.trim()
                  ? "border-violet-400/40 bg-violet-500/18"
                  : "border-white/20 bg-black/30",
              ].join(" ")}
            />
          </div>
        </label>

        <label className="space-y-2.5">
          <span className="text-[17px] font-medium text-slate-200">Date</span>
          <div
            className="relative"
            onClick={() => {
              tournamentDateInputRef.current?.focus();
              tournamentDateInputRef.current?.showPicker?.();
            }}
            role="presentation"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-3 bottom-1 h-6 rounded-full bg-white/20 blur-xl"
            />
            {!config.date ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-4 z-20 flex items-center text-[15px] text-slate-500"
              >
                -/-/-
              </span>
            ) : null}
            <input
              ref={tournamentDateInputRef}
              type="date"
              value={config.date ?? ""}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  date: event.target.value,
                }))
              }
              className={[
                "relative z-10 w-full rounded-2xl border px-3 py-2 text-[14px] outline-none focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30 md:max-w-[9rem]",
                config.date
                  ? "border-violet-400/40 bg-violet-500/18 text-slate-50"
                  : "border-white/20 bg-black/30 text-transparent",
              ].join(" ")}
            />
          </div>
        </label>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <p className="min-w-[150px] text-[17px] font-medium text-slate-200">Catégorie</p>
        <div className="flex flex-1 flex-wrap gap-2 md:max-w-[34rem]">
          {TOURNAMENT_CATEGORIES.map((category) => {
            const active = config.categories.includes(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() =>
                  setConfig((current) => ({
                    ...current,
                    categories: current.categories.includes(category)
                      ? current.categories.filter((entry) => entry !== category)
                      : [...current.categories, category],
                  }))
                }
                className={[
                  "inline-flex items-center gap-1.5 rounded-[16px] px-3 py-1.5 text-[13px] font-medium transition",
                  active
                    ? "border border-violet-400/30 bg-violet-500/18 text-slate-50"
                    : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                {category}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <p className="min-w-[150px] text-[17px] font-medium text-slate-200">Niveau</p>
        <div className="flex flex-1 flex-wrap gap-2 md:max-w-[34rem]">
          <button
            type="button"
            onClick={() =>
              setConfig((current) => ({
                ...current,
                levels:
                  current.levels.length === TOURNAMENT_LEVELS.length ? [] : [...TOURNAMENT_LEVELS],
              }))
            }
            className={[
              "inline-flex items-center gap-1.5 rounded-[16px] px-3 py-1.5 text-[13px] font-medium transition",
              config.levels.length === TOURNAMENT_LEVELS.length
                ? "border border-violet-400/30 bg-violet-500/18 text-slate-50"
                : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
            ].join(" ")}
          >
            Tous niveaux
          </button>

          {TOURNAMENT_LEVELS.map((level) => {
            const active = config.levels.includes(level);
            return (
              <button
                key={level}
                type="button"
                onClick={() =>
                  setConfig((current) => {
                    const nextLevels = current.levels.includes(level)
                      ? current.levels.filter((entry) => entry !== level)
                      : [...current.levels, level];

                    return {
                      ...current,
                      levels: TOURNAMENT_LEVELS.filter((entry) => nextLevels.includes(entry)),
                    };
                  })
                }
                className={[
                  "inline-flex items-center gap-1.5 rounded-[16px] px-3 py-1.5 text-[13px] font-medium transition",
                  active
                    ? "border border-violet-400/30 bg-violet-500/18 text-slate-50"
                    : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                {level}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <p className="min-w-[150px] text-[17px] font-medium text-slate-200">Terrains</p>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setConfig((current) => ({
                ...current,
                fieldCount: Math.max(1, current.fieldCount - 1),
              }))
            }
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            -
          </button>
          <div className="flex h-8 min-w-10 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/18 px-2 text-[14px] font-semibold text-slate-50">
            {config.fieldCount ?? 1}
          </div>
          <button
            type="button"
            onClick={() =>
              setConfig((current) => ({
                ...current,
                fieldCount: Math.min(12, current.fieldCount + 1),
              }))
            }
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );

  const addTeam = (team: { name: string; id: string | null; source: "official" | "manual" }) => {
    const normalizedName = team.name.trim().toLowerCase();
    if (!normalizedName) return;

    setConfig((current) => {
      if (current.teamCount > 0 && current.teams.length >= current.teamCount) {
        return current;
      }

      if (current.teams.some((entry) => entry.name.trim().toLowerCase() === normalizedName)) {
        return current;
      }

      return {
        ...current,
        teams: [
          ...current.teams,
          {
            id: buildId(),
            name: team.name.trim(),
            officialId: team.id,
            source: team.source,
          },
        ],
      };
    });
  };

  const removeTeam = (teamIdToRemove: string) => {
    setConfig((current) => ({
      ...current,
      teams: current.teams.filter((team) => team.id !== teamIdToRemove),
      manualMatches: current.manualMatches.filter(
        (match) =>
          match.homeTeamId !== teamIdToRemove && match.awayTeamId !== teamIdToRemove,
      ),
    }));
  };

  const shuffleTeams = () => {
    setConfig((current) => {
      const nextTeams = [...current.teams];
      for (let index = nextTeams.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [nextTeams[index], nextTeams[swapIndex]] = [nextTeams[swapIndex], nextTeams[index]];
      }

      return {
        ...current,
        teams: nextTeams,
      };
    });
  };

  const resetWizard = () => {
    setWizardOpen(false);
    setWizardStep(1);
    setModeContentOpen(false);
    setEditingTournamentId(null);
    setMode("assistant");
    setAssistantWizardSessionKey((current) => current + 1);
    setConfig({ ...DEFAULT_CONFIG });
    setManualTeamName("");
    setAutoSuggestionsOpen(false);
    setAssistantKnowsTeamCount(null);
    setAssistantTeamCountDraft("");
    setAssistantKnowsTimeRange(null);
    setAssistantTimeRangeConfirmed(false);
    setAssistantDurationConfirmed(false);
    setAssistantLunchBreakConfirmed(false);
    setAssistantFormatConfirmed(false);
    setPreviewTab("structure");
  };

  const deleteSavedTournament = (tournamentId: string) => {
    setSavedTournaments((current) => current.filter((entry) => entry.id !== tournamentId));
    setSelectedTournamentId((current) => (current === tournamentId ? null : current));
    void deleteTournamentFromSupabase(tournamentId).catch((error) => {
      console.error("Erreur suppression tournoi Supabase:", error);
    });
  };

  const updateSavedTournament = async (nextTournament: SavedTournament) => {
    console.log("SAVING TOURNAMENT ID", nextTournament.id);

    const tournamentToSave = {
      ...nextTournament,
      teamId,
    };

    const savedTournament = await saveTournamentToSupabase(tournamentToSave);
    const freshTournament =
      (await loadTournamentFromSupabase<SavedTournament>(nextTournament.id)) ??
      savedTournament;

    setSavedTournaments((current) =>
      current.map((entry) => (entry.id === freshTournament.id ? freshTournament : entry)),
    );
  };

  const editSavedTournament = (tournament: SavedTournament) => {
    setSelectedTournamentId(null);
    setEditingTournamentId(tournament.id);
    setWizardOpen(true);
    setWizardStep(4);
    setMode(tournament.mode);
    setPreviewTab("structure");
    setManualTeamName("");
    setAutoSuggestionsOpen(false);
    setAssistantKnowsTeamCount(null);
    setAssistantTeamCountDraft("");
    setAssistantKnowsTimeRange(null);
    setAssistantTimeRangeConfirmed(false);
    setAssistantDurationConfirmed(false);
    setAssistantBreakConfirmed(false);
    setAssistantLunchBreakConfirmed(false);
    setAssistantFormatConfirmed(false);
    setConfig({
      ...DEFAULT_CONFIG,
      name: tournament.name,
      date: tournament.date,
      categories: tournament.categories,
      levels: tournament.levels,
      teamCount: tournament.teamCount,
      autoFormat: tournament.autoFormat,
      groupCount: tournament.groupCount,
      teamsPerGroup: tournament.teamsPerGroup,
      startTime: tournament.startTime ?? DEFAULT_CONFIG.startTime,
      endTime: tournament.endTime ?? DEFAULT_CONFIG.endTime,
      fieldCount: tournament.fieldCount,
      matchDuration: tournament.matchDuration,
      breakMinutes: tournament.breakMinutes,
      lunchBreakMinutes: tournament.lunchBreakMinutes,
      groupHomeAway: tournament.groupHomeAway,
      qualificationRule: tournament.qualificationRule ?? DEFAULT_CONFIG.qualificationRule,
      finalPhase: tournament.finalPhase ?? DEFAULT_CONFIG.finalPhase,
      placementMatches: tournament.placementMatches ?? DEFAULT_CONFIG.placementMatches,
      teams: tournament.teams,
      manualMatches: tournament.manualMatches ?? [],
    });
  };

  useEffect(() => {
    wizardContentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [wizardStep]);

  const saveTournament = async () => {
    if (!canCreateTournament) return;
    const existingTournament = editingTournamentId
      ? savedTournaments.find((entry) => entry.id === editingTournamentId) ?? null
      : null;
    const preservedFriendlyMatches =
      existingTournament?.schedule.filter((match) => match.stage === "friendly") ?? [];

    const nextTournament: SavedTournament = {
      id: editingTournamentId ?? buildId(),
      name: config.name.trim(),
      date: config.date,
      categories: config.categories,
      levels: config.levels,
      mode,
      teamCount: config.teamCount,
      autoFormat: config.autoFormat,
      groupCount: config.groupCount,
      teamsPerGroup: config.teamsPerGroup,
      startTime: config.startTime,
      endTime: config.endTime,
      teams: config.teams,
      mealItems: existingTournament?.mealItems ?? [],
      shareSettings: existingTournament?.shareSettings ?? {
        tournamentPublished: false,
        coachAccessEnabled: false,
        parentAccessEnabled: false,
        coachToken: buildId(),
        parentToken: buildId(),
        votesEnabled: false,
        coachTeamSubmissions: {},
        coachMealSubmissions: {},
      },
      fieldCount: config.fieldCount,
      matchDuration: config.matchDuration,
      penaltyShooters: config.penaltyShooters,
      breakMinutes: config.breakMinutes,
      lunchBreakMinutes: config.lunchBreakMinutes,
      groupHomeAway: config.groupHomeAway,
      qualificationRule: config.qualificationRule,
      finalPhase: config.finalPhase,
      placementMatches: config.placementMatches,
      manualMatches: config.manualMatches,
      windowFits: preview.windowFits,
      createdAt: existingTournament?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: existingTournament?.status ?? "draft",
      location: existingTournament?.location ?? "",
      publishedAt: existingTournament?.publishedAt ?? null,
      liveMatchId: existingTournament?.liveMatchId ?? null,
      matchStates: existingTournament?.matchStates ?? {},
      schedule: [...preview.schedule, ...preservedFriendlyMatches],
    };

    setSavedTournaments((current) => {
      if (!editingTournamentId) {
        return [nextTournament, ...current];
      }

      return current.map((entry) =>
        entry.id === editingTournamentId ? nextTournament : entry,
      );
    });

    try {
      await saveTournamentToSupabase({
        ...nextTournament,
        teamId,
      });
    } catch (error) {
      console.error("Erreur sauvegarde tournoi Supabase:", error);
    }

    resetWizard();
  };

  return (
    <div className="space-y-6">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex flex-wrap items-center gap-3">
          {[
            { key: "create" as const, label: "Créer un tournoi" },
            { key: "search" as const, label: "Chercher un tournoi" },
            { key: "chat" as const, label: "Chat tournoi" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={[
                "rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition",
                activeTab === tab.key
                  ? "border border-white/10 bg-white/10 text-slate-100"
                  : "border border-white/10 bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "create" ? (
        <div className="mx-auto w-full max-w-5xl space-y-5">
          <div className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.18),transparent_55%),rgba(6,10,20,0.95)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Tournois
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Crée ton tournoi
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-300">
                  Génère automatiquement les plages de match selon tes terrains,
                  tes horaires et tes pauses, ou prépare ton tournoi manuellement.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setConfig((current) => ({
                    ...current,
                    lunchBreakMinutes: assistantLunchBreakConfirmed
                      ? current.lunchBreakMinutes
                      : 60,
                  }));
                  setMode("assistant");
                  setModeContentOpen(false);
                  setWizardOpen(true);
                }}
                className="inline-flex items-center rounded-full border border-fuchsia-300/30 bg-violet-600 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-[0_0_24px_rgba(124,58,237,0.45)] transition hover:bg-violet-500"
              >
                Créer ton tournoi
              </button>
            </div>
          </div>

          {tournamentsLoading && savedTournaments.length === 0 ? (
            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6 text-sm text-slate-400">
              Chargement des tournois...
            </div>
          ) : savedTournaments.length === 0 ? (
            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6 text-sm text-slate-400">
              Aucun tournoi enregistré pour l’instant.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {savedTournaments.map((tournament) => (
                <TournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  onView={() => setSelectedTournamentId(tournament.id)}
                  onManage={() => {
                    if (tournament.mode === "manual") {
                      router.push(
                        `/tournament/manual-builder?teamId=${encodeURIComponent(
                          teamId,
                        )}&returnTo=${encodeURIComponent(`/app/teams/${teamId}/matches?tab=tournament`)}&manageTournamentId=${encodeURIComponent(tournament.id)}`,
                      );
                      return;
                    }

                    editSavedTournament(tournament);
                  }}
                  onManageTeams={() => {
                    if (tournament.mode === "manual") {
                      router.push(
                        `/tournament/manual-builder?teamId=${encodeURIComponent(
                          teamId,
                        )}&returnTo=${encodeURIComponent(
                          `/app/teams/${teamId}/matches?tab=tournament`,
                        )}&manageTournamentId=${encodeURIComponent(
                          tournament.id,
                        )}&controlTab=teams&teamsSubTab=teams`,
                      );
                      return;
                    }

                    editSavedTournament(tournament);
                  }}
                  onDelete={() => {
                    if (window.confirm(`Supprimer ${tournament.name} ?`)) {
                      deleteSavedTournament(tournament.id);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : activeTab === "search" ? (
        <div className="mx-auto w-full max-w-4xl rounded-[28px] border border-white/10 bg-black/20 p-6 text-sm text-slate-400">
          Connexion de la recherche tournoi plus tard.
        </div>
      ) : (
        <div className="mx-auto w-full max-w-4xl rounded-[28px] border border-white/10 bg-black/20 p-6 text-sm text-slate-400">
          Chat tournoi à connecter plus tard.
        </div>
      )}

      {wizardOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[2px]"
          onClick={resetWizard}
          role="presentation"
        >
          <div
            className={[
              "relative flex w-full flex-col overflow-hidden rounded-3xl border border-white/12 bg-black/30 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-[32px] backdrop-saturate-200",
              wizardStep === 4
                ? "h-[96vh] max-h-[96vh] max-w-[98vw] p-4 md:p-5 lg:p-6"
                : "max-h-[92vh] max-w-5xl p-4 md:p-5",
            ].join(" ")}
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <button
              type="button"
              onClick={resetWizard}
              className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition hover:text-white"
              aria-label="Fermer"
            >
              ×
            </button>

            <div>
              <h2 className="text-lg font-semibold text-slate-50 md:text-xl">
                Créer un tournoi
              </h2>
              <span className="mt-2 block h-px w-16 bg-violet-400/70" />
            </div>

            <div className={wizardStep === 2 ? "mt-3 flex items-center gap-2" : "mt-5 flex items-center gap-2"}>
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={[
                    "h-2 flex-1 rounded-full transition",
                    wizardStep >= step ? "bg-violet-500" : "bg-white/10",
                  ].join(" ")}
                />
              ))}
            </div>

            <div
              className={[
                wizardStep === 2
                  ? "mt-2 text-center text-[16px] font-semibold tracking-[-0.02em]"
                  : "mt-3 text-center text-[18px] font-semibold tracking-[-0.02em]",
                wizardStep === 1 ? "text-white" : "text-slate-400",
              ].join(" ")}
            >
              {wizardStep === 1
                ? "Étape 1 • Mode"
                : wizardStep === 2
                  ? "Étape 2 • Infos et génération"
                  : wizardStep === 3
                    ? "Étape 3 • Équipes"
                    : "Étape 4 • Preview tournoi"}
            </div>

            <div
              ref={wizardContentRef}
              className={[
                wizardStep === 2
                  ? "mt-4 min-h-0 flex-1 overflow-x-hidden"
                  : "mt-6 min-h-0 flex-1 overflow-x-hidden",
                wizardStep === 2 ? "overflow-y-hidden pr-0" : "overflow-y-auto pr-1",
              ].join(" ")}
            >
              <div
                className={[
                  "grid min-w-0 gap-6",
                  wizardStep === 4
                    ? "xl:grid-cols-1"
                    : showStepSummary || wizardStep === 3
                    ? "xl:grid-cols-[1.1fr_0.9fr]"
                    : "xl:grid-cols-1",
                ].join(" ")}
              >
              <div className="min-w-0 space-y-5">
                {wizardStep === 1 ? (
                  <>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                        Mode
                      </p>
                      <div className="mt-3">
                        <TournamentCreationMode
                          mode={mode}
                          showModeContent={false}
                          onOpenManualBuilder={() => {
                            resetWizard();
                            router.push(
                              `/tournament/manual-builder?teamId=${encodeURIComponent(
                                teamId,
                              )}&returnTo=${encodeURIComponent(`/app/teams/${teamId}/matches?tab=tournament`)}`,
                            );
                          }}
                          onModeChange={(nextMode) => {
                            setMode(nextMode);
                            setModeContentOpen(true);
                            if (nextMode === "auto") {
                              setAutoSuggestionsOpen(false);
                            }
                          }}
                          config={config}
                          onConfigChange={setConfig}
                          onAssistantBack={() => {}}
                          autoSuggestions={autoSuggestions}
                          autoSuggestionsOpen={autoSuggestionsOpen}
                          onGenerate={() => setAutoSuggestionsOpen(true)}
                          recommendedFormatLabel={recommendedFormatLabel}
                          assistantKnowsTeamCount={assistantKnowsTeamCount}
                          onAssistantKnowsTeamCountChange={setAssistantKnowsTeamCount}
                          assistantTeamCountDraft={assistantTeamCountDraft}
                          onAssistantTeamCountDraftChange={setAssistantTeamCountDraft}
                          assistantKnowsTimeRange={assistantKnowsTimeRange}
                          onAssistantKnowsTimeRangeChange={setAssistantKnowsTimeRange}
                          assistantTimeRangeConfirmed={assistantTimeRangeConfirmed}
                          onAssistantTimeRangeConfirm={() => setAssistantTimeRangeConfirmed(true)}
                          assistantDurationConfirmed={assistantDurationConfirmed}
                          onAssistantDurationConfirm={() => setAssistantDurationConfirmed(true)}
                          assistantBreakConfirmed={assistantBreakConfirmed}
                          onAssistantBreakConfirm={() => setAssistantBreakConfirmed(true)}
                          assistantLunchBreakConfirmed={assistantLunchBreakConfirmed}
                          onAssistantLunchBreakConfirm={() => setAssistantLunchBreakConfirmed(true)}
                          assistantFormatConfirmed={assistantFormatConfirmed}
                          onAssistantFormatConfirm={() => {
                            setAssistantFormatConfirmed(true);
                            setWizardStep(3);
                          }}
                          assistantEstimatedTeamCount={assistantEstimatedTeamCount}
                          assistantWizardSessionKey={assistantWizardSessionKey}
                        />
                      </div>
                    </div>
                  </>
                ) : null}

                {wizardStep === 2 ? (
                  <div className="space-y-6">
                    {mode === "manual" ? null : renderGeneralInfoFields()}
                    <TournamentCreationMode
                      mode={mode}
                      showModeContent={modeContentOpen}
                      showModeCards={false}
                      onOpenManualBuilder={() => {
                        resetWizard();
                        router.push(
                          `/tournament/manual-builder?teamId=${encodeURIComponent(
                            teamId,
                          )}&returnTo=${encodeURIComponent(`/app/teams/${teamId}/matches?tab=tournament`)}`,
                        );
                      }}
                      onModeChange={(nextMode) => {
                        setMode(nextMode);
                        setModeContentOpen(true);
                        if (nextMode === "auto") {
                          setAutoSuggestionsOpen(false);
                        }
                      }}
                      config={config}
                      onConfigChange={setConfig}
                      onAssistantBack={() => {
                        if (assistantFormatConfirmed) {
                          setAssistantFormatConfirmed(false);
                          return;
                        }
                        if (assistantLunchBreakConfirmed) {
                          setAssistantLunchBreakConfirmed(false);
                          return;
                        }
                        if (assistantBreakConfirmed) {
                          setAssistantBreakConfirmed(false);
                          return;
                        }
                        if (assistantDurationConfirmed) {
                          setAssistantDurationConfirmed(false);
                          return;
                        }
                        if (assistantTimeRangeConfirmed) {
                          setAssistantTimeRangeConfirmed(false);
                          return;
                        }
                        if (assistantKnowsTimeRange !== null) {
                          setAssistantKnowsTimeRange(null);
                          setAssistantTimeRangeConfirmed(false);
                          return;
                        }
                        if (assistantKnowsTeamCount !== null) {
                          setAssistantKnowsTeamCount(null);
                          setAssistantTeamCountDraft(
                            config.teamCount > 0 ? String(config.teamCount) : "",
                          );
                        }
                      }}
                      autoSuggestions={autoSuggestions}
                      autoSuggestionsOpen={autoSuggestionsOpen}
                      onGenerate={() => setAutoSuggestionsOpen(true)}
                      recommendedFormatLabel={recommendedFormatLabel}
                      assistantKnowsTeamCount={assistantKnowsTeamCount}
                      onAssistantKnowsTeamCountChange={(value) => {
                        setAssistantKnowsTeamCount(value);
                        setAssistantTeamCountDraft(value && config.teamCount > 0 ? String(config.teamCount) : "");
                        setAssistantKnowsTimeRange(null);
                        setAssistantTimeRangeConfirmed(false);
                        setAssistantDurationConfirmed(false);
                        setAssistantBreakConfirmed(false);
                        setAssistantLunchBreakConfirmed(false);
                        setAssistantFormatConfirmed(false);
                      }}
                      assistantTeamCountDraft={assistantTeamCountDraft}
                      onAssistantTeamCountDraftChange={setAssistantTeamCountDraft}
                      assistantKnowsTimeRange={assistantKnowsTimeRange}
                      onAssistantKnowsTimeRangeChange={(value) => {
                        setAssistantKnowsTimeRange(value);
                        setAssistantTimeRangeConfirmed(false);
                        setAssistantDurationConfirmed(false);
                        setAssistantBreakConfirmed(false);
                        setAssistantLunchBreakConfirmed(false);
                        setAssistantFormatConfirmed(false);
                      }}
                      assistantTimeRangeConfirmed={assistantTimeRangeConfirmed}
                      onAssistantTimeRangeConfirm={() => setAssistantTimeRangeConfirmed(true)}
                      assistantDurationConfirmed={assistantDurationConfirmed}
                      onAssistantDurationConfirm={() => setAssistantDurationConfirmed(true)}
                      assistantBreakConfirmed={assistantBreakConfirmed}
                      onAssistantBreakConfirm={() => setAssistantBreakConfirmed(true)}
                      assistantLunchBreakConfirmed={assistantLunchBreakConfirmed}
                      onAssistantLunchBreakConfirm={() => setAssistantLunchBreakConfirmed(true)}
                      assistantFormatConfirmed={assistantFormatConfirmed}
                      onAssistantFormatConfirm={() => {
                        setAssistantFormatConfirmed(true);
                        setWizardStep(3);
                      }}
                      assistantEstimatedTeamCount={assistantEstimatedTeamCount}
                      assistantWizardSessionKey={assistantWizardSessionKey}
                    />
                  </div>
                ) : null}

                {wizardStep === 3 ? (
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                      Tournoi
                    </p>

                    <div className="mt-3 rounded-[22px] border border-white/10 bg-black/20 p-4">
                      <p className="text-lg font-semibold text-white">
                        Tournoi &quot;{config.name.trim() || "Nouveau tournoi"}&quot;
                      </p>
                      <p className="mt-2 text-sm text-slate-300">
                        Catégorie{config.categories.length > 1 ? "s" : ""} :{" "}
                        {config.categories.length > 0
                          ? config.categories.join(", ")
                          : "à définir"}
                      </p>
                      <p className="mt-2 text-sm text-slate-400">
                        {config.teamCount || 0} équipe{config.teamCount > 1 ? "s" : ""}
                      </p>

                      {mode === "auto" ? (
                        <div className="mt-3">
                          <span
                            className={[
                              "inline-flex rounded-full px-3 py-1 text-[11px] font-semibold",
                              teamSlotsRemaining === 0
                                ? "border border-emerald-300/30 bg-emerald-500/15 text-emerald-100"
                                : "border border-amber-300/30 bg-amber-500/15 text-amber-100",
                            ].join(" ")}
                          >
                            {teamSlotsRemaining === 0
                              ? "Liste complète"
                              : `${teamSlotsRemaining} place${teamSlotsRemaining > 1 ? "s" : ""} restante${teamSlotsRemaining > 1 ? "s" : ""}`}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="text-sm font-semibold text-white">
                        Choisis tes équipes
                      </div>

                      <div
                        className={[
                          "rounded-[22px] border border-white/10 bg-black/20 p-3 transition",
                          teamCountReached ? "cursor-not-allowed opacity-70" : "",
                        ].join(" ")}
                      >
                        <TeamSearchDropdown
                          disabled={config.teamCount === 0 || teamCountReached}
                          placeholder="Rechercher un club (nom, ville…)"
                          onSelect={(selection) =>
                            addTeam({
                              ...selection,
                              source: "official",
                            })
                          }
                        />

                        <div className="mt-3 flex items-center gap-2">
                          <input
                            value={manualTeamName}
                            onChange={(event) => setManualTeamName(event.target.value)}
                            placeholder="Ajouter une équipe externe"
                            disabled={teamCountReached}
                            className="flex-1 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400/40 focus:ring-2 focus:ring-violet-400/30 disabled:cursor-not-allowed disabled:opacity-70"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!manualTeamName.trim()) return;
                              addTeam({
                                id: null,
                                name: manualTeamName.trim(),
                                source: "manual",
                              });
                              setManualTeamName("");
                            }}
                            disabled={teamCountReached}
                            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70 disabled:text-slate-500"
                          >
                            + Ajouter
                          </button>
                        </div>

                        {teamCountReached ? (
                          <p className="mt-3 text-xs font-medium text-amber-200">
                            Tournoi complet ({config.teams.length}/{config.teamCount} équipes)
                          </p>
                        ) : null}
                      </div>

                    </div>

                    <p className="mt-4 text-xs text-slate-500">
                      La liste des rencontres viendra juste après cette étape.
                    </p>
                  </div>
                ) : null}

                {wizardStep === 4 ? (
                  <div
                    className="fixed inset-0 z-[120] overflow-hidden bg-black/78"
                    onClick={() => setWizardStep(3)}
                    role="presentation"
                  >
                    <button
                      type="button"
                      onClick={() => setWizardStep(3)}
                      className="fixed right-2 top-2 z-[130] flex h-12 w-12 items-center justify-center rounded-full border border-violet-200/25 bg-black/70 text-white shadow-[0_0_30px_rgba(124,58,237,0.28)] backdrop-blur-md transition hover:bg-black/85 hover:text-violet-100 md:right-3 md:top-3"
                      aria-label="Fermer l'aperçu du tournoi"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
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
                    <div className="flex h-screen w-screen items-stretch justify-stretch">
                      <div
                        className="relative flex h-screen w-screen max-h-screen max-w-none flex-col overflow-hidden rounded-none border-0 bg-[#0f1016] shadow-none"
                        onClick={(event) => event.stopPropagation()}
                        role="presentation"
                      >
                        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-2.5 md:px-6 xl:px-8">
                          <div className="flex flex-wrap items-center gap-3 md:gap-4">
                            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                              Preview tournoi
                            </p>
                            <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-100 md:ml-4">
                              {config.name.trim() || "Nouveau tournoi"}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-300">
                              {config.teamCount} equipe{config.teamCount > 1 ? "s" : ""}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-300">
                              {config.fieldCount} terrain{config.fieldCount > 1 ? "s" : ""}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-2 pr-12">
                            <span
                              className={[
                                "rounded-full px-3 py-1 text-[11px] font-semibold",
                                preview.windowFits
                                  ? "border border-emerald-300/30 bg-emerald-500/15 text-emerald-100"
                                  : "border border-amber-300/30 bg-amber-500/15 text-amber-100",
                              ].join(" ")}
                            >
                              {preview.windowFits ? "Preview prête" : "Planning serré"}
                            </span>
                          </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2 pb-28 md:px-5 md:py-2 md:pb-32 xl:px-6">
                          <div className="flex flex-wrap justify-center gap-2">
                            {[
                              { key: "structure" as const, label: "Poule" },
                              { key: "planning" as const, label: "Match" },
                            ].map((tab) => (
                              <button
                                key={tab.key}
                                type="button"
                                onClick={() => setPreviewTab(tab.key)}
                                className={[
                                  "rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
                                  previewTab === tab.key
                                    ? "border-violet-300/30 bg-violet-600 text-white shadow-[0_0_18px_rgba(124,58,237,0.28)]"
                                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
                                ].join(" ")}
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>

                          {previewTab === "structure" ? (
                            tournamentPreviewStructure ? (
                              <div className="mt-4 pb-4">
                                <div
                                  className={`rounded-[24px] border border-white/10 bg-[#0f1016] ${
                                    previewFormatVariant === "double_bracket" ||
                                    previewFormatVariant === "group_final"
                                      ? "overflow-hidden"
                                      : "overflow-y-auto"
                                  }`}
                                  style={{
                                    minHeight:
                                      previewFormatVariant === "double_bracket" ||
                                      previewFormatVariant === "group_final"
                                        ? "68vh"
                                        : "52vh",
                                    height:
                                      previewFormatVariant === "double_bracket" ||
                                      previewFormatVariant === "group_final"
                                        ? "68vh"
                                        : undefined,
                                  }}
                                >
                                  <div
                                    className={`h-full min-h-0 px-4 py-2 md:px-5 md:py-2 xl:px-6 ${
                                      previewFormatVariant === "double_bracket" ||
                                      previewFormatVariant === "group_final"
                                        ? "overflow-hidden"
                                        : "overflow-y-auto"
                                    }`}
                                  >
                                    <TournamentTypeOptionPreview
                                      structure={tournamentPreviewStructure}
                                      compact={false}
                                      compactVariant={previewFormatVariant}
                                      compactTeamCount={config.teamCount}
                                      roundRobinMode={previewRoundRobinMode}
                                      fullSize={previewFormatVariant === "group_final"}
                                      fullSizeViewportInset={
                                        previewFormatVariant === "group_final" ? 12 : 0
                                      }
                                      fullSizeScaleCap={
                                        previewFormatVariant === "group_final" ? 1.42 : undefined
                                      }
                                      fullSizeVerticalOffset={
                                        previewFormatVariant === "group_final" ? -18 : 0
                                      }
                                      showPhaseMatchTeams={previewFormatVariant === "group_final"}
                                    />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-4 flex h-full min-h-[360px] items-center justify-center rounded-[20px] border border-white/10 bg-black/20 text-sm text-slate-400">
                                La structure sera disponible après génération automatique
                              </div>
                            )
                          ) : (
                            <div className="mt-4 space-y-4 pb-4">
                              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                    {config.fieldCount} terrain{config.fieldCount > 1 ? "s" : ""}
                                  </span>
                                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                    {config.matchDuration} min
                                  </span>
                                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                    pause {config.breakMinutes} min
                                  </span>
                                  {config.lunchBreakMinutes > 0 ? (
                                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                      pause repas {config.lunchBreakMinutes} min
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="rounded-[22px] border border-white/10 bg-black/25 px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => setPreviewGroupMatchesOpen((current) => !current)}
                                  className="flex w-full items-center justify-between gap-3 text-left"
                                >
                                  <div>
                                    <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-white">
                                      Phase de poule ({previewGroupMatchCount} match{previewGroupMatchCount > 1 ? "s" : ""})
                                    </p>
                                  </div>
                                  <span
                                    className={[
                                      "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition",
                                      previewGroupMatchesOpen ? "rotate-180" : "",
                                    ].join(" ")}
                                    aria-hidden="true"
                                  >
                                    <svg
                                      viewBox="0 0 24 24"
                                      className="h-4 w-4"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="m6 9 6 6 6-6" />
                                    </svg>
                                  </span>
                                </button>

                                <div
                                  className={[
                                    "grid transition-all duration-300 ease-in-out",
                                    previewGroupMatchesOpen
                                      ? "mt-3 grid-rows-[1fr] opacity-100"
                                      : "mt-0 grid-rows-[0fr] opacity-0",
                                  ].join(" ")}
                                >
                                  <div className="overflow-hidden">
                                    {previewHasReturnLegs ? (
                                      <div className="mb-5 flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setPreviewShowAller((current) => !current)}
                                          className={[
                                            "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition",
                                            previewShowAller
                                              ? "border border-sky-300/30 bg-sky-500/15 text-sky-100"
                                              : "border border-white/10 bg-white/5 text-slate-400",
                                          ].join(" ")}
                                        >
                                          Afficher aller
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setPreviewShowRetour((current) => !current)}
                                          className={[
                                            "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition",
                                            previewShowRetour
                                              ? "border border-amber-300/30 bg-amber-500/15 text-amber-100"
                                              : "border border-white/10 bg-white/5 text-slate-400",
                                          ].join(" ")}
                                        >
                                          Afficher retour
                                        </button>
                                      </div>
                                    ) : null}

                                    <div className="space-y-8">
                                      {previewGroupLegSections.map((section) => (
                                        <div key={section.key} className="space-y-4">
                                          {section.title ? (
                                            <div className="flex items-center gap-3">
                                              <p
                                                className={[
                                                  "text-[12px] font-semibold uppercase tracking-[0.22em]",
                                                  section.tone === "blue"
                                                    ? "text-sky-200"
                                                    : section.tone === "yellow"
                                                      ? "text-amber-100"
                                                      : "text-slate-300",
                                                ].join(" ")}
                                              >
                                                {section.title}
                                              </p>
                                              <div className="h-px flex-1 bg-white/10" />
                                              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
                                                {section.matchCount} match{section.matchCount > 1 ? "s" : ""}
                                              </span>
                                            </div>
                                          ) : null}

                                          <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                                            <div className="space-y-4">
                                              {section.rows.flatMap((row) =>
                                                row.fields
                                                  .map((field) => field.match)
                                                  .filter(
                                                    (match): match is TournamentScheduleMatch =>
                                                      Boolean(match) && !isPauseScheduleMatch(match),
                                                  ),
                                              ).map((match, matchIndex) => (
                                                <div
                                                  key={`${section.key}-${match.id}`}
                                                  className={[
                                                    "flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-white/[0.03] px-3 py-2.5",
                                                    matchIndex > 0 ? "border-t border-white/8" : "",
                                                  ].join(" ")}
                                                >
                                                  <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                                                      <span className="uppercase tracking-[0.18em] text-slate-500">
                                                        {match.fieldLabel}
                                                      </span>
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
                                                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300">
                                                        Poule
                                                      </span>
                                                      <span>{stripLegSuffix(match.roundLabel)}</span>
                                                    </div>
                                                    <p className="mt-1.5 text-sm font-semibold text-slate-100">
                                                      {`${match.homeTeam} vs ${match.awayTeam}`}
                                                    </p>
                                                  </div>
                                                  <span className="shrink-0 text-xs text-slate-400">
                                                    {match.startTime}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-[22px] border border-white/10 bg-black/25 px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => setPreviewFinalMatchesOpen((current) => !current)}
                                  className="flex w-full items-center justify-between gap-3 text-left"
                                >
                                  <div>
                                    <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-white">
                                      Phase finale ({previewFinalMatchCount} match{previewFinalMatchCount > 1 ? "s" : ""})
                                    </p>
                                  </div>
                                  <span
                                    className={[
                                      "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition",
                                      previewFinalMatchesOpen ? "rotate-180" : "",
                                    ].join(" ")}
                                    aria-hidden="true"
                                  >
                                    <svg
                                      viewBox="0 0 24 24"
                                      className="h-4 w-4"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="m6 9 6 6 6-6" />
                                    </svg>
                                  </span>
                                </button>

                                <div
                                  className={[
                                    "grid transition-all duration-300 ease-in-out",
                                    previewFinalMatchesOpen
                                      ? "mt-3 grid-rows-[1fr] opacity-100"
                                      : "mt-0 grid-rows-[0fr] opacity-0",
                                  ].join(" ")}
                                >
                                  <div className="overflow-hidden">
                                    <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                                      <div className="space-y-4">
                                        {previewFinalScheduleRows.flatMap((row) =>
                                          row.fields
                                            .map((field) => field.match)
                                            .filter(
                                              (match): match is TournamentScheduleMatch =>
                                                Boolean(match) && !isPauseScheduleMatch(match),
                                            ),
                                        ).map((match, matchIndex) => {
                                          const isClassement = isPlacementRoundLabel(match.roundLabel);
                                          const competitionPath = getCompetitionPathLabel(match);

                                          return (
                                            <div
                                              key={`final-${match.id}`}
                                              className={[
                                                "flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-white/[0.03] px-3 py-2.5",
                                                matchIndex > 0 ? "border-t border-white/8" : "",
                                              ].join(" ")}
                                            >
                                              <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                                                  <span className="uppercase tracking-[0.18em] text-slate-500">
                                                    {match.fieldLabel}
                                                  </span>
                                                  <span
                                                    className={[
                                                      "rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                                                      isThirdPlaceRoundLabel(match.roundLabel)
                                                        ? "border border-violet-300/30 bg-violet-500/15 text-violet-100"
                                                        : isClassement
                                                          ? "border border-amber-300/30 bg-amber-500/15 text-amber-100"
                                                          : "border border-white/10 bg-white/5 text-slate-300",
                                                    ].join(" ")}
                                                  >
                                                    {isThirdPlaceRoundLabel(match.roundLabel)
                                                      ? "3e place"
                                                      : isClassement
                                                        ? "Classement"
                                                        : "Phase finale"}
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
                                                  <span>{match.roundLabel}</span>
                                                </div>
                                                <p className="mt-1.5 text-sm font-semibold text-slate-100">
                                                  {match.homeTeam} vs {match.awayTeam}
                                                </p>
                                              </div>
                                              <span className="shrink-0 text-xs text-slate-400">
                                                {match.startTime}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="fixed inset-x-0 bottom-0 z-[125] border-t border-white/10 bg-[#0f1016]/96 px-5 py-2 backdrop-blur-md md:px-6 xl:px-8">
                          <div className="mx-auto flex w-full max-w-[1600px] flex-wrap justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => setWizardStep(3)}
                              className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:bg-white/10 hover:text-white"
                            >
                              Retour
                            </button>
                            <button
                              type="button"
                              onClick={shuffleTeams}
                              disabled={config.teams.length < 2}
                              className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              🔄 Refaire le tirage
                            </button>
                            <button
                              type="button"
                              onClick={saveTournament}
                              disabled={!canCreateTournament}
                              className={[
                                "rounded-full px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition",
                                canCreateTournament
                                  ? "border border-fuchsia-300/30 bg-violet-600 text-white shadow-[0_0_24px_rgba(124,58,237,0.45)] hover:bg-violet-500"
                                  : "cursor-not-allowed border border-white/10 bg-white/5 text-slate-500",
                              ].join(" ")}
                            >
                              Valider le tournoi
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {wizardStep === 3 ? (
                <div className="mt-6 space-y-5 xl:mt-0">
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                        Équipes du tournoi
                      </p>
                      <span className="rounded-full border border-amber-300/30 bg-amber-500/15 px-3 py-1 text-[11px] font-semibold text-amber-100">
                        {config.teams.length}
                        {config.teamCount > 0 ? ` / ${config.teamCount} équipes` : " équipe"}
                      </span>
                    </div>

                    {config.teams.length > 0 ? (
                      <div className="mt-4 grid gap-2">
                        {config.teams.map((team, index) => (
                          <div
                            key={team.id}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-100">
                                {team.name}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="text-[11px] text-slate-500">
                                  Équipe {index + 1}
                                </span>
                                <span
                                  className={[
                                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                    team.source === "official"
                                      ? "border border-violet-300/30 bg-violet-500/15 text-violet-100"
                                      : "border border-sky-300/25 bg-sky-500/10 text-sky-100",
                                  ].join(" ")}
                                >
                                  {team.source === "official" ? "Officielle" : "Externe"}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeTeam(team.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition hover:border-rose-300/30 hover:bg-rose-500/10 hover:text-rose-200"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-slate-500">
                        Aucune équipe ajoutée pour le moment.
                      </p>
                    )}
                  </div>
                </div>
              ) : showStepSummary ? (
                <div className="mt-6 space-y-5 xl:mt-0">
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                          {wizardStep === 2 ? "Solution sélectionnée" : "Résumé tournoi"}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-white">
                          {config.name.trim() || "Nouveau tournoi"}
                        </h3>
                      </div>
                      <span
                        className={[
                          "rounded-full px-3 py-1 text-[11px] font-semibold",
                          preview.windowFits
                            ? "border border-emerald-300/30 bg-emerald-500/15 text-emerald-100"
                            : "border border-amber-300/30 bg-amber-500/15 text-amber-100",
                        ].join(" ")}
                      >
                        {preview.windowFits ? "Configuration OK" : "Impossible"}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          Format
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-100">
                          {mode === "manual" ? "Manuel" : getAutoFormatLabel(config.autoFormat)}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {mode !== "manual"
                            ? selectedSuggestion?.detail ?? recommendedFormatLabel
                            : "Les rencontres seront définies manuellement."}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          Infos terrain
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-100">
                          {config.fieldCount} terrain{config.fieldCount > 1 ? "s" : ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {[
                            `${config.startTime} - ${config.endTime}`,
                            config.matchDuration > 0 ? `${config.matchDuration} min` : null,
                            assistantBreakConfirmed ? `pause ${config.breakMinutes} min` : null,
                          ]
                            .filter(Boolean)
                            .join(" • ")}
                        </p>
                        {assistantLunchBreakConfirmed && config.lunchBreakMinutes > 0 ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Pause repas {config.lunchBreakMinutes} min
                          </p>
                        ) : null}
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          Équipes
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-100">
                          {config.teamCount || 0} équipe{config.teamCount > 1 ? "s" : ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {config.categories.length
                            ? config.categories.join(" / ")
                            : "Catégorie à définir"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatLevelsLabel(config.levels)}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          Capacité
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-100">
                          {preview.requiredMatches} matchs requis
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {preview.capacity.matchesPossible} matchs possibles sur la plage
                        </p>
                      </div>
                    </div>

                    {!preview.windowFits ? (
                      <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
                        ⚠ tournoi impossible avec ces paramètres
                      </div>
                    ) : null}

                    {wizardStep === 2 && autoSuggestionsOpen && mode === "auto" ? (
                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-slate-400">
                        Choisis une carte de solution, puis ajuste les paramètres si besoin. Le détail des rencontres viendra plus tard.
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            </div>

            <div
              className={[
                "flex flex-wrap justify-end border-t border-white/10",
                wizardStep === 2 ? "mt-1 gap-2 pt-1.5" : "mt-4 gap-3 pt-4",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={
                  wizardStep === 1
                    ? resetWizard
                    : () => setWizardStep((wizardStep - 1) as 1 | 2 | 3 | 4)
                }
                className={[
                  "rounded-full border border-white/10 bg-white/5 font-semibold uppercase text-slate-300 transition hover:bg-white/10 hover:text-white",
                  wizardStep === 2
                    ? "px-3.5 py-1 text-[9px] tracking-[0.12em]"
                    : "px-5 py-2 text-[11px] tracking-[0.16em]",
                ].join(" ")}
              >
                {wizardStep === 1 ? "Annuler" : "Retour"}
              </button>

              {wizardStep === 1 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  disabled={!canContinueStep1}
                  className={[
                    "rounded-full font-semibold uppercase transition",
                    wizardStep === 2
                      ? "px-3.5 py-1 text-[9px] tracking-[0.12em]"
                      : "px-5 py-2 text-[11px] tracking-[0.16em]",
                    canContinueStep1
                      ? "border border-fuchsia-300/30 bg-violet-600 text-white shadow-[0_0_24px_rgba(124,58,237,0.45)] hover:bg-violet-500"
                      : "cursor-not-allowed border border-white/10 bg-white/5 text-slate-500",
                  ].join(" ")}
                >
                  Étape suivante
                </button>
              ) : wizardStep === 2 ? (
                mode === "manual" ? null : (
                <button
                  type="button"
                  onClick={() => {
                    if (mode === "assistant" && !assistantKnowsTeamCount) {
                      const recommended = getRecommendedAutoSetup(assistantEstimatedTeamCount);
                      setConfig((current) =>
                        applyAutoTeamSettings(current, {
                          teamCount: assistantEstimatedTeamCount,
                          autoFormat: recommended.autoFormat,
                          groupCount: recommended.groupCount,
                          teamsPerGroup: recommended.teamsPerGroup,
                        }),
                      );
                    }
                    setWizardStep(3);
                  }}
                  disabled={!canContinueStep2}
                  className={[
                    "rounded-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                    canContinueStep2
                      ? "border border-fuchsia-300/30 bg-violet-600 text-white shadow-[0_0_24px_rgba(124,58,237,0.45)] hover:bg-violet-500"
                      : "cursor-not-allowed border border-white/5 bg-slate-800/40 text-slate-600 shadow-none",
                  ].join(" ")}
                >
                  Valider les paramètres
                </button>
                )
              ) : wizardStep === 3 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep(4)}
                  disabled={!canGenerateTournamentPreview}
                  className={[
                    "rounded-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                    canGenerateTournamentPreview
                      ? "border border-fuchsia-300/30 bg-violet-600 text-white shadow-[0_0_24px_rgba(124,58,237,0.45)] hover:bg-violet-500"
                      : "cursor-not-allowed border border-white/5 bg-slate-800/40 text-slate-600 shadow-none",
                  ].join(" ")}
                >
                  Générer le tournoi
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={shuffleTeams}
                    disabled={config.teams.length < 2}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    🔄 Refaire le tirage
                  </button>
                  <button
                    type="button"
                    onClick={saveTournament}
                    disabled={!canCreateTournament}
                    className={[
                      "rounded-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                      canCreateTournament
                        ? "border border-fuchsia-300/30 bg-violet-600 text-white shadow-[0_0_24px_rgba(124,58,237,0.45)] hover:bg-violet-500"
                        : "cursor-not-allowed border border-white/10 bg-white/5 text-slate-500",
                    ].join(" ")}
                  >
                    Valider le tournoi
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {selectedTournament ? (
        <TournamentWorkspace
          key={`${selectedTournament.id}:${TOURNAMENT_WORKSPACE_RENDER_VERSION}`}
          tournament={selectedTournament}
          groups={selectedTournamentGroups}
          structurePreview={selectedTournamentStructurePreview}
          structurePreviewByDivision={selectedTournamentStructurePreviewByDivision}
          onClose={() => {
            setSelectedTournamentId(null);
            router.replace(pathname);
          }}
          onEditStructure={() => editSavedTournament(selectedTournament)}
          onDelete={() => {
            if (window.confirm(`Supprimer ${selectedTournament.name} ?`)) {
              deleteSavedTournament(selectedTournament.id);
            }
          }}
          onSave={(nextTournament) => updateSavedTournament(nextTournament)}
        />
      ) : null}
    </div>
  );
}
