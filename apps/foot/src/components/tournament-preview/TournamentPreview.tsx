"use client";

import { useMemo } from "react";

import type {
  TournamentPreviewData,
  TournamentPreviewGroup,
  TournamentPreviewPlacementSection,
  TournamentPreviewRound,
} from "./types";

type PreviewSectionTone = "main" | "secondary" | "placement";

const getMatchCode = (matchId: string) => {
  const directCode = matchId.match(/(16E\d+|8E\d+|QF\d+|SF\d+|F\d+)$/i);
  if (directCode) return directCode[1].toUpperCase();

  const standardMatch = matchId.match(/-match-(\d+)$/i);
  if (standardMatch) return `M${standardMatch[1]}`;

  const playInMatch = matchId.match(/-play-in-(\d+)$/i);
  if (playInMatch) return `B${playInMatch[1]}`;

  const finalMatch = matchId.match(/-final$/i);
  if (finalMatch) return "F1";

  return null;
};

const getRoundCodeLabel = (code: string, tone: PreviewSectionTone) => {
  const normalizedCode = code.toUpperCase();

  if (normalizedCode.startsWith("QF")) {
    return tone === "secondary" ? "Quart consolante" : "Quart de finale";
  }
  if (normalizedCode.startsWith("SF")) {
    return tone === "secondary" ? "Demi-finale consolante" : "Demi-finale";
  }
  if (normalizedCode.startsWith("F")) {
    return tone === "secondary" ? "Finale consolante" : "Finale";
  }
  if (normalizedCode.startsWith("8E")) {
    return tone === "secondary" ? "8eme consolante" : "8eme de finale";
  }
  if (normalizedCode.startsWith("16E")) {
    return tone === "secondary" ? "16eme consolante" : "16eme de finale";
  }
  if (normalizedCode.startsWith("B")) {
    return "Barrage";
  }

  return null;
};

const formatMatchLabel = (label: string, matchId: string, tone: PreviewSectionTone) => {
  const code = getMatchCode(matchId);
  if (!code) return label;

  const explicitLabel = getRoundCodeLabel(code, tone);
  if (!explicitLabel) return `${label} (${code})`;

  return `${explicitLabel} (${code})`;
};

const normalizeReference = (value: string) => value.replace(/\s+/g, " ").trim();

const formatReferenceTarget = (value: string) => {
  const normalized = normalizeReference(value)
    .replace(/^main-/i, "")
    .replace(/^secondary-/i, "CONS. ");

  const consolantePrefix = normalized.match(/^CONS\.\s*/i) ? "consolante" : "main";
  const code = normalized.replace(/^CONS\.\s*/i, "").toUpperCase();

  if (code.startsWith("QF")) {
    return `${consolantePrefix === "consolante" ? "Quart consolante" : "Quart"} (${code})`;
  }
  if (code.startsWith("SF")) {
    return `${consolantePrefix === "consolante" ? "Demi-finale consolante" : "Demi-finale"} (${code})`;
  }
  if (code.startsWith("F")) {
    return `${consolantePrefix === "consolante" ? "Finale consolante" : "Finale"} (${code})`;
  }
  if (code.startsWith("8E")) {
    return `${consolantePrefix === "consolante" ? "8eme consolante" : "8eme de finale"} (${code})`;
  }
  if (code.startsWith("16E")) {
    return `${consolantePrefix === "consolante" ? "16eme consolante" : "16eme de finale"} (${code})`;
  }
  if (code.startsWith("CL")) {
    return `Match de classement (${code})`;
  }

  return normalized;
};

const formatParticipantLabel = (value: string) => {
  const normalized = normalizeReference(value);
  const referenceMatch = normalized.match(/^(Vainqueur|Perdant)\s+(.+)$/i);
  if (!referenceMatch) return normalized;

  const [, outcome, target] = referenceMatch;
  return `${outcome} ${formatReferenceTarget(target)}`;
};

const extractMatchReferenceCode = (value: string) => {
  const normalized = normalizeReference(value)
    .replace(/^main-/i, "")
    .replace(/^secondary-/i, "")
    .replace(/^CONS\.\s*/i, "");

  const directCode = normalized.match(/(16E\d+|8E\d+|QF\d+|SF\d+|F\d+)$/i);
  return directCode ? directCode[1].toUpperCase() : null;
};

const getInitialSeedCode = (value: string) => {
  const normalized = normalizeReference(value).replace(/^⭐\s*/i, "");
  return /^\d+[A-Z]$/i.test(normalized) ? normalized.toUpperCase() : null;
};

