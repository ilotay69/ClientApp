"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type ReactNode,
} from "react";
import {
  confirmedAction,
  type ActionOutcome,
  type ActionStatus,
} from "@/lib/action-feedback";
export type { ActionOutcome, ActionStatus } from "@/lib/action-feedback";
import s from "./interactions.module.css";

export function useActionFeedback() {
  const [status, setStatus] = useState<ActionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  async function run(action: () => Promise<ActionOutcome>) {
    if (locked.current) return false;
    locked.current = true;
    if (timer.current) clearTimeout(timer.current);
    setStatus("pending");
    setError(null);
    try {
      const result = await confirmedAction(action);
      if (mounted.current) {
        setStatus(result.ok ? "success" : "error");
        setError(result.ok ? null : result.error);
        if (result.ok)
          timer.current = setTimeout(() => {
            if (mounted.current) setStatus("idle");
          }, 2500);
      }
      return result.ok;
    } catch {
      if (mounted.current) {
        setStatus("error");
        setError("The action couldn't be completed. Please try again.");
      }
      return false;
    } finally {
      locked.current = false;
    }
  }
  return { status, error, run };
}

type Props = ComponentPropsWithRef<"button"> & {
  status: ActionStatus;
  pendingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  icon?: ReactNode;
};

/** Controlled feedback works with forms, server actions, and route transitions. */
export function StatefulButton({
  status,
  children,
  pendingLabel = "Saving…",
  successLabel = "Saved",
  errorLabel = "Try again",
  icon,
  className = "",
  disabled,
  type = "button",
  ...props
}: Props) {
  const label =
    status === "pending"
      ? pendingLabel
      : status === "success"
        ? successLabel
        : status === "error"
          ? errorLabel
          : children;
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || status === "pending"}
      aria-busy={status === "pending"}
      aria-live="polite"
      aria-atomic="true"
      data-action-status={status}
      className={`${s.statefulButton} ${className}`}
    >
      <span className={s.buttonIcon} aria-hidden="true">
        {status === "pending" ? (
          <span className={s.spinner} />
        ) : status === "success" ? (
          <svg viewBox="0 0 20 20" fill="none">
            <path
              d="m4 10 4 4 8-8"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : status === "error" ? (
          <span>!</span>
        ) : (
          icon
        )}
      </span>
      <span className={s.buttonLabels}>
        <span className={s.labelSizer} aria-hidden="true">
          {children}
        </span>
        <span className={s.labelSizer} aria-hidden="true">
          {pendingLabel}
        </span>
        <span className={s.labelSizer} aria-hidden="true">
          {successLabel}
        </span>
        <span className={s.labelSizer} aria-hidden="true">
          {errorLabel}
        </span>
        <span className={s.buttonLabel} key={status}>
          {label}
        </span>
      </span>
    </button>
  );
}
