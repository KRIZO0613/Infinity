"use client";

import { useEffect, useRef, useState } from "react";
import type { SummaryBlock, SummaryCardEntry, SummaryCardField } from "@/store/projectStore";
import styles from "./ProjectEditor.module.css";

type SummaryCardBlockProps = {
  block: SummaryBlock;
  onChange: (patch: Partial<SummaryBlock>) => void;
  onDelete?: () => void;
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

const createId = (prefix: string) => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
};

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

const ensureCardValues = (template: SummaryCardField[], values: Record<string, string>) => {
  const next = { ...values };
  template.forEach((field) => {
    if (!(field.id in next)) {
      next[field.id] = "";
    }
  });
  return next;
};

export default function SummaryCardBlock({ block, onChange, onDelete }: SummaryCardBlockProps) {
  const blockRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const initRef = useRef(false);
  const autoOpenRef = useRef(false);
  const layout = block.layout ?? "cards";
  const template = block.template ?? [];
  const cards = block.cards ?? [];
  const [blockActive, setBlockActive] = useState(false);
  const [blockHovered, setBlockHovered] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SummaryCardEntry | null>(null);
  const [expandedCards, setExpandedCards] = useState<string[]>([]);

  useEffect(() => {
    if (initRef.current) return;
    if (block.template || block.cards) {
      initRef.current = true;
      return;
    }
    if (block.fields && block.fields.length > 0) {
      const nextTemplate = block.fields.map((field) => ({
        id: field.id || createId("card-field"),
        label: field.label || "",
      }));
      const values: Record<string, string> = {};
      block.fields.forEach((field) => {
        if (field.id) {
          values[field.id] = field.value ?? "";
        }
      });
      const legacyCard: SummaryCardEntry = {
        id: createId("card"),
        title: "",
        image: "",
        background: "",
        backgroundImage: "",
        values,
      };
      onChange({ template: nextTemplate, cards: [legacyCard], fields: undefined });
      initRef.current = true;
      return;
    }
    onChange({ template: [], cards: [] });
    initRef.current = true;
  }, [block, onChange]);

  useEffect(() => {
    if (autoOpenRef.current) return;
    if (cards.length > 0) {
      autoOpenRef.current = true;
      return;
    }
    autoOpenRef.current = true;
    openPanel();
  }, [cards.length]);

  useEffect(() => {
    if (!panelOpen) return;
    const handleOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      setPanelOpen(false);
      setEditingId(null);
      setDraft(null);
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, [panelOpen]);

  useEffect(() => {
    if (!blockActive) return;
    const handleOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (blockRef.current?.contains(target)) return;
      setBlockActive(false);
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, [blockActive]);

  useEffect(() => {
    if (!draft) return;
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, values: ensureCardValues(template, prev.values) };
    });
  }, [template]);

  const openPanel = (card?: SummaryCardEntry) => {
    setEditingId(card?.id ?? null);
    const nextCard =
      card ??
      ({
        id: createId("card"),
        title: "",
        image: "",
        background: "",
        backgroundImage: "",
        values: ensureCardValues(template, {}),
      } as SummaryCardEntry);
    setDraft({ ...nextCard, values: { ...nextCard.values } });
    setPanelOpen(true);
  };

  const updateTemplateLabel = (fieldId: string, label: string) => {
    const nextTemplate = template.map((field) =>
      field.id === fieldId ? { ...field, label } : field,
    );
    onChange({ template: nextTemplate });
  };

  const addTemplateField = () => {
    const newField = { id: createId("card-field"), label: "" };
    const nextTemplate = [...template, newField];
    const nextCards = cards.map((card) => ({
      ...card,
      values: { ...card.values, [newField.id]: "" },
    }));
    onChange({ template: nextTemplate, cards: nextCards });
    setDraft((prev) =>
      prev
        ? { ...prev, values: { ...prev.values, [newField.id]: "" } }
        : prev,
    );
  };

  const removeTemplateField = (fieldId: string) => {
    const nextTemplate = template.filter((field) => field.id !== fieldId);
    const nextCards = cards.map((card) => {
      const values = { ...card.values };
      delete values[fieldId];
      return { ...card, values };
    });
    onChange({ template: nextTemplate, cards: nextCards });
    setDraft((prev) => {
      if (!prev) return prev;
      const values = { ...prev.values };
      delete values[fieldId];
      return { ...prev, values };
    });
  };

  const updateDraftFieldValue = (fieldId: string, value: string) => {
    setDraft((prev) =>
      prev ? { ...prev, values: { ...prev.values, [fieldId]: value } } : prev,
    );
  };

  const handleImageFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    readImageDataUrl(file, 320, 0.78).then((result) => {
      if (result) {
        setDraft((prev) => (prev ? { ...prev, image: result } : prev));
      }
    });
    event.target.value = "";
  };

  const handleBackgroundImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    readImageDataUrl(file, 1200, 0.76).then((result) => {
      if (result) {
        setDraft((prev) => (prev ? { ...prev, backgroundImage: result } : prev));
      }
    });
    event.target.value = "";
  };

  const saveCard = () => {
    if (!draft) return;
    const nextCard = {
      ...draft,
      values: ensureCardValues(template, draft.values),
    };
    if (editingId) {
      const nextCards = cards.map((card) => (card.id === editingId ? nextCard : card));
      onChange({ cards: nextCards });
    } else {
      onChange({ cards: [...cards, nextCard] });
    }
    setPanelOpen(false);
    setEditingId(null);
    setDraft(null);
  };

  const deleteEditingCard = () => {
    if (!editingId) return;
    deleteCard(editingId);
    setPanelOpen(false);
    setEditingId(null);
    setDraft(null);
  };

  const duplicateCard = (card: SummaryCardEntry) => {
    const copy: SummaryCardEntry = {
      ...card,
      id: createId("card"),
      values: { ...card.values },
    };
    onChange({ cards: [...cards, copy] });
  };

  const deleteCard = (cardId: string) => {
    const nextCards = cards.filter((card) => card.id !== cardId);
    onChange({ cards: nextCards });
  };

  const toggleExpanded = (cardId: string) => {
    setExpandedCards((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId],
    );
  };

  const showToolbar = blockActive || blockHovered;

  return (
    <div
      ref={blockRef}
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
          onClick={() => openPanel()}
          aria-label="Ajouter une carte"
          title="Ajouter une carte"
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
        <div className={styles.cardToolbarGroup}>
          <button
            type="button"
            className={cx(
              "icon-button",
              styles.cardToolbarButton,
              layout === "list" && styles.cardToolbarButtonActive,
            )}
            onClick={() => onChange({ layout: "list" })}
            aria-label="Affichage liste"
            title="Liste"
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
              <path d="M8 6h13" />
              <path d="M8 12h13" />
              <path d="M8 18h13" />
              <circle cx="3" cy="6" r="1" />
              <circle cx="3" cy="12" r="1" />
              <circle cx="3" cy="18" r="1" />
            </svg>
          </button>
          <button
            type="button"
            className={cx(
              "icon-button",
              styles.cardToolbarButton,
              layout === "gallery" && styles.cardToolbarButtonActive,
            )}
            onClick={() => onChange({ layout: "gallery" })}
            aria-label="Affichage galerie"
            title="Galerie"
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
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
          <button
            type="button"
            className={cx(
              "icon-button",
              styles.cardToolbarButton,
              layout === "cards" && styles.cardToolbarButtonActive,
            )}
            onClick={() => onChange({ layout: "cards" })}
            aria-label="Affichage cartes"
            title="Cartes"
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
              <rect x="4" y="6" width="14" height="12" rx="2" />
              <rect x="8" y="2" width="12" height="10" rx="2" />
            </svg>
          </button>
        </div>
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
      <div
        className={cx(
          styles.cardList,
          layout === "list" && styles.cardListStack,
          layout === "gallery" && styles.cardListGallery,
          layout === "cards" && styles.cardListCarousel,
        )}
        style={
          layout === "list" || layout === "gallery"
            ? {
                maxHeight: "380px",
                overflowY: "auto",
                paddingRight: "6px",
              }
            : undefined
        }
      >
        {cards.map((card) => {
          const coverImage = card.backgroundImage || "";
          const hasCoverImage = Boolean(coverImage);
          const isExpanded = expandedCards.includes(card.id);
          const isList = layout === "list";
          const listExpanded = isList && isExpanded;
          const listCollapsed = isList && !isExpanded;
          return (
            <div
              key={card.id}
              className={cx(
                styles.cardItem,
                hasCoverImage && styles.cardItemHasImage,
                isExpanded && styles.cardItemExpanded,
              )}
              style={{
                backgroundColor: card.background || "rgba(255, 255, 255, 0.9)",
                backgroundImage: hasCoverImage ? `url(${coverImage})` : undefined,
                boxShadow: "0 3px 8px rgba(15, 23, 42, 0.22)",
                ...(isList
                  ? {
                      gridTemplateColumns: "140px minmax(0, 1fr)",
                      gridTemplateRows: "1fr",
                      columnGap: "12px",
                      rowGap: "0px",
                      minHeight: listExpanded ? "200px" : "116px",
                      padding: listExpanded ? "10px 12px" : "8px 12px",
                      height: listExpanded ? "200px" : "116px",
                    }
                  : null),
              }}
            >
              <div className={styles.cardItemOverlay} />
              <button
                type="button"
                className={cx("icon-button", styles.cardExpandButton)}
                onClick={() => toggleExpanded(card.id)}
                aria-label={isExpanded ? "Reduire la carte" : "Agrandir la carte"}
                title={isExpanded ? "Reduire" : "Agrandir"}
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
                  {isExpanded ? (
                    <>
                      <path d="M9 3H5v4" />
                      <path d="M15 21h4v-4" />
                      <path d="M21 15v4h-4" />
                      <path d="M3 9V5h4" />
                    </>
                  ) : (
                    <>
                      <path d="M9 3H5v4" />
                      <path d="M15 3h4v4" />
                      <path d="M9 21H5v-4" />
                      <path d="M15 21h4v-4" />
                    </>
                  )}
                </svg>
              </button>
              <div
                className={styles.cardItemHeader}
                style={
                  isList
                    ? {
                        position: "absolute",
                        top: "6px",
                        left: "12px",
                        right: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        textAlign: "left",
                      }
                    : undefined
                }
              >
                <div
                  className={styles.cardItemTitle}
                  style={isList ? { textAlign: "left" } : undefined}
                >
                  {card.title || "Intitule"}
                </div>
                {isList && (
                  <div
                    className={styles.cardItemActions}
                    style={{ marginLeft: "auto" }}
                  >
                    <button
                      type="button"
                      className={cx("icon-button", styles.cardItemAction)}
                      onClick={() => openPanel(card)}
                      aria-label="Modifier"
                      title="Modifier"
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
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={cx("icon-button", styles.cardItemAction)}
                      onClick={() => duplicateCard(card)}
                      aria-label="Dupliquer"
                      title="Dupliquer"
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
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <rect x="2" y="2" width="13" height="13" rx="2" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={cx("icon-button", styles.cardItemAction)}
                      onClick={() => deleteCard(card.id)}
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
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M6 6l1 14h10l1-14" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              <div
                className={styles.cardItemMedia}
                style={
                  isList
                    ? {
                        gridColumn: "1",
                        gridRow: "1",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: "6px",
                        alignSelf: listExpanded ? "flex-start" : "center",
                      }
                    : undefined
                }
              >
                <div className={styles.cardAvatar}>
                  {card.image ? (
                    <img src={card.image} alt="" className={styles.cardAvatarImage} />
                  ) : (
                    <span className={styles.cardAvatarPlaceholder}>+</span>
                  )}
                </div>
                {!isList && <div className={styles.cardItemActionsRow}>
                  <button
                    type="button"
                    className={cx("icon-button", styles.cardItemAction)}
                    onClick={() => openPanel(card)}
                    aria-label="Modifier"
                    title="Modifier"
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
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={cx("icon-button", styles.cardItemAction)}
                    onClick={() => duplicateCard(card)}
                    aria-label="Dupliquer"
                    title="Dupliquer"
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
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <rect x="2" y="2" width="13" height="13" rx="2" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={cx("icon-button", styles.cardItemAction)}
                    onClick={() => deleteCard(card.id)}
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
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M6 6l1 14h10l1-14" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  </button>
                </div>}
              </div>
              <div
                className={styles.cardItemBody}
                style={
                  isList
                    ? {
                        gridColumn: "2",
                        gridRow: "1",
                        display: "flex",
                        flexDirection: "row",
                        flexWrap: listExpanded ? "wrap" : "nowrap",
                        gap: "12px",
                        maxHeight: listExpanded ? "none" : "48px",
                        alignItems: listExpanded ? "flex-start" : "center",
                        overflowX: "hidden",
                        overflowY: "auto",
                        paddingBottom: listExpanded ? "0px" : "2px",
                        whiteSpace: listExpanded ? "normal" : "nowrap",
                        alignSelf: listExpanded ? "flex-start" : "center",
                        paddingTop: "16px",
                        maxHeight: listExpanded ? "110px" : "56px",
                        height: listExpanded ? "110px" : "56px",
                      }
                    : undefined
                }
              >
                {template.map((field) => (
                  <span
                    key={field.id}
                    className={styles.cardItemRow}
                    style={
                      isList
                        ? {
                            display: listExpanded ? "flex" : "inline-flex",
                            alignItems: "baseline",
                            gap: "6px",
                            whiteSpace: listExpanded ? "normal" : "nowrap",
                            flex: listExpanded ? "1 1 220px" : "0 0 auto",
                            minWidth: listExpanded ? "0" : undefined,
                          }
                        : undefined
                    }
                  >
                    <span
                      className={styles.cardItemLabel}
                      style={
                        isList
                          ? {
                              flex: "0 0 auto",
                              minWidth: "auto",
                              whiteSpace: "nowrap",
                            }
                          : undefined
                      }
                    >
                      {field.label || "Champ"}
                      {isList ? ":" : ""}
                    </span>
                    <span
                      className={styles.cardItemValue}
                      style={
                        isList
                          ? {
                              flex: listExpanded ? "1 1 auto" : "0 0 auto",
                              whiteSpace: listExpanded ? "normal" : "nowrap",
                              overflowWrap: listExpanded ? "anywhere" : "normal",
                              minWidth: listExpanded ? "0" : undefined,
                              maxWidth: listCollapsed ? "140px" : undefined,
                              overflow: listCollapsed ? "hidden" : undefined,
                              textOverflow: listCollapsed ? "ellipsis" : undefined,
                              display: listCollapsed ? "inline-block" : undefined,
                            }
                          : undefined
                      }
                    >
                      {card.values?.[field.id] || "—"}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {panelOpen && draft && (
        <div
          className={cx("panel-glass", styles.cardPanel, styles.cardPanelCentered)}
          ref={panelRef}
          style={{ position: "fixed", top: "50%", left: "50%" }}
        >
          <div className={styles.cardPanelHeader}>
            <div className={styles.cardPanelTitle}>
              {editingId ? "Modifier la carte" : "Nouvelle carte"}
            </div>
            <select
              className={styles.cardLayoutSelect}
              value={layout}
              onChange={(event) => onChange({ layout: event.target.value as SummaryBlock["layout"] })}
            >
              <option value="list">Liste</option>
              <option value="gallery">Galerie</option>
              <option value="cards">Cartes</option>
            </select>
            {editingId && (
              <button
                type="button"
                className={styles.cardPanelIconButton}
                onClick={deleteEditingCard}
                aria-label="Supprimer la carte"
                title="Supprimer la carte"
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
          <div className={styles.cardPanelRow}>
            <label className={styles.cardPanelImage}>
              {draft.image ? (
                <img src={draft.image} alt="" className={styles.cardImagePreview} />
              ) : (
                <span className={styles.cardImagePlaceholder}>+</span>
              )}
              <input
                type="file"
                accept="image/*"
                className={styles.cardHiddenInput}
                onChange={handleImageFile}
              />
            </label>
            <div className={styles.cardPanelFields}>
              <input
                type="text"
                className={styles.cardPanelInput}
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Intitule"
              />
              <div className={styles.cardPanelInline}>
                <input
                  type="color"
                  className={styles.cardPanelColor}
                  value={draft.background || "#f2f2f2"}
                  onChange={(event) => setDraft({ ...draft, background: event.target.value })}
                />
                <label className={styles.cardPanelUpload}>
                  Fond image
                  <input
                    type="file"
                    accept="image/*"
                    className={styles.cardHiddenInput}
                    onChange={handleBackgroundImage}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className={styles.cardPanelSection}>
            <div className={styles.cardPanelSectionHeader}>
              <span>Champs</span>
              <button type="button" className={styles.cardPanelAdd} onClick={addTemplateField}>
                +
              </button>
            </div>
            {template.length === 0 && (
              <div className={styles.cardPanelHint}>
                Clique sur + pour ajouter un champ.
              </div>
            )}
            {template.map((field) => (
              <div key={field.id} className={styles.cardPanelFieldRow}>
                <input
                  type="text"
                  className={styles.cardPanelInput}
                  value={field.label}
                  onChange={(event) => updateTemplateLabel(field.id, event.target.value)}
                  placeholder="Nom du champ"
                />
                <button
                  type="button"
                  className={styles.cardPanelRemove}
                  onClick={() => removeTemplateField(field.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className={styles.cardPanelSection}>
            <div className={styles.cardPanelSectionHeader}>
              <span>Valeurs</span>
            </div>
            {template.length === 0 && (
              <div className={styles.cardPanelHint}>
                Ajoute d’abord des champs.
              </div>
            )}
            {template.map((field) => (
              <div key={`${field.id}-value`} className={styles.cardPanelFieldRow}>
                <span className={styles.cardPanelFieldLabel}>{field.label || "Champ"}</span>
                <textarea
                  className={styles.cardPanelTextarea}
                  value={draft.values[field.id] ?? ""}
                  onChange={(event) => updateDraftFieldValue(field.id, event.target.value)}
                  placeholder="Valeur"
                  rows={Math.min(6, Math.max(2, (draft.values[field.id] ?? "").split("\n").length))}
                />
              </div>
            ))}
          </div>

          <div className={styles.cardPanelActions}>
            <button
              type="button"
              className={styles.cardPanelButton}
              onClick={() => {
                setPanelOpen(false);
                setEditingId(null);
                setDraft(null);
              }}
            >
              Fermer
            </button>
            <button type="button" className={styles.cardPanelButtonPrimary} onClick={saveCard}>
              Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
