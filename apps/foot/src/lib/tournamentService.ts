import { supabase } from "@/lib/supabaseClient";

type TournamentPersistedState = {
  id: string;
  name?: string;
  status?: string | null;
  fieldCount?: number;
  field_count?: number;
  teamId?: string;
  [key: string]: unknown;
};

type TournamentRow = {
  id: string;
  name: string;
  status: string;
  field_count: number;
  data: TournamentPersistedState;
  created_at?: string;
};

type TournamentTeamReference = {
  id: string;
  name: string;
};

type TournamentMatchReference = {
  id: string;
  roundLabel: string;
  fieldLabel: string;
  startTime: string;
  homeTeam: string;
  awayTeam: string;
  divisionId?: string;
};

export type TournamentMatchLiveStatus = "idle" | "live" | "completed";

export type TournamentMatchLiveState = {
  homeScore: number | null;
  awayScore: number | null;
  status: TournamentMatchLiveStatus;
  startedAt: string | null;
  completedAt: string | null;
  goalEvents?: Array<{
    team: "home" | "away";
    number: number;
    elapsedSeconds: number;
  }>;
};

type TournamentMatchLiveRow = {
  id: string;
  tournament_id: string;
  ui_match_id?: string | null;
  score_a: number | null;
  score_b: number | null;
  status: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  goal_events?: unknown;
};

export type TournamentPlayerInput = {
  firstName: string;
  lastName: string;
  license: string;
  number: string;
};

type TournamentPlayerRow = {
  id: string;
  team_id: string;
  first_name: string | null;
  last_name: string | null;
  license_number: string | null;
  number: number | null;
};

type PersistedMvpVote = {
  id: string;
  role: "parent" | "coach" | "admin";
  weight?: 1 | 3 | 5;
  team: "home" | "away";
  number: number;
  voterTeamId?: string | null;
  createdAt: string;
};

type PersistedMatchMvp = {
  team: "home" | "away";
  number: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getPersistedVoteWeight = (role: PersistedMvpVote["role"]) => {
  if (role === "admin") return 5;
  if (role === "coach") return 3;
  return 1;
};

const toPersistedMvpVote = (value: unknown): PersistedMvpVote | null => {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (value.role !== "parent" && value.role !== "coach" && value.role !== "admin") return null;
  if (value.team !== "home" && value.team !== "away") return null;
  const number = typeof value.number === "number" ? value.number : Number(value.number);
  if (!Number.isFinite(number)) return null;
  if (typeof value.createdAt !== "string" || !value.createdAt) return null;

  return {
    id: value.id,
    role: value.role,
    weight:
      value.weight === 1 || value.weight === 3 || value.weight === 5
        ? value.weight
        : getPersistedVoteWeight(value.role),
    team: value.team,
    number,
    voterTeamId:
      typeof value.voterTeamId === "string" || value.voterTeamId === null
        ? value.voterTeamId
        : undefined,
    createdAt: value.createdAt,
  };
};

const toPersistedMatchMvp = (value: unknown): PersistedMatchMvp | null => {
  if (!isRecord(value)) return null;
  if (value.team !== "home" && value.team !== "away") return null;
  const number = typeof value.number === "number" ? value.number : Number(value.number);
  if (!Number.isFinite(number)) return null;
  return {
    team: value.team,
    number,
  };
};

const mergePersistedMvpVotes = (left: unknown, right: unknown) => {
  const merged = new Map<string, PersistedMvpVote>();

  [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])].forEach((entry) => {
    const vote = toPersistedMvpVote(entry);
    if (!vote) return;

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

  return [...merged.values()].sort((leftVote, rightVote) => {
    const leftTime = Date.parse(leftVote.createdAt);
    const rightTime = Date.parse(rightVote.createdAt);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return leftVote.id.localeCompare(rightVote.id, "fr");
  });
};

const getPersistedWeightedMvp = (votes: PersistedMvpVote[], fallback?: unknown) => {
  if (votes.length === 0) {
    return toPersistedMatchMvp(fallback);
  }

  const totals = new Map<string, { team: "home" | "away"; number: number; score: number; lastVoteAt: string }>();

  votes.forEach((vote) => {
    const key = `${vote.team}-${vote.number}`;
    const existing = totals.get(key);
    const score = vote.weight ?? getPersistedVoteWeight(vote.role);

    totals.set(key, {
      team: vote.team,
      number: vote.number,
      score: (existing?.score ?? 0) + score,
      lastVoteAt:
        !existing || vote.createdAt > existing.lastVoteAt
          ? vote.createdAt
          : existing.lastVoteAt,
    });
  });

  const winner =
    [...totals.values()].sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.lastVoteAt.localeCompare(left.lastVoteAt);
    })[0] ?? null;

  return winner
    ? {
        team: winner.team,
        number: winner.number,
      }
    : toPersistedMatchMvp(fallback);
};

