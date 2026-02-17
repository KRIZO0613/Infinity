import { useEffect, useMemo, useRef, useState } from "react";

import {
  searchExternalClubs,
  type ExternalClub,
} from "@/lib/api/externalClubs";

export type FriendlyMatchAssistantModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onContinue: (data: { clubB: string; date: string; time: string }) => void;
};

const pad2 = (value: number) => value.toString().padStart(2, "0");

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

type ClubComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  showCheck?: boolean;
  placeholder?: string;
};

function ClubCombobox({
  value,
  onChange,
  showCheck,
  placeholder,
}: ClubComboboxProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<ExternalClub[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const trimmedQuery = query.trim();
  const hasMinChars = trimmedQuery.length >= 2;

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open) return;
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let active = true;
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchExternalClubs(trimmed);
        if (!active) return;
        setResults(data);
      } catch (error) {
        if (
          (error instanceof DOMException && error.name === "AbortError") ||
          (error instanceof Error && error.name === "AbortError") ||
          (typeof error === "object" &&
            error &&
            "message" in error &&
            String((error as { message?: string }).message)
              .toLowerCase()
              .includes("aborted"))
        ) {
          return;
        }
        console.error("Erreur recherche clubs externes:", error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }, 250);
    return () => {
      active = false;
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [query, open]);

  const handleSelect = (club: ExternalClub) => {
    onChange(club.name);
    setQuery(club.name);
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-60 blur-[12px]"
        />
        <input
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
          placeholder={placeholder ?? "Saisir le club adverse"}
          className={`relative z-10 mt-2.5 w-full rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-2 pr-9 text-xs text-white/90 placeholder:text-slate-200 shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus:ring-1 focus:ring-violet-400/50 focus:animate-[friendlyBreath_2.8s_ease-in-out_infinite] focus:bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)] ${
            showCheck
              ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)]"
              : ""
          }`}
        />
        {showCheck ? (
          <span className="pointer-events-none absolute right-3 top-[58%] h-2 w-2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
        ) : null}
      </div>
      {open ? (
        <div className="absolute left-0 right-0 z-20 mt-2 max-h-56 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/90 p-2 shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
          {loading ? (
            <p className="px-3 py-2 text-xs text-slate-400">
              Recherche en cours…
            </p>
          ) : null}

          {!loading && results.length === 0 ? (
            hasMinChars ? (
              <p className="px-3 py-2 text-xs text-slate-400">
                Aucun club ne correspond à cette recherche.
              </p>
            ) : (
              <p className="px-3 py-2 text-xs text-slate-400">
                Tape au moins 2 lettres pour rechercher un club.
              </p>
            )
          ) : null}

          {results.length > 0 ? (
            <div className="space-y-1">
              {results.map((club) => (
                <button
                  key={club.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(club)}
                  className="flex w-full flex-col rounded-xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/5"
                >
                  <span className="font-semibold">{club.name}</span>
                  <span className="text-xs text-slate-400">
                    {[club.city, club.district].filter(Boolean).join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function FriendlyMatchAssistantModal({
  isOpen,
  onClose,
  onContinue,
}: FriendlyMatchAssistantModalProps) {
  const [matchType, setMatchType] = useState<"club" | "external">("external");
  const [clubB, setClubB] = useState("");
  const [date, setDate] = useState("");
  const [hour, setHour] = useState("18");
  const [minute, setMinute] = useState("00");
  const [timeTouched, setTimeTouched] = useState(false);
  const hourInputRef = useRef<HTMLInputElement | null>(null);
  const minuteInputRef = useRef<HTMLInputElement | null>(null);
  const timeHoldIntervalRef = useRef<number | null>(null);
  const [holdDelta, setHoldDelta] = useState<number | null>(null);
  const hourBufferRef = useRef("");
  const minuteBufferRef = useRef("");
  const timeRef = useRef("18:00");

  useEffect(() => {
    if (!isOpen) return;
    setMatchType("external");
    setClubB("");
    setDate("");
    setHour("18");
    setMinute("00");
    hourBufferRef.current = "18";
    minuteBufferRef.current = "00";
    timeRef.current = "18:00";
    setTimeTouched(false);
  }, [isOpen]);

  useEffect(() => {
    setClubB("");
  }, [matchType]);

  const timeValue = useMemo(
    () => `${pad2(Number(hour) || 0)}:${pad2(Number(minute) || 0)}`,
    [hour, minute],
  );
  const clubValid = clubB.trim().length >= 2;
  const dateValid = Boolean(date);
  const timeValid =
    timeTouched && hour.length === 2 && minute.length === 2;

  const normalizeHour = (value: string) => {
    const parsed = clamp(Number(value || 0), 0, 23);
    return pad2(Math.floor(parsed));
  };

  const normalizeMinute = (value: string) => {
    const parsed = clamp(Number(value || 0), 0, 59);
    return pad2(Math.floor(parsed));
  };

  useEffect(() => {
    timeRef.current = `${pad2(Number(hour) || 0)}:${pad2(
      Number(minute) || 0,
    )}`;
  }, [hour, minute]);

  const shiftTimeBy = (deltaMinutes: number) => {
    const [hourValue, minuteValue] = timeRef.current.split(":");
    const hourNumber = Number(hourValue);
    const minuteNumber = Number(minuteValue);
    if (Number.isNaN(hourNumber) || Number.isNaN(minuteNumber)) return;
    const total = (hourNumber * 60 + minuteNumber + deltaMinutes + 1440) % 1440;
    const nextHour = Math.floor(total / 60);
    const nextMinute = total % 60;
    const nextHourValue = pad2(nextHour);
    const nextMinuteValue = pad2(nextMinute);
    setHour(nextHourValue);
    setMinute(nextMinuteValue);
    hourBufferRef.current = nextHourValue;
    minuteBufferRef.current = nextMinuteValue;
    setTimeTouched(true);
  };

  useEffect(() => {
    if (holdDelta === null) {
      if (timeHoldIntervalRef.current) {
        window.clearInterval(timeHoldIntervalRef.current);
        timeHoldIntervalRef.current = null;
      }
      return;
    }
    shiftTimeBy(holdDelta);
    timeHoldIntervalRef.current = window.setInterval(() => {
      shiftTimeBy(holdDelta);
    }, 140);
    return () => {
      if (timeHoldIntervalRef.current) {
        window.clearInterval(timeHoldIntervalRef.current);
        timeHoldIntervalRef.current = null;
      }
    };
  }, [holdDelta]);

  useEffect(() => {
    return () => {
      if (timeHoldIntervalRef.current) {
        window.clearInterval(timeHoldIntervalRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative w-full max-w-xl rounded-3xl border border-white/12 bg-black/30 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-[32px] backdrop-saturate-200 md:p-5"
        onClick={(event) => event.stopPropagation()}
        role="presentation"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition hover:text-white"
          aria-label="Fermer"
        >
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
        <div>
          <h2 className="text-lg font-semibold text-slate-50 md:text-xl">
            Créer un match amical
          </h2>
          <span className="mt-2 block h-px w-16 bg-violet-400/70" />
        </div>

        <div className="mt-6 space-y-4 text-center">
          <div>
            <label className="flex items-center justify-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[#f2f0ff] drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]">
              Type de match
            </label>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {[
                { value: "club", label: "Match du club" },
                { value: "external", label: "Match contre un autre club" },
              ].map((option) => {
                const active = matchType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setMatchType(option.value as "club" | "external")
                    }
                    className={`rounded-full border px-4 py-1 text-[10px] uppercase tracking-[0.18em] transition ${
                      active
                        ? "border-violet-400/60 bg-white/10 text-white"
                        : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="flex items-center justify-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[#f2f0ff] drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]">
              <img
                src="/icons/VSAmic.png"
                alt=""
                className="h-[36px] w-[36px] opacity-80"
              />
              {matchType === "club" ? "Équipe du club" : "Équipe adverse"}
            </label>
            {matchType === "external" ? (
              <ClubCombobox
                value={clubB}
                onChange={setClubB}
                showCheck={clubValid}
                placeholder="Saisir le club adverse"
              />
            ) : (
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-60 blur-[12px]"
                />
                <input
                  type="text"
                  value={clubB}
                  onChange={(event) => setClubB(event.target.value)}
                  placeholder="Nom de l'équipe du club"
                  className={`relative z-10 mt-2.5 w-full rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-2 pr-9 text-xs text-white/90 placeholder:text-slate-200 shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus:ring-1 focus:ring-violet-400/50 focus:animate-[friendlyBreath_2.8s_ease-in-out_infinite] focus:bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)] ${
                    clubValid
                      ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)]"
                      : ""
                  }`}
                />
                {clubValid ? (
                  <span className="pointer-events-none absolute right-3 top-[58%] h-2 w-2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
                ) : null}
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center justify-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[#f2f0ff] drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]">
              <img
                src="/icons/Calendrieramic.png"
                alt=""
                className="h-[36px] w-[36px] opacity-80"
              />
              Date
            </label>
            <div className="relative mt-2.5">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-60 blur-[12px]"
              />
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className={`relative z-10 w-full rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-2 pr-9 text-xs text-[#f2f0ff] shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus:ring-1 focus:ring-violet-400/50 focus:animate-[friendlyBreath_2.8s_ease-in-out_infinite] focus:bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)] [color-scheme:dark] [&::-webkit-datetime-edit]:text-[#f2f0ff] [&::-webkit-datetime-edit-text]:text-white/70 [&::-webkit-datetime-edit-fields-wrapper]:text-[#f2f0ff] [&::-webkit-calendar-picker-indicator]:opacity-60 ${
                  dateValid
                    ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)]"
                    : ""
                }`}
              />
              {dateValid ? (
                <span className="pointer-events-none absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
              ) : null}
            </div>
          </div>

          <div>
            <label className="flex items-center justify-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[#f2f0ff] drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]">
              <img
                src="/icons/horlogeam.png"
                alt=""
                className="h-[36px] w-[36px] opacity-80"
              />
              Heure
            </label>
            <div className="mt-2.5 flex justify-center">
              <div
                className={`relative inline-flex items-center gap-2 rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-1.5 pr-8 shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus-within:animate-[friendlyBreath_2.8s_ease-in-out_infinite] focus-within:bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)] ${
                  timeValid
                    ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)]"
                    : ""
                }`}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-55 blur-[12px]"
                />
                <div className="flex flex-col">
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setHoldDelta(15);
                    }}
                    onMouseUp={() => setHoldDelta(null)}
                    onMouseLeave={() => setHoldDelta(null)}
                    onTouchStart={(event) => {
                      event.preventDefault();
                      setHoldDelta(15);
                    }}
                    onTouchEnd={() => setHoldDelta(null)}
                    onTouchCancel={() => setHoldDelta(null)}
                    className="rounded-t-lg bg-transparent px-1.5 py-0.5 text-[9px] text-slate-400 transition hover:text-slate-100"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setHoldDelta(-15);
                    }}
                    onMouseUp={() => setHoldDelta(null)}
                    onMouseLeave={() => setHoldDelta(null)}
                    onTouchStart={(event) => {
                      event.preventDefault();
                      setHoldDelta(-15);
                    }}
                    onTouchEnd={() => setHoldDelta(null)}
                    onTouchCancel={() => setHoldDelta(null)}
                    className="rounded-b-lg bg-transparent px-1.5 py-0.5 text-[9px] text-slate-400 transition hover:text-slate-100"
                  >
                    ▼
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={hourInputRef}
                    inputMode="numeric"
                    value={hour}
                    onChange={() => {}}
                    onFocus={(event) => {
                      hourBufferRef.current = "";
                      event.currentTarget.select();
                    }}
                    onKeyDown={(event) => {
                      if (event.key >= "0" && event.key <= "9") {
                        event.preventDefault();
                        if (hourBufferRef.current.length >= 2) {
                          hourBufferRef.current = "";
                        }
                        const next = (hourBufferRef.current + event.key).slice(
                          0,
                          2,
                        );
                        hourBufferRef.current = next;
                        setHour(next);
                        setTimeTouched(true);
                        if (next.length === 2) {
                          minuteBufferRef.current = "";
                          setMinute("");
                          minuteInputRef.current?.focus();
                        }
                        return;
                      }
                      if (event.key === "Backspace") {
                        event.preventDefault();
                        hourBufferRef.current = hourBufferRef.current.slice(
                          0,
                          -1,
                        );
                      setHour(hourBufferRef.current);
                      setTimeTouched(true);
                      }
                    }}
                    onBlur={() => {
                      const nextHour = normalizeHour(
                        hourBufferRef.current || hour,
                      );
                      setHour(nextHour);
                      hourBufferRef.current = nextHour;
                      if (minuteInputRef.current === document.activeElement) {
                        return;
                      }
                      const nextMinute = normalizeMinute(
                        minuteBufferRef.current || minute,
                      );
                      setMinute(nextMinute);
                      minuteBufferRef.current = nextMinute;
                    }}
                    className="w-9 rounded-xl bg-transparent px-1.5 py-0.5 text-center text-sm text-white/95 drop-shadow-[0_1px_0_#1f1235] transition focus:ring-1 focus:ring-violet-400/50"
                  />
                  <span className="text-slate-500">:</span>
                  <input
                    ref={minuteInputRef}
                    inputMode="numeric"
                    value={minute}
                    onChange={() => {}}
                    onFocus={(event) => {
                      minuteBufferRef.current = "";
                      event.currentTarget.select();
                    }}
                    onKeyDown={(event) => {
                      if (event.key >= "0" && event.key <= "9") {
                        event.preventDefault();
                        if (minuteBufferRef.current.length >= 2) {
                          minuteBufferRef.current = "";
                        }
                        const next = (minuteBufferRef.current + event.key).slice(
                          0,
                          2,
                        );
                        minuteBufferRef.current = next;
                      setMinute(next);
                      setTimeTouched(true);
                        return;
                      }
                      if (event.key === "Backspace") {
                        event.preventDefault();
                        minuteBufferRef.current = minuteBufferRef.current.slice(
                          0,
                          -1,
                        );
                      setMinute(minuteBufferRef.current);
                      setTimeTouched(true);
                      }
                    }}
                    onBlur={() => {
                      const nextHour = normalizeHour(
                        hourBufferRef.current || hour,
                      );
                      const nextMinute = normalizeMinute(
                        minuteBufferRef.current || minute,
                      );
                      setHour(nextHour);
                      setMinute(nextMinute);
                      hourBufferRef.current = nextHour;
                      minuteBufferRef.current = nextMinute;
                    }}
                    className="w-9 rounded-xl bg-transparent px-1.5 py-0.5 text-center text-sm text-white/95 drop-shadow-[0_1px_0_#1f1235] transition focus:ring-1 focus:ring-violet-400/50"
                  />
                </div>
                {timeValid ? (
                  <span className="pointer-events-none absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-white/5 pt-6">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() =>
                onContinue({
                  clubB,
                  date,
                  time: timeValue,
                })
              }
              className="rounded-full bg-violet-600 px-4 py-2 text-xs font-medium text-white shadow-[0_8px_22px_rgba(0,0,0,0.35)] transition hover:bg-violet-500 active:scale-95"
            >
              Créer le match
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FriendlyMatchAssistantModal;
