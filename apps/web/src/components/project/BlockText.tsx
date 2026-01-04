"use client";

import { useMemo, type CSSProperties } from "react";
import styles from "./ProjectEditor.module.css";

type BlockTextProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  style?: CSSProperties;
  multiline?: boolean;
  sizeMin?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function BlockText({
  value,
  onChange,
  placeholder,
  className,
  style,
  multiline = false,
  sizeMin = 8,
}: BlockTextProps) {
  const safeValue = value ?? "";
  const highlightColor = style?.backgroundColor as string | undefined;

  const metrics = useMemo(() => {
    if (!multiline) return null;
    const lines = safeValue.split("\n");
    const longest = Math.max(6, ...lines.map((line) => line.length));
    const cols = clamp(longest + 2, 6, 42);
    const rows = clamp(lines.length || 1, 1, 10);
    return { cols, rows };
  }, [multiline, safeValue]);

  if (multiline) {
    const textareaStyle: CSSProperties = highlightColor
      ? { ...style, backgroundColor: "transparent" }
      : { ...style };
    if (highlightColor) {
      const wrapperStyle: CSSProperties = {
        position: "relative",
        display: "inline-block",
        textAlign: (style?.textAlign as CSSProperties["textAlign"]) ?? "left",
        width: metrics?.cols ? `${metrics.cols}ch` : undefined,
        maxWidth: "100%",
      };
      const highlightStyle: CSSProperties = {
        backgroundColor: highlightColor,
        padding: style?.padding,
        paddingRight: style?.padding ? undefined : "0.35em",
        borderRadius: style?.borderRadius,
        color: "transparent",
        font: "inherit",
        letterSpacing: "inherit",
        lineHeight: "inherit",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
        display: "inline",
        pointerEvents: "none",
      };
      return (
        <div style={wrapperStyle}>
          <span
            aria-hidden="true"
            style={highlightStyle}
            className={`${styles.projectBlockInputPlain}${className ? ` ${className}` : ""}`}
          >
            {safeValue ? `${safeValue} ` : " "}
          </span>
          <textarea
            value={safeValue}
            onChange={(event) => onChange(event.target.value)}
            className={`${styles.projectBlockInputPlain}${className ? ` ${className}` : ""}`}
            placeholder={placeholder}
            rows={metrics?.rows}
            cols={metrics?.cols}
            style={{
              ...textareaStyle,
              position: "absolute",
              inset: 0,
              zIndex: 1,
            }}
          />
        </div>
      );
    }
    return (
      <textarea
        value={safeValue}
        onChange={(event) => onChange(event.target.value)}
        className={`${styles.projectBlockInputPlain}${className ? ` ${className}` : ""}`}
        placeholder={placeholder}
        rows={metrics?.rows}
        cols={metrics?.cols}
        style={textareaStyle}
      />
    );
  }

  const size = Math.max(sizeMin, safeValue.length + 2);

  if (highlightColor) {
    const wrapperStyle: CSSProperties = {
      position: "relative",
      display: "inline-block",
      textAlign: (style?.textAlign as CSSProperties["textAlign"]) ?? "left",
      width: `${size}ch`,
      maxWidth: "100%",
    };
    const highlightStyle: CSSProperties = {
      backgroundColor: highlightColor,
      padding: style?.padding,
      paddingRight: style?.padding ? undefined : "0.35em",
      borderRadius: style?.borderRadius,
      color: "transparent",
      font: "inherit",
      letterSpacing: "inherit",
      lineHeight: "inherit",
      boxDecorationBreak: "clone",
      WebkitBoxDecorationBreak: "clone",
      whiteSpace: "pre",
      display: "inline",
      pointerEvents: "none",
    };
    return (
      <span style={wrapperStyle}>
        <span
          aria-hidden="true"
          style={highlightStyle}
          className={`${styles.projectBlockInputPlain}${className ? ` ${className}` : ""}`}
        >
          {safeValue ? `${safeValue} ` : " "}
        </span>
        <input
          type="text"
          value={safeValue}
          onChange={(event) => onChange(event.target.value)}
          className={`${styles.projectBlockInputPlain}${className ? ` ${className}` : ""}`}
          placeholder={placeholder}
          size={size}
          style={{
            ...style,
            backgroundColor: "transparent",
            position: "absolute",
            inset: 0,
            zIndex: 1,
          }}
        />
      </span>
    );
  }
  return (
    <input
      type="text"
      value={safeValue}
      onChange={(event) => onChange(event.target.value)}
      className={`${styles.projectBlockInputPlain}${className ? ` ${className}` : ""}`}
      placeholder={placeholder}
      size={size}
      style={style}
    />
  );
}
