import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ProjectBlock = {
  x: number;
  y: number;
  visible: boolean;
  align?: "left" | "center" | "right" | "free";
  color?: string;
  highlight?: string;
  mode?: "stacked" | "free";
  w?: number;
  h?: number;
};

export type ProjectPage = {
  id: string;
  name: string;
  pageTitle?: string;
  subtitle?: string;
  description?: string;
  summary?: string[];
  summarySections?: SummarySection[];
  summaryStyle?: "none" | "numeric" | "roman" | "alpha";
  blocks?: Partial<Record<"title" | "subtitle" | "description" | "summary", ProjectBlock>>;
};

export type SummaryBlockType = "text" | "image" | "table" | "video" | "card";

export type SummaryCardField = {
  id: string;
  label: string;
};

export type SummaryCardEntry = {
  id: string;
  title: string;
  image?: string;
  background?: string;
  backgroundImage?: string;
  values: Record<string, string>;
};

export type SummaryImageEntry = {
  src: string;
  title?: string;
};

export type SummaryVideoEntry = {
  src: string;
  title?: string;
};

export type SummaryTableColumn = {
  id: string;
  label: string;
  type:
    | "text"
    | "number"
    | "date"
    | "checkbox"
    | "link"
    | "image"
    | "video"
    | "select"
    | "multiselect"
    | "yesno";
  width?: number;
  numberFormat?: "plain" | "eur" | "percent";
  options?: Array<{
    id: string;
    label: string;
    color?: string;
  }>;
};

export type SummaryTableRow = {
  id: string;
  values: Record<string, string | boolean>;
};

export type SummaryTableData = {
  columns: SummaryTableColumn[];
  rows: SummaryTableRow[];
};

export type SummaryBlock = {
  id: string;
  type: SummaryBlockType;
  title?: string;
  content?: string;
  url?: string;
  letterSpacing?: string;
  layout?: "list" | "gallery" | "cards" | "carousel";
  template?: SummaryCardField[];
  cards?: SummaryCardEntry[];
  fields?: Array<SummaryCardField & { value?: string }>;
  images?: SummaryImageEntry[];
  videos?: SummaryVideoEntry[];
  table?: SummaryTableData;
};

export type SummarySection = {
  id: string;
  title: string;
  blocks: SummaryBlock[];
};

export type Project = {
  id: string;
  title: string;
  pageTitle?: string;
  subtitle?: string;
  description?: string;
  summary?: string[];
  summarySections?: SummarySection[];
  summaryStyle?: "none" | "numeric" | "roman" | "alpha";
  pages?: ProjectPage[];
  blocks?: Partial<
    Record<
      "title" | "subtitle" | "description" | "summary",
      ProjectBlock
    >
  >;
  createdAt: number;
};

type ProjectState = {
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
};

const createSafeStorage = () => ({
  getItem: (name: string) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      try {
        localStorage.removeItem(name);
        localStorage.setItem(name, value);
      } catch {
        // Ignore quota errors to avoid crashing the app.
      }
    }
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // Ignore removal errors.
    }
  },
});

const buildFallbackId = (index: number) => {
  return `project-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
};

const normalizeProjects = (projects: Project[]) => {
  const seen = new Set<string>();
  let changed = false;
  const normalized = projects.map((project, index) => {
    const raw = project.id !== null && project.id !== undefined ? String(project.id).trim() : "";
    const invalid = raw === "" || raw === "undefined" || raw === "null";
    let nextId = invalid ? "" : raw;
    if (!nextId || seen.has(nextId)) {
      nextId = buildFallbackId(index);
      while (seen.has(nextId)) {
        nextId = `${nextId}-${Math.random().toString(36).slice(2, 5)}`;
      }
    }
    seen.add(nextId);
    if (nextId !== project.id) {
      changed = true;
      return { ...project, id: nextId };
    }
    return project;
  });
  return { projects: normalized, changed };
};

const PROJECT_STORAGE_KEY = "infinity-projects-v1";

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      projects: [],

      setProjects: (projects) => {
        const normalized = normalizeProjects(projects);
        set({ projects: normalized.projects });
      },

      addProject: (project) =>
        set((state) => {
          const normalized = normalizeProjects([project, ...state.projects]);
          return { projects: normalized.projects };
        }),

      updateProject: (id, patch) =>
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === id ? { ...project, ...patch } : project,
          ),
        })),

      deleteProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((project) => project.id !== id),
        })),
    }),
    {
      name: PROJECT_STORAGE_KEY,
      storage:
        typeof window !== "undefined"
          ? createJSONStorage(createSafeStorage)
          : undefined,
      merge: (persistedState, currentState) => {
        const merged = {
          ...currentState,
          ...(persistedState as ProjectState),
        };
        const normalized = normalizeProjects(merged.projects ?? []);
        return {
          ...merged,
          projects: normalized.projects,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const normalized = normalizeProjects(state.projects ?? []);
        if (normalized.changed) {
          state.setProjects(normalized.projects);
        }
      },
      partialize: (state) => ({
        projects: state.projects,
      }),
    },
  ),
);