const mergePersistedMatchStates = (remoteMatchStates: unknown, nextMatchStates: unknown) => {
  if (!isRecord(remoteMatchStates) && !isRecord(nextMatchStates)) return nextMatchStates;

  const mergedMatchStates: Record<string, unknown> = {
    ...(isRecord(remoteMatchStates) ? remoteMatchStates : {}),
  };

  Object.entries(isRecord(nextMatchStates) ? nextMatchStates : {}).forEach(([matchId, nextStateValue]) => {
    const remoteStateValue = mergedMatchStates[matchId];
    if (!isRecord(nextStateValue)) {
      mergedMatchStates[matchId] = nextStateValue;
      return;
    }

    const remoteState = isRecord(remoteStateValue) ? remoteStateValue : {};
    const mergedVotes = mergePersistedMvpVotes(remoteState.mvpVotes, nextStateValue.mvpVotes);

    mergedMatchStates[matchId] = {
      ...remoteState,
      ...nextStateValue,
      ...(mergedVotes.length > 0
        ? {
            mvpVotes: mergedVotes,
            mvp: getPersistedWeightedMvp(mergedVotes, nextStateValue.mvp ?? remoteState.mvp),
          }
        : {}),
    };
  });

  return mergedMatchStates;
};

const mergeTournamentPersistedStates = <T extends TournamentPersistedState>(remoteState: T, nextState: T) =>
  ({
    ...remoteState,
    ...nextState,
    matchStates: mergePersistedMatchStates(remoteState.matchStates, nextState.matchStates),
  }) as T;

const mapSupabasePlayerToUiPlayer = (player: TournamentPlayerRow) => ({
  id: player.id,
  firstName: player.first_name ?? "",
  lastName: player.last_name ?? "",
  license: player.license_number ?? "",
  number: player.number !== null && player.number !== undefined ? String(player.number) : "",
});

const isTransientTournamentError = (error: unknown) => {
  if (!error) return false;
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error);
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";
  const normalizedMessage = message.toLowerCase();

  return (
    name === "AbortError" ||
    message.includes("Load failed") ||
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("AbortError") ||
    normalizedMessage.includes("operation was aborted")
  );
};

const toDatabaseStatus = (status: unknown) => {
  if (status === "live") return "live";
  if (status === "finished") return "finished";
  return "config";
};

