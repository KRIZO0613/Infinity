import type { ReactNode } from "react";

type DashboardLayoutProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export default function DashboardLayout({
  eyebrow,
  title,
  subtitle,
  children,
}: DashboardLayoutProps) {
  return (
    <div className="relative">
      {/* Fond doux (si tu veux le garder) */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_700px_at_10%_-20%,rgba(255,255,255,0.06),transparent_60%)]" />
      <div className="pointer-events-none absolute -right-24 top-20 h-80 w-80 rounded-full bg-white/5 blur-[140px]" />

      <main className="relative z-10 w-full px-[2px] py-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.4em] text-slate-400">
            {eyebrow}
          </span>
          <h1 className="text-2xl font-semibold text-slate-100">{title}</h1>
          {subtitle ? <p className="text-sm text-slate-400">{subtitle}</p> : null}
        </div>

        {children}
      </main>
    </div>
  );
}

type DashboardGridProps = {
  children: ReactNode;
};

export function DashboardGrid({ children }: DashboardGridProps) {
  return <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">{children}</div>;
}
