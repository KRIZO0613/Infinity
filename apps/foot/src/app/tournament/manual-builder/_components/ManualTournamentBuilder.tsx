"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { TournamentPreview } from "@/components/tournament-preview/TournamentPreview";
import type {
  TournamentPreviewData,
  TournamentPreviewGroup,
  TournamentPreviewPlacementSection,
  TournamentPreviewRound,
  TournamentPreviewStandingRow,
} from "@/components/tournament-preview/types";

type ManualTournamentState = {
  name: string;
  date: string;
  teamsCount: number;
  groupsCount: number;
  qualification: "top1" | "top2" | "best3";
  tournamentPhaseType: "simple" | "double";
  bracketType: "round_of_32" | "round_of_16" | "quarter" | "semi";
  consolationBracketType: "round_of_32" | "round_of_16" | "quarter" | "semi";
  placementMatches: boolean;
  fieldCount: number;
  categories: string[];
  levels: string[];
  shuffleSeed: number;
};

type ManualControlTab = "teams" | "groups" | "qualification" | "bracket" | "general";

const TEAM_COUNT_OPTIONS = [6, 8, 10, 12, 16, 24, 25, 32, 64] as const;
const GROUP_COUNT_OPTIONS = [2, 3, 4, 5] as const;
const QUALIFICATION_OPTIONS = [
  { key: "top1" as const, label: "1er" },
  { key: "top2" as const, label: "2eme" },
  { key: "best3" as const, label: "Meilleur 3eme" },
] as const;
const BRACKET_OPTIONS = [
  { key: "round_of_32" as const, label: "16eme" },
  { key: "round_of_16" as const, label: "8eme" },
  { key: "quarter" as const, label: "Quart" },
  { key: "semi" as const, label: "Demi" },
] as const;
const CATEGORY_OPTIONS = ["U7", "U8", "U9", "U10", "U11", "U12", "U13"] as const;
const LEVEL_OPTIONS = ["Niv 1", "Niv 2", "Niv 3", "Tous"] as const;
const TEAM_NAMES = [
  "A.S. Cannes",
  "FC Antibes",
  "OGC Nice Jeunes",
  "Etoile Frejus",
  "Racing Toulon",
  "SC Draguignan",
  "ES Menton",
  "Valbonne United",
  "Mougins Academy",
  "RC Grasse",
  "US Cagnes",
  "AC Vence",
  "Hyeres Elite",
  "FC Provence",
  "Marseille Campus",
  "Aubagne Vision",
  "Sporting Arles",
  "Union Nimoise",
  "Rodez Formation",
  "Montpellier Next",
  "Sete Horizon",
  "Beziers Sud",
  "Narbonne Mediterranee",
  "Perpignan Catalan",
  "Bastia Mediterra",
  "Ajaccio Tempo",
  "Monaco Performance",
  "Saint-Raphael Foot",
] as const;

const DEFAULT_STATE: ManualTournamentState = {
  name: "Builder tournoi",
  date: "",
  teamsCount: 16,
  groupsCount: 4,
  qualification: "top2",
  tournamentPhaseType: "simple",
  bracketType: "quarter",
  consolationBracketType: "semi",
  placementMatches: true,
  fieldCount: 2,
  categories: ["U11"],
  levels: ["Tous"],
  shuffleSeed: 0,
};

const getQualificationRank = (qualification: ManualTournamentState["qualification"]) =>
  qualification === "top1" ? 1 : qualification === "top2" ? 2 : 3;

const getQualificationLabel = (qualification: ManualTournamentState["qualification"]) =>
  qualification === "top1" ? "1er" : qualification === "top2" ? "Top 2" : "Meilleur 3eme";

const getAvailableGroupCounts = (teamsCount: number) =>
  GROUP_COUNT_OPTIONS.filter((option) => teamsCount / option >= 2);

const getAvailableQualifications = (teamsCount: number, groupsCount: number) =>
  QUALIFICATION_OPTIONS.filter(
    (option) => getQualificationRank(option.key) <= Math.max(1, Math.floor(teamsCount / groupsCount)),
  );

const buildTeams = (teamsCount: number, shuffleSeed: number) =>
  Array.from({ length: teamsCount }, (_, index) => {
    const sourceIndex = shuffleSeed + index;
    const baseName = TEAM_NAMES[sourceIndex % TEAM_NAMES.length] ?? `Equipe ${index + 1}`;
    const cycle = Math.floor(sourceIndex / TEAM_NAMES.length);

    return cycle > 0 ? `${baseName} ${cycle + 1}` : baseName;
  });

const buildGroups = (teams: string[], groupsCount: number) =>
  Array.from({ length: groupsCount }, (_, index) => ({
    id: `group-${index + 1}`,
    label: `Poule ${String.fromCharCode(65 + index)}`,
    teams: teams.filter((_, teamIndex) => teamIndex % groupsCount === index),
  }));

const buildStandings = (teams: string[]): TournamentPreviewStandingRow[] =>
  teams.map((team, index) => ({
    team,
    rank: index + 1,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    diff: 0,
    points: 0,
  }));

