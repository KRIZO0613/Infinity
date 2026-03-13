// Utilities for team_events, matches, training_sessions (core event timeline).
import { supabase } from "@/lib/supabaseClient";
import type { Json } from "@/types/supabase";

export const TEAM_EVENT_STATUS = [
  "scheduled",
  "played",
  "cancelled",
] as const;

export type TeamEventStatus = (typeof TEAM_EVENT_STATUS)[number];

export type TeamEvent = {
  id: string;
  club_id: string;
  team_id: string;
  type: "match" | "training";
  start_at: string;
  end_at: string | null;
  status: TeamEventStatus | null;
  title: string | null;
  location?: string | null;
  championship_match_id?: string | null;
};

export type CreateEventBaseInput = {
  clubId: string;
  teamId: string;
  startAt: string;
  endAt?: string | null;
  title?: string | null;
  status?: TeamEventStatus | null;
  createdBy?: string;
  eventData?: Record<string, Json>;
};

export type CreateMatchEventInput = CreateEventBaseInput & {
  matchData?: Record<string, Json>;
};

export type CreateTrainingEventInput = CreateEventBaseInput & {
  trainingData?: Record<string, Json>;
};

export type ChampionshipMatchSyncInput = {
  championshipMatchId: string;
  title: string | null;
  startAt: string;
  opponentName: string;
  competition: string;
  location?: string | null;
  homeAway: "home" | "away";
  goalsFor: number;
  goalsAgainst: number;
  result: "win" | "loss" | "draw";
  status?: TeamEventStatus | null;
};

export async function getTeamEventsByTeam(
  teamId: string,
  options?: { ascending?: boolean; type?: "match" | "training" },
) {
  let query = supabase
    .from("team_events")
    .select("*")
    .eq("team_id", teamId);

  if (options?.type) {
    query = query.eq("type", options.type);
  }

  const { data, error } = await query.order("start_at", {
    ascending: options?.ascending ?? true,
  });

  if (error) throw error;
  return (data ?? []) as TeamEvent[];
}

const normalizeEventStatus = (status?: TeamEventStatus | null) => {
  if (!status) return "scheduled";
  return TEAM_EVENT_STATUS.includes(status) ? status : "scheduled";
};

