"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import InfoField from "@/app/_components/InfoField";

type ProfileState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
};

const AVATAR_PRESETS = [
  { id: 0, emoji: "🧑‍🏫", bg: "from-[#8b5cf6] to-[#ec4899]" },
  { id: 1, emoji: "🧑‍💼", bg: "from-[#22c55e] to-[#16a34a]" },
  { id: 2, emoji: "⚽", bg: "from-[#facc15] to-[#f97316]" },
  { id: 3, emoji: "🧠", bg: "from-[#0ea5e9] to-[#6366f1]" },
  { id: 4, emoji: "🔥", bg: "from-[#ef4444] to-[#f97316]" },
  { id: 5, emoji: "⭐", bg: "from-[#a855f7] to-[#ec4899]" },
];

export default function ProfileForm() {
  const [profile, setProfile] = useState<ProfileState>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [selectedAvatarId, setSelectedAvatarId] = useState<number>(0);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user) {
        if (mounted) {
          setError("Impossible de charger le profil.");
          setLoading(false);
        }
        return;
      }

      const metadata = data.user.user_metadata ?? {};
      const firstName =
        typeof metadata.first_name === "string" ? metadata.first_name : "";
      const lastName =
        typeof metadata.last_name === "string" ? metadata.last_name : "";

      const phone =
        typeof metadata.phone === "string" ? metadata.phone : "";
      const address =
        typeof metadata.address === "string" ? metadata.address : "";
      const city =
        typeof metadata.city === "string" ? metadata.city : "";
      const country =
        typeof metadata.country === "string" ? metadata.country : "";

      const avatarId =
        typeof metadata.avatar_id === "number" ? metadata.avatar_id : 0;

      if (mounted) {
        setProfile({
          firstName,
          lastName,
          email: data.user.email ?? "",
          phone,
          address,
          city,
          country,
        });
        setSelectedAvatarId(avatarId);
        setLoading(false);
        setIsEditing(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const firstName = profile.firstName.trim();
    const lastName = profile.lastName.trim();
    const phone = profile.phone.trim();
    const address = profile.address.trim();
    const city = profile.city.trim();
    const country = profile.country.trim();

    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        first_name: firstName || null,
        last_name: lastName || null,
        full_name: fullName || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        country: country || null,
        avatar_id: selectedAvatarId,
      },
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      setIsEditing(false);
    }

    setSaving(false);
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Chargement du profil…</p>;
  }

  const currentAvatar =
    AVATAR_PRESETS.find((a) => a.id === selectedAvatarId) ?? AVATAR_PRESETS[0];

  const cityCountryDisplay =
    profile.city || profile.country
      ? [profile.city, profile.country].filter(Boolean).join(" • ")
      : "Non renseigné";

  return (
    <div className="relative">
      {/* Avatar + bouton édition texte */}
      <div className="absolute right-0 -top-10 flex items-center gap-3 sm:-top-11">
        {/* Avatar rond */}
        <div className="relative">
          <div
            className={[
              "flex h-12 w-12 items-center justify-center rounded-full",
              "bg-gradient-to-br",
              currentAvatar.bg,
              "text-base font-semibold text-white",
              "shadow-[0_0_18px_rgba(139,92,246,0.85)]",
            ].join(" ")}
          >
            {currentAvatar.emoji}
          </div>

          <button
            type="button"
            onClick={() => setShowAvatarPicker((prev) => !prev)}
            className="
              absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center
              rounded-full border border-[#8b5cf6]/80 bg-[#050716]
              text-[11px] text-[#c4b5fd]
              shadow-[0_0_10px_rgba(139,92,246,0.85)]
              hover:bg-[#111827] hover:border-[#a855f7]/90
              transition
            "
            aria-label="Changer l'avatar du profil"
          >
            +
          </button>
        </div>

        {/* Bouton édition des champs texte */}
        {!isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center text-slate-400 transition hover:text-slate-100"
            aria-label="Modifier le profil"
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        )}
      </div>

      {/* Mode édition */}
      {isEditing ? (
        <form onSubmit={handleSubmit} className="space-y-6 pt-1">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
              Prénom
              <input
                type="text"
                value={profile.firstName}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    firstName: event.target.value,
                  }))
                }
                className="rounded-xl border border-transparent bg-[#0f1116] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-transparent focus:outline-none focus:ring-0 focus:bg-[#141827]"
                placeholder="Jean"
                autoComplete="given-name"
              />
            </label>

            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
              Nom
              <input
                type="text"
                value={profile.lastName}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    lastName: event.target.value,
                  }))
                }
                className="rounded-xl border border-transparent bg-[#0f1116] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-transparent focus:outline-none focus:ring-0 focus:bg-[#141827]"
                placeholder="Dupont"
                autoComplete="family-name"
              />
            </label>

            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
              Téléphone
              <input
                type="tel"
                value={profile.phone}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    phone: event.target.value,
                  }))
                }
                className="rounded-xl border border-transparent bg-[#0f1116] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-transparent focus:outline-none focus:ring-0 focus:bg-[#141827]"
                placeholder="+33 6 12 34 56 78"
                autoComplete="tel"
              />
            </label>

            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
              Email
              <input
                type="email"
                value={profile.email}
                readOnly
                className="cursor-not-allowed rounded-xl border border-transparent bg-[#11131a] px-3 py-2 text-sm text-slate-500"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-slate-400 md:col-span-2">
              Adresse
              <input
                type="text"
                value={profile.address}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    address: event.target.value,
                  }))
                }
                className="rounded-xl border border-transparent bg-[#0f1116] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-transparent focus:outline-none focus:ring-0 focus:bg-[#141827]"
                placeholder="Rue, n°, complément…"
                autoComplete="street-address"
              />
            </label>

            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
              Ville
              <input
                type="text"
                value={profile.city}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    city: event.target.value,
                  }))
                }
                className="rounded-xl border border-transparent bg-[#0f1116] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-transparent focus:outline-none focus:ring-0 focus:bg-[#141827]"
                placeholder="Marseille"
                autoComplete="address-level2"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-slate-400 md:col-span-1">
              Pays
              <input
                type="text"
                value={profile.country}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    country: event.target.value,
                  }))
                }
                className="rounded-xl border border-transparent bg-[#0f1116] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-transparent focus:outline-none focus:ring-0 focus:bg-[#141827]"
                placeholder="France"
                autoComplete="country-name"
              />
            </label>
          </div>

          {/* Picker d'avatars */}
          {showAvatarPicker && (
            <div className="mt-4 flex flex-wrap gap-3">
              {AVATAR_PRESETS.map((avatar) => {
                const selected = avatar.id === selectedAvatarId;
                return (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => setSelectedAvatarId(avatar.id)}
                    className={[
                      "relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br",
                      avatar.bg,
                      "text-sm font-semibold text-white",
                      "transition",
                      selected
                        ? "ring-2 ring-[#8b5cf6] shadow-[0_0_18px_rgba(139,92,246,0.9)]"
                        : "opacity-80 hover:opacity-100 hover:shadow-[0_0_14px_rgba(139,92,246,0.6)]",
                    ].join(" ")}
                  >
                    {avatar.emoji}
                    {selected && (
                      <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.9)]" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {error ? <p className="text-xs text-rose-300">{error}</p> : null}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setShowAvatarPicker(false);
              }}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-white/30 hover:bg-white/10"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full border border-[#8b5cf6]/50 bg-white/5 px-4 py-2 text-xs font-semibold text-[#c4b5fd] shadow-[0_8px_18px_rgba(139,92,246,0.25)] transition hover:border-[#8b5cf6]/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      ) : (
        // Mode lecture (InfoField)
        <div className="grid gap-4 pt-1 md:grid-cols-2">
          <InfoField label="Prénom" value={profile.firstName || "—"} />
          <InfoField label="Nom" value={profile.lastName || "—"} />
          <InfoField label="Email" value={profile.email || "—"} />
          <InfoField label="Téléphone" value={profile.phone || "—"} />
          <InfoField label="Adresse" value={profile.address || "—"} />
          <InfoField label="Ville / pays" value={cityCountryDisplay} />
        </div>
      )}
    </div>
  );
}