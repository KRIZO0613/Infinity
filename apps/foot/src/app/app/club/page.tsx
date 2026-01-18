"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/app/_components/DashboardLayout";
import InfoCard from "@/app/_components/InfoCard";
import InfoField from "@/app/_components/InfoField";

// même shape que ce que tu utilises déjà dans la sidebar
type MyClub = {
  club_id: string;
  club: {
    name: string | null;
    type?: string | null;
    plan?: string | null;
    city?: string | null;
    country?: string | null;
    address?: string | null;
  } | null;
};

type ClubUI = {
  name: string;
};

export default function ClubPage() {
  const router = useRouter();
  const [club, setClub] = useState<ClubUI | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);

        // ✅ Même source que la sidebar
        const { getMyClubs } = await import("@/lib/myClubs");
        const myClubs: MyClub[] = await getMyClubs();

        if (!mounted) return;

        if (myClubs.length && myClubs[0].club?.name) {
          setClub({ name: myClubs[0].club.name });
        } else {
          setClub(null);
        }

        setLoading(false);
      } catch (e) {
        console.error("ClubPage load error:", e);
        if (!mounted) return;
        setClub(null);
        setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const title = club?.name ?? (loading ? "Chargement…" : "Mon club");

  const subtitle = club
    ? "Club enregistré dans ton espace. Pas encore associé officiellement (clé d’accès)."
    : "Aucun club enregistré pour l’instant. Tu pourras en ajouter / associer un plus tard.";

  return (
    <DashboardLayout eyebrow="CLUB" title={title} subtitle={subtitle}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)]">
        {/* FICHE INFO PRINCIPALE */}
        <InfoCard title="⚽ Infos du club">
          {loading ? (
            <p className="text-sm text-slate-400">
              Chargement des informations du club…
            </p>
          ) : !club ? (
            <p className="text-sm text-slate-400">
              Aucun club n’est encore enregistré sur ce compte.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <InfoField label="Nom du club" value={club.name} />
 {/* Statut (custom pour pouvoir mettre le rond) */}
<div className="rounded-2xl border border-white/10 bg-white/5/5 p-4">
  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
    Statut
  </p>

  <div className="mt-2 inline-flex items-center gap-2 text-sm text-slate-200">
    {/* 🔴 tant que pas de clé */}
    <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
    <span>Pas encore associé (clé non configurée)</span>
  </div>
</div>

              {/* Bouton pour associer ce club */}
              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={() => router.push("/app/club/associate")}
                  className="mt-1 inline-flex items-center gap-2 rounded-full border border-[#8b5cf6]/60 bg-white/5 px-4 py-2 text-xs font-semibold text-[#c4b5fd] shadow-[0_8px_18px_rgba(139,92,246,0.25)] transition hover:border-[#8b5cf6]/80 hover:bg-white/10"
                >
                  🔑 Associer ce club
                </button>
              </div>
            </div>
          )}
        </InfoCard>

        {/* BLOC À VENIR */}
        <InfoCard
          title="🔮 À venir"
          description="Quand ton club sera officiellement associé, tu retrouveras ici les infos avancées."
        >
          <ul className="list-disc space-y-1 pl-4 text-[13px] text-slate-400">
            <li>Équipes et catégories</li>
            <li>Licences et accès coachs</li>
            <li>Stats globales du club</li>
          </ul>
        </InfoCard>
      </div>
    </DashboardLayout>
  );
}