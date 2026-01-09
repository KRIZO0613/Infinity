"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FocusEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent, ReactNode, MouseEvent } from "react";
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
  numberFormat?: "plain" | "eur" | "percent";
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
  onAddColumnAt?: (index: number) => void;
  onRemoveColumn?: (columnId: string) => void;
  onOpenConfig?: (anchor: HTMLElement, columnId?: string) => void;
  onMoveColumn?: (fromIndex: number, toIndex: number) => void;
  onSwapColumn?: (fromIndex: number, toIndex: number) => void;
  onMediaSelect?: (rowId: string, column: StructuredListColumn, files: FileList | null) => void;
  emptyLabel?: string;
  addLabel?: string;
  showAddButton?: boolean;
  showQuickAdd?: boolean;
  showHeaderControls?: boolean;
  showCopyControls?: boolean;
  onPasteRowAfter?: (rowId: string, text: string) => void;
  onPasteColumnBefore?: (columnId: string, text: string) => void;
  onPasteTable?: (text: string) => void;
  onCopyTable?: (text: string) => void;
  onDuplicateRowAfter?: (rowId: string) => void;
  onDuplicateColumnAfter?: (columnId: string) => void;
  onUndoTable?: () => void;
  onRedoTable?: () => void;
  canUndoTable?: boolean;
  canRedoTable?: boolean;
  showColumnLabels?: boolean;
  reorderMode?: boolean;
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

const formatNumberValue = (column: StructuredListColumn, rawValue: string | boolean | undefined) => {
  if (rawValue === "" || rawValue === undefined || rawValue === null) return "";
  const raw = String(rawValue);
  if (!column.numberFormat || column.numberFormat === "plain") return raw;
  const normalized = raw.includes(",") ? raw.replace(",", ".") : raw;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return raw;
  if (column.numberFormat === "eur") {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(numeric);
  }
  if (column.numberFormat === "percent") {
    const formatted = new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: 2,
    }).format(numeric);
    return `${formatted} %`;
  }
  return raw;
};

