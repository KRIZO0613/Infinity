"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabaseClient";
import {
  buildTeamNameAliases,
  formatTeamDisplayName,
} from "@/lib/teamProfile";
import {
  searchExternalClubs,
  type ExternalClub,
} from "@/lib/api/externalClubs";

type MatchStatus = "draft" | "in_progress" | "finished";

type PlateauMatch = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  time: string;
  status?: MatchStatus;
  score?: string;
  scorers?: Record<string, number>;
  assists?: Record<string, number>;
  motmId?: string | null;
  needsBoost?: Record<string, boolean>;
};

type PlateauDay = {
  id: string;
  name: string;
  date: string;
  time: string;
  teams: string[];
  matches: PlateauMatch[];
};

type PlateauStorageData = {
  plateau?: PlateauDay[];
  [key: string]: unknown;
};

type TeamInfo = {
  name: string | null;
  category: string | null;
  level: string | null;
  clubName: string | null;
  squadNumber: number | null;
};

type PlayerLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
};

type PlayerLiteField = {
  id?: string | null;
  label?: string | null;
  type?: string | null;
  value?: string | null;
  order?: number | null;
  active?: boolean | null;
};

type PlateauTabProps = {
  teamId: string;
};

type PlateauDraft = {
  date: string;
  time: string;
  teams: Array<{ id: string; name: string; locked?: boolean }>;
  matches: Array<{
    id: string;
    homeTeam: string;
    awayTeam: string;
    time: string;
  }>;
};

type PlateauDetails = {
  dayId: string;
  match: PlateauMatch;
};

const buildId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const pad2 = (value: number) => value.toString().padStart(2, "0");

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const buildRoundRobinMatches = (
  teams: Array<{ name: string }>,
  time: string,
) => {
  const names = teams.map((team) => team.name).filter(Boolean);
  const matches: PlateauDraft["matches"] = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      matches.push({
        id: buildId(),
        homeTeam: names[i],
        awayTeam: names[j],
        time: time || "10:00",
      });
    }
  }
  return matches;
};

const formatShortDate = (date: string) => {
  if (!date) return "";
  const parsed = new Date(date);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
};

const buildMatchDateTime = (dayDate: string, matchTime?: string | null) => {
  if (!dayDate) return null;
  const datePart = dayDate.split("T")[0] ?? dayDate;
  const base = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  if (!matchTime) {
    base.setHours(23, 59, 0, 0);
    return base;
  }
  const [hourValue, minuteValue] = matchTime.split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    base.setHours(23, 59, 0, 0);
    return base;
  }
  base.setHours(hour, minute, 0, 0);
  return base;
};

type TeamSearchDropdownProps = {
  onSelect: (selection: { name: string; id: string | null }) => void;
  showCheck?: boolean;
};

