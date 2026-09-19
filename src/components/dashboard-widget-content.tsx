"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchLiveDashboardWidget } from "@/app/(dashboard)/dashboard/live-widget-action";
import { acknowledgeDashboardAlert } from "@/app/(dashboard)/dashboard/workspace-actions";
import type {
  Widget,
  WidgetData,
  SeriesPoint,
} from "@/lib/dashboard-workspace";
import styles from "./dashboard-workspace.module.css";
import { ExpandableCard } from "./ui/bento-card";
import { AnimatedTooltip } from "./ui/context-preview";
import { StatusMark } from "./ui/status-mark";
import { AnimatedNumber } from "./ui/animated-number";
import { canAnimateWorkspaceMetric } from "@/lib/workspace-controls";

export function DashboardOrb({
  label = "Loading live data…",
}: {
  label?: string;
}) {
  return (
    <div className={styles.loading} role="status">
      <StatusMark state="running" label={label} />
    </div>
  );
}

export function LiveWidgetContent({ widget }: { widget: Widget }) {
  const [data, setData] = useState<WidgetData | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchLiveDashboardWidget(widget.source)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled)
          setData({
            key: widget.source,
            value: 0,
            unit: "",
            series: [],
            rows: [],
            empty: "",
            error: "The connection didn’t respond. Please try again.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [widget.source, attempt]);
  if (!data) return <DashboardOrb />;
  return (
    <>
      <WidgetContent widget={widget} data={data} />
      {data.error && (
        <button
          className={styles.textButton}
          onClick={() => {
            setData(null);
            setAttempt((n) => n + 1);
          }}
        >
          Retry connection ↗
        </button>
      )}
    </>
  );
}

const number = (value: number) =>
  new Intl.NumberFormat("en-CA", { maximumFractionDigits: 1 }).format(value);
const safeHref = (href?: string) =>
  href && (/^\/(?!\/)/.test(href) || /^https:\/\//.test(href))
    ? href
    : undefined;

function compactSeries(series: SeriesPoint[], limit: number) {
  if (series.length <= limit) return series;
  return [
    ...series.slice(0, limit - 1),
    {
      label: "Other",
      value: series.slice(limit - 1).reduce((sum, p) => sum + p.value, 0),
    },
  ];
}

export function WidgetContent({
  widget,
  data,
  preview = false,
}: {
  widget: Widget;
  data: WidgetData;
  /** Read-only editor rendering; never loads data or offers record actions. */
  preview?: boolean;
}) {
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [ackError, setAckError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  if (data.error)
    return (
      <div className={styles.connection}>
        <strong>
          <StatusMark state="error" label="Connection needs attention" />
        </strong>
        <p>{data.error}</p>
      </div>
    );
  const total = Math.max(
    0,
    data.value - (data.key === "alerts" ? acknowledged.length : 0),
  );
  const series = compactSeries(data.series, widget.limit);
  const sum = series.reduce((n, s) => n + s.value, 0);
  const visibleRows = data.rows.filter((r) => !acknowledged.includes(r.id));
  const tones = [
    "var(--widget-accent)",
    "#c6c8c5",
    "#dfb88d",
    "#869f92",
    "#7d94a2",
    "#dcdedb",
  ];
  const href = preview ? undefined : safeHref(data.href);
  return (
    <>
      <div
        className={`${styles.widgetValue} ${preview ? styles.previewValue : ""}`}
      >
        <strong>
          {canAnimateWorkspaceMetric(data.key) ? (
            <AnimatedNumber value={total} maximumFractionDigits={1} />
          ) : (
            number(total)
          )}
        </strong>
        <span>{data.unit}</span>
        {!preview && (data.rows.length > 0 || data.series.length > 0) && (
          <ExpandableCard
            title={widget.title}
            description="Current snapshot · this preview does not change your widget or saved layout."
            trigger={
              <button
                className={styles.detailsButton}
                aria-label={`Expand ${widget.title}`}
              >
                Details
              </button>
            }
          >
            <WidgetSnapshotDetails
              data={data}
              rows={visibleRows}
              total={total}
            />
          </ExpandableCard>
        )}
        {href && (
          <Link
            href={href}
            aria-label={`Open ${widget.title}`}
            className={styles.arrowLink}
          >
            ↗
          </Link>
        )}
      </div>
      {total === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyMark}>✓</span>
          <p>{data.empty}</p>
        </div>
      ) : widget.display === "metric" ? (
        <div className={styles.metricDetail}>
          <span className={styles.metricRule} />
          <p>
            {data.key === "hours_worked"
              ? "Month to date · Autotask"
              : "Current snapshot"}
          </p>
          {href && (
            <Link href={href}>
              Explore details <span>↗</span>
            </Link>
          )}
        </div>
      ) : widget.display === "list" ? (
        <div className={`${styles.rows} ${preview ? styles.previewRows : ""}`}>
          {visibleRows.slice(0, widget.limit).map((row, index) => {
            const content = (
              <>
                <span
                  className={`${styles.rowMark} ${row.urgent ? styles.urgent : ""}`}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={styles.rowText}>
                  <strong>{row.title}</strong>
                  {row.detail && <small>{row.detail}</small>}
                </span>
                {row.badge && (
                  <span
                    className={`${styles.badge} ${row.urgent ? styles.urgentBadge : ""}`}
                  >
                    {row.badge}
                  </span>
                )}
              </>
            );
            const rowHref = preview ? undefined : safeHref(row.href);
            return (
              <div key={row.id} className={styles.rowWrap}>
                {rowHref ? (
                  <Link href={rowHref} className={styles.row}>
                    {content}
                  </Link>
                ) : (
                  <div className={styles.row}>{content}</div>
                )}
                {data.key === "alerts" && !preview && (
                  <AnimatedTooltip content="Acknowledge this notification">
                    <button
                      disabled={pendingId !== null}
                      className={styles.acknowledge}
                      aria-label={`Acknowledge ${row.title}`}
                      onClick={async () => {
                        setPendingId(row.id);
                        setAckError("");
                        try {
                          const result = await acknowledgeDashboardAlert(
                            row.id,
                          );
                          if (result.error) setAckError(result.error);
                          else
                            setAcknowledged((current) => [...current, row.id]);
                        } catch {
                          setAckError(
                            "Couldn’t acknowledge this alert. Please retry.",
                          );
                        } finally {
                          setPendingId(null);
                        }
                      }}
                    >
                      ✓
                    </button>
                  </AnimatedTooltip>
                )}
              </div>
            );
          })}
          {ackError && <p role="alert">{ackError}</p>}
          {visibleRows.length > widget.limit && (
            <p className={styles.more}>
              {visibleRows.length - widget.limit} more{" "}
              {href && <Link href={href}>· View all ↗</Link>}
            </p>
          )}
        </div>
      ) : widget.display === "donut" ? (
        <div className={styles.donutArea}>
          <svg
            viewBox="0 0 160 160"
            role="img"
            aria-label={series
              .map((s) => `${s.label}: ${number(s.value)}`)
              .join(", ")}
          >
            <circle
              cx="80"
              cy="80"
              r="59"
              fill="none"
              stroke="#f0f0ed"
              strokeWidth="17"
            />
            {series.map((s, index) => {
              const length = sum > 0 ? (s.value / sum) * 370.708 : 0;
              const offset =
                (series.slice(0, index).reduce((n, p) => n + p.value, 0) /
                  (sum || 1)) *
                370.708;
              return (
                <circle
                  key={s.label}
                  cx="80"
                  cy="80"
                  r="59"
                  fill="none"
                  stroke={tones[index % tones.length]}
                  strokeWidth="17"
                  strokeDasharray={`${Math.max(0, length - (length > 3 ? 3 : 0))} 370.708`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 80 80)"
                >
                  <title>{`${s.label}: ${number(s.value)}`}</title>
                </circle>
              );
            })}
            <text
              x="80"
              y="81"
              textAnchor="middle"
              className={styles.donutNumber}
            >
              {number(sum)}
            </text>
            <text
              x="80"
              y="100"
              textAnchor="middle"
              className={styles.donutLabel}
            >
              TOTAL
            </text>
          </svg>
          <div className={styles.legend}>
            {series.map((s, i) => (
              <div key={s.label}>
                <span style={{ background: tones[i % tones.length] }} />
                <span>{s.label}</span>
                <strong>{number(s.value)}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : data.key === "task_schedule" ? (
        <div
          className={styles.columnChart}
          role="img"
          aria-label={series.map((s) => `${s.label}: ${s.value}`).join(", ")}
        >
          {series.map((s, i) => (
            <div className={styles.column} key={s.label}>
              <span>{s.value}</span>
              <div className={styles.columnTrack}>
                <div
                  style={{
                    height: `${(s.value / Math.max(1, ...series.map((p) => p.value))) * 100}%`,
                    background: i === 0 ? "var(--widget-accent)" : "#343738",
                  }}
                />
              </div>
              <small>{s.label}</small>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.barChart}>
          {series.map((s) => (
            <div key={s.label}>
              <div className={styles.barLabel}>
                <span>{s.label}</span>
                <strong>{number(s.value)}</strong>
              </div>
              <div className={styles.barTrack}>
                <div
                  style={{
                    width: `${(s.value / Math.max(1, ...series.map((p) => p.value))) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function WidgetSnapshotDetails({
  data,
  rows,
  total,
}: {
  data: WidgetData;
  rows: WidgetData["rows"];
  total: number;
}) {
  const href = safeHref(data.href);
  return (
    <div className={styles.snapshot}>
      <div className={styles.snapshotHeading}>
        <p>
          <strong>{number(total)}</strong> {data.unit}
        </p>
        {href && <Link href={href}>Open source ↗</Link>}
      </div>
      {data.series.length > 0 && (
        <dl className={styles.snapshotSeries}>
          {data.series.map((point, index) => (
            <div key={`${point.label}-${index}`}>
              <dt>{point.label}</dt>
              <dd>{number(point.value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {rows.length > 0 ? (
        <>
          <p className={styles.snapshotNote}>
            {rows.length} records in this snapshot
            {href ? ". Open the source for the full list and actions." : "."}
          </p>
          <ul className={styles.snapshotRows}>
            {rows.map((row) => {
              const link = safeHref(row.href);
              return (
                <li key={row.id}>
                  <div>
                    {link ? (
                      <Link href={link}>{row.title}</Link>
                    ) : (
                      <strong>{row.title}</strong>
                    )}
                    {row.detail && <p>{row.detail}</p>}
                  </div>
                  {row.badge && (
                    <span data-urgent={row.urgent}>{row.badge}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className={styles.snapshotNote}>
          {total === 0
            ? data.empty
            : "This source provides summary totals. Individual records are not included in this snapshot."}
        </p>
      )}
    </div>
  );
}
