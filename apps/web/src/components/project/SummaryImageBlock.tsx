"use client";

import { useEffect, useRef, useState } from "react";
import type { SummaryBlock, SummaryImageEntry } from "@/store/projectStore";
import styles from "./ProjectEditor.module.css";

type SummaryImageBlockProps = {
  block: SummaryBlock;
  onChange: (patch: Partial<SummaryBlock>) => void;
  onDelete?: () => void;
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

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

export default function SummaryImageBlock({ block, onChange, onDelete }: SummaryImageBlockProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blockRef = useRef<HTMLDivElement | null>(null);
  const rawImages = block.images ?? [];
  const needsNormalize = rawImages.some((item) => typeof item === "string");
  const images: SummaryImageEntry[] = rawImages.map((item) =>
    typeof item === "string" ? { src: item, title: "" } : item,
  );
  const layout = block.layout === "carousel" || block.layout === "gallery" ? block.layout : "gallery";
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [blockActive, setBlockActive] = useState(false);
  const [blockHovered, setBlockHovered] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  useEffect(() => {
    if (!block.layout) {
      onChange({ layout: "gallery" });
    }
  }, [block.layout, onChange]);

  useEffect(() => {
    if (needsNormalize) {
      onChange({ images });
    }
  }, [needsNormalize, onChange]);

  useEffect(() => {
    if (!blockActive && activeIndex === null) return;
    const handleOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (blockRef.current?.contains(target)) return;
      setActiveIndex(null);
      setBlockActive(false);
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, [blockActive, activeIndex]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: SummaryImageEntry[] = [];
    for (const file of Array.from(files)) {
      const dataUrl = await readImageDataUrl(file, 1400, 0.78);
      if (dataUrl) next.push({ src: dataUrl, title: "" });
    }
    if (next.length > 0) {
      onChange({ images: [...images, ...next] });
    }
  };

  const removeImage = (index: number) => {
    const next = images.filter((_, i) => i !== index);
    onChange({ images: next });
  };

  const startEditTitle = (index: number) => {
    setEditingIndex(index);
    setTitleDraft(images[index]?.title ?? "");
  };

  const commitTitle = (index: number) => {
    const next = images.map((item, i) =>
      i === index ? { ...item, title: titleDraft.trim() } : item,
    );
    onChange({ images: next });
    setEditingIndex(null);
  };

  const isCarousel = layout === "carousel";
  const gallerySize = 130;
  const layoutStyle =
    isCarousel
      ? {
          display: "flex",
          gap: "12px",
          overflowX: "auto",
          overflowY: "hidden",
          padding: "10px 12px",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
        }
      : {
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill, minmax(${gallerySize}px, ${gallerySize}px))`,
          gap: "12px",
          width: "100%",
          maxHeight: "320px",
          overflowY: "auto",
          paddingRight: "6px",
          alignContent: "start",
          justifyContent: "start",
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
          onClick={() => inputRef.current?.click()}
          aria-label="Ajouter une image"
          title="Ajouter une image"
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
              layout === "carousel" && styles.cardToolbarButtonActive,
            )}
            onClick={() => onChange({ layout: "carousel" })}
            aria-label="Affichage carrousel"
            title="Carrousel"
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
      <div style={layoutStyle}>
        {images.length === 0 && (
          <div className={styles.projectSummaryEmpty}>Aucune image pour le moment.</div>
        )}
        {images.map((image, index) => {
          const showActions = activeIndex === index || editingIndex === index;
          return (
            <div
              key={`${image.src}-${index}`}
              className={cx(
                styles.projectImageTile,
                showActions && styles.projectImageTileActive,
              )}
              onPointerDown={(event) => {
                const target = event.target as HTMLElement | null;
                if (target?.closest("button")) return;
                setActiveIndex((prev) => (prev === index ? null : index));
              }}
              style={
                isCarousel
                  ? {
                      flex: "0 0 200px",
                      minWidth: "200px",
                      scrollSnapAlign: "start",
                    }
                  : undefined
              }
            >
            <div
              className={styles.projectImageTitleRow}
            >
              {editingIndex === index ? (
                <input
                  type="text"
                  className={styles.projectSummaryBlockInput}
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={() => commitTitle(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitTitle(index);
                    }
                    if (event.key === "Escape") {
                      setEditingIndex(null);
                    }
                  }}
                  placeholder="Titre"
                />
              ) : (
                <span className={styles.projectImageTitle}>
                  {image.title ?? ""}
                </span>
              )}
            </div>
            <div
              className={styles.projectImageFrame}
              style={{
                scrollSnapAlign: isCarousel ? "start" : undefined,
                minHeight: layout === "gallery" ? `${gallerySize}px` : "140px",
                height: layout === "gallery" ? `${gallerySize}px` : undefined,
              }}
            >
              <img
                src={image.src}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
              <div
                className={styles.projectImageActions}
              >
                <button
                  type="button"
                  className={cx("icon-button", styles.cardToolbarButton)}
                  onClick={() => removeImage(index)}
                  aria-label="Supprimer l'image"
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
                <button
                  type="button"
                  className={cx("icon-button", styles.cardToolbarButton)}
                  onClick={() => startEditTitle(index)}
                  aria-label="Modifier le titre"
                  title="Modifier le titre"
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
              </div>
            </div>
          </div>
          );
        })}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className={styles.cardHiddenInput}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
