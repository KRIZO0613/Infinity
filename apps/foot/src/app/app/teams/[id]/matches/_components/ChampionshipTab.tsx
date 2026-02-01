"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabaseClient";
import {
  searchExternalClubs,
  type ExternalClub,
} from "@/lib/api/externalClubs";

type ChampionshipMatch = {
  id: string;
  homeAway: "home" | "away";
  opponent: string;
  date: string;
  time: string;
  score?: string;
  homeTeam?: string;
  awayTeam?: string;
};

type ChampionshipDay = {
  id: string;
  name: string;
  date: string;
  matches: ChampionshipMatch[];
};

type ChampionshipUI = {
  name: string;
  season: string;
  kind: "championship" | "cup" | "tournament";
  teams: ChampionshipTeam[];
  status: "draft" | "published";
  pool: string;
};

type ChampionshipTeam = {
  id: string;
  name: string;
  locked?: boolean;
};

type TeamInfo = {
  name: string | null;
  category: string | null;
  level: string | null;
  clubName: string | null;
};

type ChampionshipTabProps = {
  teamId: string;
};

type WizardStep = 1 | 2 | 3;

type WizardMode = "create" | "edit";

type StepDirection = "forward" | "backward";

type DayMatchDraft = {
  id: string;
  homeAway: "home" | "away";
  opponent: string;
  opponentId: string | null;
  opponentSource: "pool" | "external" | "custom";
};

type DayWizardStep = 1 | 2 | 3;

type ChampionshipStorageData = {
  championship?: ChampionshipUI;
  days?: ChampionshipDay[];
};

const kindLabels: Record<ChampionshipUI["kind"], string> = {
  championship: "Championnat",
  cup: "Coupe",
  tournament: "Tournoi",
};

const pouleOptions = Array.from({ length: 26 }, (_, index) =>
  String.fromCharCode(65 + index),
);

const getCurrentSeason = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

const buildId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const normalizeLevelValue = (value: string | null) => {
  if (!value) return null;
  return value.replace(/^\s*(niv(?:eau)?\.?)\s*/i, "").trim() || null;
};

