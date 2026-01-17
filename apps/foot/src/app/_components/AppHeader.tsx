"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getInitials } from "@/lib/user";
import { signOut } from "@/lib/auth";
import { clearActiveClubId } from "@/lib/activeClub";

export default function AppHeader() {
  const router = useRouter();
  const [initials, setInitials] = useState("?");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // ===== Initiales dynamiques =====
  useEffect(() => {
    let mounted = true;

    const computeInitials = (
      user: { user_metadata?: Record<string, unknown> } | null
    ) => {
      const metadata = user?.user_metadata ?? {};

      const firstName =
        typeof metadata.first_name === "string" ? metadata.first_name : undefined;
      const lastName =
        typeof metadata.last_name === "string" ? metadata.last_name : undefined;

      let fallbackFirst = firstName;
      let fallbackLast = lastName;

      if (!fallbackFirst && !fallbackLast) {
        const fullName =
          typeof metadata.full_name === "string"
            ? metadata.full_name
            : typeof metadata.name === "string"
            ? metadata.name
            : "";
        const parts = fullName.trim().split(/\s+/).filter(Boolean);
        if (parts.length > 0) {
          fallbackFirst = parts[0];
          fallbackLast = parts.length > 1 ? parts[parts.length - 1] : undefined;
        }
      }

      const next = getInitials(fallbackFirst, fallbackLast);
      if (mounted) setInitials(next);
    };

    supabase.auth
      .getUser()
      .then(({ data }) => computeInitials(data.user ?? null))
      .catch(() => mounted && setInitials("?"));

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => computeInitials(session?.user ?? null)
    );

    return () => {
      mounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const handleAccountClick = useCallback(() => {
    router.push("/app/account");
  }, [router]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    clearActiveClubId();
    router.push("/login");
  }, [router]);

  // ===== Fermeture menu externe / ESC =====
  useEffect(() => {
    if (!menuOpen) return;

    const handlePointer = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30">
      <div className="bg-slate-950/80 backdrop-blur-md">
        <div className="flex h-14 w-full items-center justify-between px-[2px]">
          {/* Logo + nom */}
          <button
            onClick={() => router.push("/app")}
            className="flex items-center gap-3 rounded-full px-2 py-1 transition hover:bg-slate-900/60"
          >
            {/* Logo infini */}
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#ec4899] text-sm font-semibold text-white shadow-[0_0_16px_rgba(139,92,246,0.9)]">
              ∞
            </div>

            <span className="hidden sm:inline text-sm font-medium text-slate-200">
              Infinity Foot
            </span>
          </button>

          {/* Actions à droite */}
          <div className="flex items-center gap-2">
            {/* Loupe */}
            <button
              type="button"
              aria-label="Rechercher"
              className="
                flex h-9 w-9 items-center justify-center
                rounded-full bg-transparent
                text-slate-300 transition
                hover:bg-slate-900/60 hover:text-white
              "
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="16.65" y1="16.65" x2="21" y2="21" />
              </svg>
            </button>

            {/* Notifications */}
            <button
              type="button"
              aria-label="Notifications"
              className="
                relative flex h-9 w-9 items-center justify-center
                rounded-full bg-transparent
                text-slate-300 transition
                hover:bg-slate-900/60 hover:text-violet-100
              "
            >
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(248,113,113,0.9)]" />
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 17H9" />
                <path d="M18 17a2 2 0 0 0 2-2c0-1.1-.6-2.1-1.6-2.6V10a6.4 6.4 0 0 0-12.8 0v2.4C4.6 12.9 4 13.9 4 15a2 2 0 0 0 2 2h12Z" />
                <path d="M10 19a2 2 0 0 0 4 0" />
              </svg>
            </button>

            {/* Compte */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((prev) => !prev)}
                className="group flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-900/60"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[#8b5cf6]/80 text-[11px] font-semibold text-[#c4b5fd] shadow-[0_0_12px_rgba(139,92,246,0.45)]">
                  {initials}
                </div>
                <span className="hidden sm:inline">Mon compte</span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-white/10 bg-[#121221] p-2 shadow-[0_18px_60px_rgba(5,7,20,0.7)]">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      handleAccountClick();
                    }}
                    className="flex w-full rounded-xl px-3 py-2 text-xs text-slate-200 hover:bg-white/5"
                  >
                    Mon compte
                  </button>
                  <button
                    onClick={async () => {
                      setMenuOpen(false);
                      await handleSignOut();
                    }}
                    className="flex w-full rounded-xl px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/10"
                  >
                    Déconnexion
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
