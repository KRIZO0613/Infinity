import type {
  MatchSheetDraft,
  MatchSheetFormation,
  MatchSheetFormat,
  MatchSheetLineupDraft,
  MatchSheetPlayer,
  MatchSheetSlot,
  MatchSheetSlotPosition,
} from "./types";

export const DEFAULT_MATCH_SHEET_FORMAT: MatchSheetFormat = "foot-11";
export const DEFAULT_MATCH_SHEET_FORMATION: MatchSheetFormation = "4-3-3";
const SLOT_POSITION_MIN_X = 10;
const SLOT_POSITION_MAX_X = 90;
const SLOT_POSITION_MIN_Y = 10;
const SLOT_POSITION_MAX_Y = 94;

export const MATCH_SHEET_FORMATIONS_BY_FORMAT: Record<
  MatchSheetFormat,
  Record<MatchSheetFormation, MatchSheetSlot[]>
> = {
  "foot-5": {
    "2-2": [
      { id: "gk", label: "Gardien", shortLabel: "GB", role: "goalkeeper", x: 50, y: 92 },
      { id: "ld", label: "Défenseur gauche", shortLabel: "DG", role: "defender", x: 34, y: 60 },
      { id: "rd", label: "Défenseur droit", shortLabel: "DD", role: "defender", x: 66, y: 60 },
      { id: "lm", label: "Joueur gauche", shortLabel: "JG", role: "midfielder", x: 34, y: 36 },
      { id: "rm", label: "Joueur droit", shortLabel: "JD", role: "midfielder", x: 66, y: 36 },
    ],
    "1-2-1": [
      { id: "gk", label: "Gardien", shortLabel: "GB", role: "goalkeeper", x: 50, y: 92 },
      { id: "cb", label: "Défenseur", shortLabel: "DC", role: "defender", x: 50, y: 60 },
      { id: "lm", label: "Milieu gauche", shortLabel: "MG", role: "midfielder", x: 34, y: 36 },
      { id: "rm", label: "Milieu droit", shortLabel: "MD", role: "midfielder", x: 66, y: 36 },
      { id: "st", label: "Attaquant", shortLabel: "BU", role: "forward", x: 50, y: 14 },
    ],
    "2-1-1": [
      { id: "gk", label: "Gardien", shortLabel: "GB", role: "goalkeeper", x: 50, y: 92 },
      { id: "ld", label: "Défenseur gauche", shortLabel: "DG", role: "defender", x: 34, y: 60 },
      { id: "rd", label: "Défenseur droit", shortLabel: "DD", role: "defender", x: 66, y: 60 },
      { id: "cm", label: "Milieu axial", shortLabel: "MC", role: "midfielder", x: 50, y: 36 },
      { id: "st", label: "Attaquant", shortLabel: "BU", role: "forward", x: 50, y: 14 },
    ],
    "3-3-1": [],
    "3-2-2": [],
    "2-3-2": [],
    "2-4-1": [],
    "4-3-3": [],
    "4-4-2": [],
    "3-5-2": [],
    "libre-5": [
      { id: "gk", label: "Gardien", shortLabel: "GB", role: "goalkeeper", x: 50, y: 92 },
      { id: "p1", label: "Joueur 1", shortLabel: "J1", role: "defender", x: 28, y: 60 },
      { id: "p2", label: "Joueur 2", shortLabel: "J2", role: "defender", x: 72, y: 60 },
      { id: "p3", label: "Joueur 3", shortLabel: "J3", role: "midfielder", x: 34, y: 36 },
      { id: "p4", label: "Joueur 4", shortLabel: "J4", role: "forward", x: 66, y: 14 },
    ],
    "libre-8": [],
    "libre-11": [],
  },
  "foot-8": {
    "2-2": [],
    "1-2-1": [],
    "2-1-1": [],
    "3-3-1": [
      { id: "gk", label: "Gardien", shortLabel: "GB", role: "goalkeeper", x: 50, y: 92 },
      { id: "ld", label: "Défenseur gauche", shortLabel: "DG", role: "defender", x: 26, y: 68 },
      { id: "cd", label: "Défenseur axial", shortLabel: "DC", role: "defender", x: 50, y: 68 },
      { id: "rd", label: "Défenseur droit", shortLabel: "DD", role: "defender", x: 74, y: 68 },
      { id: "lm", label: "Milieu gauche", shortLabel: "MG", role: "midfielder", x: 26, y: 42 },
      { id: "cm", label: "Milieu axial", shortLabel: "MC", role: "midfielder", x: 50, y: 42 },
      { id: "rm", label: "Milieu droit", shortLabel: "MD", role: "midfielder", x: 74, y: 42 },
      { id: "st", label: "Attaquant", shortLabel: "BU", role: "forward", x: 50, y: 16 },
    ],
    "3-2-2": [
      { id: "gk", label: "Gardien", shortLabel: "GB", role: "goalkeeper", x: 50, y: 92 },
      { id: "ld", label: "Défenseur gauche", shortLabel: "DG", role: "defender", x: 26, y: 68 },
      { id: "cd", label: "Défenseur axial", shortLabel: "DC", role: "defender", x: 50, y: 68 },
      { id: "rd", label: "Défenseur droit", shortLabel: "DD", role: "defender", x: 74, y: 68 },
      { id: "lcm", label: "Milieu gauche", shortLabel: "MG", role: "midfielder", x: 38, y: 42 },
      { id: "rcm", label: "Milieu droit", shortLabel: "MD", role: "midfielder", x: 62, y: 42 },
      { id: "lst", label: "Attaquant gauche", shortLabel: "AG", role: "forward", x: 38, y: 16 },
      { id: "rst", label: "Attaquant droit", shortLabel: "AD", role: "forward", x: 62, y: 16 },
    ],
    "2-3-2": [
      { id: "gk", label: "Gardien", shortLabel: "GB", role: "goalkeeper", x: 50, y: 92 },
      { id: "ld", label: "Défenseur gauche", shortLabel: "DG", role: "defender", x: 38, y: 68 },
      { id: "rd", label: "Défenseur droit", shortLabel: "DD", role: "defender", x: 62, y: 68 },
      { id: "lm", label: "Milieu gauche", shortLabel: "MG", role: "midfielder", x: 24, y: 42 },
      { id: "cm", label: "Milieu axial", shortLabel: "MC", role: "midfielder", x: 50, y: 42 },
      { id: "rm", label: "Milieu droit", shortLabel: "MD", role: "midfielder", x: 76, y: 42 },
      { id: "lst", label: "Attaquant gauche", shortLabel: "AG", role: "forward", x: 38, y: 16 },
      { id: "rst", label: "Attaquant droit", shortLabel: "AD", role: "forward", x: 62, y: 16 },
    ],
    "2-4-1": [
      { id: "gk", label: "Gardien", shortLabel: "GB", role: "goalkeeper", x: 50, y: 92 },
      { id: "ld", label: "Défenseur gauche", shortLabel: "DG", role: "defender", x: 38, y: 68 },
      { id: "rd", label: "Défenseur droit", shortLabel: "DD", role: "defender", x: 62, y: 68 },
      { id: "lm", label: "Couloir gauche", shortLabel: "MG", role: "midfielder", x: 18, y: 42 },
      { id: "lcm", label: "Milieu gauche", shortLabel: "MC", role: "midfielder", x: 40, y: 42 },
      { id: "rcm", label: "Milieu droit", shortLabel: "MC", role: "midfielder", x: 60, y: 42 },
      { id: "rm", label: "Couloir droit", shortLabel: "MD", role: "midfielder", x: 82, y: 42 },
      { id: "st", label: "Attaquant", shortLabel: "BU", role: "forward", x: 50, y: 16 },
    ],
    "4-3-3": [],
    "4-4-2": [],
    "3-5-2": [],
    "libre-5": [],
    "libre-8": [
      { id: "gk", label: "Gardien", shortLabel: "GB", role: "goalkeeper", x: 50, y: 92 },
      { id: "p1", label: "Joueur 1", shortLabel: "J1", role: "defender", x: 22, y: 68 },
      { id: "p2", label: "Joueur 2", shortLabel: "J2", role: "defender", x: 50, y: 68 },
      { id: "p3", label: "Joueur 3", shortLabel: "J3", role: "defender", x: 78, y: 68 },
      { id: "p4", label: "Joueur 4", shortLabel: "J4", role: "midfielder", x: 22, y: 42 },
      { id: "p5", label: "Joueur 5", shortLabel: "J5", role: "midfielder", x: 50, y: 42 },
      { id: "p6", label: "Joueur 6", shortLabel: "J6", role: "midfielder", x: 78, y: 42 },
      { id: "p7", label: "Joueur 7", shortLabel: "J7", role: "forward", x: 50, y: 16 },
    ],
    "libre-11": [],
  },
  "foot-11": {
    "2-2": [],
    "1-2-1": [],
    "2-1-1": [],
    "3-3-1": [],
    "3-2-2": [],
    "2-3-2": [],
    "2-4-1": [],
    "4-3-3": [
      { id: "gk", label: "Gardien", shortLabel: "GB", role: "goalkeeper", x: 50, y: 92 },
      { id: "lb", label: "Latéral gauche", shortLabel: "DG", role: "defender", x: 18, y: 72 },
      { id: "lcb", label: "Défenseur central gauche", shortLabel: "DC", role: "defender", x: 38, y: 72 },
      { id: "rcb", label: "Défenseur central droit", shortLabel: "DC", role: "defender", x: 62, y: 72 },
      { id: "rb", label: "Latéral droit", shortLabel: "DD", role: "defender", x: 82, y: 72 },
      { id: "lcm", label: "Milieu gauche", shortLabel: "MC", role: "midfielder", x: 28, y: 46 },
      { id: "cm", label: "Milieu axial", shortLabel: "MDC", role: "midfielder", x: 50, y: 46 },
      { id: "rcm", label: "Milieu droit", shortLabel: "MC", role: "midfielder", x: 72, y: 46 },
      { id: "lw", label: "Ailier gauche", shortLabel: "AG", role: "forward", x: 22, y: 20 },
      { id: "st", label: "Avant-centre", shortLabel: "BU", role: "forward", x: 50, y: 20 },
      { id: "rw", label: "Ailier droit", shortLabel: "AD", role: "forward", x: 78, y: 20 },
    ],
    "4-4-2": [
      { id: "gk", label: "Gardien", shortLabel: "GB", role: "goalkeeper", x: 50, y: 92 },
      { id: "lb", label: "Latéral gauche", shortLabel: "DG", role: "defender", x: 18, y: 72 },
      { id: "lcb", label: "Défenseur central gauche", shortLabel: "DC", role: "defender", x: 38, y: 72 },
      { id: "rcb", label: "Défenseur central droit", shortLabel: "DC", role: "defender", x: 62, y: 72 },
      { id: "rb", label: "Latéral droit", shortLabel: "DD", role: "defender", x: 82, y: 72 },
      { id: "lm", label: "Milieu gauche", shortLabel: "MG", role: "midfielder", x: 18, y: 46 },
      { id: "lcm", label: "Milieu central gauche", shortLabel: "MC", role: "midfielder", x: 38, y: 46 },
      { id: "rcm", label: "Milieu central droit", shortLabel: "MC", role: "midfielder", x: 62, y: 46 },
      { id: "rm", label: "Milieu droit", shortLabel: "MD", role: "midfielder", x: 82, y: 46 },
      { id: "lst", label: "Attaquant gauche", shortLabel: "BU", role: "forward", x: 38, y: 20 },
      { id: "rst", label: "Attaquant droit", shortLabel: "BU", role: "forward", x: 62, y: 20 },
    ],
    "3-5-2": [
      { id: "gk", label: "Gardien", shortLabel: "GB", role: "goalkeeper", x: 50, y: 92 },
      { id: "lcb", label: "Défenseur central gauche", shortLabel: "DC", role: "defender", x: 28, y: 72 },
      { id: "cb", label: "Défenseur central", shortLabel: "DC", role: "defender", x: 50, y: 72 },
      { id: "rcb", label: "Défenseur central droit", shortLabel: "DC", role: "defender", x: 72, y: 72 },
      { id: "lwb", label: "Piston gauche", shortLabel: "PG", role: "midfielder", x: 14, y: 46 },
      { id: "lcm", label: "Milieu central gauche", shortLabel: "MC", role: "midfielder", x: 36, y: 46 },
      { id: "cm", label: "Milieu axial", shortLabel: "MDC", role: "midfielder", x: 50, y: 46 },
      { id: "rcm", label: "Milieu central droit", shortLabel: "MC", role: "midfielder", x: 64, y: 46 },
      { id: "rwb", label: "Piston droit", shortLabel: "PD", role: "midfielder", x: 86, y: 46 },
      { id: "lst", label: "Attaquant gauche", shortLabel: "BU", role: "forward", x: 38, y: 20 },
      { id: "rst", label: "Attaquant droit", shortLabel: "BU", role: "forward", x: 62, y: 20 },
    ],
    "libre-5": [],
    "libre-8": [],
    "libre-11": [
      { id: "gk", label: "Gardien", shortLabel: "GB", role: "goalkeeper", x: 50, y: 92 },
      { id: "p1", label: "Joueur 1", shortLabel: "J1", role: "defender", x: 16, y: 72 },
      { id: "p2", label: "Joueur 2", shortLabel: "J2", role: "defender", x: 34, y: 72 },
      { id: "p3", label: "Joueur 3", shortLabel: "J3", role: "defender", x: 50, y: 72 },
      { id: "p4", label: "Joueur 4", shortLabel: "J4", role: "defender", x: 66, y: 72 },
      { id: "p5", label: "Joueur 5", shortLabel: "J5", role: "defender", x: 84, y: 72 },
      { id: "p6", label: "Joueur 6", shortLabel: "J6", role: "midfielder", x: 18, y: 46 },
      { id: "p7", label: "Joueur 7", shortLabel: "J7", role: "midfielder", x: 38, y: 46 },
      { id: "p8", label: "Joueur 8", shortLabel: "J8", role: "midfielder", x: 62, y: 46 },
      { id: "p9", label: "Joueur 9", shortLabel: "J9", role: "midfielder", x: 82, y: 46 },
      { id: "p10", label: "Joueur 10", shortLabel: "J10", role: "forward", x: 50, y: 20 },
    ],
  },
};

