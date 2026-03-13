import {
  createDefaultMatchSheetDraft,
  createEmptyStarters,
  createDefaultSlotPositions,
  DEFAULT_MATCH_SHEET_FORMATION,
  DEFAULT_MATCH_SHEET_FORMAT,
  MATCH_SHEET_FORMATIONS,
  getDefaultFormationForFormat,
  isFormationCompatibleWithFormat,
  sanitizeSlotPositions,
} from "./config";
import type {
  MatchSheetDraft,
  MatchSheetFormation,
  MatchSheetFormat,
  MatchSheetPlayer,
  MatchSheetPlayerSource,
} from "./types";

const STORAGE_PREFIX = "infinity-foot.match-sheet";

function isMatchSheetFormation(value: unknown): value is MatchSheetFormation {
  return (
    typeof value === "string" &&
    Object.hasOwn(MATCH_SHEET_FORMATIONS, value)
  );
}

function getStorageKey(teamId: string, matchId: string) {
  return `${STORAGE_PREFIX}.${teamId}.${matchId}`;
}

function sanitizePlayerSource(value: unknown): MatchSheetPlayerSource {
  return value === "team" || value === "club" || value === "staff"
    ? value
    : "manual";
}

function sanitizeManualPlayers(value: unknown): MatchSheetPlayer[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((candidate) => {
      if (!candidate || typeof candidate !== "object") return null;

      const raw = candidate as Partial<MatchSheetPlayer>;
      if (typeof raw.id !== "string") return null;

      return {
        id: raw.id,
        club_id: typeof raw.club_id === "string" ? raw.club_id : "manual",
        team_id: null,
        first_name: typeof raw.first_name === "string" ? raw.first_name : "",
        last_name: typeof raw.last_name === "string" ? raw.last_name : "",
        license_number:
          typeof raw.license_number === "string" ? raw.license_number : "",
        photo_url: null,
        custom_fields: Array.isArray(raw.custom_fields) ? raw.custom_fields : [],
        created_at:
          typeof raw.created_at === "string" ? raw.created_at : undefined,
        source: sanitizePlayerSource(raw.source),
      };
    })
    .filter((player): player is MatchSheetPlayer => Boolean(player));
}

