import type { Player } from "@/app/app/teams/_types/player";
import type { TeamEvent } from "@/lib/api/teamEvents";

export type MatchSheetFormat = "foot-5" | "foot-8" | "foot-11";

export type MatchSheetFormation =
  | "2-2"
  | "1-2-1"
  | "2-1-1"
  | "3-3-1"
  | "3-2-2"
  | "2-3-2"
  | "2-4-1"
  | "4-3-3"
  | "4-4-2"
  | "3-5-2"
  | "libre-5"
  | "libre-8"
  | "libre-11";

export type MatchSheetRole =
  | "goalkeeper"
  | "defender"
  | "midfielder"
  | "forward";

export type MatchSheetSlot = {
  id: string;
  label: string;
  shortLabel: string;
  role: MatchSheetRole;
  x: number;
  y: number;
};

export type MatchSheetSlotPosition = {
  x: number;
  y: number;
};

export type MatchSheetLineupDraft = {
  formation: MatchSheetFormation;
  startersBySlot: Record<string, string | null>;
  slotPositionsByFormation: Partial<
    Record<MatchSheetFormation, Record<string, MatchSheetSlotPosition>>
  >;
  manualPlayers: MatchSheetPlayer[];
  playerNumbersById: Record<string, string>;
  selectedSquadIds: string[];
  substitutes: string[];
  staffAssignments: string[];
  validated: boolean;
};

export type PlateauOfficialDraft = {
  firstName: string;
  lastName: string;
  licenseNumber: string;
  role: string;
  club: string;
};

export type PlateauResultDraft = {
  homeScore: string;
  awayScore: string;
};

export type MatchSheetPlateauMatch = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  date?: string;
  time?: string;
  status?: "draft" | "in_progress" | "finished";
  score?: string;
};

export type MatchSheetDraft = {
  format: MatchSheetFormat;
  formation: MatchSheetFormation;
  startersBySlot: Record<string, string | null>;
  slotPositionsByFormation: Partial<
    Record<MatchSheetFormation, Record<string, MatchSheetSlotPosition>>
  >;
  manualPlayers: MatchSheetPlayer[];
  selectedSquadIds: string[];
  substitutes: string[];
  staffAssignments: string[];
  opponentFormation: MatchSheetFormation;
  opponentStartersBySlot: Record<string, string | null>;
  opponentSlotPositionsByFormation: Partial<
    Record<MatchSheetFormation, Record<string, MatchSheetSlotPosition>>
  >;
  opponentManualPlayers: MatchSheetPlayer[];
  opponentSelectedSquadIds: string[];
  opponentSubstitutes: string[];
  opponentStaffAssignments: string[];
  opponentTeamCode: string;
  coachNotes: string;
  plateauLineups?: Record<string, MatchSheetLineupDraft>;
  plateauOfficial?: PlateauOfficialDraft;
  plateauOfficialSignature?: string;
  plateauSignatures?: Record<string, string>;
  plateauResults?: Record<string, PlateauResultDraft>;
  plateauSheetValidated?: boolean;
  plateauResultsValidated?: boolean;
  updatedAt: string;
};

export type MatchSheetSource = "team-event" | "plateau-day";

export type MatchSheetMatch = {
  id: string;
  title: string | null;
  start_at: string;
  location: string | null;
  status: TeamEvent["status"] | null;
  source: MatchSheetSource;
  teams?: string[];
  plateauMatches?: MatchSheetPlateauMatch[];
};

export type MatchSheetPlayerSource = "team" | "club" | "staff" | "manual";

export type MatchSheetPlayer = Player & {
  source?: MatchSheetPlayerSource;
  jerseyNumber?: string;
};
