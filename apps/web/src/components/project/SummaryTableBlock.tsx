"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import type {
  SummaryBlock,
  SummaryTableColumn,
  SummaryTableData,
  SummaryTableRow,
} from "@/store/projectStore";
import StructuredList from "@/components/ui/StructuredList";
import styles from "./ProjectEditor.module.css";

type SummaryTableBlockProps = {
  block: SummaryBlock;
  onChange: (patch: Partial<SummaryBlock>) => void;
  onDelete?: () => void;
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

const plainMenuButtonStyle: CSSProperties = {
  background: "transparent",
  boxShadow: "none",
  outline: "none",
  WebkitTapHighlightColor: "transparent",
  userSelect: "none",
  ["--focus-ring" as string]: "none",
};

const menuButtonClass = "table-menu-plain";
const menuPanelClass = "table-menu-panel";

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const createColumn = (overrides: Partial<SummaryTableColumn> = {}): SummaryTableColumn => ({
  id: createId("col"),
  label: "Champ",
  type: "text",
  ...overrides,
});

const cloneTable = (source: SummaryTableData): SummaryTableData => ({
  columns: source.columns.map((col) => ({
    ...col,
    options: col.options?.map((option) => ({ ...option })),
  })),
  rows: source.rows.map((row) => ({
    ...row,
    values: { ...row.values },
  })),
});

const createOption = (label = "Option", color?: string) => ({
  id: createId("opt"),
  label,
  color,
});

const historyLimit = 30;
const tableClipboardKey = "summary-table-clipboard-v1";

const defaultOptionsForType = (type: SummaryTableColumn["type"]) => {
  if (type === "yesno") {
    return [
      createOption("Oui", "#22c55e"),
      createOption("Non", "#ef4444"),
    ];
  }
  if (type === "select" || type === "multiselect") {
    return [createOption("Option 1"), createOption("Option 2")];
  }
  return [];
};

const createRow = (columns: SummaryTableColumn[]): SummaryTableRow => ({
  id: createId("row"),
  values: Object.fromEntries(
    columns.map((col) => [col.id, col.type === "checkbox" ? false : ""]),
  ),
});

const normalizeClipboardText = (text: string) =>
  text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const parseClipboardMatrix = (text: string) => {
  const normalized = normalizeClipboardText(text);
  const lines = normalized.split("\n").filter((line) => line.trim() !== "");
  return lines.map((line) => line.split("\t").map((cell) => cell.trim()));
};

const parseTableClipboard = (raw: string | null) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { text?: string; table?: SummaryTableData };
    if (!parsed?.table || !Array.isArray(parsed.table.columns) || !Array.isArray(parsed.table.rows)) {
      return null;
    }
    if (typeof parsed.text !== "string") return null;
    return parsed as { text: string; table: SummaryTableData };
  } catch {
    return null;
  }
};

type ClipboardColumnOption = { label?: string; color?: string };
type ClipboardColumnPayload = {
  label?: string;
  type?: SummaryTableColumn["type"];
  numberFormat?: SummaryTableColumn["numberFormat"];
  options?: ClipboardColumnOption[];
};

const columnTypes: SummaryTableColumn["type"][] = [
  "text",
  "number",
  "date",
  "checkbox",
  "yesno",
  "select",
  "multiselect",
  "link",
  "image",
  "video",
];

const isColumnType = (value: string): value is SummaryTableColumn["type"] =>
  columnTypes.includes(value as SummaryTableColumn["type"]);

const isChoiceType = (type: SummaryTableColumn["type"]) =>
  type === "select" || type === "multiselect" || type === "yesno";

const serializeColumnForClipboard = (column: SummaryTableColumn) =>
  JSON.stringify({
    __summaryTableColumn: true,
    column: {
      label: column.label ?? "",
      type: column.type,
      numberFormat: column.numberFormat,
      options: (column.options ?? []).map((option) => ({
        label: option.label,
        color: option.color,
      })),
    },
  });

const parseColumnFromClipboard = (text: string) => {
  try {
    const parsed = JSON.parse(text) as { __summaryTableColumn?: boolean; column?: ClipboardColumnPayload };
    if (!parsed?.__summaryTableColumn || !parsed.column) return null;
    const label = typeof parsed.column.label === "string" && parsed.column.label.trim()
      ? parsed.column.label
      : "Champ";
    const type =
      typeof parsed.column.type === "string" && isColumnType(parsed.column.type)
        ? parsed.column.type
        : "text";
    const numberFormat =
      type === "number" &&
      (parsed.column.numberFormat === "eur" ||
        parsed.column.numberFormat === "percent" ||
        parsed.column.numberFormat === "plain")
        ? parsed.column.numberFormat
        : type === "number"
          ? "plain"
          : undefined;
    const rawOptions = Array.isArray(parsed.column.options) ? parsed.column.options : [];
    const options = isChoiceType(type)
      ? (rawOptions.length > 0 ? rawOptions : defaultOptionsForType(type)).map((option) =>
          createOption(
            typeof option.label === "string" ? option.label : "Option",
            typeof option.color === "string" ? option.color : undefined,
          ),
        )
      : undefined;
    return { label, type, options, numberFormat };
  } catch {
    return null;
  }
};

const normalizeLabel = (value: string) => value.trim().toLowerCase();

const columnLabel = (column: SummaryTableColumn) => column.label?.trim() || "Champ";

const looksLikeHeaderRow = (cells: string[], columns: SummaryTableColumn[]) => {
  if (cells.length === 0 || cells.length !== columns.length) return false;
  const matches = cells.reduce((count, cell, index) => {
    if (!cell) return count;
    return normalizeLabel(cell) === normalizeLabel(columnLabel(columns[index]))
      ? count + 1
      : count;
  }, 0);
  const required = columns.length <= 2 ? columns.length : Math.ceil(columns.length / 2);
  return matches >= required;
};

const parseCheckboxValue = (raw: string) => {
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "oui", "x"].includes(normalized)) return true;
  if (["0", "false", "no", "non", ""].includes(normalized)) return false;
  return Boolean(raw);
};

const coerceClipboardValue = (column: SummaryTableColumn, raw: string) => {
  const value = raw.trim();
  if (column.type === "checkbox") return parseCheckboxValue(value);
  if (column.type === "yesno") {
    const normalized = value.toLowerCase();
    if (["1", "true", "yes", "oui"].includes(normalized)) return "Oui";
    if (["0", "false", "no", "non"].includes(normalized)) return "Non";
    return "";
  }
  if (column.type === "multiselect") {
    const parts = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.join(", ");
  }
  return value;
};

const createRowFromCells = (columns: SummaryTableColumn[], cells: string[]) => ({
  id: createId("row"),
  values: Object.fromEntries(
    columns.map((column, index) => [column.id, coerceClipboardValue(column, cells[index] ?? "")]),
  ),
});

const readImageDataUrl = (file: File, maxSize: number, quality = 0.82) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        resolve("");
        return;
      }
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(result);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
        const dataUrl =
          outputType === "image/jpeg"
            ? canvas.toDataURL(outputType, quality)
            : canvas.toDataURL(outputType);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(result);
      img.src = result;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });

const readVideoDataUrl = (file: File) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result);
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });

const clampCount = (value: number, min = 1, max = 40) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const normalizeValue = (
  value: string | boolean | undefined,
  type: SummaryTableColumn["type"],
) => {
  if (type === "checkbox") return Boolean(value);
  if (type === "yesno") {
    if (typeof value === "boolean") return value ? "Oui" : "Non";
    return value ?? "";
  }
  if (typeof value === "boolean") return "";
  return value ?? "";
};

const normalizeSearchValue = (
  value: string | boolean | undefined,
  type: SummaryTableColumn["type"],
) => {
  if (value === undefined || value === null) return "";
  if (type === "checkbox") return value ? "oui" : "non";
  if (type === "yesno") {
    if (typeof value === "boolean") return value ? "oui" : "non";
    return String(value).toLowerCase();
  }
  if (typeof value === "boolean") return value ? "oui" : "non";
  return String(value).toLowerCase();
};

const defaultValueForType = (type: SummaryTableColumn["type"]) =>
  type === "checkbox" ? false : "";

