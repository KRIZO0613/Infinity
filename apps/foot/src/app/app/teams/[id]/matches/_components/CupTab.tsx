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

type CupMatch = {
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

type CupRound = {
  id: string;
  name: string;
  date: string;
  time: string;
  teams: string[];
  matches: CupMatch[];
};

type CupCompetition = {
  id: string;
  name: string;
  rounds: CupRound[];
};

type CupStorageData = {
  cup?: { name?: string; rounds?: CupRound[] };
  cups?: CupCompetition[];
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

type CupTabProps = {
  teamId: string;
};

type CupDraft = {
  cupName: string;
  roundName: string;
  date: string;
  time: string;
  teams: Array<{ id: string; name: string; locked?: boolean }>;
};

type CupDetails = {
  roundId: string;
  match: CupMatch;
};

const buildId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const pad2 = (value: number) => value.toString().padStart(2, "0");

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const shouldSilenceLoadError = (error: unknown) => {
  const message =
    (error as { message?: string })?.message?.toLowerCase?.() ??
    String(error).toLowerCase();
  return message.includes("load failed") || message.includes("failed to fetch");
};

const logLoadError = (label: string, error: unknown) => {
  if (shouldSilenceLoadError(error)) return;
  console.error(label, (error as { message?: string })?.message ?? error);
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

const buildRoundMatches = (
  teams: Array<{ name: string }>,
  date: string,
  time: string,
) => {
  const names = teams.map((team) => team.name).filter(Boolean);
  const matches: CupMatch[] = [];
  for (let i = 0; i < names.length - 1; i += 2) {
    matches.push({
      id: buildId(),
      homeTeam: names[i],
      awayTeam: names[i + 1],
      date,
      time: time || "18:00",
      status: "draft",
    });
  }
  return matches;
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

export default function CupTab({ teamId }: CupTabProps) {
  const [teamInfo, setTeamInfo] = useState<TeamInfo>({
    name: null,
    category: null,
    level: null,
    clubName: null,
    squadNumber: null,
  });
  const [players, setPlayers] = useState<PlayerLite[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [cups, setCups] = useState<CupCompetition[]>([]);
  const [activeCupId, setActiveCupId] = useState<string | null>(null);
  const [storageData, setStorageData] = useState<CupStorageData>({});
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<"round" | "new">("round");
  const [draft, setDraft] = useState<CupDraft | null>(null);
  const [details, setDetails] = useState<CupDetails | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [matchesTab, setMatchesTab] = useState<"upcoming" | "past">(
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

  const activeCup = useMemo(() => {
    if (!cups.length) return null;
    if (!activeCupId) return cups[0] ?? null;
    return cups.find((cup) => cup.id === activeCupId) ?? cups[0] ?? null;
  }, [cups, activeCupId]);

  const cupName = activeCup?.name ?? "";
  const rounds = activeCup?.rounds ?? [];

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

  useEffect(() => {
    let cancelled = false;

    async function loadTeamInfo() {
      if (!teamId) return;
      try {
        const { data, error } = await supabase
          .from("teams")
          .select("name,category,club_id,squad_number")
          .eq("id", teamId)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          logLoadError("Erreur chargement équipe:", error);
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
      } catch (error) {
        if (cancelled) return;
        logLoadError("Erreur chargement équipe:", error);
      }
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
      try {
        const { data, error } = await supabase
          .from("players")
          .select("id,first_name,last_name,photo_url")
          .eq("team_id", teamId)
          .order("last_name", { ascending: true });

        if (cancelled) return;
        if (error) {
          logLoadError("Erreur chargement joueurs:", error);
          setPlayersLoading(false);
          return;
        }

        setPlayers((data ?? []) as PlayerLite[]);
        setPlayersLoading(false);
      } catch (error) {
        if (cancelled) return;
        logLoadError("Erreur chargement joueurs:", error);
        setPlayersLoading(false);
      }
    }

    loadPlayers();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  useEffect(() => {
    let cancelled = false;

    async function loadCup() {
      if (!teamId) return;
      try {
        const { data, error } = await supabase
          .from("championships")
          .select("data")
          .eq("team_id", teamId)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          logLoadError("Erreur chargement coupe:", error);
          return;
        }

        const stored = (data?.data ?? {}) as CupStorageData;
        const storedCups = Array.isArray(stored?.cups)
          ? (stored.cups as CupCompetition[])
          : [];
        const storedCup = stored?.cup ?? {};
        const storedRounds = Array.isArray(storedCup?.rounds)
          ? (storedCup.rounds as CupRound[])
          : [];
        setStorageData(stored);
        if (storedCups.length) {
          setCups(storedCups);
          setActiveCupId(storedCups[0]?.id ?? null);
        } else if (storedCup?.name || storedRounds.length) {
          const legacyCup: CupCompetition = {
            id: "legacy-cup",
            name: storedCup?.name ?? "Coupe",
            rounds: storedRounds,
          };
          setCups([legacyCup]);
          setActiveCupId(legacyCup.id);
        } else {
          setCups([]);
          setActiveCupId(null);
        }
      } catch (error) {
        if (cancelled) return;
        logLoadError("Erreur chargement coupe:", error);
      }
    }

    loadCup();
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
    const handleClickOutside = (event: Event) => {
      const target = event.target as Node;
      if (sectionMenuRef.current && !sectionMenuRef.current.contains(target)) {
        setMenuOpen(false);
      }
      if (scorersRef.current && !scorersRef.current.contains(target)) {
        setScorersOpen(false);
      }
      if (assistsRef.current && !assistsRef.current.contains(target)) {
        setAssistsOpen(false);
      }
      if (motmRef.current && !motmRef.current.contains(target)) {
        setMotmOpen(false);
      }
      if (needsBoostRef.current && !needsBoostRef.current.contains(target)) {
        setNeedsBoostOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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

  const persistCups = async (
    nextCups: CupCompetition[],
    nextActiveId?: string | null,
  ) => {
    if (!teamId) return false;
    const { cup, ...rest } = storageData;
    const payload = {
      team_id: teamId,
      data: {
        ...rest,
        cups: nextCups,
      },
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("championships")
      .upsert(payload, { onConflict: "team_id" })
      .select("data")
      .maybeSingle();
    if (error) {
      console.error("Erreur sauvegarde coupe:", error.message ?? error);
      return false;
    }
    setStorageData((data?.data ?? payload.data) as CupStorageData);
    setCups(nextCups);
    if (typeof nextActiveId !== "undefined") {
      setActiveCupId(nextActiveId);
    } else {
      setActiveCupId(nextCups[0]?.id ?? null);
    }
    return true;
  };

  const handleDeleteCup = async () => {
    setMenuOpen(false);
    if (!activeCup) return;
    const confirmed = window.confirm(
      "Supprimer la coupe et tous les tours ? Cette action est définitive.",
    );
    if (!confirmed) return;
    const nextCups = cups.filter((cup) => cup.id !== activeCup.id);
    const nextActiveId = nextCups[0]?.id ?? null;
    await persistCups(nextCups, nextActiveId);
  };

  const openWizard = (mode: "round" | "new" = "round") => {
    const resolvedMode =
      mode === "round" && !activeCup ? "new" : mode;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = `${today.getMonth() + 1}`.padStart(2, "0");
    const dd = `${today.getDate()}`.padStart(2, "0");
    setHour("18");
    setMinute("00");
    hourBufferRef.current = "18";
    minuteBufferRef.current = "00";
    timeRef.current = "18:00";
    setTimeTouched(false);
    setWizardMode(resolvedMode);
    setDraft({
      cupName: resolvedMode === "new" ? "Coupe" : cupName || "Coupe",
      roundName: `Tour ${
        resolvedMode === "new" ? 1 : rounds.length + 1
      }`,
      date: `${yyyy}-${mm}-${dd}`,
      time: "18:00",
      teams: [
        {
          id: "local",
          name: teamDisplayName,
          locked: true,
        },
      ],
    });
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setDraft(null);
    setHoldDelta(null);
    setWizardMode("round");
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

  const cupNameValid = Boolean(draft?.cupName?.trim());
  const roundNameValid = Boolean(draft?.roundName?.trim());
  const teamsValid = (draft?.teams.length ?? 0) >= 1;
  const dateValid = Boolean(draft?.date);
  const canCreate = cupNameValid && roundNameValid && dateValid && teamsValid;

  const handleCreateRound = async () => {
    if (!draft || !canCreate) return;
    const roundId = buildId();
    const roundDate = `${draft.date}T00:00:00`;
    const nextRound: CupRound = {
      id: roundId,
      name: draft.roundName.trim(),
      date: roundDate,
      time: timeValue,
      teams: draft.teams.map((team) => team.name),
      matches: buildRoundMatches(draft.teams, roundDate, timeValue),
    };
    const createNewCup = wizardMode === "new" || !activeCup;
    if (createNewCup) {
      const newCup: CupCompetition = {
        id: buildId(),
        name: draft.cupName.trim(),
        rounds: [nextRound],
      };
      const nextCups = [...cups, newCup];
      const saved = await persistCups(nextCups, newCup.id);
      if (saved) closeWizard();
      return;
    }

    const nextCups = cups.map((cup) => {
      if (cup.id !== activeCup.id) return cup;
      return {
        ...cup,
        name: draft.cupName.trim(),
        rounds: [...cup.rounds, nextRound],
      };
    });
    const saved = await persistCups(nextCups, activeCup.id);
    if (saved) closeWizard();
  };

  const handleOpenDetails = (roundId: string, match: CupMatch) => {
    setDetails({ roundId, match });
  };

  const handleSaveDetails = async () => {
    if (!details || !scoreDraft || !activeCup) return;
    const homeValue = Number.parseInt(scoreDraft.home ?? "", 10);
    const awayValue = Number.parseInt(scoreDraft.away ?? "", 10);
    const hasHome = Number.isFinite(homeValue);
    const hasAway = Number.isFinite(awayValue);
    const nextScore =
      hasHome && hasAway ? `${homeValue} - ${awayValue}` : undefined;
    const nextMatch: CupMatch = {
      ...details.match,
      status: nextScore ? "finished" : "draft",
      score: nextScore,
      scorers: Object.keys(scorers).length ? scorers : undefined,
      assists: Object.keys(assists).length ? assists : undefined,
      motmId: motmId ?? undefined,
      needsBoost: Object.keys(needsBoost).length ? needsBoost : undefined,
    };
    const nextRounds = rounds.map((round) => {
      if (round.id !== details.roundId) return round;
      return {
        ...round,
        matches: round.matches.map((match) =>
          match.id === details.match.id ? nextMatch : match,
        ),
      };
    });
    const nextCups = cups.map((cup) =>
      cup.id === activeCup.id
        ? { ...cup, rounds: nextRounds }
        : cup,
    );
    await persistCups(nextCups, activeCup.id);
    setDetails(null);
  };

  const handleDeleteCupMatch = async () => {
    if (!details || !activeCup) return;
    const confirmed = window.confirm(
      "Supprimer ce match de coupe ? Cette action est définitive.",
    );
    if (!confirmed) return;
    const nextRounds = rounds.map((round) => {
      if (round.id !== details.roundId) return round;
      return {
        ...round,
        matches: round.matches.filter(
          (match) => match.id !== details.match.id,
        ),
      };
    });
    const nextCups = cups.map((cup) =>
      cup.id === activeCup.id
        ? { ...cup, rounds: nextRounds }
        : cup,
    );
    await persistCups(nextCups, activeCup.id);
    setDetails(null);
  };

  const upcomingRounds = useMemo(() => {
    const now = new Date();
    const todayStamp = new Date(
      `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}T00:00:00`,
    ).getTime();
    return rounds
      .filter((round) => {
        const datePart = round.date.split("T")[0] ?? round.date;
        const roundStamp = new Date(`${datePart}T00:00:00`).getTime();
        return Number.isFinite(roundStamp) ? roundStamp >= todayStamp : false;
      })
      .sort((a, b) => {
        const aDate = buildMatchDateTime(a.date, a.time)?.getTime() ?? 0;
        const bDate = buildMatchDateTime(b.date, b.time)?.getTime() ?? 0;
        return aDate - bDate;
      });
  }, [rounds]);

  const pastRounds = useMemo(() => {
    const now = new Date();
    const todayStamp = new Date(
      `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}T00:00:00`,
    ).getTime();
    return rounds
      .filter((round) => {
        const datePart = round.date.split("T")[0] ?? round.date;
        const roundStamp = new Date(`${datePart}T00:00:00`).getTime();
        return Number.isFinite(roundStamp) ? roundStamp < todayStamp : false;
      })
      .sort((a, b) => {
        const aDate = buildMatchDateTime(a.date, a.time)?.getTime() ?? 0;
        const bDate = buildMatchDateTime(b.date, b.time)?.getTime() ?? 0;
        return bDate - aDate;
      });
  }, [rounds]);

  const heroRound = upcomingRounds[0] ?? pastRounds[0] ?? null;
  const heroLabel = upcomingRounds.length ? "Prochain tour" : "Dernier tour";
  const heroMatch = heroRound?.matches?.[0] ?? null;

  const allMatches = useMemo(() => {
    return rounds.flatMap((round) =>
      round.matches.map((match) => ({
        ...match,
        roundName: round.name,
        roundId: round.id,
      })),
    );
  }, [rounds]);

  const upcomingMatches = useMemo(() => {
    return allMatches
      .filter((match) => {
        const date = buildMatchDateTime(match.date, match.time);
        if (!date) return false;
        return date.getTime() >= Date.now();
      })
      .sort((a, b) => {
        const aDate = buildMatchDateTime(a.date, a.time)?.getTime() ?? 0;
        const bDate = buildMatchDateTime(b.date, b.time)?.getTime() ?? 0;
        return aDate - bDate;
      });
  }, [allMatches]);

  const pastMatches = useMemo(() => {
    return allMatches
      .filter((match) => {
        const date = buildMatchDateTime(match.date, match.time);
        if (!date) return false;
        return date.getTime() < Date.now();
      })
      .sort((a, b) => {
        const aDate = buildMatchDateTime(a.date, a.time)?.getTime() ?? 0;
        const bDate = buildMatchDateTime(b.date, b.time)?.getTime() ?? 0;
        return bDate - aDate;
      });
  }, [allMatches]);

  const visibleMatches = useMemo(() => {
    return matchesTab === "past" ? pastMatches : upcomingMatches;
  }, [matchesTab, pastMatches, upcomingMatches]);

  const listToShow = useMemo(() => {
    if (visibleMatches.length) return visibleMatches;
    if (!upcomingMatches.length && !pastMatches.length) return allMatches;
    return visibleMatches;
  }, [visibleMatches, upcomingMatches.length, pastMatches.length, allMatches]);

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

  const renderMatchCard = (
    roundId: string,
    match: CupMatch & { roundName?: string },
    tone: "past" | "upcoming",
  ) => {
    return (
      <button
        key={match.id}
        type="button"
        onClick={() => handleOpenDetails(roundId, match)}
        className={[
          "friendly-match-card w-full flex-none rounded-2xl px-6 pb-5 pt-10 text-left text-white/90 transition hover:brightness-110 sm:w-[440px] sm:min-w-[440px] sm:max-w-[440px] sm:min-h-[220px]",
          tone === "past"
            ? "friendly-match-card--past"
            : "friendly-match-card--upcoming",
        ].join(" ")}
      >
        <div className="friendly-match-meta flex items-center justify-between text-xs text-slate-300">
          <span className="friendly-match-date">
            {formatShortDate(match.date)}
          </span>
          <span className="friendly-match-time">{match.time || "--:--"}</span>
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
            {match.roundName ?? "Tour"} · Score à venir
          </div>
        ) : null}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="friendly-section-header" ref={sectionMenuRef}>
          <span className="friendly-section-title">Coupe</span>
          <span className="friendly-section-line" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="friendly-section-menu"
            aria-label="Actions coupe"
          >
            <span />
            <span />
            <span />
          </button>
          {menuOpen ? (
            <div className="friendly-section-dropdown">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  openWizard("new");
                }}
                className="friendly-section-dropdown-item"
              >
                Créer une autre coupe
              </button>
              <button
                type="button"
                onClick={handleDeleteCup}
                className="friendly-section-dropdown-item friendly-section-dropdown-item--danger"
              >
                Supprimer
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {cups.length > 1 ? (
        <div className="mx-auto w-full max-w-4xl">
          <div className="cup-tabs mt-1 flex flex-wrap items-center gap-3">
            {cups.map((cup) => (
              <button
                key={cup.id}
                type="button"
                onClick={() => setActiveCupId(cup.id)}
                className={[
                  "friendly-tab-card",
                  (activeCup?.id ?? cups[0]?.id) === cup.id
                    ? "friendly-tab-card--active"
                    : "friendly-tab-card--inactive",
                ].join(" ")}
              >
                {cup.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-4xl">
        <div
          className={[
            "friendly-hero friendly-hero--cup",
            heroRound ? "" : "friendly-hero--empty",
          ].join(" ")}
        >
          <div className="friendly-hero__content">
            <div
              className={[
                "friendly-hero__panel",
                heroRound ? "" : "friendly-hero__panel--empty",
              ].join(" ")}
            >
              {heroRound ? (
                <div className="friendly-hero__panel-header">
                  <div className="friendly-hero__panel-logo-wrap friendly-hero__panel-logo-wrap--cup">
                    <img
                      src="/icons/LOGFCOUP.png"
                      alt="Coupe"
                      className="friendly-hero__panel-logo"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={openWizard}
                    className="friendly-hero__cta"
                  >
                    Prochain tour
                  </button>
                </div>
              ) : null}

              {heroRound ? (
                <div className="friendly-hero__panel-title-row">
                  <div className="friendly-hero__panel-title">{heroLabel}</div>
                  <span
                    className="friendly-hero__panel-line"
                    aria-hidden="true"
                  />
                </div>
              ) : null}

              {heroRound ? (
                <>
                  <div className="mb-2 flex justify-center">
                    <span className="cup-hero-badge">
                      Élimination directe
                    </span>
                  </div>
                  <div className="friendly-hero__teams">
                    {heroMatch ? (
                      <>
                        <div className="friendly-hero__team friendly-hero__team--home">
                          <div className="friendly-hero__team-name">
                            {heroMatch.homeTeam}
                          </div>
                        </div>
                        <div className="friendly-hero__vs">VS</div>
                        <div className="friendly-hero__team friendly-hero__team--away">
                          <div className="friendly-hero__team-name">
                            {heroMatch.awayTeam}
                          </div>
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-white/60">
                        Aucune rencontre enregistrée
                      </span>
                    )}
                  </div>

                  <div className="friendly-hero__meta-line">
                    <span className="friendly-hero__meta-pill">
                      {formatShortDate(heroRound.date)}
                    </span>
                    <span className="friendly-hero__meta-pill">
                      {heroRound.name}
                    </span>
                    <span className="friendly-hero__meta-pill">
                      {heroRound.time || "--:--"}
                    </span>
                  </div>
                </>
              ) : (
                <div className="friendly-hero__empty">
                  <p className="friendly-hero__empty-title">
                    Créer ta coupe
                  </p>
                  <div className="friendly-hero__empty-circle">
                    <img
                      src="/icons/LOGFCOUP.png"
                      alt=""
                      className="friendly-hero__badge-logo"
                    />
                    <button
                      type="button"
                      onClick={openWizard}
                      className="friendly-hero__cta"
                    >
                      Créer un tour
                    </button>
                  </div>
                  <p className="friendly-hero__empty-note">
                    Aucun tour créé pour le moment
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-6 w-full max-w-4xl">
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {[
            { key: "upcoming", label: "Match à venir" },
            { key: "past", label: "Match passé" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() =>
                setMatchesTab(tab.key as "upcoming" | "past")
              }
              className={[
                "friendly-tab-card",
                matchesTab === tab.key
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
              Aucun match disponible pour cette vue.
            </p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:overflow-x-auto sm:pb-2">
              {listToShow.map((match) => {
                const date = buildMatchDateTime(match.date, match.time);
                const tone =
                  date && date.getTime() < Date.now()
                    ? "past"
                    : "upcoming";
                return renderMatchCard(
                  match.roundId ?? "",
                  match,
                  tone,
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
                Créer un tour de coupe
              </h2>
              <span className="mt-2 block h-px w-16 bg-violet-400/70" />
            </div>

            <div className="mt-6 space-y-4 text-center">
              <div>
                <label className="flex items-center justify-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[#f2f0ff] drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]">
                  Nom de la coupe
                </label>
                <div className="relative mt-2.5">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-60 blur-[12px]"
                  />
                  <input
                    type="text"
                    value={draft.cupName}
                    onChange={(event) =>
                      setDraft({ ...draft, cupName: event.target.value })
                    }
                    placeholder="Coupe de France"
                    className={`relative z-10 w-full rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-2 text-xs text-[#f2f0ff] shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus:ring-1 focus:ring-violet-400/50 focus:animate-[friendlyBreath_2.8s_ease-in-out_infinite] focus:bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)] ${
                      cupNameValid
                        ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)]"
                        : ""
                    }`}
                  />
                  {cupNameValid ? (
                    <span className="pointer-events-none absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
                  ) : null}
                </div>
              </div>

              <div>
                <label className="flex items-center justify-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[#f2f0ff] drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]">
                  Tour
                </label>
                <div className="relative mt-2.5">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-60 blur-[12px]"
                  />
                  <input
                    type="text"
                    value={draft.roundName}
                    onChange={(event) =>
                      setDraft({ ...draft, roundName: event.target.value })
                    }
                    placeholder="1er tour"
                    className={`relative z-10 w-full rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-2 text-xs text-[#f2f0ff] shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus:ring-1 focus:ring-violet-400/50 focus:animate-[friendlyBreath_2.8s_ease-in-out_infinite] focus:bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)] ${
                      roundNameValid
                        ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)]"
                        : ""
                    }`}
                  />
                  {roundNameValid ? (
                    <span className="pointer-events-none absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
                  ) : null}
                </div>
              </div>

              <div>
                <label className="flex items-center justify-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[#f2f0ff] drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]">
                  Équipes du tour
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
            </div>

            <div className="mt-8 border-t border-white/5 pt-6">
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleCreateRound}
                  disabled={!canCreate}
                  className="rounded-full bg-violet-600 px-4 py-2 text-xs font-medium text-white shadow-[0_8px_22px_rgba(0,0,0,0.35)] transition hover:bg-violet-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Créer le tour
                </button>
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
                    Détails du match de coupe
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
                    onClick={handleDeleteCupMatch}
                    className="rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20"
                  >
                    Supprimer
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDetails}
                    className="rounded-full bg-violet-600 px-5 py-2 text-xs font-medium text-white shadow-[0_10px_24px_rgba(15,23,42,0.35)] transition hover:bg-violet-500 active:scale-95"
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
