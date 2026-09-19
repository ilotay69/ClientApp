"use client";

import { Popover } from "@base-ui/react/popover";
import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import s from "./interactions.module.css";

/** Only render already-authorized app data. Never fetch third-party screenshots. */
export function TooltipCard({
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
  return (
    <Popover.Root>
      <Popover.Trigger
        render={trigger}
        openOnHover
        delay={350}
        closeDelay={150}
      />
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={8}
          className={s.popoverPositioner}
        >
          <Popover.Popup className={s.preview}>
            <div className={s.previewHeader}>
              <Popover.Title>{title}</Popover.Title>
              <Popover.Close
                className={s.previewClose}
                aria-label="Close preview"
              >
                ×
              </Popover.Close>
            </div>
            {description && (
              <Popover.Description className={s.previewDescription}>
                {description}
              </Popover.Description>
            )}
            <div className={s.previewContent}>{children}</div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Supplemental hints only; the trigger always retains its accessible name. */
export function AnimatedTooltip({
  children,
  content,
}: {
  children: ReactElement;
  content: ReactNode;
}) {
  return (
    <Tooltip.Provider delay={450}>
      <Tooltip.Root>
        <Tooltip.Trigger render={children} />
        <Tooltip.Portal>
          <Tooltip.Positioner
            side="top"
            sideOffset={7}
            className={s.popoverPositioner}
          >
            <Tooltip.Popup className={s.tooltip}>{content}</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
