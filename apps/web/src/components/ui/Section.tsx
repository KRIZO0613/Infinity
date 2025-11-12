import type { PropsWithChildren, ReactNode } from "react";
import { tokens } from "@/lib/ui/tokens";

type SectionProps = PropsWithChildren<{
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}>;

export default function Section({ title, description, actions, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-6" style={{ scrollMarginTop: tokens.spacing.section }}>
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="title-strong text-xl font-semibold tracking-tight">
            {title}
          </h2>
          {description ? (
            <p className="paragraph-muted text-sm">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}
