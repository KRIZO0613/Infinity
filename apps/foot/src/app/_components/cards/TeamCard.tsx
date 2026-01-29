import GameCardShell from "@/app/_components/cards/GameCardShell";

type TeamCardProps = {
  team: {
    id: string;
    name: string;
    category: string | null;
    photo_url: string | null;
    players_count: number;
  };
  menuOpen: boolean;
  onOpen?: () => void;
  onMenuToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export default function TeamCard({
  team,
  menuOpen,
  onOpen,
  onMenuToggle,
  onEdit,
  onDelete,
}: TeamCardProps) {
  const defaultImage = "/images/teams/FOOTINFINEPH.jpg";
  const imageSrc =
    team.photo_url &&
    (team.photo_url.startsWith("/") ||
      team.photo_url.startsWith("http://") ||
      team.photo_url.startsWith("https://") ||
      team.photo_url.startsWith("data:"))
      ? team.photo_url
      : defaultImage;

  return (
    <GameCardShell className="p-0">
      <div
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (!onOpen) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        className={onOpen ? "relative cursor-pointer" : "relative"}
      >
        <div className="relative min-h-[360px] bg-black/40 sm:min-h-[420px] lg:min-h-[460px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={team.name}
            className="absolute inset-0 h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.src = defaultImage;
            }}
          />
          <div className="absolute inset-0 bg-black/35" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/20" />
          <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_100%_0%,rgba(99,102,241,0.18),transparent_55%)]" />
          <div className="absolute inset-0 opacity-70 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.35)_60%,rgba(0,0,0,0.7)_100%)]" />

          <div className="absolute bottom-0 left-0 right-0 z-10 p-5 sm:p-6 lg:p-8">
            <div className="rounded-2xl border border-white/10 bg-black/35 p-4 backdrop-blur-[10px]">
              <h3 className="text-2xl font-semibold text-slate-100">
                {team.name}
              </h3>
              <p className="mt-1 text-sm text-slate-300">
                {team.category ?? "Catégorie non renseignée"}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-slate-200">
                  {team.players_count} joueur
                  {team.players_count > 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onMenuToggle();
          }}
          className="absolute right-5 top-5 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/60 text-slate-200 shadow-[0_0_16px_rgba(139,92,246,0.4)] transition hover:border-[#8b5cf6]/70 hover:text-white"
          aria-label="Paramètres"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </button>

        {menuOpen ? (
          <div className="absolute right-3 top-14 z-10 w-44 rounded-xl border border-white/10 bg-[#0f111b] p-1 shadow-[0_16px_30px_rgba(0,0,0,0.35)]">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-slate-200 transition hover:bg-white/5"
            >
              Modifier
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-rose-300 transition hover:bg-rose-500/10"
            >
              Supprimer
            </button>
          </div>
        ) : null}
      </div>
    </GameCardShell>
  );
}
