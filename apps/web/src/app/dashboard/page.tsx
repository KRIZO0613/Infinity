"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Reorder, motion } from "framer-motion";

type WidgetType = "event" | "task" | "note" | "project";
type ResizeDirection = "se";

type Widget = {
  id: string;
  title: string;
  type: WidgetType;
  color: "indigo" | "cyan" | "rose";
  time?: string;
  date?: string;
  description?: string;
  x?: number;
  y?: number;
  scale?: number; // taille de la carte en mode Galerie
};

const INITIAL_WIDGETS: Widget[] = [
  {
    id: "1",
    title: "Appel client important",
    type: "event",
    color: "indigo",
    time: "09:30",
    date: "Aujourd’hui",
    description: "Préparer l’offre Infinity + démo rapide.",
    x: 80,
    y: 80,
    scale: 1,
  },
  {
    id: "2",
    title: "Session dev Boardk",
    type: "task",
    color: "cyan",
    time: "14:00",
    date: "Aujourd’hui",
    description: "UI Dashboard + intégration calendrier.",
    x: 420,
    y: 80,
    scale: 1,
  },
  {
    id: "3",
    title: "Idée univers Moko",
    type: "note",
    color: "rose",
    description: "Nouvelle scène d’intro + gimmick antenne.",
    x: 80,
    y: 340,
    scale: 1,
  },
  {
    id: "4",
    title: "Entraînement U12",
    type: "event",
    color: "indigo",
    time: "18:00",
    date: "Demain",
    description: "Focus passes + pressing coordonné.",
    x: 420,
    y: 340,
    scale: 1,
  },
];

const STORAGE_KEY = "infinity_dashboard_widgets_v1";

type ViewMode = "grid" | "list" | "float3d";

