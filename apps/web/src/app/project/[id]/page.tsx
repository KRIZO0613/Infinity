import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Section from "@/components/ui/Section";

type ProjectPageProps = {
  params: {
    id: string;
  };
};

export default function ProjectPage({ params }: ProjectPageProps) {
  // TODO: Brancher la vue Projet avec timeline, fiches collaboratives et états synchronisés.
  const projectName = decodeURIComponent(params.id);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 pb-16 sm:px-8">
      <Section
        title={`Projet · ${projectName}`}
        description="Structurez vos informations clés : objectifs, équipe, jalons et dépendances."
      >
        <Card>
          <h3 className="title-strong text-base font-semibold">Résumé</h3>
          <p className="paragraph-muted mt-3 text-sm">
            Ajoutez ici une description percutante du projet, l’équipe impliquée et les indicateurs prioritaires.
          </p>
        </Card>
      </Section>

      <Section title="Tâches" description="Visualisez vos prochaines étapes pour garder le rythme.">
        <EmptyState className="min-h-[140px]" message="Aucune tâche assignée pour l’instant." />
      </Section>

      <Section title="Timeline" description="Synchronisez vos échéances et jalons majeurs.">
        <Card muted>
          <p className="paragraph-soft text-sm">
            Positionnez ici un diagramme ou une ligne du temps interactive dès que la fonctionnalité sera disponible.
          </p>
        </Card>
      </Section>
    </div>
  );
}
