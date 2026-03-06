"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";
import { MiniGoalIcon, PassWallIcon } from "@/components/assets";
import { useExerciseAnimationPlayer } from "@/components/useExerciseAnimationPlayer";

const TOOL_OPTIONS = [
  { key: "select", label: "Sélection" },
  { key: "player", label: "Joueur" },
  { key: "player_runner", label: "Joueur 3D" },
  { key: "player_runner_noball", label: "Joueur sans ballon" },
  { key: "ball", label: "Ballon" },
  { key: "cone", label: "Plot" },
  { key: "disc", label: "Coupelle" },
  { key: "hoop", label: "Cerceau" },
  { key: "baton", label: "Baton" },
  { key: "slalom_pole", label: "Piquet" },
  { key: "hurdle_bar", label: "Haie" },
  { key: "hurdle_pole", label: "Haie V" },
  { key: "mini_goal", label: "Mini but" },
  { key: "ladder", label: "Échelle" },
  { key: "pass_wall", label: "Mur" },
  { key: "line", label: "Forme - Ligne" },
  { key: "arrow", label: "Forme - Flèche" },
  { key: "line_dashed", label: "Forme - Ligne pointillée" },
  { key: "arrow_dashed", label: "Forme - Flèche pointillée" },
  { key: "polyline_dashed", label: "Forme - Multi points" },
  { key: "polyarrow_dashed", label: "Forme - Multi flèche" },
  { key: "rect_dashed", label: "Forme - Carré pointillé" },
  { key: "circle", label: "Forme - Cercle" },
  { key: "hexagon", label: "Forme - Hexagone" },
] as const;

type ToolKey = (typeof TOOL_OPTIONS)[number]["key"];

type ShapeKind =
  | "line"
  | "arrow"
  | "line_dashed"
  | "arrow_dashed"
  | "polyline_dashed"
  | "polyarrow_dashed"
  | "rect"
  | "rect_dashed"
  | "circle"
  | "hexagon";

type ElementType =
  | "player"
  | "ball"
  | "cone"
  | "disc"
  | "hoop"
  | "baton"
  | "slalom_pole"
  | "hurdle_bar"
  | "hurdle_pole"
  | "mini_goal"
  | "ladder"
  | "pass_wall"
  | "shape";

type CanvasElement = {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  color?: string;
  label?: string;
  playerStyle?: "classic" | "runner" | "runner_noball";
  size?: number;
  orientation?: "up" | "down";
  rotation?: number;
  shapeKind?: ShapeKind;
  shapePoints?: Array<{ x: number; y: number }>;
};

const SHAPE_TOOLS = [
  "line",
  "arrow",
  "line_dashed",
  "arrow_dashed",
  "polyline_dashed",
  "polyarrow_dashed",
  "rect_dashed",
  "circle",
  "hexagon",
] as const satisfies readonly ToolKey[];

type ShapeToolKey = (typeof SHAPE_TOOLS)[number];

const isShapeTool = (tool: ToolKey): tool is ShapeToolKey =>
  SHAPE_TOOLS.includes(tool as ShapeToolKey);

const ROTATABLE_SHAPES = [
  "line",
  "arrow",
  "line_dashed",
  "arrow_dashed",
] as const;

const isRotatableShape = (kind?: ShapeKind) =>
  Boolean(
    kind && ROTATABLE_SHAPES.includes(kind as (typeof ROTATABLE_SHAPES)[number]),
  );

const POLYLINE_SHAPES = [
  "polyline_dashed",
  "polyarrow_dashed",
] as const satisfies readonly ToolKey[];

const isPolylineShape = (kind?: ShapeKind) =>
  Boolean(kind && POLYLINE_SHAPES.includes(kind as PolylineToolKey));

type PolylineToolKey = (typeof POLYLINE_SHAPES)[number];

const isPolylineTool = (tool: ToolKey): tool is PolylineToolKey =>
  POLYLINE_SHAPES.includes(tool as PolylineToolKey);

type FrameSnapshot = {
  id: string;
  elementsSnapshot: Array<{ id: string; x: number; y: number }>;
};

type PathPoint = {
  x: number;
  y: number;
  t: number;
};

type BaseSnapshot = Record<string, { x: number; y: number }>;

type Stroke = {
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

type PitchPreset = "standard" | "training_dark_green";

type PitchRect = { x: number; y: number; w: number; h: number; isLandscape: boolean };

type KeyframePlayer = {
  isPlaying: boolean;
  playhead: number;
  toggle: () => void;
  setIsPlaying: (value: boolean) => void;
  reset: () => void;
  restart: () => void;
  frameDuration: number;
  setFrameDuration: (value: number) => void;
  animatedElements: CanvasElement[];
};

type ToastState = {
  kind: "success" | "error";
  message: string;
} | null;

type ExerciseRow = {
  id: string;
  title: string;
  category: string;
  duration: number;
  type: string;
  animation_data: unknown;
  created_at: string | null;
  updated_at: string | null;
};

type EditorSnapshot = {
  elements: CanvasElement[];
  frames: FrameSnapshot[];
  paths: Record<string, PathPoint[]>;
  pathElementMap: Record<string, string>;
  trajectoryOrder: string[];
  pathColorMap: Record<string, string>;
  strokes: Stroke[];
  strokesBase: BaseSnapshot | null;
  ballAttachments: Record<string, string>;
  activeFrameId: string | null;
};

const DEFAULT_COLORS = [
  "#7B66FF",
  "#3B5BDB",
  "#00C8B4",
  "#F8C12C",
  "#FF6F91",
  "#FFFFFF",
];

const RUNNER_SPRITE_SRC = "/icons/Joueurcour.png";
const RUNNER_NO_BALL_SPRITE_SRC = "/icons/JOUEUR2SANSBAL.png";
const runnerSprites: Record<
  "runner" | "runner_noball",
  { src: string; img: HTMLImageElement | null; ready: boolean }
> = {
  runner: { src: RUNNER_SPRITE_SRC, img: null, ready: false },
  runner_noball: { src: RUNNER_NO_BALL_SPRITE_SRC, img: null, ready: false },
};
const getRunnerSprite = (variant: "runner" | "runner_noball") => {
  if (typeof window === "undefined") return null;
  const entry = runnerSprites[variant];
  if (!entry.img) {
    entry.img = new Image();
    entry.img.src = entry.src;
    entry.img.onload = () => {
      entry.ready = true;
    };
  }
  return entry.ready ? entry.img : null;
};

const CATEGORY_MAIN_OPTIONS = [
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

const TRAJECTORY_COLORS = {
  classic: "rgba(96, 165, 250, 0.85)",
  runner: "rgba(167, 139, 250, 0.85)",
  runnerNoBall: "rgba(245, 158, 11, 0.85)",
  ball: "rgba(255, 255, 255, 0.75)",
};
const TRAJECTORY_PALETTE = [
  "rgba(96, 165, 250, 0.85)",
  "rgba(167, 139, 250, 0.85)",
  "rgba(245, 158, 11, 0.85)",
  "rgba(34, 211, 238, 0.85)",
  "rgba(248, 113, 113, 0.85)",
  "rgba(74, 222, 128, 0.85)",
  "rgba(251, 191, 36, 0.85)",
  "rgba(244, 114, 182, 0.85)",
  "rgba(129, 140, 248, 0.85)",
  "rgba(163, 163, 163, 0.85)",
];

const desaturateColor = (input: string, amount = 0.45) => {
  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  const parse = () => {
    if (input.startsWith("#")) {
      const hex = input.replace("#", "");
      const value =
        hex.length === 3
          ? hex
              .split("")
              .map((c) => c + c)
              .join("")
          : hex;
      const r = parseInt(value.slice(0, 2), 16);
      const g = parseInt(value.slice(2, 4), 16);
      const b = parseInt(value.slice(4, 6), 16);
      return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)
        ? { r, g, b }
        : null;
    }
    const rgbMatch = input.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)/i,
    );
    if (rgbMatch) {
      return {
        r: Number(rgbMatch[1]),
        g: Number(rgbMatch[2]),
        b: Number(rgbMatch[3]),
      };
    }
    return null;
  };
  const rgb = parse();
  if (!rgb) return input;
  const gray = 0.3 * rgb.r + 0.59 * rgb.g + 0.11 * rgb.b;
  const mix = (channel: number) =>
    clamp(channel * (1 - amount) + gray * amount);
  return `rgb(${mix(rgb.r)}, ${mix(rgb.g)}, ${mix(rgb.b)})`;
};

const LEVEL_OPTIONS = ["U6-U9", "U10-U11", "U12-U13", "U14-U15", "U16+"];

const CATEGORY_VALUE_MAP: Record<string, string> = {
  "Échauffement / Activation": "échauffement",
  "Motricité": "motricité",
  "Technique": "technique",
  "Tactique": "tactique",
  "Physique": "physique",
  "Jeu / Opposition": "jeu_opposition",
  "Situation réelle": "situation_réelle",
  "Retour au calme": "retour_au_calme",
};

const TYPE_VALUE_MAP: Record<string, string> = {
  "Avec ballon": "avec_ballon",
  "Sans ballon": "sans_ballon",
  "Mixte": "mixte",
};

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

const CATEGORY_LABEL_MAP = Object.entries(CATEGORY_VALUE_MAP).reduce(
  (acc, [label, value]) => {
    acc[value] = label;
    return acc;
  },
  {} as Record<string, string>,
);

const TYPE_LABEL_MAP = Object.entries(TYPE_VALUE_MAP).reduce(
  (acc, [label, value]) => {
    acc[value] = label;
    return acc;
  },
  {} as Record<string, string>,
);

const OBJECTIVE_LABEL_MAP = Object.entries(OBJECTIVE_VALUE_MAP).reduce(
  (acc, [label, value]) => {
    acc[value] = label;
    return acc;
  },
  {} as Record<string, string>,
);

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


const buildId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

const simplifyStrokePoints = (
  points: Array<{ x: number; y: number }>,
  tolerance = 0.012,
  angleTolerance = 18,
  lengthRatioMax = 1.03,
  turnThreshold = 0.35,
) => {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-5) return points;
  const lineAngle = Math.atan2(dy, dx);
  let maxDist = 0;
  let maxAngleDiff = 0;
  let totalLen = 0;
  let totalTurn = 0;
  let prevAngle: number | null = null;
  for (let i = 1; i < points.length - 1; i += 1) {
    const p = points[i];
    const dist =
      Math.abs(dy * (p.x - first.x) - dx * (p.y - first.y)) / len;
    if (dist > maxDist) maxDist = dist;
    const segDx = p.x - points[i - 1].x;
    const segDy = p.y - points[i - 1].y;
    const segLen = Math.hypot(segDx, segDy);
    if (segLen > 1e-5) {
      totalLen += segLen;
      const segAngle = Math.atan2(segDy, segDx);
      const diff = Math.abs(
        Math.atan2(Math.sin(segAngle - lineAngle), Math.cos(segAngle - lineAngle)),
      );
      if (diff > maxAngleDiff) maxAngleDiff = diff;
      if (prevAngle !== null) {
        const turn = Math.abs(
          Math.atan2(Math.sin(segAngle - prevAngle), Math.cos(segAngle - prevAngle)),
        );
        totalTurn += turn;
      }
      prevAngle = segAngle;
    }
  }
  totalLen += Math.hypot(
    points[points.length - 1].x - points[points.length - 2].x,
    points[points.length - 1].y - points[points.length - 2].y,
  );
  const straightRatio = totalLen / len;
  const adaptiveTolerance = Math.max(
    tolerance,
    Math.min(0.02, len * 0.03),
  );
  if (
    maxDist <= adaptiveTolerance &&
    maxAngleDiff <= (angleTolerance * Math.PI) / 180 &&
    straightRatio <= lengthRatioMax &&
    totalTurn <= turnThreshold
  ) {
    return [first, last];
  }
  return points;
};

const shadeColor = (hex: string, amount: number) => {
  const safe = hex.replace("#", "");
  const num = parseInt(safe.length === 3 ? safe.replace(/(.)/g, "$1$1") : safe, 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `rgb(${r}, ${g}, ${b})`;
};

const hexToRgb = (hex: string) => {
  if (!hex.startsWith("#")) return null;
  const safe = hex.replace("#", "");
  const value = safe.length === 3 ? safe.replace(/(.)/g, "$1$1") : safe;
  if (value.length !== 6) return null;
  const num = parseInt(value, 16);
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
};

const adjustColor = (hex: string, amount: number) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const clamp = (val: number) => Math.max(0, Math.min(255, val));
  const t = amount > 0 ? 255 : 0;
  const p = Math.min(1, Math.max(0, Math.abs(amount)));
  const r = Math.round(clamp(rgb.r + (t - rgb.r) * p));
  const g = Math.round(clamp(rgb.g + (t - rgb.g) * p));
  const b = Math.round(clamp(rgb.b + (t - rgb.b) * p));
  return `rgb(${r}, ${g}, ${b})`;
};

const lighten = (hex: string, amount: number) => adjustColor(hex, Math.abs(amount));
const darken = (hex: string, amount: number) => adjustColor(hex, -Math.abs(amount));

const cloneData = <T,>(data: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data)) as T;
};

const getLuminance = (hex: string) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;
  const srgb = [rgb.r, rgb.g, rgb.b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
};

const chooseTextColor = (hex: string) => (getLuminance(hex) < 0.6 ? "#fff" : "#111");

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const drawBustPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bustW: number,
  bustH: number,
) => {
  const topY = y - bustH * 0.35;
  const bottomY = y + bustH * 0.55;
  const leftX = x - bustW * 0.55;
  const rightX = x + bustW * 0.55;
  const midY = y + bustH * 0.2;
  const neckDepth = bustH * 0.18;
  const neckWidth = bustW * 0.22;
  const curve = bustW * 0.18;

  ctx.beginPath();
  ctx.moveTo(leftX, topY);
  ctx.quadraticCurveTo(leftX + curve, topY - bustH * 0.12, x - neckWidth, topY);
  ctx.quadraticCurveTo(x, topY + neckDepth, x + neckWidth, topY);
  ctx.quadraticCurveTo(rightX - curve, topY - bustH * 0.12, rightX, topY);
  ctx.quadraticCurveTo(rightX + bustW * 0.05, midY, rightX - bustW * 0.18, bottomY);
  ctx.quadraticCurveTo(x, bottomY + bustH * 0.18, leftX + bustW * 0.18, bottomY);
  ctx.quadraticCurveTo(leftX - bustW * 0.05, midY, leftX, topY);
  ctx.closePath();
};

const getPitchRect = (
  width: number,
  height: number,
  orientation?: "landscape" | "portrait",
): PitchRect => {
  const padding = 0;
  const isLandscape =
    orientation ? orientation === "landscape" : width > height * 1.1;
  // Portrait ratio (2/3) or landscape ratio (105/68).
  const ratio = isLandscape ? 105 / 68 : 2 / 3;
  let w = width - padding * 2;
  let h = w / ratio;
  if (h > height - padding * 2) {
    h = height - padding * 2;
    w = h * ratio;
  }
  const x = (width - w) / 2;
  const y = (height - h) / 2;
  return { x, y, w, h, isLandscape };
};

const getDefaultSize = (type: ElementType) => {
  if (type === "player") return 0.045;
  if (type === "ball") return 0.016;
  if (type === "cone") return 0.034;
  if (type === "hoop") return 0.034;
  if (type === "baton") return 0.032;
  if (type === "slalom_pole") return 0.024;
  if (type === "hurdle_bar") return 0.024;
  if (type === "hurdle_pole") return 0.024;
  if (type === "mini_goal") return 0.028;
  if (type === "ladder") return 0.028;
  if (type === "pass_wall") return 0.032;
  if (type === "shape") return 0.055;
  return 0.024;
};

// Global scale to keep elements visually minimal by default.
const ELEMENT_SIZE_SCALE = 0.9;
const PLAYER_SIZE_SCALE = 1.2;
const CONE_SIZE_SCALE = 0.9;

const getRenderSize = (type: ElementType, size: number) => {
  const base = size * ELEMENT_SIZE_SCALE;
  if (type === "player") return base * PLAYER_SIZE_SCALE;
  if (type === "cone") return base * CONE_SIZE_SCALE;
  if (type === "shape") return base * 1.15;
  return base;
};

const getPlayerFootOffset = (radius: number) => radius * 0.9;

const rotatePoint = (
  point: { x: number; y: number },
  center: { x: number; y: number },
  angle: number,
) => {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
};

const getPointsCenter = (points: Array<{ x: number; y: number }>) => {
  if (points.length === 0) return { x: 0.5, y: 0.5 };
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
};

const getShapeHandlePosition = (
  element: CanvasElement,
  pitchRect: PitchRect,
  applyRotation = false,
) => {
  if (element.type !== "shape") return null;
  const px = pitchRect.x + element.x * pitchRect.w;
  const py = pitchRect.y + element.y * pitchRect.h;
  const orientationScale = pitchRect.isLandscape ? 1 : 1.2;
  const size =
    getRenderSize(
      element.type,
      element.size ?? getDefaultSize(element.type),
    ) * orientationScale;
  const radius = size * pitchRect.w;
  const kind = element.shapeKind ?? "rect";
  if (isPolylineShape(kind)) return null;
  if (
    kind === "line" ||
    kind === "arrow" ||
    kind === "line_dashed" ||
    kind === "arrow_dashed"
  ) {
    const length = Math.max(20, radius * 3.2);
    const handle = { x: px + length / 2, y: py, px, py };
    if (applyRotation && (element.rotation ?? 0) !== 0) {
      const angle = ((element.rotation ?? 0) * Math.PI) / 180;
      const rotated = rotatePoint(
        { x: handle.x, y: handle.y },
        { x: px, y: py },
        angle,
      );
      return { ...handle, x: rotated.x, y: rotated.y };
    }
    return handle;
  }
  const baseSize = Math.max(12, radius * 2.2);
  const half = baseSize * 0.75;
  const handle = { x: px + half, y: py + half, px, py };
  if (applyRotation && (element.rotation ?? 0) !== 0) {
    const angle = ((element.rotation ?? 0) * Math.PI) / 180;
    const rotated = rotatePoint(
      { x: handle.x, y: handle.y },
      { x: px, y: py },
      angle,
    );
    return { ...handle, x: rotated.x, y: rotated.y };
  }
  return handle;
};

const getElementHandlePosition = (
  element: CanvasElement,
  pitchRect: PitchRect,
  applyRotation = false,
) => {
  const px = pitchRect.x + element.x * pitchRect.w;
  const py = pitchRect.y + element.y * pitchRect.h;
  const orientationScale = pitchRect.isLandscape ? 1 : 1.2;
  const size =
    getRenderSize(
      element.type,
      element.size ?? getDefaultSize(element.type),
    ) * orientationScale;
  const radius = size * pitchRect.w;
  const offset = Math.max(12, radius + 10);
  const handle = { x: px + offset, y: py - offset, px, py };
  if (applyRotation && (element.rotation ?? 0) !== 0) {
    const angle = ((element.rotation ?? 0) * Math.PI) / 180;
    const rotated = rotatePoint(
      { x: handle.x, y: handle.y },
      { x: px, y: py },
      angle,
    );
    return { ...handle, x: rotated.x, y: rotated.y };
  }
  return handle;
};

const getResizeHandlePosition = (
  element: CanvasElement,
  pitchRect: PitchRect,
  applyRotation = false,
) => {
  if (element.type === "shape") {
    return getShapeHandlePosition(element, pitchRect, applyRotation);
  }
  const base = getElementHandlePosition(element, pitchRect, applyRotation);
  if (!base) return null;
  const orientationScale = pitchRect.isLandscape ? 1 : 1.2;
  const size =
    getRenderSize(
      element.type,
      element.size ?? getDefaultSize(element.type),
    ) * orientationScale;
  const radius = size * pitchRect.w;
  const delta = Math.max(10, radius * 0.25);
  return { ...base, x: base.x + delta, y: base.y + delta * 0.8 };
};

