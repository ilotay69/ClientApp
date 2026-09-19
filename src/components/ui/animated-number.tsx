"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import s from "./workspace-controls.module.css";

/** Cross-fades confirmed values, never counts through invented intermediate numbers. */
export function AnimatedNumber({
  value,
  maximumFractionDigits = 0,
}: {
  value: number;
  maximumFractionDigits?: number;
}) {
  const reduced = useReducedMotion();
  const text = new Intl.NumberFormat("en-CA", { maximumFractionDigits }).format(
    value,
  );
  return (
    <span className={s.number}>
      <span className={s.srOnly}>{text}</span>
      <AnimatePresence initial={false}>
        <motion.span
          key={text}
          aria-hidden="true"
          initial={{ opacity: 0, y: reduced ? 0 : 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.16 }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
