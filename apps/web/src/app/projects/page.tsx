"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import Card from "@/components/ui/Card";
import Section from "@/components/ui/Section";
import { useProjectStore } from "@/store/projectStore";

export default function ProjectsPage() {
  const projects = useProjectStore((s) => s.projects);
  const setProjects = useProjectStore((s) => s.setProjects);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.createdAt - a.createdAt),
    [projects],
  );

  const needsNormalization = useMemo(() => {
    const seen = new Set<string>();
    for (const project of projects) {
      const raw = project.id !== null && project.id !== undefined ? String(project.id).trim() : "";
      const invalid = raw === "" || raw === "undefined" || raw === "null";
      if (invalid || seen.has(raw)) return true;
      seen.add(raw);
    }
    return false;
  }, [projects]);

  useEffect(() => {
    if (!needsNormalization) return;
    setProjects(projects);
  }, [needsNormalization, projects, setProjects]);

  const projectIdCounts = useMemo(() => {
    const counts = new Map<string, number>();
    projects.forEach((project) => {
      const raw = project.id !== null && project.id !== undefined ? String(project.id).trim() : "";
      if (!raw) return;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    });
    return counts;
  }, [projects]);


  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 pb-16 sm:px-8">
      <Section
        title="Projets"
        description="Liste simple des projets enregistrés."
      >
        <Card>
          <div className="flex flex-col gap-3">
            {sortedProjects.length === 0 && (
              <div className="text-sm text-slate-500">Aucun projet pour l’instant.</div>
            )}
            {sortedProjects.map((project) => {
              const raw = project.id !== null && project.id !== undefined ? String(project.id).trim() : "";
              const invalid = raw === "" || raw === "undefined" || raw === "null" || (projectIdCounts.get(raw) ?? 0) > 1;
              if (invalid) return null;
              const routeId = raw;
              return (
              <Link
                key={routeId}
                href={`/projects/${encodeURIComponent(routeId)}`}
                className="flex items-center justify-between rounded-xl px-4 py-3 text-sm text-slate-800 transition hover:bg-black/5"
              >
                <span className="font-semibold">{project.title}</span>
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Ouvrir</span>
              </Link>
              );
            })}
          </div>
        </Card>
      </Section>
    </div>
  );
}
