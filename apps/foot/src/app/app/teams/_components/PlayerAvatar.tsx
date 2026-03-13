import { getInitials } from "@/lib/user";

type PlayerAvatarProps = {
  firstName?: string | null;
  lastName?: string | null;
  photoUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses: Record<NonNullable<PlayerAvatarProps["size"]>, string> = {
  xs: "h-8 w-8 text-[10px]",
  sm: "h-10 w-10 text-xs",
  md: "h-14 w-14 text-sm",
  lg: "h-20 w-20 text-base",
};

const sizeWidths: Record<NonNullable<PlayerAvatarProps["size"]>, number> = {
  xs: 64,
  sm: 80,
  md: 120,
  lg: 240,
};

export const getOptimizedPlayerPhotoUrl = (
  url: string,
  width: number,
  quality = 70,
) => {
  const marker = "/storage/v1/object/public/";
  if (!url.includes(marker)) return url;
  const base = url.replace(
    "/storage/v1/object/public/",
    "/storage/v1/render/image/public/",
  );
  const hasQuery = base.includes("?");
  const params = `width=${width}&quality=${quality}&resize=cover`;
  return `${base}${hasQuery ? "&" : "?"}${params}`;
};

export const getOriginalPlayerPhotoUrl = (url: string) => {
  if (url.includes("/storage/v1/render/image/public/")) {
    return url
      .replace(
        "/storage/v1/render/image/public/",
        "/storage/v1/object/public/",
      )
      .split("?")[0];
  }
  return url;
};

export default function PlayerAvatar({
  firstName,
  lastName,
  photoUrl,
  size = "md",
  className = "",
}: PlayerAvatarProps) {
  if (photoUrl) {
    const optimizedUrl = getOptimizedPlayerPhotoUrl(
      photoUrl,
      sizeWidths[size],
    );
    const fallbackUrl = getOriginalPlayerPhotoUrl(photoUrl);
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={optimizedUrl}
        alt={`${firstName ?? ""} ${lastName ?? ""}`.trim() || "Joueur"}
        className={[
          "rounded-2xl object-cover transition-opacity duration-300",
          sizeClasses[size],
          className,
        ].join(" ")}
        style={{ opacity: 0 }}
        loading={size === "lg" ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={size === "lg" ? "high" : "auto"}
        onLoad={(event) => {
          event.currentTarget.style.opacity = "1";
        }}
        onError={(event) => {
          if (event.currentTarget.src !== fallbackUrl) {
            event.currentTarget.src = fallbackUrl;
          }
        }}
      />
    );
  }

  const initials = getInitials(firstName ?? null, lastName ?? null);

  return (
    <div
      className={[
        "flex items-center justify-center rounded-2xl font-semibold text-white",
        "bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.9),rgba(37,99,235,0.75))]",
        "shadow-[0_10px_25px_rgba(0,0,0,0.35)]",
        sizeClasses[size],
        className,
      ].join(" ")}
      aria-label="Avatar joueur"
    >
      {initials}
    </div>
  );
}
