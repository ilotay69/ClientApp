"use client";

import { useRef, useState } from "react";

export type ChartSeries = { name: string; color: string; points: { label: string; value: number }[] };

const WIDTH = 800;
const HEIGHT = 260;
const PADDING = { top: 16, right: 16, bottom: 28, left: 44 };

/** Rounds up to a "nice" axis max (1/2/5 * 10^n) so gridlines land on clean
 * numbers instead of whatever the raw max happens to be. */
function niceCeil(max: number): number {
  if (max <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

/** Dependency-free SVG line/bar chart — no charting library installed in
 * this app, and adding one can't be verified locally (no Node/npm in this
 * environment to regenerate package-lock.json), so this hand-rolls the
 * same "smart" behaviors a library would give: auto-scaled gridlines, a
 * hover tooltip with a synced crosshair, an optional dashed reference
 * line, and label thinning so the x-axis doesn't crowd. All series must
 * share the same ordered set of point labels (e.g. the same weekly
 * buckets). */
export function TrendChart({
  series,
  type = "line",
  referenceLine,
  referenceLineLabel,
  valueFormat = (v) => v.toFixed(1),
  emptyMessage = "No data for this range.",
}: {
  series: ChartSeries[];
  type?: "line" | "bar";
  referenceLine?: number;
  referenceLineLabel?: string;
  valueFormat?: (v: number) => string;
  emptyMessage?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const labels = series[0]?.points.map((p) => p.label) ?? [];
  const n = labels.length;
  const hasData = n > 0 && series.some((s) => s.points.some((p) => p.value !== 0));

  if (!hasData) {
    return <p className="px-5 py-8 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  const maxValue = niceCeil(Math.max(referenceLine ?? 0, ...series.flatMap((s) => s.points.map((p) => p.value)), 1));

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const xFor = (i: number) => PADDING.left + (n === 1 ? plotWidth / 2 : (i / (n - 1)) * plotWidth);
  const yFor = (v: number) => PADDING.top + plotHeight - (v / maxValue) * plotHeight;

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const fraction = (e.clientX - rect.left) / rect.width;
    const i = Math.round(fraction * (n - 1));
    setHoverIndex(Math.min(n - 1, Math.max(0, i)));
  };

  const gridFractions = [0, 0.25, 0.5, 0.75, 1];
  // Thin x-axis labels so at most ~8 show, however many buckets there are.
  const labelStep = Math.max(1, Math.ceil(n / 8));
  const barGroupWidth = n > 0 ? plotWidth / n : 0;
  const barWidth = Math.min(28, barGroupWidth * 0.6) / Math.max(1, series.length);

  return (
    <div className="px-5 py-4">
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-3">
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </div>
          ))}
        </div>
      )}
      <div
        ref={containerRef}
        className="relative"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full">
          {gridFractions.map((g) => {
            const y = PADDING.top + plotHeight - g * plotHeight;
            return (
              <g key={g}>
                <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} />
                <text x={PADDING.left - 8} y={y + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
                  {valueFormat(maxValue * g)}
                </text>
              </g>
            );
          })}

          {referenceLine != null && (
            <g>
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={yFor(referenceLine)}
                y2={yFor(referenceLine)}
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              {referenceLineLabel && (
                <text x={WIDTH - PADDING.right} y={yFor(referenceLine) - 4} textAnchor="end" fontSize={10} fill="#b45309">
                  {referenceLineLabel}
                </text>
              )}
            </g>
          )}

          {type === "bar"
            ? series.map((s, si) =>
                s.points.map((p, i) => (
                  <rect
                    key={i}
                    x={xFor(i) - barGroupWidth / 2 + si * barWidth + (barGroupWidth - series.length * barWidth) / 2}
                    y={yFor(Math.max(0, p.value))}
                    width={barWidth}
                    height={Math.max(0, yFor(0) - yFor(p.value))}
                    fill={s.color}
                    opacity={hoverIndex === null || hoverIndex === i ? 1 : 0.45}
                  />
                ))
              )
            : series.map((s) => (
                <g key={s.name}>
                  <polyline
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    points={s.points.map((p, i) => `${xFor(i)},${yFor(p.value)}`).join(" ")}
                  />
                  {s.points.map((p, i) => (
                    <circle key={i} cx={xFor(i)} cy={yFor(p.value)} r={hoverIndex === i ? 4 : 2.5} fill={s.color} />
                  ))}
                </g>
              ))}

          {hoverIndex !== null && (
            <line
              x1={xFor(hoverIndex)}
              x2={xFor(hoverIndex)}
              y1={PADDING.top}
              y2={HEIGHT - PADDING.bottom}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
          )}

          {labels.map((label, i) =>
            i % labelStep === 0 || i === n - 1 ? (
              <text key={i} x={xFor(i)} y={HEIGHT - PADDING.bottom + 16} textAnchor="middle" fontSize={10} fill="#94a3b8">
                {label}
              </text>
            ) : null
          )}
        </svg>

        {hoverIndex !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow-md"
            style={{ left: `${(xFor(hoverIndex) / WIDTH) * 100}%` }}
          >
            <p className="font-medium text-slate-900">{labels[hoverIndex]}</p>
            {series.map((s) => (
              <p key={s.name} style={{ color: s.color }}>
                {s.name}: {valueFormat(s.points[hoverIndex].value)}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
