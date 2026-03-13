import MatchSheetEditorClient from "@/app/app/teams/_components/match-sheet/MatchSheetEditorClient";

type PageProps = {
  params: Promise<{
    id: string;
    matchId: string;
  }>;
};

export default async function TeamMatchSheetEditorPage({
  params,
}: PageProps) {
  const { id, matchId } = await params;
  return <MatchSheetEditorClient teamId={id} matchId={matchId} />;
}