export default function StructuredList({
  columns,
  rows,
  onUpdateCell,
  onAddRow,
  onRemoveRow,
  onAddColumnAt,
  onRemoveColumn,
  onOpenConfig,
  onMoveColumn,
  onSwapColumn,
  onMediaSelect,
  emptyLabel = "Aucun element pour le moment.",
  addLabel = "+ Ajouter un element",
  showAddButton = true,
  showQuickAdd = false,
  showHeaderControls = false,
  showCopyControls = false,
  onPasteRowAfter,
  onPasteColumnBefore,
  onPasteTable,
  onCopyTable,
  onDuplicateRowAfter,
  onDuplicateColumnAfter,
  onUndoTable,
  onRedoTable,
  canUndoTable = false,
  canRedoTable = false,
  showColumnLabels = false,
  reorderMode = false,
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
  const copyBufferRef = useRef<HTMLTextAreaElement | null>(null);

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
  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const columnIndexById = useMemo(
    () => new Map(columns.map((column, index) => [column.id, index])),
    [columns],
  );
  const lastColumnId = columns[columns.length - 1]?.id;
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<{
    type: "column" | "row" | "table";
    id?: string;
  } | null>(null);
  const allowColumnMove = Boolean(reorderMode && onMoveColumn);

  const handleHeaderDragStart = (event: DragEvent<HTMLDivElement>, columnId: string) => {
    if (!allowColumnMove) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", columnId);
    setDraggingColumnId(columnId);
  };

  const handleHeaderDragOver = (event: DragEvent<HTMLDivElement>, columnId: string) => {
    if (!allowColumnMove) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOverColumnId !== columnId) setDragOverColumnId(columnId);
  };

  const handleHeaderDrop = (event: DragEvent<HTMLDivElement>, columnId: string) => {
    if (!allowColumnMove) return;
    event.preventDefault();
    const fromId = event.dataTransfer.getData("text/plain");
    if (!fromId || fromId === columnId) {
      setDraggingColumnId(null);
      setDragOverColumnId(null);
      return;
    }
    const fromIndex = columnIndexById.get(fromId);
    const toIndex = columnIndexById.get(columnId);
    if (fromIndex === undefined || toIndex === undefined) {
      setDraggingColumnId(null);
      setDragOverColumnId(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const dropBefore = event.clientX < rect.left + rect.width / 2;
    let insertIndex = dropBefore ? toIndex : toIndex + 1;
    if (fromIndex < insertIndex) insertIndex -= 1;
    if (fromIndex !== insertIndex) {
      onMoveColumn(fromIndex, insertIndex);
    }
    setDraggingColumnId(null);
    setDragOverColumnId(null);
  };

  const handleHeaderDragEnd = () => {
    setDraggingColumnId(null);
    setDragOverColumnId(null);
  };

  useEffect(() => {
    if (!allowColumnMove) {
      setSelectedColumnId(null);
      return;
    }
    if (selectedColumnId && !columnById.has(selectedColumnId)) {
      setSelectedColumnId(null);
    }
  }, [allowColumnMove, columnById, selectedColumnId]);

  const handleHeaderSelect = (event: MouseEvent<HTMLDivElement>, columnId: string) => {
    if (!allowColumnMove) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, input, select, a, [data-no-reorder='true']")) return;
    event.preventDefault();
    if (!selectedColumnId || selectedColumnId === columnId) {
      setSelectedColumnId((prev) => (prev === columnId ? null : columnId));
      return;
    }
    const fromIndex = columnIndexById.get(selectedColumnId);
    const toIndex = columnIndexById.get(columnId);
    if (fromIndex === undefined || toIndex === undefined) {
      setSelectedColumnId(null);
      return;
    }
    if (fromIndex !== toIndex) {
      if (onSwapColumn) {
        onSwapColumn(fromIndex, toIndex);
      } else {
        onMoveColumn?.(fromIndex, toIndex);
      }
    }
    setSelectedColumnId(null);
  };

  const labelFor = (column?: StructuredListColumn | null) => {
    if (!column) return "";
    return column.label?.trim() || "Champ";
  };

  const formatCopyValue = (
    column: StructuredListColumn,
    value: string | boolean | undefined,
  ) => {
    if (value === undefined || value === null || value === "") return "";
    if (column.type === "checkbox") return value ? "Oui" : "Non";
    if (column.type === "yesno") {
      if (typeof value === "boolean") return value ? "Oui" : "Non";
      const normalized = String(value ?? "").toLowerCase();
      if (["yes", "oui", "true", "1"].includes(normalized)) return "Oui";
      if (["no", "non", "false", "0"].includes(normalized)) return "Non";
      return String(value ?? "");
    }
    if (column.type === "date") return formatDate(String(value ?? ""));
    if (column.type === "link") return String(value ?? "");
    if (column.type === "select") {
      const raw = String(value ?? "");
      if (!raw) return "";
      return resolveOption(column, raw)?.label ?? raw;
    }
    if (column.type === "multiselect") {
      const raw = String(value ?? "");
      if (!raw) return "";
      return raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", ");
    }
    if (column.type === "image" || column.type === "video") return String(value ?? "");
    if (column.type === "number") return formatNumberValue(column, value);
    return String(value ?? "");
  };

  const ensureCopyBuffer = () => {
    if (copyBufferRef.current && document.body.contains(copyBufferRef.current)) {
      return copyBufferRef.current;
    }
    const textarea = document.createElement("textarea");
    textarea.setAttribute("aria-hidden", "true");
    textarea.tabIndex = -1;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    copyBufferRef.current = textarea;
    return textarea;
  };

  const primeCopySelection = (text: string) => {
    if (!text) return;
    const textarea = ensureCopyBuffer();
    textarea.value = text;
    textarea.focus();
    textarea.select();
  };

  const copyText = (text: string) => {
    if (!text) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        primeCopySelection(text);
        document.execCommand("copy");
      });
      return;
    }
    primeCopySelection(text);
    document.execCommand("copy");
  };

  const readClipboardText = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
      return "";
    }
    try {
      return await navigator.clipboard.readText();
    } catch {
      return "";
    }
  };

  const handlePasteRow = async (rowId: string) => {
    if (!onPasteRowAfter) return;
    const text = await readClipboardText();
    if (!text.trim()) return;
    onPasteRowAfter(rowId, text);
  };

  const handlePasteColumn = async (columnId: string) => {
    if (!onPasteColumnBefore) return;
    const text = await readClipboardText();
    if (!text.trim()) return;
    onPasteColumnBefore(columnId, text);
  };

  const handlePasteTable = async () => {
    if (!onPasteTable) return;
    const text = await readClipboardText();
    if (!text.trim()) return;
    onPasteTable(text);
  };

  const canRemoveColumn = Boolean(onRemoveColumn && columns.length > 1);
  const shouldShowColumnMenu = showCopyControls || canRemoveColumn;

  const isMenuOpen = (type: "column" | "row" | "table", id?: string) =>
    openMenu?.type === type && openMenu?.id === id;
  const toggleMenu = (type: "column" | "row" | "table", id?: string) => {
    setOpenMenu((prev) =>
      prev?.type === type && prev?.id === id ? null : { type, id },
    );
  };

  const renderColumnMenu = (column: StructuredListColumn) => {
    if (!shouldShowColumnMenu) return null;
    const menuOpen = isMenuOpen("column", column.id);
    return (
      <div
        className={cx(styles.structuredHeaderMenu, menuOpen && styles.structuredHeaderMenuOpen)}
        data-structured-menu="true"
      >
        <button
          type="button"
          className={cx("icon-button", styles.structuredHeaderMenuToggle)}
          onClick={(event) => {
            event.stopPropagation();
            toggleMenu("column", column.id);
          }}
          aria-label="Options de colonne"
          title="Options de colonne"
        >
          <svg
            aria-hidden="true"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <div className={styles.structuredHeaderMenuItems}>
          {showCopyControls && (
            <button
              type="button"
              className={cx("icon-button", styles.structuredCopyIcon)}
              onClick={(event) => {
                event.stopPropagation();
                copyText(getColumnText(column));
                setOpenMenu(null);
              }}
              aria-label="Copier la colonne"
              title="Copier la colonne"
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
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <rect x="4" y="4" width="11" height="11" rx="2" />
              </svg>
            </button>
          )}
          {showCopyControls && onPasteColumnBefore && (
            <button
              type="button"
              className={cx("icon-button", styles.structuredPasteIcon)}
              onClick={(event) => {
                event.stopPropagation();
                void handlePasteColumn(column.id);
                setOpenMenu(null);
              }}
              aria-label="Coller la colonne"
              title="Coller la colonne"
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
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" />
                <path d="M12 11v6" />
                <path d="M9 14l3 3 3-3" />
              </svg>
            </button>
          )}
          {onDuplicateColumnAfter && (
            <button
              type="button"
              className={cx("icon-button", styles.structuredDuplicateIcon)}
              onClick={(event) => {
                event.stopPropagation();
                onDuplicateColumnAfter(column.id);
                setOpenMenu(null);
              }}
              aria-label="Dupliquer la colonne"
              title="Dupliquer la colonne"
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
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <rect x="4" y="4" width="11" height="11" rx="2" />
                <path d="M13 7h4" />
                <path d="M15 5v4" />
              </svg>
            </button>
          )}
          {canRemoveColumn && (
            <button
              type="button"
              className={cx("icon-button", styles.structuredDeleteIcon)}
              onClick={(event) => {
                event.stopPropagation();
                onRemoveColumn?.(column.id);
                setOpenMenu(null);
              }}
              aria-label="Supprimer la colonne"
              title="Supprimer la colonne"
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
  };

  const renderTableMenu = () => {
    if (!showCopyControls) return null;
    const menuOpen = isMenuOpen("table");
    return (
      <div
        className={cx(
          styles.structuredHeaderMenu,
          styles.structuredHeaderMenuLeft,
          menuOpen && styles.structuredHeaderMenuOpen,
        )}
        data-structured-menu="true"
      >
        <button
          type="button"
          className={cx("icon-button", styles.structuredHeaderMenuToggle)}
          onClick={(event) => {
            event.stopPropagation();
            toggleMenu("table");
          }}
          aria-label="Options du tableau"
          title="Options du tableau"
        >
          <svg
            aria-hidden="true"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <div className={styles.structuredHeaderMenuItems}>
          {onUndoTable && (
            <button
              type="button"
              className={cx(
                "icon-button",
                styles.structuredUndoIcon,
                !canUndoTable && styles.structuredMenuDisabled,
              )}
              onClick={(event) => {
                event.stopPropagation();
                if (!canUndoTable) return;
                onUndoTable();
                setOpenMenu(null);
              }}
              aria-label="Retour"
              title="Retour"
              disabled={!canUndoTable}
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
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 0 0-9-9H3" />
              </svg>
            </button>
          )}
          {onRedoTable && (
            <button
              type="button"
              className={cx(
                "icon-button",
                styles.structuredRedoIcon,
                !canRedoTable && styles.structuredMenuDisabled,
              )}
              onClick={(event) => {
                event.stopPropagation();
                if (!canRedoTable) return;
                onRedoTable();
                setOpenMenu(null);
              }}
              aria-label="Inverser"
              title="Inverser"
              disabled={!canRedoTable}
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
                <path d="M21 7v6h-6" />
                <path d="M3 17a9 9 0 0 1 9-9h9" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className={cx("icon-button", styles.structuredCopyIcon)}
            onClick={(event) => {
              event.stopPropagation();
              const text = getTableText();
              if (onCopyTable) {
                onCopyTable(text);
              } else {
                copyText(text);
              }
              setOpenMenu(null);
            }}
            aria-label="Copier le tableau"
            title="Copier le tableau"
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
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 9v12" />
            </svg>
          </button>
          {onPasteTable && (
            <button
              type="button"
              className={cx("icon-button", styles.structuredPasteIcon)}
              onClick={(event) => {
                event.stopPropagation();
                void handlePasteTable();
                setOpenMenu(null);
              }}
              aria-label="Coller le tableau"
              title="Coller le tableau"
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
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" />
                <path d="M12 11v6" />
                <path d="M9 14l3 3 3-3" />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderRowMenu = (rowId: string) => {
    if (!showCopyControls) return null;
    const menuOpen = isMenuOpen("row", rowId);
    return (
      <div
        className={cx(
          styles.structuredHeaderMenu,
          styles.structuredHeaderMenuLeft,
          menuOpen && styles.structuredHeaderMenuOpen,
        )}
        data-structured-menu="true"
      >
        <button
          type="button"
          className={cx("icon-button", styles.structuredHeaderMenuToggle)}
          onClick={(event) => {
            event.stopPropagation();
            toggleMenu("row", rowId);
          }}
          aria-label="Options de ligne"
          title="Options de ligne"
        >
          <svg
            aria-hidden="true"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <div className={styles.structuredHeaderMenuItems}>
          <button
            type="button"
            className={cx("icon-button", styles.structuredCopyIcon)}
            aria-label="Copier la ligne"
            title="Copier la ligne"
            onClick={(event) => {
              event.stopPropagation();
              copyText(getRowText(rowId));
              setOpenMenu(null);
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
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <rect x="4" y="4" width="11" height="11" rx="2" />
            </svg>
          </button>
          {onPasteRowAfter && (
            <button
              type="button"
              className={cx("icon-button", styles.structuredPasteIcon)}
              aria-label="Coller la ligne"
              title="Coller la ligne"
              onClick={(event) => {
                event.stopPropagation();
                void handlePasteRow(rowId);
                setOpenMenu(null);
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
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" />
                <path d="M12 11v6" />
                <path d="M9 14l3 3 3-3" />
              </svg>
            </button>
          )}
          {onDuplicateRowAfter && (
            <button
              type="button"
              className={cx("icon-button", styles.structuredDuplicateIcon)}
              aria-label="Dupliquer la ligne"
              title="Dupliquer la ligne"
              onClick={(event) => {
                event.stopPropagation();
                onDuplicateRowAfter(rowId);
                setOpenMenu(null);
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
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <rect x="4" y="4" width="11" height="11" rx="2" />
                <path d="M13 7h4" />
                <path d="M15 5v4" />
              </svg>
            </button>
          )}
          {onRemoveRow && (
            <button
              type="button"
              className={cx("icon-button", styles.structuredDeleteIcon)}
              aria-label="Supprimer la ligne"
              title="Supprimer la ligne"
              onClick={(event) => {
                event.stopPropagation();
                onRemoveRow(rowId);
                setOpenMenu(null);
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
  };
  const orderedColumns = useMemo(
    () =>
      [layout.meta, layout.primary, layout.secondary, ...layout.values].filter(
        (column): column is StructuredListColumn => Boolean(column),
      ),
    [layout],
  );

  const getColumnText = (column: StructuredListColumn) => {
    const header = labelFor(column);
    const values = rows.map((row) => formatCopyValue(column, row.values[column.id]));
    return header ? [header, ...values].join("\n") : values.join("\n");
  };

  const getCellText = (rowId: string, columnId: string) => {
    const row = rowById.get(rowId);
    const column = columnById.get(columnId);
    if (!row || !column) return "";
    return formatCopyValue(column, row.values[column.id]);
  };

  const getRowText = (rowId: string) => {
    const row = rowById.get(rowId);
    if (!row) return "";
    return orderedColumns
      .map((column) => formatCopyValue(column, row.values[column.id]))
      .join("\t");
  };

  const getTableText = () => {
    const header = showColumnLabels
      ? orderedColumns.map((column) => labelFor(column))
      : [];
    const body = rows.map((row) =>
      orderedColumns.map((column) => formatCopyValue(column, row.values[column.id])).join("\t"),
    );
    return [...(header.length ? [header.join("\t")] : []), ...body].join("\n");
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!showCopyControls) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest("input, textarea, select, [contenteditable='true']")
    ) {
      return;
    }
    const headerCell = target?.closest<HTMLElement>("[data-header-column-id]");
    const cell = target?.closest<HTMLElement>("[data-cell-id]");
    const row = target?.closest<HTMLElement>("[data-row-id]");
    let text = "";
    if (headerCell?.dataset.headerColumnId) {
      const column = columnById.get(headerCell.dataset.headerColumnId);
      if (column) text = getColumnText(column);
    } else if (cell?.dataset.cellId && row?.dataset.rowId) {
      text = getCellText(row.dataset.rowId, cell.dataset.cellId);
    } else {
      text = getTableText();
    }
    if (!text) return;
    primeCopySelection(text);
  };

  useEffect(() => {
    if (!openMenu) return;
    const handleOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-structured-menu='true']")) return;
      setOpenMenu(null);
    };
    window.addEventListener("pointerdown", handleOutside, true);
    return () => window.removeEventListener("pointerdown", handleOutside, true);
  }, [openMenu]);

  useEffect(() => {
    return () => {
      if (copyBufferRef.current) {
        copyBufferRef.current.remove();
        copyBufferRef.current = null;
      }
    };
  }, []);

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

  const handleInputKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
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
          <span className={styles.structuredMediaPreview}>
            {value
              ? column.type === "image"
                ? <img src={String(value)} alt="" />
                : <video src={String(value)} muted playsInline />
              : "+"}
          </span>
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
      const formatted = formatNumberValue(column, value);
      if (!formatted) return null;
      return <span className={styles.structuredValue}>{formatted}</span>;
    }
    if (column.type === "text") {
      if (!value) return null;
      return <span className={styles.structuredValue}>{String(value)}</span>;
    }
    if (column.type === "image") {
      if (!value) return null;
      return (
        <span className={styles.structuredMediaPreview}>
          <img src={String(value)} alt="" />
        </span>
      );
    }
    if (column.type === "video") {
      if (!value) return null;
      return (
        <span className={styles.structuredMediaPreview}>
          <video src={String(value)} muted playsInline />
        </span>
      );
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
    if (column.type === "number") return formatNumberValue(column, value);
    if (column.type === "text") return String(value ?? "");
    if (column.type === "image" || column.type === "video") {
      return renderValue(column, value);
    }
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
          <span className={styles.structuredMediaPreview}>
            {value
              ? column.type === "image"
                ? <img src={String(value)} alt="" />
                : <video src={String(value)} muted playsInline />
              : "+"}
          </span>
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
      if (layout.meta.width) {
        parts.push(getWidth(layout.meta, "96px"));
      } else {
        parts.push("minmax(96px, max-content)");
      }
      addWidth(layout.meta, 96);
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
        className={cx(
          styles.structuredList,
          editMode && styles.structuredListEdit,
          editingRowId && styles.structuredListActive,
        )}
        style={listStyle}
        onContextMenu={handleContextMenu}
      >
      {showColumnLabels && columns.length > 0 && (
        <div className={styles.structuredHeader} style={rowStyle}>
          {layout.meta && (
            <div
              className={cx(
                styles.structuredHeaderCell,
                allowColumnMove && styles.structuredHeaderCellDraggable,
                selectedColumnId === layout.meta.id && styles.structuredHeaderCellSelected,
                draggingColumnId === layout.meta.id && styles.structuredHeaderCellDragging,
                dragOverColumnId === layout.meta.id && styles.structuredHeaderCellDragOver,
              )}
              data-header-column-id={layout.meta.id}
              draggable={allowColumnMove}
              onDragStart={(event) => handleHeaderDragStart(event, layout.meta!.id)}
              onDragOver={(event) => handleHeaderDragOver(event, layout.meta!.id)}
              onDrop={(event) => handleHeaderDrop(event, layout.meta!.id)}
              onDragEnd={handleHeaderDragEnd}
              onClick={(event) => handleHeaderSelect(event, layout.meta!.id)}
            >
              <span className={styles.structuredHeaderLabel}>{labelFor(layout.meta)}</span>
              {showHeaderControls && onOpenConfig && (
                <button
                  type="button"
                  className={styles.structuredHeaderFilter}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenConfig(event.currentTarget, layout.meta!.id);
                  }}
                  aria-label="Filtrer et editer"
                  title="Filtrer et editer"
                >
                  <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="#ff3b30"
                    className={styles.structuredHeaderFilterIcon}
                  >
                    <path d="M4 5h16l-6.5 7.2v5.6l-3 1.2v-6.8L4 5z" />
                  </svg>
                </button>
              )}
              {renderColumnMenu(layout.meta!)}
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
            <div
              className={cx(
                styles.structuredHeaderCell,
                allowColumnMove && styles.structuredHeaderCellDraggable,
                selectedColumnId === layout.primary.id && styles.structuredHeaderCellSelected,
                draggingColumnId === layout.primary.id && styles.structuredHeaderCellDragging,
                dragOverColumnId === layout.primary.id && styles.structuredHeaderCellDragOver,
              )}
              data-header-column-id={layout.primary.id}
              draggable={allowColumnMove}
              onDragStart={(event) => handleHeaderDragStart(event, layout.primary!.id)}
              onDragOver={(event) => handleHeaderDragOver(event, layout.primary!.id)}
              onDrop={(event) => handleHeaderDrop(event, layout.primary!.id)}
              onDragEnd={handleHeaderDragEnd}
              onClick={(event) => handleHeaderSelect(event, layout.primary!.id)}
            >
              <span className={styles.structuredHeaderLabel}>{labelFor(layout.primary)}</span>
              {showHeaderControls && onOpenConfig && (
                <button
                  type="button"
                  className={styles.structuredHeaderFilter}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenConfig(event.currentTarget, layout.primary!.id);
                  }}
                  aria-label="Filtrer et editer"
                  title="Filtrer et editer"
                >
                  <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="#ff3b30"
                    className={styles.structuredHeaderFilterIcon}
                  >
                    <path d="M4 5h16l-6.5 7.2v5.6l-3 1.2v-6.8L4 5z" />
                  </svg>
                </button>
              )}
              {renderColumnMenu(layout.primary!)}
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
            <div
              className={cx(
                styles.structuredHeaderCell,
                allowColumnMove && styles.structuredHeaderCellDraggable,
                selectedColumnId === layout.secondary.id && styles.structuredHeaderCellSelected,
                draggingColumnId === layout.secondary.id && styles.structuredHeaderCellDragging,
                dragOverColumnId === layout.secondary.id && styles.structuredHeaderCellDragOver,
              )}
              data-header-column-id={layout.secondary.id}
              draggable={allowColumnMove}
              onDragStart={(event) => handleHeaderDragStart(event, layout.secondary!.id)}
              onDragOver={(event) => handleHeaderDragOver(event, layout.secondary!.id)}
              onDrop={(event) => handleHeaderDrop(event, layout.secondary!.id)}
              onDragEnd={handleHeaderDragEnd}
              onClick={(event) => handleHeaderSelect(event, layout.secondary!.id)}
            >
              <span className={styles.structuredHeaderLabel}>{labelFor(layout.secondary)}</span>
              {showHeaderControls && onOpenConfig && (
                <button
                  type="button"
                  className={styles.structuredHeaderFilter}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenConfig(event.currentTarget, layout.secondary!.id);
                  }}
                  aria-label="Filtrer et editer"
                  title="Filtrer et editer"
                >
                  <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="#ff3b30"
                    className={styles.structuredHeaderFilterIcon}
                  >
                    <path d="M4 5h16l-6.5 7.2v5.6l-3 1.2v-6.8L4 5z" />
                  </svg>
                </button>
              )}
              {renderColumnMenu(layout.secondary!)}
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
            <div
              key={column.id}
              className={cx(
                styles.structuredHeaderCell,
                allowColumnMove && styles.structuredHeaderCellDraggable,
                selectedColumnId === column.id && styles.structuredHeaderCellSelected,
                draggingColumnId === column.id && styles.structuredHeaderCellDragging,
                dragOverColumnId === column.id && styles.structuredHeaderCellDragOver,
              )}
              data-header-column-id={column.id}
              draggable={allowColumnMove}
              onDragStart={(event) => handleHeaderDragStart(event, column.id)}
              onDragOver={(event) => handleHeaderDragOver(event, column.id)}
              onDrop={(event) => handleHeaderDrop(event, column.id)}
              onDragEnd={handleHeaderDragEnd}
              onClick={(event) => handleHeaderSelect(event, column.id)}
            >
              <span className={styles.structuredHeaderLabel}>{labelFor(column)}</span>
              {showHeaderControls && onOpenConfig && (
                <button
                  type="button"
                  className={styles.structuredHeaderFilter}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenConfig(event.currentTarget, column.id);
                  }}
                  aria-label="Filtrer et editer"
                  title="Filtrer et editer"
                >
                  <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="#ff3b30"
                    className={styles.structuredHeaderFilterIcon}
                  >
                    <path d="M4 5h16l-6.5 7.2v5.6l-3 1.2v-6.8L4 5z" />
                  </svg>
                </button>
              )}
              {renderColumnMenu(column)}
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
          {showHeaderControls ? (
            <div className={styles.structuredHeaderActions}>
              {renderTableMenu()}
              {onAddColumnAt && (
                <button
                  type="button"
                  className={styles.structuredHeaderButton}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (columns.length > 0) {
                      onAddColumnAt(columns.length - 1);
                    }
                  }}
                  aria-label="Ajouter une colonne"
                  title="Ajouter une colonne"
                >
                  +
                </button>
              )}
              {onRemoveColumn && columns.length > 1 && lastColumnId && (
                <button
                  type="button"
                  className={styles.structuredHeaderButton}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveColumn(lastColumnId);
                  }}
                  aria-label="Supprimer une colonne"
                  title="Supprimer une colonne"
                >
                  −
                </button>
              )}
            </div>
          ) : (
            <div className={styles.structuredHeaderSpacer} aria-hidden="true" />
          )}
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
            data-row-id={row.id}
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
                cellType === "yesno" ||
                cellType === "image" ||
                cellType === "video";
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
                  <label
                    className={styles.structuredMediaButton}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span className={styles.structuredMetaMedia}>
                      {metaValue
                        ? layout.meta.type === "image"
                          ? <img src={String(metaValue)} alt="" />
                          : <video src={String(metaValue)} muted playsInline />
                        : "+"}
                    </span>
                    <input
                      type="file"
                      accept={layout.meta.type === "image" ? "image/*" : "video/*"}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        onMediaSelect?.(row.id, layout.meta, event.target.files);
                        event.currentTarget.value = "";
                      }}
                    />
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
                      <span className={styles.structuredMediaPreview}>
                        {value
                          ? column.type === "image"
                            ? <img src={String(value)} alt="" />
                            : <video src={String(value)} muted playsInline />
                          : "+"}
                      </span>
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
              {renderRowMenu(row.id)}
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
              {!showCopyControls && onRemoveRow && (
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

      {showQuickAdd && (
        <div className={styles.structuredQuickActions}>
          <button
            type="button"
            className={styles.structuredQuickAdd}
            onClick={(event) => {
              event.stopPropagation();
              onAddRow();
            }}
            aria-label="Ajouter une ligne"
            title="Ajouter une ligne"
          >
            +
          </button>
          <button
            type="button"
            className={styles.structuredQuickAdd}
            onClick={(event) => {
              event.stopPropagation();
              if (rows.length === 0) return;
              onRemoveRow?.(rows[rows.length - 1]?.id ?? "");
            }}
            aria-label="Supprimer la dernière ligne"
            title="Supprimer la dernière ligne"
          >
            −
          </button>
        </div>
      )}

      {showAddButton && (
        <button type="button" className={styles.structuredAdd} onClick={onAddRow}>
          {addLabel}
        </button>
      )}
      </div>
    </div>
  );
}
