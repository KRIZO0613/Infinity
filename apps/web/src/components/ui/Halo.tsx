import { createElement } from "react";
import type { ComponentPropsWithoutRef, ElementType } from "react";

type HaloProps<T extends ElementType = "div"> = {
  as?: T;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className">;

export default function Halo<T extends ElementType = "div">({
  as,
  className = "",
  ...props
}: HaloProps<T>) {
  const Component = (as ?? "div") as T;
  const combinedClassName = ["halo", className].filter(Boolean).join(" ");

  return createElement(Component, {
    ...(props as ComponentPropsWithoutRef<T>),
    className: combinedClassName,
  });
}
