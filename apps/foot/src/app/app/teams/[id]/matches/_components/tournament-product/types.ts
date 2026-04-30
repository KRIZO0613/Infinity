import type { ReactNode } from "react";

import type { TournamentPreviewData, TournamentPreviewSlot } from "@/components/tournament-preview/types";

export type TournamentProductStatus = "draft" | "published" | "live" | "finished";

export type TournamentProductMatchStatus = "idle" | "scheduled" | "live" | "paused" | "completed";

export type TournamentProductTeam = {
  id: string;
  name: string;
  officialId: string | null;
  source: "official" | "manual";
};

export type TournamentProductTeamPlayer = {
  id?: string;
  lastName: string;
  firstName: string;
  license: string;
  number: string;
};

export type TournamentProductMealItem = {
  id: string;
  label: string;
  price: string;
  link?: string;
};

export type TournamentProductCoachMealRow = {
  id: string;
  participantLabel: string;
  quantities: Record<string, number>;
};

export type TournamentProductCoachMealStatus = "pending" | "partial" | "validated";

export type TournamentProductCoachTeamSubmission = {
  teamName: string;
  players: TournamentProductTeamPlayer[];
  submittedAt?: string | null;
};

export type TournamentProductCoachMealSubmission = {
  teamName: string;
  rows: TournamentProductCoachMealRow[];
  status?: TournamentProductCoachMealStatus;
  submittedAt?: string | null;
};

export type TournamentProductShareSettings = {
  tournamentPublished: boolean;
  coachAccessEnabled: boolean;
  parentAccessEnabled: boolean;
  coachTournamentAccessEnabled?: boolean;
  parentTournamentAccessEnabled?: boolean;
  publicMvpLeaderboardEnabled?: boolean;
  topScorerVisibility?: "always" | "end_of_tournament" | "hidden";
  coachToken: string | null;
  parentToken: string | null;
  parentTeamCodes?: Record<string, string>;
  votesEnabled: boolean;
  coachTeamSubmissions: Record<string, TournamentProductCoachTeamSubmission>;
  coachMealSubmissions: Record<string, TournamentProductCoachMealSubmission>;
};

export type TournamentProductManualBuilderSnapshot = {
  manualTournamentState: Record<string, unknown>;
  divisionStates: Record<string, unknown>;
  activeDivisionId?: string | null;
};

export type TournamentProductScheduleMatch = {
  id: string;
  roundLabel: string;
  fieldLabel: string;
  startTime: string;
  endTime: string;
  slotIndex?: number;
  homeTeam: string;
  awayTeam: string;
  homeSlot?: TournamentPreviewSlot;
  awaySlot?: TournamentPreviewSlot;
  divisionId?: string;
  divisionName?: string;
  stage?: string;
  leg?: "aller" | "retour";
  type?: "match" | "pause";
  label?: string;
  isPause?: boolean;
  scheduleSection?: "group" | "final";
};

export type TournamentProductMatchState = {
  homeScore: number | null;
  awayScore: number | null;
  status: TournamentProductMatchStatus;
  notes?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  penaltyShootout?: {
    targetAttempts?: number;
    events: Array<{
      team: "home" | "away";
      number: number;
      scored: boolean;
      order: number;
    }>;
    winner?: "home" | "away" | null;
  };
  mvp?: {
    team: "home" | "away";
    number: number;
  };
  mvpVotes?: Array<{
    id: string;
    role: "parent" | "coach" | "admin";
    weight: 1 | 3 | 5;
    team: "home" | "away";
    number: number;
    voterTeamId?: string | null;
    createdAt: string;
  }>;
};

export type TournamentProductSavedTournament = {
  id: string;
  name: string;
  date: string;
  categories: string[];
  levels: string[];
  groups?: TournamentProductGroup[];
  manualPreviewDataByDivision?: Array<{
    id: string;
    name: string;
    data: TournamentPreviewData;
  }>;
  manualBuilderSnapshot?: TournamentProductManualBuilderSnapshot | null;
  mode: "assistant" | "auto" | "manual";
  teamCount: number;
  autoFormat: "mini_league" | "group_knockout" | "tournament_bracket";
  groupCount: number;
  teamsPerGroup: number;
  startTime?: string;
  endTime?: string;
  teams: TournamentProductTeam[];
  maxPlayersPerTeam?: number;
  mealsPerTeam?: number;
  mealItems?: TournamentProductMealItem[];
  shareSettings?: TournamentProductShareSettings;
  schedule: TournamentProductScheduleMatch[];
  fieldCount: number;
  matchDuration: number;
  penaltyShooters?: number;
  breakMinutes: number;
  lunchBreakMinutes: number;
  groupHomeAway: boolean;
  qualificationRule?: string;
  finalPhase?: string;
  placementMatches?: string;
  manualMatches?: Array<{
    id: string;
    homeTeamId: string;
    awayTeamId: string;
    field: number;
    startTime: string;
    duration: number;
  }>;
  windowFits: boolean;
  createdAt: string;
  updatedAt?: string;
  status?: TournamentProductStatus;
  location?: string;
  publishedAt?: string | null;
  liveMatchId?: string | null;
  matchStates?: Record<string, TournamentProductMatchState>;
};

export type TournamentProductGroup = {
  label: string;
  teams: string[];
};

export type TournamentWorkspaceTab =
  | "overview"
  | "matches"
  | "pools"
  | "bracket"
  | "live"
  | "stats"
  | "teams"
  | "meals"
  | "share";

export type TournamentStructurePreviewProps = {
  content: ReactNode;
};