const buildHighlightedMatchIds = (
  rounds: TournamentPreviewRound[],
  highlightedSeed: string | null,
) => {
  if (!highlightedSeed) return new Set<string>();

  const highlightedMatchIds = new Set<string>();
  const highlightedRefs = new Set<string>([highlightedSeed.toUpperCase()]);

  rounds.forEach((round) => {
    round.matches.forEach((match) => {
      const participants = [match.homeTeam, match.awayTeam];
      const isActive = participants.some((participant) => {
        const seedCode = getInitialSeedCode(participant);
        if (seedCode && highlightedRefs.has(seedCode)) return true;

        const referenceMatch = normalizeReference(participant).match(/^(Vainqueur|Perdant)\s+(.+)$/i);
        if (!referenceMatch) return false;

        const targetCode = extractMatchReferenceCode(referenceMatch[2] ?? "");
        return Boolean(targetCode && highlightedRefs.has(targetCode));
      });

      if (!isActive) return;

      highlightedMatchIds.add(match.id);

      const code = getMatchCode(match.id);
      if (code) {
        highlightedRefs.add(code);
      }
    });
  });

  return highlightedMatchIds;
};

function GroupCard({
  group,
  focused,
  onClick,
}: {
  group: TournamentPreviewGroup;
  focused?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-[24px] border p-4 text-left shadow-[0_18px_40px_rgba(0,0,0,0.22)] backdrop-blur-xl transition",
        focused
          ? "border-violet-300/30 bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.14),transparent_55%),rgba(255,255,255,0.04)] shadow-[0_20px_44px_rgba(124,58,237,0.14)]"
          : "border-white/10 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.04]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Poule</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{group.label}</h3>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-[18px] border border-white/8 bg-[#0b0d14]/90">
        <table className="w-full table-fixed">
          <thead className="border-b border-white/6">
            <tr className="text-left text-[10px] uppercase tracking-[0.16em] text-slate-500">
              <th className="px-3 py-2.5 font-medium">Equipe</th>
              <th className="w-12 px-2 py-2.5 text-center font-medium">MJ</th>
              <th className="w-12 px-2 py-2.5 text-center font-medium">Diff</th>
              <th className="w-12 px-2 py-2.5 text-center font-medium">Pts</th>
            </tr>
          </thead>
          <tbody>
            {group.standings.map((row) => (
              <tr
                key={`${group.id}-${row.team}`}
                className="border-b border-white/5 transition hover:bg-white/[0.03] last:border-b-0"
              >
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={[
                        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
                        row.rank === 1
                          ? "bg-emerald-500/18 text-emerald-100 shadow-[0_0_10px_rgba(34,197,94,0.18)]"
                          : "bg-white/5 text-slate-300",
                      ].join(" ")}
                    >
                      {row.rank}
                    </span>
                    <span className="text-sm font-medium leading-5 text-white">{row.team}</span>
                  </div>
                </td>
                <td className="px-2 py-3 text-center text-sm text-slate-400">{row.played}</td>
                <td className="px-2 py-3 text-center text-sm text-slate-400">{row.diff}</td>
                <td className="px-2 py-3 text-center text-sm font-semibold text-white">
                  {row.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </button>
  );
}

function BracketRoundColumn({
  round,
  isFirst,
  tone,
  highlightedMatchIds,
  hasHighlightedPath,
}: {
  round: TournamentPreviewRound;
  isFirst: boolean;
  tone: PreviewSectionTone;
  highlightedMatchIds: Set<string>;
  hasHighlightedPath: boolean;
}) {
  return (
    <div className="flex min-w-[240px] flex-col justify-around gap-6">
      <div className="mb-1 flex items-center gap-2">
        {!isFirst ? (
          <span
            className={[
              "h-px w-8",
              tone === "main"
                ? "bg-violet-400/25"
                : tone === "secondary"
                  ? "bg-sky-400/20"
                  : "bg-white/10",
            ].join(" ")}
          />
        ) : null}
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          {round.label}
        </p>
      </div>

      <div className="flex flex-1 flex-col justify-around gap-6">
        {round.matches.map((match) => (
          <div
            key={match.id}
            className={[
              "relative transition duration-300",
              hasHighlightedPath && !highlightedMatchIds.has(match.id) ? "opacity-45" : "opacity-100",
            ].join(" ")}
          >
            {!isFirst ? (
              <>
                <span
                  className={[
                    "absolute -left-8 top-1/2 h-px w-8 -translate-y-1/2 transition duration-300",
                    highlightedMatchIds.has(match.id)
                      ? tone === "main"
                        ? "bg-violet-300/70 shadow-[0_0_10px_rgba(167,139,250,0.5)]"
                        : tone === "secondary"
                          ? "bg-sky-300/65 shadow-[0_0_10px_rgba(125,211,252,0.4)]"
                          : "bg-white/40 shadow-[0_0_8px_rgba(255,255,255,0.2)]"
                      : tone === "main"
                        ? "bg-violet-400/25"
                        : tone === "secondary"
                          ? "bg-sky-400/20"
                          : "bg-white/10",
                  ].join(" ")}
                />
                <span
                  className={[
                    "absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border transition duration-300",
                    highlightedMatchIds.has(match.id)
                      ? tone === "main"
                        ? "border-violet-200/60 bg-violet-400/55 shadow-[0_0_16px_rgba(167,139,250,0.55)]"
                        : tone === "secondary"
                          ? "border-sky-200/60 bg-sky-400/45 shadow-[0_0_16px_rgba(125,211,252,0.45)]"
                          : "border-white/40 bg-white/25 shadow-[0_0_10px_rgba(255,255,255,0.18)]"
                      : tone === "main"
                        ? "border-violet-300/30 bg-violet-500/18 shadow-[0_0_12px_rgba(124,58,237,0.28)]"
                        : tone === "secondary"
                          ? "border-sky-300/25 bg-sky-500/14 shadow-[0_0_12px_rgba(56,189,248,0.18)]"
                          : "border-white/12 bg-white/10 shadow-none",
                  ].join(" ")}
                />
              </>
            ) : null}

            <div
              className={[
                "rounded-[22px] border px-4 py-3 shadow-[0_16px_36px_rgba(0,0,0,0.18)] backdrop-blur-xl transition duration-300",
                highlightedMatchIds.has(match.id)
                  ? tone === "main"
                    ? "scale-[1.02] border-violet-300/35 bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.16),transparent_58%),rgba(255,255,255,0.05)] shadow-[0_0_24px_rgba(139,92,246,0.22)]"
                    : tone === "secondary"
                      ? "scale-[1.02] border-sky-300/28 bg-[rgba(56,189,248,0.08)] shadow-[0_0_22px_rgba(56,189,248,0.16)]"
                      : "scale-[1.01] border-white/16 bg-white/[0.05] shadow-[0_0_18px_rgba(255,255,255,0.08)]"
                  : tone === "main"
                    ? "border-white/10 bg-white/[0.03]"
                    : tone === "secondary"
                      ? "border-sky-300/12 bg-[rgba(56,189,248,0.04)]"
                      : "border-white/8 bg-black/20",
              ].join(" ")}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {formatMatchLabel(match.label, match.id, tone)}
              </p>
              <div className="mt-3 space-y-2">
                <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2.5 text-sm font-semibold leading-5 text-white">
                  {formatParticipantLabel(match.homeTeam)}
                </div>
                <div className="flex justify-center">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    VS
                  </span>
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2.5 text-sm font-semibold leading-5 text-white">
                  {formatParticipantLabel(match.awayTeam)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketSection({
  title,
  description,
  rounds,
  sectionId,
  errorMessage,
  roundKeyPrefix,
  tone = "main",
  highlightedSeed,
}: {
  title: string;
  description: string;
  rounds: TournamentPreviewRound[];
  sectionId?: string;
  errorMessage?: string;
  roundKeyPrefix?: string;
  tone?: PreviewSectionTone;
  highlightedSeed?: string | null;
}) {
  const highlightedMatchIds = useMemo(
    () => buildHighlightedMatchIds(rounds, highlightedSeed ?? null),
    [highlightedSeed, rounds],
  );
  const hasHighlightedPath = highlightedMatchIds.size > 0;

  return (
    <section
      id={sectionId}
      className={[
        "min-h-0 rounded-[30px] border p-5 shadow-[0_24px_60px_rgba(0,0,0,0.24)] backdrop-blur-2xl transition duration-300",
        tone === "main"
          ? "border-white/10 bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.08),transparent_58%),rgba(255,255,255,0.03)]"
          : tone === "secondary"
            ? "border-sky-300/12 bg-[rgba(56,189,248,0.03)]"
            : "border-white/8 bg-black/15 opacity-85",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{title}</p>
          <p className="mt-1 text-sm text-slate-300">{description}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
          {rounds.length} tours
        </span>
      </div>

      {errorMessage ? (
        <div className="mt-5 rounded-[22px] border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm font-medium text-amber-100">
          {errorMessage}
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto pb-2">
          <div className="inline-flex min-w-full items-stretch gap-10">
            {rounds.map((round, index) => (
              <BracketRoundColumn
                key={`${roundKeyPrefix ?? "round"}-${index}-${round.id}`}
                round={round}
                isFirst={index === 0}
                tone={tone}
                highlightedMatchIds={highlightedMatchIds}
                hasHighlightedPath={hasHighlightedPath}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function PlacementSectionCard({ section }: { section: TournamentPreviewPlacementSection }) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {section.title}
          </p>
          <p className="mt-1 text-sm text-slate-300">{section.description}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
          {section.rounds.reduce((total, round) => total + round.matches.length, 0)} matchs
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {section.rounds.map((round, index) => (
          <div key={`${section.id}-${index}-${round.id}`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {round.label}
            </p>
            <div className="mt-3 space-y-3">
              {round.matches.map((match) => (
                <div
                  key={match.id}
                  className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {formatMatchLabel(match.label, match.id, "placement")}
                  </p>
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <p className="text-right text-sm font-semibold leading-5 text-white">
                      {formatParticipantLabel(match.homeTeam)}
                    </p>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      VS
                    </span>
                    <p className="text-sm font-semibold leading-5 text-white">
                      {formatParticipantLabel(match.awayTeam)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TournamentPreview({
  data,
  focusedGroupId,
  onGroupSelect,
  showGroups = true,
  showHeader = true,
  showPlacementMatches = true,
  highlightedSeed,
}: {
  data: TournamentPreviewData;
  focusedGroupId?: string | null;
  onGroupSelect?: (groupId: string) => void;
  showGroups?: boolean;
  showHeader?: boolean;
  showPlacementMatches?: boolean;
  highlightedSeed?: string | null;
}) {
  const effectiveHighlightedSeed = highlightedSeed ?? null;
  const orderedGroups =
    focusedGroupId && data.groups.some((group) => group.id === focusedGroupId)
      ? [
          ...data.groups.filter((group) => group.id === focusedGroupId),
          ...data.groups.filter((group) => group.id !== focusedGroupId),
        ]
      : data.groups;

  return (
    <div className="flex min-h-0 flex-col gap-5">
      {showHeader ? (
        <section className="rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.14),transparent_55%),rgba(255,255,255,0.03)] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Preview</p>
              <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-white">
                {data.name}
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                {[
                  data.date || "Date libre",
                  `${data.teamsCount} equipes`,
                  `${data.groupsCount} groupes`,
                  data.qualificationLabel,
                  data.bracketLabel,
                ].join(" • ")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-violet-300/20 bg-violet-500/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-100">
                {data.bracketLabel}
              </span>
              <span
                className={[
                  "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                  data.placementMatches
                    ? "border border-emerald-300/25 bg-emerald-500/12 text-emerald-100"
                    : "border border-white/10 bg-white/5 text-slate-400",
                ].join(" ")}
              >
                {data.placementMatches ? "Classement on" : "Classement off"}
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {showGroups ? (
        <section className="rounded-[30px] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Poules</p>
              <p className="mt-1 text-sm text-slate-300">
                Lecture instantanee des groupes et du classement.
              </p>
            </div>
            <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
              ⭐ = equipe qualifiee
            </span>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {orderedGroups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                focused={focusedGroupId === group.id}
                onClick={onGroupSelect ? () => onGroupSelect(group.id) : undefined}
              />
            ))}
          </div>
        </section>
      ) : null}

      <BracketSection
        title="Phase finale principale"
        description="Arbre principal lisible avec connexions visuelles."
        rounds={data.bracket}
        errorMessage={data.bracketError}
        roundKeyPrefix="main"
        tone="main"
        highlightedSeed={effectiveHighlightedSeed}
      />

      {data.phaseType === "double" ? (
        <BracketSection
          title="Consolante"
          description="Brackets secondaires des equipes non qualifiees."
          rounds={data.secondaryBracket ?? []}
          sectionId="manual-builder-secondary-bracket"
          errorMessage={data.secondaryBracketError}
          roundKeyPrefix="secondary"
          tone="secondary"
          highlightedSeed={effectiveHighlightedSeed}
        />
      ) : null}

      {showPlacementMatches &&
      data.placementMatches &&
      data.classementSections &&
      data.classementSections.length > 0 ? (
        <section className="rounded-[30px] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Matchs de classement
              </p>
              <p className="mt-1 text-sm text-slate-300">
                Tableau secondaire affiche sous la phase finale principale.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
              {data.classementSections.reduce(
                (total, section) =>
                  total + section.rounds.reduce((sectionTotal, round) => sectionTotal + round.matches.length, 0),
                0,
              )}{" "}
              matchs
            </span>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {data.classementSections.map((section) => (
              <PlacementSectionCard key={section.id} section={section} />
            ))}
          </div>
        </section>
      ) : null}

      {!showGroups ? (
        <div className="flex justify-end">
          <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
            ⭐ = equipe qualifiee
          </span>
        </div>
      ) : null}
    </div>
  );
}
