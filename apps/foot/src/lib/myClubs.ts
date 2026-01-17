import { supabase } from "@/lib/supabaseClient";

export type MyClubMembership = {
  club_id: string;
  role: string;
  status: string;
  club: {
    id: string;
    name: string;
    type: string;
  };
};

export async function getMyClubs(): Promise<MyClubMembership[]> {
  // 1) récup l'utilisateur
  const { data: userData, error: uErr } = await supabase.auth.getUser();
  if (uErr) throw uErr;

  const userId = userData.user?.id;
  if (!userId) return [];

  // 2) récup ses memberships ACTIFS
  const { data: memberships, error: mErr } = await supabase
    .from("club_members")
    .select("club_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active");

  if (mErr) throw mErr;
  if (!memberships?.length) return [];

  const clubIds = memberships.map((m) => m.club_id);

  // 3) récup les clubs liés
  const { data: clubs, error: cErr } = await supabase
    .from("clubs")
    .select("id, name, type")
    .in("id", clubIds);

  if (cErr) throw cErr;

  const byId = new Map((clubs ?? []).map((c) => [c.id, c]));

  // 4) on joint memberships + club
  return memberships
    .map((m) => {
      const club = byId.get(m.club_id);
      if (!club) return null;
      return {
        ...m,
        club: club as { id: string; name: string; type: string },
      };
    })
    .filter((x): x is MyClubMembership => x !== null);
}