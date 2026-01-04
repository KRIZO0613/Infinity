"use client";

type IconProps = {
  size?: number;
  strokeWidth?: number;
};

export function PaletteIcon({ size = 14, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3a9 9 0 0 0 0 18h1.6a2.4 2.4 0 0 0 0-4.8H12a4.2 4.2 0 0 1-4.2-4.2A4.2 4.2 0 0 1 12 7.8h4.2a4.8 4.8 0 0 1 0 9.6" />
      <circle cx="8.2" cy="10" r="0.9" />
      <circle cx="10.2" cy="7.4" r="0.9" />
      <circle cx="13.4" cy="7.2" r="0.9" />
      <circle cx="15.8" cy="9.6" r="0.9" />
    </svg>
  );
}

export function HighlightIcon({ size = 14, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 21h6l11-11-6-6L3 15v6z" />
      <path d="M13 7l4 4" />
    </svg>
  );
}
