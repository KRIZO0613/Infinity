import type { TournamentPreviewData } from "@/components/tournament-preview/types";
import type {
  TournamentProductGroup,
  TournamentProductSavedTournament,
} from "@/app/app/teams/[id]/matches/_components/tournament-product/types";

export const MANUAL_TOURNAMENT_PRODUCTS_STORAGE_KEY = "infinity:manual-tournament-products";

export type StoredManualTournamentProduct = {
  id: string;
  source: "manual";
  tournament: TournamentProductSavedTournament;
  groups: TournamentProductGroup[];
  previewDataByDivision: Array<{
    id: string;
    name: string;
    data: TournamentPreviewData;
  }>;
  createdAt: string;
  updatedAt: string;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const sanitizeStoredManualTournamentProducts = (
  value: unknown,
): StoredManualTournamentProduct[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!isPlainObject(entry)) return [];
    const tournament = entry.tournament;
    if (!isPlainObject(tournament) || typeof tournament.id !== "string") return [];

    return [
      {
        id: typeof entry.id === "string" ? entry.id : tournament.id,
        source: "manual",
        tournament: tournament as TournamentProductSavedTournament,
        groups: Array.isArray(entry.groups) ? (entry.groups as TournamentProductGroup[]) : [],
        previewDataByDivision: Array.isArray(entry.previewDataByDivision)
          ? (entry.previewDataByDivision as StoredManualTournamentProduct["previewDataByDivision"])
          : [],
        createdAt:
          typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
        updatedAt:
          typeof entry.updatedAt === "string" ? entry.updatedAt : new Date().toISOString(),
      },
    ];
  });
};

export const readStoredManualTournamentProducts = (): StoredManualTournamentProduct[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(MANUAL_TOURNAMENT_PRODUCTS_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeStoredManualTournamentProducts(JSON.parse(raw));
  } catch {
    return [];
  }
};

export const writeStoredManualTournamentProducts = (
  entries: StoredManualTournamentProduct[],
) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    MANUAL_TOURNAMENT_PRODUCTS_STORAGE_KEY,
    JSON.stringify(entries),
  );
};

export const upsertStoredManualTournamentProduct = (
  entry: StoredManualTournamentProduct,
) => {
  const current = readStoredManualTournamentProducts();
  const nextEntries = current.some((stored) => stored.id === entry.id)
    ? current.map((stored) => (stored.id === entry.id ? entry : stored))
    : [entry, ...current];

  writeStoredManualTournamentProducts(nextEntries);
};

export const getStoredManualTournamentProductById = (id: string) =>
  readStoredManualTournamentProducts().find((entry) => entry.id === id) ?? null;

export const removeStoredManualTournamentProductById = (id: string) => {
  const nextEntries = readStoredManualTournamentProducts().filter((entry) => entry.id !== id);
  writeStoredManualTournamentProducts(nextEntries);
};
