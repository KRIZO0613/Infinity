// apps/web/src/components/layout/Dock.tsx
"use client";

import CalendarLauncher from "@/components/calendar/CalendarLauncher";
import DashboardIcon from "@/components/DashboardIcon";

export default function Dock() {
  return (
    <footer className="fixed inset-x-0 bottom-4 z-40 flex justify-center pointer-events-none">
      <div className="dock mat-dock pointer-events-auto flex items-center gap-3">
        {/* Icône calendrier */}
        <CalendarLauncher />

        {/* Icône Dashboard (stats / boards) */}
        <DashboardIcon />
      </div>
    </footer>
  );
}
