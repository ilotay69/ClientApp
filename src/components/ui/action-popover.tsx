"use client";
import { Popover } from "@base-ui/react/popover";
import { useState, type ReactNode } from "react";
import s from "./client-surfaces.module.css";

/** Click/keyboard popover for small action or settings groups, never hover-only. */
export function CGActionPopover({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={s.button}>{label}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={8}
          className={s.popoverPositioner}
        >
          <Popover.Popup
            className={`${s.workspace} ${s.actionPopover}`}
            onClick={(event) => {
              if ((event.target as Element).closest("a")) setOpen(false);
            }}
          >
            <div className={s.cardHeader}>
              <Popover.Title>{title}</Popover.Title>
              <Popover.Close
                className={s.button}
                aria-label={`Close ${title.toLowerCase()}`}
              >
                ×
              </Popover.Close>
            </div>
            <div className={s.stack}>{children}</div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