function TeamSearchDropdown({ onSelect, showCheck }: TeamSearchDropdownProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalClub[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const trimmedQuery = query.trim();
  const hasMinChars = trimmedQuery.length >= 2;

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
        const err = error as { name?: string; message?: string } | null;
        const name = err?.name ?? "";
        const message = String(err?.message ?? "");
        if (name === "AbortError" || message.toLowerCase().includes("aborted")) {
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

  const handleSelect = (club: { name: string; id: string | null }) => {
    onSelect(club);
    setQuery("");
    setOpen(true);
    inputRef.current?.focus();
  };

  return (
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
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        placeholder="Rechercher un club…"
        className={`relative z-10 mt-2.5 w-full rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-2 pr-9 text-xs text-white/90 placeholder:text-slate-200 shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus:ring-1 focus:ring-violet-400/50 focus:animate-[friendlyBreath_2.8s_ease-in-out_infinite] focus:bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)] ${
          showCheck
            ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)]"
            : ""
        }`}
        ref={inputRef}
      />
      {showCheck ? (
        <span className="pointer-events-none absolute right-3 top-[58%] h-2 w-2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
      ) : null}

      {open ? (
        <div className="absolute left-0 right-0 z-20 mt-2 max-h-56 overflow-y-auto rounded-2xl border border-white/10 bg-[#0f111b] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
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

          <div className="space-y-1">
            {results.map((club) => (
              <button
                key={club.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect({ name: club.name, id: club.id })}
                className="flex w-full flex-col rounded-xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/5"
              >
                <span className="font-semibold">{club.name}</span>
                <span className="text-xs text-slate-400">
                  {[club.city, club.district].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function PlateauTab({ teamId }: PlateauTabProps) {
  const [teamInfo, setTeamInfo] = useState<TeamInfo>({
    name: null,
    category: null,
    level: null,
    clubName: null,
    squadNumber: null,
  });
  const [players, setPlayers] = useState<PlayerLite[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [plateauDays, setPlateauDays] = useState<PlateauDay[]>([]);
  const [storageData, setStorageData] = useState<PlateauStorageData>({});
  const [wizardOpen, setWizardOpen] = useState(false);
  const [draft, setDraft] = useState<PlateauDraft | null>(null);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [hour, setHour] = useState("10");
  const [minute, setMinute] = useState("00");
  const [timeTouched, setTimeTouched] = useState(false);
  const hourInputRef = useRef<HTMLInputElement | null>(null);
  const minuteInputRef = useRef<HTMLInputElement | null>(null);
  const timeHoldIntervalRef = useRef<number | null>(null);
  const [holdDelta, setHoldDelta] = useState<number | null>(null);
  const hourBufferRef = useRef("");
  const minuteBufferRef = useRef("");
  const timeRef = useRef("10:00");
  const [details, setDetails] = useState<PlateauDetails | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [plateauTab, setPlateauTab] = useState<"upcoming" | "past">(
    "upcoming",
  );
  const [scoreDraft, setScoreDraft] = useState<{
    home: string;
    away: string;
  } | null>(null);
  const [scorers, setScorers] = useState<Record<string, number>>({});
  const [assists, setAssists] = useState<Record<string, number>>({});
  const [motmId, setMotmId] = useState<string | null>(null);
  const [needsBoost, setNeedsBoost] = useState<Record<string, boolean>>({});
  const [scorersOpen, setScorersOpen] = useState(false);
  const [assistsOpen, setAssistsOpen] = useState(false);
  const [motmOpen, setMotmOpen] = useState(false);
  const [needsBoostOpen, setNeedsBoostOpen] = useState(false);
  const scorersRef = useRef<HTMLDivElement | null>(null);
  const assistsRef = useRef<HTMLDivElement | null>(null);
  const motmRef = useRef<HTMLDivElement | null>(null);
  const needsBoostRef = useRef<HTMLDivElement | null>(null);
  const sectionMenuRef = useRef<HTMLDivElement | null>(null);

  const teamDisplayName = useMemo(() => {
    return formatTeamDisplayName({
      clubName: teamInfo.clubName,
      name: teamInfo.name ?? teamInfo.category,
      category: teamInfo.category,
      squadNumber: teamInfo.squadNumber,
      fallback: "Mon équipe",
    });
  }, [teamInfo]);

  const localTeamAliases = useMemo(() => {
    return buildTeamNameAliases({
      clubName: teamInfo.clubName,
      name: teamInfo.name,
      category: teamInfo.category,
      squadNumber: teamInfo.squadNumber,
      fallback: "Mon équipe",
    }).map((value) => value.toLowerCase());
  }, [teamInfo]);

  const isLocalTeamName = (name: string) => {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return false;
    return localTeamAliases.includes(normalized);
  };

  const parseScore = useCallback((score?: string) => {
    if (!score) return null;
    const match = score.match(/(\d+)\s*-\s*(\d+)/);
    if (!match) return null;
    return {
      home: Number(match[1]),
      away: Number(match[2]),
    };
  }, []);

  const normalizeFieldLabel = (value: string | null | undefined) => {
    return (value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "");
  };

  const upsertStatField = (
    fields: PlayerLiteField[],
    label: string,
    value: number,
  ) => {
    const normalized = normalizeFieldLabel(label);
    const nextFields = [...fields];
    const existingIndex = nextFields.findIndex(
      (field) => normalizeFieldLabel(field.label) === normalized,
    );
    if (existingIndex >= 0) {
      const existing = nextFields[existingIndex];
      nextFields[existingIndex] = {
        ...existing,
        label: existing.label ?? label,
        type: existing.type ?? "number",
        value: String(value),
        active: existing.active !== false,
      };
      return nextFields;
    }
    return [
      ...nextFields,
      {
        id: buildId(),
        label,
        type: "number",
        value: String(value),
        order: nextFields.length + 1,
        active: true,
      },
    ];
  };

  const timeValue = useMemo(
    () => `${pad2(Number(hour) || 0)}:${pad2(Number(minute) || 0)}`,
    [hour, minute],
  );

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
    const total =
      (hourNumber * 60 + minuteNumber + deltaMinutes + 1440) % 1440;
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

  useEffect(() => {
    let cancelled = false;

    async function loadTeamInfo() {
      if (!teamId) return;
      const { data, error } = await supabase
        .from("teams")
        .select("name,category,club_id,squad_number")
        .eq("id", teamId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error("Erreur chargement équipe:", error.message ?? error);
        return;
      }

      let clubName: string | null = null;
      if (data?.club_id) {
        const { data: clubData } = await supabase
          .from("clubs")
          .select("name")
          .eq("id", data.club_id)
          .maybeSingle();
        clubName = clubData?.name ?? null;
      }

      setTeamInfo({
        name: data?.name ?? null,
        category: data?.category ?? null,
        level: null,
        clubName,
        squadNumber: data?.squad_number ?? null,
      });
    }

    loadTeamInfo();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      if (!teamId) return;
      setPlayersLoading(true);
      const { data, error } = await supabase
        .from("players")
        .select("id,first_name,last_name,photo_url")
        .eq("team_id", teamId)
        .order("last_name", { ascending: true });

      if (cancelled) return;
      if (error) {
        console.error("Erreur chargement joueurs:", error.message ?? error);
        setPlayersLoading(false);
        return;
      }

      setPlayers((data ?? []) as PlayerLite[]);
      setPlayersLoading(false);
    }

    loadPlayers();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlateau() {
      if (!teamId) return;
      const { data, error } = await supabase
        .from("championships")
        .select("data")
        .eq("team_id", teamId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error("Erreur chargement plateau:", error.message ?? error);
        return;
      }

      const stored = (data?.data ?? {}) as PlateauStorageData;
      const storedDays = Array.isArray(stored?.plateau)
        ? (stored?.plateau as PlateauDay[])
        : [];
      setStorageData(stored);
      setPlateauDays(storedDays);
    }

    loadPlateau();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  useEffect(() => {
    if (!details) return;
    const parsed = parseScore(details.match.score);
    if (parsed) {
      setScoreDraft({
        home: String(parsed.home),
        away: String(parsed.away),
      });
    } else {
      setScoreDraft({ home: "", away: "" });
    }
    setScorers(details.match.scorers ?? {});
    setAssists(details.match.assists ?? {});
    setMotmId(details.match.motmId ?? null);
    setNeedsBoost(details.match.needsBoost ?? {});
  }, [details, parseScore]);

  useEffect(() => {
    if (!details) return;
    if (!scoreDraft) return;
    if (details.match.score && scoreDraft.home === "0" && scoreDraft.away === "0") {
      setScoreDraft({ home: "", away: "" });
    }
  }, [details, scoreDraft]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!scorersOpen && !assistsOpen && !motmOpen && !needsBoostOpen) {
        return;
      }
      const target = event.target as Node;
      if (
        (scorersOpen && scorersRef.current?.contains(target)) ||
        (assistsOpen && assistsRef.current?.contains(target)) ||
        (motmOpen && motmRef.current?.contains(target)) ||
        (needsBoostOpen && needsBoostRef.current?.contains(target))
      ) {
        return;
      }
      setScorersOpen(false);
      setAssistsOpen(false);
      setMotmOpen(false);
      setNeedsBoostOpen(false);
    };
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("mousedown", handleClick);
    };
  }, [scorersOpen, assistsOpen, motmOpen, needsBoostOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: Event) => {
      const target = event.target as Node;
      if (
        sectionMenuRef.current &&
        !sectionMenuRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleClick);
    return () => {
      document.removeEventListener("pointerdown", handleClick);
    };
  }, [menuOpen]);

  const roster = useMemo(() => {
    return players.map((player) => ({
      id: player.id,
      label:
        `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() ||
        "Joueur",
      photoUrl: player.photo_url ?? null,
    }));
  }, [players]);

  const rosterById = useMemo(() => {
    return roster.reduce<
      Record<string, { label: string; photoUrl?: string | null }>
    >((acc, player) => {
      acc[player.id] = {
        label: player.label,
        photoUrl: player.photoUrl ?? null,
      };
      return acc;
    }, {});
  }, [roster]);

  const needsBoostLabel = useMemo(() => {
    const names = Object.keys(needsBoost)
      .map((playerId) => rosterById[playerId]?.label ?? playerId)
      .filter(Boolean);
    if (!names.length) return "Joueur en difficulté";
    if (names.length === 1) return names[0];
    return `${names[0]} +${names.length - 1}`;
  }, [needsBoost, rosterById]);

  const toggleStatSelection = (
    setter: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    >,
    playerId: string,
  ) => {
    setter((prev) => {
      const next = { ...prev };
      if (next[playerId]) {
        delete next[playerId];
      } else {
        next[playerId] = 1;
      }
      return next;
    });
  };

  const toggleSelection = (
    setter: React.Dispatch<
      React.SetStateAction<Record<string, boolean>>
    >,
    playerId: string,
  ) => {
    setter((prev) => {
      const next = { ...prev };
      if (next[playerId]) {
        delete next[playerId];
      } else {
        next[playerId] = true;
      }
      return next;
    });
  };

  const setStatValue = (
    setter: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    >,
    playerId: string,
    rawValue: string,
  ) => {
    const parsed = Number.parseInt(rawValue, 10);
    const nextValue = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    setter((prev) => {
      const next = { ...prev };
      if (nextValue <= 0) {
        delete next[playerId];
        return next;
      }
      next[playerId] = nextValue;
      return next;
    });
  };

  const bumpScore = useCallback(
    (side: "home" | "away", delta: number) => {
      setScoreDraft((prev) => {
        const currentRaw = prev?.[side] ?? "0";
        const current = Number.parseInt(currentRaw || "0", 10) || 0;
        const nextValue = Math.max(0, current + delta);
        return {
          ...(prev ?? { home: "", away: "" }),
          [side]: String(nextValue),
        };
      });
    },
    [],
  );

  const persistPlateau = async (nextDays: PlateauDay[]) => {
    if (!teamId) return false;
    const payload = {
      team_id: teamId,
      data: {
        ...storageData,
        plateau: nextDays,
      },
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("championships")
      .upsert(payload, { onConflict: "team_id" })
      .select("data")
      .maybeSingle();
    if (error) {
      console.error("Erreur sauvegarde plateau:", error.message ?? error);
      return false;
    }
    setStorageData((data?.data ?? payload.data) as PlateauStorageData);
    setPlateauDays(nextDays);
    return true;
  };

  const handleDeleteAllPlateau = async () => {
    setMenuOpen(false);
    const confirmed = window.confirm(
      "Supprimer tous les plateaux ? Cette action est définitive.",
    );
    if (!confirmed) return;
    const saved = await persistPlateau([]);
    if (saved) {
      await applyPlateauPlayerStats([]);
    }
  };

  const applyPlateauPlayerStats = async (nextDays: PlateauDay[]) => {
    if (!players.length) return;
    const totals = nextDays.reduce(
      (acc, day) => {
        day.matches.forEach((match) => {
          if (match.status !== "finished") return;
          if (!isLocalTeamName(match.homeTeam) && !isLocalTeamName(match.awayTeam)) {
            return;
          }
          const scorers = match.scorers ?? {};
          const assists = match.assists ?? {};
          Object.entries(scorers).forEach(([playerId, value]) => {
            acc.goals[playerId] = (acc.goals[playerId] ?? 0) + value;
          });
          Object.entries(assists).forEach(([playerId, value]) => {
            acc.assists[playerId] = (acc.assists[playerId] ?? 0) + value;
          });
        });
        return acc;
      },
      { goals: {} as Record<string, number>, assists: {} as Record<string, number> },
    );

    const playerIds = players.map((player) => player.id);
    if (!playerIds.length) return;
    const { data, error } = await supabase
      .from("players")
      .select("id,custom_fields")
      .in("id", playerIds);
    if (error) {
      console.error(
        "Erreur mise à jour stats joueurs:",
        error.message ?? error,
      );
      return;
    }

    const getStatFieldValue = (
      fields: PlayerLiteField[],
      labels: string[],
    ) => {
      const normalizedLabels = labels.map(normalizeFieldLabel);
      const field = fields.find((item) =>
        normalizedLabels.includes(normalizeFieldLabel(item.label ?? "")),
      );
      const parsed = Number.parseInt(String(field?.value ?? "0"), 10);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const updates = (data ?? []).map((player) => {
      const fields = Array.isArray(player.custom_fields)
        ? (player.custom_fields as PlayerLiteField[])
        : [];
      const champGoals = getStatFieldValue(fields, [
        "buts championnat",
        "buts champ",
      ]);
      const champAssists = getStatFieldValue(fields, [
        "passes d championnat",
        "passes championnat",
      ]);
      const friendlyGoals = getStatFieldValue(fields, [
        "buts amical",
        "buts amicaux",
      ]);
      const friendlyAssists = getStatFieldValue(fields, [
        "passes d amical",
        "passes amical",
        "passes decisives amical",
      ]);
      const plateauGoals = totals.goals[player.id] ?? 0;
      const plateauAssists = totals.assists[player.id] ?? 0;
      const withGoals = upsertStatField(
        fields,
        "Buts plateau",
        plateauGoals,
      );
      const withAssists = upsertStatField(
        withGoals,
        "Passes D plateau",
        plateauAssists,
      );
      const withTotalGoals = upsertStatField(
        withAssists,
        "Buts",
        champGoals + friendlyGoals + plateauGoals,
      );
      const withTotalAssists = upsertStatField(
        withTotalGoals,
        "Passes D",
        champAssists + friendlyAssists + plateauAssists,
      );
      return {
        id: player.id,
        custom_fields: withTotalAssists,
      };
    });

    const updateResults = await Promise.all(
      updates.map((player) =>
        supabase
          .from("players")
          .update({ custom_fields: player.custom_fields })
          .eq("id", player.id),
      ),
    );
    const updateError = updateResults.find((result) => result.error)?.error;
    if (updateError) {
      console.error(
        "Erreur mise à jour stats joueurs:",
        updateError.message ?? updateError,
      );
    }
  };

  const renderTeamBadge = (
    name: string,
    classes: { image: string; initial: string },
  ) => {
    if (isLocalTeamName(name)) {
      return (
        <img src="/icons/logocclubp.png" alt={name} className={classes.image} />
      );
    }
    const initials = name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
    return <span className={classes.initial}>{initials}</span>;
  };

  const openWizard = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = `${today.getMonth() + 1}`.padStart(2, "0");
    const dd = `${today.getDate()}`.padStart(2, "0");
    setHour("10");
    setMinute("00");
    hourBufferRef.current = "10";
    minuteBufferRef.current = "00";
    timeRef.current = "10:00";
    setTimeTouched(false);
    setWizardStep(1);
    setDraft({
      date: `${yyyy}-${mm}-${dd}`,
      time: "10:00",
      teams: [
        {
          id: "local",
          name: teamDisplayName,
          locked: true,
        },
      ],
      matches: [
        {
          id: buildId(),
          homeTeam: teamDisplayName,
          awayTeam: "",
          time: "10:00",
        },
      ],
    });
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setDraft(null);
    setHoldDelta(null);
    setWizardStep(1);
  };

  const handleAddTeam = (selection: { name: string; id: string | null }) => {
    if (!draft) return;
    if (
      draft.teams.some(
        (team) => team.name.toLowerCase() === selection.name.toLowerCase(),
      )
    ) {
      console.warn("Club déjà ajouté:", selection.name);
      return;
    }
    setDraft({
      ...draft,
      teams: [
        ...draft.teams,
        {
          id: selection.id ?? buildId(),
          name: selection.name,
          locked: false,
        },
      ],
    });
  };

  const handleRemoveTeam = (teamIdToRemove: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      teams: draft.teams.filter(
        (team) => team.id !== teamIdToRemove || team.locked,
      ),
    });
  };

  useEffect(() => {
    if (!draft) return;
    setDraft((prev) =>
      prev ? { ...prev, time: timeValue } : prev,
    );
  }, [timeValue]);

  const teamsValid = (draft?.teams.length ?? 0) >= 3;
  const dateValid = Boolean(draft?.date);
  const matchesValid =
    (draft?.matches.length ?? 0) > 0 &&
    (draft?.matches ?? []).every(
      (match) => match.homeTeam && match.awayTeam,
    );
  const canContinue = dateValid && teamsValid;
  const canCreate = canContinue && matchesValid;

  const handleAddMatch = () => {
    if (!draft) return;
    const teams = draft.teams.map((team) => team.name);
    const defaultHome = teams[0] ?? "";
    const defaultAway = teams.find((team) => team !== defaultHome) ?? "";
    setDraft({
      ...draft,
      matches: [
        ...draft.matches,
        {
          id: buildId(),
          homeTeam: defaultHome,
          awayTeam: defaultAway,
          time: draft.time || "10:00",
        },
      ],
    });
  };

  const handleRemoveMatch = (matchId: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      matches: draft.matches.filter((match) => match.id !== matchId),
    });
  };

  const handleUpdateMatchDraft = (
    matchId: string,
    updates: Partial<PlateauDraft["matches"][number]>,
  ) => {
    if (!draft) return;
    setDraft({
      ...draft,
      matches: draft.matches.map((match) =>
        match.id === matchId ? { ...match, ...updates } : match,
      ),
    });
  };

  const handleGoToStep2 = () => {
    if (!draft || !canContinue) return;
    const nextMatches = buildRoundRobinMatches(
      draft.teams,
      draft.time || timeValue,
    );
    setDraft({
      ...draft,
      matches: nextMatches,
    });
    setWizardStep(2);
  };

  const handleCreatePlateau = async () => {
    if (!draft || !canCreate) return;
    const dayId = buildId();
    const dayDate = `${draft.date}T00:00:00`;
    const nextDay: PlateauDay = {
      id: dayId,
      name: `Plateau ${plateauDays.length + 1}`,
      date: dayDate,
      time: timeValue,
      teams: draft.teams.map((team) => team.name),
      matches: draft.matches
        .filter((match) => match.homeTeam && match.awayTeam)
        .map((match) => ({
          id: buildId(),
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          date: dayDate,
          time: match.time || timeValue,
          status: "draft",
        })),
    };
    const nextDays = [...plateauDays, nextDay];
    const saved = await persistPlateau(nextDays);
    if (saved) closeWizard();
  };

  const handleOpenDetails = (dayId: string, match: PlateauMatch) => {
    setDetails({ dayId, match });
  };

  const handleSaveDetails = async () => {
    if (!details || !scoreDraft) return;
    const homeValue = Number.parseInt(scoreDraft.home ?? "", 10);
    const awayValue = Number.parseInt(scoreDraft.away ?? "", 10);
    const hasHome = Number.isFinite(homeValue);
    const hasAway = Number.isFinite(awayValue);
    const nextScore =
      hasHome && hasAway ? `${homeValue} - ${awayValue}` : undefined;
    const nextMatch: PlateauMatch = {
      ...details.match,
      status: nextScore ? "finished" : "draft",
      score: nextScore,
      scorers: Object.keys(scorers).length ? scorers : undefined,
      assists: Object.keys(assists).length ? assists : undefined,
      motmId: motmId ?? undefined,
      needsBoost: Object.keys(needsBoost).length ? needsBoost : undefined,
    };
    const nextDays = plateauDays.map((day) => {
      if (day.id !== details.dayId) return day;
      return {
        ...day,
        matches: day.matches.map((match) =>
          match.id === details.match.id ? nextMatch : match,
        ),
      };
    });
    await persistPlateau(nextDays);
    await applyPlateauPlayerStats(nextDays);
    setDetails(null);
  };

  const handleDeletePlateauMatch = async () => {
    if (!details) return;
    const confirmed = window.confirm(
      "Supprimer cette rencontre du plateau ? Cette action est définitive.",
    );
    if (!confirmed) return;
    const nextDays = plateauDays.map((day) => {
      if (day.id !== details.dayId) return day;
      return {
        ...day,
        matches: day.matches.filter(
          (match) => match.id !== details.match.id,
        ),
      };
    });
    await persistPlateau(nextDays);
    await applyPlateauPlayerStats(nextDays);
    setDetails(null);
  };

  const upcomingDays = useMemo(() => {
    const now = new Date();
    const todayStamp = new Date(
      `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}T00:00:00`,
    ).getTime();
    return plateauDays
      .filter((day) => {
        const datePart = day.date.split("T")[0] ?? day.date;
        const dayStamp = new Date(`${datePart}T00:00:00`).getTime();
        return Number.isFinite(dayStamp) ? dayStamp >= todayStamp : false;
      })
      .sort((a, b) => {
        const aDate = buildMatchDateTime(a.date, a.time)?.getTime() ?? 0;
        const bDate = buildMatchDateTime(b.date, b.time)?.getTime() ?? 0;
        return aDate - bDate;
      });
  }, [plateauDays]);

  const pastDays = useMemo(() => {
    const now = new Date();
    const todayStamp = new Date(
      `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}T00:00:00`,
    ).getTime();
    return plateauDays
      .filter((day) => {
        const datePart = day.date.split("T")[0] ?? day.date;
        const dayStamp = new Date(`${datePart}T00:00:00`).getTime();
        return Number.isFinite(dayStamp) ? dayStamp < todayStamp : false;
      })
      .sort((a, b) => {
        const aDate = buildMatchDateTime(a.date, a.time)?.getTime() ?? 0;
        const bDate = buildMatchDateTime(b.date, b.time)?.getTime() ?? 0;
        return bDate - aDate;
      });
  }, [plateauDays]);

  const heroDay = upcomingDays[0] ?? pastDays[0] ?? null;
  const heroLabel = upcomingDays.length ? "Prochain plateau" : "Dernier plateau";
  const heroTone: "past" | "upcoming" = heroDay
    ? pastDays.some((entry) => entry.id === heroDay.id)
      ? "past"
      : "upcoming"
    : "upcoming";

  const visibleDays = useMemo(() => {
    return plateauTab === "past" ? pastDays : upcomingDays;
  }, [plateauTab, pastDays, upcomingDays]);

  const listToShow = useMemo(() => {
    if (visibleDays.length) return visibleDays;
    if (!upcomingDays.length && !pastDays.length) return plateauDays;
    return visibleDays;
  }, [visibleDays, upcomingDays.length, pastDays.length, plateauDays]);

  const isPastDetailsMatch = useMemo(() => {
    if (!details) return false;
    const date = buildMatchDateTime(details.match.date, details.match.time);
    return Boolean(date && date.getTime() < Date.now());
  }, [details]);

  const isLocalMatch = useMemo(() => {
    if (!details) return false;
    return (
      isLocalTeamName(details.match.homeTeam) ||
      isLocalTeamName(details.match.awayTeam)
    );
  }, [details, isLocalTeamName]);

  const renderMatchCard = (
    dayId: string,
    match: PlateauMatch,
    tone: "past" | "upcoming",
  ) => {
    return (
      <button
        key={match.id}
        type="button"
        onClick={() => handleOpenDetails(dayId, match)}
        className={[
          "friendly-match-card w-full flex-none rounded-2xl px-6 pb-5 pt-10 text-left text-white/90 transition hover:brightness-110 sm:w-[440px] sm:min-w-[440px] sm:max-w-[440px] sm:min-h-[220px]",
          tone === "past"
            ? "friendly-match-card--past"
            : "friendly-match-card--upcoming",
        ].join(" ")}
      >
        <div className="friendly-match-meta flex items-center justify-between text-xs text-slate-300">
          <span className="friendly-match-date">
            {formatShortDate(match.date || dayId)}
          </span>
          <span className="friendly-match-time">
            {match.time || "--:--"}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm text-white/90">
          <span className="flex-1 text-right font-semibold">
            {match.homeTeam}
          </span>
          <div className="flex items-center gap-2">
            {renderTeamBadge(match.homeTeam, {
              image: "h-9 w-9 rounded-full object-cover",
              initial:
                "flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200",
            })}
            <span className="friendly-match-score friendly-match-score--vs min-w-[52px] text-center text-xl font-semibold text-white">
              {match.score ?? "VS"}
            </span>
            {renderTeamBadge(match.awayTeam, {
              image: "h-9 w-9 rounded-full object-cover",
              initial:
                "flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200",
            })}
          </div>
          <span className="flex-1 text-left font-semibold">
            {match.awayTeam}
          </span>
        </div>
        {!match.score ? (
          <div className="mt-2 text-center text-xs text-slate-300">
            Score à venir
          </div>
        ) : null}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="friendly-section-header" ref={sectionMenuRef}>
          <span className="friendly-section-title">Plateau</span>
          <span className="friendly-section-line" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="friendly-section-menu"
            aria-label="Actions plateau"
          >
            <span />
            <span />
            <span />
          </button>
          {menuOpen ? (
            <div className="friendly-section-dropdown">
              <button
                type="button"
                onClick={handleDeleteAllPlateau}
                className="friendly-section-dropdown-item friendly-section-dropdown-item--danger"
              >
                Supprimer
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl">
        <div
          className={[
            "friendly-hero friendly-hero--plateau",
            heroDay ? "" : "friendly-hero--empty",
          ].join(" ")}
        >
          <div className="friendly-hero__content">
            <div
              className={[
                "friendly-hero__panel",
                heroDay ? "" : "friendly-hero__panel--empty",
              ].join(" ")}
            >
              {heroDay ? (
                <div className="friendly-hero__panel-header">
                  <div className="friendly-hero__panel-logo-wrap">
                    <img
                      src="/icons/logplat.png"
                      alt="Plateau"
                      className="friendly-hero__panel-logo"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={openWizard}
                    className="friendly-hero__cta"
                  >
                    Créer un plateau
                  </button>
                </div>
              ) : null}

              {heroDay ? (
                <div className="friendly-hero__panel-title-row">
                  <div className="friendly-hero__panel-title">
                    {heroLabel}
                  </div>
                  <span
                    className="friendly-hero__panel-line"
                    aria-hidden="true"
                  />
                </div>
              ) : null}

              {heroDay ? (
                <>
                  {heroDay.matches.length ? (
                    <div className="mt-4">
                      <div className="flex snap-x snap-mandatory overflow-x-auto">
                        {heroDay.matches.map((match) => (
                          <div
                            key={match.id}
                            className="min-w-full flex-none snap-center"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex-1 text-right">
                                <div className="text-base font-semibold uppercase tracking-[0.08em] text-white/90 md:text-lg">
                                  {match.homeTeam}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {renderTeamBadge(match.homeTeam, {
                                  image: "h-10 w-10 rounded-full object-cover",
                                  initial:
                                    "flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200",
                                })}
                                <span className="friendly-hero__vs">VS</span>
                                {renderTeamBadge(match.awayTeam, {
                                  image: "h-10 w-10 rounded-full object-cover",
                                  initial:
                                    "flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200",
                                })}
                              </div>
                              <div className="flex-1 text-left">
                                <div className="text-base font-semibold uppercase tracking-[0.08em] text-white/90 md:text-lg">
                                  {match.awayTeam}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center justify-center text-[11px] text-white/60">
                              {match.time || "--:--"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 text-center text-xs text-white/60">
                      Aucune rencontre enregistrée
                    </div>
                  )}

                  <div className="friendly-hero__meta-line">
                    <span className="friendly-hero__meta-pill">
                      {formatShortDate(heroDay.date)}
                    </span>
                    <span className="friendly-hero__meta-pill">
                      {heroDay.name}
                    </span>
                    <span className="friendly-hero__meta-pill">
                      {heroDay.time || "--:--"}
                    </span>
                  </div>

                </>
              ) : (
                <div className="friendly-hero__empty">
                  <p className="friendly-hero__empty-title">
                    Créer ton premier plateau
                  </p>
                  <div className="friendly-hero__empty-circle">
                    <img
                      src="/icons/logplat.png"
                      alt=""
                      className="friendly-hero__badge-logo"
                    />
                    <button
                      type="button"
                      onClick={openWizard}
                      className="friendly-hero__cta"
                    >
                      Créer un plateau
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-6 w-full max-w-4xl">
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {[
            { key: "upcoming", label: "Plateau à venir" },
            { key: "past", label: "Plateau passé" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() =>
                setPlateauTab(tab.key as "upcoming" | "past")
              }
              className={[
                "friendly-tab-card",
                plateauTab === tab.key
                  ? "friendly-tab-card--active"
                  : "friendly-tab-card--inactive",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {listToShow.length === 0 ? (
            <p className="text-sm text-white/60">
              Aucun plateau disponible pour cette vue.
            </p>
          ) : (
            <div className="space-y-5">
              {listToShow.map((day) => {
                const isPast = pastDays.some((entry) => entry.id === day.id);
                return (
                  <div key={day.id} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
                      <div className="flex items-center gap-2">
                        <span className="friendly-match-date">
                          {formatShortDate(day.date)}
                        </span>
                        <span className="friendly-match-time">
                          {day.time || "--:--"}
                        </span>
                      </div>
                      <span className="text-[11px] uppercase tracking-[0.25em] text-white/60">
                        {day.name}
                      </span>
                    </div>

                    {day.matches.length === 0 ? (
                      <p className="text-sm text-white/60">
                        Aucune rencontre enregistrée pour ce plateau.
                      </p>
                    ) : (
                      <div className="flex gap-3 overflow-x-auto pb-2">
                        {day.matches.map((match) =>
                          renderMatchCard(
                            day.id,
                            match,
                            isPast ? "past" : "upcoming",
                          ),
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {wizardOpen && draft ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[2px]"
          onClick={closeWizard}
          role="presentation"
        >
          <div
            className="relative w-full max-w-xl rounded-3xl border border-white/12 bg-black/30 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-[32px] backdrop-saturate-200 md:p-5"
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <button
              type="button"
              onClick={closeWizard}
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
                Créer un plateau
              </h2>
              <span className="mt-2 block h-px w-16 bg-violet-400/70" />
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  <span>Étape {wizardStep} sur 2</span>
                  <span>
                    {wizardStep === 1 ? "Équipes" : "Rencontres"}
                  </span>
                </div>
                <div className="mt-2 h-1 w-full rounded-full bg-white/10">
                  <div
                    className={`h-1 rounded-full bg-violet-400 transition-all ${
                      wizardStep === 1 ? "w-1/2" : "w-full"
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-4 text-center">
              {wizardStep === 1 ? (
                <>
                  <div>
                <label className="flex items-center justify-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[#f2f0ff] drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]">
                  <img
                    src="/icons/VSamic.png"
                    alt=""
                    className="h-[36px] w-[36px] opacity-80"
                  />
                  Équipes du plateau
                </label>
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  {draft.teams.map((team) => (
                    <span
                      key={team.id}
                      className="inline-flex items-center rounded-full border border-white/20 bg-[rgba(255,255,255,0.08)] px-3 py-1 text-[11px] text-white/90 shadow-[0_8px_20px_rgba(15,23,42,0.4)] backdrop-blur-md"
                    >
                      {team.name}
                      {!team.locked ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveTeam(team.id)}
                          className="ml-2 text-white/60 transition hover:text-rose-300"
                        >
                          ✕
                        </button>
                      ) : null}
                    </span>
                  ))}
                </div>
                <div className="mx-auto mt-2 max-w-sm">
                  <TeamSearchDropdown
                    onSelect={handleAddTeam}
                    showCheck={teamsValid}
                  />
                </div>
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
                    value={draft.date}
                    onChange={(event) =>
                      setDraft({ ...draft, date: event.target.value })
                    }
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
                            const next = (
                              hourBufferRef.current + event.key
                            ).slice(0, 2);
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
                            const next = (
                              minuteBufferRef.current + event.key
                            ).slice(0, 2);
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
              </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[#f2f0ff] drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]">
                      Rencontres
                    </label>
                    <button
                      type="button"
                      onClick={handleAddMatch}
                      className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/80 transition hover:bg-white/10"
                    >
                      + Ajouter
                    </button>
                  </div>
                  <div className="space-y-2">
                    {draft.matches.map((match) => (
                      <div
                        key={match.id}
                        className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/15 bg-[rgba(255,255,255,0.06)] px-3 py-2 text-xs text-white/85 shadow-[0_8px_20px_rgba(15,23,42,0.4)] backdrop-blur-md"
                      >
                        <select
                          value={match.homeTeam}
                          onChange={(event) =>
                            handleUpdateMatchDraft(match.id, {
                              homeTeam: event.target.value,
                            })
                          }
                          className="flex-1 rounded-xl border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/90"
                        >
                          {draft.teams.map((team) => (
                            <option key={team.id} value={team.name}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                        <span className="text-[10px] text-white/60">vs</span>
                        <select
                          value={match.awayTeam}
                          onChange={(event) =>
                            handleUpdateMatchDraft(match.id, {
                              awayTeam: event.target.value,
                            })
                          }
                          className="flex-1 rounded-xl border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/90"
                        >
                          <option value="">Choisir</option>
                          {draft.teams.map((team) => (
                            <option key={team.id} value={team.name}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="time"
                          value={match.time}
                          onChange={(event) =>
                            handleUpdateMatchDraft(match.id, {
                              time: event.target.value,
                            })
                          }
                          className="w-20 rounded-xl border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/90"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveMatch(match.id)}
                          className="text-[11px] text-rose-200 transition hover:text-rose-300"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 border-t border-white/5 pt-6">
              <div className="flex items-center justify-between">
                {wizardStep === 2 ? (
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className="rounded-full border border-white/10 bg-transparent px-3 py-2 text-[11px] text-white/70 transition hover:text-white"
                  >
                    Retour
                  </button>
                ) : (
                  <span />
                )}
                {wizardStep === 1 ? (
                  <button
                    type="button"
                    onClick={handleGoToStep2}
                    disabled={!canContinue}
                    className="rounded-full bg-violet-600 px-4 py-2 text-xs font-medium text-white shadow-[0_8px_22px_rgba(0,0,0,0.35)] transition hover:bg-violet-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Continuer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCreatePlateau}
                    disabled={!canCreate}
                    className="rounded-full bg-violet-600 px-4 py-2 text-xs font-medium text-white shadow-[0_8px_22px_rgba(0,0,0,0.35)] transition hover:bg-violet-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Créer le plateau
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {details ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[2px]">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-white/12 bg-black/30 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-[32px] backdrop-saturate-200 md:p-6 max-h-[90vh]">
            <div className="relative z-10 flex max-h-[80vh] flex-col overflow-y-auto">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-300">
                    Détails du plateau
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-100">
                    {details.match.homeTeam} vs {details.match.awayTeam}
                  </h3>
                  <span className="mt-2 block h-px w-16 bg-violet-400/70" />
                </div>
                <button
                  type="button"
                  onClick={() => setDetails(null)}
                  className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs text-slate-200 transition hover:bg-white/10"
                >
                  Fermer
                </button>
              </div>

              <div className="mt-6">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="flex items-center justify-end gap-3 text-right">
                    {renderTeamBadge(details.match.homeTeam, {
                      image: "h-10 w-10 rounded-full object-cover",
                      initial:
                        "flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xs font-semibold uppercase tracking-[0.16em] text-[#f2f0ff]",
                    })}
                    <span className="max-w-[220px] text-sm font-semibold text-white">
                      {details.match.homeTeam}
                    </span>
                    <div className="flex flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={() => bumpScore("home", 1)}
                        disabled={!isPastDetailsMatch}
                        aria-label="Augmenter score équipe locale"
                        className={[
                          "rounded-md border border-white/10 bg-white/5 px-1 text-[9px] text-white/80 transition hover:bg-white/10",
                          !isPastDetailsMatch
                            ? "cursor-not-allowed opacity-40"
                            : "",
                        ].join(" ")}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => bumpScore("home", -1)}
                        disabled={!isPastDetailsMatch}
                        aria-label="Diminuer score équipe locale"
                        className={[
                          "rounded-md border border-white/10 bg-white/5 px-1 text-[9px] text-white/80 transition hover:bg-white/10",
                          !isPastDetailsMatch
                            ? "cursor-not-allowed opacity-40"
                            : "",
                        ].join(" ")}
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                  <div
                    className={[
                      "relative inline-flex items-center gap-2 rounded-full border border-white/12 bg-[rgba(255,255,255,0.04)] px-3 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.35)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus-within:animate-[friendlyBreath_2.8s_ease-in-out_infinite] focus-within:bg-[linear-gradient(90deg,rgba(255,255,255,0.06),transparent),rgba(255,255,255,0.06)]",
                      !isPastDetailsMatch ? "opacity-60" : "",
                    ].join(" ")}
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-1 rounded-full bg-white/20 opacity-30 blur-[12px]"
                    />
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={scoreDraft?.home ?? ""}
                      disabled={!isPastDetailsMatch}
                      onChange={(event) =>
                        setScoreDraft((prev) => ({
                          ...(prev ?? { home: "", away: "" }),
                          home: event.target.value.replace(/[^\d]/g, ""),
                        }))
                      }
                      className="relative z-10 w-9 rounded-xl bg-transparent px-1 py-0.5 text-center text-lg font-semibold text-white/95 drop-shadow-[0_1px_0_#1f1235] transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:ring-1 focus:ring-violet-400/50"
                    />
                    <span className="relative z-10 text-base text-white/60">
                      -
                    </span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={scoreDraft?.away ?? ""}
                      disabled={!isPastDetailsMatch}
                      onChange={(event) =>
                        setScoreDraft((prev) => ({
                          ...(prev ?? { home: "", away: "" }),
                          away: event.target.value.replace(/[^\d]/g, ""),
                        }))
                      }
                      className="relative z-10 w-9 rounded-xl bg-transparent px-1 py-0.5 text-center text-lg font-semibold text-white/95 drop-shadow-[0_1px_0_#1f1235] transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:ring-1 focus:ring-violet-400/50"
                    />
                  </div>
                  <div className="flex items-center justify-start gap-3 text-left">
                    <div className="flex flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={() => bumpScore("away", 1)}
                        disabled={!isPastDetailsMatch}
                        aria-label="Augmenter score équipe adverse"
                        className={[
                          "rounded-md border border-white/10 bg-white/5 px-1 text-[9px] text-white/80 transition hover:bg-white/10",
                          !isPastDetailsMatch
                            ? "cursor-not-allowed opacity-40"
                            : "",
                        ].join(" ")}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => bumpScore("away", -1)}
                        disabled={!isPastDetailsMatch}
                        aria-label="Diminuer score équipe adverse"
                        className={[
                          "rounded-md border border-white/10 bg-white/5 px-1 text-[9px] text-white/80 transition hover:bg-white/10",
                          !isPastDetailsMatch
                            ? "cursor-not-allowed opacity-40"
                            : "",
                        ].join(" ")}
                      >
                        ▼
                      </button>
                    </div>
                    <span className="max-w-[220px] text-sm font-semibold text-white">
                      {details.match.awayTeam}
                    </span>
                    {renderTeamBadge(details.match.awayTeam, {
                      image: "h-10 w-10 rounded-full object-cover",
                      initial:
                        "flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xs font-semibold uppercase tracking-[0.16em] text-[#f2f0ff]",
                    })}
                  </div>
                </div>
                {!isPastDetailsMatch ? (
                  <p className="mt-2 text-xs text-white/50">
                    Score disponible après le match.
                  </p>
                ) : null}
              </div>

              {isLocalMatch ? (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Buteurs
                      </p>
                      <div ref={scorersRef} className="relative">
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-55 blur-[12px]"
                        />
                        <button
                          type="button"
                          onClick={() => setScorersOpen((prev) => !prev)}
                          className="relative z-10 flex items-center gap-2 rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.35)] backdrop-blur-md transition hover:bg-[rgba(255,255,255,0.1)]"
                        >
                          Ajouter
                          <span className="text-xs">▾</span>
                        </button>
                        {scorersOpen ? (
                          <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e1a] p-2 shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
                            <div className="max-h-40 space-y-1 overflow-y-auto">
                              {playersLoading ? (
                                <p className="px-2 py-1 text-xs text-slate-500">
                                  Chargement des joueurs...
                                </p>
                              ) : roster.length ? (
                                roster.map((player) => {
                                  const isSelected = Boolean(
                                    scorers[player.id],
                                  );
                                  return (
                                    <button
                                      key={player.id}
                                      type="button"
                                      onClick={() =>
                                        toggleStatSelection(
                                          setScorers,
                                          player.id,
                                        )
                                      }
                                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-white/80 transition hover:bg-white/5"
                                    >
                                      <span className="truncate">
                                        {player.label}
                                      </span>
                                      <span
                                        className={[
                                          "h-2.5 w-2.5 rounded-full border",
                                          isSelected
                                            ? "border-violet-300 bg-violet-300 shadow-[0_0_8px_rgba(124,58,237,0.7)]"
                                            : "border-white/30",
                                        ].join(" ")}
                                      />
                                    </button>
                                  );
                                })
                              ) : (
                                <p className="px-2 py-1 text-xs text-slate-500">
                                  Aucun joueur enregistré.
                                </p>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {Object.keys(scorers).length ? (
                        Object.entries(scorers).map(([playerId, count]) => (
                          <div
                            key={playerId}
                            className="flex items-center justify-between text-sm text-white/80"
                          >
                            <span className="text-white">
                              {rosterById[playerId]?.label ?? playerId}
                            </span>
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              value={count}
                              onChange={(event) =>
                                setStatValue(
                                  setScorers,
                                  playerId,
                                  event.target.value,
                                )
                              }
                              className="w-12 rounded-xl border border-white/15 bg-[rgba(255,255,255,0.07)] px-2 py-1 text-center text-sm font-semibold text-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.35)] backdrop-blur-md [appearance:textfield] focus:outline-none focus:ring-1 focus:ring-violet-400/50"
                            />
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-500">
                          Aucun buteur sélectionné.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Passes décisives
                      </p>
                      <div ref={assistsRef} className="relative">
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-55 blur-[12px]"
                        />
                        <button
                          type="button"
                          onClick={() => setAssistsOpen((prev) => !prev)}
                          className="relative z-10 flex items-center gap-2 rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.35)] backdrop-blur-md transition hover:bg-[rgba(255,255,255,0.1)]"
                        >
                          Ajouter
                          <span className="text-xs">▾</span>
                        </button>
                        {assistsOpen ? (
                          <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e1a] p-2 shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
                            <div className="max-h-40 space-y-1 overflow-y-auto">
                              {playersLoading ? (
                                <p className="px-2 py-1 text-xs text-slate-500">
                                  Chargement des joueurs...
                                </p>
                              ) : roster.length ? (
                                roster.map((player) => {
                                  const isSelected = Boolean(
                                    assists[player.id],
                                  );
                                  return (
                                    <button
                                      key={player.id}
                                      type="button"
                                      onClick={() =>
                                        toggleStatSelection(
                                          setAssists,
                                          player.id,
                                        )
                                      }
                                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-white/80 transition hover:bg-white/5"
                                    >
                                      <span className="truncate">
                                        {player.label}
                                      </span>
                                      <span
                                        className={[
                                          "h-2.5 w-2.5 rounded-full border",
                                          isSelected
                                            ? "border-violet-300 bg-violet-300 shadow-[0_0_8px_rgba(124,58,237,0.7)]"
                                            : "border-white/30",
                                        ].join(" ")}
                                      />
                                    </button>
                                  );
                                })
                              ) : (
                                <p className="px-2 py-1 text-xs text-slate-500">
                                  Aucun joueur enregistré.
                                </p>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {Object.keys(assists).length ? (
                        Object.entries(assists).map(([playerId, count]) => (
                          <div
                            key={playerId}
                            className="flex items-center justify-between text-sm text-white/80"
                          >
                            <span className="text-white">
                              {rosterById[playerId]?.label ?? playerId}
                            </span>
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              value={count}
                              onChange={(event) =>
                                setStatValue(
                                  setAssists,
                                  playerId,
                                  event.target.value,
                                )
                              }
                              className="w-12 rounded-xl border border-white/15 bg-[rgba(255,255,255,0.07)] px-2 py-1 text-center text-sm font-semibold text-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.35)] backdrop-blur-md [appearance:textfield] focus:outline-none focus:ring-1 focus:ring-violet-400/50"
                            />
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-500">
                          Aucune passe décisive.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 md:col-span-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Distinctions
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div ref={motmRef} className="relative">
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-55 blur-[12px]"
                        />
                        <button
                          type="button"
                          onClick={() => setMotmOpen((prev) => !prev)}
                          className="relative z-10 flex w-full items-center justify-between rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.35)] backdrop-blur-md transition hover:bg-[rgba(255,255,255,0.1)]"
                        >
                          {motmId
                            ? rosterById[motmId]?.label
                            : "Homme du match"}
                          <span className="text-xs">▾</span>
                        </button>
                        {motmOpen ? (
                          <div className="absolute left-0 right-0 z-30 mb-2 -translate-y-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e1a] p-2 shadow-[0_18px_40px_rgba(0,0,0,0.55)] bottom-full">
                            <div className="max-h-40 space-y-1 overflow-y-auto">
                              {roster.map((player) => (
                                <button
                                  key={player.id}
                                  type="button"
                                  onClick={() => {
                                    setMotmId(player.id);
                                    setMotmOpen(false);
                                  }}
                                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-white/80 transition hover:bg-white/5"
                                >
                                  <span className="truncate">
                                    {player.label}
                                  </span>
                                  <span
                                    className={[
                                      "h-2.5 w-2.5 rounded-full border",
                                      motmId === player.id
                                        ? "border-violet-300 bg-violet-300 shadow-[0_0_8px_rgba(124,58,237,0.7)]"
                                        : "border-white/30",
                                    ].join(" ")}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div ref={needsBoostRef} className="relative">
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-55 blur-[12px]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setNeedsBoostOpen((prev) => !prev)
                          }
                          className="relative z-10 flex w-full items-center justify-between rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.35)] backdrop-blur-md transition hover:bg-[rgba(255,255,255,0.1)]"
                        >
                          {needsBoostLabel}
                          <span className="text-xs">▾</span>
                        </button>
                        {needsBoostOpen ? (
                          <div className="absolute left-0 right-0 z-30 mb-2 -translate-y-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e1a] p-2 shadow-[0_18px_40px_rgba(0,0,0,0.55)] bottom-full">
                            <div className="max-h-40 space-y-1 overflow-y-auto">
                              {roster.map((player) => (
                                <button
                                  key={player.id}
                                  type="button"
                                  onClick={() =>
                                    toggleSelection(
                                      setNeedsBoost,
                                      player.id,
                                    )
                                  }
                                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-white/80 transition hover:bg-white/5"
                                >
                                  <span className="truncate">
                                    {player.label}
                                  </span>
                                  <span
                                    className={[
                                      "h-2.5 w-2.5 rounded-full border",
                                      needsBoost[player.id]
                                        ? "border-violet-300 bg-violet-300 shadow-[0_0_8px_rgba(124,58,237,0.7)]"
                                        : "border-white/30",
                                    ].join(" ")}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.keys(needsBoost).length ? (
                            Object.keys(needsBoost).map((playerId) => (
                              <button
                                key={playerId}
                                type="button"
                                onClick={() =>
                                  toggleSelection(
                                    setNeedsBoost,
                                    playerId,
                                  )
                                }
                                className="rounded-full border border-rose-400/40 bg-rose-400/10 px-3 py-1 text-[10px] font-semibold text-rose-200 transition hover:bg-rose-400/20"
                              >
                                {rosterById[playerId]?.label ?? playerId}
                              </button>
                            ))
                          ) : (
                            <p className="text-xs text-slate-500">
                              Aucun joueur sélectionné.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setDetails(null)}
                  className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-xs text-white/70 transition hover:bg-white/10"
                >
                  Annuler
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDeletePlateauMatch}
                    className="rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20"
                  >
                    Supprimer
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDetails}
                    className="rounded-full bg-violet-600 px-5 py-2 text-xs font-medium text-white shadow-[0_10px_24px_rgba(15,23,42,0.35)] transition hover:bg-violet-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Valider
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
