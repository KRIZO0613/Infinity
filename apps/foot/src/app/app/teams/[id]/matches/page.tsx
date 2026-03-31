"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

import ChampionshipTab from "./_components/ChampionshipTab";
import CupTab from "./_components/CupTab";
import FriendlyTab from "./_components/FriendlyTab";
import PlateauTab from "./_components/PlateauTab";
import TournamentTab from "./_components/TournamentTab";

type MatchKind =
  | "championship"
  | "cup"
  | "friendly"
  | "plateau"
  | "tournament";

type MatchTab = {
  key: MatchKind;
  label: string;
};

const tabs: MatchTab[] = [
  { key: "championship", label: "Championnat" },
  { key: "cup", label: "Coupe" },
  { key: "friendly", label: "Matchs amicaux" },
  { key: "plateau", label: "Plateau" },
  { key: "tournament", label: "Tournois" },
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

  return (
    <div className="min-h-screen bg-[#070a14] text-slate-100">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Calendrier des matchs :
              </p>
              <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => {
                  const isActive = tab.key === activeTab;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={[
                        "rounded-full px-3 py-1.5 text-[11px] font-semibold transition",
                        isActive
                          ? "border border-white/10 bg-white/10 text-slate-100"
                          : "border border-white/10 bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200",
                      ].join(" ")}
                    >
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {activeTab === "championship" ? (
          <div className="mt-8">
            <ChampionshipTab teamId={teamId} />
          </div>
        ) : activeTab === "friendly" ? (
          <div className="mt-8">
            <FriendlyTab teamId={teamId} />
          </div>
        ) : activeTab === "cup" ? (
          <div className="mt-8">
            <CupTab teamId={teamId} />
          </div>
        ) : activeTab === "plateau" ? (
          <div className="mt-8">
            <PlateauTab teamId={teamId} />
          </div>
        ) : activeTab === "tournament" ? (
          <div className="mt-8">
            <TournamentTab teamId={teamId} />
          </div>
        ) : (
          <div className="mt-8">
            <PlateauTab teamId={teamId} />
          </div>
        )}
      </div>
    </div>
  );
}
