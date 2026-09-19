"use client";
import { useCallback, useRef, useState } from "react";
import { Toast } from "@base-ui/react/toast";
import { StatusMark } from "./status-mark";
import { noticeTimeout } from "@/lib/workspace-controls";
import s from "./workspace-controls.module.css";

type NoticeData = {
  action?: { label: string; run: () => Promise<boolean>; error?: string };
};
type NoticeOptions = NoticeData & {
  id?: string;
  error?: boolean;
  description?: string;
};
export function useNotices() {
  const [manager] = useState(() => Toast.createToastManager<NoticeData>());
  const notify = useCallback(
    (title: string | null, options: NoticeOptions = {}) => {
      if (!title) return;
      return manager.add({
        id: options.id,
        title,
        description: options.description,
        type: options.error ? "error" : "success",
        // Never time out an error or an available Undo. Passive confirmations pause on focus/hover.
        timeout: noticeTimeout(!!options.error, !!options.action),
        data: { action: options.action },
      });
    },
    [manager],
  );
  return { manager, notify };
}
export function NoticeRegion({
  manager,
}: {
  manager: ReturnType<typeof useNotices>["manager"];
}) {
  return (
    <Toast.Provider toastManager={manager} limit={50}>
      <NoticeViewport />
    </Toast.Provider>
  );
}
function NoticeViewport() {
  const { toasts } = Toast.useToastManager<NoticeData>();
  return (
    <Toast.Portal>
      <Toast.Viewport
        className={s.toastViewport}
        aria-label="Workspace notifications"
      >
        {toasts.map((toast) => (
          <NoticeItem key={toast.id} toast={toast} />
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
function NoticeItem({ toast }: { toast: Toast.Root.ToastObject<NoticeData> }) {
  const { close, update } = Toast.useToastManager<NoticeData>();
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  async function act() {
    if (locked.current || !toast.data?.action) return;
    locked.current = true;
    setPending(true);
    let success = false;
    try {
      success = (await toast.data.action.run()) === true;
    } catch {
      /* Keep the action available on failure. */
    }
    if (success) close(toast.id);
    else
      update(toast.id, {
        type: "error",
        timeout: 0,
        description:
          toast.data.action.error ?? "Couldn't finish. Please try again.",
      });
    locked.current = false;
    setPending(false);
  }
  return (
    <Toast.Root
      toast={toast}
      className={s.toast}
      swipeDirection={pending ? [] : ["right"]}
    >
      <Toast.Content className={s.toastContent}>
        <StatusMark
          state={
            pending ? "running" : toast.type === "error" ? "error" : "success"
          }
        />
        <div className={s.toastText}>
          <Toast.Title className={s.toastTitle} />
          <Toast.Description className={s.toastDescription} />
        </div>
        {toast.data?.action && (
          <button
            type="button"
            className={s.toastAction}
            disabled={pending}
            onClick={act}
          >
            {pending ? "Working…" : toast.data.action.label}
          </button>
        )}
        <Toast.Close
          className={s.toastClose}
          disabled={pending}
          aria-label="Dismiss notification"
        >
          ×
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  );
}