const getDesiredEntrantCount = (bracketType: ManualTournamentState["bracketType"]) =>
  bracketType === "round_of_32"
    ? 32
    : bracketType === "round_of_16"
      ? 16
      : bracketType === "quarter"
        ? 8
        : 4;

const getHighestPowerOfTwoAtOrBelow = (value: number) => {
  if (value < 2) return 0;

  let power = 1;
  while (power * 2 <= value) {
    power *= 2;
  }

  return power;
};

const getNextPowerOfTwoAtOrAbove = (value: number) => {
  if (value <= 2) return 2;

  let power = 1;
  while (power < value) {
    power *= 2;
  }

  return power;
};

const getCoherentDrawSize = (teamCount: number, desiredEntrants: number) => {
  if (teamCount < 2) return 0;
  if (teamCount >= desiredEntrants) return desiredEntrants;

  return Math.min(desiredEntrants, getNextPowerOfTwoAtOrAbove(teamCount));
};

const getRoundMeta = (entrantCount: number) => {
  if (entrantCount === 32) {
    return { id: "round-of-32", label: "16emes", matchLabel: "16eme", prefix: "16E" };
  }
  if (entrantCount === 16) {
    return { id: "round-of-16", label: "8emes", matchLabel: "8eme", prefix: "8E" };
  }
  if (entrantCount === 8) {
    return { id: "quarter", label: "Quarts", matchLabel: "Quart", prefix: "QF" };
  }
  if (entrantCount === 4) {
    return { id: "semi", label: "Demi-finales", matchLabel: "Demi", prefix: "SF" };
  }
  return { id: "final", label: "Finale", matchLabel: "Finale", prefix: "F" };
};

const buildAllSeedLabelsFromGroups = (groups: TournamentPreviewGroup[]) => {
  const maxGroupSize = Math.max(0, ...groups.map((group) => group.standings.length));
  const labels: string[] = [];

  for (let rank = 1; rank <= maxGroupSize; rank += 1) {
    groups.forEach((group) => {
      if (group.standings.length >= rank) {
        const letter = group.label.replace(/^Poule\s+/i, "").trim();
        labels.push(`${rank}${letter}`);
      }
    });
  }

  return labels;
};

const buildDirectQualifiedLabels = (
  groups: TournamentPreviewGroup[],
  qualification: ManualTournamentState["qualification"],
) => {
  const rankLimit = getQualificationRank(qualification);
  const labels: string[] = [];

  for (let rank = 1; rank <= rankLimit; rank += 1) {
    groups.forEach((group) => {
      if (group.standings.length >= rank) {
        const letter = group.label.replace(/^Poule\s+/i, "").trim();
        labels.push(`${rank}${letter}`);
      }
    });
  }

  return labels;
};

const buildQualifiedLabelsFromGroups = (
  groups: TournamentPreviewGroup[],
  qualification: ManualTournamentState["qualification"],
  bracketType: ManualTournamentState["bracketType"],
) => {
  const desiredEntrants = getDesiredEntrantCount(bracketType);
  const allSeedLabels = buildAllSeedLabelsFromGroups(groups);
  const drawSize = getCoherentDrawSize(allSeedLabels.length, desiredEntrants);
  const totalTeams = buildAllSeedLabelsFromGroups(groups).length;
  const directQualifiedLabels = buildDirectQualifiedLabels(groups, qualification);
  const remainingSeedLabels = allSeedLabels.filter((seed) => !directQualifiedLabels.includes(seed));

  if (drawSize === 0 || directQualifiedLabels.length < 2) {
    return {
      desiredEntrants,
      directQualifiedCount: directQualifiedLabels.length,
      resolvedQualification: qualification,
      selectedSeedLabels: [] as string[],
      displayLabels: [] as string[],
      isValid: false,
      errorMessage: "Bracket impossible sous ce format",
    };
  }

  if (directQualifiedLabels.length > drawSize) {
    return {
      desiredEntrants,
      directQualifiedCount: directQualifiedLabels.length,
      resolvedQualification: qualification,
      selectedSeedLabels: [] as string[],
      displayLabels: [] as string[],
      isValid: false,
      errorMessage: "Bracket impossible sous ce format",
    };
  }

  const competitiveSlots = Math.min(drawSize, totalTeams);
  const additionalSeedLabels = remainingSeedLabels.slice(
    0,
    Math.max(0, competitiveSlots - directQualifiedLabels.length),
  );
  const selectedSeedLabels = [...directQualifiedLabels, ...additionalSeedLabels];
  const displayLabels = [
    ...directQualifiedLabels,
    ...additionalSeedLabels.map((seed) => `⭐ ${seed}`),
    ...Array.from({ length: Math.max(0, drawSize - selectedSeedLabels.length) }, (_, index) => {
      return `BYE ${index + 1}`;
    }),
  ];

  return {
    desiredEntrants,
    directQualifiedCount: directQualifiedLabels.length,
    resolvedQualification: qualification,
    selectedSeedLabels,
    displayLabels,
    isValid: true,
    errorMessage: undefined,
  };
};

