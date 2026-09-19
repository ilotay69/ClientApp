"use client";

import { useId, type ReactNode } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import s from "./interactions.module.css";

/** A stable navigation/choice strip, not a deck of animated or hidden panels. */
export function AnimatedTabs<T extends string>({
  label,
  value,
  items,
  onChange,
  disabled,
  navigation = false,
  className = "",
}: {
  label: string;
  value: T;
  items: {
    value: T;
    label: ReactNode;
    accessibleLabel?: string;
    disabled?: boolean;
  }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  navigation?: boolean;
  className?: string;
}) {
  const id = useId();
  const reduced = useReducedMotion();
  return (
    <LayoutGroup id={id}>
      <div
        className={`${s.tabStrip} ${className}`}
        role={navigation ? "navigation" : "group"}
        aria-label={label}
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            return;
          const buttons = Array.from(
            e.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          );
          const index = buttons.indexOf(e.target as HTMLButtonElement);
          if (index < 0 || !buttons.length) return;
          e.preventDefault();
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (index + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                  buttons.length;
          buttons[next].focus();
        }}
      >
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            disabled={disabled || item.disabled}
            aria-label={item.accessibleLabel}
            aria-current={
              navigation && value === item.value ? "page" : undefined
            }
            aria-pressed={navigation ? undefined : value === item.value}
            data-selected={value === item.value}
            onClick={() => {
              if (value !== item.value) onChange(item.value);
            }}
          >
            {value === item.value && (
              <motion.span
                aria-hidden="true"
                className={s.tabIndicator}
                layoutId={reduced ? undefined : "active-tab"}
                initial={false}
                transition={{ duration: reduced ? 0 : 0.18, ease: "easeOut" }}
              />
            )}
            <span className={s.tabLabel}>{item.label}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}
