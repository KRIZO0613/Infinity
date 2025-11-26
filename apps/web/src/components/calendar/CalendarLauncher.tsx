// apps/web/src/components/calendar/CalendarLauncher.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type ItemType = "event" | "task";

type CalendarItem = {
  id: string;
  date: string; // yyyy-mm-dd
  time: string; // hh:mm
  type: ItemType;
  title: string;
  description?: string;
  color: "indigo" | "cyan" | "rose";
  pinned: boolean;
};

const DAYS_SHORT = ["L", "M", "M", "J", "V", "S", "D"];
const HOURS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
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

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map((x) => Number(x));
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

function badgeClassesForColor(color: CalendarItem["color"]) {
  switch (color) {
    case "cyan":
      return "bg-cyan-500/90 text-white border border-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.7)]";
    case "rose":
      return "bg-rose-500/90 text-white border border-rose-300 shadow-[0_0_12px_rgba(244,114,182,0.7)]";
    case "indigo":
    default:
      return "bg-indigo-500/90 text-white border border-indigo-300 shadow-[0_0_12px_rgba(79,70,229,0.8)]";
  }
}

function dotClassesForColor(color: CalendarItem["color"]) {
  switch (color) {
    case "cyan":
      return "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]";
    case "rose":
      return "bg-rose-400 shadow-[0_0_8px_rgba(244,114,182,0.8)]";
    case "indigo":
    default:
      return "bg-indigo-400 shadow-[0_0_8px_rgba(79,70,229,0.85)]";
  }
}

