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

    {!loading && filteredExternal.length === 0 && filteredPoolTeams.length === 0 ? (
  hasMinChars ? (
    <p className="px-3 py-2 text-xs text-slate-400">
      Aucun club trouvé pour « {trimmedQuery} ».
    </p>
  ) : (
    <p className="px-3 py-2 text-xs text-slate-400">
      Commence à taper le nom d’un club (au moins 2 lettres) pour lancer la recherche.
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
};

function TeamSearchDropdown({ onSelect }: TeamSearchDropdownProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalClub[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);

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

  const handleSelect = (club: { name: string; id: string | null }) => {
    onSelect(club);
    setQuery("");
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
          {loading ? (
            <p className="px-3 py-2 text-xs text-slate-400">
              Recherche en cours…
            </p>
          ) : null}

{!loading && results.length === 0 ? (
  hasMinChars ? (
    <p className="px-3 py-2 text-xs text-slate-400">
      Aucun club trouvé pour « {trimmedQuery} ».
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
    const levelSuffix = teamInfo.level ? ` Niv ${teamInfo.level}` : "";
    return `${baseName}${levelSuffix}`.trim();
  }, [teamInfo]);

  const teamLabel = useMemo(() => {
    return teamInfo.clubName ?? teamInfo.name ?? "Mon équipe";
  }, [teamInfo]);

  const championshipTitle = useMemo(() => {
    const category = teamInfo.category ?? teamInfo.name ?? "Équipe";
    const levelSuffix = teamInfo.level ? ` – Niv ${teamInfo.level}` : "";
    return `Championnat ${category}${levelSuffix}`.trim();
  }, [teamInfo]);

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

  const buildDefaultDraft = (): ChampionshipUI => {
    const season = getCurrentSeason();
    const category = teamInfo.category ?? "U12";
    const levelLabel = teamInfo.level ? `NIV ${teamInfo.level}` : "NIV ?";
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
    setWizardStep(1);
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

  const handleCreateChampionship = () => {
    if (!draft || !canCreate) return;
    setChampionship({ ...draft });
    setWizardOpen(false);
    setDraft(null);
  };

  const handleDeleteChampionship = () => {
    setChampionship(null);
    setDays([]);
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

  const handleValidateDay = () => {
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
    setDays((prev) => [...prev, nextDay]);
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
        <div className="rounded-3xl border border-white/10 bg-black/35 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.3em] text-slate-300">
                Poule {championship.pool}
              </span>
              <h2 className="mt-4 text-xl font-semibold text-slate-100">
                {championshipTitle}
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Saison {championship.season} · {kindLabels[championship.kind]}
              </p>
              <p className="mt-3 text-xs text-slate-400">
                Équipes : {championship.teams.map((team) => team.name).join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
                Brouillon
              </span>
              <button
                type="button"
                onClick={() => openWizard("edit")}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
              >
                ⚙️ Paramètres
              </button>
              <button
                type="button"
                onClick={openDayWizard}
                className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/20"
              >
                Ajouter une journée
              </button>
            </div>
          </div>
        </div>
      )}

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
        <button
          type="button"
          onClick={handleDeleteChampionship}
          className="text-xs text-rose-300 transition hover:text-rose-200"
        >
          Supprimer le championnat
        </button>
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
                                setAddingTeam(false);
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
                              setAddingTeam(false);
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
                    Créer le championnat
                  </button>
                )}
              </div>
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
    </div>
  );
}
