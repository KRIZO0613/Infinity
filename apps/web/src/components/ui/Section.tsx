import type { CSSProperties, PropsWithChildren, ReactNode } from "react";
import { neonStyle, tokens } from "@/lib/tokens";

const SECTION_SCROLL_MARGIN = "2.5rem";

type SectionProps = PropsWithChildren<{
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}>;

export default function Section({ title, description, actions, children }: SectionProps) {
  const sectionStyle: CSSProperties = {
    scrollMarginTop: SECTION_SCROLL_MARGIN,
    borderRadius: tokens.radius.xl,
    transition: tokens.transition.normal,
  };

  const headingTone: CSSProperties = {
    ...neonStyle(tokens.color.fg),
    color: "inherit",
    textShadow: "none",
    boxShadow: "none",
  };

  return (
    <section className="flex flex-col gap-6" style={sectionStyle}>
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="title-strong text-xl font-semibold tracking-tight" style={headingTone}>
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
