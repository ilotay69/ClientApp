import s from "./workspace-controls.module.css";

/** Operation state only; a successful fetch does not imply a healthy business metric. */
export function StatusMark({
  state,
  label,
}: {
  state: "running" | "success" | "error" | "idle";
  label?: string;
}) {
  return (
    <span className={s.status} data-state={state}>
      <span className={s.statusIcon} aria-hidden="true">
        {state === "running" ? (
          <span className={s.spinner} />
        ) : (
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            {state === "success" ? (
              <path d="m3 8 3 3 7-7" />
            ) : state === "error" ? (
              <>
                <circle cx="8" cy="8" r="6" />
                <path d="M8 4.5v4M8 11h.01" />
              </>
            ) : (
              <circle cx="8" cy="8" r="3" />
            )}
          </svg>
        )}
      </span>
      {label}
    </span>
  );
}
