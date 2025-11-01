"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <>
      <header className="fixed top-0 left-0 w-full flex items-center justify-between px-8 py-4 bg-white/70 dark:bg-black/40 backdrop-blur-lg border-b border-black/10 dark:border-white/10 z-50 shadow-lg">
        {/* LOGO */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 shadow-[0_0_14px_rgba(124,58,237,0.9)]" />
          <span className="font-semibold text-lg tracking-wide dark:text-white">Infinity</span>
        </div>

        {/* CENTRE */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-medium px-4 py-1.5 rounded-full bg-gradient-to-r from-indigo-500/90 to-purple-600/90 text-white shadow-[0_0_18px_rgba(124,58,237,0.8)]"
        >
          Assistant IA
        </motion.div>

        {/* HOLO-ORB (menu trigger) */}
        <button
          aria-label="Ouvrir le panneau"
          onClick={() => setMenuOpen(true)}
          className="relative h-10 w-10 rounded-full border border-white/20 dark:border-white/15 bg-white/60 dark:bg-white/5 overflow-hidden group"
        >
          {/* halo animé */}
          <motion.span
            className="absolute inset-0 rounded-full"
            initial={{ boxShadow: "0 0 0px rgba(99,102,241,0.0)" }}
            animate={{ boxShadow: "0 0 16px rgba(168,85,247,0.55), inset 0 0 12px rgba(99,102,241,0.25)" }}
            transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse" }}
          />
          {/* anneau */}
          <span className="absolute inset-0 rounded-full ring-1 ring-indigo-400/40 dark:ring-purple-400/40" />
          {/* trois orbes en orbite */}
          <motion.span
            className="absolute top-1 left-1 h-2 w-2 rounded-full bg-indigo-400/90 dark:bg-purple-400/90"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
            style={{ transformOrigin: "14px 14px" }}
          />
          <motion.span
            className="absolute top-1 left-1 h-1.5 w-1.5 rounded-full bg-indigo-300/90 dark:bg-purple-300/90"
            animate={{ rotate: -360 }}
            transition={{ repeat: Infinity, duration: 5.5, ease: "linear" }}
            style={{ transformOrigin: "18px 18px" }}
          />
          <motion.span
            className="absolute top-1 left-1 h-[6px] w-[6px] rounded-full bg-indigo-200/90 dark:bg-purple-200/90"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 7, ease: "linear" }}
            style={{ transformOrigin: "10px 20px" }}
          />
        </button>
      </header>

      {/* PANNEAU LATÉRAL */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-[210] bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              className="fixed right-0 top-0 h-full w-[340px] z-[211] bg-neutral-950 text-white border-l border-white/10 shadow-2xl"
              initial={{ x: 360, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 360, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-neutral-950/90 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between">
                <div className="font-semibold">Panneau</div>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="px-2 py-1 text-xs rounded border border-white/15 hover:bg-white/10"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 space-y-6 text-sm">
                {/* Thème */}
                <section>
                  <div className="mb-2 text-white/80">Apparence</div>
                  <div className="flex items-center justify-between rounded-xl border border-white/10 p-3 bg-white/5">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {darkMode ? "Mode sombre" : "Mode clair"}
                      </span>
                      <span className="text-xs text-white/60">Bascule l’interface globale</span>
                    </div>
                    <button
                      aria-label="Basculer le thème"
                      onClick={() => setDarkMode((v) => !v)}
                      className={`relative h-8 w-16 rounded-full transition-all border ${
                        darkMode
                          ? "border-purple-500 bg-purple-500/20 shadow-[0_0_18px_rgba(168,85,247,0.6)]"
                          : "border-indigo-500 bg-indigo-500/20 shadow-[0_0_18px_rgba(99,102,241,0.6)]"
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
                          darkMode ? "right-1" : "left-1"
                        }`}
                      />
                    </button>
                  </div>
                </section>

                {/* Liens rapides (placeholders) */}
                <section className="space-y-2">
                  <div className="text-white/80">Rapides</div>
                  <button className="w-full text-left px-3 py-2 rounded-lg border border-white/10 hover:bg-white/10">
                    Épingler au dashboard
                  </button>
                  <button className="w-full text-left px-3 py-2 rounded-lg border border-white/10 hover:bg-white/10">
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