import { supabase } from "@/lib/supabaseClient";

export const TEAM_PLAYERS_PER_SIDE_VALUES = [4, 5, 7, 8, 9, 11] as const;

export type TeamPlayersPerSide =
  (typeof TEAM_PLAYERS_PER_SIDE_VALUES)[number];

export type TeamMatchFormat = "foot-5" | "foot-8" | "foot-11";

export type TeamProfile = {
  id: string;
  clubId: string | null;
  clubName: string | null;
  userId: string | null;
  name: string;
  category: string | null;
  level: string | null;
  squadNumber: number | null;
  playersPerSide: TeamPlayersPerSide;
  matchFormat: TeamMatchFormat;
};

type BuildTeamProfileMetaOptions = {
  includeSquadNumber?: boolean;
};

type TeamProfileRow = {
  id: string;
  club_id: string | null;
  user_id: string | null;
  name: string;
  category: string | null;
  level: string | null;
  squad_number?: number | null;
  players_per_side?: number | null;
};

type TeamDisplayNameInput = {
  clubName?: string | null;
  name?: string | null;
  category?: string | null;
  squadNumber?: number | null;
  fallback?: string | null;
};

function isMissingColumnError(
  error: unknown,
  table: string,
  column: string,
) {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: string; message?: string };
  if (maybeError.code !== "PGRST204") return false;
  if (typeof maybeError.message !== "string") return false;

  return (
    maybeError.message.includes(`'${column}'`) &&
    maybeError.message.includes(`'${table}'`)
  );
}

function isPlayersPerSide(value: unknown): value is TeamPlayersPerSide {
  return (
    typeof value === "number" &&
    TEAM_PLAYERS_PER_SIDE_VALUES.includes(value as TeamPlayersPerSide)
  );
}

export function inferPlayersPerSideFromCategory(
  category: string | null | undefined,
): TeamPlayersPerSide {
  if (!category) return 11;

  const normalized = category.toUpperCase();
  const match = normalized.match(/\bU\s*(\d{1,2})\b/);
  if (!match) return 11;

  const age = Number(match[1]);
  if (Number.isNaN(age)) return 11;
  if (age <= 9) return 5;
  if (age <= 11) return 8;
  return 11;
}

export function getMatchFormatFromPlayersPerSide(
  playersPerSide: TeamPlayersPerSide,
): TeamMatchFormat {
  if (playersPerSide === 4 || playersPerSide === 5) return "foot-5";
  if (playersPerSide === 7 || playersPerSide === 8) return "foot-8";
  return "foot-11";
}

export function normalizeTeamProfile(
  row: TeamProfileRow | null,
  clubName: string | null = null,
): TeamProfile | null {
  if (!row) return null;

  const playersPerSide = isPlayersPerSide(row.players_per_side)
    ? row.players_per_side
    : inferPlayersPerSideFromCategory(row.category);

  return {
    id: row.id,
    clubId: row.club_id ?? null,
    clubName,
    userId: row.user_id ?? null,
    name: row.name,
    category: row.category ?? null,
    level: row.level ?? null,
    squadNumber:
      typeof row.squad_number === "number" && row.squad_number > 0
        ? row.squad_number
        : null,
    playersPerSide,
    matchFormat: getMatchFormatFromPlayersPerSide(playersPerSide),
  };
}

export function buildTeamProfileMeta(profile: TeamProfile | null) {
  if (!profile) return [];

  return buildTeamProfileMetaWithOptions(profile);
}

export function formatTeamDisplayName({
  clubName,
  name,
  squadNumber,
  fallback = "Mon équipe",
}: TeamDisplayNameInput) {
  const baseName = clubName?.trim() || name?.trim() || fallback?.trim() || "Mon équipe";

  if (typeof squadNumber === "number" && squadNumber > 0) {
    return `${baseName} - ${squadNumber}`;
  }

  return baseName;
}

export function getTeamDisplayName(profile: TeamProfile | null) {
  if (!profile) return "";
  return formatTeamDisplayName(profile);
}

export function buildTeamNameAliases(input: TeamDisplayNameInput) {
  return Array.from(
    new Set(
      [
        formatTeamDisplayName(input),
        input.clubName?.trim() || null,
        input.name?.trim() || null,
        input.category?.trim() || null,
      ].filter((value): value is string => Boolean(value)),
    ),
  );
}

export function buildTeamProfileMetaWithOptions(
  profile: TeamProfile | null,
  options: BuildTeamProfileMetaOptions = {},
) {
  if (!profile) return [];

  const { includeSquadNumber = true } = options;

  return [
    profile.category,
    profile.level,
    includeSquadNumber && profile.squadNumber
      ? `Équipe ${profile.squadNumber}`
      : null,
    `${profile.playersPerSide} joueurs`,
  ].filter((value): value is string => Boolean(value));
}

export async function getTeamProfile(teamId: string) {
  const { data, error } = await supabase
    .from("teams")
    .select(
      "id,club_id,user_id,name,category,level,squad_number,players_per_side",
    )
    .eq("id", teamId)
    .maybeSingle();

  if (!error) {
    const row = (data as TeamProfileRow | null) ?? null;
    let clubName: string | null = null;

    if (row?.club_id) {
      const clubResponse = await supabase
        .from("clubs")
        .select("name")
        .eq("id", row.club_id)
        .maybeSingle();

      if (!clubResponse.error) {
        clubName = clubResponse.data?.name ?? null;
      }
    }

    return normalizeTeamProfile(row, clubName);
  }

  if (
    !isMissingColumnError(error, "teams", "squad_number") &&
    !isMissingColumnError(error, "teams", "players_per_side")
  ) {
    throw error;
  }

  const fallback = await supabase
    .from("teams")
    .select("id,club_id,user_id,name,category,level")
    .eq("id", teamId)
    .maybeSingle();

  if (fallback.error) throw fallback.error;

  const row = (fallback.data as TeamProfileRow | null) ?? null;
  let clubName: string | null = null;

  if (row?.club_id) {
    const clubResponse = await supabase
      .from("clubs")
      .select("name")
      .eq("id", row.club_id)
      .maybeSingle();

    if (!clubResponse.error) {
      clubName = clubResponse.data?.name ?? null;
    }
  }

  return normalizeTeamProfile(row, clubName);
}
