"use client";

import { forwardRef, type HTMLAttributes, type PropsWithChildren } from "react";
import styles from "./SectionBlock.module.css";

type SectionBlockProps = PropsWithChildren<
  {
    className?: string;
  } & HTMLAttributes<HTMLElement>
>;

const SectionBlock = forwardRef<HTMLElement, SectionBlockProps>(
  ({ children, className, ...rest }, ref) => {
  return (
    <section
      ref={ref}
      className={`${styles.sectionBlock}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </section>
  );
  },
);

SectionBlock.displayName = "SectionBlock";

export default SectionBlock;
