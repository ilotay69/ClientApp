// Hand-built SVG charts — this repo can't add a charting library (Recharts,
// Chart.js, …): package-lock.json is committed and Railway's `npm ci` fails
// hard on any dependency mismatch, and there's no local `npm install`
// available to regenerate the lockfile. Same reasoning as the hand-built PDF
// generator (src/lib/pdf.ts) and the hand-drawn icon in its title page.

export type DonutSegment = {
  label: string;
  value: number;
  /** Literal Tailwind class, e.g. "stroke-purple-500" — must be a complete
   * string in source (not built via template/concat) so Tailwind's
   * scanner actually generates the CSS for it. */
  strokeClassName: string;
  /** Same literal-class requirement, e.g. "bg-purple-500" — for the legend
   * dot, kept as its own prop rather than derived from strokeClassName so
   * nothing has to string-manipulate a class name at runtime. */
  dotClassName: string;
};

/** A ring chart built from stacked SVG circle segments (stroke-dasharray
 * trick), for "what's the mix" questions — plain counts read slower than
 * "most of this bucket is one thing" does. Segments with value 0 are
 * skipped so they don't collapse into a hairline. */
export function DashboardDonut({
  segments,
  size = 68,
  thickness = 11,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let drawn = 0;

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90 shrink-0"
        role="img"
        aria-label="Breakdown chart"
      >
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={thickness} className="stroke-slate-100" />
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => {
              const dash = (s.value / total) * circumference;
              const dashoffset = -drawn;
              drawn += dash;
              return (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={dashoffset}
                  className={s.strokeClassName}
                />
              );
            })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-0.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className={`h-2 w-2 shrink-0 rounded-full ${s.dotClassName}`} aria-hidden="true" />
            <span className="font-semibold text-slate-900 tabular-nums">{s.value}</span>
            <span className="truncate">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A half-donut gauge for a single 0-100 rate — the arc fills clockwise
 * from the left starting point, same stroke-dasharray approach as the
 * donut above but over a 180° path instead of 360°. */
export function DashboardGauge({
  value,
  label,
  strokeClassName = "stroke-emerald-500",
  size = 100,
}: {
  /** 0-100. Values outside that range are clamped. */
  value: number;
  label: string;
  strokeClassName?: string;
  size?: number;
}) {
  const thickness = 12;
  const radius = (size - thickness) / 2;
  const half = thickness / 2;
  const arcLength = Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const dash = (clamped / 100) * arcLength;
  const path = `M ${half} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - half} ${size / 2}`;

  return (
    <div className="flex flex-col items-center px-4 py-2">
      <svg width={size} height={size / 2 + half} viewBox={`0 0 ${size} ${size / 2 + half}`} role="img" aria-label={label}>
        <path d={path} fill="none" strokeWidth={thickness} strokeLinecap="round" className="stroke-slate-100" />
        <path
          d={path}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${arcLength - dash}`}
          className={strokeClassName}
        />
      </svg>
      <p className="-mt-5 text-xl font-bold tabular-nums text-slate-900">{clamped}%</p>
      <p className="mt-3 text-xs text-slate-500">{label}</p>
    </div>
  );
}
