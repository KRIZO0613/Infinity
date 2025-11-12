import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Section from "@/components/ui/Section";

type BoardPageProps = {
  params: {
    id: string;
  };
};

export default function BoardPage({ params }: BoardPageProps) {
  // TODO: Brancher la vue Board avec sections configurables (Table / Fiche / Calendrier).
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-16 sm:px-8">
      <Section
        title={`Board · ${decodeURIComponent(params.id)}`}
        description="Résumé des initiatives, responsables et statuts clés."
      >
        <Card>
          <p className="paragraph-muted text-sm">
            Ajoutez ici un récapitulatif du board, vos liens rapides et les membres assignés.
          </p>
        </Card>
      </Section>

      <Section title="Activités récentes" description="Surveillez les mouvements importants de votre équipe.">
        <EmptyState className="min-h-[140px]" message="Aucune activité enregistrée pour le moment." />
      </Section>

      <Section title="Widgets personnalisés">
        <div className="grid gap-4 md:grid-cols-2">
          <Card muted>
            <h3 className="title-strong text-base font-semibold">Widget #1</h3>
            <p className="paragraph-soft mt-2 text-sm">
              Connectez ici votre widget personnalisé pour suivre les KPI du board.
            </p>
          </Card>
          <Card muted>
            <h3 className="title-strong text-base font-semibold">Widget #2</h3>
            <p className="paragraph-soft mt-2 text-sm">
              Déposez un calendrier ou un graphique dès que l’intégration sera prête.
            </p>
          </Card>
        </div>
      </Section>
    </div>
  );
}
