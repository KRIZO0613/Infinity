"use client";

import type { DashboardState } from "@/types/widgets";

const KEY = "infinity.dashboard.v1";

export function loadDashboard(): DashboardState {
  if (typeof window === "undefined") return { widgets: [], layout: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { widgets: [], layout: [] };
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed.widgets) return parsed as DashboardState;
    return { widgets: [], layout: [] };
  } catch {
    return { widgets: [], layout: [] };
  }
}

export function saveDashboard(state: DashboardState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error("Erreur de sauvegarde dashboard:", err);
  }
}

export function clearDashboard() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
