import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/* Types partagés */

export type ItemType = "event" | "task";

export type Tag = {
  id: string;
  name: string;
  color: string;
};

export type CalendarItem = {
  id: string;
  date: string;
  time: string;
  durationLabel?: string;
  endTime?: string;
  type: ItemType;
  title: string;
  description?: string;
  location?: string;
  pinned: boolean;
  tagId?: string;
  done?: boolean;
  visibility?: {
    timeline?: boolean;
    calendar?: boolean;
  };
  source?: {
    type: "table";
    blockId: string;
    rowId: string;
    projectId?: string;
  };
};

type CalendarState = {
  items: CalendarItem[];
  tags: Tag[];

  setItems: (items: CalendarItem[]) => void;
  addItem: (item: CalendarItem) => void;
  updateItem: (id: string, patch: Partial<CalendarItem>) => void;
  deleteItem: (id: string) => void;

  setTags: (tags: Tag[]) => void;
  addTag: (tag: Tag) => void;
  updateTag: (id: string, patch: Partial<Tag>) => void;
  deleteTag: (id: string) => void;
};

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set) => ({
      items: [],
      tags: [],

      // --- ITEMS ---
      setItems: (items) => set({ items }),

      addItem: (item) =>
        set((state) => ({
          items: [...state.items, item],
        })),

      updateItem: (id, patch) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, ...patch } : i,
          ),
        })),

      deleteItem: (id) =>
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        })),

      // --- TAGS ---
      setTags: (tags) => set({ tags }),

      addTag: (tag) =>
        set((state) => ({
          tags: [...state.tags, tag],
        })),

      updateTag: (id, patch) =>
        set((state) => ({
          tags: state.tags.map((t) =>
            t.id === id ? { ...t, ...patch } : t,
          ),
        })),

      deleteTag: (id) =>
        set((state) => ({
          tags: state.tags.filter((t) => t.id !== id),
        })),
    }),
    {
      name: "infinity-calendar-v1",
      storage:
        typeof window !== "undefined"
          ? createJSONStorage(() => localStorage)
          : undefined,

      // on ne sauvegarde que ces clés
      partialize: (state) => ({
        items: state.items,
        tags: state.tags,
      }),
    },
  ),
);