function sanitizeDraft(
  value: unknown,
  validPlayerIds: string[],
  fallbackFormat: MatchSheetFormat,
): MatchSheetDraft {
  if (!value || typeof value !== "object") {
    return createDefaultMatchSheetDraft(fallbackFormat);
  }

  const rawDraft = value as Partial<MatchSheetDraft>;
  const detectedFormat = fallbackFormat || DEFAULT_MATCH_SHEET_FORMAT;
  const formation =
    isMatchSheetFormation(rawDraft.formation) &&
    isFormationCompatibleWithFormat(rawDraft.formation, detectedFormat)
      ? rawDraft.formation
      : getDefaultFormationForFormat(detectedFormat) || DEFAULT_MATCH_SHEET_FORMATION;
  const opponentFormation =
    isMatchSheetFormation(rawDraft.opponentFormation) &&
    isFormationCompatibleWithFormat(rawDraft.opponentFormation, detectedFormat)
      ? rawDraft.opponentFormation
      : getDefaultFormationForFormat(detectedFormat) || DEFAULT_MATCH_SHEET_FORMATION;
  const startersBySlot = createEmptyStarters(formation);
  const manualPlayers = sanitizeManualPlayers(rawDraft.manualPlayers);
  const opponentStartersBySlot = createEmptyStarters(opponentFormation);
  const opponentManualPlayers = sanitizeManualPlayers(rawDraft.opponentManualPlayers);
  const validIds = new Set([
    ...validPlayerIds,
    ...manualPlayers.map((player) => player.id),
  ]);
  const opponentValidIds = new Set(opponentManualPlayers.map((player) => player.id));
  const usedIds = new Set<string>();
  const opponentUsedIds = new Set<string>();

  if (rawDraft.startersBySlot && typeof rawDraft.startersBySlot === "object") {
    MATCH_SHEET_FORMATIONS[formation].forEach((slot) => {
      const candidate = rawDraft.startersBySlot?.[slot.id];
      if (
        typeof candidate === "string" &&
        validIds.has(candidate) &&
        !usedIds.has(candidate)
      ) {
        startersBySlot[slot.id] = candidate;
        usedIds.add(candidate);
      }
    });
  }

  if (
    rawDraft.opponentStartersBySlot &&
    typeof rawDraft.opponentStartersBySlot === "object"
  ) {
    MATCH_SHEET_FORMATIONS[opponentFormation].forEach((slot) => {
      const candidate = rawDraft.opponentStartersBySlot?.[slot.id];
      if (
        typeof candidate === "string" &&
        opponentValidIds.has(candidate) &&
        !opponentUsedIds.has(candidate)
      ) {
        opponentStartersBySlot[slot.id] = candidate;
        opponentUsedIds.add(candidate);
      }
    });
  }

  const substitutes =
    Array.isArray(rawDraft.substitutes)
      ? rawDraft.substitutes.filter(
          (candidate): candidate is string =>
            typeof candidate === "string" &&
            validIds.has(candidate) &&
            !usedIds.has(candidate),
        )
      : [];

  substitutes.forEach((playerId) => {
    usedIds.add(playerId);
  });

  const staffAssignments =
    Array.isArray(rawDraft.staffAssignments)
      ? rawDraft.staffAssignments.filter(
          (candidate): candidate is string =>
            typeof candidate === "string" &&
            validIds.has(candidate) &&
            !usedIds.has(candidate),
        )
      : [];

  staffAssignments.forEach((playerId) => {
    usedIds.add(playerId);
  });

  const opponentSubstitutes =
    Array.isArray(rawDraft.opponentSubstitutes)
      ? rawDraft.opponentSubstitutes.filter(
          (candidate): candidate is string =>
            typeof candidate === "string" &&
            opponentValidIds.has(candidate) &&
            !opponentUsedIds.has(candidate),
        )
      : [];

  opponentSubstitutes.forEach((playerId) => {
    opponentUsedIds.add(playerId);
  });

  const opponentStaffAssignments =
    Array.isArray(rawDraft.opponentStaffAssignments)
      ? rawDraft.opponentStaffAssignments.filter(
          (candidate): candidate is string =>
            typeof candidate === "string" &&
            opponentValidIds.has(candidate) &&
            !opponentUsedIds.has(candidate),
        )
      : [];

  opponentStaffAssignments.forEach((playerId) => {
    opponentUsedIds.add(playerId);
  });

  const slotPositionsByFormation: MatchSheetDraft["slotPositionsByFormation"] = {};
  const opponentSlotPositionsByFormation: MatchSheetDraft["opponentSlotPositionsByFormation"] =
    {};

  if (
    rawDraft.slotPositionsByFormation &&
    typeof rawDraft.slotPositionsByFormation === "object"
  ) {
    Object.keys(rawDraft.slotPositionsByFormation).forEach((formationKey) => {
      if (!isMatchSheetFormation(formationKey)) return;
      slotPositionsByFormation[formationKey] = sanitizeSlotPositions(
        formationKey,
        rawDraft.slotPositionsByFormation?.[formationKey],
      );
    });
  }

  if (
    rawDraft.opponentSlotPositionsByFormation &&
    typeof rawDraft.opponentSlotPositionsByFormation === "object"
  ) {
    Object.keys(rawDraft.opponentSlotPositionsByFormation).forEach(
      (formationKey) => {
        if (!isMatchSheetFormation(formationKey)) return;
        opponentSlotPositionsByFormation[formationKey] = sanitizeSlotPositions(
          formationKey,
          rawDraft.opponentSlotPositionsByFormation?.[formationKey],
        );
      },
    );
  }

  slotPositionsByFormation[formation] =
    slotPositionsByFormation[formation] ??
    createDefaultSlotPositions(formation);
  opponentSlotPositionsByFormation[opponentFormation] =
    opponentSlotPositionsByFormation[opponentFormation] ??
    createDefaultSlotPositions(opponentFormation);

  const selectedSquadIds =
    Array.isArray(rawDraft.selectedSquadIds)
      ? rawDraft.selectedSquadIds.filter(
          (candidate): candidate is string =>
            typeof candidate === "string" && validIds.has(candidate),
        )
      : Array.from(usedIds);
  const opponentSelectedSquadIds =
    Array.isArray(rawDraft.opponentSelectedSquadIds)
      ? rawDraft.opponentSelectedSquadIds.filter(
          (candidate): candidate is string =>
            typeof candidate === "string" && opponentValidIds.has(candidate),
        )
      : Array.from(opponentUsedIds);

  return {
    format: detectedFormat,
    formation,
    startersBySlot,
    slotPositionsByFormation,
    manualPlayers,
    selectedSquadIds,
    substitutes,
    staffAssignments,
    opponentFormation,
    opponentStartersBySlot,
    opponentSlotPositionsByFormation,
    opponentManualPlayers,
    opponentSelectedSquadIds,
    opponentSubstitutes,
    opponentStaffAssignments,
    opponentTeamCode:
      typeof rawDraft.opponentTeamCode === "string"
        ? rawDraft.opponentTeamCode
        : "",
    coachNotes:
      typeof rawDraft.coachNotes === "string" ? rawDraft.coachNotes : "",
    updatedAt:
      typeof rawDraft.updatedAt === "string"
        ? rawDraft.updatedAt
        : new Date().toISOString(),
  };
}

export function loadMatchSheetDraft(
  teamId: string,
  matchId: string,
  validPlayerIds: string[],
  fallbackFormat: MatchSheetFormat = DEFAULT_MATCH_SHEET_FORMAT,
) {
  if (typeof window === "undefined") {
    return createDefaultMatchSheetDraft(fallbackFormat);
  }

  const storedValue = window.localStorage.getItem(getStorageKey(teamId, matchId));
  if (!storedValue) {
    return createDefaultMatchSheetDraft(fallbackFormat);
  }

  try {
    return sanitizeDraft(JSON.parse(storedValue), validPlayerIds, fallbackFormat);
  } catch {
    return createDefaultMatchSheetDraft(fallbackFormat);
  }
}

export function saveMatchSheetDraft(
  teamId: string,
  matchId: string,
  draft: MatchSheetDraft,
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    getStorageKey(teamId, matchId),
    JSON.stringify({
      ...draft,
      updatedAt: new Date().toISOString(),
    }),
  );
}
