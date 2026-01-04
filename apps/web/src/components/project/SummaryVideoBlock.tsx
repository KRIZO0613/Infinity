"use client";

import { useEffect, useRef, useState } from "react";
import type { SummaryBlock, SummaryVideoEntry } from "@/store/projectStore";
import styles from "./ProjectEditor.module.css";

type SummaryVideoBlockProps = {
  block: SummaryBlock;
  onChange: (patch: Partial<SummaryBlock>) => void;
  onDelete?: () => void;
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

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

export default function SummaryVideoBlock({ block, onChange, onDelete }: SummaryVideoBlockProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blockRef = useRef<HTMLDivElement | null>(null);
  const rawVideos = block.videos ?? [];
  const needsNormalize = rawVideos.some((item) => typeof item === "string");
  const videos: SummaryVideoEntry[] = rawVideos.map((item) =>
    typeof item === "string" ? { src: item, title: "" } : item,
  );
  const layout = block.layout === "carousel" || block.layout === "gallery" ? block.layout : "gallery";
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
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
      onChange({ videos });
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
    const next: SummaryVideoEntry[] = [];
    for (const file of Array.from(files)) {
      const dataUrl = await readVideoDataUrl(file);
      if (dataUrl) next.push({ src: dataUrl, title: "" });
    }
    if (next.length > 0) {
      onChange({ videos: [...videos, ...next] });
    }
  };

  const removeVideo = (index: number) => {
    const next = videos.filter((_, i) => i !== index);
    onChange({ videos: next });
  };

  const startEditTitle = (index: number) => {
    setEditingIndex(index);
    setTitleDraft(videos[index]?.title ?? "");
  };

  const commitTitle = (index: number) => {
    const next = videos.map((item, i) =>
      i === index ? { ...item, title: titleDraft.trim() } : item,
    );
    onChange({ videos: next });
    setEditingIndex(null);
  };

  const showToolbar = blockActive || blockHovered;
  const gallerySize = 130;
  const isCarousel = layout === "carousel";
  const frameHeight = layout === "gallery" ? `${gallerySize}px` : "140px";

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
          gap: "8px",
          width: "100%",
          maxHeight: "320px",
          overflowY: "auto",
          paddingRight: "6px",
          alignContent: "start",
          justifyContent: "start",
        };

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
          aria-label="Ajouter une video"
          title="Ajouter une video"
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
        {videos.length === 0 && (
          <div className={styles.projectSummaryEmpty}>Aucune video pour le moment.</div>
        )}
        {videos.map((video, index) => {
          const showActions = activeIndex === index || editingIndex === index;
          return (
            <div
              key={`${video.src}-${index}`}
              className={cx(
                styles.projectImageTile,
                showActions && styles.projectImageTileActive,
              )}
              style={
                isCarousel
                  ? {
                      flex: "0 0 200px",
                      minWidth: "200px",
                      scrollSnapAlign: "start",
                    }
                  : undefined
              }
              onPointerDown={(event) => {
                const target = event.target as HTMLElement | null;
                if (target?.closest("button")) return;
                setActiveIndex((prev) => (prev === index ? null : index));
              }}
            >
              <div className={styles.projectImageTitleRow}>
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
                    {video.title ?? ""}
                  </span>
                )}
              </div>
              <div
                className={styles.projectImageFrame}
                style={{
                  scrollSnapAlign: isCarousel ? "start" : undefined,
                  width: layout === "gallery" ? `${gallerySize}px` : "100%",
                  height: frameHeight,
                }}
              >
                <video
                  src={video.src}
                  controls
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "block",
                    objectFit: "cover",
                  }}
                />
                <div
                  className={styles.projectImageActions}
                  style={{
                    opacity: showActions ? 1 : 0,
                    pointerEvents: showActions ? "auto" : "none",
                  }}
                >
                  <button
                    type="button"
                    className={cx("icon-button", styles.cardToolbarButton)}
                    onClick={() => setExpandedIndex(index)}
                    aria-label="Agrandir la video"
                    title="Agrandir"
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
                      <path d="M9 3H5v4" />
                      <path d="M15 21h4v-4" />
                      <path d="M21 9V5h-4" />
                      <path d="M3 15v4h4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={cx("icon-button", styles.cardToolbarButton)}
                    onClick={() => removeVideo(index)}
                    aria-label="Supprimer la video"
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
        accept="video/*"
        multiple
        className={styles.cardHiddenInput}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
      {expandedIndex !== null && videos[expandedIndex] && (
        <div
          className="overlay-veil fixed inset-0 z-[240] flex items-center justify-center p-6"
          onClick={() => setExpandedIndex(null)}
        >
          <div
            className="panel-glass w-full max-w-3xl p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3">
              <span className={styles.projectImageTitle}>
                {videos[expandedIndex]?.title ?? "Video"}
              </span>
              <button
                type="button"
                className="close-icon"
                aria-label="Fermer"
                onClick={() => setExpandedIndex(null)}
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
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <video
              src={videos[expandedIndex]?.src}
              controls
              autoPlay
              style={{
                width: "100%",
                maxHeight: "70vh",
                borderRadius: "16px",
                display: "block",
                background: "rgba(0, 0, 0, 0.08)",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
