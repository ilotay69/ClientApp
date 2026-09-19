"use client";

import {
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { AnimatedDialog } from "./animated-dialog";
import s from "./interactions.module.css";

/** Presentation only. The dashboard's existing grid owns positions and resizing. */
export function BentoCard({
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <article {...props} className={`${s.bentoCard} ${className}`} />;
}
export function BentoGrid({
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={`${s.bentoGrid} ${className}`} />;
}
/** Explicit expansion never intercepts row links, checkboxes or drag handles. */
export function ExpandableCard({
  trigger,
  title,
  description,
  children,
}: {
  trigger: ReactElement;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <AnimatedDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={title}
      description={description}
    >
      {children}
    </AnimatedDialog>
  );
}
