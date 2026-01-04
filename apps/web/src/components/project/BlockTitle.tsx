"use client";

import type { CSSProperties } from "react";
import BlockText from "./BlockText";

type BlockTitleProps = {
  value: string;
  onChange: (value: string) => void;
  style?: CSSProperties;
};

export default function BlockTitle({ value, onChange, style }: BlockTitleProps) {
  return (
    <BlockText
      value={value}
      onChange={onChange}
      placeholder="Titre"
      className="text-base font-semibold"
      style={style}
      sizeMin={6}
    />
  );
}
