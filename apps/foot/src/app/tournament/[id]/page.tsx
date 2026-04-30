"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { TournamentWorkspace } from "@/app/app/teams/[id]/matches/_components/tournament-product/TournamentWorkspace";
import { TournamentPreview } from "@/components/tournament-preview/TournamentPreview";
import {
  getStoredManualTournamentProductById,
  type StoredManualTournamentProduct,
  upsertStoredManualTournamentProduct,
} from "@/app/tournament/_lib/manualTournamentProducts";
import type { TournamentProductSavedTournament } from "@/app/app/teams/[id]/matches/_components/tournament-product/types";

export default function ManualTournamentProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tournamentId = typeof params?.id === "string" ? params.id : "";
  const returnTo = searchParams.get("returnTo") || "/tournament";
  const [entryOverride, setEntryOverride] = useState<StoredManualTournamentProduct | null>(null);
  const entry = useMemo(
    () =>
      entryOverride && entryOverride.id === tournamentId
        ? entryOverride
        : tournamentId
          ? getStoredManualTournamentProductById(tournamentId)
          : null,
    [entryOverride, tournamentId],
  );

  const structurePreview = useMemo(() => {
    if (!entry) return null;

    return (
      <div className="space-y-6">
        {entry.previewDataByDivision.map((division) => (
          <section key={division.id} className="space-y-3">
            {entry.previewDataByDivision.length > 1 ? (
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                {division.name}
              </div>
            ) : null}
            <TournamentPreview data={division.data} />
          </section>
        ))}
      </div>
    );
  }, [entry]);
  const structurePreviewByDivision = useMemo(
    () =>
      entry?.previewDataByDivision.map((division) => ({
        id: division.id,
        label: division.name,
        content: <TournamentPreview data={division.data} />,
      })) ?? [],
    [entry],
  );

  const handleSave = (nextTournament: TournamentProductSavedTournament) => {
    if (!entry) return;
    const nextEntry: StoredManualTournamentProduct = {
      ...entry,
      tournament: nextTournament,
      updatedAt: new Date().toISOString(),
    };
    upsertStoredManualTournamentProduct(nextEntry);
    setEntryOverride(nextEntry);
  };

  if (!tournamentId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#05070c] px-6 text-slate-300">
        Tournoi introuvable.
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#05070c] px-6 text-center">
        <p className="text-sm text-slate-300">Aucun tournoi manuel enregistré pour cet identifiant.</p>
        <button
          type="button"
          onClick={() => router.push(returnTo)}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/10"
        >
          Retour
        </button>
      </div>
    );
  }

  return (
    <TournamentWorkspace
      tournament={entry.tournament}
      groups={entry.groups}
      structurePreview={structurePreview}
      structurePreviewByDivision={structurePreviewByDivision}
      onClose={() => router.push(returnTo)}
      onEditStructure={() =>
        router.push(`/tournament/manual-builder?returnTo=${encodeURIComponent(returnTo)}`)
      }
      onSave={handleSave}
    />
  );
}
