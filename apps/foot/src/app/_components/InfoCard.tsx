"use client";

import type { ReactNode } from "react";

export type InfoCardProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function InfoCard({
  title,
  description,
  actions,
  children,
  className = "",
}: InfoCardProps) {
  return (
    <section
      className={[
        "relative overflow-hidden rounded-3xl border border-white/10",
        "bg-[linear-gradient(180deg,#14182f_0%,#0b0e1b_100%)] backdrop-blur-sm",
        "px-6 py-5 shadow-[0_12px_32px_rgba(0,0,0,0.6)]",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-3xl",
        "before:bg-[radial-gradient(110%_110%_at_0%_0%,rgba(124,99,255,0.22),transparent_55%)] before:content-['']",
        className,
      ].join(" ")}
    >
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div className="inline-flex flex-col items-start">
            <h2 className="text-xl font-semibold tracking-tight text-slate-50">
              {title}
            </h2>
            <span className="mt-3 h-px w-full bg-[#8b5cf6]/70 shadow-[0_0_8px_rgba(139,92,246,0.55)]" />
            {description ? (
              <p className="mt-3 text-sm text-slate-400">{description}</p>
            ) : null}
          </div>

          {actions ? (
            <div className="flex items-center justify-end gap-2">{actions}</div>
          ) : null}
        </div>

        <div className="mt-5">{children}</div>
      </div>
    </section>
  );
}
