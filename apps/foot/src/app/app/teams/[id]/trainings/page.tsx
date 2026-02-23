import TeamTrainingsClient from "./TeamTrainingsClient";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function TeamTrainingsPage({ params }: PageProps) {
  const { id } = await params;
  return <TeamTrainingsClient teamId={id} />;
}
