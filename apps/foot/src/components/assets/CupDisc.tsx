import * as React from "react";

type CupDiscProps = {
  size?: number;
  color?: string;
  className?: string;
  opacity?: number;
};

/**
 * Examples:
 * <CupDisc size={28} color="#ff7a00" />
 * <CupDisc className="text-blue-500" size={24} />
 */
export function CupDiscReal({ size = 32, color, className, opacity }: CupDiscProps) {
  const gradientId = React.useId();
  const holeId = React.useId();
  const style = {
    color,
    opacity,
  } as React.CSSProperties;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      style={style}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <radialGradient
          id={`${gradientId}-top`}
          cx="32"
          cy="26"
          r="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#fff" stopOpacity="0.38" />
          <stop offset="0.22" stopColor="currentColor" stopOpacity="1" />
          <stop offset="0.75" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="#000" stopOpacity="0.18" />
        </radialGradient>
        <radialGradient
          id={`${holeId}-hole`}
          cx="32"
          cy="34"
          r="14"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#000" stopOpacity="0.32" />
          <stop offset="1" stopColor="#000" stopOpacity="0.1" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="50" rx="20" ry="7" fill="#000" opacity="0.18" />
      <ellipse cx="32" cy="41" rx="22" ry="12" fill="#000" opacity="0.16" />
      <ellipse cx="32" cy="34" rx="23" ry="12.5" fill={`url(#${gradientId}-top)`} />
      <ellipse
        cx="32"
        cy="34"
        rx="23"
        ry="12.5"
        fill="none"
        stroke="#000"
        strokeOpacity="0.22"
        strokeWidth="2"
      />
      <ellipse cx="32" cy="34" rx="9.4" ry="4.9" fill={`url(#${holeId}-hole)`} />
      <ellipse
        cx="32"
        cy="34"
        rx="9.4"
        ry="4.9"
        fill="none"
        stroke="#000"
        strokeOpacity="0.2"
        strokeWidth="1.6"
      />
      <path
        d="M18 31c4-6 12-9 20-8"
        stroke="#fff"
        strokeOpacity="0.16"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M27.2 33.2c2.3-1.4 8.7-1.4 10.9 0"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.1"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CupDiscFlat({ size = 32, color, className, opacity }: CupDiscProps) {
  const style = {
    color,
    opacity,
  } as React.CSSProperties;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      style={style}
      role="img"
      aria-hidden="true"
    >
      <ellipse cx="32" cy="45" rx="20" ry="5" fill="#000" opacity="0.18" />
      <ellipse cx="32" cy="36" rx="20" ry="10" fill="currentColor" />
      <ellipse cx="32" cy="33" rx="7.2" ry="2.6" fill="#000" opacity="0.22" />
      <ellipse
        cx="32"
        cy="36"
        rx="20"
        ry="10"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.6"
        strokeWidth="2"
      />
      <ellipse cx="32" cy="34" rx="9" ry="4.8" fill="#000" opacity="0.22" />
      <ellipse
        cx="32"
        cy="34"
        rx="9"
        ry="4.8"
        fill="none"
        stroke="#000"
        strokeOpacity="0.18"
        strokeWidth="1.6"
      />
      <path
        d="M26.5 33.3c2.2-1.4 8.8-1.4 11 0"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.14"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <ellipse cx="26" cy="32" rx="7" ry="3" fill="#fff" opacity="0.2" />
    </svg>
  );
}

export const CupDisc = CupDiscReal;
