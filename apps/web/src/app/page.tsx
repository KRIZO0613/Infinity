import Link from "next/link";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Section from "@/components/ui/Section";

export default function DashboardPage() {
  // TODO: Brancher la Table des projets épinglés.
  // TODO: Brancher les widgets (Table / Fiche / Calendrier).
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-16 sm:px-8">
      <Section
        title="Projets épinglés"
        description="Gardez un aperçu immédiat de vos initiatives prioritaires. Ajoutez vos projets favoris ici pour un accès instantané."
        actions={
          <Link
            href="/project/demo"
            className="btn-accent inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
          >
            Voir un exemple
          </Link>
        }
      >
        <EmptyState message="Pas encore de projets épinglés." className="min-h-[180px]" />
      </Section>

      <Section
        title="Widgets"
        description="Composez votre dashboard avec des blocs interactifs : analytics, activités, notes rapides…"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="title-strong text-base font-semibold">Flux d’activité</h3>
            <p className="paragraph-muted mt-2 text-sm">
              Visualisez les événements récents dès qu’ils seront branchés.
            </p>
          </Card>
          <Card>
            <h3 className="title-strong text-base font-semibold">Notes rapides</h3>
            <p className="paragraph-muted mt-2 text-sm">
              Capturez vos idées clés et synchronisez-les avec vos boards.
            </p>
          </Card>
          <Card className="md:col-span-2">
            <h3 className="title-strong text-base font-semibold">Timeline</h3>
            <p className="paragraph-muted mt-2 text-sm">
              Rapprochez vos échéances critiques pour garder le cap sur vos livrables.
            </p>
          </Card>
        </div>
      </Section>
    </div>
  );
}
