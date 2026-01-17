type ClubCardProps = {
  clubName: string;
  clubType: string;
  clubPlan: string;
  statusLabel: string;
  loading?: boolean;
};

export default function ClubCard({
  clubName,
  clubType,
  clubPlan,
  statusLabel,
  loading = false,
}: ClubCardProps) {
  const displayName = loading ? "Chargement…" : clubName;
  const displayType = loading ? "—" : clubType;
  const displayPlan = loading ? "—" : clubPlan;

  return (
    <section className="rounded-2xl border border-white/10 bg-[#15171d] p-6 shadow-[0_18px_60px_rgba(5,7,20,0.6)]">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Club actif
        </h2>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-slate-200">
          {statusLabel}
        </span>
      </div>

      <div className="mt-5 flex items-center gap-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200">
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
            <path d="M12 2l7 4v6c0 5-3.5 9-7 10-3.5-1-7-5-7-10V6l7-4z" />
          </svg>
        </span>
        <div>
          <div className="text-lg font-semibold text-slate-100">{displayName}</div>
          <p className="text-sm text-slate-400">
            {loading ? "Verification du club actif…" : "Club disponible pour la saison."}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <span className="rounded-full border border-white/10 bg-[#1a1d23] px-3 py-1 text-xs text-slate-400">
          Type : <span className="text-slate-200">{displayType}</span>
        </span>
        <span className="rounded-full border border-white/10 bg-[#1a1d23] px-3 py-1 text-xs text-slate-400">
          Plan : <span className="text-slate-200">{displayPlan}</span>
        </span>
      </div>
    </section>
  );
}
