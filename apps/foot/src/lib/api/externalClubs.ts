import { supabase } from "@/lib/supabaseClient";

export type ExternalClub = {
  id: string;
  name: string;
  city: string | null;
  district: string | null;
  league: string | null;
  slug: string;
};

export async function searchExternalClubs(
  query: string,
  limit = 15,
): Promise<ExternalClub[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const pattern = `%${trimmed}%`;
  try {
    const { data, error } = await supabase
      .from("external_clubs")
      .select("id,name,city,district,league,slug")
      .or(`name.ilike.${pattern},city.ilike.${pattern}`)
      .limit(limit);

    if (error) {
      console.error("Erreur recherche clubs externes:", error.message ?? error);
      return [];
    }

    return data ?? [];
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError") ||
      (typeof error === "object" &&
        error &&
        "message" in error &&
        String((error as { message?: string }).message)
          .toLowerCase()
          .includes("aborted"))
    ) {
      return [];
    }
    const err = error as Error;
    console.error(
      "Erreur recherche clubs externes:",
      err?.message ?? error,
    );
    return [];
  }
}
