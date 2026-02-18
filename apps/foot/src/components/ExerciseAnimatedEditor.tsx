"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";
import { MiniGoalIcon, PassWallIcon } from "@/components/assets";

const TOOL_OPTIONS = [
  { key: "select", label: "Sélection" },
  { key: "player", label: "Joueur" },
  { key: "ball", label: "Ballon" },
  { key: "cone", label: "Plot" },
  { key: "disc", label: "Coupelle" },
  { key: "slalom_pole", label: "Piquet" },
  { key: "hurdle_bar", label: "Haie" },
  { key: "hurdle_pole", label: "Haie V" },
  { key: "mini_goal", label: "Mini but" },
  { key: "ladder", label: "Échelle" },
  { key: "pass_wall", label: "Mur" },
] as const;

type ToolKey = (typeof TOOL_OPTIONS)[number]["key"];

type ElementType =
  | "player"
  | "ball"
  | "cone"
  | "disc"
  | "slalom_pole"
  | "hurdle_bar"
  | "hurdle_pole"
  | "mini_goal"
  | "ladder"
  | "pass_wall";

type CanvasElement = {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  color?: string;
  label?: string;
  size?: number;
  orientation?: "up" | "down";
  rotation?: number;
};

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
  elementId?: string;
  points: Array<{ x: number; y: number }>;
  style?: {
    dashed?: boolean;
    width?: number;
    arrow?: boolean;
    variant?: "move" | "carry" | "ball";
  };
  durationMs: number;
};

type PitchPreset = "standard";

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

const DEFAULT_COLORS = [
  "#7B66FF",
  "#6A5CFF",
  "#00C8B4",
  "#F8C12C",
  "#FF6F91",
  "#FFFFFF",
];


const buildId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

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

const getPitchRect = (width: number, height: number): PitchRect => {
  const padding = 0;
  const isLandscape = width > height * 1.1;
  if (!isLandscape) {
    return { x: 0, y: 0, w: width, h: height, isLandscape };
  }
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
  if (type === "player") return 0.035;
  if (type === "ball") return 0.018;
  if (type === "cone") return 0.03;
  if (type === "slalom_pole") return 0.02;
  if (type === "hurdle_bar") return 0.02;
  if (type === "hurdle_pole") return 0.02;
  if (type === "mini_goal") return 0.025;
  if (type === "ladder") return 0.025;
  if (type === "pass_wall") return 0.028;
  return 0.02;
};

// Global scale to keep elements visually minimal by default.
const ELEMENT_SIZE_SCALE = 0.75;
const PLAYER_SIZE_SCALE = 0.95;
const CONE_SIZE_SCALE = 0.8;

