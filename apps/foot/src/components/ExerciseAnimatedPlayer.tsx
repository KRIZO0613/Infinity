"use client";

import { useEffect, useRef, useState } from "react";

import { drawElements, drawPitch } from "@/components/ExerciseAnimatedEditor";
import type {
  AnimatedExercisePayload,
  BaseSnapshot,
  CanvasElementBase,
  FrameSnapshot,
  PathPoint,
  Stroke,
} from "@/types/animatedExercise";
import { useExerciseAnimationPlayer } from "@/components/useExerciseAnimationPlayer";

const rotatePointCW = (point: { x: number; y: number }) => ({
  x: 1 - point.y,
  y: point.x,
});

const rotatePointCCW = (point: { x: number; y: number }) => ({
  x: point.y,
  y: 1 - point.x,
});

type ExerciseAnimatedPlayerProps = {
  data?: AnimatedExercisePayload;
  elements?: CanvasElementBase[];
  frames?: FrameSnapshot[];
  paths?: Record<string, PathPoint[]>;
  strokes?: Stroke[];
  strokesBase?: BaseSnapshot | null;
  ballAttachments?: Record<string, string>;
  pitchPreset?: string;
  pitchOrientation?: "landscape" | "portrait";
  actionSpeedMultipliers?: Record<number, number> | Record<string, number>;
  frameSpeedMultipliers?: Record<string, number>;
  frameDuration?: number;
  playbackRate?: number;
  isPlaying?: boolean;
  onPlayingChange?: (value: boolean) => void;
  onProgress?: (playhead: number, totalDuration: number, isPlaying: boolean) => void;
  maxLoops?: number;
  autoPlay?: boolean;
  showControls?: boolean;
  showFullscreen?: boolean;
  showTimeline?: boolean;
  className?: string;
  canvasClassName?: string;
};

