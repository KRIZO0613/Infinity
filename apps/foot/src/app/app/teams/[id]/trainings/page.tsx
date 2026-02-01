import TeamTrainingsClient from "./TeamTrainingsClient";

type PageProps = {
  params: {
    id: string;
  };
};

export default function TeamTrainingsPage({ params }: PageProps) {
  return <TeamTrainingsClient teamId={params.id} />;
}
