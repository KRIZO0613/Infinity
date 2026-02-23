import { useEffect, useMemo, useRef, useState } from "react";

import type {
  BaseSnapshot,
  CanvasElementBase,
  FrameSnapshot,
  PathPoint,
  Stroke,
} from "@/types/animatedExercise";

export type KeyframePlayer<T extends CanvasElementBase> = {
  isPlaying: boolean;
  playhead: number;
  toggle: () => void;
  setIsPlaying: (value: boolean) => void;
  reset: () => void;
  restart: () => void;
  seekTo: (value: number) => void;
  frameDuration: number;
  setFrameDuration: (value: number) => void;
  animatedElements: T[];
  totalDuration: number;
  loopCount: number;
};

const getStrokeSequenceIndex = (stroke: Stroke) => {
  if (Number.isFinite(stroke.sequenceIndex)) {
    return Math.max(1, Math.floor(stroke.sequenceIndex as number));
  }
  if (Number.isFinite(stroke.phaseId)) {
    return Math.max(1, Math.floor(stroke.phaseId + 1));
  }
  return 1;
};

const getActionSpeed = (
  multipliers: Record<number, number> | Record<string, number>,
  sequenceIndex: number,
) => {
  const direct = (multipliers as Record<number, number>)[sequenceIndex];
  if (typeof direct === "number") return direct;
  const fallback = (multipliers as Record<string, number>)[
    String(sequenceIndex)
  ];
  return typeof fallback === "number" ? fallback : 1;
};

