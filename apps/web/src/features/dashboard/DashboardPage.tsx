// apps/web/src/features/dashboard/DashboardPage.tsx
"use client";

import { useState } from "react";
import { Reorder, motion } from "framer-motion";

type PinnedKind = "event" | "task" | "note";

type PinnedItem = {
  id: string;
  kind: PinnedKind;
  title: string;
  description: string;
  dateLabel: string;
  timeLabel?: string;
};

// 🔒 petit jeu de données mock
const INITIAL_ITEMS: PinnedItem[] = [
  {
    id: "1",
    kind: "event",
    title: "Appel client important",
    description: "Préparer l’offre Infinity + démo rapide.",
    dateLabel: "Aujourd’hui",
    timeLabel: "09:30",
  },
  {
    id: "2",
    kind: "task",
    title: "Session dev Boardk",
    description: "UI Dashboard + intégration calendrier.",
    dateLabel: "Aujourd’hui",
    timeLabel: "14:00",
  },
  {
    id: "3",
    kind: "note",
    title: "Idée univers Moko",
    description: "Nouvelle scène d’intro + gimmick antenne.",
    dateLabel: "Demain",
    timeLabel: "18:00",
  },
];

type ViewMode = "gallery" | "list" | "3d";

export default function DashboardPage() {
  const [items, setItems] = useState<PinnedItem[]>(INITIAL_ITEMS);
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pt-8 pb-16 sm:px-8">
      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold title-strong sm:text-3xl">
            Dashboard Infinity
          </h1>
          <p className="mt-1 max-w-xl text-sm paragraph-soft">
            Organise tes rendez-vous, tâches et idées épinglées comme tu veux.
          </p>
        </div>

        {/* Switch vue */}
        <div className="inline-flex items-center gap-1 rounded-full border border-muted-2 bg-black/40 px-1 py-1 text-xs">
          <button
            type="button"
            onClick={() => setViewMode("gallery")}
            className={`rounded-full px-3 py-1 transition ${
              viewMode === "gallery"
                ? "bg-white/10 text-fg shadow-[0_0_14px_rgba(148,163,253,0.7)]"
                : "text-muted hover:text-fg"
            }`}
          >
            Galerie
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`rounded-full px-3 py-1 transition ${
              viewMode === "list"
                ? "bg-white/10 text-fg shadow-[0_0_14px_rgba(148,163,253,0.7)]"
                : "text-muted hover:text-fg"
            }`}
          >
            Liste
          </button>
          <button
            type="button"
            onClick={() => setViewMode("3d")}
            className={`rounded-full px-3 py-1 transition ${
              viewMode === "3d"
                ? "bg-gradient-to-r from-indigo-500 to-cyan-400 text-white shadow-[0_0_18px_rgba(56,189,248,0.7)]"
                : "text-muted hover:text-fg"
            }`}
          >
            3D
          </button>
        </div>
      </header>

      {/* Contenu selon la vue */}
      {viewMode === "list" && <PinnedList items={items} setItems={setItems} />}

      {viewMode === "gallery" && (
        <PinnedGallery items={items} setItems={setItems} />
      )}

      {viewMode === "3d" && (
        <PinnedCoverflow
          items={items}
          activeIndex={activeIndex}
          setActiveIndex={setActiveIndex}
        />
      )}
    </div>
  );
}

/* ─────────────────────────  Vue 1 : Liste  ───────────────────────── */

function PinnedList({
  items,
  setItems,
}: {
  items: PinnedItem[];
  setItems: (items: PinnedItem[]) => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold title-strong">Vue Liste</h2>
      <Reorder.Group
        axis="y"
        values={items}
        onReorder={setItems}
        className="flex flex-col gap-3"
      >
        {items.map((item) => (
         <Reorder.Item
  key={item.id}
  value={item}
  whileDrag={{ scale: 1.02 }}
  className="cursor-grab active:cursor-grabbing"
>
  <PinnedCard item={item} variant="full" />
</Reorder.Item>
        ))}
      </Reorder.Group>
    </section>
  );
}

/* ───────────────────────  Vue 2 : Galerie horizontale  ─────────────────────── */

function PinnedGallery({
  items,
  setItems,
}: {
  items: PinnedItem[];
  setItems: (items: PinnedItem[]) => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold title-strong">Vue Galerie</h2>
      <p className="text-xs paragraph-soft">
        Tu peux réordonner les cartes en les faisant glisser horizontalement.
      </p>

      <Reorder.Group
        axis="x"
        values={items}
        onReorder={setItems}
        className="flex w-full gap-5 overflow-x-auto pb-3 pt-1"
      >
        {items.map((item) => (
        <Reorder.Item
  key={item.id}
  value={item}
  whileDrag={{ scale: 1.03 }}
  className="min-w-[260px] max-w-xs cursor-grab active:cursor-grabbing"
>
  <PinnedCard item={item} variant="compact" />
</Reorder.Item>
        ))}
      </Reorder.Group>
    </section>
  );
}

