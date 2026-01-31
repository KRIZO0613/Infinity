import { getInitials } from "@/lib/user";

type PlayerCustomField = {
  label: string;
  value: string;
};

type PlayerAutoStat = {
  label: string;
  value: string | number;
};

type PlayerCardSplitProps = {
  firstName: string;
  lastName: string;
  license?: string | null;
  position?: string | null;
  photoUrl?: string | null;
  customFields?: PlayerCustomField[];
  autoStats?: PlayerAutoStat[];
  className?: string;
};

const getRoleFromFields = (fields: PlayerCustomField[] | undefined) => {
  if (!fields?.length) return null;
  const match = fields.find(
    (field) => field.label.toLowerCase() === "role" && field.value,
  );
  return match?.value ?? null;
};

const getStatIcon = (label: string) => {
  const key = label.toLowerCase();
  if (key.includes("match")) {
    return (
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 8h10" />
        <path d="M7 12h6" />
      </svg>
    );
  }
  if (key.includes("but")) {
    return (
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4v16" />
        <path d="M4 12h16" />
      </svg>
    );
  }
  if (key.includes("minute")) {
    return (
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
};

export default function PlayerCardSplit({
  firstName,
  lastName,
  license,
  position,
  photoUrl,
  customFields = [],
  autoStats = [],
  className = "",
}: PlayerCardSplitProps) {
  const displayName = `${firstName} ${lastName}`.trim() || "Joueur";
  const initials = getInitials(firstName, lastName);
  const role = getRoleFromFields(customFields);

  return (
    <div
      className={[
        "grid overflow-hidden rounded-xl border border-white/10",
        "bg-[#0b0f1a]/90 shadow-[0_18px_40px_rgba(0,0,0,0.4)]",
        "transition hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(0,0,0,0.5)]",
        "lg:grid-cols-[240px_1fr]",
        className,
      ].join(" ")}
    >
      <div className="relative aspect-square w-full lg:aspect-auto lg:h-full">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={displayName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(120%_120%_at_20%_0%,rgba(139,92,246,0.35),transparent_55%),radial-gradient(120%_120%_at_100%_100%,rgba(56,189,248,0.25),transparent_55%)]">
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-black/40 text-lg font-semibold text-white shadow-[0_12px_30px_rgba(0,0,0,0.45)]">
              {initials}
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-4 left-0 hidden w-px bg-gradient-to-b from-[#8b5cf6]/60 via-white/10 to-transparent opacity-60 lg:block" />
        <div className="pointer-events-none absolute left-6 right-6 top-0 block h-px bg-gradient-to-r from-[#8b5cf6]/60 via-white/10 to-transparent opacity-60 lg:hidden" />

        <div className="flex flex-col gap-4 p-6">
          <div>
            <h3 className="text-xl font-semibold text-white">{displayName}</h3>
            <p className="mt-1 text-xs text-slate-400">
              Licence:{" "}
              <span className="text-slate-200">
                {license || "Non renseignée"}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {position ? (
              <span className="rounded-full border border-[#8b5cf6]/40 bg-[#8b5cf6]/15 px-3 py-1 text-xs font-semibold text-[#c4b5fd]">
                {position}
              </span>
            ) : null}
            {role ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                {role}
              </span>
            ) : null}
          </div>

          {autoStats.length > 0 ? (
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
              {autoStats.map((stat) => (
                <div
                  key={stat.label}
                  className="inline-flex items-center gap-2"
                >
                  <span className="text-[#8b5cf6]">
                    {getStatIcon(stat.label)}
                  </span>
                  <span className="font-semibold text-white">{stat.value}</span>
                  <span className="text-slate-400">{stat.label}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
