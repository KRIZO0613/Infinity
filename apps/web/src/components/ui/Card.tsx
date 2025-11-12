"use client";

import type { PropsWithChildren, HTMLAttributes } from "react";

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

  return (
    <div
      className={`card halo-animated ${tone} p-6 transition-colors ${className}`}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
}
