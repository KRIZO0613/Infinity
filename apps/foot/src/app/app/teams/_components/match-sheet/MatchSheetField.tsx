"use client";

import { useEffect, useRef } from "react";
import PlayerAvatar from "@/app/app/teams/_components/PlayerAvatar";
import {
  getPlayerDisplayName,
} from "./config";
import type {
  MatchSheetFormat,
  MatchSheetPlayer,
  MatchSheetSlot,
  MatchSheetSlotPosition,
} from "./types";

type MatchSheetFieldProps = {
  format: MatchSheetFormat;
  slots: MatchSheetSlot[];
  startersBySlot: Record<string, string | null>;
  playersById: Map<string, MatchSheetPlayer>;
  selectedPlayerId: string | null;
  onSlotClick: (slotId: string) => void;
  onClearSlot: (slotId: string) => void;
  onSlotPositionChange: (
    slotId: string,
    position: MatchSheetSlotPosition,
  ) => void;
};

const roleStyles = {
  goalkeeper:
    "border-amber-300/35 bg-amber-500/10 text-amber-100",
  defender:
    "border-sky-300/30 bg-sky-500/10 text-sky-100",
  midfielder:
    "border-violet-300/35 bg-violet-500/10 text-violet-100",
  forward:
    "border-emerald-300/35 bg-emerald-500/10 text-emerald-100",
} as const;

