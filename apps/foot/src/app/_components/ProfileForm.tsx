"use client";

import { useEffect, useState, ChangeEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import InfoField from "@/app/_components/InfoField";

type ProfileState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  avatarEmoji: string;
  avatarUrl: string | null;
};

const AVATAR_EMOJIS = ["🧠", "⚽️", "🔥", "⭐️", "🛡️", "🚀"];

export default function ProfileForm() {
  const [profile, setProfile] = useState<ProfileState>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    postalCode: "",
    city: "",
    country: "",
    avatarEmoji: "🧠",
    avatarUrl: null,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  // ========= LOAD =========
  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
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
        const postalCode =
          typeof metadata.postal_code === "string" ? metadata.postal_code : "";
        const city = typeof metadata.city === "string" ? metadata.city : "";
        const country =
          typeof metadata.country === "string" ? metadata.country : "";
        const avatarEmoji =
          typeof metadata.avatar_emoji === "string"
            ? metadata.avatar_emoji
            : "🧠";
        const avatarUrl =
          typeof metadata.avatar_url === "string" ? metadata.avatar_url : null;

        if (mounted) {
          setProfile({
            firstName,
            lastName,
            email: data.user.email ?? "",
            phone,
            address,
            postalCode,
            city,
            country,
            avatarEmoji,
            avatarUrl,
          });
          setLoading(false);
          setIsEditing(false);
          setShowAvatarPicker(false);
        }
      } catch (err: unknown) {
        // Cas typique : AbortError quand on refresh/navigation en plein milieu
        if (err instanceof DOMException && err.name === "AbortError") {
          console.log("ProfileForm: requête annulée (AbortError), on ignore.");
          return;
        }

        console.error("Erreur inattendue ProfileForm:", err);
        if (mounted) {
          setError("Erreur lors du chargement du profil.");
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  // ========= SAVE =========
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const firstName = profile.firstName.trim();
    const lastName = profile.lastName.trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        first_name: firstName || null,
        last_name: lastName || null,
        full_name: fullName || null,
        phone: profile.phone.trim() || null,
        address: profile.address.trim() || null,
        postal_code: profile.postalCode.trim() || null,
        city: profile.city.trim() || null,
        country: profile.country.trim() || null,
        avatar_emoji: profile.avatarEmoji || null,
        avatar_url: profile.avatarUrl || null,
      },
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      setIsEditing(false);
      setShowAvatarPicker(false);
    }

    setSaving(false);
  }

  // ========= AVATAR =========
  function handleAvatarEmojiSelect(emoji: string) {
    setProfile((prev) => ({
      ...prev,
      avatarEmoji: emoji,
      avatarUrl: null,
    }));
    setShowAvatarPicker(false);
  }

  function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      setProfile((prev) => ({
        ...prev,
        avatarUrl: typeof result === "string" ? result : prev.avatarUrl,
      }));
      setShowAvatarPicker(false);
    };

    reader.onerror = (err) => {
      console.error("Erreur chargement avatar (FileReader)", err);
    };

    try {
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Erreur FileReader.readAsDataURL", err);
    }
  }

  // ========= SKELETON (vue lecture) =========
  const SkeletonLine = ({ w = "w-full" }: { w?: string }) => (
    <div className={`h-4 ${w} animate-pulse rounded-md bg-white/5`} />
  );

  const SkeletonField = () => (
    <div className="rounded-2xl border border-white/10 bg-white/5/5 p-4">
      <SkeletonLine w="w-24" />
      <div className="mt-2">
        <SkeletonLine w="w-40" />
      </div>
    </div>
  );

  const isBusy = loading || saving;

  return (
    <div className="relative pt-4">
      {/* Avatar + bouton édition */}
      <div className="absolute -top-10 right-0 flex items-center gap-3">
        {/* Avatar */}
        <div className="relative">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_0%,#f97316,transparent_55%),radial-gradient(circle_at_70%_100%,#6366f1,transparent_55%)] shadow-[0_0_20px_rgba(99,102,241,0.8)]">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt="Avatar"
                className="h-11 w-11 rounded-full object-cover"
              />
            ) : (
              <span className="text-xl">{profile.avatarEmoji || "🧠"}</span>
            )}
          </div>

          {isEditing && (
            <button
              type="button"
              onClick={() => setShowAvatarPicker((v) => !v)}
              className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-xs text-slate-50 ring-2 ring-[#0b0e1b]"
              aria-label="Changer l’avatar"
            >
              +
            </button>
          )}
        </div>

        {/* Crayon */}
        <button
          type="button"
          onClick={() => {
            setIsEditing((v) => !v);
            setShowAvatarPicker(false);
          }}
          className="inline-flex items-center text-slate-400 transition hover:text-slate-100"
          aria-label={
            isEditing ? "Fermer l’édition du profil" : "Modifier le profil"
          }
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
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
      </div>

      {/* Picker avatar */}
      {isEditing && showAvatarPicker && (
        <div className="absolute right-0 top-4 z-20 w-60 rounded-2xl border border-white/10 bg-[#050713]/95 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.8)] backdrop-blur">
          <p className="mb-2 text-xs font-medium text-slate-200">
            Choisir un avatar
          </p>
          <div className="mb-3 grid grid-cols-6 gap-2">
            {AVATAR_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleAvatarEmojiSelect(emoji)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-lg hover:bg-white/10"
              >
                {emoji}
              </button>
            ))}
          </div>

          <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/20 px-3 py-2 text-[11px] font-medium text-slate-300 hover:border-white/40 hover:bg-white/5">
            Importer une photo
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFileChange}
            />
          </label>
        </div>
      )}

      {/* Contenu : vue ou édition */}
      {isEditing ? (
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          {/* Nom / prénom */}
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
          </div>

          {/* Email / téléphone */}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
              Email
              <input
                type="email"
                value={profile.email}
                readOnly
                className="cursor-not-allowed rounded-xl border border-transparent bg-[#11131a] px-3 py-2 text-sm text-slate-500"
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
                placeholder="06 12 34 56 78"
                autoComplete="tel"
              />
            </label>
          </div>

          {/* Adresse + bloc code postal / ville / pays */}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
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
                placeholder="12 rue du stade"
                autoComplete="street-address"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                Code postal
                <input
                  type="text"
                  value={profile.postalCode}
                  onChange={(event) =>
                    setProfile((prev) => ({
                      ...prev,
                      postalCode: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-transparent bg-[#0f1116] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-transparent focus:outline-none focus:ring-0 focus:bg-[#141827]"
                  placeholder="06000"
                  autoComplete="postal-code"
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
                  placeholder="Nice"
                  autoComplete="address-level2"
                />
              </label>

              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
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
          </div>

          {error ? <p className="text-xs text-rose-300">{error}</p> : null}

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={isBusy}
              className="rounded-full border border-[#8b5cf6]/50 bg-white/5 px-4 py-2 text-xs font-semibold text-[#c4b5fd] shadow-[0_8px_18px_rgba(139,92,246,0.25)] transition hover:border-[#8b5cf6]/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      ) : loading ? (
        // ===== Vue lecture : skeleton quand ça charge =====
        <div className="grid gap-4 pt-4 md:grid-cols-2">
          <SkeletonField />
          <SkeletonField />
          <SkeletonField />
          <SkeletonField />
          <div className="md:col-span-2">
            <SkeletonField />
          </div>
        </div>
      ) : (
        // ===== Vue lecture : valeurs affichées =====
        <div className="grid gap-4 pt-4 md:grid-cols-2">
          <InfoField label="Prénom" value={profile.firstName || "—"} />
          <InfoField label="Nom" value={profile.lastName || "—"} />
          <InfoField label="Email" value={profile.email || "—"} />
          <InfoField
            label="Téléphone"
            value={profile.phone || "Non renseigné"}
          />
          <InfoField
            label="Adresse"
            value={profile.address || "Non renseignée"}
          />
          <InfoField label="Code postal" value={profile.postalCode || "—"} />
          <InfoField label="Ville" value={profile.city || "—"} />
          <InfoField label="Pays" value={profile.country || "—"} />
        </div>
      )}
    </div>
  );
}