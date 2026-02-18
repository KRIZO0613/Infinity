import React from "react";

type PassWallIconProps = {
  size?: number;
  className?: string;
  selected?: boolean;
};

export function PassWallIcon({
  size = 24,
  className,
  selected = false,
}: PassWallIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {selected ? (
        <rect
          x="3"
          y="4"
          width="26"
          height="24"
          rx="6"
          stroke="rgba(139,92,246,0.6)"
          strokeWidth="1.6"
        />
      ) : null}
      <rect
        x="4"
        y="7"
        width="24"
        height="18"
        rx="4"
        fill="currentColor"
        opacity="0.15"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x="7"
        y="14"
        width="18"
        height="4"
        rx="2"
        fill="currentColor"
        opacity="0.28"
      />
      <path
        d="M10 12.5h12"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