export const MATCH_SHEET_FORMATIONS = {
  "2-2": MATCH_SHEET_FORMATIONS_BY_FORMAT["foot-5"]["2-2"],
  "1-2-1": MATCH_SHEET_FORMATIONS_BY_FORMAT["foot-5"]["1-2-1"],
  "2-1-1": MATCH_SHEET_FORMATIONS_BY_FORMAT["foot-5"]["2-1-1"],
  "3-3-1": MATCH_SHEET_FORMATIONS_BY_FORMAT["foot-8"]["3-3-1"],
  "3-2-2": MATCH_SHEET_FORMATIONS_BY_FORMAT["foot-8"]["3-2-2"],
  "2-3-2": MATCH_SHEET_FORMATIONS_BY_FORMAT["foot-8"]["2-3-2"],
  "2-4-1": MATCH_SHEET_FORMATIONS_BY_FORMAT["foot-8"]["2-4-1"],
  "4-3-3": MATCH_SHEET_FORMATIONS_BY_FORMAT["foot-11"]["4-3-3"],
  "4-4-2": MATCH_SHEET_FORMATIONS_BY_FORMAT["foot-11"]["4-4-2"],
  "3-5-2": MATCH_SHEET_FORMATIONS_BY_FORMAT["foot-11"]["3-5-2"],
  "libre-5": MATCH_SHEET_FORMATIONS_BY_FORMAT["foot-5"]["libre-5"],
  "libre-8": MATCH_SHEET_FORMATIONS_BY_FORMAT["foot-8"]["libre-8"],
  "libre-11": MATCH_SHEET_FORMATIONS_BY_FORMAT["foot-11"]["libre-11"],
} satisfies Record<MatchSheetFormation, MatchSheetSlot[]>;

