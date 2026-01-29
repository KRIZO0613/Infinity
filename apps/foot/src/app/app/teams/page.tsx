"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import DashboardLayout from "@/app/_components/DashboardLayout";
import PlayerCard from "@/app/_components/cards/PlayerCard";
import { getActiveClubId, setActiveClubId } from "@/lib/activeClub";

type Team = {
  id: string;
  name: string;
  category: string | null;
  photo_url: string | null;
  players_count: number;
};

type TabKey = "teams" | "players" | "tactics";

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

export default function TeamsPage() {
  const router = useRouter();

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clubName, setClubName] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("teams");
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmTeam, setConfirmTeam] = useState<Team | null>(null);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "teams", label: "Équipes" },
    { key: "players", label: "Joueurs" },
    { key: "tactics", label: "Tactiques" },
  ];

  const activeTeam = useMemo(
    () => teams.find((t) => t.id === activeTeamId) ?? teams[0] ?? null,
    [teams, activeTeamId],
  );

  const loadTeams = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session?.user) {
        setTeams([]);
        setError("Session expirée, reconnecte-toi.");
        return;
      }

      const { data, error } = await supabase
        .from("teams")
        .select("id,name,category,photo_url,players_count")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Erreur chargement équipes:", error.message ?? error);
        setTeams([]);
        setError("Impossible de charger les équipes.");
        return;
      }

      setTeams((data ?? []) as Team[]);
    } catch (e) {
      console.error("Erreur chargement équipes:", e);
      setTeams([]);
      setError("Erreur inattendue lors du chargement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    let cancelled = false;

    async function loadClubName() {
      try {
        let clubId = getActiveClubId();

        if (!clubId) {
          const { getMyClubs } = await import("@/lib/myClubs");
          const myClubs = await getMyClubs();

          if (!myClubs.length) {
            if (!cancelled) setClubName(null);
            return;
          }

          clubId = myClubs[0].club_id;
          if (clubId) setActiveClubId(clubId);
        }

        if (!clubId) {
          if (!cancelled) setClubName(null);
          return;
        }

        const { data, error } = await supabase
          .from("clubs")
          .select("name")
          .eq("id", clubId)
          .single();

        if (error || !data) {
          if (!cancelled) setClubName(null);
          return;
        }

        if (!cancelled) setClubName(data.name ?? null);
      } catch (err) {
        console.error("Erreur chargement club:", err);
        if (!cancelled) setClubName(null);
      }
    }

    loadClubName();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (teams.length === 0) {
      setActiveTeamId(null);
      return;
    }
    const stillExists = teams.some((t) => t.id === activeTeamId);
    if (!activeTeamId || !stillExists) {
      setActiveTeamId(teams[0].id);
    }
  }, [teams, activeTeamId]);

  useEffect(() => {
    setMenuOpen(false);
  }, [activeTab, activeTeamId]);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointer = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  async function handleConfirmDelete() {
    if (!confirmTeam || deleting) return;
    setDeleting(true);

    const { error } = await supabase
      .from("teams")
      .delete()
      .eq("id", confirmTeam.id);

    if (error) {
      console.error("Erreur suppression équipe:", error.message ?? error);
      setDeleting(false);
      return;
    }

    setConfirmTeam(null);
    setDeleting(false);
    void loadTeams();
  }

  return (
    <DashboardLayout
      eyebrow={clubName ?? activeTeam?.name ?? "Équipes"}
      title=""
      subtitle="Gère tes équipes et joueurs."
    >
      {/* Onglets Équipes / Joueurs / Tactiques + paramètres */}
      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "rounded-full px-4 py-2 text-xs font-semibold transition",
                  isActive
                    ? "border border-white/10 bg-white/5 text-slate-100"
                    : "border border-white/10 bg-transparent text-slate-500 hover:bg-white/5 hover:text-slate-200",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative flex items-center gap-2" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/10 text-slate-200 transition hover:text-white"
            aria-label="Paramètres du club"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-10 z-30 w-52 rounded-xl border border-white/10 bg-[#0f111b] p-1 shadow-[0_16px_30px_rgba(0,0,0,0.35)]">
              <button
                type="button"
                onClick={() =>
                  activeTeam && router.push(`/app/teams/${activeTeam.id}/edit`)
                }
                disabled={!activeTeam}
                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-slate-200 transition hover:bg-white/5 disabled:opacity-50"
              >
                Modifier cette équipe
              </button>
              <button
                type="button"
                onClick={() => router.push("/app/teams/new")}
                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-slate-200 transition hover:bg-white/5"
              >
                Ajouter une équipe
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!activeTeam) return;
                  setMenuOpen(false);
                  setConfirmTeam(activeTeam);
                }}
                disabled={!activeTeam}
                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
              >
                Supprimer cette équipe
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Onglet Joueurs */}
      {activeTab === "players" ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <PlayerCard />
        </div>
      ) : activeTab === "tactics" ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-200">
          Zone tactiques (maquettes, schémas, animations) – à venir.
        </div>
      ) : (
        // Onglet Équipes (vue principale club + cartouche)
        <div className="mt-6">
          {/* PAS de "Mon équipe" ici, on passe direct à la grande carte */}

          <section
            className="
              relative overflow-hidden rounded-[32px]
              shadow-[0_26px_60px_rgba(0,0,0,0.85)]
            "
          >
            {loading ? (
              <div className="p-6">
                <div className="h-[360px] rounded-[26px] border border-white/10 bg-white/5" />
              </div>
            ) : error ? (
              <div className="p-6">
                <p className="text-sm text-rose-300">{error}</p>
              </div>
            ) : teams.length === 0 ? (
              <div className="p-6">
                <p className="text-sm text-slate-400">
                  Tu n’as pas encore créé d’équipe.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/app/teams/new")}
                  className="mt-4 w-fit rounded-full border border-[#8b5cf6]/60 bg-white/5 px-4 py-2 text-xs font-semibold text-[#c4b5fd] shadow-[0_8px_18px_rgba(139,92,246,0.25)] transition hover:border-[#8b5cf6]/80 hover:bg-white/10"
                >
                  Créer une équipe
                </button>
              </div>
            ) : activeTeam ? (
              <div className="relative min-h-[420px]">
                {/* IMAGE NETTE EN FOND */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveTeamImage(activeTeam.photo_url)}
                  alt={activeTeam.name}
                  className="absolute inset-0 h-full w-full object-cover"
                />

                {/* LÉGER ASSOMBRISSEMENT POUR LE TEXTE (PAS DE BLUR) */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/70" />
                {/* Lumière douce sur l'image */}
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_30%_0%,rgba(255,255,255,0.18),transparent_55%)] opacity-80" />
                {/* Halo violet/turquoise pour donner de la profondeur */}
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(130%_130%_at_0%_0%,rgba(168,85,247,0.35),transparent_55%),radial-gradient(130%_130%_at_100%_100%,rgba(56,189,248,0.25),transparent_55%)] opacity-60" />

                {/* CONTOUR VERRE AUTOUR DE LA CARTE (sans blur global) */}
                <div className="pointer-events-none absolute inset-0 rounded-[32px] border border-white/20" />
                <div className="pointer-events-none absolute inset-[1px] rounded-[31px] bg-[linear-gradient(180deg,rgba(255,255,255,0.22),rgba(255,255,255,0.02))] opacity-45 mix-blend-screen" />


                {/* CARTOUCHE INFOS EN BAS – on NE TOUCHE PAS à ton style */}
                <div className="absolute bottom-10 left-10 right-10 z-20">
                  <div
                    className={[
                      "relative mx-auto flex max-w-4xl items-center overflow-hidden",
                      "rounded-[30px] border border-white/35",
                      "bg-black/35 px-10 py-7 backdrop-blur-5xl",
                      "shadow-[0_26px_80px_rgba(0,0,0,0.85)]",
                      "before:pointer-events-none before:absolute before:inset-[1px]",
                      "before:rounded-[4px] before:border before:border-white/2",
                      "before:bg-[radial-gradient(160%_160%_at_10%_0%,rgba(255,255,255,0.22),transparent_60%),radial-gradient(160%_160%_at_90%_100%,rgba(15,23,42,0.95),transparent_60%)]",
                      "before:opacity-45",
                    ].join(" ")}
                  >
                    <div className="relative z-10">
                      <h3 className="text-3xl font-semibold tracking-tight text-white">
                        {activeTeam.name}
                      </h3>

                      <p className="mt-1 text-sm text-slate-100">
                        {activeTeam.category ?? "U12"}
                      </p>

                      <div className="mt-5 inline-flex gap-3">
                        <span className="inline-flex items-center rounded-full bg-white/15 px-5 py-1.5 text-[11px] font-medium text-slate-100 shadow-[0_0_12px_rgba(139,92,246,0.25)]">
                          {activeTeam.players_count} joueur
                          {activeTeam.players_count > 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      )}

      {/* Modal de confirmation de suppression */}
      {confirmTeam ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f111b] p-5 shadow-[0_20px_40px_rgba(0,0,0,0.45)]">
            <h3 className="text-sm font-semibold text-slate-100">
              Supprimer l’équipe “{confirmTeam.name}” ?
            </h3>
            <p className="mt-2 text-xs text-slate-400">
              Cette action est irréversible. L’équipe sera supprimée
              définitivement.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmTeam(null)}
                disabled={deleting}
                className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/5 disabled:opacity-60"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-400/70 hover:bg-rose-500/20 disabled:opacity-60"
              >
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
