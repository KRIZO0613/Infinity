"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import DashboardLayout from "@/app/_components/DashboardLayout";
import GameCardShell from "@/app/_components/cards/GameCardShell";
import { supabase } from "@/lib/supabaseClient";

type Team = {
  id: string;
  name: string;
  category: string | null;
  photo_url: string | null;
  players_count: number;
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

export default function TeamDetailPage() {
  const params = useParams<{ id: string }>();
  const teamId = useMemo(() => {
    if (!params?.id) return null;
    return Array.isArray(params.id) ? params.id[0] : params.id;
  }, [params]);

  const [team, setTeam] = useState<Team | null>(null);
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
        .select("id,name,category,photo_url,players_count")
        .eq("id", teamId)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error("Erreur chargement équipe:", error.message ?? error);
        setError("Impossible de charger l’équipe.");
        setTeam(null);
      } else {
        setTeam(data ?? null);
      }
      setLoading(false);
    }

    void loadTeam();

    return () => {
      mounted = false;
    };
  }, [teamId]);

  const title = team?.name ?? (loading ? "Chargement…" : "Équipe");
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

              <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/10 bg-black/45 p-5 backdrop-blur-md">
                <h3 className="text-lg font-semibold text-white">{team.name}</h3>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-200/80">
                  {team.category ?? "Catégorie non renseignée"}
                </p>
                <div className="mt-4 inline-flex gap-3">
                  <span className="rounded-full bg-black/40 px-3 py-1 text-[11px] text-slate-100">
                    {team.players_count} joueur
                    {team.players_count > 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              <div className="h-[520px]" />
            </div>
          </GameCardShell>
        )}
      </div>
    </DashboardLayout>
  );
}
