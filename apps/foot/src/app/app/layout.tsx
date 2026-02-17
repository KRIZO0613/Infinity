// apps/foot/src/app/app/layout.tsx
import type { ReactNode } from "react";
import AppHeader from "@/app/_components/AppHeader";
import AbortErrorSilencer from "@/app/_components/AbortErrorSilencer";
import SidebarNav from "@/app/_components/SidebarNav";
import CoachOnboardingDialog from "@/app/_components/onboarding/CoachOnboardingDialog";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader />
      <AbortErrorSilencer />
      <CoachOnboardingDialog />

      {/* MOBILE (<md) : icônes seules sous le header */}
      <div className="px-4 pt-3 md:hidden">
        <SidebarNav variant="mobile" />
      </div>

      {/* TABLETTE (md -> <lg) : icônes + texte sous le header */}
      <div className="hidden px-4 pt-3 md:block lg:hidden">
        <SidebarNav variant="tablet" />
      </div>

      {/* DESKTOP (>=lg) : sidebar collée à gauche + contenu à droite */}
      <div className="grid w-full grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[auto_1fr]">
        <div className="hidden lg:block">
          <SidebarNav />
        </div>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
