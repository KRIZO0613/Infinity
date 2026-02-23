"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";
import {
  createTrainingEvent,
  getTrainingsByTeam,
  type TeamEvent,
} from "@/lib/api/teamEvents";

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

const formatFullDate = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);

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
  const [draftTime, setDraftTime] = useState("18:00");
  const [draftDuration, setDraftDuration] = useState("");
  const [draftGroup, setDraftGroup] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [dateTouched, setDateTouched] = useState(false);
  const [timeTouched, setTimeTouched] = useState(false);
  const [durationTouched, setDurationTouched] = useState(false);
  const [groupTouched, setGroupTouched] = useState(false);
  const [locationTouched, setLocationTouched] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [presenceOpen, setPresenceOpen] = useState(false);
  const [presenceTraining, setPresenceTraining] = useState<TeamEvent | null>(
    null,
  );
  const [presenceDraft, setPresenceDraft] = useState<Set<string>>(new Set());
  const [presenceInitial, setPresenceInitial] = useState<Set<string>>(new Set());
  const [presenceSaving, setPresenceSaving] = useState(false);
  const [absencePicker, setAbsencePicker] = useState("");

  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [exerciseTraining, setExerciseTraining] = useState<TeamEvent | null>(
    null,
  );
  const [exerciseName, setExerciseName] = useState("");
  const [exerciseDuration, setExerciseDuration] = useState("");
  const [exerciseNotes, setExerciseNotes] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadTeam() {
      if (!resolvedTeamId) return;
      const { data, error } = await supabase
        .from("teams")
        .select("name,category,club_id")
        .eq("id", resolvedTeamId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error("Erreur chargement équipe:", error.message ?? error);
        return;
      }

      const teamLabel = data?.name ?? data?.category ?? null;
      setTeamName(teamLabel);
      setClubId(data?.club_id ?? null);
    }

    loadTeam();
    return () => {
      cancelled = true;
    };
  }, [resolvedTeamId]);

  useEffect(() => {
    let cancelled = false;

    async function loadTrainings() {
      setLoading(true);
      setError(null);
      try {
        const data = await getTrainingsByTeam(resolvedTeamId);
        if (!cancelled) setTrainings(data ?? []);
      } catch (err) {
        if (!cancelled) {
          console.error("Erreur chargement entraînements:", err);
          setError("Impossible de charger les entraînements.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (resolvedTeamId) {
      loadTrainings();
    } else {
      setLoading(false);
      setError("Impossible de charger les entraînements.");
    }

    return () => {
      cancelled = true;
    };
  }, [resolvedTeamId]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      if (!resolvedTeamId) return;
      const { data, error } = await supabase
        .from("players")
        .select("id,first_name,last_name,photo_url")
        .eq("team_id", resolvedTeamId)
        .order("last_name", { ascending: true });

      if (cancelled) return;
      if (error) {
        console.error("Erreur chargement joueurs:", error.message ?? error);
        return;
      }
      setPlayers((data ?? []) as PlayerLite[]);
    }

    loadPlayers();
    return () => {
      cancelled = true;
    };
  }, [resolvedTeamId]);

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
        console.error("Erreur chargement présences:", error.message ?? error);
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
    setDraftDate(`${yyyy}-${mm}-${dd}`);
    setDraftTime("18:00");
    setDraftDuration("");
    setDraftGroup("");
    setDraftLocation("");
    setDateTouched(false);
    setTimeTouched(false);
    setDurationTouched(false);
    setGroupTouched(false);
    setLocationTouched(false);
    setCreateError(null);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
  };

  const handleCreate = async () => {
    if (!resolvedTeamId) {
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
        .eq("id", resolvedTeamId)
        .maybeSingle();
      if (error) {
        console.error("Erreur chargement club:", error.message ?? error);
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
      const startAt = `${draftDate}T${draftTime || "18:00"}:00`;
      let endAt: string | null = null;
      const durationNumber = Number.parseInt(draftDuration || "", 10);
      if (Number.isFinite(durationNumber) && durationNumber > 0) {
        const start = new Date(startAt);
        const end = new Date(start.getTime() + durationNumber * 60 * 1000);
        endAt = end.toISOString();
      }
      const baseTitle = draftGroup.trim() || teamName || "Séance";
      const title = baseTitle.startsWith("Séance")
        ? baseTitle
        : `Séance ${baseTitle}`;

      await createTrainingEvent({
        clubId: resolvedClubId,
        teamId: resolvedTeamId,
        startAt,
        endAt,
        title,
        status: null,
        createdBy: userId,
      });

      const data = await getTrainingsByTeam(resolvedTeamId);
      setTrainings(data ?? []);
      setCreateOpen(false);
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
    const nextExercise: Exercise = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: exerciseName.trim(),
      duration: exerciseDuration.trim(),
      notes: exerciseNotes.trim(),
    };
    setExercisesByEvent((prev) => {
      const current = prev[exerciseTraining.id] ?? [];
      return {
        ...prev,
        [exerciseTraining.id]: [...current, nextExercise],
      };
    });
    closeExercise();
  };

  return (
    <div className="min-h-screen bg-[#070a14] text-slate-100">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
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
            </div>

            <div className="mt-6 rounded-[28px] border border-white/10 bg-black/35 p-6 shadow-[0_26px_60px_rgba(0,0,0,0.6)]">
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
                <div className="space-y-3">
                  {sortedTrainings.map((training) => {
                    const start = new Date(training.start_at);
                    const end = training.end_at
                      ? new Date(training.end_at)
                      : null;
                    const absentCount =
                      attendanceByEvent[training.id]?.length ?? 0;
                    const exercisesCount =
                      exercisesByEvent[training.id]?.length ?? 0;
                    const hasPresence =
                      training.id in attendanceByEvent;
                    const absenceLabel =
                      hasPresence && totalPlayers > 0
                        ? `${absentCount}/${totalPlayers} absents`
                        : "Absents non faits";
                    const isUpcoming = start.getTime() >= Date.now();
                    const statusLabel = isUpcoming ? "À venir" : "Terminée";

                    return (
                      <div
                        key={training.id}
                        className="flex flex-wrap items-start gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:bg-black/40"
                      >
                        <div className="flex-1 space-y-2">
                          <div className="text-sm font-semibold text-slate-100">
                            {formatTimeRange(start, end)}
                          </div>
                          <div className="text-base font-semibold text-white/90">
                            {training.title ?? "Séance"}
                          </div>
                          <div className="flex items-center gap-2 text-xs font-semibold">
                            <span
                              className={[
                                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px]",
                                isUpcoming
                                  ? "border-violet-400/40 bg-violet-500/10 text-violet-100"
                                  : "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
                              ].join(" ")}
                            >
                              <span className="h-2 w-2 rounded-full bg-current" />
                              {statusLabel}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                            <span>👥 Absents : {absenceLabel}</span>
                            <span>
                              🧩 Exercices : {exercisesCount}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openPresence(training)}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition hover:bg-white/10"
                          >
                            Absences
                          </button>
                          <button
                            type="button"
                            onClick={() => openExercise(training)}
                            className="rounded-full border border-white/10 bg-transparent px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:bg-white/5 hover:text-slate-100"
                          >
                            Ajouter un exercice
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[2px]"
          onClick={closeCreate}
          role="presentation"
        >
          <div
            className="relative w-full max-w-xl rounded-3xl border border-white/12 bg-black/30 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-[32px] backdrop-saturate-200 md:p-6"
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
              <h2 className="text-lg font-semibold text-slate-50 md:text-xl">
                Nouvelle séance
              </h2>
              <span className="mt-2 block h-px w-16 bg-violet-400/70" />
            </div>

            <div className="mt-6 space-y-4 text-center">
              <div>
                <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                  Date
                </label>
                <div className="relative mt-2">
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
                    className={`relative z-10 w-full rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-2 text-xs text-[#f2f0ff] shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus:ring-1 focus:ring-violet-400/50 focus:animate-[friendlyBreath_2.8s_ease-in-out_infinite] focus:bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)] [color-scheme:dark] [&::-webkit-datetime-edit]:text-[#f2f0ff] [&::-webkit-datetime-edit-text]:text-white/70 [&::-webkit-datetime-edit-fields-wrapper]:text-[#f2f0ff] [&::-webkit-calendar-picker-indicator]:opacity-60 ${
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
              <div>
                <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                  Heure
                </label>
                <div className="relative mt-2">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-60 blur-[12px]"
                  />
                  <input
                    type="time"
                    value={draftTime}
                    onChange={(event) => {
                      setDraftTime(event.target.value);
                      setTimeTouched(true);
                    }}
                    className={`relative z-10 w-full rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-2 text-xs text-[#f2f0ff] shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus:ring-1 focus:ring-violet-400/50 focus:animate-[friendlyBreath_2.8s_ease-in-out_infinite] focus:bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)] [color-scheme:dark] ${
                      timeTouched && draftTime
                        ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)]"
                        : ""
                    }`}
                  />
                  {timeTouched && draftTime ? (
                    <span className="pointer-events-none absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
                  ) : null}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                  Durée (min)
                </label>
                <div className="relative mt-2">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-60 blur-[12px]"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={draftDuration}
                    onChange={(event) => {
                      setDraftDuration(event.target.value);
                      setDurationTouched(true);
                    }}
                    placeholder="90"
                    className={`relative z-10 w-full rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-2 text-xs text-[#f2f0ff] shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus:ring-1 focus:ring-violet-400/50 focus:animate-[friendlyBreath_2.8s_ease-in-out_infinite] focus:bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)] ${
                      durationTouched && draftDuration
                        ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)]"
                        : ""
                    }`}
                  />
                  {durationTouched && draftDuration ? (
                    <span className="pointer-events-none absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
                  ) : null}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                  Groupe / équipe (optionnel)
                </label>
                <div className="relative mt-2">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-1 rounded-full bg-white/25 opacity-60 blur-[12px]"
                  />
                  <input
                    type="text"
                    value={draftGroup}
                    onChange={(event) => {
                      setDraftGroup(event.target.value);
                      setGroupTouched(true);
                    }}
                    placeholder="Mon équipe"
                    className={`relative z-10 w-full rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-2 text-xs text-[#f2f0ff] shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus:ring-1 focus:ring-violet-400/50 focus:animate-[friendlyBreath_2.8s_ease-in-out_infinite] focus:bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)] ${
                      groupTouched && draftGroup
                        ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)]"
                        : ""
                    }`}
                  />
                  {groupTouched && draftGroup ? (
                    <span className="pointer-events-none absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
                  ) : null}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                  Lieu (optionnel)
                </label>
                <div className="relative mt-2">
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
                    className={`relative z-10 w-full rounded-full border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-2 text-xs text-[#f2f0ff] shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md transition-[background-image,box-shadow] duration-150 focus:ring-1 focus:ring-violet-400/50 focus:animate-[friendlyBreath_2.8s_ease-in-out_infinite] focus:bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)] ${
                      locationTouched && draftLocation
                        ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent),rgba(255,255,255,0.08)]"
                        : ""
                    }`}
                  />
                  {locationTouched && draftLocation ? (
                    <span className="pointer-events-none absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
                  ) : null}
                </div>
              </div>

              {createError ? (
                <div className="text-xs text-rose-300">{createError}</div>
              ) : null}
            </div>

            <div className="mt-6 flex items-center justify-end">
              <button
                type="button"
                disabled={creating}
                onClick={handleCreate}
                className="rounded-full bg-violet-600 px-4 py-2 text-xs font-medium text-white shadow-[0_8px_22px_rgba(0,0,0,0.35)] transition hover:bg-violet-500 active:scale-95 disabled:opacity-50"
              >
                Créer
              </button>
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
