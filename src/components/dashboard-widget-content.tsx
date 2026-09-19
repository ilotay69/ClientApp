"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchLiveDashboardWidget } from "@/app/(dashboard)/dashboard/live-widget-action";
import { acknowledgeDashboardAlert } from "@/app/(dashboard)/dashboard/workspace-actions";
import type {
  Widget,
  WidgetData,
  DrilldownSeries,
} from "@/lib/dashboard-workspace";
import styles from "./dashboard-workspace.module.css";
import {
  compactWidgetSeries,
  filterWidgetRecords,
} from "@/lib/dashboard-workspace";
import {
  DashboardWidgetRecords,
  safeWidgetHref as safeHref,
} from "./dashboard-widget-records";
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
export function WidgetContent({
  widget,
  data,
}: {
  widget: Widget;
  data: WidgetData;
}) {
  const [selection, setSelection] = useState<{
    label?: string;
    categories: string[] | null;
  } | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const legendButtons = useRef(new Map<string, HTMLButtonElement>());
  function openRecords(point: DrilldownSeries | null, origin?: HTMLElement) {
    returnFocus.current = origin ?? null;
    setSelection({
      label: point?.label,
      categories: point?.categories ?? null,
    });
  }
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [ackError, setAckError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  if (data.error)
    return (
      <div className={`${styles.widgetBody} ${styles.connection}`}>
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
  const series = compactWidgetSeries(
    data.key === "alerts"
      ? data.series.map((point) => ({ ...point, value: total }))
      : data.series,
    widget.limit,
  );
  const sum = series.reduce((n, s) => n + s.value, 0);
  const visibleRows = data.rows.filter((r) => !acknowledged.includes(r.id));
  const records = (data.records ?? data.rows).filter(
    (row) => !acknowledged.includes(row.id),
  );
  const tones = [
    "var(--widget-accent)",
    "#c6c8c5",
    "#dfb88d",
    "#869f92",
    "#7d94a2",
    "#dcdedb",
  ];
  const href = safeHref(data.href);
  return (
    <>
      <div className={styles.widgetBody}>
        <div className={styles.widgetValue}>
          <strong>
            {canAnimateWorkspaceMetric(data.key) ? (
              <AnimatedNumber value={total} maximumFractionDigits={1} />
            ) : (
              number(total)
            )}
          </strong>
          <span>{data.unit}</span>
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
          <div className={styles.rows}>
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
              const rowHref = safeHref(row.href);
              return (
                <div key={row.id} className={styles.rowWrap}>
                  {rowHref ? (
                    <Link href={rowHref} className={styles.row}>
                      {content}
                    </Link>
                  ) : (
                    <div className={styles.row}>{content}</div>
                  )}
                  {data.key === "alerts" && (
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
                              setAcknowledged((current) => [
                                ...current,
                                row.id,
                              ]);
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
          </div>
        ) : widget.display === "donut" ? (
          <div className={styles.donutArea}>
            <svg
              viewBox="0 0 160 160"
              role="group"
              aria-label={`${widget.title} chart. Select a segment to view records.`}
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
                    key={s.categories.join("\u0000")}
                    className={styles.donutSegment}
                    role="button"
                    tabIndex={s.value > 0 ? 0 : -1}
                    aria-label={`View ${s.label}: ${number(s.value)}`}
                    aria-haspopup="dialog"
                    onClick={() =>
                      openRecords(
                        s,
                        legendButtons.current.get(s.categories.join("\u0000")),
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openRecords(
                          s,
                          legendButtons.current.get(
                            s.categories.join("\u0000"),
                          ),
                        );
                      }
                    }}
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
                <button
                  key={s.categories.join("\u0000")}
                  type="button"
                  ref={(element) => {
                    const key = s.categories.join("\u0000");
                    if (element) legendButtons.current.set(key, element);
                    else legendButtons.current.delete(key);
                  }}
                  aria-label={`View ${s.label}: ${number(s.value)}`}
                  aria-haspopup="dialog"
                  onClick={(event) => openRecords(s, event.currentTarget)}
                >
                  <span style={{ background: tones[i % tones.length] }} />
                  <span>{s.label}</span>
                  <strong>{number(s.value)}</strong>
                </button>
              ))}
            </div>
          </div>
        ) : data.key === "task_schedule" ? (
          <div
            className={styles.columnChart}
            role="group"
            aria-label={`${widget.title} chart. Select a bar to view records.`}
          >
            {series.map((s, i) => (
              <button
                className={styles.column}
                key={s.categories.join("\u0000")}
                type="button"
                aria-haspopup="dialog"
                aria-label={`View ${s.label}: ${number(s.value)}`}
                onClick={(event) => openRecords(s, event.currentTarget)}
              >
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
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.barChart}>
            {series.map((s) => (
              <button
                className={styles.barButton}
                key={s.categories.join("\u0000")}
                type="button"
                aria-haspopup="dialog"
                aria-label={`View ${s.label}: ${number(s.value)}`}
                onClick={(event) => openRecords(s, event.currentTarget)}
              >
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
              </button>
            ))}
          </div>
        )}
      </div>
      <footer className={styles.widgetFooter}>
        <span>
          {records.length} {data.recordsLabel ?? "records"}
        </span>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`View all ${widget.title}`}
          onClick={(event) => openRecords(null, event.currentTarget)}
        >
          View all <span aria-hidden="true">↗</span>
        </button>
      </footer>
      {selection && (
        <DashboardWidgetRecords
          title={widget.title}
          category={selection.label}
          rows={filterWidgetRecords(records, selection.categories)}
          recordsLabel={data.recordsLabel}
          sourceHref={data.href}
          onClose={() => setSelection(null)}
          finalFocus={returnFocus}
        />
      )}
    </>
  );
}
