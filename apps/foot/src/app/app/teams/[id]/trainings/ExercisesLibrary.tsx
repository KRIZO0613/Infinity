"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";
import { ExerciseVideoCard } from "@/components/ExerciseVideoCard";
import ExerciseCardFrame from "@/components/ExerciseCardFrame";
import { drawElements, drawPitch } from "@/components/ExerciseAnimatedEditor";

type ExerciseRow = {
  id: string;
  title: string;
  category: string;
  duration: number;
  type: string;
  is_global: boolean;
  created_at: string | null;
  updated_at: string | null;
  animation_data: unknown;
};

type ToastState = {
  kind: "success" | "error";
  message: string;
} | null;

type PlayerLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
};

type ExerciseKind = "animation" | "video" | "card" | "test";
type TypeFilter = "all" | "animation" | "video" | "card" | "test";
type FilterGroup = "categories" | "types" | "objectives" | "levels";
type CardView = "standard" | "grouped";

const TYPE_TABS = [
  { key: "all", label: "TOUS" },
  { key: "animation", label: "ANIMATIONS" },
  { key: "video", label: "VIDÉOS" },
  { key: "card", label: "CARTES" },
  { key: "test", label: "TESTS" },
] as const;

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

const TRAINING_TYPE_OPTIONS = ["Avec ballon", "Sans ballon", "Mixte"];

const OBJECTIVE_OPTIONS = [
  "Passe",
  "Contrôle",
  "Conduite",
  "Tir",
  "Finition",
  "Centres",
  "Défense individuelle",
  "Défense collective",
  "Pressing",
  "Appels",
  "Conservation",
];

const LEVEL_OPTIONS = ["U6-U9", "U10-U11", "U12-U13", "U14-U15", "U16+"];

const OBJECTIVE_VALUE_MAP: Record<string, string> = {
  "Passe": "passe",
  "Contrôle": "contrôle",
  "Conduite": "conduite",
  "Tir": "tir",
  "Finition": "finition",
  "Centres": "centres",
  "Défense individuelle": "défense_individuelle",
  "Défense collective": "défense_collective",
  "Pressing": "pressing",
  "Appels": "appels",
  "Conservation": "conservation",
};

const TRAINING_TYPE_VALUE_MAP: Record<string, string> = {
  "Avec ballon": "avec_ballon",
  "Sans ballon": "sans_ballon",
  "Mixte": "mixte",
};

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
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

