import { getTeamEventsByTeam } from "@/lib/api/teamEvents";

type PageProps = {
  params: {
    id: string;
  };
};

type CalendarEvent = {
  id: string;
  type: "match" | "training" | "other";
  title: string | null;
  start_at: string;
  end_at: string | null;
  location?: string | null;
  status?: "scheduled" | "played" | "cancelled" | "postponed" | string | null;
};

type DayGroup = {
  key: string;
  label: string;
  events: CalendarEvent[];
};

const formatDayLabel = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

const formatTime = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

const getDayKey = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const groupEventsByDay = (events: CalendarEvent[]): DayGroup[] => {
  const map = new Map<string, DayGroup>();

  events.forEach((event) => {
    const date = new Date(event.start_at);
    const key = getDayKey(date);
    const existing = map.get(key);

    if (existing) {
      existing.events.push(event);
    } else {
      map.set(key, {
        key,
        label: formatDayLabel(date),
        events: [event],
      });
    }
  });

  return Array.from(map.values())
    .map((group) => ({
      ...group,
      events: group.events.sort(
        (a, b) =>
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
      ),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
};

const getEventTypeBadge = (type: CalendarEvent["type"]) => {
  if (type === "match") {
    return {
      label: "Match",
      className:
        "border-emerald-300/30 bg-emerald-500/15 text-emerald-200",
    };
  }
  if (type === "training") {
    return {
      label: "Entraînement",
      className: "border-sky-300/30 bg-sky-500/15 text-sky-200",
    };
  }
  return {
    label: "Autre",
    className: "border-white/15 bg-white/5 text-slate-300",
  };
};

const getStatusBadge = (status?: CalendarEvent["status"]) => {
  switch (status) {
    case "played":
      return {
        label: "Joué",
        className:
          "border-emerald-300/30 bg-emerald-500/15 text-emerald-200",
      };
    case "cancelled":
      return {
        label: "Annulé",
        className: "border-rose-300/30 bg-rose-500/15 text-rose-200",
      };
    case "postponed":
      return {
        label: "Reporté",
        className: "border-amber-300/30 bg-amber-500/15 text-amber-200",
      };
    default:
      return {
        label: "Prévu",
        className:
          "border-violet-300/30 bg-violet-500/15 text-violet-200",
      };
  }
};

export default async function TeamCalendarPage({ params }: PageProps) {
  const teamId = params.id;

  let events: CalendarEvent[] = [];
  let error: string | null = null;

  if (!teamId) {
    error = "Équipe introuvable.";
  } else {
    try {
      const data = await getTeamEventsByTeam(teamId, { ascending: true });

      const next: CalendarEvent[] = (data ?? []).map((item) => {
        const eventType: CalendarEvent["type"] =
          item.type === "match"
            ? "match"
            : item.type === "training"
              ? "training"
              : "other";

        return {
          id: item.id,
          type: eventType,
          title: item.title ?? null,
          start_at: item.start_at,
          end_at: item.end_at ?? null,
          location: (item as { location?: string | null }).location ?? null,
          status: (item as { status?: string | null }).status ?? null,
        };
      });

      events = next;
    } catch (e) {
      console.error("Erreur chargement agenda:", e);
      error = "Impossible de charger le calendrier.";
    }
  }

  const grouped = groupEventsByDay(events);

  return (
    <div className="min-h-screen bg-[#070a14] text-slate-100">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Calendrier de l’équipe
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-100">
              Calendrier – vue Agenda
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Matchs, entraînements et événements à venir
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-full border border-white/10 bg-white/5 p-1 text-xs">
              <button
                type="button"
                className="rounded-full bg-white/10 px-3 py-1 font-semibold text-slate-100"
              >
                Agenda
              </button>
              <button
                type="button"
                className="rounded-full px-3 py-1 text-slate-400 transition hover:text-slate-200"
              >
                Mois
              </button>
            </div>
            <button
              type="button"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
            >
              + Match
            </button>
            <button
              type="button"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
            >
              + Entraînement
            </button>
          </div>
        </div>

        <div className="mt-8 rounded-[28px] border border-white/10 bg-black/35 p-6 shadow-[0_26px_60px_rgba(0,0,0,0.6)]">
          {error ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6 text-sm text-rose-200">
              {error}
            </div>
          ) : grouped.length === 0 ? (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-slate-400">
              Aucun événement pour l’instant
            </div>
          ) : (
            <div className="max-h-[calc(100vh-200px)] space-y-8 overflow-y-auto pr-2">
              {grouped.map((day) => (
                <div key={day.key} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">
                        {day.label}
                      </p>
                      <p className="text-xs text-slate-500">
                        {day.events.length} événement
                        {day.events.length > 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>

                  <div className="relative space-y-4 pl-6">
                    <div className="pointer-events-none absolute left-2 top-2 h-full w-px bg-gradient-to-b from-white/10 via-white/5 to-transparent" />
                    {day.events.map((event) => {
                      const startDate = new Date(event.start_at);
                      const typeBadge = getEventTypeBadge(event.type);
                      const statusBadge = getStatusBadge(event.status);

                      return (
                        <div
                          key={event.id}
                          className="relative rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:bg-black/40"
                        >
                          <span className="absolute left-[-10px] top-5 h-2.5 w-2.5 rounded-full bg-violet-400/80 shadow-[0_0_10px_rgba(139,92,246,0.6)]" />
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-slate-100">
                              {formatTime(startDate)}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={[
                                  "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                                  typeBadge.className,
                                ].join(" ")}
                              >
                                {typeBadge.label}
                              </span>
                              <span
                                className={[
                                  "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                                  statusBadge.className,
                                ].join(" ")}
                              >
                                {statusBadge.label}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3">
                            <p className="text-base font-semibold text-slate-100">
                              {event.title ?? "Événement"}
                            </p>
                            {event.location ? (
                              <p className="mt-1 text-xs text-slate-400">
                                {event.location}
                              </p>
                            ) : null}
                          </div>

                          <div className="mt-3 text-xs text-slate-400">
                            Voir les détails ▸
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}