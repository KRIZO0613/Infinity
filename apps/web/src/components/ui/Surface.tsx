import type { ComponentPropsWithoutRef, ElementType } from "react";

type SurfaceProps<T extends ElementType = "div"> = {
  as?: T;
  elevated?: boolean;
  glass?: boolean;
  padding?: boolean;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className">;

export default function Surface<T extends ElementType = "div">({
  as,
  elevated = false,
  glass = false,
  padding = true,
  className = "",
  ...props
}: SurfaceProps<T>) {
  const Component = (as ?? "div") as T;

  const classes = [
    "surface",
    elevated && "surface-elevated",
    glass && "glass-subtle",
    padding && "p-5",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <Component {...(props as ComponentPropsWithoutRef<T>)} className={classes} />;
}
