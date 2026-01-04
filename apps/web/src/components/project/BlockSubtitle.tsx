"use client";

import type { CSSProperties } from "react";
import BlockText from "./BlockText";

type BlockSubtitleProps = {
  value: string;
  onChange: (value: string) => void;
  style?: CSSProperties;
};

export default function BlockSubtitle({ value, onChange, style }: BlockSubtitleProps) {
  return (
    <BlockText
      value={value}
      onChange={onChange}
      placeholder="Sous-titre"
      className="text-sm"
      style={style}
      sizeMin={8}
    />
  );
}