const drawCupDisc = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  selected: boolean,
) => {
  ctx.save();

  if (selected) {
    ctx.save();
    ctx.strokeStyle = "rgba(168, 85, 247, 0.25)";
    ctx.shadowColor = "rgba(139, 92, 246, 0.25)";
    ctx.shadowBlur = r * 1.2;
    ctx.lineWidth = r * 0.14;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 2.05, r * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.24)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.55, r * 1.35, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const topY = y;
  const topRx = r * 1.35;
  const topRy = r * 0.55;
  const topGradient = ctx.createRadialGradient(
    x - r * 0.25,
    topY - r * 0.18,
    r * 0.18,
    x,
    topY,
    r * 1.4,
  );
  topGradient.addColorStop(0, lighten(color, 0.1));
  topGradient.addColorStop(0.6, color);
  topGradient.addColorStop(1, darken(color, 0.18));
  ctx.fillStyle = topGradient;
  ctx.beginPath();
  ctx.ellipse(x, topY, topRx, topRy, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = Math.max(1.5, r * 0.09);
  ctx.beginPath();
  ctx.ellipse(x, topY, topRx, topRy, 0, 0, Math.PI * 2);
  ctx.stroke();

  const holeY = y - r * 0.2;
  const holeGradient = ctx.createRadialGradient(
    x,
    holeY,
    r * 0.06,
    x,
    holeY,
    r * 0.45,
  );
  holeGradient.addColorStop(0, "rgba(0,0,0,0.9)");
  holeGradient.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = holeGradient;
  ctx.beginPath();
  ctx.ellipse(x, holeY, r * 0.55, r * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.15, holeY - r * 0.05, r * 0.4, r * 0.12, 0, 0.2, 1.0);
  ctx.stroke();

  ctx.restore();
};

const drawHoop = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  selected: boolean,
) => {
  const outerR = r * 1.15;
  const innerR = r * 0.92;
  const ringR = (outerR + innerR) / 2;
  const thickness = Math.max(2, outerR - innerR);

  ctx.save();

  if (selected) {
    ctx.save();
    ctx.strokeStyle = "rgba(168, 85, 247, 0.3)";
    ctx.shadowColor = "rgba(139, 92, 246, 0.35)";
    ctx.shadowBlur = thickness * 1.8;
    ctx.lineWidth = thickness * 0.45;
    ctx.beginPath();
    ctx.ellipse(x, y, ringR * 1.3, ringR * 0.9, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 5;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y + outerR * 0.35, ringR * 1.1, ringR * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const ringGradient = ctx.createRadialGradient(
    x - r * 0.2,
    y - r * 0.2,
    r * 0.2,
    x,
    y,
    outerR * 1.1,
  );
  ringGradient.addColorStop(0, lighten(color, 0.18));
  ringGradient.addColorStop(1, darken(color, 0.25));
  ctx.strokeStyle = ringGradient;
  ctx.lineWidth = thickness;
  ctx.beginPath();
  ctx.arc(x, y, ringR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = Math.max(1, thickness * 0.3);
  ctx.beginPath();
  ctx.arc(x, y, ringR, -0.2, 1.2);
  ctx.stroke();

  ctx.restore();
};

const drawBaton = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  selected: boolean,
) => {
  const barW = r * 4.6;
  const barH = Math.max(1.5, r * 0.26);
  const radius = barH / 2;

  ctx.save();

  if (selected) {
    ctx.save();
    ctx.strokeStyle = "rgba(168, 85, 247, 0.28)";
    ctx.shadowColor = "rgba(139, 92, 246, 0.35)";
    ctx.shadowBlur = barH * 2.2;
    ctx.lineWidth = Math.max(1.5, barH * 0.35);
    drawRoundedRect(
      ctx,
      x - barW / 2 - barH,
      y - barH,
      barW + barH * 2,
      barH * 2,
      barH,
    );
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 5;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(x, y + barH * 0.9, barW * 0.55, barH * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const barGradient = ctx.createLinearGradient(
    x - barW / 2,
    y,
    x + barW / 2,
    y,
  );
  barGradient.addColorStop(0, darken(color, 0.25));
  barGradient.addColorStop(0.5, lighten(color, 0.2));
  barGradient.addColorStop(1, darken(color, 0.25));
  ctx.fillStyle = barGradient;
  drawRoundedRect(ctx, x - barW / 2, y - barH / 2, barW, barH, radius);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, x - barW / 2, y - barH / 2, barW, barH, radius);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = Math.max(1, barH * 0.15);
  ctx.beginPath();
  ctx.moveTo(x - barW / 2 + barH, y - barH * 0.2);
  ctx.lineTo(x + barW / 2 - barH, y - barH * 0.2);
  ctx.stroke();

  ctx.restore();
};

const drawPlotCone = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  selected: boolean,
) => {
  ctx.save();

  if (selected) {
    ctx.save();
    ctx.strokeStyle = "rgba(168, 85, 247, 0.25)";
    ctx.shadowColor = "rgba(139, 92, 246, 0.25)";
    ctx.shadowBlur = r * 1.3;
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.9, r * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.65, r * 1.5, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const baseGradient = ctx.createRadialGradient(
    x - r * 0.2,
    y - r * 0.15,
    r * 0.2,
    x,
    y,
    r * 1.4,
  );
  baseGradient.addColorStop(0, lighten(color, 0.06));
  baseGradient.addColorStop(1, darken(color, 0.22));
  ctx.fillStyle = baseGradient;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.25, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.25, r * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  const domeGradient = ctx.createRadialGradient(
    x - r * 0.1,
    y - r * 0.35,
    r * 0.12,
    x,
    y - r * 0.12,
    r * 1.2,
  );
  domeGradient.addColorStop(0, lighten(color, 0.18));
  domeGradient.addColorStop(1, darken(color, 0.1));
  ctx.fillStyle = domeGradient;
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.12, r * 0.9, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const holeGradient = ctx.createRadialGradient(
    x,
    y - r * 0.22,
    r * 0.08,
    x,
    y - r * 0.22,
    r * 0.6,
  );
  holeGradient.addColorStop(0, "rgba(0,0,0,0.88)");
  holeGradient.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = holeGradient;
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.28, r * 0.4, r * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.28, r * 0.4, r * 0.18, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.18, y - r * 0.3, r * 0.55, r * 0.22, 0, 0.2, 1.05);
  ctx.stroke();

  ctx.restore();
};

const drawPlotIso = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  color: string,
  selected: boolean,
) => {
  const cx = x;
  const cy = y;
  const baseW = s * 2.6;
  const baseH = s * 1.1;
  const topCy = cy - s * 1.75;
  const p1 = { x: cx, y: cy + baseH * 0.65 };
  const p2 = { x: cx + baseW * 0.5, y: cy };
  const p3 = { x: cx, y: cy - baseH * 0.65 };
  const p4 = { x: cx - baseW * 0.5, y: cy };
  const innerW = baseW * 0.6;
  const innerLeft = { x: cx - innerW * 0.5, y: cy };
  const innerRight = { x: cx + innerW * 0.5, y: cy };
  const topRx = s * 0.3;
  const topRy = s * 0.14;
  const topCx = cx;
  const topLeft = { x: topCx - topRx, y: topCy };
  const topRight = { x: topCx + topRx, y: topCy };

  ctx.save();

  if (selected) {
    ctx.save();
    ctx.strokeStyle = "rgba(168, 85, 247, 0.25)";
    ctx.shadowColor = "rgba(139, 92, 246, 0.25)";
    ctx.shadowBlur = s * 2;
    ctx.lineWidth = s * 0.16;
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.9, baseW * 0.45, baseH * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + baseH * 0.9, baseW * 0.45, baseH * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = darken(color, 0.25);
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.lineTo(p4.x, p4.y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.lineTo(p4.x, p4.y);
  ctx.closePath();
  ctx.stroke();

  const bodyGradient = ctx.createLinearGradient(cx, topCy, cx, cy);
  bodyGradient.addColorStop(0, lighten(color, 0.18));
  bodyGradient.addColorStop(1, darken(color, 0.1));
  ctx.fillStyle = bodyGradient;
  ctx.beginPath();
  ctx.moveTo(innerLeft.x, innerLeft.y);
  ctx.quadraticCurveTo(cx - baseW * 0.18, cy - s * 1.05, topLeft.x, topLeft.y);
  ctx.quadraticCurveTo(cx, topCy - topRy * 0.6, topRight.x, topRight.y);
  ctx.quadraticCurveTo(cx + baseW * 0.18, cy - s * 1.05, innerRight.x, innerRight.y);
  ctx.quadraticCurveTo(cx, cy + baseH * 0.35, innerLeft.x, innerLeft.y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, topCy + topRy * 0.1);
  ctx.lineTo(cx, cy + baseH * 0.1);
  ctx.stroke();

  const holeRx = topRx * 0.55;
  const holeRy = topRy * 0.55;

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.ellipse(topCx, topCy, topRx, topRy, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(topCx, topCy, topRx, topRy, 0, 0, Math.PI * 2);
  ctx.stroke();

  const holeGradient = ctx.createRadialGradient(
    topCx,
    topCy,
    holeRx * 0.2,
    topCx,
    topCy,
    holeRx,
  );
  holeGradient.addColorStop(0, "rgba(0,0,0,0.92)");
  holeGradient.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = holeGradient;
  ctx.beginPath();
  ctx.ellipse(topCx, topCy, holeRx, holeRy, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(topCx, topCy, holeRx, holeRy, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.ellipse(topCx - topRx * 0.15, topCy - topRy * 0.2, topRx * 0.5, topRy * 0.35, 0, 0.2, 1.0);
  ctx.stroke();

  ctx.restore();
};

const drawSlalomPole = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  selected: boolean,
) => {
  ctx.save();

  if (selected) {
    ctx.save();
    ctx.strokeStyle = "rgba(120,80,255,0.30)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.35, r * 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 5;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.25, r * 1.6, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const baseGradient = ctx.createRadialGradient(
    x - r * 0.15,
    y - r * 0.1,
    r * 0.2,
    x,
    y,
    r * 1.4,
  );
  baseGradient.addColorStop(0, lighten(color, 0.18));
  baseGradient.addColorStop(1, darken(color, 0.2));
  ctx.fillStyle = baseGradient;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.2, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.2, r * 0.45, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.beginPath();
  ctx.ellipse(x, y - 1, r * 0.18, r * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  const poleHeight = r * 4.5;
  const poleWidth = r * 0.28;
  const poleX = x - poleWidth / 2;
  const poleY = y - poleHeight;

  const poleGradient = ctx.createLinearGradient(poleX, 0, poleX + poleWidth, 0);
  poleGradient.addColorStop(0, darken(color, 0.25));
  poleGradient.addColorStop(0.5, lighten(color, 0.15));
  poleGradient.addColorStop(1, darken(color, 0.25));
  ctx.fillStyle = poleGradient;
  drawRoundedRect(ctx, poleX, poleY, poleWidth, poleHeight, poleWidth / 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, poleX, poleY, poleWidth, poleHeight, poleWidth / 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - poleWidth * 0.15, poleY + poleHeight * 0.05);
  ctx.lineTo(x - poleWidth * 0.15, y);
  ctx.stroke();

  ctx.restore();
};

const drawHurdleBar = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  selected: boolean,
) => {
  const gap = r * 2.9;
  const leftX = x - gap / 2;
  const rightX = x + gap / 2;
  const baseY = y;
  const barY = y - r * 0.95;
  const barW = gap + r * 0.9;
  const barH = r * 0.22;

  ctx.save();

  if (selected) {
    ctx.save();
    ctx.strokeStyle = "rgba(120,80,255,0.30)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.4, gap / 2 + r * 1.3, r * 1.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.2)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = "rgba(0,0,0,0.20)";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.3, gap / 2 + r * 1.1, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.beginPath();
  ctx.ellipse(x, barY + r * 0.55, barW * 0.35, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  const barGradient = ctx.createLinearGradient(
    x - barW / 2,
    barY,
    x + barW / 2,
    barY,
  );
  barGradient.addColorStop(0, darken(color, 0.22));
  barGradient.addColorStop(0.5, lighten(color, 0.15));
  barGradient.addColorStop(1, darken(color, 0.22));
  ctx.fillStyle = barGradient;
  drawRoundedRect(ctx, x - barW / 2, barY - barH / 2, barW, barH, barH / 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, x - barW / 2, barY - barH / 2, barW, barH, barH / 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - barW / 2 + barH, barY - barH * 0.25);
  ctx.lineTo(x + barW / 2 - barH, barY - barH * 0.25);
  ctx.stroke();

  drawPlotIso(ctx, leftX, baseY, r * 0.95, color, false);
  drawPlotIso(ctx, rightX, baseY, r * 0.95, color, false);

  const clipR = r * 0.1;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.arc(leftX, barY, clipR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(rightX, barY, clipR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
};

const drawHurdlePole = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  selected: boolean,
) => {
  const gap = r * 2.8;
  const topY = y - gap / 2;
  const bottomY = y + gap / 2;
  const barX = x;
  const barH = gap - r * 0.2;
  const barW = r * 0.22;

  ctx.save();

  if (selected) {
    ctx.save();
    ctx.strokeStyle = "rgba(120,80,255,0.30)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.6, gap * 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.2)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.3, r * 1.2, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawPlotIso(ctx, x, topY, r * 0.85, color, false);
  drawPlotIso(ctx, x - r * 0.18, bottomY, r * 0.85, color, false);

  const poleGradient = ctx.createLinearGradient(barX, y - barH / 2, barX, y + barH / 2);
  poleGradient.addColorStop(0, darken(color, 0.35));
  poleGradient.addColorStop(0.5, lighten(color, 0.22));
  poleGradient.addColorStop(1, darken(color, 0.35));
  ctx.fillStyle = poleGradient;
  drawRoundedRect(ctx, barX - barW / 2, y - barH / 2, barW, barH, barW / 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 1.6;
  drawRoundedRect(ctx, barX - barW / 2, y - barH / 2, barW, barH, barW / 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(barX - barW * 0.2, y - barH / 2 + barW);
  ctx.lineTo(barX - barW * 0.2, y + barH / 2 - barW);
  ctx.stroke();

  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.arc(x, topY, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, bottomY, r * 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
};

const drawMiniGoal = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  selected: boolean,
) => {
  const goalW = r * 2.4;
  const goalH = r * 1.6;
  const postW = Math.max(2.5, r * 0.16);

  ctx.save();
  const frontTopY = y - goalH;
  const frontBotY = y;
  const leftX = x - goalW / 2;
  const rightX = x + goalW / 2;

  if (selected) {
    ctx.save();
    ctx.strokeStyle = "rgba(120,80,255,0.30)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(
      leftX - r * 0.2,
      frontTopY - r * 0.2,
      goalW + r * 0.4,
      goalH + r * 0.4,
    );
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = "rgba(235,235,255,0.92)";
  ctx.lineWidth = postW;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(leftX, frontBotY);
  ctx.lineTo(leftX, frontTopY);
  ctx.moveTo(rightX, frontBotY);
  ctx.lineTo(rightX, frontTopY);
  ctx.moveTo(leftX, frontTopY);
  ctx.lineTo(rightX, frontTopY);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  const v1 = leftX + goalW * 0.3125;
  const v2 = leftX + goalW * 0.6875;
  const h1 = frontTopY + goalH * 0.46;
  ctx.beginPath();
  ctx.moveTo(v1, frontTopY);
  ctx.lineTo(v1, frontBotY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(v2, frontTopY);
  ctx.lineTo(v2, frontBotY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(leftX, h1);
  ctx.lineTo(rightX, h1);
  ctx.stroke();

  ctx.restore();
};

const drawLadder = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  color: string,
  selected: boolean,
) => {
  const width = length * 0.3;
  const railW = Math.max(1.8, width * 0.11);
  const railExt = length * 0.08;
  const rungH = Math.max(1, width * 0.06);
  const rungCount: number = 6;

  ctx.save();

  if (selected) {
    ctx.save();
    ctx.strokeStyle = "rgba(120,80,255,0.30)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, width * 0.9, length * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.24)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y + length * 0.12, width * 0.6, width * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const halfLen = length / 2;
  const leftX = x - width / 2 + railW / 2;
  const rightX = x + width / 2 - railW / 2;

  ctx.fillStyle = color;
  drawRoundedRect(
    ctx,
    leftX - railW / 2,
    y - halfLen - railExt,
    railW,
    length + railExt * 2,
    railW / 2,
  );
  ctx.fill();
  drawRoundedRect(
    ctx,
    rightX - railW / 2,
    y - halfLen - railExt,
    railW,
    length + railExt * 2,
    railW / 2,
  );
  ctx.fill();

  ctx.fillStyle = lighten(color, 0.12);
  for (let i = 0; i < rungCount; i += 1) {
    const t = rungCount === 1 ? 0 : i / (rungCount - 1);
    const yy = y - halfLen + t * length;
    drawRoundedRect(
      ctx,
      x - width * 0.45,
      yy - rungH / 2,
      width * 0.9,
      rungH,
      rungH / 2,
    );
    ctx.fill();
  }

  ctx.restore();
};

const drawPassWall = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  selected: boolean,
) => {
  const wallW = r * 4.2;
  const wallH = r * 1.75;
  const radius = r * 0.16;

  ctx.save();

  // Shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 5;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(
    x,
    y + wallH * 0.52,
    wallW * 0.55,
    r * 0.22,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();

  if (selected) {
    ctx.save();
    ctx.strokeStyle = "rgba(139,92,246,0.55)";
    ctx.lineWidth = 2;
    drawRoundedRect(
      ctx,
      x - wallW / 2 - radius * 0.35,
      y - wallH / 2 - radius * 0.35,
      wallW + radius * 0.7,
      wallH + radius * 0.7,
      radius,
    );
    ctx.stroke();
    ctx.restore();
  }

  // Body (simple block like toolbar icon)
  const bodyGrad = ctx.createLinearGradient(
    x,
    y - wallH / 2,
    x,
    y + wallH / 2,
  );
  bodyGrad.addColorStop(0, lighten(color, 0.06));
  bodyGrad.addColorStop(1, darken(color, 0.12));

  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 1.2;
  drawRoundedRect(ctx, x - wallW / 2, y - wallH / 2, wallW, wallH, radius);
  ctx.fill();
  ctx.stroke();

  // Slot
  const slotW = wallW * 0.62;
  const slotH = wallH * 0.12;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  drawRoundedRect(
    ctx,
    x - slotW / 2,
    y - wallH * 0.05 - slotH / 2,
    slotW,
    slotH,
    slotH / 2,
  );
  ctx.fill();

  ctx.restore();
};

const drawPlayerBodyHead = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  number: string | undefined,
  selected: boolean,
  isBallCarrier: boolean,
  isGoalkeeper: boolean,
) => {
  ctx.save();

  const headR = r * 0.46;
  const headCx = x;
  const headCy = y - r * 0.44;

  const bustW = r * 1.49;
  const bustH = r * 1.2;
  const bustCx = x;
  const bustCy = y + r * 0.05;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 5;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.85, r * 1.05, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const bustGradient = ctx.createRadialGradient(
    x - r * 0.25,
    y - r * 0.35,
    r * 0.2,
    x,
    y,
    r * 1.4,
  );
  bustGradient.addColorStop(0, lighten(color, 0.08));
  bustGradient.addColorStop(1, darken(color, 0.1));
  ctx.fillStyle = bustGradient;
  drawBustPath(ctx, bustCx, bustCy, bustW, bustH);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.20)";
  ctx.lineWidth = 1.2;
  drawBustPath(ctx, bustCx, bustCy, bustW, bustH);
  ctx.stroke();

  ctx.save();
  drawBustPath(ctx, bustCx, bustCy, bustW, bustH);
  ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = Math.max(0.6, r * 0.045);
  ctx.lineCap = "round";
  const stripeTop = bustCy - bustH * 0.45;
  const stripeBottom = bustCy + bustH * 0.45;
  [-0.22, 0, 0.22].forEach((offset) => {
    const stripeX = bustCx + bustW * offset;
    ctx.beginPath();
    ctx.moveTo(stripeX, stripeTop);
    ctx.lineTo(stripeX, stripeBottom);
    ctx.stroke();
  });
  ctx.restore();

  const headGradient = ctx.createRadialGradient(
    headCx - headR * 0.3,
    headCy - headR * 0.3,
    headR * 0.2,
    headCx,
    headCy,
    headR,
  );
  headGradient.addColorStop(0, lighten(color, 0.1));
  headGradient.addColorStop(1, darken(color, 0.12));
  ctx.fillStyle = headGradient;
  ctx.beginPath();
  ctx.arc(headCx, headCy, headR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(headCx, headCy, headR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(headCx - headR * 0.2, headCy - headR * 0.2, headR * 0.7, -0.2, 0.4);
  ctx.stroke();

  if (number) {
    ctx.save();
    ctx.fillStyle = chooseTextColor(color);
    ctx.shadowColor = "rgba(0,0,0,0.30)";
    ctx.shadowBlur = 2;
    ctx.font = `${Math.floor(r * 0.85)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(number, x, bustCy + bustH * 0.05);
    ctx.restore();
  }

  if (isBallCarrier) {
    ctx.strokeStyle = "rgba(255,255,255,0.70)";
    ctx.lineWidth = 1.6;
    drawBustPath(ctx, bustCx, bustCy, bustW, bustH);
    ctx.stroke();
  }

  if (isGoalkeeper) {
    const badgeR = r * 0.35;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(bustCx + r * 0.65, bustCy + r * 0.35, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.max(8, r * 0.6)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("G", bustCx + r * 0.65, bustCy + r * 0.35);
    ctx.restore();
  }

  ctx.restore();
};

const drawPlayerRunnerSprite = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  number: string | undefined,
  selected: boolean,
  isBallCarrier: boolean,
  isGoalkeeper: boolean,
  variant: "runner" | "runner_noball",
) => {
  ctx.save();

  if (selected) {
    ctx.save();
    ctx.strokeStyle = "rgba(167, 139, 250, 0.75)";
    ctx.shadowColor = "rgba(139, 92, 246, 0.5)";
    ctx.shadowBlur = r * 0.2;
    ctx.lineWidth = Math.max(0.7, r * 0.05);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const sprite = getRunnerSprite(variant);
  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    const ratio =
      sprite.naturalWidth && sprite.naturalHeight
        ? sprite.naturalWidth / sprite.naturalHeight
        : 0.6;
    const height =
      r * (variant === "runner_noball" ? 3.0 : 3.6);
    const width = height * ratio;
    ctx.drawImage(sprite, x - width / 2, y - height * 0.85, width, height);
  } else {
    drawPlayerBodyHead(
      ctx,
      x,
      y,
      r,
      color,
      number,
      selected,
      isBallCarrier,
      isGoalkeeper,
    );
    ctx.restore();
    return;
  }

  if (number) {
    ctx.save();
    ctx.fillStyle = chooseTextColor(color);
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 2;
    ctx.font = `${Math.floor(r * 0.78)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(number, x, y - r * 0.2);
    ctx.restore();
  }

  if (isBallCarrier) {
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y + r * 0.2, r * 1.1, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (isGoalkeeper) {
    const badgeR = r * 0.32;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(x + r * 0.6, y - r * 0.6, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.max(8, r * 0.6)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("G", x + r * 0.6, y - r * 0.6);
    ctx.restore();
  }

  ctx.restore();
};

const drawBallPremium = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  selected: boolean,
) => {
  ctx.save();

  if (selected) {
    ctx.save();
    ctx.strokeStyle = "rgba(168, 85, 247, 0.25)";
    ctx.shadowColor = "rgba(139, 92, 246, 0.25)";
    ctx.shadowBlur = r * 1.6;
    ctx.lineWidth = r * 0.18;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 5;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.7, r * 1.1, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.max(10, r * 2.2)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.fillText("⚽", x, y + r * 0.02);

  ctx.restore();
};

export const drawPitch = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  preset: PitchPreset,
  orientation?: "landscape" | "portrait",
  theme: "default" | "dark-textured" = "default",
) => {
  const { x, y, w, h, isLandscape } = getPitchRect(
    width,
    height,
    orientation,
  );
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  const fieldGradient = ctx.createLinearGradient(x, y, x + w, y + h);
  if (theme === "dark-textured") {
    fieldGradient.addColorStop(0, "#0B1F14");
    fieldGradient.addColorStop(1, "#102418");
  } else {
    fieldGradient.addColorStop(0, "#0A0D16");
    fieldGradient.addColorStop(1, "#161832");
  }
  ctx.fillStyle = fieldGradient;
  ctx.fillRect(x, y, w, h);

  if (theme === "dark-textured") {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = Math.max(0.6, Math.min(width, height) * 0.0008);
    const stripeGap = Math.max(10, Math.min(w, h) * 0.06);
    for (let i = -h; i < w + h; i += stripeGap) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i + h, y + h);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.16;
    const bandHeight = Math.max(8, h * 0.07);
    for (let j = 0; j < h; j += bandHeight * 2) {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(x, y + j, w, bandHeight);
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.1;
    const grainStep = Math.max(12, Math.min(w, h) * 0.05);
    for (let gx = x; gx < x + w; gx += grainStep) {
      for (let gy = y; gy < y + h; gy += grainStep) {
        const jitter = (gx + gy) % (grainStep * 2) ? 0.35 : 0.2;
        ctx.fillStyle = `rgba(255,255,255,${0.03 + jitter * 0.04})`;
        ctx.fillRect(gx, gy, grainStep * 0.2, grainStep * 0.2);
      }
    }
    ctx.restore();

    ctx.save();
    const vignette = ctx.createRadialGradient(
      x + w / 2,
      y + h / 2,
      Math.min(w, h) * 0.15,
      x + w / 2,
      y + h / 2,
      Math.max(w, h) * 0.8,
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = vignette;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = Math.max(0.8, Math.min(width, height) * 0.0011);
  ctx.strokeRect(x, y, w, h);

  const centerX = x + w / 2;
  const centerY = y + h / 2;

  if (isLandscape) {
    ctx.beginPath();
    ctx.moveTo(centerX, y);
    ctx.lineTo(centerX, y + h);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, h * 0.1, 0, Math.PI * 2);
    ctx.stroke();

    const boxWidth = w * 0.16;
    const boxHeight = h * 0.6;
    ctx.strokeRect(x, centerY - boxHeight / 2, boxWidth, boxHeight);
    ctx.strokeRect(
      x + w - boxWidth,
      centerY - boxHeight / 2,
      boxWidth,
      boxHeight,
    );

    const smallBoxWidth = w * 0.06;
    const smallBoxHeight = h * 0.25;
    ctx.strokeRect(
      x,
      centerY - smallBoxHeight / 2,
      smallBoxWidth,
      smallBoxHeight,
    );
    ctx.strokeRect(
      x + w - smallBoxWidth,
      centerY - smallBoxHeight / 2,
      smallBoxWidth,
      smallBoxHeight,
    );
  } else {
    ctx.beginPath();
    ctx.moveTo(x, centerY);
    ctx.lineTo(x + w, centerY);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, w * 0.1, 0, Math.PI * 2);
    ctx.stroke();

    const boxWidth = w * 0.6;
    const boxHeight = h * 0.16;
    ctx.strokeRect(centerX - boxWidth / 2, y, boxWidth, boxHeight);
    ctx.strokeRect(
      centerX - boxWidth / 2,
      y + h - boxHeight,
      boxWidth,
      boxHeight,
    );

    const smallBoxWidth = w * 0.25;
    const smallBoxHeight = h * 0.06;
    ctx.strokeRect(
      centerX - smallBoxWidth / 2,
      y,
      smallBoxWidth,
      smallBoxHeight,
    );
    ctx.strokeRect(
      centerX - smallBoxWidth / 2,
      y + h - smallBoxHeight,
      smallBoxWidth,
      smallBoxHeight,
    );
  }

  ctx.restore();
  return { x, y, w, h, isLandscape };
};

const getStrokeSequenceIndex = (stroke: Stroke) => {
  if (Number.isFinite(stroke.sequenceIndex)) {
    return Math.max(1, Math.floor(stroke.sequenceIndex as number));
  }
  if (Number.isFinite(stroke.phaseId)) {
    return Math.max(1, Math.floor(stroke.phaseId + 1));
  }
  return 1;
};

export const drawElements = (
  ctx: CanvasRenderingContext2D,
  elements: CanvasElement[],
  selectedId: string | null,
  pitchRect: PitchRect,
  paths: Record<string, PathPoint[]> = {},
  strokes: Stroke[] = [],
  ballAttachments?: Record<string, string>,
  snapTargetId?: string | null,
  options?: {
    showOverlays?: boolean;
    showLabels?: boolean;
    showSequenceNumbers?: boolean;
    showRotateHandle?: boolean;
    showResizeHandle?: boolean;
    hoveredHandle?: { id: string; type: "rotate" | "resize" } | null;
    pathStyleResolver?: (
      id: string,
    ) => {
      color: string;
      width?: number;
      dashed?: boolean;
      number?: number | null;
    } | null;
    showPathGhosts?: boolean;
    pathElementMap?: Record<string, string>;
    pathUseFootOffset?: boolean;
  },
) => {
  const showOverlays = options?.showOverlays ?? true;
  const showLabels = options?.showLabels ?? true;
  const showSequenceNumbers = options?.showSequenceNumbers ?? false;
  const showRotateHandle = options?.showRotateHandle ?? false;
  const showResizeHandle = options?.showResizeHandle ?? false;
  const hoveredHandle = options?.hoveredHandle ?? null;
  const ballCarrierIds = new Set(Object.values(ballAttachments ?? {}));
  const orientationScale = pitchRect.isLandscape ? 1 : 1.2;
  const pathUseFootOffset = options?.pathUseFootOffset ?? true;
  const drawSmoothPath = (points: PathPoint[]) => {
    if (points.length < 2) return;
    // Quadratic Bézier smoothing: use each point as control and midpoints as end points.
    if (points.length < 3) {
      const first = points[0];
      ctx.moveTo(
        pitchRect.x + first.x * pitchRect.w,
        pitchRect.y + first.y * pitchRect.h,
      );
      for (let i = 1; i < points.length; i += 1) {
        const p = points[i];
        ctx.lineTo(
          pitchRect.x + p.x * pitchRect.w,
          pitchRect.y + p.y * pitchRect.h,
        );
      }
      return;
    }

    const first = points[0];
    ctx.moveTo(
      pitchRect.x + first.x * pitchRect.w,
      pitchRect.y + first.y * pitchRect.h,
    );
    for (let i = 1; i < points.length - 1; i += 1) {
      const current = points[i];
      const next = points[i + 1];
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      ctx.quadraticCurveTo(
        pitchRect.x + current.x * pitchRect.w,
        pitchRect.y + current.y * pitchRect.h,
        pitchRect.x + midX * pitchRect.w,
        pitchRect.y + midY * pitchRect.h,
      );
    }
    const last = points[points.length - 1];
    ctx.lineTo(
      pitchRect.x + last.x * pitchRect.w,
      pitchRect.y + last.y * pitchRect.h,
    );
  };

  const drawArrow = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const headLength = 12;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - headLength * Math.cos(angle - Math.PI / 6),
      to.y - headLength * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      to.x - headLength * Math.cos(angle + Math.PI / 6),
      to.y - headLength * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();
  };

  const drawStrokePath = (
    points: Array<{ x: number; y: number }>,
    dashed: boolean,
    width: number,
    color: string,
    arrow: boolean,
  ) => {
    if (points.length < 2) return;
    ctx.save();
    ctx.beginPath();
    drawSmoothPath(
      points.map((point) => ({ x: point.x, y: point.y, t: 0 })),
    );
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dashed ? [6, 6] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    if (arrow) {
      const last = points[points.length - 1];
      const prev = points[points.length - 2];
      const to = {
        x: pitchRect.x + last.x * pitchRect.w,
        y: pitchRect.y + last.y * pitchRect.h,
      };
      const from = {
        x: pitchRect.x + prev.x * pitchRect.w,
        y: pitchRect.y + prev.y * pitchRect.h,
      };
      ctx.fillStyle = color;
      drawArrow(from, to);
    }
    ctx.restore();
  };
  const isStraightPath = (points: Array<{ x: number; y: number }>) => {
    if (points.length < 4) return true;
    const first = points[0];
    const last = points[points.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-5 || len < 0.07) return true;
    let maxDist = 0;
    let totalLen = 0;
    let totalTurn = 0;
    let prevAngle: number | null = null;
    for (let i = 1; i < points.length; i += 1) {
      const p = points[i];
      const dist =
        Math.abs(dy * (p.x - first.x) - dx * (p.y - first.y)) / len;
      if (dist > maxDist) maxDist = dist;
      const segDx = p.x - points[i - 1].x;
      const segDy = p.y - points[i - 1].y;
      const segLen = Math.hypot(segDx, segDy);
      if (segLen > 1e-5) {
        totalLen += segLen;
        const segAngle = Math.atan2(segDy, segDx);
        if (prevAngle !== null) {
          const diff = Math.atan2(
            Math.sin(segAngle - prevAngle),
            Math.cos(segAngle - prevAngle),
          );
          totalTurn += Math.abs(diff);
        }
        prevAngle = segAngle;
      }
    }
    const lengthRatio = totalLen / len;
    const distThreshold = len < 0.12 ? 0.05 : 0.024;
    const turnThreshold = len < 0.12 ? 2.8 : 1.5;
    const ratioThreshold = len < 0.12 ? 1.6 : 1.25;
    return (
      maxDist < distThreshold &&
      totalTurn < turnThreshold &&
      lengthRatio < ratioThreshold
    );
  };
  const smoothPathPoints = (
    points: Array<{ x: number; y: number }>,
    iterations = 2,
  ) => {
    if (points.length < 3) return points;
    let next = points;
    for (let k = 0; k < iterations; k += 1) {
      next = next.map((point, index) => {
        if (index === 0 || index === next.length - 1) return point;
        const prev = next[index - 1];
        const curr = point;
        const nextPoint = next[index + 1];
        return {
          x: (prev.x + curr.x + nextPoint.x) / 3,
          y: (prev.y + curr.y + nextPoint.y) / 3,
        };
      });
    }
    return next;
  };
  const offsetPath = (
    points: Array<{ x: number; y: number }>,
    offset: number,
  ) => {
    if (points.length < 2 || offset === 0) return points;
    const start = points[0];
    const end = points[points.length - 1];
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;
    return points.map((point, index) => {
      const t = points.length > 1 ? index / (points.length - 1) : 0;
      const ease = Math.sin(Math.PI * t); // 0 at ends, 1 in the middle
      const shift = offset * ease;
      return {
        x: clamp01(point.x + nx * shift),
        y: clamp01(point.y + ny * shift),
      };
    });
  };
  const getPointAlong = (points: Array<{ x: number; y: number }>, t: number) => {
    if (points.length <= 1) return points[0] ?? { x: 0, y: 0 };
    const lengths: number[] = [];
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      const dist = Math.hypot(
        points[i].x - points[i - 1].x,
        points[i].y - points[i - 1].y,
      );
      lengths.push(dist);
      total += dist;
    }
    if (total === 0) return points[Math.floor(points.length / 2)];
    const target = total * t;
    let acc = 0;
    for (let i = 0; i < lengths.length; i += 1) {
      if (acc + lengths[i] >= target) {
        const ratio = (target - acc) / Math.max(1e-6, lengths[i]);
        return {
          x: points[i].x + (points[i + 1].x - points[i].x) * ratio,
          y: points[i].y + (points[i + 1].y - points[i].y) * ratio,
        };
      }
      acc += lengths[i];
    }
    return points[points.length - 1];
  };

  if (showOverlays) {
    strokes.forEach((stroke) => {
      const variant = stroke.style?.variant ?? stroke.kind;
      const color =
        variant === "ball"
          ? "rgba(125, 211, 252, 0.7)"
          : variant === "carry"
          ? "rgba(253, 224, 71, 0.7)"
          : "rgba(148, 163, 184, 0.55)";
      drawStrokePath(
        stroke.points,
        stroke.style?.dashed ?? variant === "ball",
        stroke.style?.width ?? (stroke.kind === "carry" ? 2.5 : 1.5),
        color,
        stroke.style?.arrow ?? true,
      );
    });

    if (showSequenceNumbers) {
      strokes.forEach((stroke) => {
        if (stroke.points.length === 0) return;
        const sequenceIndex = getStrokeSequenceIndex(stroke);
        const midPoint = getPointAlong(stroke.points, 0.5);
        const x = pitchRect.x + midPoint.x * pitchRect.w;
        const y = pitchRect.y + midPoint.y * pitchRect.h;
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(sequenceIndex), x, y);
        ctx.restore();
      });
    }

    Object.entries(paths).forEach(([id, points]) => {
      if (points.length < 2) return;
      const resolved = options?.pathStyleResolver?.(id) ?? null;
      const elementId = options?.pathElementMap?.[id] ?? id;
      const element = elements.find((el) => el.id === elementId);
      const basePoints =
        element?.type === "player" && pathUseFootOffset
          ? (() => {
              const ghostSize =
                getRenderSize(
                  element.type,
                  element.size ?? getDefaultSize(element.type),
                ) * orientationScale;
              const ghostRadius = ghostSize * pitchRect.w;
              const offsetNorm = getPlayerFootOffset(ghostRadius) / pitchRect.h;
              return points.map((point) => ({
                x: point.x,
                y: clamp01(point.y - offsetNorm),
              }));
            })()
          : points;
      const strokeColor =
        resolved?.color ??
        (id === selectedId
          ? "rgba(167, 139, 250, 0.7)"
          : "rgba(148, 163, 184, 0.35)");
      const strokeWidth =
        (resolved?.width ?? (id === selectedId ? 2 : 1)) * 0.85;
      const dashed = resolved?.dashed ?? false;
      const isStraight = options?.pathStyleResolver && isStraightPath(basePoints);
      const renderPoints = isStraight
        ? [basePoints[0], basePoints[basePoints.length - 1]]
        : smoothPathPoints(basePoints, 1);
      const offset =
        resolved?.number && resolved.number > 1 && !isStraight
          ? (resolved.number - 1) * 0.008
          : 0;
      const offsetPoints = offset ? offsetPath(renderPoints, offset) : renderPoints;
      drawStrokePath(offsetPoints, dashed, strokeWidth, strokeColor, true);

      if (options?.showPathGhosts && resolved) {
        if (element && (element.type === "player" || element.type === "ball")) {
          const ghostSteps = 1;
          for (let i = 1; i <= ghostSteps; i += 1) {
            const t = i === 1 ? 0.05 : i / (ghostSteps + 1);
            const ghostPoint = getPointAlong(offsetPoints, t);
            const gx = pitchRect.x + ghostPoint.x * pitchRect.w;
            const gy = pitchRect.y + ghostPoint.y * pitchRect.h;
            const ghostSize = getRenderSize(
              element.type,
              element.size ?? getDefaultSize(element.type),
            );
            const sizeScale = 0.6 + 0.08 * i;
            const ghostRadius = ghostSize * pitchRect.w * sizeScale;
            const ghostOffset =
              element.type === "player" ? getPlayerFootOffset(ghostRadius) : 0;
            const ghostY = gy - ghostOffset;
            const alpha = i === 1 ? 0.8 : i === 2 ? 0.35 : 0.2;
            const blur =
              i >= ghostSteps ? "blur(0.6px)" : i === 2 ? "blur(0.4px)" : "none";
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.filter = `saturate(0.45) ${blur}`;
            if (element.type === "player") {
              const isRunner =
                element.playerStyle === "runner" ||
                element.playerStyle === "runner_noball";
              if (isRunner) {
                drawPlayerRunnerSprite(
                  ctx,
                  gx,
                  ghostY,
                  Math.max(6, ghostRadius),
                  desaturateColor(element.color ?? "#7B66FF"),
                  undefined,
                  false,
                  false,
                  false,
                  element.playerStyle === "runner_noball"
                    ? "runner_noball"
                    : "runner",
                );
              } else {
                drawPlayerBodyHead(
                  ctx,
                  gx,
                  ghostY,
                  Math.max(3, ghostRadius * 0.65),
                  desaturateColor(element.color ?? "#7B66FF"),
                  undefined,
                  false,
                  false,
                  false,
                );
              }
            } else {
              const ballAlpha = alpha * 0.55;
              ctx.globalAlpha = ballAlpha;
              drawBallPremium(
                ctx,
                gx,
                gy,
                Math.max(3, ghostRadius * 0.78),
                false,
              );
            }
            ctx.filter = "none";
            ctx.restore();
          }
        }
      }

      if (resolved?.number) {
        const numberPoint = getPointAlong(offsetPoints, 0.5);
        const x = pitchRect.x + numberPoint.x * pitchRect.w;
        const y = pitchRect.y + numberPoint.y * pitchRect.h;
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
        ctx.shadowColor = "rgba(167, 139, 250, 0.6)";
        ctx.shadowBlur = 6;
        ctx.arc(x, y, 8.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(167, 139, 250, 0.35)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(resolved.number), x, y);
        ctx.restore();
      }
    });
  }

  elements.forEach((element) => {
    const px = pitchRect.x + element.x * pitchRect.w;
    const py = pitchRect.y + element.y * pitchRect.h;
    const size =
      getRenderSize(
        element.type,
        element.size ?? getDefaultSize(element.type),
      ) * orientationScale;
    const radius = size * pitchRect.w;
    const playerOffset = element.type === "player" ? getPlayerFootOffset(radius) : 0;
    const playerY = py - playerOffset;
    ctx.save();
    if (showOverlays && element.id === selectedId) {
      ctx.shadowColor = "rgba(167, 139, 250, 0.95)";
      ctx.shadowBlur = radius * 1.6;
    }
    const rotationRad = (element.rotation ?? 0) * (Math.PI / 180);
    if (rotationRad) {
      ctx.translate(px, py);
      ctx.rotate(rotationRad);
      ctx.translate(-px, -py);
    }

    if (element.type === "player") {
      const isRunner =
        element.playerStyle === "runner" ||
        element.playerStyle === "runner_noball";
      if (isRunner) {
        drawPlayerRunnerSprite(
          ctx,
          px,
          playerY,
          Math.max(6, radius),
          element.color ?? "#7B66FF",
          showLabels ? element.label ?? undefined : undefined,
          showOverlays && element.id === selectedId,
          showOverlays && ballCarrierIds.has(element.id),
          (element.label ?? "").toUpperCase() === "G",
          element.playerStyle === "runner_noball" ? "runner_noball" : "runner",
        );
      } else {
        const staticRadius = Math.max(6, radius * 0.65);
        drawPlayerBodyHead(
          ctx,
          px,
          playerY,
          staticRadius,
          element.color ?? "#7B66FF",
          showLabels ? element.label ?? undefined : undefined,
          showOverlays && element.id === selectedId,
          showOverlays && ballCarrierIds.has(element.id),
          (element.label ?? "").toUpperCase() === "G",
        );
      }
    } else if (element.type === "ball") {
      if (showOverlays && element.id === snapTargetId) {
        ctx.strokeStyle = "rgba(253, 224, 71, 0.6)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      drawBallPremium(ctx, px, py, Math.max(4, radius), showOverlays && element.id === selectedId);
    } else if (element.type === "cone") {
      const baseColor = element.color ?? "#F8C12C";
      drawPlotIso(
        ctx,
        px,
        py,
        Math.max(2, radius),
        baseColor,
        showOverlays && element.id === selectedId,
      );
    } else if (element.type === "slalom_pole") {
      const baseColor = element.color ?? "#6A5CFF";
      drawSlalomPole(
        ctx,
        px,
        py,
        Math.max(2, radius),
        baseColor,
        showOverlays && element.id === selectedId,
      );
    } else if (element.type === "hurdle_bar") {
      const baseColor = element.color ?? "#7B66FF";
      drawHurdleBar(
        ctx,
        px,
        py,
        Math.max(2, radius),
        baseColor,
        showOverlays && element.id === selectedId,
      );
    } else if (element.type === "hurdle_pole") {
      const baseColor = element.color ?? "#7B66FF";
      drawHurdlePole(
        ctx,
        px,
        py,
        Math.max(2, radius),
        baseColor,
        showOverlays && element.id === selectedId,
      );
    } else if (element.type === "mini_goal") {
      drawMiniGoal(
        ctx,
        px,
        py,
        Math.max(2, radius),
        element.color ?? "rgba(245,245,250,0.95)",
        showOverlays && element.id === selectedId,
      );
    } else if (element.type === "ladder") {
      const baseColor = element.color ?? "#7B66FF";
      drawLadder(
        ctx,
        px,
        py,
        Math.max(8, radius * 6),
        baseColor,
        showOverlays && element.id === selectedId,
      );
    } else if (element.type === "pass_wall") {
      const baseColor = element.color ?? "#6B7280";
      drawPassWall(
        ctx,
        px,
        py,
        Math.max(6, radius),
        baseColor,
        showOverlays && element.id === selectedId,
      );
    } else if (element.type === "shape") {
      const kind = element.shapeKind ?? "rect";
      const stroke = element.color ?? "#7B66FF";
      const lineWidth = 0.8;
      const size = Math.max(12, radius * 2.2);
      ctx.strokeStyle = stroke;
      if (showOverlays && element.id === selectedId) {
        ctx.shadowColor = "rgba(168, 85, 247, 1)";
        ctx.shadowBlur = Math.max(14, radius * 2.6);
        ctx.strokeStyle = "#C4B5FD";
      }
      ctx.lineWidth = lineWidth;
      if (
        kind === "rect_dashed" ||
        kind === "line_dashed" ||
        kind === "arrow_dashed" ||
        kind === "polyline_dashed" ||
        kind === "polyarrow_dashed"
      ) {
        ctx.setLineDash([10, 8]);
      } else if (kind === "rect" || kind === "circle" || kind === "hexagon") {
        ctx.setLineDash([4, 10]);
        ctx.lineCap = "round";
      }

      if (isPolylineShape(kind)) {
        const points = element.shapePoints ?? [];
        if (points.length === 1) {
          const p = points[0];
          const sx = pitchRect.x + p.x * pitchRect.w;
          const sy = pitchRect.y + p.y * pitchRect.h;
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, Math.PI * 2);
          ctx.fillStyle = stroke;
          ctx.fill();
        } else if (points.length > 1) {
          ctx.beginPath();
          points.forEach((p, index) => {
            const sx = pitchRect.x + p.x * pitchRect.w;
            const sy = pitchRect.y + p.y * pitchRect.h;
            if (index === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          });
          ctx.stroke();
          if (kind === "polyarrow_dashed") {
            ctx.setLineDash([]);
            ctx.fillStyle = stroke;
            for (let i = 0; i < points.length - 1; i += 1) {
              const from = {
                x: pitchRect.x + points[i].x * pitchRect.w,
                y: pitchRect.y + points[i].y * pitchRect.h,
              };
              const to = {
                x: pitchRect.x + points[i + 1].x * pitchRect.w,
                y: pitchRect.y + points[i + 1].y * pitchRect.h,
              };
              drawArrow(from, to);
            }
          }
        }
      } else if (
        kind === "line" ||
        kind === "arrow" ||
        kind === "line_dashed" ||
        kind === "arrow_dashed"
      ) {
        const length = Math.max(20, radius * 3.2);
        const from = { x: px - length / 2, y: py };
        const to = { x: px + length / 2, y: py };
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        if (kind === "arrow" || kind === "arrow_dashed") {
          ctx.fillStyle = stroke;
          drawArrow(from, to);
        }
      } else if (kind === "circle") {
        const r = size * 0.7;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (kind === "hexagon") {
        const r = size * 0.75;
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const angle = Math.PI / 6 + i * (Math.PI / 3);
          const x = px + r * Math.cos(angle);
          const y = py + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      } else if (kind === "rect" || kind === "rect_dashed") {
        const side = size * 1.4;
        ctx.lineJoin = "miter";
        ctx.beginPath();
        ctx.rect(px - side / 2, py - side / 2, side, side);
        ctx.stroke();
      } else {
        const side = size * 1.4;
        drawRoundedRect(
          ctx,
          px - side / 2,
          py - side / 2,
          side,
          side,
          Math.max(2, side * 0.12),
        );
        ctx.stroke();
      }

      ctx.setLineDash([]);
    } else if (element.type === "hoop") {
      const baseColor = element.color ?? "#7B66FF";
      drawHoop(
        ctx,
        px,
        py,
        Math.max(4, radius),
        baseColor,
        showOverlays && element.id === selectedId,
      );
    } else if (element.type === "baton") {
      const baseColor = element.color ?? "#7B66FF";
      drawBaton(
        ctx,
        px,
        py,
        Math.max(4, radius),
        baseColor,
        showOverlays && element.id === selectedId,
      );
    } else if (element.type === "disc") {
      const baseColor = element.color ?? "#FF6F91";
      drawCupDisc(
        ctx,
        px,
        py,
        Math.max(2, radius),
        baseColor,
        showOverlays && element.id === selectedId,
      );
    }

    if (showOverlays && showRotateHandle && element.id === selectedId) {
      const handle = getElementHandlePosition(element, pitchRect, false);
      if (handle) {
        ctx.save();
        const isHover =
          hoveredHandle?.id === element.id && hoveredHandle?.type === "rotate";
        const baseRadius = 6;
        const radius = isHover ? baseRadius + 1.6 : baseRadius;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(handle.x, handle.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        if (isHover) {
          ctx.shadowColor = "rgba(139, 92, 246, 0.8)";
          ctx.shadowBlur = 12;
          ctx.strokeStyle = "rgba(139, 92, 246, 0.9)";
          ctx.beginPath();
          ctx.arc(handle.x, handle.y, radius + 1.2, 0, Math.PI * 2);
          ctx.stroke();
        }
        // subtle rotate hint
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(handle.x, handle.y, radius - 2, Math.PI * 0.4, Math.PI * 1.4);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (showOverlays && showResizeHandle && element.id === selectedId) {
      const handle = getResizeHandlePosition(element, pitchRect, false);
      if (handle) {
        ctx.save();
        const isHover =
          hoveredHandle?.id === element.id && hoveredHandle?.type === "resize";
        const baseRadius = 5;
        const radius = isHover ? baseRadius + 1.6 : baseRadius;
        ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
        ctx.strokeStyle = "rgba(15, 23, 42, 0.7)";
        ctx.lineWidth = 1;
        ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
        ctx.shadowBlur = 6;
        if (isHover) {
          ctx.shadowColor = "rgba(139, 92, 246, 0.9)";
          ctx.shadowBlur = 12;
        }
        ctx.beginPath();
        ctx.arc(handle.x, handle.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // tiny expand arrow inside the dot
        const arrowSize = radius * 0.95;
        ctx.strokeStyle = "rgba(15, 23, 42, 0.8)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(handle.x - arrowSize * 0.25, handle.y + arrowSize * 0.25);
        ctx.lineTo(handle.x + arrowSize * 0.35, handle.y - arrowSize * 0.35);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(handle.x + arrowSize * 0.35, handle.y - arrowSize * 0.35);
        ctx.lineTo(handle.x + arrowSize * 0.05, handle.y - arrowSize * 0.35);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(handle.x + arrowSize * 0.35, handle.y - arrowSize * 0.35);
        ctx.lineTo(handle.x + arrowSize * 0.35, handle.y - arrowSize * 0.05);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();
  });
};

const hitTest = (
  elements: CanvasElement[],
  point: { x: number; y: number },
  pitchRect: PitchRect,
) => {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const element = elements[i];
    const px = pitchRect.x + element.x * pitchRect.w;
    const py = pitchRect.y + element.y * pitchRect.h;
    const orientationScale = pitchRect.isLandscape ? 1 : 1.2;
    const size =
      getRenderSize(
        element.type,
        element.size ?? getDefaultSize(element.type),
      ) * orientationScale;
    const radius = size * pitchRect.w;
    const rotation = element.rotation ?? 0;
    const rotatedPoint =
      element.type === "shape" && rotation !== 0
        ? rotatePoint(point, { x: px, y: py }, (-rotation * Math.PI) / 180)
        : point;

    if (element.type === "cone") {
      // Simple bbox hit for triangle
      const minX = px - radius;
      const maxX = px + radius;
      const minY = py - radius;
      const maxY = py + radius;
      if (
        point.x >= minX - 6 &&
        point.x <= maxX + 6 &&
        point.y >= minY - 6 &&
        point.y <= maxY + 6
      ) {
        return element.id;
      }
      continue;
    }

    if (element.type === "hurdle_bar" || element.type === "hurdle_pole") {
      if (
        point.x >= px - radius * 2.2 &&
        point.x <= px + radius * 2.2 &&
        point.y >= py - radius * 2.2 &&
        point.y <= py + radius * 1.2
      ) {
        return element.id;
      }
      continue;
    }

    if (element.type === "baton") {
      if (
        point.x >= px - radius * 2.6 &&
        point.x <= px + radius * 2.6 &&
        point.y >= py - radius * 0.9 &&
        point.y <= py + radius * 0.9
      ) {
        return element.id;
      }
      continue;
    }

    if (element.type === "mini_goal") {
      if (
        point.x >= px - radius * 1.4 &&
        point.x <= px + radius * 1.4 &&
        point.y >= py - radius * 1.6 &&
        point.y <= py + radius * 1.2
      ) {
        return element.id;
      }
      continue;
    }
    if (element.type === "ladder") {
      const length = radius * 6;
      const reach = Math.max(length * 0.6, radius * 2);
      const dx = point.x - px;
      const dy = point.y - py;
      if (dx * dx + dy * dy <= reach * reach) return element.id;
      continue;
    }
    if (element.type === "shape") {
      const kind = element.shapeKind ?? "rect";
      const baseSize = Math.max(10, radius * 2.2);
      if (isPolylineShape(kind)) {
        const points = element.shapePoints ?? [];
        if (points.length === 1) {
          const sx = pitchRect.x + points[0].x * pitchRect.w;
          const sy = pitchRect.y + points[0].y * pitchRect.h;
          if (Math.hypot(point.x - sx, point.y - sy) <= 10) {
            return element.id;
          }
        } else if (points.length > 1) {
          const threshold = 12;
          for (let i = 0; i < points.length - 1; i += 1) {
            const a = {
              x: pitchRect.x + points[i].x * pitchRect.w,
              y: pitchRect.y + points[i].y * pitchRect.h,
            };
            const b = {
              x: pitchRect.x + points[i + 1].x * pitchRect.w,
              y: pitchRect.y + points[i + 1].y * pitchRect.h,
            };
            const abx = b.x - a.x;
            const aby = b.y - a.y;
            const apx = point.x - a.x;
            const apy = point.y - a.y;
            const abLenSq = abx * abx + aby * aby || 1;
            let t = (apx * abx + apy * aby) / abLenSq;
            t = Math.max(0, Math.min(1, t));
            const closest = { x: a.x + abx * t, y: a.y + aby * t };
            if (Math.hypot(point.x - closest.x, point.y - closest.y) <= threshold) {
              return element.id;
            }
          }
        }
        continue;
      }
      if (
        kind === "line" ||
        kind === "arrow" ||
        kind === "line_dashed" ||
        kind === "arrow_dashed"
      ) {
        const length = Math.max(20, radius * 3.2);
        const padding = 18;
        if (
          rotatedPoint.x >= px - length / 2 - padding &&
          rotatedPoint.x <= px + length / 2 + padding &&
          rotatedPoint.y >= py - padding &&
          rotatedPoint.y <= py + padding
        ) {
          return element.id;
        }
      } else {
        const half = baseSize * 0.9;
        if (
          rotatedPoint.x >= px - half &&
          rotatedPoint.x <= px + half &&
          rotatedPoint.y >= py - half &&
          rotatedPoint.y <= py + half
        ) {
          return element.id;
        }
      }
      continue;
    }

    if (
      element.type === "player" &&
      (element.playerStyle === "runner" || element.playerStyle === "runner_noball")
    ) {
      const isNoBall = element.playerStyle === "runner_noball";
      const boxW = radius * (isNoBall ? 1.55 : 1.85);
      const boxH = radius * (isNoBall ? 3.0 : 3.6);
      const boxX = px - boxW / 2;
      const boxY = py - getPlayerFootOffset(radius) - boxH * 0.85;
      if (
        point.x >= boxX - 6 &&
        point.x <= boxX + boxW + 6 &&
        point.y >= boxY - 6 &&
        point.y <= boxY + boxH + 6
      ) {
        return element.id;
      }
      continue;
    }

    const scaleY = element.type === "disc" ? 0.45 : 1;
    const centerY =
      element.type === "player" ? py - getPlayerFootOffset(radius) : py;
    const dx = (point.x - px) / radius;
    const dy = (point.y - centerY) / (radius * scaleY);
    if (dx * dx + dy * dy <= 1.15) return element.id;
  }
  return null;
};

const useCanvasElements = (
  initial: CanvasElement[] = [],
  handlers?: {
    onDragStart?: (id: string, x: number, y: number) => void;
    onDragMove?: (id: string, x: number, y: number) => void;
    onDragEnd?: (id: string) => void;
    onElementClick?: (element: CanvasElement) => void;
  },
  options?: {
    showRotateHandle?: boolean;
    showResizeHandle?: boolean;
  },
) => {
  const [elements, setElements] = useState<CanvasElement[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolKey>("select");
  const [playerColor, setPlayerColor] = useState(DEFAULT_COLORS[0]);
  const [activeShapePathId, setActiveShapePathId] = useState<string | null>(null);
  const selectedElement = useMemo(
    () => elements.find((el) => el.id === selectedId) ?? null,
    [elements, selectedId],
  );
  const allowRotateHandle = options?.showRotateHandle ?? true;
  const allowResizeHandle = options?.showResizeHandle ?? true;
  const draggingRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    moved: boolean;
    created?: boolean;
    createdFirst?: boolean;
  } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    id: string;
    startDistance: number;
    startSize: number;
  } | null>(null);
  const resizeRef = useRef<{
    id: string;
    startDistance: number;
    startSize: number;
    center: { x: number; y: number };
    rotate: boolean;
    scale: boolean;
  } | null>(null);
  const pitchRef = useRef<PitchRect>({
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    isLandscape: true,
  });
  const clampElementSize = (value: number) =>
    Math.min(Math.max(value, 0.012), 0.32);

  useEffect(() => {
    if (!isPolylineTool(tool)) {
      setActiveShapePathId(null);
    }
  }, [tool]);

  const setPitchRect = (rect: PitchRect) => {
    pitchRef.current = rect;
  };

  const lastSizeByTypeRef = useRef<Partial<Record<ElementType, number>>>({});

  const addElement = (toolKey: ToolKey, position: { x: number; y: number }) => {
    const isShape = isShapeTool(toolKey);
    const isPolyline = isPolylineTool(toolKey);
    const isRunnerTool = toolKey === "player_runner";
    const isRunnerNoBallTool = toolKey === "player_runner_noball";
    const type: ElementType = isShape
      ? "shape"
      : isRunnerTool || isRunnerNoBallTool
        ? "player"
        : (toolKey as ElementType);
    const baseColor =
      type === "ball"
        ? "#ffffff"
        : type === "mini_goal"
        ? "#F5F5FA"
        : playerColor;
    const pitchRect = pitchRef.current;
    const initialSize =
      lastSizeByTypeRef.current[type] ?? getDefaultSize(type);
    const baseSize = getRenderSize(type, initialSize);
    const radius = baseSize * pitchRect.w;
    const placementOffset =
      type === "player" ? getPlayerFootOffset(radius) / pitchRect.h : 0;
    const newElement: CanvasElement = {
      id: buildId(),
      type,
      x: clamp01(position.x),
      y: clamp01(position.y + placementOffset),
      color: baseColor,
      label: type === "player" ? "" : undefined,
      playerStyle:
        type === "player"
          ? isRunnerTool
            ? "runner"
            : isRunnerNoBallTool
              ? "runner_noball"
              : undefined
          : undefined,
      size: initialSize,
      orientation: type === "mini_goal" ? "down" : undefined,
      rotation: 0,
      shapeKind: isShape ? toolKey : undefined,
      shapePoints: isPolyline ? [position] : undefined,
    };
    setElements((prev) => [...prev, newElement]);
    setSelectedId(newElement.id);
    return newElement;
  };

  const updateElement = (id: string, patch: Partial<CanvasElement>) => {
    setElements((prev) =>
      prev.map((el) => {
        if (el.id !== id) return el;
        if (patch.size !== undefined) {
          lastSizeByTypeRef.current[el.type] = patch.size;
        }
        return { ...el, ...patch };
      }),
    );
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  };
  const nudgeSelected = (dx: number, dy: number) => {
    if (!selectedElement) return;
    const nextX = clamp01(selectedElement.x + dx);
    const nextY = clamp01(selectedElement.y + dy);
    if (selectedElement.type === "shape" && selectedElement.shapePoints?.length) {
      const nextPoints = selectedElement.shapePoints.map((p: { x: number; y: number }) => ({
        x: clamp01(p.x + dx),
        y: clamp01(p.y + dy),
      }));
      updateElement(selectedElement.id, {
        x: nextX,
        y: nextY,
        shapePoints: nextPoints,
      });
    } else {
      updateElement(selectedElement.id, { x: nextX, y: nextY });
    }
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const pitchRect = pitchRef.current;
    const normalized = {
      x: clamp01((point.x - pitchRect.x) / pitchRect.w),
      y: clamp01((point.y - pitchRect.y) / pitchRect.h),
    };
    if (event.pointerType === "touch") {
      pointersRef.current.set(event.pointerId, point);
    }

    if (isPolylineTool(tool)) {
      const sameKindSelected = selectedId
        ? elements.find(
            (el) =>
              el.id === selectedId &&
              el.type === "shape" &&
              el.shapeKind === tool,
          ) ?? null
        : null;
      const activeId = activeShapePathId ?? sameKindSelected?.id ?? null;
      if (activeId) {
        const target = elements.find((el) => el.id === activeId);
        if (
          target &&
          target.type === "shape" &&
          target.shapeKind === tool &&
          target.shapePoints
        ) {
          const nextPoints = [...target.shapePoints, normalized];
          const center = getPointsCenter(nextPoints);
          updateElement(target.id, {
            shapePoints: nextPoints,
            x: center.x,
            y: center.y,
          });
          setActiveShapePathId(target.id);
          setSelectedId(target.id);
          return;
        }
        setActiveShapePathId(null);
      }

      const created = addElement(tool, normalized);
      setActiveShapePathId(created.id);
      setSelectedId(created.id);
      return;
    }

    // Priority: handle drag first (resize/rotate), then hit-test selection/drag.
    const selectedElement = selectedId
      ? elements.find((el) => el.id === selectedId) ?? null
      : null;
    const rotateHitRadius = 18;
    const resizeHitRadius = 12;
    const tryStartRotateFromHandle = (element: CanvasElement) => {
      if (!allowRotateHandle) return false;
      const shapeKind = element.shapeKind ?? "rect";
      const canRotate =
        element.type === "shape" ? isRotatableShape(shapeKind) : true;
      if (!canRotate) return false;
      const handle = getElementHandlePosition(element, pitchRect, true);
      if (!handle) return false;
      const dist = Math.hypot(point.x - handle.x, point.y - handle.y);
      if (dist >= rotateHitRadius) return false;
      resizeRef.current = {
        id: element.id,
        startDistance: Math.max(
          6,
          Math.hypot(point.x - handle.px, point.y - handle.py),
        ),
        startSize: element.size ?? getDefaultSize(element.type),
        center: { x: handle.px, y: handle.py },
        rotate: true,
        scale: false,
      };
      draggingRef.current = null;
      setSelectedId(element.id);
      event.currentTarget.setPointerCapture(event.pointerId);
      return true;
    };
    const tryStartScaleFromHandle = (element: CanvasElement) => {
      if (!allowResizeHandle) return false;
      const handle = getResizeHandlePosition(element, pitchRect, true);
      if (!handle) return false;
      const handleDistance = Math.hypot(point.x - handle.x, point.y - handle.y);
      if (handleDistance >= resizeHitRadius) return false;
      resizeRef.current = {
        id: element.id,
        startDistance: Math.max(
          6,
          Math.hypot(point.x - handle.px, point.y - handle.py),
        ),
        startSize: element.size ?? getDefaultSize(element.type),
        center: { x: handle.px, y: handle.py },
        rotate: false,
        scale: true,
      };
      draggingRef.current = null;
      setSelectedId(element.id);
      event.currentTarget.setPointerCapture(event.pointerId);
      return true;
    };

    if (selectedElement) {
      if (tryStartRotateFromHandle(selectedElement)) return;
      if (tryStartScaleFromHandle(selectedElement)) return;
    }
    if (isShapeTool(tool)) {
      const candidates = elements.filter(
        (el) => el.type === "shape" && el.shapeKind === tool,
      );
      for (let i = candidates.length - 1; i >= 0; i -= 1) {
        if (tryStartRotateFromHandle(candidates[i])) return;
        if (tryStartScaleFromHandle(candidates[i])) return;
      }
    }

    let hitId = selectedElement
      ? hitTest([selectedElement], point, pitchRect)
      : null;
    const sameKindHit = isShapeTool(tool)
      ? hitTest(
          elements.filter(
            (el) => el.type === "shape" && el.shapeKind === tool,
          ),
          point,
          pitchRect,
        )
      : null;
    const nonShapeHit = hitTest(
      elements.filter((el) => el.type !== "shape"),
      point,
      pitchRect,
    );
    const shapeHit = hitTest(
      elements.filter((el) => el.type === "shape"),
      point,
      pitchRect,
    );
    if (nonShapeHit) {
      hitId = nonShapeHit;
    } else if (sameKindHit) {
      hitId = sameKindHit;
    } else if (tool === "select") {
      hitId = hitId ?? shapeHit;
    } else if (!hitId) {
      hitId = shapeHit;
    }

    if (event.pointerType === "touch" && pointersRef.current.size === 2) {
      const targetId =
        selectedElement?.type === "shape" ? selectedElement.id : hitId;
      const target = targetId
        ? elements.find((el) => el.id === targetId)
        : null;
      if (target?.type === "shape") {
        const points = Array.from(pointersRef.current.values());
        const startDistance = Math.max(
          6,
          Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        );
        pinchRef.current = {
          id: target.id,
          startDistance,
          startSize: target.size ?? getDefaultSize(target.type),
        };
        setSelectedId(target.id);
        draggingRef.current = null;
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }
    if (tool !== "select" && hitId) {
      const hitElement = elements.find((el) => el.id === hitId);
      if (isShapeTool(tool)) {
        if (
          hitElement?.type === "shape" &&
          hitElement.shapeKind !== tool
        ) {
          hitId = null;
        }
      } else if (hitElement?.type === "shape") {
        hitId = null;
      }
    }

    if (hitId) {
      setSelectedId(hitId);
      const px = pitchRect.x + (elements.find((el) => el.id === hitId)?.x ?? 0) * pitchRect.w;
      const py = pitchRect.y + (elements.find((el) => el.id === hitId)?.y ?? 0) * pitchRect.h;
      const element = elements.find((el) => el.id === hitId);
      draggingRef.current = {
        id: hitId,
        offsetX: point.x - px,
        offsetY: point.y - py,
        startX: point.x,
        startY: point.y,
        moved: false,
        created: false,
        createdFirst: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      if (element) {
        handlers?.onDragStart?.(element.id, element.x, element.y);
      }
    } else {
      if (tool !== "select") {
        const isFirstElement = elements.length === 0;
        const created = addElement(tool, normalized);
        const px = pitchRect.x + created.x * pitchRect.w;
        const py = pitchRect.y + created.y * pitchRect.h;
        draggingRef.current = {
          id: created.id,
          offsetX: point.x - px,
          offsetY: point.y - py,
          startX: point.x,
          startY: point.y,
          moved: false,
          created: true,
          createdFirst: isFirstElement,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        handlers?.onDragStart?.(created.id, created.x, created.y);
        return;
      }
      setSelectedId(null);
    }
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (event.pointerType === "touch") {
      pointersRef.current.set(event.pointerId, point);
    }
    if (pinchRef.current) {
      const points = Array.from(pointersRef.current.values());
      if (points.length < 2) return;
      const distance = Math.max(
        6,
        Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
      );
      const ratio = distance / pinchRef.current.startDistance;
      const nextSize = clampElementSize(
        pinchRef.current.startSize * ratio,
      );
      updateElement(pinchRef.current.id, { size: nextSize });
      return;
    }
    if (resizeRef.current) {
      const distance = Math.max(
        6,
        Math.hypot(
          point.x - resizeRef.current.center.x,
          point.y - resizeRef.current.center.y,
        ),
      );
      const patch: Partial<CanvasElement> = {};
      if (resizeRef.current.scale) {
        const ratio = distance / resizeRef.current.startDistance;
        const nextSize = clampElementSize(resizeRef.current.startSize * ratio);
        patch.size = nextSize;
      }
      if (resizeRef.current.rotate) {
        const angle = Math.atan2(
          point.y - resizeRef.current.center.y,
          point.x - resizeRef.current.center.x,
        );
        const degrees = ((angle * 180) / Math.PI + 360) % 360;
        patch.rotation = degrees;
      }
      updateElement(resizeRef.current.id, patch);
      return;
    }
    if (!draggingRef.current) return;
    const movedDistance = Math.hypot(
      point.x - draggingRef.current.startX,
      point.y - draggingRef.current.startY,
    );
    if (movedDistance > 3) {
      draggingRef.current.moved = true;
    }
    const pitchRect = pitchRef.current;
    const nextX = clamp01((point.x - draggingRef.current.offsetX - pitchRect.x) / pitchRect.w);
    const nextY = clamp01((point.y - draggingRef.current.offsetY - pitchRect.y) / pitchRect.h);
    const active = elements.find((el) => el.id === draggingRef.current?.id);
    if (active?.type === "shape" && active.shapePoints?.length) {
      const deltaX = nextX - active.x;
      const deltaY = nextY - active.y;
      const nextPoints = active.shapePoints.map((p: { x: number; y: number }) => ({
        x: clamp01(p.x + deltaX),
        y: clamp01(p.y + deltaY),
      }));
      updateElement(draggingRef.current.id, {
        x: nextX,
        y: nextY,
        shapePoints: nextPoints,
      });
    } else {
      updateElement(draggingRef.current.id, { x: nextX, y: nextY });
    }
    handlers?.onDragMove?.(draggingRef.current.id, nextX, nextY);
  };

  const handlePointerUp = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const wasResizing = Boolean(resizeRef.current);
    const wasPinching = Boolean(pinchRef.current);
    if (event.pointerType === "touch") {
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size < 2) {
        pinchRef.current = null;
      }
    }
    if (wasResizing) {
      resizeRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (wasPinching) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (draggingRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      handlers?.onDragEnd?.(draggingRef.current.id);
      const shouldTriggerClick =
        (!draggingRef.current.created && !draggingRef.current.moved) ||
        draggingRef.current.createdFirst;
      if (shouldTriggerClick) {
        const element = elements.find((el) => el.id === draggingRef.current?.id);
        if (element) {
          handlers?.onElementClick?.(element);
        }
      }
    }
    draggingRef.current = null;
  };

  const clearDrag = () => {
    draggingRef.current = null;
    resizeRef.current = null;
    pinchRef.current = null;
    pointersRef.current.clear();
  };

  return {
    elements,
    setElements,
    selectedId,
    setSelectedId,
    tool,
    setTool,
    playerColor,
    setPlayerColor,
    updateElement,
    deleteSelected,
    addElement,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    setPitchRect,
    clearDrag,
  };
};

type ExerciseEditorMode = "animated" | "static";

type ExerciseAnimatedEditorProps = {
  mode?: ExerciseEditorMode;
};

export default function ExerciseAnimatedEditor({
  mode = "animated",
}: ExerciseAnimatedEditorProps) {
  const isStaticEditor = mode === "static";
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const editExerciseId = (searchParams?.get("edit") ?? "").trim();
  const [canvasSize, setCanvasSize] = useState({ w: 1200, h: 720 });
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoryMain, setCategoryMain] = useState("");
  const [trainingType, setTrainingType] = useState("");
  const [objectives, setObjectives] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [durationMinutesInput, setDurationMinutesInput] = useState("");
  const [notes, setNotes] = useState("");
  const [showNotesField, setShowNotesField] = useState(false);
  const [openSaveSelect, setOpenSaveSelect] = useState<
    null | "category" | "type" | "objective"
  >(null);
  const [frames, setFrames] = useState<FrameSnapshot[]>([]);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [pitchPreset] = useState<PitchPreset>("training_dark_green");
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [recordPathMode, setRecordPathMode] = useState(false);
  const [trajectoryOrder, setTrajectoryOrder] = useState<string[]>([]);
  const [pathColorMap, setPathColorMap] = useState<Record<string, string>>({});
  const [currentRecordingElementId, setCurrentRecordingElementId] = useState<
    string | null
  >(null);
  const [recordMode, setRecordMode] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [strokesBase, setStrokesBase] = useState<BaseSnapshot | null>(null);
  const [groupMode, setGroupMode] = useState(false);
  const [currentSequenceIndex, setCurrentSequenceIndex] = useState(1);
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);
  const [sequenceEditor, setSequenceEditor] = useState<{
    strokeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [sequenceEditorValue, setSequenceEditorValue] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [immersiveMode] = useState(false);
  const [animationMode, setAnimationMode] = useState<"image" | "video" | null>(null);
  useEffect(() => {
    if (!isStaticEditor) return;
    setAnimationMode(null);
    setRecordMode(false);
    setPreviewMode(false);
  }, [isStaticEditor]);
  useEffect(() => {
    if (!isStaticEditor) {
      setRecordPathMode(false);
      setTrajectoryOrder([]);
      setPathElementMap({});
      setPathColorMap({});
      setTrajectoryPreviews({});
      pathCounterRef.current = 0;
    }
  }, [isStaticEditor]);

  useEffect(() => {
    if (!editExerciseId) return;
    if (editLoadedRef.current === editExerciseId) return;
    let mounted = true;
    const fetchExercise = async () => {
      setLoadingEdit(true);
      setEditError(null);
      const { data, error } = await supabase
        .from("training_exercises")
        .select(
          "id,title,category,duration,type,animation_data,created_at,updated_at",
        )
        .eq("id", editExerciseId)
        .single();
      if (!mounted) return;
      if (error || !data) {
        setEditError(error?.message ?? "Impossible de charger l’exercice.");
        setLoadingEdit(false);
        return;
      }
      const row = data as ExerciseRow;
      const payload = normalizePayload(row.animation_data);
      const pitchState = normalizePitchState(payload) ?? {};
      const storedOrientation =
        pitchState.pitchOrientation ?? payload?.pitchOrientation ?? null;
      const meta = (payload?.metadata ?? payload?.meta ?? {}) as Record<
        string,
        any
      >;

      const loadedElements = (pitchState.elements ??
        payload?.elements ??
        []) as CanvasElement[];
      const loadedPaths = (pitchState.paths ??
        payload?.paths ??
        {}) as Record<string, PathPoint[]>;
      const loadedAttachments = (pitchState.ballAttachments ??
        payload?.ballAttachments ??
        {}) as Record<string, string>;
      const storedPathElementMap =
        (pitchState.pathElementMap ?? payload?.pathElementMap ?? {}) as Record<
          string,
          string
        >;
      const storedTrajectoryOrder =
        (pitchState.trajectoryOrder ??
          payload?.trajectoryOrder ??
          []) as string[];
      const storedPathColorMap =
        (pitchState.pathColorMap ?? payload?.pathColorMap ?? {}) as Record<
          string,
          string
        >;

      setElements(loadedElements);
      setPaths(loadedPaths);
      setBallAttachments(loadedAttachments);
      setFrames([]);
      setFramePreviews({});
      setStrokes([]);
      strokesRef.current = [];
      setStrokesBase(null);
      strokesBaseRef.current = null;
      setSelectedId(null);
      setActiveFrameId(null);
      setTrajectoryPreviews({});

      const elementIds = loadedElements.map((el) => el.id);
      const nextPathElementMap: Record<string, string> = {
        ...storedPathElementMap,
      };
      const inferredOrder = Object.keys(loadedPaths);
      const order =
        storedTrajectoryOrder.length > 0 ? storedTrajectoryOrder : inferredOrder;
      inferredOrder.forEach((pathId) => {
        if (nextPathElementMap[pathId]) return;
        const match =
          elementIds.find(
            (elementId) =>
              pathId === elementId || pathId.startsWith(`${elementId}-`),
          ) ?? pathId;
        nextPathElementMap[pathId] = match;
      });
      setPathElementMap(nextPathElementMap);
      setTrajectoryOrder(order);
      pathCounterRef.current = order.length;

      const nextColorMap: Record<string, string> = {
        ...storedPathColorMap,
      };
      let colorIndex = 0;
      order.forEach((pathId) => {
        const elementId = nextPathElementMap[pathId];
        if (!elementId || nextColorMap[elementId]) return;
        nextColorMap[elementId] =
          TRAJECTORY_PALETTE[colorIndex % TRAJECTORY_PALETTE.length];
        colorIndex += 1;
      });
      setPathColorMap(nextColorMap);

      const rawCategory =
        meta.category ?? meta.categoryMain ?? row.category ?? "";
      const categoryLabel =
        CATEGORY_LABEL_MAP[rawCategory] ??
        (CATEGORY_MAIN_OPTIONS.includes(rawCategory) ? rawCategory : "");
      setCategoryMain(categoryLabel);

      const rawType = meta.type ?? meta.trainingType ?? "";
      const typeLabel =
        TYPE_LABEL_MAP[rawType] ??
        (TRAINING_TYPE_OPTIONS.includes(rawType) ? rawType : "");
      setTrainingType(typeLabel);

      const rawObjective = meta.objective ?? meta.objectives ?? [];
      const objectiveList = Array.isArray(rawObjective)
        ? rawObjective
        : rawObjective
        ? [rawObjective]
        : [];
      const nextObjectives = objectiveList
        .map(
          (value) =>
            OBJECTIVE_LABEL_MAP[value] ??
            (OBJECTIVE_OPTIONS.includes(value) ? value : null),
        )
        .filter(Boolean) as string[];
      setObjectives(nextObjectives);

      const nextLevels = Array.isArray(meta.levels) ? meta.levels : [];
      setLevels(nextLevels);
      const nextNotes = typeof meta.notes === "string" ? meta.notes : "";
      setNotes(nextNotes);
      setShowNotesField(Boolean(nextNotes));

      const fallbackName =
        meta.name ?? row.title ?? payload?.title ?? "Exercice";
      setName(String(fallbackName));
      setNameError(null);
      setCategoryError(null);
      if (storedOrientation === "portrait" || storedOrientation === "landscape") {
        orientationRef.current = storedOrientation;
        lockOrientationRef.current = true;
      }
      editLoadedRef.current = editExerciseId;
      setLoadingEdit(false);
    };
    fetchExercise();
    return () => {
      mounted = false;
    };
  }, [editExerciseId]);

  useEffect(() => {
    if (!editExerciseId) {
      lockOrientationRef.current = false;
    }
  }, [editExerciseId]);
  const [showToolboxMenu, setShowToolboxMenu] = useState(false);
  const toolboxMenuRef = useRef<HTMLDivElement | null>(null);
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const shapeMenuRef = useRef<HTMLDivElement | null>(null);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const colorMenuRef = useRef<HTMLDivElement | null>(null);
  const [showElementColorMenu, setShowElementColorMenu] = useState(false);
  const elementColorMenuRef = useRef<HTMLDivElement | null>(null);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [showRotateHandle, setShowRotateHandle] = useState(false);
  const [showSelectionToolbar, setShowSelectionToolbar] = useState(false);
  const [hoveredHandle, setHoveredHandle] = useState<
    { id: string; type: "rotate" | "resize" } | null
  >(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveStep, setSaveStep] = useState<"form" | "success">("form");
  const [showSpeedPanel, setShowSpeedPanel] = useState(false);
  const [actionSpeedMultipliers, setActionSpeedMultipliers] = useState<Record<number, number>>({});
  const [frameSpeedMultipliers, setFrameSpeedMultipliers] = useState<Record<string, number>>({});
  const [capturePulse, setCapturePulse] = useState(false);
  const captureTimerRef = useRef<number | null>(null);
  const editLoadedRef = useRef<string | null>(null);
  const lockOrientationRef = useRef(false);
  const [ballAttachments, setBallAttachments] = useState<Record<string, string>>({});
  const lastBallAttachmentsRef = useRef<Record<string, string>>({});
  const prevRecordModeRef = useRef(recordMode);
  const [framePreviews, setFramePreviews] = useState<Record<string, string>>({});
  const [trajectoryPreviews, setTrajectoryPreviews] = useState<Record<string, string>>({});
  const [activeTrajectoryPreviewId, setActiveTrajectoryPreviewId] = useState<string | null>(null);
  const [showSequenceDebug, setShowSequenceDebug] = useState(false);
  const [snapTargetId, setSnapTargetId] = useState<string | null>(null);
  const historyRef = useRef<EditorSnapshot[]>([]);
  const historyIndexRef = useRef(-1);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const saveCategoryRef = useRef<HTMLDivElement | null>(null);
  const saveTypeRef = useRef<HTMLDivElement | null>(null);
  const saveObjectiveRef = useRef<HTMLDivElement | null>(null);
  const historyTimerRef = useRef<number | null>(null);
  const isRestoringHistoryRef = useRef(false);
  const lastSnapshotRef = useRef<string | null>(null);
  const orientationRef = useRef<"landscape" | "portrait" | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const strokesBaseRef = useRef<BaseSnapshot | null>(null);
  const discIconRef = useRef<HTMLCanvasElement | null>(null);
  const [associationTargetPlayerId, setAssociationTargetPlayerId] = useState<
    string | null
  >(null);
  const [associationTargetBallId, setAssociationTargetBallId] = useState<
    string | null
  >(null);
  const [paths, setPaths] = useState<Record<string, PathPoint[]>>({});
  const [pathElementMap, setPathElementMap] = useState<Record<string, string>>({});
  const plotIconRef = useRef<HTMLCanvasElement | null>(null);
  const playerIconRef = useRef<HTMLCanvasElement | null>(null);
  const slalomPoleIconRef = useRef<HTMLCanvasElement | null>(null);
  const hurdleBarIconRef = useRef<HTMLCanvasElement | null>(null);
  const hurdlePoleIconRef = useRef<HTMLCanvasElement | null>(null);
  const ladderIconRef = useRef<HTMLCanvasElement | null>(null);
  const discMenuIconRef = useRef<HTMLCanvasElement | null>(null);
  const plotMenuIconRef = useRef<HTMLCanvasElement | null>(null);
  const slalomMenuIconRef = useRef<HTMLCanvasElement | null>(null);
  const hurdleBarMenuIconRef = useRef<HTMLCanvasElement | null>(null);
  const hurdlePoleMenuIconRef = useRef<HTMLCanvasElement | null>(null);
  const ladderMenuIconRef = useRef<HTMLCanvasElement | null>(null);
  const hoopMenuIconRef = useRef<HTMLCanvasElement | null>(null);
  const batonMenuIconRef = useRef<HTMLCanvasElement | null>(null);
  const toolboxDiscIconRef = useRef<HTMLCanvasElement | null>(null);
  const toolboxPoleIconRef = useRef<HTMLCanvasElement | null>(null);
  const pathRecordRef = useRef<{
    id: string;
    pathId: string;
    startTime: number;
    lastTime: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const pathCounterRef = useRef(0);
  const sequenceDragRef = useRef<{
    id: string;
    startTime: number;
    lastTime: number;
    lastX: number;
    lastY: number;
    points: PathPoint[];
  } | null>(null);
  const frameDragRef = useRef<{
    id: string;
    startX: number;
    lastX: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    if (!showSaveDialog) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (saveCategoryRef.current?.contains(target)) return;
      if (saveTypeRef.current?.contains(target)) return;
      if (saveObjectiveRef.current?.contains(target)) return;
      setOpenSaveSelect(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [showSaveDialog]);

  const {
    elements,
    setElements,
    selectedId,
    setSelectedId,
    tool,
    setTool,
    playerColor,
    setPlayerColor,
    updateElement,
    deleteSelected,
    addElement,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    setPitchRect,
    clearDrag,
  } = useCanvasElements(
    [],
    {
      onDragStart: (id, x, y) => {
        const element = elements.find((el) => el.id === id);
        const isRecordable =
          element?.type === "player" || element?.type === "ball";

        let activePathId = id;
        if (recordPathMode && isStaticEditor && isRecordable) {
          setPathColorMap((prev) => {
            if (prev[id]) return prev;
            const nextIndex = Object.keys(prev).length;
            const color =
              TRAJECTORY_PALETTE[nextIndex % TRAJECTORY_PALETTE.length];
            return { ...prev, [id]: color };
          });
          activePathId = `${id}-${pathCounterRef.current++}`;
          setTrajectoryOrder((prev) => [...prev, activePathId]);
          setPathElementMap((prev) => ({ ...prev, [activePathId]: id }));
        }

        if (element?.type === "ball") {
          setBallAttachments((prev) => {
            if (!prev[element.id]) return prev;
            const next = { ...prev };
            delete next[element.id];
            return next;
          });
        }

        if (recordMode && element && isRecordable) {
          const now = performance.now();
          sequenceDragRef.current = {
            id,
            startTime: now,
            lastTime: now,
            lastX: x,
            lastY: y,
            points: [
              {
                x,
                y,
                t: 0,
              },
            ],
          };
        }

      if (!recordPathMode) return;
      setCurrentRecordingElementId(id);
      const now = performance.now();
      setPaths((prev) => {
        const key = recordPathMode && isStaticEditor ? activePathId : id;
        const existing = prev[key] ?? [];
        const baseT = existing.length ? existing[existing.length - 1].t : 0;
        let next = existing.length ? [...existing] : [{ x, y, t: 0 }];
        if (existing.length) {
          const last = existing[existing.length - 1];
          const dist = Math.hypot(x - last.x, y - last.y);
          if (dist >= 0.005) {
            next = [...existing, { x, y, t: baseT }];
          }
        }
        pathRecordRef.current = {
          id,
          pathId: key,
          startTime: now - baseT,
          lastTime: now,
          lastX: x,
          lastY: y,
        };
        return { ...prev, [key]: next };
      });
    },
    onDragMove: (id, x, y) => {
      const attachedBallIds = getAttachedBallIdsForPlayer(id);
      if (attachedBallIds.length > 0) {
        attachedBallIds.forEach((ballId) => {
          updateElement(ballId, {
            x: clamp01(x + 0.015),
            y: clamp01(y + 0.01),
          });
        });
      }

      if (recordMode) {
        const seq = sequenceDragRef.current;
        if (seq && seq.id && id === seq.id) {
          const now = performance.now();
          const dist = Math.hypot(x - seq.lastX, y - seq.lastY);
          if (dist >= 0.005 && (now - seq.lastTime >= 50 || dist >= 0.01)) {
            const t = now - seq.startTime;
            seq.points.push({ x, y, t });
            seq.lastTime = now;
            seq.lastX = x;
            seq.lastY = y;
          }
        }
      }

      if (!recordPathMode) return;
      if (currentRecordingElementId && currentRecordingElementId !== id) return;
      const ref = pathRecordRef.current;
      if (!ref || ref.id !== id) return;
      const now = performance.now();
      const dist = Math.hypot(x - ref.lastX, y - ref.lastY);
      if (dist < 0.005) return;
      if (now - ref.lastTime < 50 && dist < 0.01) return;
      const t = now - ref.startTime;
      ref.lastTime = now;
      ref.lastX = x;
      ref.lastY = y;
      setPaths((prev) => {
        const key = recordPathMode && isStaticEditor ? ref.pathId : id;
        const existing = prev[key] ?? [];
        return { ...prev, [key]: [...existing, { x, y, t }] };
      });
    },
    onDragEnd: (id) => {
      const element = elements.find((el) => el.id === id);
      const isRecordable =
        element?.type === "player" || element?.type === "ball";
      if (recordMode) {
        const seq = sequenceDragRef.current;
        if (seq && seq.points.length >= 2 && isRecordable) {
          const totalDist = seq.points.reduce((sum, point, index) => {
            if (index === 0) return 0;
            const prev = seq.points[index - 1];
            return sum + Math.hypot(point.x - prev.x, point.y - prev.y);
          }, 0);
          if (totalDist >= 0.01) {
            const isBall = element?.type === "ball";
            const attachedBallIds = getAttachedBallIdsForPlayer(seq.id);
            const isCarry = !isBall && attachedBallIds.length > 0;
            const durationMs = seq.points[seq.points.length - 1].t || 1200;
            appendStroke({
              id: buildId(),
              kind: isCarry ? "carry" : "move",
              elementId: seq.id,
              ballIds: isCarry ? attachedBallIds : undefined,
              points: seq.points.map((point) => ({
                x: point.x,
                y: point.y,
              })),
              style: {
                arrow: true,
                dashed: isBall,
                width: isCarry ? 2.6 : 1.5,
                variant: isCarry ? "carry" : isBall ? "ball" : "move",
              },
              durationMs,
            });
          }
        }
        sequenceDragRef.current = null;
      }

      if (recordPathMode) {
        const pathId = pathRecordRef.current?.pathId;
        pathRecordRef.current = null;
        if (isStaticEditor && pathId && (paths[pathId]?.length ?? 0) >= 2) {
          const preview = renderTrajectoryPreview(pathId);
          if (preview) {
            setTrajectoryPreviews((prev) => ({ ...prev, [pathId]: preview }));
          }
        }
      } else {
        pathRecordRef.current = null;
      }
    },
      onElementClick: () => {
        setShowSelectionToolbar(true);
        setShowRotateHandle(true);
      },
    },
    { showRotateHandle, showResizeHandle: !previewMode && !recordMode },
  );

  const player = useExerciseAnimationPlayer(
    elements,
    frames,
    paths,
    animationMode === "video" ? strokes : [],
    animationMode === "video" ? strokesBase : null,
    ballAttachments,
    actionSpeedMultipliers,
    frameSpeedMultipliers,
  );
  const [runnerSpriteReady, setRunnerSpriteReady] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let mounted = true;
    const preload = (variant: "runner" | "runner_noball") => {
      const entry = runnerSprites[variant];
      if (!entry.img) {
        entry.img = new Image();
        entry.img.src = entry.src;
      }
      if (entry.ready) return () => {};
      const handleLoad = () => {
        entry.ready = true;
        if (mounted) setRunnerSpriteReady((value) => value + 1);
      };
      entry.img.addEventListener("load", handleLoad);
      return () => entry.img?.removeEventListener("load", handleLoad);
    };
    const cleanups = [preload("runner"), preload("runner_noball")];
    return () => {
      mounted = false;
      cleanups.forEach((cleanup) => cleanup?.());
    };
  }, []);

  const getCurrentPitchRect = () =>
    getPitchRect(
      canvasSize.w,
      canvasSize.h,
      orientationRef.current ?? undefined,
    );

  const pitchRectForUI = useMemo(
    () => getCurrentPitchRect(),
    [canvasSize.w, canvasSize.h],
  );

  const selectedElement = useMemo(
    () => elements.find((el) => el.id === selectedId) ?? null,
    [elements, selectedId],
  );
  const trajectoryIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    trajectoryOrder.forEach((id, index) => {
      map.set(id, index + 1);
    });
    return map;
  }, [trajectoryOrder]);
  const trajectoryStyleResolver = useCallback(
    (id: string) => {
      const elementId = pathElementMap[id] ?? id;
      const element = elements.find((el) => el.id === elementId);
      if (!element) return null;
      if (element.type === "ball") {
        return {
          color: pathColorMap[elementId] ?? TRAJECTORY_COLORS.ball,
          width: 1.4,
          dashed: true,
          number: trajectoryIndexMap.get(id) ?? null,
        };
      }
      if (element.type === "player") {
        const fallbackColor =
          element.playerStyle === "runner"
            ? TRAJECTORY_COLORS.runner
            : element.playerStyle === "runner_noball"
              ? TRAJECTORY_COLORS.runnerNoBall
              : TRAJECTORY_COLORS.classic;
        const color = pathColorMap[elementId] ?? fallbackColor;
        return {
          color,
          width: 1.6,
          dashed: false,
          number: trajectoryIndexMap.get(id) ?? null,
        };
      }
      return {
        color: pathColorMap[elementId] ?? "rgba(148, 163, 184, 0.55)",
        width: 1.2,
        dashed: false,
        number: trajectoryIndexMap.get(id) ?? null,
      };
    },
    [elements, pathColorMap, pathElementMap, trajectoryIndexMap],
  );

  useEffect(() => {
    if (!isStaticEditor) return;
    setTrajectoryPreviews((prev) => {
      const allowed = new Set(trajectoryOrder);
      let changed = false;
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([id, value]) => {
        if (!allowed.has(id)) {
          changed = true;
          return;
        }
        next[id] = value;
      });
      return changed ? next : prev;
    });
  }, [isStaticEditor, trajectoryOrder]);

  useEffect(() => {
    if (!isStaticEditor) return;
    if (pathRecordRef.current) return;
    const missing = trajectoryOrder.filter(
      (id) => !trajectoryPreviews[id] && (paths[id]?.length ?? 0) >= 2,
    );
    if (missing.length === 0) return;
    const updates: Record<string, string> = {};
    missing.forEach((id) => {
      const preview = renderTrajectoryPreview(id);
      if (preview) {
        updates[id] = preview;
      }
    });
    if (Object.keys(updates).length > 0) {
      setTrajectoryPreviews((prev) => ({ ...prev, ...updates }));
    }
  }, [
    isStaticEditor,
    trajectoryOrder,
    paths,
    elements,
    pathElementMap,
    pathColorMap,
    trajectoryPreviews,
  ]);

  const pencilPosition = useMemo(() => {
    if (!selectedElement) return null;
    const pitchRect = pitchRectForUI;
    const x = pitchRect.x + selectedElement.x * pitchRect.w;
    const y = pitchRect.y + selectedElement.y * pitchRect.h;
    const radius =
      getRenderSize(
        selectedElement.type,
        selectedElement.size ?? getDefaultSize(selectedElement.type),
      ) * pitchRect.w;
    const offset = Math.max(32, radius + 18);
    const targetY = y - offset;
    const minX = pitchRect.x + 16;
    const maxX = pitchRect.x + pitchRect.w - 16;
    const minY = pitchRect.y + 16;
    const maxY = pitchRect.y + pitchRect.h - 16;
    const clampedX = Math.min(maxX, Math.max(minX, x));
    const clampedY = Math.min(maxY, Math.max(minY, targetY));
    return { x: clampedX, y: clampedY };
  }, [pitchRectForUI, selectedElement]);
  const selectionToolbarPosition = useMemo(() => {
    if (!selectedElement) return null;
    const pitchRect = pitchRectForUI;
    const x = pitchRect.x + pitchRect.w / 2;
    const y = pitchRect.y + pitchRect.h - 128;
    const minX = pitchRect.x + 24;
    const maxX = pitchRect.x + pitchRect.w - 24;
    const minY = pitchRect.y + 24;
    const maxY = pitchRect.y + pitchRect.h - 24;
    const clampedX = Math.min(maxX, Math.max(minX, x));
    const clampedY = Math.min(maxY, Math.max(minY, y));
    return { x: clampedX, y: clampedY };
  }, [pitchRectForUI, selectedElement]);
  const sideToolbarPosition = useMemo(() => {
    const pitchRect = pitchRectForUI;
    return {
      x: 6,
      y: pitchRect.y + pitchRect.h / 2,
    };
  }, [pitchRectForUI]);
  const selectedStroke = useMemo(() => {
    if (selectedStrokeId) {
      return strokes.find((stroke) => stroke.id === selectedStrokeId) ?? null;
    }
    if (!selectedElement) return null;
    for (let i = strokes.length - 1; i >= 0; i -= 1) {
      if (strokes[i].elementId === selectedElement.id) return strokes[i];
    }
    return null;
  }, [selectedElement, selectedStrokeId, strokes]);
  useEffect(() => {
    setShowRotateHandle(false);
    setHoveredHandle(null);
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId) {
      setShowSelectionToolbar(false);
    }
  }, [selectedId]);
  useEffect(() => {
    if (selectedId) {
      setShowRotateHandle(true);
    }
  }, [selectedId]);
  const playerElements = useMemo(
    () => elements.filter((el) => el.type === "player"),
    [elements],
  );
  const toolboxToolActive = useMemo(
    () =>
      [
        "cone",
        "disc",
        "hoop",
        "baton",
        "slalom_pole",
        "hurdle_bar",
        "hurdle_pole",
        "mini_goal",
        "ladder",
        "pass_wall",
      ].includes(tool),
    [tool],
  );
  const shapeToolActive = useMemo(() => isShapeTool(tool), [tool]);
  const ballElements = useMemo(
    () => elements.filter((el) => el.type === "ball"),
    [elements],
  );
  const hasPlayableContent = useMemo(() => {
    if (animationMode === "video" && strokes.length > 0) return true;
    if (frames.length >= 2) return true;
    return Object.values(paths).some((points) => points.length >= 2);
  }, [animationMode, strokes.length, frames.length, paths]);
  const canUndo = historyIndex > 0;
  const canRedo =
    historyIndex >= 0 && historyIndex < historyRef.current.length - 1;
  const speedSteps = [1, 2, 3];
  const getNextSpeed = (current: number) => {
    const index = speedSteps.indexOf(current);
    if (index === -1 || index === speedSteps.length - 1) return speedSteps[0];
    return speedSteps[index + 1];
  };
  const actionSequenceList = useMemo(() => {
    const set = new Set<number>();
    strokes.forEach((stroke) => {
      set.add(getStrokeSequenceIndex(stroke));
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [strokes]);
  const getAttachedBallIdsForPlayer = (playerId: string) =>
    Object.entries(ballAttachments)
      .filter(([, id]) => id === playerId)
      .map(([ballId]) => ballId);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    strokesBaseRef.current = strokesBase;
  }, [strokesBase]);

  useEffect(() => {
    if (selectedElement?.type === "ball") {
      setAssociationTargetPlayerId(playerElements[0]?.id ?? null);
    }
    if (selectedElement?.type === "player") {
      setAssociationTargetBallId(ballElements[0]?.id ?? null);
    }
  }, [selectedElement, playerElements, ballElements]);

  useEffect(() => {
    if (Object.keys(ballAttachments).length > 0) {
      lastBallAttachmentsRef.current = ballAttachments;
    }
  }, [ballAttachments]);

  useEffect(() => {
    if (!prevRecordModeRef.current && recordMode) {
      if (Object.keys(ballAttachments).length === 0) {
        const fallback = lastBallAttachmentsRef.current;
        if (Object.keys(fallback).length > 0) {
          setBallAttachments(fallback);
        }
      }
    }
    prevRecordModeRef.current = recordMode;
  }, [recordMode, ballAttachments]);

  useEffect(() => {
    if (!selectedStrokeId) return;
    const stroke = strokes.find((item) => item.id === selectedStrokeId);
    if (!stroke || (selectedElement && stroke.elementId !== selectedElement.id)) {
      setSelectedStrokeId(null);
    }
  }, [selectedStrokeId, selectedElement, strokes]);

  useEffect(() => {
    if (previewMode || animationMode !== "video") {
      setSequenceEditor(null);
    }
  }, [previewMode, animationMode]);
  useEffect(() => {
    setShowSpeedPanel(false);
  }, [animationMode]);

  const showToast = (kind: "success" | "error", message: string) => {
    setToast({ kind, message });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3200);
  };

  useEffect(() => {
    if (!editError) return;
    showToast("error", editError);
  }, [editError]);

  const buildSnapshot = (): EditorSnapshot =>
    cloneData({
      elements,
      frames,
      paths,
      pathElementMap,
      trajectoryOrder,
      pathColorMap,
      strokes,
      strokesBase,
      ballAttachments,
      activeFrameId,
    });

  const pushHistory = (snapshot: EditorSnapshot) => {
    const signature = JSON.stringify(snapshot);
    if (signature === lastSnapshotRef.current) return;
    const next = historyRef.current.slice(0, historyIndexRef.current + 1);
    next.push(snapshot);
    historyRef.current = next;
    historyIndexRef.current = next.length - 1;
    setHistoryIndex(historyIndexRef.current);
    lastSnapshotRef.current = signature;
  };

  const restoreSnapshot = (snapshot: EditorSnapshot) => {
    isRestoringHistoryRef.current = true;
    setElements(snapshot.elements);
    setFrames(snapshot.frames);
    setPaths(snapshot.paths);
    setPathElementMap(snapshot.pathElementMap ?? {});
    setTrajectoryOrder(snapshot.trajectoryOrder ?? []);
    setPathColorMap(snapshot.pathColorMap ?? {});
    pathCounterRef.current = (snapshot.trajectoryOrder ?? []).length;
    setStrokes(snapshot.strokes);
    strokesRef.current = snapshot.strokes;
    setStrokesBase(snapshot.strokesBase);
    strokesBaseRef.current = snapshot.strokesBase;
    setBallAttachments(snapshot.ballAttachments ?? {});
    setActiveFrameId(snapshot.activeFrameId);
    setSelectedId(null);
    setSelectedStrokeId(null);
    setSequenceEditor(null);
    lastSnapshotRef.current = JSON.stringify(snapshot);
    window.setTimeout(() => {
      isRestoringHistoryRef.current = false;
    }, 0);
  };

  const undo = () => {
    if (historyIndexRef.current <= 0) return;
    const nextIndex = historyIndexRef.current - 1;
    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    restoreSnapshot(historyRef.current[nextIndex]);
  };

  const redo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    const nextIndex = historyIndexRef.current + 1;
    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    restoreSnapshot(historyRef.current[nextIndex]);
  };

  useEffect(() => {
    if (isRestoringHistoryRef.current) return;
    if (historyTimerRef.current) {
      window.clearTimeout(historyTimerRef.current);
    }
    historyTimerRef.current = window.setTimeout(() => {
      pushHistory(buildSnapshot());
    }, 260);
    return () => {
      if (historyTimerRef.current) {
        window.clearTimeout(historyTimerRef.current);
      }
    };
  }, [elements, frames, paths, strokes, strokesBase, ballAttachments, activeFrameId]);

  const updateStrokeSequenceIndex = (strokeId: string, nextValue: number) => {
    const next = Math.max(1, Math.floor(nextValue || 1));
    setStrokes((prev) =>
      prev.map((stroke) =>
        stroke.id === strokeId
          ? { ...stroke, sequenceIndex: next, phaseId: Math.max(0, next - 1) }
          : stroke,
      ),
    );
  };

  const appendStroke = (stroke: Omit<Stroke, "order" | "phaseId" | "sequenceIndex">) => {
    if (!strokesBaseRef.current) {
      const snapshot: BaseSnapshot = {};
      elements.forEach((el) => {
        snapshot[el.id] = { x: el.x, y: el.y };
      });
      strokesBaseRef.current = snapshot;
      setStrokesBase(snapshot);
    }
    const prev = strokesRef.current;
    const lastStroke = prev[prev.length - 1];
    const nextSequenceIndex = groupMode
      ? getStrokeSequenceIndex(lastStroke ?? { sequenceIndex: 1 })
      : Math.max(1, currentSequenceIndex);
    const variant = stroke.style?.variant ?? stroke.kind;
    const isBallStroke = variant === "ball";
    const simplifiedPoints = isBallStroke
      ? simplifyStrokePoints(
          stroke.points,
          0.015,
          14,
          1.03,
          0.45,
        )
      : stroke.points;
    const next = [
      ...prev,
      {
        ...stroke,
        points: simplifiedPoints,
        order: prev.length + 1,
        phaseId: Math.max(0, nextSequenceIndex - 1),
        sequenceIndex: nextSequenceIndex,
      },
    ];
    strokesRef.current = next;
    setStrokes(next);
    if (!groupMode) {
      setCurrentSequenceIndex((value) => value + 1);
    }
  };

  const attachBallToPlayer = (playerId: string, ballId?: string | null) => {
    const ball = ballElements.find((el) => el.id === ballId) ?? ballElements[0];
    const player = playerElements.find((el) => el.id === playerId);
    if (!ball || !player) {
      showToast("error", "Ajoute un ballon et un joueur.");
      return;
    }
    setBallAttachments((prev) => ({ ...prev, [ball.id]: playerId }));
    updateElement(ball.id, {
      x: clamp01(player.x + 0.015),
      y: clamp01(player.y + 0.01),
    });
  };

  const detachBall = (ballId?: string | null) => {
    if (!ballId) {
      setBallAttachments({});
      return;
    }
    setBallAttachments((prev) => {
      if (!prev[ballId]) return prev;
      const next = { ...prev };
      delete next[ballId];
      return next;
    });
  };

  const cycleActionSpeed = (sequenceIndex: number) => {
    setActionSpeedMultipliers((prev) => {
      const current = prev[sequenceIndex] ?? 1;
      const next = getNextSpeed(current);
      return { ...prev, [sequenceIndex]: next };
    });
  };

  const cycleFrameSpeed = (frameId: string) => {
    setFrameSpeedMultipliers((prev) => {
      const current = prev[frameId] ?? 1;
      const next = getNextSpeed(current);
      return { ...prev, [frameId]: next };
    });
  };

  useEffect(() => {
    const resize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setCanvasSize({ w: rect.width, h: rect.height });
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const renderToolIcon = (
    canvas: HTMLCanvasElement | null,
    size: number,
    renderer: (ctx: CanvasRenderingContext2D, size: number) => void,
  ) => {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    renderer(ctx, size);
  };

  const rotatePointCW = (point: { x: number; y: number }) => ({
    x: clamp01(1 - point.y),
    y: clamp01(point.x),
  });

  const rotatePointCCW = (point: { x: number; y: number }) => ({
    x: clamp01(point.y),
    y: clamp01(1 - point.x),
  });

  const rotateAllDataPositions = (direction: "cw" | "ccw") => {
    const rotate = direction === "cw" ? rotatePointCW : rotatePointCCW;

    setElements((prev) =>
      prev.map((el) => {
        const next = rotate({ x: el.x, y: el.y });
        return { ...el, x: next.x, y: next.y };
      }),
    );

    setFrames((prev) =>
      prev.map((frame) => ({
        ...frame,
        elementsSnapshot: frame.elementsSnapshot.map((snap) => {
          const next = rotate({ x: snap.x, y: snap.y });
          return { ...snap, x: next.x, y: next.y };
        }),
      })),
    );

    setPaths((prev) => {
      const next: Record<string, PathPoint[]> = {};
      Object.entries(prev).forEach(([id, points]) => {
        next[id] = points.map((pt) => {
          const rotated = rotate({ x: pt.x, y: pt.y });
          return { ...pt, x: rotated.x, y: rotated.y };
        });
      });
      return next;
    });

    setStrokes((prev) =>
      prev.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((pt) => rotate(pt)),
      })),
    );

    setStrokesBase((prev) => {
      if (!prev) return prev;
      const next: BaseSnapshot = {};
      Object.entries(prev).forEach(([id, pos]) => {
        next[id] = rotate(pos);
      });
      return next;
    });

    setFramePreviews({});
    clearDrag();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStaticEditor && lockOrientationRef.current) return;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const isLandscape = viewportW > viewportH * 1.1;
    const nextOrientation: "landscape" | "portrait" = isLandscape
      ? "landscape"
      : "portrait";
    if (!orientationRef.current) {
      orientationRef.current = nextOrientation;
      return;
    }
    if (orientationRef.current !== nextOrientation) {
      rotateAllDataPositions(nextOrientation === "landscape" ? "cw" : "ccw");
      orientationRef.current = nextOrientation;
    }
  }, [canvasSize.w, canvasSize.h]);


  useEffect(() => {
    // no-op: sprite preloading removed (canvas draw for discs is procedural)
  }, []);

  useEffect(() => {
    if (!showToolboxMenu) return;
    const handler = (event: MouseEvent) => {
      if (!toolboxMenuRef.current) return;
      if (!toolboxMenuRef.current.contains(event.target as Node)) {
        setShowToolboxMenu(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [showToolboxMenu]);

  useEffect(() => {
    if (!showShapeMenu) return;
    const handler = (event: MouseEvent) => {
      if (!shapeMenuRef.current) return;
      if (!shapeMenuRef.current.contains(event.target as Node)) {
        setShowShapeMenu(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [showShapeMenu]);

  useEffect(() => {
    if (!showColorMenu) return;
    const handler = (event: MouseEvent) => {
      if (!colorMenuRef.current) return;
      if (!colorMenuRef.current.contains(event.target as Node)) {
        setShowColorMenu(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [showColorMenu]);

  useEffect(() => {
    if (!showElementColorMenu) return;
    const handler = (event: MouseEvent) => {
      if (!elementColorMenuRef.current) return;
      if (!elementColorMenuRef.current.contains(event.target as Node)) {
        setShowElementColorMenu(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [showElementColorMenu]);

  useEffect(() => {
    setShowElementColorMenu(false);
  }, [selectedElement?.id]);

  useEffect(() => {
    if (!showSettingsMenu) return;
    const handler = (event: MouseEvent) => {
      if (!settingsMenuRef.current) return;
      if (!settingsMenuRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [showSettingsMenu]);

  useEffect(() => {
    return () => {
      if (captureTimerRef.current) {
        window.clearTimeout(captureTimerRef.current);
      }
    };
  }, []);

  const triggerCapturePulse = () => {
    setCapturePulse(true);
    if (captureTimerRef.current) {
      window.clearTimeout(captureTimerRef.current);
    }
    captureTimerRef.current = window.setTimeout(() => {
      setCapturePulse(false);
    }, 700);
  };

  const toggleTool = (next: ToolKey) => {
    setTool((prev) => {
      if (next === "select") return "select";
      return prev === next ? "select" : next;
    });
  };

  const openSequenceEditor = (stroke: Stroke, clientX: number, clientY: number) => {
    const bounds = viewportRef.current?.getBoundingClientRect();
    const x = bounds ? clientX - bounds.left : clientX;
    const y = bounds ? clientY - bounds.top : clientY;
    setSelectedStrokeId(stroke.id);
    if (stroke.elementId) {
      setSelectedId(stroke.elementId);
    }
    setShowSidePanel(true);
    setSequenceEditor({
      strokeId: stroke.id,
      x,
      y,
    });
    setSequenceEditorValue(String(getStrokeSequenceIndex(stroke)));
  };

  const findStrokeBadgeHit = (
    clientX: number,
    clientY: number,
  ): Stroke | null => {
    if (strokes.length === 0) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const pitchRect = getCurrentPitchRect();
    for (let i = strokes.length - 1; i >= 0; i -= 1) {
      const stroke = strokes[i];
      const first = stroke.points[0];
      if (!first) continue;
      const sx = pitchRect.x + first.x * pitchRect.w;
      const sy = pitchRect.y + first.y * pitchRect.h;
      if (Math.hypot(localX - sx, localY - sy) <= 12) {
        return stroke;
      }
    }
    return null;
  };

  const handleCanvasPointerDown = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (previewMode) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const pitchRect = getCurrentPitchRect();
    const hitId = hitTest(elements, point, pitchRect);
    const rotateHitRadius = 18;
    const resizeHitRadius = 12;
    let hitHandle: "rotate" | "resize" | null = null;
    if (selectedElement) {
      if (showRotateHandle) {
        const handle = getElementHandlePosition(
          selectedElement,
          pitchRect,
          true,
        );
        if (handle) {
          const handleDistance = Math.hypot(
            point.x - handle.x,
            point.y - handle.y,
          );
          if (handleDistance < rotateHitRadius) {
            hitHandle = "rotate";
          }
        }
      }
      if (!hitHandle && !previewMode && !recordMode) {
        const resizeHandle = getResizeHandlePosition(
          selectedElement,
          pitchRect,
          true,
        );
        if (resizeHandle) {
          const handleDistance = Math.hypot(
            point.x - resizeHandle.x,
            point.y - resizeHandle.y,
          );
          if (handleDistance < resizeHitRadius) {
            hitHandle = "resize";
          }
        }
      }
    }
    if (hitHandle && selectedElement) {
      setHoveredHandle({ id: selectedElement.id, type: hitHandle });
    }
    if (!hitId && !hitHandle) {
      if (selectedId || showSelectionToolbar || showRotateHandle) {
        setShowSelectionToolbar(false);
        setShowRotateHandle(false);
        setHoveredHandle(null);
        setSelectedId(null);
        if (tool === "select") {
          return;
        }
      }
    }
    if (showSidePanel) {
      setShowSidePanel(false);
      setShowElementColorMenu(false);
      return;
    }
    if (animationMode === "video") {
      const hit = findStrokeBadgeHit(event.clientX, event.clientY);
      if (hit) {
        event.preventDefault();
        event.stopPropagation();
        openSequenceEditor(hit, event.clientX, event.clientY);
        return;
      }
    }
    handlePointerDown(event);
  };

  const handleCanvasPointerMove = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (previewMode) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const pitchRect = getCurrentPitchRect();
    const rotateHitRadius = 18;
    const resizeHitRadius = 12;
    let nextHover: { id: string; type: "rotate" | "resize" } | null = null;
    if (selectedElement) {
      if (showRotateHandle) {
        const handle = getElementHandlePosition(
          selectedElement,
          pitchRect,
          true,
        );
        if (handle) {
          const dist = Math.hypot(point.x - handle.x, point.y - handle.y);
          if (dist < rotateHitRadius) {
            nextHover = { id: selectedElement.id, type: "rotate" };
          }
        }
      }
      if (!nextHover && !previewMode && !recordMode) {
        const handle = getResizeHandlePosition(
          selectedElement,
          pitchRect,
          true,
        );
        if (handle) {
          const dist = Math.hypot(point.x - handle.x, point.y - handle.y);
          if (dist < resizeHitRadius) {
            nextHover = { id: selectedElement.id, type: "resize" };
          }
        }
      }
    }
    if (
      nextHover?.id !== hoveredHandle?.id ||
      nextHover?.type !== hoveredHandle?.type
    ) {
      setHoveredHandle(nextHover);
    }
    handlePointerMove(event);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.w * dpr;
    canvas.height = canvasSize.h * dpr;
    ctx.scale(dpr, dpr);
    const pitchRect = getCurrentPitchRect();
    setPitchRect(pitchRect);
    drawPitch(
      ctx,
      canvasSize.w,
      canvasSize.h,
      pitchPreset,
      orientationRef.current ?? undefined,
      isStaticEditor ? "dark-textured" : "default",
    );
    drawElements(
      ctx,
      player.animatedElements,
      selectedId,
      pitchRect,
      paths,
      strokes,
      ballAttachments,
      snapTargetId,
      {
        showOverlays: !previewMode,
        showLabels: !previewMode,
        showSequenceNumbers: animationMode === "video" && !previewMode,
        showRotateHandle: showRotateHandle,
        showResizeHandle: !previewMode && !recordMode,
        hoveredHandle,
        pathStyleResolver: isStaticEditor ? trajectoryStyleResolver : undefined,
        showPathGhosts: isStaticEditor && Object.keys(paths).length > 0,
        pathUseFootOffset: !isStaticEditor,
        pathElementMap: isStaticEditor ? pathElementMap : undefined,
      },
    );
  }, [
    canvasSize,
    elements,
    selectedId,
    player.animatedElements,
    pitchPreset,
    setPitchRect,
    paths,
    strokes,
    ballAttachments,
    snapTargetId,
    previewMode,
    animationMode,
    showRotateHandle,
    recordMode,
    hoveredHandle,
    runnerSpriteReady,
    trajectoryStyleResolver,
    pathElementMap,
  ]);

  useEffect(() => {
    renderToolIcon(playerIconRef.current, 40, (ctx, s) => {
      drawPlayerBodyHead(
        ctx,
        s / 2,
        s / 2,
        s * 0.4,
        playerColor ?? "#7B66FF",
        "10",
        false,
        false,
        false,
      );
    });

    renderToolIcon(discIconRef.current, 28, (ctx, s) => {
      drawCupDisc(ctx, s / 2, s / 2, s * 0.33, playerColor ?? "#FF6F91", false);
    });

    renderToolIcon(plotIconRef.current, 32, (ctx, s) => {
      drawPlotIso(
        ctx,
        s / 2,
        s / 2 + s * 0.12,
        s * 0.32,
        playerColor ?? "#F8C12C",
        false,
      );
    });

    renderToolIcon(slalomPoleIconRef.current, 30, (ctx, s) => {
      drawSlalomPole(ctx, s / 2, s * 0.72, s * 0.18, playerColor ?? "#6A5CFF", false);
    });

    renderToolIcon(hurdleBarIconRef.current, 34, (ctx, s) => {
      drawHurdleBar(ctx, s / 2, s * 0.72, s * 0.18, playerColor ?? "#7B66FF", false);
    });

    renderToolIcon(hurdlePoleIconRef.current, 34, (ctx, s) => {
      drawHurdlePole(ctx, s / 2, s * 0.6, s * 0.2, playerColor ?? "#7B66FF", false);
    });

    renderToolIcon(ladderIconRef.current, 34, (ctx, s) => {
      drawLadder(ctx, s / 2, s / 2, s * 0.7, playerColor ?? "#7B66FF", false);
    });

    renderToolIcon(toolboxDiscIconRef.current, 20, (ctx, s) => {
      drawCupDisc(ctx, s / 2, s / 2, s * 0.33, playerColor ?? "#FF6F91", false);
    });

    renderToolIcon(toolboxPoleIconRef.current, 20, (ctx, s) => {
      drawSlalomPole(ctx, s / 2, s * 0.72, s * 0.18, playerColor ?? "#6A5CFF", false);
    });

    renderToolIcon(discMenuIconRef.current, 26, (ctx, s) => {
      drawCupDisc(ctx, s / 2, s / 2, s * 0.33, playerColor ?? "#FF6F91", false);
    });

    renderToolIcon(plotMenuIconRef.current, 28, (ctx, s) => {
      drawPlotIso(
        ctx,
        s / 2,
        s / 2 + s * 0.12,
        s * 0.32,
        playerColor ?? "#F8C12C",
        false,
      );
    });

    renderToolIcon(slalomMenuIconRef.current, 26, (ctx, s) => {
      drawSlalomPole(ctx, s / 2, s * 0.72, s * 0.18, playerColor ?? "#6A5CFF", false);
    });

    renderToolIcon(hurdleBarMenuIconRef.current, 30, (ctx, s) => {
      drawHurdleBar(ctx, s / 2, s * 0.72, s * 0.18, playerColor ?? "#7B66FF", false);
    });

    renderToolIcon(hurdlePoleMenuIconRef.current, 30, (ctx, s) => {
      drawHurdlePole(ctx, s / 2, s * 0.6, s * 0.2, playerColor ?? "#7B66FF", false);
    });

    renderToolIcon(ladderMenuIconRef.current, 30, (ctx, s) => {
      drawLadder(ctx, s / 2, s / 2, s * 0.7, playerColor ?? "#7B66FF", false);
    });

    renderToolIcon(hoopMenuIconRef.current, 26, (ctx, s) => {
      drawHoop(ctx, s / 2, s / 2, s * 0.22, playerColor ?? "#7B66FF", false);
    });

    renderToolIcon(batonMenuIconRef.current, 26, (ctx, s) => {
      drawBaton(ctx, s / 2, s / 2, s * 0.22, playerColor ?? "#7B66FF", false);
    });
  }, [playerColor, showToolboxMenu, showShapeMenu, previewMode, animationMode, recordMode]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        deleteSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deleteSelected]);

  const handleAddFrame = () => {
    const snapshot = elements.map((el) => ({ id: el.id, x: el.x, y: el.y }));
    const newFrame: FrameSnapshot = { id: buildId(), elementsSnapshot: snapshot };
    setFrames((prev) => [...prev, newFrame]);
    setActiveFrameId(newFrame.id);
    const preview = renderFramePreview(newFrame.elementsSnapshot);
    if (preview) {
      setFramePreviews((prev) => ({ ...prev, [newFrame.id]: preview }));
    }
  };

  const handleDuplicateFrame = () => {
    if (!activeFrameId) return;
    const index = frames.findIndex((frame) => frame.id === activeFrameId);
    if (index === -1) return;
    const source = frames[index];
    const clone: FrameSnapshot = {
      id: buildId(),
      elementsSnapshot: source.elementsSnapshot.map((snap) => ({
        id: snap.id,
        x: snap.x,
        y: snap.y,
      })),
    };
    setFrames((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, clone);
      return next;
    });
    setActiveFrameId(clone.id);
    setFramePreviews((prev) => {
      const existing = prev[source.id];
      if (existing) {
        return { ...prev, [clone.id]: existing };
      }
      const preview = renderFramePreview(clone.elementsSnapshot);
      return preview ? { ...prev, [clone.id]: preview } : prev;
    });
  };

  const handleReplaceFrame = () => {
    if (!activeFrameId) return;
    const snapshot = elements.map((el) => ({ id: el.id, x: el.x, y: el.y }));
    setFrames((prev) =>
      prev.map((frame) =>
        frame.id === activeFrameId
          ? { ...frame, elementsSnapshot: snapshot }
          : frame,
      ),
    );
    const preview = renderFramePreview(snapshot);
    if (preview) {
      setFramePreviews((prev) => ({ ...prev, [activeFrameId]: preview }));
    }
  };

  const moveFrame = (frameId: string, direction: -1 | 1) => {
    setFrames((prev) => {
      const index = prev.findIndex((frame) => frame.id === frameId);
      if (index === -1) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  const clearPathForSelected = () => {
    if (!selectedId) return;
    const hasStroke = strokes.some((stroke) => stroke.elementId === selectedId);
    if (hasStroke) {
      setStrokes((prev) => {
        const next = prev.filter((stroke) => stroke.elementId !== selectedId);
        strokesRef.current = next;
        return next;
      });
    }
    setPaths((prev) => {
      const next = { ...prev };
      delete next[selectedId];
      return next;
    });
    showToast("success", "Tracé supprimé.");
  };

  const smoothPath = (points: PathPoint[], iterations = 3) => {
    if (points.length < 3) return points;
    let current = points;
    for (let iter = 0; iter < iterations; iter += 1) {
      const next: PathPoint[] = [];
      next.push(current[0]);
      for (let i = 0; i < current.length - 1; i += 1) {
        const p0 = current[i];
        const p1 = current[i + 1];
        // Chaikin-like smoothing, keep time interpolation aligned.
        const q: PathPoint = {
          x: p0.x * 0.75 + p1.x * 0.25,
          y: p0.y * 0.75 + p1.y * 0.25,
          t: p0.t * 0.75 + p1.t * 0.25,
        };
        const r: PathPoint = {
          x: p0.x * 0.25 + p1.x * 0.75,
          y: p0.y * 0.25 + p1.y * 0.75,
          t: p0.t * 0.25 + p1.t * 0.75,
        };
        next.push(q, r);
      }
      next.push(current[current.length - 1]);
      current = next;
    }
    return current;
  };

  const simplifyPath = (points: PathPoint[], maxPoints = 35) => {
    if (points.length <= maxPoints) {
      return smoothPath(points, 3);
    }
    const step = Math.ceil(points.length / maxPoints);
    const sampled = points.filter((_, index) => index % step === 0);
    if (sampled[sampled.length - 1]?.t !== points[points.length - 1]?.t) {
      sampled.push(points[points.length - 1]);
    }
    return smoothPath(sampled, 3);
  };

  const smoothStrokePoints = (
    points: Array<{ x: number; y: number }>,
    iterations = 3,
  ) => {
    if (points.length < 3) return points;
    let current = points;
    for (let iter = 0; iter < iterations; iter += 1) {
      const next: Array<{ x: number; y: number }> = [];
      next.push(current[0]);
      for (let i = 0; i < current.length - 1; i += 1) {
        const p0 = current[i];
        const p1 = current[i + 1];
        const q = {
          x: p0.x * 0.75 + p1.x * 0.25,
          y: p0.y * 0.75 + p1.y * 0.25,
        };
        const r = {
          x: p0.x * 0.25 + p1.x * 0.75,
          y: p0.y * 0.25 + p1.y * 0.75,
        };
        next.push(q, r);
      }
      next.push(current[current.length - 1]);
      current = next;
    }
    return current;
  };

  const rdpSimplify = (
    points: Array<{ x: number; y: number }>,
    epsilon: number,
  ): Array<{ x: number; y: number }> => {
    if (points.length < 3) return points;
    const start = points[0];
    const end = points[points.length - 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy || 1e-6;

    let maxDist = 0;
    let index = 0;
    for (let i = 1; i < points.length - 1; i += 1) {
      const p = points[i];
      const t = ((p.x - start.x) * dx + (p.y - start.y) * dy) / lenSq;
      const projX = start.x + t * dx;
      const projY = start.y + t * dy;
      const dist = Math.hypot(p.x - projX, p.y - projY);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }

    if (maxDist <= epsilon) {
      return [start, end];
    }
    const left = rdpSimplify(points.slice(0, index + 1), epsilon);
    const right = rdpSimplify(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  };

  const simplifyStrokePointsForSmoothing = (
    points: Array<{ x: number; y: number }>,
    maxPoints = 24,
  ) => {
    const reduced =
      points.length <= maxPoints ? points : rdpSimplify(points, 0.01);
    const step = Math.ceil(reduced.length / maxPoints);
    const sampled =
      reduced.length <= maxPoints
        ? reduced
        : reduced.filter((_, index) => index % step === 0);
    if (
      sampled.length &&
      (sampled[sampled.length - 1].x !== points[points.length - 1].x ||
        sampled[sampled.length - 1].y !== points[points.length - 1].y)
    ) {
      sampled.push(points[points.length - 1]);
    }
    return smoothStrokePoints(sampled, 2);
  };

  const applyStrokeSmoothing = (predicate?: (stroke: Stroke) => boolean) => {
    let changed = 0;
    let beforeTotal = 0;
    let afterTotal = 0;
    setStrokes((prev) => {
      const next = prev.map((stroke) => {
        if (predicate && !predicate(stroke)) return stroke;
        if (stroke.points.length < 3) return stroke;
        beforeTotal += stroke.points.length;
        const nextPoints = simplifyStrokePointsForSmoothing(stroke.points, 12);
        afterTotal += nextPoints.length;
        changed += 1;
        return { ...stroke, points: nextPoints };
      });
      strokesRef.current = next;
      return next;
    });
    if (changed > 0) {
      showToast(
        "success",
        `Tracé lissé (${changed}) ${beforeTotal}→${afterTotal}`,
      );
    } else {
      showToast("error", "Aucun tracé à lisser.");
    }
  };

  const renderFramePreview = (snapshot: FrameSnapshot["elementsSnapshot"]) => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    const width = 220;
    const height = 130;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const pitchRect = drawPitch(
      ctx,
      width,
      height,
      pitchPreset,
      orientationRef.current ?? undefined,
    );
    const elementsForFrame = elements.map((el) => {
      const snap = snapshot.find((item) => item.id === el.id);
      return snap ? { ...el, x: snap.x, y: snap.y } : el;
    });
    drawElements(ctx, elementsForFrame, null, pitchRect, {}, [], {}, null, {
      showOverlays: false,
      showLabels: false,
      showRotateHandle: false,
      showResizeHandle: false,
    });
    return canvas.toDataURL("image/png");
  };

  const renderTrajectoryPreview = (pathId: string) => {
    if (typeof document === "undefined") return null;
    const points = paths[pathId];
    if (!points || points.length < 2) return null;
    const canvas = document.createElement("canvas");
    const width = 220;
    const height = 130;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const pitchRect = drawPitch(
      ctx,
      width,
      height,
      pitchPreset,
      orientationRef.current ?? undefined,
    );
    drawElements(
      ctx,
      elements,
      null,
      pitchRect,
      { [pathId]: points },
      [],
      ballAttachments,
      null,
      {
        showOverlays: true,
        showLabels: false,
        showRotateHandle: false,
        showResizeHandle: false,
        pathStyleResolver: trajectoryStyleResolver,
        showPathGhosts: false,
        pathElementMap,
      },
    );
    return canvas.toDataURL("image/png");
  };

  const buildVideoPreviewFrames = () => {
    if (typeof document === "undefined") return [];
    if (strokes.length === 0) return [];
    const width = 320;
    const height = 180;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];

    const grouped = new Map<number, Stroke[]>();
    strokes.forEach((stroke) => {
      const sequenceIndex = getStrokeSequenceIndex(stroke);
      if (!grouped.has(sequenceIndex)) grouped.set(sequenceIndex, []);
      grouped.get(sequenceIndex)?.push(stroke);
    });
    const phases = Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([sequenceIndex, items]) => ({
        id: sequenceIndex,
        strokes: items,
        duration: Math.max(
          1,
          ...items.map((item) => {
            const speed = actionSpeedMultipliers[sequenceIndex] ?? 1;
            return (item.durationMs || 1) / Math.max(0.25, speed);
          }),
        ),
      }));
    const totalDuration = phases.reduce(
      (sum, phase) => sum + (phase.duration || 0),
      0,
    );
    if (totalDuration <= 0) return [];

    const getPointAlong = (
      points: Array<{ x: number; y: number }>,
      t: number,
    ) => {
      if (points.length <= 1) return points[0] ?? { x: 0, y: 0 };
      const lengths: number[] = [];
      let total = 0;
      for (let i = 1; i < points.length; i += 1) {
        const dist = Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].y - points[i - 1].y,
        );
        lengths.push(dist);
        total += dist;
      }
      if (total === 0) return points[points.length - 1];
      const target = total * t;
      let acc = 0;
      for (let i = 0; i < lengths.length; i += 1) {
        if (acc + lengths[i] >= target) {
          const ratio = (target - acc) / Math.max(1e-6, lengths[i]);
          return {
            x: points[i].x + (points[i + 1].x - points[i].x) * ratio,
            y: points[i].y + (points[i + 1].y - points[i].y) * ratio,
          };
        }
        acc += lengths[i];
      }
      return points[points.length - 1];
    };

    const samples = Math.min(
      36,
      Math.max(18, Math.round(totalDuration / 120)),
    );
    const previews: string[] = [];
    for (let i = 0; i < samples; i += 1) {
      const time = totalDuration * (i / Math.max(1, samples - 1));
      const local = time % totalDuration;
      let elapsed = 0;
      let currentPhaseIndex = 0;
      for (let p = 0; p < phases.length; p += 1) {
        const duration = Math.max(1, phases[p].duration || 0);
        if (local <= elapsed + duration) {
          currentPhaseIndex = p;
          break;
        }
        elapsed += duration;
      }
      const currentPhase = phases[currentPhaseIndex];
      const phaseDuration = Math.max(1, currentPhase.duration || 0);
      const phaseTime = Math.min(phaseDuration, Math.max(0, local - elapsed));

      const positions = new Map<string, { x: number; y: number }>();
      const base = strokesBase ?? {};
      elements.forEach((el) => {
        positions.set(el.id, base[el.id] ?? { x: el.x, y: el.y });
      });

      const ballsByPlayer = new Map<string, string[]>();
      Object.entries(ballAttachments ?? {}).forEach(([ballId, playerId]) => {
        if (!ballsByPlayer.has(playerId)) ballsByPlayer.set(playerId, []);
        ballsByPlayer.get(playerId)?.push(ballId);
      });
      const getAttachedBalls = (playerId: string) =>
        ballsByPlayer.get(playerId) ?? [];
      const getCarryBallIds = (stroke: Stroke) =>
        stroke.ballIds && stroke.ballIds.length
          ? stroke.ballIds
          : stroke.elementId
          ? getAttachedBalls(stroke.elementId)
          : [];

      for (let p = 0; p < currentPhaseIndex; p += 1) {
        const phase = phases[p];
        phase.strokes.forEach((stroke) => {
          if (stroke.kind === "move" || stroke.kind === "carry") {
            const points = stroke.points;
            if (points.length >= 1 && stroke.elementId) {
              positions.set(stroke.elementId, {
                x: points[points.length - 1].x,
                y: points[points.length - 1].y,
              });
            }
            if (stroke.kind === "carry" && stroke.elementId) {
              const carried = positions.get(stroke.elementId);
              if (carried) {
                getCarryBallIds(stroke).forEach((attachedBallId) => {
                  positions.set(attachedBallId, {
                    x: carried.x + 0.015,
                    y: carried.y + 0.01,
                  });
                });
              }
            }
          }
        });
      }

      const animatedPositions = new Map(positions);
      currentPhase.strokes.forEach((stroke) => {
        if (!stroke.elementId || stroke.points.length < 2) return;
        const speed = actionSpeedMultipliers[currentPhase.id] ?? 1;
        const effectiveDuration =
          (stroke.durationMs || 0) / Math.max(0.25, speed);
        const t = Math.min(1, phaseTime / Math.max(1, effectiveDuration));
        const point = getPointAlong(stroke.points, t);
        animatedPositions.set(stroke.elementId, { x: point.x, y: point.y });
      });

      currentPhase.strokes.forEach((stroke) => {
        if (stroke.kind !== "carry" || !stroke.elementId) return;
        const carried =
          animatedPositions.get(stroke.elementId) ??
          positions.get(stroke.elementId);
        if (!carried) return;
        getCarryBallIds(stroke).forEach((attachedBallId) => {
          animatedPositions.set(attachedBallId, {
            x: carried.x + 0.015,
            y: carried.y + 0.01,
          });
        });
      });

      const animated = elements.map((element) => {
        const basePos = animatedPositions.get(element.id) ?? {
          x: element.x,
          y: element.y,
        };
        return { ...element, x: basePos.x, y: basePos.y };
      });

      ctx.clearRect(0, 0, width, height);
      const pitchRect = drawPitch(
        ctx,
        width,
        height,
        pitchPreset,
        orientationRef.current ?? undefined,
      );
      drawElements(ctx, animated, null, pitchRect, {}, [], {}, null, {
        showOverlays: false,
        showLabels: false,
        showRotateHandle: false,
        showResizeHandle: false,
      });
      previews.push(canvas.toDataURL("image/jpeg", 0.85));
    }

    return previews;
  };

  const buildPreviewFrames = () => {
    const ordered = frames
      .map((frame) => framePreviews[frame.id])
      .filter(Boolean) as string[];
    if (ordered.length > 0) return ordered;

    if (frames.length > 0) {
      const generated = frames
        .map((frame) => renderFramePreview(frame.elementsSnapshot))
        .filter(Boolean) as string[];
      if (generated.length > 0) return generated;
    }

    if (strokes.length > 0) {
      return buildVideoPreviewFrames();
    }

    if (animationMode === "video") {
      return buildVideoPreviewFrames();
    }
    return [];
  };

  const simplifyPathForSelected = () => {
    if (!selectedId) return;
    const hasStroke = strokes.some((stroke) => stroke.elementId === selectedId);
    if (hasStroke) {
      applyStrokeSmoothing((stroke) => stroke.elementId === selectedId);
      return;
    }
    if (strokes.length > 0) {
      applyStrokeSmoothing();
      return;
    }
    const points = paths[selectedId];
    if (!points || points.length < 3) return;
    setPaths((prev) => ({
      ...prev,
      [selectedId]: simplifyPath(points, 35),
    }));
    showToast("success", "Tracé lissé.");
  };

  const exportExercise = () => {
    const trimmedName = name.trim();
    const categoryValue =
      categoryMain && CATEGORY_VALUE_MAP[categoryMain]
        ? (CATEGORY_VALUE_MAP[categoryMain] as
            | "échauffement"
            | "motricité"
            | "technique"
            | "tactique"
            | "physique"
            | "jeu_opposition"
            | "situation_réelle"
            | "retour_au_calme")
        : undefined;
    const typeValue =
      trainingType && TYPE_VALUE_MAP[trainingType]
        ? (TYPE_VALUE_MAP[trainingType] as "avec_ballon" | "sans_ballon" | "mixte")
        : undefined;
    const objectiveValue = objectives
      .map((item) => OBJECTIVE_VALUE_MAP[item])
      .filter(Boolean) as Array<
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
      | "conservation"
    >;
    const metadata = {
      id: buildId(),
      name: trimmedName,
      format: "animation" as const,
      category: categoryValue,
      type: typeValue,
      objective: objectiveValue.length ? objectiveValue : undefined,
      levels: levels.length
        ? (levels as Array<"U6-U9" | "U10-U11" | "U12-U13" | "U14-U15" | "U16+">)
        : undefined,
      notes: notes.trim() ? notes.trim() : undefined,
      isIncomplete: !typeValue || objectiveValue.length === 0,
    };
    const resolvedOrientation =
      orientationRef.current ??
      (typeof window !== "undefined" && window.innerWidth > window.innerHeight * 1.1
        ? "landscape"
        : "portrait");
    return {
      title: trimmedName || "Exercice animé",
      category: categoryMain || "Non classé",
      duration: 0,
      type: "animated",
      animation_data: {
        pitchPreset,
        pitchOrientation: resolvedOrientation,
        elements,
        keyframes: frames,
        paths,
        strokes,
        ballAttachments,
        ballAttachedToId: Object.values(ballAttachments)[0] ?? null,
        strokesBase,
        actionSpeedMultipliers,
        frameSpeedMultipliers,
        frameDuration: player.frameDuration,
        previewFrames: buildPreviewFrames(),
        metadata,
        meta: metadata,
      },
    };
  };

  const buildCardCoverImage = () => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    const sourceOrientation =
      orientationRef.current ??
      (typeof window !== "undefined" && window.innerWidth > window.innerHeight * 1.1
        ? "landscape"
        : "portrait");
    const width = 540;
    const height = 810;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const rotatePoint =
      sourceOrientation === "landscape"
        ? (point: { x: number; y: number }) => ({
            x: clamp01(point.y),
            y: clamp01(1 - point.x),
          })
        : (point: { x: number; y: number }) => point;
    const rotatedElements = elements.map((el) => {
      const next = rotatePoint({ x: el.x, y: el.y });
      const baseSize =
        typeof el.size === "number" ? el.size : getDefaultSize(el.type);
      return {
        ...el,
        x: next.x,
        y: next.y,
        size: baseSize,
      };
    });
    const rotatedPaths = Object.entries(paths).reduce<
      Record<string, PathPoint[]>
    >((acc, [id, points]) => {
      acc[id] = points.map((pt) => {
        const next = rotatePoint({ x: pt.x, y: pt.y });
        return { ...pt, x: next.x, y: next.y };
      });
      return acc;
    }, {});
    const rotatedStrokes = strokes.map((stroke) => ({
      ...stroke,
      points: (stroke.points ?? []).map((pt) => {
        const next = rotatePoint({ x: pt.x, y: pt.y });
        return { ...pt, x: next.x, y: next.y };
      }),
    }));
    const pitchRect = drawPitch(
      ctx,
      width,
      height,
      pitchPreset,
      "portrait",
      "dark-textured",
    );
    drawElements(
      ctx,
      rotatedElements,
      null,
      pitchRect,
      rotatedPaths,
      rotatedStrokes,
      ballAttachments,
      null,
      {
        showOverlays: true,
        showLabels: false,
        showSequenceNumbers: true,
        showRotateHandle: false,
        showResizeHandle: false,
        pathStyleResolver: isStaticEditor ? trajectoryStyleResolver : undefined,
        showPathGhosts: true,
        pathUseFootOffset: false,
        pathElementMap,
      },
    );
    return canvas.toDataURL("image/jpeg", 0.86);
  };

  const exportStaticExercise = (coverImageUrl: string | null) => {
    const trimmedName = name.trim();
    const categoryValue =
      categoryMain && CATEGORY_VALUE_MAP[categoryMain]
        ? (CATEGORY_VALUE_MAP[categoryMain] as
            | "échauffement"
            | "motricité"
            | "technique"
            | "tactique"
            | "physique"
            | "jeu_opposition"
            | "situation_réelle"
            | "retour_au_calme")
        : undefined;
    const typeValue =
      trainingType && TYPE_VALUE_MAP[trainingType]
        ? (TYPE_VALUE_MAP[trainingType] as "avec_ballon" | "sans_ballon" | "mixte")
        : undefined;
    const objectiveValue = objectives
      .map((item) => OBJECTIVE_VALUE_MAP[item])
      .filter(Boolean) as Array<
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
      | "conservation"
    >;
    const metadata = {
      id: buildId(),
      name: trimmedName,
      format: "card" as const,
      category: categoryValue,
      type: typeValue,
      objective: objectiveValue.length ? objectiveValue : undefined,
      levels: levels.length
        ? (levels as Array<"U6-U9" | "U10-U11" | "U12-U13" | "U14-U15" | "U16+">)
        : undefined,
      notes: notes.trim() ? notes.trim() : undefined,
      isIncomplete: !typeValue || objectiveValue.length === 0,
    };
    const resolvedOrientation =
      orientationRef.current ??
      (typeof window !== "undefined" && window.innerWidth > window.innerHeight * 1.1
        ? "landscape"
        : "portrait");
    const pitchState = {
      pitchPreset,
      pitchOrientation: resolvedOrientation,
      elements,
      paths,
      ballAttachments,
      pathElementMap,
      trajectoryOrder,
      pathColorMap,
      coverImageUrl: coverImageUrl ?? undefined,
      coverOrientation: "portrait" as const,
    };
    return {
      title: trimmedName || "Carte exercice",
      category: categoryMain || "Non classé",
      duration: 0,
      type: "animated",
      animation_data: {
        pitchPreset,
        pitchOrientation: resolvedOrientation,
        elements,
        paths,
        ballAttachments,
        pathElementMap,
        trajectoryOrder,
        pathColorMap,
        coverOrientation: "portrait" as const,
        pitchState,
        coverImageUrl,
        metadata,
        meta: metadata,
      },
    };
  };

  const handleSave = async () => {
    if (saving || loadingEdit) return;
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 3) {
      setNameError("Donne un nom à ton exercice.");
      showToast("error", "Donne un nom à ton exercice.");
      return;
    }
    if (!categoryMain) {
      setCategoryError("Choisis une catégorie.");
      showToast("error", "Choisis une catégorie.");
      return;
    }
    setSaving(true);
    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      if (userError || !userData?.user) {
        throw new Error("Utilisateur non connecté.");
      }
      if (!isStaticEditor && (animationMode !== "video" || strokes.length === 0)) {
        showToast("error", "Lance un enregistrement REC avant d’enregistrer.");
        setSaving(false);
        return;
      }
      const coverImageUrl = isStaticEditor
        ? buildCardCoverImage() ??
          canvasRef.current?.toDataURL("image/png") ??
          null
        : null;
      const payload = isStaticEditor
        ? exportStaticExercise(coverImageUrl)
        : exportExercise();
      const isEditMode = Boolean(editExerciseId);
      const query = isEditMode
        ? supabase
            .from("training_exercises")
            .update({
              title: payload.title,
              category: payload.category,
              duration: payload.duration,
              type: payload.type,
              animation_data: payload.animation_data,
            })
            .eq("id", editExerciseId)
        : supabase.from("training_exercises").insert({
            title: payload.title,
            category: payload.category,
            duration: payload.duration,
            type: payload.type,
            animation_data: payload.animation_data,
            created_by: userData.user.id,
          });
      const { error } = await query;
      if (error) {
        throw new Error(error.message);
      }
      showToast(
        "success",
        isEditMode ? "Exercice mis à jour." : "Exercice enregistré.",
      );
      setSaveStep("success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Impossible d'enregistrer.";
      showToast("error", message);
    } finally {
      setSaving(false);
    }
  };

  const resetEditor = () => {
    player.setIsPlaying(false);
    setElements([]);
    setFrames([]);
    setSelectedId(null);
    setTool("select");
    setActiveFrameId(null);
    setPaths({});
    setRecordPathMode(false);
    setCurrentRecordingElementId(null);
    pathRecordRef.current = null;
    setTrajectoryOrder([]);
    setPathElementMap({});
    setPathColorMap({});
    pathCounterRef.current = 0;
    setTrajectoryPreviews({});
    setRecordMode(false);
    setStrokes([]);
    strokesRef.current = [];
    setStrokesBase(null);
    strokesBaseRef.current = null;
    setGroupMode(false);
    setCurrentSequenceIndex(1);
    setBallAttachments({});
    setFramePreviews({});
    setActionSpeedMultipliers({});
    setFrameSpeedMultipliers({});
    setCategoryMain("");
    setCategoryError(null);
    setTrainingType("");
    setObjectives([]);
    setLevels([]);
    setDurationMinutesInput("");
    setNotes("");
    setName("");
    setNameError(null);
    setCategoryError(null);
    setShowNotesField(false);
    setOpenSaveSelect(null);
    sequenceDragRef.current = null;
    setSnapTargetId(null);
    lockOrientationRef.current = false;
    clearDrag();
    showToast("success", "Éditeur réinitialisé.");
  };

  const openSaveDialog = () => {
    setSaveStep("form");
    setNameError(null);
    setCategoryError(null);
    setShowNotesField(false);
    setOpenSaveSelect(null);
    setShowSaveDialog(true);
  };

  const goToExercisesLibrary = () => {
    const teamId =
      typeof window !== "undefined"
        ? window.localStorage.getItem("activeTeamId")
        : null;
    if (teamId) {
      router.push(`/app/teams/${teamId}/trainings?tab=exercises&exerciseTab=mine`);
      return;
    }
    router.push("/app/teams");
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-[#070a14] text-slate-100">
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
      {showResetConfirm ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0c1020] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.7)]">
            <h3 className="text-lg font-semibold text-white">
              Réinitialiser l’exercice ?
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Tout le terrain, les éléments et les images clés seront supprimés.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  setShowResetConfirm(false);
                  resetEditor();
                }}
                className="rounded-full bg-rose-500/90 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-500"
              >
                Réinitialiser
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSaveDialog ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b1020]/95 p-6 text-slate-100 shadow-[0_30px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <div className="flex items-center justify-end">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-slate-200 transition hover:bg-white/10"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            {saveStep === "success" ? (
              <div className="mt-6">
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  Exercice enregistré avec succès.
                </div>
                <div className="mt-5 grid gap-2">
                  <button
                    onClick={goToExercisesLibrary}
                    className="rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
                  >
                    Voir dans mes exercices
                  </button>
                  <button
                    onClick={() => {
                      resetEditor();
                      setShowSaveDialog(false);
                      setSaveStep("form");
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    Créer un nouvel exercice
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-5 grid max-w-[360px] gap-2 mx-auto">
                  <label className="grid gap-0.5 text-[11px] text-slate-400">
                    Nom de l’exercice*
                    <input
                      value={name}
                      onChange={(event) => {
                        const next = event.target.value;
                        setName(next);
                        if (next.trim().length >= 3) {
                          setNameError(null);
                        }
                      }}
                      onBlur={() => {
                        if (name.trim().length < 3) {
                          setNameError("Donne un nom à ton exercice.");
                        }
                      }}
                      className={[
                        "h-7 rounded-xl border bg-white/5 px-2.5 text-[11px] text-white outline-none transition",
                        nameError
                          ? "border-rose-400/50 focus:border-rose-400/70"
                          : "border-white/10 focus:border-violet-400/60",
                      ].join(" ")}
                      placeholder="Nom de l'exercice"
                    />
                    {nameError ? (
                      <span className="text-[11px] text-rose-300">
                        {nameError}
                      </span>
                    ) : null}
                  </label>

                  <label className="grid gap-0.5 text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      Catégorie*
                    </span>
                    <div ref={saveCategoryRef} className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenSaveSelect((prev) =>
                            prev === "category" ? null : "category",
                          )
                        }
                        className="flex h-7 w-full items-center justify-between rounded-full border border-white/10 bg-[#0c101a]/80 px-3 text-[11px] text-white/90 shadow-[0_6px_16px_rgba(0,0,0,0.45)] backdrop-blur-md transition hover:border-white/20 focus:outline-none focus:ring-1 focus:ring-violet-400/40"
                      >
                        <span className={categoryMain ? "text-white/90" : "text-slate-500"}>
                          {categoryMain || "Choisir"}
                        </span>
                        <span className="text-[10px] text-white/60">▾</span>
                      </button>
                      {openSaveSelect === "category" ? (
                        <div className="absolute z-40 mt-2 w-full rounded-2xl border border-white/10 bg-[#0b0f1a]/95 p-1 shadow-[0_18px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                          <button
                            type="button"
                            onClick={() => {
                              setCategoryMain("");
                              setCategoryError(null);
                              setOpenSaveSelect(null);
                            }}
                            className="flex w-full items-center rounded-xl px-3 py-2 text-[11px] text-slate-400 transition hover:bg-white/5"
                          >
                            —
                          </button>
                          {CATEGORY_MAIN_OPTIONS.map((item) => {
                            const active = categoryMain === item;
                            return (
                              <button
                                key={item}
                                type="button"
                                onClick={() => {
                                  setCategoryMain(item);
                                  setCategoryError(null);
                                  setOpenSaveSelect(null);
                                }}
                                className="flex w-full items-center rounded-xl px-3 py-2 text-[11px] text-slate-200 transition hover:bg-white/5"
                              >
                                <span className="flex items-center gap-2">
                                  <span
                                    className={[
                                      "inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full border",
                                      active ? "border-white/20" : "border-white/30",
                                    ].join(" ")}
                                  >
                                    <span
                                      className="h-2 w-2 rounded-full"
                                      style={
                                        active
                                          ? {
                                              background: "#A855F7",
                                              boxShadow:
                                                "0 0 10px rgba(168,85,247,1)",
                                            }
                                          : undefined
                                      }
                                    />
                                  </span>
                                  {item}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                    {categoryError ? (
                      <span className="text-[11px] text-rose-300">
                        {categoryError}
                      </span>
                    ) : null}
                  </label>

                  <div className="grid gap-2 rounded-xl bg-transparent p-1">
                    <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
                      <label className="grid gap-0.5 text-[11px] text-slate-400">
                        Type
                        <div ref={saveTypeRef} className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenSaveSelect((prev) =>
                                prev === "type" ? null : "type",
                              )
                            }
                            className="flex h-7 w-full items-center justify-between rounded-full border border-white/10 bg-[#0c101a]/80 px-3 text-[11px] text-white/90 shadow-[0_6px_16px_rgba(0,0,0,0.45)] backdrop-blur-md transition hover:border-white/20 focus:outline-none focus:ring-1 focus:ring-violet-400/40"
                          >
                            <span className={trainingType ? "text-white/90" : "text-slate-500"}>
                              {trainingType || "Avec ou sans ballon"}
                            </span>
                            <span className="text-[10px] text-white/60">▾</span>
                          </button>
                          {openSaveSelect === "type" ? (
                            <div className="absolute z-40 mt-2 w-full rounded-2xl border border-white/10 bg-[#0b0f1a]/95 p-1 shadow-[0_18px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                              <button
                                type="button"
                                onClick={() => {
                                  setTrainingType("");
                                  setOpenSaveSelect(null);
                                }}
                                className="flex w-full items-center rounded-xl px-3 py-2 text-[11px] text-slate-400 transition hover:bg-white/5"
                              >
                                —
                              </button>
                                {TRAINING_TYPE_OPTIONS.map((item) => {
                                  const active = trainingType === item;
                                  return (
                                    <button
                                      key={item}
                                      type="button"
                                      onClick={() => {
                                        setTrainingType(item);
                                        setOpenSaveSelect(null);
                                      }}
                                      className="flex w-full items-center rounded-xl px-3 py-2 text-[11px] text-slate-200 transition hover:bg-white/5"
                                    >
                                      <span className="flex items-center gap-2">
                                        <span
                                          className={[
                                            "inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full border",
                                            active ? "border-white/20" : "border-white/30",
                                          ].join(" ")}
                                        >
                                          <span
                                            className="h-2 w-2 rounded-full"
                                            style={
                                              active
                                                ? {
                                                    background: "#A855F7",
                                                    boxShadow:
                                                      "0 0 10px rgba(168,85,247,1)",
                                                  }
                                                : undefined
                                            }
                                          />
                                        </span>
                                        {item}
                                      </span>
                                    </button>
                                  );
                                })}
                            </div>
                          ) : null}
                        </div>
                      </label>

                      <label className="grid gap-0.5 text-[11px] text-slate-400">
                        Objectif
                        <div ref={saveObjectiveRef} className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenSaveSelect((prev) =>
                                prev === "objective" ? null : "objective",
                              )
                            }
                            className="flex h-7 w-full items-center justify-between rounded-full border border-white/10 bg-[#0c101a]/80 px-3 text-[11px] text-white/90 shadow-[0_6px_16px_rgba(0,0,0,0.45)] backdrop-blur-md transition hover:border-white/20 focus:outline-none focus:ring-1 focus:ring-violet-400/40"
                          >
                            <span className={objectives.length ? "text-white/90" : "text-slate-500"}>
                              {objectives.length === 0
                                ? "Passe, tir, conservation…"
                                : objectives.length === 1
                                  ? objectives[0]
                                  : `${objectives.length} objectifs`}
                            </span>
                            <span className="text-[10px] text-white/60">▾</span>
                          </button>
                          {openSaveSelect === "objective" ? (
                            <div className="absolute z-40 mt-2 w-full rounded-2xl border border-white/10 bg-[#0b0f1a]/95 p-1 shadow-[0_18px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                              <button
                                type="button"
                                onClick={() => {
                                  setObjectives([]);
                                  setOpenSaveSelect(null);
                                }}
                                className="flex w-full items-center rounded-xl px-3 py-2 text-[11px] text-slate-400 transition hover:bg-white/5"
                              >
                                —
                              </button>
                              {OBJECTIVE_OPTIONS.map((item) => {
                                const active = objectives.includes(item);
                                return (
                                  <button
                                    key={item}
                                    type="button"
                                    onClick={() => {
                                      setObjectives((prev) =>
                                        prev.includes(item)
                                          ? prev.filter((value) => value !== item)
                                          : [...prev, item],
                                      );
                                    }}
                                    className="flex w-full items-center rounded-xl px-3 py-2 text-[11px] text-slate-200 transition hover:bg-white/5"
                                  >
                                    <span className="flex items-center gap-2">
                                        <span
                                          className={[
                                            "inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full border",
                                            active ? "border-white/20" : "border-white/30",
                                          ].join(" ")}
                                        >
                                          <span
                                            className="h-2 w-2 rounded-full"
                                            style={
                                              active
                                                ? {
                                                    background: "#A855F7",
                                                    boxShadow:
                                                      "0 0 10px rgba(168,85,247,1)",
                                                  }
                                                : undefined
                                            }
                                          />
                                        </span>
                                      {item}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      </label>
                    </div>

                    <div className="grid gap-1 text-[11px] text-slate-400">
                      Niveaux
                      <div className="flex flex-wrap gap-2">
                        {LEVEL_OPTIONS.map((level) => {
                          const active = levels.includes(level);
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() =>
                                setLevels((prev) =>
                                  prev.includes(level)
                                    ? prev.filter((item) => item !== level)
                                    : [...prev, level],
                                )
                              }
                              className={[
                                "rounded-full px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] transition",
                                active
                                  ? "border border-violet-400/50 bg-violet-500/20 text-white"
                                  : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                              ].join(" ")}
                            >
                              {level}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid gap-2 text-[11px] text-slate-400">
                      <button
                        type="button"
                        onClick={() => setShowNotesField((prev) => !prev)}
                        className="inline-flex items-center justify-start text-slate-300 transition hover:text-white"
                        aria-label={showNotesField ? "Masquer les notes" : "Ajouter des notes"}
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          className="h-4 w-4 translate-y-[1px]"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 4h12l4 4v12H4z" />
                          <path d="M12 4v4h4" />
                          <path d="M7 12h10" />
                          <path d="M7 16h7" />
                          <path d="M9 19l6-6 2 2-6 6-2 0z" />
                        </svg>
                      </button>
                      {showNotesField ? (
                        <textarea
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                          className="min-h-[70px] rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-[11px] text-white outline-none transition focus:border-violet-400/60"
                          placeholder="Matériel, consignes, repères..."
                        />
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setShowSaveDialog(false)}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={
                      saving ||
                      loadingEdit ||
                      name.trim().length < 3 ||
                      !categoryMain ||
                      (!isStaticEditor &&
                        (animationMode !== "video" || strokes.length === 0))
                    }
                    className="rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
                  >
                    {saving
                      ? "Enregistrement..."
                      : isStaticEditor
                        ? "Enregistrer la carte"
                        : "Enregistrer"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {!previewMode && !immersiveMode ? (
        <header className="grid h-14 md:h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-white/5 bg-[#050816]/80 px-3 md:gap-4 md:px-4 backdrop-blur-xl z-20">
          <div className="flex items-center">
            <button
              onClick={() => router.back()}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-xs text-slate-200 transition hover:border-white/30"
              title="Retour"
            >
              ←
            </button>
          </div>

          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-transparent px-2 py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md md:px-3">
              <button
                onClick={() => toggleTool("select")}
                title="Sélection"
                className={[
                  "flex h-7 w-7 items-center justify-center rounded-full border transition",
                  tool === "select"
                    ? "border-violet-400/70 bg-violet-500/20 text-white shadow-[0_0_18px_rgba(139,92,246,0.45)]"
                    : "border-white/10 text-slate-200 hover:border-white/30",
                ].join(" ")}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 5L19 12L12 14L10 20L6 5Z" />
                </svg>
              </button>
              {isStaticEditor ? (
                <button
                  onClick={() => {
                    setRecordPathMode((prev) => !prev);
                    setTool("select");
                  }}
                  title="Trajectoire"
                  className={[
                    "flex h-7 w-7 items-center justify-center rounded-full border transition",
                    recordPathMode
                      ? "border-violet-400/70 bg-violet-500/20 text-white shadow-[0_0_18px_rgba(139,92,246,0.45)]"
                      : "border-white/10 text-slate-200 hover:border-white/30",
                  ].join(" ")}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M4 16c4-6 8-6 12-1" />
                    <polyline points="16,13 19,15 16,17" />
                  </svg>
                </button>
              ) : null}
              <button
                onClick={() => toggleTool("player")}
                title="Joueur"
                className={[
                  "flex h-9 w-9 items-center justify-center rounded-full border transition",
                  tool === "player"
                    ? "border-violet-400/70 bg-violet-500/20 text-white shadow-[0_0_18px_rgba(139,92,246,0.45)]"
                    : "border-white/10 text-slate-200 hover:border-white/30",
                ].join(" ")}
              >
                <canvas ref={playerIconRef} className="h-8 w-8" />
              </button>
              <button
                onClick={() => toggleTool("player_runner")}
                title="Joueur 3D"
                className={[
                  "flex h-9 w-9 items-center justify-center overflow-hidden rounded-md transition",
                  tool === "player_runner"
                    ? "bg-violet-500/20 text-white shadow-[0_0_18px_rgba(139,92,246,0.45)]"
                    : "text-slate-200 hover:bg-white/5",
                ].join(" ")}
              >
                <img
                  src="/icons/Joueurcour.png"
                  alt="Joueur 3D"
                  className="h-full w-full object-cover"
                  style={{ transform: "scale(1.6)", transformOrigin: "50% 25%" }}
                />
              </button>
              <button
                onClick={() => toggleTool("player_runner_noball")}
                title="Joueur sans ballon"
                className={[
                  "flex h-9 w-9 items-center justify-center overflow-hidden rounded-md transition",
                  tool === "player_runner_noball"
                    ? "bg-violet-500/20 text-white shadow-[0_0_18px_rgba(139,92,246,0.45)]"
                    : "text-slate-200 hover:bg-white/5",
                ].join(" ")}
              >
                <img
                  src="/icons/JOUEUR2SANSBAL.png"
                  alt="Joueur sans ballon"
                  className="h-full w-full object-cover"
                  style={{ transform: "scale(1.6)", transformOrigin: "50% 25%" }}
                />
              </button>
              <button
                onClick={() => toggleTool("ball")}
                title="Ballon"
                className={[
                  "flex h-7 w-7 items-center justify-center rounded-full border text-[11px] transition",
                  tool === "ball"
                    ? "border-violet-400/70 bg-violet-500/20 text-white shadow-[0_0_18px_rgba(139,92,246,0.45)]"
                    : "border-white/10 text-slate-200 hover:border-white/30",
                ].join(" ")}
              >
                ⚽
              </button>
                <div ref={toolboxMenuRef} className="relative">
                  <button
                    onClick={() => {
                      setShowToolboxMenu((prev) => !prev);
                      setShowShapeMenu(false);
                    }}
                    title="Boîte à outils"
                  className={[
                    "flex h-7 w-7 items-center justify-center rounded-full border text-[11px] transition",
                    showToolboxMenu || toolboxToolActive
                      ? "border-violet-400/70 bg-violet-500/20 text-white shadow-[0_0_18px_rgba(139,92,246,0.45)]"
                      : "border-white/10 text-slate-200 hover:border-white/30",
                  ].join(" ")}
                >
                  <canvas ref={toolboxDiscIconRef} className="h-4 w-4" />
                </button>
                  {showToolboxMenu ? (
                    <div className="absolute left-0 top-full z-20 mt-2 grid w-52 grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-[#0b1020]/95 p-3 text-xs shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                      {(
                        [
                          "cone",
                          "disc",
                          "hoop",
                          "baton",
                          "slalom_pole",
                          "hurdle_bar",
                          "hurdle_pole",
                          "mini_goal",
                          "ladder",
                          "pass_wall",
                        ] as ToolKey[]
                      ).map((key) => (
                        <button
                          key={key}
                          onClick={() => {
                            toggleTool(key);
                            setShowToolboxMenu(false);
                          }}
                          className={[
                            "flex h-10 w-10 items-center justify-center rounded-xl border transition",
                            tool === key
                              ? "border-violet-400/70 bg-violet-500/25 text-white"
                              : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                          ].join(" ")}
                          title={key}
                        >
                          {key === "disc" ? (
                            <canvas ref={discMenuIconRef} className="h-6 w-6" />
                          ) : key === "cone" ? (
                            <canvas ref={plotMenuIconRef} className="h-6 w-6" />
                          ) : key === "slalom_pole" ? (
                            <canvas ref={slalomMenuIconRef} className="h-6 w-6" />
                          ) : key === "hurdle_bar" ? (
                            <canvas
                              ref={hurdleBarMenuIconRef}
                              className="h-6 w-6"
                            />
                          ) : key === "hurdle_pole" ? (
                            <canvas
                              ref={hurdlePoleMenuIconRef}
                              className="h-6 w-6"
                            />
                          ) : key === "hoop" ? (
                            <canvas ref={hoopMenuIconRef} className="h-6 w-6" />
                          ) : key === "baton" ? (
                            <canvas ref={batonMenuIconRef} className="h-6 w-6" />
                          ) : key === "ladder" ? (
                            <canvas
                              ref={ladderMenuIconRef}
                              className="h-6 w-6"
                            />
                          ) : key === "mini_goal" ? (
                            <MiniGoalIcon
                              size={22}
                              selected={tool === "mini_goal"}
                              className="text-[rgba(235,235,255,0.92)]"
                            />
                          ) : key === "pass_wall" ? (
                            <PassWallIcon
                              size={22}
                              selected={tool === "pass_wall"}
                              className="text-[rgba(235,235,255,0.92)]"
                            />
                          ) : (
                            <span className="text-sm">•</span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              <div ref={colorMenuRef} className="relative">
                <button
                  onClick={() => setShowColorMenu((prev) => !prev)}
                  title="Couleurs"
                  className={[
                    "flex h-6 w-6 items-center justify-center rounded-full border transition hover:border-white/30",
                    showColorMenu
                      ? "border-violet-400/70 shadow-[0_0_18px_rgba(139,92,246,0.45)]"
                      : "border-white/10",
                  ].join(" ")}
                  style={{
                    background:
                      "conic-gradient(from 90deg, #7B66FF, #22D3EE, #F59E0B, #F472B6, #34D399, #7B66FF)",
                  }}
                >
                  <span className="h-3.5 w-3.5 rounded-full bg-black/40" />
                </button>
                {showColorMenu ? (
                  <div className="absolute left-0 top-full z-20 mt-2 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-[#0b1020]/95 p-3 text-xs shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                    {DEFAULT_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => {
                          setPlayerColor(color);
                          setShowColorMenu(false);
                        }}
                        className={`h-8 w-8 rounded-full border transition ${
                          playerColor === color
                            ? "border-white/80"
                            : "border-white/10"
                        }`}
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
              <div ref={shapeMenuRef} className="relative">
                <button
                  onClick={() => {
                    setShowShapeMenu((prev) => !prev);
                    setShowToolboxMenu(false);
                  }}
                  title="Formes"
                  className={[
                    "flex h-7 w-7 items-center justify-center rounded-full border text-[11px] transition",
                    showShapeMenu || shapeToolActive
                      ? "border-violet-400/70 bg-violet-500/20 text-white shadow-[0_0_18px_rgba(139,92,246,0.45)]"
                      : "border-white/10 text-slate-200 hover:border-white/30",
                  ].join(" ")}
                >
                  〰
                </button>
                {showShapeMenu ? (
                  <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-2xl border border-white/10 bg-[#0b1020]/95 p-3 text-xs shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                    <div className="grid grid-cols-3 gap-2">
                      {SHAPE_TOOLS.map((shape) => (
                        <button
                          key={shape}
                          onClick={() => {
                            toggleTool(shape);
                            setShowShapeMenu(false);
                          }}
                          className={[
                            "flex h-10 w-10 items-center justify-center rounded-xl border transition",
                            tool === shape
                              ? "border-violet-400/70 bg-violet-500/25 text-white"
                              : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                          ].join(" ")}
                          title={shape}
                        >
                          {shape === "line" ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1"
                              strokeLinecap="round"
                            >
                              <line x1="3" y1="12" x2="21" y2="12" />
                              <circle cx="3" cy="12" r="1.6" fill="currentColor" stroke="none" />
                              <circle cx="21" cy="12" r="1.6" fill="currentColor" stroke="none" />
                            </svg>
                          ) : shape === "arrow" ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <line x1="3" y1="12" x2="18" y2="12" />
                              <polyline points="12,7 18,12 12,17" />
                            </svg>
                          ) : shape === "line_dashed" ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1"
                              strokeLinecap="round"
                            >
                              <line x1="3" y1="12" x2="5.5" y2="12" />
                              <line x1="7.5" y1="12" x2="10" y2="12" />
                              <line x1="12" y1="12" x2="14.5" y2="12" />
                              <line x1="16.5" y1="12" x2="19" y2="12" />
                              <line x1="20.5" y1="12" x2="22" y2="12" />
                            </svg>
                          ) : shape === "arrow_dashed" ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <line x1="3" y1="12" x2="5.5" y2="12" />
                              <line x1="7.5" y1="12" x2="10" y2="12" />
                              <line x1="12" y1="12" x2="14.5" y2="12" />
                              <line x1="16.5" y1="12" x2="18" y2="12" />
                              <polyline points="12,7 18,12 12,17" />
                            </svg>
                          ) : shape === "polyline_dashed" ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <circle cx="5" cy="17" r="1.2" fill="currentColor" stroke="none" />
                              <circle cx="12" cy="8" r="1.2" fill="currentColor" stroke="none" />
                              <circle cx="19" cy="16" r="1.2" fill="currentColor" stroke="none" />
                              <line x1="5" y1="17" x2="8.5" y2="13" />
                              <line x1="10.5" y1="11" x2="12" y2="8" />
                              <line x1="12" y1="8" x2="15" y2="12" />
                              <line x1="16.5" y1="14" x2="19" y2="16" />
                            </svg>
                          ) : shape === "polyarrow_dashed" ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <circle cx="5" cy="17" r="1.2" fill="currentColor" stroke="none" />
                              <circle cx="12" cy="8" r="1.2" fill="currentColor" stroke="none" />
                              <circle cx="19" cy="16" r="1.2" fill="currentColor" stroke="none" />
                              <line x1="5" y1="17" x2="9" y2="12.5" />
                              <polyline points="8,11 9,12.5 7.5,12.5" />
                              <line x1="10.5" y1="10.5" x2="12" y2="8" />
                              <polyline points="11,7.3 12,8 10.9,8.6" />
                              <line x1="12" y1="8" x2="17" y2="14" />
                              <polyline points="16,12.8 17,14 15.4,13.8" />
                            </svg>
                          ) : shape === "rect_dashed" ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1"
                              strokeLinecap="round"
                            >
                              <line x1="4" y1="4" x2="8" y2="4" />
                              <line x1="10" y1="4" x2="14" y2="4" />
                              <line x1="16" y1="4" x2="20" y2="4" />
                              <line x1="20" y1="4" x2="20" y2="8" />
                              <line x1="20" y1="10" x2="20" y2="14" />
                              <line x1="20" y1="16" x2="20" y2="20" />
                              <line x1="20" y1="20" x2="16" y2="20" />
                              <line x1="14" y1="20" x2="10" y2="20" />
                              <line x1="8" y1="20" x2="4" y2="20" />
                              <line x1="4" y1="20" x2="4" y2="16" />
                              <line x1="4" y1="14" x2="4" y2="10" />
                              <line x1="4" y1="8" x2="4" y2="4" />
                            </svg>
                          ) : shape === "circle" ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1"
                              strokeDasharray="1.4 2.6"
                              strokeLinecap="round"
                            >
                              <circle cx="12" cy="12" r="7.5" />
                            </svg>
                          ) : (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1"
                              strokeLinejoin="round"
                              strokeDasharray="1.4 2.6"
                              strokeLinecap="round"
                            >
                              <polygon points="12,4.5 19,9 19,15 12,19.5 5,15 5,9" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-transparent px-2 py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md md:px-3">
              <button
                onClick={undo}
                disabled={!canUndo}
                title="Annuler"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M8 7L4.5 10.5L8 14" />
                  <path d="M4.5 10.5H13A6.5 6.5 0 1 1 7.6 21" />
                </svg>
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                title="Rétablir"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M16 7L19.5 10.5L16 14" />
                  <path d="M19.5 10.5H11A6.5 6.5 0 1 0 16.4 21" />
                </svg>
              </button>

            <div ref={settingsMenuRef} className="relative">
              <button
                onClick={() => setShowSettingsMenu((prev) => !prev)}
                title="Paramètres"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
              >
                <span className="grid h-3.5 w-3.5 grid-rows-3 place-items-center gap-[2px]">
                  <span className="h-[2px] w-3.5 rounded-full bg-white/80" />
                  <span className="h-[2px] w-3.5 rounded-full bg-white/80" />
                  <span className="h-[2px] w-3.5 rounded-full bg-white/80" />
                </span>
              </button>
              {showSettingsMenu ? (
                <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-2xl border border-white/10 bg-[#0b1020]/95 p-2 text-xs shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                  <button
                    onClick={() => {
                      openSaveDialog();
                      setShowSettingsMenu(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-slate-200 transition hover:bg-white/5"
                  >
                    {isStaticEditor ? "Enregistrer la carte" : "Enregistrer"}
                  </button>
                  <button
                    onClick={() => {
                      setShowResetConfirm(true);
                      setShowSettingsMenu(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-rose-200 transition hover:bg-white/5"
                  >
                    Supprimer
                  </button>
                  {!isStaticEditor ? (
                    <>
                      <div className="my-2 h-px bg-white/10" />
                      <button
                        onClick={() => {
                          setAnimationMode("video");
                          setRecordMode(false);
                          setGroupMode(false);
                          setShowSettingsMenu(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                          animationMode === "video"
                            ? "bg-white/10 text-white"
                            : "text-slate-300 hover:bg-white/5"
                        }`}
                      >
                        Animation : Vidéo
                        {animationMode === "video" ? "✓" : ""}
                      </button>
                      <button
                        onClick={() => {
                          setAnimationMode("image");
                          setRecordMode(false);
                          setGroupMode(false);
                          setShowSettingsMenu(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                          animationMode === "image"
                            ? "bg-white/10 text-white"
                            : "text-slate-300 hover:bg-white/5"
                        }`}
                      >
                        Animation : Image
                        {animationMode === "image" ? "✓" : ""}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
            </div>
          </div>
        </header>
      ) : null}

      <main ref={viewportRef} className="relative flex-1 overflow-hidden">
        {!previewMode &&
        showSelectionToolbar &&
        selectedElement &&
        selectionToolbarPosition ? (
          <div
            style={{
              left: selectionToolbarPosition.x,
              top: selectionToolbarPosition.y,
            }}
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
          >
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-2.5 py-1.5 text-[11px] text-white/90 shadow-[0_12px_26px_rgba(0,0,0,0.45)] ring-1 ring-white/10 backdrop-blur-md">
              <button
                onClick={() => setShowSidePanel((prev) => !prev)}
                title="Propriétés"
                aria-pressed={showSidePanel}
                className={[
                  "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold transition drop-shadow-[0_0_8px_rgba(0,0,0,0.25)]",
                  showSidePanel
                    ? "bg-white/25 text-white shadow-[0_0_12px_rgba(255,255,255,0.45)]"
                    : "bg-white/15 text-white/90 hover:bg-white/25",
                ].join(" ")}
              >
                ✎
              </button>
              <button
                onClick={() => setShowRotateHandle((prev) => !prev)}
                title="Rotation"
                className={[
                  "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold transition drop-shadow-[0_0_8px_rgba(0,0,0,0.25)]",
                  showRotateHandle
                    ? "bg-white/25 text-white shadow-[0_0_12px_rgba(255,255,255,0.45)]"
                    : "bg-white/15 text-white/90 hover:bg-white/25",
                ].join(" ")}
              >
                ↻
              </button>
              <div className="h-4 w-px bg-white/20" />
              <button
                onClick={deleteSelected}
                title="Supprimer"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-red-200 transition hover:bg-red-500/20 hover:text-red-100"
              >
                🗑
              </button>
            </div>
          </div>
        ) : null}

        {!previewMode && showSidePanel && selectedElement ? (
          <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2">
            <div className="flex items-center justify-center bg-transparent">
              <div className="flex origin-center scale-90 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px]">
                    <button
                      onClick={() => setShowSidePanel(false)}
                      className="flex h-5 w-5 items-center justify-center rounded-sm border border-white/10 bg-white/5 text-[10px] text-slate-200 transition hover:bg-white/10"
                      aria-label="Fermer"
                    >
                      ✕
                    </button>
                    {selectedElement.type !== "ball" ? (
                      <div ref={elementColorMenuRef} className="relative">
                        <button
                          onClick={() =>
                            setShowElementColorMenu((prev) => !prev)
                          }
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5"
                          title="Couleur"
                        >
                          <span
                            className="h-4 w-4 rounded-full"
                            style={{
                              background: selectedElement.color ?? "#7B66FF",
                            }}
                          />
                        </button>
                        {showElementColorMenu ? (
                          <div className="absolute left-1/2 top-full z-30 mt-1 -translate-x-1/2 flex flex-wrap gap-1.5 rounded-md border border-white/10 bg-[#0b1020]/95 p-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.55)] backdrop-blur-md">
                            {DEFAULT_COLORS.map((color) => (
                              <button
                                key={color}
                                onClick={() => {
                                  updateElement(selectedElement.id, { color });
                                  setShowElementColorMenu(false);
                                }}
                                className={`h-4 w-4 rounded-full border transition ${
                                  selectedElement.color === color
                                    ? "border-white/80"
                                    : "border-white/10"
                                }`}
                                style={{ background: color }}
                                title={color}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {selectedElement.type === "player" ? (
                      <div className="flex items-center gap-1 px-1.5">
                        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                          #
                        </span>
                        <input
                          value={selectedElement.label ?? ""}
                          onChange={(event) =>
                            updateElement(selectedElement.id, {
                              label: event.target.value,
                            })
                          }
                          className="w-10 bg-transparent text-[11px] text-slate-100 outline-none placeholder:text-slate-500"
                          placeholder="10"
                        />
                      </div>
                    ) : null}

                    <div className="flex items-center gap-2 px-1.5">
                      <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                        Taille
                      </span>
                      <input
                        type="range"
                        min={0.006}
                        max={0.08}
                        step={0.001}
                        value={
                          selectedElement.size ??
                          getDefaultSize(selectedElement.type)
                        }
                        onChange={(event) =>
                          updateElement(selectedElement.id, {
                            size: Number(event.target.value),
                          })
                        }
                        className="w-20"
                      />
                    </div>

                    <div className="flex items-center gap-2 px-1.5">
                      <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                        Angle
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={360}
                        step={5}
                        value={selectedElement.rotation ?? 0}
                        onChange={(event) =>
                          updateElement(selectedElement.id, {
                            rotation: Number(event.target.value),
                          })
                        }
                        className="w-20"
                      />
                      <span className="text-[10px] text-slate-300">
                        {Math.round(selectedElement.rotation ?? 0)}°
                      </span>
                    </div>

                    {animationMode === "video" && selectedStroke ? (
                      <div className="flex items-center gap-2 px-1.5">
                        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                          Action
                        </span>
                        <input
                          type="number"
                          min={1}
                          value={getStrokeSequenceIndex(selectedStroke)}
                          onChange={(event) =>
                            updateStrokeSequenceIndex(
                              selectedStroke.id,
                              Number(event.target.value),
                            )
                          }
                          className="w-12 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-100 outline-none"
                        />
                      </div>
                    ) : null}

                    {selectedElement.type === "player" ? (
                      <div className="flex items-center gap-2">
                        {ballElements.length === 0 ? (
                          <span className="text-xs text-slate-400">
                            Ajoute un ballon.
                          </span>
                        ) : (
                          <>
                            {ballElements.length > 1 ? (
                              <select
                                value={associationTargetBallId ?? ""}
                                onChange={(event) =>
                                  setAssociationTargetBallId(event.target.value)
                                }
                              className="h-7 rounded-full border border-white/10 bg-white/5 px-3 text-[11px] text-slate-100"
                              >
                                {ballElements.map((ball, index) => (
                                  <option key={ball.id} value={ball.id}>
                                    Ballon {index + 1}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            <button
                              onClick={() =>
                                attachBallToPlayer(
                                  selectedElement.id,
                                  associationTargetBallId,
                                )
                              }
                              className="h-7 rounded-full border border-white/10 bg-white/5 px-3 text-[11px] text-slate-200 transition hover:bg-white/10"
                            >
                              ⚽ Associer
                            </button>
                            {(() => {
                              const targetBallId =
                                associationTargetBallId ??
                                ballElements[0]?.id ??
                                null;
                              if (
                                targetBallId &&
                                ballAttachments[targetBallId] ===
                                  selectedElement.id
                              ) {
                                return (
                                  <button
                                    onClick={() => detachBall(targetBallId)}
                                    className="h-7 rounded-full border border-white/10 bg-white/5 px-3 text-[11px] text-slate-200 transition hover:bg-white/10"
                                  >
                                    Détacher
                                  </button>
                                );
                              }
                              return null;
                            })()}
                          </>
                        )}
                      </div>
                    ) : selectedElement.type === "ball" ? (
                      <div className="flex items-center gap-2">
                        {playerElements.length === 0 ? (
                          <span className="text-xs text-slate-400">
                            Ajoute un joueur.
                          </span>
                        ) : (
                        <>
                          <select
                            value={associationTargetPlayerId ?? ""}
                            onChange={(event) =>
                              setAssociationTargetPlayerId(event.target.value)
                            }
                            className="h-7 rounded-full border border-white/10 bg-white/5 px-3 text-[11px] text-slate-100"
                          >
                            {playerElements.map((player, index) => (
                              <option key={player.id} value={player.id}>
                                {player.label ? `J${player.label}` : `J${index + 1}`}
                                </option>
                              ))}
                            </select>
                          <button
                            onClick={() => {
                              if (associationTargetPlayerId) {
                                attachBallToPlayer(
                                  associationTargetPlayerId,
                                  selectedElement.id,
                                );
                              }
                            }}
                            className="h-7 rounded-full border border-white/10 bg-white/5 px-3 text-[11px] text-slate-200 transition hover:bg-white/10"
                          >
                            ⚽ Associer
                          </button>
                          {ballAttachments[selectedElement.id] ? (
                            <button
                              onClick={() => detachBall(selectedElement.id)}
                              className="h-7 rounded-full border border-white/10 bg-white/5 px-3 text-[11px] text-slate-200 transition hover:bg-white/10"
                            >
                              Détacher
                            </button>
                          ) : null}
                        </>
                        )}
                      </div>
                    ) : null}

                    <button
                      onClick={() => setSelectedId(null)}
                      className="h-7 w-7 rounded-full border border-white/10 bg-white/5 text-[11px] text-slate-200 transition hover:bg-white/10"
                      aria-label="Désélectionner"
                      title="Désélectionner"
                    >
                      ◎
                    </button>
                  </div>
                </div>
              </div>
        ) : null}

        {sequenceEditor ? (
          <div
            className="absolute z-30 -translate-x-1/2 -translate-y-full"
            style={{ left: sequenceEditor.x, top: sequenceEditor.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0b1020]/90 px-3 py-2 text-xs text-slate-200 shadow-[0_18px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                Action
              </span>
              <input
                type="number"
                min={1}
                value={sequenceEditorValue}
                onChange={(event) => {
                  const value = event.target.value;
                  setSequenceEditorValue(value);
                  const parsed = Number(value);
                  if (!Number.isNaN(parsed)) {
                    updateStrokeSequenceIndex(sequenceEditor.strokeId, parsed);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Escape") {
                    setSequenceEditor(null);
                  }
                }}
                onBlur={() => setSequenceEditor(null)}
                className="w-12 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-100 outline-none"
                autoFocus
              />
            </div>
          </div>
        ) : null}

        {!previewMode && !immersiveMode && animationMode ? (
          <div
            className="absolute z-20 -translate-y-1/2"
            style={{
              left: sideToolbarPosition.x,
              top: sideToolbarPosition.y,
            }}
          >
            <div className="flex flex-col items-center gap-2 bg-transparent p-1">
              {animationMode === "video" ? (
                <>
                  <button
                    onClick={player.toggle}
                    disabled={!hasPlayableContent}
                    title={player.isPlaying ? "Pause" : "Lecture"}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
                  >
                    {player.isPlaying ? "⏸" : "▶"}
                  </button>
                  <button
                    onClick={() =>
                      setRecordMode((prev) => {
                        if (prev) {
                          sequenceDragRef.current = null;
                          setGroupMode(false);
                          setSelectedId(null);
                          return false;
                        }
                        setCurrentSequenceIndex(1);
                        if (!strokesBaseRef.current) {
                          const snapshot: BaseSnapshot = {};
                          elements.forEach((el) => {
                            snapshot[el.id] = { x: el.x, y: el.y };
                          });
                          setStrokesBase(snapshot);
                          strokesBaseRef.current = snapshot;
                        }
                        setSelectedId(null);
                        return true;
                      })
                    }
                    title="REC"
                    className={[
                      "flex h-7 w-7 items-center justify-center rounded-full border text-[10px] transition",
                      recordMode
                        ? "border-rose-300/40 bg-rose-500/20 text-rose-100"
                        : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                    ].join(" ")}
                  >
                    ●
                  </button>
                  <button
                    onClick={() => {
                      player.reset();
                      player.setIsPlaying(true);
                      setPreviewMode(true);
                    }}
                    disabled={!hasPlayableContent}
                    title="Prévisualiser"
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
                  >
                    🖥
                  </button>
                  <button
                    onClick={() => setShowSpeedPanel((prev) => !prev)}
                    title="Vitesse des actions"
                    className={[
                      "flex h-7 w-7 items-center justify-center rounded-full border text-[10px] transition",
                      showSpeedPanel
                        ? "border-violet-300/40 bg-violet-500/20 text-violet-100"
                        : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                    ].join(" ")}
                  >
                    ⏩
                  </button>
                  <button
                    onClick={() => setGroupMode((prev) => !prev)}
                    title="Associer"
                    className={[
                      "flex h-7 w-7 items-center justify-center rounded-full border text-[10px] transition",
                      groupMode
                        ? "border-violet-300/40 bg-violet-500/20 text-violet-100"
                        : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                    ].join(" ")}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="8.5" cy="12" r="2" fill="currentColor" stroke="none" />
                      <path d="M11 12H19" />
                      <path d="M17 10.5L19 12L17 13.5" />
                      <path d="M10.5 11L16.5 5" />
                      <path d="M14.5 5L16.5 5L16.5 7" />
                      <path d="M10.5 13L16.5 19" />
                      <path d="M14.5 19L16.5 19L16.5 17" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={player.toggle}
                    disabled={!hasPlayableContent}
                    title={player.isPlaying ? "Pause" : "Lecture"}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
                  >
                    {player.isPlaying ? "⏸" : "▶"}
                  </button>
                  <button
                    onClick={() => {
                      player.reset();
                      player.setIsPlaying(true);
                      setPreviewMode(true);
                    }}
                    disabled={!hasPlayableContent}
                    title="Prévisualiser"
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
                  >
                    🖥
                  </button>
                  <button
                    onClick={() => {
                      handleAddFrame();
                      triggerCapturePulse();
                    }}
                    title="Capture"
                    className={[
                      "flex h-7 w-7 items-center justify-center rounded-full border text-[10px] text-slate-200 transition",
                      capturePulse
                        ? "border-violet-300/70 bg-violet-500/20 shadow-[0_0_24px_rgba(139,92,246,0.45)]"
                        : "border-white/10 bg-white/5 hover:bg-white/10",
                    ].join(" ")}
                  >
                    ＋
                  </button>
                  <button
                    onClick={() => setShowSpeedPanel((prev) => !prev)}
                    title="Vitesse des images"
                    className={[
                      "flex h-7 w-7 items-center justify-center rounded-full border text-[10px] transition",
                      showSpeedPanel
                        ? "border-violet-300/40 bg-violet-500/20 text-violet-100"
                        : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                    ].join(" ")}
                  >
                    ⏩
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}

        {!previewMode && showSpeedPanel && animationMode ? (
          <div
            className="absolute z-20"
            style={{
              left: sideToolbarPosition.x + 48,
              top: sideToolbarPosition.y,
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="w-44 rounded-2xl border border-white/10 bg-[#0b1020]/95 p-3 text-xs text-slate-200 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              {animationMode === "video" ? (
                <>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-slate-400">
                    Actions
                  </div>
                  <div className="mt-2 grid gap-2">
                    {actionSequenceList.length === 0 ? (
                      <div className="text-[11px] text-slate-500">
                        Aucune action.
                      </div>
                    ) : (
                      actionSequenceList.map((sequenceIndex) => {
                        const speed =
                          actionSpeedMultipliers[sequenceIndex] ?? 1;
                        return (
                          <button
                            key={sequenceIndex}
                            onClick={() => cycleActionSpeed(sequenceIndex)}
                            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] transition hover:bg-white/10"
                          >
                            <span>Action {sequenceIndex}</span>
                            <span className="font-semibold text-white">
                              ×{speed}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-slate-400">
                    Images
                  </div>
                  <div className="mt-2 grid gap-2">
                    {frames.length === 0 ? (
                      <div className="text-[11px] text-slate-500">
                        Aucune image.
                      </div>
                    ) : (
                      frames.map((frame, index) => {
                        const speed =
                          frameSpeedMultipliers[frame.id] ?? 1;
                        const preview = framePreviews[frame.id];
                        return (
                          <button
                            key={frame.id}
                            onClick={() => cycleFrameSpeed(frame.id)}
                            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] transition hover:bg-white/10"
                          >
                            <span>
                              {preview ? (
                                <span
                                  className="mr-2 inline-block h-5 w-7 rounded-md border border-white/10 bg-cover bg-center align-middle"
                                  style={{ backgroundImage: `url(${preview})` }}
                                />
                              ) : null}
                              Image {index + 1}
                            </span>
                            <span className="font-semibold text-white">
                              ×{speed}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

        <div className="flex h-full w-full items-center justify-center">
          <div
            ref={containerRef}
            className="relative h-full w-full"
            onDragOver={(event) => {
              if (previewMode) return;
              event.preventDefault();
            }}
            onDrop={(event) => {
              if (previewMode) return;
              event.preventDefault();
              const toolKey = event.dataTransfer.getData(
                "application/x-infinity-tool",
              ) as ToolKey | "";
              if (!toolKey || toolKey === "select") return;
              const rect = event.currentTarget.getBoundingClientRect();
              const point = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              };
              const pitchRect = getCurrentPitchRect();
              if (
                point.x < pitchRect.x ||
                point.x > pitchRect.x + pitchRect.w ||
                point.y < pitchRect.y ||
                point.y > pitchRect.y + pitchRect.h
              ) {
                return;
              }
              const normalized = {
                x: clamp01((point.x - pitchRect.x) / pitchRect.w),
                y: clamp01((point.y - pitchRect.y) / pitchRect.h),
              };
              addElement(toolKey as ToolKey, normalized);
            }}
          >
            <canvas
              ref={canvasRef}
              className="h-full w-full touch-none"
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={previewMode ? undefined : handleCanvasPointerMove}
              onPointerUp={previewMode ? undefined : handlePointerUp}
            />
            {!previewMode && animationMode === "image" ? (
              <div className="absolute left-1/2 top-full z-10 mt-2 w-[92%] -translate-x-1/2">
                <div className="flex items-center gap-2 overflow-x-auto">
                  {frames.length === 0 ? (
                    <div className="text-xs text-slate-400">
                      Aucune séquence
                    </div>
                  ) : (
                    frames.map((frame, index) => (
                      <button
                        key={frame.id}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.currentTarget.setPointerCapture(event.pointerId);
                          frameDragRef.current = {
                            id: frame.id,
                            startX: event.clientX,
                            lastX: event.clientX,
                            moved: false,
                          };
                        }}
                        onPointerMove={(event) => {
                          const ref = frameDragRef.current;
                          if (!ref || ref.id !== frame.id) return;
                          event.preventDefault();
                          const delta = event.clientX - ref.startX;
                          if (Math.abs(delta) > 6) {
                            ref.moved = true;
                          }
                          if (Math.abs(delta) > 12) {
                            moveFrame(ref.id, delta > 0 ? 1 : -1);
                            ref.startX = event.clientX;
                            ref.lastX = event.clientX;
                          }
                        }}
                        onPointerUp={(event) => {
                          const ref = frameDragRef.current;
                          if (!ref || ref.id !== frame.id) return;
                          event.currentTarget.releasePointerCapture(event.pointerId);
                          if (!ref.moved) {
                            setActiveFrameId(frame.id);
                          }
                          frameDragRef.current = null;
                        }}
                        onPointerCancel={(event) => {
                          event.currentTarget.releasePointerCapture(event.pointerId);
                          frameDragRef.current = null;
                        }}
                        style={{ touchAction: "none" }}
                        className={`h-16 w-16 flex-shrink-0 rounded-2xl border transition ${
                          activeFrameId === frame.id
                            ? "border-violet-400/50"
                            : "border-white/10 hover:border-white/30"
                        }`}
                        title={`Seq ${index + 1}`}
                      >
                        {framePreviews[frame.id] ? (
                          <img
                            src={framePreviews[frame.id]}
                            alt={`Seq ${index + 1}`}
                            className="h-full w-full rounded-xl object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[9px] text-slate-400">
                            {index + 1}
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
            {!previewMode && isStaticEditor ? (
              <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 w-[92%] -translate-x-1/2">
                <div className="pointer-events-auto rounded-2xl border border-white/10 bg-[#0b1020]/75 px-2 py-2 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                  <div className="flex items-center gap-2 overflow-x-auto">
                    {trajectoryOrder.length === 0 ? (
                      <div className="text-xs text-slate-400">
                        Aucune action
                      </div>
                    ) : (
                      trajectoryOrder.map((pathId, index) => {
                        const preview = trajectoryPreviews[pathId];
                        return (
                        <button
                          key={pathId}
                          type="button"
                          onClick={() => setActiveTrajectoryPreviewId(pathId)}
                          className="relative h-16 w-24 flex-shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition hover:border-violet-300/60"
                        >
                          {preview ? (
                            <img
                              src={preview}
                              alt={`Action ${index + 1}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-300">
                              {index + 1}
                            </div>
                          )}
                          <span className="absolute bottom-1 right-1 rounded-full border border-white/10 bg-black/60 px-1.5 py-0.5 text-[9px] text-white/80">
                            {index + 1}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </main>

      {!isStaticEditor && previewMode ? (
        <div className="fixed inset-0 z-30">
          <div className="absolute inset-0" />
          <button
            onClick={() => {
              player.setIsPlaying(false);
              player.reset();
              setPreviewMode(false);
            }}
            className="absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/60 text-sm text-white/80 backdrop-blur-xl transition hover:bg-white/10"
            aria-label="Fermer la prévisualisation"
          >
            ✕
          </button>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/50 px-4 py-2 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <button
                onClick={player.toggle}
                className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                {player.isPlaying ? "Pause" : "Lecture"}
              </button>
              <button
                onClick={() => {
                  player.reset();
                  player.setIsPlaying(true);
                }}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                Recommencer
              </button>
              <button
                onClick={openSaveDialog}
                className="rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
              >
                Enregistrer
              </button>
              <button
                onClick={() => {
                  player.setIsPlaying(false);
                  player.reset();
                  setPreviewMode(false);
                }}
                className="rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
              >
                Quitter
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isStaticEditor && activeTrajectoryPreviewId ? (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            onClick={() => setActiveTrajectoryPreviewId(null)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Fermer l’aperçu"
          />
          <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-[720px] -translate-x-1/2 -translate-y-1/2">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0b1020]/90 shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
              <button
                type="button"
                onClick={() => setActiveTrajectoryPreviewId(null)}
                className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/60 text-sm text-white/80 transition hover:bg-white/10"
                aria-label="Fermer"
              >
                ✕
              </button>
              <div className="aspect-video w-full bg-black/40">
                {trajectoryPreviews[activeTrajectoryPreviewId] ? (
                  <img
                    src={trajectoryPreviews[activeTrajectoryPreviewId]}
                    alt="Aperçu de l’action"
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
