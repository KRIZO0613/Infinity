// apps/web/src/components/calendar/CalendarLauncher.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  useCalendarStore,
  type CalendarItem,
  type Tag,
  type ItemType,
} from "@/store/calendarStore";

/* --------------------------------------- */
/*               CONSTANTES                */
/* --------------------------------------- */

const DAYS_SHORT = ["L", "M", "M", "J", "V", "S", "D"];
const DAY_NAMES = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

const MONTHS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

/* --------------------------------------- */
/*               FONCTIONS UTIL            */
/* --------------------------------------- */

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addMonths(date: Date, delta: number): Date {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const tmp = new Date(y, m + delta, 1);
  const maxDay = new Date(tmp.getFullYear(), tmp.getMonth() + 1, 0).getDate();
  return new Date(tmp.getFullYear(), tmp.getMonth(), Math.min(d, maxDay));
}

/* --------------------------------------- */
/*            MATRICE MOIS                 */
/* --------------------------------------- */

type MatrixDay = {
  date: Date;
  inCurrentMonth: boolean;
};

function getMonthMatrix(ref: Date): MatrixDay[] {
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const firstDay = firstOfMonth.getDay(); // 0 = dimanche
  const offset = (firstDay + 6) % 7; // lundi = 0

  const result: MatrixDay[] = [];
  for (let i = 0; i < 42; i++) {
    const dayOffset = i - offset;
    const d = new Date(year, month, 1 + dayOffset);
    result.push({
      date: d,
      inCurrentMonth: d.getMonth() === month,
    });
  }
  return result;
}

/* --------------------------------------- */
/*       DUREE → MINUTES + ADD MINUTES     */
/* --------------------------------------- */

