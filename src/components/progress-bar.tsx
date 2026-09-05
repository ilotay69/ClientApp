/** A long-running AI analysis has no real percentage to report — this
 * reads as "still working" without pretending otherwise. Meant to sit
 * right beside the button/label that triggered the action. */
export function IndeterminateProgressBar() {
  return (
    <div className="h-1 w-20 shrink-0 overflow-hidden rounded-full bg-slate-200" role="status" aria-label="Analyzing">
      <div
        className="h-full w-1/3 rounded-full bg-brand"
        style={{ animation: "indeterminate-progress 1.1s ease-in-out infinite" }}
      />
    </div>
  );
}
