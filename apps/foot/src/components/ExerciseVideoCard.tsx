"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link2, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

import { ExerciseAnimatedPlayer } from "@/components/ExerciseAnimatedPlayer";
import type {
  AnimatedExercisePayload,
  ExerciseMetadata,
} from "@/types/animatedExercise";

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
  const router = useRouter();
  const animationData = useMemo(
    () => exercise.animation_data as AnimatedExercisePayload,
    [exercise.animation_data],
  );
  if (!animationData) {
    return (
      <div className="flex w-full flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-200">
          {exercise.title}
        </h3>
        <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0b1020]">
          <div className="h-[220px] w-full animate-pulse bg-white/5" />
        </div>
      </div>
    );
  }
  const meta = (animationData?.metadata ?? animationData?.meta ?? {}) as
    | ExerciseMetadata
    | Partial<ExerciseMetadata>;
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
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
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
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!shareOpen) return;
    setMenuOpen(false);
    setControlsVisible(false);
    setSpeedOpen(false);
    setCopied(false);
  }, [shareOpen]);

  useEffect(() => {
    if (!infoOpen) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      const insidePanel = infoPanelRef.current?.contains(target) ?? false;
      if (!insidePanel) {
        setInfoOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
    };
  }, [infoOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideMenu = menuRef.current?.contains(target) ?? false;
      const insideButton = menuButtonRef.current?.contains(target) ?? false;
      if (!insideMenu && !insideButton) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
    };
  }, [menuOpen]);


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
    if (shareOpen) return;
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
    <div
      className={`flex w-full flex-col gap-3 font-satoshi ${
        shareOpen ? "pointer-events-none" : ""
      }`}
    >
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
            if (!insidePanel) {
              setInfoOpen(false);
            }
          }
          if (menuOpen) setMenuOpen(false);
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

        {!shareOpen && !isPlaying ? (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-white/10 text-[10px] text-white shadow-[0_10px_20px_rgba(0,0,0,0.45)] backdrop-blur">
              ▶
            </div>
          </div>
        ) : null}

        {isIncomplete ? null : null}

        {!shareOpen ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite?.();
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            className="absolute right-3 top-3 z-[999] flex h-6 w-6 items-center justify-center rounded-full border border-white/25 bg-black/40 text-[10px] transition"
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
        ) : null}

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

        {controlsVisible && !shareOpen ? (
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

              <div className="relative">
                <button
                  ref={menuButtonRef}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuOpen((prev) => !prev);
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[9px] text-white transition hover:bg-white/20"
                  aria-label="Options"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
                {menuOpen ? (
                  <div
                    ref={menuRef}
                    className="absolute bottom-full right-0 z-[1000] mb-2 w-48 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f1a]/95 text-xs text-slate-100 shadow-[0_20px_45px_rgba(0,0,0,0.55)] backdrop-blur"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setInfoOpen(true);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-violet-500/10"
                    >
                      <span>ℹ️</span>
                      Voir les détails
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setShareOpen(true);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-violet-500/10"
                    >
                      <span>🔗</span>
                      Partager
                    </button>
                    {!exercise.is_global ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onDelete(exercise);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-rose-200 transition hover:bg-rose-500/10"
                      >
                        <span>🗑</span>
                        Supprimer
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[9px] text-white transition hover:bg-white/20"
                aria-label="Plein écran"
              >
                ⛶
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {shareOpen && mounted
        ? createPortal(
            <div
              className="fixed inset-0 z-[2000] flex items-center justify-center bg-black px-4"
              onClick={() => setShareOpen(false)}
            >
              <div
                className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b0f1a] p-6 text-slate-100 shadow-[0_25px_60px_rgba(0,0,0,0.6)]"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Partager cet exercice</h3>
                  <button
                    type="button"
                    onClick={() => setShareOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/5 text-xs text-slate-200 transition hover:bg-white/10"
                    aria-label="Fermer"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-5 flex items-center justify-between gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      const link =
                        typeof window !== "undefined"
                          ? `${window.location.origin}/exercise/${exercise.id}`
                          : `/exercise/${exercise.id}`;
                      window.open(
                        `https://www.instagram.com/?url=${encodeURIComponent(
                          link,
                        )}`,
                        "_blank",
                      );
                    }}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 transition hover:bg-white/10"
                    aria-label="Partager sur Instagram"
                    title="Instagram"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 text-[#E1306C]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle
                        cx="17"
                        cy="7"
                        r="1.2"
                        fill="currentColor"
                        stroke="none"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const link =
                        typeof window !== "undefined"
                          ? `${window.location.origin}/exercise/${exercise.id}`
                          : `/exercise/${exercise.id}`;
                      window.open(
                        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                          link,
                        )}`,
                        "_blank",
                      );
                    }}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 transition hover:bg-white/10"
                    aria-label="Partager sur Facebook"
                    title="Facebook"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#1877F2]" fill="currentColor">
                      <path d="M14 8h3V5h-3c-2.2 0-4 1.8-4 4v2H7v3h3v6h3v-6h3l1-3h-4V9c0-.55.45-1 1-1z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const link =
                        typeof window !== "undefined"
                          ? `${window.location.origin}/exercise/${exercise.id}`
                          : `/exercise/${exercise.id}`;
                      window.open(
                        `https://www.tiktok.com/upload?url=${encodeURIComponent(
                          link,
                        )}`,
                        "_blank",
                      );
                    }}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 transition hover:bg-white/10"
                    aria-label="Partager sur TikTok"
                    title="TikTok"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 text-[#00F2EA]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 3v9.5a3.5 3.5 0 1 1-2-3.15V6.2h4a4.5 4.5 0 0 0 3.5 1.8V5.6A6.5 6.5 0 0 1 14 3z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const link =
                        typeof window !== "undefined"
                          ? `${window.location.origin}/exercise/${exercise.id}`
                          : `/exercise/${exercise.id}`;
                      window.open(
                        `https://wa.me/?text=${encodeURIComponent(link)}`,
                        "_blank",
                      );
                    }}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 transition hover:bg-white/10"
                    aria-label="Partager sur WhatsApp"
                    title="WhatsApp"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 text-[#25D366]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20.5 12a8.5 8.5 0 0 1-12.9 7.3L3 21l1.9-4.4A8.5 8.5 0 1 1 20.5 12z" />
                      <path d="M9.8 9.6c.2-.4.4-.4.7-.3l1.2.5c.2.1.4.3.4.6 0 .3-.2.7-.4.9l-.2.3c.7 1.1 1.7 2 2.9 2.6l.3-.2c.2-.1.6-.3.9-.3.3 0 .5.2.6.4l.5 1.1c.1.3.1.6-.2.8-.6.5-1.4.7-2.1.5-2-.5-3.6-1.7-4.8-3.4-.6-.9-1-1.9-1.2-2.9-.1-.7.1-1.5.4-2.1z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const link =
                        typeof window !== "undefined"
                          ? `${window.location.origin}/exercise/${exercise.id}`
                          : `/exercise/${exercise.id}`;
                      try {
                        if (navigator.clipboard) {
                          await navigator.clipboard.writeText(link);
                        } else {
                          const input = document.createElement("input");
                          input.value = link;
                          document.body.appendChild(input);
                          input.select();
                          document.execCommand("copy");
                          document.body.removeChild(input);
                        }
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1200);
                      } catch {
                        setCopied(false);
                      }
                    }}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 transition hover:bg-white/10"
                    aria-label="Copier le lien"
                    title="Copier le lien"
                  >
                    <Link2 className="h-5 w-5 text-violet-300" />
                  </button>
                </div>
                {copied ? (
                  <p className="mt-3 text-center text-[10px] text-slate-300">
                    Lien copié
                  </p>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