export const MATCH_SHEET_FORMAT_OPTIONS = [
  { value: "foot-5", label: "Foot à 5" },
  { value: "foot-8", label: "Foot à 8" },
  { value: "foot-11", label: "Foot à 11" },
] as const;

export const MATCH_SHEET_FORMATION_OPTIONS_BY_FORMAT: Record<
  MatchSheetFormat,
  Array<{ value: MatchSheetFormation; label: string }>
> = {
  "foot-5": [
    { value: "2-2", label: "2-2" },
    { value: "1-2-1", label: "1-2-1" },
    { value: "2-1-1", label: "2-1-1" },
    { value: "libre-5", label: "Libre" },
  ],
  "foot-8": [
    { value: "3-3-1", label: "3-3-1" },
    { value: "3-2-2", label: "3-2-2" },
    { value: "2-3-2", label: "2-3-2" },
    { value: "2-4-1", label: "2-4-1" },
    { value: "libre-8", label: "Libre" },
  ],
  "foot-11": [
    { value: "4-3-3", label: "4-3-3" },
    { value: "4-4-2", label: "4-4-2" },
    { value: "3-5-2", label: "3-5-2" },
    { value: "libre-11", label: "Libre" },
  ],
};

const FORMATION_TO_FORMAT = MATCH_SHEET_FORMAT_OPTIONS.reduce<
  Partial<Record<MatchSheetFormation, MatchSheetFormat>>
