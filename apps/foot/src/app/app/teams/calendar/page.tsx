"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function TeamCalendarRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function resolveTeamCalendar() {
      const stored = localStorage.getItem("activeTeamId");
      if (stored) {
        router.replace(`/app/teams/${stored}/calendar`);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("teams")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1);

      if (cancelled) return;

      if (error || !data?.length) {
        router.replace("/app/teams");
        return;
      }

      const teamId = data[0].id;
      localStorage.setItem("activeTeamId", teamId);
      router.replace(`/app/teams/${teamId}/calendar`);
    }

    resolveTeamCalendar();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070a14] text-slate-100">
      <p className="text-sm text-slate-400">Ouverture de l’agenda…</p>
    </div>
  );
}