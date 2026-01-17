export function getInitials(firstName?: string | null, lastName?: string | null): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  const initials = `${first ? first[0] : ""}${last ? last[0] : ""}`;

  if (!initials) return "?";
  return initials.toUpperCase().slice(0, 2);
}
