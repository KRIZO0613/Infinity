type SessionItem = {
  title: string;
  date: string;
  status: string;
};

type SessionCardProps = {
  title: string;
  sessions: SessionItem[];
};

export default function SessionCard({ title, sessions }: SessionCardProps) {
  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-[#15171d] p-6 shadow-[0_18px_60px_rgba(5,7,20,0.6)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        <span className="text-xs text-slate-500">
          {sessions.length} session{sessions.length > 1 ? "s" : ""}
        </span>
      </div>

      {sessions.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-[#1a1d23] px-4 py-6 text-sm text-slate-400">
          Aucune session programmee.
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {sessions.map((session) => (
            <div
              key={`${session.title}-${session.date}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#1a1d23] px-4 py-3"
            >
              <div>
                <div className="text-sm font-semibold text-slate-100">
                  {session.title}
                </div>
                <div className="text-xs text-slate-500">{session.date}</div>
              </div>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-slate-200">
                {session.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
