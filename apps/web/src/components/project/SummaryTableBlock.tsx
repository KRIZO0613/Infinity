"use client";

import { useEffect, useRef, useState } from "react";
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
  if (typeof value === "boolean") return value ? "true" : "";
  return value ?? "";
};

export default function SummaryTableBlock({ block, onChange, onDelete }: SummaryTableBlockProps) {
  const blockRef = useRef<HTMLDivElement | null>(null);
  const configAnchorRef = useRef<HTMLButtonElement | null>(null);
  const configPanelRef = useRef<HTMLDivElement | null>(null);
  const seedRef = useRef<SummaryTableData | null>(null);
  const ignoreOutsideRef = useRef(false);
  const [blockActive, setBlockActive] = useState(false);
  const [blockHovered, setBlockHovered] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [configPosition, setConfigPosition] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [draftColumns, setDraftColumns] = useState<SummaryTableColumn[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

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

  useEffect(() => {
    if (!block.table) {
      onChange({
        table,
        content: undefined,
      });
    }
  }, [block.table, onChange, table]);

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
    if (!configOpen) {
      setConfigPosition(null);
      return;
    }
    if (!portalReady) return;
    const updatePosition = () => {
      const anchor = configAnchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const panelWidth = 300;
      const gutter = 12;
      let left = rect.left;
      if (left + panelWidth > window.innerWidth - gutter) {
        left = Math.max(gutter, window.innerWidth - panelWidth - gutter);
      }
      if (left < gutter) left = gutter;
      let top = rect.bottom + 8;
      const panelHeight = configPanelRef.current?.offsetHeight ?? 0;
      const maxTop = window.innerHeight - panelHeight - gutter;
      if (panelHeight > 0 && top > maxTop) {
        top = Math.max(gutter, maxTop);
      }
      setConfigPosition({ top, left });
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
    if (!configOpen) return;
    const handleOutside = (event: PointerEvent) => {
      if (ignoreOutsideRef.current) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (configPanelRef.current?.contains(target)) return;
      if (configAnchorRef.current?.contains(target)) return;
      setConfigOpen(false);
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, [configOpen]);

  const updateTable = (next: SummaryTableData) => {
    onChange({ table: next });
  };

  const updateCell = (rowId: string, columnId: string, value: string | boolean) => {
    updateTable({
      ...table,
      rows: table.rows.map((row) =>
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

  const addColumn = () => {
    setDraftColumns((prev) => [...prev, createColumn()]);
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
    const nextRows = table.rows.map((row) => {
      const nextValues: Record<string, string | boolean> = {};
      nextColumns.forEach((column) => {
        nextValues[column.id] = normalizeValue(row.values[column.id], column.type);
      });
      return {
        ...row,
        values: nextValues,
      };
    });
    const ensuredRows = nextRows.length > 0 ? nextRows : [createRow(nextColumns)];
    updateTable({ columns: nextColumns, rows: ensuredRows });
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

  useEffect(() => {
    if (!configOpen) return;
    if (draftColumns.length === 0) return;
    if (columnsMatch(table.columns, draftColumns)) return;
    const nextRows = table.rows.map((row) => {
      const nextValues: Record<string, string | boolean> = {};
      draftColumns.forEach((column) => {
        nextValues[column.id] = normalizeValue(row.values[column.id], column.type);
      });
      return {
        ...row,
        values: nextValues,
      };
    });
    updateTable({ columns: draftColumns, rows: nextRows });
  }, [configOpen, draftColumns, table.columns, table.rows]);

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

  return (
    <div
      ref={blockRef}
      className={cx(styles.projectTableBlock, configOpen && styles.projectTableBlockActive)}
      onPointerEnter={() => setBlockHovered(true)}
      onPointerLeave={() => setBlockHovered(false)}
      onPointerDown={() => setBlockActive(true)}
    >
      <div
        className={styles.cardToolbar}
        style={{
          opacity: showToolbar ? 1 : 0,
          pointerEvents: showToolbar ? "auto" : "none",
          transition: "opacity 0.2s ease",
        }}
      >
        <button
          type="button"
          className={cx("icon-button", styles.cardToolbarButton)}
          ref={configAnchorRef}
          onClick={() => {
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
              <div className={styles.projectTableConfigActions}>
                <button
                  type="button"
                  className={cx("btn-plain", styles.projectTableConfigGhost, menuButtonClass)}
                  onMouseDown={(event) => event.preventDefault()}
                  onFocus={(event) => event.currentTarget.blur()}
                  tabIndex={-1}
                  style={plainMenuButtonStyle}
                  onClick={() => setConfigOpen(false)}
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
              rows={table.rows}
              onUpdateCell={updateCell}
              onRemoveRow={removeRow}
              onAddRow={addRow}
            onMediaSelect={handleMedia}
            emptyLabel="Aucun élément pour le moment."
            showColumnLabels
            editMode={configOpen}
            onResizeColumn={updateColumnWidth}
            minListWidth={minListWidth}
            showAddButton={false}
          />
          </div>
        </div>
      </div>
    </div>
  );
}
