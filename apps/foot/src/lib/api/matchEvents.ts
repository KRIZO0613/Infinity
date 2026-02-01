// Utilities for match_events (live match timeline entries).
import { supabase } from "@/lib/supabaseClient";
import type { Json } from "@/types/supabase";

export type MatchEventInput = {
  matchId: string;
  payload?: Record<string, Json>;
};

export async function addMatchEvent(matchId: string, payload?: Record<string, Json>) {
  const { error } = await supabase.from("match_events").insert({
    match_id: matchId,
    ...(payload ?? {}),
  });

  if (error) throw error;
}

// TODO: add aggregation helper to recompute stats from match_events.
