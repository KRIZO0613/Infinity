// apps/web/src/app/page.tsx

"use client";

export default function HomePage() {
  return (
    <div
  className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-4xl items-center justify-center px-6 pt-6 pb-32"
>
     <div className="relative flex aspect-square w-full max-w-md items-center justify-center -translate-y-6 sm:-translate-y-10">
        {/* Wrapper du cercle */}
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-[#050714] via-black to-[#050714] shadow-[0_0_60px_-25px_rgba(79,70,229,0.6)] infinity-orb">
          {/* Glow interne */}
          <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_50%_40%,rgba(129,140,248,0.28),transparent_65%)]" />

          {/* Anneaux / traits qui tournent */}
          <div className="pointer-events-none absolute inset-6 rounded-full border border-white/10 animate-[slowspin_90s_linear_infinite]" />
          <div className="pointer-events-none absolute inset-12 rounded-full border border-white/5 animate-[slowspin_90s_linear_infinite]" />
          <div className="pointer-events-none absolute left-1/2 top-6 h-[70%] w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/20 to-transparent animate-[slowspin_90s_linear_infinite]" />
          <div className="pointer-events-none absolute top-1/2 left-6 h-px w-[70%] -translate-y-1/2 bg-gradient-to-r from-transparent via-white/18 to-transparent animate-[slowspin_90s_linear_infinite]" />

          {/* Contenu central */}
          <div className="relative z-10 flex flex-col items-center px-6 text-center">
            <h1 className="text-2xl font-semibold text-white sm:text-[26px]">
              Donne vie à tes idées.
            </h1>

            <button
              type="button"
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-indigo-300/60 bg-indigo-600/90 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_0_30px_rgba(79,70,229,0.9)] transition-all hover:bg-indigo-500 active:scale-95 sm:text-[15px] infinity-orb-button"
            >
              <span className="text-lg leading-none">＋</span>
              <span>Proget</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}