// Utilities for team_events, matches, training_sessions (core event timeline).
import { supabase } from "@/lib/supabaseClient";
import type { Json } from "@/types/supabase";

export type TeamEvent = {
  id: string;
  club_id: string;
  team_id: string;
  type: "match" | "training";
  start_at: string;
  end_at: string | null;
  status: string | null;
  title: string | null;
  location?: string | null;
};

export type CreateEventBaseInput = {
  clubId: string;
  teamId: string;
  startAt: string;
  endAt?: string | null;
  title?: string | null;
  status?: string | null;
  eventData?: Record<string, Json>;
};

export type CreateMatchEventInput = CreateEventBaseInput & {
  matchData?: Record<string, Json>;
};

export type CreateTrainingEventInput = CreateEventBaseInput & {
  trainingData?: Record<string, Json>;
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
  const { clubId, teamId, startAt, endAt, title, status, eventData, matchData } =
    input;

  const { data: eventDataRow, error: eventError } = await supabase
    .from("team_events")
    .insert({
      club_id: clubId,
      team_id: teamId,
      type: "match",
      start_at: startAt,
      end_at: endAt ?? null,
      title: title ?? null,
      status: status ?? null,
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
    eventData,
    trainingData,
  } = input;

  const { data: eventDataRow, error: eventError } = await supabase
    .from("team_events")
    .insert({
      club_id: clubId,
      team_id: teamId,
      type: "training",
      start_at: startAt,
      end_at: endAt ?? null,
      title: title ?? null,
      status: status ?? null,
      ...(eventData ?? {}),
    })
    .select("id")
    .single();

  if (eventError || !eventDataRow?.id) {
    throw eventError ?? new Error("Unable to create team event.");
  }

  const { error: trainingError } = await supabase
    .from("training_sessions")
    .insert({
      event_id: eventDataRow.id,
      ...(trainingData ?? {}),
    });

  if (trainingError) {
    await supabase.from("team_events").delete().eq("id", eventDataRow.id);
    throw trainingError;
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