export function ExerciseAnimatedPlayer({
  data,
  elements,
  frames,
  paths,
  strokes,
  strokesBase,
  ballAttachments,
  pitchPreset,
  pitchOrientation,
  actionSpeedMultipliers,
  frameSpeedMultipliers,
  frameDuration,
  playbackRate = 1,
  isPlaying,
  onPlayingChange,
  onProgress,
  maxLoops,
  autoPlay = true,
  showControls = true,
  showFullscreen = true,
  showTimeline = true,
  className,
  canvasClassName,
}: ExerciseAnimatedPlayerProps) {
  const resolvedElements =
    elements ?? data?.elements ?? ([] as CanvasElementBase[]);
  const resolvedFrames = frames ?? data?.keyframes ?? [];
  const resolvedPaths = paths ?? data?.paths ?? {};
  const resolvedStrokes = strokes ?? data?.strokes ?? [];
  const resolvedStrokesBase =
    strokesBase ?? data?.strokesBase ?? null;
  const resolvedBallAttachments =
    ballAttachments ?? data?.ballAttachments ?? {};
  const resolvedPitchPreset = pitchPreset ?? data?.pitchPreset ?? "standard";
  const sourceOrientation = data?.pitchOrientation ?? undefined;
  const targetOrientation = pitchOrientation ?? sourceOrientation ?? undefined;
  const resolvedPitchOrientation = targetOrientation;
  const resolvedActionSpeedMultipliers =
    actionSpeedMultipliers ?? data?.actionSpeedMultipliers ?? {};
  const resolvedFrameSpeedMultipliers =
    frameSpeedMultipliers ?? data?.frameSpeedMultipliers ?? {};

  const needsRotation =
    Boolean(sourceOrientation) &&
    Boolean(targetOrientation) &&
    sourceOrientation !== targetOrientation;

  const rotatePoint =
    sourceOrientation === "portrait" && targetOrientation === "landscape"
      ? rotatePointCW
      : rotatePointCCW;

  const rotatedElements = needsRotation
    ? resolvedElements.map((el) => {
        const next = rotatePoint({ x: el.x, y: el.y });
        return { ...el, x: next.x, y: next.y };
      })
    : resolvedElements;

  const rotatedFrames = needsRotation
    ? resolvedFrames.map((frame) => ({
        ...frame,
        elementsSnapshot: frame.elementsSnapshot.map((snap) => {
          const next = rotatePoint({ x: snap.x, y: snap.y });
          return { ...snap, x: next.x, y: next.y };
        }),
      }))
    : resolvedFrames;

  const rotatedPaths = needsRotation
    ? Object.fromEntries(
        Object.entries(resolvedPaths).map(([id, points]) => [
          id,
          points.map((pt) => {
            const next = rotatePoint({ x: pt.x, y: pt.y });
            return { ...pt, x: next.x, y: next.y };
          }),
        ]),
      )
    : resolvedPaths;

  const rotatedStrokes = needsRotation
    ? resolvedStrokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((pt) => {
          const next = rotatePoint({ x: pt.x, y: pt.y });
          return { ...pt, x: next.x, y: next.y };
        }),
      }))
    : resolvedStrokes;

  const rotatedStrokesBase =
    needsRotation && resolvedStrokesBase
      ? Object.fromEntries(
          Object.entries(resolvedStrokesBase).map(([id, pos]) => {
            const next = rotatePoint({ x: pos.x, y: pos.y });
            return [id, { x: next.x, y: next.y }];
          }),
        )
      : resolvedStrokesBase;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [forceFullscreen, setForceFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  const scrubbingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const onPlayingChangeRef = useRef(onPlayingChange);

  const player = useExerciseAnimationPlayer(
    rotatedElements,
    rotatedFrames,
    rotatedPaths,
    rotatedStrokes,
    rotatedStrokesBase,
    resolvedBallAttachments,
    resolvedActionSpeedMultipliers,
    resolvedFrameSpeedMultipliers,
    playbackRate,
    { preservePlayhead: true },
  );

  useEffect(() => {
    if (typeof isPlaying === "boolean") {
      player.setIsPlaying(isPlaying);
      return;
    }
    player.setIsPlaying(autoPlay);
  }, [autoPlay, isPlaying, player]);

  useEffect(() => {
    if (typeof frameDuration === "number" && frameDuration > 0) {
      player.setFrameDuration(frameDuration);
    }
  }, [frameDuration, player]);

  useEffect(() => {
    onPlayingChangeRef.current = onPlayingChange;
  }, [onPlayingChange]);

  const showControlsNow = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (player.isPlaying) {
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, 1800);
    }
  };

  useEffect(() => {
    showControlsNow();
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [player.isPlaying]);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (!containerRef.current) return;
      const bounds = containerRef.current.getBoundingClientRect();
      setCanvasSize({
        w: Math.max(1, Math.floor(bounds.width)),
        h: Math.max(1, Math.floor(bounds.height)),
      });
    };
    updateSize();
    if (typeof ResizeObserver === "undefined") {
      setReady(true);
      return;
    }
    const observer = new ResizeObserver(() => {
      updateSize();
      setReady(true);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (typeof document === "undefined") return;
    const container = containerRef.current;
    if (!container) return;
    const canFullscreen = Boolean(container.requestFullscreen);
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => null);
      setForceFullscreen(false);
      return;
    }
    if (canFullscreen && document.fullscreenEnabled) {
      await container.requestFullscreen().catch(() => null);
      return;
    }
    setForceFullscreen((prev) => !prev);
  };

  const totalDuration = Math.max(0, player.totalDuration || 0);
  const currentTime = totalDuration
    ? player.playhead % totalDuration
    : player.playhead;
  const progress = totalDuration ? currentTime / totalDuration : 0;

  useEffect(() => {
    if (!onProgress) return;
    onProgress(currentTime, totalDuration, player.isPlaying);
  }, [currentTime, totalDuration, player.isPlaying, onProgress]);

  const loops =
    totalDuration > 0 ? Math.floor(player.playhead / totalDuration) : 0;

  useEffect(() => {
    if (!maxLoops || totalDuration <= 0) return;
    if (loops >= maxLoops) {
      player.setIsPlaying(false);
      player.seekTo(totalDuration * maxLoops);
      onPlayingChangeRef.current?.(false);
    }
  }, [maxLoops, loops, totalDuration]);

  const prevIsPlayingRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (!maxLoops || totalDuration <= 0) return;
    const wantsPlay =
      typeof isPlaying === "boolean" ? isPlaying : player.isPlaying;
    const prev = prevIsPlayingRef.current;
    prevIsPlayingRef.current = wantsPlay;
    if (wantsPlay && !prev && loops >= maxLoops) {
      player.restart();
      onPlayingChangeRef.current?.(true);
    }
  }, [isPlaying, maxLoops, loops, totalDuration]);

  const formatTime = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return "00:00";
    const totalSeconds = Math.floor(value / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0",
    )}`;
  };

  const handleScrubStart = () => {
    scrubbingRef.current = true;
    wasPlayingRef.current = player.isPlaying;
    player.setIsPlaying(false);
    showControlsNow();
  };

  const handleScrubEnd = () => {
    scrubbingRef.current = false;
    if (wasPlayingRef.current) {
      player.setIsPlaying(true);
    }
    showControlsNow();
  };

  const handleScrub = (value: number) => {
    if (!totalDuration) return;
    player.seekTo(Math.max(0, Math.min(totalDuration, value)));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = Math.max(1, Math.floor(canvasSize.w));
    const height = Math.max(1, Math.floor(canvasSize.h));
    if (!width || !height) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    ctx.clearRect(0, 0, width, height);
    const pitchRect = drawPitch(
      ctx,
      width,
      height,
      resolvedPitchPreset as any,
      resolvedPitchOrientation,
    );
    drawElements(
      ctx,
      player.animatedElements as any,
      null,
      pitchRect,
      rotatedPaths as any,
      rotatedStrokes as any,
      resolvedBallAttachments,
      null,
      {
        showOverlays: false,
        showLabels: false,
        showSequenceNumbers: false,
        showRotateHandle: false,
        showResizeHandle: false,
      },
    );
  }, [
    ready,
    canvasSize.w,
    canvasSize.h,
    player.animatedElements,
    resolvedPitchPreset,
    resolvedPaths,
    resolvedStrokes,
    resolvedBallAttachments,
  ]);

  return (
    <div
      ref={containerRef}
      className={[
        "relative overflow-hidden",
        forceFullscreen
          ? "fixed inset-0 z-50 bg-[#050816] p-4 sm:p-6"
          : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseMove={showControlsNow}
      onTouchStart={showControlsNow}
    >
      <canvas ref={canvasRef} className={canvasClassName} />
      {showControls ? (
        <>
          <div
            className={`pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent transition-opacity ${
              controlsVisible ? "opacity-100" : "opacity-0"
            }`}
          />
          <button
            type="button"
            onClick={() => {
              const next = !player.isPlaying;
              player.setIsPlaying(next);
              onPlayingChange?.(next);
              showControlsNow();
            }}
            className={`absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white shadow-[0_20px_40px_rgba(0,0,0,0.6)] backdrop-blur transition ${
              player.isPlaying ? "opacity-0" : "opacity-100"
            }`}
          >
            ▶
          </button>
          <div
            className={`absolute bottom-3 left-3 right-3 flex flex-col gap-2 transition-opacity ${
              controlsVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            {showTimeline ? (
              <div className="flex items-center gap-3 text-[11px] text-slate-200">
                <span className="tabular-nums text-slate-300">
                  {formatTime(currentTime)}
                </span>
                <div className="relative flex-1">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, totalDuration)}
                    value={currentTime}
                    onPointerDown={handleScrubStart}
                    onPointerUp={handleScrubEnd}
                    onChange={(event) =>
                      handleScrub(Number(event.target.value))
                    }
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/20"
                  />
                  <div
                    className="pointer-events-none absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-violet-400/70"
                    style={{ width: `${Math.min(100, progress * 100)}%` }}
                  />
                </div>
                <span className="tabular-nums text-slate-400">
                  {formatTime(totalDuration)}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = !player.isPlaying;
                    player.setIsPlaying(next);
                    onPlayingChange?.(next);
                    showControlsNow();
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur transition hover:bg-white/20"
                >
                  {player.isPlaying ? "❚❚" : "▶"}
                </button>
              </div>
              {showFullscreen ? (
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur transition hover:bg-white/20"
                >
                  {isFullscreen || forceFullscreen ? "⤢" : "⛶"}
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
