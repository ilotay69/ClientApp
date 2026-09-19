"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
} from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import s from "./interactions.module.css";

const HoverContext = createContext<{
  active: string | null;
  pointer: (id: string | null) => void;
  focus: (id: string | null) => void;
} | null>(null);
export function HoverGroup({
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const [hovered, pointer] = useState<string | null>(null);
  const [focused, focus] = useState<string | null>(null);
  const id = useId();
  return (
    <LayoutGroup id={id}>
      <HoverContext.Provider
        value={{ active: hovered ?? focused, pointer, focus }}
      >
        <div {...props}>{children}</div>
      </HoverContext.Provider>
    </LayoutGroup>
  );
}
export function HoverButton({
  children,
  className = "",
  disabled,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const group = useContext(HoverContext);
  const id = useId();
  const reduced = useReducedMotion();
  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      className={`${s.hoverButton} ${className}`}
      onPointerEnter={(e) => {
        if (!disabled && e.pointerType !== "touch") group?.pointer(id);
        onPointerEnter?.(e);
      }}
      onPointerLeave={(e) => {
        group?.pointer(null);
        onPointerLeave?.(e);
      }}
      onFocus={(e) => {
        group?.focus(id);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        group?.focus(null);
        onBlur?.(e);
      }}
    >
      {children}
      {!disabled && group?.active === id && (
        <motion.span
          aria-hidden="true"
          className={s.hoverHighlight}
          layoutId={reduced ? undefined : "hover-surface"}
          initial={false}
          transition={{ duration: reduced ? 0 : 0.16, ease: "easeOut" }}
        />
      )}
    </button>
  );
}
