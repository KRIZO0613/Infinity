"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import DashboardLayout from "@/app/_components/DashboardLayout";
import TeamInfoPanel, {
  type CustomField,
} from "@/app/_components/cards/TeamInfoPanel";
import PlayerCardCarousel from "@/app/app/teams/_components/PlayerCardCarousel";
import PlayerList from "@/app/app/teams/_components/PlayerList";
import PlayerSelect from "@/app/app/teams/_components/PlayerSelect";
import PlayerModal from "@/app/app/teams/_components/PlayerModal";
import type { Player } from "@/app/app/teams/_types/player";
import { getActiveClubId, setActiveClubId } from "@/lib/activeClub";
import { TEAM_FIELD_LIBRARY } from "@/app/app/teams/_config/teamFieldLibrary";

type Team = {
  id: string;
  club_id: string | null;
  name: string;
  category: string | null;
  photo_url: string | null;
  players_count: number;
  custom_fields: CustomField[] | null;
};

type TabKey = "teams" | "players" | "tactics";

type CustomFieldDraft = {
  id: string;
  key: string | null;
  label: string;
  value: string;
  visible: boolean;
  mode: "library" | "custom" | "unset";
};

const TEAM_FIELD_BY_KEY = new Map(
  TEAM_FIELD_LIBRARY.map((field) => [field.key, field]),
);

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

  const [players, setPlayers] = useState<Player[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [playersView, setPlayersView] = useState<
    "cards" | "list" | "select"
  >("cards");
  const [activePlayerIndex, setActivePlayerIndex] = useState(0);
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmTeam, setConfirmTeam] = useState<Team | null>(null);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editPhotoUrl, setEditPhotoUrl] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<CustomFieldDraft[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showCustomFields, setShowCustomFields] = useState(false);
  const [showAutoStats, setShowAutoStats] = useState(false);
  const [openFieldMenuId, setOpenFieldMenuId] = useState<string | null>(null);
  const [openValueMenuId, setOpenValueMenuId] = useState<string | null>(null);
  const [editAutoStats, setEditAutoStats] = useState<{
    players_count: boolean;
  }>({ players_count: true });

  const tabs: { key: TabKey; label: string }[] = [
    { key: "teams", label: "Équipes" },
    { key: "players", label: "Joueurs" },
    { key: "tactics", label: "Statistiques" },
  ];

  const activeTeam = useMemo(
    () => teams.find((t) => t.id === activeTeamId) ?? teams[0] ?? null,
    [teams, activeTeamId],
  );

  const getPlayersViewIcon = (mode: "cards" | "list" | "select") => {
    if (mode === "list") {
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 6h12" />
          <path d="M8 12h12" />
          <path d="M8 18h12" />
          <circle cx="4" cy="6" r="1" />
          <circle cx="4" cy="12" r="1" />
          <circle cx="4" cy="18" r="1" />
        </svg>
      );
    }
    if (mode === "select") {
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 4l7 14 2-5 5-2L4 4z" />
          <path d="M12 12l4 4" />
        </svg>
      );
    }
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="4" y="4" width="7" height="7" rx="2" />
        <rect x="13" y="4" width="7" height="7" rx="2" />
        <rect x="4" y="13" width="7" height="7" rx="2" />
        <rect x="13" y="13" width="7" height="7" rx="2" />
      </svg>
    );
  };

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
        .select("id,club_id,name,category,photo_url,players_count,custom_fields")
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

  const loadPlayers = useCallback(async () => {
    if (!activeTeam?.id) {
      setPlayers([]);
      setPlayersLoading(false);
      setPlayersError(null);
      return;
    }

    try {
      setPlayersLoading(true);
      setPlayersError(null);

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session?.user) {
        setPlayers([]);
        setPlayersError("Session expirée, reconnecte-toi.");
        return;
      }

      const { data, error } = await supabase
        .from("players")
        .select(
          "id,club_id,team_id,first_name,last_name,license_number,photo_url,custom_fields,created_at",
        )
        .eq("team_id", activeTeam.id)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Erreur chargement joueurs:", error.message ?? error);
        setPlayers([]);
        setPlayersError("Impossible de charger les joueurs.");
        return;
      }

      const normalized = (data ?? []).map((item) => ({
        ...item,
        first_name: item.first_name ?? "",
        last_name: item.last_name ?? "",
        license_number: item.license_number ?? "",
        custom_fields: Array.isArray(item.custom_fields)
          ? item.custom_fields.map((field: any, index: number) => ({
              id: typeof field?.id === "string" ? field.id : crypto.randomUUID(),
              label: typeof field?.label === "string" ? field.label : "",
              value: typeof field?.value === "string" ? field.value : "",
              type:
                field?.type === "url"
                  ? "link"
                  : (field?.type as any) || "text",
              order:
                typeof field?.order === "number" ? field.order : index + 1,
              active:
                typeof field?.active === "boolean" ? field.active : true,
            }))
          : [],
      })) as Player[];
      setPlayers(normalized);
    } catch (err) {
      console.error("Erreur chargement joueurs:", err);
      setPlayers([]);
      setPlayersError("Erreur inattendue lors du chargement.");
    } finally {
      setPlayersLoading(false);
    }
  }, [activeTeam?.id]);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    void loadPlayers();
  }, [loadPlayers]);

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
    setActivePlayerIndex(0);
  }, [players]);

  useEffect(() => {
    setMenuOpen(false);
  }, [activeTab, activeTeamId]);

  const normalizeCustomFields = useCallback(
    (fields: Team["custom_fields"]): CustomField[] => {
      if (!Array.isArray(fields)) return [];
      return fields
        .map((field) => ({
          label:
            typeof field?.key === "string" && TEAM_FIELD_BY_KEY.has(field.key)
              ? TEAM_FIELD_BY_KEY.get(field.key)!.label
              : typeof field?.label === "string"
              ? field.label.trim()
              : "",
          value:
            typeof field?.value === "string" ? field.value.trim() : "",
          visible:
            typeof field?.visible === "boolean" ? field.visible : true,
          kind:
            field?.kind === "auto" || field?.kind === "manual"
              ? field.kind
              : "manual",
          key: typeof field?.key === "string" ? field.key : null,
        }))
        .filter((field) => field.label && field.value);
    },
    [],
  );

  const getAutoStatsConfig = useCallback(
    (fields: Team["custom_fields"]) => {
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
    },
    [],
  );

  const openEditModal = useCallback(() => {
    if (!activeTeam) return;
    setEditPhotoUrl(activeTeam.photo_url ?? null);
    const allFields = normalizeCustomFields(activeTeam.custom_fields);
    const presetFields = allFields
      .filter((field) => field.kind !== "auto")
      .map((field, index) => {
        const mode: CustomFieldDraft["mode"] = field.key
          ? "library"
          : field.label
          ? "custom"
          : "unset";
        return {
          id: `${activeTeam.id}-${index}-${field.label}`,
          key: field.key ?? null,
          label: field.label,
          value: field.value,
          visible: field.visible !== false,
          mode,
        };
      });
    const autoConfig = getAutoStatsConfig(activeTeam.custom_fields);
    setEditAutoStats(autoConfig);
    setEditFields(presetFields);
    setEditError(null);
    setShowCustomFields(false);
    setShowAutoStats(false);
    setOpenFieldMenuId(null);
    setOpenValueMenuId(null);
    setEditOpen(true);
  }, [activeTeam, normalizeCustomFields]);

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      setEditPhotoUrl(typeof result === "string" ? result : null);
    };
    reader.onerror = (err) => {
      console.error("Erreur chargement image équipe:", err);
    };
    reader.readAsDataURL(file);
  };

  const handleAddField = () => {
    setEditFields((prev) => [
      ...prev,
      {
        id: `field-${Date.now()}-${prev.length}`,
        key: null,
        label: "",
        value: "",
        visible: true,
        mode: "unset",
      },
    ]);
  };

  const handleSaveEdit = async () => {
    if (!activeTeam || savingEdit) return;
    setSavingEdit(true);
    setEditError(null);

    const payloadFields = editFields
      .map((field) => ({
        key: field.key ?? null,
        label:
          field.key && TEAM_FIELD_BY_KEY.has(field.key)
            ? TEAM_FIELD_BY_KEY.get(field.key)!.label
            : field.label.trim(),
        value: field.value.trim(),
        visible: field.visible,
        kind: "manual" as const,
      }))
      .filter((field) => field.label && field.value);

    const autoFields: CustomField[] = [
      {
        key: "players_count",
        label: "Joueurs",
        value: "",
        visible: editAutoStats.players_count,
        kind: "auto",
      },
    ];

    const mergedFields = [...payloadFields, ...autoFields];

    const { error: updateError } = await supabase
      .from("teams")
      .update({
        photo_url: editPhotoUrl ?? null,
        custom_fields: mergedFields.length ? mergedFields : null,
      })
      .eq("id", activeTeam.id);

    if (updateError) {
      setEditError(updateError.message);
      setSavingEdit(false);
      return;
    }

    setEditOpen(false);
    setSavingEdit(false);
    void loadTeams();
  };

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

  useEffect(() => {
    if (!openFieldMenuId) return;

    const handlePointer = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("[data-field-menu]")) return;
      setOpenFieldMenuId(null);
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenFieldMenuId(null);
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openFieldMenuId]);

  useEffect(() => {
    if (!openValueMenuId) return;

    const handlePointer = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("[data-value-menu]")) return;
      setOpenValueMenuId(null);
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenValueMenuId(null);
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openValueMenuId]);

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

  const handleCreatePlayer = () => {
    setEditingPlayer(null);
    setPlayerModalOpen(true);
  };

  const handleEditPlayer = (player: Player) => {
    setEditingPlayer(player);
    setPlayerModalOpen(true);
  };

  const handlePlayerSaved = () => {
    setPlayerModalOpen(false);
    setEditingPlayer(null);
    void loadPlayers();
  };

  const handlePlayerDeleted = () => {
    setPlayerModalOpen(false);
    setEditingPlayer(null);
    void loadPlayers();
  };

  return (
    <DashboardLayout
      eyebrow=""
      title={activeTeam?.name ?? clubName ?? "Équipes"}
      subtitle=""
      headerRight={
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "rounded-full px-3 py-1.5 text-[11px] font-semibold transition",
                  isActive
                    ? "border border-white/10 bg-white/5 text-slate-100"
                    : "border border-white/10 bg-transparent text-slate-500 hover:bg-white/5 hover:text-slate-200",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
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
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </svg>
            </button>

            {menuOpen ? (
              <div className="absolute right-0 top-10 z-30 w-52 rounded-xl border border-white/10 bg-[#0f111b] p-1 shadow-[0_16px_30px_rgba(0,0,0,0.35)]">
                {activeTab !== "players" ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeTeam) return;
                      setMenuOpen(false);
                      openEditModal();
                    }}
                    disabled={!activeTeam}
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-slate-200 transition hover:bg-white/5 disabled:opacity-50"
                  >
                    Modifier cette équipe
                  </button>
                ) : null}
                {activeTab === "players" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleCreatePlayer();
                    }}
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-slate-200 transition hover:bg-white/5"
                  >
                    Ajouter un joueur
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => router.push("/app/teams/new")}
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-slate-200 transition hover:bg-white/5"
                  >
                    Ajouter une équipe
                  </button>
                )}
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
      }
    >
      {activeTab === "players" ? (
        <div className="mt-2 flex items-center gap-2">
          {(["cards", "list", "select"] as const).map((mode) => {
            const isActive = playersView === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPlayersView(mode)}
                  className={[
                  "inline-flex h-6 w-6 items-center justify-center text-[0px] transition",
                  isActive
                    ? "text-slate-100"
                    : "text-slate-500 hover:text-slate-200",
                  ].join(" ")}
                  aria-label={
                    mode === "cards"
                    ? "Affichage cartes"
                    : mode === "list"
                    ? "Affichage liste"
                    : "Affichage sélecteur"
                }
              >
                {getPlayersViewIcon(mode)}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Onglet Joueurs */}
      {activeTab === "players" ? (
        <div className="mt-4 space-y-4">

          {!activeTeam ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400">
              Sélectionne une équipe pour afficher les joueurs.
            </div>
          ) : playersLoading ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400">
              Chargement des joueurs...
            </div>
          ) : playersError ? (
            <div className="rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-sm text-rose-200">
              {playersError}
            </div>
          ) : players.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400">
              Aucun joueur enregistré pour cette équipe.
            </div>
          ) : playersView === "cards" ? (
            <PlayerCardCarousel
              players={players}
              activeIndex={Math.min(activePlayerIndex, players.length - 1)}
              teamCategory={activeTeam?.category ?? null}
              onPrev={() =>
                setActivePlayerIndex((prev) =>
                  prev - 1 < 0 ? players.length - 1 : prev - 1,
                )
              }
              onNext={() =>
                setActivePlayerIndex((prev) =>
                  prev + 1 >= players.length ? 0 : prev + 1,
                )
              }
              onEdit={handleEditPlayer}
            />
          ) : playersView === "list" ? (
            <PlayerList
              players={players}
              onEdit={handleEditPlayer}
              teamName={activeTeam?.name}
            />
          ) : (
            <PlayerSelect players={players} onSelect={handleEditPlayer} />
          )}
        </div>
      ) : activeTab === "tactics" ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-200">
          Zone statistiques – à venir.
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
                  {(() => {
                    const autoStats = getAutoStatsConfig(
                      activeTeam.custom_fields,
                    );
                    return (
                  <TeamInfoPanel
                    name={activeTeam.name}
                    category={activeTeam.category}
                    playersCount={activeTeam.players_count}
                    customFields={normalizeCustomFields(
                      activeTeam.custom_fields,
                    )}
                    showPlayersCount={autoStats.players_count}
                  />
                    );
                  })()}
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

      {editOpen && activeTeam ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0b0f1a] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Paramètres
                </p>
                <h3 className="text-xl font-semibold text-slate-100">
                  Modifier l’équipe
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/5"
              >
                Fermer
              </button>
            </div>

            <div className="mt-6 space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Changer la photo
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <div className="h-20 w-20 overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                    {editPhotoUrl ? (
                      <img
                        src={editPhotoUrl}
                        alt="Aperçu"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-500">
                        Aperçu
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="text-xs text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-200 hover:file:bg-white/15"
                  />
                  {editPhotoUrl ? (
                    <button
                      type="button"
                      onClick={() => setEditPhotoUrl(null)}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >
                      Retirer la photo
                    </button>
                  ) : null}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCustomFields((prev) => !prev)}
                    className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
                  >
                    Champs personnalisés
                    <svg
                      aria-hidden="true"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={[
                        "transition",
                        showCustomFields ? "rotate-180" : "rotate-0",
                      ].join(" ")}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {showCustomFields ? (
                    <button
                      type="button"
                      onClick={handleAddField}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-100 transition hover:bg-white/10"
                    >
                      + Ajouter un champ
                    </button>
                  ) : null}
                </div>

                {showCustomFields ? (
                  <div className="mt-4 space-y-3">
                    {editFields.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Aucun champ personnalisé.
                      </p>
                    ) : (
                    editFields.map((field) => {
                      const usedKeys = editFields
                        .map((item) => item.key)
                        .filter((key): key is string => Boolean(key));
                      const availableDefs = TEAM_FIELD_LIBRARY.filter(
                        (definition) =>
                          !usedKeys.includes(definition.key) ||
                          definition.key === field.key,
                      );
                      const definition = field.key
                        ? TEAM_FIELD_BY_KEY.get(field.key) ?? null
                        : null;
                      const labelValue = field.key
                        ? definition?.label ?? field.label
                        : field.label;
                      const menuOpen = openFieldMenuId === field.id;

                      return (
                        <div
                          key={field.id}
                          className="grid items-center gap-3 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_auto_auto]"
                        >
                          <div className="flex items-center gap-2" data-field-menu>
                            {field.mode === "library" && field.key ? (
                              <input
                                type="text"
                                value={labelValue}
                                readOnly
                                className="h-8 w-full rounded-lg border border-white/5 bg-black/25 px-2.5 text-[11px] text-slate-100 outline-none focus:border-white/15 sm:max-w-[200px]"
                              />
                            ) : (
                              <input
                                type="text"
                                value={labelValue}
                                onChange={(event) =>
                                  setEditFields((prev) =>
                                    prev.map((item) =>
                                      item.id === field.id
                                        ? {
                                            ...item,
                                            label: event.target.value,
                                            mode: "custom",
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                placeholder="Label"
                                className="h-8 w-full rounded-lg border border-white/5 bg-black/25 px-2.5 text-[11px] text-slate-100 outline-none transition focus:border-white/20 sm:max-w-[200px]"
                              />
                            )}

                            <div className="relative">
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenFieldMenuId((prev) =>
                                    prev === field.id ? null : field.id,
                                  )
                                }
                                className="inline-flex h-5 w-5 items-center justify-center text-slate-400 transition hover:text-slate-200"
                                aria-label="Choisir une info"
                                aria-haspopup="listbox"
                                aria-expanded={menuOpen}
                              >
                                <svg
                                  aria-hidden="true"
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M6 9l6 6 6-6" />
                                </svg>
                              </button>

                              {menuOpen ? (
                                <div className="absolute right-0 top-6 z-30 w-48 max-h-44 overflow-y-auto rounded-lg border border-white/5 bg-[#0c1018] p-1 shadow-[0_12px_24px_rgba(0,0,0,0.35)]">
                                  {availableDefs.map((definition) => (
                                    <button
                                      key={definition.key}
                                      type="button"
                                      onClick={() => {
                                        setEditFields((prev) =>
                                          prev.map((item) => {
                                            if (item.id !== field.id) return item;
                                            const nextValue =
                                              definition.type === "select" &&
                                              definition.options?.length
                                                ? definition.options.includes(
                                                    item.value,
                                                  )
                                                  ? item.value
                                                  : definition.options[0]
                                                : item.value;
                                            return {
                                              ...item,
                                              key: definition.key,
                                              label: definition.label,
                                              value: nextValue,
                                              mode: "library",
                                            };
                                          }),
                                        );
                                        setOpenFieldMenuId(null);
                                      }}
                                      className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[11px] text-slate-300 transition hover:bg-white/[0.04] hover:text-slate-100"
                                    >
                                      {definition.label}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditFields((prev) =>
                                        prev.map((item) =>
                                          item.id === field.id
                                            ? {
                                                ...item,
                                                key: null,
                                                label: "",
                                                mode: "custom",
                                              }
                                            : item,
                                        ),
                                      );
                                      setOpenFieldMenuId(null);
                                      }}
                                    className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[11px] text-slate-300 transition hover:bg-white/[0.04] hover:text-slate-100"
                                  >
                                    Autre...
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>

                          {definition?.type === "select" ? (
                            <div className="flex items-center gap-2" data-value-menu>
                              <input
                                type="text"
                                value={field.value}
                                readOnly
                                placeholder="Valeur"
                                className="h-8 w-full rounded-lg border border-white/5 bg-black/25 px-2.5 text-[11px] text-slate-100 outline-none"
                              />
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenValueMenuId((prev) =>
                                      prev === field.id ? null : field.id,
                                    )
                                  }
                                  className="inline-flex h-5 w-5 items-center justify-center text-slate-400 transition hover:text-slate-200"
                                  aria-label="Choisir une valeur"
                                  aria-haspopup="listbox"
                                  aria-expanded={openValueMenuId === field.id}
                                >
                                  <svg
                                    aria-hidden="true"
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M6 9l6 6 6-6" />
                                  </svg>
                                </button>

                                {openValueMenuId === field.id ? (
                                  <div className="absolute right-0 top-6 z-30 w-40 max-h-40 overflow-y-auto rounded-lg border border-white/5 bg-[#0c1018] p-1 shadow-[0_12px_24px_rgba(0,0,0,0.35)]">
                                    {(definition.options ?? []).map((option) => (
                                      <button
                                        key={option}
                                        type="button"
                                        onClick={() => {
                                          setEditFields((prev) =>
                                            prev.map((item) =>
                                              item.id === field.id
                                                ? { ...item, value: option }
                                                : item,
                                            ),
                                          );
                                          setOpenValueMenuId(null);
                                        }}
                                        className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[11px] text-slate-300 transition hover:bg-white/[0.04] hover:text-slate-100"
                                      >
                                        {option}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : (
                            <input
                              type={
                                definition?.type === "number" ||
                                definition?.type === "year"
                                  ? "number"
                                  : definition?.type === "date"
                                  ? "date"
                                  : "text"
                              }
                              min={definition?.type === "year" ? 2000 : undefined}
                              max={definition?.type === "year" ? 2100 : undefined}
                              placeholder={
                                definition?.type === "year" ? "2013" : "Valeur"
                              }
                              value={field.value}
                              onChange={(event) =>
                                setEditFields((prev) =>
                                  prev.map((item) =>
                                    item.id === field.id
                                      ? { ...item, value: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                              className="h-8 w-full rounded-lg border border-white/5 bg-black/25 px-2.5 text-[11px] text-slate-100 outline-none transition focus:border-white/20"
                            />
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setEditFields((prev) =>
                                prev.map((item) =>
                                  item.id === field.id
                                    ? {
                                        ...item,
                                        visible: !item.visible,
                                      }
                                    : item,
                                ),
                              )
                            }
                            className={[
                              "h-3.5 w-3.5 rounded-full border transition",
                              field.visible
                                ? "border-emerald-200/50 bg-emerald-300/80 shadow-[0_0_8px_rgba(16,185,129,0.45)]"
                                : "border-rose-200/30 bg-rose-400/30 opacity-70",
                            ].join(" ")}
                            aria-label={field.visible ? "Afficher" : "Caché"}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setEditFields((prev) =>
                                prev.filter((item) => item.id !== field.id),
                              )
                            }
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-300 transition hover:text-rose-300"
                            aria-label="Supprimer"
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
                              <path d="M3 6h18" />
                              <path d="M8 6v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                          </button>
                        </div>
                      );
                    })
                    )}
                  </div>
                ) : null}
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAutoStats((prev) => !prev)}
                    className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
                  >
                    Stat automatique
                    <svg
                      aria-hidden="true"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={[
                        "transition",
                        showAutoStats ? "rotate-180" : "rotate-0",
                      ].join(" ")}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                </div>

                {showAutoStats ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                      <div>
                        <p className="text-xs text-slate-200">Nb joueurs</p>
                        <p className="text-[11px] text-slate-500">Auto</p>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>
                          {editAutoStats.players_count ? "Affiché" : "Caché"}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setEditAutoStats((prev) => ({
                              ...prev,
                              players_count: !prev.players_count,
                            }))
                          }
                          className={[
                            "h-4 w-4 rounded-full border transition",
                            editAutoStats.players_count
                              ? "border-emerald-300/60 bg-emerald-400/80 shadow-[0_0_10px_rgba(16,185,129,0.6)]"
                              : "border-rose-300/40 bg-rose-500/30 opacity-70",
                          ].join(" ")}
                          aria-label={
                            editAutoStats.players_count ? "Afficher" : "Caché"
                          }
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {editError ? (
                <p className="text-xs text-rose-300">{editError}</p>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="rounded-full border border-white/10 px-4 py-2 text-xs text-slate-300 transition hover:bg-white/5"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="rounded-full border border-[#8b5cf6]/60 bg-white/5 px-4 py-2 text-xs font-semibold text-[#c4b5fd] shadow-[0_8px_18px_rgba(139,92,246,0.25)] transition hover:border-[#8b5cf6]/80 hover:bg-white/10 disabled:opacity-60"
                >
                  {savingEdit ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <PlayerModal
        open={playerModalOpen && Boolean(activeTeam)}
        clubId={activeTeam?.club_id ?? null}
        teamId={activeTeam?.id ?? ""}
        player={editingPlayer}
        onClose={() => {
          setPlayerModalOpen(false);
          setEditingPlayer(null);
        }}
        onSaved={handlePlayerSaved}
        onDeleted={handlePlayerDeleted}
      />
    </DashboardLayout>
  );
}
