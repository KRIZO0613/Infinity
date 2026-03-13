import MatchSheetListClient from "@/app/app/teams/_components/match-sheet/MatchSheetListClient";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function TeamMatchSheetPage({ params }: PageProps) {
  const { id } = await params;
  return <MatchSheetListClient teamId={id} />;
}
