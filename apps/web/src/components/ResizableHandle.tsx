"use client";
import React from "react";

export type HandleDirection =
  | "tl" | "t" | "tr"
  | "r"
  | "br" | "b" | "bl"
  | "l";

export default function ResizableHandle({
  dir,
  onPointerDown,
}: {
  dir: HandleDirection;
  onPointerDown: (e: React.PointerEvent, dir: HandleDirection) => void;
}) {
  const pos = {
    tl: "top-0 left-0 -translate-x-1/2 -translate-y-1/2",
    t: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
    tr: "top-0 right-0 translate-x-1/2 -translate-y-1/2",
    r: "top-1/2 right-0 translate-x-1/2 -translate-y-1/2",
    br: "bottom-0 right-0 translate-x-1/2 translate-y-1/2",
    b: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
    bl: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2",
    l: "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2",
  }[dir];

  return (
    <div
      onPointerDown={(e) => onPointerDown(e, dir)}
      className={`
        absolute z-50 h-3 w-3 rounded-full
        bg-white border border-black 
        cursor-pointer
        ${pos}
      `}
    />
  );
}