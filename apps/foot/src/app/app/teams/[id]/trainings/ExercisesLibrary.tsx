"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";
import { ExerciseVideoCard } from "@/components/ExerciseVideoCard";
import ExerciseCardFrame from "@/components/ExerciseCardFrame";

type ExerciseRow = {
  id: string;
  title: string;
  category: string;
  duration: number;
  type: string;
  is_global: boolean;
  created_at: string | null;
  updated_at: string | null;
  animation_data?: unknown | null;
};

type ToastState = {
  kind: "success" | "error";
  message: string;
} | null;

type ExerciseKind = "animation" | "video" | "card";
type TypeFilter = "all" | "animation" | "video" | "card";
type FilterGroup = "categories" | "types" | "objectives" | "levels";

const TYPE_TABS = [
  { key: "all", label: "TOUS" },
  { key: "animation", label: "ANIMATIONS" },
  { key: "video", label: "VIDÉOS" },
  { key: "card", label: "CARTES" },
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

export default function ExercisesLibrary() {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [items, setItems] = useState<ExerciseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [pendingDelete, setPendingDelete] = useState<ExerciseRow | null>(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [cardRatios, setCardRatios] = useState<Record<string, string>>({});
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
  const [openFilterSections, setOpenFilterSections] = useState({
    categories: true,
    types: false,
    objectives: false,
    levels: false,
  });

  const showScrollDebug = true; // TODO: disable once widths are validated.

  const getMeta = (item: ExerciseRow) => {
    const payload = item.animation_data as Record<string, any> | null;
    return (payload?.metadata ?? payload?.meta ?? {}) as Record<string, any>;
  };

  const getExerciseKind = (item: ExerciseRow): "animation" | "video" | "card" => {
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

  const getScrollWidthClass = (kind: ExerciseKind) => {
    if (kind === "animation") {
      return "w-[420px] max-w-[82vw] min-w-[340px]";
    }
    if (kind === "video") {
      return "w-[640px] max-w-[94vw] min-w-[480px]";
    }
    return "w-[240px] max-w-[70vw] min-w-[200px]";
  };

  const getScrollWidthStyle = (kind: ExerciseKind) => {
    if (kind === "animation") {
      return { width: 420, minWidth: 340, maxWidth: "82vw", flex: "0 0 auto" };
    }
    if (kind === "video") {
      return { width: 640, minWidth: 480, maxWidth: "94vw", flex: "0 0 auto" };
    }
    return { width: 240, minWidth: 200, maxWidth: "70vw", flex: "0 0 auto" };
  };

  const renderExerciseItem = (item: ExerciseRow, compact = false) => {
    const kind = getExerciseKind(item);
    const isScroll = compact;
    const wrapperClassName = [
      "relative",
      isScroll
        ? kind === "card"
          ? "shrink-0 snap-start h-full"
          : "flex-none snap-start"
        : "w-full",
      isScroll ? getScrollWidthClass(kind) : "",
      isScroll && showScrollDebug ? "outline outline-2 outline-red-500/40" : "",
      !isScroll && kind === "card" ? "justify-self-center" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const wrapperStyle = isScroll ? getScrollWidthStyle(kind) : undefined;

    if (kind === "card") {
      const cardMediaRatio = compact ? undefined : cardRatios[item.id];
      const pitchOrientation = getPitchOrientation(item);
      const rotateCardMedia =
        pitchOrientation === "landscape"
          ? true
          : pitchOrientation === "portrait"
            ? false
            : true;
      const cardNumber = cardNumberMap[item.id];
      const cardMeta = getMeta(item);
      const cardInfoOpen = infoCardId === item.id;
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
            mediaMinHeight={240}
            mediaRatio={cardMediaRatio}
            cardScale={1}
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
                  className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/10"
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
            {getCardCover(item) ? (
              <img
                src={getCardCover(item) as string}
                alt={item.title}
                className="block h-full w-full object-contain"
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (!naturalWidth || !naturalHeight) return;
                  const ratio = `${naturalHeight} / ${naturalWidth}`;
                  setCardRatios((current) =>
                    current[item.id] === ratio
                      ? current
                      : { ...current, [item.id]: ratio },
                  );
                }}
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
              </div>
            </div>
          ) : null}
        </div>
      );
    }

    if (item.is_global || kind !== "animation") {
      return (
        <div
          key={item.id}
          className={[
            wrapperClassName,
            "flex h-full flex-col rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_24px_50px_rgba(0,0,0,0.55)] backdrop-blur",
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
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-semibold text-white">{item.title}</h3>
            {item.is_global ? (
              <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-200">
                Template
              </span>
            ) : null}
          </div>
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
          {item.is_global ? (
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
    const { data, error } = await supabase
      .from("training_exercises")
      .select(
        "id,title,category,duration,type,is_global,created_at,updated_at",
      )
      .order("created_at", { ascending: false });
    if (error) {
      showToast("error", error.message);
      setItems([]);
    } else {
      const baseItems = ((data as ExerciseRow[]) ?? []).map((item) => ({
        ...item,
        animation_data: null,
      }));
      setItems(baseItems);
    }
    setLoading(false);
  };

  const prefetchAnimationData = async (ids: string[]) => {
    if (!ids.length) return;
    const { data, error } = await supabase
      .from("training_exercises")
      .select("id,animation_data")
      .in("id", ids);
    if (error || !data) return;
    const map = new Map(
      (data as Array<{ id: string; animation_data: unknown }>).map((row) => [
        row.id,
        row.animation_data,
      ]),
    );
    setItems((prev) =>
      prev.map((item) =>
        map.has(item.id)
          ? { ...item, animation_data: map.get(item.id) }
          : item,
      ),
    );
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
    };
  }, []);

  const triggerResultsAnimation = () => {
    if (animationTimerRef.current) {
      window.clearTimeout(animationTimerRef.current);
    }
    setAnimateResults(false);
    animationTimerRef.current = window.setTimeout(() => {
      setAnimateResults(true);
    }, 20);
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
    const payload = item.animation_data as Record<string, any> | null;
    return (
      payload?.coverImageUrl ??
      payload?.pitchState?.coverImageUrl ??
      null
    );
  };

  const getPitchOrientation = (item: ExerciseRow) => {
    const payload = item.animation_data as Record<string, any> | null;
    return (
      payload?.pitchOrientation ??
      payload?.pitchState?.pitchOrientation ??
      payload?.meta?.pitchOrientation ??
      payload?.metadata?.pitchOrientation ??
      null
    ) as "landscape" | "portrait" | null;
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

  const missingAnimationIds = useMemo(() => {
    if (!items.length) return [];
    return filteredExercises
      .filter((item) => !item.animation_data)
      .slice(0, 12)
      .map((item) => item.id);
  }, [filteredExercises, items.length]);

  useEffect(() => {
    if (!missingAnimationIds.length) return;
    prefetchAnimationData(missingAnimationIds);
  }, [missingAnimationIds]);


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
                </>
              );
            })()}
          </div>
        ) : typeFilter === "animation" ? (
          <div className="flex flex-nowrap items-start gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
            {filteredExercises.map((item) => renderExerciseItem(item, true))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 items-start md:grid-cols-2 xl:grid-cols-3">
            {filteredExercises.map((item) => renderExerciseItem(item))}
          </div>
        )}
      </div>
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
          <div className="relative z-10 w-full max-w-[560px]">
            {(() => {
              const expandedOrientation = getPitchOrientation(expandedCard);
              const expandedRotate =
                expandedOrientation === "landscape"
                  ? true
                  : expandedOrientation === "portrait"
                    ? false
                    : true;
              const expandedTransform = expandedRotate
                ? "rotate(90deg) scale(0.82)"
                : "scale(0.82)";
              return (
                <ExerciseCardFrame
                  category={expandedCard.category || "Non classé"}
                  label={expandedCard.title || "Carte exercice"}
                  className="w-full"
                  mediaAspect="portrait"
                  mediaRatio={cardRatios[expandedCard.id]}
                  cardScale={1}
                  rotateMedia={expandedRotate}
                  mediaTransform={expandedTransform}
                  footerLabel={cardNumberMap[expandedCard.id]}
                >
                  {getCardCover(expandedCard) ? (
                    <img
                      src={getCardCover(expandedCard) as string}
                      alt={expandedCard.title}
                      className="block h-full w-full object-contain"
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
