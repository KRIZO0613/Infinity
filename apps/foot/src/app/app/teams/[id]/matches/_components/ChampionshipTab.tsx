"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabaseClient";
import { mapChampionshipMatchesToTeamEvents } from "@/lib/championshipMatches";
import {
  buildTeamNameAliases,
  formatTeamDisplayName,
} from "@/lib/teamProfile";
import {
  searchExternalClubs,
  type ExternalClub,
} from "@/lib/api/externalClubs";
import { syncChampionshipMatchesToTeamEvents } from "@/lib/api/teamEvents";

type ChampionshipMatch = {
  id: string;
  homeAway: "home" | "away";
  opponent: string;
  date: string;
  time: string;
  status?: MatchStatus;
  score?: string;
  homeTeam?: string;
  awayTeam?: string;
  scorers?: Record<string, number>;
  assists?: Record<string, number>;
  motmId?: string | null;
  needsBoost?: Record<string, boolean>;
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
  squadNumber: number | null;
};

type PlayerLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
};

type PlayerCustomField = {
  id?: string | null;
  label?: string | null;
  type?: string | null;
  value?: string | null;
  order?: number | null;
  active?: boolean | null;
};

type ChampionshipTabProps = {
  teamId: string;
};

type WizardStep = 1 | 2 | 3;

type WizardMode = "create" | "edit";

type StepDirection = "forward" | "backward";

type DayMatchDraft = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  time: string;
};

type DayWizardStep = 1 | 2;

type ChampionshipStorageData = {
  championship?: ChampionshipUI;
  days?: ChampionshipDay[];
  dayPhase?: string;
};

type MatchDetailsSource = "calendar" | "results";

type MatchStatus = "draft" | "in_progress" | "finished";

type MatchDetails = {
  match: ChampionshipMatch;
  dayName: string;
  dayDate: string;
  source: MatchDetailsSource;
  homeTeam: string;
  awayTeam: string;
};

type NextCalendarMatch = {
  match: ChampionshipMatch;
  day: ChampionshipDay;
  matchDate: Date;
};

type PickerInput = HTMLInputElement & {
  showPicker?: () => void;
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

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };

    const parts = [
      typeof candidate.message === "string" ? candidate.message : null,
      typeof candidate.details === "string" ? candidate.details : null,
      typeof candidate.hint === "string" ? `hint: ${candidate.hint}` : null,
      typeof candidate.code === "string" ? `code: ${candidate.code}` : null,
    ].filter((part): part is string => Boolean(part));

    if (parts.length > 0) {
      return parts.join(" | ");
    }

    try {
      return JSON.stringify(error);
    } catch {
      return "Erreur inconnue";
    }
  }
  return "Erreur inconnue";
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

