"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";

const TOOL_OPTIONS = [
  { key: "select", label: "Sélection" },
  { key: "player", label: "Joueur" },
  { key: "ball", label: "Ballon" },
  { key: "cone", label: "Plot" },
  { key: "disc", label: "Coupelle" },
] as const;

type ToolKey = (typeof TOOL_OPTIONS)[number]["key"];

type ElementType = "player" | "ball" | "cone" | "disc";

type CanvasElement = {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  color?: string;
  label?: string;
  size?: number;
};

type FrameSnapshot = {
  id: string;
  elementsSnapshot: Array<{ id: string; x: number; y: number }>;
};

type PathPoint = {
  x: number;
  y: number;
  t: number;
};

type BaseSnapshot = Record<string, { x: number; y: number }>;

type Stroke = {
  id: string;
  kind: "move" | "carry";
  order: number;
  phaseId: number;
  elementId?: string;
  points: Array<{ x: number; y: number }>;
  style?: {
    dashed?: boolean;
    width?: number;
    arrow?: boolean;
    variant?: "move" | "carry" | "ball";
  };
  durationMs: number;
};

type PitchPreset = "standard";

type PitchRect = { x: number; y: number; w: number; h: number };

type KeyframePlayer = {
  isPlaying: boolean;
  playhead: number;
  toggle: () => void;
  setIsPlaying: (value: boolean) => void;
  reset: () => void;
  restart: () => void;
  frameDuration: number;
  setFrameDuration: (value: number) => void;
  animatedElements: CanvasElement[];
};

type ToastState = {
  kind: "success" | "error";
  message: string;
} | null;

const DEFAULT_COLORS = [
  "#7B66FF",
  "#6A5CFF",
  "#00C8B4",
  "#F8C12C",
  "#FF6F91",
  "#FFFFFF",
];

const buildId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

const getPitchRect = (width: number, height: number): PitchRect => {
  const padding = Math.min(width, height) * 0.06;
  // Portrait pitch ratio (width:height = 68:105) to render goals top/bottom.
  const ratio = 68 / 105;
  let w = width - padding * 2;
  let h = w / ratio;
  if (h > height - padding * 2) {
    h = height - padding * 2;
    w = h * ratio;
  }
  const x = (width - w) / 2;
  const y = (height - h) / 2;
  return { x, y, w, h };
};

const getDefaultSize = (type: ElementType) => {
  if (type === "player") return 0.035;
  if (type === "ball") return 0.018;
  if (type === "cone") return 0.03;
  return 0.024;
};

// Global scale to keep elements visually minimal by default.
const ELEMENT_SIZE_SCALE = 0.75;
const PLAYER_SIZE_SCALE = 0.85;
const CONE_SIZE_SCALE = 0.8;

const getRenderSize = (type: ElementType, size: number) => {
  const base = size * ELEMENT_SIZE_SCALE;
  if (type === "player") return base * PLAYER_SIZE_SCALE;
  if (type === "cone") return base * CONE_SIZE_SCALE;
  return base;
};

export const drawPitch = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  preset: PitchPreset,
) => {
  const { x, y, w, h } = getPitchRect(width, height);
  ctx.save();
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#0A0D16");
  gradient.addColorStop(1, "#161832");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(10, 12, 22, 0.65)";
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.0022);
  ctx.strokeRect(x, y, w, h);

  const centerX = x + w / 2;
  const centerY = y + h / 2;
  ctx.beginPath();
  ctx.moveTo(x, centerY);
  ctx.lineTo(x + w, centerY);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(centerX, centerY, w * 0.1, 0, Math.PI * 2);
  ctx.stroke();

  const boxWidth = w * 0.6;
  const boxHeight = h * 0.16;
  ctx.strokeRect(centerX - boxWidth / 2, y, boxWidth, boxHeight);
  ctx.strokeRect(
    centerX - boxWidth / 2,
    y + h - boxHeight,
    boxWidth,
    boxHeight,
  );

  const smallBoxWidth = w * 0.25;
  const smallBoxHeight = h * 0.06;
  ctx.strokeRect(centerX - smallBoxWidth / 2, y, smallBoxWidth, smallBoxHeight);
  ctx.strokeRect(
    centerX - smallBoxWidth / 2,
    y + h - smallBoxHeight,
    smallBoxWidth,
    smallBoxHeight,
  );

  ctx.restore();
  return { x, y, w, h, preset };
};

