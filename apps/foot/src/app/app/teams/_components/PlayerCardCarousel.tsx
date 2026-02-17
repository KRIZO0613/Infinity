import { useEffect, useState } from "react";
import PlayerAvatar, {
  getOriginalPlayerPhotoUrl,
} from "@/app/app/teams/_components/PlayerAvatar";
import type { Player } from "@/app/app/teams/_types/player";

type PlayerCardCarouselProps = {
  players: Player[];
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onEdit: (player: Player) => void;
  teamCategory?: string | null;
};

const normalizeLabel = (label?: string | null) => {
  const safeLabel = label ?? "";
  return safeLabel
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
};

export default function PlayerCardCarousel({
  players,
  activeIndex,
  onPrev,
  onNext,
  onEdit,
  teamCategory = null,
}: PlayerCardCarouselProps) {
  const player = players[activeIndex];
  const [photoFailed, setPhotoFailed] = useState(false);
  const [autoStatsDetails, setAutoStatsDetails] = useState<
    "goals" | "assists" | null
  >(null);

  if (!player) return null;

  useEffect(() => {
    setPhotoFailed(false);
    setAutoStatsDetails(null);
  }, [player.photo_url]);

  const displayName =
    `${player.last_name ?? ""} ${player.first_name ?? ""}`.trim() || "Joueur";

  const rawFields = Array.isArray(player.custom_fields)
    ? player.custom_fields
    : [];
  const activeFields = rawFields.filter(
    (field) => field.active !== false && field.value,
  );
  const getFieldValue = (labels: string[]) => {
    return (
      activeFields.find((field) => {
        const normalized = normalizeLabel(field.label);
        return labels.includes(normalized);
      })?.value ?? null
    );
  };
  const getStatValue = (labels: string[]) => {
    const raw = getFieldValue(labels);
    const parsed = Number.parseInt(String(raw ?? "0"), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const matchesValue = getStatValue(["matchs", "matches", "match"]);
  const goalsValue = getStatValue(["buts", "but", "goals", "goal"]);
  const goalsChampValue = getStatValue([
    "butschampionnat",
    "butchampionnat",
  ]);
  const goalsFriendlyValue = getStatValue(["butsamical", "butamical"]);
  const goalsPlateauValue = getStatValue([
    "butsplateau",
    "butplateau",
    "buts plateau",
  ]);
  const assistsValue = getStatValue([
    "passesd",
    "passesdecisives",
    "passedecisive",
    "assists",
    "assist",
    "passe",
  ]);
  const assistsChampValue = getStatValue([
    "passesdchampionnat",
    "passesdecisiveschampionnat",
    "passedecisivechampionnat",
  ]);
  const assistsFriendlyValue = getStatValue([
    "passesdamical",
    "passesdecisivesamical",
    "passedecisiveamical",
  ]);
  const assistsPlateauValue = getStatValue([
    "passesdplateau",
    "passesdecisivesplateau",
    "passedecisiveplateau",
    "passes plateau",
  ]);
  const position = getFieldValue(["poste", "position"]);
  const strongFoot = getFieldValue(["piedfort", "pied"]);
  const category = getFieldValue(["niveau", "categorie", "category"]);
  const categoryLabel = category ?? teamCategory;
  const birthValue = getFieldValue([
    "anneedenaissance",
    "datedenaissance",
    "naissance",
    "birthdate",
    "birth",
  ]);
  const birthYear = birthValue
    ? birthValue.match(/\d{4}/)?.[0] ?? birthValue
    : null;
  const extraInfoFields = activeFields
    .filter((field) => {
      const normalized = normalizeLabel(field.label);
      if (!field.value) return false;
      if (normalized.startsWith("niveau") || normalized.startsWith("level")) {
        return false;
      }
      return ![
        "poste",
        "position",
        "numerodemaillot",
        "numero",
        "maillot",
        "niveau",
        "level",
        "categorie",
        "category",
        "anneedenaissance",
        "datedenaissance",
        "naissance",
        "birthdate",
        "birth",
      ].includes(normalized);
    })
    .map((field) => ({ label: field.label, value: field.value }))
    .slice(0, 3);
  const normalizedPosition = position ? position.toLowerCase() : "";
  const positionIconSrc = normalizedPosition.includes("attaquant")
    ? "/icons/Ballonsatt.png"
    : normalizedPosition.includes("defenseur")
      ? "/icons/defenseurd.png"
      : normalizedPosition.includes("milieu")
        ? "/icons/millieur.png"
        : normalizedPosition.includes("gardien")
          ? "/icons/Gardien.png"
          : "/icons/Ballonsatt.png";
  const jerseyNumber = getFieldValue([
    "numerodemaillot",
    "numero",
    "maillot",
  ]);
  const skillStats = [
    { key: "speed", label: "Vitesse", value: 9 },
    { key: "intensity", label: "Intensite", value: 8 },
    { key: "technique", label: "Technique", value: 7 },
  ];

  const subtitleParts = [position, strongFoot].filter(Boolean);
  const jerseyIconUrl = "/icons/jersey-outline%3Bpng.png";

  const autoStats = [
    {
      key: "matches",
      label: "Matchs",
      value: matchesValue,
      bg: "bg-[#3b82f6]",
      icon: (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3.5" y="5" width="17" height="15" rx="4" />
          <path d="M7 3.5v3" />
          <path d="M17 3.5v3" />
          <path d="M4 9.5h16" />
        </svg>
      ),
    },
    {
      key: "goals",
      label: "Buts",
      value: goalsValue,
      emoji: "⚽",
      bg: "bg-[#facc15]",
    },
    {
      key: "assists",
      label: "Passes D",
      value: assistsValue,
      emoji: "👟",
      bg: "bg-[#6366f1]",
    },
  ];

  const displayPhotoUrl = player.photo_url
    ? getOriginalPlayerPhotoUrl(player.photo_url)
    : null;

  const getSkillIcon = (key: string) => {
    if (key === "speed") {
      return (
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13 5l-2 4h6l-2 4" />
          <path d="M3 17h10" />
          <path d="M14 17h7" />
        </svg>
      );
    }
    if (key === "intensity") {
      return (
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3c1 2-1 3-1 5 0 2 2 2 2 4 0 2-1 3-3 3" />
          <path d="M15 7c2 2 3 4 3 7a6 6 0 1 1-12 0" />
        </svg>
      );
    }
    return (
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4v16" />
        <path d="M4 12h16" />
      </svg>
    );
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onPrev}
        className="absolute left-0 top-1/2 z-30 inline-flex h-10 w-10 -translate-x-full -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/30 text-slate-200 shadow-[0_10px_24px_rgba(15,23,42,0.45)] backdrop-blur-md transition hover:bg-white/10"
        aria-label="Joueur précédent"
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onNext}
        className="absolute right-0 top-1/2 z-30 inline-flex h-10 w-10 translate-x-full -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/30 text-slate-200 shadow-[0_10px_24px_rgba(15,23,42,0.45)] backdrop-blur-md transition hover:bg-white/10"
        aria-label="Joueur suivant"
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      <div className="relative h-[70dvh] max-h-[70dvh] overflow-hidden rounded-[32px] border border-white/15 bg-black/35 shadow-[0_26px_60px_rgba(0,0,0,0.85)] backdrop-blur-xl sm:h-[75dvh] sm:max-h-[75dvh] md:h-auto md:max-h-none">
        {/* IMAGE DE FOND – pleine couleur */}
        <div className="pointer-events-none absolute inset-0 bg-[url('/backgrounds/IMAGE212.png')] bg-cover bg-center opacity-90" />

        {/* LÉGER DÉGRADÉ POUR LA LECTURE DU TEXTE */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-black/20 to-black/65" />

        {/* Fine ligne lumineuse en haut (on garde, ça ne change pas la couleur globale) */}
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#a78bfa]/70 to-transparent" />

        {/* --- le reste du contenu reste identique --- */}
      <button
        type="button"
        onClick={() => onEdit(player)}
        className="absolute right-4 top-4 z-30 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-100 shadow-[0_10px_24px_rgba(15,23,42,0.45)] backdrop-blur-md transition hover:bg-white/10"
        aria-label="Editer le joueur"
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
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      </button>

        <div className="relative z-10 flex h-full min-h-0 flex-col md:min-h-[460px] md:flex-row">
          <div className="flex w-full items-start gap-3 md:block md:w-[320px]">
            {/* PHOTO JOUEUR */}
            <div className="relative isolate h-[75dvh] w-[76dvh] min-h-[120px] min-w-[120px] max-h-[26dvh] max-w-[26dvh] flex-none overflow-visible rounded-t-[32px] sm:h-[30dvh] sm:w-[30dvh] sm:max-h-[30dvh] sm:max-w-[30dvh] md:h-full md:w-full md:min-h-[460px] md:max-h-none md:rounded-l-[32px] md:rounded-tr-none">
              <div
                className="absolute inset-0 z-10 rounded-[20px] border border-[#e9d5ff]/35 bg-transparent p-[6px] sm:inset-1 md:left-6 md:-right-2 md:top-6 md:bottom-20"
                style={{ borderWidth: "1px" }}
              >
                <div className="relative h-full w-full overflow-hidden rounded-[20px]">
                  {displayPhotoUrl && !photoFailed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={displayPhotoUrl}
                      alt={displayName}
                      className="h-full w-full object-cover object-center transition-opacity duration-300"
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                      style={{ opacity: 0 }}
                      onLoad={(event) => {
                        event.currentTarget.style.opacity = "1";
                      }}
                      onError={() => {
                        setPhotoFailed(true);
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(120%_120%_at_20%_0%,rgba(139,92,246,0.25),transparent_55%),radial-gradient(120%_120%_at_100%_100%,rgba(56,189,248,0.18),transparent_55%)]">
                      <PlayerAvatar
                        firstName={player.first_name}
                        lastName={player.last_name}
                        size="lg"
                      />
                    </div>
                  )}
                  {categoryLabel ? (
                    <div className="absolute left-1/2 top-1 z-30 w-4/5 -translate-x-1/2 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-center text-[7px] font-bold uppercase tracking-[0.26em] text-white shadow-[0_10px_24px_rgba(15,23,42,0.5)] backdrop-blur-md sm:top-2 sm:w-3/4 sm:px-3 sm:py-1 sm:text-[9px] sm:tracking-[0.32em] md:px-4 md:text-[10px] md:tracking-[0.35em]">
                      <span className="relative z-10 drop-shadow-[0_1px_0_#1f1235] drop-shadow-[0_2px_0_#1f1235] drop-shadow-[0_6px_14px_rgba(15,23,42,0.65)]">
                        {categoryLabel}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
              {position ? (
            <div className="absolute left-1/2 -bottom-4 z-40 -translate-x-1/2 sm:bottom-2 md:bottom-8">
              <div className="flex items-center gap-3 text-slate-100">
                <div className="flex h-6 w-6 items-center justify-center sm:h-10 sm:w-10 md:h-12 md:w-12">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={positionIconSrc}
                        alt=""
                        className="h-5 w-5 object-contain sm:h-9 sm:w-9 md:h-11 md:w-11"
                      />
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-white sm:text-xs md:text-sm">
                      {position}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex-1 md:hidden">
              <div className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                FICHE JOUEUR
              </div>
              <div className="relative mt-2 pr-12">
                <h3 className="text-lg font-semibold text-white drop-shadow-[0_2px_0_#1f1235] drop-shadow-[0_6px_16px_rgba(15,23,42,0.65)]">
                  {displayName}
                </h3>
                <div className="mt-1 h-px w-16 bg-gradient-to-r from-[#c4b5fd]/70 via-[#8b5cf6]/50 to-transparent" />
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                  <span>Licence</span>
                  <span className="font-semibold text-white">
                    {player.license_number || "Non renseignée"}
                  </span>
                  {birthYear ? (
                    <span className="text-[10px] font-medium text-slate-300">
                      • {birthYear}
                    </span>
                  ) : null}
                  {extraInfoFields.map((field) => (
                    <span
                      key={field.label}
                      className="text-[10px] font-medium text-slate-300"
                    >
                      •{" "}
                      <span className="text-slate-400">{field.label}:</span>{" "}
                      {field.value}
                    </span>
                  ))}
                </div>
                <div className="absolute right-10 top-8 sm:right-0 sm:top-0">
                  <div className="relative h-48 w-48">
                    <div className="pointer-events-none absolute -bottom-2 left-1/2 h-16 w-36 -translate-x-1/2 rounded-full bg-[#a855f7]/35 blur-lg" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={jerseyIconUrl}
                      alt="Maillot"
                      className="h-full w-full object-contain drop-shadow-[0_10px_18px_rgba(15,23,42,0.55)]"
                      loading="eager"
                      decoding="async"
                    />
                    {jerseyNumber ? (
                      <div
                        className="absolute inset-0 flex items-center justify-center text-[22px] font-black text-[#f5f3ff]"
                        style={{
                          transform:
                            "skewX(-10deg) rotate(-2deg) translate(-2px, -3px)",
                          textShadow:
                            "0 1px 0 #2b184b, 0 2px 0 #2b184b, 0 6px 14px rgba(15,23,42,0.7)",
                        }}
                      >
                        {jerseyNumber}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* INFOS JOUEUR */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 bg-gradient-to-br from-black/10 via-black/0 to-black/20 p-2 sm:p-4 md:-ml-10 md:flex-1 md:w-auto md:pl-0 md:pr-8 md:py-8">
            <div className="hidden flex-none space-y-3 md:block">
              <div className="text-[11px] uppercase tracking-[0.35em] text-slate-400">
                FICHE JOUEUR
              </div>
              <div className="relative pr-24 sm:pr-36 md:pr-52">
                <h3 className="text-xl font-semibold text-white drop-shadow-[0_2px_0_#1f1235] drop-shadow-[0_6px_16px_rgba(15,23,42,0.65)] sm:text-3xl md:text-4xl">
                  {displayName}
                </h3>
                <div className="mt-2 h-px w-24 bg-gradient-to-r from-[#c4b5fd]/70 via-[#8b5cf6]/50 to-transparent" />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-400 sm:text-xs">
                  <span>Licence</span>
                  <span className="font-semibold text-white">
                    {player.license_number || "Non renseignée"}
                  </span>
                  {birthYear ? (
                    <span className="text-[10px] font-medium text-slate-300">
                      • {birthYear}
                    </span>
                  ) : null}
                  {extraInfoFields.map((field) => (
                    <span
                      key={field.label}
                      className="text-[10px] font-medium text-slate-300"
                    >
                      •{" "}
                      <span className="text-slate-400">{field.label}:</span>{" "}
                      {field.value}
                    </span>
                  ))}
                </div>
                <div className="absolute right-0 top-0 -mt-4 sm:-mt-10 md:-mt-19">
                  <div className="relative h-14 w-14 shrink-0 sm:h-28 sm:w-28 md:h-48 md:w-48">
                    <div className="pointer-events-none absolute -bottom-2 left-1/2 h-6 w-12 -translate-x-1/2 rounded-full bg-[#a855f7]/35 blur-lg sm:h-10 sm:w-24 md:h-16 md:w-36" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={jerseyIconUrl}
                      alt="Maillot"
                      className="h-full w-full object-contain drop-shadow-[0_10px_18px_rgba(15,23,42,0.55)]"
                      loading="eager"
                      decoding="async"
                    />
                    {jerseyNumber ? (
                      <div
                        className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-[#f5f3ff] sm:text-[16px] md:text-[22px]"
                        style={{
                          transform:
                            "skewX(-10deg) rotate(-2deg) translate(-3px, -6px)",
                          textShadow:
                            "0 1px 0 #2b184b, 0 2px 0 #2b184b, 0 6px 14px rgba(15,23,42,0.7)",
                        }}
                      >
                        {jerseyNumber}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col space-y-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-slate-300 sm:text-xs">
              {skillStats.map((stat) => (
                <div key={stat.label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-2">
                      <span className="text-[#a78bfa]">
                        {getSkillIcon(stat.key)}
                      </span>
                      <span className="text-slate-300">{stat.label}</span>
                    </div>
                    <span className="font-semibold text-white">
                      {stat.value} / 10
                    </span>
                  </div>
                  <div className="h-[4px] w-full rounded-full bg-slate-900/60">
                    <div
                      className="h-[4px] rounded-full bg-gradient-to-r from-[#8b5cf6] via-[#a855f7] to-[#22d3ee] shadow-[0_0_14px_rgba(139,92,246,0.6)]"
                      style={{ width: `${stat.value * 10}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="relative flex-none rounded-[12px] bg-black/35 px-1.5 py-1 backdrop-blur-sm">
              <div className="grid grid-cols-3 text-[9px] text-slate-400">
                {autoStats.map((stat, index) => {
                  const isClickable =
                    stat.key === "goals" || stat.key === "assists";
                  const nextKey =
                    stat.key === "goals"
                      ? "goals"
                      : stat.key === "assists"
                        ? "assists"
                        : null;
                  const isActive = nextKey
                    ? autoStatsDetails === nextKey
                    : false;
                  return (
                    <button
                      key={stat.key}
                      type="button"
                      disabled={!isClickable}
                      onClick={
                        isClickable && nextKey
                          ? () =>
                              setAutoStatsDetails((prev) =>
                                prev === nextKey ? null : nextKey,
                              )
                          : undefined
                      }
                      className={[
                        "px-1 py-0.5 text-center transition",
                        index < autoStats.length - 1
                          ? "border-r border-white/5"
                          : "",
                        isClickable
                          ? "hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/10"
                          : "cursor-default",
                        isActive ? "bg-white/5" : "",
                      ].join(" ")}
                    >
                      <div
                        className={[
                          "mx-auto mb-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px]",
                          "shadow-[0_4px_10px_rgba(15,23,42,0.3)]",
                          stat.bg,
                        ].join(" ")}
                        aria-hidden="true"
                      >
                        {stat.icon ?? stat.emoji}
                      </div>
                      <div className="text-[10px] font-semibold text-white sm:text-sm">
                        {stat.value}
                      </div>
                      <div className="text-[7px] uppercase tracking-[0.2em] text-slate-400 sm:text-[8px]">
                        {stat.label}
                      </div>
                    </button>
                  );
                })}
              </div>
              {autoStatsDetails ? (
                <div className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-2 w-[170px] -translate-x-1/2 rounded-2xl border border-white/10 bg-black/60 px-3 py-2 text-[9px] text-slate-200 shadow-[0_12px_30px_rgba(15,23,42,0.55)] backdrop-blur-lg">
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-slate-400">Championnat</span>
                    <span className="font-semibold text-white">
                      {autoStatsDetails === "goals"
                        ? goalsChampValue
                        : assistsChampValue}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-slate-400">Amical</span>
                    <span className="font-semibold text-white">
                      {autoStatsDetails === "goals"
                        ? goalsFriendlyValue
                        : assistsFriendlyValue}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-slate-400">Plateau</span>
                    <span className="font-semibold text-white">
                      {autoStatsDetails === "goals"
                        ? goalsPlateauValue
                        : assistsPlateauValue}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-slate-400">Total</span>
                    <span className="font-semibold text-white">
                      {autoStatsDetails === "goals"
                        ? goalsValue
                        : assistsValue}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
