"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import PlayerAvatar from "@/app/app/teams/_components/PlayerAvatar";
import {
  PLAYER_FIELD_LIBRARY,
  type PlayerFieldDefinition,
  type PlayerFieldType,
} from "@/app/app/teams/_config/playerFieldLibrary";
import type { Player, PlayerCustomField } from "@/app/app/teams/_types/player";

type PlayerFieldDraft = {
  id: string;
  key: string | null;
  label: string;
  type: PlayerFieldType;
  value: string;
  active: boolean;
  mode: "library" | "custom" | "unset";
};

type PlayerModalProps = {
  open: boolean;
  clubId: string | null;
  teamId: string;
  player: Player | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
};

const FIELD_BY_KEY = new Map(
  PLAYER_FIELD_LIBRARY.map((field) => [field.key, field]),
);

const findDefinitionByLabel = (label: string) =>
  PLAYER_FIELD_LIBRARY.find(
    (field) => field.label.toLowerCase() === label.toLowerCase(),
  );

const normalizeLabel = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");

const MAIN_FIELD_KEYS = [
  "jersey_number",
  "position",
  "birth_year",
  "strong_foot",
] as const;

const MAIN_LABEL_TO_KEY: Record<string, (typeof MAIN_FIELD_KEYS)[number]> = {
  numerodemaillot: "jersey_number",
  numero: "jersey_number",
  maillot: "jersey_number",
  poste: "position",
  position: "position",
  anneedenaissance: "birth_year",
  datedenaissance: "birth_year",
  naissance: "birth_year",
  piedfort: "strong_foot",
  pied: "strong_foot",
};

const getMainFieldKey = (field: PlayerFieldDraft) => {
  if (field.key && MAIN_FIELD_KEYS.includes(field.key)) {
    return field.key;
  }
  const normalized = normalizeLabel(field.label);
  return MAIN_LABEL_TO_KEY[normalized] ?? null;
};

const getFieldIcon = (field: PlayerFieldDraft) => {
  const normalizedKey = getMainFieldKey(field) ?? normalizeLabel(field.label);

  if (normalizedKey === "jersey_number") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 4l5 3 5-3 3 3-2 4v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V11L4 7l3-3z" />
      </svg>
    );
  }
  if (normalizedKey === "position") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="7" r="3" />
        <path d="M5 21c1.5-4 4.5-6 7-6s5.5 2 7 6" />
      </svg>
    );
  }
  if (normalizedKey === "birth_year") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 3v4" />
        <path d="M17 3v4" />
        <path d="M3 10h18" />
      </svg>
    );
  }
  if (normalizedKey === "strong_foot") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 13c1.5-3 3-4 5-4 1.5 0 2.5.5 4 2l3 3-5 4H7v-5z" />
        <path d="M7 18v3" />
      </svg>
    );
  }
  if (normalizedKey === "height") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 4v16" />
        <path d="M4 8h3" />
        <path d="M4 12h5" />
        <path d="M4 16h3" />
      </svg>
    );
  }
  if (normalizedKey === "strength") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3l2.6 5.2L20 9l-4 3.9.9 5.6L12 16l-4.9 2.5.9-5.6L4 9l5.4-.8L12 3z" />
      </svg>
    );
  }
  if (normalizedKey === "weight") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="5" y="5" width="14" height="14" rx="3" />
        <path d="M9 10h6" />
      </svg>
    );
  }
  return (
    <span className="h-1.5 w-1.5 rounded-full bg-slate-400/70" aria-hidden />
  );
};

