// apps/web/src/app/page.tsx
"use client";

import { useEffect, useRef } from "react";
import { Timeline } from "@/components/home/Timeline";

const PLACEHOLDER_PROJECTS = Array.from({ length: 8 }, (_, index) => `Projet ${index + 1}`);

export default function HomePage() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const lastInteractionRef = useRef(Date.now());

  const markInteraction = () => {
    lastInteractionRef.current = Date.now();
  };

  const scrollByOffset = (delta: number) => {
    const track = trackRef.current;
    if (!track) return;
    markInteraction();
    track.scrollBy({ left: delta, behavior: "smooth" });
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let frame = 0;

    track.addEventListener("pointerdown", markInteraction);
    track.addEventListener("wheel", markInteraction, { passive: true });
    track.addEventListener("touchstart", markInteraction, { passive: true });

    const step = () => {
      if (!trackRef.current) return;
      const el = trackRef.current;
      const now = Date.now();
      // pause auto-scroll briefly after user interaction
      if (now - lastInteractionRef.current > 1200) {
        el.scrollLeft += 0.15;
        const max = el.scrollWidth - el.clientWidth;
        if (el.scrollLeft >= max - 1) {
          el.scrollLeft = max;
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="min-h-screen px-6 py-10" style={{ background: "var(--bg)" }}>
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="space-y-3" />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Projets à venir</h2>
              <p className="text-sm text-slate-500">Carrousel place­holder, glisse ou laisse défiler.</p>
            </div>
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Placeholder</span>
          </div>

          <div className="relative">
            <button
              type="button"
              aria-label="Défiler vers la gauche"
              onClick={() => scrollByOffset(-280)}
              className="absolute -left-6 top-1/2 z-20 flex h-14 w-14 -translate-y-1/2 items-center justify-center text-white transition hover:-translate-y-[55%] focus:outline-none"
              style={{ background: "transparent", border: "none", boxShadow: "none", pointerEvents: "auto" }}
            >
              <svg
                viewBox="0 0 20 20"
                className="mx-auto h-[50px] w-[50px]"
                fill="none"
                stroke="#ffffff"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: "drop-shadow(0 18px 34px rgba(0,0,0,0.78)) drop-shadow(0 4px 12px rgba(0,0,0,0.6))" }}
              >
                <path d="M12.5 4.5 7 10l5.5 5.5" />
              </svg>
            </button>

            <button
              type="button"
              aria-label="Défiler vers la droite"
              onClick={() => scrollByOffset(280)}
              className="absolute -right-6 top-1/2 z-20 flex h-14 w-14 -translate-y-1/2 items-center justify-center text-white transition hover:-translate-y-[55%] focus:outline-none"
              style={{ background: "transparent", border: "none", boxShadow: "none", pointerEvents: "auto" }}
            >
              <svg
                viewBox="0 0 20 20"
                className="mx-auto h-[50px] w-[50px]"
                fill="none"
                stroke="#ffffff"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: "drop-shadow(0 18px 34px rgba(0,0,0,0.78)) drop-shadow(0 4px 12px rgba(0,0,0,0.6))" }}
              >
                <path d="M7.5 4.5 13 10l-5.5 5.5" />
              </svg>
            </button>

            <div
              ref={trackRef}
              className="carousel-fade flex gap-5 overflow-x-auto py-2 px-4 pb-6 -mb-6 bg-transparent shadow-none"
            >
              {PLACEHOLDER_PROJECTS.map((label) => (
                <div
                  key={label}
                  className="carousel-card group relative min-w-[260px] max-w-[300px] flex-shrink-0 rounded-2xl px-6 py-8 opacity-95 transition-all duration-200 hover:opacity-100 hover:-translate-y-[2px]"
                >
                  <div className="h-4 w-20 rounded-full bg-white shadow-[0_6px_14px_rgba(15,23,42,0.08)] animate-pulse" />
                  <div className="mt-3 h-5 w-32 rounded-full bg-white shadow-[0_6px_14px_rgba(15,23,42,0.08)] animate-pulse" />
                  <div className="mt-8 flex h-3 w-full gap-2">
                    <span className="flex-1 rounded-full bg-white shadow-[0_4px_10px_rgba(15,23,42,0.06)] animate-pulse" />
                    <span className="flex-1 rounded-full bg-white shadow-[0_4px_10px_rgba(15,23,42,0.06)] animate-pulse" />
                    <span className="flex-1 rounded-full bg-white shadow-[0_4px_10px_rgba(15,23,42,0.06)] animate-pulse" />
                  </div>
                  <div className="mt-8 text-sm font-semibold text-slate-800 group-hover:underline group-hover:decoration-slate-400/40 group-hover:underline-offset-4">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Timeline</h2>
              <p className="text-sm text-slate-500">Synchronisé avec ton calendrier (tâches & événements).</p>
            </div>
          </div>

          <Timeline />
        </section>
      </div>
    </div>
  );
}
