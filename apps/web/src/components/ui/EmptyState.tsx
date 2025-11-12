import type { HTMLAttributes } from "react";

type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  message?: string;
};

export default function EmptyState({ message = "Rien encore…", className = "", ...props }: EmptyStateProps) {
  return (
    <div className={`card flex flex-col items-center justify-center gap-2 border-dashed text-muted ${className}`} {...props}>
      <span className="text-sm font-medium uppercase tracking-[0.2em]">Empty</span>
      <p className="text-base font-semibold text-fg">{message}</p>
    </div>
  );
}
