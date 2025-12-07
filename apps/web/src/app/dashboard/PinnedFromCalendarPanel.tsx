// apps/web/src/components/dashboard/PinnedFromCalendarPanel.tsx
"use client";

import { useMemo } from "react";
import { useCalendarStore, type CalendarItem } from "@/store/calendarStore";

export function PinnedFromCalendarPanel() {
  const items = useCalendarStore((s) => s.items);

  const pinned = useMemo(() => {
    const allPinned = items.filter((i) => i.pinned);

    // tri chronologique
    allPinned.sort((a, b) => {
      const da = buildDateTime(a).getTime();
      const db = buildDateTime(b).getTime();
      return da - db;
    });

    return allPinned.slice(0, 10); // limite pour garder un bloc propre
  }, [items]);

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-black/70 px-4 py-3 text-xs text-white shadow-[0_18px_45px_rgba(15,23,42,0.9)] backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
            Focus
          </p>
          <p className="text-[13px] font-semibold text-white">
            Épinglés du calendrier
          </p>
        </div>
        <span className="rounded-full bg-white/5 px-2 py-[1px] text-[10px] text-white/70">
          {pinned.length}
        </span>
      </div>

      {pinned.length === 0 ? (
        <p className="mt-2 text-[11px] text-white/55">
          Rien d&apos;épinglé pour l&apos;instant.
          <br />
          Depuis le calendrier ou la TimeLine, active l&apos;icône 📌 pour
          mettre un élément en avant.
        </p>
      ) : (
        <div className="mt-2 flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
          {pinned.map((item) => (
            <PinnedCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function PinnedCard({ item }: { item: CalendarItem }) {
  const isTask = item.type === "task";
  const dateLabel = formatDateLabel(item.date);

  return (
    <div className="flex items-start gap-2 rounded-xl border border-white/15 bg-black/85 px-3 py-2 text-left text-[11px]">
      <div className="mt-[3px] text-sm">
        {isTask ? "📝" : "📅"}
      </div>

      <div className="flex-1">
        {/* Titre + date */}
        <div className="flex items-center justify-between gap-2">
          <p className="line-clamp-1 font-semibold text-white">
            {item.title}
          </p>
          <span className="text-[10px] text-white/55">
            {dateLabel}
          </span>
        </div>

        {/* Heure (événement seulement) */}
        {!isTask && item.time && (
          <p className="mt-[1px] text-[10px] text-cyan-200">
            {item.time}
            {item.endTime ? `–${item.endTime}` : ""}
            {item.durationLabel ? ` · ${item.durationLabel}` : ""}
          </p>
        )}

        {/* Lieu */}
        {!isTask && item.location && (
          <p className="text-[10px] text-white/60">
            📍 {item.location}
          </p>
        )}

        {/* Description */}
        {item.description && (
          <p className="mt-[1px] line-clamp-2 text-[10px] text-white/70">
            {item.description}
          </p>
        )}

        {/* Type */}
        <p className="mt-[2px] text-[10px] text-white/45">
          {isTask ? "Tâche épinglée" : "Événement épinglé"}
        </p>
      </div>
    </div>
  );
}

/* ------- helpers ------- */

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