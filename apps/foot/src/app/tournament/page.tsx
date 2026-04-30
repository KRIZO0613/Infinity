"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { TournamentCard } from "@/app/app/teams/[id]/matches/_components/tournament-product/TournamentCard";
import {
  readStoredManualTournamentProducts,
  removeStoredManualTournamentProductById,
  type StoredManualTournamentProduct,
  upsertStoredManualTournamentProduct,
} from "@/app/tournament/_lib/manualTournamentProducts";

export default function TournamentListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/tournament/manual-builder";
  const [entries, setEntries] = useState<StoredManualTournamentProduct[]>(() =>
    readStoredManualTournamentProducts(),
  );

  const sortedEntries = useMemo(
    () =>
      [...entries].sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      ),
    [entries],
  );

  return (
    <div className="min-h-screen bg-[#05070c] px-4 py-6 text-white md:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Tournois</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Tournois générés</h1>
          </div>
          <button
            type="button"
            onClick={() => router.push(returnTo)}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            Retour
          </button>
        </div>

        {sortedEntries.length > 0 ? (
          <div className="grid gap-4">
            {sortedEntries.map((entry) => (
              <TournamentCard
                key={entry.id}
                tournament={entry.tournament}
                onView={() =>
                  router.push(
                    `/tournament/${entry.id}?returnTo=${encodeURIComponent(returnTo)}`,
                  )
                }
                onEdit={() =>
                  router.push(
                    `/tournament/manual-builder?returnTo=${encodeURIComponent(returnTo)}`,
                  )
                }
                onDelete={() => {
                  removeStoredManualTournamentProductById(entry.id);
                  setEntries((current) => current.filter((item) => item.id !== entry.id));
                }}
                onTogglePublish={() => {
                  const nextEntry: StoredManualTournamentProduct = {
                    ...entry,
                    tournament: {
                      ...entry.tournament,
                      status:
                        entry.tournament.status === "published" ? "draft" : "published",
                      updatedAt: new Date().toISOString(),
                    },
                    updatedAt: new Date().toISOString(),
                  };
                  upsertStoredManualTournamentProduct(nextEntry);
                  setEntries((current) =>
                    current.map((item) => (item.id === nextEntry.id ? nextEntry : item)),
                  );
                }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[28px] border border-white/10 bg-black/20 p-8 text-center text-sm text-slate-400">
            Aucun tournoi manuel généré pour le moment.
          </div>
        )}
      </div>
    </div>
  );
}