const getPlacementLabel = (startRank: number, count: number) =>
  count === 2 ? `${startRank}e place` : `${startRank}e-${startRank + count - 1}e`;

const getPlacementSortValue = (label: string) => {
  const match = label.match(/(\d+)e/);
  return match ? Number(match[1]) : 0;
};

const getPlacementBandDescription = (startRank: number, count: number) =>
  count === 2
    ? `Match direct pour la ${startRank}e place.`
    : `Generation auto des matchs de ${startRank}e a ${startRank + count - 1}e place.`;

const buildPlacementBand = (
  startRank: number,
  participants: string[],
  prefix: string,
): TournamentPreviewRound[] => {
  if (participants.length < 2) {
    return [];
  }

  const highestPower = getHighestPowerOfTwoAtOrBelow(participants.length);

  if (participants.length > highestPower) {
    const barrageMatchCount = participants.length - highestPower;
    const byeCount = participants.length - barrageMatchCount * 2;
    const barrageParticipants = participants.slice(byeCount);
    const barrageMatches = Array.from({ length: barrageMatchCount }, (_, index) => ({
      id: `${prefix}-play-in-${index + 1}`,
      label: `Barrage ${index + 1}`,
      homeTeam: barrageParticipants[index] ?? `Seed ${index + 1}`,
      awayTeam:
        barrageParticipants[barrageParticipants.length - 1 - index] ??
        `Seed ${barrageParticipants.length - index}`,
    }));

    const upperBandParticipants = [
      ...participants.slice(0, byeCount),
      ...barrageMatches.map((_, index) => `Vainqueur ${prefix}B${index + 1}`),
    ];
    const lowerBandParticipants = barrageMatches.map(
      (_, index) => `Perdant ${prefix}B${index + 1}`,
    );

    return [
      {
        id: `${prefix}-play-in-round`,
        label: `Barrages ${startRank}e-${startRank + participants.length - 1}e`,
        matches: barrageMatches,
      },
      ...buildPlacementBand(startRank, upperBandParticipants, `${prefix}W`),
      ...buildPlacementBand(startRank + highestPower, lowerBandParticipants, `${prefix}L`),
    ];
  }

  if (participants.length === 2) {
    return [
      {
        id: `${prefix}-final-round`,
        label: `Classement ${getPlacementLabel(startRank, 2)}`,
        matches: [
          {
            id: `${prefix}-final`,
            label: getPlacementLabel(startRank, 2),
            homeTeam: participants[0] ?? "Equipe 1",
            awayTeam: participants[1] ?? "Equipe 2",
          },
        ],
      },
    ];
  }

  const matches = Array.from({ length: participants.length / 2 }, (_, index) => ({
    id: `${prefix}-match-${index + 1}`,
    label: getPlacementLabel(startRank, participants.length),
    homeTeam: participants[index] ?? `Seed ${index + 1}`,
    awayTeam:
      participants[participants.length - 1 - index] ??
      `Seed ${participants.length - index}`,
  }));
  const winners = matches.map((_, index) => `Vainqueur ${prefix}${index + 1}`);
  const losers = matches.map((_, index) => `Perdant ${prefix}${index + 1}`);
  const halfSize = participants.length / 2;

  return [
    {
      id: `${prefix}-round`,
      label: `Classement ${getPlacementLabel(startRank, participants.length)}`,
      matches,
    },
    ...buildPlacementBand(startRank, winners, `${prefix}W`),
    ...buildPlacementBand(startRank + halfSize, losers, `${prefix}L`),
  ];
};

const buildMainBracketPlacementRounds = (startRank: number, drawSize: number, prefix: string) => {
  const rounds: TournamentPreviewRound[] = [];

  if (drawSize >= 4) {
    rounds.push(
      ...buildPlacementBand(
        startRank + 2,
        [`Perdant ${prefix}SF1`, `Perdant ${prefix}SF2`],
        `${prefix}CL3`,
      ),
    );
  }

  if (drawSize >= 8) {
    rounds.push(
      ...buildPlacementBand(
        startRank + 4,
        Array.from({ length: 4 }, (_, index) => `Perdant ${prefix}QF${index + 1}`),
        `${prefix}CL5`,
      ),
    );
  }

  if (drawSize >= 16) {
    rounds.push(
      ...buildPlacementBand(
        startRank + 8,
        Array.from({ length: 8 }, (_, index) => `Perdant ${prefix}8E${index + 1}`),
        `${prefix}CL9`,
      ),
    );
  }

  if (drawSize >= 32) {
    rounds.push(
      ...buildPlacementBand(
        startRank + 16,
        Array.from({ length: 16 }, (_, index) => `Perdant ${prefix}16E${index + 1}`),
        `${prefix}CL17`,
      ),
    );
  }

  return rounds;
};

