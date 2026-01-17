"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  clearActiveClubId,
  getActiveClubId,
  setActiveClubId,
} from "@/lib/activeClub";
import DashboardLayout, { DashboardGrid } from "@/app/_components/DashboardLayout";
import ClubCard from "@/app/_components/ClubCard";
import StatCard from "@/app/_components/StatCard";
import SessionCard from "@/app/_components/SessionCard";

type Club = {
  id: string;
  name: string;
  type: string;
  plan: string;
};

export default function AppHome() {
  const router = useRouter();
  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        let clubId = getActiveClubId();

        if (!clubId) {
          const { getMyClubs } = await import("@/lib/myClubs");
          const myClubs = await getMyClubs();

          if (!myClubs.length) {
            clearActiveClubId();
            if (!cancelled) setLoading(false);
            router.replace("/onboarding?reason=no_club");
            return;
          }

          clubId = myClubs[0].club_id;

          if (!clubId) {
            clearActiveClubId();
            if (!cancelled) setLoading(false);
            router.replace("/onboarding?reason=no_club");
            return;
          }

          setActiveClubId(clubId);
        }

        const { data, error } = await supabase
          .from("clubs")
          .select("id,name,type,plan")
          .eq("id", clubId)
          .single();

        if (error || !data) {
          clearActiveClubId();
          if (!cancelled) setLoading(false);
          router.replace("/onboarding?reason=club_error");
          return;
        }

        if (!cancelled) {
          setClub(data as Club);
          setLoading(false);
        }
      } catch (error) {
        console.error("Erreur AppHome:", error);
        clearActiveClubId();
        if (!cancelled) setLoading(false);
        router.replace("/onboarding?reason=error");
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const clubName = club?.name ?? "—";
  const clubType = club?.type ?? "—";
  const clubPlan = club?.plan ?? "—";

  return (
    <DashboardLayout
      eyebrow="Tableau de bord"
      title="Infinity Foot"
      subtitle="Vue d’ensemble rapide de ton club et des sessions."
    >
      <DashboardGrid>
        <ClubCard
          clubName={clubName}
          clubType={clubType}
          clubPlan={clubPlan}
          statusLabel={loading ? "Chargement…" : "Actif"}
          loading={loading}
        />
        <StatCard
          title="Prochain entrainement"
          description="Aucun entrainement programme pour le moment."
          ctaLabel="Planifier un entrainement"
          ctaHint="Disponible bientot dans le planning."
          icon="calendar"
        />
      </DashboardGrid>
      <SessionCard title="Sessions recentes / a venir" sessions={[]} />
    </DashboardLayout>
  );
}
