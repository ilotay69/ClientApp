"use client";
import { StatusMark } from "./status-mark";
import s from "./workspace-controls.module.css";

export function CompletionCheck({
  checked,
  pending = false,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  pending?: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-busy={pending || undefined}
      aria-label={pending ? `Updating ${label}` : label}
      className={s.completion}
      disabled={disabled || pending}
      onClick={onChange}
    >
      {pending ? (
        <StatusMark state="running" />
      ) : (
        <span className={s.checkBox} aria-hidden="true">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="m3 8 3 3 7-7" />
          </svg>
        </span>
      )}
    </button>
  );
}
