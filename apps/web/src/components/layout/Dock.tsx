// apps/web/src/components/layout/Dock.tsx
"use client";

import Link from "next/link";
import CalendarLauncher from "@/components/calendar/CalendarLauncher";
import DashboardIcon from "@/components/DashboardIcon";

export default function Dock() {
  return (
    <footer className="fixed inset-x-0 bottom-4 z-[90] flex justify-center pointer-events-auto">
      <div className="dock mat-dock flex items-center gap-3">
        {/* Icône calendrier */}
        <CalendarLauncher />

        {/* Icône accueil */}
        <div className="flex-none">
          <Link
            href="/"
            aria-label="Accueil"
            className="group dock-item flex h-14 w-14 items-center justify-center"
          >
            <svg
              aria-hidden
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-current"
            >
              <path d="M4 11.5 12 5l8 6.5" />
              <path d="M6.5 10.5V19a1 1 0 0 0 1 1h3.5v-5h2v5h3.5a1 1 0 0 0 1-1v-8.5" />
            </svg>
          </Link>
        </div>

        {/* Icône Dashboard (stats / boards) */}
        <DashboardIcon />
      </div>
    </footer>
  );
}