>((accumulator, option) => {
  MATCH_SHEET_FORMATION_OPTIONS_BY_FORMAT[option.value].forEach((formation) => {
    accumulator[formation.value] = option.value;
  });
  return accumulator;
}, {});

export function getMatchSheetFormatForFormation(
  formation: MatchSheetFormation,
) {
  return FORMATION_TO_FORMAT[formation] ?? DEFAULT_MATCH_SHEET_FORMAT;
}

export function getDefaultFormationForFormat(format: MatchSheetFormat) {
  return MATCH_SHEET_FORMATION_OPTIONS_BY_FORMAT[format][0]?.value ??
    DEFAULT_MATCH_SHEET_FORMATION;
}

export function getFormationOptionsForFormat(format: MatchSheetFormat) {
  return MATCH_SHEET_FORMATION_OPTIONS_BY_FORMAT[format];
}

export function isFormationCompatibleWithFormat(
  formation: MatchSheetFormation,
  format: MatchSheetFormat,
) {
  return getMatchSheetFormatForFormation(formation) === format;
}

export function isFreeMatchSheetFormation(formation: MatchSheetFormation) {
  return (
    formation === "libre-5" ||
    formation === "libre-8" ||
    formation === "libre-11"
  );
}

function clampSlotCoordinate(
  value: number,
  min: number,
  max: number,
) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function createDefaultSlotPositions(
  formation: MatchSheetFormation,
) {
  return MATCH_SHEET_FORMATIONS[formation].reduce<
    Record<string, MatchSheetSlotPosition>
  >((accumulator, slot) => {
    accumulator[slot.id] = { x: slot.x, y: slot.y };
    return accumulator;
  }, {});
}

