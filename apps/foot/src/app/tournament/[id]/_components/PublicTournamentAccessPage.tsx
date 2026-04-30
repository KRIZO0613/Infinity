"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { TournamentWorkspace } from "@/app/app/teams/[id]/matches/_components/tournament-product/TournamentWorkspace";
import { TournamentPreview } from "@/components/tournament-preview/TournamentPreview";
import {
  getStoredManualTournamentProductById,
  upsertStoredManualTournamentProduct,
  type StoredManualTournamentProduct,
} from "@/app/tournament/_lib/manualTournamentProducts";
import {
  loadTournament as loadTournamentFromSupabase,
  saveTournament as saveTournamentToSupabase,
} from "@/lib/tournamentService";
import type { TournamentProductSavedTournament } from "@/app/app/teams/[id]/matches/_components/tournament-product/types";

const CLASSIC_TOURNAMENT_STORAGE_PREFIX = "infinity:tournaments:";

type PublicTournamentAccessPageProps = {
  role: "coach" | "parent";
};

type LoadedTournamentEntry = {
  tournament: TournamentProductSavedTournament;
  groups: NonNullable<TournamentProductSavedTournament["groups"]>;
  previewDataByDivision: NonNullable<TournamentProductSavedTournament["manualPreviewDataByDivision"]>;
  localManualEntry: StoredManualTournamentProduct | null;
};