export default function SummaryTableBlock({ block, onChange, onDelete }: SummaryTableBlockProps) {
  const blockRef = useRef<HTMLDivElement | null>(null);
  const configAnchorRef = useRef<HTMLButtonElement | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const configPanelRef = useRef<HTMLDivElement | null>(null);
  const configSnapshotRef = useRef<SummaryTableData | null>(null);
  const seedRef = useRef<SummaryTableData | null>(null);
  const ignoreOutsideRef = useRef(false);
  const clipboardBufferRef = useRef<HTMLTextAreaElement | null>(null);
  const [blockActive, setBlockActive] = useState(false);
  const [blockHovered, setBlockHovered] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [configPosition, setConfigPosition] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [draftColumns, setDraftColumns] = useState<SummaryTableColumn[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [sortConfig, setSortConfig] = useState<{ columnId: string; direction: "asc" | "desc" } | null>(
    null,
  );
  const [filterConfig, setFilterConfig] = useState<{
    columnId: string;
    query: string;
    selected?: string[];
  } | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [optionsExpanded, setOptionsExpanded] = useState(false);
  const [optionsOpenById, setOptionsOpenById] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<{ past: SummaryTableData[]; future: SummaryTableData[] }>(
    { past: [], future: [] },
  );
  const isHistoryActionRef = useRef(false);
  const historyRef = useRef(history);

  const ensureClipboardBuffer = () => {
    if (clipboardBufferRef.current && document.body.contains(clipboardBufferRef.current)) {
      return clipboardBufferRef.current;
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
    clipboardBufferRef.current = textarea;
    return textarea;
  };

  const writeClipboardText = async (text: string) => {
    if (!text) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall back to execCommand below.
      }
    }
    const textarea = ensureClipboardBuffer();
    textarea.value = text;
    textarea.focus();
    textarea.select();
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

  const writeTableClipboard = (payload: { text: string; table: SummaryTableData }) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(tableClipboardKey, JSON.stringify(payload));
    } catch {
      // Ignore storage failures.
    }
  };

  const readTableClipboard = () => {
    if (typeof window === "undefined") return null;
    try {
      return parseTableClipboard(window.localStorage.getItem(tableClipboardKey));
    } catch {
      return null;
    }
  };

  const getPanelPosition = (anchor: HTMLElement, base?: HTMLElement | null) => {
    const rect = (base ?? anchor).getBoundingClientRect();
    const panelWidth = 300;
    const gutter = 12;
    let left = rect.left;
    if (left + panelWidth > window.innerWidth - gutter) {
      left = Math.max(gutter, window.innerWidth - panelWidth - gutter);
    }
    if (left < gutter) left = gutter;
    let top = rect.top + 12;
    const panelHeight = configPanelRef.current?.offsetHeight ?? 0;
    const maxTop = window.innerHeight - panelHeight - gutter;
    if (panelHeight > 0 && top > maxTop) {
      top = Math.max(gutter, maxTop);
    }
    return { top, left };
  };

  if (!block.table && !seedRef.current) {
    const baseColumns = [createColumn()];
    const contentRows =
      block.content
        ?.split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({
          id: createId("row"),
          values: { [baseColumns[0].id]: line },
        })) ?? [];
    seedRef.current = {
      columns: baseColumns,
      rows: contentRows,
    };
  }

  const table = block.table ?? seedRef.current ?? { columns: [createColumn()], rows: [] };
  const tableRef = useRef(table);
  const columnMap = useMemo(
    () => new Map(table.columns.map((column) => [column.id, column])),
    [table.columns],
  );
  const columnsForConfig = configOpen ? draftColumns : table.columns;
  const activeColumn = activeColumnId
    ? columnsForConfig.find((column) => column.id === activeColumnId) ?? null
    : null;
  const activeColumnIndex = activeColumnId
    ? columnsForConfig.findIndex((column) => column.id === activeColumnId)
    : -1;
  const activeColumnIsChoice = activeColumn
    ? activeColumn.type === "select" ||
      activeColumn.type === "multiselect" ||
      activeColumn.type === "yesno"
    : false;
  const activeColumnIsYesNo = activeColumn?.type === "yesno";
  const activeColumnOptions = activeColumn?.options ?? [];
  useEffect(() => {
    if (!activeColumnIsChoice) return;
    setOptionsExpanded(false);
  }, [activeColumnId, activeColumnIsChoice]);
  const activeFilterSelected =
    activeColumn && filterConfig?.columnId === activeColumn.id
      ? filterConfig?.selected ?? []
      : [];
  const activeFilterItems = useMemo(() => {
    if (!activeColumn) return [];
    const items = new Map<string, { value: string; label: string }>();
    const addItem = (value: string, label?: string) => {
      const safeValue = value.trim();
      if (!safeValue) return;
      const key = safeValue.toLowerCase();
      if (!items.has(key)) {
        items.set(key, { value: safeValue, label: label ?? safeValue });
      }
    };
    if (activeColumn.type === "yesno") {
      const base =
        activeColumn.options && activeColumn.options.length > 0
          ? activeColumn.options.map((option) => option.label)
          : ["Oui", "Non"];
      base.forEach((label) => addItem(label, label));
    }
    if (activeColumn.type === "select" || activeColumn.type === "multiselect") {
      (activeColumn.options ?? []).forEach((option) => addItem(option.label, option.label));
    }
    table.rows.forEach((row) => {
      const raw = row.values[activeColumn.id];
      if (raw === undefined || raw === null || raw === "") return;
      if (activeColumn.type === "multiselect") {
        String(raw)
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
          .forEach((part) => addItem(part, part));
        return;
      }
      if (activeColumn.type === "checkbox") {
        addItem(raw ? "Oui" : "Non");
        return;
      }
      if (activeColumn.type === "yesno") {
        const value = typeof raw === "boolean" ? (raw ? "Oui" : "Non") : String(raw);
        addItem(value, value);
        return;
      }
      addItem(String(raw), String(raw));
    });
    return Array.from(items.values());
  }, [activeColumn, table.rows]);
  const activeFilterOptions = useMemo(() => {
    const query = filterSearch.trim().toLowerCase();
    if (!query) return activeFilterItems;
    return activeFilterItems.filter((item) => item.label.toLowerCase().includes(query));
  }, [activeFilterItems, filterSearch]);

  useEffect(() => {
    if (!block.table) {
      onChange({
        table,
        content: undefined,
      });
    }
  }, [block.table, onChange, table]);

  useEffect(() => {
    tableRef.current = table;
  }, [table]);

  useEffect(() => {
    if (!blockActive && !configOpen) return;
    const handleOutside = (event: PointerEvent) => {
      if (configOpen) return;
      if (ignoreOutsideRef.current) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (blockRef.current?.contains(target)) return;
      setBlockActive(false);
      setConfigOpen(false);
    };
    window.addEventListener("pointerdown", handleOutside);
    window.addEventListener("pointerup", handleOutside);
    return () => {
      window.removeEventListener("pointerdown", handleOutside);
      window.removeEventListener("pointerup", handleOutside);
    };
  }, [blockActive, configOpen]);

  useEffect(() => {
    if (dragIndex === null) return;
    const handlePointerUp = () => setDragIndex(null);
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, [dragIndex]);

  useEffect(() => {
    if (!configOpen) return;
    const seeded = table.columns.length > 0 ? table.columns.map((col) => ({ ...col })) : [createColumn()];
    setDraftColumns(
      seeded.map((col) => {
        if (col.type === "select" || col.type === "multiselect" || col.type === "yesno") {
          return {
            ...col,
            options: col.options && col.options.length > 0 ? col.options : defaultOptionsForType(col.type),
          };
        }
        return col;
      }),
    );
  }, [configOpen, table.columns, table.rows.length]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (configOpen) return;
    configSnapshotRef.current = null;
  }, [configOpen]);

  useEffect(() => {
    if (!configOpen) {
      setConfigPosition(null);
      return;
    }
    if (!portalReady) return;
    const updatePosition = () => {
      const anchor = configAnchorRef.current;
      if (!anchor) return;
      setConfigPosition(getPanelPosition(anchor, blockRef.current));
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [configOpen, draftColumns.length, portalReady]);

  useEffect(() => {
    setFilterSearch("");
  }, [activeColumnId, configOpen]);

  useEffect(() => {
    if (!configOpen) return;
    const handleOutside = (event: PointerEvent) => {
      if (ignoreOutsideRef.current) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (configPanelRef.current?.contains(target)) return;
      if (configAnchorRef.current?.contains(target)) return;
      setConfigOpen(false);
    };
    window.addEventListener("pointerdown", handleOutside, true);
    return () => window.removeEventListener("pointerdown", handleOutside, true);
  }, [configOpen]);

  useEffect(() => {
    if (!configOpen) return;
    setOptionsExpanded(false);
    setOptionsOpenById({});
  }, [configOpen]);

  useEffect(() => {
    setHistory({ past: [], future: [] });
  }, [block.id]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    return () => {
      if (clipboardBufferRef.current) {
        clipboardBufferRef.current.remove();
        clipboardBufferRef.current = null;
      }
    };
  }, []);

  const updateTable = (next: SummaryTableData) => {
    const currentTable = tableRef.current ?? table;
    if (!isHistoryActionRef.current) {
      setHistory((prev) => {
        const nextPast = [...prev.past, cloneTable(currentTable)];
        const trimmedPast =
          nextPast.length > historyLimit ? nextPast.slice(-historyLimit) : nextPast;
        return { past: trimmedPast, future: [] };
      });
    }
    onChange({ table: next });
  };

  const handleUndoTable = () => {
    const currentHistory = historyRef.current;
    if (currentHistory.past.length === 0) return;
    const previous = currentHistory.past[currentHistory.past.length - 1];
    const current = tableRef.current ?? table;
    isHistoryActionRef.current = true;
    onChange({ table: previous });
    requestAnimationFrame(() => {
      isHistoryActionRef.current = false;
    });
    const nextPast = currentHistory.past.slice(0, -1);
    const nextFuture = [cloneTable(current), ...currentHistory.future].slice(0, historyLimit);
    setHistory({ past: nextPast, future: nextFuture });
  };

  const handleRedoTable = () => {
    const currentHistory = historyRef.current;
    if (currentHistory.future.length === 0) return;
    const nextTable = currentHistory.future[0];
    const current = tableRef.current ?? table;
    isHistoryActionRef.current = true;
    onChange({ table: nextTable });
    requestAnimationFrame(() => {
      isHistoryActionRef.current = false;
    });
    const nextPast = [...currentHistory.past, cloneTable(current)].slice(-historyLimit);
    const nextFuture = currentHistory.future.slice(1);
    setHistory({ past: nextPast, future: nextFuture });
  };

  const insertDraftColumnAt = (index: number, column: SummaryTableColumn) => {
    setDraftColumns((prev) => {
      const next = [...prev];
      const insertAt = Math.min(Math.max(index, 0), next.length);
      next.splice(insertAt, 0, column);
      return next;
    });
    setOptionsOpenById((prev) => ({ ...prev, [column.id]: false }));
  };

  const handleCopyField = async (column: SummaryTableColumn) => {
    await writeClipboardText(serializeColumnForClipboard(column));
  };

  const handlePasteFieldBefore = async (index: number) => {
    const text = await readClipboardText();
    if (!text.trim()) return;
    const parsed = parseColumnFromClipboard(text);
    if (!parsed) return;
    const nextColumn = createColumn({
      label: parsed.label,
      type: parsed.type,
      options: parsed.options,
      numberFormat: parsed.numberFormat,
    });
    insertDraftColumnAt(index, nextColumn);
  };

  const handlePasteTable = (text: string) => {
    const normalizedText = normalizeClipboardText(text).trim();
    const stored = readTableClipboard();
    if (stored && normalizeClipboardText(stored.text).trim() === normalizedText) {
      const nextTable = cloneTable(stored.table);
      if (nextTable.columns.length === 0) {
        nextTable.columns = [createColumn()];
      }
      if (nextTable.rows.length === 0) {
        nextTable.rows = [createRow(nextTable.columns)];
      }
      if (configOpen) {
        setDraftColumns(nextTable.columns);
      }
      updateTable(nextTable);
      return;
    }
    const matrix = parseClipboardMatrix(text);
    if (matrix.length === 0) return;
    const header = matrix.length > 1 ? matrix[0] : [];
    const body = matrix.length > 1 ? matrix.slice(1) : matrix;
    const maxBodyColumns = body.reduce((max, row) => Math.max(max, row.length), 0);
    const columnCount = Math.max(header.length, maxBodyColumns);
    if (columnCount === 0) return;
    const nextColumns = Array.from({ length: columnCount }, (_, index) =>
      createColumn({ label: header[index] || "Champ" }),
    );
    const nextRows = body.map((cells) => ({
      id: createId("row"),
      values: Object.fromEntries(
        nextColumns.map((column, index) => [column.id, cells[index] ?? ""]),
      ),
    }));
    if (configOpen) {
      setDraftColumns(nextColumns);
    }
    updateTable({ columns: nextColumns, rows: nextRows });
  };

  const handlePasteRowAfter = (rowId: string, text: string) => {
    const matrix = parseClipboardMatrix(text);
    if (matrix.length === 0) return;
    const currentTable = tableRef.current ?? table;
    let rowsToInsert = matrix;
    if (looksLikeHeaderRow(matrix[0], currentTable.columns)) {
      rowsToInsert = matrix.slice(1);
    }
    if (rowsToInsert.length === 0) return;
    const newRows = rowsToInsert.map((cells) =>
      createRowFromCells(currentTable.columns, cells),
    );
    const rowIndex = currentTable.rows.findIndex((row) => row.id === rowId);
    const insertAt = rowIndex >= 0 ? rowIndex + 1 : currentTable.rows.length;
    const nextRows = [...currentTable.rows];
    nextRows.splice(insertAt, 0, ...newRows);
    updateTable({ ...currentTable, rows: nextRows });
  };

  const handlePasteColumnBefore = (columnId: string, text: string) => {
    const matrix = parseClipboardMatrix(text);
    if (matrix.length === 0) return;
    const currentTable = tableRef.current ?? table;
    const columnIndex = currentTable.columns.findIndex((column) => column.id === columnId);
    const insertAt = columnIndex >= 0 ? columnIndex : currentTable.columns.length;
    const isSingleColumn = matrix.every((row) => row.length <= 1);
    let headerLabel = "Champ";
    let values = matrix;
    if (matrix.length > 1 && isSingleColumn) {
      headerLabel = matrix[0][0] || headerLabel;
      values = matrix.slice(1);
    } else if (matrix.length > 1 && looksLikeHeaderRow(matrix[0], currentTable.columns)) {
      headerLabel = matrix[0][0] || headerLabel;
      values = matrix.slice(1);
    }
    const newColumn = createColumn({ label: headerLabel });
    const nextColumns = [...currentTable.columns];
    nextColumns.splice(insertAt, 0, newColumn);
    const nextRows = currentTable.rows.map((row, index) => ({
      ...row,
      values: {
        ...row.values,
        [newColumn.id]: values[index]?.[0] ?? "",
      },
    }));
    if (configOpen) {
      setDraftColumns(nextColumns);
    }
    updateTable({ ...currentTable, columns: nextColumns, rows: nextRows });
  };

  const duplicateRowAfter = (rowId: string) => {
    const currentTable = tableRef.current ?? table;
    const rowIndex = currentTable.rows.findIndex((row) => row.id === rowId);
    if (rowIndex < 0) return;
    const sourceRow = currentTable.rows[rowIndex];
    const duplicated = {
      id: createId("row"),
      values: { ...sourceRow.values },
    };
    const nextRows = [...currentTable.rows];
    nextRows.splice(rowIndex + 1, 0, duplicated);
    updateTable({ ...currentTable, rows: nextRows });
  };

  const duplicateColumnAfter = (columnId: string) => {
    const currentTable = tableRef.current ?? table;
    const columnIndex = currentTable.columns.findIndex((column) => column.id === columnId);
    if (columnIndex < 0) return;
    const sourceColumn = currentTable.columns[columnIndex];
    const nextColumn = createColumn({
      label: sourceColumn.label?.trim() ? sourceColumn.label : "Champ",
      type: sourceColumn.type,
      width: sourceColumn.width,
      options: sourceColumn.options?.map((option) => createOption(option.label, option.color)),
    });
    const nextColumns = [...currentTable.columns];
    nextColumns.splice(columnIndex + 1, 0, nextColumn);
    const nextRows = currentTable.rows.map((row) => ({
      ...row,
      values: {
        ...row.values,
        [nextColumn.id]:
          row.values[sourceColumn.id] ?? defaultValueForType(nextColumn.type),
      },
    }));
    if (configOpen) {
      setDraftColumns(nextColumns);
    }
    updateTable({ ...currentTable, columns: nextColumns, rows: nextRows });
  };

  const updateCell = (rowId: string, columnId: string, value: string | boolean) => {
    const currentTable = tableRef.current ?? table;
    updateTable({
      ...currentTable,
      rows: currentTable.rows.map((row) =>
        row.id === rowId
          ? { ...row, values: { ...row.values, [columnId]: value } }
          : row,
      ),
    });
  };

  const updateColumnWidth = (columnId: string, width: number) => {
    if (configOpen) {
      setDraftColumns((prev) =>
        prev.map((col) => (col.id === columnId ? { ...col, width } : col)),
      );
      return;
    }
    updateTable({
      ...table,
      columns: table.columns.map((col) => (col.id === columnId ? { ...col, width } : col)),
    });
  };

  const moveColumn = (fromIndex: number, toIndex: number) => {
    const sourceColumns = configOpen ? draftColumns : table.columns;
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= sourceColumns.length || toIndex > sourceColumns.length) return;
    const nextColumns = [...sourceColumns];
    const [moved] = nextColumns.splice(fromIndex, 1);
    nextColumns.splice(toIndex, 0, moved);
    if (configOpen) {
      setDraftColumns(nextColumns);
      return;
    }
    updateTable({
      ...table,
      columns: nextColumns,
    });
  };

  const swapColumns = (fromIndex: number, toIndex: number) => {
    const sourceColumns = configOpen ? draftColumns : table.columns;
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= sourceColumns.length || toIndex >= sourceColumns.length) return;
    const nextColumns = [...sourceColumns];
    const temp = nextColumns[fromIndex];
    nextColumns[fromIndex] = nextColumns[toIndex];
    nextColumns[toIndex] = temp;
    if (configOpen) {
      setDraftColumns(nextColumns);
      return;
    }
    updateTable({
      ...table,
      columns: nextColumns,
    });
  };

  const addColumn = () => {
    setDraftColumns((prev) => [...prev, createColumn()]);
  };

  const addColumnAfter = (index: number) => {
    const nextColumn = createColumn();
    if (configOpen) {
      setDraftColumns((prev) => {
        const next = [...prev];
        const insertAt = Math.min(Math.max(index + 1, 0), next.length);
        next.splice(insertAt, 0, nextColumn);
        return next;
      });
      return;
    }
    const nextColumns = [...table.columns];
    const insertAt = Math.min(Math.max(index + 1, 0), nextColumns.length);
    nextColumns.splice(insertAt, 0, nextColumn);
    const nextRows = table.rows.map((row) => ({
      ...row,
      values: {
        ...row.values,
        [nextColumn.id]: nextColumn.type === "checkbox" ? false : "",
      },
    }));
    updateTable({ columns: nextColumns, rows: nextRows });
  };

  const addColumnBefore = (index: number) => {
    const nextColumn = createColumn();
    if (configOpen) {
      setDraftColumns((prev) => {
        const next = [...prev];
        const insertAt = Math.min(Math.max(index, 0), next.length);
        next.splice(insertAt, 0, nextColumn);
        return next;
      });
      return;
    }
    const nextColumns = [...table.columns];
    const insertAt = Math.min(Math.max(index, 0), nextColumns.length);
    nextColumns.splice(insertAt, 0, nextColumn);
    const nextRows = table.rows.map((row) => ({
      ...row,
      values: {
        ...row.values,
        [nextColumn.id]: nextColumn.type === "checkbox" ? false : "",
      },
    }));
    updateTable({ columns: nextColumns, rows: nextRows });
  };

  const clearColumnState = (columnId: string) => {
    setFilterConfig((prev) => (prev?.columnId === columnId ? null : prev));
    setSortConfig((prev) => (prev?.columnId === columnId ? null : prev));
    setActiveColumnId((prev) => (prev === columnId ? null : prev));
    setFilterSearch("");
  };

  const removeColumnById = (columnId: string) => {
    const sourceColumns = configOpen ? draftColumns : table.columns;
    if (sourceColumns.length <= 1) return;
    const nextColumns = sourceColumns.filter((col) => col.id !== columnId);
    if (nextColumns.length === sourceColumns.length) return;
    if (configOpen) {
      setDraftColumns(nextColumns);
      clearColumnState(columnId);
      return;
    }
    const nextRows = table.rows.map((row) => {
      const nextValues = { ...row.values };
      delete nextValues[columnId];
      return { ...row, values: nextValues };
    });
    updateTable({ columns: nextColumns, rows: nextRows });
    clearColumnState(columnId);
  };

  const removeColumnImmediate = (columnId: string) => {
    const sourceColumns =
      configOpen && draftColumns.some((col) => col.id === columnId)
        ? draftColumns
        : table.columns;
    if (sourceColumns.length <= 1) return;
    const nextColumns = sourceColumns.filter((col) => col.id !== columnId);
    if (nextColumns.length === sourceColumns.length) return;
    const nextRows = table.rows.map((row) => {
      const nextValues = { ...row.values };
      delete nextValues[columnId];
      return { ...row, values: nextValues };
    });
    updateTable({ columns: nextColumns, rows: nextRows });
    if (configOpen) {
      setDraftColumns(nextColumns);
    }
    clearColumnState(columnId);
  };

  const updateDraftColumnCount = (nextCount: number) => {
    const count = clampCount(nextCount, 1, 12);
    setDraftColumns((prev) => {
      const next = [...prev];
      while (next.length < count) {
        next.push(createColumn());
      }
      if (next.length > count) {
        next.splice(count);
      }
      return next;
    });
  };

  const updateDraftColumn = (columnId: string, patch: Partial<SummaryTableColumn>) => {
    setDraftColumns((prev) =>
      prev.map((col) => {
        if (col.id !== columnId) return col;
        const next = { ...col, ...patch };
        if (patch.type) {
          if (patch.type === "select" || patch.type === "multiselect" || patch.type === "yesno") {
            next.options = next.options && next.options.length > 0
              ? next.options
              : defaultOptionsForType(patch.type);
          } else {
            next.options = undefined;
          }
          if (patch.type === "number") {
            next.numberFormat = next.numberFormat ?? "plain";
          } else {
            next.numberFormat = undefined;
          }
        }
        return next;
      }),
    );
  };

  const applyColumnPatch = (columnId: string, patch: Partial<SummaryTableColumn>) => {
    const sourceColumns = configOpen ? draftColumns : table.columns;
    const nextColumns = sourceColumns.map((col) => {
      if (col.id !== columnId) return col;
      const next = { ...col, ...patch };
      if (patch.type) {
        if (patch.type === "select" || patch.type === "multiselect" || patch.type === "yesno") {
          next.options = next.options && next.options.length > 0
            ? next.options
            : defaultOptionsForType(patch.type);
        } else {
          next.options = undefined;
        }
        if (patch.type === "number") {
          next.numberFormat = next.numberFormat ?? "plain";
        } else {
          next.numberFormat = undefined;
        }
      }
      if (patch.numberFormat && next.type !== "number") {
        next.numberFormat = undefined;
      }
      return next;
    });
    const nextRows = table.rows.map((row) => {
      const nextValues = { ...row.values };
      if (patch.type) {
        nextValues[columnId] = defaultValueForType(patch.type);
      }
      return { ...row, values: nextValues };
    });
    updateTable({ columns: nextColumns, rows: nextRows });
    if (configOpen) {
      setDraftColumns(nextColumns);
    }
  };

  const applyColumnOptions = (columnId: string, options: SummaryTableColumn["options"]) => {
    applyColumnPatch(columnId, { options });
  };

  const insertColumnImmediate = (index: number) => {
    const nextColumn = createColumn();
    const nextColumns = [...table.columns];
    const insertAt = Math.min(Math.max(index, 0), nextColumns.length);
    nextColumns.splice(insertAt, 0, nextColumn);
    const nextRows = table.rows.map((row) => ({
      ...row,
      values: {
        ...row.values,
        [nextColumn.id]: nextColumn.type === "checkbox" ? false : "",
      },
    }));
    updateTable({ columns: nextColumns, rows: nextRows });
    if (configOpen) {
      setDraftColumns(nextColumns);
    }
  };

  const moveDraftColumn = (fromIndex: number, toIndex: number) => {
    setDraftColumns((prev) => {
      if (fromIndex === toIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const updateOption = (
    columnId: string,
    optionId: string,
    patch: { label?: string; color?: string },
  ) => {
    setDraftColumns((prev) =>
      prev.map((col) => {
        if (col.id !== columnId) return col;
        const options = (col.options ?? []).map((opt) =>
          opt.id === optionId ? { ...opt, ...patch } : opt,
        );
        return { ...col, options };
      }),
    );
  };

  const addOption = (columnId: string) => {
    setDraftColumns((prev) =>
      prev.map((col) => {
        if (col.id !== columnId) return col;
        const options = [...(col.options ?? []), createOption(`Option ${(col.options?.length ?? 0) + 1}`)];
        return { ...col, options };
      }),
    );
  };

  const removeOption = (columnId: string, optionId: string) => {
    setDraftColumns((prev) =>
      prev.map((col) => {
        if (col.id !== columnId) return col;
        const options = (col.options ?? []).filter((opt) => opt.id !== optionId);
        return { ...col, options };
      }),
    );
  };

  const applyConfig = () => {
    const nextColumns = draftColumns.length > 0 ? draftColumns : [createColumn()];
    const prevTypes = new Map(table.columns.map((column) => [column.id, column.type]));
    const nextRows = table.rows.map((row) => {
      const nextValues: Record<string, string | boolean> = {};
      nextColumns.forEach((column) => {
        if (prevTypes.get(column.id) && prevTypes.get(column.id) !== column.type) {
          nextValues[column.id] = defaultValueForType(column.type);
          return;
        }
        nextValues[column.id] = normalizeValue(row.values[column.id], column.type);
      });
      return {
        ...row,
        values: nextValues,
      };
    });
    const ensuredRows = nextRows.length > 0 ? nextRows : [createRow(nextColumns)];
    updateTable({ columns: nextColumns, rows: ensuredRows });
    setActiveColumnId(null);
    setConfigOpen(false);
  };

  const cancelConfig = () => {
    if (configSnapshotRef.current) {
      updateTable(configSnapshotRef.current);
    }
    setActiveColumnId(null);
    setConfigOpen(false);
  };

  const columnsMatch = (a: SummaryTableColumn[], b: SummaryTableColumn[]) => {
    if (a.length !== b.length) return false;
    return a.every((col, index) => {
      const other = b[index];
      return (
        col.id === other.id &&
        col.label === other.label &&
        col.type === other.type &&
        col.width === other.width
      );
    });
  };

  // Table updates are applied via "Appliquer" (or explicit actions), not on every draft change.

  const removeRow = (rowId: string) => {
    updateTable({
      ...table,
      rows: table.rows.filter((row) => row.id !== rowId),
    });
  };

  const handleMedia = async (
    rowId: string,
    column: SummaryTableColumn,
    files: FileList | null,
  ) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (column.type === "image") {
      const dataUrl = await readImageDataUrl(file, 1200, 0.78);
      if (dataUrl) updateCell(rowId, column.id, dataUrl);
    }
    if (column.type === "video") {
      const dataUrl = await readVideoDataUrl(file);
      if (dataUrl) updateCell(rowId, column.id, dataUrl);
    }
  };

  const showToolbar = blockActive || blockHovered;
  const addRow = () => {
    updateTable({
      ...table,
      rows: [...table.rows, createRow(table.columns)],
    });
  };
  const columnsForView = configOpen ? draftColumns : table.columns;
  const minListWidth = Math.max(900, columnsForView.length * 160 + 140);
  const visibleRows = useMemo(() => {
    let nextRows = [...table.rows];
    const globalQuery = globalSearch.trim().toLowerCase();
    if (filterConfig?.columnId) {
      const query = filterConfig.query.trim().toLowerCase();
      const selected = (filterConfig.selected ?? []).map((value) => value.toLowerCase());
      const column = columnMap.get(filterConfig.columnId);
      if (column) {
        nextRows = nextRows.filter((row) => {
          const raw = row.values[column.id];
          if (raw === undefined || raw === null) return false;
          const value = String(raw).toLowerCase();
          if (selected.length > 0) {
            if (column.type === "multiselect") {
              const parts = value.split(",").map((part) => part.trim());
              return parts.some((part) => selected.includes(part));
            }
            if (column.type === "checkbox") {
              const boolValue = value === "true" ? "oui" : value === "false" ? "non" : value;
              return selected.includes(boolValue);
            }
            return selected.includes(value);
          }
          if (!query) return true;
          if (column.type === "multiselect") {
            return value.split(",").map((part) => part.trim()).some((part) => part.includes(query));
          }
          return value.includes(query);
        });
      }
    }
    if (globalQuery) {
      nextRows = nextRows.filter((row) =>
        table.columns.some((column) => {
          const raw = row.values[column.id];
          if (raw === undefined || raw === null || raw === "") return false;
          if (column.type === "multiselect") {
            return String(raw)
              .split(",")
              .map((part) => part.trim().toLowerCase())
              .some((part) => part.includes(globalQuery));
          }
          const value = normalizeSearchValue(raw, column.type);
          return value.includes(globalQuery);
        }),
      );
    }
    if (sortConfig?.columnId) {
      const column = columnMap.get(sortConfig.columnId);
      if (column) {
        const direction = sortConfig.direction === "desc" ? -1 : 1;
        nextRows = [...nextRows].sort((a, b) => {
          const aVal = a.values[column.id];
          const bVal = b.values[column.id];
          if (column.type === "number") {
            const aNum = Number(aVal ?? 0);
            const bNum = Number(bVal ?? 0);
            return (aNum - bNum) * direction;
          }
          if (column.type === "date") {
            const aTime = aVal ? new Date(String(aVal)).getTime() : 0;
            const bTime = bVal ? new Date(String(bVal)).getTime() : 0;
            return (aTime - bTime) * direction;
          }
          if (column.type === "checkbox" || column.type === "yesno") {
            const aBool = String(aVal ?? "").toLowerCase();
            const bBool = String(bVal ?? "").toLowerCase();
            return aBool.localeCompare(bBool) * direction;
          }
          return String(aVal ?? "").localeCompare(String(bVal ?? "")) * direction;
        });
      }
    }
    return nextRows;
  }, [columnMap, filterConfig, globalSearch, sortConfig, table.columns, table.rows]);

  const handleCopyTable = async (text: string) => {
    const snapshotColumns = columnsForView.map((column) => ({
      ...column,
      options: column.options?.map((option) => ({ ...option })),
    }));
    const snapshotRows = visibleRows.map((row) => ({
      ...row,
      values: Object.fromEntries(
        snapshotColumns.map((column) => [
          column.id,
          row.values[column.id] ?? (column.type === "checkbox" ? false : ""),
        ]),
      ),
    }));
    writeTableClipboard({ text, table: { columns: snapshotColumns, rows: snapshotRows } });
    await writeClipboardText(text);
  };

  return (
    <div
      ref={blockRef}
      className={cx(styles.projectTableBlock, configOpen && styles.projectTableBlockActive)}
      onPointerEnter={() => setBlockHovered(true)}
      onPointerLeave={() => setBlockHovered(false)}
      onPointerDown={() => setBlockActive(true)}
    >
      <div
        className={cx(styles.cardToolbar, styles.projectTableToolbar)}
        style={{
          opacity: showToolbar ? 1 : 0,
          pointerEvents: showToolbar ? "auto" : "none",
          transition: "opacity 0.2s ease",
        }}
      >
        <div className={styles.projectTableToolbarLeft}>
          <button
            type="button"
            className={cx(
              "icon-button",
              styles.cardToolbarButton,
              reorderMode && styles.cardToolbarButtonActive,
            )}
            onClick={() => setReorderMode((prev) => !prev)}
            aria-label="Mode deplacement des colonnes"
            title="Deplacer les colonnes"
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 11V6a2 2 0 0 0-4 0v5" />
              <path d="M14 10V4a2 2 0 0 0-4 0v6" />
              <path d="M10 10V4a2 2 0 0 0-4 0v6" />
              <path d="M6 10V8a2 2 0 0 0-4 0v2" />
              <path d="M18 11a2 2 0 1 1 4 0v3a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4v-1" />
            </svg>
          </button>
        </div>
        <div className={styles.projectTableToolbarRight}>
          <input
            type="text"
            className={styles.projectTableSearch}
            value={globalSearch}
            onChange={(event) => setGlobalSearch(event.target.value)}
            placeholder="Rechercher"
            aria-label="Rechercher dans le tableau"
          />
          <button
            type="button"
            className={cx("icon-button", styles.cardToolbarButton)}
            ref={menuAnchorRef}
            onClick={() => {
              if (menuAnchorRef.current) {
                configAnchorRef.current = menuAnchorRef.current;
                if (!configSnapshotRef.current) {
                  configSnapshotRef.current = cloneTable(table);
                }
                setConfigPosition(getPanelPosition(menuAnchorRef.current, blockRef.current));
              }
              setActiveColumnId(null);
              setConfigOpen(true);
              setBlockActive(true);
            }}
            aria-label="Configurer la liste"
            title="Configurer la liste"
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
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
          {onDelete && (
            <button
              type="button"
              className={cx("icon-button", styles.cardToolbarButton)}
              onClick={onDelete}
              aria-label="Supprimer le bloc"
              title="Supprimer le bloc"
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
      {configOpen && portalReady
        ? createPortal(
            <div
              className={cx("panel-glass p-3", styles.projectTableConfig, menuPanelClass)}
              style={
                configPosition
                  ? {
                      ...configPosition,
                      position: "fixed",
                      zIndex: 10000,
                      pointerEvents: "auto",
                      transform: "none",
                    }
                  : undefined
              }
              ref={configPanelRef}
              onPointerDownCapture={() => {
                ignoreOutsideRef.current = true;
              }}
              onPointerUpCapture={() => {
                window.setTimeout(() => {
                  ignoreOutsideRef.current = false;
                }, 0);
              }}
            >
              <style>{`
                .${menuPanelClass} .btn-plain {
                  background: transparent !important;
                  box-shadow: none !important;
                }
                .${menuPanelClass}.panel-glass .btn-plain,
                .${menuPanelClass} .btn-plain:hover,
                .${menuPanelClass} .btn-plain:focus,
                .${menuPanelClass} .btn-plain:focus-visible,
                .${menuPanelClass} .btn-plain:active {
                  background: transparent !important;
                  box-shadow: none !important;
                }
                .dark .${menuPanelClass}.panel-glass .btn-plain,
                .dark .${menuPanelClass} .btn-plain:hover,
                .dark .${menuPanelClass} .btn-plain:focus,
                .dark .${menuPanelClass} .btn-plain:focus-visible,
                .dark .${menuPanelClass} .btn-plain:active {
                  background: transparent !important;
                  box-shadow: none !important;
                }
                .${menuPanelClass} .${menuButtonClass},
                .${menuPanelClass} .${menuButtonClass}:hover,
                .${menuPanelClass} .${menuButtonClass}:focus,
                .${menuPanelClass} .${menuButtonClass}:focus-visible,
                .${menuPanelClass} .${menuButtonClass}:active {
                  background: transparent !important;
                  background-color: transparent !important;
                  box-shadow: none !important;
                  outline: none !important;
                }
                .dark .${menuPanelClass} .${menuButtonClass},
                .dark .${menuPanelClass} .${menuButtonClass}:hover,
                .dark .${menuPanelClass} .${menuButtonClass}:focus,
                .dark .${menuPanelClass} .${menuButtonClass}:focus-visible,
                .dark .${menuPanelClass} .${menuButtonClass}:active {
                  background: transparent !important;
                  background-color: transparent !important;
                  box-shadow: none !important;
                  outline: none !important;
                }
                .${menuPanelClass} .icon-button {
                  background: transparent !important;
                  box-shadow: none !important;
                }
                .${menuPanelClass} button {
                  background: transparent !important;
                  -webkit-tap-highlight-color: transparent;
                }
                .${menuPanelClass} .${styles.projectTableConfigGhost},
                .${menuPanelClass} .${styles.projectTableConfigPrimary} {
                  background: transparent !important;
                  box-shadow: none !important;
                  border: none !important;
                }
                .${menuPanelClass} .${styles.projectTableConfigInput},
                .${menuPanelClass} .${styles.projectTableConfigSelect},
                .${menuPanelClass} .${styles.projectTableConfigOptionInput} {
                  background: transparent !important;
                  border: 1px solid rgba(0, 0, 0, 0.08) !important;
                  border-radius: 10px !important;
                  color: var(--text);
                  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
                  padding: 4px 6px;
                }
                .${menuPanelClass} .${styles.projectTableConfigSelect} {
                  appearance: none;
                  -webkit-appearance: none;
                }
                .${menuPanelClass} .${styles.projectTableConfigInput}:focus,
                .${menuPanelClass} .${styles.projectTableConfigSelect}:focus,
                .${menuPanelClass} .${styles.projectTableConfigOptionInput}:focus,
                .${menuPanelClass} .${styles.projectTableConfigInput}:focus-visible,
                .${menuPanelClass} .${styles.projectTableConfigSelect}:focus-visible,
                .${menuPanelClass} .${styles.projectTableConfigOptionInput}:focus-visible {
                  outline: none !important;
                  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
                  background: transparent !important;
                }
                .${menuPanelClass} button:focus-visible,
                .${menuPanelClass} button:focus,
                .${menuPanelClass} button:active,
                .${menuPanelClass} input:focus-visible,
                .${menuPanelClass} input:focus,
                .${menuPanelClass} select:focus-visible,
                .${menuPanelClass} select:focus,
                .${menuPanelClass} textarea:focus-visible {
                  outline: none !important;
                  box-shadow: none !important;
                }
                .${menuPanelClass} .${styles.projectTableConfigFilterList} {
                  background: transparent !important;
                  border: none !important;
                  box-shadow: none !important;
                  padding: 0;
                }
                .${menuPanelClass} .${styles.projectTableConfigFilterItem} {
                  border-radius: 0;
                }
                .${menuPanelClass} .${styles.projectTableConfigFilterItem}:hover {
                  background: transparent;
                }
                .${menuPanelClass} .${styles.projectTableConfigFilterCheckbox} {
                  background: transparent !important;
                  box-shadow: none !important;
                }
                .dark .${menuPanelClass} .${styles.projectTableConfigInput},
                .dark .${menuPanelClass} .${styles.projectTableConfigSelect},
                .dark .${menuPanelClass} .${styles.projectTableConfigOptionInput} {
                  border: 1px solid rgba(255, 255, 255, 0.16);
                  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
                }
                .${menuPanelClass} .${styles.projectTableConfigGhost},
                .${menuPanelClass} .${styles.projectTableConfigPrimary} {
                  color: inherit !important;
                }
                .${menuButtonClass}:focus-visible,
                .${menuButtonClass}:focus,
                .${menuButtonClass}:active {
                  outline: none !important;
                  box-shadow: none !important;
                  background: transparent !important;
                }
              `}</style>
              <div className={styles.projectTableConfigTitle}>Liste structuree</div>
              {activeColumn ? (
                <>
                  <div className={cx(styles.projectTableConfigRow, styles.projectTableConfigRowStack)}>
                    <label className={styles.projectTableConfigLabel}>Colonne</label>
                    <select
                      className={styles.projectTableConfigSelect}
                      value={activeColumn.type}
                      onChange={(event) =>
                        applyColumnPatch(activeColumn.id, {
                          type: event.target.value as SummaryTableColumn["type"],
                        })
                      }
                    >
                      <option value="text">Texte</option>
                      <option value="number">Nombre</option>
                      <option value="date">Date</option>
                      <option value="checkbox">Case a cocher</option>
                      <option value="yesno">Oui / Non</option>
                      <option value="select">Liste</option>
                      <option value="multiselect">Liste multiple</option>
                      <option value="link">Lien</option>
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                  </div>
                  {activeColumn.type === "number" && (
                    <div className={styles.projectTableConfigRow}>
                      <label className={styles.projectTableConfigLabel}>Format</label>
                      <select
                        className={styles.projectTableConfigSelect}
                        value={activeColumn.numberFormat ?? "plain"}
                        onChange={(event) =>
                          applyColumnPatch(activeColumn.id, {
                            numberFormat: event.target.value as SummaryTableColumn["numberFormat"],
                          })
                        }
                      >
                        <option value="plain">Nombre</option>
                        <option value="eur">€</option>
                        <option value="percent">%</option>
                      </select>
                    </div>
                  )}
                  {activeColumnIsChoice && (
                    <div className={styles.projectTableConfigOptionsInline}>
                      <div className={styles.projectTableConfigOptionsHeader}>
                        <div className={styles.projectTableConfigLabel}>Options</div>
                        <button
                          type="button"
                          className={cx(
                            "icon-button",
                            styles.projectTableConfigOptionsToggle,
                            optionsExpanded && styles.projectTableConfigOptionsToggleOpen,
                          )}
                          onClick={() => setOptionsExpanded((prev) => !prev)}
                          aria-label={optionsExpanded ? "Reduire les options" : "Afficher les options"}
                          title={optionsExpanded ? "Reduire les options" : "Afficher les options"}
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
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>
                      </div>
                      {optionsExpanded && activeColumnOptions.map((option) => (
                        <div key={option.id} className={styles.projectTableConfigOptionRow}>
                          <input
                            className={styles.projectTableConfigOptionInput}
                            value={option.label}
                            onChange={(event) =>
                              applyColumnOptions(
                                activeColumn.id,
                                activeColumnOptions.map((item) =>
                                  item.id === option.id
                                    ? { ...item, label: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            placeholder="Option"
                          />
                          <input
                            type="color"
                            className={styles.projectTableConfigOptionColor}
                            value={option.color ?? "#9ca3af"}
                            onChange={(event) =>
                              applyColumnOptions(
                                activeColumn.id,
                                activeColumnOptions.map((item) =>
                                  item.id === option.id
                                    ? { ...item, color: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            aria-label="Couleur"
                          />
                          {!activeColumnIsYesNo && activeColumnOptions.length > 1 && (
                            <button
                              type="button"
                              className={cx("icon-button", styles.projectTableConfigOptionRemove)}
                              onClick={() =>
                                applyColumnOptions(
                                  activeColumn.id,
                                  activeColumnOptions.filter((item) => item.id !== option.id),
                                )
                              }
                              aria-label="Supprimer"
                              title="Supprimer"
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
                                <path d="M18 6 6 18" />
                                <path d="m6 6 12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      ))}
                      {optionsExpanded && !activeColumnIsYesNo && (
                        <button
                          type="button"
                          className={cx("btn-plain", styles.projectTableConfigOptionAdd)}
                          onClick={() =>
                            applyColumnOptions(activeColumn.id, [
                              ...activeColumnOptions,
                              createOption(`Option ${activeColumnOptions.length + 1}`),
                            ])
                          }
                        >
                          + Option
                        </button>
                      )}
                    </div>
                  )}
                  <div className={styles.projectTableConfigQuick}>
                    <button
                      type="button"
                      className={cx("btn-plain", styles.projectTableConfigGhost, menuButtonClass)}
                      onMouseDown={(event) => event.preventDefault()}
                      onFocus={(event) => event.currentTarget.blur()}
                      tabIndex={-1}
                      style={plainMenuButtonStyle}
                      onClick={() => {
                        if (activeColumnIndex >= 0) insertColumnImmediate(activeColumnIndex);
                      }}
                    >
                      + Colonne gauche
                    </button>
                    <button
                      type="button"
                      className={cx("btn-plain", styles.projectTableConfigGhost, menuButtonClass)}
                      onMouseDown={(event) => event.preventDefault()}
                      onFocus={(event) => event.currentTarget.blur()}
                      tabIndex={-1}
                      style={plainMenuButtonStyle}
                      onClick={() => {
                        if (activeColumnIndex >= 0) insertColumnImmediate(activeColumnIndex + 1);
                      }}
                    >
                      + Colonne droite
                    </button>
                  </div>
                  <div className={styles.projectTableConfigRow}>
                    <label className={styles.projectTableConfigLabel}>Trier</label>
                    <select
                      className={styles.projectTableConfigSelect}
                      value={
                        sortConfig?.columnId === activeColumn.id ? sortConfig.direction : ""
                      }
                      onChange={(event) => {
                        const next = event.target.value;
                        if (!next) {
                          if (sortConfig?.columnId === activeColumn.id) setSortConfig(null);
                          return;
                        }
                        setSortConfig({ columnId: activeColumn.id, direction: next as "asc" | "desc" });
                      }}
                    >
                      <option value="">Aucun</option>
                      <option value="asc">A → Z</option>
                      <option value="desc">Z → A</option>
                    </select>
                  </div>
                  <div className={styles.projectTableConfigRow}>
                    <label className={styles.projectTableConfigLabel}>Filtrer</label>
                    <div className={styles.projectTableConfigFilter}>
                      <input
                        className={styles.projectTableConfigInput}
                        value={filterSearch}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setFilterSearch(nextValue);
                          setFilterConfig((prev) => {
                            if (!activeColumn) return prev;
                            const base =
                              prev && prev.columnId === activeColumn.id
                                ? prev
                                : { columnId: activeColumn.id, query: "", selected: [] };
                            if (base.selected && base.selected.length > 0) return base;
                            return { ...base, query: nextValue };
                          });
                        }}
                        placeholder="Rechercher..."
                      />
                      <div className={styles.projectTableConfigFilterList}>
                        {activeFilterOptions.length === 0 && (
                          <div className={styles.projectTableConfigFilterEmpty}>Aucun resultat</div>
                        )}
                        {activeFilterOptions.map((item) => {
                          const isChecked = activeFilterSelected.includes(item.value);
                          return (
                            <label key={item.value} className={styles.projectTableConfigFilterItem}>
                              <input
                                type="checkbox"
                                className={styles.projectTableConfigFilterCheckbox}
                                checked={isChecked}
                                onChange={() => {
                                  setFilterConfig((prev) => {
                                    const base =
                                      prev && prev.columnId === activeColumn.id
                                        ? prev
                                        : { columnId: activeColumn.id, query: "", selected: [] };
                                    const nextSelected = new Set(base.selected ?? []);
                                    if (nextSelected.has(item.value)) {
                                      nextSelected.delete(item.value);
                                    } else {
                                      nextSelected.add(item.value);
                                    }
                                    return {
                                      ...base,
                                      query: "",
                                      selected: Array.from(nextSelected),
                                    };
                                  });
                                }}
                              />
                              <span className={styles.projectTableConfigFilterText}>{item.label}</span>
                            </label>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        className={cx("btn-plain", styles.projectTableConfigGhost, menuButtonClass)}
                        onMouseDown={(event) => event.preventDefault()}
                        onFocus={(event) => event.currentTarget.blur()}
                        tabIndex={-1}
                        style={plainMenuButtonStyle}
                        onClick={() => {
                          setFilterSearch("");
                          setFilterConfig((prev) => {
                            if (!activeColumn) return prev;
                            return { columnId: activeColumn.id, query: "", selected: [] };
                          });
                        }}
                      >
                        Supprimer filtre
                      </button>
                    </div>
                  </div>
                  <div className={styles.projectTableConfigRow}>
                    <label className={styles.projectTableConfigLabel}>Supprimer colonne</label>
                    <button
                      type="button"
                      className={cx(styles.projectTableConfigTrash, menuButtonClass)}
                      onMouseDown={(event) => event.preventDefault()}
                      onFocus={(event) => event.currentTarget.blur()}
                      tabIndex={-1}
                      aria-label="Supprimer la colonne"
                      title="Supprimer la colonne"
                      style={{ ...plainMenuButtonStyle, border: "none", padding: 0 }}
                      onClick={() => {
                        removeColumnImmediate(activeColumn.id);
                        setConfigOpen(false);
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
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.projectTableConfigRow}>
                    <label className={styles.projectTableConfigLabel} htmlFor={`${block.id}-cols`}>
                      Champs
                    </label>
                    <input
                      id={`${block.id}-cols`}
                      type="number"
                      min={1}
                      max={12}
                      className={styles.projectTableConfigInput}
                      value={draftColumns.length}
                      onChange={(event) => updateDraftColumnCount(Number(event.target.value))}
                    />
                  </div>
                  <div className={styles.projectTableConfigQuick}>
                    <button
                      type="button"
                      className={cx("btn-plain", styles.projectTableConfigGhost, menuButtonClass)}
                      onMouseDown={(event) => event.preventDefault()}
                      onFocus={(event) => event.currentTarget.blur()}
                      tabIndex={-1}
                      style={plainMenuButtonStyle}
                      onClick={addRow}
                    >
                      + Ligne
                    </button>
                    <button
                      type="button"
                      className={cx("btn-plain", styles.projectTableConfigGhost, menuButtonClass)}
                      onMouseDown={(event) => event.preventDefault()}
                      onFocus={(event) => event.currentTarget.blur()}
                      tabIndex={-1}
                      style={plainMenuButtonStyle}
                      onClick={addColumn}
                    >
                      + Champ
                    </button>
                  </div>
                  <div className={styles.projectTableConfigGrid}>
                    {draftColumns.map((column, index) => (
                      <div
                        key={column.id}
                        className={styles.projectTableConfigColumn}
                        onPointerEnter={() => {
                          if (dragIndex === null || dragIndex === index) return;
                          moveDraftColumn(dragIndex, index);
                          setDragIndex(index);
                        }}
                      >
                        {(() => {
                          const isChoiceType =
                            column.type === "select" ||
                            column.type === "multiselect" ||
                            column.type === "yesno";
                          const isYesNo = column.type === "yesno";
                          const options = column.options ?? [];
                          return (
                            <>
                        <button
                          type="button"
                          className={cx("icon-button", styles.projectTableConfigDrag)}
                          onPointerDown={(event) => {
                            event.preventDefault();
                            setDragIndex(index);
                          }}
                          aria-label="Deplacer le champ"
                          title="Deplacer le champ"
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
                            <circle cx="9" cy="5" r="1.5" />
                            <circle cx="15" cy="5" r="1.5" />
                            <circle cx="9" cy="12" r="1.5" />
                            <circle cx="15" cy="12" r="1.5" />
                            <circle cx="9" cy="19" r="1.5" />
                            <circle cx="15" cy="19" r="1.5" />
                          </svg>
                        </button>
                        <input
                          className={styles.projectTableConfigInput}
                          value={column.label}
                          onChange={(event) =>
                            updateDraftColumn(column.id, { label: event.target.value })
                          }
                          placeholder={`Champ ${index + 1}`}
                        />
                        <select
                          className={styles.projectTableConfigSelect}
                          value={column.type}
                          onChange={(event) =>
                            updateDraftColumn(column.id, {
                              type: event.target.value as SummaryTableColumn["type"],
                            })
                          }
                        >
                          <option value="text">Texte</option>
                          <option value="number">Nombre</option>
                          <option value="date">Date</option>
                          <option value="checkbox">Case a cocher</option>
                          <option value="yesno">Oui / Non</option>
                          <option value="select">Liste</option>
                          <option value="multiselect">Liste multiple</option>
                          <option value="link">Lien</option>
                          <option value="image">Image</option>
                          <option value="video">Vidéo</option>
                        </select>
                        {draftColumns.length > 1 && (
                          <button
                            type="button"
                            className={cx("icon-button", styles.projectTableConfigRemove)}
                            onClick={() =>
                              setDraftColumns((prev) => prev.filter((item) => item.id !== column.id))
                            }
                            aria-label="Supprimer le champ"
                            title="Supprimer le champ"
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
                              <path d="M18 6 6 18" />
                              <path d="m6 6 12 12" />
                            </svg>
                          </button>
                        )}
                        <button
                          type="button"
                          className={cx("icon-button", styles.projectTableConfigCopy)}
                          onClick={() => {
                            void handleCopyField(column);
                          }}
                          aria-label="Copier le champ"
                          title="Copier le champ"
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
                        <button
                          type="button"
                          className={cx("icon-button", styles.projectTableConfigPaste)}
                          onClick={() => {
                            void handlePasteFieldBefore(index);
                          }}
                          aria-label="Coller le champ"
                          title="Coller le champ"
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
                        {isChoiceType && (
                          <div className={styles.projectTableConfigOptions}>
                            <div className={styles.projectTableConfigOptionsHeader}>
                              <div className={styles.projectTableConfigLabel}>Options</div>
                              <button
                                type="button"
                                className={cx(
                                  "icon-button",
                                  styles.projectTableConfigOptionsToggle,
                                  (optionsOpenById[column.id] ?? false) &&
                                    styles.projectTableConfigOptionsToggleOpen,
                                )}
                                onClick={() =>
                                  setOptionsOpenById((prev) => ({
                                    ...prev,
                                    [column.id]: !(prev[column.id] ?? false),
                                  }))
                                }
                                aria-label={
                                  optionsOpenById[column.id] ?? false
                                    ? "Reduire les options"
                                    : "Afficher les options"
                                }
                                title={
                                  optionsOpenById[column.id] ?? false
                                    ? "Reduire les options"
                                    : "Afficher les options"
                                }
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
                                  <path d="m6 9 6 6 6-6" />
                                </svg>
                              </button>
                            </div>
                            {(optionsOpenById[column.id] ?? false) &&
                              options.map((option) => (
                                <div key={option.id} className={styles.projectTableConfigOptionRow}>
                                  <input
                                    className={styles.projectTableConfigOptionInput}
                                    value={option.label}
                                    onChange={(event) =>
                                      updateOption(column.id, option.id, { label: event.target.value })
                                    }
                                    placeholder="Option"
                                  />
                                  <input
                                    type="color"
                                    className={styles.projectTableConfigOptionColor}
                                    value={option.color ?? "#9ca3af"}
                                    onChange={(event) =>
                                      updateOption(column.id, option.id, { color: event.target.value })
                                    }
                                    aria-label="Couleur"
                                  />
                                  {!isYesNo && options.length > 1 && (
                                    <button
                                      type="button"
                                      className={cx("icon-button", styles.projectTableConfigOptionRemove)}
                                      onClick={() => removeOption(column.id, option.id)}
                                      aria-label="Supprimer"
                                      title="Supprimer"
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
                                        <path d="M18 6 6 18" />
                                        <path d="m6 6 12 12" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              ))}
                            {(optionsOpenById[column.id] ?? false) && !isYesNo && (
                              <button
                                type="button"
                                className={cx("btn-plain", styles.projectTableConfigOptionAdd)}
                                onClick={() => addOption(column.id)}
                              >
                                + Option
                              </button>
                            )}
                          </div>
                        )}
                            </>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className={styles.projectTableConfigActions}>
                <button
                  type="button"
                  className={cx("btn-plain", styles.projectTableConfigGhost, menuButtonClass)}
                  onMouseDown={(event) => event.preventDefault()}
                  onFocus={(event) => event.currentTarget.blur()}
                  tabIndex={-1}
                  style={plainMenuButtonStyle}
                  onClick={cancelConfig}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className={cx("btn-plain", styles.projectTableConfigPrimary, menuButtonClass)}
                  onMouseDown={(event) => event.preventDefault()}
                  onFocus={(event) => event.currentTarget.blur()}
                  tabIndex={-1}
                  style={plainMenuButtonStyle}
                  onClick={applyConfig}
                >
                  Appliquer
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
      <div className={styles.projectTableShell}>
        <div className={styles.projectTableFrame}>
          <div className={styles.projectTableScroll}>
            <StructuredList
              columns={columnsForView}
              rows={visibleRows}
              onUpdateCell={updateCell}
              onRemoveRow={removeRow}
              onAddRow={addRow}
              onAddColumnAt={addColumnAfter}
              onRemoveColumn={removeColumnById}
              onMoveColumn={reorderMode ? moveColumn : undefined}
              onSwapColumn={reorderMode ? swapColumns : undefined}
              reorderMode={reorderMode}
              onOpenConfig={(anchor, columnId) => {
                configAnchorRef.current = anchor as HTMLButtonElement;
                if (!configSnapshotRef.current) {
                  configSnapshotRef.current = cloneTable(table);
                }
                setConfigPosition(getPanelPosition(anchor as HTMLElement, blockRef.current));
                setActiveColumnId(columnId ?? null);
                setConfigOpen(true);
                setBlockActive(true);
                if (columnId) {
                  setFilterConfig((prev) =>
                    prev && prev.columnId === columnId
                      ? prev
                      : { columnId, query: "", selected: [] },
                  );
                }
              }}
              onMediaSelect={handleMedia}
              emptyLabel="Aucun élément pour le moment."
              showColumnLabels
              showHeaderControls
              showCopyControls
              onUndoTable={handleUndoTable}
              onRedoTable={handleRedoTable}
              canUndoTable={history.past.length > 0}
              canRedoTable={history.future.length > 0}
              onPasteRowAfter={handlePasteRowAfter}
              onPasteColumnBefore={handlePasteColumnBefore}
              onPasteTable={handlePasteTable}
              onCopyTable={handleCopyTable}
              onDuplicateRowAfter={duplicateRowAfter}
              onDuplicateColumnAfter={duplicateColumnAfter}
              editMode={configOpen}
              onResizeColumn={updateColumnWidth}
              minListWidth={minListWidth}
              showAddButton={false}
              showQuickAdd
            />
          </div>
        </div>
      </div>
    </div>
  );
}
