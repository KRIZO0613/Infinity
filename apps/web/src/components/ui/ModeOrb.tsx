"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { tokens } from "@/lib/tokens";

type Theme = "light" | "dark" | "neon";

const STORAGE_KEY = "infinity.theme";

function readStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "neon") {
      return stored;
    }
  } catch {
    // Ignore read errors (private browsing, etc.)
  }
  return null;
}

function resolveTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }
  const stored = readStoredTheme();
  if (stored) {
    return stored;
  }
  const root = window.document.documentElement;
  if (root.classList.contains("neon")) {
    return "neon";
  }
  return root.classList.contains("light") ? "light" : "dark";
}

function applyTheme(theme: Theme) {
  const root = window.document.documentElement;
  root.classList.remove("light", "dark", "neon");
  root.classList.add(theme);
  root.style.colorScheme = theme === "light" ? "light" : "dark";
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Ignore write errors
  }
}

// Do not touch the orb trigger visuals; panel styling can evolve.
export default function ModeOrb() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => (typeof window === "undefined" ? "dark" : resolveTheme()));
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const initial = resolveTheme();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs React state with pre-hydrated DOM theme
    setTheme(initial);
    setMounted(true);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = (event: MediaQueryListEvent) => {
      const stored = readStoredTheme();
      if (stored) {
        return;
      }
      const nextTheme: Theme = event.matches ? "dark" : "light";
      setTheme(nextTheme);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) {
        return;
      }
      const value = event.newValue;
      const next: Theme = value === "dark" ? "dark" : value === "light" ? "light" : value === "neon" ? "neon" : media.matches ? "dark" : "light";
      setTheme((current) => (current === next ? current : next));
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleMediaChange);
    } else {
      media.addListener(handleMediaChange);
    }
    window.addEventListener("storage", handleStorage);

    return () => {
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", handleMediaChange);
      } else {
        media.removeListener(handleMediaChange);
      }
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") {
      return;
    }

    applyTheme(theme);
  }, [theme, mounted]);

  const themeOptions = [
    { value: "light" as const, label: "Mode clair" },
    { value: "dark" as const, label: "Mode sombre" },
    { value: "neon" as const, label: "Mode néon" },
  ];

  const handleThemeChange = (nextTheme: Theme) => {
    if (theme === nextTheme) {
      return;
    }
    if (typeof window !== "undefined") {
      applyTheme(nextTheme);
    }
    setTheme(nextTheme);
  };

  useEffect(() => {
    if (!menuOpen || typeof window === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (panelRef.current?.contains(target)) {
        return;
      }

      if (triggerRef.current?.contains(target)) {
        return;
      }

      setMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <>
      <button
        type="button"
        aria-label="Ouvrir le panneau"
        onClick={() => setMenuOpen(true)}
        ref={triggerRef}
        className="orb-trigger relative h-10 w-10 overflow-hidden rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
        style={{ borderRadius: tokens.radius.pill, transition: tokens.transition.normal }}
      >
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ color: tokens.color.accent }}
          initial={{ boxShadow: "0 0 0px rgba(99,102,241,0.0)" }}
          animate={{
            boxShadow: `${tokens.shadow.neon}, inset 0 0 12px rgba(99,102,241,0.25)`,
          }}
          transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse" }}
        />
        <span className="orb-ring absolute inset-0 rounded-full" />
        <motion.span
          className="orb-dot-primary absolute top-1 left-1 h-2 w-2 rounded-full"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
          style={{ transformOrigin: "14px 14px" }}
        />
        <motion.span
          className="orb-dot-secondary absolute top-1 left-1 h-1.5 w-1.5 rounded-full"
          animate={{ rotate: -360 }}
          transition={{ repeat: Infinity, duration: 5.5, ease: "linear" }}
          style={{ transformOrigin: "18px 18px" }}
        />
        <motion.span
          className="orb-dot-tertiary absolute top-1 left-1 h-[6px] w-[6px] rounded-full"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 7, ease: "linear" }}
          style={{ transformOrigin: "10px 20px" }}
        />
      </button>

      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-[210]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              style={{ background: "transparent", backdropFilter: "none" }}
              onClick={() => setMenuOpen(false)}
            />

            <motion.aside
              className="panel-glass fixed z-[211] flex w-[min(88vw,260px)] max-w-[300px] flex-col"
              initial={{ x: 0, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              onClick={(event) => event.stopPropagation()}
              ref={panelRef}
              style={{
                top: "0px",
                right: "0px",
                borderRadius: tokens.radius.xl,
              }}
            >
              <div className="relative flex flex-col px-3.5 py-3 text-sm text-slate-800 gap-2.5">
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    className="btn-plain flex h-8 w-8 items-center justify-center rounded-full"
                    style={{
                      background: "rgba(255,255,255,0.9)",
                      boxShadow: "var(--shadow-inset)",
                      border: "none",
                    }}
                    aria-label="Fermer le panneau"
                  >
                    <span
                      aria-hidden
                      style={{
                        position: "relative",
                        display: "block",
                        width: "12px",
                        height: "12px",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "currentColor",
                          height: "2px",
                          width: "100%",
                          top: "50%",
                          left: 0,
                          transform: "translateY(-50%) rotate(45deg)",
                          borderRadius: "999px",
                        }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "currentColor",
                          height: "2px",
                          width: "100%",
                          top: "50%",
                          left: 0,
                          transform: "translateY(-50%) rotate(-45deg)",
                          borderRadius: "999px",
                        }}
                      />
                    </span>
                  </button>
                </div>

                <div className="h-px w-full" style={{ background: "rgba(15,23,42,0.04)" }} />

                <section className="space-y-1">
                  <div className="text-slate-500">Apparence</div>
                  <div className="space-y-1">
                    {themeOptions.map((option) => {
                      const isActive = option.value === theme;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleThemeChange(option.value)}
                          aria-pressed={isActive}
                          className="flex w-full items-center justify-between px-2.5 py-2 text-left"
                          style={{
                            borderRadius: tokens.radius.lg,
                            background: "transparent",
                            border: "none",
                            boxShadow: "none",
                            transition: tokens.transition.normal,
                            color: "rgba(15,23,42,0.92)",
                          }}
                        >
                          <span className="font-medium text-slate-900">{option.label}</span>
                          <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                              marginLeft: "auto",
                              background: isActive ? "#2f3b4a" : "rgba(255,255,255,0.70)",
                              boxShadow: isActive
                                ? "0 2px 6px rgba(15,23,42,0.20)"
                                : "0 2px 5px rgba(15,23,42,0.16)",
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </section>

                <div className="h-px w-full" style={{ background: "rgba(15,23,42,0.04)" }} />

                <section className="space-y-1">
                  <div className="text-slate-500">Actions</div>
                  <button
                    className="w-full px-2.5 py-2 text-left font-medium text-slate-900"
                    style={{
                      borderRadius: tokens.radius.lg,
                      background: "transparent",
                      border: "none",
                      boxShadow: "none",
                      transition: tokens.transition.normal,
                    }}
                  >
                    Épingler au dashboard
                  </button>
                  <button
                    className="w-full px-2.5 py-2 text-left font-medium text-slate-900"
                    style={{
                      borderRadius: tokens.radius.lg,
                      background: "transparent",
                      border: "none",
                      boxShadow: "none",
                      transition: tokens.transition.normal,
                    }}
                  >
                    Préférences d’affichage
                  </button>
                </section>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