export function sanitizeSlotPositions(
  formation: MatchSheetFormation,
  value: unknown,
) {
  const defaults = createDefaultSlotPositions(formation);

  if (!value || typeof value !== "object") {
    return defaults;
  }

  const raw = value as Record<string, Partial<MatchSheetSlotPosition>>;

  Object.keys(defaults).forEach((slotId) => {
    const slotValue = raw[slotId];
    if (!slotValue || typeof slotValue !== "object") return;

    defaults[slotId] = {
      x: clampSlotCoordinate(
        Number(slotValue.x),
        SLOT_POSITION_MIN_X,
        SLOT_POSITION_MAX_X,
      ),
      y: clampSlotCoordinate(
        Number(slotValue.y),
        SLOT_POSITION_MIN_Y,
        SLOT_POSITION_MAX_Y,
      ),
    };
  });

  return defaults;
}

export function getMatchSheetSlots(
  formation: MatchSheetFormation,
  slotPositions?: Record<string, MatchSheetSlotPosition>,
) {
  return MATCH_SHEET_FORMATIONS[formation].map((slot) => {
    const customPosition = slotPositions?.[slot.id];
    if (!customPosition) return slot;

    return {
      ...slot,
      x: customPosition.x,
      y: customPosition.y,
    };
  });
}

