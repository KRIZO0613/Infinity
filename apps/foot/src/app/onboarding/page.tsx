"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  setActiveClubId,
  clearActiveClubId,
} from "@/lib/activeClub";
import { signOut } from "@/lib/auth";

type CreateClubRow = { club_id: string; invite_code: string };
type JoinClubRow = { club_id: string; status: string; role: string };

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  const [clubName, setClubName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingJoin, setLoadingJoin] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(
    null
  );
  const [createdClubId, setCreatedClubId] = useState<string | null>(null);

  const canCreate = useMemo(() => clubName.trim().length >= 2, [clubName]);
  const canJoin = useMemo(() => joinCode.trim().length >= 4, [joinCode]);

  // 🔶 Message en haut selon la raison
  const reasonMessage = useMemo(() => {
    switch (reason) {
      case "no_club":
        return "Tu n’as actuellement aucun club. Crée ton club ou rejoins-en un avec un code.";
      case "club_error":
        return "On n’a pas réussi à retrouver ton club. Crée un nouveau club ou rejoins-en un.";
      case "error":
        return "Une erreur s’est produite. Tu peux recréer un club ou rejoindre avec un code.";
      case "change":
        return null; // pas de message spécial quand on vient de “Changer de club”
      default:
        return null;
    }
  }, [reason]);

  // 🔁 Si l’utilisateur a déjà un club et qu’on n’est pas en mode “change”
  useEffect(() => {
    if (reason === "change") return; // on reste sur cette page

    let cancelled = false;

    (async () => {
      try {
        const { getMyClubs } = await import("@/lib/myClubs");
        const my = await getMyClubs();

        if (!cancelled && my.length) {
          const firstClubId = my[0].club_id;
          if (firstClubId) {
            setActiveClubId(firstClubId);
            router.replace("/app");
          }
        }
      } catch (e) {
        console.error("Onboarding auto-check clubs:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reason, router]);

  // 🟢 Créer un club (RPC)
  async function handleCreateClub() {
    setError(null);
    setCreatedInviteCode(null);
    setCreatedClubId(null);

    const name = clubName.trim();
    if (name.length < 2) {
      setError("Nom de club trop court (min 2 caractères)");
      return;
    }

    setLoadingCreate(true);

    const { data, error } = await supabase.rpc("create_club_and_owner", {
      p_name: name,
    });

    setLoadingCreate(false);

    if (error) {
      setError(error.message);
      return;
    }

    const row = (data as CreateClubRow[] | null)?.[0];
    if (!row?.club_id) {
      setError("Création OK mais réponse vide (RPC).");
      return;
    }

    setCreatedClubId(row.club_id);
    setCreatedInviteCode(row.invite_code || null);

    setActiveClubId(row.club_id);
    router.push("/app");
  }

  // 🟢 Rejoindre un club par code (RPC)
  async function handleJoinClub() {
    setError(null);
    setCreatedInviteCode(null);
    setCreatedClubId(null);

    const code = joinCode.trim();
    if (code.length < 4) {
      setError("Code trop court");
      return;
    }

    setLoadingJoin(true);

    const { data, error } = await supabase.rpc("join_club_with_code", {
      p_code: code,
    });

    setLoadingJoin(false);

    if (error) {
      setError(error.message);
      return;
    }

    const row = (data as JoinClubRow[] | null)?.[0];
    if (!row?.club_id) {
      setError("Rejoint OK mais réponse vide (RPC).");
      return;
    }

    setActiveClubId(row.club_id);
    router.push("/app");
  }

  async function handleCopyInvite() {
    if (!createdInviteCode) return;
    try {
      await navigator.clipboard.writeText(createdInviteCode);
    } catch {
      // fallback silence
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h1>Créer ou rejoindre un club</h1>

      {/* Bandeau raison */}
      {reasonMessage && (
        <div
          style={{
            marginTop: 12,
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 4,
            border: "1px solid #aa7722",
            background: "#332200",
            fontSize: 13,
          }}
        >
          {reasonMessage}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <button
          onClick={() =>
            signOut().then(() => {
              clearActiveClubId();
              router.push("/login");
            })
          }
        >
          Déconnexion
        </button>
      </div>

      <hr style={{ margin: "16px 0", opacity: 0.3 }} />

      <div style={{ display: "grid", gap: 18 }}>
        {/* A) Créer un club */}
        <section>
          <h3>Créer mon club</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              placeholder="Nom du club"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              onClick={handleCreateClub}
              disabled={loadingCreate || !canCreate}
            >
              {loadingCreate ? "Création..." : "Créer"}
            </button>
          </div>

          {createdInviteCode && (
            <div style={{ marginTop: 12, opacity: 0.9 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Code d’invitation (à partager)
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginTop: 6,
                }}
              >
                <code style={{ padding: "6px 10px", border: "1px solid #333" }}>
                  {createdInviteCode}
                </code>
                <button onClick={handleCopyInvite}>Copier</button>
              </div>
              {createdClubId && (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                  Club ID: {createdClubId}
                </div>
              )}
            </div>
          )}
        </section>

        <hr style={{ margin: "6px 0", opacity: 0.2 }} />

        {/* B) Rejoindre un club */}
        <section>
          <h3>Rejoindre un club (code)</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              placeholder="Ex: CLB_A1B2C3"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              onClick={handleJoinClub}
              disabled={loadingJoin || !canJoin}
            >
              {loadingJoin ? "Connexion..." : "Rejoindre"}
            </button>
          </div>

          <p style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            Si tu es coach solo, tu peux créer ton club “personnel”. Si tu
            rejoins un club existant, demande le code au responsable.
          </p>
        </section>
      </div>

      {error && (
        <p style={{ color: "salmon", marginTop: 14 }}>{error}</p>
      )}
    </div>
  );
}