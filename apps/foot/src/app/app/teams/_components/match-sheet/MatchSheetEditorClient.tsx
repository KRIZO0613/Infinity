"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Mail,
  Printer,
  Search,
  Send,
  ShieldAlert,
  Trash2,
} from "lucide-react";
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
  createDefaultMatchSheetLineupDraft,
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
  MatchSheetLineupDraft,
  MatchSheetMatch,
  MatchSheetPlateauMatch,
  MatchSheetPlayer,
  MatchSheetPlayerSource,
  PlateauOfficialDraft,
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
type PlateauRosterSource = "team" | "club" | "staff";
type PlateauMainTab = "composition" | "sheet" | "result";
type PlateauResultTab = "score" | "signature" | "transmit";

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

type PlateauTeamTab = {
  key: string;
  name: string;
  isOwnTeam: boolean;
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

const shortDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function drawNormalizedSignatureImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const bufferCanvas = document.createElement("canvas");
  bufferCanvas.width = width;
  bufferCanvas.height = height;

  const bufferContext = bufferCanvas.getContext("2d");
  if (!bufferContext) return;

  bufferContext.clearRect(0, 0, width, height);
  bufferContext.fillStyle = "#ffffff";
  bufferContext.fillRect(0, 0, width, height);
  bufferContext.drawImage(image, 0, 0, width, height);

  const imageData = bufferContext.getImageData(0, 0, width, height);
  const { data } = imageData;
  let darkPixels = 0;
  let brightPixels = 0;

  for (let index = 0; index < data.length; index += 16) {
    const luminance = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
    if (luminance < 90) {
      darkPixels += 1;
    } else if (luminance > 200) {
      brightPixels += 1;
    }
  }

  if (darkPixels > brightPixels) {
    for (let index = 0; index < data.length; index += 4) {
      data[index] = 255 - data[index];
      data[index + 1] = 255 - data[index + 1];
      data[index + 2] = 255 - data[index + 2];
    }
  }

  for (let index = 0; index < data.length; index += 4) {
    const luminance = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
    const ink = luminance < 190;
    data[index] = ink ? 17 : 255;
    data[index + 1] = ink ? 17 : 255;
    data[index + 2] = ink ? 17 : 255;
    data[index + 3] = 255;
  }

  bufferContext.putImageData(imageData, 0, 0);

  context.drawImage(bufferCanvas, 0, 0, width, height);
}

function SignaturePreview({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (!value) return;

    const image = new window.Image();
    image.onload = () => {
      drawNormalizedSignatureImage(context, image, canvas.width, canvas.height);
    };
    image.src = value;
  }, [value]);

  return (
    <canvas
      ref={canvasRef}
      width={224}
      height={96}
      className={className}
      style={{ backgroundColor: "#ffffff" }}
    />
  );
}

async function normalizeSignatureDataUrl(value: string) {
  if (!value) return null;

  const image = new window.Image();
  image.src = value;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Impossible de charger la signature"));
  });

  const canvas = document.createElement("canvas");
  canvas.width = 224;
  canvas.height = 96;

  const context = canvas.getContext("2d");
  if (!context) return null;

  drawNormalizedSignatureImage(context, image, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function SignaturePad({
  value,
  onChange,
}: {
  value: string;
  onChange: (nextValue: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#0b1120";
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (!value) return;

    const image = new window.Image();
    image.onload = () => {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = value;
  }, [value]);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const drawLine = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.strokeStyle = "#f8fafc";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  };

  const commitSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={480}
        height={160}
        onPointerDown={(event) => {
          const point = getPoint(event);
          if (!point) return;

          drawingRef.current = true;
          lastPointRef.current = point;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drawingRef.current) return;

          const point = getPoint(event);
          const lastPoint = lastPointRef.current;
          if (!point || !lastPoint) return;

          drawLine(lastPoint, point);
          lastPointRef.current = point;
        }}
        onPointerUp={(event) => {
          if (!drawingRef.current) return;

          drawingRef.current = false;
          lastPointRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          commitSignature();
        }}
        onPointerLeave={() => {
          drawingRef.current = false;
          lastPointRef.current = null;
        }}
        className="h-40 w-full rounded-[24px] border border-white/10 bg-slate-950 touch-none"
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onChange("")}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:bg-white/10"
        >
          Effacer
        </button>
      </div>
    </div>
  );
}

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

function isRetryableLoadError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("load failed") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror")
  );
}

async function retryAsync<T>(
  operation: () => Promise<T>,
  retries = 1,
  delayMs = 250,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryableLoadError(error)) {
        throw error;
      }

      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
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

function buildPlateauDayTitle(options: {
  id: string;
  name?: string;
  allDays: Array<{ id?: string }>;
}) {
  const storedNumber = options.name?.match(/(\d+)/)?.[1];
  if (storedNumber) {
    return `Plateau - Journée n°${storedNumber}`;
  }

  const fallbackIndex = options.allDays.findIndex(
    (day) => day?.id === options.id,
  );
  return `Plateau - Journée n°${Math.max(0, fallbackIndex) + 1}`;
}

function formatPlateauHeaderTitle(title: string | null) {
  if (!title?.trim()) return "Plateau - Journée";
  return title.startsWith("Plateau -") ? title : `Plateau - ${title}`;
}

function formatPlateauMetaLine(title: string | null, dateLabel: string) {
  const normalizedTitle = formatPlateauHeaderTitle(title).replace(
    "Plateau - ",
    "Plateau ",
  );

  return dateLabel ? `${normalizedTitle} - ${dateLabel}` : normalizedTitle;
}

async function loadMatchSheetMatch(teamId: string, matchId: string) {
  if (matchId.startsWith("plateau-day:")) {
    const plateauDayId = matchId.replace("plateau-day:", "");
    const plateauResponse = await supabase
      .from("championships")
      .select("data")
      .eq("team_id", teamId)
      .maybeSingle();

    if (plateauResponse.error) throw plateauResponse.error;

    const plateauData = plateauResponse.data?.data as
        | {
          plateau?: Array<{
            id?: string;
            name?: string;
            date?: string;
            time?: string;
            teams?: string[];
            matches?: Array<{
              id?: string;
              homeTeam?: string;
              awayTeam?: string;
              date?: string;
              time?: string;
              status?: "draft" | "in_progress" | "finished";
              score?: string;
            }>;
          }>;
        }
      | null
      | undefined;

    const plateauDays = Array.isArray(plateauData?.plateau)
      ? plateauData.plateau
      : [];
    const dayIndex = plateauDays.findIndex((day) => day?.id === plateauDayId);
    const selectedDay = dayIndex >= 0 ? plateauDays[dayIndex] : null;

    if (!selectedDay || typeof selectedDay.date !== "string") {
      return null;
    }

    const base = new Date(selectedDay.date);
    if (!Number.isNaN(base.getTime())) {
      const [hoursRaw, minutesRaw] = (selectedDay.time || "10:00").split(":");
      const hours = Number(hoursRaw);
      const minutes = Number(minutesRaw);
      base.setHours(
        Number.isNaN(hours) ? 10 : hours,
        Number.isNaN(minutes) ? 0 : minutes,
        0,
        0,
      );
    }

    const teams =
      Array.isArray(selectedDay.teams) && selectedDay.teams.length > 0
        ? selectedDay.teams.filter(
            (teamName): teamName is string =>
              typeof teamName === "string" && teamName.trim().length > 0,
          )
        : Array.from(
            new Set(
              (Array.isArray(selectedDay.matches) ? selectedDay.matches : []).flatMap(
                (match) =>
                  [match?.homeTeam, match?.awayTeam].filter(
                    (teamName): teamName is string =>
                      typeof teamName === "string" && teamName.trim().length > 0,
                  ),
              ),
            ),
          );
    const plateauMatches: MatchSheetPlateauMatch[] = Array.isArray(selectedDay.matches)
      ? selectedDay.matches.flatMap((match, index) => {
          if (
            typeof match?.homeTeam !== "string" ||
            typeof match?.awayTeam !== "string"
          ) {
            return [];
          }

          return [
            {
              id:
                typeof match.id === "string"
                  ? match.id
                  : `plateau-match-${index + 1}`,
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              date: typeof match.date === "string" ? match.date : selectedDay.date,
              time: typeof match.time === "string" ? match.time : selectedDay.time,
              status:
                match.status === "draft" ||
                match.status === "in_progress" ||
                match.status === "finished"
                  ? match.status
                  : undefined,
              score: typeof match.score === "string" ? match.score : undefined,
            },
          ];
        })
      : [];

    return {
      id: matchId,
      title: buildPlateauDayTitle({
        id: plateauDayId,
        name: selectedDay.name,
        allDays: plateauDays,
      }),
      start_at: !Number.isNaN(base.getTime())
        ? base.toISOString()
        : selectedDay.date,
      location: null,
      status: "scheduled",
      source: "plateau-day",
      teams,
      plateauMatches,
    } satisfies MatchSheetMatch;
  }

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
  return rows.map((item) => {
    const customFields: MatchSheetPlayer["custom_fields"] = Array.isArray(
      item.custom_fields,
    )
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
                  field?.type === "select" ||
                  field?.type === "text" ||
                  field?.type === "number" ||
                  field?.type === "date"
                ? field.type
                : "text",
          order: typeof field?.order === "number" ? field.order : index + 1,
          active: typeof field?.active === "boolean" ? field.active : true,
        }))
      : [];

    return {
      ...item,
      first_name: item.first_name ?? "",
      last_name: item.last_name ?? "",
      license_number: item.license_number ?? "",
      custom_fields: customFields,
      source: "team",
      jerseyNumber: getPlayerJerseyNumberFromFields(customFields),
    };
  });
}

function createManualPlayer(
  teamId: string,
  values: ManualPlayerFormState,
  source: MatchSheetPlayerSource,
  jerseyNumber = "",
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
    jerseyNumber: sanitizeJerseyNumber(jerseyNumber),
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

function normalizeTeamName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePlayerFieldLabel(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
}

function sanitizeJerseyNumber(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value).replace(/[^\d]/g, "").slice(0, 3);
}

function getPlayerJerseyNumberFromFields(
  customFields: MatchSheetPlayer["custom_fields"],
) {
  const activeFields = Array.isArray(customFields)
    ? customFields.filter((field) => field?.active !== false && field?.value)
    : [];

  const matchedField = activeFields.find((field) =>
    [
      "jerseynumber",
      "numerodemaillot",
      "numero",
      "maillot",
    ].includes(normalizePlayerFieldLabel(field.label)),
  );

  return sanitizeJerseyNumber(matchedField?.value);
}

function getBasePlayerJerseyNumber(player: MatchSheetPlayer) {
  return (
    sanitizeJerseyNumber(player.jerseyNumber) ||
    getPlayerJerseyNumberFromFields(player.custom_fields)
  );
}

function getLineupPlayerJerseyNumber(
  lineup: MatchSheetLineupDraft,
  player: MatchSheetPlayer,
) {
  if (Object.hasOwn(lineup.playerNumbersById ?? {}, player.id)) {
    return sanitizeJerseyNumber(lineup.playerNumbersById[player.id]);
  }

  return getBasePlayerJerseyNumber(player);
}

function getNextAvailableJerseyNumber(
  lineup: MatchSheetLineupDraft,
  players: MatchSheetPlayer[],
  excludedPlayerId?: string,
) {
  const usedNumbers = new Set<number>();

  players.forEach((player) => {
    if (player.id === excludedPlayerId) return;

    const jerseyNumber = getLineupPlayerJerseyNumber(lineup, player);
    const parsedNumber = Number.parseInt(jerseyNumber, 10);

    if (Number.isFinite(parsedNumber) && parsedNumber > 0) {
      usedNumbers.add(parsedNumber);
    }
  });

  for (let number = 1; number <= 99; number += 1) {
    if (!usedNumbers.has(number)) {
      return String(number);
    }
  }

  return String(players.length + 1);
}

function findDuplicateJerseyPlayer(
  lineup: MatchSheetLineupDraft,
  players: MatchSheetPlayer[],
  playerId: string,
  jerseyNumber: string,
) {
  const sanitizedNumber = sanitizeJerseyNumber(jerseyNumber);
  if (!sanitizedNumber) return null;

  return (
    players.find(
      (player) =>
        player.id !== playerId &&
        getLineupPlayerJerseyNumber(lineup, player) === sanitizedNumber,
    ) ?? null
  );
}

function buildPlateauLineupKey(teamName: string, index: number) {
  const normalized = normalizeTeamName(teamName).replace(/\s+/g, "-");
  return `plateau-lineup:${index}:${normalized || "team"}`;
}

function createDefaultPlateauOfficialDraft(): PlateauOfficialDraft {
  return {
    firstName: "",
    lastName: "",
    licenseNumber: "",
    role: "",
    club: "",
  };
}

function isPlateauOfficialComplete(official: PlateauOfficialDraft) {
  return (
    official.firstName.trim().length > 0 &&
    official.lastName.trim().length > 0 &&
    official.licenseNumber.trim().length > 0
  );
}

function isOwnPlateauTeam(teamName: string, team: TeamProfile | null) {
  if (!team) return false;

  const normalizedTeamName = normalizeTeamName(teamName);
  const aliases = buildTeamNameAliases({
    clubName: team.clubName,
    name: team.name,
    category: team.category,
    squadNumber: team.squadNumber,
    fallback: "Mon équipe",
  });

  return aliases.some((alias) => {
    const normalizedAlias = normalizeTeamName(alias);
    return (
      normalizedAlias === normalizedTeamName ||
      normalizedAlias.includes(normalizedTeamName) ||
      normalizedTeamName.includes(normalizedAlias)
    );
  });
}

