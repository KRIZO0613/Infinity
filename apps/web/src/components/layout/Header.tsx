"use client";

import Link from "next/link";
import ModeOrb from "@/components/ui/ModeOrb";

export default function Header() {
  return (
    <header
      className="header-glass mat-header fixed left-1/2 top-4 z-[160] flex w-[min(1120px,calc(100%-2rem))] -translate-x-1/2 items-center justify-between px-5 py-3 lg:px-8 lg:py-4"
    >
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="logo-link flex items-center gap-3"
        >
          <div className="logo-glass flex h-11 w-11 items-center justify-center text-lg font-semibold">
            <span className="title-text">∞</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="title-text text-base font-semibold tracking-tight">Infinity</span>
            <span className="muted-text text-[11px] uppercase tracking-[0.24em]">Workspace</span>
          </div>
        </Link>
        {/* TODO: Inject main navigation (Table / Fiche / Calendrier) */}
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/projects/new"
          className="btn-plain flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-slate-900"
          style={{
            background: "transparent",
            boxShadow: "none",
            border: "none",
            opacity: 0.92,
            transition: "opacity 0.2s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.92")}
        >
          <span className="text-base leading-none">+</span>
          <span>Projet</span>
        </Link>
        <button
          type="button"
          aria-label="Rechercher"
          className="btn-plain flex h-10 w-10 items-center justify-center rounded-full"
          style={{
            background: "transparent",
            boxShadow: "none",
            border: "none",
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="rgba(15,23,42,0.72)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="5.5" fill="rgba(255,255,255,0.18)" />
            <line x1="15.5" y1="15.5" x2="20.5" y2="20.5" />
          </svg>
        </button>
        <ModeOrb />
      </div>
    </header>
  );
}
