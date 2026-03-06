"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Puzzle,
  RotateCcw,
  Users,
} from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import {
  createTrainingEvent,
  getTrainingsByTeam,
  type TeamEvent,
} from "@/lib/api/teamEvents";

import { ExerciseAnimatedPlayer } from "@/components/ExerciseAnimatedPlayer";
import ExercisesLibrary from "./ExercisesLibrary";

type TeamTrainingsClientProps = {
  teamId: string;
};

type PlayerLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
};

type Exercise = {
  id: string;
  name: string;
  duration: string;
  notes: string;
  kind?: ExerciseKind;
  sourceId?: string;
  minutes?: number;
  animationData?: unknown;
  category?: string;
};

type ExerciseKind = "animation" | "video" | "card" | "test";

type ExerciseLibraryItem = {
  id: string;
  title: string;
  category: string;
  duration: number | null;
  type: string;
  is_global: boolean;
  animation_data: unknown;
};

const formatWeekdayShort = (date: Date) => {
  const value = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
  }).format(date);
  return value.replace(".", "").replace(/^\w/, (c) => c.toUpperCase());
};

const formatTime = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

const formatSessionLabel = (date: Date) =>
  `${formatWeekdayShort(date)} ${formatTime(date)}`;

const formatTimeRange = (start: Date, end?: Date | null) => {
  if (!end) return `${formatWeekdayShort(start)} ${formatTime(start)}`;
  return `${formatWeekdayShort(start)} ${formatTime(start)} – ${formatTime(end)}`;
};

const formatTimer = (value: number) => {
  const safe = Math.max(0, Math.floor(value));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0",
  )}`;
};

const formatTimerMs = (value: number) => {
  const safe = Math.max(0, Math.floor(value));
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor((safe % 1000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0",
  )}.${String(millis).padStart(2, "0")}`;
};