const buildBracket = (
  bracketType: ManualTournamentState["bracketType"],
  displayLabels: string[],
  selectedSeedLabels: string[],
  prefix: string,
  errorMessage?: string,
) => {
  const entrantCount = selectedSeedLabels.length;

  if (displayLabels.length === 0) {
    return {
      rounds: [] as TournamentPreviewRound[],
      entrantCount: 0,
      mainDrawSize: 0,
      selectedSeedLabels: [] as string[],
      bracketLabel: "Phase finale indisponible",
      errorMessage,
    };
  }

  const rounds: TournamentPreviewRound[] = [];
  const mainDrawSize = displayLabels.length;
  let currentEntrants = mainDrawSize;
  let currentLabels = [...displayLabels];

  while (currentEntrants >= 2) {
    const meta = getRoundMeta(currentEntrants);
    const matchCount = Math.floor(currentEntrants / 2);
    const matches = Array.from({ length: matchCount }, (_, index) => ({
      id: `${prefix}-${meta.prefix}${index + 1}`,
      label: currentEntrants === 2 ? "Finale" : `${meta.matchLabel} ${index + 1}`,
      homeTeam: currentLabels[index] ?? `Seed ${index + 1}`,
      awayTeam:
        currentLabels[currentLabels.length - 1 - index] ??
        `Seed ${currentLabels.length - index}`,
    }));

    rounds.push({
      id: `${prefix}-${meta.id}`,
      label: meta.label,
      matches,
    });

    if (currentEntrants === 2) break;

    currentLabels = matches.map((match) => `Vainqueur ${match.id}`);
    currentEntrants /= 2;
  }

  const topRound = rounds[0];
  const baseBracketLabel =
    topRound?.label === "16emes"
      ? "16eme + 8eme + Quart + Demi + Finale"
      : topRound?.label === "8emes"
        ? "8eme + Quart + Demi + Finale"
        : topRound?.label === "Quarts"
          ? "Quart + Demi + Finale"
          : topRound?.label === "Demi-finales"
            ? "Demi + Finale"
              : "Finale";

  return {
    rounds,
    entrantCount,
    mainDrawSize,
    selectedSeedLabels,
    bracketLabel: baseBracketLabel,
    errorMessage,
  };
};

const buildSecondaryBracket = (
  bracketType: ManualTournamentState["bracketType"],
  remainingSeedLabels: string[],
) => {
  const desiredEntrants = getDesiredEntrantCount(bracketType);
  const drawSize = getCoherentDrawSize(remainingSeedLabels.length, desiredEntrants);

  if (drawSize === 0) {
    return {
      rounds: [] as TournamentPreviewRound[],
      bracketLabel: "Consolante indisponible",
      errorMessage: "Bracket impossible sous ce format",
      selectedSeedLabels: [] as string[],
      drawSize: 0,
    };
  }

  const selectedSeedLabels = remainingSeedLabels.slice(0, Math.min(drawSize, remainingSeedLabels.length));
  const displayLabels = [
    ...selectedSeedLabels,
    ...Array.from({ length: Math.max(0, drawSize - selectedSeedLabels.length) }, (_, index) => {
      return `BYE C${index + 1}`;
    }),
  ];

  const result = buildBracket(
    bracketType,
    displayLabels,
    selectedSeedLabels,
    "secondary",
  );

  return {
    rounds: result.rounds,
    bracketLabel: result.bracketLabel,
    errorMessage: undefined,
    selectedSeedLabels,
    drawSize,
  };
};

const buildClassementSections = (
  totalSeedLabels: string[],
  selectedSeedLabels: string[],
  entrantCount: number,
  mainDrawSize: number,
  secondarySelectedSeedLabels: string[],
  secondaryDrawSize: number,
  phaseType: ManualTournamentState["tournamentPhaseType"],
  enabled: boolean,
) => {
  if (!enabled) return [];

  const sections: TournamentPreviewPlacementSection[] = [];
  const mainBracketPlacementRounds = buildMainBracketPlacementRounds(1, mainDrawSize, "");
  if (mainBracketPlacementRounds.length > 0) {
    sections.push({
      id: "main-bracket-placement",
      title: "Matchs de classement des phases finales",
      description:
        "Classements auto des perdants du tableau principal : quart, demi, 8eme ou 16eme selon le format choisi.",
      rounds: [...mainBracketPlacementRounds].sort(
        (left, right) => getPlacementSortValue(right.label) - getPlacementSortValue(left.label),
      ),
    });
  }

  const secondaryBracketPlacementRounds =
    phaseType === "double"
      ? buildMainBracketPlacementRounds(
          selectedSeedLabels.length + 1,
          secondaryDrawSize,
          "CONS. ",
        )
      : [];
  if (secondaryBracketPlacementRounds.length > 0) {
    sections.push({
      id: "secondary-bracket-placement",
      title: "Matchs de classement consolante",
      description:
        "Classements auto des perdants de la consolante, adaptes au format secondaire choisi.",
      rounds: [...secondaryBracketPlacementRounds].sort(
        (left, right) => getPlacementSortValue(right.label) - getPlacementSortValue(left.label),
      ),
    });
  }

  const excludedFromMain = totalSeedLabels.filter((seed) => !selectedSeedLabels.includes(seed));
  const poolRemainingSeeds =
    phaseType === "double"
      ? excludedFromMain.filter((seed) => !secondarySelectedSeedLabels.includes(seed))
      : excludedFromMain;
  if (poolRemainingSeeds.length >= 2) {
    sections.push({
      id: "group-placement",
      title: "Classement poules",
      description: getPlacementBandDescription(entrantCount + 1, poolRemainingSeeds.length),
      rounds: buildPlacementBand(
        entrantCount + 1,
        poolRemainingSeeds,
        `CL${entrantCount + 1}Q`,
      ),
    });
  }

  return sections;
};

