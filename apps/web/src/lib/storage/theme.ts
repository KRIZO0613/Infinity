export type Theme = "light" | "dark";
const KEY = "infinity.theme";

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(KEY);
  if (saved === "light" || saved === "dark") return saved as Theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.dataset.theme = t;
  root.classList.toggle("dark", t === "dark");
  localStorage.setItem(KEY, t);
}

export function toggleTheme(): Theme {
  const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
  applyTheme(next as Theme);
  return next as Theme;
}

export function inlineThemeScript() {
  return `(function(){try{var d=document.documentElement;var t=localStorage.getItem('infinity.theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.dataset.theme=t;if(t==='dark')d.classList.add('dark');else d.classList.remove('dark')}catch(e){}})();`;
}