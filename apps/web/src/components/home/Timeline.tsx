// apps/web/src/components/home/Timeline.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCalendarStore, type CalendarItem } from "@/store/calendarStore";

type EditDraft = {
  title: string;
  description: string;
  location: string;
  tagId: string;
};

type FilterStatus = "all" | "todo" | "done" | "overdue";

type FeedbackState = {
  message: string;
  visible: boolean;
};

type DateOption = {
  value: string;
  label: string;
};

export function Timeline() {
  const { items, tags, updateItem, deleteItem } = useCalendarStore();
  const [selected, setSelected] = useState<typeof items[number] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>({
    title: "",
    description: "",
    location: "",
    tagId: "",
  });
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("todo");
  const [filterOpen, setFilterOpen] = useState(false);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, FeedbackState>>({});
  const [datePulseId, setDatePulseId] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const feedbackTimers = useRef<Record<string, number[]>>({});
  const datePulseTimer = useRef<number | null>(null);
  const editingItem = items.find((item) => item.id === editingId) ?? null;
  const rescheduleItem = items.find((item) => item.id === rescheduleId) ?? null;

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });
  }, [items]);

  const todayStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const dateOptions = useMemo<DateOption[]>(() => {
    const options: DateOption[] = [];
    for (let i = 0; i <= 60; i += 1) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() + i);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
      const label = d.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
      });
      options.push({ value, label });
    }
    return options;
  }, [todayStart]);

  const timeOptions = useMemo(() => {
    const options: string[] = [];
    for (let h = 0; h < 24; h += 1) {
      for (let m = 0; m < 60; m += 30) {
        options.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return options;
  }, []);

  const customDateOptions = useMemo(() => {
    if (!rescheduleDate) return dateOptions;
    if (dateOptions.some((option) => option.value === rescheduleDate)) {
      return dateOptions;
    }
    return [{ value: rescheduleDate, label: rescheduleDate }, ...dateOptions];
  }, [dateOptions, rescheduleDate]);

  const customTimeOptions = useMemo(() => {
    if (!rescheduleTime) return timeOptions;
    if (timeOptions.includes(rescheduleTime)) return timeOptions;
    return [rescheduleTime, ...timeOptions];
  }, [rescheduleTime, timeOptions]);

  const isOverdue = (item: CalendarItem) => {
    if (item.done) return false;
    if (!item.date) return false;
    const d = new Date(`${item.date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return false;
    return d < todayStart;
  };

  const visibleItems = useMemo(() => {
    return sorted.filter((item) => {
      const overdue = isOverdue(item);
      const done = !!item.done;
      if (filterStatus === "all") return true;
      if (filterStatus === "done") return done;
      if (filterStatus === "overdue") return overdue;
      return !done && !overdue;
    });
  }, [sorted, filterStatus, todayStart]);

  function getTagName(id?: string) {
    if (!id) return undefined;
    return tags.find((t) => t.id === id)?.name;
  }

  useEffect(() => {
    return () => {
      Object.values(feedbackTimers.current).forEach((timers) => {
        timers.forEach((id) => window.clearTimeout(id));
      });
      if (datePulseTimer.current) {
        window.clearTimeout(datePulseTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const fresh = items.find((item) => item.id === selected.id);
    if (fresh) {
      setSelected(fresh);
    }
  }, [items, selected?.id]);

  useEffect(() => {
    if (editingId && !editingItem) {
      setEditingId(null);
    }
  }, [editingId, editingItem]);

  useEffect(() => {
    if (rescheduleId && !rescheduleItem) {
      setRescheduleId(null);
    }
  }, [rescheduleId, rescheduleItem]);

  const startEdit = (item: CalendarItem) => {
    setEditingId(item.id);
    setEditDraft({
      title: item.title,
      description: item.description ?? "",
      location: item.location ?? "",
      tagId: item.tagId ?? "",
    });
    setRescheduleId(null);
    setSelected(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = (item: CalendarItem) => {
    const nextTitle = editDraft.title.trim();
    const patch: Partial<CalendarItem> = {
      title: nextTitle || item.title,
      description: editDraft.description.trim() || undefined,
      tagId: editDraft.tagId || undefined,
    };

    if (item.type === "event") {
      patch.location = editDraft.location.trim() || undefined;
    }

    updateItem(item.id, patch);
    setEditingId(null);
  };

  const showFeedback = (itemId: string, message: string) => {
    if (feedbackTimers.current[itemId]) {
      feedbackTimers.current[itemId].forEach((id) => window.clearTimeout(id));
    }

    setFeedbackMap((prev) => ({
      ...prev,
      [itemId]: { message, visible: true },
    }));

    const fadeTimer = window.setTimeout(() => {
      setFeedbackMap((prev) => ({
        ...prev,
        [itemId]: { message, visible: false },
      }));
    }, 500);

    const clearTimer = window.setTimeout(() => {
      setFeedbackMap((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }, 900);

    feedbackTimers.current[itemId] = [fadeTimer, clearTimer];
  };

  const handleToggleDone = (item: CalendarItem) => {
    const nextDone = !item.done;
    updateItem(item.id, { done: nextDone });
    showFeedback(
      item.id,
      nextDone
        ? item.type === "task"
          ? "Marqué comme fait"
          : "Événement fait"
        : "Remis à faire",
    );
  };

  const parseMinutes = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return 0;
    return h * 60 + m;
  };

  const addMinutesToTime = (value: string, minutes: number) => {
    const total = parseMinutes(value) + minutes;
    const hh = Math.floor(((total % (24 * 60)) + 24 * 60) % (24 * 60) / 60);
    const mm = ((total % 60) + 60) % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  const durationLabelToMinutes = (label?: string) => {
    switch (label) {
      case "30 min":
        return 30;
      case "1h":
        return 60;
      case "1h30":
        return 90;
      case "2h":
        return 120;
      case "3h":
        return 180;
      case "4h":
        return 240;
      case "Matinée":
        return 180;
      case "Après-midi":
        return 240;
      case "Soirée":
        return 240;
      case "Journée entière":
        return 480;
      default:
        return undefined;
    }
  };

  const applyReschedule = (item: CalendarItem, nextDate: string, nextTime?: string) => {
    const patch: Partial<CalendarItem> = {
      date: nextDate,
    };
    if (nextTime) {
      patch.time = nextTime;
      if (item.type === "event") {
        const durationMinutes = durationLabelToMinutes(item.durationLabel);
        if (durationMinutes !== undefined) {
          patch.endTime = addMinutesToTime(nextTime, durationMinutes);
        } else if (item.endTime && item.time) {
          const diff = parseMinutes(item.endTime) - parseMinutes(item.time);
          patch.endTime = addMinutesToTime(nextTime, diff);
        }
      }
    }
    updateItem(item.id, patch);
    setDatePulseId(item.id);
    if (datePulseTimer.current) {
      window.clearTimeout(datePulseTimer.current);
    }
    datePulseTimer.current = window.setTimeout(() => {
      setDatePulseId(null);
    }, 700);
  };

  const openReschedule = (item: CalendarItem) => {
    setRescheduleId(item.id);
    setRescheduleDate(item.date);
    setRescheduleTime(item.time || "09:00");
    setEditingId(null);
    setSelected(null);
  };

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
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-600 dark:text-[rgba(235,240,248,0.7)]">{visibleItems.length} élément(s)</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Filtrer"
            title="Filtrer"
            onClick={() => setFilterOpen(true)}
            style={{ opacity: 0.75 }}
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
              <path d="M3 5h18" />
              <path d="M6 12h12" />
              <path d="M10 19h4" />
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {visibleItems.length === 0 && (
          <p className="text-[11px] text-slate-500">
            Aucun élément pour ce filtre.
          </p>
        )}
        {visibleItems.map((item) => {
          const tagName = getTagName(item.tagId);
          const isTask = item.type === "task";
          const isDone = !!item.done;
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
              className="timeline-row flex flex-col gap-1 px-1 py-2 last:border-b-0 transition min-w-0"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2 min-w-0">
                <button
                  type="button"
                  className="icon-button h-5 w-5 shrink-0 text-slate-500"
                  aria-label="Supprimer"
                  title="Supprimer"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteItem(item.id);
                    if (selected?.id === item.id) {
                      setSelected(null);
                    }
                    if (editingId === item.id) {
                      setEditingId(null);
                    }
                    if (rescheduleId === item.id) {
                      setRescheduleId(null);
                    }
                  }}
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
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M6 6l1 14h10l1-14" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="icon-button h-5 w-5 shrink-0 text-slate-700 dark:text-[rgba(235,240,248,0.92)]"
                  aria-label={isTask ? "Tâche" : "Événement"}
                  title={isTask ? "Tâche" : "Événement"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(item);
                  }}
                >
                  {isTask ? (
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
                      <path d="M16 4h-1.2a2 2 0 0 0-3.6 0H10a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" />
                      <path d="M10 8h4" />
                      <path d="M10 12h4" />
                      <path d="M10 16h4" />
                    </svg>
                  ) : (
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
                      <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
                      <path d="M8 3.5v3M16 3.5v3M4 9.5h16" />
                    </svg>
                  )}
                </button>
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
                <div className="flex w-full flex-col items-end gap-1 text-right sm:w-32">
                  <span
                    className="text-[9px] text-slate-400 dark:text-[rgba(235,240,248,0.6)]"
                    style={
                      datePulseId === item.id
                        ? { animation: "timelineDateShift 650ms ease" }
                        : undefined
                    }
                  >
                    {formattedDate} {item.time ? item.time.replace(/:/, "H") : ""}
                  </span>
                  {feedbackMap[item.id] && (
                    <span
                      className="text-[9px] text-slate-400 transition-opacity duration-500"
                      style={{
                        opacity: feedbackMap[item.id].visible ? 1 : 0,
                      }}
                    >
                      {feedbackMap[item.id].message}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={item.pinned ? "Désépingler" : "Épingler"}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateItem(item.id, { pinned: !item.pinned });
                    }}
                    className="inline-flex items-center justify-center p-0 leading-none"
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                    }}
                    title={item.pinned ? "Désépingler" : "Épingler"}
                  >
                    <svg
                      aria-hidden="true"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={item.pinned ? "#22c55e" : "rgba(148,163,184,0.8)"}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M10 3h4l1 5 3 3-1.5 1.5L12 8 7.5 12.5 6 11l3-3 1-5Z" />
                      <path d="M12 8v13" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="Modifier l’élément"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(item);
                    }}
                    className="inline-flex items-center justify-center p-0 leading-none"
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      color: "var(--muted)",
                    }}
                    title="Modifier"
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
                      <path d="M12 20h9" />
                      <path d="m16.5 3.5 4 4L8 20l-4 1 1-4 11.5-13.5Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="Reporter"
                    onClick={(e) => {
                      e.stopPropagation();
                      openReschedule(item);
                    }}
                    className="inline-flex items-center justify-center p-0 leading-none"
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      color: "var(--muted)",
                    }}
                    title="Reporter"
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
                      <path d="M12 6h6v6" />
                      <path d="M18 6a8 8 0 1 0 2.2 5.5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label={isDone ? "Marquer comme à faire" : "Marquer comme fait"}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleDone(item);
                    }}
                    className="inline-flex items-center justify-center rounded-full transition active:scale-95"
                    style={{
                      width: "16px",
                      height: "16px",
                      padding: 0,
                      border: "1px solid var(--border)",
                      color: isDone ? "var(--text)" : "var(--muted)",
                      background: isDone ? "rgba(15,23,42,0.08)" : "transparent",
                    }}
                  >
                    <svg
                      aria-hidden="true"
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      </div>

      {editingItem && (
        <div
          className="overlay-veil fixed inset-0 z-[230] flex items-start justify-center pt-16"
          role="dialog"
          aria-modal="true"
          onClick={() => setEditingId(null)}
        >
          <div
            className="panel-glass relative w-[min(92vw,560px)] rounded-3xl p-5 text-slate-900 shadow-[0_22px_70px_rgba(15,23,42,0.18),0_10px_30px_rgba(15,23,42,0.14)] max-h-[72vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="text-sm font-semibold truncate">
                  Modifier {editingItem.type === "task" ? "la tâche" : "l’événement"}
                </div>
                <div className="text-[12px] text-slate-600 flex flex-wrap items-center gap-2">
                  <span>{editingItem.date}</span>
                  {editingItem.time && (
                    <span>
                      · {editingItem.time}
                      {editingItem.endTime ? `–${editingItem.endTime}` : ""}
                    </span>
                  )}
                  <span>· {editingItem.type === "task" ? "Tâche" : "Événement"}</span>
                </div>
              </div>
              <button
                type="button"
                className="close-icon"
                aria-label="Fermer"
                onClick={() => setEditingId(null)}
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

            <div className="mt-4 space-y-3 text-[11px]">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500">Titre</span>
                  <input
                    value={editDraft.title}
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                    className="rounded-lg px-2 py-1 text-[11px] outline-none"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  />
                </label>
                {editingItem.type === "event" && (
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500">Lieu</span>
                    <input
                      value={editDraft.location}
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...prev,
                          location: e.target.value,
                        }))
                      }
                      className="rounded-lg px-2 py-1 text-[11px] outline-none"
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                      }}
                    />
                  </label>
                )}
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-500">Description</span>
                <textarea
                  value={editDraft.description}
                  onChange={(e) =>
                    setEditDraft((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  rows={3}
                  className="resize-none rounded-lg px-2 py-1 text-[11px] outline-none"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                />
              </label>

              {tags.length > 0 && (
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500">Tag</span>
                  <select
                    value={editDraft.tagId}
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        tagId: e.target.value,
                      }))
                    }
                    className="rounded-lg px-2 py-1 text-[11px] outline-none"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  >
                    <option value="">Aucun tag</option>
                    {tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => saveEdit(editingItem)}
                  className="rounded-full px-3 py-1 text-[10px] font-semibold"
                  style={{
                    background: "#0c98cb",
                    color: "white",
                    border: "none",
                  }}
                >
                  Enregistrer
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-full px-3 py-1 text-[10px] font-semibold"
                  style={{
                    background: "transparent",
                    color: "var(--muted)",
                    border: "1px solid var(--border)",
                  }}
                >
                  Annuler
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                <span>L’heure n’est pas modifiable ici.</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Ouvrir le calendrier"
                  title="Ouvrir le calendrier"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(
                        new CustomEvent("infinity:calendar-open", {
                          detail: { itemId: editingItem.id },
                        }),
                      );
                    }
                    setEditingId(null);
                  }}
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
                    <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
                    <path d="M8 3.5v3M16 3.5v3M4 9.5h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {rescheduleItem && (
        <div
          className="overlay-veil fixed inset-0 z-[225] flex items-start justify-center pt-16"
          role="dialog"
          aria-modal="true"
          onClick={() => setRescheduleId(null)}
        >
          <div
            className="panel-glass relative w-[min(92vw,340px)] rounded-3xl p-4 text-slate-900 shadow-[0_22px_70px_rgba(15,23,42,0.16),0_10px_30px_rgba(15,23,42,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-[12px] font-semibold">Reporter</div>
              <button
                type="button"
                className="close-icon"
                aria-label="Fermer"
                onClick={() => setRescheduleId(null)}
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

            <div className="mt-3 space-y-2 text-[11px]">
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-full px-3 py-1 text-[10px] font-semibold"
                  style={{
                    background: "transparent",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                  }}
                  onClick={() => {
                    const base = new Date(`${rescheduleItem.date}T00:00:00`);
                    const effective = Number.isNaN(base.getTime()) ? new Date(todayStart) : base;
                    effective.setDate(effective.getDate() + 1);
                    const next = `${effective.getFullYear()}-${String(effective.getMonth() + 1).padStart(2, "0")}-${String(
                      effective.getDate(),
                    ).padStart(2, "0")}`;
                    applyReschedule(rescheduleItem, next, rescheduleItem.time);
                    setRescheduleId(null);
                  }}
                >
                  Demain
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-full px-3 py-1 text-[10px] font-semibold"
                  style={{
                    background: "transparent",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                  }}
                  onClick={() => {
                    const base = new Date(`${rescheduleItem.date}T00:00:00`);
                    const effective = Number.isNaN(base.getTime()) ? new Date(todayStart) : base;
                    effective.setDate(effective.getDate() + 7);
                    const next = `${effective.getFullYear()}-${String(effective.getMonth() + 1).padStart(2, "0")}-${String(
                      effective.getDate(),
                    ).padStart(2, "0")}`;
                    applyReschedule(rescheduleItem, next, rescheduleItem.time);
                    setRescheduleId(null);
                  }}
                >
                  Dans une semaine
                </button>
              </div>

              <div className="pt-1 text-[10px] text-slate-400">Choisir date et heure</div>
              <div className="flex gap-2">
                <select
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="flex-1 rounded-lg px-2 py-1 text-[11px] outline-none"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                >
                  {customDateOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-24 rounded-lg px-2 py-1 text-[11px] outline-none"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                >
                  {customTimeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option.replace(":", "h")}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(
                      new CustomEvent("infinity:calendar-open", {
                        detail: { itemId: rescheduleItem.id },
                      }),
                    );
                  }
                  setRescheduleId(null);
                }}
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold"
                style={{
                  background: "transparent",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                }}
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
                  <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
                  <path d="M8 3.5v3M16 3.5v3M4 9.5h16" />
                </svg>
                Autre
              </button>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!rescheduleDate) return;
                    applyReschedule(rescheduleItem, rescheduleDate, rescheduleTime || rescheduleItem.time);
                    setRescheduleId(null);
                  }}
                  className="rounded-full px-3 py-1 text-[10px] font-semibold"
                  style={{
                    background: "var(--surface)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                  }}
                >
                  Appliquer
                </button>
                <button
                  type="button"
                  onClick={() => setRescheduleId(null)}
                  className="rounded-full px-3 py-1 text-[10px] font-semibold"
                  style={{
                    background: "transparent",
                    color: "var(--muted)",
                    border: "1px solid var(--border)",
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {filterOpen && (
        <div
          className="overlay-veil fixed inset-0 z-[215] flex items-start justify-center pt-16"
          role="dialog"
          aria-modal="true"
          onClick={() => setFilterOpen(false)}
        >
          <div
            className="panel-glass relative w-[min(92vw,280px)] rounded-3xl p-4 text-slate-900 shadow-[0_22px_70px_rgba(15,23,42,0.16),0_10px_30px_rgba(15,23,42,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-[12px] font-semibold">Filtrer</div>
              <button
                type="button"
                className="close-icon"
                aria-label="Fermer"
                onClick={() => setFilterOpen(false)}
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
            <div className="mt-3 space-y-1 text-[11px]">
              {[
                { key: "all", label: "Tout afficher" },
                { key: "todo", label: "À faire" },
                { key: "done", label: "Fait" },
                { key: "overdue", label: "En retard" },
              ].map((option) => {
                const active = filterStatus === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      setFilterStatus(option.key as FilterStatus);
                      setFilterOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left"
                    style={{
                      background: active ? "rgba(15,23,42,0.06)" : "transparent",
                      color: "var(--text)",
                      opacity: active ? 1 : 0.8,
                    }}
                  >
                    <span
                      className="inline-flex h-2 w-2 rounded-full"
                      style={{
                        border: "1px solid var(--border)",
                        background: active ? "var(--text)" : "transparent",
                      }}
                    />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="overlay-veil fixed inset-0 z-[220] flex items-start justify-center pt-16"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelected(null)}
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
                className="close-icon"
                aria-label="Fermer"
                onClick={() => setSelected(null)}
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