export function getDefaultMatchSheetFormatForCategory(
  category: string | null | undefined,
): MatchSheetFormat {
  if (!category) return DEFAULT_MATCH_SHEET_FORMAT;

  const normalized = category.toUpperCase();
  const match = normalized.match(/\bU\s*(\d{1,2})\b/);
  if (!match) return DEFAULT_MATCH_SHEET_FORMAT;

  const age = Number(match[1]);
  if (Number.isNaN(age)) return DEFAULT_MATCH_SHEET_FORMAT;
  return age <= 11 ? "foot-8" : DEFAULT_MATCH_SHEET_FORMAT;
}

export function createEmptyStarters(formation: MatchSheetFormation) {
  return MATCH_SHEET_FORMATIONS[formation].reduce<Record<string, string | null>>(
    (accumulator, slot) => {
      accumulator[slot.id] = null;
      return accumulator;
    },
    {},
  );
}

export function createDefaultMatchSheetDraft(
  format: MatchSheetFormat = DEFAULT_MATCH_SHEET_FORMAT,
  formation: MatchSheetFormation = getDefaultFormationForFormat(format),
): MatchSheetDraft {
  const defaultLineup = createDefaultMatchSheetLineupDraft(format, formation);

  return {
    format,
    formation: defaultLineup.formation,
    startersBySlot: defaultLineup.startersBySlot,
    slotPositionsByFormation: defaultLineup.slotPositionsByFormation,
    manualPlayers: defaultLineup.manualPlayers,
    selectedSquadIds: defaultLineup.selectedSquadIds,
    substitutes: defaultLineup.substitutes,
    staffAssignments: defaultLineup.staffAssignments,
    opponentFormation: defaultLineup.formation,
    opponentStartersBySlot: createEmptyStarters(defaultLineup.formation),
    opponentSlotPositionsByFormation: {
      [defaultLineup.formation]: createDefaultSlotPositions(defaultLineup.formation),
    },
    opponentManualPlayers: [],
    opponentSelectedSquadIds: [],
    opponentSubstitutes: [],
    opponentStaffAssignments: [],
    opponentTeamCode: "",
    coachNotes: "",
    plateauLineups: {},
    plateauOfficial: {
      firstName: "",
      lastName: "",
      licenseNumber: "",
      role: "",
      club: "",
    },
    plateauOfficialSignature: "",
    plateauSignatures: {},
    plateauResults: {},
    plateauSheetValidated: false,
    plateauResultsValidated: false,
    updatedAt: new Date().toISOString(),
  };
}

export function createDefaultMatchSheetLineupDraft(
  format: MatchSheetFormat = DEFAULT_MATCH_SHEET_FORMAT,
  formation: MatchSheetFormation = getDefaultFormationForFormat(format),
): MatchSheetLineupDraft {
  const safeFormation = isFormationCompatibleWithFormat(formation, format)
    ? formation
    : getDefaultFormationForFormat(format);

  return {
    formation: safeFormation,
    startersBySlot: createEmptyStarters(safeFormation),
    slotPositionsByFormation: {
      [safeFormation]: createDefaultSlotPositions(safeFormation),
    },
    manualPlayers: [],
    playerNumbersById: {},
    selectedSquadIds: [],
    substitutes: [],
    staffAssignments: [],
    validated: false,
  };
}

export function remapStartersForFormationChange(
  currentFormation: MatchSheetFormation,
  nextFormation: MatchSheetFormation,
  startersBySlot: Record<string, string | null>,
) {
  const assignedPlayers = MATCH_SHEET_FORMATIONS[currentFormation]
    .map((slot) => startersBySlot[slot.id])
    .filter((playerId): playerId is string => Boolean(playerId));

  const nextStarters = createEmptyStarters(nextFormation);

  MATCH_SHEET_FORMATIONS[nextFormation].forEach((slot, index) => {
    nextStarters[slot.id] = assignedPlayers[index] ?? null;
  });

  return nextStarters;
}

export function getPlayerDisplayName(player: MatchSheetPlayer) {
  return `${player.first_name} ${player.last_name}`.trim() || "Joueur";
}
