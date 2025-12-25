import type { HTMLAttributes } from "react";

type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  message?: string;
};

export default function EmptyState({ message = "Rien encore…", className = "", ...props }: EmptyStateProps) {
  return (
    <div className={`card surface-elevated flex flex-col items-center justify-center gap-2 border-dashed text-center ${className}`} {...props}>
      <span className="muted-text text-xs font-medium uppercase tracking-[0.2em]">Empty</span>
      <p className="title-text text-base font-semibold">{message}</p>
    </div>
  );
}
