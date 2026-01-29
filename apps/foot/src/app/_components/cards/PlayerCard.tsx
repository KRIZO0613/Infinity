import GameCardShell from "@/app/_components/cards/GameCardShell";

type PlayerCardProps = {
  title?: string;
  description?: string;
};

export default function PlayerCard({
  title = "Joueurs",
  description = "Gestion détaillée des joueurs à venir.",
}: PlayerCardProps) {
  return (
    <GameCardShell className="p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-100">{title}</h3>
        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] text-cyan-200">
          Bientôt
        </span>
      </div>
      <p className="mt-3 text-sm text-slate-400">{description}</p>
    </GameCardShell>
  );
}
