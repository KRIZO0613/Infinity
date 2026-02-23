"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { ExerciseAnimatedPlayer } from "@/components/ExerciseAnimatedPlayer";
import { supabase } from "@/lib/supabaseClient";
import type { AnimatedExerciseMetadata, AnimatedExercisePayload } from "@/types/animatedExercise";

type ExerciseRow = {
  id: string;
  title: string;
  category: string;
  duration: number;
  type: string;
  animation_data: unknown;
  created_at: string | null;
};

export default function ExerciseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const exerciseId =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
      ? params.id[0]
      : "";

  const [exercise, setExercise] = useState<ExerciseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!exerciseId) return;
    let mounted = true;
    const fetchExercise = async () => {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from("training_exercises")
        .select("id,title,category,duration,type,animation_data,created_at")
        .eq("id", exerciseId)
        .single();
      if (!mounted) return;
      if (fetchError) {
        setError(fetchError.message);
        setExercise(null);
      } else {
        setExercise((data as ExerciseRow) ?? null);
      }
      setLoading(false);
    };
    fetchExercise();
    return () => {
      mounted = false;
    };
  }, [exerciseId]);

  const animationData = useMemo(() => {
    return (exercise?.animation_data ?? {}) as AnimatedExercisePayload;
  }, [exercise]);

  const meta = (animationData?.metadata ?? animationData?.meta ?? {}) as
    | AnimatedExerciseMetadata
    | Partial<AnimatedExerciseMetadata>;
  const rawCategory = (meta as { category?: string; categoryMain?: string })
    .category ?? (meta as { categoryMain?: string }).categoryMain;
  const rawType = (meta as { type?: string; trainingType?: string }).type ??
    (meta as { trainingType?: string }).trainingType;
  const rawObjective = (meta as { objective?: string | string[] }).objective;
  const formatMetaValue = (value?: string | string[]) => {
    if (!value) return "-";
    const values = Array.isArray(value) ? value : [value];
    return values
      .map((item) =>
        item
          .replace(/_/g, " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase()),
      )
      .join(" · ");
  };

  return (
    <div className="min-h-screen bg-[#050816] px-5 py-8 text-slate-100 md:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
            >
              Retour
            </button>
            <h1 className="mt-4 text-2xl font-semibold text-white">
              {exercise?.title ?? "Exercice"}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Aperçu vidéo de l’exercice
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
              {exercise?.category ?? "-"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
              {exercise?.duration ? `${exercise.duration} min` : "-"}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="rounded-[28px] border border-white/10 bg-black/35 p-6 text-sm text-slate-400 shadow-[0_26px_60px_rgba(0,0,0,0.6)]">
            Chargement de l’exercice...
          </div>
        ) : error ? (
          <div className="rounded-[28px] border border-rose-400/30 bg-rose-500/10 p-6 text-sm text-rose-100">
            {error}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_24px_50px_rgba(0,0,0,0.55)] backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Vidéo
                </p>
              </div>
              <div className="mt-4 aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                <ExerciseAnimatedPlayer
                  data={animationData}
                  autoPlay
                  showControls
                  showTimeline
                  showFullscreen
                  pitchOrientation="landscape"
                  className="h-full w-full"
                  canvasClassName="h-full w-full"
                />
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_24px_50px_rgba(0,0,0,0.55)] backdrop-blur">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Détails
              </p>
              <div className="mt-4 flex flex-col gap-3 text-sm text-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Catégorie</span>
                  <span>{formatMetaValue(rawCategory)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Type</span>
                  <span>{formatMetaValue(rawType)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Objectif</span>
                  <span>{formatMetaValue(rawObjective)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