export const drawElements = (
  ctx: CanvasRenderingContext2D,
  elements: CanvasElement[],
  selectedId: string | null,
  pitchRect: PitchRect,
  paths: Record<string, PathPoint[]> = {},
  strokes: Stroke[] = [],
  ballAttachedToId?: string | null,
  snapTargetId?: string | null,
  options?: { showOverlays?: boolean; showLabels?: boolean },
) => {
  const showOverlays = options?.showOverlays ?? true;
  const showLabels = options?.showLabels ?? true;
  const drawSmoothPath = (points: PathPoint[]) => {
    if (points.length < 2) return;
    // Quadratic Bézier smoothing: use each point as control and midpoints as end points.
    if (points.length < 3) {
      const first = points[0];
      ctx.moveTo(
        pitchRect.x + first.x * pitchRect.w,
        pitchRect.y + first.y * pitchRect.h,
      );
      for (let i = 1; i < points.length; i += 1) {
        const p = points[i];
        ctx.lineTo(
          pitchRect.x + p.x * pitchRect.w,
          pitchRect.y + p.y * pitchRect.h,
        );
      }
      return;
    }

    const first = points[0];
    ctx.moveTo(
      pitchRect.x + first.x * pitchRect.w,
      pitchRect.y + first.y * pitchRect.h,
    );
    for (let i = 1; i < points.length - 1; i += 1) {
      const current = points[i];
      const next = points[i + 1];
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      ctx.quadraticCurveTo(
        pitchRect.x + current.x * pitchRect.w,
        pitchRect.y + current.y * pitchRect.h,
        pitchRect.x + midX * pitchRect.w,
        pitchRect.y + midY * pitchRect.h,
      );
    }
    const last = points[points.length - 1];
    ctx.lineTo(
      pitchRect.x + last.x * pitchRect.w,
      pitchRect.y + last.y * pitchRect.h,
    );
  };

  const drawArrow = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const headLength = 10;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - headLength * Math.cos(angle - Math.PI / 6),
      to.y - headLength * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      to.x - headLength * Math.cos(angle + Math.PI / 6),
      to.y - headLength * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();
  };

  const drawStrokePath = (
    points: Array<{ x: number; y: number }>,
    dashed: boolean,
    width: number,
    color: string,
    arrow: boolean,
  ) => {
    if (points.length < 2) return;
    ctx.save();
    ctx.beginPath();
    drawSmoothPath(
      points.map((point) => ({ x: point.x, y: point.y, t: 0 })),
    );
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dashed ? [6, 6] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    if (arrow) {
      const last = points[points.length - 1];
      const prev = points[points.length - 2];
      const to = {
        x: pitchRect.x + last.x * pitchRect.w,
        y: pitchRect.y + last.y * pitchRect.h,
      };
      const from = {
        x: pitchRect.x + prev.x * pitchRect.w,
        y: pitchRect.y + prev.y * pitchRect.h,
      };
      ctx.fillStyle = color;
      drawArrow(from, to);
    }
    ctx.restore();
  };

  if (showOverlays) {
    strokes.forEach((stroke) => {
      const variant = stroke.style?.variant ?? stroke.kind;
      const color =
        variant === "ball"
          ? "rgba(125, 211, 252, 0.7)"
          : variant === "carry"
          ? "rgba(253, 224, 71, 0.7)"
          : "rgba(148, 163, 184, 0.55)";
      drawStrokePath(
        stroke.points,
        stroke.style?.dashed ?? variant === "ball",
        stroke.style?.width ?? (stroke.kind === "carry" ? 2.5 : 1.5),
        color,
        stroke.style?.arrow ?? true,
      );
    });

    Object.entries(paths).forEach(([id, points]) => {
      if (points.length < 2) return;
      ctx.save();
      ctx.beginPath();
      drawSmoothPath(points);
      ctx.strokeStyle =
        id === selectedId
          ? "rgba(167, 139, 250, 0.7)"
          : "rgba(148, 163, 184, 0.35)";
      ctx.lineWidth = id === selectedId ? 2 : 1;
      ctx.stroke();
      ctx.restore();
    });
  }

  elements.forEach((element) => {
    const px = pitchRect.x + element.x * pitchRect.w;
    const py = pitchRect.y + element.y * pitchRect.h;
    const size = getRenderSize(
      element.type,
      element.size ?? getDefaultSize(element.type),
    );
    const radius = size * pitchRect.w;

    ctx.save();
    if (showOverlays && element.id === selectedId) {
      ctx.shadowColor = "rgba(168, 85, 247, 0.6)";
      ctx.shadowBlur = radius * 0.8;
    }

    if (element.type === "player") {
      ctx.fillStyle = element.color ?? "#7B66FF";
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();

      if (showOverlays && element.id === ballAttachedToId) {
        ctx.fillStyle = "rgba(253, 224, 71, 0.95)";
        ctx.beginPath();
        ctx.arc(px + radius * 0.6, py - radius * 0.6, radius * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }

      if (showOverlays && element.id === snapTargetId) {
        ctx.strokeStyle = "rgba(253, 224, 71, 0.6)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (showLabels && element.label) {
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.font = `${Math.max(10, radius * 0.9)}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(element.label, px, py + 0.5);
      }
    } else if (element.type === "ball") {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(px, py, radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.lineWidth = Math.max(1, radius * 0.12);
      ctx.stroke();
    } else if (element.type === "cone") {
      ctx.fillStyle = element.color ?? "#F8C12C";
      ctx.beginPath();
      ctx.moveTo(px, py - radius);
      ctx.lineTo(px + radius, py + radius);
      ctx.lineTo(px - radius, py + radius);
      ctx.closePath();
      ctx.fill();
    } else if (element.type === "disc") {
      ctx.fillStyle = element.color ?? "#FF6F91";
      ctx.beginPath();
      ctx.ellipse(px, py, radius, radius * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (showOverlays && element.id === selectedId) {
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(px, py, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  });
};

const hitTest = (
  elements: CanvasElement[],
  point: { x: number; y: number },
  pitchRect: PitchRect,
) => {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const element = elements[i];
    const px = pitchRect.x + element.x * pitchRect.w;
    const py = pitchRect.y + element.y * pitchRect.h;
    const size = getRenderSize(
      element.type,
      element.size ?? getDefaultSize(element.type),
    );
    const radius = size * pitchRect.w;

    if (element.type === "cone") {
      // Simple bbox hit for triangle
      const minX = px - radius;
      const maxX = px + radius;
      const minY = py - radius;
      const maxY = py + radius;
      if (
        point.x >= minX - 6 &&
        point.x <= maxX + 6 &&
        point.y >= minY - 6 &&
        point.y <= maxY + 6
      ) {
        return element.id;
      }
      continue;
    }

    const scaleY = element.type === "disc" ? 0.45 : 1;
    const dx = (point.x - px) / radius;
    const dy = (point.y - py) / (radius * scaleY);
    if (dx * dx + dy * dy <= 1.15) return element.id;
  }
  return null;
};

const useCanvasElements = (
  initial: CanvasElement[] = [],
  handlers?: {
    onDragStart?: (id: string, x: number, y: number) => void;
    onDragMove?: (id: string, x: number, y: number) => void;
    onDragEnd?: (id: string) => void;
    onElementClick?: (element: CanvasElement) => void;
  },
) => {
  const [elements, setElements] = useState<CanvasElement[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolKey>("select");
  const [playerColor, setPlayerColor] = useState(DEFAULT_COLORS[0]);
  const draggingRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const pitchRef = useRef<PitchRect>({ x: 0, y: 0, w: 1, h: 1 });

  const setPitchRect = (rect: PitchRect) => {
    pitchRef.current = rect;
  };

  const addElement = (type: ElementType, position: { x: number; y: number }) => {
    const baseColor =
      type === "ball" ? "#ffffff" : playerColor;
    const newElement: CanvasElement = {
      id: buildId(),
      type,
      x: clamp01(position.x),
      y: clamp01(position.y),
      color: baseColor,
      label: type === "player" ? "" : undefined,
      size: getDefaultSize(type),
    };
    setElements((prev) => [...prev, newElement]);
    setSelectedId(newElement.id);
  };

  const updateElement = (id: string, patch: Partial<CanvasElement>) => {
    setElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    );
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const pitchRect = pitchRef.current;
    const normalized = {
      x: clamp01((point.x - pitchRect.x) / pitchRect.w),
      y: clamp01((point.y - pitchRect.y) / pitchRect.h),
    };

    // Priority: hit-test selection/drag first, even in placement mode.
    const hitId = hitTest(elements, point, pitchRect);
    if (hitId) {
      setSelectedId(hitId);
      const px = pitchRect.x + (elements.find((el) => el.id === hitId)?.x ?? 0) * pitchRect.w;
      const py = pitchRect.y + (elements.find((el) => el.id === hitId)?.y ?? 0) * pitchRect.h;
      const element = elements.find((el) => el.id === hitId);
      draggingRef.current = {
        id: hitId,
        offsetX: point.x - px,
        offsetY: point.y - py,
        startX: point.x,
        startY: point.y,
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      if (element) {
        handlers?.onDragStart?.(element.id, element.x, element.y);
      }
    } else {
      if (tool !== "select") {
        addElement(tool as ElementType, normalized);
        if (!event.shiftKey) {
          setTool("select");
        }
        return;
      }
      setSelectedId(null);
    }
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (!draggingRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const movedDistance = Math.hypot(
      point.x - draggingRef.current.startX,
      point.y - draggingRef.current.startY,
    );
    if (movedDistance > 3) {
      draggingRef.current.moved = true;
    }
    const pitchRect = pitchRef.current;
    const nextX = clamp01((point.x - draggingRef.current.offsetX - pitchRect.x) / pitchRect.w);
    const nextY = clamp01((point.y - draggingRef.current.offsetY - pitchRect.y) / pitchRect.h);
    updateElement(draggingRef.current.id, { x: nextX, y: nextY });
    handlers?.onDragMove?.(draggingRef.current.id, nextX, nextY);
  };

  const handlePointerUp = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (draggingRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      handlers?.onDragEnd?.(draggingRef.current.id);
      if (!draggingRef.current.moved) {
        const element = elements.find((el) => el.id === draggingRef.current?.id);
        if (element) {
          handlers?.onElementClick?.(element);
        }
      }
    }
    draggingRef.current = null;
  };

  const clearDrag = () => {
    draggingRef.current = null;
  };

  return {
    elements,
    setElements,
    selectedId,
    setSelectedId,
    tool,
    setTool,
    playerColor,
    setPlayerColor,
    updateElement,
    deleteSelected,
    addElement,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    setPitchRect,
    clearDrag,
  };
};

const useKeyframesPlayer = (
  elements: CanvasElement[],
  frames: FrameSnapshot[],
  paths: Record<string, PathPoint[]>,
  strokes: Stroke[],
  strokesBase: BaseSnapshot | null,
): KeyframePlayer => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [frameDuration, setFrameDuration] = useState(2000);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const hasPaths = useMemo(
    () => Object.values(paths).some((points) => points.length >= 2),
    [paths],
  );
  const phases = useMemo(() => {
    const grouped = new Map<number, Stroke[]>();
    strokes.forEach((stroke) => {
      const phaseId = Number.isFinite(stroke.phaseId) ? stroke.phaseId : 0;
      if (!grouped.has(phaseId)) grouped.set(phaseId, []);
      grouped.get(phaseId)?.push(stroke);
    });
    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([phaseId, items]) => ({
        id: phaseId,
        strokes: items,
        duration: Math.max(1, ...items.map((item) => item.durationMs || 1)),
      }));
  }, [strokes]);
  const hasActions = phases.length > 0;

  useEffect(() => {
    if (!isPlaying || (frames.length < 2 && !hasPaths && !hasActions)) return;
    const loop = (time: number) => {
      if (!startRef.current) startRef.current = time;
      const elapsed = time - startRef.current;
      setPlayhead(elapsed);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      startRef.current = null;
    };
  }, [isPlaying, frames.length, hasPaths, hasActions]);

  const animatedElements = useMemo(() => {
    let animated = elements;

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

        const ballId = elements.find((el) => el.type === "ball")?.id ?? null;
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
              if (stroke.kind === "carry" && stroke.elementId && ballId) {
                const carried = positions.get(stroke.elementId);
                if (carried) {
                  positions.set(ballId, {
                    x: carried.x + 0.015,
                    y: carried.y + 0.01,
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
                x:
                  points[i].x + (points[i + 1].x - points[i].x) * ratio,
                y:
                  points[i].y + (points[i + 1].y - points[i].y) * ratio,
              };
            }
            acc += lengths[i];
          }
          return points[points.length - 1];
        };

        const animatedPositions = new Map(positions);
        currentPhase.strokes.forEach((stroke) => {
          if (!stroke.elementId || stroke.points.length < 2) return;
          const t = Math.min(1, phaseTime / Math.max(1, stroke.durationMs || 0));
          const point = getPointAlong(stroke.points, t);
          animatedPositions.set(stroke.elementId, { x: point.x, y: point.y });
        });

        const activeCarry = currentPhase.strokes.find(
          (stroke) => stroke.kind === "carry",
        );
        if (activeCarry && ballId && activeCarry.elementId) {
          const carried =
            animatedPositions.get(activeCarry.elementId) ??
            positions.get(activeCarry.elementId);
          if (carried) {
            animatedPositions.set(ballId, {
              x: carried.x + 0.015,
              y: carried.y + 0.01,
            });
          }
        }

        animated = elements.map((element) => {
          const base = animatedPositions.get(element.id) ?? { x: element.x, y: element.y };
          return { ...element, x: base.x, y: base.y };
        });

        return animated;
      }
    }

    if (isPlaying && frames.length >= 2) {
      const totalDuration = frames.length * frameDuration;
      const local = playhead % totalDuration;
      const index = Math.floor(local / frameDuration);
      const nextIndex = (index + 1) % frames.length;
      const t = (local % frameDuration) / frameDuration;

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
        };
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
        };
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
  ]);

  const toggle = () => setIsPlaying((prev) => !prev);
  const reset = () => {
    startRef.current = null;
    setPlayhead(0);
  };
  const restart = () => {
    startRef.current = null;
    setPlayhead(0);
    setIsPlaying(true);
  };

  return {
    isPlaying,
    playhead,
    toggle,
    setIsPlaying,
    reset,
    restart,
    frameDuration,
    setFrameDuration,
    animatedElements,
  };
};

export default function ExerciseAnimatedEditor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const router = useRouter();
  const [canvasSize, setCanvasSize] = useState({ w: 1200, h: 720 });
  const [name, setName] = useState("Exercice animé");
  const [frames, setFrames] = useState<FrameSnapshot[]>([]);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [pitchPreset] = useState<PitchPreset>("standard");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [recordPathMode, setRecordPathMode] = useState(false);
  const [currentRecordingElementId, setCurrentRecordingElementId] = useState<
    string | null
  >(null);
  const [recordMode, setRecordMode] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [strokesBase, setStrokesBase] = useState<BaseSnapshot | null>(null);
  const [groupMode, setGroupMode] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [ballAttachedToId, setBallAttachedToId] = useState<string | null>(null);
  const [showSequenceDebug, setShowSequenceDebug] = useState(false);
  const [snapTargetId, setSnapTargetId] = useState<string | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const strokesBaseRef = useRef<BaseSnapshot | null>(null);
  const [associationTargetPlayerId, setAssociationTargetPlayerId] = useState<
    string | null
  >(null);
  const [associationTargetBallId, setAssociationTargetBallId] = useState<
    string | null
  >(null);
  const [paths, setPaths] = useState<Record<string, PathPoint[]>>({});
  const pathRecordRef = useRef<{
    id: string;
    startTime: number;
    lastTime: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const sequenceDragRef = useRef<{
    id: string;
    startTime: number;
    lastTime: number;
    lastX: number;
    lastY: number;
    points: PathPoint[];
  } | null>(null);

  const {
    elements,
    setElements,
    selectedId,
    setSelectedId,
    tool,
    setTool,
    playerColor,
    setPlayerColor,
    updateElement,
    deleteSelected,
    addElement,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    setPitchRect,
    clearDrag,
  } = useCanvasElements([], {
    onDragStart: (id, x, y) => {
      const element = elements.find((el) => el.id === id);
      const isRecordable =
        element?.type === "player" || element?.type === "ball";

      if (element?.type === "ball" && ballAttachedToId) {
        setBallAttachedToId(null);
      }

      if (recordMode && element && isRecordable) {
        const now = performance.now();
        sequenceDragRef.current = {
          id,
          startTime: now,
          lastTime: now,
          lastX: x,
          lastY: y,
          points: [
            {
              x,
              y,
              t: 0,
            },
          ],
        };
      }

      if (!recordPathMode) return;
      setCurrentRecordingElementId(id);
      const now = performance.now();
      setPaths((prev) => {
        const existing = prev[id] ?? [];
        const baseT = existing.length ? existing[existing.length - 1].t : 0;
        let next = existing.length ? [...existing] : [{ x, y, t: 0 }];
        if (existing.length) {
          const last = existing[existing.length - 1];
          const dist = Math.hypot(x - last.x, y - last.y);
          if (dist >= 0.005) {
            next = [...existing, { x, y, t: baseT }];
          }
        }
        pathRecordRef.current = {
          id,
          startTime: now - baseT,
          lastTime: now,
          lastX: x,
          lastY: y,
        };
        return { ...prev, [id]: next };
      });
    },
    onDragMove: (id, x, y) => {
      if (ballAttachedToId && primaryBall) {
        if (id === ballAttachedToId) {
          updateElement(primaryBall.id, {
            x: clamp01(x + 0.015),
            y: clamp01(y + 0.01),
          });
        }
      }

      if (recordMode) {
        const seq = sequenceDragRef.current;
        if (seq && seq.id && id === seq.id) {
          const now = performance.now();
          const dist = Math.hypot(x - seq.lastX, y - seq.lastY);
          if (dist >= 0.005 && (now - seq.lastTime >= 50 || dist >= 0.01)) {
            const t = now - seq.startTime;
            seq.points.push({ x, y, t });
            seq.lastTime = now;
            seq.lastX = x;
            seq.lastY = y;
          }
        }
      }

      if (!recordPathMode) return;
      if (currentRecordingElementId && currentRecordingElementId !== id) return;
      const ref = pathRecordRef.current;
      if (!ref || ref.id !== id) return;
      const now = performance.now();
      const dist = Math.hypot(x - ref.lastX, y - ref.lastY);
      if (dist < 0.005) return;
      if (now - ref.lastTime < 50 && dist < 0.01) return;
      const t = now - ref.startTime;
      ref.lastTime = now;
      ref.lastX = x;
      ref.lastY = y;
      setPaths((prev) => {
        const existing = prev[id] ?? [];
        return { ...prev, [id]: [...existing, { x, y, t }] };
      });
    },
    onDragEnd: (id) => {
      const element = elements.find((el) => el.id === id);
      const isRecordable =
        element?.type === "player" || element?.type === "ball";
      if (recordMode) {
        const seq = sequenceDragRef.current;
        if (seq && seq.points.length >= 2 && isRecordable) {
          const totalDist = seq.points.reduce((sum, point, index) => {
            if (index === 0) return 0;
            const prev = seq.points[index - 1];
            return sum + Math.hypot(point.x - prev.x, point.y - prev.y);
          }, 0);
          if (totalDist >= 0.01) {
            const isBall = element?.type === "ball";
            const isCarry = !isBall && ballAttachedToId === seq.id;
            const durationMs = seq.points[seq.points.length - 1].t || 1200;
            appendStroke({
              id: buildId(),
              kind: isCarry ? "carry" : "move",
              elementId: seq.id,
              points: seq.points.map((point) => ({
                x: point.x,
                y: point.y,
              })),
              style: {
                arrow: true,
                dashed: isBall,
                width: isCarry ? 2.6 : 1.5,
                variant: isCarry ? "carry" : isBall ? "ball" : "move",
              },
              durationMs,
            });
          }
        }
        sequenceDragRef.current = null;
      }

      if (!recordPathMode) {
        pathRecordRef.current = null;
      }
    },
    onElementClick: (element) => {
      void element;
    },
  });

  const player = useKeyframesPlayer(
    elements,
    frames,
    paths,
    strokes,
    strokesBase,
  );

  const selectedElement = useMemo(
    () => elements.find((el) => el.id === selectedId) ?? null,
    [elements, selectedId],
  );
  const playerElements = useMemo(
    () => elements.filter((el) => el.type === "player"),
    [elements],
  );
  const ballElements = useMemo(
    () => elements.filter((el) => el.type === "ball"),
    [elements],
  );
  const primaryBall = useMemo(
    () => ballElements[0] ?? null,
    [ballElements],
  );
  const hasPlayableContent = useMemo(() => {
    if (strokes.length > 0) return true;
    if (frames.length >= 2) return true;
    return Object.values(paths).some((points) => points.length >= 2);
  }, [strokes.length, frames.length, paths]);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    strokesBaseRef.current = strokesBase;
  }, [strokesBase]);

  useEffect(() => {
    if (selectedElement?.type === "ball") {
      setAssociationTargetPlayerId(playerElements[0]?.id ?? null);
    }
    if (selectedElement?.type === "player") {
      setAssociationTargetBallId(ballElements[0]?.id ?? null);
    }
  }, [selectedElement, playerElements, ballElements]);

  const showToast = (kind: "success" | "error", message: string) => {
    setToast({ kind, message });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3200);
  };

  const appendStroke = (stroke: Omit<Stroke, "order" | "phaseId">) => {
    if (!strokesBaseRef.current) {
      const snapshot: BaseSnapshot = {};
      elements.forEach((el) => {
        snapshot[el.id] = { x: el.x, y: el.y };
      });
      strokesBaseRef.current = snapshot;
      setStrokesBase(snapshot);
    }
    const prev = strokesRef.current;
    const last = prev[prev.length - 1];
    const nextPhaseId =
      groupMode && last ? last.phaseId : last ? last.phaseId + 1 : 0;
    if (groupMode && last && stroke.elementId) {
      const phaseStrokes = prev.filter((item) => item.phaseId === nextPhaseId);
      const sameElement = phaseStrokes.some(
        (item) => item.elementId === stroke.elementId,
      );
      const ballId = primaryBall?.id ?? null;
      const hasCarry = phaseStrokes.some((item) => item.kind === "carry");
      const hasBallMove =
        ballId &&
        phaseStrokes.some(
          (item) => item.kind === "move" && item.elementId === ballId,
        );
      const isBallMove = ballId && stroke.kind === "move" && stroke.elementId === ballId;
      if (sameElement) {
        showToast("error", "Impossible: 2 actions sur le même joueur.");
        return;
      }
      if ((stroke.kind === "carry" && (hasCarry || hasBallMove)) || (isBallMove && hasCarry)) {
        showToast("error", "Impossible: 2 actions sur le ballon en action groupée.");
        return;
      }
    }
    const next = [
      ...prev,
      { ...stroke, order: prev.length + 1, phaseId: nextPhaseId },
    ];
    strokesRef.current = next;
    setStrokes(next);
    if (groupMode) {
      setGroupMode(false);
    }
  };

  const attachBallToPlayer = (playerId: string, ballId?: string | null) => {
    const ball = ballElements.find((el) => el.id === ballId) ?? ballElements[0];
    const player = playerElements.find((el) => el.id === playerId);
    if (!ball || !player) {
      showToast("error", "Ajoute un ballon et un joueur.");
      return;
    }
    setBallAttachedToId(playerId);
    updateElement(ball.id, {
      x: clamp01(player.x + 0.015),
      y: clamp01(player.y + 0.01),
    });
  };

  const detachBall = () => {
    setBallAttachedToId(null);
  };

  useEffect(() => {
    const resize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setCanvasSize({ w: rect.width, h: rect.height });
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.w * dpr;
    canvas.height = canvasSize.h * dpr;
    ctx.scale(dpr, dpr);
    const pitchRect = getPitchRect(canvasSize.w, canvasSize.h);
    setPitchRect(pitchRect);
    drawPitch(ctx, canvasSize.w, canvasSize.h, pitchPreset);
    drawElements(
      ctx,
      player.animatedElements,
      selectedId,
      pitchRect,
      paths,
      strokes,
      ballAttachedToId,
      snapTargetId,
      { showOverlays: !previewMode, showLabels: !previewMode },
    );
  }, [
    canvasSize,
    elements,
    selectedId,
    player.animatedElements,
    pitchPreset,
    setPitchRect,
    paths,
    strokes,
    ballAttachedToId,
    snapTargetId,
    previewMode,
  ]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        deleteSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deleteSelected]);

  const handleAddFrame = () => {
    const snapshot = elements.map((el) => ({ id: el.id, x: el.x, y: el.y }));
    const newFrame: FrameSnapshot = { id: buildId(), elementsSnapshot: snapshot };
    setFrames((prev) => [...prev, newFrame]);
    setActiveFrameId(newFrame.id);
  };

  const handleDuplicateFrame = () => {
    if (!activeFrameId) return;
    const index = frames.findIndex((frame) => frame.id === activeFrameId);
    if (index === -1) return;
    const source = frames[index];
    const clone: FrameSnapshot = {
      id: buildId(),
      elementsSnapshot: source.elementsSnapshot.map((snap) => ({
        id: snap.id,
        x: snap.x,
        y: snap.y,
      })),
    };
    setFrames((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, clone);
      return next;
    });
    setActiveFrameId(clone.id);
  };

  const handleReplaceFrame = () => {
    if (!activeFrameId) return;
    const snapshot = elements.map((el) => ({ id: el.id, x: el.x, y: el.y }));
    setFrames((prev) =>
      prev.map((frame) =>
        frame.id === activeFrameId
          ? { ...frame, elementsSnapshot: snapshot }
          : frame,
      ),
    );
  };

  const clearPathForSelected = () => {
    if (!selectedId) return;
    const hasStroke = strokes.some((stroke) => stroke.elementId === selectedId);
    if (hasStroke) {
      setStrokes((prev) => {
        const next = prev.filter((stroke) => stroke.elementId !== selectedId);
        strokesRef.current = next;
        return next;
      });
    }
    setPaths((prev) => {
      const next = { ...prev };
      delete next[selectedId];
      return next;
    });
    showToast("success", "Tracé supprimé.");
  };

  const smoothPath = (points: PathPoint[], iterations = 3) => {
    if (points.length < 3) return points;
    let current = points;
    for (let iter = 0; iter < iterations; iter += 1) {
      const next: PathPoint[] = [];
      next.push(current[0]);
      for (let i = 0; i < current.length - 1; i += 1) {
        const p0 = current[i];
        const p1 = current[i + 1];
        // Chaikin-like smoothing, keep time interpolation aligned.
        const q: PathPoint = {
          x: p0.x * 0.75 + p1.x * 0.25,
          y: p0.y * 0.75 + p1.y * 0.25,
          t: p0.t * 0.75 + p1.t * 0.25,
        };
        const r: PathPoint = {
          x: p0.x * 0.25 + p1.x * 0.75,
          y: p0.y * 0.25 + p1.y * 0.75,
          t: p0.t * 0.25 + p1.t * 0.75,
        };
        next.push(q, r);
      }
      next.push(current[current.length - 1]);
      current = next;
    }
    return current;
  };

  const simplifyPath = (points: PathPoint[], maxPoints = 35) => {
    if (points.length <= maxPoints) {
      return smoothPath(points, 3);
    }
    const step = Math.ceil(points.length / maxPoints);
    const sampled = points.filter((_, index) => index % step === 0);
    if (sampled[sampled.length - 1]?.t !== points[points.length - 1]?.t) {
      sampled.push(points[points.length - 1]);
    }
    return smoothPath(sampled, 3);
  };

  const smoothStrokePoints = (
    points: Array<{ x: number; y: number }>,
    iterations = 3,
  ) => {
    if (points.length < 3) return points;
    let current = points;
    for (let iter = 0; iter < iterations; iter += 1) {
      const next: Array<{ x: number; y: number }> = [];
      next.push(current[0]);
      for (let i = 0; i < current.length - 1; i += 1) {
        const p0 = current[i];
        const p1 = current[i + 1];
        const q = {
          x: p0.x * 0.75 + p1.x * 0.25,
          y: p0.y * 0.75 + p1.y * 0.25,
        };
        const r = {
          x: p0.x * 0.25 + p1.x * 0.75,
          y: p0.y * 0.25 + p1.y * 0.75,
        };
        next.push(q, r);
      }
      next.push(current[current.length - 1]);
      current = next;
    }
    return current;
  };

  const rdpSimplify = (
    points: Array<{ x: number; y: number }>,
    epsilon: number,
  ): Array<{ x: number; y: number }> => {
    if (points.length < 3) return points;
    const start = points[0];
    const end = points[points.length - 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy || 1e-6;

    let maxDist = 0;
    let index = 0;
    for (let i = 1; i < points.length - 1; i += 1) {
      const p = points[i];
      const t = ((p.x - start.x) * dx + (p.y - start.y) * dy) / lenSq;
      const projX = start.x + t * dx;
      const projY = start.y + t * dy;
      const dist = Math.hypot(p.x - projX, p.y - projY);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }

    if (maxDist <= epsilon) {
      return [start, end];
    }
    const left = rdpSimplify(points.slice(0, index + 1), epsilon);
    const right = rdpSimplify(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  };

  const simplifyStrokePoints = (
    points: Array<{ x: number; y: number }>,
    maxPoints = 24,
  ) => {
    const reduced =
      points.length <= maxPoints ? points : rdpSimplify(points, 0.01);
    const step = Math.ceil(reduced.length / maxPoints);
    const sampled =
      reduced.length <= maxPoints
        ? reduced
        : reduced.filter((_, index) => index % step === 0);
    if (
      sampled.length &&
      (sampled[sampled.length - 1].x !== points[points.length - 1].x ||
        sampled[sampled.length - 1].y !== points[points.length - 1].y)
    ) {
      sampled.push(points[points.length - 1]);
    }
    return smoothStrokePoints(sampled, 2);
  };

  const applyStrokeSmoothing = (predicate?: (stroke: Stroke) => boolean) => {
    let changed = 0;
    let beforeTotal = 0;
    let afterTotal = 0;
    setStrokes((prev) => {
      const next = prev.map((stroke) => {
        if (predicate && !predicate(stroke)) return stroke;
        if (stroke.points.length < 3) return stroke;
        beforeTotal += stroke.points.length;
        const nextPoints = simplifyStrokePoints(stroke.points, 12);
        afterTotal += nextPoints.length;
        changed += 1;
        return { ...stroke, points: nextPoints };
      });
      strokesRef.current = next;
      return next;
    });
    if (changed > 0) {
      showToast(
        "success",
        `Tracé lissé (${changed}) ${beforeTotal}→${afterTotal}`,
      );
    } else {
      showToast("error", "Aucun tracé à lisser.");
    }
  };

  const simplifyPathForSelected = () => {
    if (!selectedId) return;
    const hasStroke = strokes.some((stroke) => stroke.elementId === selectedId);
    if (hasStroke) {
      applyStrokeSmoothing((stroke) => stroke.elementId === selectedId);
      return;
    }
    if (strokes.length > 0) {
      applyStrokeSmoothing();
      return;
    }
    const points = paths[selectedId];
    if (!points || points.length < 3) return;
    setPaths((prev) => ({
      ...prev,
      [selectedId]: simplifyPath(points, 35),
    }));
    showToast("success", "Tracé lissé.");
  };

  const exportExercise = () => {
    return {
      title: name.trim() || "Exercice animé",
      category: "echauffement",
      duration: 15,
      type: "animated",
      animation_data: {
        pitchPreset,
        elements,
        keyframes: frames,
        paths,
        strokes,
        ballAttachedToId,
        strokesBase,
      },
    };
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      if (userError || !userData?.user) {
        throw new Error("Utilisateur non connecté.");
      }
      const payload = exportExercise();
      const { error } = await supabase.from("training_exercises").insert({
        title: payload.title,
        category: payload.category,
        duration: payload.duration,
        type: payload.type,
        animation_data: payload.animation_data,
        created_by: userData.user.id,
      });
      if (error) {
        throw new Error(error.message);
      }
      showToast("success", "Exercice enregistré.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Impossible d'enregistrer.";
      showToast("error", message);
    } finally {
      setSaving(false);
    }
  };

  const resetEditor = () => {
    player.setIsPlaying(false);
    setElements([]);
    setFrames([]);
    setSelectedId(null);
    setTool("select");
    setActiveFrameId(null);
    setPaths({});
    setRecordPathMode(false);
    setCurrentRecordingElementId(null);
    pathRecordRef.current = null;
    setRecordMode(false);
    setStrokes([]);
    strokesRef.current = [];
    setStrokesBase(null);
    strokesBaseRef.current = null;
    setGroupMode(false);
    setBallAttachedToId(null);
    sequenceDragRef.current = null;
    setSnapTargetId(null);
    clearDrag();
    showToast("success", "Éditeur réinitialisé.");
  };

  return (
    <div className="h-screen w-full bg-[#070a14] text-slate-100">
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
      {showResetConfirm ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0c1020] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.7)]">
            <h3 className="text-lg font-semibold text-white">
              Réinitialiser l’exercice ?
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Tout le terrain, les éléments et les images clés seront supprimés.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  setShowResetConfirm(false);
                  resetEditor();
                }}
                className="rounded-full bg-rose-500/90 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-500"
              >
                Réinitialiser
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {!previewMode ? (
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-black/40 px-6 py-4 backdrop-blur-xl">
        <button
          onClick={() => router.back()}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10"
        >
          Retour
        </button>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-[260px] rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          placeholder="Nom de l'exercice"
        />
        <button
          onClick={player.toggle}
          disabled={!hasPlayableContent}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
        >
          {player.isPlaying ? "Pause" : "Lecture"}
        </button>
        <button
          onClick={() => {
            player.reset();
            player.setIsPlaying(true);
            setPreviewMode(true);
          }}
          disabled={!hasPlayableContent}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
        >
          Prévisualiser
        </button>
        <button
          onClick={() =>
            setRecordMode((prev) => {
              if (prev) {
                sequenceDragRef.current = null;
                setGroupMode(false);
                return false;
              }
              if (!strokesBaseRef.current) {
                const snapshot: BaseSnapshot = {};
                elements.forEach((el) => {
                  snapshot[el.id] = { x: el.x, y: el.y };
                });
                setStrokesBase(snapshot);
                strokesBaseRef.current = snapshot;
              }
              return true;
            })
          }
          className={[
            "rounded-full border px-4 py-2 text-xs font-semibold transition",
            recordMode
              ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-100"
              : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
          ].join(" ")}
        >
          <span className="inline-flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                recordMode ? "bg-indigo-300" : "bg-white/40"
              }`}
            />
            REC
          </span>
        </button>
        {recordMode ? (
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">
            REC actif
          </span>
        ) : null}
        {recordMode ? (
          <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
            traits {strokes.length} ·{" "}
            {strokes.length
              ? `dernier ${strokes[strokes.length - 1]?.kind ?? "—"}`
              : "aucun"}
          </span>
        ) : null}
        <button
          onClick={() => setGroupMode((prev) => !prev)}
          title="Les actions suivantes seront jouées en même temps que la précédente"
          className={[
            "rounded-full border px-4 py-2 text-xs font-semibold transition",
            groupMode
              ? "border-violet-300/40 bg-violet-500/20 text-violet-100"
              : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
          ].join(" ")}
        >
          Action groupée
        </button>
        <button
          onClick={() => setShowResetConfirm(true)}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
        >
          Réinitialiser
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Enregistrement..." : "Enregistrer l'exercice"}
        </button>
      </div>
      ) : null}

      <div className="flex h-[calc(100vh-72px)]">
        {!previewMode ? (
          <aside className="w-[88px] border-r border-white/5 bg-black/40 p-3 backdrop-blur-xl">
          <div className="space-y-2">
            {TOOL_OPTIONS.map((option) => (
              <button
                key={option.key}
                onClick={() => setTool(option.key)}
                draggable={!previewMode}
                onDragStart={(event) => {
                  event.dataTransfer.setData(
                    "application/x-infinity-tool",
                    option.key,
                  );
                  event.dataTransfer.effectAllowed = "copy";
                }}
                className={`flex w-full flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-[10px] uppercase tracking-[0.18em] transition ${
                  tool === option.key
                    ? "border-violet-400/40 bg-violet-500/15 text-white"
                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                <span className="text-base">
                  {option.key === "select"
                    ? "⤧"
                    : option.key === "player"
                    ? "●"
                    : option.key === "ball"
                    ? "⚽"
                    : option.key === "cone"
                    ? "▲"
                    : "●"}
                </span>
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-6">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">
              Couleurs
            </p>
            <div className="mt-3 flex flex-col items-center gap-2">
              {DEFAULT_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setPlayerColor(color)}
                  className={`h-8 w-8 rounded-full border transition ${
                    playerColor === color
                      ? "border-white/80"
                      : "border-white/10"
                  }`}
                  style={{ background: color }}
                />
              ))}
            </div>
          </div>
        </aside>
        ) : null}

        <main className="flex-1">
          <div
            ref={containerRef}
            className="h-full w-full"
            onDragOver={(event) => {
              if (previewMode) return;
              event.preventDefault();
            }}
            onDrop={(event) => {
              if (previewMode) return;
              event.preventDefault();
              const toolKey = event.dataTransfer.getData(
                "application/x-infinity-tool",
              ) as ToolKey | "";
              if (!toolKey || toolKey === "select") return;
              const rect = event.currentTarget.getBoundingClientRect();
              const point = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              };
              const pitchRect = getPitchRect(canvasSize.w, canvasSize.h);
              if (
                point.x < pitchRect.x ||
                point.x > pitchRect.x + pitchRect.w ||
                point.y < pitchRect.y ||
                point.y > pitchRect.y + pitchRect.h
              ) {
                return;
              }
              const normalized = {
                x: clamp01((point.x - pitchRect.x) / pitchRect.w),
                y: clamp01((point.y - pitchRect.y) / pitchRect.h),
              };
              addElement(toolKey as ElementType, normalized);
            }}
          >
            <canvas
              ref={canvasRef}
              className="h-full w-full"
              onPointerDown={previewMode ? undefined : handlePointerDown}
              onPointerMove={previewMode ? undefined : handlePointerMove}
              onPointerUp={previewMode ? undefined : handlePointerUp}
            />
          </div>
        </main>

        {!previewMode ? (
          <aside className="w-[320px] border-l border-white/5 bg-black/40 p-4 backdrop-blur-xl">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Propriétés
            </h3>
            {selectedElement ? (
              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Type
                  </p>
                  <p className="mt-1 text-sm text-slate-100">
                    {selectedElement.type}
                  </p>
                </div>

                {selectedElement.type !== "ball" ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Couleur
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {DEFAULT_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() =>
                            updateElement(selectedElement.id, { color })
                          }
                          className={`h-7 w-7 rounded-full border transition ${
                            selectedElement.color === color
                              ? "border-white/80"
                              : "border-white/10"
                          }`}
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {selectedElement.type === "player" ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Numéro
                    </p>
                    <input
                      value={selectedElement.label ?? ""}
                      onChange={(event) =>
                        updateElement(selectedElement.id, {
                          label: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100"
                      placeholder="10"
                    />
                  </div>
                ) : null}

                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Taille
                  </p>
                  <input
                    type="range"
                    min={10}
                    max={40}
                    value={Math.round(
                      (selectedElement.size ?? getDefaultSize(selectedElement.type)) *
                        600,
                    )}
                    onChange={(event) =>
                      updateElement(selectedElement.id, {
                        size: Number(event.target.value) / 600,
                      })
                    }
                    className="mt-2 w-full"
                  />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Ballon
                  </p>
                  {selectedElement.type === "player" ? (
                    <div className="mt-2 space-y-2">
                      {ballElements.length === 0 ? (
                        <p className="text-xs text-slate-400">
                          Ajoute un ballon pour associer.
                        </p>
                      ) : (
                        <>
                          {ballElements.length > 1 ? (
                            <select
                              value={associationTargetBallId ?? ""}
                              onChange={(event) =>
                                setAssociationTargetBallId(event.target.value)
                              }
                              className="w-full rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100"
                            >
                              {ballElements.map((ball, index) => (
                                <option key={ball.id} value={ball.id}>
                                  Ballon {index + 1}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() =>
                                attachBallToPlayer(
                                  selectedElement.id,
                                  associationTargetBallId,
                                )
                              }
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
                            >
                              ⚽ Associer ballon
                            </button>
                            {ballAttachedToId === selectedElement.id ? (
                              <button
                                onClick={detachBall}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
                              >
                                Détacher
                              </button>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  ) : selectedElement.type === "ball" ? (
                    <div className="mt-2 space-y-2">
                      {playerElements.length === 0 ? (
                        <p className="text-xs text-slate-400">
                          Ajoute un joueur pour associer.
                        </p>
                      ) : (
                        <>
                          <select
                            value={associationTargetPlayerId ?? ""}
                            onChange={(event) =>
                              setAssociationTargetPlayerId(event.target.value)
                            }
                            className="w-full rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100"
                          >
                            {playerElements.map((player) => (
                              <option key={player.id} value={player.id}>
                                {player.label ? `J${player.label}` : player.id}
                              </option>
                            ))}
                          </select>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => {
                                if (associationTargetPlayerId) {
                                  attachBallToPlayer(
                                    associationTargetPlayerId,
                                    selectedElement.id,
                                  );
                                }
                              }}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
                            >
                              ⚽ Associer ballon
                            </button>
                            {ballAttachedToId ? (
                              <button
                                onClick={detachBall}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
                              >
                                Détacher
                              </button>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-400">
                      Sélectionne un joueur ou le ballon pour associer.
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Tracé
                  </p>
                  {selectedId ? (
                    <p className="mt-1 text-[10px] text-slate-500">
                      {strokes.filter((stroke) => stroke.elementId === selectedId)
                        .length}{" "}
                      traits ·{" "}
                      {paths[selectedId]?.length
                        ? `${paths[selectedId].length} pts`
                        : "0 pt"}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={clearPathForSelected}
                      disabled={
                        !(
                          paths[selectedElement.id]?.length ||
                          strokes.some(
                            (stroke) => stroke.elementId === selectedElement.id,
                          )
                        )
                      }
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
                    >
                      Effacer tracé
                    </button>
                    <button
                      onClick={simplifyPathForSelected}
                      disabled={
                        !(
                          paths[selectedElement.id]?.length ||
                          strokes.some(
                            (stroke) => stroke.elementId === selectedElement.id,
                          )
                        )
                      }
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
                    >
                      Lisser / Simplifier
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedId(null)}
                  className="w-full rounded-full border border-white/10 bg-transparent py-2 text-xs text-slate-300 transition hover:bg-white/5"
                >
                  Désélectionner
                </button>
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-400">
                Sélectionne un élément sur le terrain.
              </p>
            )}
          </div>

          <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Images clés
              </h3>
              <button
                onClick={handleAddFrame}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-200"
              >
                Ajouter une image clé
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {frames.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Ajoute une image clé pour commencer.
                </p>
              ) : (
                frames.map((frame, index) => (
                  <button
                    key={frame.id}
                    onClick={() => setActiveFrameId(frame.id)}
                    className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-xs transition ${
                      activeFrameId === frame.id
                        ? "border-violet-400/40 bg-violet-500/15 text-white"
                        : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    <span>Image {index + 1}</span>
                    <span className="text-[10px] text-slate-400">
                      {frame.elementsSnapshot.length} éléments
                    </span>
                  </button>
                ))
              )}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              Astuce : place les joueurs, ajoute une image clé, déplace-les,
              ajoute la suivante, puis lance la lecture.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={handleDuplicateFrame}
                disabled={!activeFrameId}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
              >
                Dupliquer l'image clé
              </button>
              <button
                onClick={handleReplaceFrame}
                disabled={!activeFrameId}
                className="rounded-full bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
              >
                Remplacer l'image clé
              </button>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Durée:</span>
                <input
                  type="number"
                  min={500}
                  step={500}
                  value={player.frameDuration}
                  onChange={(event) =>
                    player.setFrameDuration(Number(event.target.value))
                  }
                  className="w-20 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-100"
                />
                <span>ms</span>
              </div>
            </div>
          </div>

          {showSequenceDebug ? (
            <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Séquence (debug)
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSequenceDebug(false)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-200"
                  >
                    Masquer
                  </button>
                <button
                  onClick={() => {
                    setStrokes([]);
                    strokesRef.current = [];
                    setStrokesBase(null);
                    strokesBaseRef.current = null;
                    setGroupMode(false);
                    setBallAttachedToId(null);
                  }}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-200"
                  >
                    Effacer
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-2 text-xs text-slate-300">
                {strokes.length === 0 ? (
                  <p className="text-slate-400">Aucune action enregistrée.</p>
                ) : (
                  strokes.map((stroke, index) => {
                    const getLabel = (id: string) => {
                      const el = elements.find((item) => item.id === id);
                      if (!el) return id.slice(0, 4);
                      if (el.type === "ball") return "Ballon";
                      return el.label ? `J${el.label}` : id.slice(0, 4);
                    };
                    if (stroke.kind === "carry") {
                      return (
                        <div key={stroke.id}>
                          {index + 1}. Dribble {getLabel(stroke.elementId ?? "")}
                        </div>
                      );
                    }
                    if (stroke.kind === "move") {
                      return (
                        <div key={stroke.id}>
                          {index + 1}. Déplacement {getLabel(stroke.elementId ?? "")}
                        </div>
                      );
                    }
                    return (
                      <div key={stroke.id}>
                        {index + 1}. Attente
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowSequenceDebug(true)}
              className="mt-4 w-full rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-slate-200"
            >
              Debug séquence
            </button>
          )}
        </aside>
        ) : null}
      </div>
      {previewMode ? (
        <div className="fixed inset-0 z-30">
          <div className="absolute inset-0" />
          <button
            onClick={() => {
              player.setIsPlaying(false);
              player.reset();
              setPreviewMode(false);
            }}
            className="absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/60 text-sm text-white/80 backdrop-blur-xl transition hover:bg-white/10"
            aria-label="Fermer la prévisualisation"
          >
            ✕
          </button>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/50 px-4 py-2 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button
              onClick={player.toggle}
              className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              {player.isPlaying ? "Pause" : "Lecture"}
            </button>
            <button
              onClick={() => {
                player.reset();
                player.setIsPlaying(true);
              }}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
            >
              Recommencer
            </button>
            <button
              onClick={() => {
                player.setIsPlaying(false);
                player.reset();
                setPreviewMode(false);
              }}
              className="rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
            >
              Quitter
            </button>
          </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
