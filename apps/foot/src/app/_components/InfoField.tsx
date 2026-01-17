"use client";

import type { ReactNode } from "react";

export type InfoFieldProps = {
  label: string;
  value: string | null | undefined;
  icon?: ReactNode;
  /** Permet au champ de prendre toute la largeur dans une grille (email, adresse, etc.) */
  fullWidth?: boolean;
};

export default function InfoField({
  label,
  value,
  icon,
  fullWidth = false,
}: InfoFieldProps) {
  return (
    <div
      className={[
        "flex flex-col gap-1 text-xs text-slate-400",
        fullWidth ? "md:col-span-3" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-center gap-2">
        {icon && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/5 text-[11px] text-slate-300">
            {icon}
          </span>
        )}
        <span className="font-medium uppercase tracking-[0.18em]">
          {label}
        </span>
      </div>

      <p className="text-sm text-slate-100">
        {value && value.trim() !== "" ? value : "—"}
      </p>
    </div>
  );
}