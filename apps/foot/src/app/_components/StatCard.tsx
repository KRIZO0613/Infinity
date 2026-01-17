type StatCardProps = {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHint?: string;
  icon?: "calendar" | "activity";
};

const iconMap = {
  calendar: (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 4v4" />
      <path d="M16 4v4" />
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
    </svg>
  ),
  activity: (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12h4l3-6 4 12 3-6h4" />
    </svg>
  ),
};

export default function StatCard({
  title,
  description,
  ctaLabel,
  ctaHint,
  icon = "calendar",
}: StatCardProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#15171d] p-6 shadow-[0_18px_60px_rgba(5,7,20,0.6)]">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          {title}
        </h2>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200">
          {iconMap[icon]}
        </span>
      </div>

      <div className="mt-5 space-y-4">
        <p className="text-sm text-slate-400">{description}</p>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:border-white/30 hover:text-slate-200"
        >
          {ctaLabel}
        </button>
        {ctaHint ? <p className="text-xs text-slate-500">{ctaHint}</p> : null}
      </div>
    </section>
  );
}
