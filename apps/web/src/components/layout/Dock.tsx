// apps/web/src/components/layout/Dock.tsx
"use client";

import CalendarLauncher from "@/components/calendar/CalendarLauncher";
import DashboardIcon from "@/components/DashboardIcon";

export default function Dock() {
  return (
    <footer className="fixed inset-x-0 bottom-4 z-40 flex justify-center pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-3xl border border-white/10 bg-[rgba(10,12,24,0.92)] px-3 py-2 backdrop-blur-xl shadow-[0_0_30px_rgba(15,23,42,0.9)]">
        {/* Icône calendrier */}
        <CalendarLauncher />

        {/* Icône Dashboard (stats / boards) */}
        <DashboardIcon />
      </div>
    </footer>
  );
}