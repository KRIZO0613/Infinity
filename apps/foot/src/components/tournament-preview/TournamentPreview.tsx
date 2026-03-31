"use client";

import type {
  TournamentPreviewData,
  TournamentPreviewGroup,
  TournamentPreviewPlacementSection,
  TournamentPreviewRound,
} from "./types";

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
}: {
  round: TournamentPreviewRound;
  isFirst: boolean;
}) {
  return (
    <div className="flex min-w-[240px] flex-col justify-around gap-6">
      <div className="mb-1 flex items-center gap-2">
        {!isFirst ? <span className="h-px w-8 bg-violet-400/25" /> : null}
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          {round.label}
        </p>
      </div>

      <div className="flex flex-1 flex-col justify-around gap-6">
        {round.matches.map((match) => (
          <div key={match.id} className="relative">
            {!isFirst ? (
              <>
                <span className="absolute -left-8 top-1/2 h-px w-8 -translate-y-1/2 bg-violet-400/25" />
                <span className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-violet-300/30 bg-violet-500/18 shadow-[0_0_12px_rgba(124,58,237,0.28)]" />
              </>
            ) : null}

            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 shadow-[0_16px_36px_rgba(0,0,0,0.18)] backdrop-blur-xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {match.label}
              </p>
              <div className="mt-3 space-y-2">
                <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2.5 text-sm font-semibold leading-5 text-white">
                  {match.homeTeam}
                </div>
                <div className="flex justify-center">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    VS
                  </span>
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2.5 text-sm font-semibold leading-5 text-white">
                  {match.awayTeam}
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
}: {
  title: string;
  description: string;
  rounds: TournamentPreviewRound[];
  sectionId?: string;
  errorMessage?: string;
  roundKeyPrefix?: string;
}) {
  return (
    <section
      id={sectionId}
      className="min-h-0 rounded-[30px] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.24)] backdrop-blur-2xl"
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
                    {match.label}
                  </p>
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <p className="text-right text-sm font-semibold leading-5 text-white">
                      {match.homeTeam}
                    </p>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      VS
                    </span>
                    <p className="text-sm font-semibold leading-5 text-white">
                      {match.awayTeam}
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
}: {
  data: TournamentPreviewData;
  focusedGroupId?: string | null;
  onGroupSelect?: (groupId: string) => void;
  showGroups?: boolean;
  showHeader?: boolean;
}) {
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
      />

      {data.phaseType === "double" ? (
        <BracketSection
          title="Consolante"
          description="Brackets secondaires des equipes non qualifiees."
          rounds={data.secondaryBracket ?? []}
          sectionId="manual-builder-secondary-bracket"
          errorMessage={data.secondaryBracketError}
          roundKeyPrefix="secondary"
        />
      ) : null}

      {data.placementMatches && data.classementSections && data.classementSections.length > 0 ? (
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
    </div>
  );
}
