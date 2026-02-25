export type FrameSnapshot = {
  id: string;
  elementsSnapshot: Array<{ id: string; x: number; y: number }>;
};

export type PathPoint = {
  x: number;
  y: number;
  t: number;
};

export type Stroke = {
  id: string;
  kind: "move" | "carry";
  order: number;
  phaseId: number;
  sequenceIndex?: number;
  elementId?: string;
  ballIds?: string[];
  points: Array<{ x: number; y: number }>;
  style?: {
    dashed?: boolean;
    width?: number;
    arrow?: boolean;
    variant?: "move" | "carry" | "ball";
  };
  durationMs: number;
};

export type BaseSnapshot = Record<string, { x: number; y: number }>;

export type CanvasElementBase = {
  id: string;
  x: number;
  y: number;
  [key: string]: unknown;
};

type ExerciseObjective =
  | "passe"
  | "contrôle"
  | "conduite"
  | "tir"
  | "finition"
  | "centres"
  | "défense_individuelle"
  | "défense_collective"
  | "pressing"
  | "appels"
  | "conservation";

export type ExerciseKind = "animation" | "video" | "card";

export type ExerciseMetadataBase = {
  id: string;
  name: string;
  category?:
    | "échauffement"
    | "activation"
    | "motricité"
    | "technique"
    | "tactique"
    | "physique"
    | "jeu_opposition"
    | "situation_réelle"
    | "retour_au_calme";
  type?: "avec_ballon" | "sans_ballon" | "mixte";
  objective?: ExerciseObjective | ExerciseObjective[];
  levels?: ("U6-U9" | "U10-U11" | "U12-U13" | "U14-U15" | "U16+")[];
  durationMinutes?: number;
  notes?: string;
  equipment?: string;
  isIncomplete: boolean;
};

export type AnimatedExerciseMetadata = ExerciseMetadataBase & {
  format: "animation";
};

export type StaticExerciseMetadata = ExerciseMetadataBase & {
  format: "card";
};

export type ExerciseMetadata = AnimatedExerciseMetadata | StaticExerciseMetadata;

export type AnimatedExercisePayload = {
  pitchPreset?: string;
  pitchOrientation?: "landscape" | "portrait";
  elements?: CanvasElementBase[];
  keyframes?: FrameSnapshot[];
  paths?: Record<string, PathPoint[]>;
  strokes?: Stroke[];
  strokesBase?: BaseSnapshot | null;
  ballAttachments?: Record<string, string>;
  actionSpeedMultipliers?: Record<number, number> | Record<string, number>;
  frameSpeedMultipliers?: Record<string, number>;
  frameDuration?: number;
  metadata?: ExerciseMetadata;
  meta?: Partial<ExerciseMetadata>;
};

export type StaticExercisePayload = {
  pitchPreset?: string;
  pitchOrientation?: "landscape" | "portrait";
  elements?: CanvasElementBase[];
  paths?: Record<string, PathPoint[]>;
  ballAttachments?: Record<string, string>;
  pitchState?: {
    pitchPreset?: string;
    pitchOrientation?: "landscape" | "portrait";
    elements?: CanvasElementBase[];
    paths?: Record<string, PathPoint[]>;
    ballAttachments?: Record<string, string>;
  };
  coverImageUrl?: string | null;
  metadata?: ExerciseMetadata;
  meta?: Partial<ExerciseMetadata>;
};
