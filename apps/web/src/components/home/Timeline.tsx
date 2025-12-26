// apps/web/src/components/home/Timeline.tsx
"use client";

import { useState } from "react";
import { useCalendarStore } from "@/store/calendarStore";

export function Timeline() {
  const { items, tags } = useCalendarStore();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<typeof items[number] | null>(null);

  const sorted = [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.time.localeCompare(b.time);
  });

  const toggleDone = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  function getTagName(id?: string) {
    if (!id) return undefined;
    return tags.find((t) => t.id === id)?.name;
  }

  if (sorted.length === 0) {
    return (
      <div className="timeline-panel rounded-2xl px-4 py-3 text-[12px] text-slate-600 dark:text-[rgba(235,240,248,0.78)]">
        Aucune entrée pour l’instant. Crée un événement ou une tâche dans le calendrier.
      </div>
    );
  }

  return (
    <>
      <div className="timeline-panel rounded-2xl p-4 text-[12px] text-[color:var(--text)] max-h-80 overflow-y-auto">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[12px] font-semibold text-slate-900 dark:text-[rgba(235,240,248,0.92)]">Timeline</p>
        <span className="text-[11px] text-slate-600 dark:text-[rgba(235,240,248,0.7)]">{sorted.length} élément(s)</span>
      </div>

      <div className="space-y-2">
        {sorted.map((item) => {
          const tagName = getTagName(item.tagId);
          const isTask = item.type === "task";
          const isDone = done.has(item.id);
          const [year, month, day] = item.date.split("-");
          const formattedDate = day && month && year ? `${day}/${month}/${year}` : item.date;
          const formattedTime = item.time
            ? `${item.time.replace(/:/, "H")}${item.endTime ? ` - ${item.endTime.replace(/:/, "H")}` : ""}`
            : "";
          const locationName = !isTask && item.location ? item.location : "";
          const displayTitle = item.title
            ? `${item.title.slice(0, 1).toUpperCase()}${item.title.slice(1)}`
            : "";

          return (
            <div
              key={item.id}
              className="timeline-row flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2 px-1 py-2 last:border-b-0 transition min-w-0"
            >
              <span
                className="text-[12px] font-semibold text-slate-900 dark:text-[rgba(235,240,248,0.92)] truncate w-20 shrink-0 uppercase cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(item);
                }}
              >
                {isTask ? "TÂCHE" : "ÉVÉNEMENT"}:
              </span>
              <span
                className="truncate font-semibold text-[#1b3a6f] dark:text-[rgba(235,240,248,0.92)] text-[12px] w-full sm:w-36 shrink-0 cursor-pointer"
                title={displayTitle}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(item);
                }}
              >
                {displayTitle}
              </span>
              <div className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-[rgba(235,240,248,0.78)] min-w-0 flex-1">
                <span
                  className="truncate min-w-0"
                  title={item.description}
                >
                  {item.description ? item.description.replace(/\s+/g, " ").trim() : ""}
                </span>
                {locationName && (
                  <span
                    className="truncate flex-shrink-0 flex items-center gap-1 text-slate-500 dark:text-[rgba(235,240,248,0.7)]"
                    title={locationName}
                  >
                    <svg
                      aria-hidden="true"
                      focusable="false"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="flex-shrink-0"
                    >
                      <path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10Z" />
                      <circle cx="12" cy="11" r="2.5" />
                    </svg>
                    <span className="truncate">{locationName}</span>
                  </span>
                )}
                {tagName && (
                  <span className="truncate flex-shrink-0 text-slate-500" title={tagName}>
                    #{tagName}
                  </span>
                )}
              </div>
              <span className="flex-shrink-0 text-[9px] text-slate-400 dark:text-[rgba(235,240,248,0.6)] text-right w-full sm:w-32">
                {formattedDate} {item.time ? item.time.replace(/:/, "H") : ""}
              </span>
              <button
                type="button"
                aria-label={isDone ? "Marquer comme à faire" : "Marquer comme fait"}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDone(item.id);
                }}
                className="flex items-center justify-center rounded-full transition active:scale-95"
                style={{
                  width: "8px",
                  height: "8px",
                  padding: 0,
                  appearance: "none",
                  background: isDone ? "#0c98cb" : "rgba(255,255,255,0.95)",
                  boxShadow: isDone ? "none" : "0 2px 6px rgba(0,0,0,0.28)",
                  border: "none",
                }}
              />
            </div>
          );
        })}
      </div>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-[220] flex items-start justify-center pt-16"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelected(null)}
          style={{ background: "rgba(255,255,255,0.02)", backdropFilter: "blur(2px)" }}
        >
          <div
            className="panel-glass relative w-[min(92vw,520px)] rounded-3xl p-5 text-slate-900 shadow-[0_22px_70px_rgba(15,23,42,0.18),0_10px_30px_rgba(15,23,42,0.14)] max-h-[72vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1 min-w-0">
                <div className="text-sm font-semibold truncate" title={selected.title}>{selected.title}</div>
                <div className="text-[12px] text-slate-600 flex flex-wrap items-center gap-2">
                  <span>{selected.date}</span>
                  {selected.time && <span>· {selected.time}{selected.endTime ? `–${selected.endTime}` : ""}</span>}
                  <span>· {selected.type === "task" ? "Tâche" : "Événement"}</span>
                  {selected.tagId && <span>· #{getTagName(selected.tagId)}</span>}
                  {selected.location && <span>· 📍 {selected.location}</span>}
                </div>
              </div>
              <button
                type="button"
                className="btn-plain text-slate-700 hover:text-slate-900"
                aria-label="Fermer"
                onClick={() => setSelected(null)}
              >
                ✕
              </button>
            </div>
            {selected.description && (
              <div className="mt-3 max-h-[48vh] overflow-auto pr-1">
                <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-line break-words">
                  {selected.description}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