const formatRemainingLabel = (value: number) => {
  if (!Number.isFinite(value)) return "—";
  const safe = Math.max(0, Math.floor(value));
  const totalMinutes = Math.ceil(safe / 60);
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h${String(minutes).padStart(2, "0")}`;
  }
  return `${totalMinutes} min`;
};

const formatFullDate = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);

const getExerciseMeta = (item: ExerciseLibraryItem) => {
  const payload = normalizePayload(item.animation_data);
  return (payload?.metadata ?? payload?.meta ?? {}) as Record<string, any>;
};

const getCategoryIndicatorColor = (category?: string) => {
  const normalized = (category || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("echauffement") || normalized.includes("activation")) {
    return "#C9A33E";
  }
  if (normalized.includes("motricite")) {
    return "#3D8D63";
  }
  if (normalized.includes("technique")) {
    return "#3C73B4";
  }
  if (normalized.includes("tactique")) {
    return "#6852B8";
  }
  if (normalized.includes("physique")) {
    return "#A23C3C";
  }
  if (normalized.includes("jeu") || normalized.includes("opposition")) {
    return "#444BB8";
  }
  if (normalized.includes("situation")) {
    return "#B66BF0";
  }
  if (normalized.includes("retour")) {
    return "#727E94";
  }
  return "#C9A33E";
};

const getExerciseKind = (item: ExerciseLibraryItem): ExerciseKind => {
  if (item.type === "test") return "test";
  if (item.type === "video") return "video";
  const meta = getExerciseMeta(item);
  if (meta?.format === "card") return "card";
  if (item.type === "card") return "card";
  return "animation";
};

const formatMetaLabel = (value: string) => {
  if (!value) return "";
  const cleaned = value.replace(/_/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const getTypeLabel = (kind: ExerciseKind) => {
  if (kind === "card") return "Carte";
  if (kind === "video") return "Vidéo";
  if (kind === "test") return "Test";
  return "Animation";
};

const parseTimeToMinutes = (value: string) => {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const normalizeHour = (value: string) => {
  const parsed = Number(value || 0);
  const clamped = Math.min(23, Math.max(0, parsed));
  return pad2(Math.floor(clamped));
};

const normalizeMinute = (value: string) => {
  const parsed = Number(value || 0);
  const clamped = Math.min(59, Math.max(0, parsed));
  return pad2(Math.floor(clamped));
};

const splitTimeValue = (value: string) => {
  const [hour, minute] = (value || "00:00").split(":");
  return {
    hour: normalizeHour(hour || "0"),
    minute: normalizeMinute(minute || "0"),
  };
};

const formatTimeValue = (totalMinutes: number) => {
  const minutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const adjustTimeByMinutes = (value: string, delta: number) => {
  const base = parseTimeToMinutes(value) ?? 0;
  return formatTimeValue(base + delta);
};

const normalizePayload = (value: unknown) => {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, any>;
    } catch {
      return null;
    }
  }
  return value as Record<string, any>;
};

const getExercisePreviewUrl = (value: unknown) => {
  const payload = normalizePayload(value);
  const pitchState =
    payload?.pitchState ?? payload?.pitch_state ?? payload?.pitch ?? null;
  const previewFrames =
    payload?.previewFrames ?? payload?.preview_frames ?? null;
  const lastPreviewFrame = Array.isArray(previewFrames)
    ? previewFrames[previewFrames.length - 1]
    : null;
  return (
    payload?.coverImageUrl ??
    pitchState?.coverImageUrl ??
    payload?.cover_image_url ??
    lastPreviewFrame ??
    payload?.thumbnailUrl ??
    payload?.thumbnail_url ??
    null
  );
};

const getExerciseMinutes = (exercise: Exercise | null) => {
  if (!exercise) return 10;
  if (typeof exercise.minutes === "number") return exercise.minutes;
  if (typeof exercise.duration === "string") {
    const match = exercise.duration.match(/\d+/);
    if (match) return Number(match[0]);
  }
  return 10;
};

const getExerciseInfoLine = (exercise: Exercise | null) => {
  if (!exercise) return "—";
  const payload = normalizePayload(exercise.animationData);
  const meta = (payload?.metadata ?? payload?.meta ?? {}) as Record<string, any>;
  const category = exercise.category || meta?.category || meta?.categorie || "";
  const kindLabel = exercise.kind === "test" ? "Test / Mesure" : "";
  const testDetails =
    exercise.kind === "test"
      ? [
          meta?.testMetric ? formatMetaLabel(meta.testMetric) : "",
          meta?.testUnit ? formatMetaLabel(meta.testUnit) : "",
          meta?.testTarget ? formatMetaLabel(meta.testTarget) : "",
          meta?.testVariants
            ? formatMetaLabel(
                Array.isArray(meta.testVariants)
                  ? meta.testVariants.join(" / ")
                  : meta.testVariants,
              )
            : "",
        ].filter(Boolean)
      : [];
  const parts = [
    kindLabel,
    category ? formatMetaLabel(category) : "",
    ...testDetails,
    Array.isArray(meta?.objective)
      ? meta.objective.map((value: string) => formatMetaLabel(value)).join(" / ")
      : meta?.objective
      ? formatMetaLabel(meta.objective)
      : "",
    Array.isArray(meta?.levels)
      ? meta.levels.join(" / ")
      : meta?.levels
      ? meta.levels
      : "",
    meta?.type === "sans_ballon"
      ? "Sans ballon"
      : meta?.type === "avec_ballon"
      ? "Avec ballon"
      : meta?.type === "mixte"
      ? "Mixte"
      : meta?.type
      ? formatMetaLabel(meta.type)
      : "",
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" - ") : "—";
};

const CATEGORY_OPTIONS = [
  "Échauffement / Activation",
  "Motricité",
  "Technique",
  "Tactique",
  "Physique",
  "Jeu / Opposition",
  "Situation réelle",
  "Retour au calme",
];

const shouldSilenceLoadError = (error: unknown) => {
  const message =
    (error as { message?: string })?.message?.toLowerCase?.() ??
    String(error).toLowerCase();
  const name = (error as { name?: string })?.name ?? "";
  return (
    name === "AbortError" ||
    message.includes("aborted") ||
    message.includes("abort") ||
    message.includes("load failed") ||
    message.includes("failed to fetch")
  );
};

const logLoadError = (label: string, error: unknown) => {
  if (shouldSilenceLoadError(error)) return;
  console.error(label, (error as { message?: string })?.message ?? error);
};

const isValidUuid = (value?: string) => {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
};

export default function TeamTrainingsClient({
  teamId,
}: TeamTrainingsClientProps) {
  const params = useParams<{ id?: string | string[] }>();
  const searchParams = useSearchParams();
  const resolvedTeamId =
    teamId ||
    (typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
      ? params.id[0]
      : "");
  const validTeamId = isValidUuid(resolvedTeamId) ? resolvedTeamId : "";
  const [activeTab, setActiveTab] = useState<
    "sessions" | "exercises" | "templates"
  >("sessions");
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("all");
  const [weekOnly, setWeekOnly] = useState(false);

  useEffect(() => {
    const tab = searchParams?.get("tab");
    if (tab === "exercises" || tab === "templates" || tab === "sessions") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const [trainings, setTrainings] = useState<TeamEvent[]>([]);
  const [players, setPlayers] = useState<PlayerLite[]>([]);
  const [attendanceByEvent, setAttendanceByEvent] = useState<
    Record<string, string[]>
  >({});
  const [exercisesByEvent, setExercisesByEvent] = useState<
    Record<string, Exercise[]>
  >({});

  const [teamName, setTeamName] = useState<string | null>(null);
  const [clubId, setClubId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const [startHour, setStartHour] = useState("18");
  const [startMinute, setStartMinute] = useState("00");
  const [endHour, setEndHour] = useState("19");
  const [endMinute, setEndMinute] = useState("30");
  const startHourInputRef = useRef<HTMLInputElement>(null);
  const startMinuteInputRef = useRef<HTMLInputElement>(null);
  const endHourInputRef = useRef<HTMLInputElement>(null);
  const endMinuteInputRef = useRef<HTMLInputElement>(null);
  const startHourBufferRef = useRef("");
  const startMinuteBufferRef = useRef("");
  const endHourBufferRef = useRef("");
  const endMinuteBufferRef = useRef("");
  const startHourAutoAdvanceRef = useRef<number | null>(null);
  const endHourAutoAdvanceRef = useRef<number | null>(null);
  const [draftGroup, setDraftGroup] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [showLocationField, setShowLocationField] = useState(false);
  const [showNotesField, setShowNotesField] = useState(false);
  const [dateTouched, setDateTouched] = useState(false);
  const [timeTouched, setTimeTouched] = useState(false);
  const [endTimeTouched, setEndTimeTouched] = useState(false);
  const [groupTouched, setGroupTouched] = useState(false);
  const [locationTouched, setLocationTouched] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [exercisePickerOpen, setExercisePickerOpen] = useState(false);
  const [exercisePickerTraining, setExercisePickerTraining] =
    useState<TeamEvent | null>(null);
  const [exercisePickerSeeded, setExercisePickerSeeded] = useState(false);
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseLibraryItem[]>(
    [],
  );
  const [exerciseLibraryLoading, setExerciseLibraryLoading] = useState(false);
  const [exerciseLibraryError, setExerciseLibraryError] = useState<string | null>(
    null,
  );

  const startTimeValue = useMemo(
    () => `${normalizeHour(startHour)}:${normalizeMinute(startMinute)}`,
    [startHour, startMinute],
  );
  const endTimeValue = useMemo(
    () => `${normalizeHour(endHour)}:${normalizeMinute(endMinute)}`,
    [endHour, endMinute],
  );
  const [exerciseCategory, setExerciseCategory] = useState("Toutes");
  const [exerciseSelections, setExerciseSelections] = useState<
    Record<string, { item: ExerciseLibraryItem; minutes: number }>
  >({});
  const [exerciseOrder, setExerciseOrder] = useState<string[]>([]);
  const adjustTimerRef = useRef<number | null>(null);
  const trainingVideoRef = useRef<HTMLVideoElement | null>(null);

  const [presenceOpen, setPresenceOpen] = useState(false);
  const [presenceTraining, setPresenceTraining] = useState<TeamEvent | null>(
    null,
  );
  const [presenceDraft, setPresenceDraft] = useState<Set<string>>(new Set());
  const [presenceInitial, setPresenceInitial] = useState<Set<string>>(new Set());
  const [presenceSaving, setPresenceSaving] = useState(false);
  const [absencePicker, setAbsencePicker] = useState("");
  const [deletingTrainingId, setDeletingTrainingId] = useState<string | null>(
    null,
  );
  const [expandedTraining, setExpandedTraining] = useState<TeamEvent | null>(
    null,
  );
  const [trainingMode, setTrainingMode] = useState<{
    training: TeamEvent;
    index: number;
    elapsed: number;
    sessionElapsed: number;
    running: boolean;
  } | null>(null);
  const [chronoInfoOpen, setChronoInfoOpen] = useState(false);
  const [trainingTestRunning, setTrainingTestRunning] = useState(false);
  const [trainingTestElapsed, setTrainingTestElapsed] = useState(0);
  const trainingTestStartRef = useRef<number | null>(null);
  const [trainingTestResults, setTrainingTestResults] = useState<
    Record<
      string,
      Record<
        string,
        {
          timeMs?: number;
          score?: string;
          history?: Array<{ timeMs?: number; score?: string }>;
        }
      >
    >
  >({});
  const [trainingTestActivePlayerId, setTrainingTestActivePlayerId] = useState<
    string | null
  >(null);
  const [trainingTestShowRanking, setTrainingTestShowRanking] = useState(false);
  const [trainingTestShowObjective, setTrainingTestShowObjective] =
    useState(false);
  const [trainingTestUndoLabel, setTrainingTestUndoLabel] = useState<string | null>(
    null,
  );
  const trainingTestUndoActionRef = useRef<(() => void) | null>(null);
  const trainingTestUndoTimerRef = useRef<number | null>(null);
  const [trainingTestResetMenuOpen, setTrainingTestResetMenuOpen] =
    useState(false);
  const [trainingTestResetConfirm, setTrainingTestResetConfirm] = useState<
    "current" | "player" | null
  >(null);
  const trainingTestRankingButtonRef = useRef<HTMLButtonElement | null>(null);
  const trainingTestRankingPanelRef = useRef<HTMLDivElement | null>(null);
  const trainingTestObjectiveButtonRef = useRef<HTMLButtonElement | null>(null);
  const trainingTestObjectivePanelRef = useRef<HTMLDivElement | null>(null);
  const trainingTestResetButtonRef = useRef<HTMLButtonElement | null>(null);
  const trainingTestResetMenuRef = useRef<HTMLDivElement | null>(null);

  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [exerciseTraining, setExerciseTraining] = useState<TeamEvent | null>(
    null,
  );
  const [exerciseName, setExerciseName] = useState("");
  const [exerciseDuration, setExerciseDuration] = useState("");
  const [exerciseNotes, setExerciseNotes] = useState("");
  const [expandedExercise, setExpandedExercise] = useState<Exercise | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadTeam() {
      if (!validTeamId) return;
      try {
        const { data, error } = await supabase
          .from("teams")
          .select("name,category,club_id")
          .eq("id", validTeamId)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          logLoadError("Erreur chargement équipe:", error);
          return;
        }

        const teamLabel = data?.name ?? data?.category ?? null;
        setTeamName(teamLabel);
        setClubId(data?.club_id ?? null);
      } catch (error) {
        if (cancelled) return;
        logLoadError("Erreur chargement équipe:", error);
      }
    }

    loadTeam();
    return () => {
      cancelled = true;
    };
  }, [validTeamId]);

  useEffect(() => {
    let cancelled = false;

    async function loadTrainings() {
      setLoading(true);
      setError(null);
      try {
        const data = await getTrainingsByTeam(validTeamId);
        if (!cancelled) setTrainings(data ?? []);
      } catch (err) {
        if (!cancelled) {
          if (!shouldSilenceLoadError(err)) {
            logLoadError("Erreur chargement entraînements:", err);
            setError("Impossible de charger les entraînements.");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (validTeamId) {
      loadTrainings();
    } else {
      setLoading(false);
      setError("Impossible de charger les entraînements.");
    }

    return () => {
      cancelled = true;
    };
  }, [validTeamId]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      if (!validTeamId) return;
      const { data, error } = await supabase
        .from("players")
        .select("id,first_name,last_name,photo_url")
        .eq("team_id", validTeamId)
        .order("last_name", { ascending: true });

      if (cancelled) return;
      if (error) {
        logLoadError("Erreur chargement joueurs:", error);
        return;
      }
      setPlayers((data ?? []) as PlayerLite[]);
    }

    loadPlayers();
    return () => {
      cancelled = true;
    };
  }, [validTeamId]);

  useEffect(() => {
    let cancelled = false;

    async function loadAttendance() {
      if (!trainings.length) {
        setAttendanceByEvent({});
        return;
      }
      const ids = trainings.map((training) => training.id);
      const { data, error } = await supabase
        .from("event_players")
        .select("event_id, player_id")
        .in("event_id", ids);

      if (cancelled) return;
      if (error) {
        logLoadError("Erreur chargement présences:", error);
        return;
      }

      const nextMap: Record<string, string[]> = {};
      (data ?? []).forEach((row) => {
        if (!nextMap[row.event_id]) {
          nextMap[row.event_id] = [];
        }
        nextMap[row.event_id].push(row.player_id);
      });
      setAttendanceByEvent(nextMap);
    }

    loadAttendance();
    return () => {
      cancelled = true;
    };
  }, [trainings]);

  const totalPlayers = players.length;
  const currentTrainingExercise = useMemo(() => {
    if (!trainingMode) return null;
    const list = exercisesByEvent[trainingMode.training.id] ?? [];
    return list[trainingMode.index] ?? null;
  }, [trainingMode, exercisesByEvent]);

  const selectedExercises = useMemo(() => {
    const ordered = exerciseOrder
      .map((id) => exerciseSelections[id])
      .filter(Boolean);
    const rest = Object.keys(exerciseSelections)
      .filter((id) => !exerciseOrder.includes(id))
      .map((id) => exerciseSelections[id])
      .filter(Boolean);
    return [...ordered, ...rest];
  }, [exerciseSelections, exerciseOrder]);
  const totalExerciseMinutes = useMemo(
    () =>
      selectedExercises.reduce((total, entry) => total + entry.minutes, 0),
    [selectedExercises],
  );
  const sessionDurationMinutes = useMemo(() => {
    const start = parseTimeToMinutes(startTimeValue);
    const end = parseTimeToMinutes(endTimeValue);
    if (start === null || end === null) return 0;
    if (end <= start) return 0;
    return end - start;
  }, [startTimeValue, endTimeValue]);
  const sessionProgress =
    sessionDurationMinutes > 0
      ? Math.min(totalExerciseMinutes / sessionDurationMinutes, 1)
      : 0;
  const isOverDuration =
    sessionDurationMinutes > 0 && totalExerciseMinutes > sessionDurationMinutes;

  const exerciseOrderMap = useMemo(() => {
    const map: Record<string, number> = {};
    exerciseOrder.forEach((id, index) => {
      map[id] = index + 1;
    });
    return map;
  }, [exerciseOrder]);

  const filteredExerciseLibrary = useMemo(() => {
    if (exerciseCategory === "Toutes") return exerciseLibrary;
    return exerciseLibrary.filter(
      (item) => (item.category || "Non classé") === exerciseCategory,
    );
  }, [exerciseLibrary, exerciseCategory]);

  const filteredTrainings = useMemo(() => {
    const now = new Date();
    const base = trainings.filter((training) => {
      const start = new Date(training.start_at);
      if (filter === "upcoming") return start >= now;
      if (filter === "past") return start < now;
      return true;
    });

    if (!weekOnly) return base;
    const day = new Date();
    const dayIndex = (day.getDay() + 6) % 7;
    const weekStart = new Date(day);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(day.getDate() - dayIndex);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    return base.filter((training) => {
      const start = new Date(training.start_at);
      return start >= weekStart && start < weekEnd;
    });
  }, [trainings, filter, weekOnly]);

  const sortedTrainings = useMemo(() => {
    return [...filteredTrainings].sort((a, b) => {
      const aDate = new Date(a.start_at).getTime();
      const bDate = new Date(b.start_at).getTime();
      return aDate - bDate;
    });
  }, [filteredTrainings]);

  const openCreate = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = `${today.getMonth() + 1}`.padStart(2, "0");
    const dd = `${today.getDate()}`.padStart(2, "0");
    const startValue = "18:00";
    const startMinutes = parseTimeToMinutes(startValue) ?? 18 * 60;
    const endMinutes = startMinutes + 90;
    const endHours = Math.floor(endMinutes / 60) % 24;
    const endMins = `${endMinutes % 60}`.padStart(2, "0");
    const endValue = `${`${endHours}`.padStart(2, "0")}:${endMins}`;
    setDraftDate(`${yyyy}-${mm}-${dd}`);
    setStartHour("18");
    setStartMinute("00");
    setEndHour(`${`${endHours}`.padStart(2, "0")}`);
    setEndMinute(endMins);
    startHourBufferRef.current = "18";
    startMinuteBufferRef.current = "00";
    endHourBufferRef.current = `${`${endHours}`.padStart(2, "0")}`;
    endMinuteBufferRef.current = endMins;
    setDraftGroup("");
    setDraftLocation("");
    setDraftNotes("");
    setShowLocationField(false);
    setShowNotesField(false);
    setExerciseSelections({});
    setExerciseOrder([]);
    setExerciseCategory("Toutes");
    setExercisePickerTraining(null);
    setExercisePickerSeeded(false);
    setDateTouched(false);
    setTimeTouched(false);
    setEndTimeTouched(false);
    setGroupTouched(false);
    setLocationTouched(false);
    setCreateError(null);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setExercisePickerOpen(false);
  };

  const handleCreate = async () => {
    if (!validTeamId) {
      setCreateError("Équipe introuvable.");
      return;
    }
    const { data: userData, error: userError } =
      await supabase.auth.getUser();
    if (userError) {
      console.error("Erreur utilisateur:", userError.message ?? userError);
    }
    const userId = userData?.user?.id ?? "";
    if (!userId) {
      setCreateError("Utilisateur non connecté.");
      return;
    }
    let resolvedClubId = clubId;
    if (!resolvedClubId) {
      const { data, error } = await supabase
        .from("teams")
        .select("club_id")
        .eq("id", validTeamId)
        .maybeSingle();
      if (error) {
        logLoadError("Erreur chargement club:", error);
      }
      resolvedClubId = data?.club_id ?? null;
    }
    if (!resolvedClubId) {
      setCreateError("Club introuvable.");
      return;
    }
    if (!draftDate) {
      setCreateError("Date obligatoire.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const startAt = `${draftDate}T${startTimeValue || "18:00"}:00`;
      let endAt: string | null = null;
      if (endTimeValue) {
        endAt = `${draftDate}T${endTimeValue}:00`;
      }
      const baseTitle = draftGroup.trim() || teamName || "Séance";
      const title = baseTitle.startsWith("Séance")
        ? baseTitle
        : `Séance ${baseTitle}`;

      const newTrainingId = await createTrainingEvent({
        clubId: resolvedClubId,
        teamId: validTeamId,
        startAt,
        endAt,
        title,
        status: null,
        createdBy: userId,
      });

      const orderedExercises = selectedExercises.map((entry) => ({
          id: `${newTrainingId}-${entry.item.id}`,
          sourceId: entry.item.id,
          name: entry.item.title,
          duration: `${entry.minutes} min`,
          minutes: entry.minutes,
          notes: "",
          kind: getExerciseKind(entry.item),
          animationData: entry.item.animation_data,
          category: entry.item.category,
        }));
      if (orderedExercises.length) {
        setExercisesByEvent((prev) => ({
          ...prev,
          [newTrainingId]: orderedExercises,
        }));
      }

      const data = await getTrainingsByTeam(validTeamId);
      setTrainings(data ?? []);
      setCreateOpen(false);
      setExerciseSelections({});
    } catch (err) {
      console.error("Erreur création séance:", err);
      let message = "";
      if (err && typeof err === "object" && "message" in err) {
        message = String((err as { message?: unknown }).message ?? "");
      }
      if (!message) {
        message =
          err && typeof err === "object"
            ? JSON.stringify(err)
            : String(err ?? "");
      }
      setCreateError(message || "Impossible de créer la séance.");
    } finally {
      setCreating(false);
    }
  };

  const fetchExerciseLibrary = async () => {
    setExerciseLibraryLoading(true);
    setExerciseLibraryError(null);
    const { data, error } = await supabase
      .from("training_exercises")
      .select("id,title,category,duration,type,is_global,animation_data")
      .order("created_at", { ascending: false });
    if (error) {
      if (!shouldSilenceLoadError(error)) {
        setExerciseLibraryError(error.message);
      }
      setExerciseLibrary([]);
    } else {
      setExerciseLibrary((data as ExerciseLibraryItem[]) ?? []);
    }
    setExerciseLibraryLoading(false);
  };

  useEffect(() => {
    if (!exercisePickerOpen) return;
    if (exerciseLibrary.length || exerciseLibraryLoading) return;
    fetchExerciseLibrary();
  }, [exercisePickerOpen, exerciseLibrary.length, exerciseLibraryLoading]);

  useEffect(() => {
    if (!exercisePickerOpen) return;
    if (!exercisePickerTraining) return;
    if (!exerciseLibrary.length) return;
    if (exercisePickerSeeded) return;
    seedExercisePickerFromTraining(exercisePickerTraining);
  }, [
    exercisePickerOpen,
    exercisePickerTraining,
    exerciseLibrary.length,
    exercisePickerSeeded,
  ]);

  useEffect(() => {
    return () => {
      if (adjustTimerRef.current) {
        window.clearInterval(adjustTimerRef.current);
      }
    };
  }, []);

  const toggleExerciseSelection = (item: ExerciseLibraryItem) => {
    setExerciseSelections((prev) => {
      const next = { ...prev };
      if (next[item.id]) {
        delete next[item.id];
        setExerciseOrder((current) =>
          current.filter((value) => value !== item.id),
        );
        return next;
      }
      const fallbackMinutes =
        typeof item.duration === "number" && item.duration > 0
          ? item.duration
          : 10;
      next[item.id] = { item, minutes: fallbackMinutes };
      setExerciseOrder((current) =>
        current.includes(item.id) ? current : [...current, item.id],
      );
      return next;
    });
  };

  const seedExercisePickerFromTraining = (training: TeamEvent) => {
    const exercises = exercisesByEvent[training.id] ?? [];
    const selections: Record<
      string,
      { item: ExerciseLibraryItem; minutes: number }
    > = {};
    const order: string[] = [];

    exercises.forEach((exercise) => {
      const match =
        (exercise.sourceId
          ? exerciseLibrary.find((item) => item.id === exercise.sourceId)
          : null) ||
        exerciseLibrary.find((item) => item.title === exercise.name);
      if (!match) return;
      const minutes =
        typeof exercise.minutes === "number"
          ? exercise.minutes
          : typeof match.duration === "number" && match.duration > 0
          ? match.duration
          : 10;
      selections[match.id] = { item: match, minutes };
      order.push(match.id);
    });

    setExerciseSelections(selections);
    setExerciseOrder(order);
    setExerciseCategory("Toutes");
    setExercisePickerSeeded(true);
  };

  const openExercisePickerForTraining = (training: TeamEvent) => {
    setExercisePickerTraining(training);
    setExercisePickerSeeded(false);
    setExercisePickerOpen(true);
    if (exerciseLibrary.length) {
      seedExercisePickerFromTraining(training);
    }
  };

  const handleValidateExercisePicker = () => {
    if (exercisePickerTraining) {
      const trainingId = exercisePickerTraining.id;
      const existing = exercisesByEvent[trainingId] ?? [];
      const existingBySourceId = new Map(
        existing
          .filter((exercise) => exercise.sourceId)
          .map((exercise) => [exercise.sourceId as string, exercise]),
      );
      const existingByName = new Map(
        existing.map((exercise) => [exercise.name, exercise]),
      );
      const orderedExercises = selectedExercises.map((entry) => {
        const previous =
          existingBySourceId.get(entry.item.id) ??
          existingByName.get(entry.item.title);
        return {
          id: previous?.id ?? `${trainingId}-${entry.item.id}`,
          sourceId: entry.item.id,
          name: entry.item.title,
          duration: `${entry.minutes} min`,
          minutes: entry.minutes,
          notes: previous?.notes ?? "",
          kind: getExerciseKind(entry.item),
          animationData: entry.item.animation_data,
          category: entry.item.category,
        };
      });
      setExercisesByEvent((prev) => ({
        ...prev,
        [trainingId]: orderedExercises,
      }));
      setExercisePickerTraining(null);
    }
    setExercisePickerOpen(false);
  };

  const updateExerciseMinutes = (id: string, delta: number) => {
    setExerciseSelections((prev) => {
      const entry = prev[id];
      if (!entry) return prev;
      const nextMinutes = Math.max(1, entry.minutes + delta);
      return {
        ...prev,
        [id]: { ...entry, minutes: nextMinutes },
      };
    });
  };

  const setExerciseMinutes = (id: string, value: number) => {
    setExerciseSelections((prev) => {
      const entry = prev[id];
      if (!entry) return prev;
      const nextMinutes = Math.max(1, value);
      return {
        ...prev,
        [id]: { ...entry, minutes: nextMinutes },
      };
    });
  };

  const startAdjusting = (id: string, delta: number) => {
    updateExerciseMinutes(id, delta);
    if (adjustTimerRef.current) {
      window.clearInterval(adjustTimerRef.current);
    }
    adjustTimerRef.current = window.setInterval(() => {
      updateExerciseMinutes(id, delta);
    }, 120);
  };

  const stopAdjusting = () => {
    if (adjustTimerRef.current) {
      window.clearInterval(adjustTimerRef.current);
      adjustTimerRef.current = null;
    }
  };

  const handleDeleteTraining = async (training: TeamEvent) => {
    if (deletingTrainingId) return;
    const confirmed = window.confirm("Supprimer cette séance ?");
    if (!confirmed) return;
    setDeletingTrainingId(training.id);
    try {
      await supabase.from("training_sessions").delete().eq("event_id", training.id);
      await supabase.from("event_players").delete().eq("event_id", training.id);
      await supabase.from("team_events").delete().eq("id", training.id);
      setTrainings((prev) => prev.filter((item) => item.id !== training.id));
      setExercisesByEvent((prev) => {
        const next = { ...prev };
        delete next[training.id];
        return next;
      });
      setAttendanceByEvent((prev) => {
        const next = { ...prev };
        delete next[training.id];
        return next;
      });
    } catch (err) {
      console.error("Erreur suppression séance:", err);
    } finally {
      setDeletingTrainingId(null);
    }
  };

  const openPresence = (training: TeamEvent) => {
    const currentIds = attendanceByEvent[training.id] ?? [];
    setPresenceTraining(training);
    setPresenceDraft(new Set(currentIds));
    setPresenceInitial(new Set(currentIds));
    setAbsencePicker("");
    setPresenceOpen(true);
  };

  const closePresence = () => {
    setPresenceOpen(false);
    setPresenceTraining(null);
    setPresenceDraft(new Set());
    setPresenceInitial(new Set());
  };

  const togglePresence = (playerId: string) => {
    setPresenceDraft((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const handleSavePresence = async () => {
    if (!presenceTraining) return;
    setPresenceSaving(true);
    try {
      await supabase
        .from("event_players")
        .delete()
        .eq("event_id", presenceTraining.id);

      const rows = Array.from(presenceDraft).map((playerId) => ({
        event_id: presenceTraining.id,
        player_id: playerId,
      }));
      if (rows.length) {
        await supabase.from("event_players").insert(rows);
      }
      setAttendanceByEvent((prev) => ({
        ...prev,
        [presenceTraining.id]: Array.from(presenceDraft),
      }));
      closePresence();
    } catch (err) {
      console.error("Erreur sauvegarde présences:", err);
    } finally {
      setPresenceSaving(false);
    }
  };

  const openExercise = (training: TeamEvent) => {
    setExerciseTraining(training);
    setExerciseName("");
    setExerciseDuration("");
    setExerciseNotes("");
    setExerciseOpen(true);
  };

  const closeExercise = () => {
    setExerciseOpen(false);
    setExerciseTraining(null);
  };

  const handleAddExercise = () => {
    if (!exerciseTraining) return;
    if (!exerciseName.trim()) return;
    const trainingId = exerciseTraining.id;
    const nextExercise: Exercise = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: exerciseName.trim(),
      duration: exerciseDuration.trim(),
      notes: exerciseNotes.trim(),
    };
    setExercisesByEvent((currentState) => {
      const safeState = currentState ?? {};
      const current = safeState[trainingId] ?? [];
      return {
        ...safeState,
        [trainingId]: [...current, nextExercise],
      };
    });
    closeExercise();
  };

  const openTrainingMode = (training: TeamEvent) => {
    const exercises = exercisesByEvent[training.id] ?? [];
    setTrainingMode({
      training,
      index: 0,
      elapsed: 0,
      sessionElapsed: 0,
      running: exercises.length > 0,
    });
  };

  const closeTrainingMode = () => {
    setTrainingMode(null);
    setChronoInfoOpen(false);
  };

  const toggleTrainingRunning = () => {
    setTrainingMode((current) =>
      current ? { ...current, running: !current.running } : null,
    );
  };

  const setTrainingRunning = (value: boolean) => {
    setTrainingMode((current) =>
      current ? { ...current, running: value } : null,
    );
  };

  const goToNextExercise = () => {
    setTrainingMode((current) => {
      if (!current) return null;
      const exercises = exercisesByEvent[current.training.id] ?? [];
      if (!exercises.length) {
        return { ...current, running: false, elapsed: 0, index: 0 };
      }
      const nextIndex = Math.min(current.index + 1, exercises.length - 1);
      if (nextIndex === current.index) {
        return { ...current, running: false };
      }
      return { ...current, index: nextIndex, elapsed: 0 };
    });
  };

  const goToPrevExercise = () => {
    setTrainingMode((current) => {
      if (!current) return null;
      const exercises = exercisesByEvent[current.training.id] ?? [];
      if (!exercises.length) {
        return { ...current, running: false, elapsed: 0, index: 0 };
      }
      const nextIndex = Math.max(current.index - 1, 0);
      if (nextIndex === current.index) {
        return current;
      }
      return { ...current, index: nextIndex, elapsed: 0 };
    });
  };

  const restartCurrentExercise = () => {
    setTrainingMode((current) =>
      current ? { ...current, elapsed: 0 } : null,
    );
  };

  const updateCurrentExerciseNotes = (nextNotes: string) => {
    setTrainingMode((current) => {
      if (!current) return null;
      const trainingId = current.training.id;
      setExercisesByEvent((prev) => {
        const currentList = prev[trainingId] ?? [];
        const nextList = currentList.map((exercise, index) =>
          index === current.index ? { ...exercise, notes: nextNotes } : exercise,
        );
        return {
          ...prev,
          [trainingId]: nextList,
        };
      });
      return current;
    });
  };

  useEffect(() => {
    setChronoInfoOpen(false);
  }, [trainingMode?.index, trainingMode?.training.id]);
  useEffect(() => {
    if (!trainingMode?.running) return;
    const timer = window.setInterval(() => {
      setTrainingMode((current) => {
        if (!current) return null;
        const exercises = exercisesByEvent[current.training.id] ?? [];
        const currentExercise = exercises[current.index] ?? null;
        const durationMinutes = getExerciseMinutes(currentExercise);
        const durationSeconds = Math.max(1, durationMinutes) * 60;
        const nextElapsed = current.elapsed + 1;
        if (nextElapsed < durationSeconds) {
          return {
            ...current,
            elapsed: nextElapsed,
            sessionElapsed: current.sessionElapsed + 1,
          };
        }
        const nextIndex = current.index + 1;
        if (nextIndex < exercises.length) {
          return {
            ...current,
            index: nextIndex,
            elapsed: 0,
            sessionElapsed: current.sessionElapsed + 1,
          };
        }
        return {
          ...current,
          elapsed: durationSeconds,
          sessionElapsed: current.sessionElapsed + 1,
          running: false,
        };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [trainingMode?.running, trainingMode?.training.id, exercisesByEvent]);

  useEffect(() => {
    if (!trainingTestRunning) return;
    trainingTestStartRef.current = Date.now() - trainingTestElapsed;
    const timer = window.setInterval(() => {
      const start = trainingTestStartRef.current ?? Date.now();
      setTrainingTestElapsed(Date.now() - start);
    }, 30);
    return () => window.clearInterval(timer);
  }, [trainingTestRunning]);

  useEffect(() => {
    if (!trainingTestShowRanking) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (trainingTestRankingButtonRef.current?.contains(target)) return;
      if (trainingTestRankingPanelRef.current?.contains(target)) return;
      setTrainingTestShowRanking(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [trainingTestShowRanking]);

  useEffect(() => {
    if (!trainingTestShowObjective) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (trainingTestObjectiveButtonRef.current?.contains(target)) return;
      if (trainingTestObjectivePanelRef.current?.contains(target)) return;
      setTrainingTestShowObjective(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [trainingTestShowObjective]);

  useEffect(() => {
    if (!trainingTestResetMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (trainingTestResetButtonRef.current?.contains(target)) return;
      if (trainingTestResetMenuRef.current?.contains(target)) return;
      setTrainingTestResetMenuOpen(false);
      setTrainingTestResetConfirm(null);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [trainingTestResetMenuOpen]);

  useEffect(() => {
    return () => {
      if (trainingTestUndoTimerRef.current) {
        window.clearTimeout(trainingTestUndoTimerRef.current);
        trainingTestUndoTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!trainingMode) {
    setTrainingTestRunning(false);
    setTrainingTestElapsed(0);
    trainingTestStartRef.current = null;
    setTrainingTestActivePlayerId(null);
    setTrainingTestShowRanking(false);
    setTrainingTestShowObjective(false);
    setTrainingTestResetMenuOpen(false);
    setTrainingTestResetConfirm(null);
    setTrainingTestUndoLabel(null);
    trainingTestUndoActionRef.current = null;
    if (trainingTestUndoTimerRef.current) {
      window.clearTimeout(trainingTestUndoTimerRef.current);
      trainingTestUndoTimerRef.current = null;
    }
    return;
  }
  setTrainingTestRunning(false);
  setTrainingTestElapsed(0);
  trainingTestStartRef.current = null;
  setTrainingTestActivePlayerId(null);
  setTrainingTestShowRanking(false);
  setTrainingTestShowObjective(false);
  setTrainingTestResetMenuOpen(false);
  setTrainingTestResetConfirm(null);
  setTrainingTestUndoLabel(null);
  trainingTestUndoActionRef.current = null;
  if (trainingTestUndoTimerRef.current) {
    window.clearTimeout(trainingTestUndoTimerRef.current);
    trainingTestUndoTimerRef.current = null;
  }
  }, [trainingMode?.training.id, trainingMode?.index]);

  const triggerTrainingTestUndo = (label: string, action: () => void) => {
    trainingTestUndoActionRef.current = action;
    setTrainingTestUndoLabel(label);
    if (trainingTestUndoTimerRef.current) {
      window.clearTimeout(trainingTestUndoTimerRef.current);
    }
    trainingTestUndoTimerRef.current = window.setTimeout(() => {
      setTrainingTestUndoLabel(null);
      trainingTestUndoActionRef.current = null;
      trainingTestUndoTimerRef.current = null;
    }, 6500);
  };

  const handleTrainingTestUndo = () => {
    if (trainingTestUndoActionRef.current) {
      trainingTestUndoActionRef.current();
    }
    setTrainingTestUndoLabel(null);
    trainingTestUndoActionRef.current = null;
    if (trainingTestUndoTimerRef.current) {
      window.clearTimeout(trainingTestUndoTimerRef.current);
      trainingTestUndoTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!trainingMode) return;
    if (!currentTrainingExercise || currentTrainingExercise.kind !== "test") return;
    const absentIds = attendanceByEvent[trainingMode.training.id] ?? [];
    const availablePlayers =
      players.filter((player) => !absentIds.includes(player.id)) || [];
    const roster = availablePlayers.length ? availablePlayers : players;
    if (!roster.length) return;
    if (!trainingTestActivePlayerId) {
      setTrainingTestActivePlayerId(roster[0].id);
      return;
    }
    if (!roster.some((player) => player.id === trainingTestActivePlayerId)) {
      setTrainingTestActivePlayerId(roster[0].id);
    }
  }, [
    trainingMode,
    currentTrainingExercise,
    players,
    attendanceByEvent,
    trainingTestActivePlayerId,
  ]);

  return (
    <div className="min-h-screen bg-[#070a14] text-slate-100">
      <div className="mx-auto w-full max-w-6xl px-6 pb-8 pt-10">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-2xl font-semibold text-slate-100">
            Entraînements
          </h1>
          <div className="hidden md:block h-px flex-1 bg-gradient-to-r from-transparent via-violet-400/70 to-transparent opacity-70 shadow-[0_0_18px_rgba(168,85,247,0.55)] animate-pulse" />
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur">
            {[
              { key: "sessions", label: "Séances" },
              { key: "exercises", label: "Exercices" },
              { key: "templates", label: "Modèles" },
            ].map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  className={[
                    "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] transition",
                    isActive
                      ? "bg-white/15 text-white shadow-[0_0_18px_rgba(168,85,247,0.35)] ring-1 ring-violet-400/40"
                      : "text-slate-400 hover:bg-white/10 hover:text-slate-200",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === "exercises" ? (
          <ExercisesLibrary />
        ) : activeTab === "templates" ? (
          <div className="mt-8 rounded-[28px] border border-white/10 bg-black/35 p-6 text-sm text-slate-400 shadow-[0_26px_60px_rgba(0,0,0,0.6)]">
            Contenu disponible bientôt.
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {["all", "upcoming", "past"].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key as typeof filter)}
                    className={[
                      "rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition",
                      filter === key
                        ? "border border-white/15 bg-white/10 text-slate-100"
                        : "border border-white/10 bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200",
                    ].join(" ")}
                  >
                    {key === "all"
                      ? "Toutes"
                      : key === "upcoming"
                      ? "À venir"
                      : "Passées"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWeekOnly((prev) => !prev)}
                  className={[
                    "rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition",
                    weekOnly
                      ? "border border-white/15 bg-white/10 text-slate-100"
                      : "border border-white/10 bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200",
                  ].join(" ")}
                >
                  Semaine
                </button>
                <button
                  type="button"
                  onClick={openCreate}
                  className="rounded-full bg-violet-600 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white shadow-[0_10px_26px_rgba(0,0,0,0.45)] transition hover:bg-violet-500 active:scale-95"
                >
                  Créer une séance
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              {error ? (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6 text-sm text-rose-200">
                  {error}
                </div>
              ) : loading ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                  Chargement des séances…
                </div>
              ) : sortedTrainings.length === 0 ? (
                <div className="flex min-h-[200px] items-center justify-center text-sm text-slate-400">
                  Aucune séance enregistrée pour l’instant.
                </div>
              ) : (
                (() => {
                  const now = Date.now();
                  const upcomingTrainings = sortedTrainings.filter(
                    (training) => new Date(training.start_at).getTime() >= now,
                  );
                  const pastTrainings = sortedTrainings
                    .filter(
                      (training) => new Date(training.start_at).getTime() < now,
                    )
                    .sort(
                      (a, b) =>
                        new Date(b.start_at).getTime() -
                        new Date(a.start_at).getTime(),
                    );

                  const renderTrainingRow = (
                    trainings: TeamEvent[],
                    highlightFirst: boolean,
                  ) => (
                    <div className="flex gap-4 overflow-x-auto pb-2">
                      {trainings.map((training, index) => {
                        const start = new Date(training.start_at);
                        const end = training.end_at
                          ? new Date(training.end_at)
                          : null;
                        const absentCount =
                          attendanceByEvent[training.id]?.length ?? 0;
                        const exercises = exercisesByEvent[training.id] ?? [];
                        const exercisesCount = exercises.length;
                        const hasPresence =
                          training.id in attendanceByEvent;
                        const absenceLabel =
                          hasPresence && totalPlayers > 0
                            ? `${absentCount}/${totalPlayers} absents`
                            : "Absents non faits";
                        const isUpcoming = start.getTime() >= now;
                        const statusLabel = isUpcoming ? "À venir" : "Terminée";
                        const highlight = highlightFirst && index === 0;

                        return (
                          <div
                            key={training.id}
                            onClick={() => setExpandedTraining(training)}
                            className={[
                              "group relative flex w-[320px] shrink-0 flex-col rounded-2xl border p-4 transition",
                              highlight
                                ? "border-violet-400/50 bg-gradient-to-b from-violet-500/20 via-violet-500/10 to-black/40 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
                                : isUpcoming
                                  ? "border-white/10 bg-black/25 hover:bg-black/35"
                                  : "border-white/10 bg-white/10 hover:bg-white/15",
                            ].join(" ")}
                          >
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/10 shadow-[inset_0_0_18px_rgba(216,180,254,0.18)]"
                            />
                            {highlight ? (
                              <>
                                <span
                                  aria-hidden="true"
                                  className="pointer-events-none absolute inset-x-0 top-0 h-20 rounded-t-2xl bg-gradient-to-b from-black/55 via-black/25 to-transparent"
                                />
                                <span
                                  aria-hidden="true"
                                  className="pointer-events-none absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-400/20 blur-[18px]"
                                />
                              </>
                            ) : null}
                            <span
                              className={[
                                "absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
                                isUpcoming
                                  ? "border-violet-400/40 bg-violet-500/10 text-violet-100"
                                  : "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
                              ].join(" ")}
                            >
                              <span className="h-1 w-1 rounded-full bg-current" />
                              {statusLabel}
                            </span>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteTraining(training);
                              }}
                              className="absolute bottom-2 right-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] text-white/70 transition hover:bg-white/10 hover:text-white"
                              aria-label="Supprimer"
                              disabled={deletingTrainingId === training.id}
                            >
                              🗑
                            </button>
                            <div className="absolute left-4 top-2 text-[10px] font-semibold tracking-[0.16em] text-white/90 drop-shadow-[0_1px_10px_rgba(168,85,247,0.35)]">
                              {formatTimeRange(start, end)}
                            </div>
                            <div className="flex h-full flex-col pt-4 pb-10">
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openTrainingMode(training);
                                }}
                                className="rounded-full bg-violet-600 px-2.5 py-0.5 text-[10px] font-semibold text-white shadow-[0_8px_20px_rgba(109,40,217,0.35)] transition hover:bg-violet-500 active:scale-95"
                              >
                                ▶ Lancer l’entraînement
                              </button>
                            </div>
                            {exercisesCount > 0 ? (
                              <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                                {exercises.map((exercise, index) => {
                                  const previewUrl = getExercisePreviewUrl(
                                    exercise.animationData,
                                  );
                                  const durationLabel =
                                    typeof exercise.minutes === "number"
                                      ? `${exercise.minutes} min`
                                      : typeof exercise.duration === "string" &&
                                        exercise.duration.toLowerCase().includes("min")
                                      ? exercise.duration
                                      : `${exercise.duration} min`;
                                  return (
                                    <button
                                      key={exercise.id}
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setExpandedExercise(exercise);
                                      }}
                                      className="group flex w-[150px] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-left transition hover:border-white/20"
                                    >
                                      <div className="relative h-20 w-full overflow-hidden">
                                        {previewUrl ? (
                                          <img
                                            src={previewUrl}
                                            alt={exercise.name}
                                            className="h-full w-full object-cover brightness-115 contrast-110 saturate-110"
                                            loading="lazy"
                                          />
                                        ) : (
                                          <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                                            {exercise.name.slice(0, 6)}
                                          </div>
                                        )}
                                        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] text-white/80">
                                          {index + 1}
                                        </span>
                                      </div>
                                      <div className="px-2.5 py-2">
                                        <div className="text-[11px] font-semibold text-slate-100">
                                          {exercise.name}
                                        </div>
                                        <div className="mt-1 inline-flex items-center rounded-full bg-violet-600/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_6px_16px_rgba(124,58,237,0.45)]">
                                          {durationLabel}
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                            <div className="mt-3 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openPresence(training);
                                }}
                                className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-100 transition hover:bg-white/10"
                              >
                                Absences
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openExercisePickerForTraining(training);
                                }}
                                className="rounded-full border border-white/10 bg-transparent px-2 py-0.5 text-[10px] font-semibold text-slate-300 transition hover:bg-white/5 hover:text-slate-100"
                              >
                                Ajouter un exercice
                              </button>
                            </div>
                            <div className="absolute bottom-2 left-3 flex flex-wrap items-center gap-3 text-[10px] text-slate-300">
                              <span className="inline-flex items-center gap-1 text-slate-300">
                                <Users className="h-3 w-3 text-indigo-300 drop-shadow-[0_0_6px_rgba(129,140,248,0.6)]" />
                                {absenceLabel}
                              </span>
                              <span className="inline-flex items-center gap-1 text-slate-300">
                                <Puzzle className="h-3 w-3 text-amber-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.7)]" />
                                {exercisesCount} exo
                              </span>
                            </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );

                  if (filter === "upcoming") {
                    return renderTrainingRow(upcomingTrainings, false);
                  }
                  if (filter === "past") {
                    return renderTrainingRow(pastTrainings, false);
                  }

                  return (
                    <>
                      <div>
                        <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                          <span className="whitespace-nowrap">
                            Prochain entraînement
                          </span>
                          <span className="relative h-px flex-1 bg-gradient-to-r from-white/40 via-white/20 to-transparent">
                            <span className="absolute -top-1 right-0 h-2 w-2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.7)]" />
                          </span>
                        </div>
                        <div className="mt-3">
                          {upcomingTrainings.length > 0 ? (
                            renderTrainingRow(upcomingTrainings, true)
                          ) : (
                            <div className="text-sm text-slate-400">
                              Aucune séance à venir.
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                          <span className="whitespace-nowrap">
                            Séances passées
                          </span>
                          <span className="relative h-px flex-1 bg-gradient-to-r from-white/40 via-white/20 to-transparent">
                            <span className="absolute -top-1 right-0 h-2 w-2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.7)]" />
                          </span>
                        </div>
                        <div className="mt-3">
                          {pastTrainings.length > 0 ? (
                            renderTrainingRow(pastTrainings, false)
                          ) : (
                            <div className="text-sm text-slate-400">
                              Aucun historique.
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()
              )}
            </div>
          </>
        )}
      </div>

      {createOpen ? (
        <div
          className={[
            "fixed inset-0 z-40 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[2px]",
            exercisePickerOpen ? "hidden" : "",
          ].join(" ")}
          onClick={closeCreate}
          role="presentation"
        >
            <div
              className={[
                "relative w-full max-w-sm rounded-3xl border border-white/12 bg-black/30 p-2.5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-[32px] backdrop-saturate-200 md:p-3",
                exercisePickerOpen ? "pointer-events-none" : "",
              ].join(" ")}
              onClick={(event) => event.stopPropagation()}
              role="presentation"
            >
            <button
              type="button"
              onClick={closeCreate}
              className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition hover:text-white"
              aria-label="Fermer"
            >
              ✕
            </button>
            <div>
              <h2 className="text-[15px] font-semibold text-slate-50 md:text-base">
                Nouvelle séance
              </h2>
              <span className="mt-2 block h-px w-16 bg-violet-400/70" />
            </div>

            <div className="mt-3 space-y-2.5 text-center">
              <div>
                <label className="text-[9px] font-medium uppercase tracking-[0.18em] text-slate-300">
                  Date
                </label>
                <div className="relative mt-2 flex justify-center">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-60 blur-[12px]"
                  />
                  <input
                    type="date"
                    value={draftDate}
                    onChange={(event) => {
                      setDraftDate(event.target.value);
                      setDateTouched(true);
                    }}
                    className={`relative z-10 w-[150px] appearance-none rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-0 py-[2px] text-[10px] text-[#f2f0ff] text-center [&::-webkit-datetime-edit]:w-full [&::-webkit-datetime-edit]:text-center [&::-webkit-datetime-edit-fields-wrapper]:flex [&::-webkit-datetime-edit-fields-wrapper]:w-full [&::-webkit-datetime-edit-fields-wrapper]:items-center [&::-webkit-datetime-edit-fields-wrapper]:justify-center shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus:ring-1 focus:ring-violet-400/50 focus:animate-[friendlyBreath_2.8s_ease-in-out_infinite] focus:bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)] [color-scheme:dark] [&::-webkit-datetime-edit]:text-[#f2f0ff] [&::-webkit-datetime-edit-text]:text-white/70 [&::-webkit-datetime-edit-fields-wrapper]:text-[#f2f0ff] [&::-webkit-calendar-picker-indicator]:opacity-60 ${
                      dateTouched && draftDate
                        ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)]"
                        : ""
                    }`}
                  />
                  {dateTouched && draftDate ? (
                    <span className="pointer-events-none absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-[9px] font-medium uppercase tracking-[0.18em] text-slate-300">
                    Heure début
                  </label>
                  <div className="relative mt-2 flex justify-center">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-60 blur-[12px]"
                    />
                    <div
                      className={`relative z-10 inline-flex items-center gap-1 rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-1.5 py-[2px] text-[10px] text-[#f2f0ff] shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus-within:ring-1 focus-within:ring-violet-400/50 ${
                        timeTouched && startTimeValue
                          ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)]"
                          : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const next = adjustTimeByMinutes(
                            `${startHour}:${startMinute}`,
                            -15,
                          );
                          const { hour, minute } = splitTimeValue(next);
                          setStartHour(hour);
                          setStartMinute(minute);
                          startHourBufferRef.current = hour;
                          startMinuteBufferRef.current = minute;
                          setTimeTouched(true);
                        }}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-slate-200 transition hover:bg-white/10"
                        aria-label="Moins 15 minutes"
                      >
                        ‹
                      </button>
                      <input
                        ref={startHourInputRef}
                        inputMode="numeric"
                        value={startHour}
                        onChange={() => {}}
                        onFocus={(event) => {
                          startHourBufferRef.current = "";
                          event.currentTarget.select();
                        }}
                        onKeyDown={(event) => {
                          if (event.key >= "0" && event.key <= "9") {
                            event.preventDefault();
                            if (startHourAutoAdvanceRef.current) {
                              window.clearTimeout(startHourAutoAdvanceRef.current);
                              startHourAutoAdvanceRef.current = null;
                            }
                            if (startHourBufferRef.current.length >= 2) {
                              startHourBufferRef.current = "";
                            }
                            const next = (
                              startHourBufferRef.current + event.key
                            ).slice(0, 2);
                            startHourBufferRef.current = next;
                            setStartHour(next);
                            setTimeTouched(true);
                            if (next.length === 2) {
                              startMinuteBufferRef.current = "";
                              setStartMinute("");
                              startMinuteInputRef.current?.focus();
                              return;
                            }
                            startHourAutoAdvanceRef.current = window.setTimeout(
                              () => {
                                if (startHourBufferRef.current.length === 1) {
                                  const padded = `0${startHourBufferRef.current}`;
                                  startHourBufferRef.current = padded;
                                  setStartHour(padded);
                                  startMinuteBufferRef.current = "";
                                  setStartMinute("");
                                  startMinuteInputRef.current?.focus();
                                }
                                startHourAutoAdvanceRef.current = null;
                              },
                              800,
                            );
                            return;
                          }
                          if (event.key === "Backspace") {
                            event.preventDefault();
                            startHourBufferRef.current =
                              startHourBufferRef.current.slice(0, -1);
                            setStartHour(startHourBufferRef.current);
                            setTimeTouched(true);
                          }
                        }}
                        onBlur={() => {
                          if (startHourAutoAdvanceRef.current) {
                            window.clearTimeout(startHourAutoAdvanceRef.current);
                            startHourAutoAdvanceRef.current = null;
                          }
                          const nextHour = normalizeHour(
                            startHourBufferRef.current || startHour,
                          );
                          setStartHour(nextHour);
                          startHourBufferRef.current = nextHour;
                          if (
                            startMinuteInputRef.current ===
                            document.activeElement
                          ) {
                            return;
                          }
                          const nextMinute = normalizeMinute(
                            startMinuteBufferRef.current || startMinute,
                          );
                          setStartMinute(nextMinute);
                          startMinuteBufferRef.current = nextMinute;
                        }}
                        className="w-7 bg-transparent text-center text-[10px] text-[#f2f0ff] outline-none"
                      />
                      <span className="text-slate-400">:</span>
                      <input
                        ref={startMinuteInputRef}
                        inputMode="numeric"
                        value={startMinute}
                        onChange={() => {}}
                        onFocus={(event) => {
                          startMinuteBufferRef.current = "";
                          event.currentTarget.select();
                        }}
                        onKeyDown={(event) => {
                          if (event.key >= "0" && event.key <= "9") {
                            event.preventDefault();
                            if (startMinuteBufferRef.current.length >= 2) {
                              startMinuteBufferRef.current = "";
                            }
                            const next = (
                              startMinuteBufferRef.current + event.key
                            ).slice(0, 2);
                            startMinuteBufferRef.current = next;
                            setStartMinute(next);
                            setTimeTouched(true);
                            return;
                          }
                          if (event.key === "Backspace") {
                            event.preventDefault();
                            startMinuteBufferRef.current =
                              startMinuteBufferRef.current.slice(0, -1);
                            setStartMinute(startMinuteBufferRef.current);
                            setTimeTouched(true);
                          }
                        }}
                        onBlur={() => {
                          const nextHour = normalizeHour(
                            startHourBufferRef.current || startHour,
                          );
                          const nextMinute = normalizeMinute(
                            startMinuteBufferRef.current || startMinute,
                          );
                          setStartHour(nextHour);
                          setStartMinute(nextMinute);
                          startHourBufferRef.current = nextHour;
                          startMinuteBufferRef.current = nextMinute;
                        }}
                        className="w-7 bg-transparent text-center text-[10px] text-[#f2f0ff] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = adjustTimeByMinutes(
                            `${startHour}:${startMinute}`,
                            15,
                          );
                          const { hour, minute } = splitTimeValue(next);
                          setStartHour(hour);
                          setStartMinute(minute);
                          startHourBufferRef.current = hour;
                          startMinuteBufferRef.current = minute;
                          setTimeTouched(true);
                        }}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-slate-200 transition hover:bg-white/10"
                        aria-label="Plus 15 minutes"
                      >
                        ›
                      </button>
                    </div>
                    {timeTouched && startTimeValue ? (
                      <span className="pointer-events-none absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
                    ) : null}
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-medium uppercase tracking-[0.18em] text-slate-300">
                    Heure fin
                  </label>
                  <div className="relative mt-2 flex justify-center">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-60 blur-[12px]"
                    />
                    <div
                      className={`relative z-10 inline-flex items-center gap-1 rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-1.5 py-[2px] text-[10px] text-[#f2f0ff] shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus-within:ring-1 focus-within:ring-violet-400/50 ${
                        endTimeTouched && endTimeValue
                          ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)]"
                          : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const next = adjustTimeByMinutes(
                            `${endHour}:${endMinute}`,
                            -15,
                          );
                          const { hour, minute } = splitTimeValue(next);
                          setEndHour(hour);
                          setEndMinute(minute);
                          endHourBufferRef.current = hour;
                          endMinuteBufferRef.current = minute;
                          setEndTimeTouched(true);
                        }}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-slate-200 transition hover:bg-white/10"
                        aria-label="Moins 15 minutes"
                      >
                        ‹
                      </button>
                      <input
                        ref={endHourInputRef}
                        inputMode="numeric"
                        value={endHour}
                        onChange={() => {}}
                        onFocus={(event) => {
                          endHourBufferRef.current = "";
                          event.currentTarget.select();
                        }}
                        onKeyDown={(event) => {
                          if (event.key >= "0" && event.key <= "9") {
                            event.preventDefault();
                            if (endHourAutoAdvanceRef.current) {
                              window.clearTimeout(endHourAutoAdvanceRef.current);
                              endHourAutoAdvanceRef.current = null;
                            }
                            if (endHourBufferRef.current.length >= 2) {
                              endHourBufferRef.current = "";
                            }
                            const next = (
                              endHourBufferRef.current + event.key
                            ).slice(0, 2);
                            endHourBufferRef.current = next;
                            setEndHour(next);
                            setEndTimeTouched(true);
                            if (next.length === 2) {
                              endMinuteBufferRef.current = "";
                              setEndMinute("");
                              endMinuteInputRef.current?.focus();
                              return;
                            }
                            endHourAutoAdvanceRef.current = window.setTimeout(
                              () => {
                                if (endHourBufferRef.current.length === 1) {
                                  const padded = `0${endHourBufferRef.current}`;
                                  endHourBufferRef.current = padded;
                                  setEndHour(padded);
                                  endMinuteBufferRef.current = "";
                                  setEndMinute("");
                                  endMinuteInputRef.current?.focus();
                                }
                                endHourAutoAdvanceRef.current = null;
                              },
                              800,
                            );
                            return;
                          }
                          if (event.key === "Backspace") {
                            event.preventDefault();
                            endHourBufferRef.current =
                              endHourBufferRef.current.slice(0, -1);
                            setEndHour(endHourBufferRef.current);
                            setEndTimeTouched(true);
                          }
                        }}
                        onBlur={() => {
                          if (endHourAutoAdvanceRef.current) {
                            window.clearTimeout(endHourAutoAdvanceRef.current);
                            endHourAutoAdvanceRef.current = null;
                          }
                          const nextHour = normalizeHour(
                            endHourBufferRef.current || endHour,
                          );
                          setEndHour(nextHour);
                          endHourBufferRef.current = nextHour;
                          if (
                            endMinuteInputRef.current ===
                            document.activeElement
                          ) {
                            return;
                          }
                          const nextMinute = normalizeMinute(
                            endMinuteBufferRef.current || endMinute,
                          );
                          setEndMinute(nextMinute);
                          endMinuteBufferRef.current = nextMinute;
                        }}
                        className="w-7 bg-transparent text-center text-[10px] text-[#f2f0ff] outline-none"
                      />
                      <span className="text-slate-400">:</span>
                      <input
                        ref={endMinuteInputRef}
                        inputMode="numeric"
                        value={endMinute}
                        onChange={() => {}}
                        onFocus={(event) => {
                          endMinuteBufferRef.current = "";
                          event.currentTarget.select();
                        }}
                        onKeyDown={(event) => {
                          if (event.key >= "0" && event.key <= "9") {
                            event.preventDefault();
                            if (endMinuteBufferRef.current.length >= 2) {
                              endMinuteBufferRef.current = "";
                            }
                            const next = (
                              endMinuteBufferRef.current + event.key
                            ).slice(0, 2);
                            endMinuteBufferRef.current = next;
                            setEndMinute(next);
                            setEndTimeTouched(true);
                            return;
                          }
                          if (event.key === "Backspace") {
                            event.preventDefault();
                            endMinuteBufferRef.current =
                              endMinuteBufferRef.current.slice(0, -1);
                            setEndMinute(endMinuteBufferRef.current);
                            setEndTimeTouched(true);
                          }
                        }}
                        onBlur={() => {
                          const nextHour = normalizeHour(
                            endHourBufferRef.current || endHour,
                          );
                          const nextMinute = normalizeMinute(
                            endMinuteBufferRef.current || endMinute,
                          );
                          setEndHour(nextHour);
                          setEndMinute(nextMinute);
                          endHourBufferRef.current = nextHour;
                          endMinuteBufferRef.current = nextMinute;
                        }}
                        className="w-7 bg-transparent text-center text-[10px] text-[#f2f0ff] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = adjustTimeByMinutes(
                            `${endHour}:${endMinute}`,
                            15,
                          );
                          const { hour, minute } = splitTimeValue(next);
                          setEndHour(hour);
                          setEndMinute(minute);
                          endHourBufferRef.current = hour;
                          endMinuteBufferRef.current = minute;
                          setEndTimeTouched(true);
                        }}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-slate-200 transition hover:bg-white/10"
                        aria-label="Plus 15 minutes"
                      >
                        ›
                      </button>
                    </div>
                    {endTimeTouched && endTimeValue ? (
                      <span className="pointer-events-none absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center justify-center gap-6">
                  <button
                    type="button"
                    onClick={() => setShowLocationField((prev) => !prev)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/90 transition hover:bg-white/10"
                    aria-label="Ajouter un lieu"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4.5 w-4.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 21s6-6.3 6-11a6 6 0 1 0-12 0c0 4.7 6 11 6 11z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNotesField((prev) => !prev)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/90 transition hover:bg-white/10"
                    aria-label="Ajouter une note"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4.5 w-4.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 4h9l3 3v13H6z" />
                      <path d="M15 4v4h4" />
                      <path d="M8 12h8" />
                      <path d="M8 16h6" />
                    </svg>
                  </button>
                </div>
                {showLocationField ? (
                  <div className="relative flex justify-center">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-60 blur-[12px]"
                    />
                    <input
                      type="text"
                      value={draftLocation}
                      onChange={(event) => {
                        setDraftLocation(event.target.value);
                        setLocationTouched(true);
                      }}
                      placeholder="Stade"
                      className={`relative z-10 w-[200px] max-w-full rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-2 py-1 text-[10px] text-[#f2f0ff] shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus:ring-1 focus:ring-violet-400/50 focus:animate-[friendlyBreath_2.8s_ease-in-out_infinite] focus:bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)] ${
                        locationTouched && draftLocation
                          ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)]"
                          : ""
                      }`}
                    />
                    {locationTouched && draftLocation ? (
                      <span className="pointer-events-none absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
                    ) : null}
                  </div>
                ) : null}
                {showNotesField ? (
                  <div className="relative flex justify-center">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-1 rounded-2xl bg-white/25 opacity-60 blur-[12px]"
                    />
                    <textarea
                      value={draftNotes}
                      onChange={(event) => setDraftNotes(event.target.value)}
                      rows={2}
                      placeholder="Notes pour la séance…"
                      className="relative z-10 w-[240px] max-w-full rounded-2xl border border-white/20 bg-[rgba(255,255,255,0.06)] px-2 py-1 text-[10px] text-[#f2f0ff] shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition focus:ring-1 focus:ring-violet-400/50"
                    />
                  </div>
                ) : null}
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/40 p-3 text-left">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                      Exercices
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {selectedExercises.length} sélectionné
                      {selectedExercises.length > 1 ? "s" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setExercisePickerTraining(null);
                      setExercisePickerSeeded(false);
                      setExercisePickerOpen(true);
                    }}
                    className="rounded-full border border-violet-400/40 bg-violet-500/15 px-3 py-1 text-[10px] font-semibold text-violet-100 transition hover:bg-violet-500/25"
                  >
                    Choisir des exercices
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-300">
                  <span>Total : {totalExerciseMinutes} min</span>
                  {sessionDurationMinutes > 0 ? (
                    <span>
                      Durée séance : {sessionDurationMinutes} min
                    </span>
                  ) : null}
                </div>
                {sessionDurationMinutes > 0 ? (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className={`h-full rounded-full ${
                        isOverDuration
                          ? "bg-rose-400"
                          : "bg-violet-500"
                      }`}
                      style={{ width: `${sessionProgress * 100}%` }}
                    />
                  </div>
                ) : null}
              </div>

              {createError ? (
                <div className="text-[11px] text-rose-300">{createError}</div>
              ) : null}
            </div>

            <div className="mt-4 flex items-center justify-end">
              <button
                type="button"
                disabled={creating}
                onClick={handleCreate}
                className="rounded-full bg-violet-600 px-4 py-1.5 text-[11px] font-medium text-white shadow-[0_8px_22px_rgba(0,0,0,0.35)] transition hover:bg-violet-500 active:scale-95 disabled:opacity-50"
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {exercisePickerOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          onClick={() => setExercisePickerOpen(false)}
          role="presentation"
        >
          <div
            className="relative h-[90vh] w-full max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#060b18] to-[#040712] p-5 shadow-2xl backdrop-blur-xl"
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Sélection d’exercices
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-100">
                  Choisir des exercices
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setExercisePickerOpen(false)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 transition hover:bg-white/10"
              >
                Fermer
              </button>
            </div>

            <div className="mt-5 flex flex-nowrap items-center gap-2 overflow-x-auto pb-2">
              {["Toutes", ...CATEGORY_OPTIONS].map((category) => {
                const isActive = exerciseCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setExerciseCategory(category)}
                    className={[
                      "shrink-0 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition",
                      isActive
                        ? "border-violet-400/40 bg-violet-500/15 text-violet-100"
                        : "border-white/10 bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200",
                    ].join(" ")}
                  >
                    {category}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 h-[calc(90vh-240px)] overflow-y-auto pr-1">
              {exerciseLibraryLoading ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                  Chargement des exercices…
                </div>
              ) : exerciseLibraryError ? (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6 text-sm text-rose-200">
                  {exerciseLibraryError}
                </div>
              ) : filteredExerciseLibrary.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                  Aucun exercice dans cette catégorie.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6 md:grid-cols-3 xl:grid-cols-5">
                  {filteredExerciseLibrary.map((item) => {
                    const selected = Boolean(exerciseSelections[item.id]);
                    const minutes = exerciseSelections[item.id]?.minutes ?? 10;
                    const previewUrl = getExercisePreviewUrl(item.animation_data);
                    const kind = getExerciseKind(item);
                    const meta = getExerciseMeta(item);
                    const testMetaParts =
                      kind === "test"
                        ? [
                            meta?.testMetric ? formatMetaLabel(meta.testMetric) : "",
                            meta?.testUnit ? formatMetaLabel(meta.testUnit) : "",
                            meta?.testTarget ? formatMetaLabel(meta.testTarget) : "",
                            meta?.testVariants
                              ? formatMetaLabel(
                                  Array.isArray(meta.testVariants)
                                    ? meta.testVariants.join(" / ")
                                    : meta.testVariants,
                                )
                              : "",
                          ].filter(Boolean)
                        : [];
                    const metaParts = [
                      ...testMetaParts,
                      Array.isArray(meta?.objective)
                        ? meta.objective
                            .map((value: string) => formatMetaLabel(value))
                            .join(" / ")
                        : meta?.objective
                        ? formatMetaLabel(meta.objective)
                        : "",
                      Array.isArray(meta?.levels)
                        ? meta.levels.join(" / ")
                        : meta?.levels
                        ? meta.levels
                        : "",
                      meta?.type === "sans_ballon"
                        ? "Sans ballon"
                        : meta?.type === "avec_ballon"
                        ? "Avec ballon"
                        : meta?.type === "mixte"
                        ? "Mixte"
                        : meta?.type
                        ? formatMetaLabel(meta.type)
                        : "",
                    ].filter(Boolean);
                    const metaLine =
                      metaParts.length > 0 ? metaParts.join(" - ") : "—";
                    const indicatorColor = getCategoryIndicatorColor(
                      item.category || meta?.category,
                    );
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleExerciseSelection(item)}
                        className={[
                          "group relative flex h-[300px] cursor-pointer flex-col rounded-2xl border bg-slate-900/40 text-left transition-all duration-200 overflow-hidden hover:-translate-y-1 hover:border-white/15 hover:bg-white/[0.03] hover:shadow-[0_8px_25px_rgba(0,0,0,0.4)]",
                          selected
                            ? "bg-slate-900/60 border-violet-400/60 shadow-[0_0_0_1px_rgba(139,92,246,0.5)]"
                            : "border-white/5",
                        ].join(" ")}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleExerciseSelection(item);
                          }
                        }}
                      >
                        {selected ? (
                          <div
                            className="absolute top-1/2 left-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-violet-400/50 bg-violet-200/70 px-3.5 py-1.5 text-xs font-semibold text-slate-900 shadow-[0_12px_30px_rgba(0,0,0,0.6),0_0_18px_rgba(139,92,246,0.35)] ring-1 ring-white/30 backdrop-blur"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              onPointerDown={() => startAdjusting(item.id, -1)}
                              onPointerUp={stopAdjusting}
                              onPointerLeave={stopAdjusting}
                              onPointerCancel={stopAdjusting}
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/60 text-slate-900 transition-colors hover:bg-white/80"
                            >
                              –
                            </button>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={minutes}
                              onChange={(event) =>
                                setExerciseMinutes(
                                  item.id,
                                  Number(event.target.value || 1),
                                )
                              }
                              className="h-6 w-12 rounded-full border border-white/40 bg-white/70 text-center text-[11px] text-slate-900"
                            />
                            <button
                              type="button"
                              onPointerDown={() => startAdjusting(item.id, 1)}
                              onPointerUp={stopAdjusting}
                              onPointerLeave={stopAdjusting}
                              onPointerCancel={stopAdjusting}
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/60 text-slate-900 transition-colors hover:bg-white/80"
                            >
                              +
                            </button>
                            <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white shadow-[0_8px_20px_rgba(124,58,237,0.45)]">
                              min
                            </span>
                          </div>
                        ) : null}
                        {selected ? (
                          <span className="pointer-events-none absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent" />
                        ) : null}
                        {selected ? (
                          <span className="absolute top-3 right-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-violet-500 text-[10px] font-semibold text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]">
                            {exerciseOrderMap[item.id] ?? 1}
                          </span>
                        ) : null}
                        <div className="relative h-28 w-full overflow-hidden rounded-t-2xl brightness-125 contrast-110 saturate-110">
                          {previewUrl ? (
                            <img
                              src={previewUrl}
                              alt={item.title}
                              className="h-full w-full object-cover scale-y-[0.94] origin-center"
                              loading="lazy"
                            />
                          ) : kind === "test" ? (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/10 via-white/5 to-transparent text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-200">
                              Test / Mesure
                            </div>
                          ) : null}
                          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                        </div>
                        <div className="w-full border-t border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-1 text-center text-[10px] uppercase tracking-[0.16em] text-slate-300 shadow-[0_10px_24px_rgba(15,23,42,0.35)] backdrop-blur-md">
                          {item.category || "Non classé"}
                        </div>
                        <div className="px-3">
                          <h4 className="mt-3 text-sm font-medium text-slate-50">
                            {item.title}
                          </h4>
                          <div className="mt-1 text-[11px] text-slate-400">
                            {metaLine}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedExercise({
                              id: item.id,
                              name: item.title,
                              duration: `${minutes} min`,
                              minutes,
                              kind: getExerciseKind(item),
                              animationData: item.animation_data,
                              category: item.category,
                              notes: "",
                            });
                          }}
                          className="absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded-full border border-white/15 bg-black/60 text-[9px] text-white/85 shadow-[0_6px_14px_rgba(0,0,0,0.45)] transition hover:bg-white/10"
                          aria-label="Voir"
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect x="3" y="5" width="18" height="12" rx="2" />
                            <path d="M8 19h8" />
                            <path d="M12 17v2" />
                          </svg>
                        </button>
                        <div className="mt-auto px-3 pb-3 pt-2">
                          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                            <span
                              className="h-2 w-2 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.35)]"
                              style={{ backgroundColor: indicatorColor }}
                            />
                            {getTypeLabel(kind)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-b-3xl border-t border-white/10 bg-black/40 px-6 py-4 text-xs text-slate-200 backdrop-blur-md">
              <div className="space-y-1">
                <div>
                  Total : {totalExerciseMinutes} min ·{" "}
                  {selectedExercises.length} exercice
                  {selectedExercises.length > 1 ? "s" : ""}
                </div>
                {sessionDurationMinutes > 0 ? (
                  <div className="text-[10px] text-slate-400">
                    Durée séance : {sessionDurationMinutes} min
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setExerciseSelections({});
                    setExerciseOrder([]);
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Réinitialiser
                </button>
                <button
                  type="button"
                  onClick={handleValidateExercisePicker}
                  className="rounded-full bg-violet-600 px-4 py-1.5 text-[11px] font-semibold text-white transition hover:bg-violet-500 active:scale-95"
                >
                  Valider
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {trainingMode
          ? (() => {
            const exercises =
              exercisesByEvent[trainingMode.training.id] ?? [];
            const currentExercise = exercises[trainingMode.index] ?? null;
            const payload = normalizePayload(currentExercise?.animationData);
            const videoUrl = payload?.videoUrl ?? payload?.video_url ?? null;
            const previewUrl = getExercisePreviewUrl(
              currentExercise?.animationData,
            );
            const isAnimation =
              Boolean(currentExercise?.animationData) &&
              (currentExercise?.kind === "animation" ||
                !currentExercise?.kind);
            const isTest = currentExercise?.kind === "test";
            const testMeta = isTest
              ? ((payload?.metadata ?? payload?.meta ?? {}) as Record<string, any>)
              : {};
            const unit = testMeta?.testUnit ?? testMeta?.unit ?? "";
            const typeLabel =
              unit === "sec"
                ? "Temps"
                : unit === "reps"
                  ? "Répétition"
                  : unit === "note10"
                    ? "Note /10"
                    : "Score";
            const isTime = unit === "sec";
            const objectiveLabel = testMeta?.testTarget ?? "";
            const testExerciseKey =
              currentExercise?.sourceId ?? currentExercise?.id ?? "";
            const testResults = testExerciseKey
              ? trainingTestResults[testExerciseKey] ?? {}
              : {};
            const absentIds = attendanceByEvent[trainingMode.training.id] ?? [];
            const availablePlayers = players.filter(
              (player) => !absentIds.includes(player.id),
            );
            const selectedPlayers = availablePlayers.length
              ? availablePlayers
              : players;
            const resolvedActiveId =
              trainingTestActivePlayerId ?? selectedPlayers[0]?.id ?? null;
            const activeIndex = resolvedActiveId
              ? selectedPlayers.findIndex(
                  (player) => player.id === resolvedActiveId,
                )
              : -1;
            const activePlayer = selectedPlayers.find(
              (player) => player.id === resolvedActiveId,
            );
            const activeResult = resolvedActiveId
              ? testResults[resolvedActiveId]
              : undefined;
            const activeHistory = activeResult?.history ?? [];
            const maxAttempts = Math.min(
              5,
              Math.max(1, Number(testMeta?.testMaxAttempts ?? 1)),
            );
            const formatResultValue = (result?: { timeMs?: number; score?: string }) =>
              isTime
                ? result?.timeMs
                  ? formatTimerMs(result.timeMs)
                  : ""
                : result?.score ?? "";
            const parseTargetTimeMs = (value: string) => {
              const cleaned = value.replace(/[^\d:.]/g, "");
              if (!cleaned) return null;
              let minutes = 0;
              let seconds = 0;
              let cs = 0;
              if (cleaned.includes(":")) {
                const [minPart, secPartRaw] = cleaned.split(":");
                minutes = Number(minPart) || 0;
                const secPart = secPartRaw ?? "";
                if (secPart.includes(".")) {
                  const [secRaw, csRaw] = secPart.split(".");
                  seconds = Number(secRaw) || 0;
                  cs = Number((csRaw ?? "").padEnd(2, "0").slice(0, 2)) || 0;
                } else {
                  seconds = Number(secPart) || 0;
                }
              } else if (cleaned.includes(".")) {
                const [secRaw, csRaw] = cleaned.split(".");
                seconds = Number(secRaw) || 0;
                cs = Number((csRaw ?? "").padEnd(2, "0").slice(0, 2)) || 0;
              } else {
                seconds = Number(cleaned) || 0;
              }
              return (minutes * 60 + seconds) * 1000 + cs * 10;
            };
            const parseTargetScore = (value: string) => {
              const numeric = Number(value.replace(/[^\d.]/g, ""));
              return Number.isFinite(numeric) ? numeric : null;
            };
            const targetMs = isTime ? parseTargetTimeMs(objectiveLabel) : null;
            const targetScore = !isTime ? parseTargetScore(objectiveLabel) : null;
            const objectiveStatus = selectedPlayers.map((player) => {
              const result = testResults[player.id];
              const attempts = [
                ...(result?.history ?? []),
                ...(result?.timeMs || result?.score
                  ? [{ timeMs: result.timeMs, score: result.score }]
                  : []),
              ];
              if (!attempts.length || (!targetMs && !targetScore)) {
                return { player, success: false };
              }
              if (isTime && targetMs !== null) {
                const times = attempts
                  .map((entry) => entry.timeMs)
                  .filter((value): value is number => typeof value === "number");
                return { player, success: times.some((time) => time <= targetMs) };
              }
              if (!isTime && targetScore !== null) {
                const scores = attempts
                  .map((entry) => Number(entry.score))
                  .filter((value) => Number.isFinite(value));
                return { player, success: scores.some((score) => score >= targetScore) };
              }
              return { player, success: false };
            });
            const objectiveSuccess = objectiveStatus.filter((entry) => entry.success);
            const objectiveFail = objectiveStatus.filter((entry) => !entry.success);
            const hasObjectiveResults = Object.values(testResults).some(
              (result) =>
                (result?.history?.length ?? 0) > 0 ||
                typeof result?.timeMs === "number" ||
                Boolean(result?.score),
            );
            const activeValue = formatResultValue(activeResult);
            const activeAttemptCount =
              activeHistory.length + (activeValue ? 1 : 0);
            const canAddAttempt =
              activeAttemptCount < maxAttempts && Boolean(activeValue);
            const activeAttempts = [
              ...activeHistory.map((entry) => {
                const label = formatResultValue(entry);
                if (!label) return { label: "—", success: null };
                if (isTime) {
                  if (typeof entry.timeMs !== "number" || targetMs === null) {
                    return { label, success: null };
                  }
                  return { label, success: entry.timeMs <= targetMs };
                }
                const scoreValue = Number(entry.score);
                if (!Number.isFinite(scoreValue) || targetScore === null) {
                  return { label, success: null };
                }
                return { label, success: scoreValue >= targetScore };
              }),
            ];
            if (activeHistory.length || activeValue) {
              if (activeValue) {
                if (isTime && typeof activeResult?.timeMs === "number" && targetMs !== null) {
                  activeAttempts.push({
                    label: activeValue,
                    success: activeResult.timeMs <= targetMs,
                  });
                } else if (
                  !isTime &&
                  Number.isFinite(Number(activeResult?.score)) &&
                  targetScore !== null
                ) {
                  activeAttempts.push({
                    label: activeValue,
                    success: Number(activeResult?.score) >= targetScore,
                  });
                } else {
                  activeAttempts.push({ label: activeValue, success: null });
                }
              } else {
                activeAttempts.push({ label: "—", success: null });
              }
            }
            const attemptsToShow = activeAttempts.slice(0, maxAttempts);
            const rankingEntries = selectedPlayers
              .map((player) => {
                const result = testResults[player.id];
                const attempts = [
                  ...(result?.history ?? []),
                  ...(result?.timeMs || result?.score
                    ? [{ timeMs: result.timeMs, score: result.score }]
                    : []),
                ];
                if (!attempts.length) return null;
                if (isTime) {
                  const times = attempts
                    .map((entry) => entry.timeMs)
                    .filter((value): value is number => typeof value === "number");
                  if (!times.length) return null;
                  const bestValue = Math.min(...times);
                  return {
                    id: player.id,
                    name: `${player.first_name ?? ""} ${player.last_name ?? ""}`
                      .trim() || "Joueur",
                    bestValue,
                    bestLabel: formatTimerMs(bestValue),
                  };
                }
                const scores = attempts
                  .map((entry) => Number(entry.score))
                  .filter((value) => Number.isFinite(value));
                if (!scores.length) return null;
                const bestValue = Math.max(...scores);
                return {
                  id: player.id,
                  name: `${player.first_name ?? ""} ${player.last_name ?? ""}`
                    .trim() || "Joueur",
                  bestValue,
                  bestLabel: String(bestValue),
                };
              })
              .filter(
                (
                  entry,
                ): entry is {
                  id: string;
                  name: string;
                  bestValue: number;
                  bestLabel: string;
                } => Boolean(entry),
              )
              .sort((a, b) =>
                isTime ? a.bestValue - b.bestValue : b.bestValue - a.bestValue,
              );
            const toggleMediaPlayback = () => {
              if (videoUrl && trainingVideoRef.current) {
                const video = trainingVideoRef.current;
                if (video.paused) {
                  void video.play();
                  setTrainingRunning(true);
                } else {
                  video.pause();
                  setTrainingRunning(false);
                }
                return;
              }
              toggleTrainingRunning();
            };
            const currentDurationSeconds =
              Math.max(1, getExerciseMinutes(currentExercise)) * 60;
            const currentRemaining = Math.max(
              0,
              currentDurationSeconds - trainingMode.elapsed,
            );
            const remainingTotal =
              currentRemaining +
              exercises
                .slice(trainingMode.index + 1)
                .reduce(
                  (sum, exercise) =>
                    sum + Math.max(1, getExerciseMinutes(exercise)) * 60,
                  0,
                );
            const scheduledStart = Number.isFinite(
              Date.parse(trainingMode.training.start_at),
            )
              ? Date.parse(trainingMode.training.start_at)
              : null;
            const scheduledEnd = trainingMode.training.end_at
              ? Number.isFinite(Date.parse(trainingMode.training.end_at))
                ? Date.parse(trainingMode.training.end_at)
                : null
              : null;
            const scheduledDurationSeconds =
              scheduledStart !== null && scheduledEnd !== null
                ? Math.max(
                    0,
                    Math.floor((scheduledEnd - scheduledStart) / 1000),
                  )
                : 0;
            const totalSessionSeconds =
              scheduledDurationSeconds > 0
                ? scheduledDurationSeconds
                : exercises.reduce(
                    (sum, exercise) =>
                      sum + Math.max(1, getExerciseMinutes(exercise)) * 60,
                    0,
                  );
            const remainingSession = Math.max(
              0,
              Number.isFinite(totalSessionSeconds)
                ? totalSessionSeconds - trainingMode.sessionElapsed
                : 0,
            );
            const progress = Math.min(
              trainingMode.elapsed / currentDurationSeconds,
              1,
            );
            const recordTestAttempt = (
              playerId: string,
              attempt: { timeMs?: number; score?: string },
            ) => {
              if (!testExerciseKey) return;
              setTrainingTestResults((prev) => {
                const exerciseResults = prev[testExerciseKey] ?? {};
                const current = exerciseResults[playerId] ?? {};
                const history = [...(current.history ?? []), attempt];
                return {
                  ...prev,
                  [testExerciseKey]: {
                    ...exerciseResults,
                    [playerId]: {
                      ...current,
                      timeMs: undefined,
                      score: "",
                      history,
                    },
                  },
                };
              });
            };
            const goNextTestPlayer = () => {
              if (!selectedPlayers.length) return;
              if (
                activeIndex === -1 ||
                activeIndex >= selectedPlayers.length - 1
              ) {
                setTrainingTestActivePlayerId(selectedPlayers[0]?.id ?? null);
              } else {
                setTrainingTestActivePlayerId(
                  selectedPlayers[activeIndex + 1]?.id ?? null,
                );
              }
            };
            const goPrevTestPlayer = () => {
              if (!selectedPlayers.length) return;
              if (activeIndex <= 0) {
                setTrainingTestActivePlayerId(
                  selectedPlayers[selectedPlayers.length - 1]?.id ?? null,
                );
              } else {
                setTrainingTestActivePlayerId(
                  selectedPlayers[activeIndex - 1]?.id ?? null,
                );
              }
            };

            return (
              <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/85 px-4 backdrop-blur-sm">
                <div className="absolute inset-0" aria-hidden="true" />
                <div className="relative z-10 w-full max-w-4xl rounded-[28px] border border-white/10 bg-[#080b16] p-5 shadow-[0_26px_70px_rgba(0,0,0,0.6)]">
                  <button
                    type="button"
                    onClick={closeTrainingMode}
                    className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/60 text-lg text-white shadow-[0_0_14px_rgba(255,255,255,0.2)] transition hover:bg-white/10"
                    aria-label="Fermer"
                  >
                    ✕
                  </button>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-violet-300">
                        Mode Entraînement
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-slate-100">
                        Séance du{" "}
                        {formatFullDate(
                          new Date(trainingMode.training.start_at),
                        )}
                      </h3>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-5">
                    <div className="flex flex-col">
                      <div className="relative flex h-[300px] items-center justify-center overflow-hidden rounded-2xl border border-violet-400/40 bg-black/40 shadow-[0_0_24px_rgba(139,92,246,0.35)]">
                        {currentExercise?.category ? (
                          <span className="absolute left-3 top-3 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/90 shadow-[0_0_16px_rgba(255,255,255,0.2)]">
                            {currentExercise.category}
                          </span>
                        ) : null}
                        {isAnimation ? (
                          <ExerciseAnimatedPlayer
                            data={currentExercise.animationData as any}
                            autoPlay
                            showControls
                            showTimeline
                            showFullscreen
                            isPlaying={trainingMode.running}
                            onPlayingChange={setTrainingRunning}
                            className="h-full w-full"
                            canvasClassName="h-full w-full"
                          />
                        ) : videoUrl ? (
                          <video
                            ref={trainingVideoRef}
                            src={videoUrl as string}
                            className="h-full w-full object-contain"
                            controls
                            playsInline
                            onPlay={() => setTrainingRunning(true)}
                            onPause={() => setTrainingRunning(false)}
                            onClick={toggleMediaPlayback}
                          />
                        ) : previewUrl ? (
                          <img
                            src={previewUrl as string}
                            alt={currentExercise?.name ?? "Exercice"}
                            className="h-full w-full object-contain"
                            onClick={toggleMediaPlayback}
                          />
                        ) : isTest ? (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-slate-300">
                            <div className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                              Test / Mesure
                            </div>
                            <div className="text-base font-semibold text-slate-100">
                              {currentExercise?.name ?? "Exercice"}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-slate-400">
                            Aucun exercice
                          </div>
                        )}
                        {isTest ? (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <div className="pointer-events-auto relative w-[min(520px,94%)] rounded-2xl border border-white/10 bg-[#0b0f1a]/90 p-4 text-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur">
                              <div className="space-y-3">
                                {objectiveLabel ? (
                                  <div className="absolute bottom-2 left-2 z-20">
                                    <div className="flex items-center gap-2 text-[10px]">
                                      <svg
                                        viewBox="0 0 24 24"
                                        className={[
                                          "h-3.5 w-3.5",
                                          hasObjectiveResults
                                            ? "text-emerald-400"
                                            : "text-slate-300",
                                        ].join(" ")}
                                        fill="none"
                                        strokeWidth="1.6"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <circle
                                          cx="12"
                                          cy="12"
                                          r="7.5"
                                          stroke="rgb(248, 113, 113)"
                                        />
                                        <circle
                                          cx="12"
                                          cy="12"
                                          r="3"
                                          stroke="rgb(248, 113, 113)"
                                        />
                                        <path
                                          d="M12 4v-2M12 22v-2M4 12H2M22 12h-2"
                                          stroke="rgb(248, 113, 113)"
                                        />
                                        <path d="M16 8l4-4" stroke="rgb(250, 204, 21)" />
                                        <path d="M19 4h1v1" stroke="rgb(250, 204, 21)" />
                                      </svg>
                                      <span className="font-semibold text-white">
                                        {objectiveLabel}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setTrainingTestShowObjective(true)
                                        }
                                        className={[
                                          "ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border transition",
                                          hasObjectiveResults
                                            ? "border-violet-400/60 bg-violet-500/25 text-violet-300 hover:bg-violet-500/35"
                                            : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                                        ].join(" ")}
                                        aria-label="Voir les résultats"
                                        title="Voir les résultats"
                                        ref={trainingTestObjectiveButtonRef}
                                      >
                                        <svg
                                          viewBox="0 0 24 24"
                                          className="h-3 w-3"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="1.6"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        >
                                          <rect x="3" y="5" width="18" height="12" rx="2" />
                                          <path d="M8 19h8" />
                                        </svg>
                                      </button>
                                    </div>
                                    {trainingTestShowObjective ? (
                                      <div className="absolute bottom-full left-0 mb-2 w-64 rounded-2xl border border-white/10 bg-[#0b1020] p-3 text-xs text-slate-200 shadow-[0_16px_36px_rgba(0,0,0,0.45)]">
                                        <div ref={trainingTestObjectivePanelRef}>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setTrainingTestShowObjective(false)
                                            }
                                            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[12px] text-slate-200 transition hover:bg-white/10"
                                            aria-label="Fermer"
                                          >
                                            ×
                                          </button>
                                          <div className="text-[9px] uppercase tracking-[0.3em] text-slate-400">
                                            Objectif réussi
                                          </div>
                                          <div className="mt-2 flex flex-wrap gap-1.5">
                                            {objectiveSuccess.length ? (
                                              objectiveSuccess.map((entry) => (
                                                <span
                                                  key={`ok-${entry.player.id}`}
                                                  className="rounded-full border border-emerald-300/40 bg-emerald-400/15 px-2 py-0.5 text-[10px] text-emerald-200"
                                                >
                                                  {`${entry.player.first_name ?? ""} ${
                                                    entry.player.last_name ?? ""
                                                  }`.trim() || "Joueur"}
                                                </span>
                                              ))
                                            ) : (
                                              <span className="text-[10px] text-slate-500">
                                                Aucun
                                              </span>
                                            )}
                                          </div>
                                          <div className="mt-3 text-[9px] uppercase tracking-[0.3em] text-slate-400">
                                            Objectif non réussi
                                          </div>
                                          <div className="mt-2 flex flex-wrap gap-1.5">
                                            {objectiveFail.length ? (
                                              objectiveFail.map((entry) => (
                                                <span
                                                  key={`ko-${entry.player.id}`}
                                                  className="rounded-full border border-rose-300/40 bg-rose-400/10 px-2 py-0.5 text-[10px] text-rose-200"
                                                >
                                                  {`${entry.player.first_name ?? ""} ${
                                                    entry.player.last_name ?? ""
                                                  }`.trim() || "Joueur"}
                                                </span>
                                              ))
                                            ) : (
                                              <span className="text-[10px] text-slate-500">
                                                Aucun
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <div className="text-[8px] uppercase tracking-[0.22em] text-slate-300">
                                      {typeLabel}
                                    </div>
                                    <h3 className="mt-1 text-lg font-semibold text-white">
                                      {currentExercise?.name ?? "Exercice"}
                                    </h3>
                                  </div>
                                </div>
                                <div className="absolute bottom-2 right-2 z-20 flex items-center gap-2">
                                  {trainingTestUndoLabel ? (
                                    <button
                                      type="button"
                                      onClick={handleTrainingTestUndo}
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[12px] text-white/90 transition hover:bg-white/10"
                                      aria-label="Annuler"
                                      title="Annuler"
                                    >
                                      ↺
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setTrainingTestResetMenuOpen((prev) => !prev);
                                        setTrainingTestResetConfirm(null);
                                      }}
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[12px] text-white/80 transition hover:bg-white/10"
                                      aria-label="Réglages"
                                      title="Réglages"
                                      ref={trainingTestResetButtonRef}
                                    >
                                      ⋯
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setTrainingTestShowRanking((prev) => !prev)
                                    }
                                    className="p-0 text-white transition hover:text-violet-100"
                                    aria-label="Classement"
                                    title="Classement"
                                    ref={trainingTestRankingButtonRef}
                                  >
                                    <svg
                                      viewBox="0 0 24 24"
                                      className="h-7 w-7"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="0.4"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M3 20h18" />
                                      <rect
                                        x="4"
                                        y="10.5"
                                        width="5"
                                        height="8.5"
                                        rx="1.2"
                                      />
                                      <rect
                                        x="9.5"
                                        y="5.5"
                                        width="5"
                                        height="13.5"
                                        rx="1.2"
                                      />
                                      <rect
                                        x="15"
                                        y="8.5"
                                        width="5"
                                        height="10.5"
                                        rx="1.2"
                                      />
                                    </svg>
                                  </button>
                                  {trainingTestResetMenuOpen ? (
                                    <div
                                      ref={trainingTestResetMenuRef}
                                      className="absolute bottom-full right-8 mb-2 w-56 rounded-xl border border-white/10 bg-[#0b1020] p-3 text-xs text-slate-200 shadow-[0_16px_36px_rgba(0,0,0,0.45)]"
                                    >
                                      {trainingTestResetConfirm ? (
                                        <div>
                                          <div className="text-[9px] uppercase tracking-[0.3em] text-slate-400">
                                            Confirmation
                                          </div>
                                          <div className="mt-2 text-[11px] text-slate-200">
                                            {trainingTestResetConfirm === "current"
                                              ? "Réinitialiser l’essai en cours ?"
                                              : `Réinitialiser tous les essais de ${
                                                  activePlayer
                                                    ? `${activePlayer.first_name ?? ""} ${
                                                        activePlayer.last_name ?? ""
                                                      }`.trim() || "Joueur"
                                                    : "Joueur"
                                                } ?`}
                                          </div>
                                          <div className="mt-3 flex items-center justify-end gap-2">
                                            <button
                                              type="button"
                                              onClick={() => setTrainingTestResetConfirm(null)}
                                              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-200 transition hover:bg-white/10"
                                            >
                                              Annuler
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (!resolvedActiveId || !testExerciseKey)
                                                  return;
                                                if (trainingTestResetConfirm === "current") {
                                                  setTrainingTestElapsed(0);
                                                  setTrainingTestRunning(false);
                                                  trainingTestStartRef.current = null;
                                                  setTrainingTestResults((prev) => ({
                                                    ...prev,
                                                    [testExerciseKey]: {
                                                      ...(prev[testExerciseKey] ?? {}),
                                                      [resolvedActiveId]: {
                                                        ...(prev[testExerciseKey] ?? {})[
                                                          resolvedActiveId
                                                        ],
                                                        timeMs: undefined,
                                                        score: "",
                                                      },
                                                    },
                                                  }));
                                                } else {
                                                  setTrainingTestElapsed(0);
                                                  setTrainingTestRunning(false);
                                                  trainingTestStartRef.current = null;
                                                  setTrainingTestResults((prev) => ({
                                                    ...prev,
                                                    [testExerciseKey]: {
                                                      ...(prev[testExerciseKey] ?? {}),
                                                      [resolvedActiveId]: {
                                                        history: [],
                                                        timeMs: undefined,
                                                        score: "",
                                                      },
                                                    },
                                                  }));
                                                }
                                                setTrainingTestResetConfirm(null);
                                                setTrainingTestResetMenuOpen(false);
                                              }}
                                              className="rounded-full bg-rose-500/80 px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-rose-500"
                                            >
                                              Réinitialiser
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="space-y-1">
                                          <div className="text-[9px] uppercase tracking-[0.3em] text-slate-400">
                                            Réglages
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setTrainingTestResetConfirm("current")
                                            }
                                            className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-left text-[11px] text-slate-200 transition hover:bg-white/10"
                                          >
                                            Réinitialiser l’essai en cours
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setTrainingTestResetConfirm("player")
                                            }
                                            className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-left text-[11px] text-slate-200 transition hover:bg-white/10"
                                          >
                                            Réinitialiser le joueur
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ) : null}
                                  {trainingTestShowRanking ? (
                                    <div
                                      ref={trainingTestRankingPanelRef}
                                      className="absolute bottom-full right-0 mb-2 w-56 rounded-xl border border-white/10 bg-[#0b1020] p-3 text-xs text-slate-200 shadow-[0_16px_36px_rgba(0,0,0,0.45)]"
                                    >
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setTrainingTestShowRanking(false)
                                        }
                                        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[12px] text-slate-200 transition hover:bg-white/10"
                                        aria-label="Fermer"
                                      >
                                        ×
                                      </button>
                                      <div className="text-[9px] uppercase tracking-[0.3em] text-slate-400">
                                        Classement
                                      </div>
                                      {rankingEntries.length ? (
                                        <div className="mt-2 space-y-1.5">
                                          {rankingEntries.map((entry, index) => (
                                            <div
                                              key={entry.id}
                                              className="flex items-center justify-between text-[11px]"
                                            >
                                              <span className="text-slate-300">
                                                {index + 1}. {entry.name}
                                              </span>
                                              <span className="font-semibold text-white">
                                                {entry.bestLabel}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="mt-2 text-[11px] text-slate-400">
                                          Aucun résultat.
                                        </div>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="p-0">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={goPrevTestPlayer}
                                      className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-black/40 text-[12px] text-white/80 transition hover:bg-white/10"
                                      aria-label="Joueur précédent"
                                    >
                                      ◀
                                    </button>
                                    <div className="flex-1">
                                      <div className="flex gap-2 overflow-x-auto pb-1">
                                        {selectedPlayers.length === 0 ? (
                                          <div className="text-[11px] text-slate-400">
                                            Aucun joueur.
                                          </div>
                                        ) : (
                                          selectedPlayers.map((player) => {
                                            const name = `${player.first_name ?? ""} ${
                                              player.last_name ?? ""
                                            }`.trim();
                                            const isActive = resolvedActiveId === player.id;
                                            const result = testResults[player.id];
                                            const displayValue = formatResultValue(result);
                                            const isDone = Boolean(displayValue);
                                            return (
                                              <button
                                                key={player.id}
                                                type="button"
                                                onClick={() => {
                                                  setTrainingTestActivePlayerId(player.id);
                                                  setTrainingTestRunning(false);
                                                  trainingTestStartRef.current = null;
                                                  setTrainingTestElapsed(0);
                                                }}
                                                className={[
                                                  "min-w-[90px] rounded-full border px-2 py-1 text-center text-[10px] leading-none transition flex items-center justify-center overflow-visible",
                                                  isActive
                                                    ? "border-violet-400/60 bg-violet-500/15 text-white shadow-[inset_0_0_10px_rgba(139,92,246,0.45)]"
                                                    : "border-white/10 bg-slate-900/50 text-slate-300 hover:bg-white/10",
                                                ].join(" ")}
                                              >
                                                <div className="relative flex w-full items-center justify-center">
                                                  <span className="block w-full text-center font-semibold text-slate-100">
                                                    {name || "Joueur"}
                                                  </span>
                                                  {isDone && !isActive ? (
                                                    <span className="absolute -right-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.9)]" />
                                                  ) : null}
                                                </div>
                                                <div className="mt-0.5 text-[8px] text-slate-400">
                                                  &nbsp;
                                                </div>
                                              </button>
                                            );
                                          })
                                        )}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={goNextTestPlayer}
                                      className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-black/40 text-[12px] text-white/80 transition hover:bg-white/10"
                                      aria-label="Joueur suivant"
                                    >
                                      ▶
                                    </button>
                                  </div>
                                </div>
                                <div className="flex items-start gap-3">
                                  <div className="text-[10px] text-slate-300">
                                    <div>
                                      <span className="mr-2 text-[8px] uppercase tracking-[0.2em] text-slate-500">
                                        Joueur
                                      </span>
                                      <span className="font-semibold text-white">
                                        {activePlayer
                                          ? `${activePlayer.first_name ?? ""} ${
                                              activePlayer.last_name ?? ""
                                            }`.trim() || "Joueur"
                                          : "Joueur"}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex-1 min-w-0 text-[10px] text-slate-200">
                                    {attemptsToShow.length ? (
                                      <div className="flex w-full flex-col items-start gap-0.5">
                                        {attemptsToShow.map((attempt, index) => {
                                          const isLast =
                                            index === attemptsToShow.length - 1;
                                          const isHistoryEntry =
                                            index < activeHistory.length;
                                          const attemptClass =
                                            attempt.success === null
                                              ? "text-white"
                                              : attempt.success
                                                ? "text-emerald-300"
                                                : "text-rose-300";
                                          return (
                                            <div
                                              key={`${resolvedActiveId ?? "player"}-${index}`}
                                              className="grid w-full grid-cols-[64px_1fr_auto] items-center gap-2"
                                            >
                                              <span className="text-[8px] uppercase tracking-[0.2em] text-slate-500">
                                                Essai {index + 1}/{maxAttempts}
                                              </span>
                                              <div className="flex items-center gap-2">
                                                <span
                                                  className={[
                                                    "flex items-center gap-1 font-semibold",
                                                    attemptClass,
                                                  ].join(" ")}
                                                >
                                                  {!isTime ? (
                                                    <svg
                                                      viewBox="0 0 24 24"
                                                      className="h-3.5 w-3.5 text-fuchsia-200"
                                                      fill="none"
                                                      stroke="currentColor"
                                                      strokeWidth="1.6"
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                    >
                                                      <circle cx="12" cy="12" r="7.5" />
                                                      <circle cx="12" cy="12" r="3" />
                                                      <path d="M12 4v-2M12 22v-2M4 12H2M22 12h-2" />
                                                    </svg>
                                                  ) : null}
                                                  {attempt.label}
                                                </span>
                                                {isLast && canAddAttempt ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      if (!resolvedActiveId) return;
                                                      const currentValue =
                                                        formatResultValue(activeResult);
                                                      if (!currentValue) return;
                                                      const currentCount =
                                                        (activeResult?.history?.length ?? 0) +
                                                        (currentValue ? 1 : 0);
                                                      if (currentCount >= maxAttempts) return;
                                                      setTrainingTestRunning(false);
                                                      trainingTestStartRef.current = null;
                                                      setTrainingTestElapsed(0);
                                                      recordTestAttempt(resolvedActiveId, {
                                                        timeMs: activeResult?.timeMs,
                                                        score: activeResult?.score,
                                                      });
                                                    }}
                                                    className="flex h-5 w-5 items-center justify-center rounded-full border border-fuchsia-300/50 bg-fuchsia-300/20 text-[10px] text-fuchsia-100 transition hover:bg-fuchsia-300/30"
                                                    aria-label="Nouvel essai"
                                                    title="Nouvel essai"
                                                  >
                                                    +
                                                  </button>
                                                ) : null}
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  if (!resolvedActiveId) return;
                                                  setTrainingTestResults((prev) => {
                                                    if (!testExerciseKey) return prev;
                                                    const exerciseResults = prev[testExerciseKey] ?? {};
                                                    const current = exerciseResults[resolvedActiveId] ?? {};
                                                    const history = [...(current.history ?? [])];
                                                    if (isHistoryEntry) {
                                                      history.splice(index, 1);
                                                    } else {
                                                      delete current.timeMs;
                                                      delete current.score;
                                                    }
                                                    return {
                                                      ...prev,
                                                      [testExerciseKey]: {
                                                        ...exerciseResults,
                                                        [resolvedActiveId]: {
                                                          ...current,
                                                          history,
                                                        },
                                                      },
                                                    };
                                                  });
                                                }}
                                                className="flex h-4 w-4 items-center justify-center justify-self-end rounded-full text-[10px] text-white/40 transition hover:text-rose-200"
                                                aria-label="Supprimer l'essai"
                                                title="Supprimer"
                                              >
                                                🗑
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <div className="grid grid-cols-[64px_1fr] items-center gap-2 text-[10px] text-slate-400">
                                        <span className="text-[8px] uppercase tracking-[0.2em] text-slate-500">
                                          Essai 1/{maxAttempts}
                                        </span>
                                        <div className="flex items-center gap-2">
                                          <span>—</span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (!resolvedActiveId) return;
                                              const currentValue =
                                                formatResultValue(activeResult);
                                              if (!currentValue) return;
                                              const currentCount =
                                                (activeResult?.history?.length ?? 0) +
                                                (currentValue ? 1 : 0);
                                              if (currentCount >= maxAttempts) return;
                                              setTrainingTestRunning(false);
                                              trainingTestStartRef.current = null;
                                              setTrainingTestElapsed(0);
                                              recordTestAttempt(resolvedActiveId, {
                                                timeMs: activeResult?.timeMs,
                                                score: activeResult?.score,
                                              });
                                            }}
                                            className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[10px] text-white/80 transition hover:bg-white/20 disabled:opacity-40"
                                            disabled={!canAddAttempt}
                                            aria-label="Nouvel essai"
                                            title="Nouvel essai"
                                          >
                                            +
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex justify-center">
                                  <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                                    {isTime ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!resolvedActiveId) return;
                                            const currentHistoryCount =
                                              activeResult?.history?.length ?? 0;
                                            if (trainingTestRunning) {
                                              const prevResult =
                                                resolvedActiveId &&
                                                testExerciseKey
                                                  ? testResults[resolvedActiveId]
                                                  : undefined;
                                              const prevHistory = prevResult?.history
                                                ? [...prevResult.history]
                                                : [];
                                              const prevTime = prevResult?.timeMs;
                                              const prevScore = prevResult?.score ?? "";
                                              setTrainingTestRunning(false);
                                              trainingTestStartRef.current = null;
                                              if (currentHistoryCount >= maxAttempts) {
                                                setTrainingTestElapsed(0);
                                                return;
                                              }
                                              const attemptTime = trainingTestElapsed;
                                              setTrainingTestElapsed(0);
                                              recordTestAttempt(resolvedActiveId, {
                                                timeMs: attemptTime,
                                              });
                                              triggerTrainingTestUndo("Temps enregistré", () => {
                                                if (!resolvedActiveId || !testExerciseKey) return;
                                                setTrainingTestResults((prev) => {
                                                  const exerciseResults =
                                                    prev[testExerciseKey] ?? {};
                                                  if (!prevResult) {
                                                    const nextExercise = {
                                                      ...exerciseResults,
                                                    };
                                                    delete nextExercise[resolvedActiveId];
                                                    return {
                                                      ...prev,
                                                      [testExerciseKey]: nextExercise,
                                                    };
                                                  }
                                                  return {
                                                    ...prev,
                                                    [testExerciseKey]: {
                                                      ...exerciseResults,
                                                      [resolvedActiveId]: {
                                                        ...prevResult,
                                                        history: prevHistory,
                                                        timeMs: prevTime,
                                                        score: prevScore,
                                                      },
                                                    },
                                                  };
                                                });
                                              });
                                              const nextCount = currentHistoryCount + 1;
                                              if (
                                                nextCount >= maxAttempts &&
                                                selectedPlayers.length
                                              ) {
                                                const nextIndex =
                                                  activeIndex === -1
                                                    ? 0
                                                    : (activeIndex + 1) %
                                                      selectedPlayers.length;
                                                setTrainingTestActivePlayerId(
                                                  selectedPlayers[nextIndex]?.id ?? null,
                                                );
                                              }
                                            } else {
                                              if (currentHistoryCount >= maxAttempts) return;
                                              setTrainingTestRunning(true);
                                            }
                                          }}
                                          className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-white shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition hover:bg-violet-500"
                                          aria-label={
                                            trainingTestRunning ? "Stop" : "Démarrer"
                                          }
                                        >
                                          {trainingTestRunning ? "■" : "▶"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!resolvedActiveId) return;
                                            if (trainingTestRunning) {
                                              setTrainingTestRunning(false);
                                            } else {
                                              setTrainingTestRunning(true);
                                            }
                                          }}
                                          className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[10px] text-white/80 transition hover:bg-white/20"
                                          aria-label="Pause"
                                        >
                                          ❚❚
                                        </button>
                                        <div className="min-w-[104px] rounded-2xl bg-white/5 px-2 py-1 text-center text-[14px] font-semibold text-white">
                                          {formatTimerMs(trainingTestElapsed)}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!resolvedActiveId) return;
                                            setTrainingTestElapsed(0);
                                            setTrainingTestRunning(false);
                                            trainingTestStartRef.current = null;
                                            setTrainingTestResults((prev) => {
                                              if (!testExerciseKey) return prev;
                                              const exerciseResults = prev[testExerciseKey] ?? {};
                                              const current = exerciseResults[resolvedActiveId];
                                              if (!current) return prev;
                                              const nextExercise = { ...exerciseResults };
                                              nextExercise[resolvedActiveId] = {
                                                ...current,
                                              };
                                              delete nextExercise[resolvedActiveId].timeMs;
                                              return {
                                                ...prev,
                                                [testExerciseKey]: nextExercise,
                                              };
                                            });
                                          }}
                                          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/80 transition hover:bg-white/15"
                                          aria-label="Revenir au début"
                                        >
                                          ↺
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (trainingTestRunning) {
                                              setTrainingTestRunning(false);
                                              setTrainingTestElapsed(0);
                                              trainingTestStartRef.current = null;
                                            } else {
                                              setTrainingTestRunning(true);
                                            }
                                          }}
                                          className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-white shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition hover:bg-violet-500"
                                          aria-label={
                                            trainingTestRunning ? "Pause" : "Démarrer"
                                          }
                                        >
                                          {trainingTestRunning ? "❚❚" : "▶"}
                                        </button>
                                        <div className="min-w-[104px] rounded-2xl bg-white/5 px-2 py-1 text-center text-[14px] font-semibold text-white">
                                          {formatTimerMs(trainingTestElapsed)}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setTrainingTestElapsed(0);
                                            setTrainingTestRunning(false);
                                            trainingTestStartRef.current = null;
                                          }}
                                          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/80 transition hover:bg-white/15"
                                          aria-label="Revenir au début"
                                        >
                                          ↺
                                        </button>
                                        <input
                                          value={
                                            resolvedActiveId
                                              ? testResults[resolvedActiveId]?.score ?? ""
                                              : ""
                                          }
                                          onChange={(event) => {
                                            if (!resolvedActiveId) return;
                                            const nextValue = event.target.value;
                                            if (!testExerciseKey) return;
                                            setTrainingTestResults((prev) => {
                                              const exerciseResults = prev[testExerciseKey] ?? {};
                                              const current = exerciseResults[resolvedActiveId] ?? {};
                                              return {
                                                ...prev,
                                                [testExerciseKey]: {
                                                  ...exerciseResults,
                                                  [resolvedActiveId]: {
                                                    ...current,
                                                    score: nextValue,
                                                  },
                                                },
                                              };
                                            });
                                          }}
                                          placeholder="0"
                                          className="h-7 w-20 rounded-full border border-white/10 bg-white/10 px-3 text-center text-[12px] text-white placeholder:text-slate-500 focus:border-violet-400/60 focus:outline-none"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!resolvedActiveId || !testExerciseKey) return;
                                            const previousScore =
                                              testResults[resolvedActiveId]?.score ?? "";
                                            setTrainingTestResults((prev) => {
                                              const exerciseResults = prev[testExerciseKey] ?? {};
                                              const current = Number(
                                                exerciseResults[resolvedActiveId]?.score ?? 0,
                                              );
                                              return {
                                                ...prev,
                                                [testExerciseKey]: {
                                                  ...exerciseResults,
                                                  [resolvedActiveId]: {
                                                    ...exerciseResults[resolvedActiveId],
                                                    score: String(current + 1),
                                                  },
                                                },
                                              };
                                            });
                                            triggerTrainingTestUndo("Score +1", () => {
                                              setTrainingTestResults((prev) => ({
                                                ...prev,
                                                [testExerciseKey]: {
                                                  ...(prev[testExerciseKey] ?? {}),
                                                  [resolvedActiveId]: {
                                                    ...(prev[testExerciseKey] ?? {})[
                                                      resolvedActiveId
                                                    ],
                                                    score: previousScore,
                                                  },
                                                },
                                              }));
                                            });
                                          }}
                                          className="flex h-7 w-7 items-center justify-center rounded-full border border-fuchsia-300/50 bg-fuchsia-300/20 text-[12px] text-fuchsia-100 transition hover:bg-fuchsia-300/30"
                                          aria-label="Ajouter 1"
                                          title="Ajouter 1"
                                        >
                                          +
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(240px,1fr)_auto]">
                        <div className="flex items-center gap-2">
                          <div className="inline-flex h-3 w-fit items-center rounded-md border border-purple-200/60 bg-[#D6C3FF] px-1 text-[8px] font-semibold leading-none text-slate-900 shadow-[0_0_10px_rgba(214,195,255,0.5)]">
                            Exercice :{" "}
                            {exercises.length ? trainingMode.index + 1 : 0}/
                            {exercises.length}
                          </div>
                          <button
                            type="button"
                            onClick={goToPrevExercise}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10"
                            aria-label="Exercice précédent"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={goToNextExercise}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10"
                            aria-label="Exercice suivant"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="relative rounded-full border border-white/10 bg-white/5 px-4 text-[10px] text-slate-300">
                          <div className="flex h-5 min-w-[240px] items-center gap-3 overflow-visible whitespace-nowrap">
                            <span>
                              Chrono{" "}
                              <span className="font-semibold text-white">
                                {formatTimer(currentRemaining)}
                              </span>
                            </span>
                            <div className="h-1 min-w-[160px] flex-1 overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full bg-violet-500"
                                style={{ width: `${progress * 100}%` }}
                              />
                            </div>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() =>
                                  setChronoInfoOpen((prev) => !prev)
                                }
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] font-semibold text-white/80 transition hover:bg-white/10"
                                aria-label="Infos chrono"
                              >
                                i
                              </button>
                              {chronoInfoOpen ? (
                                <div className="absolute left-1/2 bottom-full z-20 mb-2 w-[230px] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#0b0f1a]/90 p-2.5 text-[11px] text-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
                                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                    Notes
                                  </div>
                                  <textarea
                                    value={currentExercise?.notes ?? ""}
                                    onChange={(event) =>
                                      updateCurrentExerciseNotes(
                                        event.target.value,
                                      )
                                    }
                                    placeholder="Ajouter une note"
                                    className="mt-2 h-16 w-full resize-none rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
                                  />
                                  <div className="mt-3 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                    Fin entraînement
                                  </div>
                                  <div className="mt-1 text-[11px] text-slate-100">
                                    Dans {formatRemainingLabel(remainingSession)}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={toggleTrainingRunning}
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10"
                              aria-label={
                                trainingMode.running
                                  ? "Mettre en pause"
                                  : "Démarrer"
                              }
                            >
                              {trainingMode.running ? (
                                <Pause className="h-3 w-3" />
                              ) : (
                                <Play className="h-3 w-3" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={restartCurrentExercise}
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10"
                              aria-label="Repartir au début"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-start sm:justify-end" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()
        : null}
      

      {expandedExercise ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setExpandedExercise(null)}
            aria-label="Fermer"
          />
          <div className="relative z-10 w-full max-w-3xl rounded-[28px] border border-white/10 bg-[#0b0f1a] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
            <button
              type="button"
              onClick={() => setExpandedExercise(null)}
              className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 transition hover:bg-white/10"
            >
              Fermer
            </button>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Exercice
              </p>
              <h3 className="mt-2 text-xl font-semibold text-slate-100">
                {expandedExercise.name}
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                {expandedExercise.duration}
              </p>
              <p className="mt-2 text-[11px] text-slate-300">
                Info :{" "}
                <span className="text-slate-100">
                  {getExerciseInfoLine(expandedExercise)}
                </span>
              </p>
            </div>
            <div className="mt-6 flex h-[360px] items-center justify-center overflow-hidden rounded-2xl border border-violet-400/40 bg-black/40 text-sm text-slate-400 shadow-[0_0_24px_rgba(139,92,246,0.35)]">
              {expandedExercise.kind === "animation" &&
              expandedExercise.animationData ? (
                <ExerciseAnimatedPlayer
                  data={expandedExercise.animationData as any}
                  autoPlay
                  showControls
                  showTimeline
                  showFullscreen
                  className="h-full w-full"
                  canvasClassName="h-full w-full"
                />
              ) : expandedExercise.kind === "test" ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-slate-300">
                  <div className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                    Test / Mesure
                  </div>
                  <div className="text-base font-semibold text-slate-100">
                    {expandedExercise.name}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Résultats joueurs bientôt disponibles.
                  </div>
                </div>
              ) : getExercisePreviewUrl(expandedExercise.animationData) ? (
                <img
                  src={getExercisePreviewUrl(expandedExercise.animationData) as string}
                  alt={expandedExercise.name}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="text-sm text-slate-400">
                  Aperçu {expandedExercise.kind ?? "exercice"}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {expandedTraining ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setExpandedTraining(null)}
            aria-label="Fermer"
          />
          <div className="relative z-10 w-full max-w-4xl rounded-[28px] border border-white/10 bg-[#0b0f1a] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
            <button
              type="button"
              onClick={() => setExpandedTraining(null)}
              className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 transition hover:bg-white/10"
            >
              Fermer
            </button>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Séance
              </p>
              <h3 className="mt-2 text-xl font-semibold text-slate-100">
                Séance du {formatFullDate(new Date(expandedTraining.start_at))}
              </h3>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1 text-slate-300">
                <Users className="h-3 w-3 text-indigo-300 drop-shadow-[0_0_6px_rgba(129,140,248,0.6)]" />
                Absents :{" "}
                {attendanceByEvent[expandedTraining.id]?.length ?? 0}/
                {totalPlayers}
              </span>
              <span className="inline-flex items-center gap-1 text-slate-300">
                <Puzzle className="h-3 w-3 text-amber-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.7)]" />
                Exercices :{" "}
                {exercisesByEvent[expandedTraining.id]?.length ?? 0}
              </span>
            </div>
            <div className="mt-6">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Exercices
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {(exercisesByEvent[expandedTraining.id] ?? []).map(
                  (exercise, index) => {
                    const previewUrl = getExercisePreviewUrl(
                      exercise.animationData,
                    );
                    return (
                      <button
                        key={exercise.id}
                        type="button"
                        onClick={() => setExpandedExercise(exercise)}
                        className="flex w-[180px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-left transition hover:border-white/20"
                      >
                        <div className="h-24 w-full overflow-hidden">
                          {previewUrl ? (
                            <img
                              src={previewUrl}
                              alt={exercise.name}
                              className="h-full w-full object-cover brightness-115 contrast-110 saturate-110"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                              {exercise.name.slice(0, 6)}
                            </div>
                          )}
                        </div>
                        <div className="px-3 py-2">
                          <div className="text-xs font-semibold text-slate-100">
                            {index + 1}. {exercise.name}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">
                            {exercise.minutes ?? exercise.duration}
                          </div>
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {presenceOpen && presenceTraining ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[2px]"
          onClick={closePresence}
          role="presentation"
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-white/12 bg-black/30 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-[32px] backdrop-saturate-200 md:p-6"
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-300">
                  Absences
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-100">
                  {presenceTraining.title ?? "Séance"}
                </h3>
                <span className="mt-2 block h-px w-16 bg-violet-400/70" />
              </div>
              <button
                type="button"
                onClick={closePresence}
                className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs text-slate-200 transition hover:bg-white/10"
              >
                Fermer
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                  Ajouter un absent
                </label>
                <div className="relative mt-2">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-60 blur-[12px]"
                  />
                  <select
                    value={absencePicker}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) return;
                      setPresenceDraft((prev) => {
                        const next = new Set(prev);
                        next.add(value);
                        return next;
                      });
                      setAbsencePicker("");
                    }}
                    className="relative z-10 w-full rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-2 text-xs text-[#f2f0ff] shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus:ring-1 focus:ring-violet-400/50 focus:animate-[friendlyBreath_2.8s_ease-in-out_infinite] focus:bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)]"
                  >
                    <option value="">Choisir un joueur…</option>
                    {players
                      .filter((player) => !presenceDraft.has(player.id))
                      .map((player) => {
                        const label =
                          `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() ||
                          "Joueur";
                        return (
                          <option key={player.id} value={player.id}>
                            {label}
                          </option>
                        );
                      })}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {Array.from(presenceDraft).map((playerId) => {
                  const player = players.find((p) => p.id === playerId);
                  const label =
                    `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim() ||
                    "Joueur";
                  return (
                    <span
                      key={playerId}
                      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-200"
                    >
                      {label}
                      <button
                        type="button"
                        onClick={() => togglePresence(playerId)}
                        className="text-white/60 transition hover:text-rose-300"
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPresenceDraft(new Set(players.map((p) => p.id)))}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Tout le monde absent
              </button>
              <button
                type="button"
                onClick={() => setPresenceDraft(new Set())}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Personne absent
              </button>
              <button
                type="button"
                onClick={() => setPresenceDraft(new Set(presenceInitial))}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Réinitialiser
              </button>
            </div>

            <div className="sticky bottom-0 mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-slate-200">
              <span>
                Absents : {presenceDraft.size} / {totalPlayers}
              </span>
              <button
                type="button"
                onClick={handleSavePresence}
                disabled={presenceSaving}
                className="rounded-full bg-violet-600 px-4 py-2 text-xs font-medium text-white shadow-[0_8px_22px_rgba(0,0,0,0.35)] transition hover:bg-violet-500 active:scale-95 disabled:opacity-50"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {exerciseOpen && exerciseTraining ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[2px]"
          onClick={closeExercise}
          role="presentation"
        >
          <div
            className="relative w-full max-w-xl rounded-3xl border border-white/12 bg-black/30 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-[32px] backdrop-saturate-200 md:p-6"
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-300">
                  Ajouter un exercice
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-100">
                  {exerciseTraining.title ?? "Séance"}
                </h3>
                <span className="mt-2 block h-px w-16 bg-violet-400/70" />
              </div>
              <button
                type="button"
                onClick={closeExercise}
                className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs text-slate-200 transition hover:bg-white/10"
              >
                Fermer
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                  Nom exercice
                </label>
                <input
                  type="text"
                  value={exerciseName}
                  onChange={(event) => setExerciseName(event.target.value)}
                  className="mt-2 w-full rounded-full border border-white/20 bg-white/5 px-3 py-2 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                  Durée
                </label>
                <input
                  type="text"
                  value={exerciseDuration}
                  onChange={(event) => setExerciseDuration(event.target.value)}
                  placeholder="15 min"
                  className="mt-2 w-full rounded-full border border-white/20 bg-white/5 px-3 py-2 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                  Notes
                </label>
                <textarea
                  value={exerciseNotes}
                  onChange={(event) => setExerciseNotes(event.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-2xl border border-white/20 bg-white/5 px-3 py-2 text-xs text-slate-100"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end">
              <button
                type="button"
                onClick={handleAddExercise}
                className="rounded-full bg-violet-600 px-4 py-2 text-xs font-medium text-white shadow-[0_8px_22px_rgba(0,0,0,0.35)] transition hover:bg-violet-500 active:scale-95"
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
