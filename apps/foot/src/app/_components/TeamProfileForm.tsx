"use client";

import { useEffect, useState } from "react";
import InfoField from "@/app/_components/InfoField";
import {
  TEAM_PLAYERS_PER_SIDE_VALUES,
  getMatchFormatFromPlayersPerSide,
  inferPlayersPerSideFromCategory,
} from "@/lib/teamProfile";
import { getActiveClubId } from "@/lib/activeClub";
import { supabase } from "@/lib/supabaseClient";

type TeamRecord = {
  id: string;
  club_id: string | null;
  name: string;
  category: string | null;
  level: string | null;
  squad_number: number | null;
  players_per_side: number | null;
  created_at: string | null;
};

type TeamFormState = {
  name: string;
  category: string;
  level: string;
  squadNumber: string;
  playersPerSide: string;
};

const EMPTY_FORM: TeamFormState = {
  name: "",
  category: "",
  level: "",
  squadNumber: "",
  playersPerSide: "",
};

function getErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "Erreur inconnue";

  const maybeError = error as { message?: string; code?: string };
  if (typeof maybeError.message !== "string") return "Erreur inconnue";
  if (!maybeError.code) return maybeError.message;

  return `${maybeError.message} | code: ${maybeError.code}`;
}

function isMissingColumnError(error: unknown, column: string) {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: string; message?: string };
  if (maybeError.code !== "PGRST204") return false;
  if (typeof maybeError.message !== "string") return false;

  return (
    maybeError.message.includes(`'${column}'`) &&
    maybeError.message.includes("'teams'")
  );
}

function toFormState(team: TeamRecord | null): TeamFormState {
  if (!team) return EMPTY_FORM;

  const inferredPlayersPerSide =
    typeof team.players_per_side === "number"
      ? team.players_per_side
      : inferPlayersPerSideFromCategory(team.category);

  return {
    name: team.name ?? "",
    category: team.category ?? "",
    level: team.level ?? "",
    squadNumber:
      typeof team.squad_number === "number" && team.squad_number > 0
        ? String(team.squad_number)
        : "",
    playersPerSide: String(inferredPlayersPerSide),
  };
}

function isAllowedPlayersPerSide(
  value: number,
): value is (typeof TEAM_PLAYERS_PER_SIDE_VALUES)[number] {
  return TEAM_PLAYERS_PER_SIDE_VALUES.includes(
    value as (typeof TEAM_PLAYERS_PER_SIDE_VALUES)[number],
  );
}

function formatPlayersPerSideLabel(
  value: number | null,
  category: string | null,
) {
  const playersPerSide =
    typeof value === "number" && isAllowedPlayersPerSide(value)
      ? value
      : inferPlayersPerSideFromCategory(category);

  const format = getMatchFormatFromPlayersPerSide(playersPerSide);

  return `Foot à ${playersPerSide} (${format})`;
}

