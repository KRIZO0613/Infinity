"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ProfileForm from "@/app/_components/ProfileForm";
import InfoCard from "@/app/_components/InfoCard";
import InfoField from "@/app/_components/InfoField";
import {
  getActiveClubId,
  setActiveClubId,
  clearActiveClubId,
} from "@/lib/activeClub";

type Club = {
  id: string;
  name: string;
  type?: string | null;
  plan?: string | null;
};

export default function AccountPage() {
  const router = useRouter();
  const [club, setClub] = useState<Club | null>(null);
  const [clubLoading, setClubLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadClub() {
      try {
        setClubLoading(true);

        let clubId = getActiveClubId();

        if (!clubId) {
          const { getMyClubs } = await import("@/lib/myClubs");
          const my = await getMyClubs();

          if (!my.length) {
            clearActiveClubId();
            if (!cancelled) {
              setClub(null);
              setClubLoading(false);
            }
            return;
          }

          clubId = my[0].club_id;
          if (clubId) setActiveClubId(clubId);
        }

        if (!clubId) {
          if (!cancelled) {
            setClub(null);
            setClubLoading(false);
          }
          return;
        }

        const { data, error } = await supabase
          .from("clubs")
          .select("id,name,type,plan")
          .eq("id", clubId)
          .single();

        if (error || !data) {
          clearActiveClubId();
          if (!cancelled) {
            setClub(null);
            setClubLoading(false);
          }
          return;
        }

        if (!cancelled) {
          setClub(data as Club);
          setClubLoading(false);
        }
      } catch (e) {
        console.error("AccountPage club load:", e);
        if (!cancelled) {
          setClub(null);
          setClubLoading(false);
        }
      }
    }

    loadClub();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Fiche profil */}
      <InfoCard title="Mon profil">
        <ProfileForm />
      </InfoCard>

      {/* Fiche club actif */}
      <InfoCard
        title="Mon club"
        actions={
          <button
            type="button"
            onClick={() => router.push("/app/club")}
            className="inline-flex items-center text-slate-400 transition hover:text-slate-100"
            aria-label="Gérer le club"
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        }
      >
        <div className="text-sm text-slate-200">
          {clubLoading ? (
            <p className="text-slate-400">Chargement du club…</p>
          ) : !club ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-slate-400">Aucun club lié pour l’instant.</p>
              <button
                type="button"
                onClick={() => router.push("/onboarding?reason=no_club")}
                className="rounded-full border border-[#8b5cf6]/50 bg-white/5 px-4 py-2 text-xs font-semibold text-[#c4b5fd] shadow-[0_8px_18px_rgba(139,92,246,0.25)] transition hover:border-[#8b5cf6]/80 hover:bg-white/10"
              >
                Créer / rejoindre un club
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <InfoField label="Nom" value={club.name} />
              <InfoField label="Type" value={club.type ?? "—"} />
              <InfoField label="Plan" value={club.plan ?? "—"} />
            </div>
          )}
        </div>
      </InfoCard>
    </div>
  );
}
