const KEY = "foot_active_club_id";

export function getActiveClubId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setActiveClubId(clubId: string) {
  window.localStorage.setItem(KEY, clubId);
}

export function clearActiveClubId() {
  window.localStorage.removeItem(KEY);
}