export const useExerciseAnimationPlayer = <T extends CanvasElementBase>(
  elements: T[],
  frames: FrameSnapshot[],
  paths: Record<string, PathPoint[]>,
  strokes: Stroke[],
  strokesBase: BaseSnapshot | null,
  ballAttachments: Record<string, string>,
  actionSpeedMultipliers: Record<number, number> | Record<string, number> = {},
  frameSpeedMultipliers: Record<string, number> = {},
  playbackRate = 1,
  options?: { preservePlayhead?: boolean },
): KeyframePlayer<T> => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [frameDuration, setFrameDuration] = useState(2000);
  const [loopCount, setLoopCount] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const startOffsetRef = useRef(0);
  const playbackRateRef = useRef(playbackRate);
  const hasPaths = useMemo(
    () => Object.values(paths).some((points) => points.length >= 2),
    [paths],
  );
  const phases = useMemo(() => {
    const grouped = new Map<number, Stroke[]>();
    strokes.forEach((stroke) => {
      const sequenceIndex = getStrokeSequenceIndex(stroke);
      if (!grouped.has(sequenceIndex)) grouped.set(sequenceIndex, []);
      grouped.get(sequenceIndex)?.push(stroke);
    });
    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([sequenceIndex, items]) => ({
        id: sequenceIndex,
        strokes: items,
        duration: Math.max(
          1,
          ...items.map((item) => {
            const speed = getActionSpeed(actionSpeedMultipliers, sequenceIndex);
            return (item.durationMs || 1) / Math.max(0.25, speed);
          }),
        ),
      }));
  }, [strokes, actionSpeedMultipliers]);
  const hasActions = phases.length > 0;
  const totalDuration = useMemo(() => {
    if (phases.length > 0) {
      return phases.reduce((sum, phase) => sum + (phase.duration || 0), 0);
    }
    if (frames.length >= 2) {
      const durations = frames.map((frame) => {
        const speed = frameSpeedMultipliers[frame.id] ?? 1;
        return frameDuration / Math.max(0.25, speed);
      });
      return durations.reduce((sum, value) => sum + value, 0);
    }
    if (hasPaths) {
      let max = 0;
      Object.values(paths).forEach((points) => {
        if (!points.length) return;
        const duration = points[points.length - 1].t;
        if (duration > max) max = duration;
      });
      return max;
    }
    return 0;
  }, [phases, frames, frameDuration, frameSpeedMultipliers, hasPaths, paths]);

  useEffect(() => {
    if (!isPlaying || (frames.length < 2 && !hasPaths && !hasActions)) return;
    const loop = (time: number) => {
      if (!startRef.current) startRef.current = time;
      const elapsed = time - startRef.current;
      const nextPlayhead =
        startOffsetRef.current + elapsed * playbackRateRef.current;
      setPlayhead(nextPlayhead);
      if (totalDuration > 0) {
        const nextLoops = Math.floor(nextPlayhead / totalDuration);
        setLoopCount(nextLoops);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      startRef.current = null;
    };
  }, [isPlaying, frames.length, hasPaths, hasActions]);

  useEffect(() => {
    if (playbackRateRef.current === playbackRate) return;
    playbackRateRef.current = playbackRate;
    if (isPlaying && typeof performance !== "undefined") {
      startOffsetRef.current = playhead;
      startRef.current = performance.now();
    }
  }, [playbackRate, isPlaying, playhead]);

  const animatedElements = useMemo(() => {
    let animated = elements as T[];

    if (isPlaying && phases.length > 0) {
      const totalDuration = phases.reduce(
        (sum, phase) => sum + (phase.duration || 0),
        0,
      );
      if (totalDuration > 0) {
        const local = playhead % totalDuration;
        let elapsed = 0;
        let currentPhaseIndex = 0;
        for (let i = 0; i < phases.length; i += 1) {
          const duration = Math.max(1, phases[i].duration || 0);
          if (local <= elapsed + duration) {
            currentPhaseIndex = i;
            break;
          }
          elapsed += duration;
        }
        const currentPhase = phases[currentPhaseIndex];
        const phaseDuration = Math.max(1, currentPhase.duration || 0);
        const phaseTime = Math.min(phaseDuration, Math.max(0, local - elapsed));

        const positions = new Map<string, { x: number; y: number }>();
        elements.forEach((el) => {
          const base = strokesBase?.[el.id];
          positions.set(el.id, base ?? { x: el.x, y: el.y });
        });

        const ballsByPlayer = new Map<string, string[]>();
        Object.entries(ballAttachments ?? {}).forEach(([ballId, playerId]) => {
          if (!ballsByPlayer.has(playerId)) ballsByPlayer.set(playerId, []);
          ballsByPlayer.get(playerId)?.push(ballId);
        });
        const getAttachedBalls = (playerId: string) =>
          ballsByPlayer.get(playerId) ?? [];
        const getCarryBallIds = (stroke: Stroke) =>
          stroke.ballIds && stroke.ballIds.length
            ? stroke.ballIds
            : stroke.elementId
            ? getAttachedBalls(stroke.elementId)
            : [];
        for (let i = 0; i < currentPhaseIndex; i += 1) {
          const phase = phases[i];
          phase.strokes.forEach((stroke) => {
            if (stroke.kind === "move" || stroke.kind === "carry") {
              const points = stroke.points;
              if (points.length >= 1 && stroke.elementId) {
                positions.set(stroke.elementId, {
                  x: points[points.length - 1].x,
                  y: points[points.length - 1].y,
                });
              }
              if (stroke.kind === "carry" && stroke.elementId) {
                const carried = positions.get(stroke.elementId);
                if (carried) {
                  getCarryBallIds(stroke).forEach((attachedBallId) => {
                    positions.set(attachedBallId, {
                      x: carried.x + 0.015,
                      y: carried.y + 0.01,
                    });
                  });
                }
              }
            }
          });
        }

        const getPointAlong = (
          points: Array<{ x: number; y: number }>,
          t: number,
        ) => {
          if (points.length <= 1) return points[0] ?? { x: 0, y: 0 };
          const lengths: number[] = [];
          let total = 0;
          for (let i = 1; i < points.length; i += 1) {
            const dist = Math.hypot(
              points[i].x - points[i - 1].x,
              points[i].y - points[i - 1].y,
            );
            lengths.push(dist);
            total += dist;
          }
          if (total === 0) return points[points.length - 1];
          const target = total * t;
          let acc = 0;
          for (let i = 0; i < lengths.length; i += 1) {
            if (acc + lengths[i] >= target) {
              const ratio = (target - acc) / Math.max(1e-6, lengths[i]);
              return {
                x: points[i].x + (points[i + 1].x - points[i].x) * ratio,
                y: points[i].y + (points[i + 1].y - points[i].y) * ratio,
              };
            }
            acc += lengths[i];
          }
          return points[points.length - 1];
        };

        const animatedPositions = new Map(positions);
        currentPhase.strokes.forEach((stroke) => {
          if (!stroke.elementId || stroke.points.length < 2) return;
          const speed = getActionSpeed(actionSpeedMultipliers, currentPhase.id);
          const effectiveDuration =
            (stroke.durationMs || 0) / Math.max(0.25, speed);
          const t = Math.min(1, phaseTime / Math.max(1, effectiveDuration));
          const point = getPointAlong(stroke.points, t);
          animatedPositions.set(stroke.elementId, { x: point.x, y: point.y });
        });

        currentPhase.strokes.forEach((stroke) => {
          if (stroke.kind !== "carry" || !stroke.elementId) return;
          const carried =
            animatedPositions.get(stroke.elementId) ??
            positions.get(stroke.elementId);
          if (!carried) return;
          getCarryBallIds(stroke).forEach((attachedBallId) => {
            animatedPositions.set(attachedBallId, {
              x: carried.x + 0.015,
              y: carried.y + 0.01,
            });
          });
        });

        animated = elements.map((element) => {
          const base = animatedPositions.get(element.id) ?? {
            x: element.x,
            y: element.y,
          };
          return { ...element, x: base.x, y: base.y } as T;
        });

        return animated;
      }
    }

    if (isPlaying && frames.length >= 2) {
      const durations = frames.map((frame) => {
        const speed = frameSpeedMultipliers[frame.id] ?? 1;
        return frameDuration / Math.max(0.25, speed);
      });
      const totalDuration = durations.reduce((sum, value) => sum + value, 0);
      const local = totalDuration > 0 ? playhead % totalDuration : 0;
      let index = 0;
      let acc = durations[0] ?? 0;
      while (index < durations.length - 1 && local > acc) {
        index += 1;
        acc += durations[index] ?? 0;
      }
      const start = acc - (durations[index] ?? 0);
      const currentDuration = Math.max(1, durations[index] ?? frameDuration);
      const nextIndex = (index + 1) % frames.length;
      const t = currentDuration ? (local - start) / currentDuration : 0;

      const currentMap = new Map(
        frames[index].elementsSnapshot.map((snap) => [snap.id, snap]),
      );
      const nextMap = new Map(
        frames[nextIndex].elementsSnapshot.map((snap) => [snap.id, snap]),
      );

      animated = elements.map((element) => {
        const current = currentMap.get(element.id) ?? {
          x: element.x,
          y: element.y,
        };
        const next = nextMap.get(element.id) ?? current;
        return {
          ...element,
          x: current.x + (next.x - current.x) * t,
          y: current.y + (next.y - current.y) * t,
        } as T;
      });
    }

    if (isPlaying && hasPaths) {
      animated = animated.map((element) => {
        const points = paths[element.id];
        if (!points || points.length < 2) return element;
        const duration = points[points.length - 1].t;
        if (duration <= 0) return element;
        const local = playhead % duration;
        let index = 0;
        while (index < points.length - 2 && points[index + 1].t < local) {
          index += 1;
        }
        const current = points[index];
        const next = points[index + 1] ?? current;
        const segment = Math.max(1, next.t - current.t);
        const t = Math.min(1, Math.max(0, (local - current.t) / segment));
        return {
          ...element,
          x: current.x + (next.x - current.x) * t,
          y: current.y + (next.y - current.y) * t,
        } as T;
      });
    }

    return animated;
  }, [
    elements,
    frames,
    frameDuration,
    isPlaying,
    playhead,
    paths,
    hasPaths,
    phases,
    strokesBase,
    ballAttachments,
    actionSpeedMultipliers,
    frameSpeedMultipliers,
  ]);

  const toggle = () =>
    setIsPlaying((prev) => {
      if (prev) {
        startOffsetRef.current = playhead;
      }
      return !prev;
    });
  const reset = () => {
    startRef.current = null;
    startOffsetRef.current = 0;
    setPlayhead(0);
    setLoopCount(0);
  };
  const restart = () => {
    startRef.current = null;
    startOffsetRef.current = 0;
    setPlayhead(0);
    setLoopCount(0);
    setIsPlaying(true);
  };
  const seekTo = (value: number) => {
    const next = Math.max(0, value);
    startOffsetRef.current = next;
    setPlayhead(next);
    if (totalDuration > 0) {
      setLoopCount(Math.floor(next / totalDuration));
    }
    if (isPlaying && typeof performance !== "undefined") {
      startRef.current = performance.now();
    }
  };
  const preservePlayhead = options?.preservePlayhead ?? false;

  useEffect(() => {
    if (isPlaying || preservePlayhead) return;
    startOffsetRef.current = 0;
  }, [isPlaying, preservePlayhead]);

  return {
    isPlaying,
    playhead,
    toggle,
    setIsPlaying,
    reset,
    restart,
    seekTo,
    frameDuration,
    setFrameDuration,
    animatedElements,
    totalDuration,
    loopCount,
  };
};
