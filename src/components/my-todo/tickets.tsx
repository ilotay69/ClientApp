"use client";
import { useState } from "react";
import type { MyOpenTicketRow } from "@/lib/my-tickets";
import {
  dateLabel,
  safeExternalUrl,
  type TodoActions,
  type ItemState,
} from "@/lib/my-todo-workspace";
import { useRemote, Drawer, Empty, ErrorNotice, Loading, TodoIcon } from "./ui";
import s from "./workspace.module.css";
export function TodoTickets({
  actions,
  items,
  plan,
  today,
  plannedOnly = false,
}: {
  actions: TodoActions;
  items: ItemState[];
  plan: (
    key: string,
    date: string | null,
    position?: number,
    snooze?: string | null,
  ) => Promise<boolean>;
  today: string;
  plannedOnly?: boolean;
}) {
  const remote = useRemote(actions.tickets);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [queue, setQueue] = useState("");
  const [client, setClient] = useState("");
  const [priority, setPriority] = useState("");
  const [selected, setSelected] = useState<MyOpenTicketRow | null>(null);
  const [busy, setBusy] = useState(false);
  const data = remote.data && !("error" in remote.data) ? remote.data : null;
  const all = data?.tickets ?? [];
  const pins = new Set(
    items.filter((i) => i.planned_on === today).map((i) => i.item_key),
  );
  const tickets = all.filter(
    (t) =>
      (!plannedOnly || pins.has(`ticket:${t.id}`)) &&
      (!q ||
        `${t.title} ${t.ticketNumber ?? ""} ${t.clientName ?? ""}`
          .toLowerCase()
          .includes(q.toLowerCase())) &&
      (!status || t.status === status) &&
      (!queue || t.queueName === queue) &&
      (!client || t.clientName === client) &&
      (!priority || t.priority === priority),
  );
  const options = (key: "status" | "queueName" | "priority" | "clientName") =>
    [...new Set(all.map((t) => t[key]).filter((v): v is string => !!v))].sort();
  async function pin(ticket: MyOpenTicketRow) {
    setBusy(true);
    await plan(
      `ticket:${ticket.id}`,
      pins.has(`ticket:${ticket.id}`) ? null : today,
    );
    setBusy(false);
  }
  return (
    <section className={s.ticketArea}>
      <div className={s.sectionHeading}>
        <div>
          <h2>{plannedOnly ? "Planned tickets" : "My tickets"}</h2>
          <p>Autotask · primary and secondary assignments · read-only</p>
        </div>
        <button
          className={s.button}
          onClick={remote.refresh}
          disabled={remote.loading}
        >
          <TodoIcon name="refresh" />
          Refresh tickets
        </button>
      </div>
      {!plannedOnly && (
        <div className={s.toolbar}>
          <label className={s.search}>
            <TodoIcon name="search" />
            <input
              aria-label="Search tickets"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, ticket number, or client…"
            />
          </label>
          {(
            [
              { label: "Status", value: status, set: setStatus, key: "status" },
              { label: "Queue", value: queue, set: setQueue, key: "queueName" },
              {
                label: "Client",
                value: client,
                set: setClient,
                key: "clientName",
              },
              {
                label: "Priority",
                value: priority,
                set: setPriority,
                key: "priority",
              },
            ] as const
          ).map((f) => (
            <select
              key={f.key}
              aria-label={`Ticket ${f.label.toLowerCase()}`}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
            >
              <option value="">All {f.label.toLowerCase()}</option>
              {options(f.key).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          ))}
        </div>
      )}
      {remote.loading && !data ? (
        <Loading label="Loading Autotask tickets" />
      ) : remote.error || (remote.data && "error" in remote.data) ? (
        <ErrorNotice retry={remote.refresh}>
          {remote.error ||
            (remote.data && "error" in remote.data ? remote.data.error : "")}
        </ErrorNotice>
      ) : data && !data.matchedResourceName ? (
        <div className={s.card}>
          <Empty
            title="Autotask profile not matched"
            icon="tickets"
            action={
              <a className={s.button} href="/settings/profile">
                Check My Profile
              </a>
            }
          >
            Set your Autotask resource in My Profile, or check the integration
            connection.
          </Empty>
        </div>
      ) : (
        <div className={s.card}>
          {tickets.length ? (
            tickets.map((t) => (
              <div className={s.ticketRow} key={t.id}>
                <div className={s.ticketNumber}>
                  {t.ticketNumber ?? `#${t.id}`}
                </div>
                <button className={s.taskTitle} onClick={() => setSelected(t)}>
                  <strong>{t.title}</strong>
                  <span>
                    {t.clientName ?? "No matched client"} ·{" "}
                    {t.queueName ?? "No queue"}
                  </span>
                </button>
                <span className={s.statusBadge}>
                  {t.status ?? "Unknown status"}
                </span>
                <span className={s.priority}>{t.priority}</span>
                <span className={s.due}>
                  {dateLabel(t.dueDate?.slice(0, 10) ?? null, today)}
                </span>
                <button
                  className={`${s.planButton} ${pins.has(`ticket:${t.id}`) ? s.isPlanned : ""}`}
                  aria-label={`${pins.has(`ticket:${t.id}`) ? "Remove from today" : "Plan for today"}: ${t.title}`}
                  disabled={busy}
                  onClick={() => pin(t)}
                >
                  <TodoIcon name="calendar" />
                </button>
              </div>
            ))
          ) : (
            <Empty
              title={
                plannedOnly
                  ? "No open tickets in this plan"
                  : "No matching open tickets"
              }
              icon="tickets"
            >
              {plannedOnly
                ? "Previously planned tickets may have closed or been reassigned. Refresh to check."
                : "Change the filters or refresh Autotask."}
            </Empty>
          )}
        </div>
      )}
      {selected && (
        <TicketDetails
          key={selected.id}
          ticket={selected}
          actions={actions}
          onClose={() => setSelected(null)}
          onPlan={() => pin(selected)}
          busy={busy}
          pinned={pins.has(`ticket:${selected.id}`)}
        />
      )}
    </section>
  );
}
function TicketDetails({
  ticket,
  actions,
  onClose,
  onPlan,
  pinned,
  busy,
}: {
  ticket: MyOpenTicketRow;
  actions: TodoActions;
  onClose: () => void;
  onPlan: () => void;
  pinned: boolean;
  busy: boolean;
}) {
  const remote = useRemote(() => actions.ticketDetail(ticket.id));
  return (
    <Drawer
      open
      onClose={onClose}
      title={ticket.ticketNumber ?? `Ticket ${ticket.id}`}
      description="Autotask · read-only"
    >
      <div className={s.editor}>
        <h2 className={s.ticketTitle}>{ticket.title}</h2>
        <div className={s.sourceBox}>
          <p>
            {ticket.clientName ?? "No matched client"}
            <br />
            {ticket.queueName} · {ticket.status} · {ticket.priority}
          </p>
        </div>
        <dl className={s.detailDates}>
          <div>
            <dt>Due date</dt>
            <dd>
              {ticket.dueDate
                ? new Date(ticket.dueDate).toLocaleString()
                : "No due date"}
            </dd>
          </div>
          <div>
            <dt>Last activity</dt>
            <dd>
              {ticket.lastActivityAt
                ? new Date(ticket.lastActivityAt).toLocaleString()
                : "Unavailable"}
            </dd>
          </div>
        </dl>
        {remote.loading ? (
          <Loading label="Loading description" />
        ) : remote.error ? (
          <ErrorNotice retry={remote.refresh}>{remote.error}</ErrorNotice>
        ) : remote.data && "error" in remote.data ? (
          <ErrorNotice retry={remote.refresh}>{remote.data.error}</ErrorNotice>
        ) : (
          <p className={s.prewrap}>
            {remote.data?.description || "No description provided."}
          </p>
        )}
        <p className={s.muted}>
          Planning changes only your personal My To-Do list. Complete or edit
          the ticket in Autotask.
        </p>
        <div className={s.actions}>
          <button className={s.button} onClick={onPlan} disabled={busy}>
            {pinned ? "Remove from today" : "Plan for today"}
          </button>
          {safeExternalUrl(ticket.ticketUrl) && (
            <a
              className={s.primary}
              href={safeExternalUrl(ticket.ticketUrl)}
              target="_blank"
              rel="noreferrer"
            >
              Open Autotask <TodoIcon name="external" />
            </a>
          )}
        </div>
      </div>
    </Drawer>
  );
}
