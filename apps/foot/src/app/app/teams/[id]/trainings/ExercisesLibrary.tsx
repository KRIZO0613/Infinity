"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";

type ExerciseRow = {
  id: string;
  title: string;
  category: string;
  duration: number;
  type: string;
  is_global: boolean;
  created_at: string | null;
  updated_at: string | null;
  animation_data: unknown;
};

type ToastState = {
  kind: "success" | "error";
  message: string;
} | null;

const TABS = [
  { key: "templates", label: "Templates" },
  { key: "mine", label: "Mes exercices" },
] as const;

export default function ExercisesLibrary() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["key"]>(
    "templates",
  );
  const [items, setItems] = useState<ExerciseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = (kind: "success" | "error", message: string) => {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 2800);
  };

  const fetchExercises = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("training_exercises")
      .select(
        "id,title,category,duration,type,is_global,created_at,updated_at,animation_data",
      )
      .order("created_at", { ascending: false });
    if (error) {
      showToast("error", error.message);
      setItems([]);
    } else {
      setItems((data as ExerciseRow[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchExercises();
  }, []);

  const templates = useMemo(
    () => items.filter((item) => item.is_global),
    [items],
  );
  const mine = useMemo(
    () => items.filter((item) => !item.is_global),
    [items],
  );

  const handleDuplicate = async (item: ExerciseRow) => {
    if (!item.is_global) return;
    setBusyId(item.id);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      showToast("error", "Utilisateur non connecté.");
      setBusyId(null);
      return;
    }
    const { error } = await supabase.from("training_exercises").insert({
      title: `${item.title} (copie)`,
      category: item.category,
      duration: item.duration,
      type: item.type,
      animation_data: item.animation_data,
      is_global: false,
    });
    if (error) {
      showToast("error", error.message);
    } else {
      showToast("success", "Exercice dupliqué.");
      await fetchExercises();
    }
    setBusyId(null);
  };

  const handleDelete = async (item: ExerciseRow) => {
    if (item.is_global) return;
    setBusyId(item.id);
    const { error } = await supabase
      .from("training_exercises")
      .delete()
      .eq("id", item.id);
    if (error) {
      showToast("error", error.message);
    } else {
      showToast("success", "Exercice supprimé.");
      await fetchExercises();
    }
    setBusyId(null);
  };

  const data = activeTab === "templates" ? templates : mine;

  return (
    <div className="mt-8">
      {toast ? (
        <div className="fixed right-6 top-24 z-50">
          <div
            className={`rounded-2xl border px-4 py-3 text-sm shadow-[0_20px_50px_rgba(0,0,0,0.55)] backdrop-blur ${
              toast.kind === "success"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                : "border-rose-400/30 bg-rose-500/10 text-rose-100"
            }`}
          >
            {toast.message}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Bibliothèque d’exercices
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-100">
            Templates + tes exercices
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Crée des exercices animés en quelques secondes.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            router.push("/app/entrainements/exercices/new?type=animated")
          }
          className="rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition hover:bg-violet-500"
        >
          Créer un exercice animé
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={[
                "rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition",
                isActive
                  ? "border border-white/15 bg-white/10 text-slate-100"
                  : "border border-white/10 bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className="rounded-[28px] border border-white/10 bg-black/35 p-6 text-sm text-slate-400 shadow-[0_26px_60px_rgba(0,0,0,0.6)]">
            Chargement des exercices...
          </div>
        ) : data.length === 0 ? (
          <div className="rounded-[28px] border border-white/10 bg-black/35 p-6 text-sm text-slate-400 shadow-[0_26px_60px_rgba(0,0,0,0.6)]">
            {activeTab === "templates" ? (
              <p>Aucun template disponible pour le moment.</p>
            ) : (
              <div>
                <p>Aucun exercice personnel pour l’instant.</p>
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      "/app/entrainements/exercices/new?type=animated",
                    )
                  }
                  className="mt-3 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Créer un exercice animé
                </button>
              </div>
            )}
          </div>
        ) : (
          data.map((item) => (
            <div
              key={item.id}
              className="flex h-full flex-col rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_24px_50px_rgba(0,0,0,0.55)] backdrop-blur"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-white">
                  {item.title}
                </h3>
                {item.is_global ? (
                  <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-200">
                    Template
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                  {item.category}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                  {item.duration} min
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                  Animé
                </span>
              </div>
              <div className="mt-auto flex flex-wrap gap-2 pt-5">
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/app/entrainements/exercices/${item.id}`)
                  }
                  className="rounded-full border border-white/10 bg-transparent px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Voir
                </button>
                {item.is_global ? (
                  <button
                    type="button"
                    onClick={() => handleDuplicate(item)}
                    disabled={busyId === item.id}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
                  >
                    Dupliquer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    disabled={busyId === item.id}
                    className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
