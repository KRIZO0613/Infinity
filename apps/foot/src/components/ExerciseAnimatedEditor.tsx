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

type PitchPreset = "standard";

type PitchRect = { x: number; y: number; w: number; h: number };

type KeyframePlayer = {
  isPlaying: boolean;
  playhead: number;
  toggle: () => void;
  setIsPlaying: (value: boolean) => void;
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
) => {
  elements.forEach((element) => {
    const px = pitchRect.x + element.x * pitchRect.w;
    const py = pitchRect.y + element.y * pitchRect.h;
    const size = element.size ?? getDefaultSize(element.type);
    const radius = size * pitchRect.w;

    ctx.save();
    if (element.id === selectedId) {
      ctx.shadowColor = "rgba(168, 85, 247, 0.6)";
      ctx.shadowBlur = radius * 0.8;
    }

    if (element.type === "player") {
      ctx.fillStyle = element.color ?? "#7B66FF";
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();

      if (element.label) {
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

    if (element.id === selectedId) {
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
    const size = element.size ?? getDefaultSize(element.type);
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

const useCanvasElements = (initial: CanvasElement[] = []) => {
  const [elements, setElements] = useState<CanvasElement[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolKey>("select");
  const [playerColor, setPlayerColor] = useState(DEFAULT_COLORS[0]);
  const draggingRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
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
      draggingRef.current = {
        id: hitId,
        offsetX: point.x - px,
        offsetY: point.y - py,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
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
    const pitchRect = pitchRef.current;
    const nextX = clamp01((point.x - draggingRef.current.offsetX - pitchRect.x) / pitchRect.w);
    const nextY = clamp01((point.y - draggingRef.current.offsetY - pitchRect.y) / pitchRect.h);
    updateElement(draggingRef.current.id, { x: nextX, y: nextY });
  };

  const handlePointerUp = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (draggingRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
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
): KeyframePlayer => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [frameDuration, setFrameDuration] = useState(2000);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying || frames.length < 2) return;
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
  }, [isPlaying, frames.length]);

  const animatedElements = useMemo(() => {
    if (!isPlaying || frames.length < 2) return elements;
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

    return elements.map((element) => {
      const current = currentMap.get(element.id) ?? { x: element.x, y: element.y };
      const next = nextMap.get(element.id) ?? current;
      return {
        ...element,
        x: current.x + (next.x - current.x) * t,
        y: current.y + (next.y - current.y) * t,
      };
    });
  }, [elements, frames, frameDuration, isPlaying, playhead]);

  const toggle = () => setIsPlaying((prev) => !prev);

  return {
    isPlaying,
    playhead,
    toggle,
    setIsPlaying,
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
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    setPitchRect,
    clearDrag,
  } = useCanvasElements();

  const player = useKeyframesPlayer(elements, frames);

  const selectedElement = useMemo(
    () => elements.find((el) => el.id === selectedId) ?? null,
    [elements, selectedId],
  );

  const showToast = (kind: "success" | "error", message: string) => {
    setToast({ kind, message });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3200);
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
    drawElements(ctx, player.animatedElements, selectedId, pitchRect);
  }, [canvasSize, elements, selectedId, player.animatedElements, pitchPreset, setPitchRect]);

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
          className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
        >
          {player.isPlaying ? "Pause" : "Lecture"}
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

      <div className="flex h-[calc(100vh-72px)]">
        <aside className="w-[88px] border-r border-white/5 bg-black/40 p-3 backdrop-blur-xl">
          <div className="space-y-2">
            {TOOL_OPTIONS.map((option) => (
              <button
                key={option.key}
                onClick={() => setTool(option.key)}
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

        <main className="flex-1">
          <div ref={containerRef} className="h-full w-full">
            <canvas
              ref={canvasRef}
              className="h-full w-full"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          </div>
        </main>

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
        </aside>
      </div>
    </div>
  );
}