const buildPreviewData = (state: ManualTournamentState): TournamentPreviewData => {
  const teams = buildTeams(state.teamsCount, state.shuffleSeed);
  const groups = buildGroups(teams, state.groupsCount);
  const previewGroups: TournamentPreviewGroup[] = groups.map((group) => ({
    id: group.id,
    label: group.label,
    standings: buildStandings(group.teams),
  }));
  const allSeedLabels = buildAllSeedLabelsFromGroups(previewGroups);
  const qualifiedBracket = buildQualifiedLabelsFromGroups(
    previewGroups,
    state.qualification,
    state.bracketType,
  );
  const bracketResult = buildBracket(
    state.bracketType,
    qualifiedBracket.displayLabels,
    qualifiedBracket.selectedSeedLabels,
    "main",
    qualifiedBracket.errorMessage,
  );
  const secondarySeedLabels =
    state.tournamentPhaseType === "double" && qualifiedBracket.isValid
      ? allSeedLabels.filter((seed) => !qualifiedBracket.selectedSeedLabels.includes(seed))
      : [];
  const secondaryBracketResult = buildSecondaryBracket(
    state.consolationBracketType,
    secondarySeedLabels,
  );
  const classementSections = buildClassementSections(
    allSeedLabels,
    bracketResult.selectedSeedLabels,
    bracketResult.entrantCount,
    bracketResult.mainDrawSize,
    secondaryBracketResult.selectedSeedLabels,
    secondaryBracketResult.drawSize,
    state.tournamentPhaseType,
    state.placementMatches,
  );

  return {
    name: state.name.trim() || "Builder tournoi",
    date: state.date || undefined,
    teamsCount: state.teamsCount,
    groupsCount: state.groupsCount,
    phaseType: state.tournamentPhaseType,
    qualificationLabel: getQualificationLabel(qualifiedBracket.resolvedQualification),
    bracketLabel: bracketResult.bracketLabel,
    bracketError: bracketResult.errorMessage,
    secondaryBracketLabel: secondaryBracketResult.bracketLabel,
    secondaryBracketError: secondaryBracketResult.errorMessage,
    placementMatches: state.placementMatches,
    groups: previewGroups,
    bracket: bracketResult.rounds,
    secondaryBracket: secondaryBracketResult.rounds,
    classementSections,
    classement: classementSections.flatMap((section) => section.rounds),
  };
};

