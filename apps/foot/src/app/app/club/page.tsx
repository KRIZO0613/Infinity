"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  getActiveClubId,
  clearActiveClubId,
  setActiveClubId,
} from "@/lib/activeClub";
import DashboardLayout from "@/app/_components/DashboardLayout";
import InfoCard from "@/app/_components/InfoCard";
import InfoField from "@/app/_components/InfoField";

type Club = {
  id: string;
  name: string;
  type?: string | null;
  plan?: string | null;
  city?: string | null;
  country?: string | null;
  address?: string | null;
};

export default function ClubPage() {
  const router = useRouter();
  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);

        let clubId = getActiveClubId();

        // Même logique que sur le dashboard
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
          .select("id,name,type,plan,city,country,address")
          .eq("id", clubId)
          .single();

        if (error || !data) {
          console.error("Erreur chargement club:", error);
          clearActiveClubId();
          if (!cancelled) setLoading(false);
          router.replace("/onboarding?reason=club_error");
          return;
        }

        if (!cancelled) {
          setClub(data as Club);
          setLoading(false);
        }
      } catch (e) {
        console.error("Erreur ClubPage:", e);
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

  const isSolo = (club?.plan ?? "").toLowerCase() === "solo";

  const subtitle = isSolo
    ? "Vue simple de ton club lorsque tu utilises Infinity Foot comme coach individuel."
    : "Vue club complète (équipes, licences, etc.) — à venir.";

  const clubName = club?.name ?? (loading ? "Chargement…" : "Mon club");

  // 🔹 Helpers pour InfoField (string only)
  const cityCountry =
    club?.city || club?.country
      ? [club?.city, club?.country].filter(Boolean).join(" • ")
      : "Non renseigné";

  const address = club?.address || "Non renseignée";
  const clubIdValue = club?.id ?? "—";

  return (
    <DashboardLayout
      eyebrow="Mon club"
      title={clubName}
      subtitle={subtitle}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)]">
        {/* FICHE INFO PRINCIPALE */}
        <InfoCard
          title="Mon club"
          description="Ces infos s’affichent dans la page “Mon club”."
          actions={
            <button
              type="button"
              onClick={() => router.push("/app/account")}
              className="rounded-full border border-[#8b5cf6]/60 bg-transparent px-4 py-2 text-xs font-medium text-[#c4b5fd] shadow-[0_0_16px_rgba(139,92,246,0.55)] transition hover:bg-white/5"
            >
              Modifier
            </button>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <InfoField label="Nom du club" value={club?.name ?? "—"} />
            <InfoField label="Type" value={club?.type ?? "—"} />
            <InfoField label="Plan" value={club?.plan ?? "—"} />
            <InfoField label="Ville / pays" value={cityCountry} />
            <InfoField label="Adresse" value={address} />
            <InfoField label="Identifiant club" value={clubIdValue} />
          </div>

          {loading && (
            <p className="mt-4 text-xs text-slate-500">
              Chargement des informations du club…
            </p>
          )}
        </InfoCard>

        {/* FICHE “À VENIR” */}
        <InfoCard
          title={isSolo ? "À venir pour les coachs perso" : "Vue club avancée"}
          description={
            isSolo
              ? "Des raccourcis et modules spécifiques à ton usage individuel."
              : "Statistiques et gestion avancée du club."
          }
        >
          {isSolo ? (
            <ul className="list-disc space-y-1 pl-4 text-[13px] text-slate-400">
              <li>Lien rapide vers ton groupe principal / catégorie.</li>
              <li>Raccourcis vers les prochains entraînements.</li>
              <li>Bloc de notes rapides lié à ton club.</li>
            </ul>
          ) : (
            <ul className="list-disc space-y-1 pl-4 text-[13px] text-slate-400">
              <li>Nombre d’équipes et catégories.</li>
              <li>Licences utilisées / disponibles.</li>
              <li>Répartition par coach, catégorie et niveau.</li>
            </ul>
          )}
        </InfoCard>
      </div>
    </DashboardLayout>
  );
}