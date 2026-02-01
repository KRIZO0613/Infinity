// Utilities for player_event_stats and stat_types (stats layer).
import { supabase } from "@/lib/supabaseClient";
import type { Json } from "@/types/supabase";

export type StatTypeRow = {
  id: string;
  key: string;
  label: string | null;
};

export type PlayerAggregatedStat = {
  key: string;
  label: string;
  total: number;
};

export async function getPlayerAggregatedStats(playerId: string) {
  const { data: stats, error: statsError } = await supabase
    .from("player_event_stats")
    .select("stat_type_id,value")
    .eq("player_id", playerId);

  if (statsError) throw statsError;

  const { data: types, error: typesError } = await supabase
    .from("stat_types")
    .select("id,key,label");

  if (typesError) throw typesError;

  const byId = new Map<string, StatTypeRow>(
    (types ?? []).map((type) => [type.id, type as StatTypeRow]),
  );

  const totals = new Map<string, PlayerAggregatedStat>();
  (stats ?? []).forEach((row) => {
    const type = byId.get(row.stat_type_id);
    const key = type?.key ?? String(row.stat_type_id);
    const label = type?.label ?? key;
    const existing = totals.get(key);
    const value = Number(row.value ?? 0);

    totals.set(key, {
      key,
      label,
      total: (existing?.total ?? 0) + value,
    });
  });

  return Array.from(totals.values());
}

export async function savePlayerEventStat(
  playerId: string,
  eventId: string,
  statTypeKey: string,
  value: number,
  payload?: Record<string, Json>,
) {
  const { data: statType, error: typeError } = await supabase
    .from("stat_types")
    .select("id")
    .eq("key", statTypeKey)
    .single();

  if (typeError || !statType?.id) {
    throw typeError ?? new Error("Stat type introuvable.");
  }

  const { error } = await supabase.from("player_event_stats").upsert(
    {
      player_id: playerId,
      event_id: eventId,
      stat_type_id: statType.id,
      value,
      ...(payload ?? {}),
    },
    { onConflict: "player_id,event_id,stat_type_id" },
  );

  if (error) throw error;
}
