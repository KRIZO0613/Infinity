import PlayerAvatar from "@/app/app/teams/_components/PlayerAvatar";
import type { Player, PlayerCustomField } from "@/app/app/teams/_types/player";

type PlayerListProps = {
  players: Player[];
  onEdit: (player: Player) => void;
  teamName?: string;
};

const getActiveField = (fields: PlayerCustomField[], label: string) => {
  const match = fields.find(
    (field) =>
      field.active !== false &&
      field.label.toLowerCase() === label.toLowerCase() &&
      field.value,
  );
  return match?.value ?? null;
};

export default function PlayerList({
  players,
  onEdit,
  teamName,
}: PlayerListProps) {
  return (
    <div className="space-y-3">
      {players.map((player) => {
        const displayName = `${player.last_name} ${player.first_name}`.trim() || "Joueur";
        const position = getActiveField(player.custom_fields, "Poste");

        return (
          <button
            key={player.id}
            type="button"
            onClick={() => onEdit(player)}
            className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left transition hover:bg-white/5"
          >
            <PlayerAvatar
              firstName={player.first_name}
              lastName={player.last_name}
              photoUrl={player.photo_url}
              size="sm"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-100">
                {displayName}
              </p>
              <p className="text-xs text-slate-400">
                {player.license_number
                  ? `Licence: ${player.license_number}`
                  : "Licence non renseignée"}
                {teamName ? ` • Équipe: ${teamName}` : ""}
              </p>
            </div>
            <div className="text-xs text-slate-300">
              {position ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  Poste: <span className="font-semibold text-white">{position}</span>
                </span>
              ) : (
                <span className="text-slate-500">Poste non renseigné</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
