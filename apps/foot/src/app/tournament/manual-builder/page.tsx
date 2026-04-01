import { readFile } from "node:fs/promises";
import path from "node:path";

import { ManualTournamentBuilder } from "./_components/ManualTournamentBuilder";

const parseRegisteredTeams = (csvContent: string) => {
  const lines = csvContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return Array.from(
    new Set(
      lines
        .slice(1)
        .map((line) => line.split(",")[1]?.trim())
        .filter((team): team is string => Boolean(team) && team !== "A SUPPRIMER"),
    ),
  );
};

async function getRegisteredTeams() {
  const csvPath = path.join(process.cwd(), "data", "clubs", "clubs-mediterranee.csv");
  const csvContent = await readFile(csvPath, "utf8");

  return parseRegisteredTeams(csvContent);
}

export default async function ManualTournamentBuilderPage() {
  const registeredTeams = await getRegisteredTeams();

  return <ManualTournamentBuilder registeredTeamOptions={registeredTeams} />;
}
