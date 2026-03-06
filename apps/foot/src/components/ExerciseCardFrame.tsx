import type { ReactNode } from "react";

export type ExerciseCardFrameProps = {
  category: string;
  code?: string;
  label: string;
  className?: string;
  mediaAspect?: "video" | "portrait";
  rotateMedia?: boolean;
  mediaMinHeight?: number;
  mediaRatio?: string;
  cardScale?: number;
  floatingAction?: ReactNode;
  footerLabel?: string;
  mediaOverlayActions?: ReactNode;
  mediaTransform?: string;
  children: ReactNode;
};

export default function ExerciseCardFrame({
  category,
  code,
  label,
  className,
  mediaAspect = "video",
  rotateMedia = false,
  mediaMinHeight,
  mediaRatio,
  cardScale = 1,
  floatingAction,
  footerLabel,
  mediaOverlayActions,
  mediaTransform,
  children,
}: ExerciseCardFrameProps) {
  const isPortrait = mediaAspect === "portrait";
  const normalizedCategory = (category || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const bandColors = (() => {
    if (normalizedCategory.includes("echauffement") || normalizedCategory.includes("activation")) {
      return ["#D6B556", "#C9A33E", "#B68D2A"];
    }
    if (normalizedCategory.includes("motricite")) {
      return ["#5DA982", "#3D8D63", "#2E6E4B"];
    }
    if (normalizedCategory.includes("technique")) {
      return ["#568FC6", "#3C73B4", "#2B5C9E"];
    }
    if (normalizedCategory.includes("tactique")) {
      return ["#8173C9", "#6852B8", "#563AA3"];
    }
    if (normalizedCategory.includes("physique")) {
      return ["#C86A6A", "#A23C3C", "#7A1F1F"];
    }
    if (normalizedCategory.includes("jeu") || normalizedCategory.includes("opposition")) {
      return ["#5B6BD6", "#444BB8", "#32379A"];
    }
    if (normalizedCategory.includes("situation")) {
      return ["#D9A7F5", "#B66BF0", "#8E3AD9"];
    }
    if (normalizedCategory.includes("retour")) {
      return ["#9FA8B9", "#727E94", "#566175"];
    }
    return ["#D6B556", "#C9A33E", "#B68D2A"];
  })();
  const [bandStart, bandMid, bandEnd] = bandColors;
  const indicatorColor = bandMid;
  const labelTextColor = "#e5e7eb";

  return (
    <div
      className={[
        "group relative flex h-full w-full flex-col overflow-hidden rounded-[12px] bg-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_24px_50px_rgba(0,0,0,0.55)] ring-1 ring-white/10 ring-inset backdrop-blur-sm",
        className ?? "",
      ].join(" ")}
      style={
        cardScale !== 1
          ? { transform: `scale(${cardScale})`, transformOrigin: "top center" }
          : undefined
      }
    >
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-30 h-px bg-white/25" />
      <div className="pointer-events-none absolute left-0 right-0 bottom-0 z-30 h-px bg-white/15" />
      {footerLabel ? (
        <div className="absolute bottom-0 left-0 z-20">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[9px] font-semibold text-white/85 shadow-[0_6px_16px_rgba(0,0,0,0.5)] backdrop-blur">
            <span
              className="h-2 w-2 rounded-full shadow-[0_0_6px_rgba(0,0,0,0.2)]"
              style={{ backgroundColor: indicatorColor }}
            />
            {footerLabel}
          </span>
        </div>
      ) : null}
      {mediaOverlayActions ? (
        <div className="pointer-events-auto absolute bottom-0 right-0 z-20">
          {mediaOverlayActions}
        </div>
      ) : null}
      <div className="relative z-10 flex flex-col">
        <div className="grid grid-cols-[auto,1fr,auto] items-center px-3 pt-2 pb-0">
          <div />
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/85 backdrop-blur">
              <span className="whitespace-nowrap">{category}</span>
              {code ? (
                <span className="rounded-full border border-white/20 bg-white/10 px-1.5 py-[1px] text-[8px] font-semibold text-white/85">
                  {code}
                </span>
              ) : null}
            </div>
          </div>
          <div />
        </div>
        <div className="relative w-full px-3 pt-0">
          {floatingAction ? (
            <div className="absolute left-0 top-1/2 -translate-y-1/2">
              {floatingAction}
            </div>
          ) : null}
          <div className="flex justify-center">
            <span
              className="text-[10px] font-black uppercase tracking-[0.08em]"
              style={{ color: labelTextColor }}
            >
              {label}
            </span>
          </div>
        </div>
        <div
          className={[
            "flex-1 pb-6",
            isPortrait ? "px-0 pt-3" : "px-4 pt-3",
          ].join(" ")}
        >
          <div
            className="relative w-full overflow-hidden rounded-none border-0 bg-black/35"
            style={{
              aspectRatio: mediaRatio ?? (isPortrait ? "4 / 5" : "16 / 9"),
            }}
          >
            <div
              className="relative z-0 h-full w-full"
              style={{
                transform:
                  mediaTransform ??
                  (rotateMedia
                    ? "scaleX(1.24) scaleY(0.94) rotate(90deg)"
                    : "scale(0.98) scaleX(1.24)"),
                transformOrigin: "center",
              }}
            >
              {children}
            </div>
            <div
              className="pointer-events-none absolute left-0 right-0 top-0 z-20 h-px opacity-80"
              style={{
                backgroundImage:
                  "linear-gradient(120deg, rgba(255,106,229,0.95), rgba(139,92,246,0.95)), repeating-linear-gradient(45deg, rgba(255,255,255,0.32) 0 6px, rgba(255,255,255,0) 6px 14px)",
                mixBlendMode: "screen",
              }}
            />
            <div
              className="pointer-events-none absolute left-0 right-0 bottom-0 z-20 h-px opacity-80"
              style={{
                backgroundImage:
                  "linear-gradient(120deg, rgba(255,106,229,0.95), rgba(139,92,246,0.95)), repeating-linear-gradient(45deg, rgba(255,255,255,0.32) 0 6px, rgba(255,255,255,0) 6px 14px)",
                mixBlendMode: "screen",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
