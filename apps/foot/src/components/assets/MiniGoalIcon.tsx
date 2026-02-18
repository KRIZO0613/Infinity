import * as React from "react";

type MiniGoalIconProps = {
  size?: number;
  color?: string;
  className?: string;
  opacity?: number;
  selected?: boolean;
};

export function MiniGoalIcon({
  size = 24,
  color = "rgba(235,235,255,0.92)",
  className,
  opacity,
  selected,
}: MiniGoalIconProps) {
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
      {selected ? (
        <circle
          cx="32"
          cy="36"
          r="26"
          stroke="rgba(120,80,255,0.35)"
          strokeWidth="3"
          fill="none"
        />
      ) : null}
      <g stroke="currentColor" strokeWidth="4" strokeLinecap="round">
        <line x1="16" y1="46" x2="16" y2="20" />
        <line x1="48" y1="46" x2="48" y2="20" />
        <line x1="16" y1="20" x2="48" y2="20" />
      </g>
      <g stroke="rgba(255,255,255,0.12)" strokeWidth="2" strokeLinecap="round">
        <line x1="26" y1="20" x2="26" y2="44" />
        <line x1="38" y1="20" x2="38" y2="44" />
        <line x1="16" y1="32" x2="48" y2="32" />
      </g>
    </svg>
  );
}
