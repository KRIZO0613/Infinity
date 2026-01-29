import type { ReactNode } from "react";

type GameCardShellProps = {
  children: ReactNode;
  className?: string;
};

export default function GameCardShell({
  children,
  className = "",
}: GameCardShellProps) {
  return (
    <article
      className={[
        "relative overflow-hidden rounded-3xl border border-white/10",
        "bg-[#0b0f1a] shadow-[0_18px_36px_rgba(0,0,0,0.45)]",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-3xl",
        "before:bg-[radial-gradient(100%_100%_at_0%_0%,rgba(139,92,246,0.25),transparent_60%)]",
        "after:pointer-events-none after:absolute after:inset-0 after:rounded-3xl",
        "after:bg-[radial-gradient(80%_80%_at_100%_0%,rgba(34,211,238,0.18),transparent_55%)]",
        className,
      ].join(" ")}
    >
      <div className="relative z-10">{children}</div>
    </article>
  );
}
