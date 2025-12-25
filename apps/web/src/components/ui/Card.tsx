"use client";

import type { CSSProperties, HTMLAttributes, PropsWithChildren } from "react";
import { tokens } from "@/lib/tokens";

type CardProps = PropsWithChildren<
  {
    muted?: boolean;
  } & HTMLAttributes<HTMLDivElement>
>;

export default function Card({
  children,
  className = "",
  muted = false,
  style,
  ...props
}: CardProps) {
  const tone = muted ? "text-muted" : "text-fg";
  const baseStyle: CSSProperties = {
    borderRadius: tokens.radius.xl,
    transition: tokens.transition.normal,
  };

  return (
    <div
      className={`card surface ${tone} p-6 transition-colors ${className}`}
      style={{ ...baseStyle, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}