const buildMatchDateTime = (dayDate: string, matchTime?: string | null) => {
  if (!dayDate) return null;
  const base = new Date(dayDate);
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

const getResultIcon = (result: "win" | "loss" | "draw") => {
  if (result === "win") return "/icons/VIC.png";
  if (result === "loss") return "/icons/DEF.png";
  return "/icons/egal.png";
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
          error instanceof DOMException &&
          error.name === "AbortError"
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
    squadNumber: null,
  });
  const [players, setPlayers] = useState<PlayerLite[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [championship, setChampionship] = useState<ChampionshipUI | null>(null);
  const [days, setDays] = useState<ChampionshipDay[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardMode, setWizardMode] = useState<WizardMode>("create");
  const [draft, setDraft] = useState<ChampionshipUI | null>(null);
  const [addingTeam, setAddingTeam] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [widgetTab, setWidgetTab] = useState<
    "general" | "teams" | "ranking" | "results" | "calendar"
  >("general");
  const [widgetAddingTeam, setWidgetAddingTeam] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<ChampionshipUI | null>(
    null,
  );
  const [settingsAddingTeam, setSettingsAddingTeam] = useState(false);
  const [matchDetails, setMatchDetails] = useState<MatchDetails | null>(null);
  const [scoreDraft, setScoreDraft] = useState<{
    home: string;
    away: string;
  } | null>(null);
  const [scoreCleared, setScoreCleared] = useState(false);
  const [matchSaveFeedback, setMatchSaveFeedback] = useState(false);
  const [scorers, setScorers] = useState<Record<string, number>>({});
  const [assists, setAssists] = useState<Record<string, number>>({});
  const [scorersOpen, setScorersOpen] = useState(false);
  const [assistsOpen, setAssistsOpen] = useState(false);
  const [motmId, setMotmId] = useState<string | null>(null);
  const [needsBoost, setNeedsBoost] = useState<Record<string, boolean>>({});
  const [motmOpen, setMotmOpen] = useState(false);
  const [needsBoostOpen, setNeedsBoostOpen] = useState(false);
  const [lastScorerId, setLastScorerId] = useState<string | null>(null);
  const [lastAssistId, setLastAssistId] = useState<string | null>(null);
  const [lastNeedsBoostId, setLastNeedsBoostId] = useState<string | null>(null);
  const [lastMotmId, setLastMotmId] = useState<string | null>(null);
  const matchSaveFeedbackRef = useRef<number | null>(null);
  const resultsScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const calendarDayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [resultsFilter, setResultsFilter] = useState<"all" | "mine">("all");
  const [showFutureCalendar, setShowFutureCalendar] = useState(true);
  const [showPastCalendar, setShowPastCalendar] = useState(true);
  const [quickScoreMenuOpen, setQuickScoreMenuOpen] = useState(false);
  const [quickScoreOpen, setQuickScoreOpen] = useState(false);
  const [quickScoreDrafts, setQuickScoreDrafts] = useState<
    Record<string, { home: string; away: string }>
  >({});

  const [dayWizardOpen, setDayWizardOpen] = useState(false);
  const [dayWizardStep, setDayWizardStep] = useState<DayWizardStep>(1);
  const [dayDate, setDayDate] = useState<Date>(new Date());
  const [dayMatches, setDayMatches] = useState<DayMatchDraft[]>([]);
  const [dayPhase, setDayPhase] = useState("1");
  const [dayLeg, setDayLeg] = useState<"aller" | "retour">("aller");
  const [timePickerMatchId, setTimePickerMatchId] = useState<string | null>(
    null,
  );
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const timePickerRef = useRef<HTMLDivElement | null>(null);
  const scorersRef = useRef<HTMLDivElement | null>(null);
  const assistsRef = useRef<HTMLDivElement | null>(null);
  const motmRef = useRef<HTMLDivElement | null>(null);
  const needsBoostRef = useRef<HTMLDivElement | null>(null);
  const scorersListRef = useRef<HTMLDivElement | null>(null);
  const assistsListRef = useRef<HTMLDivElement | null>(null);
  const motmListRef = useRef<HTMLDivElement | null>(null);
  const needsBoostListRef = useRef<HTMLDivElement | null>(null);

  const prevStepRef = useRef<WizardStep>(wizardStep);
  const prevDayStepRef = useRef<DayWizardStep>(dayWizardStep);
  const dayInputRef = useRef<HTMLInputElement | null>(null);

  const teamDisplayName = useMemo(() => {
    const baseName = formatTeamDisplayName({
      clubName: teamInfo.clubName,
      name: teamInfo.name ?? teamInfo.category,
      category: teamInfo.category,
      squadNumber: teamInfo.squadNumber,
      fallback: "Mon équipe",
    });
    const levelValue = normalizeLevelValue(teamInfo.level);
    const levelSuffix = levelValue ? ` Niv ${levelValue}` : "";
    return `${baseName}${levelSuffix}`.trim();
  }, [teamInfo]);

  const teamBaseLabel = useMemo(() => {
    return teamInfo.clubName?.trim() || teamInfo.name?.trim() || "Mon équipe";
  }, [teamInfo]);

  const teamLabel = useMemo(() => {
    return formatTeamDisplayName({
      clubName: teamInfo.clubName,
      name: teamInfo.name,
      category: teamInfo.category,
      squadNumber: teamInfo.squadNumber,
      fallback: "Mon équipe",
    });
  }, [teamInfo]);

  const localTeamAliases = useMemo(() => {
    const aliases = buildTeamNameAliases({
      clubName: teamInfo.clubName,
      name: teamInfo.name,
      category: teamInfo.category,
      squadNumber: teamInfo.squadNumber,
      fallback: "Mon équipe",
    });
    aliases.push(teamBaseLabel);

    if (teamInfo.level) {
      const levelValue = normalizeLevelValue(teamInfo.level);
      if (levelValue) {
        aliases.push(
          `${formatTeamDisplayName({
            clubName: teamInfo.clubName,
            name: teamInfo.name ?? teamInfo.category,
            category: teamInfo.category,
            squadNumber: teamInfo.squadNumber,
            fallback: "Mon équipe",
          })} Niv ${levelValue}`.trim(),
        );
      }
    }

    return Array.from(new Set(aliases.map((value) => value.toLowerCase())));
  }, [teamBaseLabel, teamInfo]);

  const syncChampionshipEvents = useCallback(
    async (nextDays: ChampionshipDay[]) => {
      if (!teamId || !teamLabel || teamLabel === "Mon équipe") return;

      const matches = mapChampionshipMatchesToTeamEvents(
        nextDays.flatMap((day) =>
          day.matches.map((match) => ({
            dayId: day.id,
            matchId: match.id,
            dayDate: day.date || match.date,
            time: match.time,
            opponentName: match.opponent,
            homeAway: match.homeAway,
            homeTeam:
              match.homeTeam ??
              (match.homeAway === "home" ? teamLabel : match.opponent),
            awayTeam:
              match.awayTeam ??
              (match.homeAway === "home" ? match.opponent : teamLabel),
            score: match.score ?? null,
            status: match.status ?? null,
          })),
        ),
      );

      await syncChampionshipMatchesToTeamEvents(teamId, matches);
    },
    [teamId, teamLabel],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadTeamInfo() {
      if (!teamId) return;
      try {
        const { data, error } = await supabase
          .from("teams")
          .select("name,category,level,club_id,squad_number,custom_fields")
          .eq("id", teamId)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.error("Erreur chargement équipe:", error.message ?? error);
          setTeamInfo({
            name: null,
            category: null,
            level: null,
            clubName: null,
            squadNumber: null,
          });
          return;
        }

        let clubName: string | null = null;

        if (data?.club_id) {
          const { data: clubData, error: clubError } = await supabase
            .from("clubs")
            .select("name")
            .eq("id", data.club_id)
            .maybeSingle();

          if (cancelled) return;

          if (clubError) {
            console.error("Erreur chargement club:", clubError.message ?? clubError);
          } else {
            clubName = clubData?.name ?? null;
          }
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
          squadNumber: data?.squad_number ?? null,
        });
      } catch (error) {
        if (cancelled) return;
        console.error("Erreur chargement équipe:", getErrorMessage(error));
        setTeamInfo({
          name: null,
          category: null,
          level: null,
          clubName: null,
          squadNumber: null,
        });
      }
    }

    void loadTeamInfo();

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  useEffect(() => {
    if (!days.length || !teamLabel || teamLabel === "Mon équipe") return;

    void syncChampionshipEvents(days).catch((syncError) => {
      console.error(
        "Erreur resynchronisation championnat -> team_events:",
        getErrorMessage(syncError),
      );
    });
  }, [days, syncChampionshipEvents, teamLabel]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      if (!teamId) return;
      setPlayersLoading(true);
      setPlayersError(null);

      try {
        const { data, error } = await supabase
          .from("players")
          .select("id,first_name,last_name,photo_url,team_id")
          .eq("team_id", teamId)
          .order("created_at", { ascending: true });

        if (cancelled) return;

        if (error) {
          console.error("Erreur chargement joueurs:", error.message ?? error);
          setPlayers([]);
          setPlayersError("Impossible de charger les joueurs.");
          return;
        }

        setPlayers(
          (data ?? []).map((player) => ({
            id: player.id,
            first_name: player.first_name ?? "",
            last_name: player.last_name ?? "",
            photo_url: player.photo_url ?? null,
          })),
        );
      } catch (error) {
        if (cancelled) return;
        console.error("Erreur chargement joueurs:", getErrorMessage(error));
        setPlayers([]);
        setPlayersError("Impossible de charger les joueurs.");
      } finally {
        if (!cancelled) {
          setPlayersLoading(false);
        }
      }
    }

    void loadPlayers();

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  useEffect(() => {
    let cancelled = false;

    async function loadChampionship() {
      if (!teamId) return;
      try {
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
          if (stored?.dayPhase) {
            setDayPhase(stored.dayPhase);
          }
          try {
            await syncChampionshipEvents(storedDays);
          } catch (syncError) {
            if (!cancelled) {
              console.error(
                "Erreur synchronisation championnat -> team_events:",
                getErrorMessage(syncError),
              );
            }
          }
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Erreur chargement championnat:", getErrorMessage(error));
      }
    }

    void loadChampionship();

    return () => {
      cancelled = true;
    };
  }, [syncChampionshipEvents, teamId]);

  useEffect(() => {
    prevStepRef.current = wizardStep;
  }, [wizardStep]);

  useEffect(() => {
    prevDayStepRef.current = dayWizardStep;
  }, [dayWizardStep]);

  useEffect(() => {
    if (!timePickerMatchId) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (timePickerRef.current?.contains(target)) return;
      setTimePickerMatchId(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [timePickerMatchId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        scorersRef.current &&
        !scorersRef.current.contains(target)
      ) {
        setScorersOpen(false);
      }
      if (
        assistsRef.current &&
        !assistsRef.current.contains(target)
      ) {
        setAssistsOpen(false);
      }
      if (motmRef.current && !motmRef.current.contains(target)) {
        setMotmOpen(false);
      }
      if (
        needsBoostRef.current &&
        !needsBoostRef.current.contains(target)
      ) {
        setNeedsBoostOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!scorersOpen || !lastScorerId) return;
    requestAnimationFrame(() => {
      const node = scorersListRef.current?.querySelector(
        `[data-player-id="${lastScorerId}"]`,
      ) as HTMLElement | null;
      node?.scrollIntoView({ block: "nearest" });
    });
  }, [scorersOpen, lastScorerId]);

  useEffect(() => {
    if (!assistsOpen || !lastAssistId) return;
    requestAnimationFrame(() => {
      const node = assistsListRef.current?.querySelector(
        `[data-player-id="${lastAssistId}"]`,
      ) as HTMLElement | null;
      node?.scrollIntoView({ block: "nearest" });
    });
  }, [assistsOpen, lastAssistId]);

  useEffect(() => {
    if (!motmOpen || !lastMotmId) return;
    requestAnimationFrame(() => {
      const node = motmListRef.current?.querySelector(
        `[data-player-id="${lastMotmId}"]`,
      ) as HTMLElement | null;
      node?.scrollIntoView({ block: "nearest" });
    });
  }, [motmOpen, lastMotmId]);

  useEffect(() => {
    if (!needsBoostOpen || !lastNeedsBoostId) return;
    requestAnimationFrame(() => {
      const node = needsBoostListRef.current?.querySelector(
        `[data-player-id="${lastNeedsBoostId}"]`,
      ) as HTMLElement | null;
      node?.scrollIntoView({ block: "nearest" });
    });
  }, [needsBoostOpen, lastNeedsBoostId]);

  const stepDirection: StepDirection =
    wizardStep >= prevStepRef.current ? "forward" : "backward";
  const dayStepDirection: StepDirection =
    dayWizardStep >= prevDayStepRef.current ? "forward" : "backward";

  const displayChampionshipName = useMemo(() => {
    if (championship?.name?.trim()) return championship.name.trim();
    const category = teamInfo.category ?? teamInfo.name ?? "Championnat";
    const levelValue = normalizeLevelValue(teamInfo.level);
    return levelValue ? `${category} – Niv ${levelValue}` : category;
  }, [championship?.name, teamInfo]);

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

  const daysKey = useMemo(() => {
    return days.map((day) => day.id).join("|");
  }, [days]);

  useEffect(() => {
    if (!quickScoreOpen) return;
    const nextDrafts: Record<string, { home: string; away: string }> = {};
    days.forEach((day) => {
      day.matches.forEach((match) => {
        const parsed = parseScore(match.score);
        nextDrafts[match.id] = parsed
          ? {
              home: String(parsed.home),
              away: String(parsed.away),
            }
          : { home: "", away: "" };
      });
    });
    setQuickScoreDrafts(nextDrafts);
  }, [quickScoreOpen, daysKey, parseScore]);

  const setQuickScoreValue = (
    matchId: string,
    side: "home" | "away",
    rawValue: string,
  ) => {
    setQuickScoreDrafts((prev) => ({
      ...prev,
      [matchId]: {
        ...(prev[matchId] ?? { home: "", away: "" }),
        [side]: rawValue.replace(/[^\d]/g, ""),
      },
    }));
  };

  useEffect(() => {
    if (!matchDetails) return;
    const parsed = parseScore(matchDetails.match.score);
    const isDraftMatch =
      resolveMatchStatus(matchDetails.match) !== "finished";
    const shouldClearZeros =
      isDraftMatch && parsed && parsed.home === 0 && parsed.away === 0;
    setScoreDraft(
      parsed && !shouldClearZeros
        ? {
            home: String(parsed.home),
            away: String(parsed.away),
          }
        : {
            home: "",
            away: "",
          },
    );
    setScorers(matchDetails.match.scorers ?? {});
    setAssists(matchDetails.match.assists ?? {});
    setMotmId(matchDetails.match.motmId ?? null);
    setNeedsBoost(matchDetails.match.needsBoost ?? {});
    setScoreCleared(false);
    setMatchSaveFeedback(false);
    setScorersOpen(false);
    setAssistsOpen(false);
    setMotmOpen(false);
    setNeedsBoostOpen(false);
  }, [matchDetails]);

  const roster = useMemo(() => {
    if (!matchDetails) return [];
    if (!players.length) return [];
    const side = isLocalTeamName(matchDetails.homeTeam)
      ? "home"
      : isLocalTeamName(matchDetails.awayTeam)
      ? "away"
      : "home";
    const team =
      side === "home" ? matchDetails.homeTeam : matchDetails.awayTeam;
    return players.map((player) => ({
      id: player.id,
      label:
        `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() ||
        "Joueur",
      team,
      side,
      photoUrl: player.photo_url ?? null,
    }));
  }, [matchDetails, players]);

  const rosterById = useMemo(() => {
    return roster.reduce<
      Record<string, { label: string; side: string; photoUrl?: string | null }>
    >((acc, player) => {
        acc[player.id] = {
          label: player.label,
          side: player.side,
          photoUrl: player.photoUrl ?? null,
        };
        return acc;
      },
      {},
    );
  }, [roster]);

  const needsBoostLabel = useMemo(() => {
    const names = Object.keys(needsBoost)
      .map((playerId) => rosterById[playerId]?.label ?? playerId)
      .filter(Boolean);
    if (!names.length) return "Joueur en difficulté";
    if (names.length === 1) return names[0];
    return `${names[0]} +${names.length - 1}`;
  }, [needsBoost, rosterById]);

  const localRoster = useMemo(() => roster, [roster]);

  const updateScore = (side: "home" | "away", delta: number) => {
    setScoreDraft((prev) => {
      if (!prev) return prev;
      const current = Number.parseInt(prev[side], 10);
      const base = Number.isFinite(current) ? current : 0;
      const nextValue = Math.max(0, base + delta);
      return { ...prev, [side]: String(nextValue) };
    });
    setScoreCleared(false);
  };

  const setScoreValue = (side: "home" | "away", rawValue: string) => {
    setScoreDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, [side]: rawValue.replace(/[^\d]/g, "") };
    });
    setScoreCleared(false);
  };

  const setStatValue = (
    setter: (
      value:
        | Record<string, number>
        | ((prev: Record<string, number>) => Record<string, number>),
    ) => void,
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

  const applyPlayerStats = async (daysList: ChampionshipDay[]) => {
    if (!players.length) return;
    const totals = daysList.reduce<{
      goals: Record<string, number>;
      assists: Record<string, number>;
    }>(
      (acc, day) => {
        day.matches.forEach((match) => {
          if (resolveMatchStatus(match) !== "finished") return;
          Object.entries(match.scorers ?? {}).forEach(([id, value]) => {
            acc.goals[id] = (acc.goals[id] ?? 0) + value;
          });
          Object.entries(match.assists ?? {}).forEach(([id, value]) => {
            acc.assists[id] = (acc.assists[id] ?? 0) + value;
          });
        });
        return acc;
      },
      { goals: {}, assists: {} },
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
      fields: PlayerCustomField[],
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
        ? (player.custom_fields as PlayerCustomField[])
        : [];
      const friendlyGoals = getStatFieldValue(fields, [
        "buts amical",
        "buts amicaux",
      ]);
      const friendlyAssists = getStatFieldValue(fields, [
        "passes d amical",
        "passes amical",
        "passes decisives amical",
      ]);
      const plateauGoals = getStatFieldValue(fields, [
        "buts plateau",
        "buts plateaux",
      ]);
      const plateauAssists = getStatFieldValue(fields, [
        "passes d plateau",
        "passes plateau",
        "passes decisives plateau",
      ]);
      const champGoals = totals.goals[player.id] ?? 0;
      const champAssists = totals.assists[player.id] ?? 0;
      const withGoals = upsertStatField(
        fields,
        "Buts championnat",
        champGoals,
      );
      const withAssists = upsertStatField(
        withGoals,
        "Passes D championnat",
        champAssists,
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

  const handleClearMatchDetails = () => {
    setScoreDraft({ home: "", away: "" });
    setScoreCleared(true);
    setScorers({});
    setAssists({});
    setMotmId(null);
    setNeedsBoost({});
  };

  const handleSaveMatchDetails = async () => {
    if (!championship || !matchDetails) return;
    const homeValue = Number.parseInt(scoreDraft?.home ?? "", 10);
    const awayValue = Number.parseInt(scoreDraft?.away ?? "", 10);
    const hasHome = Number.isFinite(homeValue);
    const hasAway = Number.isFinite(awayValue);
    const nextScore =
      hasHome && hasAway ? `${homeValue} - ${awayValue}` : undefined;
    const resolvedStatus: MatchStatus = nextScore ? "finished" : "draft";
    const nextMatch: ChampionshipMatch = {
      ...matchDetails.match,
      status: resolvedStatus,
      score: nextScore,
      homeTeam: matchDetails.homeTeam,
      awayTeam: matchDetails.awayTeam,
      scorers: Object.keys(scorers).length ? scorers : undefined,
      assists: Object.keys(assists).length ? assists : undefined,
      motmId: motmId ?? undefined,
      needsBoost: Object.keys(needsBoost).length ? needsBoost : undefined,
    };
    const nextDays = days.map((day) => ({
      ...day,
      matches: day.matches.map((match) =>
        match.id === matchDetails.match.id ? nextMatch : match,
      ),
    }));
    setDays(nextDays);
    setMatchDetails((prev) =>
      prev ? { ...prev, match: nextMatch } : prev,
    );
    await persistChampionship(championship, nextDays);
    await applyPlayerStats(nextDays);
    setMatchSaveFeedback(true);
    if (matchSaveFeedbackRef.current) {
      window.clearTimeout(matchSaveFeedbackRef.current);
    }
    matchSaveFeedbackRef.current = window.setTimeout(() => {
      setMatchSaveFeedback(false);
    }, 1800);
    closeMatchDetails();
  };

  const handleSaveQuickScores = async () => {
    if (!championship) return;
    const nextDays = days.map((day) => ({
      ...day,
      matches: day.matches.map((match) => {
        const draft = quickScoreDrafts[match.id];
        if (!draft) return match;
        const home = Number.parseInt(draft.home, 10);
        const away = Number.parseInt(draft.away, 10);
        if (!Number.isFinite(home) || !Number.isFinite(away)) {
          return match;
        }
        const nextMatch: ChampionshipMatch = {
          ...match,
          score: `${home} - ${away}`,
          status: "finished" as MatchStatus,
          homeTeam:
            match.homeTeam ??
            (match.homeAway === "home"
              ? teamDisplayName
              : match.opponent),
          awayTeam:
            match.awayTeam ??
            (match.homeAway === "home"
              ? match.opponent
              : teamDisplayName),
        };
        return nextMatch;
      }),
    }));
    setDays(nextDays);
    await persistChampionship(championship, nextDays);
    setQuickScoreOpen(false);
  };

  const adjustStat = (
    setter: (
      value:
        | Record<string, number>
        | ((prev: Record<string, number>) => Record<string, number>),
    ) => void,
    playerId: string,
    delta: number,
  ) => {
    setter((prev) => {
      const next = { ...prev };
      const nextValue = (next[playerId] ?? 0) + delta;
      if (nextValue <= 0) {
        delete next[playerId];
        return next;
      }
      next[playerId] = nextValue;
      return next;
    });
  };

  const addStat = (
    setter: (
      value:
        | Record<string, number>
        | ((prev: Record<string, number>) => Record<string, number>),
    ) => void,
    playerId: string,
  ) => {
    adjustStat(setter, playerId, 1);
  };

  const toggleStatSelection = (
    setter: (
      value:
        | Record<string, number>
        | ((prev: Record<string, number>) => Record<string, number>),
    ) => void,
    playerId: string,
  ) => {
    setter((prev) => {
      if (prev[playerId]) {
        const next = { ...prev };
        delete next[playerId];
        return next;
      }
      return { ...prev, [playerId]: 1 };
    });
  };

  const toggleSelection = (
    setter: (
      value:
        | Record<string, boolean>
        | ((prev: Record<string, boolean>) => Record<string, boolean>),
    ) => void,
    playerId: string,
  ) => {
    setter((prev) => {
      if (prev[playerId]) {
        const next = { ...prev };
        delete next[playerId];
        return next;
      }
      return { ...prev, [playerId]: true };
    });
  };

  const buildMatchDraftFromStored = (
    match: ChampionshipMatch,
  ): DayMatchDraft => {
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
    return {
      id: match.id ?? buildId(),
      homeTeam: homeTeam || "",
      awayTeam: awayTeam || "",
      time: match.time || "18:00",
    };
  };

  const getDateKey = (value: string) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    const year = parsed.getFullYear();
    const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
    const day = `${parsed.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
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

  const resolveMatchStatus = (match: ChampionshipMatch): MatchStatus => {
    if (match.status) return match.status;
    return match.score ? "finished" : "draft";
  };

  const normalizeFieldLabel = (value: string | null | undefined) => {
    return (value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "");
  };

  const upsertStatField = (
    fields: PlayerCustomField[],
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

  const championshipSubtitle = useMemo(() => {
    const category = teamInfo.category ?? teamInfo.name ?? "U12";
    const levelValue = normalizeLevelValue(teamInfo.level);
    const subtitle = levelValue
      ? `${category} — NIVEAU ${levelValue}`
      : `${category}`;
    return subtitle.toUpperCase();
  }, [teamInfo]);

  const computedRanking = useMemo(() => {
    if (!championship) return [];
    type RankingRow = {
      name: string;
      played: number;
      wins: number;
      draws: number;
      losses: number;
      goalsFor: number;
      goalsAgainst: number;
      goalDiff: number;
      points: number;
      initials: string;
      rank: number;
    };
    const normalizeTeamName = (value: string) =>
      value.trim().toLowerCase();
    const rows = new Map<string, RankingRow>();
    const ensureRow = (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const key = normalizeTeamName(trimmed);
      if (rows.has(key)) return rows.get(key) ?? null;
      const row: RankingRow = {
        name: trimmed,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        points: 0,
        initials: getTeamInitials(trimmed),
        rank: 0,
      };
      rows.set(key, row);
      return row;
    };
    championship.teams.forEach((team) => {
      ensureRow(team.name);
    });
    days.forEach((day) => {
      day.matches.forEach((match) => {
        if (resolveMatchStatus(match) !== "finished") return;
        const parsed = parseScore(match.score);
        if (!parsed) return;
        const homeTeam =
          match.homeTeam ??
          (match.homeAway === "home" ? teamDisplayName : match.opponent);
        const awayTeam =
          match.awayTeam ??
          (match.homeAway === "home" ? match.opponent : teamDisplayName);
        if (!homeTeam || !awayTeam) return;
        const homeRow = ensureRow(homeTeam);
        const awayRow = ensureRow(awayTeam);
        if (!homeRow || !awayRow) return;
        homeRow.played += 1;
        awayRow.played += 1;
        homeRow.goalsFor += parsed.home;
        homeRow.goalsAgainst += parsed.away;
        awayRow.goalsFor += parsed.away;
        awayRow.goalsAgainst += parsed.home;
        if (parsed.home > parsed.away) {
          homeRow.wins += 1;
          awayRow.losses += 1;
          homeRow.points += 3;
        } else if (parsed.home < parsed.away) {
          awayRow.wins += 1;
          homeRow.losses += 1;
          awayRow.points += 3;
        } else {
          homeRow.draws += 1;
          awayRow.draws += 1;
          homeRow.points += 1;
          awayRow.points += 1;
        }
      });
    });
    const ranking = Array.from(rows.values()).map((row) => ({
      ...row,
      goalDiff: row.goalsFor - row.goalsAgainst,
    }));
    ranking.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.name.localeCompare(b.name, "fr", {
        sensitivity: "base",
      });
    });
    return ranking.map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
  }, [championship, days, parseScore, resolveMatchStatus, teamDisplayName]);

  const seasonLabel = useMemo(() => {
    return championship?.season
      ? `Saison ${championship.season}`
      : "Saison en cours";
  }, [championship?.season]);

  const localTeamNames = useMemo(() => {
    const normalize = (value: string | null | undefined) =>
      value?.trim().toLowerCase() ?? "";
    const names = [teamDisplayName, teamLabel]
      .map(normalize)
      .filter(Boolean);
    return Array.from(new Set(names));
  }, [teamDisplayName, teamLabel]);

  const isMatchForLocalTeam = (match: ChampionshipMatch) => {
    const normalize = (value: string | null | undefined) =>
      value?.trim().toLowerCase() ?? "";
    const homeName = (match as { homeTeam?: string }).homeTeam;
    const awayName = (match as { awayTeam?: string }).awayTeam;
    if (homeName || awayName) {
      return [homeName, awayName].some((name) =>
        localTeamNames.includes(normalize(name)),
      );
    }
    if (match.opponent?.trim()) return true;
    return false;
  };

  const filterDaysForLocalTeam = (daysList: ChampionshipDay[]) => {
    return daysList
      .map((day) => ({
        ...day,
        matches: day.matches.filter((match) =>
          isMatchForLocalTeam(match),
        ),
      }))
      .filter((day) => day.matches.length > 0);
  };

  const resultsDays = useMemo(() => {
    if (!days.length) return [];
    const now = new Date();
    const pastDays = days.filter(
      (day) => new Date(day.date) < now,
    );
    if (resultsFilter !== "mine") return pastDays;
    return filterDaysForLocalTeam(pastDays);
  }, [days, resultsFilter, localTeamNames]);

  const demoResultsDays = useMemo<ChampionshipDay[]>(() => {
    if (!championship) return [];
    const today = new Date();
    const firstDay = new Date(today);
    firstDay.setDate(firstDay.getDate() - 7);
    const secondDay = new Date(today);
    secondDay.setDate(secondDay.getDate() - 1);
    const teamA = championship.teams[0]?.name ?? "Équipe A";
    const teamB = championship.teams[1]?.name ?? "Équipe B";
    const teamC = championship.teams[2]?.name ?? "Équipe C";
    const teamD = championship.teams[3]?.name ?? "Équipe D";
    const demoDays: ChampionshipDay[] = [
      {
        id: "demo-day-2",
        name: "Journée 2",
        date: secondDay.toISOString(),
        matches: [
          {
            id: "demo-m-2",
            homeAway: "home" as const,
            opponent: teamB,
            date: secondDay.toISOString(),
            time: "18:00",
            score: "3 - 1",
            homeTeam: teamA,
            awayTeam: teamB,
          },
          {
            id: "demo-m-3",
            homeAway: "away" as const,
            opponent: teamC,
            date: secondDay.toISOString(),
            time: "19:15",
            score: "1 - 1",
            homeTeam: teamC,
            awayTeam: teamD,
          },
          {
            id: "demo-m-4",
            homeAway: "home" as const,
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
            homeAway: "home" as const,
            opponent: teamC,
            date: firstDay.toISOString(),
            time: "17:30",
            score: "2 - 2",
            homeTeam: teamA,
            awayTeam: teamC,
          },
          {
            id: "demo-m-5",
            homeAway: "away" as const,
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
    if (resultsFilter !== "mine") return demoDays;
    return filterDaysForLocalTeam(demoDays);
  }, [championship, resultsFilter, localTeamNames]);

  const displayResultsDays = days.length ? resultsDays : demoResultsDays;
  const sortedResultsDays = useMemo(() => {
    return [...displayResultsDays].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [displayResultsDays]);
  const latestResultsDay = sortedResultsDays[0];
  const otherResultsDays = sortedResultsDays.slice(1);
  const { upcomingCalendarDays, pastCalendarDays } = useMemo(() => {
    const now = new Date();
    const upcoming: Array<{ day: ChampionshipDay; earliest: Date }> = [];
    const past: Array<{ day: ChampionshipDay; latest: Date }> = [];
    days.forEach((day) => {
      const matchDates = day.matches
        .map((match) => buildMatchDateTime(day.date, match.time))
        .filter((value): value is Date => Boolean(value));
      if (matchDates.length === 0) {
        const fallback = buildMatchDateTime(day.date);
        if (fallback) {
          matchDates.push(fallback);
        }
      }
      if (matchDates.length === 0) return;
      const earliest = new Date(
        Math.min(...matchDates.map((date) => date.getTime())),
      );
      const latest = new Date(
        Math.max(...matchDates.map((date) => date.getTime())),
      );
      if (latest.getTime() >= now.getTime()) {
        upcoming.push({ day, earliest });
      } else {
        past.push({ day, latest });
      }
    });
    upcoming.sort(
      (a, b) => a.earliest.getTime() - b.earliest.getTime(),
    );
    past.sort((a, b) => b.latest.getTime() - a.latest.getTime());
    return {
      upcomingCalendarDays: upcoming.map((item) => item.day),
      pastCalendarDays: past.map((item) => item.day),
    };
  }, [days]);

  const nextCalendarMatch = useMemo<NextCalendarMatch | null>(() => {
    const now = new Date();
    let next: NextCalendarMatch | null = null;
    upcomingCalendarDays.forEach((day) => {
      day.matches.forEach((match) => {
        const matchDate = buildMatchDateTime(day.date, match.time);
        if (!matchDate || matchDate.getTime() < now.getTime()) return;
        if (!next || matchDate.getTime() < next.matchDate.getTime()) {
          next = { match, day, matchDate };
        }
      });
    });
    return next;
  }, [upcomingCalendarDays]);

  const renderNextCalendarMatchCard = (nextMatch: NextCalendarMatch) => {
    const { match, day } = nextMatch;
    const homeTeam =
      match.homeTeam ??
      (match.homeAway === "home" ? teamDisplayName : match.opponent);
    const awayTeam =
      match.awayTeam ??
      (match.homeAway === "home" ? match.opponent : teamDisplayName);
    const isFinished = resolveMatchStatus(match) === "finished";

    return (
      <div className="relative rounded-2xl border border-violet-400/25 bg-violet-500/10 px-3 py-4 shadow-[0_0_24px_rgba(124,58,237,0.35)] backdrop-blur-sm">
        <button
          key={match.id}
          type="button"
          onClick={() =>
            openMatchDetails({
              match,
              dayName: day.name,
              dayDate: day.date,
              source: "calendar",
              homeTeam,
              awayTeam,
            })
          }
          className="relative w-full rounded-2xl px-6 text-left transition hover:scale-[1.01] hover:shadow-[0_0_32px_rgba(168,85,247,0.4)] active:scale-[1.01] active:shadow-[0_0_44px_rgba(168,85,247,0.85)] focus:outline-none focus-visible:outline-none"
        >
          {isFinished ? (
            <span className="absolute right-4 top-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-[9px] uppercase tracking-[0.2em] text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
              Match terminé
            </span>
          ) : null}
          <div className="flex items-center justify-between gap-4 text-violet-100/80">
            <div className="flex min-w-0 flex-1 justify-end pr-2">
              <span className="max-w-[170px] text-right text-sm font-semibold leading-tight text-violet-100/90">
                {homeTeam}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {renderTeamBadge(homeTeam, {
                image: "h-9 w-9 rounded-full object-cover",
                initial:
                  "flex h-9 w-9 items-center justify-center rounded-full border border-violet-400/30 bg-white/8 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-100/80",
              })}
              <div className="flex flex-col items-center text-[10px] uppercase tracking-[0.3em] text-violet-200/70">
                <img
                  src="/icons/VS2.0.png"
                  alt="VS"
                  className="h-12 w-auto opacity-90"
                />
              </div>
              {renderTeamBadge(awayTeam, {
                image: "h-9 w-9 rounded-full object-cover",
                initial:
                  "flex h-9 w-9 items-center justify-center rounded-full border border-violet-400/30 bg-white/8 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-100/80",
              })}
            </div>
            <div className="flex min-w-0 flex-1 justify-start pl-2">
              <span className="max-w-[170px] text-left text-sm font-semibold leading-tight text-violet-100/90">
                {awayTeam}
              </span>
            </div>
          </div>
        </button>
      </div>
    );
  };

  const teamOptions = useMemo(() => {
    if (championship?.teams?.length) {
      return championship.teams.map((team) => team.name);
    }
    if (draft?.teams?.length) {
      return draft.teams.map((team) => team.name);
    }
    return teamDisplayName ? [teamDisplayName] : [];
  }, [championship, draft, teamDisplayName]);

  const renderTeamBadge = (
    name: string,
    classes: { image: string; initial: string },
  ) => {
    if (isLocalTeamName(name)) {
      return (
        <img
          src="/icons/logocclubp.png"
          alt={name}
          className={classes.image}
        />
      );
    }
    return (
      <span className={classes.initial}>
        {getTeamInitials(name)}
      </span>
    );
  };

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

  const scrollResultsBy = (dayId: string, direction: "left" | "right") => {
    const container = resultsScrollRefs.current[dayId];
    if (!container) return;
    const firstCard = container.firstElementChild as HTMLElement | null;
    const cardWidth = firstCard?.getBoundingClientRect().width ?? 280;
    const gap = 12;
    const offset = (cardWidth + gap) * (direction === "left" ? -1 : 1);
    container.scrollBy({ left: offset, behavior: "smooth" });
  };

  const scrollCalendarDay = (dayId: string, direction: "left" | "right") => {
    const container = calendarDayRefs.current[dayId];
    if (!container) return;
    const firstCard = container.firstElementChild as HTMLElement | null;
    const cardWidth = firstCard?.getBoundingClientRect().width ?? 320;
    const gap = 12;
    const offset = (cardWidth + gap) * (direction === "left" ? -1 : 1);
    container.scrollBy({ left: offset, behavior: "smooth" });
  };

  const openMatchDetails = (details: MatchDetails) => {
    setMatchDetails(details);
  };

  const closeMatchDetails = () => {
    setMatchDetails(null);
  };

  const renderCalendarDayList = (daysList: ChampionshipDay[]) => {
    return (
      <div className="space-y-5">
        {daysList.map((day) => (
          <div key={day.id} className="space-y-2">
            <div className="flex items-center justify-between text-xs text-violet-200/70">
              <span className="uppercase tracking-[0.2em]">
                {day.name}
              </span>
              <span>{formatShortDate(day.date)}</span>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => scrollCalendarDay(day.id, "left")}
                className="absolute -left-8 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-violet-300/30 bg-black/30 text-violet-100/80 transition hover:bg-black/60"
                aria-label="Match précédent"
              >
                <span className="relative -top-px text-sm leading-none">
                  ‹
                </span>
              </button>
              <button
                type="button"
                onClick={() => scrollCalendarDay(day.id, "right")}
                className="absolute -right-8 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-violet-300/30 bg-black/30 text-violet-100/80 transition hover:bg-black/60"
                aria-label="Match suivant"
              >
                <span className="relative -top-px text-sm leading-none">
                  ›
                </span>
              </button>
              <div
                ref={(el) => {
                  calendarDayRefs.current[day.id] = el;
                }}
                className="results-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
              >
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
                  const isFinished =
                    resolveMatchStatus(match) === "finished";
                  return (
                    <button
                      key={match.id}
                      type="button"
                      onClick={() =>
                        openMatchDetails({
                          match,
                          dayName: day.name,
                          dayDate: day.date,
                          source: "calendar",
                          homeTeam,
                          awayTeam,
                        })
                      }
                      className="relative min-w-full snap-center rounded-2xl px-6 text-left transition hover:scale-[1.01] hover:shadow-[0_0_28px_rgba(168,85,247,0.35)] active:scale-[1.01] active:shadow-[0_0_44px_rgba(168,85,247,0.85)] focus:outline-none focus-visible:outline-none"
                    >
                      {isFinished ? (
                        <span className="absolute right-4 top-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-[9px] uppercase tracking-[0.2em] text-emerald-200">
                          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                          Match terminé
                        </span>
                      ) : null}
                      <div className="flex items-center justify-between gap-4 text-violet-100/70">
                        <div className="flex min-w-0 flex-1 justify-end pr-2">
                          <span className="max-w-[150px] text-right text-[11px] font-normal leading-tight text-violet-100/80">
                            {homeTeam}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {renderTeamBadge(homeTeam, {
                            image: "h-6 w-6 rounded-full object-cover",
                            initial:
                              "flex h-6 w-6 items-center justify-center rounded-full border border-violet-400/30 bg-white/8 text-[9px] font-semibold uppercase tracking-[0.16em] text-violet-100/80",
                          })}
                          <div className="flex flex-col items-center text-[10px] uppercase tracking-[0.3em] text-violet-200/70">
                            <img
                              src="/icons/VS2.0.png"
                              alt="VS"
                              className="h-12 w-auto opacity-85"
                            />
                          </div>
                          {renderTeamBadge(awayTeam, {
                            image: "h-6 w-6 rounded-full object-cover",
                            initial:
                              "flex h-6 w-6 items-center justify-center rounded-full border border-violet-400/30 bg-white/8 text-[9px] font-semibold uppercase tracking-[0.16em] text-violet-100/80",
                          })}
                        </div>
                        <div className="flex min-w-0 flex-1 justify-start pl-2">
                          <span className="max-w-[150px] text-left text-[11px] font-normal leading-tight text-violet-100/80">
                            {awayTeam}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
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
        dayPhase,
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
      try {
        await syncChampionshipEvents(storedDays);
      } catch (syncError) {
        console.error(
          "Erreur synchronisation championnat -> team_events:",
          getErrorMessage(syncError),
        );
      }
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

  const getDefaultMatchTeams = () => {
    const homeTeam = teamOptions[0] ?? "";
    const awayTeam =
      teamOptions.find((team) => team !== homeTeam) ?? "";
    return { homeTeam, awayTeam };
  };

  const startNewDay = () => {
    const { homeTeam, awayTeam } = getDefaultMatchTeams();
    setDayDate(new Date());
    setDayLeg("aller");
    setEditingDayId(null);
    setDayMatches([
      {
        id: buildId(),
        homeTeam,
        awayTeam,
        time: "18:00",
      },
    ]);
    setDayWizardStep(2);
  };

  const openDayWizard = () => {
    if (!championship) return;
    setDayLeg("aller");
    setDayMatches([]);
    setDayWizardStep(1);
    setDayWizardOpen(true);
    setEditingDayId(null);
  };

  const openEditDay = (day: ChampionshipDay) => {
    if (!championship) return;
    setDayDate(new Date(day.date));
    setDayLeg("aller");
    setDayMatches(day.matches.map(buildMatchDraftFromStored));
    setDayWizardStep(2);
    setDayWizardOpen(true);
    setEditingDayId(day.id);
  };

  const closeDayWizard = () => {
    setDayWizardOpen(false);
    setDayWizardStep(1);
    setDayMatches([]);
    setTimePickerMatchId(null);
    setEditingDayId(null);
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

  const editingDay = useMemo(() => {
    if (!editingDayId) return null;
    return days.find((day) => day.id === editingDayId) ?? null;
  }, [days, editingDayId]);

  const hasDayChanges = useMemo(() => {
    if (!editingDayId) return true;
    if (!editingDay) return true;
    if (getDateKey(editingDay.date) !== dayInputValue) return true;
    if (editingDay.matches.length !== dayMatches.length) return true;
    for (let i = 0; i < dayMatches.length; i += 1) {
      const draft = dayMatches[i];
      const stored = editingDay.matches[i];
      if (!stored) return true;
      const storedDraft = buildMatchDraftFromStored(stored);
      if (
        storedDraft.homeTeam.trim() !== draft.homeTeam.trim() ||
        storedDraft.awayTeam.trim() !== draft.awayTeam.trim() ||
        storedDraft.time.trim() !== draft.time.trim()
      ) {
        return true;
      }
    }
    return false;
  }, [dayInputValue, dayMatches, editingDay, editingDayId]);

const handlePickDay = () => {
  // on sort la ref dans une constante bien typée
  const input = dayInputRef.current as HTMLInputElement | null;
  if (!input) return;

  const maybePicker = (input as PickerInput).showPicker;

  if (typeof maybePicker === "function") {
    maybePicker();
  } else {
    // fallback classique : focus + "ouverture" via click
    input.focus();
    input.click();
  }
};

  const addMatchDraft = () => {
    const { homeTeam, awayTeam } = getDefaultMatchTeams();
    setDayMatches((prev) => [
      ...prev,
      {
        id: buildId(),
        homeTeam,
        awayTeam,
        time: "18:00",
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

  const adjustMatchTime = (matchId: string, deltaMinutes: number) => {
    setDayMatches((prev) =>
      prev.map((match) => {
        if (match.id !== matchId) return match;
        const [hours, minutes] = (match.time || "18:00")
          .split(":")
          .map((value) => Number(value));
        const currentTotal =
          ((Number.isNaN(hours) ? 18 : hours) * 60) +
          (Number.isNaN(minutes) ? 0 : minutes);
        let nextTotal = currentTotal + deltaMinutes;
        if (nextTotal < 0) nextTotal += 24 * 60;
        if (nextTotal >= 24 * 60) nextTotal -= 24 * 60;
        const nextHours = Math.floor(nextTotal / 60);
        const nextMinutes = nextTotal % 60;
        return {
          ...match,
          time: `${String(nextHours).padStart(2, "0")}:${String(
            nextMinutes,
          ).padStart(2, "0")}`,
        };
      }),
    );
  };

  const canValidateDay =
    dayMatches.length > 0 &&
    dayMatches.every((match) => {
      const home = match.homeTeam.trim();
      const away = match.awayTeam.trim();
      return home.length > 0 && away.length > 0 && home !== away;
    });

  const handleValidateDay = async () => {
    if (!championship || !canValidateDay) return;
    const existingDay = editingDayId
      ? days.find((day) => day.id === editingDayId)
      : null;
    const nextDay: ChampionshipDay = {
      id: existingDay?.id ?? buildId(),
      name: existingDay?.name ?? `Journée ${days.length + 1}`,
      date: dayDate.toISOString(),
      matches: dayMatches.map((match) => {
        const isLocalHome = isLocalTeamName(match.homeTeam);
        const isLocalAway = isLocalTeamName(match.awayTeam);
        const opponentName = isLocalHome
          ? match.awayTeam
          : isLocalAway
          ? match.homeTeam
          : match.awayTeam || "Adversaire";
        const homeAway = isLocalHome
          ? "home"
          : isLocalAway
          ? "away"
          : "home";
        return {
          id: buildId(),
          homeAway,
          opponent: opponentName,
          date: dayDate.toISOString(),
          time: match.time || "18:00",
          status: "draft",
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
        };
      }),
    };
    const nextDays = editingDayId
      ? days.map((day) => (day.id === editingDayId ? nextDay : day))
      : [...days, nextDay];
    setDays(nextDays);
    await persistChampionship(championship, nextDays);
    setDayMatches([]);
    setDayWizardStep(1);
    setTimePickerMatchId(null);
    setEditingDayId(null);
  };

  const handleDeleteDay = async (dayId: string) => {
    if (!championship) return;
    const nextDays = days.filter((day) => day.id !== dayId);
    setDays(nextDays);
    await persistChampionship(championship, nextDays);
      if (editingDayId === dayId) {
        setEditingDayId(null);
        setDayWizardStep(1);
    }
  };

  const handleDeleteAllDays = async () => {
    if (!championship) return;
    setDays([]);
    await persistChampionship(championship, []);
    setEditingDayId(null);
    setDayWizardStep(1);
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
              <button
                type="button"
                onClick={() => setWidgetTab("calendar")}
                className={[
                  "flex items-center rounded-full px-4 py-2 text-xs font-semibold transition backdrop-blur-sm",
                  widgetTab === "calendar"
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
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M16 3v4" />
                  <path d="M8 3v4" />
                  <path d="M3 11h18" />
                </svg>
                Calendrier
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
                      {renderTeamBadge(teamLabel, {
                        image: "h-8 w-8 rounded-full object-cover",
                        initial:
                          "inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-white/10 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85 shadow-[inset_0_0_10px_rgba(255,255,255,0.12)]",
                      })}
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
                  <div className="flex items-center justify-center rounded-xl border-l-2 border-violet-400/60 bg-violet-500/5 px-3 py-2">
                    <p className="text-[13px] font-semibold uppercase tracking-[0.3em] text-violet-200">
                      Classement
                    </p>
                  </div>
                  <div className="rounded-2xl p-4">
                    <div>
                      <div className="grid grid-cols-[32px_minmax(0,1fr)_40px_32px_32px_32px_32px] items-center gap-x-3 px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-violet-200/60 sm:grid-cols-[32px_minmax(0,1fr)_40px_32px_32px_32px_32px_36px_36px_46px]">
                        <span>#</span>
                        <span>Équipe</span>
                        <span className="text-center">Pts</span>
                        <span className="text-center">MJ</span>
                        <span className="text-center">V</span>
                        <span className="text-center">N</span>
                        <span className="text-center">D</span>
                        <span className="hidden text-center sm:inline">BP</span>
                        <span className="hidden text-center sm:inline">BC</span>
                        <span className="hidden text-center sm:inline">Diff</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {computedRanking.map((row) => (
                          <div
                            key={row.name}
                            className="grid grid-cols-[32px_minmax(0,1fr)_40px_32px_32px_32px_32px] items-center gap-x-3 rounded-xl px-3 py-2 text-xs text-violet-100/80 sm:grid-cols-[32px_minmax(0,1fr)_40px_32px_32px_32px_32px_36px_36px_46px]"
                          >
                          <span className="relative flex items-center justify-center text-violet-200/50 tabular-nums">
                            {row.rank === 1 ? (
                              <img
                                src="/icons/COUPE1.png"
                                alt="Leader"
                                className="absolute -left-2 h-6 w-6 object-contain"
                              />
                            ) : null}
                            <span>{row.rank}</span>
                          </span>
                          <div className="flex min-w-0 items-center gap-2">
                            {renderTeamBadge(row.name, {
                              image: "h-7 w-7 rounded-full object-cover",
                              initial:
                                "flex h-7 w-7 items-center justify-center rounded-full border border-violet-400/30 bg-white/8 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-100/80 shadow-[inset_0_0_8px_rgba(124,58,237,0.18)]",
                            })}
                            <span className="truncate text-violet-100/85">
                              {row.name}
                            </span>
                          </div>
                          <span className="text-center text-[13px] font-semibold text-white tabular-nums">
                            {row.points}
                          </span>
                          <span className="text-center text-[11px] text-violet-200/60 tabular-nums">
                            {row.played}
                          </span>
                          <span className="text-center text-[11px] text-violet-200/60 tabular-nums">
                            {row.wins}
                          </span>
                          <span className="text-center text-[11px] text-violet-200/60 tabular-nums">
                            {row.draws}
                          </span>
                          <span className="text-center text-[11px] text-violet-200/60 tabular-nums">
                            {row.losses}
                          </span>
                          <span className="hidden text-center text-[11px] text-violet-200/60 tabular-nums sm:inline">
                            {row.goalsFor}
                          </span>
                          <span className="hidden text-center text-[11px] text-violet-200/60 tabular-nums sm:inline">
                            {row.goalsAgainst}
                          </span>
                          <span className="hidden text-center sm:inline">
                            <span
                              className={[
                                "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                row.goalDiff < 0
                                  ? "bg-white/20 text-slate-100 shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                                  : "bg-violet-400/25 text-white shadow-[0_0_12px_rgba(139,92,246,0.35)]",
                              ].join(" ")}
                            >
                              {row.goalDiff}
                            </span>
                          </span>
                          </div>
                        ))}
                        <div className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-white/50 to-transparent shadow-[0_0_6px_rgba(255,255,255,0.35)]" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {widgetTab === "results" ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-2 rounded-xl border-l-2 border-violet-400/60 bg-violet-500/5 px-3 py-2 sm:px-4 sm:py-2.5">
                    <p className="text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-[#f5f1e8] sm:text-[12px]">
                      Résultat dernière journée
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 text-[9px] sm:text-[10px]">
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
                        <div
                          key={latestResultsDay.id}
                          className="space-y-2 rounded-2xl bg-black/50 p-3 backdrop-blur-sm"
                        >
                          <div className="flex items-center justify-between text-xs text-white/65">
                            <span className="uppercase tracking-[0.2em] text-violet-200/70">
                              {latestResultsDay.name}
                            </span>
                            <span>
                              {formatShortDate(latestResultsDay.date)}
                            </span>
                          </div>
                          <div className="relative w-full">
                            <button
                              type="button"
                              onClick={() =>
                                scrollResultsBy(latestResultsDay.id, "left")
                              }
                              className="absolute left-0 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition hover:border-white/30 hover:text-white"
                              aria-label="Résultats précédents"
                            >
                              ‹
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                scrollResultsBy(latestResultsDay.id, "right")
                              }
                              className="absolute right-0 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition hover:border-white/30 hover:text-white"
                              aria-label="Résultats suivants"
                            >
                              ›
                            </button>
                            <div className="relative w-full">
                              <div
                                ref={(node) => {
                                  resultsScrollRefs.current[
                                    latestResultsDay.id
                                  ] = node;
                                }}
                                className="results-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
                              >
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
                                const parsed = parseScore(match.score);
                                const homeResult = parsed
                                  ? parsed.home > parsed.away
                                    ? "win"
                                    : parsed.home < parsed.away
                                    ? "loss"
                                    : "draw"
                                  : null;
                                const awayResult = parsed
                                  ? parsed.away > parsed.home
                                    ? "win"
                                    : parsed.away < parsed.home
                                    ? "loss"
                                    : "draw"
                                  : null;
                                const localResult = isLocalTeamName(homeTeam)
                                  ? homeResult
                                  : isLocalTeamName(awayTeam)
                                  ? awayResult
                                  : null;
                                const localSide = isLocalTeamName(homeTeam)
                                  ? "home"
                                  : isLocalTeamName(awayTeam)
                                  ? "away"
                                  : null;
                                const indicator = localResult && localSide
                                  ? localResult === "draw"
                                    ? {
                                        color:
                                          "bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.35)]",
                                      }
                                    : localResult === "win"
                                    ? {
                                        color:
                                          "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.55)]",
                                      }
                                    : {
                                        color:
                                          "bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.55)]",
                                      }
                                  : null;
                                const isFinished =
                                  resolveMatchStatus(match) === "finished";
                                  return (
                                    <button
                                      key={match.id}
                                      type="button"
                                      onClick={() =>
                                        openMatchDetails({
                                          match,
                                          dayName: latestResultsDay.name,
                                          dayDate: latestResultsDay.date,
                                          source: "results",
                                          homeTeam,
                                          awayTeam,
                                        })
                                      }
                                      className="relative w-full min-w-full shrink-0 snap-start rounded-xl px-4 py-2 text-left text-white/80 transition hover:scale-[1.01] hover:shadow-[0_0_36px_rgba(168,85,247,0.55)] active:scale-[1.01] active:shadow-[0_0_44px_rgba(168,85,247,0.85)] sm:px-6"
                                    >
                                    <div className="flex items-center justify-between text-[clamp(9px,1.2vw,10px)] text-white/60">
                                      <span>{match.time || "--:--"}</span>
                                      <span />
                                    </div>
                                    {isFinished ? (
                                      <span className="absolute right-4 top-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-[9px] uppercase tracking-[0.2em] text-emerald-200">
                                        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                                        Match terminé
                                      </span>
                                    ) : null}
                                    <div className="relative mt-2 grid grid-cols-[minmax(0,1fr)_clamp(96px,14vw,140px)_minmax(0,1fr)] items-center gap-2 text-[clamp(12px,1.4vw,13px)] text-white/85 sm:gap-3">
                                      <div className="flex min-w-0 items-center justify-end pl-2 pr-[clamp(32px,5vw,48px)] text-right">
                                        <span
                                          className="block text-center font-semibold text-[#f5f5f5]"
                                          style={{
                                            display: "-webkit-box",
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: "vertical",
                                            overflow: "hidden",
                                            wordBreak: "break-word",
                                          }}
                                        >
                                          {homeTeam}
                                        </span>
                                      </div>
                                      <div className="flex flex-col items-center gap-1 text-center">
                                        {parsed ? (
                                          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2">
                                            <span
                                              className="justify-self-end text-[clamp(28px,5vw,44px)] font-semibold leading-none text-white tabular-nums"
                                              style={{
                                                textShadow:
                                                  "0 0 4px rgba(168,85,247,0.85), 0 0 10px rgba(168,85,247,0.4), 0 0 6px rgba(255,255,255,0.12)",
                                              }}
                                            >
                                              {parsed.home}
                                            </span>
                                            <span className="text-[clamp(16px,3vw,22px)] text-white/60">
                                              -
                                            </span>
                                            <span
                                              className="justify-self-start text-[clamp(28px,5vw,44px)] font-semibold leading-none text-white tabular-nums"
                                              style={{
                                                textShadow:
                                                  "0 0 4px rgba(168,85,247,0.85), 0 0 10px rgba(168,85,247,0.4), 0 0 6px rgba(255,255,255,0.12)",
                                              }}
                                            >
                                              {parsed.away}
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="flex items-center justify-center">
                                            <span
                                              className="whitespace-nowrap text-center text-[clamp(28px,5vw,44px)] font-semibold leading-none text-white tabular-nums"
                                              style={{
                                                textShadow:
                                                  "0 0 4px rgba(168,85,247,0.85), 0 0 10px rgba(168,85,247,0.4), 0 0 6px rgba(255,255,255,0.12)",
                                              }}
                                            >
                                              {match.score ?? "—"}
                                            </span>
                                          </div>
                                        )}
                                        {indicator ? (
                                          <div className="flex w-full items-center justify-center">
                                            <span
                                              className={[
                                                "h-2.5 w-2.5 rounded-full",
                                                indicator.color,
                                              ].join(" ")}
                                            />
                                          </div>
                                        ) : null}
                                      </div>
                                      <div className="flex min-w-0 items-center justify-start pl-[clamp(32px,5vw,48px)] pr-2 text-left">
                                        <span
                                          className="block text-center font-semibold text-[#f5f5f5]"
                                          style={{
                                            display: "-webkit-box",
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: "vertical",
                                            overflow: "hidden",
                                            wordBreak: "break-word",
                                          }}
                                        >
                                          {awayTeam}
                                        </span>
                                      </div>
                                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                        <div className="grid w-full grid-cols-[minmax(0,1fr)_clamp(96px,14vw,140px)_minmax(0,1fr)] items-center self-stretch">
                                          <div className="flex items-center justify-end pr-[clamp(8px,2vw,14px)]">
                                            {renderTeamBadge(homeTeam, {
                                              image:
                                                "h-[clamp(24px,4vw,32px)] w-[clamp(24px,4vw,32px)] rounded-full object-cover",
                                              initial:
                                                "flex h-[clamp(24px,4vw,32px)] w-[clamp(24px,4vw,32px)] shrink-0 items-center justify-center rounded-full border border-white/60 bg-[#f5f1e8] text-[clamp(9px,1.2vw,10px)] font-semibold uppercase tracking-[0.14em] text-violet-700",
                                            })}
                                          </div>
                                          <div />
                                          <div className="flex items-center justify-start pl-[clamp(8px,2vw,14px)]">
                                            {renderTeamBadge(awayTeam, {
                                              image:
                                                "h-[clamp(24px,4vw,32px)] w-[clamp(24px,4vw,32px)] rounded-full object-cover",
                                              initial:
                                                "flex h-[clamp(24px,4vw,32px)] w-[clamp(24px,4vw,32px)] shrink-0 items-center justify-center rounded-full border border-white/60 bg-[#f5f1e8] text-[clamp(9px,1.2vw,10px)] font-semibold uppercase tracking-[0.14em] text-violet-700",
                                            })}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}
              {widgetTab === "calendar" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center rounded-xl border-l-2 border-violet-400/60 bg-violet-500/5 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-violet-200">
                      Prochain match
                    </p>
                  </div>
                  {nextCalendarMatch ? (
                    renderNextCalendarMatchCard(nextCalendarMatch)
                  ) : (
                    <p className="text-sm text-white/60">
                      Pas encore planifié.
                    </p>
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
                  {renderTeamBadge(team.name, {
                    image:
                      "h-8 w-8 rounded-full object-cover transition group-hover:scale-[1.03]",
                    initial:
                      "flex h-8 w-8 items-center justify-center rounded-full border border-violet-400/30 bg-white/8 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-100/80 shadow-[inset_0_0_8px_rgba(124,58,237,0.18)] transition group-hover:scale-[1.03] group-hover:shadow-[0_0_16px_rgba(124,58,237,0.4)]",
                  })}
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
                  <div className="relative w-full">
                    <button
                      type="button"
                      onClick={() => scrollResultsBy(day.id, "left")}
                      className="absolute left-0 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition hover:border-white/30 hover:text-white"
                      aria-label="Résultats précédents"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollResultsBy(day.id, "right")}
                      className="absolute right-0 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition hover:border-white/30 hover:text-white"
                      aria-label="Résultats suivants"
                    >
                      ›
                    </button>
                    <div className="relative w-full">
                      <div
                        ref={(node) => {
                          resultsScrollRefs.current[day.id] = node;
                        }}
                        className="results-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
                      >
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
                      const parsed = parseScore(match.score);
                      const homeResult = parsed
                        ? parsed.home > parsed.away
                          ? "win"
                          : parsed.home < parsed.away
                          ? "loss"
                          : "draw"
                        : null;
                      const awayResult = parsed
                        ? parsed.away > parsed.home
                          ? "win"
                          : parsed.away < parsed.home
                          ? "loss"
                          : "draw"
                        : null;
                      const localResult = isLocalTeamName(homeTeam)
                        ? homeResult
                        : isLocalTeamName(awayTeam)
                        ? awayResult
                        : null;
                      const localSide = isLocalTeamName(homeTeam)
                        ? "home"
                        : isLocalTeamName(awayTeam)
                        ? "away"
                        : null;
                      const indicator = localResult && localSide
                        ? localResult === "draw"
                          ? {
                              color:
                                "bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.35)]",
                            }
                          : localResult === "win"
                          ? {
                              color:
                                "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.55)]",
                            }
                          : {
                              color:
                                "bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.55)]",
                            }
                        : null;
                        return (
                          <button
                            key={match.id}
                            type="button"
                            onClick={() =>
                              openMatchDetails({
                                match,
                                dayName: day.name,
                                dayDate: day.date,
                                source: "results",
                                homeTeam,
                                awayTeam,
                              })
                            }
                            className="relative w-full min-w-full shrink-0 snap-start rounded-xl px-4 py-2 text-left text-white/80 transition hover:scale-[1.01] hover:shadow-[0_0_36px_rgba(168,85,247,0.55)] active:scale-[1.01] active:shadow-[0_0_44px_rgba(168,85,247,0.85)] sm:px-6"
                          >
                            <div className="flex items-center justify-between text-[clamp(9px,1.2vw,10px)] text-white/60">
                              <span>{match.time || "--:--"}</span>
                              <span />
                            </div>
                            <div className="relative mt-2 grid grid-cols-[minmax(0,1fr)_clamp(96px,14vw,140px)_minmax(0,1fr)] items-center gap-2 text-[clamp(12px,1.4vw,13px)] text-white/85 sm:gap-3">
                              <div className="flex min-w-0 items-center justify-end pl-2 pr-[clamp(32px,5vw,48px)] text-right">
                                <span
                                  className="block text-center font-semibold text-[#f5f5f5]"
                                  style={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {homeTeam}
                                </span>
                              </div>
                              <div className="flex flex-col items-center gap-1 text-center">
                                {parsed ? (
                                  <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2">
                                    <span
                                      className="justify-self-end text-[clamp(28px,5vw,44px)] font-semibold leading-none text-white tabular-nums"
                                      style={{
                                        textShadow:
                                          "0 0 4px rgba(168,85,247,0.85), 0 0 10px rgba(168,85,247,0.4), 0 0 6px rgba(255,255,255,0.12)",
                                      }}
                                    >
                                      {parsed.home}
                                    </span>
                                    <span className="text-[clamp(16px,3vw,22px)] text-white/60">
                                      -
                                    </span>
                                    <span
                                      className="justify-self-start text-[clamp(28px,5vw,44px)] font-semibold leading-none text-white tabular-nums"
                                      style={{
                                        textShadow:
                                          "0 0 4px rgba(168,85,247,0.85), 0 0 10px rgba(168,85,247,0.4), 0 0 6px rgba(255,255,255,0.12)",
                                      }}
                                    >
                                      {parsed.away}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center">
                                    <span
                                      className="whitespace-nowrap text-center text-[clamp(28px,5vw,44px)] font-semibold leading-none text-white tabular-nums"
                                      style={{
                                        textShadow:
                                          "0 0 4px rgba(168,85,247,0.85), 0 0 10px rgba(168,85,247,0.4), 0 0 6px rgba(255,255,255,0.12)",
                                      }}
                                    >
                                      {match.score ?? "—"}
                                    </span>
                                  </div>
                                )}
                                {indicator ? (
                                  <div className="flex w-full items-center justify-center">
                                    <span
                                      className={[
                                        "h-2.5 w-2.5 rounded-full",
                                        indicator.color,
                                      ].join(" ")}
                                    />
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex min-w-0 items-center justify-start pl-[clamp(32px,5vw,48px)] pr-2 text-left">
                                <span
                                  className="block text-center font-semibold text-[#f5f5f5]"
                                  style={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {awayTeam}
                                </span>
                              </div>
                              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <div className="grid w-full grid-cols-[minmax(0,1fr)_clamp(96px,14vw,140px)_minmax(0,1fr)] items-center self-stretch">
                                  <div className="flex items-center justify-end pr-[clamp(8px,2vw,14px)]">
                                    {renderTeamBadge(homeTeam, {
                                      image:
                                        "h-[clamp(24px,4vw,32px)] w-[clamp(24px,4vw,32px)] rounded-full object-cover",
                                      initial:
                                        "flex h-[clamp(24px,4vw,32px)] w-[clamp(24px,4vw,32px)] shrink-0 items-center justify-center rounded-full border border-white/60 bg-[#f5f1e8] text-[clamp(9px,1.2vw,10px)] font-semibold uppercase tracking-[0.14em] text-violet-700",
                                    })}
                                  </div>
                                  <div />
                                  <div className="flex items-center justify-start pl-[clamp(8px,2vw,14px)]">
                                    {renderTeamBadge(awayTeam, {
                                      image:
                                        "h-[clamp(24px,4vw,32px)] w-[clamp(24px,4vw,32px)] rounded-full object-cover",
                                      initial:
                                        "flex h-[clamp(24px,4vw,32px)] w-[clamp(24px,4vw,32px)] shrink-0 items-center justify-center rounded-full border border-white/60 bg-[#f5f1e8] text-[clamp(9px,1.2vw,10px)] font-semibold uppercase tracking-[0.14em] text-violet-700",
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-white/50 to-transparent shadow-[0_0_6px_rgba(255,255,255,0.35)]" />
            </div>
          )}
        </div>
      ) : null}


      {championship && widgetTab === "calendar" ? (
        <div className="w-full rounded-2xl p-4">
          <div className="flex flex-col gap-2">
            <div className="relative flex items-center justify-center gap-3">
              <div className="absolute left-0 flex items-center">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setQuickScoreMenuOpen((prev) => !prev)
                    }
                    className="flex h-8 w-8 items-center justify-center text-white/70 transition hover:text-white"
                    aria-label="Actions calendrier"
                  >
                    ☰
                  </button>
                  {quickScoreMenuOpen ? (
                    <div className="absolute left-0 z-20 mt-2 w-40 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e1a] p-2 shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
                      <button
                        type="button"
                        onClick={() => {
                          setQuickScoreMenuOpen(false);
                          setQuickScoreOpen(true);
                        }}
                        className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-white/80 transition hover:bg-white/5"
                      >
                        Score rapide
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <span className="h-1.5 w-1.5 rotate-45 bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-white/90">
                Calendrier
              </p>
              <span className="h-1.5 w-1.5 rotate-45 bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
            </div>
            <div className="flex items-center justify-end gap-3 text-xs text-violet-200">
              <span>{days.length} journées</span>
              <button
                type="button"
                onClick={openDayWizard}
                className="rounded-full border border-violet-200/50 bg-violet-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-100 transition hover:bg-violet-500/20"
              >
                Ajouter
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-400/70 to-violet-400/40" />
            <span className="ml-3 h-1.5 w-1.5 rounded-full bg-violet-300 shadow-[0_0_10px_rgba(124,58,237,0.8)]" />
            <span className="ml-2 h-px w-10 bg-gradient-to-r from-violet-300/80 to-transparent" />
          </div>

          {days.length === 0 ? (
            <div className="mt-3 flex flex-col items-center gap-4 text-center">
              <p className="text-xs text-violet-200/70">
                Lance ta saison, aucune journée n&apos;a été créée.
              </p>
              <button
                type="button"
                onClick={openDayWizard}
                className="rounded-full border border-violet-200/60 bg-transparent px-5 py-2 text-xs font-semibold text-white shadow-[0_0_24px_rgba(139,92,246,0.5)] transition hover:bg-violet-500/20"
              >
                Ajoute ta première journée
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-violet-300">
                    Journée à venir
                  </p>
                  <div className="h-px flex-1 bg-gradient-to-r from-violet-300/40 via-white/35 to-transparent" />
                  <button
                    type="button"
                    onClick={() =>
                      setShowFutureCalendar((prev) => !prev)
                    }
                    className="text-white/70 transition hover:text-white"
                    aria-label="Afficher les matchs futurs"
                  >
                    <span
                      className={[
                        "text-base leading-none transition",
                        showFutureCalendar ? "rotate-180" : "",
                      ].join(" ")}
                    >
                      ▾
                    </span>
                  </button>
                </div>
                {showFutureCalendar ? (
                  upcomingCalendarDays.length ? (
                    renderCalendarDayList(upcomingCalendarDays)
                  ) : (
                    <p className="text-xs text-violet-200/70">
                      Pas encore planifié.
                    </p>
                  )
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-400/40 to-transparent" />
                <span className="h-1.5 w-1.5 rotate-45 bg-white/70 shadow-[0_0_8px_rgba(255,255,255,0.45)]" />
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-400/30 to-transparent" />
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-violet-300">
                    Journée terminée
                  </p>
                  <div className="h-px flex-1 bg-gradient-to-r from-violet-300/30 via-white/20 to-transparent" />
                  <button
                    type="button"
                    onClick={() => setShowPastCalendar((prev) => !prev)}
                    className="text-white/70 transition hover:text-white"
                    aria-label="Afficher les matchs passés"
                  >
                    <span
                      className={[
                        "text-base leading-none transition",
                        showPastCalendar ? "rotate-180" : "",
                      ].join(" ")}
                    >
                      ▾
                    </span>
                  </button>
                </div>
                {showPastCalendar ? (
                  pastCalendarDays.length ? (
                    renderCalendarDayList(pastCalendarDays)
                  ) : (
                    <p className="text-xs text-violet-200/70">
                      Aucun match passé.
                    </p>
                  )
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {quickScoreOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div
            className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-transparent p-6 shadow-[0_30px_80px_rgba(0,0,0,0.6)] max-h-[90vh]"
            style={{
              backgroundImage:
                "url('/backgrounds/MATCH/FOND%20CHAMPIONNA.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="pointer-events-none absolute inset-0 bg-black/65" />
            <div className="relative z-10 flex max-h-[80vh] flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-300">
                    Score rapide
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-100">
                    Renseigne les scores
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickScoreOpen(false)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200"
                >
                  Fermer
                </button>
              </div>

              <div className="mt-6 space-y-5 overflow-y-auto pr-1">
                {days.length === 0 ? (
                  <p className="text-sm text-white/70">
                    Aucune journée créée.
                  </p>
                ) : (
                  days.map((day) => (
                    <div
                      key={day.id}
                      className="rounded-2xl border border-white/10 bg-black/40 p-4"
                    >
                      <div className="flex items-center justify-between text-xs text-white/70">
                        <span className="uppercase tracking-[0.2em] text-violet-200/70">
                          {day.name}
                        </span>
                        <span>{formatShortDate(day.date)}</span>
                      </div>
                      <div className="mt-3 space-y-2">
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
                          const draft = quickScoreDrafts[match.id] ?? {
                            home: "",
                            away: "",
                          };
                          return (
                            <div
                              key={match.id}
                              className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80"
                            >
                              <span className="text-right text-sm font-semibold text-white/90">
                                {homeTeam}
                              </span>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  inputMode="numeric"
                                  value={draft.home}
                                  onChange={(event) =>
                                    setQuickScoreValue(
                                      match.id,
                                      "home",
                                      event.target.value,
                                    )
                                  }
                                  className="w-12 bg-transparent text-center text-base font-semibold text-white [appearance:textfield] focus:outline-none"
                                />
                                <span className="text-white/60">-</span>
                                <input
                                  type="number"
                                  min={0}
                                  inputMode="numeric"
                                  value={draft.away}
                                  onChange={(event) =>
                                    setQuickScoreValue(
                                      match.id,
                                      "away",
                                      event.target.value,
                                    )
                                  }
                                  className="w-12 bg-transparent text-center text-base font-semibold text-white [appearance:textfield] focus:outline-none"
                                />
                              </div>
                              <span className="text-left text-sm font-semibold text-white/90">
                                {awayTeam}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setQuickScoreOpen(false)}
                  className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-xs text-slate-300"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuickScores}
                  className="rounded-full border border-emerald-400/50 bg-emerald-500/20 px-5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500/30"
                >
                  Valider
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {matchDetails ? (() => {
        const matchDateValue =
          matchDetails.match.date || matchDetails.dayDate || "";
        const matchDate = matchDateValue ? new Date(matchDateValue) : null;
        const now = new Date();
        const isFuture = matchDate ? matchDate > now : false;
        const isPast = matchDate ? matchDate < now : false;
        const isLocalMatch =
          isLocalTeamName(matchDetails.homeTeam) ||
          isLocalTeamName(matchDetails.awayTeam);
        const canEdit = matchDetails.source === "calendar" && isPast;
        const scoreLabel = matchDetails.match.score ?? "—";
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
            <div
              className="relative w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-transparent p-6 shadow-[0_30px_80px_rgba(0,0,0,0.6)] max-h-[90vh]"
              style={{
                backgroundImage:
                  "url('/backgrounds/MATCH/FOND%20CHAMPIONNA.png')",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="pointer-events-none absolute inset-0 bg-black/65" />
              <div className="relative z-10 flex min-h-[70vh] flex-col">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-300">
                      Détails du match
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-100">
                      {matchDetails.dayName}
                    </h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {formatShortDate(matchDetails.dayDate)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeMatchDetails}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200"
                  >
                    Fermer
                  </button>
                </div>

              {matchDetails.source === "calendar" ? (
                <>
                  {matchSaveFeedback ? (
                    <div className="mt-4 flex justify-end">
                      <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-emerald-200">
                        Match enregistré – stats mises à jour
                      </span>
                    </div>
                  ) : null}
                  <div className="mt-6 rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/18 via-violet-500/8 to-indigo-500/18 p-2.5 shadow-[0_0_30px_rgba(124,58,237,0.35)]">
                    <div className="flex items-start justify-between text-[10px] text-white/70">
                      <span>{matchDetails.match.time || "Horaire"}</span>
                      <span />
                    </div>
                    <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <div className="flex items-center justify-end gap-3 text-right">
                        {renderTeamBadge(matchDetails.homeTeam, {
                          image: "h-10 w-10 rounded-full object-cover",
                          initial:
                            "flex h-10 w-10 items-center justify-center rounded-full border border-violet-400/30 bg-white/8 text-xs font-semibold uppercase tracking-[0.16em] text-violet-100/80",
                        })}
                        <span className="max-w-[220px] text-sm font-semibold text-white">
                          {matchDetails.homeTeam}
                        </span>
                      </div>
                        <div className="flex items-center justify-center gap-4">
                          <div className="flex flex-col items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              value={scoreDraft?.home ?? ""}
                              onChange={(event) =>
                                setScoreValue("home", event.target.value)
                              }
                              onFocus={(event) => {
                                if (event.currentTarget.value === "0") {
                                  setScoreValue("home", "");
                                }
                                event.currentTarget.select();
                              }}
                              className="w-10 bg-transparent text-center text-2xl font-semibold text-white [appearance:textfield] focus:outline-none"
                            />
                          </div>
                          <span className="text-xl text-white/60">-</span>
                          <div className="flex flex-col items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              value={scoreDraft?.away ?? ""}
                              onChange={(event) =>
                                setScoreValue("away", event.target.value)
                              }
                              onFocus={(event) => {
                                if (event.currentTarget.value === "0") {
                                  setScoreValue("away", "");
                                }
                                event.currentTarget.select();
                              }}
                              className="w-10 bg-transparent text-center text-2xl font-semibold text-white [appearance:textfield] focus:outline-none"
                            />
                          </div>
                        </div>
                      <div className="flex items-center justify-start gap-3 text-left">
                        <span className="max-w-[220px] text-sm font-semibold text-white">
                          {matchDetails.awayTeam}
                        </span>
                        {renderTeamBadge(matchDetails.awayTeam, {
                          image: "h-10 w-10 rounded-full object-cover",
                          initial:
                            "flex h-10 w-10 items-center justify-center rounded-full border border-violet-400/30 bg-white/8 text-xs font-semibold uppercase tracking-[0.16em] text-violet-100/80",
                        })}
                      </div>
                    </div>
                  </div>

                  {isLocalMatch ? (
                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-violet-300/20 bg-black/40 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                            Buteurs
                          </p>
                          <div ref={scorersRef} className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setScorersOpen((prev) => !prev)
                              }
                              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/70 transition hover:bg-white/10"
                            >
                              Ajouter
                              <span className="text-xs">▾</span>
                            </button>
                            {scorersOpen ? (
                              <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e1a] p-2 shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
                                <div
                                  ref={scorersListRef}
                                  className="max-h-40 space-y-1 overflow-y-auto"
                                >
                                  {playersLoading ? (
                                    <p className="px-2 py-1 text-xs text-slate-500">
                                      Chargement des joueurs...
                                    </p>
                                  ) : localRoster.length ? (
                                localRoster.map((player) => {
                                      const isSelected =
                                        Boolean(scorers[player.id]);
                                      return (
                                        <button
                                          key={player.id}
                                          type="button"
                                          data-player-id={player.id}
                                          onClick={() => {
                                            setLastScorerId(player.id);
                                            toggleStatSelection(
                                              setScorers,
                                              player.id,
                                            );
                                          }}
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
                                  {playersError ? (
                                    <p className="px-2 py-1 text-xs text-rose-300">
                                      {playersError}
                                    </p>
                                  ) : null}
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
                                <div className="flex items-center gap-2">
                                  <span className="text-white">
                                    {rosterById[playerId]?.label ?? playerId}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
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
                                    className="w-10 bg-transparent text-center text-sm font-semibold text-white [appearance:textfield] focus:outline-none"
                                  />
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-slate-500">
                              Aucun buteur sélectionné.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-violet-300/20 bg-black/40 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                            Passes décisives
                          </p>
                          <div ref={assistsRef} className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setAssistsOpen((prev) => !prev)
                              }
                              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/70 transition hover:bg-white/10"
                            >
                              Ajouter
                              <span className="text-xs">▾</span>
                            </button>
                            {assistsOpen ? (
                              <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e1a] p-2 shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
                                <div
                                  ref={assistsListRef}
                                  className="max-h-40 space-y-1 overflow-y-auto"
                                >
                                  {playersLoading ? (
                                    <p className="px-2 py-1 text-xs text-slate-500">
                                      Chargement des joueurs...
                                    </p>
                                  ) : localRoster.length ? (
                                localRoster.map((player) => {
                                      const isSelected =
                                        Boolean(assists[player.id]);
                                      return (
                                        <button
                                          key={player.id}
                                          type="button"
                                          data-player-id={player.id}
                                          onClick={() => {
                                            setLastAssistId(player.id);
                                            toggleStatSelection(
                                              setAssists,
                                              player.id,
                                            );
                                          }}
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
                                  {playersError ? (
                                    <p className="px-2 py-1 text-xs text-rose-300">
                                      {playersError}
                                    </p>
                                  ) : null}
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
                                <div className="flex items-center gap-2">
                                  <span className="text-white">
                                    {rosterById[playerId]?.label ?? playerId}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
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
                                    className="w-10 bg-transparent text-center text-sm font-semibold text-white [appearance:textfield] focus:outline-none"
                                  />
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-slate-500">
                              Aucune passe décisive.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-violet-300/15 bg-black/35 p-4 md:col-span-2 overflow-visible">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Distinctions
                        </p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div ref={motmRef} className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setMotmOpen((prev) => !prev)
                              }
                              className="flex w-full items-center justify-between rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/70 transition hover:bg-white/10"
                            >
                              {motmId
                                ? rosterById[motmId]?.label
                                : "Homme du match"}
                              <span className="text-xs">▾</span>
                            </button>
                            {motmOpen ? (
                              <div className="absolute left-0 right-0 z-30 mb-2 -translate-y-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e1a] p-2 shadow-[0_18px_40px_rgba(0,0,0,0.55)] bottom-full">
                                <div
                                  ref={motmListRef}
                                  className="max-h-40 space-y-1 overflow-y-auto"
                                >
                                  {localRoster.map((player) => (
                                    <button
                                      key={player.id}
                                      type="button"
                                      data-player-id={player.id}
                                      onClick={() => {
                                        setMotmId(player.id);
                                        setLastMotmId(player.id);
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
                            {motmId ? (
                              <div className="mt-2">
                                <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold text-emerald-200">
                                  {rosterById[motmId]?.label ?? motmId}
                                </span>
                              </div>
                            ) : null}
                          </div>
                          <div ref={needsBoostRef} className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setNeedsBoostOpen((prev) => !prev)
                              }
                              className="flex w-full items-center justify-between rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/70 transition hover:bg-white/10"
                            >
                              {needsBoostLabel}
                              <span className="text-xs">▾</span>
                            </button>
                            {needsBoostOpen ? (
                              <div className="absolute left-0 right-0 z-30 mb-2 -translate-y-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e1a] p-2 shadow-[0_18px_40px_rgba(0,0,0,0.55)] bottom-full">
                                <div
                                  ref={needsBoostListRef}
                                  className="max-h-40 space-y-1 overflow-y-auto"
                                >
                                  {localRoster.map((player) => (
                                    <button
                                      key={player.id}
                                      type="button"
                                      data-player-id={player.id}
                                      onClick={() => {
                                        setLastNeedsBoostId(player.id);
                                        toggleSelection(
                                          setNeedsBoost,
                                          player.id,
                                        );
                                      }}
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
                  <div className="mt-auto flex items-center justify-between pt-6">
                    <button
                      type="button"
                      onClick={handleClearMatchDetails}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-400/60 text-rose-200 transition hover:border-rose-400/90 hover:bg-rose-500/15"
                      aria-label="Supprimer les informations"
                    >
                      <svg
                        aria-hidden="true"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveMatchDetails}
                      className="rounded-full border border-emerald-400/50 bg-emerald-500/20 px-5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500/30"
                    >
                      Valider
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-5">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                      <div className="flex items-center justify-end gap-3 text-right">
                        {renderTeamBadge(matchDetails.homeTeam, {
                          image: "h-10 w-10 rounded-full object-cover",
                          initial:
                            "flex h-10 w-10 items-center justify-center rounded-full border border-violet-400/30 bg-white/8 text-xs font-semibold uppercase tracking-[0.16em] text-violet-100/80",
                        })}
                        <span className="max-w-[220px] text-sm font-semibold text-white">
                          {matchDetails.homeTeam}
                        </span>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <span
                          className="text-4xl font-semibold text-white"
                          style={{
                            textShadow:
                              "0 0 6px rgba(168,85,247,0.55), 0 0 16px rgba(168,85,247,0.3), 0 0 6px rgba(255,255,255,0.12)",
                          }}
                        >
                          {scoreLabel}
                        </span>
                      </div>
                      <div className="flex items-center justify-start gap-3 text-left">
                        <span className="max-w-[220px] text-sm font-semibold text-white">
                          {matchDetails.awayTeam}
                        </span>
                        {renderTeamBadge(matchDetails.awayTeam, {
                          image: "h-10 w-10 rounded-full object-cover",
                          initial:
                            "flex h-10 w-10 items-center justify-center rounded-full border border-violet-400/30 bg-white/8 text-xs font-semibold uppercase tracking-[0.16em] text-violet-100/80",
                        })}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-center text-xs text-slate-400">
                      {matchDetails.match.time || "Horaire à définir"}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Score
                      </p>
                      <p className="mt-3 text-sm text-slate-200">
                        {scoreLabel !== "—"
                          ? `Score final : ${scoreLabel}`
                          : "Score à renseigner."}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        Mi-temps : à compléter
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Buteurs
                      </p>
                      <p className="mt-3 text-sm text-slate-200">
                        À renseigner.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Passes
                      </p>
                      <p className="mt-3 text-sm text-slate-200">
                        À renseigner.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Cartons
                      </p>
                      <p className="mt-3 text-sm text-slate-200">
                        À renseigner.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 md:col-span-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Notes / résumé
                      </p>
                      <p className="mt-3 text-sm text-slate-200">
                        Ajoute un résumé du match.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 md:col-span-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Stats simples
                      </p>
                      <p className="mt-3 text-sm text-slate-200">
                        À venir.
                      </p>
                    </div>
                  </div>
                </>
              )}
              </div>
            </div>
          </div>
        );
      })() : null}

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
            className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-black/55 p-6 shadow-[0_32px_90px_rgba(10,8,24,0.7)] backdrop-blur-xl"
            style={{
              backgroundImage:
                "url('/backgrounds/MATCH/FOND%20CHAMPIONNA.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
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
            <div className="relative z-10 flex min-h-[70vh] flex-col">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-300">
                  Assistant journée
                </p>
                <h3 className="mt-2 text-xl font-semibold text-slate-100">
                  {dayWizardStep === 1
                    ? "Journées"
                    : "Créer tes matchs"}
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

            <div className="mt-2 flex flex-wrap items-center gap-4 px-1">
              <div className="min-w-[180px] flex-1">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  Championnat
                </p>
                <p className="mt-1 text-sm text-slate-100">
                  {displayChampionshipName}
                </p>
              </div>
              <div className="min-w-[140px]">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  Phase
                </p>
                {dayWizardStep === 1 ? (
                  <select
                    value={dayPhase}
                    onChange={(event) => setDayPhase(event.target.value)}
                    className="mt-1 w-full rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-slate-100"
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                ) : (
                  <p className="mt-1 text-xs font-semibold text-slate-200">
                    Phase {dayPhase}
                  </p>
                )}
              </div>
            </div>

            <StepPanel key={dayWizardStep} direction={dayStepDirection}>
              {dayWizardStep === 1 ? (
                <div className="mt-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-end gap-2" />
                  {days.length ? (
                    <div className="space-y-2">
                      {days.map((day, index) => (
                        <div
                          key={day.id}
                          className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-200"
                        >
                          <span className="font-semibold">
                            Journée {index + 1} créée
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">
                              {formatShortDate(day.date)}
                            </span>
                            <button
                              type="button"
                              onClick={() => openEditDay(day)}
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-violet-300/40 bg-violet-500/10 text-[10px] text-violet-200 transition hover:bg-violet-500/20"
                              aria-label="Modifier la journée"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDay(day.id)}
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-rose-300/40 bg-rose-500/10 text-[10px] text-rose-200 transition hover:bg-rose-500/20"
                              aria-label="Supprimer la journée"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">
                      Aucune journée créée pour l&apos;instant.
                    </p>
                  )}

                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={startNewDay}
                      className="w-fit rounded-full border border-white/15 bg-black/40 px-6 py-2 text-xs font-semibold text-white/90 shadow-[0_0_22px_rgba(0,0,0,0.45)] transition hover:bg-black/55"
                    >
                      {days.length > 0
                        ? "Ajouter une journée"
                        : "Créer ta première journée"}
                    </button>
                  </div>
                </div>
              ) : null}

              {dayWizardStep === 1 ? (
                <div className="mt-auto flex items-center justify-between pt-6">
                  {days.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleDeleteAllDays}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-400/60 text-rose-200 transition hover:border-rose-400/90 hover:bg-rose-500/15"
                      aria-label="Supprimer toutes les journées"
                    >
                      <svg
                        aria-hidden="true"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={closeDayWizard}
                    className="rounded-full border border-emerald-400/50 bg-emerald-500/20 px-5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500/30"
                  >
                    Valider
                  </button>
                </div>
              ) : null}

              {dayWizardStep === 2 ? (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="mt-1 flex items-center gap-2">
                      {(["aller", "retour"] as const).map((leg) => (
                        <button
                          key={leg}
                          type="button"
                          onClick={() => setDayLeg(leg)}
                          className={[
                            "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition",
                            dayLeg === leg
                              ? "border-white/30 bg-white/10 text-slate-100"
                              : "border-white/10 bg-white/5 text-slate-400 hover:text-slate-200",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/70 transition",
                              dayLeg === leg
                                ? "bg-violet-300 shadow-[0_0_10px_rgba(167,139,250,0.85)]"
                                : "bg-transparent",
                            ].join(" ")}
                          />
                          <span>
                            {leg === "aller" ? "Match Aller" : "Match Retour"}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => shiftDayDate(-1)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                      >
                        ◀
                      </button>
                      <input
                        ref={dayInputRef}
                        type="date"
                        value={dayInputValue}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          if (!nextValue) return;
                          setDayDate(new Date(`${nextValue}T00:00:00`));
                        }}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => shiftDayDate(1)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                      >
                        ▶
                      </button>
                    </div>
                  </div>

                  {dayMatches.map((match, index) => (
                    <div key={match.id} className="space-y-2">
                      <div className="p-1">
                        <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
                        <div>
                          <select
                            value={match.homeTeam}
                            onChange={(event) =>
                              updateMatch(match.id, {
                                homeTeam: event.target.value,
                              })
                            }
                            className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-1 text-xs text-slate-100"
                          >
                            <option value="">Choisir</option>
                            {teamOptions.map((team) => (
                              <option key={team} value={team}>
                                {team}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                          <div
                            className="relative"
                            ref={
                              timePickerMatchId === match.id
                                ? timePickerRef
                                : undefined
                            }
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setTimePickerMatchId((prev) =>
                                  prev === match.id ? null : match.id,
                                )
                              }
                              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/45 text-[10px] font-semibold text-white/90 shadow-[inset_0_0_10px_rgba(0,0,0,0.35)] transition hover:bg-black/60"
                              aria-label="Modifier l'heure"
                            >
                              <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.12),transparent_60%)]" />
                              <span className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-[1px] -translate-y-3 bg-white/45" />
                              <span className="pointer-events-none absolute left-1/2 top-1/2 h-[1px] w-2 -translate-x-1 bg-white/40" />
                              <span className="relative z-10">
                                {match.time || "18:00"}
                              </span>
                            </button>

                            {timePickerMatchId === match.id ? (
                              <div className="absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/70 p-2 shadow-[0_12px_30px_rgba(0,0,0,0.5)]">
                                <div className="flex flex-col items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      adjustMatchTime(match.id, 15)
                                    }
                                    className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[9px] text-white/80 transition hover:bg-white/10"
                                    aria-label="Heure suivante"
                                  >
                                    ▲
                                  </button>
                                  <input
                                    type="time"
                                    autoFocus
                                    inputMode="numeric"
                                    value={match.time}
                                    onChange={(event) =>
                                      updateMatch(match.id, {
                                        time: event.target.value,
                                      })
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        setTimePickerMatchId(null);
                                      }
                                    }}
                                    className="w-20 rounded-full border border-white/10 bg-black/50 px-2 py-1 text-[10px] text-slate-100"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      adjustMatchTime(match.id, -15)
                                    }
                                    className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[9px] text-white/80 transition hover:bg-white/10"
                                    aria-label="Heure précédente"
                                  >
                                    ▼
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div>
                          <select
                            value={match.awayTeam}
                            onChange={(event) =>
                              updateMatch(match.id, {
                                awayTeam: event.target.value,
                              })
                            }
                            className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-1 text-xs text-slate-100"
                          >
                            <option value="">Choisir</option>
                            {teamOptions.map((team) => (
                              <option key={team} value={team}>
                                {team}
                              </option>
                            ))}
                          </select>
                        </div>
                        </div>
                      </div>
                      {index < dayMatches.length - 1 ? (
                        <div className="h-px w-full bg-white/10" />
                      ) : null}
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addMatchDraft}
                    className="w-fit rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
                  >
                    + Ajouter une rencontre
                  </button>

                  <div className="mt-6 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setDayWizardStep(1)}
                      className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-xs text-slate-300"
                    >
                      Retour
                    </button>
                    <button
                      type="button"
                      onClick={handleValidateDay}
                      disabled={
                        !canValidateDay ||
                        (editingDayId ? !hasDayChanges : false)
                      }
                      className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/20 disabled:opacity-50"
                    >
                      {editingDayId
                        ? "Mettre à jour la journée"
                        : "Créer la journée"}
                    </button>
                  </div>
                </div>
              ) : null}
            </StepPanel>
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
