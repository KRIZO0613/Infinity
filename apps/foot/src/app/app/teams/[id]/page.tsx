"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import DashboardLayout from "@/app/_components/DashboardLayout";
import GameCardShell from "@/app/_components/cards/GameCardShell";
import TeamInfoPanel, {
  type CustomField,
} from "@/app/_components/cards/TeamInfoPanel";
import { formatTeamDisplayName } from "@/lib/teamProfile";
import { supabase } from "@/lib/supabaseClient";

type Team = {
  id: string;
  club_id: string | null;
  name: string;
  category: string | null;
  level: string | null;
  squad_number: number | null;
  photo_url: string | null;
  players_count: number;
  custom_fields: CustomField[] | null;
};

const DEFAULT_TEAM_IMAGE = "/images/teams/FOOTINFINEPH.jpg";
const resolveTeamImage = (src: string | null) => {
  if (!src) return DEFAULT_TEAM_IMAGE;
  if (
    src.startsWith("/") ||
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("data:")
  ) {
    return src;
  }
  return DEFAULT_TEAM_IMAGE;
};

const getAutoStatsConfig = (fields: CustomField[] | null) => {
  const config = { players_count: true };
  if (!Array.isArray(fields)) return config;
  fields.forEach((field) => {
    if (field?.kind !== "auto") return;
    if (field?.key === "players_count") {
      if (typeof field.visible === "boolean") {
        config.players_count = field.visible;
      }
    }
  });
  return config;
};

export default function TeamDetailPage() {
  const params = useParams<{ id: string }>();
  const teamId = useMemo(() => {
    if (!params?.id) return null;
    return Array.isArray(params.id) ? params.id[0] : params.id;
  }, [params]);

  useEffect(() => {
    if (!teamId) return;
    try {
      localStorage.setItem("activeTeamId", teamId);
    } catch {
      // ignore storage failures
    }
  }, [teamId]);

  const [team, setTeam] = useState<Team | null>(null);
  const [clubName, setClubName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadTeam() {
      if (!teamId) {
        setLoading(false);
        setError("Équipe introuvable.");
        return;
      }

      setLoading(true);
      setError(null);

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session?.user) {
        if (mounted) {
          setError("Session expirée, reconnecte-toi.");
          setTeam(null);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("teams")
        .select(
          "id,club_id,name,category,level,squad_number,photo_url,players_count,custom_fields",
        )
        .eq("id", teamId)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error("Erreur chargement équipe:", error.message ?? error);
        setError("Impossible de charger l’équipe.");
        setTeam(null);
        setClubName(null);
      } else {
        setTeam(data ?? null);

        if (data?.club_id) {
          const clubResponse = await supabase
            .from("clubs")
            .select("name")
            .eq("id", data.club_id)
            .maybeSingle();

          if (!mounted) return;

          setClubName(clubResponse.data?.name ?? null);
        } else {
          setClubName(null);
        }
      }
      setLoading(false);
    }

    void loadTeam();

    return () => {
      mounted = false;
    };
  }, [teamId]);

  const teamDisplayName = formatTeamDisplayName({
    clubName,
    name: team?.name,
    squadNumber: team?.squad_number ?? null,
    fallback: loading ? "Chargement…" : "Équipe",
  });
  const title = team?.id ? teamDisplayName : loading ? "Chargement…" : "Équipe";
  const subtitle = team?.category ?? "Catégorie non renseignée";

  return (
    <DashboardLayout eyebrow="Équipes" title={title} subtitle={subtitle}>
      <div className="mt-6">
        {loading ? (
          <div className="space-y-4">
            <div className="h-9 w-64 rounded-2xl bg-white/5" />
            <div className="h-[520px] rounded-3xl bg-white/5" />
          </div>
        ) : error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : !team ? (
          <p className="text-sm text-slate-400">
            Aucune équipe trouvée pour cet identifiant.
          </p>
        ) : (
          <GameCardShell className="relative border-transparent bg-transparent p-0 shadow-none">
            <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-black/35">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveTeamImage(team.photo_url)}
                alt={team.name}
                className="absolute inset-0 h-full w-full object-cover"
                onError={(event) => {
                  event.currentTarget.src = DEFAULT_TEAM_IMAGE;
                }}
              />
              <div className="absolute inset-0 bg-black/40" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/80" />

              <div className="absolute bottom-5 left-5 right-5">
                {(() => {
                  const autoStats = getAutoStatsConfig(team.custom_fields);
                  return (
                    <TeamInfoPanel
                      name={teamDisplayName}
                      category={team.category}
                      playersCount={team.players_count}
                      customFields={team.custom_fields ?? []}
                      showPlayersCount={autoStats.players_count}
                      className="max-w-3xl"
                    />
                  );
                })()}
              </div>

              <div className="h-[520px]" />
            </div>
          </GameCardShell>
        )}
      </div>
    </DashboardLayout>
  );
}
