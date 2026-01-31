import type { ReactNode } from "react";
import { TEAM_FIELD_LIBRARY } from "@/app/app/teams/_config/teamFieldLibrary";

export type CustomField = {
  label: string;
  value: string;
  visible?: boolean;
  kind?: "manual" | "auto";
  key?: string | null;
};

type TeamInfoPanelProps = {
  name: string;
  category?: string | null;
  playersCount: number;
  customFields?: CustomField[] | null;
  showPlayersCount?: boolean;
  className?: string;
  children?: ReactNode;
};

export default function TeamInfoPanel({
  name,
  category,
  playersCount,
  customFields,
  showPlayersCount = true,
  className = "",
  children,
}: TeamInfoPanelProps) {
  const visibleFields = (customFields ?? [])
    .filter(
      (field) =>
        field.kind !== "auto" &&
        field.label &&
        field.value &&
        field.visible !== false,
    )
    .map((field) => ({
      ...field,
      label: field.key
        ? TEAM_FIELD_LIBRARY.find((item) => item.key === field.key)?.label ??
          field.label
        : field.label,
    }));

  const orderedFields = [
    ...visibleFields.filter((field) => field.key === "category"),
    ...visibleFields.filter((field) => field.key !== "category"),
  ].slice(0, 4);

  return (
    <div
      className={[
        "relative mx-auto flex max-w-4xl items-start overflow-hidden",
        "rounded-[30px] border border-white/35",
        "bg-black/35 px-10 py-7 backdrop-blur-5xl",
        "shadow-[0_26px_80px_rgba(0,0,0,0.85)]",
        "before:pointer-events-none before:absolute before:inset-[1px]",
        "before:rounded-[4px] before:border before:border-white/2",
        "before:bg-[radial-gradient(160%_160%_at_10%_0%,rgba(255,255,255,0.22),transparent_60%),radial-gradient(160%_160%_at_90%_100%,rgba(15,23,42,0.95),transparent_60%)]",
        "before:opacity-45",
        className,
      ].join(" ")}
    >
      <div className="relative z-10">
        <div className="flex flex-wrap items-baseline gap-3">
          <h3 className="text-3xl font-semibold tracking-tight text-white">
            {name}
          </h3>
          <span className="text-sm font-semibold text-slate-100">
            {category ?? "U12"}
          </span>
        </div>

        {orderedFields.length > 0 ? (
          <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-slate-300">
            {orderedFields.map((field) => (
              <span key={`${field.label}-${field.value}`}>
                <span className="text-slate-200/80">
                  {field.label.toUpperCase()}:
                </span>{" "}
                <span className="font-semibold text-white">{field.value}</span>
              </span>
            ))}
          </div>
        ) : null}

        {showPlayersCount ? (
          <div className="mt-5 inline-flex gap-3">
            <span
              className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-[11px] font-medium text-slate-100 shadow-[0_0_12px_rgba(139,92,246,0.25)]"
              aria-label={`Nombre de joueurs: ${playersCount}`}
              title={`Nombre de joueurs: ${playersCount}`}
            >
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
                <path d="M16 11a3 3 0 1 0-2.8-4" />
                <path d="M8 11a3 3 0 1 1 2.8-4" />
                <path d="M3 20a5 5 0 0 1 10 0" />
                <path d="M13 20a5 5 0 0 1 8 0" />
              </svg>
              <span className="text-slate-100">{playersCount}</span>
            </span>
          </div>
        ) : null}
      </div>

      {children ? <div className="relative z-10 ml-auto">{children}</div> : null}
    </div>
  );
}
