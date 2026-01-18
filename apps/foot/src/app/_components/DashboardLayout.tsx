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
    <div className="relative w-full">
      <main className="relative z-10 w-full px-6 py-6">
        {/* En-tête de page */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.4em] text-slate-400">
            {eyebrow}
          </span>
          <h1 className="text-2xl font-semibold text-slate-100">{title}</h1>
          {subtitle ? (
            <p className="text-sm text-slate-400">{subtitle}</p>
          ) : null}
        </div>

        {/* Contenu */}
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}

type DashboardGridProps = {
  children: ReactNode;
};

export function DashboardGrid({ children }: DashboardGridProps) {
  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
      {children}
    </div>
  );
}