/* ------------------------------------------------------------------ */
/* Utils                                                              */
/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/* ------------------------------------------------------------------ */
/* PAGE DASHBOARD                                                     */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [widgets, setWidgets] = useState<Widget[]>(INITIAL_WIDGETS);
  const [boardHeight, setBoardHeight] = useState<number>(800);
  const [hasLoaded, setHasLoaded] = useState(false);

  const freeMoveContainerRef = useRef<HTMLDivElement | null>(null);

  // Chargement depuis localStorage (une seule fois après mount)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setHasLoaded(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed) && parsed.length > 0) {
        const normalized = parsed.map((w: any, index: number) => ({
          ...w,
          scale: typeof w.scale === "number" ? w.scale : 1,
          x: typeof w.x === "number" ? w.x : INITIAL_WIDGETS[index]?.x ?? 80,
          y: typeof w.y === "number" ? w.y : INITIAL_WIDGETS[index]?.y ?? 80,
        })) as Widget[];

        setWidgets(normalized);
      }
    } catch (err) {
      console.error("Erreur de lecture widgets depuis localStorage", err);
    } finally {
      setHasLoaded(true);
    }
  }, []);

  // Sauvegarde dans localStorage après chargement initial
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasLoaded) return;

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets, hasLoaded]);

  return (
    <div className="min-h-[calc(100vh-4rem)] px-6 pb-28 pt-0 -mt-18 sm:-mt-20 text-fg transition-colors" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">
            Tableau
          </p>
          <h1 className="text-2xl font-semibold text-fg sm:text-3xl">
            Dashboard Infinity
          </h1>
          <p className="mt-1 max-w-xl text-xs text-muted sm:text-sm">
            Organise tes rendez-vous, tâches et idées épinglées comme tu veux.
          </p>
        </div>

        {/* Switch vues */}
        <div className="inline-flex items-center gap-1 rounded-full border border-[color:var(--muted-2)] bg-[color:var(--surface)]/80 px-1 py-1 text-xs backdrop-blur shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
          <ViewModeButton
            label="Galerie"
            active={viewMode === "grid"}
            onClick={() => setViewMode("grid")}
          />
          <ViewModeButton
            label="Liste"
            active={viewMode === "list"}
            onClick={() => setViewMode("list")}
          />
          <ViewModeButton
            label="3D"
            active={viewMode === "float3d"}
            onClick={() => setViewMode("float3d")}
          />
        </div>
      </div>

      {/* MODE 3D */}
      {viewMode === "float3d" && (
        <div className="mt-4 w-full">
          <Coverflow3D items={widgets} />
        </div>
      )}

      {/* MODE GALERIE = whiteboard libre */}
      {viewMode === "grid" && (
        <div className="mx-auto mt-4 w-full max-w-6xl">
          <div
            ref={freeMoveContainerRef}
            className="relative w-full overflow-hidden rounded-xl border border-[color:var(--muted-2)] bg-[color:var(--surface)]/90 shadow-[0_25px_60px_rgba(0,0,0,0.35)]"
            style={{ height: boardHeight }}
          >
            {widgets.map((w) => (
              <FreeWidget
                key={w.id}
                widget={w}
                containerRef={freeMoveContainerRef}
                setWidgets={setWidgets}
              />
            ))}
          </div>

          {/* Hauteur de la zone */}
          <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted">
            <button
              type="button"
              onClick={() => setBoardHeight((h) => Math.min(2400, h + 200))}
              className="rounded-full border border-[color:var(--muted-2)] bg-[color:var(--surface)]/70 px-3 py-1 text-sm text-fg hover:bg-[color:var(--surface)]/90"
            >
              ⤵︎ Agrandir la zone
            </button>
          </div>
        </div>
      )}

      {/* MODE LISTE */}
      {viewMode === "list" && (
        <div className="mx-auto mt-4 w-full max-w-6xl">
          <Reorder.Group
            axis="y"
            values={widgets}
            onReorder={setWidgets}
            className="flex flex-col gap-3"
          >
            {widgets.map((w) => (
              <Reorder.Item
                key={w.id}
                value={w}
                whileDrag={{ scale: 1.03, zIndex: 20 }}
                className="cursor-grab active:cursor-grabbing"
              >
                <WidgetCard widget={w} variant="list" />
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Widget libre (mode Galerie / whiteboard)                           */
/* ------------------------------------------------------------------ */

type FreeWidgetProps = {
  widget: Widget;
  containerRef: React.RefObject<HTMLDivElement | null>;
  setWidgets: React.Dispatch<React.SetStateAction<Widget[]>>;
};

const CARD_BASE_WIDTH = 340;
const CARD_BASE_HEIGHT = 200;

function FreeWidget({ widget, containerRef, setWidgets }: FreeWidgetProps) {
  const [isResizing, setIsResizing] = useState(false);

  const scale = widget.scale ?? 1;

  const currentX = widget.x ?? 80;
  const currentY = widget.y ?? 80;

  /* -------------------- DRAG (déplacement) -------------------- */

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (isResizing) return;

    e.preventDefault();
    e.stopPropagation();

    const container = containerRef.current;
    if (!container) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;

    const startX = e.clientX;
    const startY = e.clientY;

    const startXPos = currentX;
    const startYPos = currentY;

    const margin = 8;
    const cardW = CARD_BASE_WIDTH * scale;
    const cardH = CARD_BASE_HEIGHT * scale;

    const handleMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      let nextX = startXPos + dx;
      let nextY = startYPos + dy;

      const maxX = cw - cardW - margin;
      const maxY = ch - cardH - margin;

      nextX = clamp(nextX, margin, Math.max(margin, maxX));
      nextY = clamp(nextY, margin, Math.max(margin, maxY));

      setWidgets((prev) =>
        prev.map((item) =>
          item.id === widget.id ? { ...item, x: nextX, y: nextY } : item,
        ),
      );
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  /* -------------------- RESIZE (flèche ↘) -------------------- */

  const startResize =
    (_direction: ResizeDirection) =>
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();

      const container = containerRef.current;
      if (!container) return;

      const cw = container.clientWidth;
      const ch = container.clientHeight;

      const startX = e.clientX;
      const baseScale = scale;

      const margin = 8;

      const baseW = CARD_BASE_WIDTH;
      const baseH = CARD_BASE_HEIGHT;

      const cardX = widget.x ?? 80;
      const cardY = widget.y ?? 80;

      const maxScaleX = (cw - margin - cardX) / baseW;
      const maxScaleY = (ch - margin - cardY) / baseH;
      const hardMaxScale = Math.max(0.6, Math.min(1.6, maxScaleX, maxScaleY));
      const minScale = 0.6;

      setIsResizing(true);

      const handleMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const deltaScale = dx / 260;
        const nextScale = clamp(baseScale + deltaScale, minScale, hardMaxScale);

        setWidgets((prev) =>
          prev.map((item) =>
            item.id === widget.id ? { ...item, scale: nextScale } : item,
          ),
        );
      };

      const handleUp = () => {
        setIsResizing(false);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    };

  /* -------------------- RENDER -------------------- */

  return (
    <div
      suppressHydrationWarning
      className="group absolute cursor-grab active:cursor-grabbing"
      style={{
        left: currentX,
        top: currentY,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
      }}
      onPointerDown={startDrag}
    >
      <div className="relative inline-block">
        <WidgetCard widget={widget} variant="grid" />

        {/* Poignée de resize (coin bas droit) */}
        <div
          onPointerDown={startResize("se")}
          className="pointer-events-auto absolute -right-1 -bottom-1 flex h-4 w-4 cursor-nwse-resize items-center justify-center rounded-full border border-white/80 bg-black/80 text-[9px] text-white shadow-[0_0_8px_rgba(255,255,255,0.8)] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        >
          ↘
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Coverflow 3D façon affiche géante au centre                        */
/* ------------------------------------------------------------------ */

function Coverflow3D({ items }: { items: Widget[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastWheelTime = useRef(0);
  const touchStartX = useRef<number | null>(null);

  function goLeft() {
    setActiveIndex((i) => (i > 0 ? i - 1 : 0));
  }

  function goRight() {
    setActiveIndex((i) =>
      i < items.length - 1 ? i + 1 : items.length - 1,
    );
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const now = Date.now();
    if (now - lastWheelTime.current < 350) return;
    lastWheelTime.current = now;

    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;

    if (delta > 0) goRight();
    else if (delta < 0) goLeft();
  }

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) < 40) return;

    if (dx < 0) goRight();
    else goLeft();

    touchStartX.current = null;
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
  }, [activeIndex]);

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative flex h-[360px] w-full items-center justify-center overflow-visible touch-pan-x [touch-action:pan-x]"
      >
        {items.map((item, index) => {
          const offset = index - activeIndex;
          const isActive = offset === 0;

          const clamped = Math.max(-3, Math.min(3, offset));

          const baseTranslateX = 260;
          const x = clamped * baseTranslateX;

          const y = Math.abs(clamped) * 28;

          const rotateY = clamped * -18;

          const opacity = isActive ? 1 : 0.45;

          const scaleX = isActive ? 2.2 : 0.9;
          const scaleY = isActive ? 3.0 : 0.9;

          const zIndex = isActive ? 50 : 40 - Math.abs(clamped) * 2;

          return (
            <motion.div
              key={item.id}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ cursor: "pointer", zIndex }}
              onClick={() => setActiveIndex(index)}
              initial={false}
              animate={{
                x,
                y,
                rotateY,
                scaleX,
                scaleY,
                opacity,
              }}
              transition={{
                type: "tween",
                duration: isActive ? 0.22 : 0.16,
                ease: "easeOut",
              }}
            >
              <WidgetCard widget={item} variant="float3d" />
            </motion.div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-center gap-4 text-xs text-muted">
        <button
          type="button"
          onClick={goLeft}
          className="rounded-full border border-[color:var(--muted-2)] bg-[color:var(--surface)]/70 px-3 py-1 text-sm text-fg hover:bg-[color:var(--surface)]/90"
        >
          ◀
        </button>
        <span className="min-w-[52px] text-center">
          {activeIndex + 1} / {items.length}
        </span>
        <button
          type="button"
          onClick={goRight}
          className="rounded-full border border-[color:var(--muted-2)] bg-[color:var(--surface)]/70 px-3 py-1 text-sm text-fg hover:bg-[color:var(--surface)]/90"
        >
          ▶
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cartes & boutons                                                   */
/* ------------------------------------------------------------------ */

type WidgetCardProps = {
  widget: Widget;
  variant: ViewMode;
};

function WidgetCard({ widget, variant }: WidgetCardProps) {
  const baseColor =
    widget.color === "indigo"
      ? "from-indigo-500/80 to-sky-400/70"
      : widget.color === "cyan"
      ? "from-cyan-400/80 to-sky-300/80"
      : "from-pink-500/80 to-violet-400/70";

  const borderColor =
    widget.color === "indigo"
      ? "border-indigo-400/60"
      : widget.color === "cyan"
      ? "border-cyan-400/60"
      : "border-pink-400/60";

  const shadowColor =
    widget.color === "indigo"
      ? "shadow-[0_0_32px_rgba(79,70,229,0.7)]"
      : widget.color === "cyan"
      ? "shadow-[0_0_32px_rgba(34,211,238,0.7)]"
      : "shadow-[0_0_32px_rgba(244,114,182,0.7)]";

  const baseClasses =
    "relative overflow-hidden rounded-3xl border backdrop-blur";

  const padding =
    variant === "list"
      ? "px-4 py-3"
      : variant === "float3d"
      ? "px-7 py-6"
      : "px-4 py-4";

  return (
    <div
      className={`${baseClasses} ${borderColor} ${shadowColor} ${padding} transition-all`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <span
            className={`inline-flex items-center justify-center rounded-full bg-gradient-to-r ${baseColor} px-2.5 py-[3px] text-[10px] font-semibold text-white`}
          >
            {iconForType(widget.type)}
            <span className="ml-1 capitalize">{labelForType(widget.type)}</span>
          </span>
        </div>
        {(widget.time || widget.date) && (
          <div className="text-right text-[10px] text-muted">
            {widget.date && <div>{widget.date}</div>}
            {widget.time && <div className="font-medium text-fg">{widget.time}</div>}
          </div>
        )}
      </div>

      <h2 className="mt-3 text-sm font-semibold text-fg sm:text-base">
        {widget.title}
      </h2>

      {widget.description && (
        <p className="mt-2 text-[11px] leading-snug text-muted sm:text-[12px]">
          {widget.description}
        </p>
      )}
    </div>
  );
}

type ViewModeButtonProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

function ViewModeButton({ label, active, onClick }: ViewModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[11px] transition-all ${
        active
          ? "bg-gradient-to-r from-indigo-500 to-cyan-400 text-white shadow-[0_0_14px_rgba(56,189,248,0.7)]"
          : "text-muted hover:text-fg"
      }`}
    >
      {label}
    </button>
  );
}

/* Helpers */

function labelForType(type: WidgetType) {
  switch (type) {
    case "event":
      return "Événement";
    case "task":
      return "Tâche";
    case "note":
      return "Note";
    case "project":
      return "Projet";
  }
}

function iconForType(type: WidgetType) {
  switch (type) {
    case "event":
      return "📅";
    case "task":
      return "✅";
    case "note":
      return "📝";
    case "project":
      return "📊";
  }
}
