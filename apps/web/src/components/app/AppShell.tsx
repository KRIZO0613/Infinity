// apps/web/src/components/app/AppShell.tsx
"use client";

import type { PropsWithChildren } from "react";

export default function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <div className="app-shell__content">{children}</div>
    </div>
  );
}
