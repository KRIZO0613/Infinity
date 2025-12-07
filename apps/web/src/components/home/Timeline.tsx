// apps/web/src/components/home/Timeline.tsx
"use client";

import { useCalendarStore } from "@/store/calendarStore";

export function Timeline() {
  const { items, tags } = useCalendarStore();

  const sorted = [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.time.localeCompare(b.time);
  });

  function getTagName(id?: string) {
    if (!id) return undefined;
    return tags.find((t) => t.id === id)?.name;
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/60 px-3 py-2 text-[11px] text-white/60">
        Aucune entrée pour l’instant. Crée un événement ou une tâche dans le calendrier.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/80 p-3 text-[11px] text-white max-h-72 overflow-y-auto">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold text-white/90">
          Timeline
        </p>
        <span className="text-[10px] text-white/50">
          {sorted.length} élément(s)
        </span>
      </div>

      <div className="space-y-2">
        {sorted.map((item) => {
          const tagName = getTagName(item.tagId);
          const isTask = item.type === "task";

          return (
            <div
              key={item.id}
              className="flex gap-2 rounded-xl border border-white/15 bg-black/60 px-2 py-1.5"
            >
              <div className="mt-[3px] flex h-5 w-5 items-center justify-center rounded-full bg-white/5 text-[10px]">
                {isTask ? "📝" : "⏱"}
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-white/60">
                  {item.date} · {isTask ? "Tâche" : "Événement"}
                </p>
                <p className="text-[11px] font-semibold">
                  {isTask
                    ? item.title
                    : `${item.time}${
                        item.endTime ? `–${item.endTime}` : ""
                      } · ${item.title}`}
                </p>
                {item.location && !isTask && (
                  <p className="text-[10px] text-white/60">
                    📍 {item.location}
                  </p>
                )}
                {item.description && (
                  <p className="text-[10px] text-white/70">
                    {item.description}
                  </p>
                )}
                {tagName && (
                  <p className="text-[10px] text-cyan-300">
                    #{tagName}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}