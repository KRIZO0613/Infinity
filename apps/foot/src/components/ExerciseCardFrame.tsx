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
      return ["#CC8F4D", "#B87432", "#9A5B1A"];
    }
    if (normalizedCategory.includes("jeu") || normalizedCategory.includes("opposition")) {
      return ["#2DA6B8", "#178AA1", "#0F6B80"];
    }
    if (normalizedCategory.includes("situation")) {
      return ["#C46C98", "#B1487E", "#943565"];
    }
    if (normalizedCategory.includes("retour")) {
      return ["#9FA8B9", "#727E94", "#566175"];
    }
    return ["#D6B556", "#C9A33E", "#B68D2A"];
  })();
  const [bandStart, bandMid, bandEnd] = bandColors;
  const bandGradient = `linear-gradient(180deg, ${bandStart} 0%, ${bandMid} 45%, ${bandEnd} 100%)`;
  const encodeColor = (value: string) => value.replace("#", "%23");
  const brushBand = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 60'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${encodeColor(
    bandStart,
  )}'/><stop offset='0.45' stop-color='${encodeColor(
    bandMid,
  )}'/><stop offset='1' stop-color='${encodeColor(
    bandEnd,
  )}'/></linearGradient><mask id='m'><rect width='600' height='60' fill='black'/><path d='M20 0H580C592 0 600 8 600 20V40C600 52 592 60 580 60H20C8 60 0 52 0 40V20C0 8 8 0 20 0Z' fill='white'/><polygon points='0,6 36,10 0,14' fill='black'/><polygon points='0,12 18,15 0,18' fill='black'/><polygon points='0,18 42,22 0,26' fill='black'/><polygon points='0,24 22,27 0,30' fill='black'/><polygon points='0,30 46,34 0,38' fill='black'/><polygon points='0,36 20,39 0,42' fill='black'/><polygon points='0,42 40,46 0,50' fill='black'/><polygon points='0,48 26,52 0,56' fill='black'/><polygon points='600,6 564,10 600,14' fill='black'/><polygon points='600,12 582,15 600,18' fill='black'/><polygon points='600,18 558,22 600,26' fill='black'/><polygon points='600,24 578,27 600,30' fill='black'/><polygon points='600,30 554,34 600,38' fill='black'/><polygon points='600,36 580,39 600,42' fill='black'/><polygon points='600,42 560,46 600,50' fill='black'/><polygon points='600,48 574,52 600,56' fill='black'/></mask></defs><rect width='600' height='60' fill='url(%23g)' mask='url(%23m)'/></svg>")`;

  return (
    <div
      className={[
        "group relative flex h-full w-full flex-col overflow-hidden rounded-[12px] bg-gradient-to-br from-[#2b1150] via-[#3c1772] to-[#1a0b30] shadow-[0_24px_50px_rgba(0,0,0,0.55)] ring-1 ring-white/10",
        className ?? "",
      ].join(" ")}
      style={
        cardScale !== 1
          ? { transform: `scale(${cardScale})`, transformOrigin: "top center" }
          : undefined
      }
    >
      {floatingAction ? (
        <div className="absolute right-3 top-3 z-20">{floatingAction}</div>
      ) : null}
      <div
        className="pointer-events-none absolute left-[-6%] right-[-6%] top-3 h-2 -rotate-[1.5deg] opacity-80"
        style={{
          backgroundImage:
            "linear-gradient(120deg, rgba(255,106,229,0.85), rgba(139,92,246,0.85)), repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0 6px, rgba(255,255,255,0) 6px 14px)",
          filter: "blur(0.2px)",
        }}
      />
      <div
        className="pointer-events-none absolute left-[-6%] right-[-6%] bottom-4 h-2 rotate-[1.5deg] opacity-80"
        style={{
          backgroundImage:
            "linear-gradient(120deg, rgba(255,106,229,0.85), rgba(139,92,246,0.85)), repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0 6px, rgba(255,255,255,0) 6px 14px)",
          filter: "blur(0.2px)",
        }}
      />
      <div className="relative z-10 flex flex-col">
        <div className="relative flex items-center justify-end bg-transparent px-4 py-2 text-[13px] font-black uppercase tracking-[0.01em] text-white/95">
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
            {category}
          </span>
          {code ? (
            <span className="rounded-full bg-[#f7d88a] px-2 py-0.5 text-[9px] font-semibold text-[#3b2f13] shadow-[0_6px_12px_rgba(0,0,0,0.2)]">
              {code}
            </span>
          ) : null}
        </div>
        <div className="flex w-full justify-center px-6 pt-2">
          <div className="relative mx-auto w-full max-w-[94%] transition duration-200 group-hover:scale-[1.01]">
            <div
              className="relative flex h-4 w-[92%] items-center justify-center px-4"
              style={{
                backgroundImage: brushBand,
                backgroundSize: "100% 100%",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                borderRadius: "999px",
                boxShadow: "none",
              }}
            >
              <span
                className="text-[10px] font-black uppercase tracking-wide"
                style={{ color: "#2a2a2a" }}
              >
                {label}
              </span>
            </div>
          </div>
        </div>
        <div
          className={[
            "flex-1 pb-6",
            isPortrait ? "px-0 pt-2" : "px-4 pt-3",
          ].join(" ")}
        >
          <div
            className="relative w-full overflow-visible rounded-none border-0 bg-black/35"
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
                    ? "scaleX(1.5) scaleY(1.18) rotate(90deg)"
                    : "scale(1.36) scaleX(1.4)"),
                transformOrigin: "center",
              }}
            >
              {children}
            </div>
            {mediaOverlayActions ? (
              <div className="pointer-events-auto absolute bottom-2 right-2 z-40">
                {mediaOverlayActions}
              </div>
            ) : null}
            <div
              className="pointer-events-none absolute left-0 right-0 top-0 z-20 h-1 opacity-100"
              style={{
                backgroundImage:
                  "linear-gradient(120deg, rgba(255,106,229,0.95), rgba(139,92,246,0.95)), repeating-linear-gradient(45deg, rgba(255,255,255,0.32) 0 6px, rgba(255,255,255,0) 6px 14px)",
                mixBlendMode: "screen",
              }}
            />
            <div
              className="pointer-events-none absolute left-0 right-0 bottom-0 z-20 h-1 opacity-100"
              style={{
                backgroundImage:
                  "linear-gradient(120deg, rgba(255,106,229,0.95), rgba(139,92,246,0.95)), repeating-linear-gradient(45deg, rgba(255,255,255,0.32) 0 6px, rgba(255,255,255,0) 6px 14px)",
                mixBlendMode: "screen",
              }}
            />
            {footerLabel ? (
              <div className="absolute bottom-1 left-1 z-30">
                <span
                  className="inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-black tracking-[0.08em]"
                  style={{ background: bandGradient, color: "#2a2a2a" }}
                >
                  {footerLabel}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
