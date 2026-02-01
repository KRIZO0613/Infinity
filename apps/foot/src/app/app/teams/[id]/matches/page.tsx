"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";

import ChampionshipTab from "./_components/ChampionshipTab";

type MatchKind = "championship" | "friendly" | "other";

type MatchTab = {
  key: MatchKind;
  label: string;
};

const tabs: MatchTab[] = [
  { key: "championship", label: "Championnat" },
  { key: "friendly", label: "Matchs amicaux" },
  { key: "other", label: "Autres" },
];

export default function TeamMatchesPage() {
  const params = useParams<{ id: string }>();
  const teamId =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
      ? params.id[0]
      : "";
  const [activeTab, setActiveTab] = useState<MatchKind>("championship");

  const subtitle = useMemo(() => {
    if (activeTab === "friendly") return "Matchs amicaux de l’équipe";
    if (activeTab === "other") return "Autres matchs de l’équipe";
    return "Matchs à venir et passés de l’équipe";
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-[#070a14] text-slate-100">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Calendrier de l’équipe
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-100">
              Matchs
            </h1>
            <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "rounded-full px-4 py-2 text-xs font-semibold transition",
                  isActive
                    ? "border border-white/10 bg-white/10 text-slate-100"
                    : "border border-white/10 bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="mt-8 rounded-[28px] border border-white/10 bg-black/35 p-6 shadow-[0_26px_60px_rgba(0,0,0,0.6)]">
          {activeTab === "championship" ? (
            <ChampionshipTab teamId={teamId} />
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-sm text-slate-400">
              <p>
                {activeTab === "friendly"
                  ? "Aucun match amical pour l’instant."
                  : "Aucun match pour l’instant dans cette catégorie."}
              </p>
              <button
                type="button"
                onClick={() =>
                  alert(
                    activeTab === "friendly"
                      ? "Match amical – à implémenter"
                      : "Match – à implémenter",
                  )
                }
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
              >
                + {activeTab === "friendly" ? "Match amical" : "Match"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
