"use client";
import { AnimatedDialog } from "./animated-dialog";
import s from "./client-surfaces.module.css";

export function CGConfirmDiscard({
  open,
  onKeep,
  onDiscard,
}: {
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <AnimatedDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onKeep();
      }}
      title="Discard unsaved changes?"
      description="Your changes have not been saved. Keep editing to retain your draft."
    >
      <div className={`${s.workspace} ${s.formFooter}`}>
        <button className={s.button} onClick={onDiscard}>
          Discard changes
        </button>
        <button className={s.primary} onClick={onKeep}>
          Keep editing
        </button>
      </div>
    </AnimatedDialog>
  );
}
