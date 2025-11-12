export const radii = {
  card: "1.25rem",
  panel: "1.5rem",
  pill: "999px",
} as const;

export const shadows = {
  card: "0 25px 50px -20px rgba(15, 23, 42, 0.45)",
  overlay: "0 20px 45px -12px rgba(15, 23, 42, 0.6)",
} as const;

export const spacing = {
  gutter: "1.5rem",
  section: "2.5rem",
} as const;

export const tokens = {
  radii,
  shadows,
  spacing,
} as const;
