"use client";

import Link from "next/link";
import { neonStyle, tokens } from "@/lib/tokens";
import ModeOrb from "@/components/ui/ModeOrb";

export default function Header() {
  return (
    <header
      className="header-glass fixed top-0 left-0 z-50 flex w-full items-center justify-between border-b border-muted px-8 py-4 backdrop-blur-xl transition-colors"
      style={{
        borderRadius: tokens.radius.xl,
        boxShadow: tokens.shadow.soft,
        transition: tokens.transition.normal,
      }}
    >
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-3 text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
          style={{ transition: tokens.transition.normal }}
        >
          <div
            className="flex h-9 w-9 items-center justify-center bg-gradient-to-r from-indigo-500 to-purple-600 text-lg font-semibold"
            style={{
              borderRadius: tokens.radius.pill,
              ...neonStyle(tokens.color.accent),
              transition: tokens.transition.normal,
            }}
            aria-hidden
          >
            <span className="text-white">∞</span>
          </div>
          <span className="text-lg font-semibold tracking-wide">Infinity</span>
        </Link>
        {/* TODO: Inject main navigation (Table / Fiche / Calendrier) */}
      </div>
      <ModeOrb />
    </header>
  );
}
