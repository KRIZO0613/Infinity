"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useCoachOnboarding from "@/app/_hooks/useCoachOnboarding";

const CATEGORIES = [
  "U6",
  "U7",
  "U8",
  "U9",
  "U10",
  "U11",
  "U12",
  "U13",
  "U14",
  "U15",
  "U16",
  "U17",
  "U18",
  "Seniors",
  "Féminines",
  "Vétérans",
];

export default function CoachOnboardingDialog() {
  const router = useRouter();
  const {
    needsOnboarding,
    isOpen,
    loading,
    submitting,
    error,
    closeOnboarding,
    completeOnboarding,
  } = useCoachOnboarding();

  const [clubName, setClubName] = useState("");
  const [teamName, setTeamName] = useState("Equipe 1");
  const [category, setCategory] = useState("U12");

  if (loading || !needsOnboarding || !isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0f1a] p-6 shadow-[0_25px_80px_rgba(0,0,0,0.6)]">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Bienvenue
          </p>
          <h2 className="text-2xl font-semibold text-slate-100">
            Configurons ton club
          </h2>
          <p className="text-sm text-slate-400">
            Renseigne ton club et ta première équipe pour démarrer.
          </p>
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              await completeOnboarding({
                clubName,
                teamName,
                category,
              });
              router.push("/app/teams");
            } catch {
              // handled by hook error state
            }
          }}
        >
          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Nom du club
            <input
              type="text"
              value={clubName}
              onChange={(event) => setClubName(event.target.value)}
              placeholder="FC Puget"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-[#8b5cf6]/60 focus:ring-1 focus:ring-[#8b5cf6]/40"
              required
            />
          </label>

          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Équipe principale
            <input
              type="text"
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="U12 A"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-[#8b5cf6]/60 focus:ring-1 focus:ring-[#8b5cf6]/40"
              required
            />
          </label>

          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Catégorie
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-[#8b5cf6]/60 focus:ring-1 focus:ring-[#8b5cf6]/40"
            >
              {CATEGORIES.map((item) => (
                <option key={item} value={item} className="bg-[#0b0f1a]">
                  {item}
                </option>
              ))}
            </select>
          </label>

          {error ? <p className="text-xs text-rose-300">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeOnboarding}
              className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/5"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full border border-[#8b5cf6]/60 bg-white/5 px-4 py-2 text-xs font-semibold text-[#c4b5fd] shadow-[0_8px_18px_rgba(139,92,246,0.25)] transition hover:border-[#8b5cf6]/80 hover:bg-white/10 disabled:opacity-60"
            >
              {submitting ? "Création…" : "Valider"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
