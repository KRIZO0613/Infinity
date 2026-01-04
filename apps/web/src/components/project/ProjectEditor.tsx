"use client";

import Link from "next/link";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import {
  useProjectStore,
  type Project,
  type ProjectPage,
  type SummaryBlock,
  type SummaryBlockType,
  type SummarySection,
} from "@/store/projectStore";
import BlockSubtitle from "./BlockSubtitle";
import BlockText from "./BlockText";
import BlockTitle from "./BlockTitle";
import { HighlightIcon, PaletteIcon } from "./icons";
import SectionBlock from "./SectionBlock";
import SummaryCardBlock from "./SummaryCardBlock";
import SummaryImageBlock from "./SummaryImageBlock";
import SummaryVideoBlock from "./SummaryVideoBlock";
import SummaryTableBlock from "./SummaryTableBlock";
import SummaryRichTextEditor from "./SummaryRichTextEditor";
import styles from "./ProjectEditor.module.css";
import type { BlockAlign, BlockKey, SummaryStyle, TitleAlign } from "./types";

type DragState = {
  key: BlockKey;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

const BLOCK_WIDTH: Record<BlockKey, number> = {
  title: 360,
  subtitle: 320,
  description: 380,
  summary: 300,
};

const BLOCK_MIN_WIDTH = 140;
const TITLE_ANCHOR_Y = 18;

const BLOCK_DEFAULT_Y: Record<BlockKey, number> = {
  title: TITLE_ANCHOR_Y,
  subtitle: 140,
  description: 220,
  summary: 320,
};

const SUMMARY_STYLES = [
  { value: "none", label: "Aucun" },
  { value: "numeric", label: "1 2 3" },
  { value: "roman", label: "I II III" },
  { value: "alpha", label: "A B C" },
] as const;

const TITLE_ALIGN_OPTIONS = [
  { value: "left", label: "Gauche" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Droite" },
  { value: "free", label: "Personnaliser" },
] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

type ProjectEditorProps = {
  projectId: string;
};

const buildLegacyPage = (source: Project): ProjectPage => {
  const baseId = source.id ? `page-${source.id}-1` : `page-${Date.now()}-1`;
  const summarySections =
    source.summarySections ??
    (source.summary ?? []).map((title, index) => ({
      id: `${baseId}-summary-${index}`,
      title,
      blocks: [],
    }));
  return {
    id: baseId,
    name: "Page 1",
    pageTitle: source.pageTitle ?? "",
    subtitle: source.subtitle ?? "",
    description: source.description ?? "",
    summary: source.summary ?? [],
    summarySections,
    summaryStyle: source.summaryStyle ?? "none",
    blocks: source.blocks ?? {},
  };
};

export default function ProjectEditor({ projectId }: ProjectEditorProps) {
  const projects = useProjectStore((s) => s.projects);
  const setProjects = useProjectStore((s) => s.setProjects);
  const updateProject = useProjectStore((s) => s.updateProject);
  const storePersist = (useProjectStore as typeof useProjectStore & {
    persist?: {
      hasHydrated?: () => boolean;
      onFinishHydration?: (cb: () => void) => (() => void) | void;
    };
  }).persist;
  const [hasHydrated, setHasHydrated] = useState(false);
  const [repairAttempted, setRepairAttempted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [customizeMode, setCustomizeMode] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [summaryPanelOpen, setSummaryPanelOpen] = useState(false);
  const [summaryPanelPosition, setSummaryPanelPosition] = useState<{ top: number; left: number } | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [titleAlignOpen, setTitleAlignOpen] = useState(false);
  const [blockAlignOpen, setBlockAlignOpen] = useState<Exclude<BlockKey, "title"> | null>(null);
  const [activeBlockKey, setActiveBlockKey] = useState<BlockKey | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [pageCreatorOpen, setPageCreatorOpen] = useState(false);
  const [pageNameDraft, setPageNameDraft] = useState("");
  const [titleOffset, setTitleOffset] = useState(64);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pagePanelRef = useRef<HTMLDivElement | null>(null);
  const pageTriggerRef = useRef<HTMLButtonElement | null>(null);
  const summaryPanelRef = useRef<HTMLDivElement | null>(null);
  const summaryAnchorRef = useRef<HTMLElement | null>(null);
  const summarySectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const titleAlignRef = useRef<HTMLDivElement | null>(null);
  const titleAlignTriggerRef = useRef<HTMLButtonElement | null>(null);
  const titleColorInputRef = useRef<HTMLInputElement | null>(null);
  const titleHighlightInputRef = useRef<HTMLInputElement | null>(null);
  const colorInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const highlightInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const blockAlignRefs = useRef<Record<Exclude<BlockKey, "title">, HTMLDivElement | null>>({
    subtitle: null,
    description: null,
    summary: null,
  });
  const blockAlignTriggerRefs = useRef<Record<Exclude<BlockKey, "title">, HTMLButtonElement | null>>({
    subtitle: null,
    description: null,
    summary: null,
  });
  const blockRefs = useRef<Record<BlockKey, HTMLDivElement | null>>({
    title: null,
    subtitle: null,
    description: null,
    summary: null,
  });

  const decodedProjectId = useMemo(() => decodeURIComponent(projectId), [projectId]);

  const pageShellStyle: CSSProperties = {
    marginTop: -6,
    padding: "2px 10px",
  };
  const pageChipStyle: CSSProperties = {
    fontSize: "9px",
    letterSpacing: "0.03em",
    padding: "2px 6px",
    lineHeight: 1.1,
    cursor: "pointer",
  };
  const headerRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "nowrap",
    minWidth: 0,
  };
  const titleRowStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
    position: "relative",
  };
  const titleTextStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
  };
  const pageTriggerWrapStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    marginLeft: 4,
  };
  const pagePopoverStyle: CSSProperties = {
    position: "absolute",
    left: -40,
    transform: "none",
    top: "calc(100% + 8px)",
    zIndex: 60,
    width: 180,
    minWidth: 180,
    maxWidth: 180,
    fontSize: "9px",
  };
  const openSummaryPanel = (anchor?: HTMLElement | null) => {
    const anchorElement = anchor ?? menuRef.current ?? menuTriggerRef.current;
    const anchorInMenu = !!(anchorElement && menuRef.current?.contains(anchorElement));
    if (anchor) {
      summaryAnchorRef.current = anchor;
    } else {
      summaryAnchorRef.current = menuRef.current ?? menuTriggerRef.current;
    }
    if (!anchorInMenu) {
      setMenuOpen(false);
    }
    setSummaryPanelOpen(true);
  };

  const scrollToSummarySection = (sectionId: string) => {
    const target = summarySectionRefs.current[sectionId];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const project = useMemo(() => {
    const counts = new Map<string, number>();
    projects.forEach((item) => {
      const raw = item.id !== null && item.id !== undefined ? String(item.id).trim() : "";
      if (!raw) return;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    });
    const resolveRouteId = (item: Project) => {
      const raw = item.id !== null && item.id !== undefined ? String(item.id).trim() : "";
      const invalid = raw === "" || raw === "undefined" || raw === "null" || (counts.get(raw) ?? 0) > 1;
      return invalid ? `project-${item.createdAt}` : raw;
    };
    const direct = projects.find(
      (item) =>
        item.id === projectId ||
        item.id === decodedProjectId ||
        String(item.id) === decodedProjectId,
    );
    if (direct) return direct;
    const byRoute = projects.find((item) => resolveRouteId(item) === decodedProjectId);
    if (byRoute) return byRoute;
    const legacyId = decodedProjectId.startsWith("project-")
      ? decodedProjectId.replace("project-", "")
      : decodedProjectId;
    const createdAt = Number(legacyId);
    if (Number.isFinite(createdAt)) {
      return projects.find((item) => Number(item.createdAt) === createdAt) ?? null;
    }
    return null;
  }, [projects, projectId, decodedProjectId]);

  const projectName = project?.title ?? "Projet";

  useEffect(() => {
    if (!storePersist?.hasHydrated) {
      setHasHydrated(true);
      return;
    }
    if (storePersist.hasHydrated()) {
      setHasHydrated(true);
      return;
    }
    const unsubscribe = storePersist.onFinishHydration?.(() => setHasHydrated(true));
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [storePersist]);

  useEffect(() => {
    if (project || projects.length === 0 || repairAttempted) return;
    setRepairAttempted(true);
    setProjects(projects);
  }, [project, projects, repairAttempted, setProjects]);


  const pages = useMemo(() => {
    if (!project) return [];
    if (project.pages && project.pages.length > 0) return project.pages;
    return [buildLegacyPage(project)];
  }, [project]);

  useEffect(() => {
    if (!project) return;
    if (project.pages && project.pages.length > 0) return;
    const legacyPage = buildLegacyPage(project);
    updateProject(project.id, { pages: [legacyPage] });
  }, [project, updateProject]);

  useEffect(() => {
    if (pages.length === 0) return;
    if (!activePageId || !pages.find((page) => page.id === activePageId)) {
      setActivePageId(pages[0].id);
    }
  }, [pages, activePageId]);

  useEffect(() => {
    setSummaryDraft("");
  }, [activePageId]);

  useEffect(() => {
    setActiveBlockKey(null);
  }, [activePageId]);

  const activePage = pages.find((page) => page.id === activePageId) ?? null;

  const updateActivePage = (patch: Partial<ProjectPage>) => {
    if (!project || !activePage) return;
    const nextPages = pages.map((page) =>
      page.id === activePage.id ? { ...page, ...patch } : page,
    );
    updateProject(project.id, { pages: nextPages });
  };

  const summarySections = useMemo<SummarySection[]>(() => {
    if (!activePage) return [];
    if (activePage.summarySections) return activePage.summarySections;
    return (activePage.summary ?? []).map((title, index) => ({
      id: `${activePage.id}-summary-${index}`,
      title,
      blocks: [],
    }));
  }, [activePage]);

  useEffect(() => {
    if (!project || !activePage) return;
    if (activePage.summarySections !== undefined && activePage.summarySections !== null) return;
    const legacySections = (activePage.summary ?? []).map((title, index) => ({
      id: `${activePage.id}-summary-${index}`,
      title,
      blocks: [],
    }));
    updateActivePage({ summarySections: legacySections });
  }, [project, activePage, updateActivePage]);

  const summaryStyle = (activePage?.summaryStyle as SummaryStyle) ?? "none";
  const titleAlign = (activePage?.blocks?.title?.align as TitleAlign) ?? "center";
  const titleColor = activePage?.blocks?.title?.color;
  const titleHighlight = activePage?.blocks?.title?.highlight;

  const applySummarySections = (updater: (sections: SummarySection[]) => SummarySection[]) => {
    if (!project || !activePage) return;
    const next = updater(summarySections);
    updateActivePage({
      summarySections: next,
      summary: next.map((section) => section.title),
    });
  };

  const createSummarySection = (title: string): SummarySection => ({
    id: createEntityId("summary"),
    title,
    blocks: [],
  });

  const createSummaryBlock = (type: SummaryBlockType): SummaryBlock => ({
    id: createEntityId(`summary-${type}`),
    type,
    content: type === "text" ? "" : undefined,
    url: type === "image" || type === "video" ? "" : undefined,
    letterSpacing: "normal",
    layout: type === "card" ? "cards" : undefined,
    template:
      type === "card"
        ? []
        : undefined,
    cards: type === "card" ? [] : undefined,
    images: type === "image" ? [] : undefined,
    videos: type === "video" ? [] : undefined,
    table:
      type === "table"
        ? {
            columns: [
              {
                id: createEntityId("table-col"),
                label: "Champ",
                type: "text",
              },
            ],
            rows: [],
          }
        : undefined,
  });

  const getDefaultLayout = (key: BlockKey) => {
    const containerWidth = canvasRef.current?.clientWidth ?? 720;
    const margin = 24;
    const safeWidth = Math.max(BLOCK_MIN_WIDTH, containerWidth - margin * 2);
    const width = Math.min(BLOCK_WIDTH[key], safeWidth);
    let x = margin;
    if (key === "title") {
      x = Math.max(margin, Math.round((containerWidth - width) / 2));
    }
    if (key === "summary") {
      x = Math.max(margin, containerWidth - width - margin);
    }
    return {
      x,
      y: BLOCK_DEFAULT_Y[key],
      visible: true,
      align: key === "title" ? "center" : undefined,
    };
  };

  const createPageId = () => {
    const baseId = project?.id ? String(project.id) : "project";
    const fallback = `page-${baseId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `page-${crypto.randomUUID()}`;
    }
    return fallback;
  };

  const createEntityId = (prefix: string) => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  };

  const addPage = (name?: string) => {
    if (!project) return null;
    const trimmed = (name ?? "").trim();
    const nextIndex = pages.length + 1;
    const pageName = trimmed || `Page ${nextIndex}`;
    const id = createPageId();
    const nextPage: ProjectPage = {
      id,
      name: pageName,
      pageTitle: "",
      subtitle: "",
      description: "",
      summary: [],
      summarySections: [],
      summaryStyle: "none",
      blocks: {},
    };
    updateProject(project.id, { pages: [...pages, nextPage] });
    setActivePageId(id);
    setPageNameDraft("");
    return id;
  };

  const deletePage = (pageId: string) => {
    if (!project) return;
    if (pages.length <= 1) return;
    const nextPages = pages.filter((page) => page.id !== pageId);
    updateProject(project.id, { pages: nextPages });
    if (activePageId === pageId) {
      setActivePageId(nextPages[0]?.id ?? null);
    }
  };

  const updatePageName = (pageId: string, name: string) => {
    if (!project) return;
    const nextPages = pages.map((page) =>
      page.id === pageId ? { ...page, name } : page,
    );
    updateProject(project.id, { pages: nextPages });
  };

  const ensureBlock = (key: BlockKey) => {
    if (!project || !activePage) return;
    const existing = activePage.blocks?.[key];
    if (existing?.visible) return;
    const next = key === "title" ? getDefaultLayout(key) : existing ?? getDefaultLayout(key);
    updateActivePage({
      blocks: {
        ...(activePage.blocks ?? {}),
        [key]: {
          ...next,
          visible: true,
          align: key === "title" ? "center" : next.align,
          mode: key === "title" ? next.mode : "stacked",
        },
      },
    });
  };

  const removeBlock = (key: BlockKey) => {
    if (!project || !activePage) return;
    const existing = activePage.blocks?.[key];
    if (!existing) return;
    const nextBlocks = { ...(activePage.blocks ?? {}) };
    if (key === "title") {
      nextBlocks[key] = { ...existing, visible: false };
    } else {
      delete nextBlocks[key];
    }
    const patch: Partial<ProjectPage> = { blocks: nextBlocks };
    if (key === "subtitle") {
      patch.subtitle = "";
    }
    if (key === "description") {
      patch.description = "";
    }
    if (key === "summary") {
      patch.summary = [];
      patch.summarySections = [];
    }
    updateActivePage(patch);
  };

  const updateBlockPosition = (key: BlockKey, x: number, y: number) => {
    if (!project || !activePage) return;
    const existing = activePage.blocks?.[key] ?? getDefaultLayout(key);
    const align = (existing.align as TitleAlign) ?? "center";
    if (key === "title" && align !== "free") return;
    const nextY = key === "title" ? (existing.y ?? TITLE_ANCHOR_Y) : y;
    updateActivePage({
      blocks: {
        ...(activePage.blocks ?? {}),
        [key]: {
          ...existing,
          x,
          y: nextY,
          visible: true,
          align: key === "title" ? existing.align : undefined,
        },
      },
    });
  };

  const setTitleAlign = (align: TitleAlign) => {
    if (!project || !activePage) return;
    const existing = activePage.blocks?.title ?? getDefaultLayout("title");
    const next = { ...existing, align, visible: true };
    if (align === "free" && existing.align !== "free") {
      const containerWidth = canvasRef.current?.clientWidth ?? 720;
      const margin = 24;
      const titleWidth = blockRefs.current.title?.getBoundingClientRect().width ?? BLOCK_WIDTH.title;
      next.x = Math.max(margin, Math.round((containerWidth - titleWidth) / 2));
      next.y = existing.y ?? TITLE_ANCHOR_Y;
    }
    updateActivePage({
      blocks: {
        ...(activePage.blocks ?? {}),
        title: next,
      },
    });
  };

  const setTitleColor = (color?: string) => {
    if (!project || !activePage) return;
    const existing = activePage.blocks?.title ?? getDefaultLayout("title");
    updateActivePage({
      blocks: {
        ...(activePage.blocks ?? {}),
        title: {
          ...existing,
          color: color || undefined,
          highlight: existing.highlight,
          visible: true,
          align: (existing.align as TitleAlign) ?? "center",
        },
      },
    });
  };

  const setTitleHighlight = (color?: string) => {
    if (!project || !activePage) return;
    const existing = activePage.blocks?.title ?? getDefaultLayout("title");
    updateActivePage({
      blocks: {
        ...(activePage.blocks ?? {}),
        title: {
          ...existing,
          color: existing.color,
          highlight: color || undefined,
          visible: true,
          align: (existing.align as TitleAlign) ?? "center",
        },
      },
    });
  };

  const setBlockAlign = (key: Exclude<BlockKey, "title">, align: BlockAlign) => {
    if (!project || !activePage) return;
    const existing = activePage.blocks?.[key] ?? getDefaultLayout(key);
    updateActivePage({
      blocks: {
        ...(activePage.blocks ?? {}),
        [key]: {
          ...existing,
          align,
          visible: true,
        },
      },
    });
  };

  const setBlockColor = (key: Exclude<BlockKey, "title">, color?: string) => {
    if (!project || !activePage) return;
    const existing = activePage.blocks?.[key] ?? getDefaultLayout(key);
    updateActivePage({
      blocks: {
        ...(activePage.blocks ?? {}),
        [key]: {
          ...existing,
          color: color || undefined,
          visible: true,
        },
      },
    });
  };

  const setBlockHighlight = (key: Exclude<BlockKey, "title">, color?: string) => {
    if (!project || !activePage) return;
    const existing = activePage.blocks?.[key] ?? getDefaultLayout(key);
    updateActivePage({
      blocks: {
        ...(activePage.blocks ?? {}),
        [key]: {
          ...existing,
          highlight: color || undefined,
          visible: true,
        },
      },
    });
  };

  const handleSummaryAdd = () => {
    const trimmed = summaryDraft.trim();
    if (!trimmed) return;
    applySummarySections((sections) => [...sections, createSummarySection(trimmed)]);
    setSummaryDraft("");
  };

  const handleSummaryUpdate = (sectionId: string, value: string) => {
    applySummarySections((sections) =>
      sections.map((section) =>
        section.id === sectionId ? { ...section, title: value } : section,
      ),
    );
  };

  const handleSummaryRemove = (sectionId: string) => {
    applySummarySections((sections) => sections.filter((section) => section.id !== sectionId));
  };

  const handleSummaryBlockAdd = (sectionId: string, type: SummaryBlockType) => {
    applySummarySections((sections) =>
      sections.map((section) =>
        section.id === sectionId
          ? { ...section, blocks: [...section.blocks, createSummaryBlock(type)] }
          : section,
      ),
    );
  };

  const handleSummaryBlockUpdate = (
    sectionId: string,
    blockId: string,
    patch: Partial<SummaryBlock>,
  ) => {
    applySummarySections((sections) =>
      sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              blocks: section.blocks.map((block) =>
                block.id === blockId ? { ...block, ...patch } : block,
              ),
            }
          : section,
      ),
    );
  };

  const handleSummaryBlockRemove = (sectionId: string, blockId: string) => {
    applySummarySections((sections) =>
      sections.map((section) =>
        section.id === sectionId
          ? { ...section, blocks: section.blocks.filter((block) => block.id !== blockId) }
          : section,
      ),
    );
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>, key: BlockKey) => {
    if (!project || !activePage) return;
    const container = canvasRef.current;
    const block = blockRefs.current[key];
    if (!container || !block) return;
    const blockRect = block.getBoundingClientRect();
    setDragging({
      key,
      offsetX: event.clientX - blockRect.left,
      offsetY: event.clientY - blockRect.top,
      width: blockRect.width,
      height: blockRect.height,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startDragFromStack = (event: PointerEvent<HTMLButtonElement>, key: Exclude<BlockKey, "title">) => {
    if (!project || !activePage) return;
    const container = canvasRef.current;
    const block = blockRefs.current[key];
    if (!container || !block) return;
    const blockRect = block.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const fallback = getDefaultLayout(key);
    const existing = activePage.blocks?.[key] ?? fallback;
    updateActivePage({
      blocks: {
        ...(activePage.blocks ?? {}),
        [key]: {
          ...existing,
          x: blockRect.left - containerRect.left,
          y: blockRect.top - containerRect.top,
          visible: true,
          mode: "free",
        },
      },
    });
    setDragging({
      key,
      offsetX: event.clientX - blockRect.left,
      offsetY: event.clientY - blockRect.top,
      width: blockRect.width,
      height: blockRect.height,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (event: PointerEvent) => {
      const container = canvasRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const nextX = event.clientX - containerRect.left - dragging.offsetX;
      const nextY = event.clientY - containerRect.top - dragging.offsetY;
      const maxX = Math.max(0, containerRect.width - dragging.width);
      const maxY = Math.max(0, containerRect.height - dragging.height);
      const safeX = clamp(nextX, 0, maxX);
      const safeY = clamp(nextY, 0, maxY);
      updateBlockPosition(dragging.key, safeX, safeY);
    };
    const handleUp = () => setDragging(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragging]);

  useEffect(() => {
    const block = blockRefs.current.title;
    if (!block) {
      setTitleOffset(32);
      return;
    }
    const rect = block.getBoundingClientRect();
    setTitleOffset(Math.max(48, rect.height + 24));
  }, [activePage?.pageTitle, titleAlign, activePage?.blocks?.title?.visible]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (menuTriggerRef.current?.contains(target)) return;
      if (pagePanelRef.current?.contains(target)) return;
      if (summaryPanelRef.current?.contains(target)) return;
      setMenuOpen(false);
      setSummaryPanelOpen(false);
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (!summaryPanelOpen) return;
    const handleOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (summaryPanelRef.current?.contains(target)) return;
      if (summaryAnchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      if (menuTriggerRef.current?.contains(target)) return;
      setSummaryPanelOpen(false);
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, [summaryPanelOpen]);

  useLayoutEffect(() => {
    if (!summaryPanelOpen) {
      setSummaryPanelPosition(null);
      return;
    }
    const updatePosition = () => {
      const anchor = summaryAnchorRef.current ?? menuRef.current ?? menuTriggerRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const panelWidth = 240;
      const padding = 12;
      let left = rect.right + padding;
      if (left + panelWidth > window.innerWidth - 16) {
        left = rect.left - panelWidth - padding;
      }
      left = Math.max(16, Math.min(left, window.innerWidth - panelWidth - 16));
      setSummaryPanelPosition({ top: rect.top, left });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [summaryPanelOpen]);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null);
      return;
    }
    const updatePosition = () => {
      const trigger = menuTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const panelWidth = Math.min(260, Math.round(window.innerWidth * 0.8));
      const maxLeft = Math.max(16, window.innerWidth - panelWidth - 16);
      let left = rect.left;
      left = Math.max(16, Math.min(left, maxLeft));
      setMenuPosition({ top: rect.bottom + 12, left });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!pageCreatorOpen) return;
    const handleOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (pagePanelRef.current?.contains(target)) return;
      if (pageTriggerRef.current?.contains(target)) return;
      setPageCreatorOpen(false);
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, [pageCreatorOpen]);


  useEffect(() => {
    if (!titleAlignOpen) return;
    const handleOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (titleAlignRef.current?.contains(target)) return;
      if (titleAlignTriggerRef.current?.contains(target)) return;
      setTitleAlignOpen(false);
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, [titleAlignOpen]);

  useEffect(() => {
    if (!blockAlignOpen) return;
    const handleOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const panel = blockAlignRefs.current[blockAlignOpen];
      const trigger = blockAlignTriggerRefs.current[blockAlignOpen];
      if (panel?.contains(target)) return;
      if (trigger?.contains(target)) return;
      setBlockAlignOpen(null);
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, [blockAlignOpen]);

  const toRoman = (value: number) => {
    const pairs: Array<[number, string]> = [
      [1000, "M"],
      [900, "CM"],
      [500, "D"],
      [400, "CD"],
      [100, "C"],
      [90, "XC"],
      [50, "L"],
      [40, "XL"],
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"],
    ];
    let num = value;
    let result = "";
    pairs.forEach(([n, symbol]) => {
      while (num >= n) {
        result += symbol;
        num -= n;
      }
    });
    return result;
  };

  const formatSummaryIndex = (index: number) => {
    const value = index + 1;
    if (summaryStyle === "none") return "";
    if (summaryStyle === "roman") return toRoman(value);
    if (summaryStyle === "alpha") {
      const code = 65 + ((value - 1) % 26);
      return String.fromCharCode(code);
    }
    return String(value);
  };

  const [summaryToolbarActive, setSummaryToolbarActive] = useState<string | null>(null);
  const [summaryToolbarHover, setSummaryToolbarHover] = useState<string | null>(null);

  useEffect(() => {
    if (!summaryToolbarActive) return;
    const handleOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const current = summarySectionRefs.current[summaryToolbarActive];
      if (current?.contains(target)) return;
      setSummaryToolbarActive(null);
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, [summaryToolbarActive]);

  const renderSummaryContent = (extraStyle?: CSSProperties) => (
    <div
      className="text-[12px] text-[color:var(--text)]"
      style={{
        ...getBlockTextStyle("summary"),
        backgroundColor: undefined,
        padding: undefined,
        borderRadius: undefined,
        width: "100%",
        ...extraStyle,
      }}
    >
      {summarySections.length === 0 && (
        <div className="text-[11px] text-[color:var(--muted)]">Sommaire vide.</div>
      )}
      {summarySections.length > 0 && (
        <div className={styles.projectSummaryList}>
          <div className={styles.projectSummaryOptionsRow}>
            <button
              type="button"
              className="icon-button"
              aria-label="Filtrer le sommaire"
              title="Options"
              onClick={(event) => openSummaryPanel(event.currentTarget)}
            >
              <svg
                aria-hidden="true"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 6h16" />
                <path d="M7 12h10" />
                <path d="M10 18h4" />
              </svg>
            </button>
          </div>
          <div className={styles.projectSummaryNumbered} role="list">
            {summarySections.map((section, index) => (
              <button
                key={`${section.id}-numbered`}
                type="button"
                className={styles.projectSummaryNumberedItem}
                onClick={() => scrollToSummarySection(section.id)}
              >
                <span className={styles.projectSummaryNumberedIndex}>
                  {index + 1} -
                </span>
                <span className={styles.projectSummaryEntryText}>
                  {section.title || `Section ${index + 1}`}
                </span>
              </button>
            ))}
          </div>
          <div className={styles.projectSummaryDetails}>
            {summarySections.map((section, index) => (
              <SectionBlock
                key={`${section.id}-detail`}
                ref={(el) => {
                  summarySectionRefs.current[section.id] = el;
                }}
                className={styles.projectSummarySection}
                onPointerEnter={() => setSummaryToolbarHover(section.id)}
                onPointerLeave={() =>
                  setSummaryToolbarHover((prev) => (prev === section.id ? null : prev))
                }
                onPointerDown={() => setSummaryToolbarActive(section.id)}
              >
                <div className={styles.projectSummarySectionHeader}>
                  <div className={styles.projectSummarySectionTitleWrap}>
                    <span className={styles.projectSummaryNumberedIndex}>{index + 1}.</span>
                    <span className={styles.projectSummarySectionTitle}>
                      {section.title || `Section ${index + 1}`}
                    </span>
                    <div
                      style={{
                        opacity:
                          summaryToolbarActive === section.id ||
                          summaryToolbarHover === section.id
                            ? 1
                            : 0,
                        pointerEvents:
                          summaryToolbarActive === section.id ||
                          summaryToolbarHover === section.id
                            ? "auto"
                            : "none",
                        transition: "opacity 0.2s ease",
                        display: "inline-flex",
                        gap: "6px",
                        alignItems: "center",
                      }}
                    >
                      <button
                        type="button"
                        className={cx("icon-button", styles.projectSummarySectionTextIcon)}
                        aria-label="Ajouter un bloc texte"
                        title="Ajouter un bloc texte"
                        onClick={() => handleSummaryBlockAdd(section.id, "text")}
                      >
                        <svg
                          aria-hidden="true"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="4" y="5" width="16" height="14" rx="2" />
                          <path d="M8 9h8" />
                          <path d="M8 13h8" />
                          <path d="M8 17h5" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={cx("icon-button", styles.projectSummarySectionTextIcon)}
                        aria-label="Ajouter une carte"
                        title="Ajouter une carte"
                        onClick={() => handleSummaryBlockAdd(section.id, "card")}
                      >
                        <svg
                          aria-hidden="true"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="5" width="7" height="14" rx="2" />
                          <rect x="14" y="5" width="7" height="14" rx="2" />
                        </svg>
                      </button>
                    <button
                      type="button"
                      className={cx("icon-button", styles.projectSummarySectionTextIcon)}
                      aria-label="Ajouter des images"
                      title="Ajouter des images"
                      onClick={() => handleSummaryBlockAdd(section.id, "image")}
                    >
                        <svg
                          aria-hidden="true"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="M8 11l3 3 3-4 4 5" />
                          <circle cx="8" cy="9" r="1" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={cx("icon-button", styles.projectSummarySectionTextIcon)}
                        aria-label="Ajouter une video"
                        title="Ajouter une video"
                        onClick={() => handleSummaryBlockAdd(section.id, "video")}
                      >
                        <svg
                          aria-hidden="true"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="M10 9l5 3-5 3z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={cx("icon-button", styles.projectSummarySectionTextIcon)}
                        aria-label="Ajouter un tableau"
                        title="Ajouter un tableau"
                        onClick={() => handleSummaryBlockAdd(section.id, "table")}
                      >
                        <svg
                          aria-hidden="true"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="4" width="18" height="16" rx="2" />
                          <path d="M3 10h18" />
                          <path d="M9 4v16" />
                          <path d="M15 4v16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div
                    className={styles.projectSummarySectionActions}
                    style={{
                      opacity:
                        summaryToolbarActive === section.id ||
                        summaryToolbarHover === section.id
                          ? 1
                          : 0,
                      pointerEvents:
                        summaryToolbarActive === section.id ||
                        summaryToolbarHover === section.id
                          ? "auto"
                          : "none",
                      transition: "opacity 0.2s ease",
                    }}
                  >
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Supprimer la section"
                      title="Supprimer la section"
                      onClick={() => handleSummaryRemove(section.id)}
                    >
                      <svg
                        aria-hidden="true"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M6 6l1 14h10l1-14" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className={styles.projectSummarySectionBlocks}>
                  {section.blocks.length === 0 && (
                    <div className={styles.projectSummaryEmpty}>Aucun contenu pour le moment.</div>
                  )}
                  {section.blocks.map((block) => {
                    const label =
                      block.type === "text"
                        ? "Texte"
                        : block.type === "table"
                          ? "Tableau"
                          : block.type === "image"
                            ? "Image"
                            : block.type === "card"
                              ? "Carte"
                              : "Vidéo";
                    return (
                      <div key={block.id} className={styles.projectSummaryBlock}>
                        {block.type !== "card" &&
                          block.type !== "image" &&
                          block.type !== "text" &&
                          block.type !== "video" &&
                          block.type !== "table" && (
                          <div className={styles.projectSummaryBlockHeader}>
                            <span className={styles.projectSummaryBlockLabel}>{label}</span>
                          </div>
                        )}
                        {block.type === "text" && (
                          <SummaryRichTextEditor
                            value={block.content ?? ""}
                            onChange={(nextValue) =>
                              handleSummaryBlockUpdate(section.id, block.id, { content: nextValue })
                            }
                            letterSpacing={block.letterSpacing ?? "normal"}
                            onLetterSpacingChange={(nextValue) =>
                              handleSummaryBlockUpdate(section.id, block.id, { letterSpacing: nextValue })
                            }
                            placeholder="Texte"
                            onDelete={() => handleSummaryBlockRemove(section.id, block.id)}
                          />
                        )}
                        {block.type === "table" && (
                          <SummaryTableBlock
                            block={block}
                            onChange={(patch) => handleSummaryBlockUpdate(section.id, block.id, patch)}
                            onDelete={() => handleSummaryBlockRemove(section.id, block.id)}
                          />
                        )}
                        {block.type === "image" && (
                          <SummaryImageBlock
                            block={block}
                            onChange={(patch) => handleSummaryBlockUpdate(section.id, block.id, patch)}
                            onDelete={() => handleSummaryBlockRemove(section.id, block.id)}
                          />
                        )}
                        {block.type === "video" && (
                          <SummaryVideoBlock
                            block={block}
                            onChange={(patch) => handleSummaryBlockUpdate(section.id, block.id, patch)}
                            onDelete={() => handleSummaryBlockRemove(section.id, block.id)}
                          />
                        )}
                        {block.type === "card" && (
                          <SummaryCardBlock
                            block={block}
                            onChange={(patch) => handleSummaryBlockUpdate(section.id, block.id, patch)}
                            onDelete={() => handleSummaryBlockRemove(section.id, block.id)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </SectionBlock>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const getBlockTextStyle = (key: Exclude<BlockKey, "title">) => {
    const color = activePage?.blocks?.[key]?.color;
    const highlight = activePage?.blocks?.[key]?.highlight;
    return {
      color: color || undefined,
      backgroundColor: highlight || undefined,
      padding: highlight ? "0.15rem 0.4rem" : undefined,
      borderRadius: highlight ? "8px" : undefined,
    };
  };

  const getBlockAlign = (key: Exclude<BlockKey, "title">): BlockAlign | undefined =>
    (activePage?.blocks?.[key]?.align as BlockAlign | undefined);

  const openPicker = (type: "color" | "highlight", key: Exclude<BlockKey, "title">) => {
    const map = type === "color" ? colorInputRefs.current : highlightInputRefs.current;
    const input = map[key];
    if (!input) return;
    input.click();
  };

  const openTitlePicker = (type: "color" | "highlight") => {
    const input = type === "color" ? titleColorInputRef.current : titleHighlightInputRef.current;
    if (!input) return;
    input.click();
  };

  const renderStyleTools = (
    key: Exclude<BlockKey, "title">,
    onDrag: (event: PointerEvent<HTMLButtonElement>) => void,
    showDrag: boolean,
  ) => {
    const blockColor = activePage?.blocks?.[key]?.color;
    const blockHighlight = activePage?.blocks?.[key]?.highlight;
    const blockAlign = getBlockAlign(key) ?? "left";
    return (
      <>
        <div className={styles.projectAlignWrap}>
          <button
            type="button"
            className={cx("icon-button", styles.projectAlignTrigger)}
            aria-label="Aligner le bloc"
            title="Alignement"
            onClick={() => {
              setTitleAlignOpen(false);
              setBlockAlignOpen((prev) => (prev === key ? null : key));
            }}
            ref={(el) => {
              blockAlignTriggerRefs.current[key] = el;
            }}
          >
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6h16" />
              <path d="M7 12h10" />
              <path d="M10 18h4" />
            </svg>
          </button>
          {blockAlignOpen === key && (
            <div className={styles.projectAlignPanel} ref={(el) => { blockAlignRefs.current[key] = el; }}>
              {(["left", "center", "right"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={cx("btn-plain", styles.projectAlignOption, blockAlign === option && styles.projectAlignOptionActive)}
                  onClick={() => {
                    setBlockAlign(key, option);
                    setBlockAlignOpen(null);
                  }}
                >
                  {option === "left" ? "Gauche" : option === "center" ? "Centre" : "Droite"}
                </button>
              ))}
              <div className={styles.projectColorRow}>
                <button
                  type="button"
                  className={cx("icon-button", styles.projectColorTrigger)}
                  title="Couleur du texte"
                  aria-label="Couleur du texte"
                  onClick={() => openPicker("color", key)}
                >
                  <PaletteIcon />
                  <input
                    ref={(el) => {
                      colorInputRefs.current[key] = el;
                    }}
                    type="color"
                    className={styles.projectColorInput}
                    value={blockColor ?? "#0f172a"}
                    onChange={(event) => setBlockColor(key, event.target.value)}
                    aria-label="Choisir une couleur de texte"
                    tabIndex={-1}
                  />
                </button>
                <button
                  type="button"
                  className={cx("icon-button", styles.projectColorTrigger)}
                  title="Surlignage"
                  aria-label="Surlignage"
                  onClick={() => openPicker("highlight", key)}
                >
                  <HighlightIcon />
                  <input
                    ref={(el) => {
                      highlightInputRefs.current[key] = el;
                    }}
                    type="color"
                    className={styles.projectColorInput}
                    value={blockHighlight ?? "#ffffff"}
                    onChange={(event) => setBlockHighlight(key, event.target.value)}
                    aria-label="Choisir une couleur de surlignage"
                    tabIndex={-1}
                  />
                </button>
                {blockHighlight && (
                  <button
                    type="button"
                    className={cx("icon-button", styles.projectColorClear)}
                    aria-label="Retirer le surlignage"
                    title="Retirer le surlignage"
                    onClick={() => setBlockHighlight(key, undefined)}
                  >
                    <svg
                      aria-hidden="true"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        {showDrag && (
          <button
            type="button"
            className={cx("icon-button", styles.projectDragHandle)}
            aria-label="Déplacer"
            title="Déplacer"
            onPointerDown={onDrag}
          >
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 11.5V7.5a2 2 0 0 1 4 0v4" />
              <path d="M11 10V6a2 2 0 0 1 4 0v8" />
              <path d="M15 10V8a2 2 0 0 1 4 0v7.5a5 5 0 0 1-10 0V13" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label="Supprimer le bloc"
          title="Supprimer"
          onClick={() => removeBlock(key)}
        >
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M6 6l1 14h10l1-14" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </>
    );
  };

  const renderBlock = (key: BlockKey, content: ReactNode) => {
    if (!project || !activePage) return null;
    const layout = activePage.blocks?.[key];
    if (!layout?.visible) return null;
    const isTitle = key === "title";
    const isSummary = key === "summary";
    const isPlain = true;
    const blockMode = key === "title" ? "free" : (layout.mode ?? "stacked");
    if (key !== "title" && blockMode !== "free") return null;
    const resolvedTitleAlign = (layout.align as TitleAlign) ?? "center";
    const margin = 24;
    const summaryMargin = 4;
    const maxWidth = "calc(100% - 48px)";
    const summaryMaxWidth = "calc(100% - 8px)";
    const canDrag = isTitle && resolvedTitleAlign === "free";
    const panelOpen = (isTitle && titleAlignOpen) || (!isTitle && blockAlignOpen === key);
    const isActive = activeBlockKey === key;
    const activeZIndex = panelOpen ? 90 : isActive ? 70 : undefined;
    const blockHeadStyle: CSSProperties = {
      position: "absolute",
      top: "50%",
      right: -2,
      transform: "translate(100%, -50%)",
    };
    const baseStyle: CSSProperties = isTitle
      ? {
          top: resolvedTitleAlign === "free" ? layout.y ?? getDefaultLayout(key).y : TITLE_ANCHOR_Y,
          maxWidth,
          width: "fit-content",
          zIndex: activeZIndex,
        }
      : {
          width: "fit-content",
          maxWidth,
          left: layout.x ?? getDefaultLayout(key).x,
          top: layout.y ?? getDefaultLayout(key).y,
          zIndex: activeZIndex,
        };

    if (isTitle) {
      if (resolvedTitleAlign === "left") {
        baseStyle.left = margin;
        baseStyle.right = "auto";
      } else if (resolvedTitleAlign === "right") {
        baseStyle.right = margin;
        baseStyle.left = "auto";
      } else if (resolvedTitleAlign === "center") {
        baseStyle.left = "50%";
        baseStyle.transform = "translateX(-50%)";
      } else {
        baseStyle.left = layout.x ?? getDefaultLayout(key).x;
      }
    } else if (isSummary) {
      baseStyle.left = summaryMargin;
      baseStyle.right = summaryMargin;
      baseStyle.width = summaryMaxWidth;
      delete baseStyle.transform;
    } else if (layout.align) {
      if (layout.align === "left") {
        baseStyle.left = margin;
        baseStyle.right = "auto";
        delete baseStyle.transform;
      } else if (layout.align === "center") {
        baseStyle.left = "50%";
        baseStyle.right = "auto";
        baseStyle.transform = "translateX(-50%)";
      } else if (layout.align === "right") {
        baseStyle.right = margin;
        baseStyle.left = "auto";
        delete baseStyle.transform;
      }
    }
    return (
      <div
        key={key}
        ref={(el) => {
          blockRefs.current[key] = el;
        }}
        className={cx(styles.projectBlock, isPlain && styles.projectBlockPlain, isPlain && styles.projectBlockEditable)}
        style={baseStyle}
        onPointerEnter={() => setActiveBlockKey(key)}
        onPointerDown={() => setActiveBlockKey(key)}
        onFocusCapture={() => setActiveBlockKey(key)}
      >
        <div className={styles.projectBlockHead} style={blockHeadStyle}>
          <div className={cx("flex items-center gap-2", isPlain && styles.projectBlockTools)}>
            {isTitle && (
              <div className={styles.projectTitleActions}>
                <button
                  type="button"
                  className={cx("icon-button", styles.projectAlignTrigger)}
                  aria-label="Aligner le titre"
                  title="Alignement"
                  onClick={() => {
                    setBlockAlignOpen(null);
                    setTitleAlignOpen((prev) => !prev);
                  }}
                  ref={titleAlignTriggerRef}
                >
                  <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 6h16" />
                    <path d="M7 12h10" />
                    <path d="M10 18h4" />
                  </svg>
                </button>
                {titleAlignOpen && (
                  <div className={styles.projectAlignPanel} ref={titleAlignRef}>
                    {TITLE_ALIGN_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={cx(
                          "btn-plain",
                          styles.projectAlignOption,
                          resolvedTitleAlign === option.value && styles.projectAlignOptionActive,
                        )}
                        onClick={() => {
                          setTitleAlign(option.value);
                          setTitleAlignOpen(false);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                    <div className={styles.projectColorRow}>
                      <button
                        type="button"
                        className={cx("icon-button", styles.projectColorTrigger)}
                        title="Couleur du texte"
                        aria-label="Couleur du texte"
                        onClick={() => openTitlePicker("color")}
                      >
                        <PaletteIcon />
                        <input
                          ref={titleColorInputRef}
                          type="color"
                          className={styles.projectColorInput}
                          value={titleColor ?? "#0f172a"}
                          onChange={(event) => setTitleColor(event.target.value)}
                          aria-label="Choisir une couleur de texte"
                          tabIndex={-1}
                        />
                      </button>
                      <button
                        type="button"
                        className={cx("icon-button", styles.projectColorTrigger)}
                        title="Surlignage"
                        aria-label="Surlignage"
                        onClick={() => openTitlePicker("highlight")}
                      >
                        <HighlightIcon />
                        <input
                          ref={titleHighlightInputRef}
                          type="color"
                          className={styles.projectColorInput}
                          value={titleHighlight ?? "#ffffff"}
                          onChange={(event) => setTitleHighlight(event.target.value)}
                          aria-label="Choisir une couleur de surlignage"
                          tabIndex={-1}
                        />
                      </button>
                      {titleHighlight && (
                        <button
                          type="button"
                          className={cx("icon-button", styles.projectColorClear)}
                          aria-label="Retirer le surlignage"
                          title="Retirer le surlignage"
                          onClick={() => setTitleHighlight(undefined)}
                        >
                          <svg
                            aria-hidden="true"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="9" />
                            <path d="M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            {canDrag && (
              <button
                type="button"
                className={cx("icon-button", styles.projectDragHandle)}
                aria-label="Déplacer"
                title="Déplacer"
                onPointerDown={(event) => {
                  if (!canDrag) return;
                  startDrag(event, key);
                }}
              >
                <svg
                  aria-hidden="true"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 11.5V7.5a2 2 0 0 1 4 0v4" />
                  <path d="M11 10V6a2 2 0 0 1 4 0v8" />
                  <path d="M15 10V8a2 2 0 0 1 4 0v7.5a5 5 0 0 1-10 0V13" />
                </svg>
              </button>
            )}
            {!isTitle && key === "summary" && (
              null
            )}
            {!isTitle && key !== "summary" &&
              renderStyleTools(
                key as Exclude<BlockKey, "title">,
                (event) => startDrag(event, key as Exclude<BlockKey, "title">),
                customizeMode,
              )}
            {isTitle && (
              <button
                type="button"
                className="icon-button"
                aria-label="Supprimer le bloc"
                title="Supprimer"
                onClick={() => removeBlock(key)}
              >
                <svg
                  aria-hidden="true"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M6 6l1 14h10l1-14" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {content}
      </div>
    );
  };

  const renderStackedBlock = (key: Exclude<BlockKey, "title">, content: ReactNode) => {
    if (!project || !activePage) return null;
    const layout = activePage.blocks?.[key];
    if (!layout?.visible) return null;
    if (layout.mode === "free") return null;
    const isSummary = key === "summary";
    const fallbackAlign: BlockAlign =
      titleAlign === "center" ? "center" : titleAlign === "right" ? "right" : "left";
    const align = getBlockAlign(key) ?? fallbackAlign;
    const alignSelf = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
    const panelOpen = blockAlignOpen === key;
    const isActive = activeBlockKey === key;
    const activeZIndex = panelOpen ? 90 : isActive ? 70 : undefined;
    const blockHeadStyle: CSSProperties = {
      position: "absolute",
      top: "50%",
      right: -2,
      transform: "translate(100%, -50%)",
    };
    return (
      <div
        ref={(el) => {
          blockRefs.current[key] = el;
        }}
        className={cx(styles.projectBlock, styles.projectBlockPlain, styles.projectStackBlock, styles.projectBlockEditable)}
        style={{
          alignSelf: isSummary ? "stretch" : alignSelf,
          zIndex: activeZIndex,
          width: isSummary ? "calc(100% - 8px)" : "max-content",
          marginInline: isSummary ? 4 : undefined,
          maxWidth: "100%",
        }}
        onPointerEnter={() => setActiveBlockKey(key)}
        onPointerDown={() => setActiveBlockKey(key)}
        onFocusCapture={() => setActiveBlockKey(key)}
      >
        <div className={styles.projectBlockHead} style={blockHeadStyle}>
          <div className={styles.projectBlockTools}>
            {key !== "summary" && renderStyleTools(key, (event) => startDragFromStack(event, key), customizeMode)}
          </div>
        </div>
        {content}
      </div>
    );
  };

  if (!hasHydrated) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-6 pb-16 sm:px-8">
        <h1 className="title-text text-2xl font-semibold tracking-tight">Chargement…</h1>
        <p className="text-sm text-slate-500">On récupère ton projet.</p>
      </div>
    );
  }

  if (!project) {
    if (!repairAttempted && projects.length > 0) {
      return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-6 pb-16 sm:px-8">
          <h1 className="title-text text-2xl font-semibold tracking-tight">Chargement…</h1>
          <p className="text-sm text-slate-500">On sécurise tes projets.</p>
        </div>
      );
    }
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-6 pb-16 sm:px-8">
        <h1 className="title-text text-2xl font-semibold tracking-tight">Projet introuvable</h1>
        <p className="text-sm text-slate-500">
          Ce projet n’existe pas ou a été supprimé.
        </p>
        <Link href="/projects" className="btn-plain text-sm text-slate-700 underline underline-offset-4">
          Retour aux projets
        </Link>
      </div>
    );
  }

  return (
    <div className={cx("mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-16 sm:px-8", styles.projectPage)}>
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className={cx("flex items-center gap-3", styles.projectHeaderRow)} style={headerRowStyle}>
            <div className={styles.projectTitleRow} style={titleRowStyle}>
              <h1 className="title-text text-2xl font-semibold tracking-tight" style={titleTextStyle}>
                {projectName}
              </h1>
              <div className={styles.projectPageTriggerWrap} style={pageTriggerWrapStyle}>
                <button
                  type="button"
                  className={cx("icon-button", styles.projectPageTrigger)}
                  aria-label="Créer une page"
                  title="Créer une page"
                  onClick={() => {
                    setPageCreatorOpen((prev) => !prev);
                    setPageNameDraft("");
                  }}
                  ref={pageTriggerRef}
                >
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M8 4h6l4 4v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                    <path d="M14 4v4h4" />
                    <path d="M12 11v6" />
                    <path d="M9 14h6" />
                  </svg>
                </button>
              </div>
              {pageCreatorOpen && (
                <div
                  className={cx("panel-glass p-3", styles.projectPagePopover)}
                  ref={pagePanelRef}
                  style={pagePopoverStyle}
                >
                  <div className={styles.projectPageList}>
                    {pages.map((page, index) => (
                      <div key={page.id} className={styles.projectPageItem}>
                        <span className={styles.projectPageIndex}>{index + 1}.</span>
                        <input
                          type="text"
                          value={page.name || ""}
                          placeholder="Nom de page"
                          onFocus={() => setActivePageId(page.id)}
                          onClick={() => setActivePageId(page.id)}
                          onChange={(event) => updatePageName(page.id, event.target.value)}
                          className={cx(styles.projectPageNameInput, activePageId === page.id && styles.projectPageNameActive)}
                        />
                        <button
                          type="button"
                          className="icon-button"
                          aria-label="Supprimer la page"
                          title="Supprimer la page"
                          onClick={() => deletePage(page.id)}
                          disabled={pages.length <= 1}
                          style={{ opacity: pages.length <= 1 ? 0.3 : 0.8 }}
                        >
                          <svg
                            aria-hidden="true"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M6 6l1 14h10l1-14" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      value={pageNameDraft}
                      onChange={(event) => setPageNameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        addPage(pageNameDraft);
                      }}
                      className={styles.projectMenuInput}
                      placeholder="Nom de nouvelle page"
                      aria-label="Nom de nouvelle page"
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Ajouter une page"
                      title="Ajouter une page"
                      onClick={() => addPage(pageNameDraft)}
                    >
                      <svg
                        aria-hidden="true"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      className={styles.projectSaveButton}
                      onClick={() => setPageCreatorOpen(false)}
                      style={{ background: "transparent", boxShadow: "none", border: "none" }}
                    >
                      Enregistrer
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className={styles.projectPagesShell} style={pageShellStyle}>
              <div className={styles.projectPages}>
                {pages.map((page, index) => {
                  const rawName = (page.name || "").trim();
                  const defaultName = `Page ${index + 1}`;
                  const label = rawName && rawName !== defaultName ? `${index + 1}. ${rawName}` : `${index + 1}.`;
                  const isLast = index === pages.length - 1;
                  return (
                    <Fragment key={page.id}>
                      <button
                        type="button"
                        className={cx("btn-plain", styles.projectPageChip, activePageId === page.id && styles.projectPageChipActive)}
                        onClick={() => setActivePageId(page.id)}
                        aria-pressed={activePageId === page.id}
                        style={pageChipStyle}
                      >
                        {label}
                      </button>
                      {!isLast && (
                        <span
                          className={styles.projectPageSeparator}
                          style={{ marginInline: 15 }}
                          aria-hidden="true"
                        />
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </div>
          <div className={styles.projectMenuWrap}>
            <button
              type="button"
              className={cx("icon-button", styles.projectMenuTrigger)}
              aria-label="Ouvrir le menu projet"
              title="Menu"
              onClick={() => setMenuOpen((prev) => !prev)}
              ref={menuTriggerRef}
            >
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="4" width="6" height="6" rx="2" />
                <rect x="14" y="4" width="6" height="6" rx="2" />
                <rect x="4" y="14" width="6" height="6" rx="2" />
                <rect x="14" y="14" width="6" height="6" rx="2" />
              </svg>
            </button>
            {menuOpen && (
              <div
                className={styles.projectMenuPopover}
                ref={menuRef}
                style={menuPosition ? { position: "fixed", top: menuPosition.top, left: menuPosition.left } : undefined}
              >
                <div className={cx("panel-glass p-4", styles.projectMenuPanel)}>
                  <div className={styles.projectMenuTitle}>Menu</div>
                  <div className="mt-3 space-y-2">
                    <div className={styles.projectMenuItem}>
                      <span>Personnaliser</span>
                      <div className={styles.projectMenuActions}>
                        <button
                          type="button"
                          className={cx("icon-button", styles.projectModeToggle, customizeMode && styles.projectModeToggleActive)}
                          aria-label="Personnaliser"
                          title="Personnaliser"
                          onClick={() => {
                            setCustomizeMode((prev) => !prev);
                            setMenuOpen(false);
                          }}
                        >
                          <svg
                            aria-hidden="true"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M7 11.5V7.5a2 2 0 0 1 4 0v4" />
                            <path d="M11 10V6a2 2 0 0 1 4 0v8" />
                            <path d="M15 10V8a2 2 0 0 1 4 0v7.5a5 5 0 0 1-10 0V13" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {([
                      { key: "title", label: "Titre" },
                      { key: "subtitle", label: "Sous-titre" },
                      { key: "description", label: "Description" },
                    ] as const).map((item) => {
                      const visible = activePage?.blocks?.[item.key]?.visible;
                      return (
                        <div key={item.key} className={styles.projectMenuItem}>
                          <span>{item.label}</span>
                          <div className={styles.projectMenuActions}>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label="Ajouter"
                              title="Ajouter"
                              onClick={() => {
                                ensureBlock(item.key);
                                setMenuOpen(false);
                              }}
                            >
                              <svg
                                aria-hidden="true"
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{ opacity: visible ? 0.35 : 0.85 }}
                              >
                                <path d="M12 5v14" />
                                <path d="M5 12h14" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <div className={styles.projectMenuItem}>
                      <span>Sommaire</span>
                      <div className={styles.projectMenuActions}>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label="Éditer le sommaire"
                          title="Éditer le sommaire"
                          onClick={(event) => openSummaryPanel(event.currentTarget)}
                        >
                          <svg
                            aria-hidden="true"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 6h18" />
                            <path d="M6 12h12" />
                            <path d="M9 18h6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}
            {summaryPanelOpen && summaryPanelPosition && (
              <div
                className={cx("panel-glass p-3", styles.projectSummaryPopover)}
                ref={summaryPanelRef}
                style={{ position: "fixed", top: summaryPanelPosition.top, left: summaryPanelPosition.left }}
              >
                <div className={styles.projectMenuSection}>Sommaire</div>
                <select
                  value={summaryStyle}
                  onChange={(e) => {
                    if (!project || !activePage) return;
                    updateActivePage({ summaryStyle: e.target.value as SummaryStyle });
                  }}
                  className={styles.projectMenuInput}
                >
                  {SUMMARY_STYLES.map((style) => (
                    <option key={style.value} value={style.value}>
                      {style.label}
                    </option>
                  ))}
                </select>
                <div className="mt-2 space-y-2">
                  {summarySections.map((section) => (
                    <div key={section.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={section.title}
                        onChange={(e) => handleSummaryUpdate(section.id, e.target.value)}
                        className={cx(styles.projectMenuInput, "flex-1")}
                      />
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Supprimer la section"
                        title="Supprimer"
                        onClick={() => handleSummaryRemove(section.id)}
                      >
                        <svg
                          aria-hidden="true"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M6 6l1 14h10l1-14" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={summaryDraft}
                      onChange={(e) => setSummaryDraft(e.target.value)}
                      className={cx(styles.projectMenuInput, "flex-1")}
                      placeholder="Ajouter une section"
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Ajouter au sommaire"
                      title="Ajouter"
                      onClick={handleSummaryAdd}
                    >
                      <svg
                        aria-hidden="true"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    className={styles.projectSaveButton}
                    onClick={() => {
                      ensureBlock("summary");
                      setSummaryPanelOpen(false);
                    }}
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      <div ref={canvasRef} className={styles.projectCanvas}>
        {renderBlock(
          "title",
          <BlockTitle
            value={activePage?.pageTitle ?? ""}
            onChange={(value) => {
              if (!project || !activePage) return;
              updateActivePage({ pageTitle: value });
            }}
            style={{
              color: titleColor || undefined,
              backgroundColor: titleHighlight || undefined,
              padding: titleHighlight ? "0.15rem 0.4rem" : undefined,
              borderRadius: titleHighlight ? "8px" : undefined,
              textAlign: titleAlign === "center" ? "center" : titleAlign === "right" ? "right" : "left",
            }}
          />,
        )}
        <div className={styles.projectStack} style={{ marginTop: titleOffset }}>
          {renderStackedBlock(
            "subtitle",
            <BlockSubtitle
              value={activePage?.subtitle ?? ""}
              onChange={(value) => {
                if (!project || !activePage) return;
                updateActivePage({ subtitle: value });
              }}
              style={{
                ...getBlockTextStyle("subtitle"),
                textAlign: titleAlign === "center" ? "center" : titleAlign === "right" ? "right" : "left",
              }}
            />,
          )}
          {renderStackedBlock(
            "description",
            <BlockText
              value={activePage?.description ?? ""}
              onChange={(value) => {
                if (!project || !activePage) return;
                updateActivePage({ description: value });
              }}
              placeholder="Description"
              className="resize-none text-sm"
              multiline
              style={{
                maxWidth: "100%",
                ...getBlockTextStyle("description"),
                textAlign: titleAlign === "center" ? "center" : titleAlign === "right" ? "right" : "left",
              }}
              sizeMin={12}
            />,
          )}
          {renderStackedBlock(
            "summary",
            renderSummaryContent({
              textAlign: titleAlign === "center" ? "center" : titleAlign === "right" ? "right" : "left",
            }),
          )}
        </div>
        {renderBlock(
          "subtitle",
          <BlockSubtitle
            value={activePage?.subtitle ?? ""}
            onChange={(value) => {
              if (!project || !activePage) return;
              updateActivePage({ subtitle: value });
            }}
            style={getBlockTextStyle("subtitle")}
          />,
        )}
        {renderBlock(
          "description",
          <BlockText
            value={activePage?.description ?? ""}
            onChange={(value) => {
              if (!project || !activePage) return;
              updateActivePage({ description: value });
            }}
            placeholder="Description"
            className="resize-none text-sm"
            multiline
            style={{ maxWidth: "100%", ...getBlockTextStyle("description") }}
            sizeMin={12}
          />,
        )}
        {renderBlock(
          "summary",
          renderSummaryContent(),
        )}
      </div>
    </div>
  );
}
