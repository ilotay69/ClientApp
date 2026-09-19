"use client";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

/** Moves only when the keyed list changes. Disable inside drag/reorder surfaces. */
export function SettleRow({
  enabled = true,
  ...props
}: HTMLMotionProps<"div"> & { enabled?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      {...props}
      layout={enabled && !reduced ? "position" : false}
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced || !enabled ? 0 : 0.16 }}
    />
  );
}
