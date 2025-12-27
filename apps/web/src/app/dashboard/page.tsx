"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Reorder, motion } from "framer-motion";
import { useCalendarStore, type CalendarItem } from "@/store/calendarStore";

type ViewMode = "grid" | "list" | "float3d";

type WidgetMeta = {
  id: string; // = CalendarItem.id
  x: number;
  y: number;
  scale: number;
};

const STORAGE_KEY = "infinity_dashboard_pinned_layout_v1";

/* ------------------------------------------------------------------ */
/* Utils                                                              */
/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatDateLabel(dateStr: string) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;

  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const d = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();

  const oneDay = 24 * 60 * 60 * 1000;

  if (d === today) return "Aujourd’hui";
  if (d === today + oneDay) return "Demain";

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}

/* ------------------------------------------------------------------ */
/* PAGE DASHBOARD                                                     */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [boardHeight, setBoardHeight] = useState<number>(800);
  const [hasLoadedLayout, setHasLoadedLayout] = useState(false);
  const [openItem, setOpenItem] = useState<CalendarItem | null>(null);

  // ✅ On récupère tous les items du store (snapshot stable)
  const allItems = useCalendarStore((s) => s.items);

  // ✅ On filtre en local, mémoïsé → plus d’erreur getSnapshot
  const pinnedItems = useMemo(
    () => allItems.filter((i) => i.pinned),
    [allItems],
  );

  const [metas, setMetas] = useState<WidgetMeta[]>([]);
  const freeMoveContainerRef = useRef<HTMLDivElement | null>(null);
  // ... (le reste du fichier reste comme je te l’ai envoyé juste avant)
  /* ---------- Chargement layout depuis localStorage ---------- */

  useEffect(() => {
    if (typeof window === "undefined") return;

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setHasLoadedLayout(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const normalized: WidgetMeta[] = parsed
          .filter((m: any) => m && typeof m.id === "string")
          .map((m: any) => ({
            id: m.id,
            x: typeof m.x === "number" ? m.x : 80,
            y: typeof m.y === "number" ? m.y : 80,
            scale: typeof m.scale === "number" ? m.scale : 1,
          }));
        setMetas(normalized);
      }
    } catch (err) {
      console.error("Erreur de lecture layout dashboard", err);
    } finally {
      setHasLoadedLayout(true);
    }
  }, []);

  /* ---------- Sauvegarde layout dans localStorage ---------- */

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasLoadedLayout) return;

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(metas));
  }, [metas, hasLoadedLayout]);

  /* ---------- Sync des metas avec les éléments épinglés ---------- */

  useEffect(() => {
    // Positionne automatiquement un layout pour chaque nouvel item épinglé
    setMetas((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const next: WidgetMeta[] = [...prev];

      let indexBase = next.length;

      pinnedItems.forEach((item, idx) => {
        if (!existingIds.has(item.id)) {
          const i = indexBase + idx;
          const col = i % 2;
          const row = Math.floor(i / 2);

          next.push({
            id: item.id,
            x: 80 + col * 360,
            y: 80 + row * 260,
            scale: 1,
          });
        }
      });

      // Supprime les metas dont l'item n'est plus épinglé
      const pinnedIds = new Set(pinnedItems.map((i) => i.id));
      return next.filter((m) => pinnedIds.has(m.id));
    });
  }, [pinnedItems]);

  /* ---------- Jointure metas + items ---------- */

  const widgets = useMemo(
    () =>
      metas
        .map((meta) => {
          const item = pinnedItems.find((i) => i.id === meta.id);
          if (!item) return null;
          return { meta, item };
        })
        .filter(
          (w): w is { meta: WidgetMeta; item: CalendarItem } => w !== null,
        ),
    [metas, pinnedItems],
  );

  const isEmpty = widgets.length === 0;

  return (
    <div
      className="min-h-[calc(100vh-4rem)] px-6 pb-28 pt-24 sm:pt-28 mt-0 text-fg transition-colors"
      style={{ background: "var(--bg)" }}
    >
      {/* Header */}
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">
            Tableau
          </p>
          <h1 className="text-2xl font-semibold text-fg sm:text-3xl">
            Dashboard Infinity
          </h1>
        
        </div>

        {/* Switch vues */}
        <div className="view-toggle inline-flex items-center gap-3 rounded-full px-2 py-1 text-xs">
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

      {/* État vide */}
      {isEmpty && (
        <div className="mx-auto mt-8 flex w-full max-w-6xl items-center justify-center">
          <div className="rounded-2xl bg-white/90 px-6 py-8 text-center text-xs text-muted shadow-[0_22px_70px_rgba(15,23,42,0.12)] backdrop-blur-md border border-slate-200/80">
            <p className="text-[13px] font-medium text-fg">
              Aucun élément épinglé pour l&apos;instant.
            </p>
            <p className="mt-2 text-[11px]">
              Ouvre le calendrier ou la TimeLine, clique sur l&apos;icône 📌
              pour mettre un événement ou une tâche en avant.
              <br />
              Ils apparaîtront automatiquement ici.
            </p>
          </div>
        </div>
      )}

      {/* MODE 3D */}
      {!isEmpty && viewMode === "float3d" && (
        <div className="mt-4 w-full">
          <Coverflow3D items={widgets} onOpen={setOpenItem} />
        </div>
      )}

      {/* MODE GALERIE = whiteboard libre */}
    {!isEmpty && viewMode === "grid" && (
  <div className="mt-4 w-full">
        <div
          ref={freeMoveContainerRef}
          className="pinned-board relative w-full overflow-hidden rounded-xl shadow-[0_30px_90px_rgba(15,23,42,0.12)] backdrop-blur-md"
          style={{ height: boardHeight, background: "var(--card)" }}
        >
            {widgets.map(({ meta, item }) => (
              <FreeWidget
                key={meta.id}
                meta={meta}
                item={item}
                containerRef={freeMoveContainerRef}
                setMetas={setMetas}
                onOpen={setOpenItem}
              />
            ))}
          </div>

          {/* Hauteur de la zone */}
          <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted">
            <button
              type="button"
              onClick={() => setBoardHeight((h) => Math.min(2400, h + 200))}
              className="rounded-full bg-white px-3 py-1 text-sm text-fg shadow-[0_12px_30px_rgba(15,23,42,0.12)] hover:shadow-[0_16px_40px_rgba(15,23,42,0.16)]"
            >
              ⤵︎ Agrandir la zone
            </button>
          </div>
        </div>
      )}

      {/* MODE LISTE */}
      {!isEmpty && viewMode === "list" && (
        <div className="mx-auto mt-4 w-full max-w-6xl">
          <Reorder.Group
            axis="y"
            values={metas}
            onReorder={setMetas}
            className="flex flex-col gap-3"
          >
            {widgets.map(({ meta, item }) => (
              <Reorder.Item
                key={meta.id}
                value={meta}
                whileDrag={{ scale: 1.03, zIndex: 20 }}
                className="cursor-grab active:cursor-grabbing"
              >
                <WidgetCard item={item} variant="list" onOpen={setOpenItem} />
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </div>
      )}

      {openItem && (
        <div
          className="fixed inset-0 z-[240] flex items-start justify-center pt-16"
          style={{ background: "rgba(255,255,255,0.02)", backdropFilter: "blur(3px)" }}
          onClick={() => setOpenItem(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="panel-glass relative w-[min(92vw,520px)] rounded-3xl p-5 text-slate-900 shadow-[0_22px_70px_rgba(15,23,42,0.18),0_10px_30px_rgba(15,23,42,0.14)] max-h-[72vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1 min-w-0">
                <div className="text-sm font-semibold truncate" title={openItem.title}>
                  {openItem.title}
                </div>
                <div className="text-[12px] text-slate-600 flex flex-wrap items-center gap-2">
                  <span>{formatDateLabel(openItem.date)}</span>
                  {openItem.time && (
                    <span>
                      · {openItem.time}
                      {openItem.endTime ? `–${openItem.endTime}` : ""}
                    </span>
                  )}
                  <span>· {labelForType(openItem.type)}</span>
                  {openItem.tagId && <span>· #{openItem.tagId}</span>}
                  {openItem.location && <span>· 📍 {openItem.location}</span>}
                </div>
              </div>
              <button
                type="button"
                className="close-icon"
                aria-label="Fermer"
                onClick={() => setOpenItem(null)}
              >
                <svg
                  aria-hidden="true"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 6l12 12" />
                  <path d="M18 6l-12 12" />
                </svg>
              </button>
            </div>
            {openItem.description && (
              <div className="mt-3 max-h-[48vh] overflow-auto pr-1">
                <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-line break-words">
                  {openItem.description}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Widget libre (mode Galerie / whiteboard)                           */
/* ------------------------------------------------------------------ */

type FreeWidgetProps = {
  meta: WidgetMeta;
  item: CalendarItem;
  containerRef: React.RefObject<HTMLDivElement | null>;
  setMetas: React.Dispatch<React.SetStateAction<WidgetMeta[]>>;
  onOpen?: (item: CalendarItem | null) => void;
};

const CARD_BASE_WIDTH = 300;
const CARD_BASE_HEIGHT = 200;

function FreeWidget({ meta, item, containerRef, setMetas, onOpen }: FreeWidgetProps) {
  const [isResizing, setIsResizing] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const scale = meta.scale ?? 1;
  const currentX = meta.x ?? 80;
  const currentY = meta.y ?? 80;

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

     const margin = 0;

    // On mesure la vraie taille visuelle de la carte
    const rect = cardRef.current?.getBoundingClientRect();
    const cardW = rect?.width ?? CARD_BASE_WIDTH * scale;
    const cardH = rect?.height ?? CARD_BASE_HEIGHT * scale;

    const handleMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      let nextX = startXPos + dx;
      let nextY = startYPos + dy;

      const maxX = cw - cardW - margin;
      const maxY = ch - cardH - margin;

      nextX = clamp(nextX, margin, Math.max(margin, maxX));
      nextY = clamp(nextY, margin, Math.max(margin, maxY));

      setMetas((prev) =>
        prev.map((m) =>
          m.id === meta.id ? { ...m, x: nextX, y: nextY } : m,
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

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();

    const container = containerRef.current;
    if (!container) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;

    const startX = e.clientX;
    const baseScale = scale;

    const margin = 0;

    const baseW = CARD_BASE_WIDTH;
    const baseH = CARD_BASE_HEIGHT;

    const cardX = meta.x ?? 80;
    const cardY = meta.y ?? 80;

    const maxScaleX = (cw - margin - cardX) / baseW;
    const maxScaleY = (ch - margin - cardY) / baseH;
    const hardMaxScale = Math.max(0.6, Math.min(1.6, maxScaleX, maxScaleY));
    const minScale = 0.6;

    setIsResizing(true);

    const handleMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const deltaScale = dx / 260;
      const nextScale = clamp(baseScale + deltaScale, minScale, hardMaxScale);

      setMetas((prev) =>
        prev.map((m) =>
          m.id === meta.id ? { ...m, scale: nextScale } : m,
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
      <div ref={cardRef} className="relative inline-block">
        <WidgetCard item={item} variant="grid" onOpen={onOpen} />

        {/* Poignée de resize (coin bas droit) */}
        <div
          onPointerDown={startResize}
          className="pointer-events-auto absolute -right-1 -bottom-1 flex h-4 w-4 cursor-nwse-resize items-center justify-center rounded-full border border-slate-200 bg-white text-[9px] text-slate-700 shadow-[0_6px_14px_rgba(15,23,42,0.16)] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
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

function Coverflow3D({
  items,
  onOpen,
}: {
  items: { meta: WidgetMeta; item: CalendarItem }[];
  onOpen?: (item: CalendarItem | null) => void;
}) {
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
        {items.map(({ item }, index) => {
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
              <WidgetCard item={item} variant="float3d" onOpen={onOpen} />
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
  item: CalendarItem;
  variant: ViewMode;
  onOpen?: (item: CalendarItem) => void;
};

function WidgetCard({ item, variant, onOpen }: WidgetCardProps) {
  const padding =
    variant === "list"
      ? "px-4 py-3"
      : variant === "float3d"
      ? "px-7 py-6"
      : "px-4 py-4";
  const widthClass =
    variant === "grid"
      ? "w-[300px]"
      : variant === "float3d"
      ? "w-[360px] sm:w-[420px]"
      : "w-full";

  const dateLabel = formatDateLabel(item.date);
  const hasTime = item.type === "event" && item.time;

  return (
    <div
      className={`relative overflow-hidden rounded-3xl ${padding} ${widthClass} transition-all shadow-[0_22px_70px_rgba(0,0,0,0.12),0_10px_30px_rgba(0,0,0,0.10)] hover:shadow-[0_26px_90px_rgba(0,0,0,0.18),0_12px_36px_rgba(0,0,0,0.12)] hover:-translate-y-1`}
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        color: "var(--text)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-[3px] text-[10px] font-semibold"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "none",
              color: "var(--text)",
            }}
          >
            {iconForType(item.type)}
            <span className="ml-1 capitalize">
              {labelForType(item.type)}
            </span>
          </span>
        </div>
        {(dateLabel || hasTime) && (
          <div className="text-right text-[10px] text-muted">
            {dateLabel && <div>{dateLabel}</div>}
            {hasTime && (
              <div className="font-medium text-fg">
                {item.time}
                {item.endTime ? `–${item.endTime}` : ""}
              </div>
            )}
          </div>
        )}
      </div>

      <h2
        className="mt-3 break-words text-sm font-semibold text-fg sm:text-base cursor-pointer hover:underline"
        onClick={() => onOpen?.(item)}
      >
        {item.title}
      </h2>

      {item.description && (
        <p className="mt-2 break-words text-[11px] leading-snug text-muted sm:text-[12px]">
          {item.description}
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
      className={`inline-flex items-center justify-center cursor-pointer px-3 py-1 text-[11px] transition-colors ${
        active ? "font-semibold text-fg" : "text-muted hover:text-fg"
      }`}
      style={{
        background: "transparent",
        border: "none",
        boxShadow: "none",
      }}
    >
      {label}
    </button>
  );
}

/* Helpers */

function labelForType(type: CalendarItem["type"]) {
  switch (type) {
    case "event":
      return "Événement";
    case "task":
      return "Tâche";
    default:
      return type;
  }
}

function iconForType(type: CalendarItem["type"]) {
  switch (type) {
    case "event":
      return "📅";
    case "task":
      return "✅";
    default:
      return "📝";
  }
}
