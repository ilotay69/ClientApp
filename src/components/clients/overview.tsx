"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  clientHref,
  normalizeOverviewOrder,
  isClientWorkOverdue,
  type OverviewSection,
} from "@/lib/client-workspace";
import { CGActivityFeed } from "./activity";
import type { TimelineEntry } from "@/components/client-timeline";
import { formatDate } from "@/lib/format";
import { TooltipCard } from "@/components/ui/context-preview";
import { useBrowserPreference } from "@/components/ui/use-browser-preference";
import s from "@/components/ui/client-surfaces.module.css";

export type ClientOverviewData = {
  id: string;
  userId: string;
  today: string;
  primaryName: string | null;
  email: string | null;
  phone: string | null;
  owner: string | null;
  tasks: { id: string; title: string; due_date: string | null }[];
  projects: {
    id: string;
    name: string;
    status: string;
    target_end_date: string | null;
  }[];
  touchpoints: { id: string; due_date: string; completed_at: string | null }[];
  ticketCount: number | null;
  taskCount: number | null;
  projectCount: number | null;
  touchpointsAvailable: boolean;
  timeline: TimelineEntry[];
};
const titles: Record<OverviewSection, string> = {
  attention: "Needs attention",
  work: "Work summary",
  activity: "Recent activity",
  contact: "Client information",
};
export function ClientOverview({
  data,
  insights,
}: {
  data: ClientOverviewData;
  insights?: ReactNode;
}) {
  const [savedOrder, setOrder] = useBrowserPreference<OverviewSection[]>(
    `cg-client-overview:${data.userId}`,
    normalizeOverviewOrder(null),
  );
  const order = normalizeOverviewOrder(savedOrder);
  const [editing, setEditing] = useState(false);
  function move(id: OverviewSection, delta: number) {
    const next = [...order];
    const index = next.indexOf(id);
    const to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    setOrder(next);
  }
  const overdue = data.tasks.filter((task) =>
    isClientWorkOverdue(task.due_date, data.today),
  );
  const upcoming = data.touchpoints
    .filter((item) => !item.completed_at)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const sections: Record<OverviewSection, ReactNode> = {
    attention: (
      <section className={s.card}>
        <div className={s.cardHeader}>
          <h3>Needs attention</h3>
          <span className={s.muted}>Due work & follow-ups</span>
        </div>
        {overdue.slice(0, 4).map((task) => (
          <Link
            key={task.id}
            href={clientHref(data.id, "tasks")}
            className={s.row}
          >
            <div>
              <p className={s.rowTitle}>{task.title}</p>
              <p className={s.muted}>Due {formatDate(task.due_date)}</p>
            </div>
            <span className={`${s.pill} ${s.danger}`}>Overdue task</span>
          </Link>
        ))}
        {upcoming.slice(0, 2).map((item) => (
          <Link
            key={item.id}
            href={`/touchpoints/${item.id}`}
            className={s.row}
          >
            <div>
              <p className={s.rowTitle}>Client follow-up</p>
              <p className={s.muted}>{formatDate(item.due_date)}</p>
            </div>
            <span
              className={`${s.pill} ${isClientWorkOverdue(item.due_date, data.today) ? s.danger : ""}`}
            >
              {isClientWorkOverdue(item.due_date, data.today)
                ? "Overdue"
                : "Scheduled"}
            </span>
          </Link>
        ))}
        {!overdue.length && !upcoming.length && (
          <p className={s.muted}>
            {data.taskCount === null
              ? "Task information is unavailable."
              : "No overdue tasks or scheduled follow-ups in the available records."}
          </p>
        )}
        {overdue.length > 4 && (
          <Link
            className={s.button}
            style={{ marginTop: 12 }}
            href={clientHref(data.id, "tasks")}
          >
            View all overdue tasks ({overdue.length}) →
          </Link>
        )}
      </section>
    ),
    work: (
      <div className={s.metrics}>
        {[
          {
            label: "Open tickets",
            value: data.ticketCount,
            section: "tickets",
          },
          { label: "Open tasks", value: data.taskCount, section: "tasks" },
          {
            label: "Active projects",
            value: data.projectCount,
            section: "projects",
          },
          {
            label: "Next follow-up",
            value: data.touchpointsAvailable
              ? upcoming[0]
                ? formatDate(upcoming[0].due_date)
                : "Not scheduled"
              : "Unavailable",
            section: "touchpoints",
          },
        ].map((metric) =>
          metric.section === "touchpoints" && !data.touchpointsAvailable ? (
            <div key={metric.label} className={s.metric}>
              <span>{metric.label}</span>
              <strong style={{ fontSize: 16 }}>Unavailable</strong>
            </div>
          ) : (
            <Link
              key={metric.label}
              className={s.metric}
              href={clientHref(data.id, metric.section)}
            >
              <span>{metric.label} ↗</span>
              <strong
                style={
                  typeof metric.value === "string"
                    ? { fontSize: 16 }
                    : undefined
                }
              >
                {metric.value ?? "—"}
              </strong>
            </Link>
          ),
        )}
      </div>
    ),
    activity: (
      <section className={s.card}>
        <div className={s.cardHeader}>
          <h3>Recent activity</h3>
          <Link className={s.muted} href={clientHref(data.id, "activity")}>
            View all →
          </Link>
        </div>
        <CGActivityFeed entries={data.timeline.slice(0, 5)} compact />
      </section>
    ),
    contact: (
      <section className={s.card}>
        <div className={s.cardHeader}>
          <h3>Client information</h3>
          <Link className={s.muted} href={clientHref(data.id, "contacts")}>
            Contacts →
          </Link>
        </div>
        <div className={s.split}>
          <dl className={s.detailList}>
            <div>
              <dt>Primary contact</dt>
              <dd>{data.primaryName || "Not provided"}</dd>
            </div>
            <div>
              <dt>Account owner</dt>
              <dd>{data.owner || "Unassigned"}</dd>
            </div>
          </dl>
          <div className={s.stack}>
            {data.email && (
              <TooltipCard
                title={data.primaryName || "Primary contact"}
                description="Client contact details"
                trigger={<button className={s.button}>{data.email}</button>}
              >
                <a className={s.button} href={`mailto:${data.email}`}>
                  Compose email
                </a>
                {data.phone && <p>{data.phone}</p>}
              </TooltipCard>
            )}
            {data.phone && (
              <a
                className={s.button}
                href={`tel:${data.phone.replace(/[^+\d]/g, "")}`}
              >
                {data.phone}
              </a>
            )}
          </div>
        </div>
      </section>
    ),
  };
  return (
    <div className={s.stack}>
      <div className={s.toolbar} style={{ justifyContent: "flex-end" }}>
        <button
          className={s.button}
          aria-pressed={editing}
          onClick={() => setEditing(!editing)}
        >
          {editing ? "Done arranging" : "Arrange overview"}
        </button>
      </div>
      {order.map((id, index) => (
        <div key={id}>
          {editing && (
            <div className={s.toolbar} style={{ marginBottom: 8 }}>
              <span className={s.muted}>{titles[id]}</span>
              <button
                className={s.button}
                disabled={index === 0}
                onClick={() => move(id, -1)}
                aria-label={`Move ${titles[id]} earlier`}
              >
                ↑
              </button>
              <button
                className={s.button}
                disabled={index === order.length - 1}
                onClick={() => move(id, 1)}
                aria-label={`Move ${titles[id]} later`}
              >
                ↓
              </button>
              <button
                className={s.button}
                disabled={index === 0}
                onClick={() =>
                  setOrder([id, ...order.filter((item) => item !== id)])
                }
              >
                Pin to top
              </button>
            </div>
          )}
          {sections[id]}
        </div>
      ))}
      {insights}
    </div>
  );
}
