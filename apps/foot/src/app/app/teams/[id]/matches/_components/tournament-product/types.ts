import type { ReactNode } from "react";

export type TournamentProductStatus = "draft" | "published" | "live" | "finished";

export type TournamentProductMatchStatus = "scheduled" | "live" | "completed";

export type TournamentProductTeam = {
  id: string;
  name: string;
  officialId: string | null;
  source: "official" | "manual";
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
};

export type TournamentProductSavedTournament = {
  id: string;
  name: string;
  date: string;
  categories: string[];
  levels: string[];
  mode: "assistant" | "auto" | "manual";
  teamCount: number;
  autoFormat: "mini_league" | "group_knockout" | "tournament_bracket";
  groupCount: number;
  teamsPerGroup: number;
  startTime?: string;
  endTime?: string;
  teams: TournamentProductTeam[];
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

export type TournamentWorkspaceTab = "overview" | "matches" | "pools" | "bracket" | "live";

export type TournamentStructurePreviewProps = {
  content: ReactNode;
};