const toStableUuid = (value: string) => {
  const seeds = [0x811c9dc5, 0x45d9f3b, 0x27d4eb2d, 0x165667b1];
  const hashes = seeds.map((seed) => {
    let hash = seed;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  });
  const hex = hashes.join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((Number.parseInt(hex[16] ?? "8", 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
};

const getTournamentTeamDatabaseId = (tournamentId: string, team: TournamentTeamReference) =>
  toStableUuid(`${tournamentId}:team:${team.id}`);

const getTournamentPlayerDatabaseId = (databaseTeamId: string, playerIndex: number) =>
  toStableUuid(`${databaseTeamId}:player:${playerIndex}`);

export const getTournamentMatchDatabaseId = (tournamentId: string, matchId: string) =>
  toStableUuid(`${tournamentId}:match:${matchId}`);

const toLiveMatchStatus = (status: unknown): TournamentMatchLiveStatus => {
  if (status === "live") return "live";
  if (status === "completed" || status === "finished") return "completed";
  return "idle";
};

const mapSupabaseMatchToLiveState = (row: TournamentMatchLiveRow): TournamentMatchLiveState => ({
  homeScore: row.score_a ?? null,
  awayScore: row.score_b ?? null,
  status: toLiveMatchStatus(row.status),
  startedAt: row.started_at ?? null,
  completedAt: row.completed_at ?? null,
  goalEvents: Array.isArray(row.goal_events)
    ? row.goal_events
        .map((event) => {
          if (!event || typeof event !== "object") return null;
          const entry = event as { team?: unknown; number?: unknown; elapsedSeconds?: unknown };
          if (entry.team !== "home" && entry.team !== "away") return null;
          const number = typeof entry.number === "number" ? entry.number : Number(entry.number);
          const elapsedSeconds =
            typeof entry.elapsedSeconds === "number" ? entry.elapsedSeconds : Number(entry.elapsedSeconds);
          if (!Number.isFinite(number) || !Number.isFinite(elapsedSeconds)) return null;
          return {
            team: entry.team,
            number,
            elapsedSeconds,
          };
        })
        .filter((event): event is { team: "home" | "away"; number: number; elapsedSeconds: number } => event !== null)
    : [],
});

const toPlayerNumber = (value: string) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const ensureTournamentTeam = async (tournamentId: string, team: TournamentTeamReference) => {
  const databaseTeamId = getTournamentTeamDatabaseId(tournamentId, team);
  console.log("TOURNAMENT TEAM SAVE IDS", {
    tournamentId,
    uiTeamId: team.id,
    teamName: team.name,
    databaseTeamId,
  });

  const { error } = await supabase.from("tournament_teams").upsert(
    {
      id: databaseTeamId,
      tournament_id: tournamentId,
      name: team.name,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("Erreur sauvegarde equipe tournoi:", error.message ?? error);
    throw error;
  }

  return databaseTeamId;
};

export async function saveTournamentPlayer(
  tournamentId: string,
  team: TournamentTeamReference,
  playerIndex: number,
  player: TournamentPlayerInput,
) {
  const databaseTeamId = await ensureTournamentTeam(tournamentId, team);
  console.log("PLAYER SAVE TEAM IDS", {
    tournamentId,
    uiTeamId: team.id,
    teamName: team.name,
    databaseTeamId,
  });

  const { error } = await supabase.from("tournament_players").upsert(
    {
      id: getTournamentPlayerDatabaseId(databaseTeamId, playerIndex),
      team_id: databaseTeamId,
      first_name: player.firstName,
      last_name: player.lastName,
      license_number: player.license,
      number: toPlayerNumber(player.number),
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("Erreur sauvegarde joueur tournoi:", error.message ?? error);
    throw error;
  }
}

export async function deleteTournamentPlayer(
  tournamentId: string,
  team: TournamentTeamReference,
  playerIndex: number,
) {
  const databaseTeamId = getTournamentTeamDatabaseId(tournamentId, team);
  const { error } = await supabase
    .from("tournament_players")
    .delete()
    .eq("id", getTournamentPlayerDatabaseId(databaseTeamId, playerIndex));

  if (error) {
    console.error("Erreur suppression joueur tournoi:", error.message ?? error);
    throw error;
  }
}

export async function loadTournamentPlayers(tournamentId: string, team: TournamentTeamReference) {
  const databaseTeamId = getTournamentTeamDatabaseId(tournamentId, team);
  console.log("PLAYER LOAD TEAM IDS", {
    tournamentId,
    uiTeamId: team.id,
    teamName: team.name,
    databaseTeamId,
  });

  const { data: teamRows, error: teamError } = await supabase
    .from("tournament_teams")
    .select("id,name")
    .eq("tournament_id", tournamentId)
    .eq("name", team.name);

  if (teamError) {
    if (!isTransientTournamentError(teamError)) {
      console.error("Erreur chargement equipes tournoi:", teamError.message ?? teamError);
    }
  }

  const candidateTeamIds = Array.from(
    new Set([databaseTeamId, ...((teamRows ?? []) as Array<{ id: string }>).map((row) => row.id)]),
  );

  const { data, error } = await supabase
    .from("tournament_players")
    .select("id,team_id,first_name,last_name,license_number,number")
    .in("team_id", candidateTeamIds)
    .order("number", { ascending: true });

  if (error) {
    if (isTransientTournamentError(error)) {
      return [];
    }
    console.error("Erreur chargement joueurs tournoi:", error.message ?? error);
    throw error;
  }

  const mappedPlayers = ((data ?? []) as TournamentPlayerRow[]).map(mapSupabasePlayerToUiPlayer);

  console.log("ADMIN TEAM ROWS", teamRows);
  console.log("ADMIN PLAYER TEAM IDS USED", candidateTeamIds);
  console.log("ADMIN PLAYERS RAW", data);
  console.log("ADMIN PLAYERS MAPPED", mappedPlayers);

  return mappedPlayers;
}

export async function saveTournamentMatchLiveState(
  tournamentId: string,
  match: TournamentMatchReference,
  state: TournamentMatchLiveState,
) {
  const databaseMatchId = getTournamentMatchDatabaseId(tournamentId, match.id);

  const { error } = await supabase.from("tournament_matches").upsert(
    {
      id: databaseMatchId,
      tournament_id: tournamentId,
      ui_match_id: match.id,
      score_a: state.homeScore,
      score_b: state.awayScore,
      field: Number.parseInt(match.fieldLabel.replace(/\D+/g, ""), 10) || null,
      status: state.status,
      round: match.roundLabel,
      group_name: match.roundLabel,
      started_at: state.startedAt,
      completed_at: state.completedAt,
      goal_events: state.goalEvents ?? [],
    },
    { onConflict: "id" },
  );

  if (error) {
    if (isTransientTournamentError(error)) {
      console.warn("Supabase indisponible pour la sauvegarde statut match, fallback local.");
      return;
    }
    console.error("Erreur sauvegarde statut match:", error.message ?? error);
    throw error;
  }
}

export async function saveTournamentMatchesLiveStates(
  tournamentId: string,
  matches: TournamentMatchReference[],
  statesByMatchId: Record<string, TournamentMatchLiveState>,
) {
  if (matches.length === 0) return;

  const rows = matches.map((match) => {
    const state = statesByMatchId[match.id] ?? {
      homeScore: null,
      awayScore: null,
      status: "idle" as const,
      startedAt: null,
      completedAt: null,
      goalEvents: [],
    };

    return {
      id: getTournamentMatchDatabaseId(tournamentId, match.id),
      tournament_id: tournamentId,
      ui_match_id: match.id,
      score_a: state.homeScore,
      score_b: state.awayScore,
      field: Number.parseInt(match.fieldLabel.replace(/\D+/g, ""), 10) || null,
      status: state.status,
      round: match.roundLabel,
      group_name: match.roundLabel,
      started_at: state.startedAt,
      completed_at: state.completedAt,
      goal_events: state.goalEvents ?? [],
    };
  });

  const { error } = await supabase.from("tournament_matches").upsert(rows, { onConflict: "id" });

  if (error) {
    if (isTransientTournamentError(error)) {
      console.warn("Supabase indisponible pour la sauvegarde statuts matchs, fallback local.");
      return;
    }
    console.error("Erreur sauvegarde statuts matchs:", error.message ?? error);
    throw error;
  }
}

export async function loadTournamentMatchLiveStates(
  tournamentId: string,
  matches: TournamentMatchReference[],
) {
  if (matches.length === 0) return {};

  const idsByDatabaseId = new Map(
    matches.map((match) => [getTournamentMatchDatabaseId(tournamentId, match.id), match.id] as const),
  );

  const { data, error } = await supabase
    .from("tournament_matches")
    .select("id,tournament_id,ui_match_id,score_a,score_b,status,started_at,completed_at,goal_events")
    .eq("tournament_id", tournamentId)
    .in("id", [...idsByDatabaseId.keys()]);

  if (error) {
    if (isTransientTournamentError(error)) {
      return {};
    }
    console.error("Erreur chargement statuts matchs:", error.message ?? error);
    throw error;
  }

  return ((data ?? []) as TournamentMatchLiveRow[]).reduce<Record<string, TournamentMatchLiveState>>(
    (next, row) => {
      const uiMatchId = row.ui_match_id ?? idsByDatabaseId.get(row.id);
      if (!uiMatchId) return next;
      next[uiMatchId] = mapSupabaseMatchToLiveState(row);
      return next;
    },
    {},
  );
}

const stripTournamentPlayerJson = <T extends TournamentPersistedState>(state: T) => {
  const nextState = { ...state };
  delete nextState.teamPlayersByTeam;
  return nextState as T;
};

export async function saveTournament<T extends TournamentPersistedState>(state: T) {
  try {
    const nextState = stripTournamentPlayerJson(state);
    let mergedState = nextState;

    const { data: existingTournament, error: existingTournamentError } = await supabase
      .from("tournaments")
      .select("data")
      .eq("id", nextState.id)
      .maybeSingle<{ data: T }>();

    if (existingTournamentError && !isTransientTournamentError(existingTournamentError)) {
      console.error(
        "Erreur chargement tournoi avant merge:",
        existingTournamentError.message ?? existingTournamentError,
      );
      throw existingTournamentError;
    }

    if (existingTournament?.data) {
      mergedState = mergeTournamentPersistedStates(
        stripTournamentPlayerJson(existingTournament.data),
        nextState,
      );
    }

    const payload = {
      id: mergedState.id,
      name: typeof mergedState.name === "string" && mergedState.name.trim() ? mergedState.name.trim() : "Tournoi",
      status: toDatabaseStatus(mergedState.status),
      field_count:
        typeof mergedState.fieldCount === "number"
          ? mergedState.fieldCount
          : typeof mergedState.field_count === "number"
            ? mergedState.field_count
            : 1,
      data: mergedState,
    };

    const { data, error } = await supabase
      .from("tournaments")
      .upsert(payload)
      .select("id,name,status,field_count,data,created_at")
      .single<TournamentRow>();

    if (error) {
      if (isTransientTournamentError(error)) {
        console.warn("Supabase indisponible pour la sauvegarde tournoi, fallback local.");
        return mergedState;
      }
      console.error("Erreur sauvegarde tournoi:", error.message ?? error);
      throw error;
    }

    return (data?.data ?? mergedState) as T;
  } catch (error) {
    if (isTransientTournamentError(error)) {
      console.warn("Supabase indisponible pour la sauvegarde tournoi, fallback local.");
      return stripTournamentPlayerJson(state);
    }
    console.error("Erreur sauvegarde tournoi:", error);
    throw error;
  }
}

export async function replaceTournament<T extends TournamentPersistedState>(state: T) {
  try {
    const nextState = stripTournamentPlayerJson(state);
    const payload = {
      id: nextState.id,
      name: typeof nextState.name === "string" && nextState.name.trim() ? nextState.name.trim() : "Tournoi",
      status: toDatabaseStatus(nextState.status),
      field_count:
        typeof nextState.fieldCount === "number"
          ? nextState.fieldCount
          : typeof nextState.field_count === "number"
            ? nextState.field_count
            : 1,
      data: nextState,
    };

    const { data, error } = await supabase
      .from("tournaments")
      .upsert(payload)
      .select("id,name,status,field_count,data,created_at")
      .single<TournamentRow>();

    if (error) {
      if (isTransientTournamentError(error)) {
        console.warn("Supabase indisponible pour l'écrasement tournoi, fallback local.");
        return nextState;
      }
      console.error("Erreur écrasement tournoi:", error.message ?? error);
      throw error;
    }

    return (data?.data ?? nextState) as T;
  } catch (error) {
    if (isTransientTournamentError(error)) {
      console.warn("Supabase indisponible pour l'écrasement tournoi, fallback local.");
      return stripTournamentPlayerJson(state);
    }
    console.error("Erreur écrasement tournoi:", error);
    throw error;
  }
}

export async function loadTournament<T = TournamentPersistedState>(id: string) {
  try {
    console.log("LOADING TOURNAMENT ID", id);

    const { data, error } = await supabase
      .from("tournaments")
      .select("data")
      .eq("id", id)
      .maybeSingle<{ data: T }>();

    if (error) {
      if (isTransientTournamentError(error)) {
        return null;
      }
      console.error("Erreur chargement tournoi:", error.message ?? error);
      throw error;
    }

    return data?.data ?? null;
  } catch (error) {
    if (isTransientTournamentError(error)) {
      return null;
    }
    console.error("Erreur chargement tournoi:", error);
    throw error;
  }
}

export async function listTournaments(teamId?: string) {
  try {
    const { data, error } = await supabase
      .from("tournaments")
      .select("id,name,status,field_count,data,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      if (isTransientTournamentError(error)) {
        return [];
      }
      console.error("Erreur liste tournois:", error.message ?? error);
      throw error;
    }

    const rows = (data ?? []) as TournamentRow[];
    if (!teamId) {
      return rows.map((row) => row.data);
    }

    return rows
      .map((row) => row.data)
      .filter((entry) => entry && typeof entry === "object" && entry.teamId === teamId);
  } catch (error) {
    if (isTransientTournamentError(error)) {
      return [];
    }
    console.error("Erreur liste tournois:", error);
    throw error;
  }
}

export async function deleteTournament(id: string) {
  try {
    const { error } = await supabase.from("tournaments").delete().eq("id", id);

    if (error) {
      if (isTransientTournamentError(error)) {
        return;
      }
      console.error("Erreur suppression tournoi:", error.message ?? error);
      throw error;
    }
  } catch (error) {
    if (isTransientTournamentError(error)) {
      return;
    }
    console.error("Erreur suppression tournoi:", error);
    throw error;
  }
}