export async function getMatchesByTeam(teamId: string) {
  const { data, error } = await supabase
    .from("team_events")
    .select("*")
    .eq("team_id", teamId)
    .eq("type", "match")
    .order("start_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TeamEvent[];
}

export async function getTrainingsByTeam(teamId: string) {
  const { data, error } = await supabase
    .from("team_events")
    .select("*")
    .eq("team_id", teamId)
    .eq("type", "training")
    .order("start_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TeamEvent[];
}

export async function createMatchEvent(input: CreateMatchEventInput) {
  const {
    clubId,
    teamId,
    startAt,
    endAt,
    title,
    status,
    createdBy,
    eventData,
    matchData,
  } =
    input;
  if (!createdBy) {
    throw new Error("create match event failed: missing created_by");
  }

  const { data: eventDataRow, error: eventError } = await supabase
    .from("team_events")
    .insert({
      club_id: clubId,
      team_id: teamId,
      type: "match",
      start_at: startAt,
      end_at: endAt ?? null,
      title: title ?? null,
      status: normalizeEventStatus(status),
      created_by: createdBy,
      ...(eventData ?? {}),
    })
    .select("id")
    .single();

  if (eventError || !eventDataRow?.id) {
    throw eventError ?? new Error("Unable to create team event.");
  }

  const { error: matchError } = await supabase.from("matches").insert({
    event_id: eventDataRow.id,
    ...(matchData ?? {}),
  });

  if (matchError) {
    await supabase.from("team_events").delete().eq("id", eventDataRow.id);
    throw matchError;
  }

  return eventDataRow.id as string;
}

export async function createTrainingEvent(input: CreateTrainingEventInput) {
  const {
    clubId,
    teamId,
    startAt,
    endAt,
    title,
    status,
    createdBy,
    eventData,
    trainingData,
  } = input;
  if (!createdBy) {
    throw new Error("create training event failed: missing created_by");
  }

  const { data: eventDataRow, error: eventError } = await supabase
    .from("team_events")
    .insert({
      club_id: clubId,
      team_id: teamId,
      type: "training",
      start_at: startAt,
      end_at: endAt ?? null,
      title: title ?? null,
      status: normalizeEventStatus(status),
      created_by: createdBy,
      ...(eventData ?? {}),
    })
    .select("id")
    .single();

  if (eventError || !eventDataRow?.id) {
    const payload = eventError
      ? JSON.stringify({
          message: eventError.message,
          details: eventError.details,
          hint: eventError.hint,
          code: eventError.code,
        })
      : "missing id";
    throw new Error(`create training event failed: ${payload}`);
  }

  const { error: trainingError } = await supabase
    .from("training_sessions")
    .insert({
      event_id: eventDataRow.id,
      ...(trainingData ?? {}),
    });

  if (trainingError) {
    await supabase.from("team_events").delete().eq("id", eventDataRow.id);
    const payload = JSON.stringify({
      message: trainingError.message,
      details: trainingError.details,
      hint: trainingError.hint,
      code: trainingError.code,
    });
    throw new Error(`create training session failed: ${payload}`);
  }

  return eventDataRow.id as string;
}

export async function updateEventDates(
  eventId: string,
  newStart: string,
  newEnd?: string | null,
) {
  const { error } = await supabase
    .from("team_events")
    .update({ start_at: newStart, end_at: newEnd ?? null })
    .eq("id", eventId);

  if (error) throw error;
}

export async function cancelEvent(eventId: string) {
  const { error } = await supabase
    .from("team_events")
    .update({ status: "cancelled" })
    .eq("id", eventId);

  if (error) throw error;
}

function isMatchesSchemaMismatch(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: string; message?: string };
  if (maybeError.code !== "PGRST204") return false;

  return typeof maybeError.message === "string"
    ? maybeError.message.includes("'matches'")
    : false;
}

async function syncMatchRows(
  matchesByEventId: Array<{
    eventId: string;
    opponentName: string;
    scheduledAt: string;
    competition: string;
    location?: string | null;
    homeAway: "home" | "away";
    goalsFor: number;
    goalsAgainst: number;
    result: "win" | "loss" | "draw";
  }>,
) {
  if (matchesByEventId.length === 0) return;

  const { data, error } = await supabase
    .from("matches")
    .select("event_id")
    .in(
      "event_id",
      matchesByEventId.map((match) => match.eventId),
    );

  if (error) throw error;

  const existingIds = new Set((data ?? []).map((row) => row.event_id));
  const missingMatches = matchesByEventId.filter(
    (match) => !existingIds.has(match.eventId),
  );
  const existingMatches = matchesByEventId.filter((match) =>
    existingIds.has(match.eventId),
  );

  if (missingMatches.length > 0) {
    const fullInsertPayload = missingMatches.map((match) => ({
      event_id: match.eventId,
      opponent_name: match.opponentName,
      scheduled_at: match.scheduledAt,
      competition: match.competition,
      location: match.location ?? null,
      home_away: match.homeAway,
      goals_for: match.goalsFor,
      goals_against: match.goalsAgainst,
      result: match.result,
    }));

    const { error: insertError } = await supabase
      .from("matches")
      .insert(fullInsertPayload);

    if (insertError) {
      if (!isMatchesSchemaMismatch(insertError)) throw insertError;

      const { error: fallbackInsertError } = await supabase
        .from("matches")
        .insert(
          missingMatches.map((match) => ({
            event_id: match.eventId,
            opponent_name: match.opponentName,
          })),
        );

      if (fallbackInsertError) throw fallbackInsertError;
    }
  }

  for (const match of existingMatches) {
    const { error: updateError } = await supabase
      .from("matches")
      .update({
        opponent_name: match.opponentName,
        scheduled_at: match.scheduledAt,
        competition: match.competition,
        location: match.location ?? null,
        home_away: match.homeAway,
        goals_for: match.goalsFor,
        goals_against: match.goalsAgainst,
        result: match.result,
      })
      .eq("event_id", match.eventId);

    if (updateError) {
      if (!isMatchesSchemaMismatch(updateError)) throw updateError;

      const { error: fallbackUpdateError } = await supabase
        .from("matches")
        .update({
          opponent_name: match.opponentName,
        })
        .eq("event_id", match.eventId);

      if (fallbackUpdateError) throw fallbackUpdateError;
    }
  }
}

export async function syncChampionshipMatchesToTeamEvents(
  teamId: string,
  matches: ChampionshipMatchSyncInput[],
) {
  if (!teamId) return;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("sync championship matches failed: missing user");
  }

  const { data: teamData, error: teamError } = await supabase
    .from("teams")
    .select("club_id")
    .eq("id", teamId)
    .maybeSingle();

  if (teamError) throw teamError;
  if (!teamData?.club_id) {
    throw new Error("sync championship matches failed: missing team club");
  }

  const { data: existingEvents, error: existingError } = await supabase
    .from("team_events")
    .select("id,championship_match_id")
    .eq("team_id", teamId)
    .eq("type", "match")
    .not("championship_match_id", "is", null);

  if (existingError) throw existingError;

  const existingByLinkId = new Map(
    (existingEvents ?? [])
      .filter(
        (event): event is { id: string; championship_match_id: string } =>
          typeof event.id === "string" &&
          typeof event.championship_match_id === "string",
      )
      .map((event) => [event.championship_match_id, event.id]),
  );

  const syncedEvents: Array<{
    eventId: string;
    opponentName: string;
    scheduledAt: string;
    competition: string;
    location?: string | null;
    homeAway: "home" | "away";
    goalsFor: number;
    goalsAgainst: number;
    result: "win" | "loss" | "draw";
  }> = [];

  for (const match of matches) {
    const existingEventId = existingByLinkId.get(match.championshipMatchId);
    const payload = {
      club_id: teamData.club_id,
      team_id: teamId,
      type: "match" as const,
      start_at: match.startAt,
      end_at: null,
      status: normalizeEventStatus(match.status ?? "scheduled"),
      title: match.title ?? null,
      championship_match_id: match.championshipMatchId,
    };

    if (existingEventId) {
      const { error: updateError } = await supabase
        .from("team_events")
        .update(payload)
        .eq("id", existingEventId);

      if (updateError) throw updateError;
      syncedEvents.push({
        eventId: existingEventId,
        opponentName: match.opponentName,
        scheduledAt: match.startAt,
        competition: match.competition,
        location: match.location ?? null,
        homeAway: match.homeAway,
        goalsFor: match.goalsFor,
        goalsAgainst: match.goalsAgainst,
        result: match.result,
      });
      continue;
    }

    const { data: insertedEvent, error: insertError } = await supabase
      .from("team_events")
      .insert({
        ...payload,
        created_by: userId,
      })
      .select("id")
      .single();

    if (insertError || !insertedEvent?.id) {
      throw insertError ?? new Error("Unable to create championship team event.");
    }

    syncedEvents.push({
      eventId: insertedEvent.id,
      opponentName: match.opponentName,
      scheduledAt: match.startAt,
      competition: match.competition,
      location: match.location ?? null,
      homeAway: match.homeAway,
      goalsFor: match.goalsFor,
      goalsAgainst: match.goalsAgainst,
      result: match.result,
    });
  }

  await syncMatchRows(syncedEvents);

  const desiredLinkIds = new Set(matches.map((match) => match.championshipMatchId));
  const staleEventIds = (existingEvents ?? [])
    .filter(
      (event) =>
        typeof event.id === "string" &&
        typeof event.championship_match_id === "string" &&
        !desiredLinkIds.has(event.championship_match_id),
    )
    .map((event) => event.id);

  if (staleEventIds.length === 0) return;

  try {
    const { error: deleteMatchesError } = await supabase
      .from("matches")
      .delete()
      .in("event_id", staleEventIds);

    if (deleteMatchesError) throw deleteMatchesError;

    const { error: deleteEventsError } = await supabase
      .from("team_events")
      .delete()
      .in("id", staleEventIds);

    if (deleteEventsError) throw deleteEventsError;
  } catch (error) {
    console.error("Erreur suppression anciens matchs championnat:", error);
    const { error: cancelError } = await supabase
      .from("team_events")
      .update({ status: "cancelled" })
      .in("id", staleEventIds);

    if (cancelError) throw cancelError;
  }
}
