import PlayerAvatar from "@/app/app/teams/_components/PlayerAvatar";
import type { Player } from "@/app/app/teams/_types/player";

type PlayerStripProps = {
  players: Player[];
  onEdit: (player: Player) => void;
};

export default function PlayerStrip({ players, onEdit }: PlayerStripProps) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {players.map((player) => {
        const displayName =
          `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() ||
          "Joueur";

        return (
          <button
            key={player.id}
            type="button"
            onClick={() => onEdit(player)}
            className="flex min-w-[180px] items-center gap-3 rounded-full border border-white/10 bg-black/25 px-4 py-2 text-left transition hover:bg-white/5"
          >
            <PlayerAvatar
              firstName={player.first_name}
              lastName={player.last_name}
              photoUrl={player.photo_url}
              size="sm"
              className="rounded-full"
            />
            <div>
              <p className="text-xs font-semibold text-slate-100">
                {displayName}
              </p>
              <p className="text-[11px] text-slate-400">
                {player.license_number ?? "Licence"}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
