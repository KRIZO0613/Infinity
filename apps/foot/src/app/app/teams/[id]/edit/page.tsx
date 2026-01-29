import DashboardLayout from "@/app/_components/DashboardLayout";
import InfoCard from "@/app/_components/InfoCard";

export default function EditTeamPage() {
  return (
    <DashboardLayout
      eyebrow="Équipes"
      title="Modifier l’équipe"
      subtitle="Modification d’équipe – à venir"
    >
      <div className="mt-6">
        <InfoCard title="Édition">
          <p className="text-sm text-slate-400">
            L’édition complète de l’équipe sera disponible prochainement.
          </p>
        </InfoCard>
      </div>
    </DashboardLayout>
  );
}
