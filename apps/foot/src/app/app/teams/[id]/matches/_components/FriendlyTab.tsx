"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabaseClient";
import FriendlyMatchAssistantModal from "@/components/FriendlyMatchAssistantModal";

type MatchStatus = "draft" | "in_progress" | "finished";

type FriendlyMatch = {
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

type FriendlyStorageData = {
  friendlies?: FriendlyMatch[];
  friendlyMatches?: FriendlyMatch[];
  matchesAmicaux?: FriendlyMatch[];
  friendly?: FriendlyMatch[];
  matches?: { friendlies?: FriendlyMatch[]; friendly?: FriendlyMatch[] };
  [key: string]: unknown;
};

type TeamInfo = {
  name: string | null;
  category: string | null;
  level: string | null;
  clubName: string | null;
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

type FriendlyTabProps = {
  teamId: string;
};

type FriendlyDetails = {
  match: FriendlyMatch;
};

const buildId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

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

const extractFriendlies = (stored: FriendlyStorageData) => {
  if (Array.isArray(stored.friendlies)) return stored.friendlies;
  if (Array.isArray(stored.friendlyMatches)) return stored.friendlyMatches;
  if (Array.isArray(stored.matchesAmicaux)) return stored.matchesAmicaux;
  if (Array.isArray(stored.friendly)) return stored.friendly;
  if (stored.matches) {
    if (Array.isArray(stored.matches.friendlies))
      return stored.matches.friendlies;
    if (Array.isArray(stored.matches.friendly)) return stored.matches.friendly;
  }
  return [];
};

export default function FriendlyTab({ teamId }: FriendlyTabProps) {
  const [teamInfo, setTeamInfo] = useState<TeamInfo>({
    name: null,
    category: null,
    level: null,
    clubName: null,
  });
  const [players, setPlayers] = useState<PlayerLite[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [friendlies, setFriendlies] = useState<FriendlyMatch[]>([]);
  const [storageData, setStorageData] = useState<FriendlyStorageData>({});
  const [wizardOpen, setWizardOpen] = useState(false);
  const [details, setDetails] = useState<FriendlyDetails | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [matchesTab, setMatchesTab] = useState<
    "all" | "upcoming" | "past"
  >("upcoming");
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
    return (
      teamInfo.clubName ?? teamInfo.name ?? teamInfo.category ?? "Mon équipe"
    );
  }, [teamInfo]);

  const isLocalTeamName = (name: string) => {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return false;
    return normalized === teamDisplayName.trim().toLowerCase();
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

  useEffect(() => {
    let cancelled = false;

    async function loadTeamInfo() {
      if (!teamId) return;
      try {
        const { data, error } = await supabase
          .from("teams")
          .select("name,category,club_id")
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
        });
      } catch (error) {
        const err = error as { name?: string; message?: string } | null;
        const name = err?.name ?? "";
        const message = String(err?.message ?? "");
        if (name === "AbortError" || message.toLowerCase().includes("aborted")) {
          return;
        }
        console.error("Erreur chargement équipe:", error);
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
          .select("id,first_name,last_name,photo_url,team_id")
          .eq("team_id", teamId)
          .order("created_at", { ascending: true });

        if (cancelled) return;

        if (error) {
          console.error("Erreur chargement joueurs:", error.message ?? error);
          setPlayers([]);
          setPlayersLoading(false);
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
        setPlayersLoading(false);
      } catch (error) {
        const err = error as { name?: string; message?: string } | null;
        const name = err?.name ?? "";
        const message = String(err?.message ?? "");
        if (name === "AbortError" || message.toLowerCase().includes("aborted")) {
          return;
        }
        console.error("Erreur chargement joueurs:", error);
        setPlayers([]);
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

    async function loadFriendlies() {
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
            "Erreur chargement matchs amicaux:",
            error.message ?? error,
          );
          return;
        }

        const raw = data?.data ?? {};
        let stored: FriendlyStorageData = {};
        if (typeof raw === "string") {
          try {
            stored = JSON.parse(raw) as FriendlyStorageData;
          } catch {
            stored = {};
          }
        } else {
          stored = raw as FriendlyStorageData;
        }
        setStorageData(stored);
        const storedFriendlies = extractFriendlies(stored);
        setFriendlies(storedFriendlies);
      } catch (error) {
        const err = error as { name?: string; message?: string } | null;
        const name = err?.name ?? "";
        const message = String(err?.message ?? "");
        if (name === "AbortError" || message.toLowerCase().includes("aborted")) {
          return;
        }
        console.error("Erreur chargement matchs amicaux:", error);
      }
    }

    loadFriendlies();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  useEffect(() => {
    if (!details) return;
    const parsed = parseScore(details.match.score);
    setScoreDraft(
      parsed
        ? { home: String(parsed.home), away: String(parsed.away) }
        : { home: "", away: "" },
    );
    setScorers(details.match.scorers ?? {});
    setAssists(details.match.assists ?? {});
    setMotmId(details.match.motmId ?? null);
    setNeedsBoost(details.match.needsBoost ?? {});
  }, [details, parseScore]);

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

  const applyFriendlyPlayerStats = async (matches: FriendlyMatch[]) => {
    if (!players.length) return;
    const totals = matches.reduce<{
      goals: Record<string, number>;
      assists: Record<string, number>;
    }>(
      (acc, match) => {
        if (match.status !== "finished") return acc;
        Object.entries(match.scorers ?? {}).forEach(([id, value]) => {
          acc.goals[id] = (acc.goals[id] ?? 0) + value;
        });
        Object.entries(match.assists ?? {}).forEach(([id, value]) => {
          acc.assists[id] = (acc.assists[id] ?? 0) + value;
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
      const plateauGoals = getStatFieldValue(fields, [
        "buts plateau",
        "buts plateaux",
      ]);
      const plateauAssists = getStatFieldValue(fields, [
        "passes d plateau",
        "passes plateau",
        "passes decisives plateau",
      ]);
      const friendlyGoals = totals.goals[player.id] ?? 0;
      const friendlyAssists = totals.assists[player.id] ?? 0;
      const withGoals = upsertStatField(
        fields,
        "Buts amical",
        friendlyGoals,
      );
      const withAssists = upsertStatField(
        withGoals,
        "Passes D amical",
        friendlyAssists,
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

  const persistFriendlies = async (nextFriendlies: FriendlyMatch[]) => {
    if (!teamId) return false;
    const payload = {
      team_id: teamId,
      data: {
        ...storageData,
        friendlies: nextFriendlies,
      },
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("championships")
      .upsert(payload, { onConflict: "team_id" })
      .select("data")
      .maybeSingle();
    if (error) {
      console.error(
        "Erreur sauvegarde matchs amicaux:",
        error.message ?? error,
      );
      return false;
    }
    setStorageData((data?.data ?? payload.data) as FriendlyStorageData);
    setFriendlies(nextFriendlies);
    return true;
  };

  const handleDeleteAllFriendlies = async () => {
    setMenuOpen(false);
    const confirmed = window.confirm(
      "Supprimer tous les matchs amicaux ? Cette action est définitive.",
    );
    if (!confirmed) return;
    const saved = await persistFriendlies([]);
    if (saved) {
      await applyFriendlyPlayerStats([]);
    }
  };

  const openWizard = () => {
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
  };

  const handleCreateFriendly = async (data: {
    clubB: string;
    date: string;
    time: string;
  }) => {
    const awayTeam = data.clubB.trim();
    const matchDate = data.date;
    if (!teamDisplayName.trim() || !awayTeam || !matchDate) return;
    const nextMatch: FriendlyMatch = {
      id: buildId(),
      homeTeam: teamDisplayName.trim(),
      awayTeam,
      date: `${matchDate}T00:00:00.000Z`,
      time: data.time || "18:00",
    };
    const nextFriendlies = [...friendlies, nextMatch];
    const saved = await persistFriendlies(nextFriendlies);
    if (saved) closeWizard();
  };

  const handleOpenDetails = (match: FriendlyMatch) => {
    setDetails({ match });
  };

  const handleSaveDetails = async () => {
    if (!details) return;
    const homeValue = Number.parseInt(scoreDraft?.home ?? "", 10);
    const awayValue = Number.parseInt(scoreDraft?.away ?? "", 10);
    const hasHome = Number.isFinite(homeValue);
    const hasAway = Number.isFinite(awayValue);
    const matchDate = buildMatchDateTime(
      details.match.date,
      details.match.time,
    );
    const canSetScore = Boolean(matchDate && matchDate.getTime() < Date.now());
    const nextScore =
      canSetScore && hasHome && hasAway
        ? `${homeValue} - ${awayValue}`
        : undefined;
    const nextMatch: FriendlyMatch = {
      ...details.match,
      status: nextScore ? "finished" : "draft",
      score: nextScore,
      scorers: Object.keys(scorers).length ? scorers : undefined,
      assists: Object.keys(assists).length ? assists : undefined,
      motmId: motmId ?? undefined,
      needsBoost: Object.keys(needsBoost).length ? needsBoost : undefined,
    };
    const nextFriendlies = friendlies.map((match) =>
      match.id === details.match.id ? nextMatch : match,
    );
    await persistFriendlies(nextFriendlies);
    await applyFriendlyPlayerStats(nextFriendlies);
    setDetails({ match: nextMatch });
    setDetails(null);
  };

  const handleDeleteFriendly = async () => {
    if (!details) return;
    const confirmed = window.confirm(
      "Supprimer ce match amical ? Cette action est définitive.",
    );
    if (!confirmed) return;
    const nextFriendlies = friendlies.filter(
      (match) => match.id !== details.match.id,
    );
    setFriendlies(nextFriendlies);
    setDetails(null);
    const saved = await persistFriendlies(nextFriendlies);
    if (saved) {
      await applyFriendlyPlayerStats(nextFriendlies);
    } else {
      alert("Erreur suppression du match. Recharge la page.");
    }
  };

  const upcomingFriendlies = useMemo(() => {
    const now = new Date();
    return friendlies
      .filter((match) => {
        const date = buildMatchDateTime(match.date, match.time);
        return date && date.getTime() >= now.getTime();
      })
      .sort((a, b) => {
        const aDate = buildMatchDateTime(a.date, a.time)?.getTime() ?? 0;
        const bDate = buildMatchDateTime(b.date, b.time)?.getTime() ?? 0;
        return aDate - bDate;
      });
  }, [friendlies]);

  const pastFriendlies = useMemo(() => {
    const now = new Date();
    return friendlies
      .filter((match) => {
        const date = buildMatchDateTime(match.date, match.time);
        return date && date.getTime() < now.getTime();
      })
      .sort((a, b) => {
        const aDate = buildMatchDateTime(a.date, a.time)?.getTime() ?? 0;
        const bDate = buildMatchDateTime(b.date, b.time)?.getTime() ?? 0;
        return bDate - aDate;
      });
  }, [friendlies]);

  const allFriendlies = useMemo(() => {
    return [...friendlies].sort((a, b) => {
      const aDate = buildMatchDateTime(a.date, a.time)?.getTime() ?? 0;
      const bDate = buildMatchDateTime(b.date, b.time)?.getTime() ?? 0;
      return aDate - bDate;
    });
  }, [friendlies]);

  const visibleFriendlies = useMemo(() => {
    if (matchesTab === "past") return pastFriendlies;
    if (matchesTab === "upcoming") return upcomingFriendlies;
    return allFriendlies;
  }, [matchesTab, pastFriendlies, upcomingFriendlies, allFriendlies]);

  const listToShow = useMemo(() => {
    if (visibleFriendlies.length) return visibleFriendlies;
    if (!upcomingFriendlies.length && !pastFriendlies.length) {
      return allFriendlies;
    }
    return visibleFriendlies;
  }, [
    visibleFriendlies,
    upcomingFriendlies.length,
    pastFriendlies.length,
    allFriendlies,
  ]);

  const isPastDetailsMatch = useMemo(() => {
    if (!details) return false;
    const date = buildMatchDateTime(details.match.date, details.match.time);
    return Boolean(date && date.getTime() < Date.now());
  }, [details]);

  const getMatchTone = (match: FriendlyMatch) => {
    const date = buildMatchDateTime(match.date, match.time);
    if (!date) return "upcoming";
    return date.getTime() < Date.now() ? "past" : "upcoming";
  };

  const getMatchResult = useCallback(
    (match: FriendlyMatch) => {
      const parsed = parseScore(match.score);
      if (!parsed) return null;
      const isHomeLocal = isLocalTeamName(match.homeTeam);
      const isAwayLocal = isLocalTeamName(match.awayTeam);
      if (!isHomeLocal && !isAwayLocal) return null;
      const localScore = isHomeLocal ? parsed.home : parsed.away;
      const opponentScore = isHomeLocal ? parsed.away : parsed.home;
      if (localScore > opponentScore) return "win";
      if (localScore < opponentScore) return "loss";
      return "draw";
    },
    [isLocalTeamName, parseScore],
  );

  const nextFriendly = upcomingFriendlies[0] ?? pastFriendlies[0] ?? null;
  const nextFriendlyTone = nextFriendly ? getMatchTone(nextFriendly) : null;
  const nextFriendlyLabel =
    nextFriendlyTone === "past" ? "Dernier match" : "Prochain match";

  const isLocalMatch = details
    ? isLocalTeamName(details.match.homeTeam) ||
      isLocalTeamName(details.match.awayTeam)
    : false;

  return (
    <div className="space-y-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="friendly-section-header" ref={sectionMenuRef}>
          <span className="friendly-section-title">Match amical</span>
          <span className="friendly-section-line" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="friendly-section-menu"
            aria-label="Menu"
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
                  openWizard();
                }}
                className="friendly-section-dropdown-item"
              >
                Ajouter
              </button>
              <button
                type="button"
                onClick={handleDeleteAllFriendlies}
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
            "friendly-hero",
            nextFriendly ? "" : "friendly-hero--empty",
          ].join(" ")}
        >
          <div className="friendly-hero__content">
            <div
              className={[
                "friendly-hero__panel",
                nextFriendly ? "" : "friendly-hero__panel--empty",
              ].join(" ")}
            >
              {nextFriendly ? (
                <div className="friendly-hero__panel-header">
                  <div className="friendly-hero__panel-logo-wrap">
                    <img
                      src="/icons/AMICALlog.png"
                      alt="Match amical"
                      className="friendly-hero__panel-logo"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenDetails(nextFriendly)}
                    className="friendly-hero__cta"
                  >
                    Voir le détail
                  </button>
                </div>
              ) : null}

              {nextFriendly ? (
                <div className="friendly-hero__panel-title-row">
                  <div className="friendly-hero__panel-title">
                    {nextFriendlyLabel}
                  </div>
                  <span
                    className="friendly-hero__panel-line"
                    aria-hidden="true"
                  />
                </div>
              ) : null}

              {nextFriendly ? (
                <>
                  <div className="friendly-hero__teams">
                    <div className="friendly-hero__team friendly-hero__team--home">
                      {renderTeamBadge(nextFriendly.homeTeam, {
                        image: "h-12 w-12 rounded-full object-cover",
                        initial:
                          "flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200",
                      })}
                      <div className="friendly-hero__team-name">
                        {nextFriendly.homeTeam}
                      </div>
                    </div>
                    <div className="friendly-hero__vs">VS</div>
                    <div className="friendly-hero__team friendly-hero__team--away">
                      <div className="friendly-hero__team-name">
                        {nextFriendly.awayTeam}
                      </div>
                      {renderTeamBadge(nextFriendly.awayTeam, {
                        image: "h-12 w-12 rounded-full object-cover",
                        initial:
                          "flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200",
                      })}
                    </div>
                  </div>

                  <div className="friendly-hero__meta-line">
                    <span className="friendly-hero__meta-pill">
                      {formatShortDate(nextFriendly.date)}
                    </span>
                    <span className="friendly-hero__meta-pill">
                      {nextFriendly.score ? "Score final" : "Score à venir"}
                    </span>
                    <span className="friendly-hero__meta-pill">
                      {nextFriendly.time || "--:--"}
                    </span>
                  </div>
                </>
              ) : (
                <div className="friendly-hero__empty">
                  <p className="friendly-hero__empty-title">
                    Planifie des matchs amicaux pour ton équipe
                  </p>
                  <div className="friendly-hero__empty-circle">
                    <img
                      src="/icons/AMICALlog.png"
                      alt=""
                      className="friendly-hero__badge-logo"
                    />
                    <button
                      type="button"
                      onClick={openWizard}
                      className="friendly-hero__cta"
                    >
                      Ajouter un match
                    </button>
                  </div>
                  <p className="friendly-hero__empty-note">
                    Aucun match créé pour le moment
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
                setMatchesTab(tab.key as "all" | "upcoming" | "past")
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
                const tone = getMatchTone(match);
                const result = tone === "past" ? getMatchResult(match) : null;

                return (
                  <button
                    key={match.id}
                    type="button"
                    onClick={() => handleOpenDetails(match)}
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
                      <div className="flex items-center gap-2">
                        <span className="friendly-match-time">
                          {match.time || "--:--"}
                        </span>
                        {result ? (
                          result === "draw" ? (
                            <span
                              className="friendly-match-result friendly-match-result--draw"
                              aria-label="Match nul"
                            />
                          ) : (
                            <span
                              className={[
                                "friendly-match-result",
                                result === "win"
                                  ? "friendly-match-result--win"
                                  : "friendly-match-result--loss",
                              ].join(" ")}
                              aria-label={
                                result === "win" ? "Victoire" : "Défaite"
                              }
                            >
                              {result === "win" ? "V" : "X"}
                            </span>
                          )
                        ) : null}
                      </div>
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
              })}
            </div>
          )}
        </div>
      </div>

      {wizardOpen ? (
        <FriendlyMatchAssistantModal
          isOpen={wizardOpen}
          onClose={closeWizard}
          onContinue={handleCreateFriendly}
        />
      ) : null}

      {details ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[2px]">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-white/12 bg-black/30 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-[32px] backdrop-saturate-200 md:p-6 max-h-[90vh]">
            <div className="relative z-10 flex max-h-[80vh] flex-col overflow-y-auto">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-300">
                    Détails du match amical
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
                          !isPastDetailsMatch ? "cursor-not-allowed opacity-40" : "",
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
                          !isPastDetailsMatch ? "cursor-not-allowed opacity-40" : "",
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
                          !isPastDetailsMatch ? "cursor-not-allowed opacity-40" : "",
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
                          !isPastDetailsMatch ? "cursor-not-allowed opacity-40" : "",
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
                          onClick={() =>
                            setScorersOpen((prev) => !prev)
                          }
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
                                  const isSelected =
                                    Boolean(scorers[player.id]);
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
                          onClick={() =>
                            setAssistsOpen((prev) => !prev)
                          }
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
                                  const isSelected =
                                    Boolean(assists[player.id]);
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
                    onClick={handleDeleteFriendly}
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

      <style jsx>{`
        .plateau-light-line {
          position: absolute;
          left: -25%;
          right: -25%;
          height: 1px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.2),
            rgba(168, 85, 247, 0.7),
            rgba(255, 255, 255, 0.2),
            transparent
          );
          filter: drop-shadow(0 0 6px rgba(168, 85, 247, 0.35));
          opacity: 0.75;
          transform: translateX(-30%);
          animation: plateauLineSlide 12s linear infinite;
        }

        .plateau-light-line--one {
          top: 32%;
        }

        .plateau-light-line--two {
          top: 68%;
          opacity: 0.6;
          animation-duration: 16s;
          animation-direction: reverse;
        }

        @keyframes plateauLineSlide {
          0% {
            transform: translateX(-35%);
          }
          100% {
            transform: translateX(35%);
          }
        }
      `}</style>
    </div>
  );
}
