"use client";

import type { CSSProperties, HTMLAttributes, PropsWithChildren } from "react";
import { neonStyle, tokens } from "@/lib/tokens";

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
  const glowReset = neonStyle(tokens.color.accent);
  const baseStyle: CSSProperties = {
    borderRadius: tokens.radius.xl,
    boxShadow: tokens.shadow.soft,
    transition: tokens.transition.normal,
    textShadow: glowReset.textShadow ? "none" : undefined,
  };

  return (
    <div
      className={`card halo-animated ${tone} p-6 transition-colors ${className}`}
      style={{ ...baseStyle, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}
