"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/app/_components/DashboardLayout";
import InfoCard from "@/app/_components/InfoCard";
import { supabase } from "@/lib/supabaseClient";

export default function TeamsNewPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const levelRef = useRef<HTMLInputElement | null>(null);

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setPhotoUrl(null);
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      setPhotoUrl(typeof result === "string" ? result : null);
    };

    reader.onerror = (err) => {
      console.error("Erreur chargement image équipe:", err);
      setPhotoUrl(null);
    };

    reader.readAsDataURL(file);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Le nom de l’équipe est obligatoire.");
      nameRef.current?.focus();
      return;
    }
    if (!level.trim()) {
      setError("Le niveau est obligatoire.");
      levelRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setError(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError("Session expirée. Reconnecte-toi.");
      setSubmitting(false);
      return;
    }

    const { error: insertError } = await supabase.from("teams").insert({
      user_id: user.id,
      name: name.trim(),
      category: category.trim() || null,
      level: level.trim(),
      photo_url: photoUrl,
      players_count: 0,
    });

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    router.push("/app/teams");
  }

  /* =========================
     RENDER
  ========================= */
  return (
    <DashboardLayout
      eyebrow="Équipes"
      title="Créer une équipe"
      subtitle="Ajoute le nom, la catégorie et une photo."
    >
      <div className="mt-6 max-w-3xl">
        <InfoCard
          title="Nouvelle équipe"
          description="Renseigne le nom et la catégorie. La photo est optionnelle."
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Photo de l’équipe
              <div className="mt-3 flex items-center gap-4">
                <div className="h-20 w-20 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt="Aperçu"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-500">
                      Aperçu
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="text-xs text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-200 hover:file:bg-white/15"
                />
              </div>
            </label>

            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Nom de l’équipe
              <input
                type="text"
                ref={nameRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex: U13 Elite"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-[#8b5cf6]/60 focus:ring-1 focus:ring-[#8b5cf6]/40"
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Catégorie
              <input
                type="text"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Ex: U11, U13, Seniors"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-[#8b5cf6]/60 focus:ring-1 focus:ring-[#8b5cf6]/40"
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Niveau
              <input
                type="text"
                ref={levelRef}
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                placeholder="Ex: 4"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-[#8b5cf6]/60 focus:ring-1 focus:ring-[#8b5cf6]/40"
              />
            </label>

            {error ? <p className="text-xs text-rose-300">{error}</p> : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full border border-[#8b5cf6]/60 bg-white/5 px-4 py-2 text-xs font-semibold text-[#c4b5fd] shadow-[0_8px_18px_rgba(139,92,246,0.25)] transition hover:border-[#8b5cf6]/80 hover:bg-white/10 disabled:opacity-60"
              >
                {submitting ? "Création…" : "Créer l’équipe"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/app/teams")}
                className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/5"
              >
                Annuler
              </button>
            </div>
          </form>
        </InfoCard>
      </div>
    </DashboardLayout>
  );
}