function clampPercent(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getVisualSlotX(slot: MatchSheetSlot) {
  if (slot.role === "goalkeeper") return slot.x;
  return clampPercent(50 + (slot.x - 50) * 1.18, 7, 93);
}

function getVisualSlotY(slot: MatchSheetSlot) {
  const offset = slot.role === "goalkeeper" ? -3 : 4;
  return Math.min(slot.y + offset, 92);
}

function FieldSlot({
  slot,
  player,
  isSelected,
  onClick,
  onClear,
  onPointerDown,
  slotWidthClass,
}: {
  slot: MatchSheetSlot;
  player: MatchSheetPlayer | null;
  isSelected: boolean;
  onClick: () => void;
  onClear: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  slotWidthClass: string;
}) {
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{
        left: `${getVisualSlotX(slot)}%`,
        top: `${getVisualSlotY(slot)}%`,
      }}
    >
      <div className="relative">
        <button
          type="button"
          onClick={onClick}
          onPointerDown={onPointerDown}
          className={[
            "group flex h-full flex-col items-center justify-center gap-1 overflow-hidden rounded-[16px] border px-1 py-1 text-center shadow-[0_10px_22px_rgba(0,0,0,0.3)] backdrop-blur-md transition",
            slotWidthClass,
            player
              ? "border-white/20 bg-slate-950/75 hover:border-white/35 hover:bg-slate-950/85"
              : roleStyles[slot.role],
            isSelected ? "ring-2 ring-[#8b5cf6]/70" : "",
            "cursor-grab active:cursor-grabbing",
          ].join(" ")}
        >
          {player ? (
            <PlayerAvatar
              firstName={player.first_name}
              lastName={player.last_name}
              photoUrl={player.photo_url}
              size="xs"
              className="h-6 w-6 rounded-full text-[9px]"
            />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-current/25 bg-black/20 text-[8px] font-semibold uppercase">
              {slot.shortLabel}
            </span>
          )}

          <span className="line-clamp-2 h-[1.55rem] overflow-hidden text-[8px] font-semibold leading-tight text-slate-50 sm:h-[1.8rem] sm:text-[9px]">
            {player ? getPlayerDisplayName(player) : slot.label}
          </span>
        </button>

        {player ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClear();
            }}
            className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/15 bg-slate-950/90 text-[9px] text-slate-300 transition hover:text-white"
            aria-label={`Retirer ${getPlayerDisplayName(player)}`}
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function MatchSheetField({
  format,
  slots,
  startersBySlot,
  playersById,
  selectedPlayerId,
  onSlotClick,
  onClearSlot,
  onSlotPositionChange,
}: MatchSheetFieldProps) {
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    slotId: string;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);
  const listenersRef = useRef<{
    move: (event: PointerEvent) => void;
    up: (event: PointerEvent) => void;
  } | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const fieldHeightClass =
    format === "foot-5"
      ? "h-[280px] sm:h-[320px] md:h-[444px]"
      : format === "foot-8"
        ? "h-[300px] sm:h-[350px] md:h-[444px]"
        : "h-[320px] sm:h-[370px] md:h-[444px]";
  const slotWidthClass =
    format === "foot-5"
      ? "w-[58px] h-[62px] sm:w-[66px] sm:h-[68px]"
      : format === "foot-8"
        ? "w-[60px] h-[64px] sm:w-[70px] sm:h-[70px]"
        : "w-[64px] h-[66px] sm:w-[74px] sm:h-[72px]";

  useEffect(() => {
    return () => {
      const listeners = listenersRef.current;
      if (!listeners) return;
      window.removeEventListener("pointermove", listeners.move);
      window.removeEventListener("pointerup", listeners.up);
      window.removeEventListener("pointercancel", listeners.up);
    };
  }, []);

  const clearDragListeners = () => {
    const listeners = listenersRef.current;
    if (!listeners) return;

    window.removeEventListener("pointermove", listeners.move);
    window.removeEventListener("pointerup", listeners.up);
    window.removeEventListener("pointercancel", listeners.up);
    listenersRef.current = null;
  };

  const handleSlotPointerDown = (
    slotId: string,
    slot: MatchSheetSlot,
    _player: MatchSheetPlayer | null,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) return;

    event.preventDefault();
    const field = fieldRef.current;
    if (!field) return;

    clearDragListeners();

    const rect = field.getBoundingClientRect();
    const slotX = (getVisualSlotX(slot) / 100) * rect.width;
    const slotY = (getVisualSlotY(slot) / 100) * rect.height;

    dragStateRef.current = {
      pointerId: event.pointerId,
      slotId,
      offsetX: event.clientX - rect.left - slotX,
      offsetY: event.clientY - rect.top - slotY,
      moved: false,
    };

    const move = (moveEvent: PointerEvent) => {
      const dragState = dragStateRef.current;
      const currentField = fieldRef.current;
      if (!dragState || !currentField || dragState.pointerId !== moveEvent.pointerId) {
        return;
      }

      dragState.moved = true;

      const currentRect = currentField.getBoundingClientRect();
      const relativeX = moveEvent.clientX - currentRect.left - dragState.offsetX;
      const relativeY = moveEvent.clientY - currentRect.top - dragState.offsetY;
      const roleOffset = slot.role === "goalkeeper" ? -3 : 4;
      const xSpread = slot.role === "goalkeeper" ? 1 : 1.18;

      onSlotPositionChange(dragState.slotId, {
        x: clampPercent(
          50 + (((relativeX / currentRect.width) * 100) - 50) / xSpread,
          10,
          90,
        ),
        y: clampPercent(
          (relativeY / currentRect.height) * 100 - roleOffset,
          10,
          94,
        ),
      });
    };

    const up = (upEvent: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== upEvent.pointerId) return;

      if (dragState.moved) {
        suppressClickRef.current = dragState.slotId;
      }

      dragStateRef.current = null;
      clearDragListeners();
    };

    listenersRef.current = { move, up };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const handleSlotClick = (slotId: string) => {
    if (suppressClickRef.current === slotId) {
      suppressClickRef.current = null;
      return;
    }

    onSlotClick(slotId);
  };

  return (
    <div className="relative h-full overflow-hidden rounded-[22px] border border-emerald-200/20 bg-[linear-gradient(180deg,#14532d_0%,#166534_38%,#14532d_100%)] shadow-[0_30px_80px_rgba(0,0,0,0.42)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_30%),repeating-linear-gradient(180deg,rgba(255,255,255,0.02)_0px,rgba(255,255,255,0.02)_30px,transparent_30px,transparent_60px)]" />
      <div className="pointer-events-none absolute inset-x-[7%] top-[2%] h-[81.2%] border-[1.5px] border-white/50 border-t-0" />
      <div className="pointer-events-none absolute left-[7%] right-[7%] top-[2%] h-[1.5px] bg-white/45" />
      <div className="pointer-events-none absolute left-[7%] right-[7%] bottom-[16.8%] h-[1.5px] bg-white/45" />
      <div className="pointer-events-none absolute left-1/2 top-[2%] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/75" />
      <div className="pointer-events-none absolute left-1/2 top-[2%] h-[13%] w-[22%] -translate-x-1/2 overflow-hidden">
        <div className="absolute left-1/2 bottom-0 w-full -translate-x-1/2 aspect-square rounded-full border-[1.5px] border-white/45 opacity-90" />
      </div>

      <div className="pointer-events-none absolute left-1/2 bottom-[16.8%] h-[16%] w-[52%] -translate-x-1/2 border-[1.5px] border-b-0 border-white/45" />
      <div className="pointer-events-none absolute left-1/2 bottom-[28%] h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-white/60" />

      <div className="pointer-events-none absolute left-1/2 bottom-[16.8%] h-[6.5%] w-[22%] -translate-x-1/2 border-[1.5px] border-white/45 bg-white/[0.02]" />

      <div ref={fieldRef} className={["relative w-full touch-none", fieldHeightClass].join(" ")}>
        {slots.map((slot) => {
          const playerId = startersBySlot[slot.id];
          const player = playerId ? playersById.get(playerId) ?? null : null;

          return (
            <FieldSlot
              key={slot.id}
              slot={slot}
              player={player}
              isSelected={Boolean(player && selectedPlayerId === player.id)}
              onClick={() => handleSlotClick(slot.id)}
              onClear={() => onClearSlot(slot.id)}
              onPointerDown={(event) =>
                handleSlotPointerDown(slot.id, slot, player, event)
              }
              slotWidthClass={slotWidthClass}
            />
          );
        })}
      </div>
    </div>
  );
}
