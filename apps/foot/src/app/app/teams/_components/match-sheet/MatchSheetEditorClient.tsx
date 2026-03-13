"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, ShieldAlert } from "lucide-react";
import DashboardLayout from "@/app/_components/DashboardLayout";
import GameCardShell from "@/app/_components/cards/GameCardShell";
import PlayerAvatar from "@/app/app/teams/_components/PlayerAvatar";
import {
  buildTeamNameAliases,
  getTeamProfile,
  getTeamDisplayName,
  type TeamProfile,
} from "@/lib/teamProfile";
import { supabase } from "@/lib/supabaseClient";
import {
  createDefaultMatchSheetDraft,
  createDefaultSlotPositions,
  getFormationOptionsForFormat,
  getMatchSheetSlots,
  getPlayerDisplayName,
  isFormationCompatibleWithFormat,
  remapStartersForFormationChange,
} from "./config";
import MatchSheetField from "./MatchSheetField";
import { loadMatchSheetDraft, saveMatchSheetDraft } from "./storage";
import type {
  MatchSheetDraft,
  MatchSheetFormation,
  MatchSheetMatch,
  MatchSheetPlayer,
  MatchSheetPlayerSource,
} from "./types";

type MatchSheetEditorClientProps = {
  teamId: string;
  matchId: string;
};

type MatchSheetRosterSource = "team" | "club" | "staff";
type MatchSheetStageTab =
  | "composition"
  | "adversaire"
  | "feuille"
  | "validation";
type MatchSheetSidelineTab = "substitutes" | "staff";

type ManualPlayerFormState = {
  firstName: string;
  lastName: string;
  licenseNumber: string;
};

type RawPlayerField = {
  id?: string;
  label?: string;
  value?: string;
  type?: string;
  order?: number;
  active?: boolean;
};

type RawPlayerRow = {
  id: string;
  club_id: string;
  team_id: string | null;
  first_name: string | null;
  last_name: string | null;
  license_number: string | null;
  photo_url: string | null;
  custom_fields: RawPlayerField[] | null;
  created_at?: string;
};

const DEFAULT_SUBSTITUTE_SLOT_COUNT = 3;
const MAX_SUBSTITUTE_SLOT_COUNT = 4;

const longDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const supabaseError = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };

    const parts = [
      supabaseError.message,
      supabaseError.details,
      supabaseError.hint,
      supabaseError.code ? `code: ${supabaseError.code}` : null,
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(" | ");
    }
  }

  if (typeof error === "string") {
    return error;
  }

  return "Erreur inconnue";
}

function isMissingColumnError(
  error: unknown,
  table: string,
  column: string,
) {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: string; message?: string };
  if (maybeError.code !== "PGRST204") return false;
  if (typeof maybeError.message !== "string") return false;

  return (
    maybeError.message.includes(`'${column}'`) &&
    maybeError.message.includes(`'${table}'`)
  );
}

async function loadMatchSheetMatch(teamId: string, matchId: string) {
  const response = await supabase
    .from("team_events")
    .select("id,title,start_at,location,status")
    .eq("id", matchId)
    .eq("team_id", teamId)
    .eq("type", "match")
    .maybeSingle();

  if (!response.error) {
    return response.data
      ? ({
          ...(response.data as Omit<MatchSheetMatch, "source">),
          source: "team-event",
        } satisfies MatchSheetMatch)
      : null;
  }

  if (!isMissingColumnError(response.error, "team_events", "location")) {
    throw response.error;
  }

  const fallbackResponse = await supabase
    .from("team_events")
    .select("id,title,start_at,status")
    .eq("id", matchId)
    .eq("team_id", teamId)
    .eq("type", "match")
    .maybeSingle();

  if (fallbackResponse.error) throw fallbackResponse.error;

  return fallbackResponse.data
    ? ({
        ...(fallbackResponse.data as Omit<MatchSheetMatch, "source" | "location">),
        location: null,
        source: "team-event",
      } satisfies MatchSheetMatch)
    : null;
}

function normalizePlayers(rows: RawPlayerRow[]): MatchSheetPlayer[] {
  return rows.map((item) => ({
    ...item,
    first_name: item.first_name ?? "",
    last_name: item.last_name ?? "",
    license_number: item.license_number ?? "",
    custom_fields: Array.isArray(item.custom_fields)
      ? item.custom_fields.map((field, index) => ({
          id:
            typeof field?.id === "string"
              ? field.id
              : `${item.id}-field-${index + 1}`,
          label: typeof field?.label === "string" ? field.label : "",
          value: typeof field?.value === "string" ? field.value : "",
          type:
            field?.type === "url"
              ? "link"
              : field?.type === "link" ||
                  field?.type === "text" ||
                  field?.type === "number" ||
                  field?.type === "email" ||
                  field?.type === "phone" ||
                  field?.type === "textarea" ||
                  field?.type === "date"
                ? field.type
                : "text",
          order: typeof field?.order === "number" ? field.order : index + 1,
          active: typeof field?.active === "boolean" ? field.active : true,
        }))
      : [],
    source: "team",
  }));
}

function createManualPlayer(
  teamId: string,
  values: ManualPlayerFormState,
  source: MatchSheetPlayerSource,
): MatchSheetPlayer {
  const trimmedFirstName = values.firstName.trim();
  const trimmedLastName = values.lastName.trim();
  const trimmedLicenseNumber = values.licenseNumber.trim();

  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `manual-${teamId}-${Date.now()}`,
    club_id: "manual",
    team_id: teamId,
    first_name: trimmedFirstName,
    last_name: trimmedLastName,
    license_number: trimmedLicenseNumber,
    photo_url: null,
    custom_fields: [],
    created_at: new Date().toISOString(),
    source,
  };
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getMatchDisplayTitle(
  title: string | null,
  team: TeamProfile | null,
) {
  const teamDisplayName = getTeamDisplayName(team);
  if (!title?.trim()) return teamDisplayName || "Composition du match";
  if (!teamDisplayName || !team) return title;

  const aliases = buildTeamNameAliases({
    clubName: team.clubName,
    name: team.name,
    category: team.category,
    squadNumber: team.squadNumber,
    fallback: "Mon équipe",
  }).sort((a, b) => b.length - a.length);

  for (const alias of aliases) {
    if (!alias || alias === teamDisplayName) continue;

    const normalizedTitle = title.toLowerCase();
    const normalizedAlias = alias.toLowerCase();
    const index = normalizedTitle.indexOf(normalizedAlias);

    if (index >= 0) {
      return `${title.slice(0, index)}${teamDisplayName}${title.slice(index + alias.length)}`;
    }
  }

  return title;
}

