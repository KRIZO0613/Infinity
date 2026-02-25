import ExerciseAnimatedEditor from "@/components/ExerciseAnimatedEditor";
import ExerciseStaticEditor from "@/components/ExerciseStaticEditor";

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
  if (resolved.type === "card") {
    return <ExerciseStaticEditor />;
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
          Sélectionne une animation ou une carte statique pour commencer.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <a
            href="/entrainements/exercices/new?type=animated"
            className="inline-flex items-center justify-center rounded-full bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
          >
            Créer une animation
          </a>
          <a
            href="/entrainements/exercices/new?type=card"
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            Créer une carte statique
          </a>
        </div>
      </div>
    </div>
  );
}