async function loadTeamsForUser(userId: string) {
  const activeClubId = getActiveClubId();

  const selectClause =
    "id,club_id,name,category,level,squad_number,players_per_side,created_at";

  const loadWithQuery = async (clubId?: string | null) => {
    let query = supabase
      .from("teams")
      .select(selectClause)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (clubId) {
      query = query.eq("club_id", clubId);
    }

    return query;
  };

  let response = activeClubId ? await loadWithQuery(activeClubId) : null;

  if (
    response?.error &&
    (isMissingColumnError(response.error, "squad_number") ||
      isMissingColumnError(response.error, "players_per_side"))
  ) {
    response = null;
  }

  if (response && !response.error && response.data?.length) {
    return (response.data ?? []) as TeamRecord[];
  }

  if (!response || response.error) {
    const fallback = await supabase
      .from("teams")
      .select("id,club_id,name,category,level,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (fallback.error) throw fallback.error;

    return ((fallback.data ?? []) as TeamRecord[]).map((team) => ({
      ...team,
      squad_number: null,
      players_per_side: null,
    }));
  }

  const allTeams = await loadWithQuery(null);
  if (allTeams.error) throw allTeams.error;

  return (allTeams.data ?? []) as TeamRecord[];
}

export default function TeamProfileForm() {
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [form, setForm] = useState<TeamFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeClubId, setActiveClubId] = useState<string | null>(null);

  const selectedTeam =
    teams.find((team) => team.id === selectedTeamId) ?? teams[0] ?? null;

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (mounted) {
            setError("Impossible de charger l’équipe.");
            setLoading(false);
          }
          return;
        }

        const currentActiveClubId = getActiveClubId();
        const loadedTeams = await loadTeamsForUser(user.id);

        if (!mounted) return;

        setUserId(user.id);
        setActiveClubId(currentActiveClubId);
        setTeams(loadedTeams);

        const initialTeam = loadedTeams[0] ?? null;
        setSelectedTeamId(initialTeam?.id ?? null);
        setForm(toFormState(initialTeam));
        setLoading(false);
      } catch (loadError) {
        console.error("Erreur chargement mon équipe:", getErrorMessage(loadError));
        if (mounted) {
          setTeams([]);
          setSelectedTeamId(null);
          setForm(EMPTY_FORM);
          setError("Impossible de charger les informations d’équipe.");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTeam) {
      setForm(EMPTY_FORM);
      return;
    }

    if (!isEditing) {
      setForm(toFormState(selectedTeam));
    }
  }, [isEditing, selectedTeam]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!userId) {
      setError("Session expirée. Reconnecte-toi.");
      return;
    }

    if (!form.name.trim()) {
      setError("Le nom de l’équipe est obligatoire.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      level: form.level.trim() || null,
      squad_number: form.squadNumber.trim() ? Number(form.squadNumber) : null,
      players_per_side: form.playersPerSide.trim()
        ? Number(form.playersPerSide)
        : null,
    };

    try {
      if (selectedTeam) {
        const { data, error: updateError } = await supabase
          .from("teams")
          .update(payload)
          .eq("id", selectedTeam.id)
          .select(
            "id,club_id,name,category,level,squad_number,players_per_side,created_at",
          )
          .single();

        if (updateError) throw updateError;

        const updatedTeam = data as TeamRecord;
        setTeams((prev) =>
          prev.map((team) => (team.id === updatedTeam.id ? updatedTeam : team)),
        );
        setSelectedTeamId(updatedTeam.id);
        setForm(toFormState(updatedTeam));
      } else {
        const { data, error: insertError } = await supabase
          .from("teams")
          .insert({
            user_id: userId,
            club_id: activeClubId,
            ...payload,
            players_count: 0,
          })
          .select(
            "id,club_id,name,category,level,squad_number,players_per_side,created_at",
          )
          .single();

        if (insertError) throw insertError;

        const createdTeam = data as TeamRecord;
        setTeams([createdTeam]);
        setSelectedTeamId(createdTeam.id);
        setForm(toFormState(createdTeam));
      }

      setIsEditing(false);
    } catch (saveError) {
      console.error("Erreur enregistrement mon équipe:", getErrorMessage(saveError));
      setError("Impossible d’enregistrer les informations d’équipe.");
    } finally {
      setSaving(false);
    }
  }

  const canSwitchTeam = teams.length > 1;

  return (
    <div className="relative pt-4">
      <div className="absolute -top-2 right-0 flex items-center gap-3">
        {canSwitchTeam && !isEditing ? (
          <label className="sr-only" htmlFor="account-team-selector">
            Choisir une équipe
          </label>
        ) : null}

        {canSwitchTeam && !isEditing ? (
          <select
            id="account-team-selector"
            value={selectedTeam?.id ?? ""}
            onChange={(event) => setSelectedTeamId(event.target.value || null)}
            className="rounded-full border border-white/10 bg-[#11131a] px-3 py-1.5 text-xs text-slate-200 outline-none transition hover:border-white/20"
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id} className="bg-slate-950">
                {team.name}
              </option>
            ))}
          </select>
        ) : null}

        <button
          type="button"
          onClick={() => {
            setIsEditing((prev) => !prev);
            setError(null);
            setForm(toFormState(selectedTeam));
          }}
          className="inline-flex items-center text-slate-400 transition hover:text-slate-100"
          aria-label={isEditing ? "Fermer l’édition de l’équipe" : "Modifier l’équipe"}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
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
      </div>

      {isEditing ? (
        <form onSubmit={handleSubmit} className="space-y-5 pt-4">
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
            Nom de l’équipe
            <input
              type="text"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              className="rounded-xl border border-transparent bg-[#0f1116] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:bg-[#141827] focus:outline-none"
              placeholder="Ex: U13 Elite"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
              Catégorie
              <input
                type="text"
                value={form.category}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, category: event.target.value }))
                }
                className="rounded-xl border border-transparent bg-[#0f1116] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:bg-[#141827] focus:outline-none"
                placeholder="Ex: U12, U13, Senior, U12 F"
              />
            </label>

            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
              Niveau
              <input
                type="text"
                value={form.level}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, level: event.target.value }))
                }
                className="rounded-xl border border-transparent bg-[#0f1116] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:bg-[#141827] focus:outline-none"
                placeholder="Ex: D1, R1, Départemental 2"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
              Équipe
              <input
                type="number"
                min="1"
                value={form.squadNumber}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    squadNumber: event.target.value,
                  }))
                }
                className="rounded-xl border border-transparent bg-[#0f1116] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:bg-[#141827] focus:outline-none"
                placeholder="Ex: 2"
              />
            </label>

            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
              Nb joueurs
              <select
                value={form.playersPerSide}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    playersPerSide: event.target.value,
                  }))
                }
                className="rounded-xl border border-transparent bg-[#0f1116] px-3 py-2 text-sm text-slate-100 focus:bg-[#141827] focus:outline-none"
              >
                <option value="" className="bg-slate-950">
                  Non renseigné
                </option>
                {TEAM_PLAYERS_PER_SIDE_VALUES.map((value) => (
                  <option key={value} value={value} className="bg-slate-950">
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? <p className="text-xs text-rose-300">{error}</p> : null}

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full border border-[#8b5cf6]/50 bg-white/5 px-4 py-2 text-xs font-semibold text-[#c4b5fd] shadow-[0_8px_18px_rgba(139,92,246,0.25)] transition hover:border-[#8b5cf6]/80 hover:bg-white/10 disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : selectedTeam ? "Enregistrer" : "Créer l’équipe"}
            </button>
          </div>
        </form>
      ) : loading ? (
        <div className="grid gap-4 pt-4 md:grid-cols-2">
          <div className="h-16 animate-pulse rounded-2xl bg-white/5" />
          <div className="h-16 animate-pulse rounded-2xl bg-white/5" />
          <div className="h-16 animate-pulse rounded-2xl bg-white/5" />
          <div className="h-16 animate-pulse rounded-2xl bg-white/5" />
        </div>
      ) : selectedTeam ? (
        <div className="grid gap-4 pt-4 md:grid-cols-2">
          <InfoField label="Nom de l’équipe" value={selectedTeam.name} />
          <InfoField
            label="Catégorie"
            value={selectedTeam.category || "Non renseignée"}
          />
          <InfoField label="Niveau" value={selectedTeam.level || "—"} />
          <InfoField
            label="Équipe"
            value={
              selectedTeam.squad_number ? `Équipe ${selectedTeam.squad_number}` : "—"
            }
          />
          <InfoField
            label="Nb joueurs"
            value={formatPlayersPerSideLabel(
              selectedTeam.players_per_side,
              selectedTeam.category,
            )}
          />
        </div>
      ) : (
        <div className="pt-4 text-sm text-slate-400">
          <p>Aucune équipe liée pour l’instant.</p>
          <p className="mt-2 text-xs text-slate-500">
            Clique sur modifier pour renseigner ton équipe manuellement.
          </p>
          {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
        </div>
      )}
    </div>
  );
}
