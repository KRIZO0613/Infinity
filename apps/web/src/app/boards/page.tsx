import Link from "next/link";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Section from "@/components/ui/Section";

export default function BoardsPage() {
  // TODO: Brancher la liste des boards avec filtres et pagination.
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-16 sm:px-8">
      <Section
        title="Boards"
        description="Centralisez vos espaces collaboratifs. Chaque board regroupe les projets, widgets et documents associés."
        actions={
          <Link
            href="/boards/new"
            className="btn-accent inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
          >
            Nouveau board
          </Link>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="title-strong text-lg font-semibold">Board d’exemple</h3>
            <p className="paragraph-muted mt-2 text-sm">
              Un aperçu des sections clés à personnaliser selon vos besoins.
            </p>
            <Link
              href="/boards/demo"
              className="link-accent mt-6 inline-flex items-center text-sm font-semibold"
            >
              Ouvrir le board →
            </Link>
          </Card>
          <EmptyState className="min-h-[200px]" message="Aucun board créé pour le moment." />
        </div>
      </Section>
    </div>
  );
}