function durationLabelToMinutes(label: string): number {
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
      return 60;
  }
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor((total % (24 * 60)) / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/* --------------------------------------- */
/*            TIMEPICKER (ROULETTE)        */
/* --------------------------------------- */

type RadialTimePickerProps = {
  value: string;
  onChange: (value: string) => void;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseTime(value: string) {
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  const m = Number(mStr);

  const allowedMinutes = Array.from({ length: 12 }, (_, i) => i * 5);

  return {
    hour: !Number.isNaN(h) ? h : 9,
    minute: allowedMinutes.includes(m) ? m : 0,
  };
}

function RadialTimePicker({ value, onChange }: RadialTimePickerProps) {
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  const { hour, minute } = parseTime(value);

  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

  const display = `${pad2(hour)}:${pad2(minute)}`;

  const setHour = (h: number) => {
    onChange(`${pad2((h + 24) % 24)}:${pad2(minute)}`);
  };

  const setMinute = (m: number) => {
    onChange(`${pad2(hour)}:${pad2((m + 60) % 60)}`);
  };

  return (
    <div className="flex items-center justify-center gap-6">
      {/* Roulette heures */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={() => setHour(hour - 1)}
          className="mb-1 h-4 w-4 rounded-full text-[9px]"
          style={{
            border: "none",
            color: "var(--text)",
            background: "transparent",
            boxShadow: "none",
          }}
        >
          ▲
        </button>

        <div
          className="relative h-32 w-12 overflow-y-auto rounded-full"
          style={{
            border: "none",
            background: isDark ? "var(--surface)" : "#ffffff",
            boxShadow: isDark
              ? "0 14px 36px rgba(0,0,0,0.55)"
              : "0 12px 26px rgba(0,0,0,0.12)",
          }}
        >
          <div className="flex flex-col items-center py-1">
            {HOURS.map((h) => {
              const active = h === hour;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHour(h)}
                  className="my-[3px] w-full px-1 py-[2px] text-[11px] text-center transition-all"
                  style={
                    active
                      ? {
                        background: "transparent",
                        color: "var(--text)",
                        boxShadow: "none",
                        fontWeight: 700,
                      }
                      : {
                        color: isDark
                          ? "rgba(255,255,255,0.7)"
                          : "rgba(15,23,42,0.7)",
                        boxShadow: "none",
                        background: "transparent",
                      }
                  }
                >
                  {pad2(h)}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setHour(hour + 1)}
          className="mt-1 h-4 w-4 rounded-full text-[9px]"
          style={{
            border: "none",
            color: "var(--text)",
            background: "transparent",
            boxShadow: "none",
          }}
        >
          ▼
        </button>
      </div>

      {/* CERCLE CENTRAL */}
      <div className="flex items-center justify-center">
        <div
          className="flex h-28 w-28 items-center justify-center rounded-full"
          style={{
            border: isDark
              ? "1px solid rgba(255,255,255,0.10)"
              : "1px solid rgba(15,23,42,0.08)",
            background: isDark ? "var(--card)" : "#ffffff",
            boxShadow: isDark
              ? "0 16px 44px rgba(0,0,0,0.5)"
              : "0 12px 30px rgba(0,0,0,0.12)",
          }}
        >
          <span className="text-[20px] font-semibold text-[color:var(--text)]">
            {display}
          </span>
        </div>
      </div>

      {/* Roulette minutes */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={() => {
            const idx = MINUTES.indexOf(minute);
            setMinute(MINUTES[(idx - 1 + MINUTES.length) % MINUTES.length]);
          }}
          className="mb-1 h-4 w-4 rounded-full text-[9px]"
          style={{
            border: "none",
            color: "var(--text)",
            background: "transparent",
            boxShadow: "none",
          }}
        >
          ▲
        </button>

        <div
          className="relative h-32 w-12 overflow-y-auto rounded-full"
          style={{
            border: "none",
            background: isDark ? "var(--surface)" : "#ffffff",
            boxShadow: isDark
              ? "0 14px 36px rgba(0,0,0,0.55)"
              : "0 12px 26px rgba(0,0,0,0.12)",
          }}
        >
          <div className="flex flex-col items-center py-1">
            {MINUTES.map((m) => {
              const active = m === minute;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinute(m)}
                  className="my-[3px] w-full px-1 py-[2px] text-[11px] text-center transition-all"
                  style={
                    active
                      ? {
                        background: "transparent",
                        color: "var(--text)",
                        boxShadow: "none",
                        fontWeight: 700,
                      }
                      : {
                        color: isDark
                          ? "rgba(255,255,255,0.7)"
                          : "rgba(15,23,42,0.7)",
                        boxShadow: "none",
                        background: "transparent",
                      }
                  }
                >
                  {pad2(m)}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            const idx = MINUTES.indexOf(minute);
            setMinute(MINUTES[(idx + 1) % MINUTES.length]);
          }}
          className="mt-1 h-4 w-4 rounded-full text-[9px]"
          style={{
            border: "none",
            color: isDark ? "rgba(255,255,255,0.72)" : "rgba(15,23,42,0.72)",
            background: "transparent",
            boxShadow: "none",
          }}
        >
          ▼
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------- */
/*      DÉBUT DU COMPOSANT PRINCIPAL       */
/* --------------------------------------- */

export default function CalendarLauncher() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");

  const { items, tags, addItem, updateItem, deleteItem, addTag } =
    useCalendarStore();

  const [currentRefDate, setCurrentRefDate] = useState<Date>(
    () => new Date(2025, 0, 1),
  );
  const [selectedDateKey, setSelectedDateKey] = useState<string>(
    () => "2025-01-01",
  );

  const [editId, setEditId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [openedInCalendarId, setOpenedInCalendarId] =
    useState<string | null>(null);

  const [mode, setMode] = useState<ItemType>("event");
  const [time, setTime] = useState<string>("09:00");
  const [duration, setDuration] = useState<string>("30 min");
  const [showDurationChoices, setShowDurationChoices] = useState(false);

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  const [pinned, setPinned] = useState(false);
  const [taskDone, setTaskDone] = useState(false);

  const [tagId, setTagId] = useState<string | null>(null);
  const [showNewTagForm, setShowNewTagForm] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#22c55e");

  /* --------------------------------------- */
  /*          MOUNT + DATE INIT              */
  /* --------------------------------------- */

  useEffect(() => {
    setMounted(true);
    const now = new Date();
    setCurrentRefDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDateKey(formatDateKey(now));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOpen = (event: Event) => {
      const customEvent = event as CustomEvent<{ itemId?: string }>;
      const itemId = customEvent.detail?.itemId;
      if (!itemId) return;

      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      setOpen(true);
      handleClickItem(item);
      const d = parseDateKey(item.date);
      setCurrentRefDate(new Date(d.getFullYear(), d.getMonth(), 1));
      setOpenedInCalendarId(null);
    };

    window.addEventListener("infinity:calendar-open", handleOpen);
    return () => window.removeEventListener("infinity:calendar-open", handleOpen);
  }, [items]);

  /* --------------------------------------- */
  /*           DONNÉES DÉRIVÉES              */
  /* --------------------------------------- */

  const monthMatrix = useMemo(
    () => getMonthMatrix(currentRefDate),
    [currentRefDate],
  );

  const currentMonthLabel = `${MONTHS_FR[currentRefDate.getMonth()]} ${currentRefDate.getFullYear()}`;

  const selectedDate = useMemo(
    () => parseDateKey(selectedDateKey),
    [selectedDateKey],
  );

  const weekCells: MatrixDay[] = useMemo(() => {
    const base = selectedDate;
    const jsDay = base.getDay(); // 0 dimanche
    const mondayOffset = (jsDay + 6) % 7;
    const monday = new Date(base);
    monday.setDate(base.getDate() - mondayOffset);

    const res: MatrixDay[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      res.push({ date: d, inCurrentMonth: true });
    }
    return res;
  }, [selectedDate]);

  const dayCells: MatrixDay[] = useMemo(
    () => [{ date: selectedDate, inCurrentMonth: true }],
    [selectedDate],
  );

  const itemsForSelectedDate = useMemo(
    () =>
      items
        .filter((i) => i.date === selectedDateKey)
        .sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === "event" ? -1 : 1;
          }
          return a.time.localeCompare(b.time);
        }),
    [items, selectedDateKey],
  );

  const eventsForSelectedDate = useMemo(
    () => itemsForSelectedDate.filter((i) => i.type === "event"),
    [itemsForSelectedDate],
  );

  const tasksForSelectedDate = useMemo(
    () => itemsForSelectedDate.filter((i) => i.type === "task"),
    [itemsForSelectedDate],
  );



  const locationSuggestions = useMemo(() => {
    const query = location.trim().toLowerCase();
    if (!query) return [];

    const allLocations = items
      .map((i) => i.location?.trim())
      .filter((loc): loc is string => !!loc);

    const unique = Array.from(new Set(allLocations));

    return unique
      .filter(
        (loc) =>
          loc.toLowerCase().includes(query) &&
          loc.toLowerCase() !== query,
      )
      .slice(0, 5);
  }, [items, location]);

  function getTagForItem(item: CalendarItem): Tag | undefined {
    if (!item.tagId) return undefined;
    return tags.find((t) => t.id === item.tagId);
  }

  /* --------------------------------------- */
  /*                HANDLERS                 */
  /* --------------------------------------- */

  function resetFormForNew() {
    setEditId(null);
    setMode("event");
    setTime("09:00");
    setDuration("30 min");
    setTitle("");
    setLocation("");
    setDescription("");
    setPinned(false);
    setTaskDone(false);
    setTagId(null);
    setShowDurationChoices(false);
  }

  function handleToggleOpen() {
    setOpen((prev) => !prev);
    if (open) {
      setDetailOpen(false);
      setEditId(null);
      resetFormForNew();
      setOpenedInCalendarId(null);
    }
  }

  function handlePrev() {
    if (viewMode === "month") {
      const newDate = addMonths(currentRefDate, -1);
      setCurrentRefDate(newDate);
    } else if (viewMode === "week") {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 7);
      setSelectedDateKey(formatDateKey(d));
      setCurrentRefDate(new Date(d.getFullYear(), d.getMonth(), 1));
    } else {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 1);
      setSelectedDateKey(formatDateKey(d));
      setCurrentRefDate(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    setOpenedInCalendarId(null);
  }

  function handleNext() {
    if (viewMode === "month") {
      const newDate = addMonths(currentRefDate, 1);
      setCurrentRefDate(newDate);
    } else if (viewMode === "week") {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + 7);
      setSelectedDateKey(formatDateKey(d));
      setCurrentRefDate(new Date(d.getFullYear(), d.getMonth(), 1));
    } else {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + 1);
      setSelectedDateKey(formatDateKey(d));
      setCurrentRefDate(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    setOpenedInCalendarId(null);
  }

  function handleSelectDay(date: Date) {
    const key = formatDateKey(date);
    setSelectedDateKey(key);
    resetFormForNew();
    setDetailOpen(true);
    setOpenedInCalendarId(null);
  }

  function fillFormFromItem(item: CalendarItem) {
    setEditId(item.id);
    setSelectedDateKey(item.date);
    setMode(item.type);
    setTitle(item.title);
    setDescription(item.description || "");
    setPinned(item.pinned);
    setTagId(item.tagId ?? null);

    if (item.type === "event") {
      setTime(item.time);
      setDuration(item.durationLabel ?? "30 min");
      setLocation(item.location || "");
      setTaskDone(false);
    } else {
      setTime("09:00");
      setDuration("30 min");
      setLocation("");
      setTaskDone(!!item.done);
    }
  }

  function handleClickItem(item: CalendarItem) {
    fillFormFromItem(item);
    setDetailOpen(true);
  }

  function handleToggleTaskDone(itemId: string) {
    const target = items.find((i) => i.id === itemId);
    if (!target || target.type !== "task") return;

    updateItem(itemId, {
      done: !target.done,
    });

    if (editId === itemId) {
      setTaskDone((prev) => !prev);
    }
  }

  function handleCreateTag() {
    const name = newTagName.trim() || "Tag";

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    const newTag: Tag = {
      id,
      name,
      color: newTagColor,
    };

    addTag(newTag);
    setTagId(newTag.id);
    setNewTagName("");
    setNewTagColor("#22c55e");
    setShowNewTagForm(false);
  }

  function handleDelete() {
    if (!editId) return;
    deleteItem(editId);
    resetFormForNew();
    setDetailOpen(false);
  }

  function handleSave() {
    if (!title.trim()) return;

    const isTask = mode === "task";

    let timeToStore = time;
    let endTime: string | undefined;
    let durationLabel: string | undefined;

    if (!isTask) {
      const durationMinutes = durationLabelToMinutes(duration);
      endTime = addMinutesToTime(time, durationMinutes);
      durationLabel = duration;
    } else {
      timeToStore = "00:00";
    }

    const patch: Partial<CalendarItem> = {
      date: selectedDateKey,
      time: timeToStore,
      durationLabel,
      endTime,
      type: mode,
      title: title.trim(),
      description: description.trim() || undefined,
      location: !isTask && location.trim() ? location.trim() : undefined,
      pinned,
      tagId: tagId || undefined,
      done: isTask ? taskDone : undefined,
    };

    if (editId) {
      updateItem(editId, patch);
    } else {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      const newItem: CalendarItem = {
        id,
        date: selectedDateKey,
        time: timeToStore,
        durationLabel,
        endTime,
        type: mode,
        title: title.trim(),
        description: description.trim() || undefined,
        location: !isTask && location.trim() ? location.trim() : undefined,
        pinned,
        tagId: tagId || undefined,
        done: isTask ? taskDone : undefined,
      };

      addItem(newItem);
    }

    resetFormForNew();
  }

  /* --------------------------------------- */
  /*          RENDER CALENDAR GRID           */
  /* --------------------------------------- */

  function renderCalendarGrid() {
    const isDark =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark");

    const cells =
      viewMode === "month"
        ? monthMatrix
        : viewMode === "week"
        ? weekCells
        : dayCells;

    const gridCols = viewMode === "day" ? "grid-cols-1" : "grid-cols-7";

    const cellSizeClass =
      viewMode === "month"
        ? "min-h-[90px] md:min-h-[110px]"
        : "min-h-[140px] md:min-h-[160px]";

    return (
      <div
        className={`grid ${gridCols} gap-1.5`}
        onClick={() => setOpenedInCalendarId(null)} // clic dans la grille → ferme la mini-fiche
        style={{ padding: "2px" }}
      >
        {cells.map((cell, i) => {
          const key = formatDateKey(cell.date);
          const isSelected = key === selectedDateKey;
          const dayNumber = cell.date.getDate();

          const cellItems = items
            .filter((item) => item.date === key)
            .sort((a, b) => {
              if (a.type !== b.type) {
                return a.type === "event" ? -1 : 1;
              }
              return a.time.localeCompare(b.time);
            })
            .slice(0, 3);

          const totalCount = items.filter((item) => item.date === key).length;

          const hasOpenedItem = cellItems.some(
            (item) => item.id === openedInCalendarId,
          );

          return (
            <button
              key={`${key}-${i}`}
              type="button"
              onClick={() => handleSelectDay(cell.date)}
              className={`flex flex-col rounded-2xl border px-3 py-2 text-left text-[11px] transition-all ${cellSizeClass} ${!cell.inCurrentMonth ? "opacity-70" : ""} ${hasOpenedItem ? "relative z-20" : ""}`}
              style={{
                background: "transparent",
                border: isDark
                  ? "1px solid rgba(255,255,255,0.12)"
                  : "1px solid rgba(15,23,42,0.12)",
                color: "var(--text)",
                boxShadow: "none",
                outline: isSelected
                  ? isDark
                    ? "1px solid rgba(255,255,255,0.16)"
                    : "1px solid rgba(15,23,42,0.14)"
                  : "none",
              }}
            >
              <div className="mb-2 flex items-center justify-between text-[11px]">
                <span className="font-medium">{dayNumber}</span>
                {viewMode !== "month" && (
                  <span className="text-[10px] text-white/50">
                    {DAY_NAMES[cell.date.getDay()].slice(0, 3)}
                  </span>
                )}
              </div>

              <div className="space-y-[3px]">
                {cellItems.map((item) => {
                  const tag = getTagForItem(item);
                  const color = tag?.color ?? "#6366f1";
                  const isTask = item.type === "task";
                  const isOpen = openedInCalendarId === item.id;

                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation(); // ne pas déclencher le select du jour
                        setOpenedInCalendarId((prev) =>
                          prev === item.id ? null : item.id,
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpenedInCalendarId((prev) =>
                            prev === item.id ? null : item.id,
                          );
                        }
                      }}
                      className="relative w-full cursor-pointer rounded-lg px-1 py-[2px] hover:bg-white/5"
                    >
                      {/* Ligne compacte */}
                      <div className="flex items-center gap-1">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            backgroundColor: color,
                            boxShadow: `0 0 8px ${color}80`,
                          }}
                        />
                        <span className="line-clamp-1 text-[10px]">
                          {isTask
                            ? `📝 ${item.title}`
                            : `${item.time}${
                                item.endTime ? `–${item.endTime}` : ""
                              } · ${item.title}`}
                        </span>
                      </div>

                      {/* Mini-fiche flottante */}
                      {isOpen && (
                        <div
                          className="absolute left-0 top-5 z-30 w-[190px] rounded-2xl px-3 py-2 text-[10px]"
                          style={{
                            background: isDark ? "var(--card)" : "#ffffff",
                            border: isDark ? "1px solid var(--border)" : "none",
                            color: "var(--text)",
                            boxShadow: isDark ? "0 18px 45px rgba(0,0,0,0.65)" : "none",
                          }}
                          onClick={(e) => e.stopPropagation()} // 👈 pour ne pas se fermer si on clique dans la fiche
                        >
                          {!isTask && item.location && (
                            <p className="text-[color:var(--muted)]">📍 {item.location}</p>
                          )}

                          {item.description && (
                            <p className="mt-[2px] text-[color:var(--text)]">
                              {item.description}
                            </p>
                          )}

                          {!isTask && item.durationLabel && (
                            <p className="mt-[2px] text-[color:var(--muted)]">
                              Durée : {item.durationLabel}
                            </p>
                          )}

                          {item.tagId && (
                            <p className="mt-[2px] text-[color:var(--text)]">
                              #{getTagForItem(item)?.name}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {cellItems.length < totalCount && (
                  <span className="text-[9px] opacity-70">+ autres…</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  /* --------------------------------------- */
  /*              RENDER OVERLAY             */
  /* --------------------------------------- */

  function renderOverlay() {
    if (!open) return null;
    const isDark =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark");

    const headerDays =
      viewMode === "day"
        ? [
            DAY_NAMES[selectedDate.getDay()].slice(0, 1).toUpperCase() ??
              DAYS_SHORT[0],
          ]
        : DAYS_SHORT;

    const colorPresets = [
      "#ef4444",
      "#f97316",
      "#facc15",
      "#22c55e",
      "#3b82f6",
      "#a855f7",
      "#ec4899",
      "#6b7280",
      "#000000",
    ];

    const currentTag = tagId ? tags.find((t) => t.id === tagId) : undefined;

    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center">
        {/* fond */}
        <button
          type="button"
          aria-label="Fermer le calendrier"
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={handleToggleOpen}
        />

        {/* bloc principal */}
        <div
          className="calendar-overlay relative z-10 flex max-h-[90vh] w-[min(980px,100%-2rem)] flex-col overflow-hidden rounded-3xl"
          style={{
            background: "var(--bg)",
            color: "var(--text)",
            boxShadow: "none",
            border: "none",
            outline: "none",
            filter: "none",
          }}
        >
          {/* header */}
          <div
            className="flex items-center justify-between gap-4 px-6 py-4"
            style={{
              borderBottom: isDark
                ? "1px solid var(--border)"
                : "none",
            }}
          >
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
                Temps
              </p>
              <h2 className="text-sm font-semibold text-[color:var(--text)]">
                Calendrier Infinity
              </h2>
            </div>
            <button
              type="button"
              onClick={handleToggleOpen}
              className="close-icon"
              aria-label="Fermer"
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

          {/* corps */}
         {/* corps */}
<div
  className="flex flex-1 flex-col gap-4 overflow-hidden px-6 py-4 md:flex-row"
  onClick={() => setOpenedInCalendarId(null)}  // 👈 ferme la mini-fiche si on clique ailleurs
>
            {/* colonne gauche : calendrier */}
            <div className="min-w-0 flex-1 overflow-y-auto pr-0 md:pr-2">
              {/* barre mois + vue */}
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px]"
                  style={{
                    border: "none",
                    background: "transparent",
                    boxShadow: "none",
                    filter: "none",
                  }}
                >
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="rounded-full px-2 py-1"
                    style={{
                      background: "transparent",
                      color: "var(--muted)",
                      boxShadow: "none",
                    }}
                  >
                    ◀
                  </button>
                  <span className="text-[11px] font-medium text-[color:var(--text)]">
                    {currentMonthLabel}
                  </span>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="rounded-full px-2 py-1"
                    style={{
                      background: "transparent",
                      color: "var(--muted)",
                      boxShadow: "none",
                    }}
                  >
                    ▶
                  </button>
                </div>

                <div
                  className="inline-flex items-center rounded-full p-1 text-[11px]"
                  style={{
                    background: "transparent",
                    border: "none",
                    boxShadow: "none",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode("month");
                      setOpenedInCalendarId(null);
                    }}
                    className={`rounded-full px-3 py-1 ${
                      viewMode === "month"
                        ? "text-[color:var(--text)]"
                        : "text-[color:var(--muted)] hover:text-[color:var(--text)]"
                    }`}
                    style={{
                      background: "transparent",
                      border: "none",
                      boxShadow: "none",
                    }}
                  >
                    Mois
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode("week");
                      setOpenedInCalendarId(null);
                    }}
                    className={`rounded-full px-3 py-1 ${
                      viewMode === "week"
                        ? "text-[color:var(--text)]"
                        : "text-[color:var(--muted)] hover:text-[color:var(--text)]"
                    }`}
                    style={{
                      background: "transparent",
                      border: "none",
                      boxShadow: "none",
                    }}
                  >
                    Semaine
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode("day");
                      setOpenedInCalendarId(null);
                    }}
                    className={`rounded-full px-3 py-1 ${
                      viewMode === "day"
                        ? "text-[color:var(--text)]"
                        : "text-[color:var(--muted)] hover:text-[color:var(--text)]"
                    }`}
                    style={{
                      background: "transparent",
                      border: "none",
                      boxShadow: "none",
                    }}
                  >
                    Jour
                  </button>
                </div>
              </div>

              {/* en-tête jours */}
              <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
                {viewMode === "day"
                  ? Array.from({ length: 7 }).map((_, idx) => (
                      <div key={idx} />
                    ))
                  : headerDays.map((d, idx) => (
                      <div key={`${d}-${idx}`}>{d}</div>
                    ))}
              </div>

              {renderCalendarGrid()}
            </div>

            {/* colonne droite : détail */}
            {detailOpen && (
              <div
                className="w-full flex-shrink-0 overflow-y-auto pl-0 md:w-[320px] md:pl-2 overflow-hidden rounded-2xl"
                style={{ boxShadow: "none", border: "none" }}
              >
                <div
                  className="rounded-2xl p-4 text-[color:var(--text)] overflow-hidden"
                  style={{
                    background: isDark ? "var(--card)" : "#ffffff",
                    border: "none",
                    boxShadow: "none",
                  }}
                >
                  {/* Jour sélectionné + fermer */}
                  <div className="mb-2 flex items-center justify-between gap-2 text-[color:var(--text)]">
                    <div>
                      <p className="text-[11px] text-[color:var(--muted)]">
                        Jour sélectionné
                      </p>
                      <p className="text-[13px] font-semibold">
                        {selectedDate.getDate()}{" "}
                        {MONTHS_FR[selectedDate.getMonth()]}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDetailOpen(false);
                        resetFormForNew();
                      }}
                      className="close-icon"
                      aria-label="Fermer"
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

                  <div
                    className="mb-3 h-px w-full"
                    style={{
                      background: isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(15,23,42,0.08)",
                    }}
                  />

                  {/* Mode événement / tâche */}
                  <div
                    className="view-toggle inline-flex items-center rounded-full p-1 text-[11px]"
                    style={{
                      background: "transparent",
                      border: "none",
                      boxShadow: "none",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setMode("event")}
                      className={`rounded-full px-3 py-1 ${
                        mode === "event"
                          ? "text-[color:var(--text)]"
                          : "text-[color:var(--muted)] hover:text-[color:var(--text)]"
                      }`}
                      style={{
                        background: "transparent",
                        border: "none",
                        boxShadow: "none",
                      }}
                    >
                      Événement
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("task")}
                      className={`rounded-full px-3 py-1 ${
                        mode === "task"
                          ? "text-[color:var(--text)]"
                          : "text-[color:var(--muted)] hover:text-[color:var(--text)]"
                      }`}
                      style={{
                        background: "transparent",
                        border: "none",
                        boxShadow: "none",
                      }}
                    >
                      Tâche
                    </button>
                  </div>

                  {/* Statut tâche */}
                  {mode === "task" && (
                    <label
                      className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px]"
                      style={{
                        background: isDark ? "var(--surface)" : "#ffffff",
                        border: "none",
                        boxShadow: isDark
                          ? "0 10px 22px rgba(0,0,0,0.28)"
                          : "0 8px 16px rgba(15,23,42,0.10)",
                        color: "var(--text)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={taskDone}
                        onChange={(e) => setTaskDone(e.target.checked)}
                        className="h-3 w-3 rounded border bg-transparent"
                        style={{
                          borderColor: isDark
                            ? "var(--border)"
                            : "rgba(15,23,42,0.20)",
                        }}
                      />
                      <span>{taskDone ? "Tâche terminée" : "À faire"}</span>
                    </label>
                  )}

                  {/* Sélecteur d’heure + durée */}
                  {mode === "event" && (
                    <>
                      <div className="mt-3">
                        <RadialTimePicker value={time} onChange={setTime} />
                      </div>

                      <div className="mt-4">
                        <button
                          type="button"
                        onClick={() =>
                            setShowDurationChoices((v) => !v)
                          }
                          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
                          style={{
                            background: isDark ? "var(--surface)" : "#ffffff",
                            border: "none",
                            boxShadow: isDark
                              ? "0 10px 22px rgba(0,0,0,0.28)"
                              : "0 8px 16px rgba(15,23,42,0.10)",
                          }}
                    >
                          <span className="text-[11px] text-[color:var(--muted)]">
                            Durée
                          </span>

                          {duration && (
                            <span className="text-[11px] font-medium text-[color:var(--text)]">
                              {duration}
                            </span>
                          )}

                          <span className="select-none text-[15px] leading-none text-white/90">
                            {showDurationChoices ? "▴" : "▾"}
                          </span>
                        </button>

                        {showDurationChoices && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {[
                              "30 min",
                              "1h",
                              "1h30",
                              "2h",
                              "3h",
                              "4h",
                              "Matinée",
                              "Après-midi",
                              "Soirée",
                              "Journée entière",
                            ].map((d) => {
                              const active = duration === d;
                              return (
                                <button
                                  key={d}
                                  type="button"
                                  onClick={() => {
                                    setDuration(d);
                                    setShowDurationChoices(false);
                                  }}
                                  className={`rounded-full px-3 py-[6px] text-[11px] transition-all ${
                                    active
                                      ? "text-[color:var(--text)]"
                                      : "text-[color:var(--muted)] hover:text-[color:var(--text)]"
                                  }`}
                                  style={
                                    active
                                      ? {
                                          background: isDark
                                            ? "rgba(0,0,0,0.10)"
                                            : "rgba(0,0,0,0.05)",
                                          boxShadow: isDark
                                            ? "0 8px 18px rgba(0,0,0,0.24)"
                                            : "0 6px 12px rgba(15,23,42,0.10)",
                                        }
                                      : {
                                          background: "transparent",
                                          boxShadow: "none",
                                        }
                                  }
                                >
                                  {d}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Titre + lieu + description */}
                  <div className="mt-2 space-y-2">
                    <div>
                      <p className="mb-1 text-[11px] text-[color:var(--muted)]">
                        Titre{" "}
                        {mode === "event"
                          ? "de l’événement"
                          : "de la tâche"}
                      </p>
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full rounded-xl px-3 py-1.5 text-[11px] outline-none"
                        style={{
                          background: "var(--surface)",
                          border: "none",
                          boxShadow: isDark
                            ? "0 10px 22px rgba(0,0,0,0.30)"
                            : "0 6px 12px rgba(15,23,42,0.10)",
                          color: "var(--text)",
                        }}
                        placeholder="Ex : Appel client, entraînement…"
                      />
                    </div>

                    {mode === "event" && (
                      <div>
                        <p className="mb-1 text-[11px] text-[color:var(--muted)]">
                          Lieu / adresse
                        </p>
                        <input
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          className="w-full rounded-xl px-3 py-1.5 text-[11px] outline-none"
                          style={{
                            background: "var(--surface)",
                            border: "none",
                            boxShadow: isDark
                              ? "0 10px 22px rgba(0,0,0,0.30)"
                              : "0 6px 12px rgba(15,23,42,0.10)",
                            color: "var(--text)",
                          }}
                          placeholder="Ex : 12 rue de la Paix, Paris ou 'Stade FC26'"
                        />

                        {locationSuggestions.length > 0 && (
                          <div
                            className="mt-1 max-h-24 overflow-y-auto rounded-xl px-2 py-1"
                            style={{
                              background: "var(--surface)",
                              border: "none",
                              boxShadow: isDark
                                ? "0 12px 28px rgba(0,0,0,0.32)"
                                : "0 8px 16px rgba(15,23,42,0.12)",
                            }}
                          >
                            {locationSuggestions.map((loc) => (
                              <button
                                key={loc}
                                type="button"
                                onClick={() => setLocation(loc)}
                                className="block w-full truncate rounded-lg px-2 py-1 text-left text-[10px]"
                                style={{ color: "var(--text)" }}
                              >
                                {loc}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <p className="mb-1 text-[11px] text-[color:var(--muted)]">
                        Description
                      </p>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                        className="w-full resize-none rounded-xl px-3 py-1.5 text-[11px] outline-none"
                        style={{
                          background: "var(--surface)",
                          border: "none",
                          boxShadow: isDark
                            ? "0 10px 22px rgba(0,0,0,0.30)"
                            : "0 6px 12px rgba(15,23,42,0.10)",
                          color: "var(--text)",
                        }}
                        placeholder={
                          mode === "event"
                            ? "Optionnel : code portail, notes…"
                            : "Optionnel : détails de la tâche…"
                        }
                      />
                    </div>
                  </div>

                  {/* Épingler */}
                  <label
                    className="mt-2 inline-flex items-center gap-2 text-[11px]"
                    style={{ color: "var(--text)" }}
                  >
                    <input
                      type="checkbox"
                      checked={pinned}
                      onChange={(e) => setPinned(e.target.checked)}
                      className="h-3 w-3 rounded border border-[color:var(--border)] bg-transparent"
                    />
                    <span>Épingler sur le dashboard</span>
                  </label>

                  {/* Actions */}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      className="flex-1 rounded-full px-3 py-1.5 text-[11px] font-semibold"
                      style={{
                        background: isDark
                          ? "var(--surface)"
                          : "linear-gradient(180deg, #ffffff, #f6f7fb)",
                        color: isDark ? "var(--text)" : "rgba(15,23,42,0.9)",
                        boxShadow: isDark
                          ? "0 10px 24px rgba(0,0,0,0.38)"
                          : "0 6px 12px rgba(15,23,42,0.10)",
                        border: "none",
                      }}
                    >
                      {editId
                        ? "Mettre à jour"
                        : mode === "event"
                        ? "Créer l’événement"
                        : "Créer la tâche"}
                    </button>
                    {editId && (
                      <button
                        type="button"
                        onClick={handleDelete}
                        className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/10"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>

                  {/* Liste du jour – événements */}
                  {eventsForSelectedDate.length > 0 && (
                    <div className="mt-3 max-h-28 space-y-1 overflow-y-auto pr-1">
                      <p className="mb-1 text-[11px] text-white/50">
                        {eventsForSelectedDate.length} événement(s) ce jour
                      </p>
                      {eventsForSelectedDate.map((item) => {
                        const tag = getTagForItem(item);
                        const color = tag?.color ?? "#6366f1";

                        return (
                          <div
                            key={item.id}
                            className="flex w-full items-start gap-2 rounded-lg px-2 py-1 text-left text-[11px]"
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              color: "var(--text)",
                            }}
                          >
                            <span
                              className="mt-[3px] h-1.5 w-1.5 rounded-full"
                              style={{
                                backgroundColor: color,
                                boxShadow: `0 0 8px ${color}80`,
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleClickItem(item)}
                              className="flex-1 min-w-0 text-left"
                              style={{
                                background: "transparent",
                                border: "none",
                                padding: 0,
                              }}
                            >
                              <p className="font-medium break-words">
                                {item.time}
                                {item.endTime ? `–${item.endTime}` : ""} ·{" "}
                                {item.title}
                              </p>
                              {item.location && (
                                <p className="text-[10px] text-[color:var(--muted)] line-clamp-1 break-words">
                                  📍 {item.location}
                                </p>
                              )}
                              {item.description && (
                                <p className="text-[10px] text-[color:var(--muted)] line-clamp-2 break-words">
                                  {item.description}
                                </p>
                              )}
                              {item.durationLabel && (
                                <p className="text-[10px] text-[color:var(--muted)]">
                                  Durée : {item.durationLabel}
                                </p>
                              )}
                              {tag && (
                                <p className="text-[10px] text-[color:var(--text)]">
                                  #{tag.name}
                                </p>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Liste du jour – tâches */}
                  {tasksForSelectedDate.length > 0 && (
                    <div className="mt-3 max-h-28 space-y-1 overflow-y-auto pr-1">
                      <p className="mb-1 text-[11px] text-white/50">
                        {tasksForSelectedDate.length} tâche(s) ce jour
                      </p>
                      {tasksForSelectedDate.map((item) => {
                        const tag = getTagForItem(item);
                        const color = tag?.color ?? "#6366f1";
                        const isDone = !!item.done;

                        return (
                          <div
                            key={item.id}
                            className="flex w-full items-start gap-2 rounded-lg px-2 py-1 text-left text-[11px]"
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              color: "var(--text)",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isDone}
                              onChange={() => handleToggleTaskDone(item.id)}
                              className="mt-[3px] h-3 w-3 rounded border border-white/50 bg-transparent"
                            />
                            <span
                              className="mt-[3px] h-1.5 w-1.5 rounded-full"
                              style={{
                                backgroundColor: color,
                                boxShadow: `0 0 8px ${color}80`,
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleClickItem(item)}
                              className="flex-1 min-w-0 text-left"
                              style={{
                                background: "transparent",
                                border: "none",
                                padding: 0,
                              }}
                            >
                              <p
                                className={`font-medium break-words ${
                                  isDone
                                    ? "line-through text-[color:var(--muted)]"
                                    : ""
                                }`}
                              >
                                📝 {item.title}
                              </p>
                              {item.description && (
                                <p className="text-[10px] text-[color:var(--muted)] line-clamp-2 break-words">
                                  {item.description}
                                </p>
                              )}
                              {tag && (
                                <p className="text-[10px] text-[color:var(--text)]">
                                  #{tag.name}
                                </p>
                              )}
                              <p className="text-[10px] text-[color:var(--muted)]">
                                {isDone ? "Fait" : "À faire"}
                              </p>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* --------------------------------------- */
  /*            RENDER PRINCIPAL             */
  /* --------------------------------------- */

    /* --------------------------------------- */
  /*            RENDER PRINCIPAL             */
  /* --------------------------------------- */

  return (
    <>
      {/* BOUTON DANS LE DOCK */}
      <button
        type="button"
        aria-label="Calendrier Infinity"
        onClick={handleToggleOpen}
        className="dock-item flex h-14 w-14 items-center justify-center"
      >
        <svg
          aria-hidden
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-current"
        >
          <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
          <path d="M8 3.5v3M16 3.5v3M4 9.5h16" />
          <line x1="7" y1="12.5" x2="17" y2="12.5" />
          <line x1="7" y1="16.5" x2="17" y2="16.5" />
          <circle cx="10" cy="12.5" r="0.6" />
          <circle cx="14.5" cy="16.5" r="0.6" />
        </svg>
      </button>

      {/* PORTAL : overlay du calendrier seulement */}
      {mounted && createPortal(renderOverlay(), document.body)}
    </>
  );
}
