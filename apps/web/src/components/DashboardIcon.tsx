// apps/web/src/components/DashboardIcon.tsx
"use client";

import Link from "next/link";

export default function DashboardIcon() {
  return (
    <div className="flex-none">
      <Link
        href="/dashboard"
        aria-label="Dashboard"
        className="group flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(10,12,24,0.95)] border border-white/10 shadow-[0_0_25px_rgba(148,163,253,0.45)] backdrop-blur-md transition-all hover:shadow-[0_0_40px_rgba(129,140,248,0.8)] active:scale-95"
      >
        <div className="relative h-9 w-9 rounded-[22px] bg-[radial-gradient(circle_at_top,rgba(129,140,248,0.55),rgba(15,23,42,1))] border border-white/10 overflow-hidden">
          {/* Glow interne */}
          <div className="absolute inset-0 rounded-[22px] bg-[radial-gradient(circle_at_bottom,rgba(56,189,248,0.45),transparent_65%)] opacity-80" />

          {/* Contenu : petites barres de stats */}
          <div className="relative flex h-full w-full items-end justify-center gap-[3px] px-2 pb-1.5">
            <div className="h-[9px] w-[3px] rounded-full bg-white/70 group-hover:h-[13px] transition-all" />
            <div className="h-[13px] w-[3px] rounded-full bg-white/80 group-hover:h-[17px] transition-all" />
            <div className="h-[7px] w-[3px] rounded-full bg-white/60 group-hover:h-[11px] transition-all" />
            <div className="h-[16px] w-[3px] rounded-full bg-white/90 group-hover:h-[20px] transition-all" />
          </div>

          {/* Halo de sélection */}
          <div className="pointer-events-none absolute inset-0 rounded-[22px] ring-0 ring-indigo-400/0 group-hover:ring-2 group-hover:ring-indigo-400/70 group-hover:shadow-[0_0_25px_rgba(129,140,248,0.9)] transition-all" />
        </div>
      </Link>
    </div>
  );
}