function PillOption({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
        active
          ? "border border-violet-300/30 bg-violet-500/18 text-white shadow-[0_0_18px_rgba(124,58,237,0.24)]"
          : "border border-white/10 bg-black/20 text-slate-300 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function ManualTournamentBuilder() {
  const router = useRouter();
  const [manualTournamentState, setManualTournamentState] =
    useState<ManualTournamentState>(DEFAULT_STATE);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [activeControlTab, setActiveControlTab] = useState<ManualControlTab | null>(null);
  const [manualTeamCountDraft, setManualTeamCountDraft] = useState("");
  const [manualGroupCountDraft, setManualGroupCountDraft] = useState("");
  const [manualFieldCountDraft, setManualFieldCountDraft] = useState("");
  const [manualCategoryDraft, setManualCategoryDraft] = useState("");
  const [manualLevelDraft, setManualLevelDraft] = useState("");
  const previousPhaseTypeRef = useRef<ManualTournamentState["tournamentPhaseType"]>(
    DEFAULT_STATE.tournamentPhaseType,
  );
  const scrollToSecondaryBracket = () => {
    window.requestAnimationFrame(() => {
      document
        .getElementById("manual-builder-secondary-bracket")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const availableGroupCounts = useMemo(
    () => getAvailableGroupCounts(manualTournamentState.teamsCount),
    [manualTournamentState.teamsCount],
  );
  const groupsCount =
    Number.isFinite(manualTournamentState.groupsCount) && manualTournamentState.groupsCount >= 1
      ? Math.round(manualTournamentState.groupsCount)
      : (availableGroupCounts[0] ?? 2);
  const availableQualifications = useMemo(
    () => getAvailableQualifications(manualTournamentState.teamsCount, groupsCount),
    [groupsCount, manualTournamentState.teamsCount],
  );
  const qualification = availableQualifications.some(
    (option) => option.key === manualTournamentState.qualification,
  )
    ? manualTournamentState.qualification
    : (availableQualifications[0]?.key ?? "top1");

  const normalizedState = useMemo(
    () => ({
      ...manualTournamentState,
      groupsCount,
      qualification,
    }),
    [groupsCount, manualTournamentState, qualification],
  );

  const previewData = useMemo(
    () => buildPreviewData(normalizedState),
    [normalizedState],
  );

  useEffect(() => {
    const wasDouble = previousPhaseTypeRef.current === "double";
    previousPhaseTypeRef.current = normalizedState.tournamentPhaseType;

    if (wasDouble || normalizedState.tournamentPhaseType !== "double") {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      document
        .getElementById("manual-builder-secondary-bracket")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [normalizedState.tournamentPhaseType]);
  const effectiveSelectedGroupId =
    selectedGroupId && previewData.groups.some((group) => group.id === selectedGroupId)
      ? selectedGroupId
      : (previewData.groups[0]?.id ?? null);

  const randomize = () => {
    const teamsCount =
      TEAM_COUNT_OPTIONS[Math.floor(Math.random() * TEAM_COUNT_OPTIONS.length)] ?? 16;
    const nextGroupOptions = getAvailableGroupCounts(teamsCount);
    const groupsCount =
      nextGroupOptions[Math.floor(Math.random() * nextGroupOptions.length)] ?? 2;
    const nextQualificationOptions = getAvailableQualifications(teamsCount, groupsCount);
    const qualification =
      nextQualificationOptions[
        Math.floor(Math.random() * nextQualificationOptions.length)
      ]?.key ?? "top1";

    setManualTournamentState((current) => ({
      ...current,
      teamsCount,
      groupsCount,
      qualification,
      tournamentPhaseType: Math.random() > 0.6 ? "double" : "simple",
      bracketType: Math.random() > 0.5 ? "quarter" : "semi",
      consolationBracketType: Math.random() > 0.5 ? "quarter" : "semi",
      placementMatches: Math.random() > 0.4,
      fieldCount: Math.max(1, Math.min(8, current.fieldCount)),
      shuffleSeed: current.shuffleSeed + 3,
    }));
  };

  const applyManualTeamCount = () => {
    const parsed = Number(manualTeamCountDraft);
    if (!Number.isFinite(parsed) || parsed < 2) return;
    setManualTournamentState((current) => ({
      ...current,
      teamsCount: Math.max(2, Math.round(parsed)),
    }));
    setManualTeamCountDraft("");
    setActiveControlTab(null);
  };

  const applyManualGroupCount = () => {
    const parsed = Number(manualGroupCountDraft);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    setManualTournamentState((current) => ({
      ...current,
      groupsCount: Math.max(1, Math.round(parsed)),
    }));
    setManualGroupCountDraft("");
    setActiveControlTab(null);
  };

  const applyManualFieldCount = () => {
    const parsed = Number(manualFieldCountDraft);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    setManualTournamentState((current) => ({
      ...current,
      fieldCount: Math.max(1, Math.round(parsed)),
    }));
    setManualFieldCountDraft("");
    setActiveControlTab(null);
  };

  const applyManualCategory = () => {
    const value = manualCategoryDraft.trim();
    if (!value) return;
    setManualTournamentState((current) => ({
      ...current,
      categories: current.categories.includes(value)
        ? current.categories
        : [...current.categories, value],
    }));
    setManualCategoryDraft("");
    setActiveControlTab(null);
  };

  const applyManualLevel = () => {
    const value = manualLevelDraft.trim();
    if (!value) return;
    setManualTournamentState((current) => ({
      ...current,
      levels: current.levels.includes(value) ? current.levels : [...current.levels, value],
    }));
    setManualLevelDraft("");
    setActiveControlTab(null);
  };

  const controlTabs: Array<{ key: ManualControlTab; label: string }> = [
    { key: "teams", label: "Equipes" },
    { key: "groups", label: "Groupes" },
    { key: "qualification", label: "Qualif" },
    { key: "bracket", label: "Bracket" },
    { key: "general", label: "Info general" },
  ];
  const controlPanelContent =
    activeControlTab === "teams" ? (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {TEAM_COUNT_OPTIONS.map((option) => (
            <PillOption
              key={option}
              active={normalizedState.teamsCount === option}
              onClick={() => {
                setManualTournamentState((current) => ({
                  ...current,
                  teamsCount: option,
                }));
                setActiveControlTab(null);
              }}
            >
              {option}
            </PillOption>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">Manuel</span>
          <input
            value={manualTeamCountDraft}
            onChange={(event) => setManualTeamCountDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyManualTeamCount();
            }}
            placeholder=""
            className="h-9 w-20 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
          />
          <button
            type="button"
            onClick={applyManualTeamCount}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            Valider
          </button>
        </div>
      </div>
    ) : activeControlTab === "groups" ? (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {GROUP_COUNT_OPTIONS.map((option) => (
            <PillOption
              key={option}
              active={groupsCount === option}
              onClick={() => {
                setManualTournamentState((current) => ({
                  ...current,
                  groupsCount: option,
                }));
                setActiveControlTab(null);
              }}
            >
              {option}
            </PillOption>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">Manuel</span>
          <input
            value={manualGroupCountDraft}
            onChange={(event) => setManualGroupCountDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyManualGroupCount();
            }}
            placeholder=""
            className="h-9 w-20 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
          />
          <button
            type="button"
            onClick={applyManualGroupCount}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            Valider
          </button>
        </div>
      </div>
    ) : activeControlTab === "qualification" ? (
      <div className="flex flex-wrap gap-2">
        {availableQualifications.map((option) => (
          <PillOption
            key={option.key}
            active={qualification === option.key}
            onClick={() => {
              setManualTournamentState((current) => ({
                ...current,
                qualification: option.key,
              }));
              setActiveControlTab(null);
            }}
          >
            {option.label}
          </PillOption>
        ))}
      </div>
    ) : activeControlTab === "bracket" ? (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Type de phase finale
          </p>
          <div className="flex flex-wrap gap-2">
            <PillOption
              active={normalizedState.tournamentPhaseType === "simple"}
              onClick={() =>
                setManualTournamentState((current) => ({
                  ...current,
                  tournamentPhaseType: "simple",
                }))
              }
            >
              Simple
            </PillOption>
            <PillOption
              active={normalizedState.tournamentPhaseType === "double"}
              onClick={() => {
                setManualTournamentState((current) => ({
                  ...current,
                  tournamentPhaseType: "double",
                }));
                setActiveControlTab(null);
                scrollToSecondaryBracket();
              }}
            >
              Double (avec consolante)
            </PillOption>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Bracket principal</p>
          <div className="flex flex-wrap gap-2">
            {BRACKET_OPTIONS.map((option) => (
              <PillOption
                key={option.key}
                active={normalizedState.bracketType === option.key}
                onClick={() => {
                  setManualTournamentState((current) => ({
                    ...current,
                    bracketType: option.key,
                  }));
                  setActiveControlTab(null);
                }}
              >
                {option.label}
              </PillOption>
            ))}
          </div>
        </div>
        {normalizedState.tournamentPhaseType === "double" ? (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Consolante</p>
            <div className="flex flex-wrap gap-2">
              {BRACKET_OPTIONS.map((option) => (
                <PillOption
                  key={`consolation-${option.key}`}
                  active={normalizedState.consolationBracketType === option.key}
                  onClick={() => {
                    setManualTournamentState((current) => ({
                      ...current,
                      consolationBracketType: option.key,
                      tournamentPhaseType: "double",
                    }));
                    setActiveControlTab(null);
                    scrollToSecondaryBracket();
                  }}
                >
                  {option.label}
                </PillOption>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-4 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Matchs de classement
            </p>
            <p className="mt-1 text-sm text-slate-300">
              Activer le classement des equipes eliminees
            </p>
          </div>
          <button
            type="button"
            aria-pressed={normalizedState.placementMatches}
            onClick={() =>
              setManualTournamentState((current) => ({
                ...current,
                placementMatches: !current.placementMatches,
              }))
            }
            className={[
              "relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border transition",
              normalizedState.placementMatches
                ? "border-emerald-300/25 bg-emerald-500/20 shadow-[0_0_18px_rgba(34,197,94,0.18)]"
                : "border-rose-300/20 bg-rose-500/14 shadow-[0_0_18px_rgba(244,63,94,0.12)]",
            ].join(" ")}
          >
            <span
              className={[
                "inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white transition",
                normalizedState.placementMatches
                  ? "translate-x-[34px] bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.45)]"
                  : "translate-x-[2px] bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.38)]",
              ].join(" ")}
            />
          </button>
        </div>
      </div>
    ) : (
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Nom tournoi</p>
          <input
            value={manualTournamentState.name}
            onChange={(event) =>
              setManualTournamentState((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
            placeholder="Nom du tournoi"
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Nb de terrain</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setManualTournamentState((current) => ({
                  ...current,
                  fieldCount: Math.max(1, current.fieldCount - 1),
                }))
              }
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-base font-semibold text-white transition hover:bg-white/10"
            >
              -
            </button>
            <div className="inline-flex h-10 min-w-12 items-center justify-center rounded-2xl border border-violet-300/30 bg-violet-500/18 px-3 text-sm font-semibold text-white">
              {normalizedState.fieldCount}
            </div>
            <button
              type="button"
              onClick={() =>
                setManualTournamentState((current) => ({
                  ...current,
                  fieldCount: current.fieldCount + 1,
                }))
              }
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-base font-semibold text-white transition hover:bg-white/10"
            >
              +
            </button>
            <input
              value={manualFieldCountDraft}
              onChange={(event) => setManualFieldCountDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyManualFieldCount();
              }}
              placeholder="manuel"
              className="h-10 w-24 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Categorie</p>
          <details className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-white">
              Choisir categories
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((category) => (
                <PillOption
                  key={category}
                  active={normalizedState.categories.includes(category)}
                  onClick={() =>
                    setManualTournamentState((current) => ({
                      ...current,
                      categories: current.categories.includes(category)
                        ? current.categories.filter((entry) => entry !== category)
                        : [...current.categories, category],
                    }))
                  }
                >
                  {category}
                </PillOption>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={manualCategoryDraft}
                onChange={(event) => setManualCategoryDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyManualCategory();
                }}
                placeholder="Categorie manuelle"
                className="h-10 min-w-[180px] flex-1 rounded-2xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
              />
              <button
                type="button"
                onClick={applyManualCategory}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                Valider
              </button>
            </div>
          </details>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Niveau</p>
          <div className="flex flex-wrap gap-2">
            {LEVEL_OPTIONS.map((level) => (
              <PillOption
                key={level}
                active={normalizedState.levels.includes(level)}
                onClick={() =>
                  setManualTournamentState((current) => ({
                    ...current,
                    levels: current.levels.includes(level)
                      ? current.levels.filter((entry) => entry !== level)
                      : level === "Tous"
                        ? ["Tous"]
                        : [...current.levels.filter((entry) => entry !== "Tous"), level],
                  }))
                }
              >
                {level}
              </PillOption>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={manualLevelDraft}
              onChange={(event) => setManualLevelDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyManualLevel();
              }}
              placeholder="Niveau manuel"
              className="h-10 min-w-[180px] flex-1 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
            />
            <button
              type="button"
              onClick={applyManualLevel}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              Valider
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="flex min-h-screen flex-col bg-[#070a14] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[rgba(7,10,20,0.82)] backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-3 px-4 py-3 md:px-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <span>←</span>
            Retour
          </button>

          <input
            value={manualTournamentState.name}
            onChange={(event) =>
              setManualTournamentState((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            className="min-w-[220px] flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
            placeholder="Nom du tournoi"
          />

          <input
            type="date"
            value={manualTournamentState.date}
            onChange={(event) =>
              setManualTournamentState((current) => ({
                ...current,
                date: event.target.value,
              }))
            }
            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
          />

          <span className="rounded-full border border-violet-300/20 bg-violet-500/14 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-100">
            Mode manuel
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center justify-between gap-3 px-4 pt-5 md:px-6">
        <div className="flex flex-wrap gap-2">
          {controlTabs.map((tab) => (
            <PillOption
              key={tab.key}
              active={activeControlTab === tab.key}
              onClick={() => setActiveControlTab(tab.key)}
            >
              {tab.label}
            </PillOption>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={randomize}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            🎲 Generer
          </button>
          <button
            type="button"
            onClick={() => {
              setManualTournamentState(DEFAULT_STATE);
              setSelectedGroupId(null);
              setManualTeamCountDraft("");
              setManualGroupCountDraft("");
              setManualFieldCountDraft("");
              setManualCategoryDraft("");
              setManualLevelDraft("");
            }}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            🔄 Reset
          </button>
        </div>
      </div>

      {activeControlTab ? (
        <div
          className="fixed inset-0 z-30 bg-black/45 backdrop-blur-[2px]"
          onClick={() => setActiveControlTab(null)}
          role="presentation"
        >
          <div className="mx-auto flex h-full w-full max-w-[1800px] items-start justify-center px-4 pt-[126px] md:px-6">
            <div
              className="w-full max-w-5xl rounded-[28px] border border-white/10 bg-[rgba(10,12,20,0.92)] p-4 shadow-[0_28px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
              onClick={(event) => event.stopPropagation()}
              role="presentation"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    {controlTabs.find((tab) => tab.key === activeControlTab)?.label}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    Les changements s’appliquent en direct derriere.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveControlTab(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Fermer"
                >
                  ×
                </button>
              </div>

              <div className="mt-4">{controlPanelContent}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto grid w-full max-w-[1800px] flex-1 gap-5 px-4 py-5 md:px-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="h-fit rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.08),transparent_52%),rgba(255,255,255,0.03)] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.28)] backdrop-blur-2xl xl:sticky xl:top-[92px] xl:flex xl:h-[calc(100vh-112px)] xl:flex-col xl:overflow-hidden">
          <div className="space-y-3 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:space-y-0">
            <section className="space-y-3 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Poules
              </h2>
              <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1 xl:min-h-0 xl:max-h-none xl:flex-1">
                {previewData.groups.map((group) => {
                  const active = effectiveSelectedGroupId === group.id;

                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => setSelectedGroupId(group.id)}
                      className={[
                        "w-full rounded-[20px] border px-3 py-3 text-left transition",
                        active
                          ? "border-violet-300/30 bg-violet-500/14 shadow-[0_0_22px_rgba(124,58,237,0.18)]"
                          : "border-white/10 bg-black/20 hover:bg-white/10",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{group.label}</p>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                          {group.standings.length}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1.5">
                        {group.standings.map((team) => (
                          <div
                            key={`${group.id}-${team.team}`}
                            className="flex items-center gap-2 text-sm text-slate-300"
                          >
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/5 px-1.5 text-[10px] font-semibold text-slate-400">
                              {team.rank}
                            </span>
                            <span className="line-clamp-2 text-left leading-5">
                              {team.team}
                            </span>
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </aside>

        <main className="min-w-0">
          <div className="space-y-5">
            <TournamentPreview
              data={previewData}
              focusedGroupId={effectiveSelectedGroupId}
              onGroupSelect={setSelectedGroupId}
              showGroups={false}
              showHeader={false}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
