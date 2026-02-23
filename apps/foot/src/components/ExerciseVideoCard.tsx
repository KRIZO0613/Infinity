"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ExerciseAnimatedPlayer } from "@/components/ExerciseAnimatedPlayer";
import type { AnimatedExerciseMetadata, AnimatedExercisePayload } from "@/types/animatedExercise";

type ExerciseRow = {
  id: string;
  title: string;
  category: string;
  duration: number;
  type: string;
  is_global: boolean;
  animation_data: unknown;
};

type ExerciseVideoCardProps = {
  exercise: ExerciseRow;
  onDelete: (exercise: ExerciseRow) => void;
  busy?: boolean;
  favorite?: boolean;
  onToggleFavorite?: () => void;
};

const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const;

export function ExerciseVideoCard({
  exercise,
  onDelete,
  busy = false,
  favorite = false,
  onToggleFavorite,
}: ExerciseVideoCardProps) {
  const animationData = useMemo(
    () => exercise.animation_data as AnimatedExercisePayload,
    [exercise.animation_data],
  );
  const meta = (animationData?.metadata ?? animationData?.meta ?? {}) as
    | AnimatedExerciseMetadata
    | Partial<AnimatedExerciseMetadata>;
  const isIncomplete = meta.isIncomplete ?? true;
  const rawCategory = (meta as { category?: string; categoryMain?: string })
    .category ?? (meta as { categoryMain?: string }).categoryMain ?? exercise.category;
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

  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLDivElement | null>(null);
  const infoPanelRef = useRef<HTMLDivElement | null>(null);
  const infoButtonRef = useRef<HTMLButtonElement | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!infoOpen) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      const insidePanel = infoPanelRef.current?.contains(target) ?? false;
      const insideButton = infoButtonRef.current?.contains(target) ?? false;
      if (!insidePanel && !insideButton) {
        setInfoOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
    };
  }, [infoOpen]);


  const showControls = (autoHide = true) => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (autoHide) {
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, 1600);
    }
  };

  const scheduleHide = (delay = 900) => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, delay);
  };

  const handleVideoClick = () => {
    showControls(true);
    setIsPlaying((prev) => !prev);
  };

  const toggleFullscreen = async () => {
    if (typeof document === "undefined") return;
    const container = videoRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => null);
      return;
    }
    if (container.requestFullscreen) {
      await container.requestFullscreen().catch(() => null);
    }
  };

  const progress = duration > 0 ? Math.min(1, playhead / duration) : 0;

  return (
    <div className="flex w-full flex-col gap-3 font-satoshi">
      <h3 className="text-sm font-semibold text-slate-200">
        {exercise.title}
      </h3>

      <div
        ref={videoRef}
        className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0b1020]"
        style={{ aspectRatio: "105 / 68" }}
        onPointerDown={(event) => {
          if (infoOpen) {
            const target = event.target as Node;
            const insidePanel = infoPanelRef.current?.contains(target) ?? false;
            const insideButton =
              infoButtonRef.current?.contains(target) ?? false;
            if (!insidePanel && !insideButton) {
              setInfoOpen(false);
            }
          }
          handleVideoClick();
        }}
        onClick={() => showControls(true)}
        onMouseEnter={() => showControls(false)}
        onMouseLeave={() => scheduleHide(800)}
      >
        <div className="absolute inset-0 z-0">
          <ExerciseAnimatedPlayer
          data={animationData}
          autoPlay={false}
          isPlaying={isPlaying}
          onPlayingChange={setIsPlaying}
          maxLoops={3}
          onProgress={(time, total) => {
            setPlayhead(time);
            setDuration(total);
          }}
            playbackRate={speed}
            pitchOrientation="landscape"
            showControls={false}
            showTimeline={false}
            showFullscreen={false}
            className="h-full w-full"
            canvasClassName="block h-full w-full pointer-events-none"
          />
        </div>

        {!isPlaying ? (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-white/10 text-[10px] text-white shadow-[0_10px_20px_rgba(0,0,0,0.45)] backdrop-blur">
              ▶
            </div>
          </div>
        ) : null}

        {isIncomplete ? null : null}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite?.();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          className={[
            "absolute right-3 top-3 z-[999] flex h-6 w-6 items-center justify-center rounded-full border border-white/25 bg-black/40 text-[10px] transition",
          ].join(" ")}
          style={
            favorite
              ? {
                  color: "#ffe600",
                  borderColor: "rgba(255,255,255,0.25)",
                  backgroundColor: "rgba(0,0,0,0.4)",
                }
              : { color: "rgba(255,255,255,0.7)" }
          }
          aria-label="Favori"
        >
          ★
        </button>

        {infoOpen ? (
          <div
            ref={infoPanelRef}
            className="absolute left-3 top-3 z-[999] cursor-pointer rounded-xl border border-white/15 bg-black/70 px-3 py-2 text-[10px] text-white shadow-[0_10px_25px_rgba(0,0,0,0.5)] backdrop-blur"
            onClick={() => setInfoOpen(false)}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span className="text-white/70">Catégorie</span>
              <span>
                {rawCategory ? formatMetaValue(rawCategory) : "-"}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-white/70">Type</span>
              <span>{formatMetaValue(rawType)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-white/70">Objectif</span>
              <span>{formatMetaValue(rawObjective)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-white/70">Durée</span>
              <span>
                {exercise.duration ? `${exercise.duration} min` : "-"}
              </span>
            </div>
          </div>
        ) : null}

        {controlsVisible ? (
          <div
            className="absolute inset-x-0 bottom-0 z-[999] flex w-full items-center justify-between gap-2 border-t border-white/10 bg-transparent px-2.5 py-1 text-[9px] text-white backdrop-blur"
            onPointerDown={(event) => {
              event.stopPropagation();
              showControls(false);
            }}
          >
            <button
              type="button"
              onClick={() => setIsPlaying((prev) => !prev)}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[9px] text-white transition hover:bg-white/20"
            >
              {isPlaying ? "❚❚" : "▶"}
            </button>

            <div className="relative flex-1 px-2">
              <div className="h-[2px] w-full rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-violet-400/95 transition"
                  style={{ width: `${progress * 100}%` }}
                />
                <div
                  className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-white/60 bg-violet-400 shadow-[0_0_8px_rgba(168,85,247,0.85)]"
                  style={{ left: `calc(${progress * 100}% - 4px)` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSpeedOpen((prev) => !prev)}
                  className="rounded-full border border-white/20 bg-white/10 px-2 py-[2px] text-[8px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-white/20"
                >
                  {speed}x
                </button>
                {speedOpen ? (
                  <div className="absolute bottom-full right-0 z-[1000] mb-2 flex flex-col gap-1 rounded-2xl border border-white/15 bg-black/70 p-2 text-xs text-slate-100 shadow-[0_15px_35px_rgba(0,0,0,0.5)] backdrop-blur">
                    {SPEED_OPTIONS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setSpeed(value);
                          setSpeedOpen(false);
                        }}
                        className={`rounded-full px-3 py-1 text-left transition ${
                          value === speed
                            ? "bg-violet-500/30 text-white"
                            : "hover:bg-white/10"
                        }`}
                      >
                        {value}x
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => {
                  setInfoOpen((prev) => !prev);
                  showControls(false);
                }}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[9px] text-white transition hover:bg-white/20"
                aria-label="Infos"
                ref={infoButtonRef}
              >
                i
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[9px] text-white transition hover:bg-white/20"
                aria-label="Plein écran"
              >
                ⛶
              </button>

              {!exercise.is_global ? (
                <button
                  type="button"
                  onClick={() => onDelete(exercise)}
                  disabled={busy}
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-rose-400/40 bg-rose-500/20 text-[9px] text-rose-100 transition hover:bg-rose-500/30 disabled:opacity-50"
                >
                  🗑
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {infoOpen ? null : null}
    </div>
  );
}