export default function ExercisesLibrary() {
  const router = useRouter();
  const params = useParams();
  const teamId =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
      ? params.id[0]
      : "";
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [items, setItems] = useState<ExerciseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [pendingDelete, setPendingDelete] = useState<ExerciseRow | null>(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testCardInfoId, setTestCardInfoId] = useState<string | null>(null);
  const [testCardNotesId, setTestCardNotesId] = useState<string | null>(null);
  const [testTitle, setTestTitle] = useState("");
  const [testCategory, setTestCategory] = useState(
    CATEGORY_OPTIONS[0] ?? "Motricité",
  );
  const [testDurationSeconds, setTestDurationSeconds] = useState(60);
  const [testNotes, setTestNotes] = useState("");
  const [testUnit, setTestUnit] = useState("reps");
  const [testVariants, setTestVariants] = useState("");
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [showTestVariants, setShowTestVariants] = useState(false);
  const [showTestDuration, setShowTestDuration] = useState(false);
  const [selectedTestVariants, setSelectedTestVariants] = useState<string[]>([]);
  const [customTestVariant, setCustomTestVariant] = useState("");
  const [showTestAdvanced, setShowTestAdvanced] = useState(false);
  const [testTargetValue, setTestTargetValue] = useState(0);
  const [testTargetTime, setTestTargetTime] = useState({ min: 0, sec: 0, cs: 0 });
  const [testObjectiveEnabled, setTestObjectiveEnabled] = useState(false);
  const [testMaxAttempts, setTestMaxAttempts] = useState(3);
  const [timeFieldEditing, setTimeFieldEditing] = useState({
    min: false,
    sec: false,
    cs: false,
  });
  const [timeFieldText, setTimeFieldText] = useState({
    min: "",
    sec: "",
    cs: "",
  });
  const testTargetMinRef = useRef<HTMLInputElement | null>(null);
  const testTargetSecRef = useRef<HTMLInputElement | null>(null);
  const testTargetCsRef = useRef<HTMLInputElement | null>(null);
  const [testTarget, setTestTarget] = useState("");
  const [testPresetTitle, setTestPresetTitle] = useState("");
  const [showTestNotes, setShowTestNotes] = useState(false);
  const [showTestAttempts, setShowTestAttempts] = useState(false);
  const [testSaveError, setTestSaveError] = useState<string | null>(null);
  const [testRunnerItem, setTestRunnerItem] = useState<ExerciseRow | null>(null);
  const [testRunnerRunning, setTestRunnerRunning] = useState(false);
  const [testRunnerElapsed, setTestRunnerElapsed] = useState(0);
  const [testRunnerResults, setTestRunnerResults] = useState<
    Record<string, { timeMs?: number; score?: string; history?: Array<{ timeMs?: number; score?: string }> }>
  >({});
  const [showTestRanking, setShowTestRanking] = useState(false);
  const [showObjectivePanel, setShowObjectivePanel] = useState(false);
  const testRankingButtonRef = useRef<HTMLButtonElement | null>(null);
  const testRankingPanelRef = useRef<HTMLDivElement | null>(null);
  const objectiveButtonRef = useRef<HTMLButtonElement | null>(null);
  const objectivePanelRef = useRef<HTMLDivElement | null>(null);
  const testRunnerStartRef = useRef<number | null>(null);
  const [testRunnerPlayers, setTestRunnerPlayers] = useState<PlayerLite[]>([]);
  const [testRunnerPlayersLoading, setTestRunnerPlayersLoading] = useState(false);
  const [testRunnerPlayersError, setTestRunnerPlayersError] = useState<string | null>(null);
  const [testRunnerSelectedPlayers, setTestRunnerSelectedPlayers] = useState<Set<string>>(
    new Set(),
  );
  const [testRunnerActivePlayerId, setTestRunnerActivePlayerId] = useState<
    string | null
  >(null);
  const [testUndoLabel, setTestUndoLabel] = useState<string | null>(null);
  const testUndoActionRef = useRef<(() => void) | null>(null);
  const testUndoTimerRef = useRef<number | null>(null);
  const [testResetMenuOpen, setTestResetMenuOpen] = useState(false);
  const [testResetConfirm, setTestResetConfirm] = useState<"current" | "player" | null>(
    null,
  );
  const testResetButtonRef = useRef<HTMLButtonElement | null>(null);
  const testResetMenuRef = useRef<HTMLDivElement | null>(null);
  const [showTestPlayerSelect, setShowTestPlayerSelect] = useState(false);
  const testDurationAdjustRef = useRef<number | null>(null);
  const testDurationHoldRef = useRef<number | null>(null);
  const targetAdjustRef = useRef<number | null>(null);
  const targetHoldRef = useRef<number | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [cardPreviewUrls, setCardPreviewUrls] = useState<Record<string, string>>(
    {},
  );
  const [expandedCard, setExpandedCard] = useState<ExerciseRow | null>(null);
  const [infoCardId, setInfoCardId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    categories: [] as string[],
    types: [] as string[],
    objectives: [] as string[],
    levels: [] as string[],
  });
  const [filtersDraft, setFiltersDraft] = useState({
    categories: [] as string[],
    types: [] as string[],
    objectives: [] as string[],
    levels: [] as string[],
  });
  const [cardView, setCardView] = useState<CardView>("standard");
  const [openFilterSections, setOpenFilterSections] = useState({
    categories: true,
    types: false,
    objectives: false,
    levels: false,
  });

  const showScrollDebug = false;

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

  const normalizePitchState = (payload: Record<string, any> | null) => {
    const raw = payload?.pitchState ?? null;
    if (!raw) return null;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw) as Record<string, any>;
      } catch {
        return null;
      }
    }
    return raw as Record<string, any>;
  };

  const getMeta = (item: ExerciseRow) => {
    const payload = normalizePayload(item.animation_data);
    return (payload?.metadata ?? payload?.meta ?? {}) as Record<string, any>;
  };

  // TODO: ensure backend enum for training_exercises.type includes "test" when migrating DB.
  const getExerciseKind = (item: ExerciseRow): ExerciseKind => {
    if (item.type === "test") return "test";
    if (item.type === "video") return "video";
    const meta = getMeta(item);
    if (meta?.format === "card") return "card";
    if (item.type === "card") return "card";
    return "animation";
  };

  const cardNumberMap = useMemo(() => {
    const cards = items
      .filter((item) => getExerciseKind(item) === "card")
      .slice()
      .sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return aTime - bTime;
      });
    const map: Record<string, string> = {};
    cards.forEach((card, index) => {
      const num = String(index + 1).padStart(2, "0");
      map[card.id] = `E${num}`;
    });
    return map;
  }, [items]);

  const getScrollWidthClass = (
    kind: ExerciseKind,
    cardSize: "default" | "compact" = "default",
  ) => {
    if (kind === "test") {
      return cardSize === "compact"
        ? "w-[200px] max-w-[62vw] min-w-[170px]"
        : "w-[240px] max-w-[70vw] min-w-[200px]";
    }
    if (kind === "animation") {
      return "w-[420px] max-w-[82vw] min-w-[340px]";
    }
    if (kind === "video") {
      return "w-[640px] max-w-[94vw] min-w-[480px]";
    }
    if (cardSize === "compact") {
      return "w-[200px] max-w-[62vw] min-w-[170px]";
    }
    return "w-[240px] max-w-[70vw] min-w-[200px]";
  };

  const getScrollWidthStyle = (
    kind: ExerciseKind,
    cardSize: "default" | "compact" = "default",
  ) => {
    if (kind === "test") {
      return cardSize === "compact"
        ? { width: 200, minWidth: 170, maxWidth: "62vw", flex: "0 0 auto" }
        : { width: 240, minWidth: 200, maxWidth: "70vw", flex: "0 0 auto" };
    }
    if (kind === "animation") {
      return { width: 420, minWidth: 340, maxWidth: "82vw", flex: "0 0 auto" };
    }
    if (kind === "video") {
      return { width: 640, minWidth: 480, maxWidth: "94vw", flex: "0 0 auto" };
    }
    if (cardSize === "compact") {
      return { width: 200, minWidth: 170, maxWidth: "62vw", flex: "0 0 auto" };
    }
    return { width: 240, minWidth: 200, maxWidth: "70vw", flex: "0 0 auto" };
  };

  const renderExerciseItem = (
    item: ExerciseRow,
    compact = false,
    options?: { cardSize?: "default" | "compact" },
  ) => {
    const kind = getExerciseKind(item);
    const isScroll = compact;
    const cardSize = options?.cardSize ?? "default";
    const scrollCardSize = options?.cardSize ?? "default";
    const wrapperClassName = [
      "relative",
      isScroll
        ? kind === "card" || kind === "test"
          ? "shrink-0 snap-start h-full"
          : "flex-none snap-start"
        : "w-full",
      !isScroll && (kind === "card" || kind === "test") && cardSize === "compact"
        ? "mx-auto max-w-[280px]"
        : "",
      isScroll ? getScrollWidthClass(kind, scrollCardSize) : "",
      isScroll && showScrollDebug ? "outline outline-2 outline-red-500/40" : "",
      !isScroll && (kind === "card" || kind === "test")
        ? "justify-self-center"
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    const wrapperStyle = isScroll
      ? getScrollWidthStyle(kind, scrollCardSize)
      : undefined;

    if (kind === "card") {
      const rotateCardMedia = false;
      const compactCard = !isScroll && cardSize === "compact";
      const compactScrollCard = isScroll && scrollCardSize === "compact";
      const cardScale = compactCard ? 0.88 : compactScrollCard ? 0.85 : 1;
      const cardMediaMinHeight = compactCard
        ? 210
        : compactScrollCard
          ? 200
          : 240;
      const cardNumber = cardNumberMap[item.id];
      const cardMeta = getMeta(item);
      const cardInfoOpen = infoCardId === item.id;
      const cardPreview = getCardPreview(item);
      return (
        <div
          key={item.id}
          className={wrapperClassName}
          style={wrapperStyle}
          data-kind={isScroll ? "card" : undefined}
        >
          <ExerciseCardFrame
            category={item.category || "Non classé"}
            label={item.title || "Carte exercice"}
            className="w-full"
            mediaAspect="portrait"
            mediaMinHeight={cardMediaMinHeight}
            cardScale={cardScale}
            rotateMedia={rotateCardMedia}
            footerLabel={cardNumber}
            mediaOverlayActions={
              <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/15 bg-black/40 px-1.5 py-0.5 text-[11px] text-white/90 shadow-[0_6px_14px_rgba(0,0,0,0.45)] backdrop-blur">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpandedCard(item);
                    setInfoCardId(null);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[22px] leading-none hover:bg-white/10"
                  aria-label="Agrandir"
                >
                  ⤢
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setInfoCardId((prev) => (prev === item.id ? null : item.id));
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[10px] font-semibold"
                  aria-label="Infos"
                >
                  i
                </button>
              </div>
            }
            floatingAction={
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleFavorite(item.id);
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-white/25 bg-black/40 text-[10px] transition"
                style={
                  favoriteIds.has(item.id)
                    ? {
                        color: "#ffe600",
                        borderColor: "rgba(255,255,255,0.25)",
                        backgroundColor: "rgba(0,0,0,0.4)",
                      }
                    : { color: "rgba(255,255,255,0.7)" }
                }
                aria-label="Favori"
              >
                ★
              </button>
            }
          >
            {cardPreview ? (
              <img
                src={cardPreview.src}
                alt={item.title}
                className="block h-full w-full object-contain"
                style={
                  cardPreview.rotate
                    ? { transform: "rotate(-90deg)", transformOrigin: "center" }
                    : undefined
                }
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-black/40 via-black/10 to-black/40" />
            )}
          </ExerciseCardFrame>
          {cardInfoOpen ? (
            <div className="absolute bottom-10 right-2 z-30 w-44 rounded-xl border border-white/10 bg-[#0b1020]/95 p-3 text-[10px] text-slate-200 shadow-[0_16px_30px_rgba(0,0,0,0.55)] backdrop-blur">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.18em] text-slate-400">
                  Infos
                  <button
                    type="button"
                    onClick={() => setInfoCardId(null)}
                    className="text-[10px] text-slate-400 hover:text-slate-200"
                  >
                    ✕
                  </button>
                </div>
                <div className="text-[11px] font-semibold text-white">
                  {item.title}
                </div>
                <div className="text-[10px] text-slate-300">
                  {item.category || cardMeta.category || "Non classé"}
                </div>
                <div className="text-[10px] text-slate-400">
                  {cardMeta.type ?? cardMeta.trainingType ?? "-"}
                </div>
                <div className="text-[10px] text-slate-400">
                  {Array.isArray(cardMeta.objective)
                    ? cardMeta.objective.join(", ")
                    : cardMeta.objective ?? "-"}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setInfoCardId(null);
                      router.push(
                        `/entrainements/exercices/new?type=card&edit=${item.id}`,
                      );
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[12px] text-slate-100 transition hover:bg-white/20"
                    aria-label="Modifier"
                    title="Modifier"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInfoCardId(null);
                      setPendingDelete(item);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-rose-400/30 bg-rose-500/15 text-[12px] text-rose-100 transition hover:bg-rose-500/25"
                    aria-label="Supprimer"
                    title="Supprimer"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      );
    }

    if (item.is_global || kind !== "animation") {
      const meta = getMeta(item);
      const testUnit = meta?.testUnit ?? meta?.unit ?? null;
      return (
        <div
          key={item.id}
          className={[
            wrapperClassName,
            "flex h-full flex-col rounded-[28px] border border-white/10 shadow-[0_24px_50px_rgba(0,0,0,0.55)] backdrop-blur",
            kind === "test"
              ? "bg-transparent px-5 pb-2 pt-2 min-h-[235px]"
              : "bg-white/5 p-5",
          ].join(" ")}
          style={wrapperStyle}
          data-kind={isScroll ? kind : undefined}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleFavorite(item.id);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            className={[
              "absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full border border-white/25 bg-black/40 text-[10px] transition",
            ].join(" ")}
            style={
              favoriteIds.has(item.id)
                ? {
                    color: "#ffe600",
                    borderColor: "rgba(255,255,255,0.25)",
                    backgroundColor: "rgba(0,0,0,0.4)",
                  }
                : { color: "rgba(255,255,255,0.7)" }
            }
            aria-label="Favori"
          >
            ★
          </button>
          {kind === "test" ? (
            <>
              <div className="absolute bottom-1 right-12 pointer-events-auto flex items-center gap-1 rounded-full border border-white/15 bg-black/40 px-1.5 py-0.5 text-[11px] text-white/90 shadow-[0_6px_14px_rgba(0,0,0,0.45)] backdrop-blur">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setTestCardNotesId((prev) => (prev === item.id ? null : item.id));
                    setTestCardInfoId(null);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  data-test-card-trigger="true"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition hover:bg-white/10"
                  aria-label="Notes"
                  title="Notes"
                >
                  Note
                </button>
                <span className="h-4 w-px bg-white/20" />
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setTestCardInfoId((prev) => (prev === item.id ? null : item.id));
                    setTestCardNotesId(null);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  data-test-card-trigger="true"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition hover:bg-white/10"
                  aria-label="Infos"
                  title="Infos"
                >
                  i
                </button>
              </div>
              {testCardNotesId === item.id ? (
                <div
                  className="absolute bottom-10 right-2 z-20 w-44 rounded-xl border border-white/10 bg-[#0b1020]/95 p-3 text-[10px] text-slate-200 shadow-[0_16px_30px_rgba(0,0,0,0.55)] backdrop-blur"
                  data-test-card-panel="true"
                >
                  <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.18em] text-slate-400">
                    Notes
                    <button
                      type="button"
                      onClick={() => setTestCardNotesId(null)}
                      className="text-[10px] text-slate-400 hover:text-slate-200"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 text-[10px] text-slate-200">
                    {meta?.notes?.trim() || "Aucune note."}
                  </div>
                </div>
              ) : null}
              {testCardInfoId === item.id ? (
                <div
                  className="absolute bottom-10 right-2 z-20 w-48 rounded-xl border border-white/10 bg-[#0b1020]/95 p-3 text-[10px] text-slate-200 shadow-[0_16px_30px_rgba(0,0,0,0.55)] backdrop-blur"
                  data-test-card-panel="true"
                >
                  <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.18em] text-slate-400">
                    Infos
                    <button
                      type="button"
                      onClick={() => setTestCardInfoId(null)}
                      className="text-[10px] text-slate-400 hover:text-slate-200"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 space-y-1 text-[10px] text-slate-200">
                    {meta?.durationMinutes ? (
                      <div>Durée: {meta.durationMinutes} min</div>
                    ) : null}
                    {meta?.testVariants ? (
                      <div>Variantes: {meta.testVariants}</div>
                    ) : null}
                    {meta?.testTarget ? (
                      <div>Objectif: {meta.testTarget}</div>
                    ) : null}
                    {meta?.testMaxAttempts ? (
                      <div>Essais max: {meta.testMaxAttempts}</div>
                    ) : null}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setTestCardInfoId(null);
                        openTestModalForEdit(item);
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-200 transition hover:bg-white/10"
                    >
                      ✎ Modifier
                    </button>
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setPendingDelete(item);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                className="absolute bottom-2 right-4 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[9px] text-white/50 transition hover:bg-white/10"
                aria-label="Supprimer"
                title="Supprimer"
              >
                🗑
              </button>
            </>
          ) : null}
          <div className="flex items-start justify-center">
            <h3
              className={[
                "w-full text-center text-[13px] font-bold tracking-[0.18em] text-white",
                kind === "test" ? "-mt-1" : "",
              ].join(" ")}
            >
              {item.title}
            </h3>
          </div>
          <div className="mt-1 flex">
            <span className="h-[2px] w-full rounded-full bg-gradient-to-r from-transparent via-fuchsia-400/80 to-transparent" />
          </div>
          {kind !== "test" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                {item.category}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                {item.duration ? `${item.duration} min` : "-"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                {getExerciseKind(item) === "video"
                  ? "Vidéo"
                  : getExerciseKind(item) === "card"
                  ? "Carte"
                  : "Animé"}
              </span>
            </div>
          ) : null}
          {item.is_global && kind !== "test" ? (
            <div className="mt-auto flex flex-wrap gap-2 pt-5">
              <button
                type="button"
                onClick={() => handleDuplicate(item)}
                disabled={busyId === item.id}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
              >
                Dupliquer
              </button>
            </div>
          ) : null}
          {kind === "test" ? (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setTestRunnerItem(item);
                  setTestRunnerElapsed(0);
                  setTestRunnerRunning(false);
                  testRunnerStartRef.current = null;
                  setTestRunnerResults({});
                  setTestRunnerSelectedPlayers(
                    new Set(testRunnerPlayers.map((player) => player.id)),
                  );
                  setTestRunnerActivePlayerId(
                    testRunnerPlayers[0]?.id ?? null,
                  );
                  setShowTestPlayerSelect(false);
                  setShowTestRanking(false);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                className="flex h-14 w-14 items-center justify-center rounded-full border border-violet-400/40 bg-violet-500/20 text-white shadow-[0_14px_30px_rgba(0,0,0,0.45)] transition hover:bg-violet-500/35"
                aria-label="Lancer le test"
              >
                ▶
              </button>
            </div>
          ) : null}
          {kind === "test" ? (
            <div className="absolute bottom-2 left-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-300">
              <span>
                {testUnit === "reps"
                  ? "Répétition"
                  : testUnit === "note10"
                    ? "Notes"
                    : testUnit === "sec"
                      ? "Temps"
                      : "Test"}
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div
        key={item.id}
        className={wrapperClassName}
        style={wrapperStyle}
        data-kind={isScroll ? kind : undefined}
      >
        <div className="w-full">
          <ExerciseVideoCard
            exercise={item}
            busy={busyId === item.id}
            onDelete={(exercise) => setPendingDelete(exercise)}
            favorite={favoriteIds.has(item.id)}
            onToggleFavorite={() => toggleFavorite(item.id)}
          />
        </div>
      </div>
    );
  };
  const createMenuRef = useRef<HTMLDivElement | null>(null);
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const filterPanelRef = useRef<HTMLDivElement | null>(null);
  const searchTimerRef = useRef<number | null>(null);
  const animationTimerRef = useRef<number | null>(null);
  const [animateResults, setAnimateResults] = useState(true);

  const showToast = (kind: "success" | "error", message: string) => {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 2800);
  };

  const fetchExercises = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("training_exercises")
        .select(
          "id,title,category,duration,type,is_global,created_at,updated_at,animation_data",
        )
        .order("created_at", { ascending: false });
      if (error) {
        if (!shouldSilenceLoadError(error)) {
          showToast("error", error.message);
        }
        setItems([]);
      } else {
        setItems((data as ExerciseRow[]) ?? []);
      }
    } catch (error) {
      if (!shouldSilenceLoadError(error)) {
        showToast("error", String(error ?? "Erreur chargement"));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExercises();
  }, []);


  useEffect(() => {
    if (!showCreateMenu) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (createMenuRef.current && !createMenuRef.current.contains(target)) {
        setShowCreateMenu(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [showCreateMenu]);

  useEffect(() => {
    if (!showFilters) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideButton = filterButtonRef.current?.contains(target) ?? false;
      const insidePanel = filterPanelRef.current?.contains(target) ?? false;
      if (!insideButton && !insidePanel) setShowFilters(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [showFilters]);

  useEffect(() => {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);
    return () => {
      if (searchTimerRef.current) {
        window.clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchInput]);

  useEffect(() => {
    if (!showFilters) return;
    setFiltersDraft(filters);
  }, [showFilters, filters]);

  useEffect(() => {
    return () => {
      if (animationTimerRef.current) {
        window.clearTimeout(animationTimerRef.current);
      }
      if (testDurationAdjustRef.current) {
        window.clearInterval(testDurationAdjustRef.current);
      }
      if (testDurationHoldRef.current) {
        window.clearTimeout(testDurationHoldRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      if (!teamId) return;
      setTestRunnerPlayersLoading(true);
      setTestRunnerPlayersError(null);
      const { data, error } = await supabase
        .from("players")
        .select("id,first_name,last_name,photo_url")
        .eq("team_id", teamId)
        .order("last_name", { ascending: true });
      if (cancelled) return;
      if (error) {
        setTestRunnerPlayersError(error.message);
        setTestRunnerPlayers([]);
      } else {
        setTestRunnerPlayers((data ?? []) as PlayerLite[]);
      }
      setTestRunnerPlayersLoading(false);
    }

    loadPlayers();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  useEffect(() => {
    if (!testRunnerItem) return;
    if (!testRunnerPlayers.length) return;
    setTestRunnerSelectedPlayers((prev) => {
      if (prev.size) return prev;
      return new Set(testRunnerPlayers.map((player) => player.id));
    });
    if (!testRunnerActivePlayerId) {
      setTestRunnerActivePlayerId(testRunnerPlayers[0]?.id ?? null);
    }
  }, [testRunnerItem, testRunnerPlayers, testRunnerActivePlayerId]);

  useEffect(() => {
    if (!testRunnerItem) return;
    if (!testRunnerActivePlayerId) return;
    setTestRunnerRunning(false);
    setTestRunnerElapsed(0);
  }, [testRunnerActivePlayerId, testRunnerItem, testRunnerResults]);

  useEffect(() => {
    if (!testRunnerRunning) return;
    testRunnerStartRef.current = Date.now() - testRunnerElapsed;
    const timer = window.setInterval(() => {
      const start = testRunnerStartRef.current ?? Date.now();
      setTestRunnerElapsed(Math.max(0, Date.now() - start));
    }, 50);
    return () => window.clearInterval(timer);
  }, [testRunnerRunning]);

  useEffect(() => {
    if (!showTestRanking) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (testRankingButtonRef.current?.contains(target)) return;
      if (testRankingPanelRef.current?.contains(target)) return;
      setShowTestRanking(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTestRanking]);

  useEffect(() => {
    if (!showObjectivePanel) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (objectiveButtonRef.current?.contains(target)) return;
      if (objectivePanelRef.current?.contains(target)) return;
      setShowObjectivePanel(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showObjectivePanel]);

  useEffect(() => {
    if (!testCardInfoId && !testCardNotesId) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-test-card-panel='true']")) return;
      if (target.closest("[data-test-card-trigger='true']")) return;
      setTestCardInfoId(null);
      setTestCardNotesId(null);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [testCardInfoId, testCardNotesId]);

  useEffect(() => {
    if (!testResetMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (testResetButtonRef.current?.contains(target)) return;
      if (testResetMenuRef.current?.contains(target)) return;
      setTestResetMenuOpen(false);
      setTestResetConfirm(null);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [testResetMenuOpen]);

  useEffect(() => {
    return () => {
      if (testUndoTimerRef.current) {
        window.clearTimeout(testUndoTimerRef.current);
        testUndoTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!testRunnerItem) {
      setTestUndoLabel(null);
      testUndoActionRef.current = null;
      if (testUndoTimerRef.current) {
        window.clearTimeout(testUndoTimerRef.current);
        testUndoTimerRef.current = null;
      }
      setTestResetMenuOpen(false);
      setTestResetConfirm(null);
    }
  }, [testRunnerItem]);

  const triggerTestUndo = (label: string, action: () => void) => {
    testUndoActionRef.current = action;
    setTestUndoLabel(label);
    if (testUndoTimerRef.current) {
      window.clearTimeout(testUndoTimerRef.current);
    }
    testUndoTimerRef.current = window.setTimeout(() => {
      setTestUndoLabel(null);
      testUndoActionRef.current = null;
      testUndoTimerRef.current = null;
    }, 6500);
  };

  const handleTestUndo = () => {
    if (testUndoActionRef.current) {
      testUndoActionRef.current();
    }
    setTestUndoLabel(null);
    testUndoActionRef.current = null;
    if (testUndoTimerRef.current) {
      window.clearTimeout(testUndoTimerRef.current);
      testUndoTimerRef.current = null;
    }
  };

  useEffect(() => {
    const variants = [...selectedTestVariants];
    const custom = customTestVariant.trim();
    if (custom) variants.push(custom);
    setTestVariants(variants.join(", "));
  }, [selectedTestVariants, customTestVariant]);

  useEffect(() => {
    if (!testUnit || !testObjectiveEnabled) {
      setTestTarget("");
      return;
    }
    if (testUnit === "sec") {
      const value = `${String(testTargetTime.min).padStart(2, "0")}:${String(
        testTargetTime.sec,
      ).padStart(2, "0")}.${String(testTargetTime.cs).padStart(2, "0")}`;
      setTestTarget(value);
      return;
    }
    if (testUnit === "reps" || testUnit === "note10") {
      setTestTarget(String(testTargetValue));
      return;
    }
  }, [testUnit, testObjectiveEnabled, testTargetTime, testTargetValue]);

  const triggerResultsAnimation = () => {
    if (animationTimerRef.current) {
      window.clearTimeout(animationTimerRef.current);
    }
    setAnimateResults(false);
    animationTimerRef.current = window.setTimeout(() => {
      setAnimateResults(true);
    }, 20);
  };

  const formatTimer = (value: number) => {
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

  const getTestUnitLabel = (unit?: string) => {
    if (unit === "sec") return "Temps";
    if (unit === "reps") return "Répétitions";
    if (unit === "note10") return "Note /10";
    if (unit === "m") return "Mètres";
    return "Score";
  };

  const removeFilterChip = (group: FilterGroup, value: string) => {
    setFilters((prev) => {
      const next = {
        ...prev,
        [group]: prev[group].filter((item) => item !== value),
      };
      if (showFilters) {
        setFiltersDraft(next);
      }
      return next;
    });
  };

  const toggleFavorite = (id: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDuplicate = async (item: ExerciseRow) => {
    if (!item.is_global) return;
    setBusyId(item.id);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      showToast("error", "Utilisateur non connecté.");
      setBusyId(null);
      return;
    }
    const { error } = await supabase.from("training_exercises").insert({
      title: `${item.title} (copie)`,
      category: item.category,
      duration: item.duration,
      type: item.type,
      animation_data: item.animation_data,
      is_global: false,
    });
    if (error) {
      showToast("error", error.message);
    } else {
      showToast("success", "Exercice dupliqué.");
      await fetchExercises();
    }
    setBusyId(null);
  };

  const openTestModal = () => {
    setShowCreateMenu(false);
    setEditingTestId(null);
    setTestTitle("");
    setTestCategory(
      CATEGORY_OPTIONS.includes("Technique")
        ? "Technique"
        : CATEGORY_OPTIONS[0] ?? "Motricité",
    );
    setTestDurationSeconds(60);
    setTestNotes("");
    setTestUnit("");
    setTestVariants("");
    setSelectedTestVariants([]);
    setCustomTestVariant("");
    setTestTarget("");
    setTestPresetTitle("");
    setTestObjectiveEnabled(false);
    setTestMaxAttempts(3);
    setTestTargetValue(0);
    setTestTargetTime({ min: 0, sec: 0, cs: 0 });
    setShowTestDuration(false);
    setShowTestVariants(false);
    setShowTestNotes(false);
    setShowTestAttempts(false);
    setShowTestAdvanced(false);
    setTimeFieldEditing({ min: false, sec: false, cs: false });
    setTimeFieldText({ min: "", sec: "", cs: "" });
    setTestSaveError(null);
    setShowTestModal(true);
  };

  const openTestModalForEdit = (item: ExerciseRow) => {
    setShowCreateMenu(false);
    setEditingTestId(item.id);
    const meta = getMeta(item);
    const unit = meta?.testUnit ?? meta?.unit ?? "";
    const availableVariants = ["Pied droit", "Pied gauche", "Mixe"];
    setTestTitle(item.title ?? "");
    setTestCategory(meta?.category ?? item.category ?? "Motricité");
    setTestNotes(meta?.notes ?? "");
    setTestUnit(unit);
    setTestObjectiveEnabled(Boolean(meta?.testTarget));
    setTestMaxAttempts(Math.min(5, Math.max(1, Number(meta?.testMaxAttempts ?? 3))));
    const hasAdvanced =
      Boolean(meta?.testMaxAttempts) ||
      Boolean(meta?.testDurationSeconds || meta?.durationMinutes) ||
      Boolean(meta?.testVariants) ||
      Boolean(meta?.notes);
    setShowTestAttempts(Boolean(meta?.testMaxAttempts));
    setShowTestAdvanced(hasAdvanced);
    setTimeFieldEditing({ min: false, sec: false, cs: false });
    setTimeFieldText({ min: "", sec: "", cs: "" });
    const durationSeconds = Number(
      meta?.testDurationSeconds ?? (meta?.durationMinutes ?? item.duration ?? 1) * 60,
    );
    setTestDurationSeconds(Number.isFinite(durationSeconds) ? durationSeconds : 60);
    setShowTestDuration(Boolean(meta?.testDurationSeconds || meta?.durationMinutes));
    const variants = meta?.testVariants ?? "";
    setTestVariants(variants);
    const presetVariants = variants
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    setSelectedTestVariants(
      presetVariants.filter((value) => availableVariants.includes(value)),
    );
    setCustomTestVariant(
      presetVariants.filter((value) => !availableVariants.includes(value)).join(", "),
    );
    setShowTestVariants(Boolean(variants));
    setShowTestNotes(Boolean(meta?.notes));
    const target = meta?.testTarget ?? "";
    setTestTarget(target);
    if (unit === "sec") {
      let min = 0;
      let sec = 0;
      let cs = 0;
      const match = target.match(/(\d{1,2})\s*:\s*(\d{1,2})(?:\.(\d{1,2}))?/);
      if (match) {
        min = Number(match[1] ?? 0);
        sec = Number(match[2] ?? 0);
        cs = Number(match[3] ?? 0);
      }
      setTestTargetTime({ min, sec, cs });
      setTestTargetValue(0);
    } else if (unit === "reps" || unit === "note10") {
      const numberMatch = target.match(/(\d+)/);
      setTestTargetValue(numberMatch ? Number(numberMatch[1]) : 0);
      setTestTargetTime({ min: 0, sec: 0, cs: 0 });
    } else {
      setTestTargetValue(0);
      setTestTargetTime({ min: 0, sec: 0, cs: 0 });
    }
    setTestPresetTitle("");
    setTestSaveError(null);
    setShowTestModal(true);
  };

  const TEST_PRESETS = [
    {
      title: "Jongles",
      category: "Technique",
      unit: "reps",
      variants: "Pied droit, Pied gauche, Alterné",
      target: "30 sec",
      duration: 1,
    },
    {
      title: "Précision de passe",
      category: "Technique",
      unit: "reps",
      variants: "",
      target: "10 passes",
      duration: 5,
    },
    {
      title: "Frappe précision",
      category: "Technique",
      unit: "reps",
      variants: "",
      target: "10 frappes",
      duration: 8,
    },
    {
      title: "Conduite + slalom chronométré",
      category: "Motricité",
      unit: "sec",
      variants: "",
      target: "",
      duration: 6,
    },
    {
      title: "Sprint 10m",
      category: "Physique",
      unit: "sec",
      variants: "",
      target: "10 m",
      duration: 4,
    },
    {
      title: "Sprint 20m",
      category: "Physique",
      unit: "sec",
      variants: "",
      target: "20 m",
      duration: 4,
    },
    {
      title: "Sprint 30m",
      category: "Physique",
      unit: "sec",
      variants: "",
      target: "30 m",
      duration: 4,
    },
    {
      title: "Test d’agilité (parcours en T)",
      category: "Physique",
      unit: "sec",
      variants: "",
      target: "",
      duration: 6,
    },
    {
      title: "Gainage",
      category: "Physique",
      unit: "sec",
      variants: "",
      target: "",
      duration: 5,
    },
    {
      title: "Jeu réduit – décision rapide",
      category: "Tactique",
      unit: "note10",
      variants: "",
      target: "/10",
      duration: 10,
    },
    {
      title: "Implication match (coach)",
      category: "Tactique",
      unit: "note10",
      variants: "",
      target: "/10",
      duration: 10,
    },
    {
      title: "Parcours coordination",
      category: "Motricité",
      unit: "sec",
      variants: "",
      target: "",
      duration: 6,
    },
    {
      title: "Conduite simple chronométrée",
      category: "Motricité",
      unit: "sec",
      variants: "",
      target: "",
      duration: 6,
    },
  ] as const;

  const applyTestPreset = (preset: (typeof TEST_PRESETS)[number]) => {
    const availableVariants = ["Pied droit", "Pied gauche", "Mixe"];
    setTestTitle(preset.title);
    setTestCategory(preset.category);
    setTestUnit(preset.unit);
    setTestObjectiveEnabled(false);
    setTestMaxAttempts(3);
    setTestVariants(preset.variants);
    const presetVariants = preset.variants
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    setSelectedTestVariants(
      presetVariants.filter((item) => availableVariants.includes(item)),
    );
    setCustomTestVariant(
      presetVariants.filter((item) => !availableVariants.includes(item)).join(", "),
    );
    setTestTarget(preset.target);
    if (preset.unit === "sec") {
      const match = preset.target.match(/(\d+)\s*(?:sec|s)/i);
      const totalSeconds = match ? Number(match[1]) : 0;
      setTestTargetTime({
        min: Math.floor(totalSeconds / 60),
        sec: totalSeconds % 60,
        cs: 0,
      });
    } else {
      const numberMatch = preset.target.match(/(\d+)/);
      setTestTargetValue(numberMatch ? Number(numberMatch[1]) : 0);
    }
    setTestDurationSeconds(Math.max(15, preset.duration * 60));
  };

  const updateTestDurationSeconds = (delta: number) => {
    setTestDurationSeconds((prev) => Math.max(15, prev + delta * 15));
  };

  const startAdjustingTestDuration = (delta: number) => {
    updateTestDurationSeconds(delta);
    if (testDurationAdjustRef.current) {
      window.clearInterval(testDurationAdjustRef.current);
    }
    if (testDurationHoldRef.current) {
      window.clearTimeout(testDurationHoldRef.current);
    }
    testDurationHoldRef.current = window.setTimeout(() => {
      testDurationAdjustRef.current = window.setInterval(() => {
        updateTestDurationSeconds(delta);
      }, 120);
    }, 350);
  };

  const stopAdjustingTestDuration = () => {
    if (testDurationAdjustRef.current) {
      window.clearInterval(testDurationAdjustRef.current);
      testDurationAdjustRef.current = null;
    }
    if (testDurationHoldRef.current) {
      window.clearTimeout(testDurationHoldRef.current);
      testDurationHoldRef.current = null;
    }
  };

  const handleCreateTest = async () => {
    const trimmedTitle = testTitle.trim();
    if (!trimmedTitle) {
      showToast("error", "Nom du test obligatoire.");
      return;
    }
    if (!testUnit) {
      showToast("error", "Type de mesure obligatoire.");
      return;
    }
    setTestSaveError(null);
    const safeDurationSeconds =
      Number.isFinite(testDurationSeconds) && testDurationSeconds > 0
        ? testDurationSeconds
        : 60;
    const safeDurationMinutes = Math.max(
      1,
      Math.ceil(safeDurationSeconds / 60),
    );
    setBusyId("create-test");
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      showToast("error", "Utilisateur non connecté.");
      setTestSaveError("Utilisateur non connecté.");
      setBusyId(null);
      return;
    }
    const resolvedTestTarget = testObjectiveEnabled ? testTarget : "";
    const payload = {
      metadata: {
        category: testCategory,
        notes: testNotes.trim() || undefined,
        durationMinutes: safeDurationMinutes,
        testDurationSeconds: safeDurationSeconds,
        testUnit,
        testVariants,
        testTarget: resolvedTestTarget,
        testMaxAttempts,
      },
      meta: {
        category: testCategory,
        notes: testNotes.trim() || undefined,
        durationMinutes: safeDurationMinutes,
        testDurationSeconds: safeDurationSeconds,
        testUnit,
        testVariants,
        testTarget: resolvedTestTarget,
        testMaxAttempts,
      },
    };
    const { error } = editingTestId
      ? await supabase
          .from("training_exercises")
          .update({
            title: trimmedTitle,
            category: testCategory,
            duration: safeDurationMinutes,
            animation_data: payload as unknown,
          })
          .eq("id", editingTestId)
      : await supabase.from("training_exercises").insert({
          title: trimmedTitle,
          category: testCategory,
          duration: safeDurationMinutes,
          type: "test",
          animation_data: payload as unknown,
          is_global: true,
          created_by: userData.user.id,
        });
    if (error) {
      showToast("error", error.message);
      setTestSaveError(error.message);
    } else {
      showToast(
        "success",
        editingTestId ? "Test mis à jour." : "Test ajouté à la bibliothèque.",
      );
      await fetchExercises();
      setShowTestModal(false);
      setEditingTestId(null);
    }
    setBusyId(null);
  };

  const handleTimeFieldChange = (
    field: "min" | "sec" | "cs",
    value: string,
    nextRef?: React.RefObject<HTMLInputElement>,
    maxValue?: number,
  ) => {
    const digits = value.replace(/\D/g, "").slice(0, 2);
    setTimeFieldText((prev) => ({ ...prev, [field]: digits }));
    if (digits.length === 0) {
      setTestTargetTime((prev) => ({ ...prev, [field]: 0 }));
      return;
    }
    let numeric = Number(digits);
    if (Number.isNaN(numeric)) numeric = 0;
    if (typeof maxValue === "number") {
      numeric = Math.min(maxValue, Math.max(0, numeric));
    }
    setTestTargetTime((prev) => ({ ...prev, [field]: numeric }));
    if (digits.length === 2 && nextRef?.current) {
      setTimeFieldEditing((prev) => ({ ...prev, [field]: false }));
      nextRef.current.focus();
      nextRef.current.select();
    }
  };


  const handleDelete = async (item: ExerciseRow) => {
    if (item.is_global) return;
    setBusyId(item.id);
    const { error } = await supabase
      .from("training_exercises")
      .delete()
      .eq("id", item.id);
    if (error) {
      showToast("error", error.message);
    } else {
      showToast("success", "Exercice supprimé.");
      await fetchExercises();
    }
    setBusyId(null);
  };

  const activeFilterCount =
    filters.categories.length +
    filters.types.length +
    filters.objectives.length +
    filters.levels.length;

  const activeFilterChips = useMemo(
    () => [
      ...filters.categories.map((value) => ({
        group: "categories" as const,
        label: value,
      })),
      ...filters.types.map((value) => ({
        group: "types" as const,
        label: value,
      })),
      ...filters.objectives.map((value) => ({
        group: "objectives" as const,
        label: value,
      })),
      ...filters.levels.map((value) => ({
        group: "levels" as const,
        label: value,
      })),
    ],
    [filters],
  );

  const getCardCover = (item: ExerciseRow) => {
    const payload = normalizePayload(item.animation_data);
    const pitchState = normalizePitchState(payload);
    return (
      payload?.coverImageUrl ??
      pitchState?.coverImageUrl ??
      null
    );
  };

  const getCardCoverOrientation = (item: ExerciseRow) => {
    const payload = normalizePayload(item.animation_data);
    const pitchState = normalizePitchState(payload);
    return (
      pitchState?.coverOrientation ??
      payload?.coverOrientation ??
      null
    ) as "portrait" | "landscape" | null;
  };

  const hasCardState = (item: ExerciseRow) => {
    const payload = normalizePayload(item.animation_data);
    const pitchState = normalizePitchState(payload);
    return Boolean(
      pitchState ||
        payload?.elements ||
        payload?.paths ||
        payload?.strokes,
    );
  };

  const getPitchOrientation = (item: ExerciseRow) => {
    const payload = normalizePayload(item.animation_data);
    return (
      payload?.pitchOrientation ??
      normalizePitchState(payload)?.pitchOrientation ??
      payload?.meta?.pitchOrientation ??
      payload?.metadata?.pitchOrientation ??
      "portrait"
    ) as "landscape" | "portrait" | null;
  };

  const buildCardPreview = (item: ExerciseRow) => {
    if (typeof document === "undefined") return null;
    try {
      const payload = normalizePayload(item.animation_data);
      const pitchState = normalizePitchState(payload);
      const effectivePitchState =
        pitchState ?? payload?.pitchState ?? payload?.pitch ?? null;
      const resolvedPitchState = (effectivePitchState ?? {}) as {
        pitchOrientation?: "portrait" | "landscape";
        pitchPreset?: string;
        elements?: any[];
        paths?: Record<string, Array<{ x: number; y: number; t?: number }>>;
        strokes?: Array<{ points?: Array<{ x: number; y: number }> }>;
        ballAttachments?: Record<string, string>;
        pathElementMap?: Record<string, string>;
      };
      const sourceOrientation =
        (resolvedPitchState.pitchOrientation ??
          payload?.pitchOrientation ??
          "portrait") as "portrait" | "landscape";
      const pitchPreset =
        resolvedPitchState.pitchPreset ??
        payload?.pitchPreset ??
        "training_dark_green";
      const orientation: "portrait" | "landscape" = "portrait";
      const width = 540;
      const height = 810;
      const rotatePoint =
        sourceOrientation === "landscape"
          ? (point: { x: number; y: number }) => ({
              x: clamp01(point.y),
              y: clamp01(1 - point.x),
            })
          : (point: { x: number; y: number }) => point;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const pitchRect = drawPitch(
        ctx,
        width,
        height,
        pitchPreset,
        orientation,
        "dark-textured",
      );
      const getPreviewDefaultSize = (type: string) => {
        if (type === "player") return 0.035;
        if (type === "ball") return 0.014;
        if (type === "cone") return 0.03;
        if (type === "hoop") return 0.03;
        if (type === "baton") return 0.028;
        if (type === "slalom_pole") return 0.02;
        if (type === "hurdle_bar") return 0.02;
        if (type === "hurdle_pole") return 0.02;
        if (type === "mini_goal") return 0.025;
        if (type === "ladder") return 0.025;
        if (type === "pass_wall") return 0.028;
        if (type === "shape") return 0.05;
        return 0.02;
      };
      const elements = (resolvedPitchState.elements ?? payload?.elements ?? []).map(
        (el: any) => {
          const next = rotatePoint({ x: el.x, y: el.y });
          const baseSize =
            typeof el.size === "number" ? el.size : getPreviewDefaultSize(el.type);
          return {
            ...el,
            x: next.x,
            y: next.y,
            size: baseSize,
          };
        },
      );
      const paths = Object.entries(
        (resolvedPitchState.paths ?? payload?.paths ?? {}) as Record<
          string,
          Array<{ x: number; y: number; t?: number }>
        >,
      ).reduce<Record<string, Array<{ x: number; y: number; t?: number }>>>(
        (acc, [id, points]) => {
          acc[id] = points.map((pt) => {
            const next = rotatePoint({ x: pt.x, y: pt.y });
            return { ...pt, x: next.x, y: next.y };
          });
          return acc;
        },
        {},
      );
      const strokes = (
        resolvedPitchState.strokes ?? payload?.strokes ?? []
      ).map((stroke: any) => ({
        ...stroke,
        points: (stroke.points ?? []).map((pt: any) => {
          const next = rotatePoint({ x: pt.x, y: pt.y });
          return { ...pt, x: next.x, y: next.y };
        }),
      }));
      const ballAttachments =
        resolvedPitchState.ballAttachments ?? payload?.ballAttachments ?? {};
      const pathElementMap =
        resolvedPitchState.pathElementMap ?? payload?.pathElementMap ?? {};
      const elementLookup = new Map(
        elements.map((el: any) => [el.id, el]),
      );
      const cardPathStyleResolver = (id: string) => {
        const elementId = pathElementMap[id] ?? id;
        const element = elementLookup.get(elementId);
        if (element?.type === "ball") {
          return { color: "rgba(125, 211, 252, 0.85)", width: 2.4, dashed: true };
        }
        if (element?.type === "player") {
          return { color: "rgba(167, 139, 250, 0.85)", width: 2.4, dashed: false };
        }
        return { color: "rgba(148, 163, 184, 0.55)", width: 2.2, dashed: false };
      };
      try {
        drawElements(
          ctx,
          elements,
          null,
          pitchRect,
          paths,
          strokes,
          ballAttachments,
          null,
          {
            showOverlays: true,
            showLabels: false,
            showSequenceNumbers: true,
            showRotateHandle: false,
            showResizeHandle: false,
            showPathGhosts: true,
            pathUseFootOffset: false,
            pathStyleResolver: cardPathStyleResolver,
            pathElementMap,
          },
        );
      } catch (error) {
        console.error("Error drawing card preview", error);
        // Fallback: pitch only if any draw error occurs
        drawPitch(
          ctx,
          width,
          height,
          pitchPreset,
          orientation,
          "dark-textured",
        );
      }
      return canvas.toDataURL("image/png");
    } catch (error) {
      return null;
    }
  };

  const getCardPreview = (item: ExerciseRow) => {
    const preview = cardPreviewUrls[item.id];
    if (preview) return { src: preview, rotate: false };
    const cover = getCardCover(item);
    if (!cover) return null;
    const coverOrientation = getCardCoverOrientation(item);
    if (coverOrientation) {
      return { src: cover, rotate: coverOrientation === "landscape" };
    }
    const orientation = getPitchOrientation(item);
    return { src: cover, rotate: orientation === "landscape" };
  };

  const matchesSearch = (item: ExerciseRow) => {
    if (!search) return true;
    const meta = getMeta(item);
    const objectiveRaw = meta.objective;
    const objectiveList = Array.isArray(objectiveRaw)
      ? objectiveRaw
      : objectiveRaw
        ? [objectiveRaw]
        : [];
    const normalizedObjectives = objectiveList
      .map((value: string) =>
        value
          .toString()
          .replace(/_/g, " ")
          .toLowerCase(),
      )
      .join(" ");
    const haystack = [
      item.title,
      item.category,
      meta.category,
      meta.notes,
      normalizedObjectives,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(search.toLowerCase());
  };

  const filteredExercises = useMemo(() => {
    return items
      .filter((item) => {
        if (typeFilter === "all") return true;
        if (typeFilter === "animation") return getExerciseKind(item) === "animation";
        if (typeFilter === "video") return getExerciseKind(item) === "video";
        if (typeFilter === "card") return getExerciseKind(item) === "card";
        if (typeFilter === "test") return getExerciseKind(item) === "test";
        return true;
      })
      .filter((item) => (showFavoritesOnly ? favoriteIds.has(item.id) : true))
      .filter((item) => matchesSearch(item))
      .filter((item) => {
        if (filters.categories.length === 0) return true;
        return filters.categories.includes(item.category);
      })
      .filter((item) => {
        if (filters.objectives.length === 0) return true;
        const meta = getMeta(item);
        const objectiveRaw = meta.objective;
        const objectiveList = Array.isArray(objectiveRaw)
          ? objectiveRaw
          : objectiveRaw
            ? [objectiveRaw]
            : [];
        const objectiveCodes = new Set(objectiveList.map((value: string) => value.toString()));
        const objectiveLabels = objectiveList.map((value: string) =>
          value
            .toString()
            .replace(/_/g, " ")
            .toLowerCase(),
        );
        return filters.objectives.some((label) => {
          const code = OBJECTIVE_VALUE_MAP[label];
          if (code && objectiveCodes.has(code)) return true;
          return objectiveLabels.includes(label.toLowerCase());
        });
      })
      .filter((item) => {
        if (filters.types.length === 0) return true;
        const meta = getMeta(item);
        const typeRaw = meta.type ?? meta.trainingType;
        const typeList = Array.isArray(typeRaw)
          ? typeRaw
          : typeRaw
            ? [typeRaw]
            : [];
        const typeCodes = new Set(typeList.map((value: string) => value.toString()));
        const typeLabels = typeList.map((value: string) =>
          value
            .toString()
            .replace(/_/g, " ")
            .toLowerCase(),
        );
        return filters.types.some((label) => {
          const code = TRAINING_TYPE_VALUE_MAP[label];
          if (code && typeCodes.has(code)) return true;
          return typeLabels.includes(label.toLowerCase());
        });
      })
      .filter((item) => {
        if (filters.levels.length === 0) return true;
        const meta = getMeta(item);
        const levels = Array.isArray(meta.levels) ? meta.levels : [];
        return filters.levels.some((level) => levels.includes(level));
      });
  }, [
    items,
    typeFilter,
    showFavoritesOnly,
    favoriteIds,
    search,
    filters,
  ]);

  const visibleCards = useMemo(() => {
    if (typeFilter === "card" || typeFilter === "all") {
      return filteredExercises.filter(
        (item) => getExerciseKind(item) === "card",
      );
    }
    return [];
  }, [filteredExercises, typeFilter]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!visibleCards.length) return;
    const missing = visibleCards.filter(
      (card) => !cardPreviewUrls[card.id] && hasCardState(card),
    );
    if (!missing.length) return;
    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: number | null = null;
    let index = 0;

    const runBatch = (deadline?: any) => {
      if (cancelled) return;
      let timeBudget = deadline ? deadline.timeRemaining() : 8;
      while (index < missing.length && timeBudget > 4) {
        const card = missing[index];
        index += 1;
        const preview = buildCardPreview(card);
        if (preview) {
          setCardPreviewUrls((prev) =>
            prev[card.id] ? prev : { ...prev, [card.id]: preview },
          );
        }
        timeBudget = deadline ? deadline.timeRemaining() : timeBudget - 2;
      }
      if (index < missing.length && !cancelled) {
        scheduleNext();
      }
    };

    const scheduleNext = () => {
      const requestIdle = (window as any).requestIdleCallback as
        | ((cb: (deadline: IdleDeadline) => void) => number)
        | undefined;
      if (requestIdle) {
        idleId = requestIdle(runBatch);
      } else {
        timeoutId = window.setTimeout(() => runBatch(), 16);
      }
    };

    scheduleNext();
    return () => {
      cancelled = true;
      const cancelIdle = (window as any).cancelIdleCallback as
        | ((id: number) => void)
        | undefined;
      if (idleId !== null && cancelIdle) {
        cancelIdle(idleId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [visibleCards, cardPreviewUrls]);

  return (
    <div className="mt-8">
      {toast ? (
        <div className="fixed right-6 top-24 z-50">
          <div
            className={`rounded-2xl border px-4 py-3 text-sm shadow-[0_20px_50px_rgba(0,0,0,0.55)] backdrop-blur ${
              toast.kind === "success"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                : "border-rose-400/30 bg-rose-500/10 text-rose-100"
            }`}
          >
            {toast.message}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {TYPE_TABS.map((tab) => {
            const isActive = typeFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setTypeFilter(tab.key)}
                className={[
                  "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] transition",
                  isActive
                    ? "border border-white/15 bg-white/10 text-slate-100"
                    : "border border-white/10 bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200",
                ].join(" ")}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative flex h-6 w-full max-w-[200px] flex-1 items-center rounded-full border border-white/10 bg-white/5 px-2 text-[10px] text-slate-200 shadow-[0_6px_14px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <span className="text-[9px] text-slate-400">🔍</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Rechercher un exercice…"
              className="ml-1.5 flex-1 bg-transparent text-[9px] text-slate-200 outline-none placeholder:text-slate-500"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="ml-1.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/10 text-[8px] text-slate-300 transition hover:bg-white/10"
                aria-label="Effacer"
              >
                ✕
              </button>
            ) : null}
          </div>

          <div className="relative flex items-center gap-2">
          <button
            ref={filterButtonRef}
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            className={[
              "relative inline-flex h-7 w-7 items-center justify-center rounded-full border text-[10px] transition",
              activeFilterCount > 0
                ? "border-violet-400/50 bg-violet-500/20 text-white shadow-[0_0_16px_rgba(139,92,246,0.45)]"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
            ].join(" ")}
            aria-label="Filtres"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 5h18" />
              <path d="M6 12h12" />
              <path d="M10 19h4" />
            </svg>
            {activeFilterCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-violet-500 text-[7px] font-semibold text-white shadow-[0_0_6px_rgba(139,92,246,0.65)]">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
          {showFilters ? (
            <div className="fixed inset-0 z-40 flex items-start justify-center px-4 pt-6 pb-6 md:static md:inset-auto md:block md:px-0 md:pt-0 md:pb-0">
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm md:hidden"
                aria-label="Fermer"
              />
              <div
                ref={filterPanelRef}
                className="relative z-50 w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b0f1a]/95 p-5 text-xs text-slate-100 shadow-[0_24px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl md:absolute md:right-0 md:top-12 md:w-80 min-h-0 max-h-[80vh] overflow-y-auto overscroll-contain touch-pan-y pr-1"
              >
                <div className="grid gap-4">
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenFilterSections((prev) => ({
                          ...prev,
                          categories: !prev.categories,
                        }))
                      }
                      className="flex w-full items-center justify-between text-[11px] uppercase tracking-[0.2em] text-slate-400"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        Catégorie
                        <span className="text-[9px] text-slate-500">
                          ({filtersDraft.categories.length})
                        </span>
                      </span>
                      <span
                        className={`text-sm transition ${
                          openFilterSections.categories ? "rotate-180" : ""
                        }`}
                      >
                        ⌄
                      </span>
                    </button>
                    {openFilterSections.categories ? (
                      <div className="mt-2 grid gap-1">
                        {CATEGORY_OPTIONS.map((item) => {
                          const active = filtersDraft.categories.includes(item);
                          return (
                            <button
                              key={item}
                              type="button"
                              onClick={() =>
                                setFiltersDraft((prev) => ({
                                  ...prev,
                                  categories: prev.categories.includes(item)
                                    ? prev.categories.filter((value) => value !== item)
                                    : [...prev.categories, item],
                                }))
                              }
                              className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-200 transition hover:bg-white/5"
                            >
                              <span className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-full border border-white/20">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={
                                    active
                                      ? {
                                          background: "#A855F7",
                                          boxShadow: "0 0 10px rgba(168,85,247,1)",
                                        }
                                      : undefined
                                  }
                                />
                              </span>
                              {item}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenFilterSections((prev) => ({
                          ...prev,
                          types: !prev.types,
                        }))
                      }
                      className="flex w-full items-center justify-between text-[11px] uppercase tracking-[0.2em] text-slate-400"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        Type
                        <span className="text-[9px] text-slate-500">
                          ({filtersDraft.types.length})
                        </span>
                      </span>
                      <span
                        className={`text-sm transition ${
                          openFilterSections.types ? "rotate-180" : ""
                        }`}
                      >
                        ⌄
                      </span>
                    </button>
                    {openFilterSections.types ? (
                      <div className="mt-2 grid gap-1">
                        {TRAINING_TYPE_OPTIONS.map((item) => {
                          const active = filtersDraft.types.includes(item);
                          return (
                            <button
                              key={item}
                              type="button"
                              onClick={() =>
                                setFiltersDraft((prev) => ({
                                  ...prev,
                                  types: prev.types.includes(item)
                                    ? prev.types.filter((value) => value !== item)
                                    : [...prev.types, item],
                                }))
                              }
                              className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-200 transition hover:bg-white/5"
                            >
                              <span className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-full border border-white/20">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={
                                    active
                                      ? {
                                          background: "#A855F7",
                                          boxShadow: "0 0 10px rgba(168,85,247,1)",
                                        }
                                      : undefined
                                  }
                                />
                              </span>
                              {item}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenFilterSections((prev) => ({
                          ...prev,
                          objectives: !prev.objectives,
                        }))
                      }
                      className="flex w-full items-center justify-between text-[11px] uppercase tracking-[0.2em] text-slate-400"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        Objectif
                        <span className="text-[9px] text-slate-500">
                          ({filtersDraft.objectives.length})
                        </span>
                      </span>
                      <span
                        className={`text-sm transition ${
                          openFilterSections.objectives ? "rotate-180" : ""
                        }`}
                      >
                        ⌄
                      </span>
                    </button>
                    {openFilterSections.objectives ? (
                      <div className="mt-2 grid gap-1">
                        {OBJECTIVE_OPTIONS.map((item) => {
                          const active = filtersDraft.objectives.includes(item);
                          return (
                            <button
                              key={item}
                              type="button"
                              onClick={() =>
                                setFiltersDraft((prev) => ({
                                  ...prev,
                                  objectives: prev.objectives.includes(item)
                                    ? prev.objectives.filter((value) => value !== item)
                                    : [...prev.objectives, item],
                                }))
                              }
                              className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-200 transition hover:bg-white/5"
                            >
                              <span className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-full border border-white/20">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={
                                    active
                                      ? {
                                          background: "#A855F7",
                                          boxShadow: "0 0 10px rgba(168,85,247,1)",
                                        }
                                      : undefined
                                  }
                                />
                              </span>
                              {item}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenFilterSections((prev) => ({
                          ...prev,
                          levels: !prev.levels,
                        }))
                      }
                      className="flex w-full items-center justify-between text-[11px] uppercase tracking-[0.2em] text-slate-400"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        Niveaux
                        <span className="text-[9px] text-slate-500">
                          ({filtersDraft.levels.length})
                        </span>
                      </span>
                      <span
                        className={`text-sm transition ${
                          openFilterSections.levels ? "rotate-180" : ""
                        }`}
                      >
                        ⌄
                      </span>
                    </button>
                    {openFilterSections.levels ? (
                      <div className="mt-2 grid gap-1">
                        {LEVEL_OPTIONS.map((item) => {
                          const active = filtersDraft.levels.includes(item);
                          return (
                            <button
                              key={item}
                              type="button"
                              onClick={() =>
                                setFiltersDraft((prev) => ({
                                  ...prev,
                                  levels: prev.levels.includes(item)
                                    ? prev.levels.filter((value) => value !== item)
                                    : [...prev.levels, item],
                                }))
                              }
                              className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-200 transition hover:bg-white/5"
                            >
                              <span className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-full border border-white/20">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={
                                    active
                                      ? {
                                          background: "#A855F7",
                                          boxShadow: "0 0 10px rgba(168,85,247,1)",
                                        }
                                      : undefined
                                  }
                                />
                              </span>
                              {item}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      setFiltersDraft({
                        categories: [],
                        types: [],
                        objectives: [],
                        levels: [],
                      })
                    }
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    Réinitialiser
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilters(filtersDraft);
                      setShowFilters(false);
                      triggerResultsAnimation();
                    }}
                    className="rounded-full bg-violet-600 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-violet-500"
                  >
                    Appliquer
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setShowFavoritesOnly((prev) => !prev)}
            className={[
              "inline-flex h-7 w-7 items-center justify-center rounded-full border text-[10px] transition",
              showFavoritesOnly
                ? "border-violet-400/50 bg-violet-500/20 text-white shadow-[0_0_12px_rgba(139,92,246,0.45)]"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
            ].join(" ")}
            aria-label="Favoris"
          >
            ★
          </button>
          </div>

          <div className="relative" ref={createMenuRef}>
            <button
              type="button"
              onClick={() => setShowCreateMenu((prev) => !prev)}
              className="rounded-full bg-violet-600 px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition hover:bg-violet-500"
            >
              Créer un exercice
            </button>
            {showCreateMenu ? (
              <div className="absolute right-0 top-12 z-20 w-56 rounded-2xl border border-white/10 bg-[#0b1020] p-2 text-xs text-slate-200 shadow-[0_20px_40px_rgba(0,0,0,0.45)] backdrop-blur">
                <label className="block w-full cursor-pointer rounded-xl px-3 py-2 text-left transition hover:bg-white/10">
                  Ajouter une vidéo
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      showToast("success", "Vidéo sélectionnée.");
                      setShowCreateMenu(false);
                      event.target.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateMenu(false);
                    router.push("/entrainements/exercices/new?type=animated");
                  }}
                  className="mt-1 w-full rounded-xl px-3 py-2 text-left transition hover:bg-white/10"
                >
                  Créer un exercice animé
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateMenu(false);
                    router.push("/entrainements/exercices/new?type=card");
                  }}
                  className="mt-1 w-full rounded-xl px-3 py-2 text-left transition hover:bg-white/10"
                >
                  Créer une carte statique
                </button>
                <button
                  type="button"
                  onClick={openTestModal}
                  className="mt-1 w-full rounded-xl px-3 py-2 text-left transition hover:bg-white/10"
                >
                  Créer un test / mesure
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {!loading ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          <span>
            {filteredExercises.length} exercice
            {filteredExercises.length > 1 ? "s" : ""} trouvé
            {filteredExercises.length > 1 ? "s" : ""}
          </span>
          {typeFilter === "card" ||
          typeFilter === "animation" ||
          typeFilter === "video" ||
          typeFilter === "test" ? (
            <div className="ml-auto flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-0.5 text-[9px] text-slate-300">
              <button
                type="button"
                onClick={() => setCardView("standard")}
                className={[
                  "rounded-full px-2 py-0.5 font-semibold transition",
                  cardView === "standard"
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:text-slate-200",
                ].join(" ")}
              >
                Grille
              </button>
              <button
                type="button"
                onClick={() => setCardView("grouped")}
                className={[
                  "rounded-full px-2 py-0.5 font-semibold transition",
                  cardView === "grouped"
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:text-slate-200",
                ].join(" ")}
              >
                Catégories
              </button>
            </div>
          ) : null}
          {activeFilterCount > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-slate-200">
              {activeFilterChips.map((chip) => (
                <span
                  key={`${chip.group}-${chip.label}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/3 px-2 py-0.5 text-[9px] text-slate-200"
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={() => removeFilterChip(chip.group, chip.label)}
                    className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-white/10 text-[7px] text-slate-300 transition hover:bg-white/10"
                    aria-label={`Retirer ${chip.label}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={[
          "mt-6 transition-all duration-200 ease-out",
          animateResults ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        ].join(" ")}
      >
        {loading ? (
          <div className="rounded-[28px] border border-white/10 bg-black/35 p-6 text-sm text-slate-400 shadow-[0_26px_60px_rgba(0,0,0,0.6)]">
            Chargement des exercices...
          </div>
        ) : filteredExercises.length === 0 ? (
          <div className="flex min-h-[180px] items-center justify-center rounded-[28px] border border-white/10 bg-black/35 p-8 text-center text-sm text-slate-300 shadow-[0_26px_60px_rgba(0,0,0,0.6)]">
            <div>
              <p className="text-base font-semibold text-slate-100">
                Aucun exercice trouvé
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Essaie de modifier tes filtres.
              </p>
              <button
                type="button"
                onClick={() =>
                  setFilters({
                    categories: [],
                    types: [],
                    objectives: [],
                    levels: [],
                  })
                }
                className="mt-4 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                Réinitialiser les filtres
              </button>
            </div>
          </div>
        ) : typeFilter === "all" ? (
          <div className="space-y-8">
            {(() => {
              const cards = filteredExercises.filter(
                (item) => getExerciseKind(item) === "card",
              );
              const animations = filteredExercises.filter(
                (item) => getExerciseKind(item) === "animation",
              );
              const videos = filteredExercises.filter(
                (item) => getExerciseKind(item) === "video",
              );
              const tests = filteredExercises.filter(
                (item) => getExerciseKind(item) === "test",
              );

              return (
                <>
                  {cards.length > 0 ? (
                    <section>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Cartes
                      </p>
                      <div className="flex flex-nowrap items-stretch gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
                        {cards.map((item) => renderExerciseItem(item, true))}
                      </div>
                    </section>
                  ) : null}
                  {animations.length > 0 ? (
                    <section>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Animations
                      </p>
                      <div className="flex flex-nowrap items-start gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
                        {animations.map((item) => renderExerciseItem(item, true))}
                      </div>
                    </section>
                  ) : null}
                  {videos.length > 0 ? (
                    <section>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Vidéos
                      </p>
                      <div className="flex flex-nowrap items-start gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
                        {videos.map((item) => renderExerciseItem(item, true))}
                      </div>
                    </section>
                  ) : null}
                  {tests.length > 0 ? (
                    <section>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Tests / Mesures
                      </p>
                      <div className="flex flex-nowrap items-stretch gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
                        {tests.map((item) => renderExerciseItem(item, true))}
                      </div>
                    </section>
                  ) : null}
                </>
              );
            })()}
          </div>
        ) : typeFilter === "card" ? (
          cardView === "grouped" ? (
            <div className="space-y-6">
              {(() => {
                const cards = filteredExercises.filter(
                  (item) => getExerciseKind(item) === "card",
                );
                const grouped = new Map<string, ExerciseRow[]>();
                cards.forEach((card) => {
                  const key = card.category || "Non classé";
                  if (!grouped.has(key)) grouped.set(key, []);
                  grouped.get(key)?.push(card);
                });
                const orderedKeys = [
                  ...CATEGORY_OPTIONS,
                  ...Array.from(grouped.keys()).filter(
                    (key) => !CATEGORY_OPTIONS.includes(key),
                  ),
                ].filter((key) => grouped.has(key));

                return orderedKeys.map((category) => {
                  const categoryCards = grouped.get(category) ?? [];
                  if (!categoryCards.length) return null;
                  return (
                    <section key={category}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        {category}
                      </p>
                      <div className="flex flex-nowrap items-stretch gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
                        {categoryCards.map((item) =>
                          renderExerciseItem(item, true, { cardSize: "compact" }),
                        )}
                      </div>
                    </section>
                  );
                });
              })()}
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start justify-items-center gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredExercises.map((item) =>
                renderExerciseItem(item, false, { cardSize: "compact" }),
              )}
            </div>
          )
        ) : typeFilter === "animation" ? (
          cardView === "grouped" ? (
            <div className="space-y-6">
              {(() => {
                const animations = filteredExercises.filter(
                  (item) => getExerciseKind(item) === "animation",
                );
                const grouped = new Map<string, ExerciseRow[]>();
                animations.forEach((animation) => {
                  const key = animation.category || "Non classé";
                  if (!grouped.has(key)) grouped.set(key, []);
                  grouped.get(key)?.push(animation);
                });
                const orderedKeys = [
                  ...CATEGORY_OPTIONS,
                  ...Array.from(grouped.keys()).filter(
                    (key) => !CATEGORY_OPTIONS.includes(key),
                  ),
                ].filter((key) => grouped.has(key));

                return orderedKeys.map((category) => {
                  const categoryItems = grouped.get(category) ?? [];
                  if (!categoryItems.length) return null;
                  return (
                    <section key={category}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        {category}
                      </p>
                      <div className="flex flex-nowrap items-start gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
                        {categoryItems.map((item) =>
                          renderExerciseItem(item, true),
                        )}
                      </div>
                    </section>
                  );
                });
              })()}
            </div>
          ) : (
            <div className="flex flex-nowrap items-start gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
              {filteredExercises.map((item) => renderExerciseItem(item, true))}
            </div>
          )
        ) : typeFilter === "video" ? (
          cardView === "grouped" ? (
            <div className="space-y-6">
              {(() => {
                const videos = filteredExercises.filter(
                  (item) => getExerciseKind(item) === "video",
                );
                const grouped = new Map<string, ExerciseRow[]>();
                videos.forEach((video) => {
                  const key = video.category || "Non classé";
                  if (!grouped.has(key)) grouped.set(key, []);
                  grouped.get(key)?.push(video);
                });
                const orderedKeys = [
                  ...CATEGORY_OPTIONS,
                  ...Array.from(grouped.keys()).filter(
                    (key) => !CATEGORY_OPTIONS.includes(key),
                  ),
                ].filter((key) => grouped.has(key));

                return orderedKeys.map((category) => {
                  const categoryItems = grouped.get(category) ?? [];
                  if (!categoryItems.length) return null;
                  return (
                    <section key={category}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        {category}
                      </p>
                      <div className="flex flex-nowrap items-start gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
                        {categoryItems.map((item) =>
                          renderExerciseItem(item, true),
                        )}
                      </div>
                    </section>
                  );
                });
              })()}
            </div>
          ) : (
            <div className="flex flex-nowrap items-start gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
              {filteredExercises.map((item) => renderExerciseItem(item, true))}
            </div>
          )
        ) : typeFilter === "test" ? (
          cardView === "grouped" ? (
            <div className="space-y-6">
              {(() => {
                const tests = filteredExercises.filter(
                  (item) => getExerciseKind(item) === "test",
                );
                const grouped = new Map<string, ExerciseRow[]>();
                const getTestGroup = (test: ExerciseRow) => {
                  const meta = getMeta(test);
                  const unit = meta?.testUnit ?? meta?.unit ?? "";
                  if (unit === "sec") return "Temps";
                  if (unit === "reps") return "Répétition";
                  if (unit === "note10") return "Notes";
                  return "Autres";
                };
                tests.forEach((test) => {
                  const key = getTestGroup(test);
                  if (!grouped.has(key)) grouped.set(key, []);
                  grouped.get(key)?.push(test);
                });
                const orderedKeys = ["Temps", "Répétition", "Notes", "Autres"].filter(
                  (key) => grouped.has(key),
                );

                return orderedKeys.map((category) => {
                  const categoryItems = grouped.get(category) ?? [];
                  if (!categoryItems.length) return null;
                  return (
                    <section key={category}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        {category}
                      </p>
                      <div className="flex flex-nowrap items-stretch gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
                        {categoryItems.map((item) =>
                          renderExerciseItem(item, true, { cardSize: "compact" }),
                        )}
                      </div>
                    </section>
                  );
                });
              })()}
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start justify-items-center gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredExercises.map((item) =>
                renderExerciseItem(item, false, { cardSize: "compact" }),
              )}
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 gap-4 items-start md:grid-cols-2 xl:grid-cols-3">
            {filteredExercises.map((item) => renderExerciseItem(item))}
          </div>
        )}
      </div>

      {showTestModal ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => {
              setShowTestModal(false);
              setEditingTestId(null);
            }}
            aria-label="Fermer"
          />
          <div className="relative z-10 w-full max-w-lg rounded-[28px] border border-white/10 bg-[#0b0f1a] p-6 text-slate-100 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
            <button
              type="button"
              onClick={() => {
                setShowTestModal(false);
                setEditingTestId(null);
              }}
              className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-slate-200 transition hover:bg-white/10"
            >
              ×
            </button>
            <div className="text-center">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="text-sm font-semibold uppercase tracking-[0.18em] text-white">
                  Configure ton test
                </span>
              </div>
            </div>
            <div className="mt-5 grid gap-8 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-6">
              <label className="flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                <span className="whitespace-nowrap">Nom</span>
                <input
                  value={testTitle}
                  onChange={(event) => setTestTitle(event.target.value)}
                  placeholder="Ex: Sprint 20m"
                  className="h-5 w-[170px] rounded-xl border border-white/10 bg-white/5 px-2.5 text-[12px] text-white placeholder:text-slate-500 focus:border-violet-400/60 focus:outline-none"
                />
                    {null}
              </label>
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                <div className="flex items-center gap-3">
                  <span className="whitespace-nowrap">Type de mesure</span>
                    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
                      {[
                        { value: "reps", label: "Répétitions" },
                        { value: "sec", label: "Temps" },
                        { value: "note10", label: "Note /10" },
                      ].map((option) => {
                    const isActive = testUnit === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTestUnit(option.value)}
                        className={[
                          "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] uppercase tracking-[0.16em] transition",
                          isActive
                            ? "border-violet-400/60 bg-violet-500/25 text-white"
                            : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                        ].join(" ")}
                      >
                        {option.value === "reps" ? (
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="6.5" />
                            <path d="M12 8v4l2 2" />
                          </svg>
                        ) : null}
                        {option.value === "sec" ? (
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="7.5" />
                            <path d="M12 7v5l3 2" />
                          </svg>
                        ) : null}
                        {option.value === "note10" ? (
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 4l2.3 4.7 5.2.8-3.8 3.7.9 5.3L12 16.8 7.4 18.5l.9-5.3-3.8-3.7 5.2-.8L12 4z" />
                          </svg>
                        ) : null}
                        {option.label}
                      </button>
                    );
                  })}
                    </div>
                    {null}
                </div>
              </div>
              </div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2">
                    <span className="relative inline-flex h-4 w-4 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={testObjectiveEnabled}
                        onChange={(event) => setTestObjectiveEnabled(event.target.checked)}
                        className="peer absolute inset-0 h-4 w-4 cursor-pointer opacity-0"
                      />
                      <span className="h-4 w-4 rounded-full border border-violet-400/60 bg-white/5 transition peer-checked:border-violet-400 peer-checked:bg-violet-500" />
                    </span>
                    <span>Objectif</span>
                    <span className="text-[10px] font-normal text-slate-500">
                      {!testObjectiveEnabled
                        ? "(optionnel)"
                        : testUnit === "sec"
                          ? "temps à atteindre"
                          : testUnit === "note10"
                            ? "score à atteindre"
                            : "répétitions à atteindre"}
                    </span>
                  </label>
                  {testObjectiveEnabled && testUnit === "sec" ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onPointerDown={() => {
                          setTestTargetTime((prev) => {
                            const total =
                              (prev.min * 60 + prev.sec) * 100 + prev.cs;
                            const next = Math.max(0, total - 1);
                            return {
                              min: Math.floor(next / 6000),
                              sec: Math.floor((next % 6000) / 100),
                              cs: next % 100,
                            };
                          });
                          const hold = window.setTimeout(() => {
                            const interval = window.setInterval(() => {
                              setTestTargetTime((prev) => {
                                const total =
                                  (prev.min * 60 + prev.sec) * 100 + prev.cs;
                                const next = Math.max(0, total - 1);
                                return {
                                  min: Math.floor(next / 6000),
                                  sec: Math.floor((next % 6000) / 100),
                                  cs: next % 100,
                                };
                              });
                            }, 120);
                            targetAdjustRef.current = interval;
                          }, 350);
                          targetHoldRef.current = hold;
                        }}
                        onPointerUp={() => {
                          if (targetHoldRef.current) {
                            window.clearTimeout(targetHoldRef.current);
                            targetHoldRef.current = null;
                          }
                          if (targetAdjustRef.current) {
                            window.clearInterval(targetAdjustRef.current);
                            targetAdjustRef.current = null;
                          }
                        }}
                        onPointerLeave={() => {
                          if (targetHoldRef.current) {
                            window.clearTimeout(targetHoldRef.current);
                            targetHoldRef.current = null;
                          }
                          if (targetAdjustRef.current) {
                            window.clearInterval(targetAdjustRef.current);
                            targetAdjustRef.current = null;
                          }
                        }}
                        onPointerCancel={() => {
                          if (targetHoldRef.current) {
                            window.clearTimeout(targetHoldRef.current);
                            targetHoldRef.current = null;
                          }
                          if (targetAdjustRef.current) {
                            window.clearInterval(targetAdjustRef.current);
                            targetAdjustRef.current = null;
                          }
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[12px] text-white/80 transition hover:bg-white/10"
                        aria-label="Diminuer"
                      >
                        –
                      </button>
                      <div className="flex items-end gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[12px] text-white">
                        <div className="flex flex-col items-center leading-none">
                          <span className="text-[8px] text-slate-400">min</span>
                          <input
                            value={
                              timeFieldEditing.min
                                ? timeFieldText.min
                                : String(testTargetTime.min).padStart(2, "0")
                            }
                            onChange={(event) =>
                              handleTimeFieldChange(
                                "min",
                                event.target.value,
                                testTargetSecRef,
                                99,
                              )
                            }
                            onFocus={(event) => {
                              setTimeFieldEditing((prev) => ({ ...prev, min: true }));
                              setTimeFieldText((prev) => ({ ...prev, min: "" }));
                              event.currentTarget.select();
                            }}
                            onBlur={() =>
                              setTimeFieldEditing((prev) => ({ ...prev, min: false }))
                            }
                            onClick={(event) => event.currentTarget.select()}
                            ref={testTargetMinRef}
                            inputMode="numeric"
                            className="w-7 bg-transparent text-center text-[12px] text-white focus:outline-none"
                          />
                        </div>
                        <span className="pb-1">:</span>
                        <div className="flex flex-col items-center leading-none">
                          <span className="text-[8px] text-slate-400">s</span>
                          <input
                            value={
                              timeFieldEditing.sec
                                ? timeFieldText.sec
                                : String(testTargetTime.sec).padStart(2, "0")
                            }
                            onChange={(event) =>
                              handleTimeFieldChange(
                                "sec",
                                event.target.value,
                                testTargetCsRef,
                                59,
                              )
                            }
                            onFocus={(event) => {
                              setTimeFieldEditing((prev) => ({ ...prev, sec: true }));
                              setTimeFieldText((prev) => ({ ...prev, sec: "" }));
                              event.currentTarget.select();
                            }}
                            onBlur={() =>
                              setTimeFieldEditing((prev) => ({ ...prev, sec: false }))
                            }
                            onClick={(event) => event.currentTarget.select()}
                            ref={testTargetSecRef}
                            inputMode="numeric"
                            className="w-7 bg-transparent text-center text-[12px] text-white focus:outline-none"
                          />
                        </div>
                        <span className="pb-1">.</span>
                        <div className="flex flex-col items-center leading-none">
                          <span className="text-[8px] text-slate-400">ms</span>
                          <input
                            value={
                              timeFieldEditing.cs
                                ? timeFieldText.cs
                                : String(testTargetTime.cs).padStart(2, "0")
                            }
                            onChange={(event) =>
                              handleTimeFieldChange("cs", event.target.value, undefined, 99)
                            }
                            onFocus={(event) => {
                              setTimeFieldEditing((prev) => ({ ...prev, cs: true }));
                              setTimeFieldText((prev) => ({ ...prev, cs: "" }));
                              event.currentTarget.select();
                            }}
                            onBlur={() =>
                              setTimeFieldEditing((prev) => ({ ...prev, cs: false }))
                            }
                            onClick={(event) => event.currentTarget.select()}
                            ref={testTargetCsRef}
                            inputMode="numeric"
                            className="w-7 bg-transparent text-center text-[12px] text-white focus:outline-none"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onPointerDown={() => {
                          setTestTargetTime((prev) => {
                            const total =
                              (prev.min * 60 + prev.sec) * 100 + prev.cs;
                            const next = total + 1;
                            return {
                              min: Math.floor(next / 6000),
                              sec: Math.floor((next % 6000) / 100),
                              cs: next % 100,
                            };
                          });
                          const hold = window.setTimeout(() => {
                            const interval = window.setInterval(() => {
                              setTestTargetTime((prev) => {
                                const total =
                                  (prev.min * 60 + prev.sec) * 100 + prev.cs;
                                const next = total + 1;
                                return {
                                  min: Math.floor(next / 6000),
                                  sec: Math.floor((next % 6000) / 100),
                                  cs: next % 100,
                                };
                              });
                            }, 120);
                            targetAdjustRef.current = interval;
                          }, 350);
                          targetHoldRef.current = hold;
                        }}
                        onPointerUp={() => {
                          if (targetHoldRef.current) {
                            window.clearTimeout(targetHoldRef.current);
                            targetHoldRef.current = null;
                          }
                          if (targetAdjustRef.current) {
                            window.clearInterval(targetAdjustRef.current);
                            targetAdjustRef.current = null;
                          }
                        }}
                        onPointerLeave={() => {
                          if (targetHoldRef.current) {
                            window.clearTimeout(targetHoldRef.current);
                            targetHoldRef.current = null;
                          }
                          if (targetAdjustRef.current) {
                            window.clearInterval(targetAdjustRef.current);
                            targetAdjustRef.current = null;
                          }
                        }}
                        onPointerCancel={() => {
                          if (targetHoldRef.current) {
                            window.clearTimeout(targetHoldRef.current);
                            targetHoldRef.current = null;
                          }
                          if (targetAdjustRef.current) {
                            window.clearInterval(targetAdjustRef.current);
                            targetAdjustRef.current = null;
                          }
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[12px] text-white/80 transition hover:bg-white/10"
                        aria-label="Augmenter"
                      >
                        +
                      </button>
                    </div>
                  ) : testObjectiveEnabled &&
                    (testUnit === "reps" || testUnit === "note10") ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onPointerDown={() => {
                          setTestTargetValue((prev) => Math.max(0, prev - 1));
                          const hold = window.setTimeout(() => {
                            const interval = window.setInterval(() => {
                              setTestTargetValue((prev) => Math.max(0, prev - 1));
                            }, 120);
                            targetAdjustRef.current = interval;
                          }, 350);
                          targetHoldRef.current = hold;
                        }}
                        onPointerUp={() => {
                          if (targetHoldRef.current) {
                            window.clearTimeout(targetHoldRef.current);
                            targetHoldRef.current = null;
                          }
                          if (targetAdjustRef.current) {
                            window.clearInterval(targetAdjustRef.current);
                            targetAdjustRef.current = null;
                          }
                        }}
                        onPointerLeave={() => {
                          if (targetHoldRef.current) {
                            window.clearTimeout(targetHoldRef.current);
                            targetHoldRef.current = null;
                          }
                          if (targetAdjustRef.current) {
                            window.clearInterval(targetAdjustRef.current);
                            targetAdjustRef.current = null;
                          }
                        }}
                        onPointerCancel={() => {
                          if (targetHoldRef.current) {
                            window.clearTimeout(targetHoldRef.current);
                            targetHoldRef.current = null;
                          }
                          if (targetAdjustRef.current) {
                            window.clearInterval(targetAdjustRef.current);
                            targetAdjustRef.current = null;
                          }
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[12px] text-white/80 transition hover:bg-white/10"
                        aria-label="Diminuer"
                      >
                        –
                      </button>
                      <input
                        value={testTargetValue}
                        onChange={(event) =>
                          setTestTargetValue(Math.max(0, Number(event.target.value || 0)))
                        }
                        className="h-5 w-[170px] rounded-xl border border-white/10 bg-white/5 px-2.5 text-center text-[12px] text-white focus:border-violet-400/60 focus:outline-none"
                      />
                      <button
                        type="button"
                        onPointerDown={() => {
                          setTestTargetValue((prev) => prev + 1);
                          const hold = window.setTimeout(() => {
                            const interval = window.setInterval(() => {
                              setTestTargetValue((prev) => prev + 1);
                            }, 120);
                            targetAdjustRef.current = interval;
                          }, 350);
                          targetHoldRef.current = hold;
                        }}
                        onPointerUp={() => {
                          if (targetHoldRef.current) {
                            window.clearTimeout(targetHoldRef.current);
                            targetHoldRef.current = null;
                          }
                          if (targetAdjustRef.current) {
                            window.clearInterval(targetAdjustRef.current);
                            targetAdjustRef.current = null;
                          }
                        }}
                        onPointerLeave={() => {
                          if (targetHoldRef.current) {
                            window.clearTimeout(targetHoldRef.current);
                            targetHoldRef.current = null;
                          }
                          if (targetAdjustRef.current) {
                            window.clearInterval(targetAdjustRef.current);
                            targetAdjustRef.current = null;
                          }
                        }}
                        onPointerCancel={() => {
                          if (targetHoldRef.current) {
                            window.clearTimeout(targetHoldRef.current);
                            targetHoldRef.current = null;
                          }
                          if (targetAdjustRef.current) {
                            window.clearInterval(targetAdjustRef.current);
                            targetAdjustRef.current = null;
                          }
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[12px] text-white/80 transition hover:bg-white/10"
                        aria-label="Augmenter"
                      >
                        +
                      </button>
                    </div>
                  ) : null}
                </div>
                {testObjectiveEnabled && testUnit && testUnit !== "sec" && testUnit !== "reps" && testUnit !== "note10" ? (
                  <input
                    value={testTarget}
                    onChange={(event) => setTestTarget(event.target.value)}
                    placeholder="Ex: 10"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/60 focus:outline-none"
                  />
                ) : null}
              </div>
              <div className="mt-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                <button
                  type="button"
                  onClick={() => setShowTestAdvanced((prev) => !prev)}
                  className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-400 transition hover:text-slate-200"
                >
                  Paramètres avancés
                  <span className="text-xs">{showTestAdvanced ? "▲" : "▼"}</span>
                </button>
                {showTestAdvanced ? (
                  <div className="mt-5 grid gap-6 text-sm">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
                      <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                        <label className="flex items-center gap-2">
                          <span className="relative inline-flex h-4 w-4 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={showTestAttempts}
                              onChange={(event) => setShowTestAttempts(event.target.checked)}
                              className="peer absolute inset-0 h-4 w-4 cursor-pointer opacity-0"
                            />
                            <span className="h-4 w-4 rounded-full border border-violet-400/60 bg-white/5 transition peer-checked:border-violet-400 peer-checked:bg-violet-500" />
                          </span>
                          <span>Nombre d&apos;essai</span>
                        </label>
                        {null}
                      </div>
                      {showTestAttempts ? (
                        <div className="border-t border-white/10 px-3 pb-3 pt-2">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                setTestMaxAttempts((prev) => Math.max(1, prev - 1))
                              }
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] text-white/80 transition hover:bg-white/10"
                              aria-label="Réduire le nombre d'essais"
                            >
                              –
                            </button>
                            <div className="min-w-[36px] rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-center text-[11px] font-semibold text-white/90">
                              {testMaxAttempts}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setTestMaxAttempts((prev) => Math.min(5, prev + 1))
                              }
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] text-white/80 transition hover:bg-white/10"
                              aria-label="Augmenter le nombre d'essais"
                            >
                              +
                            </button>
                          </div>
                          <div className="mt-1 text-[9px] text-slate-500">
                            Max 5 essais
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
                      <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                        <label className="flex items-center gap-2">
                          <span className="relative inline-flex h-4 w-4 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={showTestDuration}
                              onChange={(event) => setShowTestDuration(event.target.checked)}
                              className="peer absolute inset-0 h-4 w-4 cursor-pointer opacity-0"
                            />
                            <span className="h-4 w-4 rounded-full border border-violet-400/60 bg-white/5 transition peer-checked:border-violet-400 peer-checked:bg-violet-500" />
                          </span>
                          <span className="flex items-center gap-2">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <circle cx="12" cy="12" r="8" />
                              <path d="M12 7v5l3 2" />
                            </svg>
                            Durée
                          </span>
                        </label>
                        {null}
                      </div>
                      {showTestDuration ? (
                        <div className="border-t border-white/10 px-3 pb-3 pt-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onPointerDown={() => startAdjustingTestDuration(-1)}
                              onPointerUp={stopAdjustingTestDuration}
                              onPointerLeave={stopAdjustingTestDuration}
                              onPointerCancel={stopAdjustingTestDuration}
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] text-white/80 transition hover:bg-white/10"
                              aria-label="Réduire la durée"
                            >
                              –
                            </button>
                            <div className="min-w-[64px] rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-center text-[11px] font-semibold text-white/90">
                              {String(Math.floor(testDurationSeconds / 60)).padStart(2, "0")}
                              {" : "}
                              {String(testDurationSeconds % 60).padStart(2, "0")}
                            </div>
                            <button
                              type="button"
                              onPointerDown={() => startAdjustingTestDuration(1)}
                              onPointerUp={stopAdjustingTestDuration}
                              onPointerLeave={stopAdjustingTestDuration}
                              onPointerCancel={stopAdjustingTestDuration}
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] text-white/80 transition hover:bg-white/10"
                              aria-label="Augmenter la durée"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
                      <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                        <label className="flex items-center gap-2">
                          <span className="relative inline-flex h-4 w-4 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={showTestVariants}
                              onChange={(event) => setShowTestVariants(event.target.checked)}
                              className="peer absolute inset-0 h-4 w-4 cursor-pointer opacity-0"
                            />
                            <span className="h-4 w-4 rounded-full border border-violet-400/60 bg-white/5 transition peer-checked:border-violet-400 peer-checked:bg-violet-500" />
                          </span>
                          <span>Variantes</span>
                        </label>
                        {null}
                      </div>
                      {showTestVariants ? (
                        <div className="border-t border-white/10 px-3 pb-3 pt-2">
                          <div className="flex flex-wrap gap-2">
                            {["Pied droit", "Pied gauche", "Mixe"].map((variant) => {
                              const isActive = selectedTestVariants.includes(variant);
                              return (
                                <button
                                  key={variant}
                                  type="button"
                                  onClick={() =>
                                    setSelectedTestVariants((prev) =>
                                      prev.includes(variant)
                                        ? prev.filter((item) => item !== variant)
                                        : [...prev, variant],
                                    )
                                  }
                                  className={[
                                    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[9px] uppercase tracking-[0.16em] transition",
                                    isActive
                                      ? "border-violet-400/60 bg-violet-500/25 text-white"
                                      : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                                  ].join(" ")}
                                >
                                  {variant}
                                </button>
                              );
                            })}
                            <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-slate-300">
                              Autre
                              <input
                                value={customTestVariant}
                                onChange={(event) => setCustomTestVariant(event.target.value)}
                                placeholder="..."
                                className="w-16 bg-transparent text-[9px] uppercase tracking-[0.16em] text-white placeholder:text-slate-500 focus:outline-none"
                              />
                            </label>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
                      <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                        <label className="flex items-center gap-2">
                          <span className="relative inline-flex h-4 w-4 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={showTestNotes}
                              onChange={(event) => setShowTestNotes(event.target.checked)}
                              className="peer absolute inset-0 h-4 w-4 cursor-pointer opacity-0"
                            />
                            <span className="h-4 w-4 rounded-full border border-violet-400/60 bg-white/5 transition peer-checked:border-violet-400 peer-checked:bg-violet-500" />
                          </span>
                          <span>Notes</span>
                        </label>
                        {null}
                      </div>
                      {showTestNotes ? (
                        <div className="border-t border-white/10 px-3 pb-3 pt-2">
                          <textarea
                            value={testNotes}
                            onChange={(event) => setTestNotes(event.target.value)}
                            placeholder="Indique la consigne ou le protocole."
                            className="h-24 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/60 focus:outline-none"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowTestModal(false);
                  setEditingTestId(null);
                }}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreateTest}
                disabled={busyId === "create-test"}
                className="rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
              >
                Enregistrer
              </button>
            </div>
            {testSaveError ? (
              <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-100">
                {testSaveError}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {testRunnerItem ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => {
              setTestRunnerItem(null);
              setTestRunnerRunning(false);
              setShowTestPlayerSelect(false);
              setShowTestRanking(false);
            }}
            aria-label="Fermer"
          />
          <div className="relative z-10 w-full max-w-xl rounded-3xl border border-white/10 bg-gradient-to-b from-[#060b18] to-[#040712] p-3 text-slate-100 shadow-2xl backdrop-blur-xl">
            <button
              type="button"
              onClick={() => {
                setTestRunnerItem(null);
                setTestRunnerRunning(false);
                setShowTestPlayerSelect(false);
                setShowTestRanking(false);
              }}
              className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-slate-200 transition hover:bg-white/10"
            >
              ×
            </button>
            {(() => {
              const meta = getMeta(testRunnerItem);
              const unit = meta?.testUnit ?? meta?.unit ?? "";
              const typeLabel = getTestUnitLabel(unit);
              const isTime = unit === "sec";
              const objectiveLabel = meta?.testTarget ?? "";
              const maxAttempts = Math.min(
                5,
                Math.max(1, Number(meta?.testMaxAttempts ?? 3)),
              );
              const selectedPlayers = testRunnerPlayers.filter((player) =>
                testRunnerSelectedPlayers.has(player.id),
              );
              const resolvedActiveId =
                testRunnerActivePlayerId &&
                testRunnerSelectedPlayers.has(testRunnerActivePlayerId)
                  ? testRunnerActivePlayerId
                  : selectedPlayers[0]?.id ?? null;
              const activePlayer = testRunnerPlayers.find(
                (player) => player.id === resolvedActiveId,
              );
              const activeResult = resolvedActiveId
                ? testRunnerResults[resolvedActiveId]
                : undefined;
              const formatResultValue = (result?: { timeMs?: number; score?: string }) =>
                isTime
                  ? result?.timeMs
                    ? formatTimer(result.timeMs)
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
                const result = testRunnerResults[player.id];
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
              const hasObjectiveResults = Object.values(testRunnerResults).some(
                (result) =>
                  (result?.history?.length ?? 0) > 0 ||
                  typeof result?.timeMs === "number" ||
                  Boolean(result?.score),
              );
              const activeValue = formatResultValue(activeResult);
              const activeHistory = activeResult?.history ?? [];
              const activeAttemptCount =
                activeHistory.length + (activeValue ? 1 : 0);
              const canAddAttempt = activeAttemptCount < maxAttempts && Boolean(activeValue);
              const activeAttempts = [
                ...activeHistory.map((entry) => {
                  const label = formatResultValue(entry);
                  if (!label) return { label: "—", success: null };
                  if (isTime) {
                    if (typeof entry.timeMs !== "number" || targetMs === null)
                      return { label, success: null };
                    return { label, success: entry.timeMs <= targetMs };
                  }
                  const scoreValue = Number(entry.score);
                  if (!Number.isFinite(scoreValue) || targetScore === null)
                    return { label, success: null };
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
                  const result = testRunnerResults[player.id];
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
                      bestLabel: formatTimer(bestValue),
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
                  ): entry is { id: string; name: string; bestValue: number; bestLabel: string } =>
                    Boolean(entry),
                )
                .sort((a, b) =>
                  isTime ? a.bestValue - b.bestValue : b.bestValue - a.bestValue,
                );
              const activeIndex = resolvedActiveId
                ? selectedPlayers.findIndex(
                    (player) => player.id === resolvedActiveId,
                  )
                : -1;
              const goPrevPlayer = () => {
                if (!selectedPlayers.length) return;
                if (activeIndex <= 0) {
                  setTestRunnerActivePlayerId(
                    selectedPlayers[selectedPlayers.length - 1]?.id ?? null,
                  );
                } else {
                  setTestRunnerActivePlayerId(
                    selectedPlayers[activeIndex - 1]?.id ?? null,
                  );
                }
              };
              const goNextPlayer = () => {
                if (!selectedPlayers.length) return;
                if (activeIndex === -1 || activeIndex >= selectedPlayers.length - 1) {
                  setTestRunnerActivePlayerId(selectedPlayers[0]?.id ?? null);
                } else {
                  setTestRunnerActivePlayerId(
                    selectedPlayers[activeIndex + 1]?.id ?? null,
                  );
                }
              };
              return (
                <div className="space-y-3">
                  {objectiveLabel ? (
                    <div className="absolute bottom-2 left-2 z-20">
                      <div className="flex items-center gap-2 text-[10px]">
                        <svg
                          viewBox="0 0 24 24"
                          className={[
                            "h-3.5 w-3.5",
                            hasObjectiveResults ? "text-emerald-400" : "text-slate-300",
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
                        <span className="font-semibold text-white">{objectiveLabel}</span>
                        <button
                          type="button"
                          onClick={() => setShowObjectivePanel(true)}
                          className={[
                            "ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border transition",
                            hasObjectiveResults
                              ? "border-violet-400/60 bg-violet-500/25 text-violet-300 hover:bg-violet-500/35"
                              : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                          ].join(" ")}
                          aria-label="Voir les résultats"
                          title="Voir les résultats"
                          ref={objectiveButtonRef}
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
                      {showObjectivePanel ? (
                        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-2xl border border-white/10 bg-[#0b1020] p-3 text-xs text-slate-200 shadow-[0_16px_36px_rgba(0,0,0,0.45)]">
                          <div ref={objectivePanelRef}>
                          <button
                            type="button"
                            onClick={() => setShowObjectivePanel(false)}
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
                              <span className="text-[10px] text-slate-500">Aucun</span>
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
                              <span className="text-[10px] text-slate-500">Aucun</span>
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
                        {testRunnerItem.title}
                      </h3>
                    </div>
                  </div>
                  <div className="absolute bottom-2 right-2 z-20 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTestUndo}
                      disabled={!testUndoLabel}
                      className={[
                        "inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[12px] transition",
                        testUndoLabel
                          ? "text-white/90 hover:bg-white/10"
                          : "cursor-not-allowed text-white/35",
                      ].join(" ")}
                      aria-label="Annuler"
                      title="Annuler"
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
                        <path d="M9 14L4 9l5-5" />
                        <path d="M4 9h8a7 7 0 1 1 0 14h-2" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowTestRanking((prev) => !prev)}
                      className="p-0 text-white transition hover:text-violet-100"
                      aria-label="Classement"
                      title="Classement"
                      ref={testRankingButtonRef}
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
                        <rect x="4" y="10.5" width="5" height="8.5" rx="1.2" />
                        <rect x="9.5" y="5.5" width="5" height="13.5" rx="1.2" />
                        <rect x="15" y="8.5" width="5" height="10.5" rx="1.2" />
                      </svg>
                    </button>
                    {testResetMenuOpen ? (
                      <div
                        ref={testResetMenuRef}
                        className="absolute bottom-full right-8 mb-2 w-56 rounded-xl border border-white/10 bg-[#0b1020] p-3 text-xs text-slate-200 shadow-[0_16px_36px_rgba(0,0,0,0.45)]"
                      >
                        {testResetConfirm ? (
                          <div>
                            <div className="text-[9px] uppercase tracking-[0.3em] text-slate-400">
                              Confirmation
                            </div>
                            <div className="mt-2 text-[11px] text-slate-200">
                              {testResetConfirm === "current"
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
                                onClick={() => setTestResetConfirm(null)}
                                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-200 transition hover:bg-white/10"
                              >
                                Annuler
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!resolvedActiveId) return;
                                  if (testResetConfirm === "current") {
                                    setTestRunnerElapsed(0);
                                    setTestRunnerRunning(false);
                                    testRunnerStartRef.current = null;
                                    setTestRunnerResults((prev) => ({
                                      ...prev,
                                      [resolvedActiveId]: {
                                        ...prev[resolvedActiveId],
                                        timeMs: undefined,
                                        score: "",
                                      },
                                    }));
                                  } else {
                                    setTestRunnerElapsed(0);
                                    setTestRunnerRunning(false);
                                    testRunnerStartRef.current = null;
                                    setTestRunnerResults((prev) => ({
                                      ...prev,
                                      [resolvedActiveId]: {
                                        history: [],
                                        timeMs: undefined,
                                        score: "",
                                      },
                                    }));
                                  }
                                  setTestResetConfirm(null);
                                  setTestResetMenuOpen(false);
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
                              onClick={() => setTestResetConfirm("current")}
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-left text-[11px] text-slate-200 transition hover:bg-white/10"
                            >
                              Réinitialiser l’essai en cours
                            </button>
                            <button
                              type="button"
                              onClick={() => setTestResetConfirm("player")}
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-left text-[11px] text-slate-200 transition hover:bg-white/10"
                            >
                              Réinitialiser le joueur
                            </button>
                          </div>
                        )}
                      </div>
                    ) : null}
                    {showTestRanking ? (
                      <div
                        ref={testRankingPanelRef}
                        className="absolute bottom-full right-0 mb-2 w-56 rounded-xl border border-white/10 bg-[#0b1020] p-3 text-xs text-slate-200 shadow-[0_16px_36px_rgba(0,0,0,0.45)]"
                      >
                        <button
                          type="button"
                          onClick={() => setShowTestRanking(false)}
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
                        onClick={goPrevPlayer}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-black/40 text-[12px] text-white/80 transition hover:bg-white/10"
                        aria-label="Joueur précédent"
                      >
                        ◀
                      </button>
                      <div className="flex-1">
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {testRunnerPlayersLoading ? (
                            <div className="text-[11px] text-slate-400">
                              Chargement des joueurs…
                            </div>
                      ) : testRunnerPlayersError ? (
                        <div className="text-[11px] text-rose-200">
                          {testRunnerPlayersError}
                        </div>
                      ) : selectedPlayers.length === 0 ? (
                        <div className="text-[11px] text-slate-400">
                          Aucun joueur.
                        </div>
                      ) : (
                        selectedPlayers.map((player) => {
                          const name = `${player.first_name ?? ""} ${
                            player.last_name ?? ""
                          }`.trim();
                          const isActive = resolvedActiveId === player.id;
                          const result = testRunnerResults[player.id];
                          const displayValue = formatResultValue(result);
                          const isDone =
                            Boolean(displayValue) ||
                            (result?.history?.length ?? 0) > 0;
                          return (
                            <button
                              key={player.id}
                              type="button"
                              onClick={() => setTestRunnerActivePlayerId(player.id)}
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
                        onClick={goNextPlayer}
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
                            const isLast = index === attemptsToShow.length - 1;
                            const isHistoryEntry = index < activeHistory.length;
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
                                        const currentValue = formatResultValue(activeResult);
                                        if (!currentValue) return;
                                        const currentCount =
                                          (activeResult?.history?.length ?? 0) +
                                          (currentValue ? 1 : 0);
                                        if (currentCount >= maxAttempts) return;
                                        setTestRunnerRunning(false);
                                        testRunnerStartRef.current = null;
                                        setTestRunnerElapsed(0);
                                        setTestRunnerResults((prev) => {
                                          const current = prev[resolvedActiveId] ?? {};
                                          const history = [...(current.history ?? [])];
                                          history.push({
                                            timeMs: current.timeMs,
                                            score: current.score,
                                          });
                                          return {
                                            ...prev,
                                            [resolvedActiveId]: {
                                              ...current,
                                              history,
                                              timeMs: undefined,
                                              score: "",
                                            },
                                          };
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
                                    setTestRunnerResults((prev) => {
                                      const current = prev[resolvedActiveId] ?? {};
                                      const history = [...(current.history ?? [])];
                                      if (isHistoryEntry) {
                                        history.splice(index, 1);
                                      } else {
                                        delete current.timeMs;
                                        delete current.score;
                                      }
                                      return {
                                        ...prev,
                                        [resolvedActiveId]: {
                                          ...current,
                                          history,
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
                                const currentValue = formatResultValue(activeResult);
                                if (!currentValue) return;
                                const currentCount =
                                  (activeResult?.history?.length ?? 0) +
                                  (currentValue ? 1 : 0);
                                if (currentCount >= maxAttempts) return;
                                setTestRunnerRunning(false);
                                testRunnerStartRef.current = null;
                                setTestRunnerElapsed(0);
                                setTestRunnerResults((prev) => {
                                  const current = prev[resolvedActiveId] ?? {};
                                  const history = [...(current.history ?? [])];
                                  history.push({
                                    timeMs: current.timeMs,
                                    score: current.score,
                                  });
                                  return {
                                    ...prev,
                                    [resolvedActiveId]: {
                                      ...current,
                                      history,
                                      timeMs: undefined,
                                      score: "",
                                    },
                                  };
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
                                if (testRunnerRunning) {
                                  const prevResult = testRunnerResults[resolvedActiveId];
                                  const prevHistory = prevResult?.history
                                    ? [...prevResult.history]
                                    : [];
                                  const prevTime = prevResult?.timeMs;
                                  const prevScore = prevResult?.score ?? "";
                                  setTestRunnerRunning(false);
                                  testRunnerStartRef.current = null;
                                  if (currentHistoryCount >= maxAttempts) {
                                    setTestRunnerElapsed(0);
                                    return;
                                  }
                                  const attemptTime = testRunnerElapsed;
                                  setTestRunnerElapsed(0);
                                  setTestRunnerResults((prev) => {
                                    const current = prev[resolvedActiveId] ?? {};
                                    const history = [...(current.history ?? [])];
                                    history.push({ timeMs: attemptTime, score: current.score });
                                    return {
                                      ...prev,
                                      [resolvedActiveId]: {
                                        ...current,
                                        history,
                                        timeMs: undefined,
                                        score: "",
                                      },
                                    };
                                  });
                                  triggerTestUndo("Temps enregistré", () => {
                                    setTestRunnerResults((prev) => {
                                      if (!resolvedActiveId) return prev;
                                      if (!prevResult) {
                                        const next = { ...prev };
                                        delete next[resolvedActiveId];
                                        return next;
                                      }
                                      return {
                                        ...prev,
                                        [resolvedActiveId]: {
                                          ...prevResult,
                                          history: prevHistory,
                                          timeMs: prevTime,
                                          score: prevScore,
                                        },
                                      };
                                    });
                                  });
                                  const nextCount = currentHistoryCount + 1;
                                  if (nextCount >= maxAttempts && selectedPlayers.length) {
                                    const nextIndex =
                                      activeIndex === -1
                                        ? 0
                                        : (activeIndex + 1) % selectedPlayers.length;
                                    setTestRunnerActivePlayerId(
                                      selectedPlayers[nextIndex]?.id ?? null,
                                    );
                                  }
                                } else {
                                  if (currentHistoryCount >= maxAttempts) return;
                                  setTestRunnerRunning(true);
                                }
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-white shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition hover:bg-violet-500"
                              aria-label={testRunnerRunning ? "Stop" : "Démarrer"}
                            >
                              {testRunnerRunning ? "■" : "▶"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!resolvedActiveId) return;
                                if (testRunnerRunning) {
                                  setTestRunnerRunning(false);
                                } else {
                                  setTestRunnerRunning(true);
                                }
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[10px] text-white/80 transition hover:bg-white/20"
                              aria-label="Pause"
                            >
                              ❚❚
                            </button>
                            <div className="min-w-[104px] rounded-2xl bg-white/5 px-2 py-1 text-center text-[14px] font-semibold text-white">
                              {formatTimer(testRunnerElapsed)}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (!resolvedActiveId) return;
                                setTestRunnerElapsed(0);
                                setTestRunnerRunning(false);
                                testRunnerStartRef.current = null;
                                setTestRunnerResults((prev) => {
                                  const next = { ...prev };
                                  if (next[resolvedActiveId]) {
                                    delete next[resolvedActiveId].timeMs;
                                  }
                                  return next;
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
                                if (testRunnerRunning) {
                                  setTestRunnerRunning(false);
                                  setTestRunnerElapsed(0);
                                  testRunnerStartRef.current = null;
                                } else {
                                  setTestRunnerRunning(true);
                                }
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-white shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition hover:bg-violet-500"
                              aria-label={
                                testRunnerRunning ? "Pause" : "Démarrer"
                              }
                            >
                              {testRunnerRunning ? "❚❚" : "▶"}
                            </button>
                            <div className="min-w-[104px] rounded-2xl bg-white/5 px-2 py-1 text-center text-[14px] font-semibold text-white">
                              {formatTimer(testRunnerElapsed)}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setTestRunnerElapsed(0);
                                setTestRunnerRunning(false);
                                testRunnerStartRef.current = null;
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/80 transition hover:bg-white/15"
                              aria-label="Revenir au début"
                            >
                              ↺
                            </button>
                            <input
                              value={
                                resolvedActiveId
                                  ? testRunnerResults[resolvedActiveId]?.score ?? ""
                                  : ""
                              }
                              onChange={(event) =>
                                resolvedActiveId
                                  ? setTestRunnerResults((prev) => ({
                                      ...prev,
                                      [resolvedActiveId]: {
                                        ...prev[resolvedActiveId],
                                        score: event.target.value,
                                      },
                                    }))
                                  : null
                              }
                              placeholder="Score"
                              disabled={!resolvedActiveId}
                              className="h-7 w-20 rounded-2xl border border-white/10 bg-white/5 px-2 text-center text-[10px] text-white placeholder:text-slate-500 focus:border-violet-400/60 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (!resolvedActiveId) return;
                                const previousScore =
                                  testRunnerResults[resolvedActiveId]?.score ?? "";
                                setTestRunnerResults((prev) => {
                                  const current = Number(prev[resolvedActiveId]?.score ?? 0);
                                  return {
                                    ...prev,
                                    [resolvedActiveId]: {
                                      ...prev[resolvedActiveId],
                                      score: String(current + 1),
                                    },
                                  };
                                });
                                triggerTestUndo("Score +1", () => {
                                  setTestRunnerResults((inner) => ({
                                    ...inner,
                                    [resolvedActiveId]: {
                                      ...inner[resolvedActiveId],
                                      score: previousScore,
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
              );
            })()}
          </div>
        </div>
      ) : null}
      

      {pendingDelete ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b0f1f] p-6 text-slate-100 shadow-[0_25px_60px_rgba(0,0,0,0.6)]">
            <h3 className="text-lg font-semibold">Supprimer l’exercice ?</h3>
            <p className="mt-2 text-sm text-slate-400">
              Cette action est définitive.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={async () => {
                  const toDelete = pendingDelete;
                  setPendingDelete(null);
                  await handleDelete(toDelete);
                }}
                className="rounded-full border border-rose-400/30 bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/25"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {expandedCard ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setExpandedCard(null)}
            aria-label="Fermer"
          />
          <button
            type="button"
            onClick={() => setExpandedCard(null)}
            className="fixed right-5 top-5 z-[1305] flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-white text-xl font-bold text-black shadow-[0_12px_28px_rgba(0,0,0,0.6)]"
            aria-label="Fermer"
          >
            ✕
          </button>
          <div className="relative z-10 w-full max-w-[420px]">
            {(() => {
              const expandedRotate = false;
              const expandedTransform = "scaleX(1.2) scaleY(1.02)";
              const expandedPreview = getCardPreview(expandedCard);
              return (
                <ExerciseCardFrame
                  category={expandedCard.category || "Non classé"}
                  label={expandedCard.title || "Carte exercice"}
                  className="w-full"
                  mediaAspect="portrait"
                  cardScale={0.9}
                  rotateMedia={expandedRotate}
                  mediaTransform={expandedTransform}
                  footerLabel={cardNumberMap[expandedCard.id]}
                >
                  {expandedPreview ? (
                    <img
                      src={
                        expandedPreview.src
                      }
                      alt={expandedCard.title}
                      className="block h-full w-full object-contain"
                      style={
                        expandedPreview.rotate
                          ? { transform: "rotate(-90deg)", transformOrigin: "center" }
                          : undefined
                      }
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-black/40 via-black/10 to-black/40" />
                  )}
                </ExerciseCardFrame>
              );
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
