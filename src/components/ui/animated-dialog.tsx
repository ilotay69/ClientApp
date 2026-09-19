"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import s from "./interactions.module.css";

export type AnimatedDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  trigger?: ReactElement;
  variant?: "modal" | "drawer";
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
  beforeHeader?: ReactNode;
  initialFocus?: RefObject<HTMLElement | null>;
  finalFocus?: RefObject<HTMLElement | null>;
};

/** Base UI owns focus, Escape, outside dismissal, scroll locking and restoration. */
export function AnimatedDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  trigger,
  variant = "modal",
  className = "",
  bodyClassName = "",
  style,
  beforeHeader,
  initialFocus,
  finalFocus,
}: AnimatedDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger render={trigger} />}
      <Dialog.Portal>
        <Dialog.Backdrop className={s.backdrop} />
        <Dialog.Popup
          className={`${s.dialog} ${variant === "drawer" ? s.drawer : s.modal} ${className}`}
          style={style}
          initialFocus={initialFocus}
          finalFocus={finalFocus}
        >
          {beforeHeader}
          <header className={s.dialogHeader}>
            <div>
              <Dialog.Title className={s.dialogTitle}>{title}</Dialog.Title>
              {description && (
                <Dialog.Description className={s.dialogDescription}>
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className={s.closeButton} aria-label="Close panel">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="m5 5 10 10M5 15 15 5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </Dialog.Close>
          </header>
          <div className={`${s.dialogBody} ${bodyClassName}`}>{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
