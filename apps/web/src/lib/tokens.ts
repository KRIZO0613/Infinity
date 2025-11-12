// apps/web/src/lib/tokens.ts
export const tokens = {
  radius: {
    sm: "0.25rem",
    md: "0.5rem",
    lg: "0.75rem",
    xl: "1.25rem",
    pill: "9999px",
  },
  shadow: {
    soft: "0 10px 30px rgba(0,0,0,0.18)",
    hard: "0 4px 12px rgba(0,0,0,0.3)",
    neon: "0 0 12px currentColor, 0 0 24px currentColor",
  },
  color: {
    accent: "oklch(var(--accent))",
    fg: "oklch(var(--fg))",
    bg: "oklch(var(--bg))",
    muted: "oklch(var(--muted-2))",
    border: "oklch(var(--muted))",
  },
  transition: {
    fast: "all 0.15s ease",
    normal: "all 0.3s ease",
    slow: "all 0.5s ease",
  },
  neon: {
    glow: "0 0 12px currentColor, 0 0 24px currentColor",
    pulse: "0 0 18px currentColor, 0 0 36px currentColor",
  },
} as const;

export function neonStyle(colorVar = "oklch(var(--accent))") {
  return {
    color: colorVar,
    textShadow: tokens.neon.glow,
    boxShadow: tokens.neon.glow,
  };
}
