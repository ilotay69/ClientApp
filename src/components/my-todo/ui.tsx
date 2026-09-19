"use client";
import { AnimatedDialog } from "../ui/animated-dialog";
import { useEffect, useRef, useState, type ReactNode } from "react";
import s from "./workspace.module.css";

export function TodoIcon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const paths: Record<string, ReactNode> = {
    today: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </>
    ),
    tasks: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="3" />
        <path d="m8 9 1 1 2-2m2 1h3M8 15h8" />
      </>
    ),
    inbox: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
    tickets: (
      <>
        <path d="M4 4h16v5a3 3 0 0 0 0 6v5H4v-5a3 3 0 0 0 0-6Z" />
        <path d="M14 4v3m0 4v2m0 4v3" />
      </>
    ),
    time: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    external: (
      <>
        <path d="M14 3h7v7m0-7L10 14" />
        <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 10a8 8 0 1 0-1 8M20 3v7h-7" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" />
        <circle cx="15" cy="17" r="3" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M3 10h18M8 3v4m8-4v4" />
      </>
    ),
    grip: (
      <>
        <path
          d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"
          strokeWidth="3"
        />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    list: <path d="M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01" />,
    board: (
      <>
        <rect x="3" y="4" width="7" height="16" rx="2" />
        <rect x="14" y="4" width="7" height="10" rx="2" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${s.icon} ${className}`}
    >
      {paths[name] ?? paths.tasks}
    </svg>
  );
}
export function Empty({
  title,
  children,
  icon = "tasks",
  action,
}: {
  title: string;
  children?: ReactNode;
  icon?: string;
  action?: ReactNode;
}) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon}>
        <TodoIcon name={icon} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className={s.loading} role="status">
      <span>{label}…</span>
      {[0, 1, 2].map((i) => (
        <div className={s.skeleton} key={i} />
      ))}
    </div>
  );
}
export function ErrorNotice({
  children,
  retry,
}: {
  children: ReactNode;
  retry?: () => void;
}) {
  return (
    <div role="alert" className={s.error}>
      {children}
      {retry && <button onClick={retry}>Try again</button>}
    </div>
  );
}
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  width = 480,
  onWidth,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: number;
  onWidth?: (width: number) => void;
}) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  return (
    <AnimatedDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      description={description}
      variant="drawer"
      className={s.drawer}
      bodyClassName={s.drawerBody}
      style={{ width: dragWidth ?? width }}
      beforeHeader={
        onWidth && (
          <div
            role="separator"
            aria-label="Resize detail panel"
            aria-orientation="vertical"
            aria-valuemin={360}
            aria-valuemax={760}
            aria-valuenow={Math.round(dragWidth ?? width)}
            tabIndex={0}
            className={s.resizeHandle}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                onWidth(
                  Math.max(
                    360,
                    Math.min(760, width + (e.key === "ArrowLeft" ? 20 : -20)),
                  ),
                );
              }
            }}
            onPointerDown={(e) => {
              start.current = { x: e.clientX, width };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (start.current)
                setDragWidth(
                  Math.max(
                    360,
                    Math.min(
                      760,
                      start.current.width + start.current.x - e.clientX,
                    ),
                  ),
                );
            }}
            onPointerUp={() => {
              if (dragWidth !== null) onWidth(dragWidth);
              start.current = null;
              setDragWidth(null);
            }}
            onPointerCancel={() => {
              start.current = null;
              setDragWidth(null);
            }}
          />
        )
      }
    >
      {children}
    </AnimatedDialog>
  );
}
export function useRemote<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{
    data: T | null;
    error: string | null;
    loading: boolean;
  }>({ data: null, error: null, loading: true });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  const generation = useRef(0);
  async function refresh() {
    const id = ++generation.current;
    setState((old) => ({ ...old, error: null, loading: true }));
    try {
      const data = await loadRef.current();
      if (generation.current === id)
        setState({ data, error: null, loading: false });
    } catch {
      if (generation.current === id)
        setState((old) => ({
          ...old,
          error: "Couldn't load this view. Please try again.",
          loading: false,
        }));
    }
  }
  useEffect(() => {
    const id = ++generation.current;
    void loadRef
      .current()
      .then((data) => {
        if (generation.current === id)
          setState({ data, error: null, loading: false });
      })
      .catch(() => {
        if (generation.current === id)
          setState({
            data: null,
            error: "Couldn't load this view. Please try again.",
            loading: false,
          });
      });
    return () => {
      // This ref is an async request counter, not a DOM element.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, []); // The owner keys this component when its query changes.
  return { ...state, refresh };
}