export function PublicTournamentAccessPage({
  role,
}: PublicTournamentAccessPageProps) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tournamentId = typeof params?.id === "string" ? params.id : "";
  const token = searchParams.get("token") || "";
  const coachTeamName = searchParams.get("team") || searchParams.get("teamId") || null;
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<LoadedTournamentEntry | null>(null);
  const [coachTeamDraft, setCoachTeamDraft] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadEntry = async () => {
      if (!tournamentId) {
        setLoading(false);
        return;
      }

      try {
        const remoteTournament =
          await loadTournamentFromSupabase<TournamentProductSavedTournament>(tournamentId);

        if (cancelled) return;

        if (remoteTournament) {
          const localManualEntry = getStoredManualTournamentProductById(tournamentId);
          setEntry({
            tournament: remoteTournament,
            groups: remoteTournament.groups ?? localManualEntry?.groups ?? [],
            previewDataByDivision:
              remoteTournament.manualPreviewDataByDivision ??
              localManualEntry?.previewDataByDivision ??
              [],
            localManualEntry,
          });
          setLoading(false);
          return;
        }
      } catch (error) {
        console.error("Erreur chargement accès public tournoi:", error);
      }

      if (cancelled) return;

      const localManualEntry = getStoredManualTournamentProductById(tournamentId);
      if (!localManualEntry) {
        setEntry(null);
        setLoading(false);
        return;
      }

      setEntry({
        tournament: localManualEntry.tournament,
        groups: localManualEntry.groups,
        previewDataByDivision: localManualEntry.previewDataByDivision,
        localManualEntry,
      });
      setLoading(false);
    };

    void loadEntry();

    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  const structurePreviewByDivision = useMemo(
    () =>
      entry?.previewDataByDivision.map((division) => ({
        id: division.id,
        label: division.name,
        content: <TournamentPreview data={division.data} layout="split" showHeader={false} />,
      })) ?? [],
    [entry],
  );

  const structurePreview = useMemo(() => {
    if (!entry || structurePreviewByDivision.length === 0) return null;

    return (
      <div className="space-y-6">
        {structurePreviewByDivision.map((division) => (
          <section key={division.id} className="space-y-3">
            {structurePreviewByDivision.length > 1 ? (
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                {division.label}
              </div>
            ) : null}
            {division.content}
          </section>
        ))}
      </div>
    );
  }, [entry, structurePreviewByDivision]);

  const publicCoachTeams = useMemo(() => {
    if (!entry) return [];

    const teamsById = new Map<string, { id: string; name: string }>();

    (entry.tournament.teams ?? []).forEach((team) => {
      if (!team.name?.trim()) return;
      teamsById.set(team.id, { id: team.id, name: team.name.trim() });
    });

    return [...teamsById.values()];
  }, [entry]);

  const effectiveCoachTeamName =
    role === "coach" &&
    coachTeamName &&
    publicCoachTeams.some((team) => team.id === coachTeamName || team.name === coachTeamName)
      ? coachTeamName
      : null;
  const effectiveVoterTeamName =
    coachTeamName &&
    publicCoachTeams.some((team) => team.id === coachTeamName || team.name === coachTeamName)
      ? coachTeamName
      : null;

  const accessError = useMemo(() => {
    if (!entry) return "Tournoi introuvable.";
    const shareSettings = entry.tournament.shareSettings;
    if (!shareSettings) return "Accès non configuré.";

    if (role === "coach") {
      if (!shareSettings.coachAccessEnabled) return "L’accès coach n’est pas activé.";
      if (!token || token !== shareSettings.coachToken) return "Lien coach invalide.";
      return null;
    }

    if (!shareSettings.parentAccessEnabled) return "L’accès parent n’est pas activé.";
    if (!token || token !== shareSettings.parentToken) return "Lien parent invalide.";
    return null;
  }, [entry, role, token]);

  const handleSave = async (nextTournament: TournamentProductSavedTournament) => {
    if (!entry) return;

    console.log("SAVING TOURNAMENT ID", nextTournament.id);

    const owningTeamId = (nextTournament as TournamentProductSavedTournament & { teamId?: string }).teamId;
    const tournamentToSave = {
      ...nextTournament,
      teamId: owningTeamId,
    };
    const savedTournament = await saveTournamentToSupabase(tournamentToSave);
    const freshTournament =
      (await loadTournamentFromSupabase<TournamentProductSavedTournament>(nextTournament.id)) ??
      savedTournament;

    const nextEntry = {
      ...entry,
      tournament: freshTournament,
    };

    setEntry(nextEntry);

    upsertStoredManualTournamentProduct({
      id: freshTournament.id,
      source: "manual",
      tournament: freshTournament,
      groups: entry.groups,
      previewDataByDivision: entry.previewDataByDivision,
      createdAt: entry.localManualEntry?.createdAt ?? freshTournament.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    if (owningTeamId && typeof window !== "undefined") {
      const storageKey = `${CLASSIC_TOURNAMENT_STORAGE_PREFIX}${owningTeamId}`;
      try {
        const raw = window.localStorage.getItem(storageKey);
        const entries = raw ? JSON.parse(raw) : [];
        const currentEntries = Array.isArray(entries) ? entries : [];
        const nextEntries = currentEntries.some(
          (item) => typeof item === "object" && item !== null && "id" in item && item.id === freshTournament.id,
        )
          ? currentEntries.map((item) =>
              typeof item === "object" && item !== null && "id" in item && item.id === freshTournament.id
                ? freshTournament
                : item,
            )
          : [freshTournament, ...currentEntries];
        window.localStorage.setItem(storageKey, JSON.stringify(nextEntries));
      } catch (error) {
        console.error("Erreur sauvegarde locale tournoi coach:", error);
      }
    }
  };

  const effectiveCoachTeamDraft =
    coachTeamDraft || (role === "coach" && publicCoachTeams.length === 1 ? publicCoachTeams[0]?.id ?? "" : "");

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#05070c] px-6 text-slate-300">
        Chargement du tournoi...
      </div>
    );
  }

  if (accessError || !entry) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#05070c] px-6 text-center">
        <p className="text-sm text-slate-300">{accessError ?? "Tournoi introuvable."}</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/10"
        >
          Retour
        </button>
      </div>
    );
  }

  if (role === "coach" && !effectiveCoachTeamName) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#05070c] px-4 py-8">
        <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.16),transparent_58%),rgba(255,255,255,0.03)] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.38)] backdrop-blur-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200/80">
            Acces coach
          </p>
          <h1 className="mt-2 text-xl font-semibold text-white">Rentre ton equipe</h1>
          <p className="mt-2 text-sm text-slate-300">
            Choisis ton equipe pour acceder a ta vue coach, remplir les joueurs et les repas.
          </p>

          <div className="mt-5 space-y-3">
            <select
              value={effectiveCoachTeamDraft}
              onChange={(event) => setCoachTeamDraft(event.target.value)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none focus:border-violet-400/35"
            >
              <option value="">Choisir une equipe</option>
              {publicCoachTeams.map((team) => (
                <option key={`public-coach-team-${team.id}`} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={!effectiveCoachTeamDraft}
              onClick={() => {
                const nextParams = new URLSearchParams(searchParams.toString());
                nextParams.set("token", token);
                nextParams.set("team", effectiveCoachTeamDraft);
                router.replace(`/tournament/${tournamentId}/coach?${nextParams.toString()}`);
              }}
              className="w-full rounded-full border border-violet-300/25 bg-violet-600 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Entrer dans la vue coach
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TournamentWorkspace
      tournament={entry.tournament}
      groups={entry.groups}
      structurePreview={structurePreview}
      structurePreviewByDivision={structurePreviewByDivision}
      onClose={() => router.push("/")}
      onEditStructure={() => {}}
      onSave={handleSave}
      viewMode={role}
      initialCoachTeamName={role === "coach" ? effectiveCoachTeamName : null}
      initialVoterTeamName={effectiveVoterTeamName}
    />
  );
}