function getRosterLineLabel(player: MatchSheetPlayer) {
  const firstName = player.first_name.trim();
  const lastName = player.last_name.trim().toUpperCase();

  return [firstName, lastName].filter(Boolean).join(" ") || "Joueur";
}

function getPlayersForRosterSource(
  allPlayers: MatchSheetPlayer[],
  rosterSource: MatchSheetRosterSource,
) {
  return allPlayers.filter((player) => {
    if (rosterSource === "team") {
      return (
        player.source === "team" ||
        player.source === "manual" ||
        player.source === undefined
      );
    }

    return player.source === rosterSource;
  });
}

function filterRosterPlayers(
  players: MatchSheetPlayer[],
  search: string,
) {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return players;

  return players.filter((player) => {
    const playerLabel = getRosterLineLabel(player).toLowerCase();
    const licenseNumber = (player.license_number ?? "").toLowerCase();

    return (
      playerLabel.includes(normalizedSearch) ||
      licenseNumber.includes(normalizedSearch)
    );
  });
}

export default function MatchSheetEditorClient({
  teamId,
  matchId,
}: MatchSheetEditorClientProps) {
  const router = useRouter();
  const [team, setTeam] = useState<TeamProfile | null>(null);
  const [match, setMatch] = useState<MatchSheetMatch | null>(null);
  const [players, setPlayers] = useState<MatchSheetPlayer[]>([]);
  const [draft, setDraft] = useState<MatchSheetDraft>(
    createDefaultMatchSheetDraft(),
  );
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [rosterSource, setRosterSource] =
    useState<MatchSheetRosterSource>("team");
  const [activeTab, setActiveTab] = useState<MatchSheetStageTab>("composition");
  const [showManualPlayerForm, setShowManualPlayerForm] = useState(false);
  const [manualPlayerForm, setManualPlayerForm] = useState<ManualPlayerFormState>(
    {
      firstName: "",
      lastName: "",
      licenseNumber: "",
    },
  );
  const [showFourthSubstituteSlot, setShowFourthSubstituteSlot] = useState(false);
  const [sidelineTab, setSidelineTab] =
    useState<MatchSheetSidelineTab>("substitutes");
  const [openedPlayerInfoId, setOpenedPlayerInfoId] = useState<string | null>(
    null,
  );
  const [playerSearch, setPlayerSearch] = useState("");
  const [opponentSelectedPlayerId, setOpponentSelectedPlayerId] = useState<
    string | null
  >(null);
  const [opponentRosterSource, setOpponentRosterSource] =
    useState<MatchSheetRosterSource>("team");
  const [opponentShowManualPlayerForm, setOpponentShowManualPlayerForm] =
    useState(false);
  const [opponentManualPlayerForm, setOpponentManualPlayerForm] =
    useState<ManualPlayerFormState>({
      firstName: "",
      lastName: "",
      licenseNumber: "",
    });
  const [opponentShowFourthSubstituteSlot, setOpponentShowFourthSubstituteSlot] =
    useState(false);
  const [opponentSidelineTab, setOpponentSidelineTab] =
    useState<MatchSheetSidelineTab>("substitutes");
  const [opponentOpenedPlayerInfoId, setOpponentOpenedPlayerInfoId] = useState<
    string | null
  >(null);
  const [opponentPlayerSearch, setOpponentPlayerSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setDraftReady(false);

      try {
        const [teamResponse, matchResponse, playersResponse] = await Promise.all([
          getTeamProfile(teamId),
          loadMatchSheetMatch(teamId, matchId),
          supabase
            .from("players")
            .select(
              "id,club_id,team_id,first_name,last_name,license_number,photo_url,custom_fields,created_at",
            )
            .eq("team_id", teamId)
            .order("created_at", { ascending: true }),
        ]);

        if (playersResponse.error) throw playersResponse.error;
        if (!teamResponse) {
          throw new Error("Équipe introuvable.");
        }
        const resolvedMatch = matchResponse;

        if (!resolvedMatch) {
          throw new Error("Match introuvable.");
        }

        const normalizedPlayers = normalizePlayers(
          (playersResponse.data ?? []) as RawPlayerRow[],
        );
        const validPlayerIds = normalizedPlayers.map((player) => player.id);
        const fallbackFormat = teamResponse.matchFormat;
        const storedDraft = loadMatchSheetDraft(
          teamId,
          matchId,
          validPlayerIds,
          fallbackFormat,
        );

        if (!cancelled) {
          setTeam(teamResponse);
          setMatch(resolvedMatch);
          setPlayers(normalizedPlayers);
          setDraft(storedDraft);
          setSelectedPlayerId(null);
          setOpponentSelectedPlayerId(null);
          setDraftReady(true);
        }
      } catch (loadError) {
        console.error(
          "Erreur chargement composition:",
          getErrorMessage(loadError),
        );
        if (!cancelled) {
          setError(
            getErrorMessage(loadError) === "Match introuvable."
              ? "Match introuvable."
              : "Impossible de charger cette feuille de match.",
          );
          setTeam(null);
          setMatch(null);
          setPlayers([]);
          setDraft(createDefaultMatchSheetDraft());
          setOpponentSelectedPlayerId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [matchId, teamId]);

  useEffect(() => {
    if (!draftReady) return;
    saveMatchSheetDraft(teamId, matchId, draft);
  }, [draft, draftReady, matchId, teamId]);

  useEffect(() => {
    if (!selectedPlayerId) return;

    const allPlayers = [...players, ...draft.manualPlayers];
    const stillExists = allPlayers.some(
      (player) => player.id === selectedPlayerId,
    );
    if (!stillExists) {
      setSelectedPlayerId(null);
    }
  }, [draft.manualPlayers, players, selectedPlayerId]);

  useEffect(() => {
    if (!opponentSelectedPlayerId) return;

    const allOpponentPlayers = [...draft.opponentManualPlayers];
    const stillExists = allOpponentPlayers.some(
      (player) => player.id === opponentSelectedPlayerId,
    );
    if (!stillExists) {
      setOpponentSelectedPlayerId(null);
    }
  }, [draft.opponentManualPlayers, opponentSelectedPlayerId]);

  useEffect(() => {
    if (draft.substitutes.length > DEFAULT_SUBSTITUTE_SLOT_COUNT) {
      setShowFourthSubstituteSlot(true);
    }
  }, [draft.substitutes.length]);

  useEffect(() => {
    if (draft.opponentSubstitutes.length > DEFAULT_SUBSTITUTE_SLOT_COUNT) {
      setOpponentShowFourthSubstituteSlot(true);
    }
  }, [draft.opponentSubstitutes.length]);

  const slotPositions =
    draft.slotPositionsByFormation[draft.formation] ??
    createDefaultSlotPositions(draft.formation);
  const slots = getMatchSheetSlots(draft.formation, slotPositions);
  const formationOptions = getFormationOptionsForFormat(draft.format);
  const allPlayers = [...players, ...draft.manualPlayers];
  const playersById = new Map(allPlayers.map((player) => [player.id, player]));
  const visibleSubstituteSlotCount = showFourthSubstituteSlot
    ? MAX_SUBSTITUTE_SLOT_COUNT
    : DEFAULT_SUBSTITUTE_SLOT_COUNT;
  const substituteSlots = Array.from(
    { length: visibleSubstituteSlotCount },
    (_, index) => draft.substitutes[index] ?? null,
  );
  const rosterPlayers = getPlayersForRosterSource(allPlayers, rosterSource);
  const filteredRosterPlayers = filterRosterPlayers(rosterPlayers, playerSearch);
  const opponentSlotPositions =
    draft.opponentSlotPositionsByFormation[draft.opponentFormation] ??
    createDefaultSlotPositions(draft.opponentFormation);
  const opponentSlots = getMatchSheetSlots(
    draft.opponentFormation,
    opponentSlotPositions,
  );
  const opponentFormationOptions = getFormationOptionsForFormat(draft.format);
  const opponentAllPlayers = [...draft.opponentManualPlayers];
  const opponentPlayersById = new Map(
    opponentAllPlayers.map((player) => [player.id, player]),
  );
  const visibleOpponentSubstituteSlotCount = opponentShowFourthSubstituteSlot
    ? MAX_SUBSTITUTE_SLOT_COUNT
    : DEFAULT_SUBSTITUTE_SLOT_COUNT;
  const opponentSubstituteSlots = Array.from(
    { length: visibleOpponentSubstituteSlotCount },
    (_, index) => draft.opponentSubstitutes[index] ?? null,
  );
  const opponentRosterPlayers = getPlayersForRosterSource(
    opponentAllPlayers,
    opponentRosterSource,
  );
  const filteredOpponentRosterPlayers = filterRosterPlayers(
    opponentRosterPlayers,
    opponentPlayerSearch,
  );

  const ensurePlayerInSelectedSquad = (
    selectedSquadIds: string[],
    playerId: string,
  ) => {
    if (selectedSquadIds.includes(playerId)) return selectedSquadIds;
    return [...selectedSquadIds, playerId];
  };

  const getPlayerAssignment = (playerId: string) => {
    for (const slot of slots) {
      if (draft.startersBySlot[slot.id] === playerId) {
        return { type: "starter" as const, label: slot.shortLabel };
      }
    }

    if (draft.substitutes.includes(playerId)) {
      return { type: "substitute" as const, label: "Rempl." };
    }

    if (draft.staffAssignments.includes(playerId)) {
      return { type: "staff" as const, label: "Dir." };
    }

    return { type: "available" as const, label: "Libre" };
  };

  const getOpponentPlayerAssignment = (playerId: string) => {
    for (const slot of opponentSlots) {
      if (draft.opponentStartersBySlot[slot.id] === playerId) {
        return { type: "starter" as const, label: slot.shortLabel };
      }
    }

    if (draft.opponentSubstitutes.includes(playerId)) {
      return { type: "substitute" as const, label: "Rempl." };
    }

    if (draft.opponentStaffAssignments.includes(playerId)) {
      return { type: "staff" as const, label: "Dir." };
    }

    return { type: "available" as const, label: "Libre" };
  };

  const handleFormationChange = (nextFormation: MatchSheetFormation) => {
    setDraft((currentDraft) => {
      if (
        currentDraft.formation === nextFormation ||
        !isFormationCompatibleWithFormat(nextFormation, currentDraft.format)
      ) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        formation: nextFormation,
        startersBySlot: remapStartersForFormationChange(
          currentDraft.formation,
          nextFormation,
          currentDraft.startersBySlot,
        ),
        slotPositionsByFormation: {
          // Custom drag positions only live within the current formation.
          // Switching system resets the target formation to its default layout.
          [nextFormation]: createDefaultSlotPositions(nextFormation),
        },
      };
    });
  };

  const handleOpponentFormationChange = (nextFormation: MatchSheetFormation) => {
    setDraft((currentDraft) => {
      if (
        currentDraft.opponentFormation === nextFormation ||
        !isFormationCompatibleWithFormat(nextFormation, currentDraft.format)
      ) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        opponentFormation: nextFormation,
        opponentStartersBySlot: remapStartersForFormationChange(
          currentDraft.opponentFormation,
          nextFormation,
          currentDraft.opponentStartersBySlot,
        ),
        opponentSlotPositionsByFormation: {
          [nextFormation]: createDefaultSlotPositions(nextFormation),
        },
      };
    });
  };

  const handleSlotClick = (slotId: string) => {
    const currentPlayerId = draft.startersBySlot[slotId];

    if (!selectedPlayerId) {
      setSelectedPlayerId(currentPlayerId ?? null);
      return;
    }

    setDraft((currentDraft) => {
      const nextStarters = { ...currentDraft.startersBySlot };

      Object.keys(nextStarters).forEach((key) => {
        if (nextStarters[key] === selectedPlayerId) {
          nextStarters[key] = null;
        }
      });

      nextStarters[slotId] = selectedPlayerId;

      return {
        ...currentDraft,
        startersBySlot: nextStarters,
        selectedSquadIds: ensurePlayerInSelectedSquad(
          currentDraft.selectedSquadIds,
          selectedPlayerId,
        ),
        substitutes: currentDraft.substitutes.filter(
          (playerId) => playerId !== selectedPlayerId,
        ),
        staffAssignments: currentDraft.staffAssignments.filter(
          (playerId) => playerId !== selectedPlayerId,
        ),
      };
    });

    setSelectedPlayerId(null);
  };

  const handleOpponentSlotClick = (slotId: string) => {
    const currentPlayerId = draft.opponentStartersBySlot[slotId];

    if (!opponentSelectedPlayerId) {
      setOpponentSelectedPlayerId(currentPlayerId ?? null);
      return;
    }

    setDraft((currentDraft) => {
      const nextStarters = { ...currentDraft.opponentStartersBySlot };

      Object.keys(nextStarters).forEach((key) => {
        if (nextStarters[key] === opponentSelectedPlayerId) {
          nextStarters[key] = null;
        }
      });

      nextStarters[slotId] = opponentSelectedPlayerId;

      return {
        ...currentDraft,
        opponentStartersBySlot: nextStarters,
        opponentSelectedSquadIds: ensurePlayerInSelectedSquad(
          currentDraft.opponentSelectedSquadIds,
          opponentSelectedPlayerId,
        ),
        opponentSubstitutes: currentDraft.opponentSubstitutes.filter(
          (playerId) => playerId !== opponentSelectedPlayerId,
        ),
        opponentStaffAssignments: currentDraft.opponentStaffAssignments.filter(
          (playerId) => playerId !== opponentSelectedPlayerId,
        ),
      };
    });

    setOpponentSelectedPlayerId(null);
  };

  const handleClearSlot = (slotId: string) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      startersBySlot: {
        ...currentDraft.startersBySlot,
        [slotId]: null,
      },
    }));
  };

  const handleClearOpponentSlot = (slotId: string) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      opponentStartersBySlot: {
        ...currentDraft.opponentStartersBySlot,
        [slotId]: null,
      },
    }));
  };

  const handleSlotPositionChange = (
    slotId: string,
    position: { x: number; y: number },
  ) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      slotPositionsByFormation: {
        ...currentDraft.slotPositionsByFormation,
        [currentDraft.formation]: {
          ...(currentDraft.slotPositionsByFormation[currentDraft.formation] ??
            createDefaultSlotPositions(currentDraft.formation)),
          [slotId]: position,
        },
      },
    }));
  };

  const handleOpponentSlotPositionChange = (
    slotId: string,
    position: { x: number; y: number },
  ) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      opponentSlotPositionsByFormation: {
        ...currentDraft.opponentSlotPositionsByFormation,
        [currentDraft.opponentFormation]: {
          ...(currentDraft.opponentSlotPositionsByFormation[
            currentDraft.opponentFormation
          ] ?? createDefaultSlotPositions(currentDraft.opponentFormation)),
          [slotId]: position,
        },
      },
    }));
  };

  const handleSubstituteSlotClick = (slotIndex: number) => {
    const currentPlayerId = draft.substitutes[slotIndex] ?? null;

    if (!selectedPlayerId) {
      setSelectedPlayerId(currentPlayerId);
      return;
    }

    setDraft((currentDraft) => {
      const nextStarters = { ...currentDraft.startersBySlot };
      Object.keys(nextStarters).forEach((slotId) => {
        if (nextStarters[slotId] === selectedPlayerId) {
          nextStarters[slotId] = null;
        }
      });

      const nextSubstitutes = [...currentDraft.substitutes].filter(
        (playerId) => playerId !== selectedPlayerId,
      );
      nextSubstitutes[slotIndex] = selectedPlayerId;

      return {
        ...currentDraft,
        startersBySlot: nextStarters,
        selectedSquadIds: ensurePlayerInSelectedSquad(
          currentDraft.selectedSquadIds,
          selectedPlayerId,
        ),
        substitutes: nextSubstitutes.filter(Boolean).slice(0, MAX_SUBSTITUTE_SLOT_COUNT),
        staffAssignments: currentDraft.staffAssignments.filter(
          (playerId) => playerId !== selectedPlayerId,
        ),
      };
    });

    setSelectedPlayerId(null);
  };

  const handleClearSubstituteSlot = (slotIndex: number) => {
    setDraft((currentDraft) => {
      const nextSubstitutes = [...currentDraft.substitutes];
      nextSubstitutes.splice(slotIndex, 1);

      return {
        ...currentDraft,
        substitutes: nextSubstitutes.slice(0, MAX_SUBSTITUTE_SLOT_COUNT),
      };
    });
  };

  const handleOpponentSubstituteSlotClick = (slotIndex: number) => {
    const currentPlayerId = draft.opponentSubstitutes[slotIndex] ?? null;

    if (!opponentSelectedPlayerId) {
      setOpponentSelectedPlayerId(currentPlayerId);
      return;
    }

    setDraft((currentDraft) => {
      const nextStarters = { ...currentDraft.opponentStartersBySlot };
      Object.keys(nextStarters).forEach((slotId) => {
        if (nextStarters[slotId] === opponentSelectedPlayerId) {
          nextStarters[slotId] = null;
        }
      });

      const nextSubstitutes = [...currentDraft.opponentSubstitutes].filter(
        (playerId) => playerId !== opponentSelectedPlayerId,
      );
      nextSubstitutes[slotIndex] = opponentSelectedPlayerId;

      return {
        ...currentDraft,
        opponentStartersBySlot: nextStarters,
        opponentSelectedSquadIds: ensurePlayerInSelectedSquad(
          currentDraft.opponentSelectedSquadIds,
          opponentSelectedPlayerId,
        ),
        opponentSubstitutes: nextSubstitutes
          .filter(Boolean)
          .slice(0, MAX_SUBSTITUTE_SLOT_COUNT),
        opponentStaffAssignments: currentDraft.opponentStaffAssignments.filter(
          (playerId) => playerId !== opponentSelectedPlayerId,
        ),
      };
    });

    setOpponentSelectedPlayerId(null);
  };

  const handleClearOpponentSubstituteSlot = (slotIndex: number) => {
    setDraft((currentDraft) => {
      const nextSubstitutes = [...currentDraft.opponentSubstitutes];
      nextSubstitutes.splice(slotIndex, 1);

      return {
        ...currentDraft,
        opponentSubstitutes: nextSubstitutes.slice(
          0,
          MAX_SUBSTITUTE_SLOT_COUNT,
        ),
      };
    });
  };

  const handleStaffSlotClick = (slotIndex: number) => {
    const currentPlayerId = draft.staffAssignments[slotIndex] ?? null;

    if (!selectedPlayerId) {
      setSelectedPlayerId(currentPlayerId);
      return;
    }

    setDraft((currentDraft) => {
      const nextStarters = { ...currentDraft.startersBySlot };
      Object.keys(nextStarters).forEach((slotId) => {
        if (nextStarters[slotId] === selectedPlayerId) {
          nextStarters[slotId] = null;
        }
      });

      const nextSubstitutes = currentDraft.substitutes.filter(
        (playerId) => playerId !== selectedPlayerId,
      );
      const nextStaffAssignments = [...currentDraft.staffAssignments].filter(
        (playerId) => playerId !== selectedPlayerId,
      );
      nextStaffAssignments[slotIndex] = selectedPlayerId;

      return {
        ...currentDraft,
        startersBySlot: nextStarters,
        selectedSquadIds: ensurePlayerInSelectedSquad(
          currentDraft.selectedSquadIds,
          selectedPlayerId,
        ),
        substitutes: nextSubstitutes,
        staffAssignments: nextStaffAssignments.filter(Boolean).slice(0, 3),
      };
    });

    setSelectedPlayerId(null);
  };

  const handleClearStaffSlot = (slotIndex: number) => {
    setDraft((currentDraft) => {
      const nextStaffAssignments = [...currentDraft.staffAssignments];
      nextStaffAssignments.splice(slotIndex, 1);

      return {
        ...currentDraft,
        staffAssignments: nextStaffAssignments.slice(0, 3),
      };
    });
  };

  const handleOpponentStaffSlotClick = (slotIndex: number) => {
    const currentPlayerId = draft.opponentStaffAssignments[slotIndex] ?? null;

    if (!opponentSelectedPlayerId) {
      setOpponentSelectedPlayerId(currentPlayerId);
      return;
    }

    setDraft((currentDraft) => {
      const nextStarters = { ...currentDraft.opponentStartersBySlot };
      Object.keys(nextStarters).forEach((slotId) => {
        if (nextStarters[slotId] === opponentSelectedPlayerId) {
          nextStarters[slotId] = null;
        }
      });

      const nextSubstitutes = currentDraft.opponentSubstitutes.filter(
        (playerId) => playerId !== opponentSelectedPlayerId,
      );
      const nextStaffAssignments = [
        ...currentDraft.opponentStaffAssignments,
      ].filter((playerId) => playerId !== opponentSelectedPlayerId);
      nextStaffAssignments[slotIndex] = opponentSelectedPlayerId;

      return {
        ...currentDraft,
        opponentStartersBySlot: nextStarters,
        opponentSelectedSquadIds: ensurePlayerInSelectedSquad(
          currentDraft.opponentSelectedSquadIds,
          opponentSelectedPlayerId,
        ),
        opponentSubstitutes: nextSubstitutes,
        opponentStaffAssignments: nextStaffAssignments.filter(Boolean).slice(0, 3),
      };
    });

    setOpponentSelectedPlayerId(null);
  };

  const handleClearOpponentStaffSlot = (slotIndex: number) => {
    setDraft((currentDraft) => {
      const nextStaffAssignments = [...currentDraft.opponentStaffAssignments];
      nextStaffAssignments.splice(slotIndex, 1);

      return {
        ...currentDraft,
        opponentStaffAssignments: nextStaffAssignments.slice(0, 3),
      };
    });
  };

  const handleRosterPlayerSelect = (playerId: string) => {
    setDraft((currentDraft) => {
      return {
        ...currentDraft,
        selectedSquadIds: ensurePlayerInSelectedSquad(
          currentDraft.selectedSquadIds,
          playerId,
        ),
      };
    });

    setSelectedPlayerId((currentSelected) =>
      currentSelected === playerId ? null : playerId,
    );
  };

  const handleOpponentRosterPlayerSelect = (playerId: string) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      opponentSelectedSquadIds: ensurePlayerInSelectedSquad(
        currentDraft.opponentSelectedSquadIds,
        playerId,
      ),
    }));

    setOpponentSelectedPlayerId((currentSelected) =>
      currentSelected === playerId ? null : playerId,
    );
  };

  const handleManualPlayerSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const hasIdentity =
      manualPlayerForm.firstName.trim() || manualPlayerForm.lastName.trim();
    if (!hasIdentity) return;

    const nextPlayer = createManualPlayer(teamId, manualPlayerForm, rosterSource);

    setDraft((currentDraft) => ({
      ...currentDraft,
      manualPlayers: [...currentDraft.manualPlayers, nextPlayer],
      selectedSquadIds: ensurePlayerInSelectedSquad(
        currentDraft.selectedSquadIds,
        nextPlayer.id,
      ),
    }));
    setSelectedPlayerId(nextPlayer.id);
    setManualPlayerForm({
      firstName: "",
      lastName: "",
      licenseNumber: "",
    });
    setShowManualPlayerForm(false);
  };

  const handleOpponentManualPlayerSubmit = (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const hasIdentity =
      opponentManualPlayerForm.firstName.trim() ||
      opponentManualPlayerForm.lastName.trim();
    if (!hasIdentity) return;

    const nextPlayer = createManualPlayer(
      teamId,
      opponentManualPlayerForm,
      opponentRosterSource,
    );

    setDraft((currentDraft) => ({
      ...currentDraft,
      opponentManualPlayers: [...currentDraft.opponentManualPlayers, nextPlayer],
      opponentSelectedSquadIds: ensurePlayerInSelectedSquad(
        currentDraft.opponentSelectedSquadIds,
        nextPlayer.id,
      ),
    }));
    setOpponentSelectedPlayerId(nextPlayer.id);
    setOpponentManualPlayerForm({
      firstName: "",
      lastName: "",
      licenseNumber: "",
    });
    setOpponentShowManualPlayerForm(false);
  };

  const isOpponentView = activeTab === "adversaire";
  const activeFormation = isOpponentView
    ? draft.opponentFormation
    : draft.formation;
  const activeFormationOptions = isOpponentView
    ? opponentFormationOptions
    : formationOptions;
  const activeSlots = isOpponentView ? opponentSlots : slots;
  const activePlayersById = isOpponentView ? opponentPlayersById : playersById;
  const activeSelectedPlayerId = isOpponentView
    ? opponentSelectedPlayerId
    : selectedPlayerId;
  const activeSubstituteSlots = isOpponentView
    ? opponentSubstituteSlots
    : substituteSlots;
  const activeRosterSource = isOpponentView ? opponentRosterSource : rosterSource;
  const activeShowManualPlayerForm = isOpponentView
    ? opponentShowManualPlayerForm
    : showManualPlayerForm;
  const activeManualPlayerForm = isOpponentView
    ? opponentManualPlayerForm
    : manualPlayerForm;
  const activeRosterPlayers = isOpponentView
    ? opponentRosterPlayers
    : rosterPlayers;
  const activeFilteredRosterPlayers = isOpponentView
    ? filteredOpponentRosterPlayers
    : filteredRosterPlayers;
  const activeOpenedPlayerInfoId = isOpponentView
    ? opponentOpenedPlayerInfoId
    : openedPlayerInfoId;
  const activeSidelineTab = isOpponentView ? opponentSidelineTab : sidelineTab;

  const teamDisplayName = getTeamDisplayName(team);
  const matchDisplayTitle = getMatchDisplayTitle(match?.title ?? null, team);
  const matchLabel = match
    ? capitalize(longDateFormatter.format(new Date(match.start_at)))
    : "";

  return (
    <DashboardLayout
      eyebrow=""
      title={matchDisplayTitle || "Composition du match"}
      subtitle={
        match
          ? `${teamDisplayName}${matchLabel ? ` · ${matchLabel}` : ""}${match.location ? ` · ${match.location}` : ""}`
          : "Prépare titulaires, remplaçants et consignes."
      }
      headerRight={
        <button
          type="button"
          onClick={() => router.push(`/app/teams/${teamId}/match-sheet`)}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
          Retour aux matchs
        </button>
      }
    >
      {error ? (
        <GameCardShell className="border-rose-500/20 bg-rose-500/5">
          <div className="p-6 text-sm text-rose-200">{error}</div>
        </GameCardShell>
      ) : loading ? (
        <div className="grid gap-6 md:h-[calc(100vh-190px)] md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="h-[620px] rounded-[32px] border border-white/10 bg-white/5 md:h-full" />
          <div className="h-[620px] rounded-[32px] border border-white/10 bg-white/5 md:h-full" />
        </div>
      ) : (
        <div className="grid gap-6 md:overflow-hidden">
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur">
            {[
              { value: "composition" as const, label: "Composition" },
              { value: "adversaire" as const, label: "Adversaire" },
              { value: "feuille" as const, label: "Feuille" },
              { value: "validation" as const, label: "Validation" },
            ].map((tab) => {
              const isActive = activeTab === tab.value;

              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                  className={[
                    "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] transition",
                    isActive
                      ? "bg-white/15 text-white shadow-[0_0_18px_rgba(168,85,247,0.35)] ring-1 ring-violet-400/40"
                      : "text-slate-400 hover:bg-white/10 hover:text-slate-200",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab !== "composition" && activeTab !== "adversaire" ? (
            <GameCardShell className="border-white/10 bg-black/25">
              <div className="p-6 sm:p-8">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                  {activeTab}
                </p>
                <h2 className="mt-3 text-xl font-semibold text-slate-100">
                  Section en préparation
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-400">
                  Cet onglet sera branché ensuite. La composition actuelle reste
                  disponible dans l’onglet Composition.
                </p>
              </div>
            </GameCardShell>
          ) : null}

          {activeTab === "composition" || activeTab === "adversaire" ? (
          <>
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="mt-2 text-lg font-semibold text-slate-100">
                  {isOpponentView
                    ? "Prépare la composition adverse"
                    : "Crée ta composition de match"}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200">
                  Système
                  <select
                    value={activeFormation}
                    onChange={(event) =>
                      isOpponentView
                        ? handleOpponentFormationChange(
                            event.target.value as MatchSheetFormation,
                          )
                        : handleFormationChange(
                            event.target.value as MatchSheetFormation,
                          )
                    }
                    className="bg-transparent text-sm font-semibold text-slate-100 outline-none"
                  >
                    {activeFormationOptions.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        className="bg-slate-950"
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="grid gap-4 md:h-full md:grid-cols-[430px_260px] md:items-start lg:grid-cols-[480px_260px]">
                  <div className="relative w-[360px] max-w-full sm:w-[430px] md:h-[500px] md:min-h-0 md:w-[430px] md:max-w-[430px] lg:w-[480px] lg:max-w-[480px]">
                    <div className="pointer-events-none absolute bottom-0 left-2 right-2 z-10 rounded-[16px] border border-white/12 bg-slate-950/35 p-2 backdrop-blur-md">
                      <div className="pointer-events-auto">
                        <div className="flex items-center gap-2">
                          {[
                            { value: "substitutes" as const, label: "Remplaçants" },
                            { value: "staff" as const, label: "Dirigeants" },
                          ].map((tab) => (
                            <button
                              key={tab.value}
                              type="button"
                              onClick={() =>
                                isOpponentView
                                  ? setOpponentSidelineTab(tab.value)
                                  : setSidelineTab(tab.value)
                              }
                              className={[
                                "rounded-full px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] transition",
                                activeSidelineTab === tab.value
                                  ? "bg-white/14 text-white ring-1 ring-fuchsia-400/35"
                                  : "text-slate-400 hover:text-slate-200",
                              ].join(" ")}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>

                        {activeSidelineTab === "substitutes" ? (
                          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                            {activeSubstituteSlots.map((playerId, slotIndex) => {
                              const player = playerId
                                ? activePlayersById.get(playerId) ?? null
                                : null;
                              const isSelected = Boolean(
                                player && activeSelectedPlayerId === player.id,
                              );

                              return (
                                <div key={`substitute-slot-${slotIndex}`} className="relative">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      isOpponentView
                                        ? handleOpponentSubstituteSlotClick(
                                            slotIndex,
                                          )
                                        : handleSubstituteSlotClick(slotIndex)
                                    }
                                    className={[
                                      "flex h-11 w-full flex-col items-center justify-center gap-0.5 rounded-[12px] border px-1 text-center transition",
                                      isSelected
                                        ? "border-fuchsia-300/40 bg-fuchsia-500/14"
                                        : player
                                          ? "border-white/15 bg-white/[0.07]"
                                          : "border-white/10 bg-black/20",
                                    ].join(" ")}
                                  >
                                    {player ? (
                                      <>
                                        <PlayerAvatar
                                          firstName={player.first_name}
                                          lastName={player.last_name}
                                          photoUrl={player.photo_url}
                                          size="xs"
                                          className="h-4 w-4 rounded-full text-[7px]"
                                        />
                                        <span className="w-full truncate text-[7px] font-semibold uppercase tracking-[0.1em] text-slate-100">
                                          {getPlayerDisplayName(player)}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="text-[7px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                        Banc {slotIndex + 1}
                                      </span>
                                    )}
                                  </button>

                                  {player ? (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (isOpponentView) {
                                          handleClearOpponentSubstituteSlot(
                                            slotIndex,
                                          );
                                          return;
                                        }
                                        handleClearSubstituteSlot(slotIndex);
                                      }}
                                      className="absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/15 bg-slate-950/90 text-[8px] text-slate-300 transition hover:text-white"
                                      aria-label={`Retirer ${getPlayerDisplayName(player)} du banc`}
                                    >
                                      ×
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })}

                            {!(isOpponentView
                              ? opponentShowFourthSubstituteSlot
                              : showFourthSubstituteSlot) ? (
                              <button
                                type="button"
                                onClick={() =>
                                  isOpponentView
                                    ? setOpponentShowFourthSubstituteSlot(true)
                                    : setShowFourthSubstituteSlot(true)
                                }
                                className="flex h-11 w-full items-center justify-center rounded-[12px] border border-dashed border-white/12 bg-black/20 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                                aria-label="Ajouter une quatrième case remplaçant"
                              >
                                +
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                            {Array.from({ length: 3 }).map((_, index) => {
                              const playerId =
                                (isOpponentView
                                  ? draft.opponentStaffAssignments[index]
                                  : draft.staffAssignments[index]) ?? null;
                              const player = playerId
                                ? activePlayersById.get(playerId) ?? null
                                : null;
                              const isSelected = Boolean(
                                player && activeSelectedPlayerId === player.id,
                              );

                              return (
                                <div key={`staff-slot-${index + 1}`} className="relative">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      isOpponentView
                                        ? handleOpponentStaffSlotClick(index)
                                        : handleStaffSlotClick(index)
                                    }
                                    className={[
                                      "flex h-11 w-full flex-col items-center justify-center gap-0.5 rounded-[12px] border px-1 text-center transition",
                                      isSelected
                                        ? "border-fuchsia-300/40 bg-fuchsia-500/14"
                                        : player
                                          ? "border-white/15 bg-white/[0.07]"
                                          : "border-white/10 bg-black/20",
                                    ].join(" ")}
                                  >
                                    {player ? (
                                      <>
                                        <PlayerAvatar
                                          firstName={player.first_name}
                                          lastName={player.last_name}
                                          photoUrl={player.photo_url}
                                          size="xs"
                                          className="h-4 w-4 rounded-full text-[7px]"
                                        />
                                        <span className="w-full truncate text-[7px] font-semibold uppercase tracking-[0.1em] text-slate-100">
                                          {getPlayerDisplayName(player)}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="text-[7px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                        Dir. {index + 1}
                                      </span>
                                    )}
                                  </button>

                                  {player ? (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (isOpponentView) {
                                          handleClearOpponentStaffSlot(index);
                                          return;
                                        }
                                        handleClearStaffSlot(index);
                                      }}
                                      className="absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/15 bg-slate-950/90 text-[8px] text-slate-300 transition hover:text-white"
                                      aria-label={`Retirer ${getPlayerDisplayName(player)} du banc dirigeant`}
                                    >
                                      ×
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <MatchSheetField
                      format={draft.format}
                      slots={activeSlots}
                      startersBySlot={
                        isOpponentView
                          ? draft.opponentStartersBySlot
                          : draft.startersBySlot
                      }
                      playersById={activePlayersById}
                      selectedPlayerId={activeSelectedPlayerId}
                      onSlotClick={
                        isOpponentView ? handleOpponentSlotClick : handleSlotClick
                      }
                      onClearSlot={
                        isOpponentView ? handleClearOpponentSlot : handleClearSlot
                      }
                      onSlotPositionChange={
                        isOpponentView
                          ? handleOpponentSlotPositionChange
                          : handleSlotPositionChange
                      }
                    />
                  </div>

                  <div className="rounded-[16px] border border-white/[0.16] bg-white/[0.02] p-[18px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur-[8px] md:h-[500px] md:min-h-0 md:w-[260px] md:overflow-hidden">
                    <div className="flex h-full min-h-0 flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                            Effectif
                          </p>
                          <h2 className="mt-1.5 text-sm font-semibold text-slate-100">
                            {isOpponentView
                              ? "Sélection adverse"
                              : "Sélection des joueurs"}
                          </h2>
                        </div>
                      </div>

                      <div className="-mx-[18px] mt-3 border-y border-white/10 bg-white/[0.04] px-[18px] py-2">
                        <div className="mx-2 flex items-center justify-center gap-2">
                        {[
                          { value: "team" as const, label: "Mon équipe" },
                          { value: "club" as const, label: "Joueurs du club" },
                          { value: "staff" as const, label: "Dirigeants" },
                        ].map((source) => (
                          <button
                            key={source.value}
                            type="button"
                            onClick={() =>
                              isOpponentView
                                ? setOpponentRosterSource(source.value)
                                : setRosterSource(source.value)
                            }
                            className={[
                              "px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.16em] transition",
                              activeRosterSource === source.value
                                ? "rounded-full bg-white/15 text-white shadow-[0_0_18px_rgba(217,70,239,0.28)] ring-1 ring-fuchsia-400/40"
                                : "text-slate-400 hover:text-slate-200",
                            ].join(" ")}
                          >
                            {source.label}
                          </button>
                        ))}
                        </div>
                      </div>

                      {isOpponentView && activeRosterSource === "team" ? (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              value={draft.opponentTeamCode}
                              onChange={(event) =>
                                setDraft((currentDraft) => ({
                                  ...currentDraft,
                                  opponentTeamCode: event.target.value,
                                }))
                              }
                              placeholder="Code ID équipe adverse"
                              className="w-full rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[10px] text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-violet-400/30 focus:ring-1 focus:ring-violet-400/20"
                            />
                          </div>
                          <p className="text-[10px] text-slate-400">
                            Plus tard, ce code récupérera automatiquement les joueurs si l’équipe utilise l’app. Sinon tu peux les ajouter manuellement.
                          </p>
                        </div>
                      ) : null}

                      <div className="mt-3 flex items-center gap-2">
                        <label className="relative min-w-0 flex-1">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
                          <input
                            value={
                              isOpponentView ? opponentPlayerSearch : playerSearch
                            }
                            onChange={(event) =>
                              isOpponentView
                                ? setOpponentPlayerSearch(event.target.value)
                                : setPlayerSearch(event.target.value)
                            }
                            placeholder={
                              activeRosterSource === "team"
                                ? "Rechercher un joueur"
                                : activeRosterSource === "club"
                                  ? "Rechercher un joueur du club"
                                  : "Rechercher un dirigeant"
                            }
                            className="w-full rounded-full border border-white/10 bg-white/[0.05] py-1.5 pl-8 pr-3 text-[10px] text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-violet-400/30 focus:ring-1 focus:ring-violet-400/20"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            isOpponentView
                              ? setOpponentShowManualPlayerForm((current) => !current)
                              : setShowManualPlayerForm((current) => !current)
                          }
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
                          aria-label="Ajouter un joueur"
                        >
                          +
                        </button>
                      </div>

                      <div className="mt-3 min-h-0 md:flex-1">
                        {activeShowManualPlayerForm ? (
                          <form
                            onSubmit={
                              isOpponentView
                                ? handleOpponentManualPlayerSubmit
                                : handleManualPlayerSubmit
                            }
                            className="mb-3 rounded-[20px] border border-white/10 bg-black/25 p-3"
                          >
                            <div className="grid gap-2">
                              <input
                                value={activeManualPlayerForm.firstName}
                                onChange={(event) =>
                                  isOpponentView
                                    ? setOpponentManualPlayerForm((current) => ({
                                        ...current,
                                        firstName: event.target.value,
                                      }))
                                    : setManualPlayerForm((current) => ({
                                        ...current,
                                        firstName: event.target.value,
                                      }))
                                }
                                placeholder="Nom"
                                className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
                              />
                              <input
                                value={activeManualPlayerForm.lastName}
                                onChange={(event) =>
                                  isOpponentView
                                    ? setOpponentManualPlayerForm((current) => ({
                                        ...current,
                                        lastName: event.target.value,
                                      }))
                                    : setManualPlayerForm((current) => ({
                                        ...current,
                                        lastName: event.target.value,
                                      }))
                                }
                                placeholder="Prénom"
                                className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
                              />
                              <input
                                value={activeManualPlayerForm.licenseNumber}
                                onChange={(event) =>
                                  isOpponentView
                                    ? setOpponentManualPlayerForm((current) => ({
                                        ...current,
                                        licenseNumber: event.target.value,
                                      }))
                                    : setManualPlayerForm((current) => ({
                                        ...current,
                                        licenseNumber: event.target.value,
                                      }))
                                }
                                placeholder="N° de licence"
                                className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
                              />
                            </div>
                            <div className="mt-3 flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (isOpponentView) {
                                    setOpponentShowManualPlayerForm(false);
                                    setOpponentManualPlayerForm({
                                      firstName: "",
                                      lastName: "",
                                      licenseNumber: "",
                                    });
                                    return;
                                  }
                                  setShowManualPlayerForm(false);
                                  setManualPlayerForm({
                                    firstName: "",
                                    lastName: "",
                                    licenseNumber: "",
                                  });
                                }}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:bg-white/10"
                              >
                                Annuler
                              </button>
                              <button
                                type="submit"
                                className="rounded-full border border-sky-300/30 bg-sky-500/10 px-3 py-1.5 text-[11px] font-semibold text-sky-100 transition hover:bg-sky-500/20"
                              >
                                Ajouter
                              </button>
                            </div>
                          </form>
                        ) : null}

                        {activeRosterPlayers.length > 0 ||
                        activeRosterSource === "team" ? (
                          <div className="rounded-[18px] bg-white/[0.06] p-3 backdrop-blur-sm md:flex-1 md:min-h-0 md:overflow-hidden">
                            <div className="max-h-[300px] divide-y divide-white/10 overflow-y-auto">
                              {activeFilteredRosterPlayers.map((player) => {
                                const isInSelectedSquad = (
                                  isOpponentView
                                    ? draft.opponentSelectedSquadIds
                                    : draft.selectedSquadIds
                                ).includes(player.id);
                                const isSelected =
                                  activeSelectedPlayerId === player.id;
                                const assignment = isOpponentView
                                  ? getOpponentPlayerAssignment(player.id)
                                  : getPlayerAssignment(player.id);
                                const isPlaced =
                                  assignment.type === "starter" ||
                                  assignment.type === "substitute";
                                const showPlayerInfo =
                                  activeOpenedPlayerInfoId === player.id;

                                return (
                                  <div key={player.id} className="py-2">
                                    <div className="flex items-center gap-2.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          isOpponentView
                                            ? handleOpponentRosterPlayerSelect(
                                                player.id,
                                              )
                                            : handleRosterPlayerSelect(player.id)
                                        }
                                        className={[
                                          "flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 py-0.5 text-left transition",
                                          isSelected
                                            ? "text-white"
                                            : "text-slate-300 hover:bg-white/[0.03] hover:text-slate-100",
                                        ].join(" ")}
                                      >
                                        <span
                                          className={[
                                          "inline-flex w-[136px] items-center gap-2 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition",
                                          isPlaced
                                            ? "border border-violet-300/25 bg-violet-500/10 text-slate-100"
                                          : isSelected
                                              ? "border border-fuchsia-300/25 bg-fuchsia-500/12 text-white shadow-[0_0_0_1px_rgba(217,70,239,0.06)]"
                                            : isInSelectedSquad
                                              ? "border border-white/15 bg-white/10 text-slate-100"
                                              : "border border-white/10 bg-transparent text-slate-400",
                                        ].join(" ")}
                                      >
                                          <span
                                            className={[
                                              "h-2.5 w-2.5 shrink-0 rounded-full transition",
                                              isPlaced
                                                ? "bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.95)]"
                                                : "bg-white/10",
                                            ].join(" ")}
                                          />
                                          <span className="truncate">
                                            {getRosterLineLabel(player)}
                                          </span>
                                        </span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          if (isOpponentView) {
                                            setOpponentOpenedPlayerInfoId(
                                              (current) =>
                                                current === player.id
                                                  ? null
                                                  : player.id,
                                            );
                                            return;
                                          }
                                          setOpenedPlayerInfoId((current) =>
                                            current === player.id ? null : player.id,
                                          );
                                        }}
                                        className="ml-auto shrink-0"
                                        aria-label={`Voir les infos de ${getRosterLineLabel(player)}`}
                                      >
                                        <PlayerAvatar
                                          firstName={player.first_name}
                                          lastName={player.last_name}
                                          photoUrl={player.photo_url}
                                          size="xs"
                                          className="h-5 w-5 rounded-full text-[8px]"
                                        />
                                      </button>
                                    </div>

                                    {showPlayerInfo ? (
                                      <div className="mt-2 rounded-2xl bg-white/[0.05] px-3 py-2 text-[10px] text-slate-300">
                                        <span className="font-semibold text-slate-100">
                                          {getRosterLineLabel(player)}
                                        </span>
                                        {" · "}
                                        Licence :{" "}
                                        <span className="text-slate-100">
                                          {player.license_number || "Non renseignée"}
                                        </span>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}

                              {activeFilteredRosterPlayers.length === 0 ? (
                                <div className="py-6 text-center text-[11px] text-slate-400">
                                  {isOpponentView
                                    ? "Aucun profil adverse trouvé."
                                    : "Aucun joueur trouvé."}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-400">
                            Aucun profil ajouté pour le moment. Utilise le + pour en créer un puis le placer sur le terrain.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
            </div>
          </div>

          {!isOpponentView ? (
            <div className="grid gap-6">
              <GameCardShell className="border-white/10 bg-black/25">
                <div className="flex h-full flex-col p-5 sm:p-6">
                  <div className="flex items-center gap-2">
                    <ShieldAlert
                      className="h-4 w-4 text-amber-200"
                      strokeWidth={1.8}
                    />
                    <h2 className="text-sm font-semibold text-slate-100">
                      Consignes du coach
                    </h2>
                  </div>
                  <textarea
                    value={draft.coachNotes}
                    onChange={(event) =>
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        coachNotes: event.target.value,
                      }))
                    }
                    placeholder="Exemple : pressing haut les 10 premières minutes, sortie propre côté gauche, vigilance sur les transitions."
                    className="mt-3 min-h-28 w-full rounded-[24px] border border-white/10 bg-black/25 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
                  />
                </div>
              </GameCardShell>
            </div>
          ) : null}
          </>
          ) : null}
        </div>
      )}
    </DashboardLayout>
  );
}
