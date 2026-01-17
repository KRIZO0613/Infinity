"use client";

import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  LayoutGrid,
  Shield,
  CircleDot,
  Calendar,
  BarChart3,
} from "lucide-react";

/* ================= TYPES ================= */

type Item = {
  label: string;
  href: string;
  icon: ReactNode;
};

type SidebarNavProps = {
  variant?: "desktop" | "tablet" | "mobile";
};

/* ================= DATA ================= */

const ICON_SIZE = 18;
const ICON_STROKE = 1.7;

const items: Item[] = [
  {
    label: "Tableau",
    href: "/app",
    icon: <LayoutGrid size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
  {
    label: "Club",
    href: "/app/club",
    icon: <Shield size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
  {
    label: "Matchs",
    href: "/app/matches",
    icon: <CircleDot size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
  {
    label: "Entraînements",
    href: "/app/trainings",
    icon: <Calendar size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
  {
    label: "Stats",
    href: "/app/stats",
    icon: <BarChart3 size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
];

/* ================= DESKTOP (SIDEBAR GAUCHE) ================= */

function DesktopLink({ item }: { item: Item }) {
  const router = useRouter();
  const pathname = usePathname();
  const active = pathname === item.href;

  return (
    <button
      type="button"
      onClick={() => router.push(item.href)}
      className={[
        "group flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left transition",
        active
          ? `
            bg-white/5
            border border-[#8b5cf6]/70
            shadow-[0_0_8px_rgba(139,92,246,0.75)]
          `
          : "hover:bg-white/5",
      ].join(" ")}
    >
      {/* Icon */}
      <span
        className={[
          "transition",
          active
            ? "text-[#c4b5fd]"
            : "text-slate-400 group-hover:text-slate-200",
        ].join(" ")}
      >
        {item.icon}
      </span>

      {/* Label */}
      <span className="text-sm font-medium text-slate-100">
        {item.label}
      </span>
    </button>
  );
}

/* ================= TOP NAV (TABLET / MOBILE) ================= */

function TopNav({ showText }: { showText: boolean }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <nav
      className="
        flex items-center justify-start
        gap-3 sm:gap-4 md:gap-6
        overflow-x-auto
        rounded-2xl bg-[#050716]/65 px-3 py-2
        backdrop-blur
        shadow-[0_0_50px_rgba(0,0,0,0.35)]
      "
    >
      {items.map((item) => {
        const active = pathname === item.href;

        return (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            aria-label={item.label}
            className={[
              "relative flex items-center justify-center rounded-xl transition",
              "flex-shrink-0 whitespace-nowrap",
              showText
                ? "h-10 px-3 gap-2"
                : "h-10 w-11 sm:w-12",
              active
                ? "text-[#c4b5fd] bg-white/5"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5",
            ].join(" ")}
          >
            {item.icon}

            {showText && (
              <span className="text-xs font-medium text-slate-100">
                {item.label}
              </span>
            )}

            {/* underline néon fin */}
            {active && (
              <span className="
                absolute -bottom-1 h-[2px] w-6
                rounded-full
                bg-[#8b5cf6]/90
                shadow-[0_0_12px_rgba(139,92,246,0.9)]
              " />
            )}
          </button>
        );
      })}
    </nav>
  );
}

/* ================= EXPORT ================= */

export default function SidebarNav({ variant = "desktop" }: SidebarNavProps) {
  if (variant === "mobile") return <TopNav showText={false} />;
  if (variant === "tablet") return <TopNav showText={true} />;

  // Desktop : colonne gauche
  return (
    <aside className="
      rounded-3xl
      bg-[#050716]/80
      p-2
      backdrop-blur
      shadow-[0_0_80px_rgba(0,0,0,0.7)]
    ">
      <nav className="flex flex-col gap-2">
        {items.map((item) => (
          <DesktopLink key={item.href} item={item} />
        ))}
      </nav>
    </aside>
  );
}