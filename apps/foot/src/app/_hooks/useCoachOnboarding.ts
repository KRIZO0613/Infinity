"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type CoachOnboardingData = {
  clubName: string;
  teamName: string;
  category: string;
  level: string;
};

const slugify = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export default function useCoachOnboarding() {
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkOnboarding = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: userData, error: userError } =
      await supabase.auth.getUser();

    if (userError || !userData.user) {
      setNeedsOnboarding(false);
      setIsOpen(false);
      setLoading(false);
      return;
    }

    const userId = userData.user.id;

    const [clubResult, teamResult] = await Promise.all([
      supabase
        .from("club_members")
        .select("club_id")
        .eq("user_id", userId)
        .limit(1),
      supabase.from("teams").select("id").eq("user_id", userId).limit(1),
    ]);

    if (clubResult.error || teamResult.error) {
      console.error(
        "Erreur vérification onboarding:",
        clubResult.error?.message ?? teamResult.error?.message
      );
      setNeedsOnboarding(false);
      setIsOpen(false);
      setLoading(false);
      return;
    }

    const hasTeam = (teamResult.data ?? []).length > 0;
    const needs = !hasTeam;

    setNeedsOnboarding(needs);
    setIsOpen(needs);
    setLoading(false);
  }, []);

  useEffect(() => {
    void checkOnboarding();
  }, [checkOnboarding]);

  const startOnboarding = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeOnboarding = useCallback(() => {
    setIsOpen(false);
  }, []);

  const completeOnboarding = useCallback(
    async ({ clubName, teamName, category, level }: CoachOnboardingData) => {
      if (submitting) return;
      setSubmitting(true);
      setError(null);

      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userData.user) {
          const message = "Session expirée, reconnecte-toi.";
          setError(message);
          throw new Error(message);
        }

        const cleanedClubName = clubName.trim();
        const cleanedTeamName = teamName.trim() || "Equipe 1";
        const cleanedCategory = category || "U12";
        const cleanedLevel = level.trim();

        if (!cleanedLevel) {
          const message = "Le niveau est obligatoire.";
          setError(message);
          throw new Error(message);
        }

        const { data: membershipData, error: membershipError } = await supabase
          .from("club_members")
          .select("club_id")
          .eq("user_id", userData.user.id)
          .limit(1);

        if (membershipError) {
          setError(membershipError.message);
          throw new Error(membershipError.message);
        }

        let clubId = membershipData?.[0]?.club_id ?? null;

        if (!clubId) {
          if (!cleanedClubName) {
            const message = "Le nom du club est obligatoire.";
            setError(message);
            throw new Error(message);
          }

          const { data: clubData, error: clubError } = await supabase
            .from("clubs")
            .insert({
              name: cleanedClubName,
              slug: slugify(cleanedClubName),
            })
            .select("id")
            .single();

          if (clubError || !clubData?.id) {
            const message = clubError?.message ?? "Impossible de créer le club.";
            setError(message);
            throw new Error(message);
          }

          clubId = clubData.id as string;

          const { error: memberError } = await supabase
            .from("club_members")
            .insert({
              club_id: clubId,
              user_id: userData.user.id,
              role: "owner",
              status: "active",
            });

          if (memberError) {
            setError(memberError.message);
            throw new Error(memberError.message);
          }
        }

        const { data: existingTeam } = await supabase
          .from("teams")
          .select("id")
          .eq("user_id", userData.user.id)
          .limit(1);

        if (!existingTeam?.length) {
          const { error: teamError } = await supabase.from("teams").insert({
            club_id: clubId,
            user_id: userData.user.id,
            name: cleanedTeamName,
            category: cleanedCategory,
            level: cleanedLevel,
            photo_url: null,
            players_count: 0,
          });

          if (teamError) {
            setError(teamError.message);
            throw new Error(teamError.message);
          }
        }

        setNeedsOnboarding(false);
        setIsOpen(false);
      } finally {
        setSubmitting(false);
      }
    },
    [submitting],
  );

  return {
    needsOnboarding,
    isOpen,
    loading,
    submitting,
    error,
    startOnboarding,
    closeOnboarding,
    completeOnboarding,
  };
}