/* ─────────────────────  Vue 3 : Coverflow 3D (style iPhoto)  ───────────────────── */

function PinnedCoverflow({
  items,
  activeIndex,
  setActiveIndex,
}: {
  items: PinnedItem[];
  activeIndex: number;
  setActiveIndex: (index: number) => void;
}) {
  const clampIndex = (index: number) => {
    if (index < 0) return 0;
    if (index >= items.length) return items.length - 1;
    return index;
  };

  function goLeft() {
    setActiveIndex(clampIndex(activeIndex - 1));
  }

  function goRight() {
    setActiveIndex(clampIndex(activeIndex + 1));
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold title-strong">Vue 3D</h2>
        <div className="flex items-center gap-2 text-xs text-muted">
          <button
            type="button"
            onClick={goLeft}
            className="h-8 w-8 rounded-full border border-muted-2 text-lg leading-none hover-outline-accent"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={goRight}
            className="h-8 w-8 rounded-full border border-muted-2 text-lg leading-none hover-outline-accent"
          >
            ▶
          </button>
        </div>
      </div>

      <div className="relative h-[260px] w-full overflow-visible">
        <div className="absolute inset-0 flex items-center justify-center [perspective:1400px]">
          {items.map((item, index) => {
            const offset = index - activeIndex; // 0 centre, -1 gauche, +1 droite
            const isActive = offset === 0;

            const translateX = offset * 180;
            const rotateY = offset * -18;
            const scale = isActive ? 1 : 0.82;
            const zIndex = 100 - Math.abs(offset);

            const blurClass =
              Math.abs(offset) >= 2
                ? "opacity-30 blur-[1px]"
                : "opacity-80";

            return (
              <motion.button
                key={item.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                initial={false}
                animate={{
                  x: translateX,
                  rotateY,
                  scale,
                }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
                style={{ zIndex }}
                className={`absolute origin-center cursor-pointer outline-none ${blurClass}`}
              >
                <PinnedCard
                  item={item}
                  variant={isActive ? "full" : "compact"}
                />
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  Carte épinglée  ───────────────────────── */

function PinnedCard({
  item,
  variant,
}: {
  item: PinnedItem;
  variant: "full" | "compact";
}) {
  const isEvent = item.kind === "event";
  const isTask = item.kind === "task";
  const isNote = item.kind === "note";

  let pillLabel = "";
  let pillClasses = "";

  if (isEvent) {
    pillLabel = "Événement";
    pillClasses =
      "bg-sky-500 text-white shadow-[0_0_12px_rgba(56,189,248,0.6)]";
  } else if (isTask) {
    pillLabel = "Tâche";
    pillClasses =
      "bg-emerald-500 text-white shadow-[0_0_12px_rgba(34,197,94,0.6)]";
  } else {
    pillLabel = "Note";
    pillClasses =
      "bg-rose-500 text-white shadow-[0_0_12px_rgba(244,114,182,0.6)]";
  }

  return (
    <div
      className="relative flex h-36 w-full flex-col justify-between overflow-hidden rounded-3xl border border-white/10
      bg-[radial-gradient(circle_at_top_left,rgba(129,140,248,0.8),rgba(15,23,42,1))] px-5 py-4
      shadow-[0_0_40px_rgba(129,140,248,0.55)]"
    >
      {/* top line */}
      <div className="flex items-start justify-between gap-3">
        <div className="inline-flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-[3px] text-[11px] font-medium ${pillClasses}`}
          >
            {pillLabel}
          </span>
        </div>
        <div className="text-right text-[11px] text-white/70">
          <p>{item.dateLabel}</p>
          {item.timeLabel && <p>{item.timeLabel}</p>}
        </div>
      </div>

      {/* centre */}
      <div className="mt-3 space-y-1">
        <h3 className="text-sm font-semibold text-white">{item.title}</h3>
        {variant === "full" && (
          <p className="text-xs text-white/80 line-clamp-2">
            {item.description}
          </p>
        )}
      </div>

      {/* petit motif bas */}
      <div className="mt-3 flex items-end justify-between text-[10px] text-white/40">
        <div className="flex gap-[3px]">
          <span className="h-3 w-[2px] rounded-full bg-white/25" />
          <span className="h-4 w-[2px] rounded-full bg-white/30" />
          <span className="h-2 w-[2px] rounded-full bg-white/20" />
          <span className="h-5 w-[2px] rounded-full bg-white/35" />
        </div>
        <span className="h-[1px] w-4 rounded-full bg-white/30" />
      </div>
    </div>
  );
}