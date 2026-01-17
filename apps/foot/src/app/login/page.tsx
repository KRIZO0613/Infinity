"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Email et mot de passe obligatoires");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      // login OK → on va sur /app
      console.log("SESSION", data.session);
      router.push("/app");
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err?.message ?? "Erreur de connexion");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800/70 bg-slate-900/60 px-6 py-6 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
        <div className="mb-5 flex flex-col items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#ec4899] text-sm font-semibold text-white shadow-[0_0_16px_rgba(139,92,246,0.9)]">
            ∞
          </div>
          <h1 className="text-lg font-semibold">Connexion</h1>
          <p className="text-xs text-slate-400 text-center">
            Connecte-toi pour accéder à ton espace Infinity Foot.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-slate-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-[#8b5cf6] focus:outline-none"
              autoComplete="email"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-300">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-[#8b5cf6] focus:outline-none"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-full bg-[#8b5cf6] px-4 py-2 text-sm font-medium text-white shadow-[0_0_16px_rgba(139,92,246,0.8)] hover:bg-[#a855f7] disabled:opacity-60"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}