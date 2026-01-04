"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Section from "@/components/ui/Section";
import { useProjectStore } from "@/store/projectStore";
import styles from "@/components/project/ProjectEditor.module.css";

export default function NewProjectPage() {
  const router = useRouter();
  const addProject = useProjectStore((s) => s.addProject);
  const [title, setTitle] = useState("");

  const canSave = useMemo(() => title.trim().length > 0, [title]);

  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const fallbackId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : fallbackId;
    const safeId = typeof id === "string" && id.length > 0 ? id : fallbackId;
    const createdAt = Date.now();
    addProject({
      id: safeId,
      title: trimmed,
      pageTitle: "",
      subtitle: "",
      description: "",
      summary: [],
      summarySections: [],
      summaryStyle: "none",
      pages: [
        {
          id: `page-${safeId}-1`,
          name: "Page 1",
          pageTitle: "",
          subtitle: "",
          description: "",
          summary: [],
          summarySections: [],
          summaryStyle: "none",
          blocks: {},
        },
      ],
      blocks: {},
      createdAt,
    });
    router.push(`/projects/${encodeURIComponent(safeId)}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 pb-16 sm:px-8">
      <Section
        title="Nouveau projet"
        description="Une base noire et blanche, claire et silencieuse. On complète le reste ensuite."
      >
        <Card>
          <div className="flex flex-col gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Titre
            </span>
            <input
              type="text"
              name="title"
              placeholder="Nom du projet"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`${styles.projectTitleInput} text-sm`}
              aria-label="Titre du projet"
            />
            <p className="text-[12px] text-slate-500">
              Le titre sert de repère principal. On ajoutera les autres champs ensuite.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="rounded-full px-4 py-2 text-[11px] font-semibold transition disabled:opacity-40"
                style={{
                  background: "var(--text)",
                  color: "var(--bg)",
                  border: "none",
                }}
                onClick={handleSave}
                disabled={!canSave}
              >
                Sauvegarder
              </button>
            </div>
          </div>
        </Card>
      </Section>
    </div>
  );
}
