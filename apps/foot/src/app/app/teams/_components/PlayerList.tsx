import PlayerAvatar from "@/app/app/teams/_components/PlayerAvatar";
import type { Player, PlayerCustomField } from "@/app/app/teams/_types/player";

type PlayerListProps = {
  players: Player[];
  onEdit: (player: Player) => void;
  onOpenCard?: (index: number) => void;
  teamName?: string;
};

const normalizeLabel = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");

const getActiveFieldValue = (
  fields: PlayerCustomField[],
  labels: string[],
) => {
  const match = fields.find((field) => {
    if (field.active === false || !field.value) return false;
    const normalized = normalizeLabel(field.label);
    return labels.includes(normalized);
  });
  return match?.value ?? null;
};

export default function PlayerList({
  players,
  onEdit,
  onOpenCard,
  teamName,
}: PlayerListProps) {
  return (
    <div className="space-y-2">
      {players.map((player, index) => {
        const displayName =
          `${player.last_name} ${player.first_name}`.trim() || "Joueur";
        const customFields = Array.isArray(player.custom_fields)
          ? player.custom_fields
          : [];
        const position = getActiveFieldValue(customFields, [
          "poste",
          "position",
        ]);
        const strongFoot = getActiveFieldValue(customFields, [
          "piedfort",
          "pied",
        ]);
        const birthYear = getActiveFieldValue(customFields, [
          "anneedenaissance",
          "datedenaissance",
          "naissance",
        ]);
        const jerseyNumber = getActiveFieldValue(customFields, [
          "numerodemaillot",
          "numero",
          "maillot",
        ]);

        return (
          <div
            key={player.id}
            role="button"
            tabIndex={0}
            onClick={() => onEdit(player)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onEdit(player);
              }
            }}
            className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-white/10 px-4 py-3 text-left backdrop-blur-sm transition"
          >
            <div className="pointer-events-none absolute inset-0 bg-[url('/backgrounds/IMAGE212.png')] bg-cover bg-center opacity-80" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/25 to-black/70" />

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenCard?.(index);
              }}
              className="relative z-10 shrink-0 rounded-full border border-white/10 bg-black/30 p-1 transition hover:border-white/30"
              aria-label="Voir la carte joueur"
            >
              <PlayerAvatar
                firstName={player.first_name}
                lastName={player.last_name}
                photoUrl={player.photo_url}
                size="sm"
              />
            </button>
            <div className="relative z-10 flex flex-1 items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-100">
                  {displayName}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {player.license_number
                    ? `Licence ${player.license_number}`
                    : "Licence non renseignée"}
                  {birthYear ? ` • ${birthYear}` : ""}
                  {teamName ? ` • ${teamName}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                  {position ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5">
                      Poste :{" "}
                      <span className="font-semibold text-white">
                        {position}
                      </span>
                    </span>
                  ) : null}
                  {strongFoot ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5">
                      Pied :{" "}
                      <span className="font-semibold text-white">
                        {strongFoot}
                      </span>
                    </span>
                  ) : null}
                  {jerseyNumber ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5">
                      Maillot :{" "}
                      <span className="font-semibold text-white">
                        {jerseyNumber}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit(player);
                }}
                className="hidden shrink-0 text-slate-300 transition hover:text-slate-100 sm:block"
                aria-label="Ouvrir la fiche joueur"
              >
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