export default function CalendarLauncher() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false); // pour les portals

  // valeurs stables SSR
  const [currentRefDate, setCurrentRefDate] = useState<Date>(
    () => new Date(2025, 0, 1),
  );
  const [selectedDateKey, setSelectedDateKey] = useState<string>(
    () => "2025-01-01",
  );

  const [items, setItems] = useState<CalendarItem[]>([]);
  const [editId, setEditId] = useState<string | null>(null);

  const [mode, setMode] = useState<ItemType>("event");
  const [time, setTime] = useState<string>("09:00");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<CalendarItem["color"]>("indigo");
  const [pinned, setPinned] = useState(false);

  // client ready
  useEffect(() => {
    setMounted(true);
    const now = new Date();
    setCurrentRefDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDateKey(formatDateKey(now));
  }, []);

  const matrix = useMemo(
    () => getMonthMatrix(currentRefDate),
    [currentRefDate],
  );
  const currentMonthLabel = `${MONTHS_FR[currentRefDate.getMonth()]} ${currentRefDate.getFullYear()}`;

  const selectedDate = useMemo(
    () => parseDateKey(selectedDateKey),
    [selectedDateKey],
  );

  const itemsForSelectedDate = useMemo(
    () =>
      items
        .filter((i) => i.date === selectedDateKey)
        .sort((a, b) => a.time.localeCompare(b.time)),
    [items, selectedDateKey],
  );

  const pinnedItems = useMemo(
    () => items.filter((i) => i.pinned).slice(0, 4),
    [items],
  );

  function handleToggleOpen() {
    setOpen((prev) => !prev);
  }

  function handlePrevMonth() {
    const newDate = addMonths(currentRefDate, -1);
    setCurrentRefDate(newDate);
  }

  function handleNextMonth() {
    const newDate = addMonths(currentRefDate, 1);
    setCurrentRefDate(newDate);
  }

  function handleSelectDay(date: Date) {
    const key = formatDateKey(date);
    setSelectedDateKey(key);
    setEditId(null);
    setTitle("");
    setDescription("");
    setPinned(false);
    setMode("event");
  }

  function handleClickQuickHour(h: string) {
    setTime(h);
  }

  function handleClickItem(item: CalendarItem) {
    setSelectedDateKey(item.date);
    setEditId(item.id);
    setMode(item.type);
    setTime(item.time);
    setTitle(item.title);
    setDescription(item.description || "");
    setColor(item.color);
    setPinned(item.pinned);
  }

  function handleResetForm() {
    setEditId(null);
    setMode("event");
    setTime("09:00");
    setTitle("");
    setDescription("");
    setColor("indigo");
    setPinned(false);
  }

  function handleSave() {
    if (!title.trim()) return;

    if (editId) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === editId
            ? {
                ...item,
                date: selectedDateKey,
                time,
                type: mode,
                title: title.trim(),
                description: description.trim() || undefined,
                color,
                pinned,
              }
            : item,
        ),
      );
    } else {
      const newItem: CalendarItem = {
        id: `${selectedDateKey}-${time}-${items.length + 1}`,
        date: selectedDateKey,
        time,
        type: mode,
        title: title.trim(),
        description: description.trim() || undefined,
        color,
        pinned,
      };
      setItems((prev) => [...prev, newItem]);
    }

    handleResetForm();
  }

  function handleDelete() {
    if (!editId) return;
    setItems((prev) => prev.filter((i) => i.id !== editId));
    handleResetForm();
  }

  // --- rendu du contenu modal + panneaux, dans un portal ---
  function renderOverlay() {
    if (!open) return null;

    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center">
        {/* fond */}
        <button
          type="button"
          aria-label="Fermer le calendrier"
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />

        {/* bloc principal */}
        <div className="relative z-10 max-h-[90vh] w-[min(900px,100%-2rem)] overflow-hidden rounded-3xl border border-white/10 bg-[#020617] shadow-[0_22px_80px_rgba(15,23,42,0.95)] flex flex-col">
          {/* header */}
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                Temps
              </p>
              <h2 className="text-sm font-semibold text-white">
                Calendrier Infinity
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-white/20 px-4 py-1.5 text-[11px] text-white/80 hover:bg-white/10"
            >
              Fermer
            </button>
          </div>

          {/* corps */}
          <div className="flex flex-1 flex-col gap-4 px-6 py-4 md:flex-row overflow-hidden">
            {/* colonne gauche : calendrier */}
            <div className="flex-1 min-w-0 overflow-y-auto pr-2">
              <div className="mb-3 flex items-center justify-between gap-2 rounded-full border border-white/12 bg-black/60 px-3 py-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="rounded-full px-2 py-1 text-white/70 hover:bg-white/10"
                >
                  ◀
                </button>
                <span className="text-[11px] font-medium text-white/90">
                  {currentMonthLabel}
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="rounded-full px-2 py-1 text-white/70 hover:bg-white/10"
                >
                  ▶
                </button>
              </div>

              <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-white/40">
                {DAYS_SHORT.map((d, idx) => (
                  <div key={`${d}-${idx}`}>{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {matrix.map((cell, i) => {
                  const key = formatDateKey(cell.date);
                  const isSelected = key === selectedDateKey;
                  const dayNumber = cell.date.getDate();
                  const cellItems = items
                    .filter((item) => item.date === key)
                    .sort((a, b) => a.time.localeCompare(b.time))
                    .slice(0, 3);
                  const totalCount = items.filter(
                    (item) => item.date === key,
                  ).length;

                  return (
                    <button
                      key={`${key}-${i}`}
                      type="button"
                      onClick={() => handleSelectDay(cell.date)}
                      className={`flex min-h-[70px] flex-col rounded-xl border px-2 py-1 text-left text-[11px] ${
                        isSelected
                          ? "border-indigo-400 bg-gradient-to-br from-indigo-600/80 to-cyan-500/80 text-white shadow-[0_0_18px_rgba(56,189,248,0.7)]"
                          : cell.inCurrentMonth
                          ? "border-white/10 bg-black/70 text-white/80 hover:border-indigo-400/60"
                          : "border-transparent bg-black/40 text-white/35"
                      }`}
                    >
                      <span className="mb-1 text-[11px] font-medium">
                        {dayNumber}
                      </span>
                      <div className="space-y-[2px]">
                        {cellItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClickItem(item);
                            }}
                            className="flex w-full items-center gap-1 text-left"
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${dotClassesForColor(
                                item.color,
                              )}`}
                            />
                            <span className="line-clamp-1 text-[10px]">
                              {item.time} · {item.title}
                            </span>
                          </button>
                        ))}
                        {cellItems.length < totalCount && (
                          <span className="text-[9px] opacity-70">
                            + autres…
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* colonne droite : détail */}
            <div className="w-full flex-shrink-0 md:w-[280px] overflow-y-auto pl-0 md:pl-2">
              <div className="rounded-2xl border border-white/12 bg-black/80 p-4">
                <p className="text-[11px] text-white/50">Jour sélectionné</p>
                <p className="text-[13px] font-semibold text-white">
                  {selectedDate.getDate()}{" "}
                  {MONTHS_FR[selectedDate.getMonth()]}
                </p>

                {/* Mode */}
                <div className="mt-3 inline-flex items-center rounded-full bg-white/5 p-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setMode("event")}
                    className={`rounded-full px-3 py-1 ${
                      mode === "event"
                        ? "bg-gradient-to-r from-indigo-500 to-cyan-400 text-white shadow-[0_0_12px_rgba(56,189,248,0.6)]"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    Événement
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("task")}
                    className={`rounded-full px-3 py-1 ${
                      mode === "task"
                        ? "bg-gradient-to-r from-indigo-500 to-cyan-400 text-white shadow-[0_0_12px_rgba(56,189,248,0.6)]"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    Tâche
                  </button>
                </div>

                {/* Heure */}
                <div className="mt-3">
                  <p className="mb-1 text-[11px] text-white/50">Heure</p>
                  <div className="flex items-center gap-3">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-black/70">
                      <input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="w-[60px] rounded-full bg-transparent text-center text-[11px] text-white outline-none"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {HOURS.map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => handleClickQuickHour(h)}
                          className={`rounded-full border px-2 py-[3px] text-[10px] ${
                            time === h
                              ? "border-indigo-400 bg-indigo-600/80 text-white"
                              : "border-white/20 text-white/60 hover:border-indigo-400/70"
                          }`}
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Couleur */}
                <div className="mt-3">
                  <p className="mb-1 text-[11px] text-white/50">Couleur</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(["indigo", "cyan", "rose"] as CalendarItem["color"][]).map(
                      (c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColor(c)}
                          className={`flex items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] ${
                            color === c
                              ? "border-white/80 bg-white/10 text-white"
                              : "border-white/20 text-white/60 hover:border-white/60"
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${dotClassesForColor(
                              c,
                            )}`}
                          />
                          <span>
                            {c === "indigo" && "Indigo"}
                            {c === "cyan" && "Cyan"}
                            {c === "rose" && "Rose"}
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                </div>

                {/* Titre + description */}
                <div className="mt-3 space-y-2">
                  <div>
                    <p className="mb-1 text-[11px] text-white/50">
                      Titre{" "}
                      {mode === "event" ? "de l’événement" : "de la tâche"}
                    </p>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full rounded-xl border border-white/20 bg-black px-3 py-1.5 text-[11px] text-white outline-none placeholder:text-white/35"
                      placeholder="Ex : Appel client, entraînement…"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] text-white/50">
                      Description
                    </p>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      className="w-full resize-none rounded-xl border border-white/20 bg-black px-3 py-1.5 text-[11px] text-white outline-none placeholder:text-white/35"
                      placeholder="Optionnel : lieu, lien visio, notes…"
                    />
                  </div>
                </div>

                {/* Épingler */}
                <label className="mt-2 inline-flex items-center gap-2 text-[11px] text-white/65">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(e) => setPinned(e.target.checked)}
                    className="h-3 w-3 rounded border border-white/40 bg-transparent"
                  />
                  <span>Épingler sur le dashboard</span>
                </label>

                {/* Actions */}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    className="flex-1 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_0_18px_rgba(56,189,248,0.6)]"
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
                      className="rounded-full border border-rose-400 px-3 py-1.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/10"
                    >
                      Supprimer
                    </button>
                  )}
                </div>

                {/* Liste du jour */}
                {itemsForSelectedDate.length > 0 && (
                  <div className="mt-3 max-h-28 space-y-1 overflow-y-auto pr-1">
                    <p className="mb-1 text-[11px] text-white/50">
                      {itemsForSelectedDate.length} élément(s) ce jour
                    </p>
                    {itemsForSelectedDate.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleClickItem(item)}
                        className="flex w-full items-start gap-2 rounded-lg border border-white/15 bg-black px-2 py-1 text-left text-[11px] text-white"
                      >
                        <span
                          className={`mt-[3px] h-1.5 w-1.5 rounded-full ${dotClassesForColor(
                            item.color,
                          )}`}
                        />
                        <div className="flex-1">
                          <p className="font-medium">
                            {item.time} · {item.title}
                          </p>
                          {item.description && (
                            <p className="text-[10px] text-white/60">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- rendu principal ---
  return (
    <>
      {/* bouton dans le dock */}
      <button
        type="button"
        aria-label="Calendrier Infinity"
        onClick={handleToggleOpen}
        className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black/40 shadow-[0_0_25px_rgba(80,140,255,0.4)] backdrop-blur-md transition-all hover:shadow-[0_0_40px_rgba(105,160,255,0.7)] active:scale-95"
      >
        <div className="relative h-11 w-11 rounded-2xl p-[6px]">
          <div className="absolute inset-0 rounded-2xl border border-white/10" />
          <div className="absolute inset-[2px] rounded-2xl border border-white/5" />
          <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_center,rgba(90,150,255,0.25),transparent_70%)] blur-[12px]" />
          <div className="relative flex h-full w-full items-center justify-center">
            <div className="relative h-[22px] w-[22px]">
              <div className="absolute inset-x-0 top-0 h-[5px] rounded-t-[5px] bg-gradient-to-r from-sky-400 to-indigo-500" />
              <div className="absolute left-[3px] top-[-3px] h-[4px] w-[3px] rounded-md border border-white/40 bg-black" />
              <div className="absolute right-[3px] top-[-3px] h-[4px] w-[3px] rounded-md border border-white/40 bg-black" />
              <div className="absolute inset-x-[3px] top-[7px] bottom-[3px] grid grid-cols-3 grid-rows-3 gap-[2px]">
                {Array.from({ length: 9 }).map((_, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <div
                    key={i}
                    className="rounded-[3px] bg-white/35 shadow-[0_0_5px_rgba(255,255,255,0.5)]"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </button>

      {/* panneaux + modal rendus dans le body pour éviter le clipping */}
      {mounted &&
        createPortal(
          <>
            {pinnedItems.length > 0 && (
              <div className="fixed left-6 bottom-28 z-[998] flex w-64 flex-col gap-2 rounded-2xl border border-white/10 bg-[#020617]/95 px-3 py-3 text-xs shadow-[0_18px_45px_rgba(15,23,42,0.9)]">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-white/90">
                    Épinglés
                  </p>
                  <span className="rounded-full bg-white/5 px-2 py-[1px] text-[10px] text-white/70">
                    {pinnedItems.length}
                  </span>
                </div>
                <div className="flex max-h-40 flex-col gap-2 overflow-y-auto pr-1">
                  {pinnedItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setOpen(true);
                        handleClickItem(item);
                      }}
                      className={`flex items-start gap-2 rounded-xl px-2 py-1.5 text-left ${badgeClassesForColor(
                        item.color,
                      )}`}
                    >
                      <div className="mt-[2px] h-1.5 w-1.5 rounded-full bg-white/80" />
                      <div className="flex-1">
                        <p className="text-[11px] font-semibold leading-tight">
                          {item.time} · {item.title}
                        </p>
                        {item.description && (
                          <p className="mt-[1px] line-clamp-1 text-[10px] opacity-90">
                            {item.description}
                          </p>
                        )}
                        <p className="mt-[1px] text-[10px] opacity-80">
                          {formatDateKey(parseDateKey(item.date)).slice(8, 10)} ·{" "}
                          {item.type === "event" ? "Événement" : "Tâche"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {renderOverlay()}
          </>,
          document.body,
        )}
    </>
  );
}