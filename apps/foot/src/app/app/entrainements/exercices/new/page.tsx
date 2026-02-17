import ExerciseAnimatedEditor from "@/components/ExerciseAnimatedEditor";

type NewExercisePageProps = {
  searchParams?: Promise<{
    type?: string;
  }>;
};

export default async function NewExercisePage({
  searchParams,
}: NewExercisePageProps) {
  const resolved = (await searchParams) ?? {};
  if (resolved.type === "animated") {
    return <ExerciseAnimatedEditor />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070a14] px-6 text-slate-100">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
          Nouvel exercice
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-white">
          Choisis un type d'exercice
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Les modèles animés arrivent ici. Sélectionne “Animé” pour commencer.
        </p>
        <a
          href="/app/entrainements/exercices/new?type=animated"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
        >
          Créer un exercice animé
        </a>
      </div>
    </div>
  );
}
