// apps/web/src/app/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TimelineButton } from "@/components/home/TimelineButton";
import { useCalendarStore, type CalendarItem } from "@/store/calendarStore";

export default function HomePage() {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "event" | "task">("all");
  const [openedTimelineId, setOpenedTimelineId] = useState<string | null>(null);

  const timelineRef = useRef<HTMLDivElement | null>(null);

  // 🔗 Récupère les vrais items du calendrier (Zustand)
  const itemsFromStore = useCalendarStore((s) => s.items);
  const updateItem = useCalendarStore((s) => s.updateItem);

  // 🧠 Items filtrés + à venir, triés par date/heure
  const items = useMemo(() => {
    const now = new Date();

    const filtered =
      filter === "all"
        ? itemsFromStore
        : itemsFromStore.filter((i) => i.type === filter);

    const upcoming = filtered.filter((item) => {
      const dateTime = buildDateTime(item);
      return dateTime.getTime() >= now.getTime();
    });

    upcoming.sort((a, b) => {
      const da = buildDateTime(a).getTime();
      const db = buildDateTime(b).getTime();
      return da - db;
    });

    return upcoming;
  }, [filter, itemsFromStore]);

  // 📌 Toggle épingle sur un item (stocké dans le store)
  const togglePin = (id: string) => {
    const target = itemsFromStore.find((i) => i.id === id);
    if (!target) return;
    updateItem(id, { pinned: !target.pinned });
  };

  // 🔍 Fermer la timeline si clic en dehors
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        timelineRef.current &&
        !timelineRef.current.contains(e.target as Node)
      ) {
        setTimelineOpen(false);
        setOpenedTimelineId(null);
      }
    }

    if (timelineOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [timelineOpen]);

  return (
    <div className="relative min-h-[calc(100vh-4rem)] px-6 pb-32 pt-6">
      {/* === Bouton TimeLine + panneau déroulant === */}
      <div className="pointer-events-none absolute left-0 -top-14 z-30 sm:-top-16">
        <div className="pointer-events-auto space-y-2">
          <TimelineButton
            active={timelineOpen}
            onClick={() => setTimelineOpen((o) => !o)}
          />

          {timelineOpen && (
            <div
              ref={timelineRef}
              className="mt-2 w-[260px] rounded-2xl border border-white/10 bg-black/70 p-3 text-xs text-zinc-200 shadow-[0_18px_40px_rgba(0,0,0,0.75)] backdrop-blur-xl"
              onClick={() => setOpenedTimelineId(null)} // clic dans la zone vide du panneau → ferme la mini-fiche
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                  À venir
                </span>
                <div className="inline-flex gap-1 rounded-full bg-white/5 p-1">
                  <FilterChip
                    label="Tous"
                    active={filter === "all"}
                    onClick={() => setFilter("all")}
                  />
                  <FilterChip
                    label="Événements"
                    active={filter === "event"}
                    onClick={() => setFilter("event")}
                  />
                  <FilterChip
                    label="Tâches"
                    active={filter === "task"}
                    onClick={() => setFilter("task")}
                  />
                </div>
              </div>

              {/* Liste TimeLine */}
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {items.map((item) => {
                  const isTask = item.type === "task";
                  const isOpen = openedTimelineId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="rounded-xl bg-white/5 px-3 py-2 hover:bg-white/10"
                    >
                      {/* Ligne cliquable (div au lieu de button) */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation(); // ne ferme pas la fiche ni le panneau
                          setOpenedTimelineId((prev) =>
                            prev === item.id ? null : item.id,
                          );
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setOpenedTimelineId((prev) =>
                              prev === item.id ? null : item.id,
                            );
                          }
                        }}
                        className="flex w-full items-start justify-between gap-2 text-left"
                      >
                        {/* Titre + type */}
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                              {isTask ? "Tâche" : "Événement"}
                            </span>
                          </div>
                          <div className="text-[11px] font-medium text-white">
                            {item.title}
                          </div>
                        </div>

                        {/* Date / heure / épingle */}
                        <div className="flex flex-col items-end gap-1 text-right text-[10px] text-zinc-400">
                          <div>{formatDateLabel(item.date)}</div>

                          {item.type === "event" && item.time && (
                            <div className="font-medium text-zinc-100">
                              {item.time}
                              {item.endTime ? `–${item.endTime}` : ""}
                            </div>
                          )}

                          {/* Bouton épingle (stop la propagation du clic) */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePin(item.id);
                            }}
                            className="mt-1 inline-flex items-center justify-center rounded-full border border-white/15 bg-black/40 p-1 text-[10px] text-zinc-200 hover:bg-white/10"
                            title={
                              item.pinned
                                ? "Retirer du Dashboard"
                                : "Épingler sur le Dashboard"
                            }
                          >
                            <span className="leading-none">
                              {item.pinned ? "📌" : "📍"}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* 🔽 Mini-fiche ouverte juste sous la ligne */}
                      {isOpen && (
                        <div
                          className="mt-2 rounded-xl border border-white/15 bg-black/80 px-2 py-1.5 text-[10px] text-white"
                          onClick={(e) => e.stopPropagation()} // clic dans la fiche → ne ferme rien
                        >
                          {!isTask && item.location && (
                            <p className="text-white/70">📍 {item.location}</p>
                          )}

                          {item.description && (
                            <p className="mt-[2px] text-white/80">
                              {item.description}
                            </p>
                          )}

                          {item.durationLabel && !isTask && (
                            <p className="mt-[2px] text-white/60">
                              Durée : {item.durationLabel}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* === Orb centrale comme avant === */}
      <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-4xl items-center justify-center pt-4">
        <div className="relative flex aspect-square w-full max-w-md items-center justify-center -translate-y-6 sm:-translate-y-10">
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-[#050714] via-black to-[#050714] shadow-[0_0_60px_-25px_rgba(79,70,229,0.6)] infinity-orb">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(129,140,248,0.28),transparent_65%)] opacity-40" />
            <div className="pointer-events-none absolute inset-6 rounded-full border border-white/10 animate-[slowspin_90s_linear_infinite]" />
            <div className="pointer-events-none absolute inset-12 rounded-full border border-white/5 animate-[slowspin_90s_linear_infinite]" />
            <div className="pointer-events-none absolute left-1/2 top-6 h-[70%] w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/20 to-transparent animate-[slowspin_90s_linear_infinite]" />
            <div className="pointer-events-none absolute left-6 top-1/2 h-px w-[70%] -translate-y-1/2 bg-gradient-to-r from-transparent via-white/18 to-transparent animate-[slowspin_90s_linear_infinite]" />

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

/* Helpers UI */

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

/** Construit un Date à partir de CalendarItem (date + time ou 00:00) */
function buildDateTime(item: CalendarItem): Date {
  const time = item.time || "00:00";
  return new Date(`${item.date}T${time}`);
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