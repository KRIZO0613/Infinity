// apps/web/src/app/page.tsx
"use client";

import { useMemo, useState } from "react";
import { TimelineButton } from "@/components/home/TimelineButton";

/* -------------------------------------------------------------------------- */
/* TYPES + MOCK TEMPORAIRE (à remplacer ensuite par tes vraies données)      */
/* -------------------------------------------------------------------------- */

type TimelineType = "event" | "task";

type TimelineItem = {
  id: string;
  title: string;
  type: TimelineType;
  date: string;
  time?: string;
};

const MOCK_TIMELINE: TimelineItem[] = [
  {
    id: "1",
    title: "Appel client important",
    type: "event",
    date: "2025-11-30",
    time: "09:30",
  },
  {
    id: "2",
    title: "Session dev Infinity",
    type: "task",
    date: "2025-12-01",
    time: "14:00",
  },
];

/* -------------------------------------------------------------------------- */
/* PAGE                                                                       */
/* -------------------------------------------------------------------------- */

export default function HomePage() {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "event" | "task">("all");

  const items = useMemo(() => {
    const now = new Date();

    const filtered =
      filter === "all"
        ? MOCK_TIMELINE
        : MOCK_TIMELINE.filter((i) => i.type === filter);

    const upcoming = filtered.filter((item) => {
      const d = new Date(item.date + (item.time ? `T${item.time}` : "T00:00"));
      return d.getTime() >= now.getTime();
    });

    upcoming.sort((a, b) => {
      const da = new Date(a.date + (a.time ? `T${a.time}` : "T00:00")).getTime();
      const db = new Date(b.date + (b.time ? `T${b.time}` : "T00:00")).getTime();
      return da - db;
    });

    return upcoming;
  }, [filter]);

  return (
    <div className="relative min-h-[calc(100vh-4rem)] px-6 pb-32 pt-6">

      {/* ---------------------------------------------------------------------- */}
      {/* BOUTON TIMELINE + DÉROULÉ                                              */}
      {/* ---------------------------------------------------------------------- */}
      <div className="pointer-events-none absolute left-0 -top-14 z-30 sm:-top-16">
        <div className="pointer-events-auto space-y-2">
          <TimelineButton
            active={timelineOpen}
            onClick={() => setTimelineOpen((o) => !o)}
          />

          {timelineOpen && (
            <div className="mt-2 w-[260px] rounded-2xl border border-white/10 bg-black/70 p-3 text-xs text-zinc-200 shadow-[0_18px_40px_rgba(0,0,0,0.75)] backdrop-blur-xl">
              
              {/* Filtres -------------------------------------------------------- */}
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                  À venir
                </span>
                <div className="inline-flex gap-1 rounded-full bg-white/5 p-1">
                  <FilterChip label="Tous" active={filter === "all"} onClick={() => setFilter("all")} />
                  <FilterChip label="Événements" active={filter === "event"} onClick={() => setFilter("event")} />
                  <FilterChip label="Tâches" active={filter === "task"} onClick={() => setFilter("task")} />
                </div>
              </div>

              {/* Liste ou vide --------------------------------------------------- */}
              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-4 text-[11px] text-zinc-400">
                  Rien de prévu pour le moment.
                </div>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 hover:bg-white/10"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                            {item.type === "event" ? "Événement" : "Tâche"}
                          </span>
                        </div>
                        <div className="text-[11px] font-medium text-white">
                          {item.title}
                        </div>
                      </div>
                      <div className="text-right text-[10px] text-zinc-400">
                        <div>{formatDateLabel(item.date)}</div>
                        {item.time && (
                          <div className="font-medium text-zinc-100">{item.time}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* ORB CENTRALE (inchangé)                                               */}
      {/* ---------------------------------------------------------------------- */}

      <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-4xl items-center justify-center pt-4">
        <div className="relative flex aspect-square w-full max-w-md items-center justify-center -translate-y-6 sm:-translate-y-10">

          <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-[#050714] via-black to-[#050714] shadow-[0_0_60px_-25px_rgba(79,70,229,0.6)] infinity-orb">

            {/* Glow interne */}
            <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_50%_40%,rgba(129,140,248,0.28),transparent_65%)]" />

            {/* Anneaux / traits */}
            <div className="pointer-events-none absolute inset-6 rounded-full border border-white/10 animate-[slowspin_90s_linear_infinite]" />
            <div className="pointer-events-none absolute inset-12 rounded-full border border-white/5 animate-[slowspin_90s_linear_infinite]" />
            <div className="pointer-events-none absolute left-1/2 top-6 h-[70%] w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/20 to-transparent animate-[slowspin_90s_linear_infinite]" />
            <div className="pointer-events-none absolute top-1/2 left-6 h-px w-[70%] -translate-y-1/2 bg-gradient-to-r from-transparent via-white/18 to-transparent animate-[slowspin_90s_linear_infinite]" />

            {/* Contenu */}
            <div className="relative z-10 flex flex-col items-center px-6 text-center">
              <h1 className="text-2xl font-semibold text-white sm:text-[26px]">
                Donne vie à tes idées.
              </h1>

              <button
                type="button"
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-indigo-300/60 bg-indigo-600/90 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_0_30px_rgba(79,70,229,0.9)] transition-all hover:bg-indigo-500 active:scale-95 sm:text-[15px] infinity-orb-button"
              >
                <span className="text-lg leading-none">＋</span>
                <span>Proget</span>
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* UI HELPERS                                                                 */
/* -------------------------------------------------------------------------- */

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2 py-0.5 text-[9px] ${
        active
          ? "bg-cyan-500/80 text-white"
          : "bg-transparent text-zinc-400 hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}

function formatDateLabel(dateStr: string) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  const oneDay = 24 * 60 * 60 * 1000;

  if (d === today) return "Aujourd’hui";
  if (d === today + oneDay) return "Demain";

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}