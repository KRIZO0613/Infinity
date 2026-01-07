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

const createColumn = (): SummaryTableColumn => ({
  id: createId("col"),
  label: "Champ",
  type: "text",
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
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);

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

  const updateTable = (next: SummaryTableData) => {
    onChange({ table: next });
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

  const removeColumnById = (columnId: string) => {
    if (configOpen) {
      setDraftColumns((prev) => (prev.length > 1 ? prev.filter((col) => col.id !== columnId) : prev));
      return;
    }
    if (table.columns.length <= 1) return;
    const nextColumns = table.columns.filter((col) => col.id !== columnId);
    const nextRows = table.rows.map((row) => {
      const nextValues = { ...row.values };
      delete nextValues[columnId];
      return { ...row, values: nextValues };
    });
    updateTable({ columns: nextColumns, rows: nextRows });
  };

  const removeColumnImmediate = (columnId: string) => {
    const sourceColumns = configOpen ? draftColumns : table.columns;
    if (sourceColumns.length <= 1) return;
    const nextColumns = sourceColumns.filter((col) => col.id !== columnId);
    const nextRows = table.rows.map((row) => {
      const nextValues = { ...row.values };
      delete nextValues[columnId];
      return { ...row, values: nextValues };
    });
    updateTable({ columns: nextColumns, rows: nextRows });
    if (configOpen) {
      setDraftColumns(nextColumns);
    }
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
  }, [columnMap, filterConfig, sortConfig, table.rows]);

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
              className={cx("p-3", styles.projectTableConfig, menuPanelClass)}
              style={
                configPosition
                  ? {
                      ...configPosition,
                      position: "fixed",
                      zIndex: 10000,
                      pointerEvents: "auto",
                      transform: "none",
                      backdropFilter: "none",
                      WebkitBackdropFilter: "none",
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
                .${menuPanelClass} {
                  background: rgba(255, 255, 255, 0.92);
                  border: 1px solid rgba(0, 0, 0, 0.08);
                  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.12);
                  border-radius: 16px;
                  color: rgba(12, 12, 12, 0.88);
                }
                .dark .${menuPanelClass} {
                  background: rgba(70, 70, 70, 0.92);
                  border-color: rgba(255, 255, 255, 0.12);
                  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.5);
                  color: rgba(255, 255, 255, 0.9);
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
                  {activeColumnIsChoice && (
                    <div className={styles.projectTableConfigOptionsInline}>
                      <div className={styles.projectTableConfigLabel}>Options</div>
                      {activeColumnOptions.map((option) => (
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
                      {!activeColumnIsYesNo && (
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
                    </div>
                  </div>
                  <div className={styles.projectTableConfigRow}>
                    <label className={styles.projectTableConfigLabel}>Supprimer</label>
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
                        setActiveColumnId(null);
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
                        {isChoiceType && (
                          <div className={styles.projectTableConfigOptions}>
                            {options.map((option) => (
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
                            {!isYesNo && (
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
