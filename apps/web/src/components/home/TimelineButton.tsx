// apps/web/src/components/home/TimelineButton.tsx
"use client";

export function TimelineButton({
  active,
  onClick,
}: {
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="
        inline-flex items-center gap-2 rounded-full 
        border border-slate-200 bg-white/90 
        px-4 py-2 text-xs text-slate-900 
        shadow-[0_10px_28px_rgba(15,23,42,0.12)]
        backdrop-blur-sm 
        dark:border-white/10 dark:bg-black/40 
        dark:text-zinc-100 
        dark:shadow-[0_0_18px_rgba(15,23,42,0.8)]
        transition-all 
      "
    >
      {/* Petit logo horloge */}
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/80 to-sky-400/80 shadow-[0_0_10px_rgba(59,130,246,0.9)]">
        <span className="relative block h-3.5 w-3.5 rounded-full border border-white/80">
          {/* Aiguille horizontale */}
          <span className="absolute left-1/2 top-1/2 h-[1px] w-[7px] -translate-y-1/2 bg-white" />
          {/* Aiguille verticale */}
          <span className="absolute left-1/2 top-1/2 h-[6px] w-[1px] -translate-x-1/2 -translate-y-[2px] bg-white" />
        </span>
      </span>

      <span className="flex flex-col leading-tight">
        <span className="text-[12px] font-semibold text-slate-900 dark:text-white">
          TimeLine
        </span>
      </span>
    </button>
  );
}