const getRenderSize = (type: ElementType, size: number) => {
  const base = size * ELEMENT_SIZE_SCALE;
  if (type === "player") return base * PLAYER_SIZE_SCALE;
  if (type === "cone") return base * CONE_SIZE_SCALE;
  return base;
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
  const rungCount = 6;

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

  if (selected) {
    ctx.save();
    ctx.strokeStyle = "rgba(120,80,255,0.30)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.1, r * 1.35, r * 1.35, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

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
) => {
  const { x, y, w, h, isLandscape } = getPitchRect(width, height);
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  const fieldGradient = ctx.createLinearGradient(x, y, x + w, y + h);
  fieldGradient.addColorStop(0, "#0A0D16");
  fieldGradient.addColorStop(1, "#161832");
  ctx.fillStyle = fieldGradient;
  ctx.fillRect(x, y, w, h);

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
  return { x, y, w, h, preset };
};

export const drawElements = (
  ctx: CanvasRenderingContext2D,
  elements: CanvasElement[],
  selectedId: string | null,
  pitchRect: PitchRect,
  paths: Record<string, PathPoint[]> = {},
  strokes: Stroke[] = [],
  ballAttachedToId?: string | null,
  snapTargetId?: string | null,
  options?: { showOverlays?: boolean; showLabels?: boolean },
) => {
  const showOverlays = options?.showOverlays ?? true;
  const showLabels = options?.showLabels ?? true;
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
    const headLength = 10;
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

    Object.entries(paths).forEach(([id, points]) => {
      if (points.length < 2) return;
      ctx.save();
      ctx.beginPath();
      drawSmoothPath(points);
      ctx.strokeStyle =
        id === selectedId
          ? "rgba(167, 139, 250, 0.7)"
          : "rgba(148, 163, 184, 0.35)";
      ctx.lineWidth = id === selectedId ? 2 : 1;
      ctx.stroke();
      ctx.restore();
    });
  }

  elements.forEach((element) => {
    const px = pitchRect.x + element.x * pitchRect.w;
    const py = pitchRect.y + element.y * pitchRect.h;
    const size = getRenderSize(
      element.type,
      element.size ?? getDefaultSize(element.type),
    );
    const radius = size * pitchRect.w;

    ctx.save();
    if (showOverlays && element.id === selectedId) {
      ctx.shadowColor = "rgba(168, 85, 247, 0.6)";
      ctx.shadowBlur = radius * 0.8;
    }
    const rotation = (element.rotation ?? 0) * (Math.PI / 180);
    if (rotation) {
      ctx.translate(px, py);
      ctx.rotate(rotation);
      ctx.translate(-px, -py);
    }

    if (element.type === "player") {
      drawPlayerBodyHead(
        ctx,
        px,
        py,
        Math.max(6, radius),
        element.color ?? "#7B66FF",
        showLabels ? element.label ?? undefined : undefined,
        showOverlays && element.id === selectedId,
        showOverlays && element.id === ballAttachedToId,
        (element.label ?? "").toUpperCase() === "G",
      );

      if (showOverlays && element.id === snapTargetId) {
        ctx.strokeStyle = "rgba(253, 224, 71, 0.6)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (element.type === "ball") {
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

    if (showOverlays && element.id === selectedId && element.type !== "player") {
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(px, py, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
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
    const size = getRenderSize(
      element.type,
      element.size ?? getDefaultSize(element.type),
    );
    const radius = size * pitchRect.w;

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

    const scaleY = element.type === "disc" ? 0.45 : 1;
    const dx = (point.x - px) / radius;
    const dy = (point.y - py) / (radius * scaleY);
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
) => {
  const [elements, setElements] = useState<CanvasElement[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolKey>("select");
  const [playerColor, setPlayerColor] = useState(DEFAULT_COLORS[0]);
  const draggingRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const pitchRef = useRef<PitchRect>({ x: 0, y: 0, w: 1, h: 1 });

  const setPitchRect = (rect: PitchRect) => {
    pitchRef.current = rect;
  };

  const addElement = (type: ElementType, position: { x: number; y: number }) => {
    const baseColor =
      type === "ball"
        ? "#ffffff"
        : type === "mini_goal"
        ? "#F5F5FA"
        : playerColor;
    const newElement: CanvasElement = {
      id: buildId(),
      type,
      x: clamp01(position.x),
      y: clamp01(position.y),
      color: baseColor,
      label: type === "player" ? "" : undefined,
      size: getDefaultSize(type),
      orientation: type === "mini_goal" ? "down" : undefined,
      rotation: 0,
    };
    setElements((prev) => [...prev, newElement]);
    setSelectedId(newElement.id);
  };

  const updateElement = (id: string, patch: Partial<CanvasElement>) => {
    setElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    );
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
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

    // Priority: hit-test selection/drag first, even in placement mode.
    const hitId = hitTest(elements, point, pitchRect);
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
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      if (element) {
        handlers?.onDragStart?.(element.id, element.x, element.y);
      }
    } else {
      if (tool !== "select") {
        addElement(tool as ElementType, normalized);
        return;
      }
      setSelectedId(null);
    }
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (!draggingRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
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
    updateElement(draggingRef.current.id, { x: nextX, y: nextY });
    handlers?.onDragMove?.(draggingRef.current.id, nextX, nextY);
  };

  const handlePointerUp = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (draggingRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      handlers?.onDragEnd?.(draggingRef.current.id);
      if (!draggingRef.current.moved) {
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

const useKeyframesPlayer = (
  elements: CanvasElement[],
  frames: FrameSnapshot[],
  paths: Record<string, PathPoint[]>,
  strokes: Stroke[],
  strokesBase: BaseSnapshot | null,
): KeyframePlayer => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [frameDuration, setFrameDuration] = useState(2000);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const hasPaths = useMemo(
    () => Object.values(paths).some((points) => points.length >= 2),
    [paths],
  );
  const phases = useMemo(() => {
    const grouped = new Map<number, Stroke[]>();
    strokes.forEach((stroke) => {
      const phaseId = Number.isFinite(stroke.phaseId) ? stroke.phaseId : 0;
      if (!grouped.has(phaseId)) grouped.set(phaseId, []);
      grouped.get(phaseId)?.push(stroke);
    });
    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([phaseId, items]) => ({
        id: phaseId,
        strokes: items,
        duration: Math.max(1, ...items.map((item) => item.durationMs || 1)),
      }));
  }, [strokes]);
  const hasActions = phases.length > 0;

  useEffect(() => {
    if (!isPlaying || (frames.length < 2 && !hasPaths && !hasActions)) return;
    const loop = (time: number) => {
      if (!startRef.current) startRef.current = time;
      const elapsed = time - startRef.current;
      setPlayhead(elapsed);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      startRef.current = null;
    };
  }, [isPlaying, frames.length, hasPaths, hasActions]);

  const animatedElements = useMemo(() => {
    let animated = elements;

    if (isPlaying && phases.length > 0) {
      const totalDuration = phases.reduce(
        (sum, phase) => sum + (phase.duration || 0),
        0,
      );
      if (totalDuration > 0) {
        const local = playhead % totalDuration;
        let elapsed = 0;
        let currentPhaseIndex = 0;
        for (let i = 0; i < phases.length; i += 1) {
          const duration = Math.max(1, phases[i].duration || 0);
          if (local <= elapsed + duration) {
            currentPhaseIndex = i;
            break;
          }
          elapsed += duration;
        }
        const currentPhase = phases[currentPhaseIndex];
        const phaseDuration = Math.max(1, currentPhase.duration || 0);
        const phaseTime = Math.min(phaseDuration, Math.max(0, local - elapsed));

        const positions = new Map<string, { x: number; y: number }>();
        elements.forEach((el) => {
          const base = strokesBase?.[el.id];
          positions.set(el.id, base ?? { x: el.x, y: el.y });
        });

        const ballId = elements.find((el) => el.type === "ball")?.id ?? null;
        for (let i = 0; i < currentPhaseIndex; i += 1) {
          const phase = phases[i];
          phase.strokes.forEach((stroke) => {
            if (stroke.kind === "move" || stroke.kind === "carry") {
              const points = stroke.points;
              if (points.length >= 1 && stroke.elementId) {
                positions.set(stroke.elementId, {
                  x: points[points.length - 1].x,
                  y: points[points.length - 1].y,
                });
              }
              if (stroke.kind === "carry" && stroke.elementId && ballId) {
                const carried = positions.get(stroke.elementId);
                if (carried) {
                  positions.set(ballId, {
                    x: carried.x + 0.015,
                    y: carried.y + 0.01,
                  });
                }
              }
            }
          });
        }

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
                x:
                  points[i].x + (points[i + 1].x - points[i].x) * ratio,
                y:
                  points[i].y + (points[i + 1].y - points[i].y) * ratio,
              };
            }
            acc += lengths[i];
          }
          return points[points.length - 1];
        };

        const animatedPositions = new Map(positions);
        currentPhase.strokes.forEach((stroke) => {
          if (!stroke.elementId || stroke.points.length < 2) return;
          const t = Math.min(1, phaseTime / Math.max(1, stroke.durationMs || 0));
          const point = getPointAlong(stroke.points, t);
          animatedPositions.set(stroke.elementId, { x: point.x, y: point.y });
        });

        const activeCarry = currentPhase.strokes.find(
          (stroke) => stroke.kind === "carry",
        );
        if (activeCarry && ballId && activeCarry.elementId) {
          const carried =
            animatedPositions.get(activeCarry.elementId) ??
            positions.get(activeCarry.elementId);
          if (carried) {
            animatedPositions.set(ballId, {
              x: carried.x + 0.015,
              y: carried.y + 0.01,
            });
          }
        }

        animated = elements.map((element) => {
          const base = animatedPositions.get(element.id) ?? { x: element.x, y: element.y };
          return { ...element, x: base.x, y: base.y };
        });

        return animated;
      }
    }

    if (isPlaying && frames.length >= 2) {
      const totalDuration = frames.length * frameDuration;
      const local = playhead % totalDuration;
      const index = Math.floor(local / frameDuration);
      const nextIndex = (index + 1) % frames.length;
      const t = (local % frameDuration) / frameDuration;

      const currentMap = new Map(
        frames[index].elementsSnapshot.map((snap) => [snap.id, snap]),
      );
      const nextMap = new Map(
        frames[nextIndex].elementsSnapshot.map((snap) => [snap.id, snap]),
      );

      animated = elements.map((element) => {
        const current = currentMap.get(element.id) ?? {
          x: element.x,
          y: element.y,
        };
        const next = nextMap.get(element.id) ?? current;
        return {
          ...element,
          x: current.x + (next.x - current.x) * t,
          y: current.y + (next.y - current.y) * t,
        };
      });
    }

    if (isPlaying && hasPaths) {
      animated = animated.map((element) => {
        const points = paths[element.id];
        if (!points || points.length < 2) return element;
        const duration = points[points.length - 1].t;
        if (duration <= 0) return element;
        const local = playhead % duration;
        let index = 0;
        while (index < points.length - 2 && points[index + 1].t < local) {
          index += 1;
        }
        const current = points[index];
        const next = points[index + 1] ?? current;
        const segment = Math.max(1, next.t - current.t);
        const t = Math.min(1, Math.max(0, (local - current.t) / segment));
        return {
          ...element,
          x: current.x + (next.x - current.x) * t,
          y: current.y + (next.y - current.y) * t,
        };
      });
    }

    return animated;
  }, [
    elements,
    frames,
    frameDuration,
    isPlaying,
    playhead,
    paths,
    hasPaths,
    phases,
    strokesBase,
  ]);

  const toggle = () => setIsPlaying((prev) => !prev);
  const reset = () => {
    startRef.current = null;
    setPlayhead(0);
  };
  const restart = () => {
    startRef.current = null;
    setPlayhead(0);
    setIsPlaying(true);
  };

  return {
    isPlaying,
    playhead,
    toggle,
    setIsPlaying,
    reset,
    restart,
    frameDuration,
    setFrameDuration,
    animatedElements,
  };
};

export default function ExerciseAnimatedEditor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const router = useRouter();
  const [canvasSize, setCanvasSize] = useState({ w: 1200, h: 720 });
  const [name, setName] = useState("Exercice animé");
  const [frames, setFrames] = useState<FrameSnapshot[]>([]);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [pitchPreset] = useState<PitchPreset>("standard");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [recordPathMode, setRecordPathMode] = useState(false);
  const [currentRecordingElementId, setCurrentRecordingElementId] = useState<
    string | null
  >(null);
  const [recordMode, setRecordMode] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [strokesBase, setStrokesBase] = useState<BaseSnapshot | null>(null);
  const [groupMode, setGroupMode] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [animationMode, setAnimationMode] = useState<"image" | "video" | null>(null);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement | null>(null);
  const [showToolboxMenu, setShowToolboxMenu] = useState(false);
  const toolboxMenuRef = useRef<HTMLDivElement | null>(null);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const colorMenuRef = useRef<HTMLDivElement | null>(null);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [ballAttachedToId, setBallAttachedToId] = useState<string | null>(null);
  const [framePreviews, setFramePreviews] = useState<Record<string, string>>({});
  const [showSequenceDebug, setShowSequenceDebug] = useState(false);
  const [snapTargetId, setSnapTargetId] = useState<string | null>(null);
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
  const toolboxDiscIconRef = useRef<HTMLCanvasElement | null>(null);
  const toolboxPoleIconRef = useRef<HTMLCanvasElement | null>(null);
  const pathRecordRef = useRef<{
    id: string;
    startTime: number;
    lastTime: number;
    lastX: number;
    lastY: number;
  } | null>(null);
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
  } = useCanvasElements([], {
    onDragStart: (id, x, y) => {
      const element = elements.find((el) => el.id === id);
      const isRecordable =
        element?.type === "player" || element?.type === "ball";

      if (element?.type === "ball" && ballAttachedToId) {
        setBallAttachedToId(null);
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
        const existing = prev[id] ?? [];
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
          startTime: now - baseT,
          lastTime: now,
          lastX: x,
          lastY: y,
        };
        return { ...prev, [id]: next };
      });
    },
    onDragMove: (id, x, y) => {
      if (ballAttachedToId && primaryBall) {
        if (id === ballAttachedToId) {
          updateElement(primaryBall.id, {
            x: clamp01(x + 0.015),
            y: clamp01(y + 0.01),
          });
        }
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
        const existing = prev[id] ?? [];
        return { ...prev, [id]: [...existing, { x, y, t }] };
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
            const isCarry = !isBall && ballAttachedToId === seq.id;
            const durationMs = seq.points[seq.points.length - 1].t || 1200;
            appendStroke({
              id: buildId(),
              kind: isCarry ? "carry" : "move",
              elementId: seq.id,
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

      if (!recordPathMode) {
        pathRecordRef.current = null;
      }
    },
    onElementClick: (element) => {
      void element;
    },
  });

  const player = useKeyframesPlayer(
    elements,
    frames,
    paths,
    strokes,
    strokesBase,
  );

  const selectedElement = useMemo(
    () => elements.find((el) => el.id === selectedId) ?? null,
    [elements, selectedId],
  );
  const playerElements = useMemo(
    () => elements.filter((el) => el.type === "player"),
    [elements],
  );
  const ballElements = useMemo(
    () => elements.filter((el) => el.type === "ball"),
    [elements],
  );
  const primaryBall = useMemo(
    () => ballElements[0] ?? null,
    [ballElements],
  );
  const hasPlayableContent = useMemo(() => {
    if (strokes.length > 0) return true;
    if (frames.length >= 2) return true;
    return Object.values(paths).some((points) => points.length >= 2);
  }, [strokes.length, frames.length, paths]);

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

  const showToast = (kind: "success" | "error", message: string) => {
    setToast({ kind, message });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3200);
  };

  const appendStroke = (stroke: Omit<Stroke, "order" | "phaseId">) => {
    if (!strokesBaseRef.current) {
      const snapshot: BaseSnapshot = {};
      elements.forEach((el) => {
        snapshot[el.id] = { x: el.x, y: el.y };
      });
      strokesBaseRef.current = snapshot;
      setStrokesBase(snapshot);
    }
    const prev = strokesRef.current;
    const last = prev[prev.length - 1];
    const nextPhaseId =
      groupMode && last ? last.phaseId : last ? last.phaseId + 1 : 0;
    if (groupMode && last && stroke.elementId) {
      const phaseStrokes = prev.filter((item) => item.phaseId === nextPhaseId);
      const sameElement = phaseStrokes.some(
        (item) => item.elementId === stroke.elementId,
      );
      const ballId = primaryBall?.id ?? null;
      const hasCarry = phaseStrokes.some((item) => item.kind === "carry");
      const hasBallMove =
        ballId &&
        phaseStrokes.some(
          (item) => item.kind === "move" && item.elementId === ballId,
        );
      const isBallMove = ballId && stroke.kind === "move" && stroke.elementId === ballId;
      if (sameElement) {
        showToast("error", "Impossible: 2 actions sur le même joueur.");
        return;
      }
      if ((stroke.kind === "carry" && (hasCarry || hasBallMove)) || (isBallMove && hasCarry)) {
        showToast("error", "Impossible: 2 actions sur le ballon en action groupée.");
        return;
      }
    }
    const next = [
      ...prev,
      { ...stroke, order: prev.length + 1, phaseId: nextPhaseId },
    ];
    strokesRef.current = next;
    setStrokes(next);
    if (groupMode) {
      setGroupMode(false);
    }
  };

  const attachBallToPlayer = (playerId: string, ballId?: string | null) => {
    const ball = ballElements.find((el) => el.id === ballId) ?? ballElements[0];
    const player = playerElements.find((el) => el.id === playerId);
    if (!ball || !player) {
      showToast("error", "Ajoute un ballon et un joueur.");
      return;
    }
    setBallAttachedToId(playerId);
    updateElement(ball.id, {
      x: clamp01(player.x + 0.015),
      y: clamp01(player.y + 0.01),
    });
  };

  const detachBall = () => {
    setBallAttachedToId(null);
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
    const isLandscape = canvasSize.w > canvasSize.h * 1.1;
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
    if (!showModeMenu) return;
    const handler = (event: MouseEvent) => {
      if (!modeMenuRef.current) return;
      if (!modeMenuRef.current.contains(event.target as Node)) {
        setShowModeMenu(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [showModeMenu]);

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

  const toggleTool = (next: ToolKey) => {
    setTool((prev) => {
      if (next === "select") return "select";
      return prev === next ? "select" : next;
    });
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
    const pitchRect = getPitchRect(canvasSize.w, canvasSize.h);
    setPitchRect(pitchRect);
    drawPitch(ctx, canvasSize.w, canvasSize.h, pitchPreset);
    drawElements(
      ctx,
      player.animatedElements,
      selectedId,
      pitchRect,
      paths,
      strokes,
      ballAttachedToId,
      snapTargetId,
      { showOverlays: !previewMode, showLabels: !previewMode },
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
    ballAttachedToId,
    snapTargetId,
    previewMode,
  ]);

  useEffect(() => {
    renderToolIcon(playerIconRef.current, 28, (ctx, s) => {
      drawPlayerBodyHead(ctx, s / 2, s / 2, s * 0.32, playerColor ?? "#7B66FF", "10", false, false, false);
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
  }, [playerColor, showToolboxMenu]);

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

  const simplifyStrokePoints = (
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
        const nextPoints = simplifyStrokePoints(stroke.points, 12);
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
    const pitchRect = drawPitch(ctx, width, height, pitchPreset);
    const elementsForFrame = elements.map((el) => {
      const snap = snapshot.find((item) => item.id === el.id);
      return snap ? { ...el, x: snap.x, y: snap.y } : el;
    });
    drawElements(ctx, elementsForFrame, null, pitchRect, {}, [], null, null, {
      showOverlays: false,
      showLabels: false,
    });
    return canvas.toDataURL("image/png");
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
    return {
      title: name.trim() || "Exercice animé",
      category: "echauffement",
      duration: 15,
      type: "animated",
      animation_data: {
        pitchPreset,
        elements,
        keyframes: frames,
        paths,
        strokes,
        ballAttachedToId,
        strokesBase,
      },
    };
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      if (userError || !userData?.user) {
        throw new Error("Utilisateur non connecté.");
      }
      const payload = exportExercise();
      const { error } = await supabase.from("training_exercises").insert({
        title: payload.title,
        category: payload.category,
        duration: payload.duration,
        type: payload.type,
        animation_data: payload.animation_data,
        created_by: userData.user.id,
      });
      if (error) {
        throw new Error(error.message);
      }
      showToast("success", "Exercice enregistré.");
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
    setRecordMode(false);
    setStrokes([]);
    strokesRef.current = [];
    setStrokesBase(null);
    strokesBaseRef.current = null;
    setGroupMode(false);
    setBallAttachedToId(null);
    setFramePreviews({});
    sequenceDragRef.current = null;
    setSnapTargetId(null);
    clearDrag();
    showToast("success", "Éditeur réinitialisé.");
  };

  return (
    <div className="h-screen w-full bg-[#070a14] text-slate-100">
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
      {!previewMode ? (
        <div className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-white/5 bg-black/40 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-slate-200 transition hover:bg-white/10"
              title="Retour"
            >
              ←
            </button>
            <div ref={modeMenuRef} className="relative">
              <button
                onClick={() => setShowModeMenu((prev) => !prev)}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                Animation
              </button>
              {showModeMenu ? (
                <div className="absolute left-0 top-full mt-2 w-44 rounded-2xl border border-white/10 bg-[#0b1020]/95 p-2 text-xs shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                  <button
                    onClick={() => {
                      setAnimationMode("image");
                      setRecordMode(false);
                      setGroupMode(false);
                      setShowModeMenu(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                      animationMode === "image"
                        ? "bg-white/10 text-white"
                        : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    Par image
                    {animationMode === "image" ? "✓" : ""}
                  </button>
                  <button
                    onClick={() => {
                      setAnimationMode("video");
                      setShowModeMenu(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                      animationMode === "video"
                        ? "bg-white/10 text-white"
                        : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    Par vidéo
                    {animationMode === "video" ? "✓" : ""}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleTool("player")}
                title="Joueur"
                className={[
                  "flex h-9 w-9 items-center justify-center rounded-full border transition",
                  tool === "player"
                    ? "border-violet-400/70 bg-violet-500/25 text-white"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                ].join(" ")}
              >
                <canvas ref={playerIconRef} className="h-6 w-6" />
              </button>
              <button
                onClick={() => toggleTool("ball")}
                title="Ballon"
                className={[
                  "flex h-9 w-9 items-center justify-center rounded-full border text-sm transition",
                  tool === "ball"
                    ? "border-violet-400/70 bg-violet-500/25 text-white"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                ].join(" ")}
              >
                ⚽
              </button>
              <div ref={toolboxMenuRef} className="relative">
                <button
                  onClick={() => setShowToolboxMenu((prev) => !prev)}
                  title="Boîte à outils"
                  className={[
                    "flex h-9 w-9 items-center justify-center rounded-full border text-sm transition",
                    showToolboxMenu
                      ? "border-violet-400/70 bg-violet-500/25 text-white"
                      : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                  ].join(" ")}
                >
                  🧩
                </button>
                {showToolboxMenu ? (
                  <div className="absolute left-0 top-full z-20 mt-2 grid w-52 grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-[#0b1020]/95 p-3 text-xs shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                    {(
                      [
                        "cone",
                        "disc",
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
                          <canvas ref={hurdleBarMenuIconRef} className="h-6 w-6" />
                        ) : key === "hurdle_pole" ? (
                          <canvas ref={hurdlePoleMenuIconRef} className="h-6 w-6" />
                        ) : key === "ladder" ? (
                          <canvas ref={ladderMenuIconRef} className="h-6 w-6" />
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
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 transition hover:bg-white/10"
                  style={{
                    background:
                      "conic-gradient(from 90deg, #7B66FF, #22D3EE, #F59E0B, #F472B6, #34D399, #7B66FF)",
                  }}
                >
                  <span className="h-6 w-6 rounded-full bg-black/40" />
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
              <button
                onClick={() => setRecordPathMode((prev) => !prev)}
                title="Trajet"
                className={[
                  "flex h-9 w-9 items-center justify-center rounded-full border text-sm transition",
                  recordPathMode
                    ? "border-violet-400/70 bg-violet-500/25 text-white"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                ].join(" ")}
              >
                〰
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={player.toggle}
              disabled={!hasPlayableContent}
              title={player.isPlaying ? "Pause" : "Lecture"}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
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
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
            >
              👁
            </button>
            {animationMode === "image" ? (
              <button
                onClick={handleAddFrame}
                title="Ajouter une image clé"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-slate-200 transition hover:bg-white/10"
              >
                ＋
              </button>
            ) : null}

            {animationMode === "video" ? (
              <>
                <button
                  onClick={() =>
                    setRecordMode((prev) => {
                      if (prev) {
                        sequenceDragRef.current = null;
                        setGroupMode(false);
                        return false;
                      }
                      if (!strokesBaseRef.current) {
                        const snapshot: BaseSnapshot = {};
                        elements.forEach((el) => {
                          snapshot[el.id] = { x: el.x, y: el.y };
                        });
                        setStrokesBase(snapshot);
                        strokesBaseRef.current = snapshot;
                      }
                      return true;
                    })
                  }
                  title="REC"
                  className={[
                    "flex h-9 w-9 items-center justify-center rounded-full border text-sm transition",
                    recordMode
                      ? "border-rose-400/40 bg-rose-500/20 text-rose-100"
                      : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                  ].join(" ")}
                >
                  ●
                </button>
                <button
                  onClick={() => setGroupMode((prev) => !prev)}
                  title="Action groupée"
                  className={[
                    "flex h-9 w-9 items-center justify-center rounded-full border text-sm transition",
                    groupMode
                      ? "border-violet-300/40 bg-violet-500/20 text-violet-100"
                      : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                  ].join(" ")}
                >
                  ⛓
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex h-[calc(100vh-72px)]">
        <div className="relative flex flex-1">
          <main className="relative flex flex-1 flex-col">
            {null}
            <div className="relative min-h-0 flex-1 w-full overflow-visible">
              <div className="flex h-full w-full items-center justify-center">
                <div className="mx-auto inline-flex h-full w-full items-center justify-center">
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
                    const pitchRect = getPitchRect(canvasSize.w, canvasSize.h);
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
                    addElement(toolKey as ElementType, normalized);
                  }}
                  >
                    <canvas
                      ref={canvasRef}
                      className="h-full w-full"
                      onPointerDown={previewMode ? undefined : handlePointerDown}
                      onPointerMove={previewMode ? undefined : handlePointerMove}
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
                                  event.currentTarget.setPointerCapture(
                                    event.pointerId,
                                  );
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
                                  event.currentTarget.releasePointerCapture(
                                    event.pointerId,
                                  );
                                  if (!ref.moved) {
                                    setActiveFrameId(frame.id);
                                  }
                                  frameDragRef.current = null;
                                }}
                                onPointerCancel={(event) => {
                                  event.currentTarget.releasePointerCapture(
                                    event.pointerId,
                                  );
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
                  </div>
                </div>
              </div>
            </div>
          </main>

          {!previewMode ? (
            <button
              onClick={() => setShowSidePanel((prev) => !prev)}
              className={[
                "absolute top-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/60 text-sm text-slate-200 backdrop-blur-xl transition hover:bg-white/10",
                showSidePanel ? "right-[332px]" : "right-4",
              ].join(" ")}
              title={showSidePanel ? "Fermer" : "Ouvrir"}
            >
              {showSidePanel ? "→" : "←"}
            </button>
          ) : null}

          {!previewMode && showSidePanel ? (
            <aside className="w-[320px] border-l border-white/5 bg-black/40 p-4 backdrop-blur-xl">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Propriétés
            </h3>
            {selectedElement ? (
              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Type
                  </p>
                  <p className="mt-1 text-sm text-slate-100">
                    {selectedElement.type}
                  </p>
                </div>

                {selectedElement.type !== "ball" ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Couleur
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {DEFAULT_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() =>
                            updateElement(selectedElement.id, { color })
                          }
                          className={`h-7 w-7 rounded-full border transition ${
                            selectedElement.color === color
                              ? "border-white/80"
                              : "border-white/10"
                          }`}
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {selectedElement.type === "player" ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Numéro
                    </p>
                    <input
                      value={selectedElement.label ?? ""}
                      onChange={(event) =>
                        updateElement(selectedElement.id, {
                          label: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100"
                      placeholder="10"
                    />
                  </div>
                ) : null}

                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Taille
                  </p>
                  <input
                    type="range"
                    min={0.006}
                    max={0.08}
                    step={0.001}
                    value={selectedElement.size ?? getDefaultSize(selectedElement.type)}
                    onChange={(event) =>
                      updateElement(selectedElement.id, {
                        size: Number(event.target.value),
                      })
                    }
                    className="mt-2 w-full"
                  />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Angle
                  </p>
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
                    className="mt-2 w-full"
                  />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Ballon
                  </p>
                  {selectedElement.type === "player" ? (
                    <div className="mt-2 space-y-2">
                      {ballElements.length === 0 ? (
                        <p className="text-xs text-slate-400">
                          Ajoute un ballon pour associer.
                        </p>
                      ) : (
                        <>
                          {ballElements.length > 1 ? (
                            <select
                              value={associationTargetBallId ?? ""}
                              onChange={(event) =>
                                setAssociationTargetBallId(event.target.value)
                              }
                              className="w-full rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100"
                            >
                              {ballElements.map((ball, index) => (
                                <option key={ball.id} value={ball.id}>
                                  Ballon {index + 1}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() =>
                                attachBallToPlayer(
                                  selectedElement.id,
                                  associationTargetBallId,
                                )
                              }
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
                            >
                              ⚽ Associer ballon
                            </button>
                            {ballAttachedToId === selectedElement.id ? (
                              <button
                                onClick={detachBall}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
                              >
                                Détacher
                              </button>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  ) : selectedElement.type === "ball" ? (
                    <div className="mt-2 space-y-2">
                      {playerElements.length === 0 ? (
                        <p className="text-xs text-slate-400">
                          Ajoute un joueur pour associer.
                        </p>
                      ) : (
                        <>
                          <select
                            value={associationTargetPlayerId ?? ""}
                            onChange={(event) =>
                              setAssociationTargetPlayerId(event.target.value)
                            }
                            className="w-full rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100"
                          >
                            {playerElements.map((player) => (
                              <option key={player.id} value={player.id}>
                                {player.label ? `J${player.label}` : player.id}
                              </option>
                            ))}
                          </select>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => {
                                if (associationTargetPlayerId) {
                                  attachBallToPlayer(
                                    associationTargetPlayerId,
                                    selectedElement.id,
                                  );
                                }
                              }}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
                            >
                              ⚽ Associer ballon
                            </button>
                            {ballAttachedToId ? (
                              <button
                                onClick={detachBall}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
                              >
                                Détacher
                              </button>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-400">
                      Sélectionne un joueur ou le ballon pour associer.
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Tracé
                  </p>
                  {selectedId ? (
                    <p className="mt-1 text-[10px] text-slate-500">
                      {strokes.filter((stroke) => stroke.elementId === selectedId)
                        .length}{" "}
                      traits ·{" "}
                      {paths[selectedId]?.length
                        ? `${paths[selectedId].length} pts`
                        : "0 pt"}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={clearPathForSelected}
                      disabled={
                        !(
                          paths[selectedElement.id]?.length ||
                          strokes.some(
                            (stroke) => stroke.elementId === selectedElement.id,
                          )
                        )
                      }
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
                    >
                      Effacer tracé
                    </button>
                    <button
                      onClick={simplifyPathForSelected}
                      disabled={
                        !(
                          paths[selectedElement.id]?.length ||
                          strokes.some(
                            (stroke) => stroke.elementId === selectedElement.id,
                          )
                        )
                      }
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
                    >
                      Lisser / Simplifier
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedId(null)}
                  className="w-full rounded-full border border-white/10 bg-transparent py-2 text-xs text-slate-300 transition hover:bg-white/5"
                >
                  Désélectionner
                </button>
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-400">
                Sélectionne un élément sur le terrain.
              </p>
            )}
          </div>

          {/* Section images clés supprimée : séquences gérées sous le terrain en mode image */}

          {showSequenceDebug ? (
            <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Séquence (debug)
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSequenceDebug(false)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-200"
                  >
                    Masquer
                  </button>
                <button
                  onClick={() => {
                    setStrokes([]);
                    strokesRef.current = [];
                    setStrokesBase(null);
                    strokesBaseRef.current = null;
                    setGroupMode(false);
                    setBallAttachedToId(null);
                  }}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-200"
                  >
                    Effacer
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-2 text-xs text-slate-300">
                {strokes.length === 0 ? (
                  <p className="text-slate-400">Aucune action enregistrée.</p>
                ) : (
                  strokes.map((stroke, index) => {
                    const getLabel = (id: string) => {
                      const el = elements.find((item) => item.id === id);
                      if (!el) return id.slice(0, 4);
                      if (el.type === "ball") return "Ballon";
                      return el.label ? `J${el.label}` : id.slice(0, 4);
                    };
                    if (stroke.kind === "carry") {
                      return (
                        <div key={stroke.id}>
                          {index + 1}. Dribble {getLabel(stroke.elementId ?? "")}
                        </div>
                      );
                    }
                    if (stroke.kind === "move") {
                      return (
                        <div key={stroke.id}>
                          {index + 1}. Déplacement {getLabel(stroke.elementId ?? "")}
                        </div>
                      );
                    }
                    return (
                      <div key={stroke.id}>
                        {index + 1}. Attente
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowSequenceDebug(true)}
              className="mt-4 w-full rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-slate-200"
            >
              Debug séquence
            </button>
          )}
        </aside>
        ) : null}
        </div>
      </div>
      {previewMode ? (
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
    </div>
  );
}
