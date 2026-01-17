import { supabase } from "./supabaseClient";
import { setActiveClubId } from "./activeClub";

export async function createClub(input: {
  name: string;
  type: "personal" | "official";
  city?: string;
}) {
  const { data, error } = await supabase
    .from("clubs")
    .insert({
      name: input.name,
      type: input.type,
      city: input.city ?? null,
    })
    .select("id")
    .single();

  if (error) throw error;

  setActiveClubId(data.id);
  return data.id;
}