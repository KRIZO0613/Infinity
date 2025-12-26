// apps/web/src/components/DashboardIcon.tsx
"use client";

import Link from "next/link";

export default function DashboardIcon() {
  return (
    <div className="flex-none">
      <Link
        href="/dashboard"
        aria-label="Dashboard"
        className="group dock-item flex h-14 w-14 items-center justify-center"
      >
        <svg
          aria-hidden
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-current"
        >
          <path d="M5 18.5V9.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v9" />
          <path d="M11 18.5V5.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v13" />
          <path d="M17 18.5v-6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v6" />
        </svg>
      </Link>
    </div>
  );
}