function getPlateauTeamInitials(teamName: string) {
  return teamName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clampPdfLine(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function getRosterPlayerColumns(
  player: MatchSheetPlayer | null,
  rankLabel: string,
  jerseyNumber?: string,
) {
  return {
    rank: rankLabel,
    lastName: player?.last_name?.trim().toUpperCase() || "-",
    firstName: player?.first_name?.trim() || "-",
    license: player?.license_number?.trim() || "-",
    jersey: jerseyNumber?.trim() || "-",
  };
}

function getRosterStaffColumns(player: MatchSheetPlayer | null, rankLabel: string) {
  return {
    rank: rankLabel,
    lastName: player?.last_name?.trim().toUpperCase() || "-",
    firstName: player?.first_name?.trim() || "-",
    license: player?.license_number?.trim() || "-",
  };
}

export default function MatchSheetEditorClient({
  teamId,
  matchId,
}: MatchSheetEditorClientProps) {
  const router = useRouter();
  const plateauTransmitSheetRef = useRef<HTMLDivElement | null>(null);
  const plateauTransmitPreviewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const normalizedMatchId = (() => {
    try {
      return decodeURIComponent(matchId);
    } catch {
      return matchId;
    }
  })();
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
  const [activePlateauTeamKey, setActivePlateauTeamKey] = useState<string | null>(
    null,
  );
  const [activePlateauSheetTeamKey, setActivePlateauSheetTeamKey] = useState<
    string | null
  >(null);
  const [activePlateauSheetTab, setActivePlateauSheetTab] = useState<
    "team" | "official"
  >("team");
  const [openedPlateauSheetPlayerKey, setOpenedPlateauSheetPlayerKey] = useState<
    string | null
  >(null);
  const [plateauSelectedPlayerId, setPlateauSelectedPlayerId] = useState<
    string | null
  >(null);
  const [plateauRosterSource, setPlateauRosterSource] =
    useState<PlateauRosterSource>("team");
  const [plateauShowManualPlayerForm, setPlateauShowManualPlayerForm] =
    useState(false);
  const [plateauManualPlayerForm, setPlateauManualPlayerForm] =
    useState<ManualPlayerFormState>({
      firstName: "",
      lastName: "",
      licenseNumber: "",
    });
  const [plateauShowFourthSubstituteSlot, setPlateauShowFourthSubstituteSlot] =
    useState(false);
  const [plateauSidelineTab, setPlateauSidelineTab] =
    useState<MatchSheetSidelineTab>("substitutes");
  const [plateauOpenedPlayerInfoId, setPlateauOpenedPlayerInfoId] = useState<
    string | null
  >(null);
  const [plateauPlayerSearch, setPlateauPlayerSearch] = useState("");
  const [plateauMainTab, setPlateauMainTab] =
    useState<PlateauMainTab>("composition");
  const [plateauResultTab, setPlateauResultTab] =
    useState<PlateauResultTab>("score");
  const [activePlateauSignatureIndex, setActivePlateauSignatureIndex] =
    useState(0);
  const [plateauNumberErrors, setPlateauNumberErrors] = useState<
    Record<string, string | null>
  >({});
  const [plateauNumberDrafts, setPlateauNumberDrafts] = useState<
    Record<string, string>
  >({});
  const [plateauSheetErrorMessage, setPlateauSheetErrorMessage] = useState<
    string | null
  >(null);
  const [showPlateauTransmitShareMenu, setShowPlateauTransmitShareMenu] =
    useState(false);
  const [plateauTransmitPreviewHtml, setPlateauTransmitPreviewHtml] =
    useState<string | null>(null);
  const [plateauTransmitBusy, setPlateauTransmitBusy] = useState(false);

  useEffect(() => {
    if (!plateauSheetErrorMessage) return;

    const timeoutId = window.setTimeout(() => {
      setPlateauSheetErrorMessage(null);
    }, 2200);

    return () => window.clearTimeout(timeoutId);
  }, [plateauSheetErrorMessage]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setDraftReady(false);

      try {
        const [teamResult, matchResult, playersResult] = await Promise.allSettled([
          retryAsync(() => getTeamProfile(teamId)),
          retryAsync(() => loadMatchSheetMatch(teamId, normalizedMatchId)),
          retryAsync(async (): Promise<{
            data: RawPlayerRow[] | null;
            error: unknown;
          }> => {
            const response = await supabase
              .from("players")
              .select(
                "id,club_id,team_id,first_name,last_name,license_number,photo_url,custom_fields,created_at",
              )
              .eq("team_id", teamId)
              .order("created_at", { ascending: true });

            return {
              data: (response.data ?? null) as RawPlayerRow[] | null,
              error: response.error,
            };
          }),
        ]);

        const teamResponse =
          teamResult.status === "fulfilled" ? teamResult.value : null;
        if (teamResult.status === "rejected") {
          console.error(
            "Erreur chargement équipe feuille de match:",
            getErrorMessage(teamResult.reason),
          );
        }

        if (matchResult.status === "rejected") {
          throw matchResult.reason;
        }

        const playersResponse =
          playersResult.status === "fulfilled"
            ? playersResult.value
            : { data: [], error: null };
        if (playersResult.status === "rejected") {
          console.error(
            "Erreur chargement joueurs feuille de match:",
            getErrorMessage(playersResult.reason),
          );
        }

        if (playersResponse.error) {
          console.error(
            "Erreur chargement joueurs feuille de match:",
            getErrorMessage(playersResponse.error),
          );
        }

        const resolvedMatch = matchResult.value;

        if (!resolvedMatch) {
          throw new Error("Match introuvable.");
        }

        const normalizedPlayers = normalizePlayers(
          (playersResponse.data ?? []) as RawPlayerRow[],
        );
        const validPlayerIds = normalizedPlayers.map((player) => player.id);
        const fallbackFormat = teamResponse?.matchFormat ?? "foot-11";
        const storedDraft = loadMatchSheetDraft(
          teamId,
          normalizedMatchId,
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
  }, [normalizedMatchId, teamId]);

  useEffect(() => {
    if (!draftReady) return;
    saveMatchSheetDraft(teamId, normalizedMatchId, draft);
  }, [draft, draftReady, normalizedMatchId, teamId]);

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

  const plateauTeamTabs = useMemo<PlateauTeamTab[]>(() => {
    if (match?.source !== "plateau-day" || !Array.isArray(match.teams)) {
      return [];
    }

    return match.teams
      .filter(
        (teamName): teamName is string =>
          typeof teamName === "string" && teamName.trim().length > 0,
      )
      .map((teamName, index) => ({
        key: buildPlateauLineupKey(teamName, index),
        name: teamName,
        isOwnTeam: isOwnPlateauTeam(teamName, team),
      }));
  }, [match, team]);

  const activePlateauTeam =
    plateauTeamTabs.find((tab) => tab.key === activePlateauTeamKey) ??
    plateauTeamTabs[0] ??
    null;
  const activePlateauSheetTeam =
    plateauTeamTabs.find((tab) => tab.key === activePlateauSheetTeamKey) ??
    plateauTeamTabs.find((tab) => tab.isOwnTeam) ??
    plateauTeamTabs[0] ??
    null;
  const plateauValidationSummary = plateauTeamTabs.map((tab) => ({
    ...tab,
    validated: Boolean(draft.plateauLineups?.[tab.key]?.validated),
  }));
  const plateauPendingValidationSummary = plateauValidationSummary.filter(
    (entry) => !entry.validated,
  );
  const plateauMatches = Array.isArray(match?.plateauMatches)
    ? match.plateauMatches
    : [];
  const plateauAllLineupsValidated =
    plateauValidationSummary.length > 0 &&
    plateauValidationSummary.every((entry) => entry.validated);
  const plateauOfficial =
    draft.plateauOfficial ?? createDefaultPlateauOfficialDraft();
  const plateauOfficialSignature = draft.plateauOfficialSignature ?? "";
  const plateauSignatures = draft.plateauSignatures ?? {};
  const plateauResultsByMatchId = draft.plateauResults ?? {};
  const plateauAllOfficialsCompleted = isPlateauOfficialComplete(plateauOfficial);
  const plateauOfficialDisplayName =
    [plateauOfficial.firstName.trim(), plateauOfficial.lastName.trim()]
      .filter(Boolean)
      .join(" ") || "Arbitre";
  const plateauSignatureEntries = useMemo(
    () => [
      ...plateauTeamTabs.map((tab) => ({
        key: tab.key,
        name: tab.name,
        type: "team" as const,
      })),
      {
        key: "plateau-official-signature",
        name: plateauOfficialDisplayName,
        type: "official" as const,
      },
    ],
    [plateauOfficialDisplayName, plateauTeamTabs],
  );
  const plateauAllSignaturesCompleted =
    plateauTeamTabs.length > 0 &&
    plateauTeamTabs.every((teamTab) => {
      const signature = plateauSignatures[teamTab.key];
      return typeof signature === "string" && signature.trim().length > 0;
    }) &&
    plateauOfficialSignature.trim().length > 0;
  const activePlateauSignatureEntry =
    plateauSignatureEntries[activePlateauSignatureIndex] ??
    plateauSignatureEntries[0] ??
    null;
  const activePlateauLineup = activePlateauTeam
    ? draft.plateauLineups?.[activePlateauTeam.key] ??
      createDefaultMatchSheetLineupDraft(draft.format)
    : null;
  const plateauCompositionLocked = Boolean(activePlateauLineup?.validated);

  const plateauSlotPositions =
    activePlateauLineup?.slotPositionsByFormation[activePlateauLineup.formation] ??
    (activePlateauLineup
      ? createDefaultSlotPositions(activePlateauLineup.formation)
      : null);
  const plateauSlots =
    activePlateauLineup && plateauSlotPositions
      ? getMatchSheetSlots(activePlateauLineup.formation, plateauSlotPositions)
      : [];
  const plateauFormationOptions = getFormationOptionsForFormat(draft.format);
  const plateauAllPlayers = useMemo(() => {
    if (!activePlateauLineup) return [];

    const lineupPlayers = activePlateauTeam?.isOwnTeam
      ? [...players, ...activePlateauLineup.manualPlayers]
      : [...activePlateauLineup.manualPlayers];

    return lineupPlayers.map((player) => ({
      ...player,
      jerseyNumber: getLineupPlayerJerseyNumber(activePlateauLineup, player),
    }));
  }, [activePlateauLineup, activePlateauTeam?.isOwnTeam, players]);
  const plateauPlayersById = new Map(
    plateauAllPlayers.map((player) => [player.id, player]),
  );
  const plateauVisibleSubstituteSlotCount = plateauShowFourthSubstituteSlot
    ? MAX_SUBSTITUTE_SLOT_COUNT
    : DEFAULT_SUBSTITUTE_SLOT_COUNT;
  const plateauSubstituteSlots = Array.from(
    { length: plateauVisibleSubstituteSlotCount },
    (_, index) => activePlateauLineup?.substitutes[index] ?? null,
  );
  const plateauRosterPlayers = activePlateauLineup
    ? getPlayersForRosterSource(
        plateauAllPlayers,
        plateauRosterSource,
      )
    : [];
  const filteredPlateauRosterPlayers = filterRosterPlayers(
    plateauRosterPlayers,
    plateauPlayerSearch,
  );
  const plateauResultEntries = plateauMatches.map((plateauMatch) => ({
    match: plateauMatch,
    result: plateauResultsByMatchId[plateauMatch.id] ?? {
      homeScore: "",
      awayScore: "",
    },
  }));
  const plateauAllResultsFilled =
    plateauResultEntries.length > 0 &&
    plateauResultEntries.every(
      ({ result }) =>
        result.homeScore.trim().length > 0 && result.awayScore.trim().length > 0,
    );

  const updatePlateauLineup = (
    lineupKey: string,
    updater: (lineup: MatchSheetLineupDraft) => MatchSheetLineupDraft,
  ) => {
    setDraft((currentDraft) => {
      const baseLineup =
        currentDraft.plateauLineups?.[lineupKey] ??
        createDefaultMatchSheetLineupDraft(currentDraft.format);

      return {
        ...currentDraft,
        plateauLineups: {
          ...(currentDraft.plateauLineups ?? {}),
          [lineupKey]: updater(baseLineup),
        },
        plateauSheetValidated: false,
        plateauResultsValidated: false,
      };
    });
  };

  const updatePlateauOfficial = (
    updater: (official: PlateauOfficialDraft) => PlateauOfficialDraft,
  ) => {
    setDraft((currentDraft) => {
      const currentOfficial =
        currentDraft.plateauOfficial ?? createDefaultPlateauOfficialDraft();

      return {
        ...currentDraft,
        plateauOfficial: updater(currentOfficial),
        plateauSheetValidated: false,
        plateauResultsValidated: false,
      };
    });
  };

  const updatePlateauResult = (
    plateauMatchId: string,
    nextField: "homeScore" | "awayScore",
    value: string,
  ) => {
    const sanitizedValue = value.replace(/[^\d]/g, "").slice(0, 2);

    setDraft((currentDraft) => {
      const currentResult = currentDraft.plateauResults?.[plateauMatchId] ?? {
        homeScore: "",
        awayScore: "",
      };

      return {
        ...currentDraft,
        plateauResults: {
          ...(currentDraft.plateauResults ?? {}),
          [plateauMatchId]: {
            ...currentResult,
            [nextField]: sanitizedValue,
          },
        },
        plateauResultsValidated: false,
      };
    });
  };

  const getPlateauTeamTab = (teamName: string) =>
    plateauTeamTabs.find(
      (tab) => normalizeTeamName(tab.name) === normalizeTeamName(teamName),
    ) ?? null;

  const getPlateauTeamTabByKey = (teamKey: string) =>
    plateauTeamTabs.find((tab) => tab.key === teamKey) ?? null;

  const getPlateauNumberDraftKey = (teamKey: string, playerId: string) =>
    `${teamKey}:${playerId}`;

  const getPlateauSheetPlayerKey = (
    teamKey: string,
    section: "starter" | "substitute" | "staff",
    playerId: string,
  ) => `${teamKey}:${section}:${playerId}`;

  const getPlateauLineupPlayers = (
    teamTab: PlateauTeamTab,
    lineup: MatchSheetLineupDraft,
  ) =>
    (teamTab.isOwnTeam ? [...players, ...lineup.manualPlayers] : [...lineup.manualPlayers]).map(
      (player) => ({
        ...player,
        jerseyNumber: getLineupPlayerJerseyNumber(lineup, player),
      }),
    );

  const getPlateauLineupSnapshot = (teamName: string) => {
    const teamTab = getPlateauTeamTab(teamName);
    if (!teamTab) return null;

    const lineup =
      draft.plateauLineups?.[teamTab.key] ??
      createDefaultMatchSheetLineupDraft(draft.format);
    const lineupPlayers = getPlateauLineupPlayers(teamTab, lineup);
    const playersById = new Map(lineupPlayers.map((player) => [player.id, player]));
    const slots = getMatchSheetSlots(
      lineup.formation,
      lineup.slotPositionsByFormation[lineup.formation] ??
        createDefaultSlotPositions(lineup.formation),
    );

    return {
      teamTab,
      lineup,
      starters: slots
        .map((slot) => ({
          slot,
          playerId: lineup.startersBySlot[slot.id],
        }))
        .filter(
          (entry): entry is { slot: (typeof slots)[number]; playerId: string } =>
            typeof entry.playerId === "string",
        )
        .map((entry) => ({
          slotLabel: entry.slot.shortLabel,
          player:
            playersById.get(entry.playerId) ?? {
              id: entry.playerId,
              club_id: "manual",
              team_id: null,
              first_name: "",
              last_name: "Joueur",
              license_number: "",
              photo_url: null,
              custom_fields: [],
              source: "manual",
              jerseyNumber: "",
            },
        })),
      substitutes: lineup.substitutes
        .flatMap((playerId) => {
          const player = playersById.get(playerId);
          return player
            ? [
                {
                  id: player.id,
                  player,
                },
              ]
            : [];
        }),
      staffAssignments: lineup.staffAssignments
        .flatMap((playerId) => {
          const player = playersById.get(playerId);
          return player
            ? [
                {
                  id: player.id,
                  player,
                },
              ]
            : [];
        }),
    };
  };

  const getPlateauNumberError = (teamKey: string) =>
    plateauNumberErrors[teamKey] ?? null;

  const getDisplayedPlateauPlayerJerseyNumber = (
    teamKey: string,
    player: MatchSheetPlayer | { id: string; jerseyNumber?: string },
  ) => {
    const draftKey = getPlateauNumberDraftKey(teamKey, player.id);
    if (Object.hasOwn(plateauNumberDrafts, draftKey)) {
      return plateauNumberDrafts[draftKey];
    }

    return player.jerseyNumber ?? "";
  };

  useEffect(() => {
    if (!plateauTeamTabs.length) {
      setActivePlateauTeamKey(null);
      setActivePlateauSheetTeamKey(null);
      setActivePlateauSignatureIndex(0);
      return;
    }

    setActivePlateauTeamKey((currentKey) => {
      if (currentKey && plateauTeamTabs.some((tab) => tab.key === currentKey)) {
        return currentKey;
      }

      return plateauTeamTabs.find((tab) => tab.isOwnTeam)?.key ?? plateauTeamTabs[0].key;
    });
    setActivePlateauSheetTeamKey((currentKey) => {
      if (currentKey && plateauTeamTabs.some((tab) => tab.key === currentKey)) {
        return currentKey;
      }

      return plateauTeamTabs.find((tab) => tab.isOwnTeam)?.key ?? plateauTeamTabs[0].key;
    });
  }, [plateauTeamTabs]);

  useEffect(() => {
    setActivePlateauSignatureIndex((currentIndex) => {
      if (!plateauSignatureEntries.length) return 0;
      return Math.min(currentIndex, plateauSignatureEntries.length - 1);
    });
  }, [plateauSignatureEntries]);

  useEffect(() => {
    setPlateauSelectedPlayerId(null);
    setPlateauOpenedPlayerInfoId(null);
    setPlateauPlayerSearch("");
    setPlateauShowManualPlayerForm(false);
    setPlateauManualPlayerForm({
      firstName: "",
      lastName: "",
      licenseNumber: "",
    });
    setPlateauSidelineTab("substitutes");
    setPlateauRosterSource("team");
  }, [activePlateauTeamKey]);

  useEffect(() => {
    if (!activePlateauLineup) return;

    if (activePlateauLineup.substitutes.length > DEFAULT_SUBSTITUTE_SLOT_COUNT) {
      setPlateauShowFourthSubstituteSlot(true);
      return;
    }

    setPlateauShowFourthSubstituteSlot(false);
  }, [activePlateauLineup]);

  useEffect(() => {
    if (!plateauSelectedPlayerId) return;

    const stillExists = plateauAllPlayers.some(
      (player) => player.id === plateauSelectedPlayerId,
    );
    if (!stillExists) {
      setPlateauSelectedPlayerId(null);
    }
  }, [plateauAllPlayers, plateauSelectedPlayerId]);

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

  const getPlateauPlayerAssignment = (playerId: string) => {
    if (!activePlateauLineup) {
      return { type: "available" as const, label: "Libre" };
    }

    for (const slot of plateauSlots) {
      if (activePlateauLineup.startersBySlot[slot.id] === playerId) {
        return { type: "starter" as const, label: slot.shortLabel };
      }
    }

    if (activePlateauLineup.substitutes.includes(playerId)) {
      return { type: "substitute" as const, label: "Rempl." };
    }

    if (activePlateauLineup.staffAssignments.includes(playerId)) {
      return { type: "staff" as const, label: "Dir." };
    }

    return { type: "available" as const, label: "Libre" };
  };

  const handlePlateauFormationChange = (nextFormation: MatchSheetFormation) => {
    if (!activePlateauTeam) return;

    updatePlateauLineup(activePlateauTeam.key, (lineup) => {
      if (
        lineup.formation === nextFormation ||
        !isFormationCompatibleWithFormat(nextFormation, draft.format)
      ) {
        return lineup;
      }

      return {
        ...lineup,
        formation: nextFormation,
        startersBySlot: remapStartersForFormationChange(
          lineup.formation,
          nextFormation,
          lineup.startersBySlot,
        ),
        slotPositionsByFormation: {
          [nextFormation]: createDefaultSlotPositions(nextFormation),
        },
      };
    });
  };

  const handlePlateauSlotClick = (slotId: string) => {
    if (!activePlateauTeam || !activePlateauLineup) return;

    const currentPlayerId = activePlateauLineup.startersBySlot[slotId];

    if (!plateauSelectedPlayerId) {
      setPlateauSelectedPlayerId(currentPlayerId ?? null);
      return;
    }

    updatePlateauLineup(activePlateauTeam.key, (lineup) => {
      const nextStarters = { ...lineup.startersBySlot };

      Object.keys(nextStarters).forEach((key) => {
        if (nextStarters[key] === plateauSelectedPlayerId) {
          nextStarters[key] = null;
        }
      });

      nextStarters[slotId] = plateauSelectedPlayerId;

      return {
        ...lineup,
        startersBySlot: nextStarters,
        selectedSquadIds: ensurePlayerInSelectedSquad(
          lineup.selectedSquadIds,
          plateauSelectedPlayerId,
        ),
        substitutes: lineup.substitutes.filter(
          (playerId) => playerId !== plateauSelectedPlayerId,
        ),
        staffAssignments: lineup.staffAssignments.filter(
          (playerId) => playerId !== plateauSelectedPlayerId,
        ),
      };
    });

    setPlateauSelectedPlayerId(null);
  };

  const handleClearPlateauSlot = (slotId: string) => {
    if (!activePlateauTeam) return;

    updatePlateauLineup(activePlateauTeam.key, (lineup) => ({
      ...lineup,
      startersBySlot: {
        ...lineup.startersBySlot,
        [slotId]: null,
      },
    }));
  };

  const handlePlateauSlotPositionChange = (
    slotId: string,
    position: { x: number; y: number },
  ) => {
    if (!activePlateauTeam) return;

    updatePlateauLineup(activePlateauTeam.key, (lineup) => ({
      ...lineup,
      slotPositionsByFormation: {
        ...lineup.slotPositionsByFormation,
        [lineup.formation]: {
          ...(lineup.slotPositionsByFormation[lineup.formation] ??
            createDefaultSlotPositions(lineup.formation)),
          [slotId]: position,
        },
      },
    }));
  };

  const handlePlateauSubstituteSlotClick = (slotIndex: number) => {
    if (!activePlateauTeam || !activePlateauLineup) return;

    const currentPlayerId = activePlateauLineup.substitutes[slotIndex] ?? null;

    if (!plateauSelectedPlayerId) {
      setPlateauSelectedPlayerId(currentPlayerId);
      return;
    }

    updatePlateauLineup(activePlateauTeam.key, (lineup) => {
      const nextStarters = { ...lineup.startersBySlot };
      Object.keys(nextStarters).forEach((slotId) => {
        if (nextStarters[slotId] === plateauSelectedPlayerId) {
          nextStarters[slotId] = null;
        }
      });

      const nextSubstitutes = [...lineup.substitutes].filter(
        (playerId) => playerId !== plateauSelectedPlayerId,
      );
      nextSubstitutes[slotIndex] = plateauSelectedPlayerId;

      return {
        ...lineup,
        startersBySlot: nextStarters,
        selectedSquadIds: ensurePlayerInSelectedSquad(
          lineup.selectedSquadIds,
          plateauSelectedPlayerId,
        ),
        substitutes: nextSubstitutes.filter(Boolean).slice(0, MAX_SUBSTITUTE_SLOT_COUNT),
        staffAssignments: lineup.staffAssignments.filter(
          (playerId) => playerId !== plateauSelectedPlayerId,
        ),
      };
    });

    setPlateauSelectedPlayerId(null);
  };

  const handleClearPlateauSubstituteSlot = (slotIndex: number) => {
    if (!activePlateauTeam) return;

    updatePlateauLineup(activePlateauTeam.key, (lineup) => {
      const nextSubstitutes = [...lineup.substitutes];
      nextSubstitutes.splice(slotIndex, 1);

      return {
        ...lineup,
        substitutes: nextSubstitutes.slice(0, MAX_SUBSTITUTE_SLOT_COUNT),
      };
    });
  };

  const handlePlateauStaffSlotClick = (slotIndex: number) => {
    if (!activePlateauTeam || !activePlateauLineup) return;

    const currentPlayerId = activePlateauLineup.staffAssignments[slotIndex] ?? null;

    if (!plateauSelectedPlayerId) {
      setPlateauSelectedPlayerId(currentPlayerId);
      return;
    }

    updatePlateauLineup(activePlateauTeam.key, (lineup) => {
      const nextStarters = { ...lineup.startersBySlot };
      Object.keys(nextStarters).forEach((slotId) => {
        if (nextStarters[slotId] === plateauSelectedPlayerId) {
          nextStarters[slotId] = null;
        }
      });

      const nextSubstitutes = lineup.substitutes.filter(
        (playerId) => playerId !== plateauSelectedPlayerId,
      );
      const nextStaffAssignments = [...lineup.staffAssignments].filter(
        (playerId) => playerId !== plateauSelectedPlayerId,
      );
      nextStaffAssignments[slotIndex] = plateauSelectedPlayerId;

      return {
        ...lineup,
        startersBySlot: nextStarters,
        selectedSquadIds: ensurePlayerInSelectedSquad(
          lineup.selectedSquadIds,
          plateauSelectedPlayerId,
        ),
        substitutes: nextSubstitutes,
        staffAssignments: nextStaffAssignments.filter(Boolean).slice(0, 3),
      };
    });

    setPlateauSelectedPlayerId(null);
  };

  const handleClearPlateauStaffSlot = (slotIndex: number) => {
    if (!activePlateauTeam) return;

    updatePlateauLineup(activePlateauTeam.key, (lineup) => {
      const nextStaffAssignments = [...lineup.staffAssignments];
      nextStaffAssignments.splice(slotIndex, 1);

      return {
        ...lineup,
        staffAssignments: nextStaffAssignments.slice(0, 3),
      };
    });
  };

  const handlePlateauRosterPlayerSelect = (playerId: string) => {
    if (!activePlateauTeam) return;

    updatePlateauLineup(activePlateauTeam.key, (lineup) => ({
      ...lineup,
      selectedSquadIds: ensurePlayerInSelectedSquad(lineup.selectedSquadIds, playerId),
    }));

    setPlateauSelectedPlayerId((currentSelected) =>
      currentSelected === playerId ? null : playerId,
    );
  };

  const handlePlateauPlayerJerseyNumberDraftChange = (
    teamKey: string,
    playerId: string,
    value: string,
  ) => {
    const sanitizedValue = sanitizeJerseyNumber(value);
    const draftKey = getPlateauNumberDraftKey(teamKey, playerId);

    setPlateauNumberDrafts((current) => ({
      ...current,
      [draftKey]: sanitizedValue,
    }));
    setPlateauNumberErrors((current) => ({
      ...current,
      [teamKey]: null,
    }));
  };

  const handlePlateauPlayerJerseyNumberChange = (
    teamKey: string,
    playerId: string,
    value: string,
  ) => {
    const teamTab = getPlateauTeamTabByKey(teamKey);
    if (!teamTab) return;

    const lineup =
      draft.plateauLineups?.[teamKey] ??
      createDefaultMatchSheetLineupDraft(draft.format);
    const lineupPlayers = getPlateauLineupPlayers(teamTab, lineup);
    const sanitizedValue = sanitizeJerseyNumber(value);
    const duplicatePlayer = findDuplicateJerseyPlayer(
      lineup,
      lineupPlayers,
      playerId,
      sanitizedValue,
    );

    if (duplicatePlayer) {
      setPlateauNumberErrors((current) => ({
        ...current,
        [teamKey]: `Le numero ${sanitizedValue} est deja utilise par ${getPlayerDisplayName(duplicatePlayer)}.`,
      }));
      return;
    }

    setPlateauNumberErrors((current) => ({
      ...current,
      [teamKey]: null,
    }));

    updatePlateauLineup(teamKey, (nextLineup) => ({
      ...nextLineup,
      manualPlayers: nextLineup.manualPlayers.map((player) =>
        player.id === playerId
          ? {
              ...player,
              jerseyNumber: sanitizedValue,
            }
          : player,
      ),
      playerNumbersById: {
        ...(nextLineup.playerNumbersById ?? {}),
        [playerId]: sanitizedValue,
      },
    }));

    setPlateauNumberDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[getPlateauNumberDraftKey(teamKey, playerId)];
      return nextDrafts;
    });
  };

  const handlePlateauManualPlayerSubmit = (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!activePlateauTeam) return;

    const hasIdentity =
      plateauManualPlayerForm.firstName.trim() ||
      plateauManualPlayerForm.lastName.trim();
    if (!hasIdentity) return;

    const nextPlayer = createManualPlayer(
      teamId,
      plateauManualPlayerForm,
      plateauRosterSource,
      getNextAvailableJerseyNumber(
        activePlateauLineup ?? createDefaultMatchSheetLineupDraft(draft.format),
        plateauAllPlayers,
      ),
    );

    updatePlateauLineup(activePlateauTeam.key, (lineup) => ({
      ...lineup,
      manualPlayers: [...lineup.manualPlayers, nextPlayer],
      selectedSquadIds: ensurePlayerInSelectedSquad(
        lineup.selectedSquadIds,
        nextPlayer.id,
      ),
    }));

    setPlateauSelectedPlayerId(nextPlayer.id);
    setPlateauManualPlayerForm({
      firstName: "",
      lastName: "",
      licenseNumber: "",
    });
    setPlateauShowManualPlayerForm(false);
  };

  const handleResetPlateauLineup = () => {
    if (!activePlateauTeam || !activePlateauLineup) return;

    updatePlateauLineup(activePlateauTeam.key, () => ({
      ...createDefaultMatchSheetLineupDraft(draft.format, activePlateauLineup.formation),
      formation: activePlateauLineup.formation,
      slotPositionsByFormation: {
        ...activePlateauLineup.slotPositionsByFormation,
      },
    }));

    setPlateauSelectedPlayerId(null);
    setPlateauOpenedPlayerInfoId(null);
    setPlateauShowManualPlayerForm(false);
    setPlateauManualPlayerForm({
      firstName: "",
      lastName: "",
      licenseNumber: "",
    });
    setPlateauNumberErrors((current) => ({
      ...current,
      [activePlateauTeam.key]: null,
    }));
    setPlateauNumberDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([draftKey]) => !draftKey.startsWith(`${activePlateauTeam.key}:`),
        ),
      ),
    );
  };

  const handlePlateauValidationToggle = () => {
    if (!activePlateauTeam) return;

    updatePlateauLineup(activePlateauTeam.key, (lineup) => ({
      ...lineup,
      validated: !lineup.validated,
    }));
  };

  const handleValidatePlateauSheet = () => {
    if (draft.plateauSheetValidated) {
      setDraft((currentDraft) => ({
        ...currentDraft,
        plateauSheetValidated: false,
      }));
      return;
    }

    if (!plateauAllLineupsValidated || !plateauAllOfficialsCompleted) {
      setActivePlateauSheetTab("official");
      setPlateauSheetErrorMessage("Renseigne l’arbitrage avant de valider");
      return;
    }

    setPlateauSheetErrorMessage(null);
    setDraft((currentDraft) => ({
      ...currentDraft,
      plateauSheetValidated: true,
    }));
  };

  const handleValidatePlateauResults = () => {
    if (
      !draft.plateauSheetValidated ||
      !plateauAllResultsFilled ||
      !plateauAllSignaturesCompleted
    ) {
      return;
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      plateauResultsValidated: true,
    }));
  };

  const buildPlateauTransmitPreviewHtml = (
    documentTitle: string,
    imageDataUrl: string,
  ) => {
    const escapedTitle = escapeHtml(documentTitle);
    return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>${escapedTitle}</title>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: white;
        color: #0f172a;
        font-family: Arial, sans-serif;
      }
      .print-shell {
        min-height: 100vh;
        padding: 16px;
        background: white;
      }
      .print-sheet {
        width: 100%;
        max-width: 210mm;
        margin: 0 auto;
      }
      .print-sheet img {
        display: block;
        width: 100%;
        height: auto;
      }
      @page {
        size: A4;
        margin: 10mm;
      }
      @media print {
        html, body {
          background: white;
        }
        .print-shell {
          padding: 0;
          background: white;
        }
        .print-sheet {
          max-width: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="print-shell">
      <div class="print-sheet">
        <img src="${imageDataUrl}" alt="${escapedTitle}" />
      </div>
    </div>
  </body>
</html>`;
  };

  const createPlateauTransmitSnapshot = async () => {
    const sheetElement = plateauTransmitSheetRef.current;
    if (!sheetElement) return null;

    const [{ default: html2canvas }] = await Promise.all([import("html2canvas")]);
    const canvas = await html2canvas(sheetElement, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
      foreignObjectRendering: true,
      onclone: (clonedDocument) => {
        const clonedSheet = clonedDocument.body.querySelector(
          "[data-plateau-transmit-sheet='true']",
        );
        if (!(clonedSheet instanceof HTMLElement)) return;

        clonedSheet
          .querySelectorAll<HTMLElement>("*")
          .forEach((element) => {
            element.style.setProperty("color", "#0f172a", "important");
            element.style.setProperty("background-color", "#ffffff", "important");
            element.style.setProperty("background-image", "none", "important");
            element.style.setProperty("box-shadow", "none", "important");
            element.style.setProperty("text-shadow", "none", "important");
            element.style.setProperty("filter", "none", "important");
          });
      },
    });

    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    };
  };

  const openPlateauTransmitPreviewModal = async () => {
    if (plateauTransmitBusy) return;

    setPlateauTransmitBusy(true);
    try {
      const snapshot = await createPlateauTransmitSnapshot();
      if (!snapshot) return;

      const html = buildPlateauTransmitPreviewHtml(
        `feuille-plateau-journee-${plateauDayNumber || "match"}`,
        snapshot.dataUrl,
      );
      setPlateauTransmitPreviewHtml(html);
    } finally {
      setPlateauTransmitBusy(false);
    }
  };

  const handlePrintPlateauTransmit = () => {
    const frameWindow = plateauTransmitPreviewFrameRef.current?.contentWindow;
    if (!frameWindow) {
      return;
    }

    frameWindow.focus();
    frameWindow.print();
  };

  const handleDownloadPlateauTransmitPdf = async () => {
    if (plateauTransmitBusy) return;

    setPlateauTransmitBusy(true);
    try {
      const [{ jsPDF }] = await Promise.all([import("jspdf")]);
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 6;
      const contentWidth = pageWidth - margin * 2;
      const gap = 4;
      const boxWidth = (contentWidth - gap) / 2;
      const boxHeight = 86;
      const scoreTableHeaderHeight = 7;
      const scoreRowHeight = 7.5;
      const labelColor = "#44403c";
      const textColor = "#1c1917";

      const teamPdfBlocks = await Promise.all(
        plateauTeamTabs.map(async (teamTab, index) => {
          const teamSnapshot = getPlateauLineupSnapshot(teamTab.name);
          const listedPlayers = [
            ...(teamSnapshot?.starters ?? []).map((entry) => entry.player),
            ...(teamSnapshot?.substitutes ?? []).map((entry) => entry.player),
          ];
          const listedStaff = (teamSnapshot?.staffAssignments ?? []).map(
            (entry) => entry.player,
          );
          const playerRows = Array.from({ length: 12 }, (_, rowIndex) => {
            const player = listedPlayers[rowIndex] ?? null;
            const jerseyNumber = player
              ? getDisplayedPlateauPlayerJerseyNumber(teamTab.key, player)
              : "";
            return getRosterPlayerColumns(player, `${rowIndex + 1}`, jerseyNumber);
          });
          const staffRows = Array.from({ length: 2 }, (_, rowIndex) => {
            const staffMember = listedStaff[rowIndex] ?? null;
            return getRosterStaffColumns(staffMember, `D${rowIndex + 1}`);
          });

          return {
            index,
            label: index === 0 ? "1er club" : index === 1 ? "2eme club" : "3eme club",
            name: teamTab.name,
            signature: await normalizeSignatureDataUrl(plateauSignatures[teamTab.key] ?? ""),
            playerRows,
            staffRows,
          };
        }),
      );

      const officialSignature = await normalizeSignatureDataUrl(plateauOfficialSignature);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10.5);
      pdf.setTextColor(textColor);
      pdf.text("DISTRICT DU VAR DE FOOTBALL", pageWidth / 2, 10, { align: "center" });
      pdf.setFontSize(8.8);
      pdf.text(
        `1ERE PHASE : NIVEAU : ${team?.level || "-"} - POULE : -`,
        pageWidth / 2,
        15,
        { align: "center" },
      );
      pdf.text(
        `FEUILLE DE MATCH - DATE : ${plateauSheetDate}  JOURNEE N° ${plateauDayNumber || "-"}  SITE : ${plateauSiteLabel || "-"}`,
        pageWidth / 2,
        20,
        { align: "center" },
      );
      pdf.line(margin, 23, pageWidth - margin, 23);

      const drawTeamBlock = (
        block: (typeof teamPdfBlocks)[number],
        x: number,
        y: number,
      ) => {
        pdf.setDrawColor(68, 64, 60);
        pdf.setLineWidth(0.25);
        pdf.rect(x, y, boxWidth, boxHeight);

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(6.2);
        pdf.setTextColor(labelColor);
        pdf.text(block.label.toUpperCase(), x + 2, y + 4);

        pdf.setFontSize(8);
        pdf.setTextColor(textColor);
        pdf.text(clampPdfLine(block.name, 34), x + 2, y + 9);

        const signatureX = x + boxWidth - 30;
        pdf.rect(signatureX, y + 2.5, 28, 12);
        if (block.signature) {
          pdf.addImage(block.signature, "PNG", signatureX + 0.7, y + 3.1, 26.6, 10.8);
        }

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(5.2);
        pdf.setTextColor(labelColor);
        const rankX = x + 2;
        const lastNameX = x + 10;
        const firstNameX = x + 34;
        const licenseX = x + 56;
        const jerseyX = x + boxWidth - 12;
        pdf.text("N°", rankX, y + 16.2);
        pdf.text("NOM", lastNameX, y + 16.2);
        pdf.text("PRENOM", firstNameX, y + 16.2);
        pdf.text("LICENCE", licenseX, y + 16.2);
        pdf.text("MAILLOT", jerseyX, y + 16.2, { align: "right" });

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(5.85);
        pdf.setTextColor(textColor);
        let lineY = y + 20.2;
        block.playerRows.forEach((row) => {
          pdf.text(row.rank, rankX, lineY);
          pdf.text(clampPdfLine(row.lastName, 14), lastNameX, lineY, {
            maxWidth: 22,
          });
          pdf.text(clampPdfLine(row.firstName, 14), firstNameX, lineY, {
            maxWidth: 20,
          });
          pdf.text(clampPdfLine(row.license, 15), licenseX, lineY, {
            maxWidth: 20,
          });
          pdf.text(clampPdfLine(row.jersey, 4), jerseyX, lineY, { align: "right" });
          lineY += 3.8;
        });

        pdf.line(x + 2, y + 69.5, x + boxWidth - 2, y + 69.5);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(5.8);
        pdf.text("DIRIGEANTS", x + 2, y + 74);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(5.4);
        pdf.setTextColor(labelColor);
        pdf.text("NOM", lastNameX, y + 77.3);
        pdf.text("PRENOM", firstNameX, y + 77.3);
        pdf.text("LICENCE", licenseX, y + 77.3);

        pdf.setFontSize(5.85);
        pdf.setTextColor(textColor);
        [block.staffRows[0], block.staffRows[1]].forEach((row, index) => {
          const rowY = index === 0 ? y + 81.2 : y + 84.8;
          if (!row) return;
          pdf.text(row.rank, rankX, rowY);
          pdf.text(clampPdfLine(row.lastName, 14), lastNameX, rowY, {
            maxWidth: 22,
          });
          pdf.text(clampPdfLine(row.firstName, 14), firstNameX, rowY, {
            maxWidth: 20,
          });
          pdf.text(clampPdfLine(row.license, 15), licenseX, rowY, {
            maxWidth: 20,
          });
        });
      };

      const drawOfficialBlock = (x: number, y: number) => {
        pdf.setDrawColor(68, 64, 60);
        pdf.setLineWidth(0.25);
        pdf.rect(x, y, boxWidth, boxHeight);

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(6.2);
        pdf.setTextColor(labelColor);
        pdf.text("ARBITRAGE", x + 2, y + 4);

        pdf.setFontSize(7.4);
        pdf.setTextColor(textColor);
        pdf.text(clampPdfLine(plateauOfficialDisplayName, 28), x + 2, y + 10);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(5.8);
        pdf.text(`Licence : ${plateauOfficial.licenseNumber || "-"}`, x + 2, y + 18);
        pdf.text(`Rôle : ${plateauOfficial.role || "-"}`, x + 2, y + 24);
        pdf.text(`Club : ${plateauOfficial.club || "-"}`, x + 2, y + 30);

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(5.8);
        pdf.text("Signature", x + 2, y + 39);
        pdf.rect(x + 2, y + 42, boxWidth - 4, 18);
        if (officialSignature) {
          pdf.addImage(officialSignature, "PNG", x + 3, y + 43, boxWidth - 6, 16);
        }
      };

      const firstRowY = 27;
      drawTeamBlock(teamPdfBlocks[0], margin, firstRowY);
      drawTeamBlock(teamPdfBlocks[1], margin + boxWidth + gap, firstRowY);
      drawTeamBlock(teamPdfBlocks[2], margin, firstRowY + boxHeight + gap);
      drawOfficialBlock(margin + boxWidth + gap, firstRowY + boxHeight + gap);

      const tableTitleY = firstRowY + boxHeight * 2 + gap + 5;
      const tableY = tableTitleY + 3;
      const leftColWidth = 78;
      const scoreColWidth = 36;
      const rightColWidth = contentWidth - leftColWidth - scoreColWidth;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.2);
      pdf.setTextColor(labelColor);
      pdf.text("RESULTAT", margin, tableTitleY);

      pdf.rect(margin, tableY, contentWidth, scoreTableHeaderHeight + scoreRowHeight * 3);
      pdf.line(margin + leftColWidth, tableY, margin + leftColWidth, tableY + scoreTableHeaderHeight + scoreRowHeight * 3);
      pdf.line(margin + leftColWidth + scoreColWidth, tableY, margin + leftColWidth + scoreColWidth, tableY + scoreTableHeaderHeight + scoreRowHeight * 3);
      pdf.line(margin, tableY + scoreTableHeaderHeight, margin + contentWidth, tableY + scoreTableHeaderHeight);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(6);
      pdf.setTextColor(labelColor);
      pdf.text("EQUIPE", margin + 2, tableY + 4.6);
      pdf.text("SCORE", margin + leftColWidth + scoreColWidth / 2, tableY + 4.6, {
        align: "center",
      });
      pdf.text("EQUIPE", margin + leftColWidth + scoreColWidth + rightColWidth - 2, tableY + 4.6, {
        align: "right",
      });

      plateauResultEntries.forEach(({ match: plateauMatch, result }, index) => {
        const rowY = tableY + scoreTableHeaderHeight + scoreRowHeight * index;
        if (index < plateauResultEntries.length - 1) {
          pdf.line(margin, rowY + scoreRowHeight, margin + contentWidth, rowY + scoreRowHeight);
        }

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(6.4);
        pdf.setTextColor(textColor);
        pdf.text(clampPdfLine(plateauMatch.homeTeam, 28), margin + 2, rowY + 4.8);
        pdf.text(
          clampPdfLine(plateauMatch.awayTeam, 28),
          margin + leftColWidth + scoreColWidth + rightColWidth - 2,
          rowY + 4.8,
          { align: "right" },
        );
        pdf.text(
          `${result.homeScore || "-"} - ${result.awayScore || "-"}`,
          margin + leftColWidth + scoreColWidth / 2,
          rowY + 4.8,
          { align: "center" },
        );
      });

      pdf.save(`feuille-plateau-journee-${plateauDayNumber || "match"}.pdf`);
    } finally {
      setPlateauTransmitBusy(false);
    }
  };

  const buildPlateauTransmitMessage = () => {
    const lines = [
      "Feuille de match plateau",
      `${team?.name || "Equipe"} - Journee ${plateauDayNumber || "-"}`,
      `Date : ${plateauSheetDate}`,
      `Site : ${plateauSiteLabel || "-"}`,
      "La feuille complete est prete dans l'onglet Transmettre.",
    ];

    return lines.join("\n");
  };

  const handleSharePlateauTransmit = (channel: "mail" | "whatsapp") => {
    const message = buildPlateauTransmitMessage();
    setShowPlateauTransmitShareMenu(false);

    if (channel === "mail") {
      window.location.href = `mailto:?subject=${encodeURIComponent(
        "Feuille de match plateau",
      )}&body=${encodeURIComponent(message)}`;
      return;
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  };

  const updatePlateauSignature = (teamKey: string, value: string) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      plateauSignatures: {
        ...(currentDraft.plateauSignatures ?? {}),
        [teamKey]: value,
      },
      plateauResultsValidated: false,
    }));

    if (!value) return;

    const nextSignatures = {
      ...plateauSignatures,
      [teamKey]: value,
    };
    const currentIndex = plateauSignatureEntries.findIndex(
      (entry) => entry.type === "team" && entry.key === teamKey,
    );
    if (currentIndex < 0) return;

    const nextUnsignedIndex = plateauSignatureEntries.findIndex(
      (entry, index) =>
        index > currentIndex &&
        (entry.type === "official"
          ? !plateauOfficialSignature
          : !nextSignatures[entry.key]),
    );
    if (nextUnsignedIndex >= 0) {
      setActivePlateauSignatureIndex(nextUnsignedIndex);
      return;
    }

    const fallbackUnsignedIndex = plateauSignatureEntries.findIndex((entry) =>
      entry.type === "official"
        ? !plateauOfficialSignature
        : !nextSignatures[entry.key],
    );
    if (fallbackUnsignedIndex >= 0) {
      setActivePlateauSignatureIndex(fallbackUnsignedIndex);
    }
  };

  const updatePlateauOfficialSignature = (value: string) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      plateauOfficialSignature: value,
      plateauResultsValidated: false,
    }));

    if (!value) return;

    const currentIndex = plateauSignatureEntries.findIndex(
      (entry) => entry.type === "official",
    );
    if (currentIndex < 0) return;

    const fallbackUnsignedIndex = plateauSignatureEntries.findIndex(
      (entry) => entry.type === "team" && !plateauSignatures[entry.key],
    );
    if (fallbackUnsignedIndex >= 0) {
      setActivePlateauSignatureIndex(fallbackUnsignedIndex);
    }
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
  const plateauMetaLine =
    match?.source === "plateau-day"
      ? formatPlateauMetaLine(match.title ?? null, matchLabel)
      : "";
  const plateauSheetDate = match
    ? shortDateFormatter.format(new Date(match.start_at))
    : "__/__/____";
  const plateauDayNumber = match?.title?.match(/(\d+)/)?.[1] ?? "";
  const plateauSiteLabel =
    match?.location?.trim() ||
    team?.clubName?.trim() ||
    teamDisplayName ||
    "";

  if (match?.source === "plateau-day") {
    return (
      <DashboardLayout
        eyebrow=""
        title=""
        subtitle=""
      >
        <div className="grid gap-6 md:overflow-hidden">
          <div className="flex flex-wrap items-end gap-3">
            <span className="text-xl font-semibold text-stone-100">
              Feuille de match
            </span>
            <span className="ml-2 -translate-y-1 text-xs font-medium text-slate-500">
              {teamDisplayName || "Mon équipe"} · {plateauMetaLine}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/5 p-1 backdrop-blur">
            <div className="flex flex-wrap items-center gap-1">
              {[
                { value: "composition" as const, label: "Composition" },
                { value: "sheet" as const, label: "Feuille de match" },
                { value: "result" as const, label: "Résultat" },
              ].map((tab) => {
                const isActive = plateauMainTab === tab.value;

                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setPlateauMainTab(tab.value)}
                    className={[
                      "rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] transition",
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

            <button
              type="button"
              onClick={() => router.push(`/app/teams/${teamId}/match-sheet`)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
              Retour aux matchs
            </button>
          </div>

          {plateauMainTab === "sheet" ? (
            <div className="space-y-4">
              {!plateauAllLineupsValidated &&
              plateauPendingValidationSummary.length > 0 ? (
                <GameCardShell className="border-amber-400/20 bg-amber-500/5">
                  <div className="p-5 sm:p-6">
                    <p className="text-[11px] uppercase tracking-[0.28em] text-amber-200/80">
                      Validation compositions
                    </p>
                    <h2 className="mt-3 text-lg font-semibold text-slate-100">
                      Compositions encore en attente
                    </h2>
                    <div className="mt-4 space-y-2">
                      {plateauPendingValidationSummary.map((entry) => (
                        <div
                          key={entry.key}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
                        >
                          <span className="text-sm font-semibold text-slate-100">
                            {entry.name}
                          </span>
                          <span className="rounded-full border border-amber-300/30 bg-amber-500/15 px-3 py-1 text-[11px] font-semibold text-amber-100">
                            Pas encore validée
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </GameCardShell>
              ) : null}

              {plateauAllLineupsValidated ? (
                <>
                  <div className="space-y-6">
                    <div className="relative space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                          {plateauTeamTabs.map((teamTab) => {
                            const isActive =
                              activePlateauSheetTab === "team" &&
                              activePlateauSheetTeam?.key === teamTab.key;
                            return (
                              <button
                                key={`${teamTab.key}-sheet`}
                                type="button"
                                onClick={() => {
                                  setActivePlateauSheetTeamKey(teamTab.key);
                                  setActivePlateauSheetTab("team");
                                }}
                                className={[
                                  "rounded-full px-4 py-2 text-xs font-semibold transition",
                                  isActive
                                    ? "bg-white/15 text-white shadow-[0_0_18px_rgba(168,85,247,0.35)] ring-1 ring-violet-400/40"
                                    : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
                                ].join(" ")}
                              >
                                {teamTab.name}
                              </button>
                            );
                          })}

                          <button
                            type="button"
                            onClick={() => setActivePlateauSheetTab("official")}
                            className={[
                              "rounded-full px-4 py-2 text-xs font-semibold transition",
                              activePlateauSheetTab === "official"
                                ? "bg-white/15 text-white shadow-[0_0_18px_rgba(168,85,247,0.35)] ring-1 ring-violet-400/40"
                                : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
                            ].join(" ")}
                          >
                            Arbitrage
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={handleValidatePlateauSheet}
                          className={[
                            "rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition",
                            draft.plateauSheetValidated
                              ? "border border-white/15 bg-white/10 text-slate-100 hover:bg-white/15"
                              : plateauAllOfficialsCompleted
                                ? "border border-fuchsia-300/35 bg-fuchsia-500/80 text-white shadow-[0_0_28px_rgba(217,70,239,0.55)] hover:bg-fuchsia-500"
                                : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
                          ].join(" ")}
                        >
                          {draft.plateauSheetValidated ? "Modifier" : "Valider"}
                        </button>
                      </div>

                      {draft.plateauSheetValidated ? (
                        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center">
                          <div className="rounded-full border border-violet-400/35 bg-violet-600 px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-[0_8px_22px_rgba(0,0,0,0.35)] backdrop-blur-sm">
                            La feuille de match est validée
                          </div>
                        </div>
                      ) : plateauSheetErrorMessage ? (
                        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center">
                          <div className="rounded-full border border-amber-300/25 bg-slate-950/60 px-5 py-2 text-sm font-semibold text-amber-100 backdrop-blur-sm">
                            {plateauSheetErrorMessage}
                          </div>
                        </div>
                      ) : null}

                      {activePlateauSheetTab === "team" && activePlateauSheetTeam ? (
                        (() => {
                          const teamSnapshot = getPlateauLineupSnapshot(
                            activePlateauSheetTeam.name,
                          );

                          return (
                            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                                <h3 className="text-base font-semibold text-slate-100">
                                  {activePlateauSheetTeam.name}
                                </h3>

                                {getPlateauNumberError(activePlateauSheetTeam.key) ? (
                                  <div className="mt-3 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[10px] font-medium text-rose-100">
                                    {getPlateauNumberError(activePlateauSheetTeam.key)}
                                  </div>
                                ) : null}

                                <div className="mt-4 space-y-4 text-sm text-slate-300">
                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                      Titulaires
                                    </p>
                                    <div className="mt-2 space-y-1.5">
                                      {teamSnapshot?.starters.length ? (
                                        teamSnapshot.starters.map((entry) => {
                                          const detailKey = getPlateauSheetPlayerKey(
                                            activePlateauSheetTeam.key,
                                            "starter",
                                            entry.player.id,
                                          );
                                          const isOpened =
                                            openedPlateauSheetPlayerKey === detailKey;

                                          return (
                                            <div key={`${activePlateauSheetTeam.key}-${entry.slotLabel}-${entry.player.id}`}>
                                              <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/20 px-3 py-2">
                                                <div className="flex min-w-0 items-center gap-3">
                                                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full border border-sky-300/25 bg-sky-400/15 px-2 text-[10px] font-bold text-sky-100">
                                                    {getDisplayedPlateauPlayerJerseyNumber(
                                                      activePlateauSheetTeam.key,
                                                      entry.player,
                                                    ) || "--"}
                                                  </span>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setOpenedPlateauSheetPlayerKey((current) =>
                                                        current === detailKey ? null : detailKey,
                                                      )
                                                    }
                                                    className="shrink-0"
                                                    aria-label={`Voir la photo de ${getPlayerDisplayName(entry.player)}`}
                                                  >
                                                    <PlayerAvatar
                                                      firstName={entry.player.first_name}
                                                      lastName={entry.player.last_name}
                                                      photoUrl={entry.player.photo_url}
                                                      size="sm"
                                                      className="h-10 w-10 rounded-xl text-xs"
                                                    />
                                                  </button>
                                                  <div className="min-w-0">
                                                    <p className="truncate font-semibold text-slate-100">
                                                      {getPlayerDisplayName(entry.player)}
                                                    </p>
                                                    <p className="truncate text-[10px] text-slate-400">
                                                      Licence:{" "}
                                                      {entry.player.license_number || "Non renseignée"}
                                                    </p>
                                                  </div>
                                                </div>
                                                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200">
                                                  {entry.slotLabel}
                                                </span>
                                              </div>

                                              {isOpened ? (
                                                <div className="mt-2 rounded-2xl bg-white/[0.05] px-3 py-3 text-[10px] text-slate-300">
                                                  <div className="flex items-start gap-3">
                                                    <PlayerAvatar
                                                      firstName={entry.player.first_name}
                                                      lastName={entry.player.last_name}
                                                      photoUrl={entry.player.photo_url}
                                                      size="lg"
                                                      className="h-16 w-16 rounded-[18px] text-sm"
                                                    />
                                                    <div className="min-w-0 flex-1 space-y-1.5">
                                                      <p className="font-semibold text-slate-100">
                                                        {getPlayerDisplayName(entry.player)}
                                                      </p>
                                                      <p>
                                                        Numéro:{" "}
                                                        <span className="text-slate-100">
                                                          {getDisplayedPlateauPlayerJerseyNumber(
                                                            activePlateauSheetTeam.key,
                                                            entry.player,
                                                          ) || "Non renseigné"}
                                                        </span>
                                                      </p>
                                                      <p>
                                                        Licence:{" "}
                                                        <span className="text-slate-100">
                                                          {entry.player.license_number || "Non renseignée"}
                                                        </span>
                                                      </p>
                                                      <p>
                                                        Poste:{" "}
                                                        <span className="text-slate-100">
                                                          {entry.slotLabel}
                                                        </span>
                                                      </p>
                                                    </div>
                                                  </div>
                                                </div>
                                              ) : null}
                                            </div>
                                          );
                                        })
                                      ) : (
                                        <div className="rounded-2xl bg-black/20 px-3 py-2 text-slate-500">
                                          Aucun titulaire renseigné.
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                      Remplaçants
                                    </p>
                                    <div className="mt-2 space-y-1.5">
                                      {teamSnapshot?.substitutes.length ? (
                                        teamSnapshot.substitutes.map((entry) => {
                                          const detailKey = getPlateauSheetPlayerKey(
                                            activePlateauSheetTeam.key,
                                            "substitute",
                                            entry.player.id,
                                          );
                                          const isOpened =
                                            openedPlateauSheetPlayerKey === detailKey;

                                          return (
                                            <div key={`${activePlateauSheetTeam.key}-sub-${entry.id}`}>
                                              <div className="flex items-center gap-3 rounded-2xl bg-black/20 px-3 py-2 text-slate-100">
                                                <span className="flex h-7 min-w-7 items-center justify-center rounded-full border border-sky-300/25 bg-sky-400/15 px-2 text-[10px] font-bold text-sky-100">
                                                  {getDisplayedPlateauPlayerJerseyNumber(
                                                    activePlateauSheetTeam.key,
                                                    entry.player,
                                                  ) || "--"}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setOpenedPlateauSheetPlayerKey((current) =>
                                                      current === detailKey ? null : detailKey,
                                                    )
                                                  }
                                                  className="shrink-0"
                                                  aria-label={`Voir la photo de ${getPlayerDisplayName(entry.player)}`}
                                                >
                                                  <PlayerAvatar
                                                    firstName={entry.player.first_name}
                                                    lastName={entry.player.last_name}
                                                    photoUrl={entry.player.photo_url}
                                                    size="sm"
                                                    className="h-10 w-10 rounded-xl text-xs"
                                                  />
                                                </button>
                                                <div className="min-w-0">
                                                  <p className="truncate font-semibold text-slate-100">
                                                    {getPlayerDisplayName(entry.player)}
                                                  </p>
                                                  <p className="truncate text-[10px] text-slate-400">
                                                    Licence:{" "}
                                                    {entry.player.license_number || "Non renseignée"}
                                                  </p>
                                                </div>
                                              </div>

                                              {isOpened ? (
                                                <div className="mt-2 rounded-2xl bg-white/[0.05] px-3 py-3 text-[10px] text-slate-300">
                                                  <div className="flex items-start gap-3">
                                                    <PlayerAvatar
                                                      firstName={entry.player.first_name}
                                                      lastName={entry.player.last_name}
                                                      photoUrl={entry.player.photo_url}
                                                      size="lg"
                                                      className="h-16 w-16 rounded-[18px] text-sm"
                                                    />
                                                    <div className="min-w-0 flex-1 space-y-1.5">
                                                      <p className="font-semibold text-slate-100">
                                                        {getPlayerDisplayName(entry.player)}
                                                      </p>
                                                      <p>
                                                        Numéro:{" "}
                                                        <span className="text-slate-100">
                                                          {getDisplayedPlateauPlayerJerseyNumber(
                                                            activePlateauSheetTeam.key,
                                                            entry.player,
                                                          ) || "Non renseigné"}
                                                        </span>
                                                      </p>
                                                      <p>
                                                        Licence:{" "}
                                                        <span className="text-slate-100">
                                                          {entry.player.license_number || "Non renseignée"}
                                                        </span>
                                                      </p>
                                                      <p className="text-slate-400">
                                                        Remplaçant
                                                      </p>
                                                    </div>
                                                  </div>
                                                </div>
                                              ) : null}
                                            </div>
                                          );
                                        })
                                      ) : (
                                        <div className="rounded-2xl bg-black/20 px-3 py-2 text-slate-500">
                                          Aucun remplaçant renseigné.
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                      Dirigeants
                                    </p>
                                    <div className="mt-2 space-y-1.5">
                                      {teamSnapshot?.staffAssignments.length ? (
                                        teamSnapshot.staffAssignments.map((entry) => {
                                          const detailKey = getPlateauSheetPlayerKey(
                                            activePlateauSheetTeam.key,
                                            "staff",
                                            entry.player.id,
                                          );
                                          const isOpened =
                                            openedPlateauSheetPlayerKey === detailKey;

                                          return (
                                            <div key={`${activePlateauSheetTeam.key}-staff-${entry.id}`}>
                                              <div className="flex items-center gap-3 rounded-2xl bg-black/20 px-3 py-2 text-slate-100">
                                                <span className="flex h-7 min-w-7 items-center justify-center rounded-full border border-sky-300/25 bg-sky-400/15 px-2 text-[10px] font-bold text-sky-100">
                                                  {getDisplayedPlateauPlayerJerseyNumber(
                                                    activePlateauSheetTeam.key,
                                                    entry.player,
                                                  ) || "--"}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setOpenedPlateauSheetPlayerKey((current) =>
                                                      current === detailKey ? null : detailKey,
                                                    )
                                                  }
                                                  className="shrink-0"
                                                  aria-label={`Voir la photo de ${getPlayerDisplayName(entry.player)}`}
                                                >
                                                  <PlayerAvatar
                                                    firstName={entry.player.first_name}
                                                    lastName={entry.player.last_name}
                                                    photoUrl={entry.player.photo_url}
                                                    size="sm"
                                                    className="h-10 w-10 rounded-xl text-xs"
                                                  />
                                                </button>
                                                <div className="min-w-0">
                                                  <p className="truncate font-semibold text-slate-100">
                                                    {getPlayerDisplayName(entry.player)}
                                                  </p>
                                                  <p className="truncate text-[10px] text-slate-400">
                                                    Licence:{" "}
                                                    {entry.player.license_number || "Non renseignée"}
                                                  </p>
                                                </div>
                                              </div>

                                              {isOpened ? (
                                                <div className="mt-2 rounded-2xl bg-white/[0.05] px-3 py-3 text-[10px] text-slate-300">
                                                  <div className="flex items-start gap-3">
                                                    <PlayerAvatar
                                                      firstName={entry.player.first_name}
                                                      lastName={entry.player.last_name}
                                                      photoUrl={entry.player.photo_url}
                                                      size="lg"
                                                      className="h-16 w-16 rounded-[18px] text-sm"
                                                    />
                                                    <div className="min-w-0 flex-1 space-y-1.5">
                                                      <p className="font-semibold text-slate-100">
                                                        {getPlayerDisplayName(entry.player)}
                                                      </p>
                                                      <p>
                                                        Numéro:{" "}
                                                        <span className="text-slate-100">
                                                          {getDisplayedPlateauPlayerJerseyNumber(
                                                            activePlateauSheetTeam.key,
                                                            entry.player,
                                                          ) || "Non renseigné"}
                                                        </span>
                                                      </p>
                                                      <p>
                                                        Licence:{" "}
                                                        <span className="text-slate-100">
                                                          {entry.player.license_number || "Non renseignée"}
                                                        </span>
                                                      </p>
                                                      <p className="text-slate-400">
                                                        Dirigeant
                                                      </p>
                                                    </div>
                                                  </div>
                                                </div>
                                              ) : null}
                                            </div>
                                          );
                                        })
                                      ) : (
                                        <div className="rounded-2xl bg-black/20 px-3 py-2 text-slate-500">
                                          Aucun dirigeant renseigné.
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                          );
                        })()
                      ) : null}

                      {activePlateauSheetTab === "official" ? (
                        <div className="rounded-[28px] border border-fuchsia-300/20 bg-fuchsia-500/5 p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-[11px] uppercase tracking-[0.28em] text-fuchsia-200/80">
                                  Arbitrage
                                </p>
                                <p className="mt-2 text-sm text-slate-300">
                                  Renseigne l’arbitre une seule fois pour la feuille de
                                  match du plateau.
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                              <input
                                value={plateauOfficial.lastName}
                                onChange={(event) =>
                                  updatePlateauOfficial((current) => ({
                                    ...current,
                                    lastName: event.target.value,
                                  }))
                                }
                                placeholder="Nom arbitre"
                                className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
                              />
                              <input
                                value={plateauOfficial.firstName}
                                onChange={(event) =>
                                  updatePlateauOfficial((current) => ({
                                    ...current,
                                    firstName: event.target.value,
                                  }))
                                }
                                placeholder="Prénom arbitre"
                                className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
                              />
                              <input
                                value={plateauOfficial.licenseNumber}
                                onChange={(event) =>
                                  updatePlateauOfficial((current) => ({
                                    ...current,
                                    licenseNumber: event.target.value,
                                  }))
                                }
                                placeholder="Licence"
                                className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
                              />
                              <input
                                value={plateauOfficial.role}
                                onChange={(event) =>
                                  updatePlateauOfficial((current) => ({
                                    ...current,
                                    role: event.target.value,
                                  }))
                                }
                                placeholder="Rôle (optionnel)"
                                className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
                              />
                              <input
                                value={plateauOfficial.club}
                                onChange={(event) =>
                                  updatePlateauOfficial((current) => ({
                                    ...current,
                                    club: event.target.value,
                                  }))
                                }
                                placeholder="Club (optionnel)"
                                className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
                              />
                            </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : (
                <GameCardShell className="border-white/10 bg-black/25">
                  <div className="p-6 sm:p-8 text-sm text-slate-400">
                    Valide d’abord toutes les compositions pour générer la feuille de
                    match complète.
                  </div>
                </GameCardShell>
              )}
            </div>
          ) : null}

          {plateauMainTab === "result" ? (
            <div className="space-y-4">
              {!draft.plateauSheetValidated ? (
                <GameCardShell className="border-white/10 bg-black/25">
                  <div className="p-6 sm:p-8 text-sm text-slate-400">
                    Valide d’abord la feuille de match pour pouvoir saisir les
                    résultats des 3 matchs du plateau.
                  </div>
                </GameCardShell>
              ) : (
                <>
                  <div className="relative space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: "score" as const, label: "Score" },
                        { value: "signature" as const, label: "Signature" },
                        { value: "transmit" as const, label: "Transmettre" },
                      ].map((tab) => {
                        const isActive = plateauResultTab === tab.value;

                        return (
                          <button
                            key={tab.value}
                            type="button"
                            onClick={() => setPlateauResultTab(tab.value)}
                            className={[
                              "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition",
                              isActive
                                ? "bg-white/15 text-white shadow-[0_0_18px_rgba(168,85,247,0.35)] ring-1 ring-violet-400/40"
                                : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
                            ].join(" ")}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>

                    {plateauAllResultsFilled && plateauAllSignaturesCompleted ? (
                      <div className="pointer-events-none absolute inset-x-0 top-12 z-10 flex justify-center">
                        <div className="rounded-full border border-violet-400/35 bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(0,0,0,0.35)] backdrop-blur-sm">
                          Scores et signatures validés
                        </div>
                      </div>
                    ) : null}

                    {plateauResultTab === "score"
                    ? plateauResultEntries.map(({ match: plateauMatch, result }, index) => (
                        <div key={plateauMatch.id} className="space-y-3">
                          <div className="flex items-center gap-2">
                            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                              Match {index + 1}
                            </p>
                            <span
                              className={[
                                "h-2 w-2 rounded-full transition",
                                result.homeScore.trim().length > 0 &&
                                result.awayScore.trim().length > 0
                                  ? "bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.95)]"
                                  : "bg-transparent",
                              ].join(" ")}
                            />
                          </div>

                          <div className="rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                {isOwnPlateauTeam(plateauMatch.homeTeam, team) ? (
                                  <NextImage
                                    src="/icons/logocclubp.png"
                                    alt={plateauMatch.homeTeam}
                                    width={36}
                                    height={36}
                                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                                  />
                                ) : (
                                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-violet-300/25 bg-violet-500/18 text-[12px] font-semibold uppercase text-violet-50 shadow-[0_0_18px_rgba(139,92,246,0.18)]">
                                    {getPlateauTeamInitials(plateauMatch.homeTeam)}
                                  </span>
                                )}
                                <span className="min-w-0 truncate text-sm font-semibold text-slate-100 md:text-left">
                                  {plateauMatch.homeTeam}
                                </span>
                              </div>
                              <div className="flex shrink-0 items-center justify-center gap-2">
                                <input
                                  value={result.homeScore}
                                  onChange={(event) =>
                                    updatePlateauResult(
                                      plateauMatch.id,
                                      "homeScore",
                                      event.target.value,
                                    )
                                  }
                                  inputMode="numeric"
                                  className="h-11 w-11 rounded-[14px] border border-white/10 bg-black/25 text-center text-base font-semibold text-slate-100 outline-none focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
                                />
                                <span className="text-base font-semibold text-slate-400">
                                  -
                                </span>
                                <input
                                  value={result.awayScore}
                                  onChange={(event) =>
                                    updatePlateauResult(
                                      plateauMatch.id,
                                      "awayScore",
                                      event.target.value,
                                    )
                                  }
                                  inputMode="numeric"
                                  className="h-11 w-11 rounded-[14px] border border-white/10 bg-black/25 text-center text-base font-semibold text-slate-100 outline-none focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
                                />
                              </div>
                              <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
                                <span className="min-w-0 truncate text-sm font-semibold text-slate-100 md:text-right">
                                  {plateauMatch.awayTeam}
                                </span>
                                {isOwnPlateauTeam(plateauMatch.awayTeam, team) ? (
                                  <NextImage
                                    src="/icons/logocclubp.png"
                                    alt={plateauMatch.awayTeam}
                                    width={36}
                                    height={36}
                                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                                  />
                                ) : (
                                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-violet-300/25 bg-violet-500/18 text-[12px] font-semibold uppercase text-violet-50 shadow-[0_0_18px_rgba(139,92,246,0.18)]">
                                    {getPlateauTeamInitials(plateauMatch.awayTeam)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    : null}

                    {plateauResultTab === "signature" ? (
                      <div className="space-y-5">
                        {activePlateauSignatureEntry ? (
                          <div>
                            <div className="flex items-center justify-between gap-3">
                              <button
                                type="button"
                                onClick={() =>
                                  setActivePlateauSignatureIndex((currentIndex) =>
                                    currentIndex <= 0
                                      ? plateauSignatureEntries.length - 1
                                      : currentIndex - 1,
                                  )
                                }
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
                                aria-label="Signature précédente"
                              >
                                <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
                              </button>

                            <div className="flex flex-1 flex-col items-center text-center">
                              <span className="text-sm font-semibold text-slate-100">
                                {activePlateauSignatureEntry.name}
                              </span>
                              <span
                                className={[
                                  "mt-2 rounded-full px-3 py-1 text-[11px] font-semibold",
                                  activePlateauSignatureEntry.type === "official"
                                    ? plateauOfficialSignature
                                    : plateauSignatures[activePlateauSignatureEntry.key]
                                    ? "border border-emerald-300/30 bg-emerald-500/15 text-emerald-100"
                                    : "border border-amber-300/30 bg-amber-500/15 text-amber-100",
                                ].join(" ")}
                              >
                                {(activePlateauSignatureEntry.type === "official"
                                  ? plateauOfficialSignature
                                  : plateauSignatures[activePlateauSignatureEntry.key])
                                  ? "Signé"
                                  : "Signature en attente"}
                              </span>
                            </div>

                              <button
                                type="button"
                                onClick={() =>
                                setActivePlateauSignatureIndex((currentIndex) =>
                                  currentIndex >= plateauSignatureEntries.length - 1
                                    ? 0
                                    : currentIndex + 1,
                                )
                                }
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
                                aria-label="Signature suivante"
                              >
                                <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
                              </button>
                            </div>

                            <div className="mt-5 rounded-[24px] border border-white/10 bg-black/20 p-4">
                              <SignaturePad
                                value={
                                  activePlateauSignatureEntry.type === "official"
                                    ? plateauOfficialSignature
                                    : plateauSignatures[activePlateauSignatureEntry.key] ?? ""
                                }
                                onChange={(nextValue) => {
                                  if (activePlateauSignatureEntry.type === "official") {
                                    updatePlateauOfficialSignature(nextValue);
                                    return;
                                  }

                                  updatePlateauSignature(
                                    activePlateauSignatureEntry.key,
                                    nextValue,
                                  );
                                }}
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {plateauResultTab === "transmit" ? (
                      <div className="space-y-4">
                        <GameCardShell className="border-fuchsia-300/20 bg-fuchsia-500/5">
                          <div className="p-6 sm:p-8">
                            <div className="space-y-6">
                            <div
                              ref={plateauTransmitSheetRef}
                              data-plateau-transmit-sheet="true"
                              className="border-2 border-stone-700 bg-white p-4 text-slate-900 shadow-[0_18px_60px_rgba(15,23,42,0.24)] sm:p-5"
                            >
                              <div className="space-y-2 border-b-2 border-stone-700 pb-4 text-center">
                                <p className="text-sm font-semibold uppercase tracking-[0.18em]">
                                  DISTRICT DU VAR DE FOOTBALL
                                </p>
                                <p className="text-[13px] font-semibold uppercase tracking-[0.14em] leading-6">
                                  1ere PHASE : NIVEAU : {team?.level || "-"} - POULE : -
                                </p>
                                <p className="text-[13px] font-semibold uppercase tracking-[0.14em] leading-6">
                                  FEUILLE DE MATCH - DATE : {plateauSheetDate} JOURNEE N°{" "}
                                  {plateauDayNumber || "-"} SITE : {plateauSiteLabel || "-"}
                                </p>
                              </div>

                              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                {plateauTeamTabs.map((teamTab, index) => {
                                  const teamSnapshot = getPlateauLineupSnapshot(teamTab.name);
                                  const listedPlayers = [
                                    ...(teamSnapshot?.starters ?? []).map((entry) => entry.player),
                                    ...(teamSnapshot?.substitutes ?? []).map((entry) => entry.player),
                                  ];
                                  const listedStaff = (teamSnapshot?.staffAssignments ?? []).map(
                                    (entry) => entry.player,
                                  );
                                  const playerRows = Array.from({ length: 12 }, (_, rowIndex) => {
                                    const player = listedPlayers[rowIndex] ?? null;
                                    const jerseyNumber = player
                                      ? getDisplayedPlateauPlayerJerseyNumber(teamTab.key, player)
                                      : "";
                                    return getRosterPlayerColumns(
                                      player,
                                      `${rowIndex + 1}`,
                                      jerseyNumber,
                                    );
                                  });
                                  const staffRows = Array.from({ length: 2 }, (_, rowIndex) => {
                                    const staffMember = listedStaff[rowIndex] ?? null;
                                    return getRosterStaffColumns(
                                      staffMember,
                                      `D${rowIndex + 1}`,
                                    );
                                  });

                                  return (
                                    <div
                                      key={`transmit-team-box-${teamTab.key}`}
                                      className={[
                                        "border border-stone-700 bg-white px-3 py-3 text-[11px]",
                                        index === 2 ? "sm:col-start-1" : "",
                                      ].join(" ")}
                                    >
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                                        {index === 0
                                          ? "1er club"
                                          : index === 1
                                            ? "2eme club"
                                            : "3eme club"}
                                      </p>
                                      <div className="mt-1 flex items-center justify-between gap-3">
                                        <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                                          {teamTab.name}
                                        </p>
                                        <div className="h-12 w-28 shrink-0 border border-stone-500 bg-[#ffffff] p-1.5">
                                          <SignaturePreview
                                            value={plateauSignatures[teamTab.key] ?? ""}
                                            className="h-full w-full bg-[#ffffff]"
                                          />
                                        </div>
                                      </div>

                                      <div className="mt-3 space-y-0.5 text-stone-800">
                                        <div className="grid grid-cols-[28px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_48px] gap-x-2 border-b border-stone-200 pb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-700">
                                          <span>N°</span>
                                          <span>Nom</span>
                                          <span>Prénom</span>
                                          <span>Licence</span>
                                          <span className="text-right">Maillot</span>
                                        </div>
                                        {playerRows.map((row, rowIndex) => (
                                          <div
                                            key={`${teamTab.key}-pdf-player-row-${rowIndex + 1}`}
                                            className="grid grid-cols-[28px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_48px] gap-x-2 text-[11px] leading-[1.2rem]"
                                          >
                                            <span>{row.rank}</span>
                                            <span className="truncate">{row.lastName}</span>
                                            <span className="truncate">{row.firstName}</span>
                                            <span className="truncate">{row.license}</span>
                                            <span className="truncate text-right">{row.jersey}</span>
                                          </div>
                                        ))}
                                      </div>

                                      <div className="mt-2 border-t border-stone-300 pt-2">
                                        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-stone-700">
                                          Dirigeants
                                        </p>
                                        <div className="mt-1 space-y-0.5 text-stone-800">
                                          <div className="grid grid-cols-[34px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 border-b border-stone-200 pb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-700">
                                            <span>N°</span>
                                            <span>Nom</span>
                                            <span>Prénom</span>
                                            <span>Licence</span>
                                          </div>
                                          {staffRows.map((row, rowIndex) => (
                                            <div
                                              key={`${teamTab.key}-pdf-staff-row-${rowIndex + 1}`}
                                              className="grid grid-cols-[34px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 text-[11px] leading-[1.2rem]"
                                            >
                                              <span>{row.rank}</span>
                                              <span className="truncate">{row.lastName}</span>
                                              <span className="truncate">{row.firstName}</span>
                                              <span className="truncate">{row.license}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}

                                <div className="border border-stone-700 bg-white px-3 py-3 text-[11px] sm:col-start-2 sm:row-start-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                                    Arbitrage
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-slate-900">
                                    {plateauOfficialDisplayName}
                                  </p>
                                  <div className="mt-2 space-y-1 text-slate-700">
                                    <p>Licence : {plateauOfficial.licenseNumber || "-"}</p>
                                    {plateauOfficial.role ? (
                                      <p>Rôle : {plateauOfficial.role}</p>
                                    ) : null}
                                    {plateauOfficial.club ? (
                                      <p>Club : {plateauOfficial.club}</p>
                                    ) : null}
                                  </div>
                                  <div className="mt-3 flex items-center gap-3">
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                                      Signature
                                    </span>
                                    <div className="h-12 w-28 border border-stone-500 bg-[#ffffff] p-1.5">
                                      <SignaturePreview
                                        value={plateauOfficialSignature}
                                        className="h-full w-full bg-[#ffffff]"
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-4">
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-700">
                                  Résultat
                                </p>
                                <div className="border border-stone-700 bg-white">
                                <div className="grid grid-cols-[minmax(0,1fr)_90px_minmax(0,1fr)] border-b border-stone-700 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                                  <div className="border-r border-stone-700 px-3 py-2">
                                    Equipe
                                  </div>
                                  <div className="border-r border-stone-700 px-3 py-2 text-center">
                                    Score
                                  </div>
                                  <div className="px-3 py-2 text-right">Equipe</div>
                                </div>

                                {plateauResultEntries.map(({ match: plateauMatch, result }) => (
                                  <div
                                    key={`transmit-match-row-${plateauMatch.id}`}
                                    className="grid grid-cols-[minmax(0,1fr)_90px_minmax(0,1fr)] border-b border-stone-300 last:border-b-0"
                                  >
                                    <div className="border-r border-stone-300 px-3 py-2 text-[11px] font-semibold text-slate-800">
                                      <p className="truncate">{plateauMatch.homeTeam}</p>
                                    </div>

                                    <div className="flex items-center justify-center border-r border-stone-300 px-3 py-2">
                                      <span className="rounded-[8px] border border-stone-500 bg-white px-2.5 py-1 text-sm font-semibold">
                                        {result.homeScore || "-"} - {result.awayScore || "-"}
                                      </span>
                                    </div>

                                    <div className="px-3 py-2 text-[11px] font-semibold text-slate-800">
                                      <p className="truncate text-right">{plateauMatch.awayTeam}</p>
                                    </div>
                                  </div>
                                ))}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-4">
                              <div>
                                <p className="text-[11px] uppercase tracking-[0.28em] text-fuchsia-200/80">
                                  Transmission
                                </p>
                                <p className="mt-2 text-sm text-slate-300">
                                  Vérifie la feuille générée puis télécharge, envoie ou imprime
                                  avant de valider les résultats.
                                </p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={handleDownloadPlateauTransmitPdf}
                                    disabled={plateauTransmitBusy}
                                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100 transition hover:bg-white/10"
                                  >
                                    <Download className="h-4 w-4" strokeWidth={1.9} />
                                    {plateauTransmitBusy ? "Generation..." : "Télécharger"}
                                  </button>
                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setShowPlateauTransmitShareMenu((current) => !current)
                                      }
                                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100 transition hover:bg-white/10"
                                    >
                                      <Send className="h-4 w-4" strokeWidth={1.9} />
                                      Envoyer
                                    </button>
                                    {showPlateauTransmitShareMenu ? (
                                      <div className="absolute left-0 top-[calc(100%+8px)] z-20 min-w-[180px] rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur">
                                        <button
                                          type="button"
                                          onClick={() => handleSharePlateauTransmit("mail")}
                                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/10"
                                        >
                                          <Mail className="h-4 w-4" strokeWidth={1.8} />
                                          Par mail
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSharePlateauTransmit("whatsapp")}
                                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/10"
                                        >
                                          <Send className="h-4 w-4" strokeWidth={1.8} />
                                          WhatsApp
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={openPlateauTransmitPreviewModal}
                                    disabled={plateauTransmitBusy}
                                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100 transition hover:bg-white/10"
                                  >
                                    <Printer className="h-4 w-4" strokeWidth={1.9} />
                                    {plateauTransmitBusy ? "Generation..." : "Imprimer"}
                                  </button>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                                  <span
                                    className={[
                                      "rounded-full px-3 py-1 font-semibold",
                                      plateauAllResultsFilled
                                        ? "border border-emerald-300/30 bg-emerald-500/15 text-emerald-100"
                                        : "border border-amber-300/30 bg-amber-500/15 text-amber-100",
                                    ].join(" ")}
                                  >
                                    {plateauAllResultsFilled
                                      ? "Scores renseignés"
                                      : "Scores en attente"}
                                  </span>
                                  <span
                                    className={[
                                      "rounded-full px-3 py-1 font-semibold",
                                      plateauAllSignaturesCompleted
                                        ? "border border-emerald-300/30 bg-emerald-500/15 text-emerald-100"
                                        : "border border-amber-300/30 bg-amber-500/15 text-amber-100",
                                    ].join(" ")}
                                  >
                                    {plateauAllSignaturesCompleted
                                      ? "Signatures complètes"
                                      : "Signatures en attente"}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={handleValidatePlateauResults}
                                disabled={
                                  !plateauAllResultsFilled ||
                                  !plateauAllSignaturesCompleted
                                }
                                className={[
                                  "rounded-full px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] transition",
                                  plateauAllResultsFilled &&
                                  plateauAllSignaturesCompleted
                                    ? "border border-fuchsia-300/35 bg-fuchsia-500/80 text-white shadow-[0_0_28px_rgba(217,70,239,0.55)] hover:bg-fuchsia-500"
                                    : "cursor-not-allowed border border-white/10 bg-white/5 text-slate-500",
                                ].join(" ")}
                              >
                                {draft.plateauResultsValidated
                                  ? "Résultats validés"
                                  : "Valider les résultats"}
                              </button>
                            </div>
                          </div>
                          </div>
                        </GameCardShell>

                        {plateauTransmitPreviewHtml ? (
                          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-black/30 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                              <div>
                                <p className="text-[11px] uppercase tracking-[0.28em] text-fuchsia-200/80">
                                  Aperçu
                                </p>
                                <p className="mt-1 text-sm text-slate-300">
                                  L’aperçu reprend la feuille sur une seule page avant impression.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={handleDownloadPlateauTransmitPdf}
                                  className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-violet-500"
                                >
                                  <Download className="h-4 w-4" strokeWidth={1.9} />
                                  Télécharger PDF
                                </button>
                                <button
                                  type="button"
                                  onClick={handlePrintPlateauTransmit}
                                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100 transition hover:bg-white/10"
                                >
                                  <Printer className="h-4 w-4" strokeWidth={1.9} />
                                  Imprimer
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPlateauTransmitPreviewHtml(null)}
                                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:bg-white/10 hover:text-white"
                                >
                                  Fermer
                                </button>
                              </div>
                            </div>
                            <div className="bg-slate-200 p-3">
                              <iframe
                                ref={plateauTransmitPreviewFrameRef}
                                title="Aperçu feuille de match plateau"
                                srcDoc={plateauTransmitPreviewHtml}
                                className="h-[820px] w-full rounded-[20px] border border-slate-300 bg-white"
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {plateauMainTab === "composition" &&
          activePlateauTeam &&
          activePlateauLineup ? (
            <div className="space-y-5">
              {plateauTeamTabs.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {plateauTeamTabs.map((tab) => {
                    const isActive = activePlateauTeam?.key === tab.key;
                    const isValidated = Boolean(
                      draft.plateauLineups?.[tab.key]?.validated,
                    );

                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActivePlateauTeamKey(tab.key)}
                        className={[
                          "rounded-full px-4 py-2 text-xs font-semibold transition",
                          isActive
                            ? "bg-white/15 text-white shadow-[0_0_18px_rgba(168,85,247,0.35)] ring-1 ring-violet-400/40"
                            : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
                        ].join(" ")}
                      >
                        {tab.name}
                        {isValidated ? " · Validée" : ""}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="grid gap-4 md:h-full md:grid-cols-[430px_260px] md:items-start lg:grid-cols-[480px_260px]">
                <div className="relative w-[360px] max-w-full sm:w-[430px] md:h-[500px] md:min-h-0 md:w-[430px] md:max-w-[430px] lg:w-[480px] lg:max-w-[480px]">
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-1">
                    <div className="pointer-events-auto">
                      <label className="inline-flex items-center gap-3 rounded-full border border-white/8 bg-white/[0.03] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100 backdrop-blur-sm">
                        <span className="text-slate-300">Système</span>
                        <select
                          value={activePlateauLineup.formation}
                          disabled={plateauCompositionLocked}
                          onChange={(event) =>
                            handlePlateauFormationChange(
                              event.target.value as MatchSheetFormation,
                            )
                          }
                          className="bg-transparent text-sm font-semibold text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {plateauFormationOptions.map((option) => (
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

                    <button
                      type="button"
                      onClick={handlePlateauValidationToggle}
                      className={[
                        "pointer-events-auto rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition",
                        activePlateauLineup.validated
                          ? "border border-white/15 bg-white/10 text-slate-100 hover:bg-white/15"
                          : "border border-fuchsia-300/35 bg-fuchsia-500/80 text-white shadow-[0_0_24px_rgba(217,70,239,0.55)] hover:bg-fuchsia-500",
                      ].join(" ")}
                    >
                      {activePlateauLineup.validated ? "Modifier" : "Valider"}
                    </button>
                  </div>

                  {activePlateauLineup.validated ? (
                    <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
                      <div className="rounded-full border border-violet-400/35 bg-violet-600 px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-[0_8px_22px_rgba(0,0,0,0.35)] backdrop-blur-sm">
                        La composition est validée
                      </div>
                    </div>
                  ) : null}

                  <div className="pointer-events-none absolute -bottom-1 left-2 right-2 z-10 rounded-[16px] border border-white/12 bg-slate-950/35 p-1 backdrop-blur-md">
                    <div
                      className={[
                        "pointer-events-auto",
                        plateauCompositionLocked ? "pointer-events-none opacity-60" : "",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2">
                        {[
                          { value: "substitutes" as const, label: "Remplaçants" },
                          { value: "staff" as const, label: "Dirigeants" },
                        ].map((tab) => (
                          <button
                            key={tab.value}
                            type="button"
                            onClick={() => setPlateauSidelineTab(tab.value)}
                            className={[
                              "rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] transition",
                              plateauSidelineTab === tab.value
                                ? "bg-white/14 text-white ring-1 ring-fuchsia-400/35"
                                : "text-slate-400 hover:text-slate-200",
                            ].join(" ")}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {plateauSidelineTab === "substitutes" ? (
                        <div className="mx-auto mt-1.5 grid max-w-[368px] grid-cols-4 gap-2">
                          {plateauSubstituteSlots.map((playerId, slotIndex) => {
                            const player = playerId
                              ? plateauPlayersById.get(playerId) ?? null
                              : null;
                            const isSelected = Boolean(
                              player && plateauSelectedPlayerId === player.id,
                            );

                            return (
                              <div key={`plateau-substitute-slot-${slotIndex}`} className="relative">
                                <button
                                  type="button"
                                  onClick={() => handlePlateauSubstituteSlotClick(slotIndex)}
                                  className={[
                                    "flex h-[48px] w-full flex-col items-center justify-center gap-0.5 rounded-[12px] border px-1 text-center transition",
                                    isSelected
                                      ? "border-fuchsia-300/40 bg-fuchsia-500/14"
                                      : player
                                        ? "border-white/15 bg-white/[0.07]"
                                        : "border-white/10 bg-black/20",
                                  ].join(" ")}
                                >
                                  {player ? (
                                    <>
                                      {player.jerseyNumber ? (
                                        <span className="absolute left-1 top-1 inline-flex min-w-[18px] items-center justify-center rounded-full border border-sky-200/80 bg-sky-100 px-1 py-0.5 text-[8px] font-bold text-sky-950 shadow-[0_0_12px_rgba(125,211,252,0.28)]">
                                          {player.jerseyNumber}
                                        </span>
                                      ) : null}
                                      <PlayerAvatar
                                        firstName={player.first_name}
                                        lastName={player.last_name}
                                        photoUrl={player.photo_url}
                                        size="xs"
                                        className="mt-1 h-4 w-4 rounded-full text-[7px]"
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
                                      handleClearPlateauSubstituteSlot(slotIndex);
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

                          {!plateauShowFourthSubstituteSlot ? (
                            <button
                              type="button"
                              onClick={() => setPlateauShowFourthSubstituteSlot(true)}
                              className="flex h-[48px] w-full items-center justify-center rounded-[12px] border border-dashed border-white/12 bg-black/20 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
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
                              activePlateauLineup.staffAssignments[index] ?? null;
                            const player = playerId
                              ? plateauPlayersById.get(playerId) ?? null
                              : null;
                            const isSelected = Boolean(
                              player && plateauSelectedPlayerId === player.id,
                            );

                            return (
                              <div key={`plateau-staff-slot-${index + 1}`} className="relative">
                                <button
                                  type="button"
                                  onClick={() => handlePlateauStaffSlotClick(index)}
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
                                      {player.jerseyNumber ? (
                                        <span className="inline-flex min-w-[18px] items-center justify-center rounded-full border border-sky-200/80 bg-sky-100 px-1 py-0.5 text-[8px] font-bold text-sky-950 shadow-[0_0_12px_rgba(125,211,252,0.28)]">
                                          {player.jerseyNumber}
                                        </span>
                                      ) : null}
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
                                      handleClearPlateauStaffSlot(index);
                                    }}
                                    className="absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/15 bg-slate-950/90 text-[8px] text-slate-300 transition hover:text-white"
                                    aria-label={`Retirer ${getPlayerDisplayName(player)} du staff`}
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
                      slots={plateauSlots}
                      startersBySlot={activePlateauLineup.startersBySlot}
                      playersById={plateauPlayersById}
                      selectedPlayerId={plateauSelectedPlayerId}
                      locked={plateauCompositionLocked}
                      onSlotClick={handlePlateauSlotClick}
                      onClearSlot={handleClearPlateauSlot}
                      onSlotPositionChange={handlePlateauSlotPositionChange}
                  />
                </div>

                <div className="rounded-[16px] border border-white/[0.16] bg-white/[0.02] p-[18px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur-[8px] md:h-[500px] md:min-h-0 md:w-[260px] md:overflow-hidden">
                  <div
                    className={[
                      "flex h-full min-h-0 flex-col",
                      plateauCompositionLocked ? "pointer-events-none opacity-60" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                          Effectif
                        </p>
                        <h2 className="mt-1.5 text-sm font-semibold text-slate-100">
                          {activePlateauTeam.isOwnTeam
                            ? "Sélection des joueurs"
                            : "Sélection adverse"}
                        </h2>
                      </div>

                      <button
                        type="button"
                        onClick={handleResetPlateauLineup}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-400/20 bg-rose-500/10 text-rose-100 transition hover:bg-rose-500/18"
                        aria-label="Supprimer l'effectif en place"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                      </button>
                    </div>

                    <div className="-mx-[18px] mt-3 border-y border-white/10 bg-white/[0.04] px-[18px] py-2">
                      <div className="mx-2 flex items-center justify-center gap-2">
                        {[
                          { value: "team" as const, label: "Joueurs" },
                          { value: "club" as const, label: "Joueurs du club" },
                          { value: "staff" as const, label: "Dirigeants" },
                        ].map((source) => (
                          <button
                            key={source.value}
                            type="button"
                            onClick={() => setPlateauRosterSource(source.value)}
                            className={[
                              "px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.16em] transition",
                              plateauRosterSource === source.value
                                ? "rounded-full bg-white/15 text-white shadow-[0_0_18px_rgba(217,70,239,0.28)] ring-1 ring-fuchsia-400/40"
                                : "text-slate-400 hover:text-slate-200",
                            ].join(" ")}
                          >
                            {source.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <label className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
                        <input
                          value={plateauPlayerSearch}
                          onChange={(event) => setPlateauPlayerSearch(event.target.value)}
                          placeholder={
                            plateauRosterSource === "team"
                              ? "Rechercher un joueur"
                              : plateauRosterSource === "club"
                                ? "Rechercher un joueur du club"
                              : "Rechercher un dirigeant"
                          }
                          className="w-full rounded-full border border-white/10 bg-white/[0.05] py-1.5 pl-8 pr-3 text-[10px] text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-violet-400/30 focus:ring-1 focus:ring-violet-400/20"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setPlateauShowManualPlayerForm((current) => !current)
                        }
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
                        aria-label="Ajouter un joueur"
                      >
                        +
                      </button>
                    </div>

                    <div className="mt-3 min-h-0 md:flex-1">
                      {plateauShowManualPlayerForm ? (
                        <form
                          onSubmit={handlePlateauManualPlayerSubmit}
                          className="mb-3 rounded-[20px] border border-white/10 bg-black/25 p-3"
                        >
                          <div className="grid gap-2">
                            <input
                              value={plateauManualPlayerForm.firstName}
                              onChange={(event) =>
                                setPlateauManualPlayerForm((current) => ({
                                  ...current,
                                  firstName: event.target.value,
                                }))
                              }
                              placeholder="Nom"
                              className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
                            />
                            <input
                              value={plateauManualPlayerForm.lastName}
                              onChange={(event) =>
                                setPlateauManualPlayerForm((current) => ({
                                  ...current,
                                  lastName: event.target.value,
                                }))
                              }
                              placeholder="Prénom"
                              className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30"
                            />
                            <input
                              value={plateauManualPlayerForm.licenseNumber}
                              onChange={(event) =>
                                setPlateauManualPlayerForm((current) => ({
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
                                setPlateauShowManualPlayerForm(false);
                                setPlateauManualPlayerForm({
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

                      {activePlateauTeam ? (
                        getPlateauNumberError(activePlateauTeam.key) ? (
                          <div className="mb-3 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[10px] font-medium text-rose-100">
                            {getPlateauNumberError(activePlateauTeam.key)}
                          </div>
                        ) : null
                      ) : null}

                      {plateauRosterPlayers.length > 0 || plateauRosterSource === "team" ? (
                        <div className="rounded-[18px] bg-white/[0.06] p-3 backdrop-blur-sm md:flex-1 md:min-h-0 md:overflow-hidden">
                          <div className="max-h-[300px] divide-y divide-white/10 overflow-y-auto">
                            {filteredPlateauRosterPlayers.map((player) => {
                              const isInSelectedSquad = activePlateauLineup.selectedSquadIds.includes(
                                player.id,
                              );
                              const isSelected = plateauSelectedPlayerId === player.id;
                              const assignment = getPlateauPlayerAssignment(player.id);
                              const isPlaced =
                                assignment.type === "starter" ||
                                assignment.type === "substitute";
                              const showPlayerInfo =
                                plateauOpenedPlayerInfoId === player.id;

                              return (
                                <div key={player.id} className="py-2">
                                  <div className="flex items-center gap-2.5">
                                    <button
                                      type="button"
                                      onClick={() => handlePlateauRosterPlayerSelect(player.id)}
                                      className={[
                                        "flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 py-0.5 text-left transition",
                                        isSelected
                                          ? "text-white"
                                          : "text-slate-300 hover:bg-white/[0.03] hover:text-slate-100",
                                      ].join(" ")}
                                    >
                                      <span
                                        className={[
                                          "inline-flex w-[168px] items-center gap-2 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition",
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

                                    <input
                                      value={getDisplayedPlateauPlayerJerseyNumber(
                                        activePlateauTeam.key,
                                        player,
                                      )}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(event) =>
                                        handlePlateauPlayerJerseyNumberDraftChange(
                                          activePlateauTeam.key,
                                          player.id,
                                          event.target.value,
                                        )
                                      }
                                      onBlur={(event) =>
                                        handlePlateauPlayerJerseyNumberChange(
                                          activePlateauTeam.key,
                                          player.id,
                                          event.target.value,
                                        )
                                      }
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          handlePlateauPlayerJerseyNumberChange(
                                            activePlateauTeam.key,
                                            player.id,
                                            event.currentTarget.value,
                                          );
                                          event.currentTarget.blur();
                                        }
                                      }}
                                      placeholder="N°"
                                      inputMode="numeric"
                                      className="w-9 shrink-0 rounded-full border border-white/15 bg-black/30 px-1.5 py-1 text-center text-[10px] font-bold text-slate-100 outline-none placeholder:text-slate-500 focus:border-fuchsia-300/70 focus:ring-1 focus:ring-fuchsia-300/40"
                                      aria-label={`Numéro de ${getRosterLineLabel(player)}`}
                                    />

                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setPlateauOpenedPlayerInfoId((current) =>
                                          current === player.id ? null : player.id,
                                        );
                                      }}
                                      className="shrink-0"
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
                                      <div className="flex items-start gap-3">
                                        <PlayerAvatar
                                          firstName={player.first_name}
                                          lastName={player.last_name}
                                          photoUrl={player.photo_url}
                                          size="lg"
                                          className="h-16 w-16 rounded-[18px] text-sm"
                                        />

                                        <div className="min-w-0 flex-1 space-y-1.5">
                                          <div>
                                            <p className="font-semibold text-slate-100">
                                              {getRosterLineLabel(player)}
                                            </p>
                                            <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500">
                                              {player.source === "team"
                                                ? "Fiche joueur"
                                                : player.source === "club"
                                                  ? "Joueur du club"
                                                  : player.source === "staff"
                                                    ? "Dirigeant"
                                                    : "Ajout manuel"}
                                            </p>
                                          </div>

                                          <div className="space-y-1 text-[10px]">
                                            <p>
                                              Licence :{" "}
                                              <span className="text-slate-100">
                                                {player.license_number || "Non renseignée"}
                                              </span>
                                            </p>
                                            <p>
                                              Équipe :{" "}
                                              <span className="text-slate-100">
                                                {activePlateauTeam.name}
                                              </span>
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="mt-2 flex items-center gap-2">
                                        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                          Numéro
                                        </span>
                                        <input
                                          value={getDisplayedPlateauPlayerJerseyNumber(
                                            activePlateauTeam.key,
                                            player,
                                          )}
                                          onChange={(event) =>
                                            handlePlateauPlayerJerseyNumberDraftChange(
                                              activePlateauTeam.key,
                                              player.id,
                                              event.target.value,
                                            )
                                          }
                                          onBlur={(event) =>
                                            handlePlateauPlayerJerseyNumberChange(
                                              activePlateauTeam.key,
                                              player.id,
                                              event.target.value,
                                            )
                                          }
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              event.preventDefault();
                                              handlePlateauPlayerJerseyNumberChange(
                                                activePlateauTeam.key,
                                                player.id,
                                                event.currentTarget.value,
                                              );
                                              event.currentTarget.blur();
                                            }
                                          }}
                                          placeholder="Auto"
                                          inputMode="numeric"
                                          className="w-16 rounded-full border border-white/15 bg-black/30 px-2 py-1 text-[10px] font-bold text-slate-100 outline-none placeholder:text-slate-500 focus:border-fuchsia-300/70 focus:ring-1 focus:ring-fuchsia-300/40"
                                        />
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}

                            {filteredPlateauRosterPlayers.length === 0 ? (
                              <div className="py-6 text-center text-[11px] text-slate-400">
                                Aucun profil trouvé. Utilise le + pour ajouter les joueurs.
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
          ) : plateauMainTab === "composition" ? (
            <GameCardShell className="border-white/10 bg-black/25">
              <div className="p-6 text-sm text-slate-300">
                Impossible de retrouver les équipes de ce plateau.
              </div>
            </GameCardShell>
          ) : null}
        </div>
      </DashboardLayout>
    );
  }

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
