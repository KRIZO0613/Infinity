import { useMemo, useState } from "react";
import PlayerAvatar from "@/app/app/teams/_components/PlayerAvatar";
import type { Player } from "@/app/app/teams/_types/player";

type PlayerSelectProps = {
  players: Player[];
  onSelect: (player: Player) => void;
};

export default function PlayerSelect({ players, onSelect }: PlayerSelectProps) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return players;
    return players.filter((player) => {
      const fullName = `${player.first_name} ${player.last_name}`.toLowerCase();
      return fullName.includes(search);
    });
  }, [players, query]);

  return (
    <div className="rounded-3xl border border-white/10 bg-black/30 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-md">
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Rechercher un joueur..."
        className="h-10 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-xs text-slate-100 outline-none transition focus:border-[#8b5cf6]/60 focus:ring-1 focus:ring-[#8b5cf6]/40"
      />

      <div className="mt-4 max-h-72 overflow-y-auto space-y-2">
        {results.length === 0 ? (
          <p className="text-xs text-slate-500">Aucun joueur trouvé.</p>
        ) : (
          results.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => onSelect(player)}
              className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-left text-xs text-slate-200 transition hover:bg-white/5"
            >
              <PlayerAvatar
                firstName={player.first_name}
                lastName={player.last_name}
                photoUrl={player.photo_url}
                size="sm"
                className="rounded-full"
              />
              <span className="font-semibold text-slate-100">
                {player.first_name} {player.last_name}
              </span>
              {player.license_number ? (
                <span className="text-[11px] text-slate-400">
                  {player.license_number}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
