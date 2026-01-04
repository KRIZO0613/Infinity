"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FocusEvent, KeyboardEvent, PointerEvent, ReactNode, MouseEvent } from "react";
import styles from "./StructuredList.module.css";

export type StructuredListColumnType =
  | "text"
  | "number"
  | "date"
  | "checkbox"
  | "link"
  | "image"
  | "video"
  | "select"
  | "multiselect"
  | "yesno";

export type StructuredListColumn = {
  id: string;
  label?: string;
  type: StructuredListColumnType;
  options?: Array<{
    id: string;
    label: string;
    color?: string;
  }>;
};

export type StructuredListRow = {
  id: string;
  values: Record<string, string | boolean>;
};

type StructuredListProps = {
  columns: StructuredListColumn[];
  rows: StructuredListRow[];
  onUpdateCell: (rowId: string, columnId: string, value: string | boolean) => void;
  onAddRow: () => void;
  onRemoveRow?: (rowId: string) => void;
  onMediaSelect?: (rowId: string, column: StructuredListColumn, files: FileList | null) => void;
  emptyLabel?: string;
  addLabel?: string;
  showAddButton?: boolean;
  showColumnLabels?: boolean;
  editMode?: boolean;
  onResizeColumn?: (columnId: string, width: number) => void;
  scrollerStyle?: CSSProperties;
  minListWidth?: number;
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

const isMetaType = (type: StructuredListColumnType) => type === "image" || type === "video" || type === "date";

const formatDate = (value: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const formatLink = (value: string) => {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.hostname.replace("www.", "");
  } catch {
    return value;
  }
};

export default function StructuredList({
  columns,
  rows,
  onUpdateCell,
  onAddRow,
  onRemoveRow,
  onMediaSelect,
  emptyLabel = "Aucun element pour le moment.",
  addLabel = "+ Ajouter un element",
  showAddButton = true,
  showColumnLabels = false,
  editMode = false,
  onResizeColumn,
  scrollerStyle,
  minListWidth,
}: StructuredListProps) {
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingFocusRef = useRef<{ rowId: string; cellId?: string; open?: boolean } | null>(null);
  const pendingActionRef = useRef<{ rowId: string; columnId: string; action: "toggle" } | null>(
    null,
  );
  const panRef = useRef<{
    active: boolean;
    startX: number;
    startLeft: number;
    dragged: boolean;
  }>({ active: false, startX: 0, startLeft: 0, dragged: false });
  const [resizeState, setResizeState] = useState<{
    columnId: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const layout = useMemo(() => {
    if (columns.length === 0) return { meta: null, primary: null, secondary: null, values: [] as StructuredListColumn[] };
    const ordered = [...columns];
    let meta: StructuredListColumn | null = null;
    let startIndex = 0;
    if (ordered[0] && isMetaType(ordered[0].type)) {
      meta = ordered[0];
      startIndex = 1;
    }
    const primary = ordered[startIndex] ?? null;
    const secondary = ordered[startIndex + 1] ?? null;
    const values = ordered.slice(startIndex + (primary ? 1 : 0) + (secondary ? 1 : 0));
    return { meta, primary, secondary, values };
  }, [columns]);
  const columnById = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);

  const labelFor = (column?: StructuredListColumn | null) => {
    if (!column) return "";
    return column.label?.trim() || "Champ";
  };

  const handleRowBlur = (rowId: string) => (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    if (editingRowId === rowId) setEditingRowId(null);
  };

  const handleScrollerPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        "input, textarea, select, button, a, [contenteditable='true'], [data-no-pan='true']",
      )
    ) {
      return;
    }
    const scroller = scrollerRef.current;
    if (!scroller) return;
    panRef.current.active = true;
    panRef.current.startX = event.clientX;
    panRef.current.startLeft = scroller.scrollLeft;
    panRef.current.dragged = false;
    scroller.setPointerCapture(event.pointerId);
    setIsPanning(true);
  };

  const handleScrollerPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!panRef.current.active) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const delta = event.clientX - panRef.current.startX;
    if (Math.abs(delta) > 3) {
      panRef.current.dragged = true;
    }
    scroller.scrollLeft = panRef.current.startLeft - delta;
  };

  const handleScrollerPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!panRef.current.active) return;
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.releasePointerCapture(event.pointerId);
    }
    panRef.current.active = false;
    setIsPanning(false);
    if (panRef.current.dragged) {
      window.setTimeout(() => {
        panRef.current.dragged = false;
      }, 0);
    }
  };

  const handleInputKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    setEditingRowId(null);
    (event.currentTarget as HTMLInputElement).blur();
  };

  useEffect(() => {
    if (!editingRowId) return;
    const pending = pendingFocusRef.current;
    if (!pending || pending.rowId !== editingRowId) return;
    const rowEl = rowRefs.current.get(editingRowId);
    if (!rowEl) return;
    window.requestAnimationFrame(() => {
      const scope = pending.cellId
        ? (rowEl.querySelector(`[data-cell-id="${pending.cellId}"]`) as HTMLElement | null)
        : rowEl;
      const focusTarget =
        (scope?.querySelector("input, select, textarea, [contenteditable='true']") as
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement
          | HTMLElement
          | null) ?? null;
      if (focusTarget) {
        focusTarget.focus();
        if (focusTarget instanceof HTMLInputElement) {
          focusTarget.select();
          if (pending.open && "showPicker" in focusTarget) {
            try {
              (focusTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
            } catch {
              focusTarget.click();
            }
          } else if (pending.open) {
            focusTarget.click();
          }
        }
        if (focusTarget instanceof HTMLSelectElement && pending.open) {
          focusTarget.click();
        }
      }
      pendingFocusRef.current = null;
    });
  }, [editingRowId]);

  useEffect(() => {
    if (!editingRowId) return;
    const pending = pendingActionRef.current;
    if (!pending || pending.rowId !== editingRowId) return;
    const row = rows.find((item) => item.id === pending.rowId);
    if (!row) return;
    const current = row.values[pending.columnId];
    onUpdateCell(pending.rowId, pending.columnId, !Boolean(current));
    pendingActionRef.current = null;
  }, [editingRowId, onUpdateCell, rows]);

  const resolveOption = (column: StructuredListColumn, raw: string) => {
    const value = raw.trim();
    if (!value) return null;
    const options = column.options ?? [];
    return (
      options.find((option) => option.label === value) ??
      options.find((option) => option.label.toLowerCase() === value.toLowerCase())
    );
  };

  const isAlwaysInteractiveType = (type: StructuredListColumnType) => type === "checkbox";
  const shouldShowEmptyControl = (
    column: StructuredListColumn,
    value: string | boolean | undefined,
  ) => {
    if (column.type === "checkbox") return false;
    if (
      column.type === "select" ||
      column.type === "multiselect" ||
      column.type === "yesno" ||
      column.type === "text" ||
      column.type === "number" ||
      column.type === "link" ||
      column.type === "date" ||
      column.type === "image" ||
      column.type === "video"
    ) {
      return !String(value ?? "").trim();
    }
    return false;
  };

  const renderMultiValues = (column: StructuredListColumn, raw: string) => {
    const values = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (values.length === 0) return null;
    return (
      <span className={styles.structuredValueList}>
        {values.map((item, index) => {
          const option = resolveOption(column, item);
          return (
            <span
              key={`${item}-${index}`}
              className={styles.structuredValueItem}
              style={option?.color ? { color: option.color } : undefined}
            >
              {item}
              {index < values.length - 1 && (
                <span className={styles.structuredValueSeparator}>·</span>
              )}
            </span>
          );
        })}
      </span>
    );
  };

  const renderInlineControl = (
    column: StructuredListColumn,
    value: string | boolean | undefined,
    rowId: string,
    className?: string,
  ) => {
    if (column.type === "checkbox") {
      return (
        <input
          type="checkbox"
          className={styles.structuredCheckbox}
          checked={Boolean(value)}
          onChange={(event) => onUpdateCell(rowId, column.id, event.target.checked)}
          onClick={(event) => event.stopPropagation()}
        />
      );
    }
    if (column.type === "date") {
      return (
        <input
          type="date"
          className={className ?? styles.structuredBadgeInput}
          value={String(value ?? "")}
          onChange={(event) => onUpdateCell(rowId, column.id, event.target.value)}
          onKeyDown={handleInputKey}
          onClick={(event) => event.stopPropagation()}
        />
      );
    }
    if (column.type === "number") {
      return (
        <input
          type="number"
          className={styles.structuredBadgeInput}
          value={String(value ?? "")}
          onChange={(event) => onUpdateCell(rowId, column.id, event.target.value)}
          onKeyDown={handleInputKey}
          onClick={(event) => event.stopPropagation()}
        />
      );
    }
    if (column.type === "link") {
      return (
        <input
          type="url"
          className={styles.structuredBadgeInput}
          value={String(value ?? "")}
          onChange={(event) => onUpdateCell(rowId, column.id, event.target.value)}
          onKeyDown={handleInputKey}
          onClick={(event) => event.stopPropagation()}
        />
      );
    }
    if (column.type === "text") {
      return (
        <input
          type="text"
          className={styles.structuredBadgeInput}
          value={String(value ?? "")}
          onChange={(event) => onUpdateCell(rowId, column.id, event.target.value)}
          onKeyDown={handleInputKey}
          onClick={(event) => event.stopPropagation()}
        />
      );
    }
    if (column.type === "select" || column.type === "multiselect" || column.type === "yesno") {
      return renderSelectInput(column, value, rowId);
    }
    if (column.type === "image" || column.type === "video") {
      return (
        <label className={styles.structuredMediaButton} onClick={(event) => event.stopPropagation()}>
          <span className={styles.structuredBadge}>+</span>
          <input
            type="file"
            accept={column.type === "image" ? "image/*" : "video/*"}
            onChange={(event) => {
              onMediaSelect?.(rowId, column, event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </label>
      );
    }
    return null;
  };

  const renderValue = (column: StructuredListColumn, value: string | boolean | undefined) => {
    if (column.type === "checkbox") {
      return (
        <span
          className={cx(styles.structuredBadgeDot, value ? styles.structuredBadgeDotActive : null)}
          aria-label={value ? "Oui" : "Non"}
        />
      );
    }
    if (column.type === "yesno") {
      const normalized = String(value ?? "").toLowerCase();
      const isYes = ["yes", "oui", "true", "1"].includes(normalized);
      const isNo = ["no", "non", "false", "0"].includes(normalized);
      const dotClass = isYes
        ? styles.structuredBadgeDotActive
        : isNo
          ? styles.structuredBadgeDotNegative
          : null;
      const yesOption = resolveOption(column, "Oui") ?? (column.options?.[0] ?? null);
      const noOption = resolveOption(column, "Non") ?? (column.options?.[1] ?? null);
      const dotColor = isYes ? yesOption?.color : isNo ? noOption?.color : undefined;
      return (
        <span
          className={cx(styles.structuredBadgeDot, dotClass)}
          style={dotColor ? { backgroundColor: dotColor } : undefined}
          aria-label={isYes ? "Oui" : isNo ? "Non" : "—"}
        />
      );
    }
    if (column.type === "date") {
      return <span className={styles.structuredValue}>{formatDate(String(value ?? ""))}</span>;
    }
    if (column.type === "link") {
      const label = formatLink(String(value ?? ""));
      if (!label) return null;
      return <span className={styles.structuredValue}>{label}</span>;
    }
    if (column.type === "select") {
      const raw = String(value ?? "");
      if (!raw) return null;
      const option = resolveOption(column, raw);
      return (
        <span className={styles.structuredValue} style={option?.color ? { color: option.color } : undefined}>
          {option?.label ?? raw}
        </span>
      );
    }
    if (column.type === "multiselect") {
      const raw = String(value ?? "");
      if (!raw) return null;
      return renderMultiValues(column, raw);
    }
    if (column.type === "number") {
      if (value === "" || value === undefined) return null;
      return <span className={styles.structuredValue}>{String(value)}</span>;
    }
    if (column.type === "text") {
      if (!value) return null;
      return <span className={styles.structuredValue}>{String(value)}</span>;
    }
    return null;
  };

  const renderInlineText = (
    column: StructuredListColumn,
    value: string | boolean | undefined,
  ): ReactNode => {
    if (column.type === "checkbox" || column.type === "yesno") {
      return renderValue(column, value);
    }
    if (column.type === "date") return formatDate(String(value ?? ""));
    if (column.type === "link") return formatLink(String(value ?? ""));
    if (column.type === "select" || column.type === "multiselect") {
      return renderValue(column, value) ?? "";
    }
    if (column.type === "number") return value === "" || value === undefined ? "" : String(value);
    if (column.type === "text") return String(value ?? "");
    if (column.type === "image" || column.type === "video") return value ? "Media" : "";
    return "";
  };

  const hasValue = (value: string | boolean | undefined) =>
    typeof value === "boolean" ? true : value !== undefined && value !== null && value !== "";

  const renderSelectInput = (
    column: StructuredListColumn,
    value: string | boolean | undefined,
    rowId: string,
  ) => {
    if (column.type === "yesno") {
      const normalized = String(value ?? "").toLowerCase();
      const selected = ["yes", "oui", "true", "1"].includes(normalized)
        ? "Oui"
        : ["no", "non", "false", "0"].includes(normalized)
          ? "Non"
          : "";
      return (
        <select
          className={styles.structuredSelect}
          value={selected}
          onChange={(event) => onUpdateCell(rowId, column.id, event.target.value)}
          onClick={(event) => event.stopPropagation()}
        >
          <option value="">—</option>
          <option value="Oui">Oui</option>
          <option value="Non">Non</option>
        </select>
      );
    }
    if (column.type === "select") {
      return (
        <select
          className={styles.structuredSelect}
          value={String(value ?? "")}
          onChange={(event) => onUpdateCell(rowId, column.id, event.target.value)}
          onClick={(event) => event.stopPropagation()}
        >
          <option value="">—</option>
          {(column.options ?? []).map((option) => (
            <option key={option.id} value={option.label}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    if (column.type === "multiselect") {
      const selected = String(value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      return (
        <select
          className={styles.structuredSelect}
          value=""
          onChange={(event) => {
            const nextValue = event.target.value;
            if (!nextValue) return;
            if (nextValue === "__clear") {
              onUpdateCell(rowId, column.id, "");
              return;
            }
            if (selected.includes(nextValue)) {
              const next = selected.filter((item) => item !== nextValue);
              onUpdateCell(rowId, column.id, next.join(", "));
              return;
            }
            onUpdateCell(rowId, column.id, [...selected, nextValue].join(", "));
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <option value="">Ajouter…</option>
          {(column.options ?? []).map((option) => (
            <option key={option.id} value={option.label}>
              {option.label}
            </option>
          ))}
          {selected.length > 0 && <option value="__clear">Effacer</option>}
        </select>
      );
    }
    return null;
  };

  const renderPrimaryInput = (
    column: StructuredListColumn,
    value: string | boolean | undefined,
    rowId: string,
  ) => {
    if (column.type === "checkbox") {
      return (
        <input
          type="checkbox"
          className={styles.structuredCheckbox}
          checked={Boolean(value)}
          onChange={(event) => onUpdateCell(rowId, column.id, event.target.checked)}
          onClick={(event) => event.stopPropagation()}
        />
      );
    }
    if (column.type === "yesno") {
      return renderSelectInput(column, value, rowId);
    }
    if (column.type === "select" || column.type === "multiselect") {
      return renderSelectInput(column, value, rowId);
    }
    if (column.type === "image" || column.type === "video") {
      return (
        <label className={styles.structuredMediaButton} onClick={(event) => event.stopPropagation()}>
          <span className={styles.structuredBadge}>+</span>
          <input
            type="file"
            accept={column.type === "image" ? "image/*" : "video/*"}
            onChange={(event) => {
              onMediaSelect?.(rowId, column, event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </label>
      );
    }
    return (
      <input
        type={column.type === "number" ? "number" : column.type === "date" ? "date" : column.type === "link" ? "url" : "text"}
        className={styles.structuredInput}
        value={String(value ?? "")}
        onChange={(event) => onUpdateCell(rowId, column.id, event.target.value)}
        onKeyDown={handleInputKey}
        onClick={(event) => event.stopPropagation()}
      />
    );
  };

  useEffect(() => {
    if (!resizeState) return;
    const handleMove = (event: PointerEvent) => {
      const delta = event.clientX - resizeState.startX;
      const nextWidth = Math.max(64, resizeState.startWidth + delta);
      onResizeColumn?.(resizeState.columnId, nextWidth);
    };
    const handleUp = () => setResizeState(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [onResizeColumn, resizeState]);

  const startResize = (columnId: string, event: PointerEvent<HTMLButtonElement>) => {
    if (!onResizeColumn) return;
    event.preventDefault();
    const cell = event.currentTarget.parentElement as HTMLElement | null;
    const width = cell ? cell.getBoundingClientRect().width : 120;
    setResizeState({ columnId, startX: event.clientX, startWidth: width });
  };

  const { gridTemplateColumns, minWidthPx } = useMemo(() => {
    const parts: string[] = [];
    const getWidth = (column: StructuredListColumn, fallback: string) =>
      column.width ? `${Math.max(64, column.width)}px` : fallback;
    const defaultWidth = "140px";
    const widths: number[] = [];
    const addWidth = (column: StructuredListColumn, fallback: number) => {
      widths.push(column.width ? Math.max(64, column.width) : fallback);
    };
    if (layout.meta) {
      parts.push(getWidth(layout.meta, "52px"));
      addWidth(layout.meta, 52);
    }
    if (layout.primary) {
      parts.push(getWidth(layout.primary, defaultWidth));
      addWidth(layout.primary, 140);
    }
    if (layout.secondary) {
      parts.push(getWidth(layout.secondary, defaultWidth));
      addWidth(layout.secondary, 140);
    }
    if (layout.values.length > 0) {
      layout.values.forEach((column) => {
        parts.push(getWidth(column, defaultWidth));
        addWidth(column, 140);
      });
    }
    parts.push("minmax(44px, 1fr)");
    widths.push(44);
    const gap = 16;
    const paddingX = 28;
    const total =
      widths.reduce((sum, value) => sum + value, 0) +
      gap * Math.max(0, widths.length - 1) +
      paddingX;
    return {
      gridTemplateColumns: parts.length > 0 ? parts.join(" ") : "1fr",
      minWidthPx: total,
    };
  }, [layout]);

  const rowStyle: CSSProperties = {
    gridTemplateColumns,
    minWidth: `${Math.max(minWidthPx, minListWidth ?? 0)}px`,
    width: "100%",
  };
  const resolvedMinWidth = Math.max(minWidthPx, minListWidth ?? 0);
  const listStyle: CSSProperties = { minWidth: `${resolvedMinWidth}px` };

  return (
    <div
      ref={scrollerRef}
      className={cx(styles.structuredScroller, isPanning && styles.structuredScrollerActive)}
      style={scrollerStyle}
      onPointerDown={handleScrollerPointerDown}
      onPointerMove={handleScrollerPointerMove}
      onPointerUp={handleScrollerPointerUp}
      onPointerCancel={handleScrollerPointerUp}
    >
      <div
        className={cx(styles.structuredList, editMode && styles.structuredListEdit)}
        style={listStyle}
      >
      {showColumnLabels && columns.length > 0 && (
        <div className={styles.structuredHeader} style={rowStyle}>
          {layout.meta && (
            <div className={styles.structuredHeaderCell}>
              {labelFor(layout.meta)}
              {editMode && (
                <button
                  type="button"
                  className={styles.structuredResizeHandle}
                  onPointerDown={(event) => startResize(layout.meta!.id, event)}
                  aria-label="Redimensionner"
                  title="Redimensionner"
                />
              )}
            </div>
          )}
          {layout.primary && (
            <div className={styles.structuredHeaderCell}>
              {labelFor(layout.primary)}
              {editMode && (
                <button
                  type="button"
                  className={styles.structuredResizeHandle}
                  onPointerDown={(event) => startResize(layout.primary!.id, event)}
                  aria-label="Redimensionner"
                  title="Redimensionner"
                />
              )}
            </div>
          )}
          {layout.secondary && (
            <div className={styles.structuredHeaderCell}>
              {labelFor(layout.secondary)}
              {editMode && (
                <button
                  type="button"
                  className={styles.structuredResizeHandle}
                  onPointerDown={(event) => startResize(layout.secondary!.id, event)}
                  aria-label="Redimensionner"
                  title="Redimensionner"
                />
              )}
            </div>
          )}
          {layout.values.map((column) => (
            <div key={column.id} className={styles.structuredHeaderCell}>
              {labelFor(column)}
              {editMode && (
                <button
                  type="button"
                  className={styles.structuredResizeHandle}
                  onPointerDown={(event) => startResize(column.id, event)}
                  aria-label="Redimensionner"
                  title="Redimensionner"
                />
              )}
            </div>
          ))}
          <div className={styles.structuredHeaderSpacer} aria-hidden="true" />
        </div>
      )}
      {rows.length === 0 && <div className={styles.structuredEmpty}>{emptyLabel}</div>}
      {rows.map((row) => {
        const isEditing = editingRowId === row.id;
        const metaValue = layout.meta ? row.values[layout.meta.id] : undefined;
        const primaryValue = layout.primary ? row.values[layout.primary.id] : undefined;
        const secondaryValue = layout.secondary ? row.values[layout.secondary.id] : undefined;
        return (
          <div
            key={row.id}
            className={cx(styles.structuredRow, isEditing && styles.structuredRowActive)}
            ref={(node) => {
              if (node) {
                rowRefs.current.set(row.id, node);
              } else {
                rowRefs.current.delete(row.id);
              }
            }}
            onClick={(event: MouseEvent<HTMLDivElement>) => {
              if (panRef.current.dragged) {
                panRef.current.dragged = false;
                return;
              }
              if (editingRowId === row.id) return;
              const target = event.target as Element | null;
              const cell = target?.closest<HTMLElement>("[data-cell-id]");
              const cellId = cell?.dataset.cellId;
              const cellType = cellId ? columnById.get(cellId)?.type : undefined;
              const shouldOpen =
                cellType === "date" ||
                cellType === "select" ||
                cellType === "multiselect" ||
                cellType === "yesno";
              if (cellId && cellType === "checkbox") {
                pendingActionRef.current = { rowId: row.id, columnId: cellId, action: "toggle" };
              }
              pendingFocusRef.current = {
                rowId: row.id,
                cellId,
                open: shouldOpen,
              };
              setEditingRowId(row.id);
            }}
            onBlur={handleRowBlur(row.id)}
            tabIndex={-1}
            style={rowStyle}
          >
            {layout.meta && (
              <div className={styles.structuredCell} data-cell-id={layout.meta.id}>
                {layout.meta.type === "image" || layout.meta.type === "video" ? (
                  <label className={styles.structuredMediaButton}>
                    <span className={styles.structuredMetaMedia}>
                      {metaValue
                        ? layout.meta.type === "image"
                          ? (
                            <img src={String(metaValue)} alt="" />
                          )
                          : (
                            <video src={String(metaValue)} />
                          )
                        : isEditing
                          ? "+"
                          : null}
                    </span>
                    {isEditing && (
                      <input
                        type="file"
                        accept={layout.meta.type === "image" ? "image/*" : "video/*"}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          onMediaSelect?.(row.id, layout.meta, event.target.files);
                          event.currentTarget.value = "";
                        }}
                      />
                    )}
                  </label>
                ) : isEditing || isAlwaysInteractiveType(layout.meta.type) ? (
                  renderInlineControl(layout.meta, metaValue, row.id, styles.structuredMetaInput)
                ) : shouldShowEmptyControl(layout.meta, metaValue) ? (
                  renderInlineControl(layout.meta, metaValue, row.id, styles.structuredMetaInput)
                ) : (
                  <span className={styles.structuredMetaDate}>
                    {formatDate(String(metaValue ?? ""))}
                  </span>
                )}
              </div>
            )}

              {layout.primary && (
                <div className={styles.structuredCell} data-cell-id={layout.primary.id}>
                  {isEditing ? (
                    renderPrimaryInput(layout.primary, primaryValue, row.id)
                  ) : isAlwaysInteractiveType(layout.primary.type) ? (
                    renderInlineControl(layout.primary, primaryValue, row.id)
                  ) : shouldShowEmptyControl(layout.primary, primaryValue) ? (
                    renderInlineControl(layout.primary, primaryValue, row.id)
                  ) : (
                    <div className={styles.structuredPrimary}>
                      {renderInlineText(layout.primary, primaryValue) || "-"}
                    </div>
                  )}
                </div>
              )}
              {layout.secondary && (
                <div className={styles.structuredCell} data-cell-id={layout.secondary.id}>
                  {isEditing ? (
                    renderPrimaryInput(layout.secondary, secondaryValue, row.id)
                  ) : isAlwaysInteractiveType(layout.secondary.type) ? (
                    renderInlineControl(layout.secondary, secondaryValue, row.id)
                  ) : shouldShowEmptyControl(layout.secondary, secondaryValue) ? (
                    renderInlineControl(layout.secondary, secondaryValue, row.id)
                  ) : hasValue(secondaryValue) ? (
                    <div className={styles.structuredSecondary}>
                      {renderInlineText(layout.secondary, secondaryValue)}
                    </div>
                  ) : null}
                </div>
              )}
            {layout.values.map((column) => {
              const value = row.values[column.id];
              let content: React.ReactNode = null;
              if (isEditing) {
                if (column.type === "checkbox") {
                  content = (
                    <label className={styles.structuredField} onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        className={styles.structuredCheckbox}
                        checked={Boolean(value)}
                        onChange={(event) =>
                          onUpdateCell(row.id, column.id, event.target.checked)
                        }
                      />
                    </label>
                  );
                } else if (column.type === "date") {
                  content = (
                    <input
                      type="date"
                      className={styles.structuredBadgeInput}
                      value={String(value ?? "")}
                      onChange={(event) =>
                        onUpdateCell(row.id, column.id, event.target.value)
                      }
                      onKeyDown={handleInputKey}
                      onClick={(event) => event.stopPropagation()}
                    />
                  );
                } else if (column.type === "number") {
                  content = (
                    <input
                      type="number"
                      className={styles.structuredBadgeInput}
                      value={String(value ?? "")}
                      onChange={(event) =>
                        onUpdateCell(row.id, column.id, event.target.value)
                      }
                      onKeyDown={handleInputKey}
                      onClick={(event) => event.stopPropagation()}
                    />
                  );
                } else if (column.type === "link") {
                  content = (
                    <input
                      type="url"
                      className={styles.structuredBadgeInput}
                      value={String(value ?? "")}
                      onChange={(event) =>
                        onUpdateCell(row.id, column.id, event.target.value)
                      }
                      onKeyDown={handleInputKey}
                      onClick={(event) => event.stopPropagation()}
                    />
                  );
                } else if (column.type === "text") {
                  content = (
                    <input
                      type="text"
                      className={styles.structuredBadgeInput}
                      value={String(value ?? "")}
                      onChange={(event) =>
                        onUpdateCell(row.id, column.id, event.target.value)
                      }
                      onKeyDown={handleInputKey}
                      onClick={(event) => event.stopPropagation()}
                    />
                  );
                } else if (column.type === "image" || column.type === "video") {
                  content = (
                    <label
                      className={styles.structuredMediaButton}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <span className={styles.structuredBadge}>+</span>
                      <input
                        type="file"
                        accept={column.type === "image" ? "image/*" : "video/*"}
                        onChange={(event) => {
                          onMediaSelect?.(row.id, column, event.target.files);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  );
                } else if (column.type === "select" || column.type === "multiselect" || column.type === "yesno") {
                  content = renderSelectInput(column, value, row.id);
                }
              } else {
                content = isAlwaysInteractiveType(column.type)
                  ? renderInlineControl(column, value, row.id)
                  : shouldShowEmptyControl(column, value)
                    ? renderInlineControl(column, value, row.id)
                    : renderValue(column, value);
              }
              return (
                <div
                  key={column.id}
                  className={styles.structuredCell}
                  data-cell-id={column.id}
                  title={column.label || ""}
                >
                  {content}
                </div>
              );
            })}
            <div className={styles.structuredActions}>
              <button
                type="button"
                className="icon-button"
                aria-label="Modifier"
                title="Modifier"
                onClick={(event) => {
                  event.stopPropagation();
                  setEditingRowId(row.id);
                }}
              >
                <svg
                  aria-hidden="true"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              </button>
              {onRemoveRow && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Supprimer"
                  title="Supprimer"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveRow(row.id);
                  }}
                >
                  <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M6 6l1 14h10l1-14" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        );
      })}

      {showAddButton && (
        <button type="button" className={styles.structuredAdd} onClick={onAddRow}>
          {addLabel}
        </button>
      )}
      </div>
    </div>
  );
}
