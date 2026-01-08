"use client";

import { useEffect, useId, useRef, useState } from "react";
import { HighlightIcon, PaletteIcon } from "./icons";
import styles from "./SummaryRichTextEditor.module.css";

type SummaryRichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onDelete?: () => void;
  letterSpacing?: string;
  onLetterSpacingChange?: (value: string) => void;
  placeholder?: string;
};

const FONT_OPTIONS = [
  { label: "Geist", value: "Geist" },
  { label: "Georgia", value: "Georgia" },
  { label: "Times", value: "Times New Roman" },
  { label: "Mono", value: "Courier New" },
] as const;

const FONT_SIZES = [
  { label: "10", value: "1" },
  { label: "12", value: "2" },
  { label: "14", value: "3" },
  { label: "16", value: "4" },
  { label: "18", value: "5" },
  { label: "20", value: "6" },
  { label: "24", value: "7" },
] as const;

export default function SummaryRichTextEditor({
  value,
  onChange,
  onDelete,
  letterSpacing = "normal",
  onLetterSpacingChange,
  placeholder = "Texte",
}: SummaryRichTextEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null);
  const emojiRef = useRef<HTMLDivElement | null>(null);
  const emojiTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dateRef = useRef<HTMLDivElement | null>(null);
  const dateTriggerRef = useRef<HTMLButtonElement | null>(null);
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const highlightInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const selectionRef = useRef<Range | null>(null);
  const isApplyingExternalValueRef = useRef(false);
  const lastEmittedHtmlRef = useRef<string | null>(null);
  const draggingImageIdRef = useRef<string | null>(null);
  const pointerDraggingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const resizingImageIdRef = useRef<string | null>(null);
  const resizeStartRef = useRef<{ width: number; height: number; x: number; y: number }>({
    width: 0,
    height: 0,
    x: 0,
    y: 0,
  });
  const [listStyle, setListStyle] = useState("disc");
  const [customMarker, setCustomMarker] = useState("•");
  const [moreOpen, setMoreOpen] = useState(false);
  const [morePosition, setMorePosition] = useState<{ top: number; left: number } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiPosition, setEmojiPosition] = useState<{ top: number; left: number } | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [datePosition, setDatePosition] = useState<{ top: number; left: number } | null>(null);
  const [dateValue, setDateValue] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [toolbarActive, setToolbarActive] = useState(false);
  const [toolbarHover, setToolbarHover] = useState(false);
  const fontFamilyId = useId();
  const fontSizeId = useId();
  const listStyleId = useId();
  const spacingId = useId();
  const EMOJIS = [
    "🙂",
    "😀",
    "😎",
    "😇",
    "🥳",
    "🤝",
    "✅",
    "☑️",
    "⭐",
    "🌟",
    "🔥",
    "⚡",
    "💡",
    "📌",
    "📍",
    "🧠",
    "📝",
    "📚",
    "📅",
    "⏰",
    "📎",
    "🔗",
    "🧩",
    "🧭",
    "🧪",
    "🧱",
    "🎯",
    "🚀",
    "🏁",
    "📈",
    "📊",
    "🧾",
    "🗂️",
    "🗒️",
    "🖊️",
    "✏️",
    "🔍",
    "🛠️",
    "🧰",
    "💬",
    "❗",
    "❓",
    "⚠️",
    "🟢",
    "🟡",
    "🔴",
  ];

  const normalizeHtml = (html: string) => {
    const trimmed = (html || "").trim();
    if (!trimmed) return "";
    const normalized = trimmed
      .replace(/&nbsp;/gi, " ")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return "";
    if (/<img\b|<video\b|<audio\b|<iframe\b|<svg\b/i.test(normalized)) {
      return normalized;
    }
    const stripped = normalized
      .replace(/<br\s*\/?>/gi, "")
      .replace(/<\/?p[^>]*>/gi, "")
      .replace(/<\/?div[^>]*>/gi, "")
      .replace(/<\/?span[^>]*>/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!stripped) return "";
    return normalized;
  };

  const insertText = (text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    restoreSelection();
    document.execCommand("insertText", false, text);
    syncValue();
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (document.activeElement === editor) return;
    const normalizedNext = normalizeHtml(value || "");
    const normalizedCurrent = normalizeHtml(editor.innerHTML || "");
    if (normalizedNext === normalizedCurrent) return;
    isApplyingExternalValueRef.current = true;
    editor.innerHTML = value || "";
    requestAnimationFrame(() => {
      isApplyingExternalValueRef.current = false;
    });
  }, [value]);

  useEffect(() => {
    if (!moreOpen) return;
    const handleOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (moreRef.current?.contains(target)) return;
      if (moreTriggerRef.current?.contains(target)) return;
      setMoreOpen(false);
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, [moreOpen]);

  useEffect(() => {
    if (!emojiOpen) return;
    const handleOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (emojiRef.current?.contains(target)) return;
      if (emojiTriggerRef.current?.contains(target)) return;
      setEmojiOpen(false);
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, [emojiOpen]);

  useEffect(() => {
    if (!dateOpen) return;
    const handleOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (dateRef.current?.contains(target)) return;
      if (dateTriggerRef.current?.contains(target)) return;
      setDateOpen(false);
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, [dateOpen]);

  useEffect(() => {
    if (!moreOpen) {
      setLinkOpen(false);
      setLinkDraft("");
    }
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) {
      setMorePosition(null);
      return;
    }
    const updatePosition = () => {
      const trigger = moreTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const panelWidth = 220;
      const left = Math.min(
        Math.max(16, rect.left + rect.width / 2 - panelWidth / 2),
        window.innerWidth - panelWidth - 16,
      );
      setMorePosition({ top: rect.bottom + 6, left });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!emojiOpen) {
      setEmojiPosition(null);
      return;
    }
    const updatePosition = () => {
      const trigger = emojiTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const panelWidth = 160;
      const left = Math.min(
        Math.max(16, rect.left + rect.width / 2 - panelWidth / 2),
        window.innerWidth - panelWidth - 16,
      );
      setEmojiPosition({ top: rect.bottom + 6, left });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [emojiOpen]);

  useEffect(() => {
    if (!dateOpen) {
      setDatePosition(null);
      return;
    }
    const updatePosition = () => {
      const trigger = dateTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const panelWidth = 200;
      const left = Math.min(
        Math.max(16, rect.left + rect.width / 2 - panelWidth / 2),
        window.innerWidth - panelWidth - 16,
      );
      setDatePosition({ top: rect.bottom + 6, left });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [dateOpen]);

  const syncValue = () => {
    const editor = editorRef.current;
    if (!editor) return;
    if (isApplyingExternalValueRef.current) return;
    const currentHtml = editor.innerHTML;
    const normalized = normalizeHtml(currentHtml);
    const normalizedProp = normalizeHtml(value);
    if (normalized === normalizedProp) return;
    const lastEmitted = lastEmittedHtmlRef.current;
    if (lastEmitted !== null && normalizeHtml(lastEmitted) === normalized) return;
    lastEmittedHtmlRef.current = currentHtml;
    onChange(currentHtml);
  };

  const captureSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    selectionRef.current = selection.getRangeAt(0);
  };

  const restoreSelection = () => {
    const selection = window.getSelection();
    if (!selection || !selectionRef.current) return;
    selection.removeAllRanges();
    selection.addRange(selectionRef.current);
  };

  const runCommand = (command: string, commandValue?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    restoreSelection();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, commandValue);
    syncValue();
  };

  const getSelectionList = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    let node: Node | null = selection.getRangeAt(0).startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentNode;
    }
    while (node && node !== editorRef.current) {
      if (node instanceof HTMLOListElement || node instanceof HTMLUListElement) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  };

  const ensureList = (desiredTag: "OL" | "UL") => {
    const list = getSelectionList();
    if (list) return list;
    runCommand(desiredTag === "OL" ? "insertOrderedList" : "insertUnorderedList");
    return getSelectionList();
  };

  const getSelectedListItems = () => {
    const editor = editorRef.current;
    if (!editor) return [];
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return [];
    const range = selection.getRangeAt(0);
    const items = Array.from(editor.querySelectorAll("li"));
    const selected = items.filter((item) => {
      try {
        return range.intersectsNode(item);
      } catch {
        return false;
      }
    });
    if (selected.length > 0) return selected;
    let node: Node | null = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentNode;
    }
    while (node && node !== editor) {
      if (node instanceof HTMLLIElement) return [node];
      node = node.parentNode;
    }
    return [];
  };

  const applyStyleToList = (list: HTMLElement, style: string, marker?: string) => {
    const orderedStyles = ["decimal", "upper-roman", "lower-roman", "upper-alpha", "lower-alpha"];
    const isOrdered = orderedStyles.includes(style);
    if (isOrdered) {
      list.style.listStyleType = style;
      list.removeAttribute("data-list-style");
      list.style.removeProperty("--list-marker");
      return;
    }
    if (style === "dash" || style === "star" || style === "custom") {
      list.style.listStyleType = "none";
      list.setAttribute("data-list-style", style);
      if (style === "custom") {
        const safeMarker = (marker ?? "•").replace(/["\\]/g, "");
        list.style.setProperty("--list-marker", `"${safeMarker} "`);
      } else {
        list.style.removeProperty("--list-marker");
      }
      return;
    }
    list.style.listStyleType = style;
    list.removeAttribute("data-list-style");
    list.style.removeProperty("--list-marker");
  };

  const splitListForSelection = (
    list: HTMLElement,
    selectedItems: HTMLLIElement[],
    desiredTag: "OL" | "UL",
    style: string,
    marker?: string,
  ) => {
    const parent = list.parentNode;
    if (!parent) return;
    const allItems = Array.from(list.children).filter(
      (child): child is HTMLLIElement => child.tagName === "LI",
    );
    const directSelected = selectedItems.filter((item) => item.parentElement === list);
    if (directSelected.length === 0) return;
    const indices = directSelected
      .map((item) => allItems.indexOf(item))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b);
    if (indices.length === 0) return;
    const startIndex = indices[0];
    const endIndex = indices[indices.length - 1];
    const beforeItems = allItems.slice(0, startIndex);
    const selectedRange = allItems.slice(startIndex, endIndex + 1);
    const afterItems = allItems.slice(endIndex + 1);

    const desiredTagLower = desiredTag.toLowerCase();
    const sameTag = list.tagName === desiredTag;
    const useExistingForSelected = beforeItems.length === 0 && sameTag;
    const selectedList = useExistingForSelected
      ? list
      : document.createElement(desiredTagLower);

    selectedRange.forEach((item) => selectedList.appendChild(item));

    let afterList: HTMLElement | null = null;
    if (afterItems.length > 0) {
      afterList = document.createElement(list.tagName.toLowerCase());
      afterItems.forEach((item) => afterList?.appendChild(item));
    }

    if (beforeItems.length === 0 && selectedList !== list) {
      parent.insertBefore(selectedList, list);
      parent.removeChild(list);
    } else if (beforeItems.length > 0 && selectedList !== list) {
      parent.insertBefore(selectedList, list.nextSibling);
    }

    if (afterList) {
      parent.insertBefore(afterList, selectedList.nextSibling);
    }

    applyStyleToList(selectedList, style, marker);
  };

  const applyListStyle = (style: string, marker?: string) => {
    const editor = editorRef.current;
    if (editor) {
      editor.focus();
      restoreSelection();
    }
    const orderedStyles = ["decimal", "upper-roman", "lower-roman", "upper-alpha", "lower-alpha"];
    const desiredTag: "OL" | "UL" = orderedStyles.includes(style) ? "OL" : "UL";
    const list = ensureList(desiredTag);
    if (!list) return;
    const items = getSelectedListItems();
    if (items.length === 0) return;
    const lists = new Set<HTMLElement>();
    items.forEach((item) => {
      const parentList = item.closest("ol, ul") as HTMLElement | null;
      if (parentList) lists.add(parentList);
    });
    lists.forEach((listEl) => splitListForSelection(listEl, items, desiredTag, style, marker));
    syncValue();
  };

  const insertLink = () => {
    const url = linkDraft.trim();
    if (!url) return;
    runCommand("createLink", url);
    setLinkDraft("");
    setLinkOpen(false);
  };

  const insertImageHtml = (src: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    restoreSelection();
    const safeSrc = src.replace(/"/g, "&quot;");
    const imageId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const editorRect = editor.getBoundingClientRect();
    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const rect = range?.getBoundingClientRect();
    const fallbackLeft = 12;
    const fallbackTop = editor.scrollTop + 12;
    const left = rect ? rect.left - editorRect.left + editor.scrollLeft : fallbackLeft;
    const top = rect ? rect.top - editorRect.top + editor.scrollTop : fallbackTop;
    const html = `<span class="${styles.editorImageWrap}" data-editor-image-id="${imageId}" data-floating="true" contenteditable="false" draggable="false" style="left:${Math.max(
      0,
      Math.round(left),
    )}px; top:${Math.max(0, Math.round(top))}px; width:160px;">
      <span class="${styles.imageControls}" contenteditable="false">
        <span class="${styles.imageControlButton}" data-editor-image-action="move" role="button" aria-label="Deplacer">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 11V8a3 3 0 0 1 6 0v3" />
            <path d="M13 11V9a2 2 0 0 1 4 0v2" />
            <path d="M7 11v6a3 3 0 0 0 6 0v-2" />
            <path d="M13 13v4a2 2 0 0 0 4 0v-1" />
            <path d="M17 11v5a2 2 0 0 0 4 0v-3" />
          </svg>
        </span>
        <span class="${styles.imageControlButton}" data-editor-image-action="delete" role="button" aria-label="Supprimer">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M6 6l1 14h10l1-14" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </span>
      </span>
      <span class="${styles.imageResizeHandle}" data-editor-image-action="resize" aria-hidden="true"></span>
      <img class="${styles.editorImage}" src="${safeSrc}" alt="" />
    </span>&nbsp;`;
    document.execCommand("insertHTML", false, html);
    syncValue();
  };

  const ensureTrailingSpace = (node: Element) => {
    const next = node.nextSibling;
    if (next && next.nodeType === Node.TEXT_NODE) {
      const text = next.textContent ?? "";
      if (!text.startsWith(" ")) {
        next.textContent = ` ${text}`;
      }
      return;
    }
    node.after(document.createTextNode(" "));
  };

  const handleImageFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result) {
        insertImageHtml(result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const getRangeFromPoint = (x: number, y: number) => {
    if (document.caretRangeFromPoint) {
      return document.caretRangeFromPoint(x, y);
    }
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (!pos) return null;
      const range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
      return range;
    }
    return null;
  };

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const wrapper = target.closest(`.${styles.editorImageWrap}`) as HTMLElement | null;
    if (!wrapper) return;
    const imageId = wrapper.getAttribute("data-editor-image-id");
    if (!imageId) return;
    draggingImageIdRef.current = imageId;
    event.dataTransfer.setData("text/x-editor-image", imageId);
    event.dataTransfer.setData("text/plain", imageId);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!draggingImageIdRef.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const imageId =
      event.dataTransfer.getData("text/x-editor-image") ||
      event.dataTransfer.getData("text/plain") ||
      draggingImageIdRef.current;
    if (!imageId) return;
    const editor = editorRef.current;
    if (!editor) return;
    event.preventDefault();
    const wrapper = editor.querySelector(`[data-editor-image-id="${imageId}"]`);
    if (!wrapper) return;
    const range = getRangeFromPoint(event.clientX, event.clientY);
    if (!range) return;
    range.collapse(true);
    range.insertNode(wrapper);
    ensureTrailingSpace(wrapper);
    syncValue();
    draggingImageIdRef.current = null;
  };
  const handleDragEnd = () => {
    draggingImageIdRef.current = null;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const actionTarget = target.closest("[data-editor-image-action]") as HTMLElement | null;
    const wrapper = target.closest(`.${styles.editorImageWrap}`) as HTMLElement | null;
    if (!wrapper) return;
    const imageId = wrapper.getAttribute("data-editor-image-id");
    if (!imageId) return;
    const editor = editorRef.current;
    if (!editor) return;
    const rect = wrapper.getBoundingClientRect();
    setActiveImage(wrapper);
    if (actionTarget) {
      const action = actionTarget.getAttribute("data-editor-image-action");
      if (action === "delete") {
        return;
      }
      if (action === "resize") {
        resizingImageIdRef.current = imageId;
        pointerDraggingRef.current = false;
        resizeStartRef.current = {
          width: rect.width,
          height: rect.height,
          x: event.clientX,
          y: event.clientY,
        };
        activePointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
    }
    draggingImageIdRef.current = imageId;
    pointerDraggingRef.current = true;
    dragOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const editor = editorRef.current;
    if (!editor) return;
    if (resizingImageIdRef.current && activePointerIdRef.current === event.pointerId) {
      const imageId = resizingImageIdRef.current;
      const wrapper = editor.querySelector(`[data-editor-image-id="${imageId}"]`) as HTMLElement | null;
      if (!wrapper) return;
      const start = resizeStartRef.current;
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      const nextWidth = Math.max(80, start.width + deltaX);
      const nextHeight = Math.max(60, start.height + deltaY);
      wrapper.style.width = `${Math.round(nextWidth)}px`;
      wrapper.style.height = `${Math.round(nextHeight)}px`;
      event.preventDefault();
      return;
    }
    if (!pointerDraggingRef.current || activePointerIdRef.current !== event.pointerId) return;
    const imageId = draggingImageIdRef.current;
    if (!imageId) return;
    const wrapper = editor.querySelector(`[data-editor-image-id="${imageId}"]`);
    if (!wrapper) return;
    const editorRect = editor.getBoundingClientRect();
    const offset = dragOffsetRef.current;
    const nextLeft = event.clientX - editorRect.left + editor.scrollLeft - offset.x;
    const nextTop = event.clientY - editorRect.top + editor.scrollTop - offset.y;
    const maxLeft = Math.max(0, editor.scrollWidth - wrapper.getBoundingClientRect().width);
    const maxTop = Math.max(0, editor.scrollHeight - wrapper.getBoundingClientRect().height);
    wrapper.setAttribute("data-floating", "true");
    wrapper.style.left = `${Math.max(0, Math.min(nextLeft, maxLeft))}px`;
    wrapper.style.top = `${Math.max(0, Math.min(nextTop, maxTop))}px`;
    event.preventDefault();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const editor = editorRef.current;
    if (!editor) return;
    const target = event.target as HTMLElement | null;
    const wrapperFromTarget = target?.closest(`.${styles.editorImageWrap}`) as HTMLElement | null;
    const imageId = draggingImageIdRef.current;
    const wrapper =
      (imageId && editor.querySelector(`[data-editor-image-id="${imageId}"]`)) ||
      wrapperFromTarget;
    if (wrapper instanceof HTMLElement) {
      const editorRect = editor.getBoundingClientRect();
      const rect = wrapper.getBoundingClientRect();
      const left = rect.left - editorRect.left + editor.scrollLeft;
      const top = rect.top - editorRect.top + editor.scrollTop;
      wrapper.style.left = `${Math.max(0, Math.round(left))}px`;
      wrapper.style.top = `${Math.max(0, Math.round(top))}px`;
      wrapper.style.width = `${Math.round(rect.width)}px`;
      wrapper.style.height = `${Math.round(rect.height)}px`;
      ensureTrailingSpace(wrapper);
      syncValue();
    }
    if (activePointerIdRef.current === event.pointerId) {
      pointerDraggingRef.current = false;
      resizingImageIdRef.current = null;
      activePointerIdRef.current = null;
      draggingImageIdRef.current = null;
    }
  };

  const setActiveImage = (wrapper: HTMLElement) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor
      .querySelectorAll(`.${styles.editorImageWrap}[data-active="true"]`)
      .forEach((node) => node.removeAttribute("data-active"));
    wrapper.setAttribute("data-active", "true");
  };

  const clearActiveImages = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor
      .querySelectorAll(`.${styles.editorImageWrap}[data-active="true"]`)
      .forEach((node) => node.removeAttribute("data-active"));
  };

  const handleEditorClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const action = target.closest("[data-editor-image-action]") as HTMLElement | null;
    if (action) {
      const actionType = action.getAttribute("data-editor-image-action");
      const wrapper = action.closest(`.${styles.editorImageWrap}`) as HTMLElement | null;
      if (!wrapper) return;
      if (actionType === "delete") {
        wrapper.remove();
        syncValue();
      } else if (actionType === "move") {
        setActiveImage(wrapper);
      }
      event.preventDefault();
      return;
    }
    const wrapper = target.closest(`.${styles.editorImageWrap}`) as HTMLElement | null;
    if (wrapper) {
      setActiveImage(wrapper);
      return;
    }
    clearActiveImages();
  };

  useEffect(() => {
    if (!toolbarActive) return;
    const handleOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      setToolbarActive(false);
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, [toolbarActive]);

  const showToolbar = toolbarActive || toolbarHover || moreOpen || emojiOpen || dateOpen || linkOpen;

  return (
    <div
      ref={rootRef}
      className={styles.editorRoot}
      onPointerEnter={() => setToolbarHover(true)}
      onPointerLeave={() => setToolbarHover(false)}
      onPointerDown={() => setToolbarActive(true)}
    >
      <div
        className={styles.toolbar}
        style={{
          opacity: showToolbar ? 1 : 0,
          pointerEvents: showToolbar ? "auto" : "none",
          transition: "opacity 0.2s ease",
        }}
      >
        <button
          type="button"
          className={`${styles.toolButton} btn-plain`}
          aria-label="Gras"
          title="Gras"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand("bold")}
        >
          <span className={styles.toolText}>B</span>
        </button>
        <button
          type="button"
          className={`${styles.toolButton} btn-plain`}
          aria-label="Italique"
          title="Italique"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand("italic")}
        >
          <span className={styles.toolItalic}>I</span>
        </button>
        <button
          type="button"
          className={`${styles.toolButton} btn-plain`}
          aria-label="Souligner"
          title="Souligner"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand("underline")}
        >
          <span className={styles.toolUnderline}>U</span>
        </button>
        <button
          type="button"
          className={`${styles.toolButton} btn-plain`}
          aria-label="Liste à puces"
          title="Liste à puces"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand("insertUnorderedList")}
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
            <circle cx="5" cy="7" r="1.5" />
            <circle cx="5" cy="12" r="1.5" />
            <circle cx="5" cy="17" r="1.5" />
            <path d="M9 7h10" />
            <path d="M9 12h10" />
            <path d="M9 17h10" />
          </svg>
        </button>
        <button
          type="button"
          className={`${styles.toolButton} btn-plain`}
          aria-label="Aligner à gauche"
          title="Aligner à gauche"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand("justifyLeft")}
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
            <path d="M4 6h16" />
            <path d="M4 12h10" />
            <path d="M4 18h14" />
          </svg>
        </button>
        <button
          type="button"
          className={`${styles.toolButton} btn-plain`}
          aria-label="Centrer"
          title="Centrer"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand("justifyCenter")}
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
            <path d="M4 6h16" />
            <path d="M7 12h10" />
            <path d="M6 18h12" />
          </svg>
        </button>
        <button
          type="button"
          className={`${styles.toolButton} btn-plain`}
          aria-label="Aligner à droite"
          title="Aligner à droite"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand("justifyRight")}
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
            <path d="M4 6h16" />
            <path d="M10 12h10" />
            <path d="M6 18h14" />
          </svg>
        </button>
        <button
          type="button"
          className={`${styles.toolButton} ${styles.colorButton} btn-plain`}
          aria-label="Couleur du texte"
          title="Couleur du texte"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => colorInputRef.current?.click()}
        >
          <PaletteIcon size={10} />
          <input
            type="color"
            className={styles.colorInput}
            ref={colorInputRef}
            onChange={(event) => runCommand("foreColor", event.target.value)}
          />
        </button>
        <button
          type="button"
          className={`${styles.toolButton} ${styles.colorButton} btn-plain`}
          aria-label="Surlignage"
          title="Surlignage"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => highlightInputRef.current?.click()}
        >
          <HighlightIcon size={10} />
          <input
            type="color"
            className={styles.colorInput}
            ref={highlightInputRef}
            onChange={(event) => runCommand("hiliteColor", event.target.value)}
          />
        </button>
        <button
          type="button"
          className={`${styles.toolButton} btn-plain`}
          aria-label="Insérer une date"
          title="Insérer une date"
          onMouseDown={(event) => {
            event.preventDefault();
            captureSelection();
          }}
          onClick={() => setDateOpen((prev) => !prev)}
          ref={dateTriggerRef}
        >
          <svg
            aria-hidden="true"
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M8 2v4" />
            <path d="M16 2v4" />
            <path d="M3 10h18" />
          </svg>
        </button>
        <button
          type="button"
          className={`${styles.toolButton} btn-plain`}
          aria-label="Insérer l'heure"
          title="Insérer l'heure"
          onMouseDown={(event) => {
            event.preventDefault();
            captureSelection();
          }}
          onClick={() =>
            insertText(
              new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
            )
          }
        >
          <svg
            aria-hidden="true"
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l4 2" />
          </svg>
        </button>
        <button
          type="button"
          className={`${styles.toolButton} btn-plain`}
          aria-label="Emoji"
          title="Emoji"
          onMouseDown={(event) => {
            event.preventDefault();
            captureSelection();
          }}
          onClick={() => setEmojiOpen((prev) => !prev)}
          ref={emojiTriggerRef}
        >
          <svg
            aria-hidden="true"
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <circle cx="9" cy="10" r="1" />
            <circle cx="15" cy="10" r="1" />
          </svg>
        </button>
        <button
          type="button"
          className={`${styles.toolButton} btn-plain`}
          aria-label="Plus d'options"
          title="Plus d'options"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setMoreOpen((prev) => !prev)}
          ref={moreTriggerRef}
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
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div className={styles.toolSpacer} />
        {onDelete && (
          <button
            type="button"
            className={`${styles.toolButton} btn-plain`}
            aria-label="Supprimer le bloc"
            title="Supprimer le bloc"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onDelete}
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
        {moreOpen && (
          <div
            className={`${styles.morePanel} panel-glass`}
            ref={moreRef}
            style={morePosition ? { position: "fixed", top: morePosition.top, left: morePosition.left } : undefined}
          >
            <div className={styles.moreRow}>
              <label className={styles.moreLabel} htmlFor={fontFamilyId}>
                Police
              </label>
              <select
                id={fontFamilyId}
                className={styles.moreSelect}
                onChange={(event) => runCommand("fontName", event.target.value)}
                defaultValue={FONT_OPTIONS[0].value}
              >
                {FONT_OPTIONS.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.moreRow}>
              <label className={styles.moreLabel} htmlFor={fontSizeId}>
                Taille
              </label>
              <select
                id={fontSizeId}
                className={styles.moreSelect}
                onChange={(event) => runCommand("fontSize", event.target.value)}
                defaultValue={FONT_SIZES[2].value}
              >
                {FONT_SIZES.map((size) => (
                  <option key={size.value} value={size.value}>
                    {size.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.moreRow}>
              <label className={styles.moreLabel} htmlFor={listStyleId}>
                Liste
              </label>
              <select
                id={listStyleId}
                className={styles.moreSelect}
                value={listStyle}
                onChange={(event) => {
                  const next = event.target.value;
                  setListStyle(next);
                  applyListStyle(next, customMarker);
                }}
              >
                <option value="disc">Puces</option>
                <option value="circle">Cercles</option>
                <option value="square">Carrés</option>
                <option value="dash">Tirets</option>
                <option value="star">Étoiles</option>
                <option value="decimal">Numéros</option>
                <option value="upper-roman">Romains</option>
                <option value="upper-alpha">Lettres</option>
                <option value="custom">Personnalisé</option>
              </select>
            </div>
            {listStyle === "custom" && (
              <div className={styles.moreRow}>
                <label className={styles.moreLabel}>Symbole</label>
                <input
                  type="text"
                  className={styles.moreInput}
                  value={customMarker}
                  maxLength={2}
                  onChange={(event) => {
                    const next = event.target.value || "•";
                    setCustomMarker(next);
                    applyListStyle("custom", next);
                  }}
                />
              </div>
            )}
            <div className={styles.moreRow}>
              <label className={styles.moreLabel} htmlFor={spacingId}>
                Espacement
              </label>
              <select
                id={spacingId}
                className={styles.moreSelect}
                value={letterSpacing}
                onChange={(event) => {
                  const next = event.target.value;
                  if (onLetterSpacingChange) {
                    onLetterSpacingChange(next);
                  }
                }}
              >
                <option value="normal">Normal</option>
                <option value="0.02em">Léger</option>
                <option value="0.05em">Large</option>
                <option value="0.08em">Très large</option>
              </select>
            </div>
            <div className={styles.moreRow}>
              <label className={styles.moreLabel}>Lien</label>
              <button
                type="button"
                className={`${styles.moreActionButton} btn-plain`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setLinkOpen((prev) => !prev)}
              >
                +
              </button>
            </div>
            {linkOpen && (
              <div className={styles.moreExpandedRow}>
                <input
                  type="text"
                  className={styles.moreInput}
                  value={linkDraft}
                  onChange={(event) => setLinkDraft(event.target.value)}
                  placeholder="https://"
                />
                <button
                  type="button"
                  className={`${styles.moreAction} btn-plain`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={insertLink}
                >
                  OK
                </button>
              </div>
            )}
            <div className={styles.moreRow}>
              <label className={styles.moreLabel}>Image</label>
              <button
                type="button"
                className={`${styles.moreActionButton} btn-plain`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => imageInputRef.current?.click()}
              >
                +
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={handleImageFile}
              />
            </div>
            <button
              type="button"
              className={`${styles.clearButton} btn-plain`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runCommand("removeFormat")}
            >
              Effacer la mise en forme
            </button>
          </div>
        )}
        {emojiOpen && (
          <div
            className={`${styles.emojiPanel} panel-glass`}
            ref={emojiRef}
            style={emojiPosition ? { position: "fixed", top: emojiPosition.top, left: emojiPosition.left } : undefined}
          >
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`${styles.emojiButton} btn-plain`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  insertText(emoji);
                  setEmojiOpen(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        {dateOpen && (
          <div
            className={`${styles.datePanel} panel-glass`}
            ref={dateRef}
            style={datePosition ? { position: "fixed", top: datePosition.top, left: datePosition.left } : undefined}
          >
            <input
              type="date"
              className={styles.dateInput}
              value={dateValue}
              onChange={(event) => setDateValue(event.target.value)}
            />
            <button
              type="button"
              className={`${styles.dateAction} btn-plain`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (!dateValue) return;
                const date = new Date(`${dateValue}T00:00:00`);
                insertText(date.toLocaleDateString("fr-FR"));
                setDateOpen(false);
              }}
            >
              OK
            </button>
          </div>
        )}
      </div>
      <div
        ref={editorRef}
        className={styles.editorArea}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        style={{ letterSpacing }}
        onInput={syncValue}
        onKeyUp={captureSelection}
        onMouseUp={captureSelection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleEditorClick}
      />
    </div>
  );
}