export default function PlayerModal({
  open,
  clubId,
  teamId,
  player,
  onClose,
  onSaved,
  onDeleted,
}: PlayerModalProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [fields, setFields] = useState<PlayerFieldDraft[]>([]);
  const [showMainFields, setShowMainFields] = useState(true);
  const [showCustomFields, setShowCustomFields] = useState(true);
  const [showAutoStats, setShowAutoStats] = useState(true);
  const [autoStatsTab, setAutoStatsTab] = useState<"goals" | "assists">(
    "goals",
  );
  const [autoStatsDetailsOpen, setAutoStatsDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  const isEditing = Boolean(player?.id);
  const getCustomFieldValue = (labels: string[]) => {
    const normalizedLabels = labels.map(normalizeLabel);
    const fields = Array.isArray(player?.custom_fields)
      ? (player?.custom_fields as PlayerCustomField[])
      : [];
    return (
      fields.find((field) =>
        normalizedLabels.includes(normalizeLabel(field.label ?? "")),
      )?.value ?? null
    );
  };
  const parseStatValue = (value: string | null) => {
    const parsed = Number.parseInt(String(value ?? "0"), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const autoMatches = parseStatValue(
    getCustomFieldValue(["matchs", "matches", "match"]),
  );
  const autoGoalsChamp = parseStatValue(
    getCustomFieldValue(["buts championnat", "butschampionnat"]),
  );
  const autoGoalsFriendly = parseStatValue(
    getCustomFieldValue(["buts amical", "buts amicaux", "butsamical"]),
  );
  const autoGoalsPlateau = parseStatValue(
    getCustomFieldValue(["buts plateau", "butsplateau"]),
  );
  const autoGoalsTotal =
    autoGoalsChamp + autoGoalsFriendly + autoGoalsPlateau;
  const autoAssistsChamp = parseStatValue(
    getCustomFieldValue([
      "passes d championnat",
      "passes championnat",
      "passesdchampionnat",
    ]),
  );
  const autoAssistsFriendly = parseStatValue(
    getCustomFieldValue([
      "passes d amical",
      "passes amical",
      "passesdamical",
    ]),
  );
  const autoAssistsPlateau = parseStatValue(
    getCustomFieldValue([
      "passes d plateau",
      "passes plateau",
      "passesdplateau",
    ]),
  );
  const autoAssistsTotal =
    autoAssistsChamp + autoAssistsFriendly + autoAssistsPlateau;

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setPhotoUrl(player?.photo_url ?? null);
    setPhotoFile(null);
    setFirstName(player?.first_name ?? "");
    setLastName(player?.last_name ?? "");
    setLicenseNumber(player?.license_number ?? "");

    const nextFields = (player?.custom_fields ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .filter((field) => field.label && field.value)
      .map((field, index) => {
        const def = findDefinitionByLabel(field.label);
        const mode: PlayerFieldDraft["mode"] = def ? "library" : "custom";
        const resolvedType =
          field.type === "url" ? "link" : field.type ?? def?.type ?? "text";
        return {
          id: field.id || `${player?.id ?? "new"}-${index}-${field.label}`,
          key: def?.key ?? null,
          label: field.label,
          type: resolvedType,
          value: field.value,
          active: field.active !== false,
          mode,
        };
      });

    setFields(nextFields);
    setShowMainFields(true);
    setShowCustomFields(true);
    setShowAutoStats(false);
    setAutoStatsTab("goals");
    setAutoStatsDetailsOpen(false);
    setError(null);
    setSaveFeedback(false);
  }, [open, player]);

  const handleAddField = () => {
    setFields((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        key: null,
        label: "",
        type: "text",
        value: "",
        active: true,
        mode: "unset",
      },
    ]);
  };

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      setPhotoUrl(typeof result === "string" ? result : null);
    };
    reader.onerror = (err) => {
      console.error("Erreur chargement image joueur:", err);
    };
    reader.readAsDataURL(file);
    setPhotoFile(file);
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!firstName.trim() || !lastName.trim() || !licenseNumber.trim()) {
      setError("Nom, prénom et numéro de licence sont obligatoires.");
      return;
    }
    if (!teamId) {
      setError("Equipe introuvable. Recharge la page.");
      return;
    }
    if (!clubId) {
      setError("Club introuvable. Recharge la page.");
      return;
    }

    setSaving(true);
    setError(null);

    let nextPhotoUrl = photoUrl ?? null;

    if (photoFile) {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      if (userError || !userData.user) {
        setError("Session expirée, reconnecte-toi.");
        setSaving(false);
        return;
      }

      const ext = photoFile.name.split(".").pop() ?? "jpg";
      const filePath = `${clubId}/${teamId}/${
        userData.user.id
      }/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("players")
        .upload(filePath, photoFile, {
          upsert: true,
          contentType: photoFile.type || "image/jpeg",
        });

      if (uploadError) {
        console.error("Upload photo joueur:", uploadError);
        setError(`Erreur upload: ${uploadError.message}`);
        setSaving(false);
        return;
      }

      const { data: publicUrl } = supabase.storage
        .from("players")
        .getPublicUrl(filePath);

      nextPhotoUrl = publicUrl.publicUrl ?? null;
    }

    const payloadFields: PlayerCustomField[] = fields
      .map((field, index) => {
        const label =
          field.mode === "library" && field.key
            ? FIELD_BY_KEY.get(field.key)?.label ?? field.label
            : field.label;
        return {
          id: field.id,
          label: label.trim(),
          type: field.type,
          value: field.value.trim(),
          order: index + 1,
          active: field.active,
        };
      })
      .filter((field) => field.label && field.value);

    const payload = {
      club_id: clubId,
      team_id: teamId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      license_number: licenseNumber.trim(),
      photo_url: nextPhotoUrl,
      custom_fields: payloadFields.length ? payloadFields : [],
    };

    const { error: saveError } = player?.id
      ? await supabase.from("players").update(payload).eq("id", player.id)
      : await supabase.from("players").insert(payload);

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaveFeedback(true);
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      setSaveFeedback(false);
      onSaved();
    }, 1800);
  };

  const handleDelete = async () => {
    if (!player?.id) return;
    const confirmed = window.confirm(
      `Supprimer le joueur ${player.first_name ?? ""} ${player.last_name ?? ""} ?`,
    );
    if (!confirmed) return;

    const { error: deleteError } = await supabase
      .from("players")
      .delete()
      .eq("id", player.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    onDeleted();
  };

  const getDefinitionForField = (field: PlayerFieldDraft) => {
    if (field.key) {
      return FIELD_BY_KEY.get(field.key) ?? null;
    }
    return field.label ? findDefinitionByLabel(field.label) ?? null : null;
  };

  const mainFields = fields
    .filter((field) => Boolean(getMainFieldKey(field)))
    .sort((a, b) => {
      const aKey = getMainFieldKey(a);
      const bKey = getMainFieldKey(b);
      return MAIN_FIELD_KEYS.indexOf(aKey ?? "strong_foot") -
        MAIN_FIELD_KEYS.indexOf(bKey ?? "strong_foot");
    });

  const advancedFields = fields.filter(
    (field) => !getMainFieldKey(field),
  );

  const baseInputClass =
    "h-7 w-full rounded-md border border-white/5 bg-transparent px-2 text-[10px] text-slate-100 outline-none transition focus:border-white/20";
  const mainInputClass =
    "h-7 w-full rounded-md border border-white/5 bg-transparent px-2 text-[10px] text-slate-100 outline-none transition focus:border-white/20";

  const renderSelectInput = (
    options: string[],
    value: string,
    onChange: (event: ChangeEvent<HTMLSelectElement>) => void,
    className: string,
  ) => (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className={`${className} appearance-none pr-8`}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </div>
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0b0f1a] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Joueurs
            </p>
            <h3 className="text-xl font-semibold text-slate-100">
              {isEditing ? "Modifier le joueur" : "Créer un joueur"}
            </h3>
          </div>
          <div className="flex items-center gap-3">
            {saveFeedback ? (
              <span className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-200">
                {isEditing ? "Joueur mis à jour ✅" : "Joueur créé ✅"}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-slate-300 transition hover:bg-white/5 hover:text-white"
              aria-label="Fermer"
            >
              <svg
                aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mt-6 max-h-[70vh] space-y-5 overflow-y-auto pr-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Identite
            </p>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-4">
                {photoUrl ? (
                  <div className="h-16 w-16 overflow-hidden rounded-xl border border-white/10 bg-black/40 sm:h-20 sm:w-20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoUrl}
                      alt="Aperçu joueur"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-lg font-semibold text-slate-400 sm:h-20 sm:w-20">
                    +
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="text-[10px] text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-2.5 file:py-1 file:text-[10px] file:font-semibold file:text-slate-200 hover:file:bg-white/15"
                  />
                  {photoUrl ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoUrl(null);
                        setPhotoFile(null);
                      }}
                      className="text-[10px] text-slate-400 hover:text-slate-200"
                    >
                      Retirer la photo
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="grid flex-1 gap-2">
                  <input
                    type="text"
                    placeholder="Nom"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className="h-7 rounded-md border border-white/10 bg-transparent px-2 text-[10px] text-slate-100 outline-none transition focus:border-white/20"
                  />
                <input
                  type="text"
                  placeholder="Prenom"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className="h-7 rounded-md border border-white/10 bg-transparent px-2 text-[10px] text-slate-100 outline-none transition focus:border-white/20"
                />
                <input
                  type="text"
                  placeholder="Licence"
                  value={licenseNumber}
                  onChange={(event) => setLicenseNumber(event.target.value)}
                  className="h-7 rounded-md border border-white/10 bg-transparent px-2 text-[10px] text-slate-100 outline-none transition focus:border-white/20"
                />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowMainFields((prev) => !prev)}
                  className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400"
                >
                  Infos principales
                  <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={[
                      "transition",
                      showMainFields ? "rotate-180" : "rotate-0",
                    ].join(" ")}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </div>
              {showMainFields ? (
              <div className="mt-2 space-y-2">
                {mainFields.length === 0 ? (
                  <p className="text-[10px] text-slate-500">
                    Aucune information principale.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {mainFields.map((field) => {
                      const definition = getDefinitionForField(field);
                      const label = definition?.label ?? field.label ?? "Info";
                      return (
                        <div
                          key={field.id}
                          className="flex flex-wrap items-center gap-2 py-1 sm:flex-nowrap"
                        >
                            <div className="flex min-w-[110px] items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                              <span className="text-violet-300/80">
                                {getFieldIcon(field)}
                              </span>
                              <span>{label}</span>
                            </div>
                            <div className="flex-1 min-w-[120px]">
                              {definition?.type === "select"
                                ? renderSelectInput(
                                    definition.options ?? [],
                                    field.value,
                                    (event) =>
                                      setFields((prev) =>
                                        prev.map((item) =>
                                          item.id === field.id
                                            ? { ...item, value: event.target.value }
                                            : item,
                                        ),
                                      ),
                                    mainInputClass,
                                  )
                                : (
                                  <input
                                    type={
                                      definition?.type === "number"
                                        ? "number"
                                        : definition?.type === "date"
                                        ? "date"
                                        : definition?.type === "link"
                                        ? "url"
                                        : "text"
                                    }
                                    placeholder="Valeur"
                                    value={field.value}
                                    onChange={(event) =>
                                      setFields((prev) =>
                                        prev.map((item) =>
                                          item.id === field.id
                                            ? { ...item, value: event.target.value }
                                            : item,
                                        ),
                                      )
                                    }
                                    className={mainInputClass}
                                  />
                                )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowCustomFields((prev) => !prev)}
                  className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400"
                >
                  Champs avancés
                  <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={[
                      "transition",
                      showCustomFields ? "rotate-180" : "rotate-0",
                    ].join(" ")}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {showCustomFields ? (
                  <button
                    type="button"
                    onClick={handleAddField}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold text-slate-100 transition hover:bg-violet-600/30"
                  >
                    + Ajouter un champ
                  </button>
                ) : null}
              </div>

              {showCustomFields ? (
                <>
                  <div className="mt-4 space-y-3">
                    {advancedFields.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Aucun champ avancé.
                      </p>
                    ) : (
                      advancedFields.map((field) => {
                        const usedKeys = fields
                          .map((item) => item.key)
                          .filter((key): key is string => Boolean(key));
                        const availableDefs = PLAYER_FIELD_LIBRARY.filter(
                          (definition) =>
                            !usedKeys.includes(definition.key) ||
                            definition.key === field.key,
                        );
                        const definition = getDefinitionForField(field);
                        const selectValue =
                          field.mode === "custom"
                            ? "custom"
                            : field.key
                            ? field.key
                            : "";

                        return (
                          <div
                            key={field.id}
                            className="flex flex-wrap items-center gap-2 py-1 sm:flex-nowrap"
                          >
                            <div className="flex min-w-[120px] flex-1 items-center gap-2">
                              <span className="text-violet-300/80">
                                {getFieldIcon(field)}
                              </span>
                              {field.mode === "custom" ? (
                                <input
                                  type="text"
                                  value={field.label}
                                  onChange={(event) =>
                                    setFields((prev) =>
                                      prev.map((item) =>
                                        item.id === field.id
                                          ? {
                                              ...item,
                                              label: event.target.value,
                                              type: "text",
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                  placeholder="Label"
                                  className={baseInputClass}
                                />
                              ) : (
                                <div className="relative w-full">
                                  <select
                                    value={selectValue}
                                    onChange={(event) => {
                                      const next = event.target.value;
                                      if (next === "custom") {
                                        setFields((prev) =>
                                          prev.map((item) =>
                                            item.id === field.id
                                              ? {
                                                  ...item,
                                                  key: null,
                                                  label: "",
                                                  type: "text",
                                                  mode: "custom",
                                                }
                                              : item,
                                          ),
                                        );
                                        return;
                                      }
                                      if (!next) {
                                        setFields((prev) =>
                                          prev.map((item) =>
                                            item.id === field.id
                                              ? {
                                                  ...item,
                                                  key: null,
                                                  label: "",
                                                  value: "",
                                                  type: "text",
                                                  mode: "unset",
                                                }
                                              : item,
                                          ),
                                        );
                                        return;
                                      }
                                      const nextDef = FIELD_BY_KEY.get(next);
                                      if (!nextDef) return;
                                      setFields((prev) =>
                                        prev.map((item) => {
                                          if (item.id !== field.id) return item;
                                          const nextValue =
                                            nextDef.type === "select" &&
                                            nextDef.options?.length
                                              ? nextDef.options.includes(item.value)
                                                ? item.value
                                                : nextDef.options[0]
                                              : item.value;
                                          return {
                                            ...item,
                                            key: nextDef.key,
                                            label: nextDef.label,
                                            type: nextDef.type,
                                            value: nextValue,
                                            mode: "library",
                                          };
                                        }),
                                      );
                                    }}
                                    className={`${baseInputClass} appearance-none pr-7`}
                                  >
                                    <option value="" disabled>
                                      Choisir un label
                                    </option>
                                    {availableDefs.map((definitionItem) => (
                                      <option
                                        key={definitionItem.key}
                                        value={definitionItem.key}
                                      >
                                        {definitionItem.label}
                                      </option>
                                    ))}
                                    <option value="custom">Autre...</option>
                                  </select>
                                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                    <svg
                                      aria-hidden="true"
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M6 9l6 6 6-6" />
                                    </svg>
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-[110px]">
                              {definition?.type === "select"
                                ? renderSelectInput(
                                    definition.options ?? [],
                                    field.value,
                                    (event) =>
                                      setFields((prev) =>
                                        prev.map((item) =>
                                          item.id === field.id
                                            ? { ...item, value: event.target.value }
                                            : item,
                                        ),
                                      ),
                                    baseInputClass,
                                  )
                                : (
                                  <input
                                    type={
                                      definition?.type === "number"
                                        ? "number"
                                        : definition?.type === "date"
                                        ? "date"
                                        : definition?.type === "link"
                                        ? "url"
                                        : "text"
                                    }
                                    placeholder="Valeur"
                                    value={field.value}
                                    onChange={(event) =>
                                      setFields((prev) =>
                                        prev.map((item) =>
                                          item.id === field.id
                                            ? { ...item, value: event.target.value }
                                            : item,
                                        ),
                                      )
                                    }
                                    className={baseInputClass}
                                  />
                                )}
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setFields((prev) =>
                                    prev.map((item) =>
                                      item.id === field.id
                                        ? { ...item, active: !item.active }
                                        : item,
                                    ),
                                  )
                                }
                                className={[
                                  "h-2.5 w-2.5 rounded-full border transition",
                                  field.active
                                    ? "border-emerald-200/50 bg-emerald-300/80 shadow-[0_0_8px_rgba(16,185,129,0.45)]"
                                    : "border-rose-200/30 bg-rose-400/30 opacity-70",
                                ].join(" ")}
                                aria-label={field.active ? "Afficher" : "Cacher"}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setFields((prev) =>
                                    prev.filter((item) => item.id !== field.id),
                                  )
                                }
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-300 transition hover:text-rose-300"
                                aria-label="Supprimer"
                              >
                                <svg
                                  aria-hidden="true"
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M3 6h18" />
                                  <path d="M8 6v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                  <path d="M10 11v6" />
                                  <path d="M14 11v6" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400">
                    Ajoutez une info spécifique (ex : leadership, vitesse,
                    endurance…).
                  </p>
                </>
              ) : null}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowAutoStats((prev) => !prev)}
                  className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400"
                >
                  Stat automatique
                <svg
                  aria-hidden="true"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={[
                    "transition",
                    showAutoStats ? "rotate-180" : "rotate-0",
                  ].join(" ")}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>

            {showAutoStats ? (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-[10px] text-slate-200">
                      Nombre de matchs
                    </p>
                    <p className="text-[9px] text-slate-500">Auto</p>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-300">
                    {autoMatches}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAutoStatsDetailsOpen((prev) =>
                        autoStatsTab === "goals" ? !prev : true,
                      );
                      setAutoStatsTab("goals");
                    }}
                    className={[
                      "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition",
                      autoStatsTab === "goals"
                        ? "border border-white/10 bg-white/10 text-white"
                        : "border border-white/10 bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200",
                    ].join(" ")}
                  >
                    Buts {autoGoalsTotal}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAutoStatsDetailsOpen((prev) =>
                        autoStatsTab === "assists" ? !prev : true,
                      );
                      setAutoStatsTab("assists");
                    }}
                    className={[
                      "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition",
                      autoStatsTab === "assists"
                        ? "border border-white/10 bg-white/10 text-white"
                        : "border border-white/10 bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200",
                    ].join(" ")}
                  >
                    Passes {autoAssistsTotal}
                  </button>
                </div>
                {autoStatsDetailsOpen ? (
                  <div className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="flex items-center justify-between py-1">
                      <p className="text-[10px] text-slate-200">
                        Championnat
                      </p>
                      <span className="text-[10px] font-semibold text-slate-300">
                        {autoStatsTab === "goals"
                          ? autoGoalsChamp
                          : autoAssistsChamp}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <p className="text-[10px] text-slate-200">Amical</p>
                      <span className="text-[10px] font-semibold text-slate-300">
                        {autoStatsTab === "goals"
                          ? autoGoalsFriendly
                          : autoAssistsFriendly}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <p className="text-[10px] text-slate-200">Plateau</p>
                      <span className="text-[10px] font-semibold text-slate-300">
                        {autoStatsTab === "goals"
                          ? autoGoalsPlateau
                          : autoAssistsPlateau}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <p className="text-[10px] text-slate-200">Total</p>
                      <span className="text-[10px] font-semibold text-slate-300">
                        {autoStatsTab === "goals"
                          ? autoGoalsTotal
                          : autoAssistsTotal}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {error ? <p className="text-xs text-rose-300">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {isEditing ? (
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-400/40 text-rose-200 transition hover:border-rose-400/70 hover:bg-rose-500/10"
                aria-label="Supprimer"
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
                  <path d="M3 6h18" />
                  <path d="M8 6v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 px-4 py-2 text-xs text-slate-300 transition hover:bg-white/5"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-full border border-[#8b5cf6]/60 bg-white/5 px-4 py-2 text-xs font-semibold text-[#c4b5fd] shadow-[0_8px_18px_rgba(139,92,246,0.25)] transition hover:border-[#8b5cf6]/80 hover:bg-white/10 disabled:opacity-60"
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
