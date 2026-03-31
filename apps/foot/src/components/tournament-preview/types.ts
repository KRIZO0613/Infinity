export type TournamentPreviewStandingRow = {
  team: string;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  diff: number;
  points: number;
};

export type TournamentPreviewGroup = {
  id: string;
  label: string;
  standings: TournamentPreviewStandingRow[];
};

export type TournamentPreviewMatch = {
  id: string;
  label: string;
  homeTeam: string;
  awayTeam: string;
};

export type TournamentPreviewRound = {
  id: string;
  label: string;
  matches: TournamentPreviewMatch[];
};

export type TournamentPreviewPlacementSection = {
  id: string;
  title: string;
  description: string;
  rounds: TournamentPreviewRound[];
};

export type TournamentPreviewData = {
  name: string;
  date?: string;
  teamsCount: number;
  groupsCount: number;
  phaseType: "simple" | "double";
  qualificationLabel: string;
  bracketLabel: string;
  bracketError?: string;
  secondaryBracketLabel?: string;
  secondaryBracketError?: string;
  placementMatches: boolean;
  groups: TournamentPreviewGroup[];
  bracket: TournamentPreviewRound[];
  secondaryBracket?: TournamentPreviewRound[];
  classementSections?: TournamentPreviewPlacementSection[];
  classement?: TournamentPreviewRound[];
};