const formatDayCompact = (date: Date) => {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
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

function StepPanel({
  children,
  direction,
}: {
  children: React.ReactNode;
  direction: StepDirection;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={[
        "transition-all duration-300 ease-out",
        ready
          ? "opacity-100 translate-x-0"
          : direction === "forward"
          ? "opacity-0 translate-x-6"
          : "opacity-0 -translate-x-6",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

type OpponentComboboxProps = {
  value: string;
  poolTeams: string[];
  teamName: string;
  onSelect: (selection: {
    name: string;
    id: string | null;
    source: "pool" | "external" | "custom";
  }) => void;
};

function OpponentCombobox({
  value,
  poolTeams,
  teamName,
  onSelect,
}: OpponentComboboxProps) {
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
    if (!open) {
      return;
    }
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      const data = await searchExternalClubs(trimmed);
      setResults(data);
      setLoading(false);
    }, 250);
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [query, open]);

  const filteredPoolTeams = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return poolTeams.filter((team) => {
      if (team === teamName) return false;
      if (!normalizedQuery) return true;
      return team.toLowerCase().includes(normalizedQuery);
    });
  }, [poolTeams, query, teamName]);

  const poolSet = useMemo(() => {
    return new Set(poolTeams.map((team) => team.toLowerCase()));
  }, [poolTeams]);

  const filteredExternal = useMemo(() => {
    return results.filter(
      (club) => !poolSet.has(club.name.toLowerCase()),
    );
  }, [results, poolSet]);

  const handleSelect = (selection: {
    name: string;
    id: string | null;
    source: "pool" | "external" | "custom";
  }) => {
    onSelect(selection);
    setQuery(selection.name);
    setOpen(false);
  };

  return (
    <div className="relative">
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
        className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
      />

      {open ? (
        <div className="absolute left-0 right-0 z-20 mt-2 max-h-56 overflow-y-auto rounded-2xl border border-white/10 bg-[#0f111b] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
          {filteredPoolTeams.length > 0 ? (
            <div className="mb-2">
              <p className="px-2 pb-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Dans ta poule
              </p>
              <div className="space-y-1">
                {filteredPoolTeams.map((team) => (
                  <button
                    key={team}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() =>
                      handleSelect({ name: team, id: null, source: "pool" })
                    }
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/5"
                  >
                    <span className="font-semibold">{team}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">
                      Dans ta poule
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {loading ? (
            <p className="px-3 py-2 text-xs text-slate-400">
              Recherche en cours…
            </p>
          ) : null}

          {!loading &&
          filteredExternal.length === 0 &&
          filteredPoolTeams.length === 0 ? (
            hasMinChars ? (
              <p className="px-3 py-2 text-xs text-slate-400">
                Aucun club ne correspond à cette recherche. Essaie un autre nom
                ou une autre ville.
              </p>
            ) : (
              <p className="px-3 py-2 text-xs text-slate-400">
                Tape au moins 2 lettres pour chercher un club.
              </p>
            )
          ) : null}

          {filteredExternal.length > 0 ? (
            <div className="space-y-1">
              {filteredExternal.map((club) => (
                <button
                  key={club.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    handleSelect({
                      name: club.name,
                      id: club.id,
                      source: "external",
                    })
                  }
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

type TeamSearchDropdownProps = {
  onSelect: (selection: { name: string; id: string | null }) => void;
  existingTeams?: string[];
};

function TeamSearchDropdown({
  onSelect,
  existingTeams = [],
}: TeamSearchDropdownProps) {
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
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      const data = await searchExternalClubs(trimmed);
      setResults(data);
      setLoading(false);
    }, 250);
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [query, open]);

  const existingSet = useMemo(() => {
    return new Set(existingTeams.map((team) => team.toLowerCase()));
  }, [existingTeams]);

  const handleSelect = (club: { name: string; id: string | null }) => {
    onSelect(club);
    setQuery("");
    setOpen(true);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
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
        className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
        ref={inputRef}
      />

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
            {results.map((club) => {
              const isExisting = existingSet.has(club.name.toLowerCase());
              return (
                <button
                  key={club.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (isExisting) return;
                    handleSelect({ name: club.name, id: club.id });
                  }}
                  className={[
                    "flex w-full flex-col rounded-xl px-3 py-2 text-left text-sm text-slate-100 transition",
                    isExisting
                      ? "cursor-not-allowed opacity-70"
                      : "hover:bg-white/5",
                  ].join(" ")}
                  aria-disabled={isExisting}
                >
                  <span className="font-semibold">{club.name}</span>
                  <span className="text-xs text-slate-400">
                    {[club.city, club.district].filter(Boolean).join(" · ")}
                  </span>
                  {isExisting ? (
                    <span className="mt-1 w-fit rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">
                      Déjà ajouté
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ChampionshipTab({ teamId }: ChampionshipTabProps) {
  const [teamInfo, setTeamInfo] = useState<TeamInfo>({
    name: null,
    category: null,
    level: null,
    clubName: null,
  });
  const [championship, setChampionship] = useState<ChampionshipUI | null>(null);
  const [days, setDays] = useState<ChampionshipDay[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardMode, setWizardMode] = useState<WizardMode>("create");
  const [draft, setDraft] = useState<ChampionshipUI | null>(null);
  const [addingTeam, setAddingTeam] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [widgetTab, setWidgetTab] = useState<
    "general" | "teams" | "ranking" | "results"
  >("general");
  const [widgetAddingTeam, setWidgetAddingTeam] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<ChampionshipUI | null>(
    null,
  );
  const [settingsAddingTeam, setSettingsAddingTeam] = useState(false);
  const [resultsFilter, setResultsFilter] = useState<"all" | "mine">("all");

  const [dayWizardOpen, setDayWizardOpen] = useState(false);
  const [dayWizardStep, setDayWizardStep] = useState<DayWizardStep>(1);
  const [dayDate, setDayDate] = useState<Date>(new Date());
  const [dayMatches, setDayMatches] = useState<DayMatchDraft[]>([]);

  const prevStepRef = useRef<WizardStep>(wizardStep);
  const prevDayStepRef = useRef<DayWizardStep>(dayWizardStep);
  const dayInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTeamInfo() {
      if (!teamId) return;
      const { data, error } = await supabase
        .from("teams")
        .select("name,category,level,club_id,custom_fields")
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

      const customFields = Array.isArray(data?.custom_fields)
        ? (data?.custom_fields as Array<{
            key?: string | null;
            label?: string;
            value?: string;
          }>)
        : [];
      const customLevel =
        customFields.find((field) => field.key === "level")?.value ??
        customFields.find((field) => field.label?.toLowerCase() === "niveau")
          ?.value ??
        null;

      setTeamInfo({
        name: data?.name ?? null,
        category: data?.category ?? null,
        level: data?.level ?? customLevel ?? null,
        clubName,
      });
    }

    loadTeamInfo();

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  useEffect(() => {
    let cancelled = false;

    async function loadChampionship() {
      if (!teamId) return;
      const { data, error } = await supabase
        .from("championships")
        .select("data")
        .eq("team_id", teamId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error(
          "Erreur chargement championnat:",
          error.message ?? error,
        );
        return;
      }

      if (!data?.data) return;

      const stored = data.data as ChampionshipStorageData;
      const storedChampionship = stored?.championship ?? null;
      const storedDays = Array.isArray(stored?.days)
        ? (stored?.days as ChampionshipDay[])
        : [];

      if (storedChampionship) {
        setChampionship(storedChampionship);
        setDays(storedDays);
      }
    }

    loadChampionship();

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  useEffect(() => {
    prevStepRef.current = wizardStep;
  }, [wizardStep]);

  useEffect(() => {
    prevDayStepRef.current = dayWizardStep;
  }, [dayWizardStep]);

  const stepDirection: StepDirection =
    wizardStep >= prevStepRef.current ? "forward" : "backward";
  const dayStepDirection: StepDirection =
    dayWizardStep >= prevDayStepRef.current ? "forward" : "backward";

  const teamDisplayName = useMemo(() => {
    const baseName =
      teamInfo.clubName ?? teamInfo.name ?? teamInfo.category ?? "Mon équipe";
    const levelValue = normalizeLevelValue(teamInfo.level);
    const levelSuffix = levelValue ? ` Niv ${levelValue}` : "";
    return `${baseName}${levelSuffix}`.trim();
  }, [teamInfo]);

  const teamLabel = useMemo(() => {
    return teamInfo.clubName ?? teamInfo.name ?? "Mon équipe";
  }, [teamInfo]);

  const clubInitials = useMemo(() => {
    const label = teamLabel.trim();
    if (!label) return "";
    const parts = label.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return label.slice(0, 2).toUpperCase();
  }, [teamLabel]);

  const parseScore = (score?: string) => {
    if (!score) return null;
    const match = score.match(/(\d+)\s*-\s*(\d+)/);
    if (!match) return null;
    return {
      home: Number(match[1]),
      away: Number(match[2]),
    };
  };

  const getTeamInitials = (name: string) => {
    const label = name.trim();
    if (!label) return "";
    const parts = label.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return label.slice(0, 2).toUpperCase();
  };

  const championshipSubtitle = useMemo(() => {
    const category = teamInfo.category ?? teamInfo.name ?? "U12";
    const levelValue = normalizeLevelValue(teamInfo.level);
    const subtitle = levelValue
      ? `${category} — NIVEAU ${levelValue}`
      : `${category}`;
    return subtitle.toUpperCase();
  }, [teamInfo]);

  const provisionalRanking = useMemo(() => {
    if (!championship) return [];
    return championship.teams.map((team, index) => ({
      rank: index + 1,
      name: team.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
      initials: getTeamInitials(team.name),
    }));
  }, [championship]);

  const seasonLabel = useMemo(() => {
    return championship?.season
      ? `Saison ${championship.season}`
      : "Saison en cours";
  }, [championship?.season]);

  const resultsDays = useMemo(() => {
    if (!days.length) return [];
    return days
      .map((day) => {
        const matches =
          resultsFilter === "mine"
            ? day.matches.filter((match) => match.opponent?.trim())
            : day.matches;
        return { ...day, matches };
      })
      .filter((day) => day.matches.length > 0);
  }, [days, resultsFilter]);

  const demoResultsDays = useMemo(() => {
    if (!championship) return [];
    const today = new Date();
    const firstDay = new Date(today);
    firstDay.setDate(firstDay.getDate() - 7);
    const secondDay = new Date(today);
    const teamA = championship.teams[0]?.name ?? "Équipe A";
    const teamB = championship.teams[1]?.name ?? "Équipe B";
    const teamC = championship.teams[2]?.name ?? "Équipe C";
    const teamD = championship.teams[3]?.name ?? "Équipe D";
    return [
      {
        id: "demo-day-2",
        name: "Journée 2",
        date: secondDay.toISOString(),
        matches: [
          {
            id: "demo-m-2",
            homeAway: "home",
            opponent: teamB,
            date: secondDay.toISOString(),
            time: "18:00",
            score: "3 - 1",
            homeTeam: teamA,
            awayTeam: teamB,
          },
          {
            id: "demo-m-3",
            homeAway: "away",
            opponent: teamC,
            date: secondDay.toISOString(),
            time: "19:15",
            score: "1 - 1",
            homeTeam: teamC,
            awayTeam: teamD,
          },
          {
            id: "demo-m-4",
            homeAway: "home",
            opponent: teamD,
            date: secondDay.toISOString(),
            time: "20:30",
            score: "2 - 0",
            homeTeam: teamA,
            awayTeam: teamD,
          },
        ],
      },
      {
        id: "demo-day-1",
        name: "Journée 1",
        date: firstDay.toISOString(),
        matches: [
          {
            id: "demo-m-1",
            homeAway: "home",
            opponent: teamC,
            date: firstDay.toISOString(),
            time: "17:30",
            score: "2 - 2",
            homeTeam: teamA,
            awayTeam: teamC,
          },
          {
            id: "demo-m-5",
            homeAway: "away",
            opponent: teamB,
            date: firstDay.toISOString(),
            time: "18:45",
            score: "0 - 1",
            homeTeam: teamD,
            awayTeam: teamB,
          },
        ],
      },
    ];
  }, [championship]);

  const displayResultsDays = days.length ? resultsDays : demoResultsDays;
  const sortedResultsDays = useMemo(() => {
    return [...displayResultsDays].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [displayResultsDays]);
  const latestResultsDay = sortedResultsDays[0];
  const otherResultsDays = sortedResultsDays.slice(1);

  const teamOptions = useMemo(() => {
    if (championship?.teams?.length) {
      return championship.teams.map((team) => team.name);
    }
    if (draft?.teams?.length) {
      return draft.teams.map((team) => team.name);
    }
    return teamDisplayName ? [teamDisplayName] : [];
  }, [championship, draft, teamDisplayName]);

  const defaultOpponent = useMemo(() => {
    return (
      teamOptions.find((team) => team !== teamDisplayName) ??
      teamOptions[0] ??
      ""
    );
  }, [teamOptions, teamDisplayName]);

  const canCreate = Boolean(draft?.name?.trim()) && (draft?.teams.length ?? 0) >= 2;
  const canSaveSettings =
    Boolean(settingsDraft?.name?.trim()) &&
    Boolean(settingsDraft?.season?.trim()) &&
    Boolean(settingsDraft?.pool?.trim()) &&
    (settingsDraft?.teams.length ?? 0) >= 2;

  const buildDefaultDraft = (): ChampionshipUI => {
    const season = getCurrentSeason();
    const category = teamInfo.category ?? "U12";
    const levelValue = normalizeLevelValue(teamInfo.level);
    const levelLabel = levelValue ? `NIV ${levelValue}` : "NIV ?";
    return {
      name: `${category} – ${levelLabel}`,
      season,
      kind: "championship",
      status: "draft",
      pool: "A",
      teams: [
        {
          id: "local",
          name: teamLabel,
          locked: true,
        },
      ],
    };
  };

  const openWizard = (mode: WizardMode) => {
    setWizardMode(mode);
    setWizardStep(mode === "edit" ? 3 : 1);
    setEditingName(false);
    setAddingTeam(false);
    if (mode === "edit" && championship) {
      setDraft({ ...championship });
    } else {
      setDraft(buildDefaultDraft());
    }
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setDraft(null);
    setEditingName(false);
    setAddingTeam(false);
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

  const persistChampionship = async (
    nextChampionship: ChampionshipUI,
    nextDays: ChampionshipDay[],
  ) => {
    if (!teamId) return false;
    const payload = {
      team_id: teamId,
      data: {
        championship: nextChampionship,
        days: nextDays,
      },
      updated_at: new Date().toISOString(),
    };
    try {
      const { data, error } = await supabase
        .from("championships")
        .upsert(payload, { onConflict: "team_id" })
        .select("data")
        .maybeSingle();

      if (error) {
        console.error(
          "Erreur sauvegarde championnat:",
          error.message ?? error,
        );
        return false;
      }

      const stored = (data?.data ?? payload.data) as ChampionshipStorageData;
      const storedChampionship = stored?.championship ?? nextChampionship;
      const storedDays = Array.isArray(stored?.days)
        ? (stored?.days as ChampionshipDay[])
        : nextDays;

      setChampionship(storedChampionship);
      setDays(storedDays);
      return true;
    } catch (error) {
      const err = error as Error;
      console.error("Erreur sauvegarde championnat:", err?.message ?? error);
      return false;
    }
  };

  const openSettings = () => {
    if (!championship) return;
    openWizard("edit");
  };

  const closeSettings = () => {
    setSettingsOpen(false);
    setSettingsDraft(null);
    setSettingsAddingTeam(false);
  };

  const handleSettingsAddTeam = (selection: {
    name: string;
    id: string | null;
  }) => {
    if (!settingsDraft) return;
    if (
      settingsDraft.teams.some(
        (team) =>
          team.name.toLowerCase() === selection.name.toLowerCase(),
      )
    ) {
      return;
    }
    setSettingsDraft({
      ...settingsDraft,
      teams: [
        ...settingsDraft.teams,
        {
          id: selection.id ?? buildId(),
          name: selection.name,
          locked: false,
        },
      ],
    });
  };

  const handleSettingsRemoveTeam = (teamIdToRemove: string) => {
    if (!settingsDraft) return;
    setSettingsDraft({
      ...settingsDraft,
      teams: settingsDraft.teams.filter(
        (team) => team.id !== teamIdToRemove || team.locked,
      ),
    });
  };

  const handleSaveSettings = async () => {
    if (!settingsDraft) return;
    const didSave = await persistChampionship(settingsDraft, days);
    if (didSave) {
      closeSettings();
    }
  };

  const handleWidgetAddTeam = async (selection: {
    name: string;
    id: string | null;
  }) => {
    if (!championship) return;
    if (
      championship.teams.some(
        (team) =>
          team.name.toLowerCase() === selection.name.toLowerCase(),
      )
    ) {
      return;
    }
    const nextChampionship = {
      ...championship,
      teams: [
        ...championship.teams,
        {
          id: selection.id ?? buildId(),
          name: selection.name,
          locked: false,
        },
      ],
    };
    setChampionship(nextChampionship);
    await persistChampionship(nextChampionship, days);
  };

  const handleWidgetRemoveTeam = async (teamIdToRemove: string) => {
    if (!championship) return;
    const target = championship.teams.find(
      (team) => team.id === teamIdToRemove,
    );
    if (!target || target.locked) return;
    const nextTeams = championship.teams.filter(
      (team) => team.id !== teamIdToRemove,
    );
    if (nextTeams.length < 2) {
      console.warn("Impossible de retirer la dernière équipe.");
      return;
    }
    const nextChampionship = { ...championship, teams: nextTeams };
    setChampionship(nextChampionship);
    await persistChampionship(nextChampionship, days);
  };

  const handleCreateChampionship = async () => {
    if (!draft || !canCreate || !teamId) return;
    const didSave = await persistChampionship(draft, days);
    if (didSave) {
      setWizardOpen(false);
      setDraft(null);
    }
  };

  const handleDeleteChampionship = async () => {
    if (!teamId) return;
    try {
      const { error } = await supabase
        .from("championships")
        .delete()
        .eq("team_id", teamId);

      if (error) {
        console.error(
          "Erreur suppression championnat:",
          error.message ?? error,
        );
        return;
      }

      setChampionship(null);
      setDays([]);
    } catch (error) {
      const err = error as Error;
      console.error("Erreur suppression championnat:", err?.message ?? error);
    }
  };

  const shiftPool = (direction: "prev" | "next") => {
    if (!draft) return;
    const currentIndex = pouleOptions.indexOf(draft.pool);
    const nextIndex =
      direction === "prev"
        ? (currentIndex - 1 + pouleOptions.length) % pouleOptions.length
        : (currentIndex + 1) % pouleOptions.length;
    setDraft({ ...draft, pool: pouleOptions[nextIndex] });
  };

  const openDayWizard = () => {
    if (!championship) return;
    setDayDate(new Date());
    setDayMatches([
      {
        id: buildId(),
        homeAway: "home",
        opponent: defaultOpponent,
        opponentId: null,
        opponentSource: defaultOpponent ? "pool" : "custom",
      },
    ]);
    setDayWizardStep(1);
    setDayWizardOpen(true);
  };

  const closeDayWizard = () => {
    setDayWizardOpen(false);
    setDayWizardStep(1);
    setDayMatches([]);
  };

  const shiftDayDate = (delta: number) => {
    setDayDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + delta);
      return next;
    });
  };

  const dayInputValue = useMemo(() => {
    const year = dayDate.getFullYear();
    const month = `${dayDate.getMonth() + 1}`.padStart(2, "0");
    const day = `${dayDate.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, [dayDate]);

const handlePickDay = () => {
  // on sort la ref dans une constante bien typée
  const input = dayInputRef.current as HTMLInputElement | null;
  if (!input) return;

  // showPicker n'est pas encore bien typé partout → on le cast en any
  const maybePicker = (input as any).showPicker as (() => void) | undefined;

  if (typeof maybePicker === "function") {
    maybePicker();
  } else {
    // fallback classique : focus + "ouverture" via click
    input.focus();
    input.click();
  }
};

  const addMatchDraft = () => {
    setDayMatches((prev) => [
      ...prev,
      {
        id: buildId(),
        homeAway: "home",
        opponent: defaultOpponent,
        opponentId: null,
        opponentSource: defaultOpponent ? "pool" : "custom",
      },
    ]);
  };

  const updateMatch = (
    matchId: string,
    updates: Partial<DayMatchDraft>,
  ) => {
    setDayMatches((prev) =>
      prev.map((match) =>
        match.id === matchId ? { ...match, ...updates } : match,
      ),
    );
  };

  const canValidateDay =
    dayMatches.length > 0 &&
    dayMatches.every((match) => match.opponent.trim().length > 0);

  const handleValidateDay = async () => {
    if (!championship || !canValidateDay) return;
    const nextDay: ChampionshipDay = {
      id: buildId(),
      name: `Journée ${days.length + 1}`,
      date: dayDate.toISOString(),
      matches: dayMatches.map((match) => {
        const opponentName = match.opponent || "Adversaire";
        const isHome = match.homeAway === "home";
        return {
          id: buildId(),
          homeAway: match.homeAway,
          opponent: opponentName,
          date: dayDate.toISOString(),
          time: "18:00",
        };
      }),
    };
    const nextDays = [...days, nextDay];
    setDays(nextDays);
    await persistChampionship(championship, nextDays);
    closeDayWizard();
  };

  return (
    <div className="space-y-6">
      {!championship ? (
        <div className="rounded-3xl border border-white/10 bg-black/30 p-6 text-slate-200">
          <h2 className="text-lg font-semibold text-slate-100">
            Aucun championnat pour cette équipe
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Crée ton championnat {teamInfo.category ?? "U12"} pour la saison en
            cours.
          </p>
          <button
            type="button"
            onClick={() => openWizard("create")}
            className="mt-4 w-fit rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/20"
          >
            Créer un championnat
          </button>
        </div>
      ) : (
        <div
          className="championship-card relative overflow-hidden rounded-3xl border border-white/10 shadow-[0_22px_60px_rgba(0,0,0,0.5)]"
          style={{
            backgroundImage:
              "url('/backgrounds/MATCH/backgroundchampionish.png')",
            backgroundSize: "cover",
            backgroundPosition: "50% 50%",
          }}
        >
          <div className="absolute inset-0 bg-black/25" />
          <div className="championship-lines pointer-events-none absolute inset-0 opacity-15" />
          <div className="relative p-6 text-white">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setWidgetTab("general")}
                className={[
                  "flex items-center rounded-full px-4 py-2 text-xs font-semibold transition backdrop-blur-sm",
                  widgetTab === "general"
                    ? "border border-[#7c3aed]/40 bg-[#7c3aed]/15 text-white shadow-[inset_0_0_12px_rgba(124,58,237,0.35)]"
                    : "border border-white/15 bg-transparent text-slate-300 hover:border-white/25 hover:text-slate-100",
                ].join(" ")}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="mr-2 h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                Aperçu
              </button>
              <button
                type="button"
                onClick={() => setWidgetTab("teams")}
                className={[
                  "flex items-center rounded-full px-4 py-2 text-xs font-semibold transition backdrop-blur-sm",
                  widgetTab === "teams"
                    ? "border border-[#7c3aed]/40 bg-[#7c3aed]/15 text-white shadow-[inset_0_0_12px_rgba(124,58,237,0.35)]"
                    : "border border-white/15 bg-transparent text-slate-300 hover:border-white/25 hover:text-slate-100",
                ].join(" ")}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="mr-2 h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="8" cy="8" r="3" />
                  <circle cx="16" cy="8" r="3" />
                  <path d="M3 21c0-3.2 3.1-5 5-5" />
                  <path d="M21 21c0-3.2-3.1-5-5-5" />
                </svg>
                Équipes
              </button>
              <button
                type="button"
                onClick={() => setWidgetTab("ranking")}
                className={[
                  "flex items-center rounded-full px-4 py-2 text-xs font-semibold transition backdrop-blur-sm",
                  widgetTab === "ranking"
                    ? "border border-[#7c3aed]/40 bg-[#7c3aed]/15 text-white shadow-[inset_0_0_12px_rgba(124,58,237,0.35)]"
                    : "border border-white/15 bg-transparent text-slate-300 hover:border-white/25 hover:text-slate-100",
                ].join(" ")}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="mr-2 h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 20v-7" />
                  <path d="M10 20V6" />
                  <path d="M16 20v-4" />
                  <path d="M22 20H2" />
                </svg>
                Classement
              </button>
              <button
                type="button"
                onClick={() => setWidgetTab("results")}
                className={[
                  "flex items-center rounded-full px-4 py-2 text-xs font-semibold transition backdrop-blur-sm",
                  widgetTab === "results"
                    ? "border border-[#7c3aed]/40 bg-[#7c3aed]/15 text-white shadow-[inset_0_0_12px_rgba(124,58,237,0.35)]"
                    : "border border-white/15 bg-transparent text-slate-300 hover:border-white/25 hover:text-slate-100",
                ].join(" ")}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="mr-2 h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 7h16" />
                  <path d="M4 12h16" />
                  <path d="M4 17h10" />
                  <circle cx="18" cy="17" r="2" />
                </svg>
                Résultats
              </button>
            </div>

            <div className="relative mt-6">
              <div className="pointer-events-none absolute inset-x-0 -top-6 h-24 bg-gradient-to-r from-transparent via-white/15 to-transparent blur-xl" />
              <div className="relative flex w-full flex-col items-center text-center">
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-[70%] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/35 blur-xl" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-[55%] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/25 blur-lg" />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 opacity-12"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.7)",
                    WebkitMaskImage: "url('/icons/BALLONS.jpg')",
                    WebkitMaskSize: "contain",
                    WebkitMaskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                    maskImage: "url('/icons/BALLONS.jpg')",
                    maskSize: "contain",
                    maskRepeat: "no-repeat",
                    maskPosition: "center",
                    maskMode: "luminance",
                  }}
                />
                <div className="relative z-10 flex w-full items-center gap-4">
                  <div className="flex flex-1 items-center">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/35 to-white/20" />
                    <span className="ml-2 h-2 w-2 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.6)]" />
                  </div>
                  <div className="flex flex-col items-center">
                    <h2
                      className="championship-title text-3xl font-semibold uppercase tracking-[0.28em] text-white md:text-4xl"
                      style={{
                        fontFamily:
                          '"Trajan Pro", "Cinzel", "Times New Roman", serif',
                      }}
                    >
                      CHAMPIONNAT
                    </h2>
                    <p
                      className="mt-3 text-sm uppercase tracking-[0.24em] text-white/80 md:text-base"
                      style={{
                        fontFamily:
                          '"Manrope", "Montserrat", "Segoe UI", sans-serif',
                        textShadow: "0 0 10px rgba(139,92,246,0.2)",
                      }}
                    >
                      {championshipSubtitle}
                    </p>
                    <div className="mt-3 flex items-center justify-center gap-3 text-xs text-white/70">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-white/10 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85 shadow-[inset_0_0_10px_rgba(255,255,255,0.12)]">
                        {clubInitials}
                      </span>
                      <span className="text-sm text-white/75">
                        {teamLabel}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-1 items-center justify-end">
                    <span className="mr-2 h-2 w-2 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.6)]" />
                    <div className="h-px flex-1 bg-gradient-to-l from-transparent via-white/35 to-white/20" />
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={openSettings}
              className="absolute right-4 top-4 rounded-full p-2 text-white/90 transition hover:text-white"
              aria-label="Paramètres du championnat"
              title="Paramètres"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-6 w-6 text-white"
                fill="currentColor"
              >
                <circle cx="6" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="18" cy="12" r="1.6" />
              </svg>
            </button>

            <div className="mt-6 border-t border-white/20 pt-4">
              {widgetTab === "ranking" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border-l-2 border-violet-400/60 bg-violet-500/5 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-violet-300">
                      Classement
                    </p>
                    <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[10px] text-violet-200">
                      Provisoire
                    </span>
                  </div>
                  <div className="rounded-2xl p-4">
                    <div className="grid grid-cols-[22px_1fr_repeat(8,auto)] items-center gap-x-2 text-[10px] uppercase tracking-[0.24em] text-violet-200/60">
                      <span>#</span>
                      <span>Équipe</span>
                      <span className="text-right">MJ</span>
                      <span className="text-right">V</span>
                      <span className="text-right">N</span>
                      <span className="text-right">D</span>
                      <span className="text-right">Pts</span>
                      <span className="hidden text-right sm:inline">BP</span>
                      <span className="hidden text-right sm:inline">BC</span>
                      <span className="hidden text-right sm:inline">Diff</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {provisionalRanking.map((row) => (
                        <div
                          key={row.name}
                          className="grid grid-cols-[22px_1fr_repeat(8,auto)] items-center gap-x-2 rounded-xl px-3 py-2 text-xs text-violet-100/80"
                        >
                          <span className="text-violet-200/50 tabular-nums">
                            {row.rank}
                          </span>
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-violet-400/30 bg-white/8 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-100/80 shadow-[inset_0_0_8px_rgba(124,58,237,0.18)]">
                              {row.initials}
                            </span>
                            <span className="truncate text-violet-100/85">
                              {row.name}
                            </span>
                          </div>
                          <span className="text-right tabular-nums">
                            {row.played}
                          </span>
                          <span className="text-right tabular-nums">
                            {row.wins}
                          </span>
                          <span className="text-right tabular-nums">
                            {row.draws}
                          </span>
                          <span className="text-right tabular-nums">
                            {row.losses}
                          </span>
                          <span className="text-right font-semibold text-violet-100 tabular-nums">
                            {row.points}
                          </span>
                          <span className="hidden text-right tabular-nums sm:inline">
                            {row.goalsFor}
                          </span>
                          <span className="hidden text-right tabular-nums sm:inline">
                            {row.goalsAgainst}
                          </span>
                          <span className="hidden text-right tabular-nums sm:inline">
                            {row.goalDiff}
                          </span>
                        </div>
                      ))}
                      <div className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-white/50 to-transparent shadow-[0_0_6px_rgba(255,255,255,0.35)]" />
                    </div>
                  </div>
                </div>
              ) : null}
              {widgetTab === "results" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border-l-2 border-violet-400/60 bg-violet-500/5 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-violet-300">
                      Dernière journée
                    </p>
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setResultsFilter("all")}
                        className={[
                          "rounded-full border px-2.5 py-1 transition",
                          resultsFilter === "all"
                            ? "border-violet-400/40 bg-violet-500/15 text-violet-100"
                            : "border-white/15 bg-transparent text-white/60 hover:border-white/25 hover:text-white/80",
                        ].join(" ")}
                      >
                        Tous
                      </button>
                      <button
                        type="button"
                        onClick={() => setResultsFilter("mine")}
                        className={[
                          "rounded-full border px-2.5 py-1 transition",
                          resultsFilter === "mine"
                            ? "border-violet-400/40 bg-violet-500/15 text-violet-100"
                            : "border-white/15 bg-transparent text-white/60 hover:border-white/25 hover:text-white/80",
                        ].join(" ")}
                      >
                        Mon équipe
                      </button>
                    </div>
                  </div>
                  {displayResultsDays.length === 0 ? (
                    <p className="text-sm text-white/60">
                      Aucun match disponible pour le moment.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {latestResultsDay ? (
                        <div key={latestResultsDay.id} className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-white/65">
                            <span className="uppercase tracking-[0.2em] text-violet-200/70">
                              {latestResultsDay.name}
                            </span>
                            <span>
                              {formatShortDate(latestResultsDay.date)}
                            </span>
                          </div>
                          <div className="results-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
                            {latestResultsDay.matches.map((match) => {
                                const homeTeam =
                                  match.homeTeam ??
                                  (match.homeAway === "home"
                                    ? teamDisplayName
                                    : match.opponent);
                                const awayTeam =
                                  match.awayTeam ??
                                  (match.homeAway === "home"
                                    ? match.opponent
                                    : teamDisplayName);
                                return (
                                  <div
                                    key={match.id}
                                    className="min-w-[260px] shrink-0 snap-start rounded-xl px-3 py-2 text-xs text-white/80"
                                  >
                                    <div className="flex items-center justify-between text-[10px] text-white/60">
                                      <span>{match.time || "--:--"}</span>
                                      <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-violet-100/80">
                                        {match.homeAway === "home"
                                          ? "Domicile"
                                          : "Extérieur"}
                                      </span>
                                    </div>
                                    <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm text-white/85">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-violet-400/30 bg-white/8 text-[9px] font-semibold uppercase tracking-[0.14em] text-violet-100/80">
                                          {getTeamInitials(homeTeam)}
                                        </span>
                                        <span className="truncate">
                                          {homeTeam}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-white/60 tabular-nums">
                                          {match.score ?? "—"}
                                        </span>
                                        {(() => {
                                          const parsed = parseScore(match.score);
                                          if (!parsed) return null;
                                          const outcome =
                                            parsed.home > parsed.away
                                              ? "win"
                                              : parsed.home < parsed.away
                                              ? "loss"
                                              : "draw";
                                          const dotClass =
                                            outcome === "win"
                                              ? "bg-emerald-400 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                                              : outcome === "loss"
                                              ? "bg-gradient-to-br from-rose-500 to-red-900 shadow-[0_0_8px_rgba(190,24,93,0.45)]"
                                              : "bg-white/80 shadow-[0_0_6px_rgba(255,255,255,0.45)]";
                                          return (
                                            <span
                                              className={`h-2.5 w-2.5 rounded-full ${dotClass}`}
                                            />
                                          );
                                        })()}
                                      </div>
                                      <div className="flex min-w-0 items-center justify-end gap-2">
                                        <span className="truncate">
                                          {awayTeam}
                                        </span>
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-violet-400/30 bg-white/8 text-[9px] font-semibold uppercase tracking-[0.14em] text-violet-100/80">
                                          {getTeamInitials(awayTeam)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex items-center text-[11px] font-semibold text-slate-200">
              <div className="flex-1 text-left">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/70 shadow-[0_0_6px_rgba(255,255,255,0.4)]" />
                  Poule {championship.pool}
                </span>
              </div>
              <div className="flex-1 text-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/70 shadow-[0_0_6px_rgba(255,255,255,0.4)]" />
                  {seasonLabel}
                </span>
              </div>
              <div className="flex-1 text-right">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/70 shadow-[0_0_6px_rgba(255,255,255,0.4)]" />
                  {championship.teams.length} équipes
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {championship && widgetTab === "teams" ? (
        <div className="w-full rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] uppercase tracking-[0.3em] text-violet-300">
              Équipes du championnat
            </p>
            <span className="text-xs text-violet-200">
              {championship.teams.length} équipes
            </span>
          </div>
          <div className="mt-2 flex items-center">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-400/70 to-violet-400/40" />
            <span className="ml-3 h-1.5 w-1.5 rounded-full bg-violet-300 shadow-[0_0_10px_rgba(124,58,237,0.8)]" />
            <span className="ml-2 h-px w-10 bg-gradient-to-r from-violet-300/80 to-transparent" />
          </div>
          <div className="championship-teams-scroll mt-3 flex items-center overflow-x-auto pb-2">
            {championship.teams.map((team, index) => (
              <div key={team.id} className="flex items-center">
                <div className="group flex min-w-max items-center gap-2 rounded-full px-2 py-1 text-[11px] font-semibold text-violet-200/80 transition active:scale-[1.02]">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-400/30 bg-white/8 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-100/80 shadow-[inset_0_0_8px_rgba(124,58,237,0.18)] transition group-hover:scale-[1.03] group-hover:shadow-[0_0_16px_rgba(124,58,237,0.4)]">
                    {getTeamInitials(team.name)}
                  </div>
                  <span className="inline-flex items-center gap-2 whitespace-nowrap text-[11px] font-semibold text-violet-100/80 transition group-hover:text-violet-100 group-hover:[text-shadow:0_0_10px_rgba(124,58,237,0.35)]">
                    {team.locked ? (
                      <span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-violet-300 shadow-[0_0_8px_rgba(124,58,237,0.7)]" />
                    ) : null}
                    {team.name}
                  </span>
                </div>
                {index < championship.teams.length - 1 ? (
                  <span className="mx-3 flex h-5 items-center">
                    <span className="h-full w-px bg-gradient-to-b from-transparent via-violet-300/70 to-transparent shadow-[0_0_8px_rgba(124,58,237,0.6)]" />
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {championship && widgetTab === "results" ? (
        <div className="w-full rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] uppercase tracking-[0.3em] text-violet-300">
              Résultats
            </p>
            <span className="text-xs text-violet-200">
              {otherResultsDays.length} journées
            </span>
          </div>
          <div className="mt-2 flex items-center">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-400/70 to-violet-400/40" />
            <span className="ml-3 h-1.5 w-1.5 rounded-full bg-violet-300 shadow-[0_0_10px_rgba(124,58,237,0.8)]" />
            <span className="ml-2 h-px w-10 bg-gradient-to-r from-violet-300/80 to-transparent" />
          </div>
          {otherResultsDays.length === 0 ? (
            <p className="mt-3 text-xs text-violet-200/70">
              Aucune autre journée pour le moment.
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {otherResultsDays.map((day) => (
                <div key={day.id} className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-white/65">
                    <span className="uppercase tracking-[0.2em] text-violet-200/70">
                      {day.name}
                    </span>
                    <span>{formatShortDate(day.date)}</span>
                  </div>
                  <div className="results-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
                    {day.matches.map((match) => {
                      const homeTeam =
                        match.homeTeam ??
                        (match.homeAway === "home"
                          ? teamDisplayName
                          : match.opponent);
                      const awayTeam =
                        match.awayTeam ??
                        (match.homeAway === "home"
                          ? match.opponent
                          : teamDisplayName);
                      return (
                        <div
                          key={match.id}
                          className="min-w-[260px] shrink-0 snap-start rounded-xl px-3 py-2 text-xs text-white/80"
                        >
                          <div className="flex items-center justify-between text-[10px] text-white/60">
                            <span>{match.time || "--:--"}</span>
                            <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-violet-100/80">
                              {match.homeAway === "home"
                                ? "Domicile"
                                : "Extérieur"}
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm text-white/85">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-violet-400/30 bg-white/8 text-[9px] font-semibold uppercase tracking-[0.14em] text-violet-100/80">
                                {getTeamInitials(homeTeam)}
                              </span>
                              <span className="truncate">{homeTeam}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-white/60 tabular-nums">
                                {match.score ?? "—"}
                              </span>
                              {(() => {
                                const parsed = parseScore(match.score);
                                if (!parsed) return null;
                                const outcome =
                                  parsed.home > parsed.away
                                    ? "win"
                                    : parsed.home < parsed.away
                                    ? "loss"
                                    : "draw";
                                const dotClass =
                                  outcome === "win"
                                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                                    : outcome === "loss"
                                    ? "bg-gradient-to-br from-rose-500 to-red-900 shadow-[0_0_8px_rgba(190,24,93,0.45)]"
                                    : "bg-white/80 shadow-[0_0_6px_rgba(255,255,255,0.45)]";
                                return (
                                  <span
                                    className={`h-2.5 w-2.5 rounded-full ${dotClass}`}
                                  />
                                );
                              })()}
                            </div>
                            <div className="flex min-w-0 items-center justify-end gap-2">
                              <span className="truncate">{awayTeam}</span>
                              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-violet-400/30 bg-white/8 text-[9px] font-semibold uppercase tracking-[0.14em] text-violet-100/80">
                                {getTeamInitials(awayTeam)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-white/50 to-transparent shadow-[0_0_6px_rgba(255,255,255,0.35)]" />
            </div>
          )}
        </div>
      ) : null}


      {championship && (
        <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
          {days.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 text-sm text-slate-400">
              <p>
                Aucune journée créée. Clique sur “Ajouter une journée” pour
                commencer.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {days.map((day) => (
                <div
                  key={day.id}
                  className="rounded-2xl border border-white/10 bg-black/40 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">
                        {day.name}
                      </h3>
                      <p className="text-xs text-slate-400">
                        {formatShortDate(day.date)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {day.matches.map((match) => (
                      <div
                        key={match.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-slate-200"
                      >
                        <span>{match.time || "--:--"}</span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">
                          {match.homeAway === "home" ? "Domicile" : "Extérieur"}
                        </span>
                        <span className="flex-1 text-slate-100">
                          {match.homeAway === "home"
                            ? `${teamDisplayName} vs ${match.opponent}`
                            : `${match.opponent} vs ${teamDisplayName}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {championship && (
        null
      )}

      {wizardOpen && draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-black/50 shadow-[0_25px_80px_rgba(0,0,0,0.6)]"
            style={{
              backgroundImage:
                "url('/backgrounds/MATCH/FOND%20CHAMPIONNA.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="relative z-10 bg-black/55 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-300">
                    Assistant championnat
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-100">
                    {wizardStep === 1
                      ? "Créer un championnat"
                      : wizardStep === 2
                      ? "Choisis ta poule"
                      : "Équipes de la poule"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeWizard}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200"
                >
                  Fermer
                </button>
              </div>

              <StepPanel key={wizardStep} direction={stepDirection}>
                {wizardStep === 1 ? (
                  <div className="mt-6 space-y-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Nom du championnat
                        </p>
                        {editingName ? (
                          <input
                            type="text"
                            value={draft.name}
                            onChange={(event) =>
                              setDraft({ ...draft, name: event.target.value })
                            }
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-slate-100"
                          />
                        ) : (
                          <p className="mt-2 text-lg font-semibold text-slate-100">
                            {draft.name}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingName((prev) => !prev)}
                        className="mt-6 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200"
                      >
                        ✎
                      </button>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Nom de l’équipe
                      </p>
                      <p className="mt-2 text-base text-slate-100">
                        {teamLabel}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Saison
                      </p>
                      <p className="mt-2 text-base text-slate-100">
                        {draft.season}
                      </p>
                    </div>
                  </div>
                ) : null}

                {wizardStep === 2 ? (
                  <div className="mt-8 flex flex-col items-center gap-6 text-center">
                    <p className="text-2xl font-semibold text-slate-100">
                      Choisis ta poule
                    </p>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => shiftPool("prev")}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                      >
                        ◀
                      </button>
                      <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-3xl font-semibold text-slate-100">
                        {draft.pool}
                      </div>
                      <button
                        type="button"
                        onClick={() => shiftPool("next")}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                ) : null}

                {wizardStep === 3 ? (
                  <div className="mt-6 space-y-4">
                    <p className="text-sm font-semibold text-slate-100">
                      Équipes de la poule
                    </p>

                    <button
                      type="button"
                      onClick={() => setAddingTeam(true)}
                      className="w-fit rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
                    >
                      + Ajouter une équipe
                    </button>

                    {addingTeam ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <div className="w-full">
                          <TeamSearchDropdown
                            onSelect={(selection) => {
                              if (!draft) return;
                              if (
                                draft.teams.some(
                                  (team) =>
                                    team.name.toLowerCase() ===
                                    selection.name.toLowerCase(),
                                )
                              ) {
                                console.warn(
                                  "Club déjà ajouté:",
                                  selection.name,
                                );
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
                            }}
                          />
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-2 text-sm text-slate-200">
                      {draft.teams.map((team) => (
                        <div
                          key={team.id}
                          className="flex items-center justify-between"
                        >
                          <span className="flex items-center gap-2">
                            <span className="text-slate-400">•</span>
                            {team.name}
                          </span>
                          {team.locked ? (
                            <span className="text-xs text-slate-500">
                              Notre équipe
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRemoveTeam(team.id)}
                              className="text-xs text-rose-300 transition hover:text-rose-200"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <p className="text-xs text-slate-400">
                      {draft.teams.length} équipes ajoutées
                    </p>

                    {(draft.teams.length ?? 0) < 2 ? (
                      <p className="text-xs text-slate-500">
                        Ajoute au moins une équipe adverse pour créer le championnat.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </StepPanel>

              <div className="mt-8 flex items-center justify-between">
                {wizardStep === 1 ? (
                  <button
                    type="button"
                    onClick={closeWizard}
                    className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-xs text-slate-300"
                  >
                    Annuler
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setWizardStep((prev) => (prev - 1) as WizardStep)}
                    className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-xs text-slate-300"
                  >
                    Retour
                  </button>
                )}
                {wizardStep < 3 ? (
                  <button
                    type="button"
                    onClick={() => setWizardStep((prev) => (prev + 1) as WizardStep)}
                    disabled={wizardStep === 1 && !draft.name.trim()}
                    className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/20 disabled:opacity-50"
                  >
                    {wizardStep === 2 ? "Valider la poule" : "Continuer"}
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    {wizardMode === "edit" ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await handleDeleteChampionship();
                          closeWizard();
                        }}
                        className="rounded-full border border-rose-400/50 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20"
                      >
                        Supprimer le championnat
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleCreateChampionship}
                      disabled={!canCreate}
                      className={[
                        "rounded-full px-5 py-2 text-xs font-semibold transition",
                        canCreate
                          ? "border border-[#8b5cf6]/60 bg-[#8b5cf6]/30 text-white shadow-[0_10px_30px_rgba(139,92,246,0.35)] hover:bg-[#8b5cf6]/45"
                          : "border border-white/10 bg-white/10 text-slate-200 opacity-50",
                      ].join(" ")}
                    >
                      {wizardMode === "edit"
                        ? "Mettre à jour le championnat"
                        : "Créer le championnat"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {settingsOpen && settingsDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-[#0b0d18]/95 p-6 shadow-[0_28px_80px_rgba(0,0,0,0.65)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/60">
                  Paramètres du championnat
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  {settingsDraft.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeSettings}
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/80 transition hover:bg-white/20"
              >
                Fermer
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                  Nom du championnat
                </p>
                <input
                  type="text"
                  value={settingsDraft.name}
                  onChange={(event) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      name: event.target.value,
                    })
                  }
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                  Saison
                </p>
                <input
                  type="text"
                  value={settingsDraft.season}
                  onChange={(event) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      season: event.target.value,
                    })
                  }
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                  Poule
                </p>
                <select
                  value={settingsDraft.pool}
                  onChange={(event) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      pool: event.target.value,
                    })
                  }
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
                >
                  {pouleOptions.map((poule) => (
                    <option key={poule} value={poule}>
                      Poule {poule}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                    Équipes
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setSettingsAddingTeam((prev) => !prev)
                    }
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/80 transition hover:bg-white/20"
                  >
                    + Ajouter
                  </button>
                </div>

                {settingsAddingTeam ? (
                  <div className="max-w-sm">
                    <TeamSearchDropdown
                      onSelect={handleSettingsAddTeam}
                      existingTeams={settingsDraft.teams.map((team) => team.name)}
                    />
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {settingsDraft.teams.map((team) => (
                    <span
                      key={team.id}
                      className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/90"
                    >
                      {team.name}
                      {!team.locked ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleSettingsRemoveTeam(team.id)
                          }
                          className="ml-2 text-white/60 transition hover:text-rose-300"
                          aria-label={`Retirer ${team.name}`}
                        >
                          ✕
                        </button>
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={closeSettings}
                className="rounded-full border border-white/20 bg-transparent px-4 py-2 text-xs text-white/70 transition hover:bg-white/10"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={!canSaveSettings}
                className="rounded-full border border-violet-300/40 bg-violet-500/80 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dayWizardOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div
            className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-[#0e0c18]/85 p-6 shadow-[0_32px_90px_rgba(10,8,24,0.7)] backdrop-blur-xl"
            style={{
              backgroundImage:
                "linear-gradient(140deg, rgba(8,10,18,0.95), rgba(12,10,28,0.92)), radial-gradient(120% 60% at 10% 0%, rgba(99,102,241,0.35), transparent 60%), radial-gradient(120% 60% at 90% 15%, rgba(244,114,182,0.25), transparent 60%), radial-gradient(140% 70% at 40% 100%, rgba(56,189,248,0.2), transparent 65%)",
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-25 blur-[2px]"
              style={{
                backgroundImage:
                  "linear-gradient(30deg, rgba(255,255,255,0.08) 12%, transparent 12.5%, transparent 87%, rgba(255,255,255,0.08) 87.5%, rgba(255,255,255,0.08)), linear-gradient(150deg, rgba(255,255,255,0.08) 12%, transparent 12.5%, transparent 87%, rgba(255,255,255,0.08) 87.5%, rgba(255,255,255,0.08)), linear-gradient(90deg, rgba(255,255,255,0.06) 2%, transparent 2%, transparent 98%, rgba(255,255,255,0.06) 98%, rgba(255,255,255,0.06))",
                backgroundSize: "180px 312px",
                backgroundPosition: "0 0, 0 0, 90px 156px",
              }}
            />
            <div className="relative z-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-300">
                  Assistant journée
                </p>
                <h3 className="mt-2 text-xl font-semibold text-slate-100">
                  {dayWizardStep === 1
                    ? `Journée ${days.length + 1}`
                    : dayWizardStep === 2
                    ? "Configurer les matchs"
                    : "Récap journée"}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeDayWizard}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200"
              >
                Fermer
              </button>
            </div>

            <StepPanel key={dayWizardStep} direction={dayStepDirection}>
              {dayWizardStep === 1 ? (
                <div className="mt-6 flex flex-col items-center gap-6 text-center">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => shiftDayDate(-1)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      onClick={handlePickDay}
                      className="px-1 text-base text-slate-100"
                    >
                      {formatDayCompact(dayDate)}
                    </button>
                    <button
                      type="button"
                      onClick={() => shiftDayDate(1)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                    >
                      ▶
                    </button>
                  </div>
                  <input
                    ref={dayInputRef}
                    type="date"
                    value={dayInputValue}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (!nextValue) return;
                      setDayDate(new Date(`${nextValue}T00:00:00`));
                    }}
                    className="sr-only"
                  />
                </div>
              ) : null}

              {dayWizardStep === 2 ? (
                <div className="mt-6 space-y-5">
                  {dayMatches.map((match) => (
                    <div
                      key={match.id}
                      className="rounded-2xl border border-white/10 bg-black/30 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                          <button
                            type="button"
                            onClick={() =>
                              updateMatch(match.id, { homeAway: "home" })
                            }
                            className={[
                              "rounded-full border px-3 py-1 text-[10px] transition",
                              match.homeAway === "home"
                                ? "border-white/30 bg-white/10 text-slate-100"
                                : "border-white/10 bg-white/5 text-slate-400 hover:text-slate-200",
                            ].join(" ")}
                          >
                            Domicile
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateMatch(match.id, { homeAway: "away" })
                            }
                            className={[
                              "rounded-full border px-3 py-1 text-[10px] transition",
                              match.homeAway === "away"
                                ? "border-white/30 bg-white/10 text-slate-100"
                                : "border-white/10 bg-white/5 text-slate-400 hover:text-slate-200",
                            ].join(" ")}
                          >
                            Extérieur
                          </button>
                        </div>
                        <span className="text-xs text-slate-500">
                          Mon équipe : {teamDisplayName}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-slate-300">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                            Domicile
                          </p>
                          <p className="mt-1 text-sm text-slate-100">
                            {match.homeAway === "home"
                              ? teamDisplayName
                              : match.opponent || "Adversaire"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-slate-300">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                            Extérieur
                          </p>
                          <p className="mt-1 text-sm text-slate-100">
                            {match.homeAway === "home"
                              ? match.opponent || "Adversaire"
                              : teamDisplayName}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Équipe adverse
                        </p>
                        <OpponentCombobox
                          value={match.opponent}
                          poolTeams={teamOptions}
                          teamName={teamDisplayName}
                          onSelect={(selection) =>
                            updateMatch(match.id, {
                              opponent: selection.name,
                              opponentId: selection.id,
                              opponentSource: selection.source,
                            })
                          }
                        />
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addMatchDraft}
                    className="w-fit rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
                  >
                    + Ajouter ce match
                  </button>
                </div>
              ) : null}

              {dayWizardStep === 3 ? (
                <div className="mt-6 space-y-3">
                  <p className="text-sm text-slate-300">
                    Récapitulatif des matchs
                  </p>
                  {dayMatches.map((match) => {
                    const opponentName = match.opponent || "Adversaire";
                    const homeTeam =
                      match.homeAway === "home" ? teamDisplayName : opponentName;
                    const awayTeam =
                      match.homeAway === "home" ? opponentName : teamDisplayName;
                    return (
                      <div
                        key={match.id}
                        className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100"
                      >
                        {homeTeam} vs {awayTeam}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </StepPanel>

            <div className="mt-8 flex items-center justify-between">
              {dayWizardStep === 1 ? (
                <button
                  type="button"
                  onClick={closeDayWizard}
                  className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-xs text-slate-300"
                >
                  Annuler
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setDayWizardStep((prev) => (prev - 1) as DayWizardStep)
                  }
                  className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-xs text-slate-300"
                >
                  Retour
                </button>
              )}

              {dayWizardStep < 3 ? (
                <button
                  type="button"
                  onClick={() =>
                    setDayWizardStep((prev) => (prev + 1) as DayWizardStep)
                  }
                  className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/20"
                >
                  {dayWizardStep === 1 ? "Configurer les matchs" : "Suivant"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleValidateDay}
                  disabled={!canValidateDay}
                  className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/20 disabled:opacity-50"
                >
                  Valider la journée
                </button>
              )}
            </div>
            </div>
          </div>
        </div>
      ) : null}
      <style jsx>{`
        @keyframes championshipGlow {
          0%,
          100% {
            text-shadow: 0 0 8px rgba(230, 218, 255, 0.12);
          }
          50% {
            text-shadow: 0 0 6px rgba(230, 218, 255, 0.1);
          }
        }

        @keyframes championshipBgShift {
          0%,
          100% {
            background-position: 50% 50%;
          }
          50% {
            background-position: 52% 48%;
          }
        }

        @keyframes championshipLinesMove {
          0% {
            background-position: 0% 0%, 0% 0%;
          }
          100% {
            background-position: 2% 2%, -2% -2%;
          }
        }

        .championship-card {
          animation: championshipBgShift 18s ease-in-out infinite;
        }

        .championship-title {
          animation: championshipGlow 14s ease-in-out infinite;
        }

        .championship-lines {
          background-image: linear-gradient(
              120deg,
              rgba(255, 255, 255, 0.08) 0%,
              rgba(255, 255, 255, 0.03) 35%,
              transparent 60%
            ),
            repeating-linear-gradient(
              135deg,
              rgba(255, 255, 255, 0.06) 0,
              rgba(255, 255, 255, 0.06) 1px,
              transparent 1px,
              transparent 26px
            );
          background-size: 200% 200%, 320px 320px;
          animation: championshipLinesMove 24s linear infinite;
        }

        .championship-teams-scroll {
          scrollbar-width: none;
        }

        .championship-teams-scroll::-webkit-scrollbar {
          display: none;
        }

        .results-scroll {
          scrollbar-width: none;
        }

        .results-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
