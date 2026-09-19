"use client";
import { useEffect, useState, type ComponentProps } from "react";
import { CGRecordTable } from "@/components/ui/record-table";
import {
  StatefulButton,
  useActionFeedback,
} from "@/components/ui/stateful-button";
import { ClientAutotaskTickets } from "@/components/client-autotask-tickets";
import { ClientNinjaOneDevices } from "@/components/client-ninjaone-devices";
import { ClientContactsPanel } from "@/components/client-contacts-panel";
import { AutotaskContactPicker } from "@/components/autotask-contact-picker";
import { DeleteButton } from "@/components/delete-button";
import {
  buildDeviceInsights,
  buildDeviceAgeBreakdown,
} from "@/lib/device-insights";
import { formatDate, humanizeLabel } from "@/lib/format";
import s from "@/components/ui/client-surfaces.module.css";

type TicketProps = ComponentProps<typeof ClientAutotaskTickets>;
export function ClientTicketRecords(props: TicketProps) {
  const analysis = useActionFeedback();
  const [insights, setInsights] = useState<Awaited<
    ReturnType<TicketProps["analyzeAction"]>
  > | null>(null);
  if (!props.companyId)
    return (
      <p className={s.empty}>
        Autotask is not connected. Open Connections to review client mappings.
      </p>
    );
  return (
    <div className={s.stack}>
      {analysis.error && (
        <p role="alert" className={s.error}>
          {analysis.error}
        </p>
      )}
      {insights && "insights" in insights && (
        <section className={s.card}>
          <h3>Ticket analysis</h3>
          {insights.insights.length ? (
            insights.insights.map((insight) => (
              <div className={s.row} key={insight.ticketId}>
                <div>
                  <p className={s.rowTitle}>
                    {props.tickets.find(
                      (ticket) => ticket.id === insight.ticketId,
                    )?.title || `Ticket ${insight.ticketId}`}
                  </p>
                  <p className={s.muted}>{insight.keyPoint}</p>
                  <p>{insight.pendingAction}</p>
                </div>
              </div>
            ))
          ) : (
            <p className={s.muted}>
              No notable issues were identified by this analysis.
            </p>
          )}
        </section>
      )}
      <CGRecordTable
        label="Tickets"
        columns={[
          { key: "status", label: "Status" },
          { key: "priority", label: "Priority" },
          { key: "assignee", label: "Assignee" },
          { key: "due", label: "Due" },
        ]}
        tools={
          !!props.tickets.length && (
            <StatefulButton
              status={analysis.status}
              className={s.button}
              pendingLabel="Analyzing…"
              successLabel="Analysis ready"
              onClick={() =>
                analysis.run(async () => {
                  const result = await props.analyzeAction();
                  if ("error" in result)
                    return { ok: false, error: result.error };
                  setInsights(result);
                  return { ok: true };
                })
              }
            >
              Analyze tickets
            </StatefulButton>
          )
        }
        rows={props.tickets.map((ticket) => ({
          id: String(ticket.id),
          title: ticket.title,
          sortValues: { due: ticket.due_date || "9999-12-31" },
          subtitle: ticket.ticket_number
            ? `#${ticket.ticket_number}`
            : undefined,
          values: {
            status: ticket.status,
            priority: ticket.priority,
            assignee: ticket.assigned_resource_name || "Unassigned",
            due: ticket.due_date ? formatDate(ticket.due_date) : "Unscheduled",
          },
          details: [
            { label: "Status", value: ticket.status },
            { label: "Priority", value: ticket.priority },
            { label: "Assignee", value: ticket.assigned_resource_name },
            { label: "Queue", value: ticket.queue_name },
            {
              label: "Opened",
              value: ticket.opened_at ? formatDate(ticket.opened_at) : null,
            },
            { label: "Description", value: ticket.description },
            { label: "Resolution", value: ticket.resolution },
          ],
        }))}
        renderDetail={(row) => (
          <TicketActivity
            key={row.id}
            id={Number(row.id)}
            action={props.detailAction}
          />
        )}
        empty="No open tickets are stored for this client. Use Refresh & connections if this seems out of date."
      />
    </div>
  );
}
function TicketActivity({
  id,
  action,
}: {
  id: number;
  action: TicketProps["detailAction"];
}) {
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof action>
  > | null>(null);
  const feedback = useActionFeedback();
  useEffect(() => {
    let live = true;
    action(id)
      .then((response) => {
        if (live) setResult(response);
      })
      .catch(() => {
        if (live) setResult({ error: "Ticket activity could not be loaded." });
      });
    return () => {
      live = false;
    };
  }, [id, action]);
  if (!result)
    return (
      <p role="status" className={s.muted}>
        Loading ticket activity…
      </p>
    );
  if ("error" in result)
    return (
      <div className={s.error} role="alert">
        {result.error}
        <StatefulButton
          className={s.button}
          status={feedback.status}
          pendingLabel="Loading…"
          onClick={() =>
            feedback.run(async () => {
              const response = await action(id);
              if ("error" in response)
                return { ok: false, error: response.error };
              setResult(response);
              return { ok: true };
            })
          }
        >
          Retry
        </StatefulButton>
      </div>
    );
  return (
    <>
      <section>
        <h3>Notes</h3>
        {result.notes.length ? (
          result.notes.map((note) => (
            <div className={s.card} key={note.id}>
              <p className={s.muted}>
                {formatDate(note.createdAt)} ·{" "}
                {note.creatorName || "Unknown author"}
              </p>
              <p className={s.rowTitle}>{note.title}</p>
              <p className={s.feedBody}>{note.description}</p>
            </div>
          ))
        ) : (
          <p className={s.muted}>No notes logged.</p>
        )}
      </section>
      <section>
        <h3>Time entries</h3>
        {result.timeEntries.length ? (
          result.timeEntries.map((entry) => (
            <div className={s.card} key={entry.id}>
              <p className={s.muted}>
                {formatDate(entry.dateWorked)} ·{" "}
                {entry.resourceName || "Unassigned"} ·{" "}
                {entry.hoursWorked ?? "—"}h
              </p>
              <p className={s.feedBody}>{entry.summaryNotes}</p>
            </div>
          ))
        ) : (
          <p className={s.muted}>No time logged.</p>
        )}
      </section>
    </>
  );
}
export function ClientDeviceRecords({
  devices,
  organizationId,
}: ComponentProps<typeof ClientNinjaOneDevices>) {
  const insights = buildDeviceInsights(devices);
  const ages = buildDeviceAgeBreakdown(devices);
  if (!organizationId)
    return (
      <p className={s.empty}>
        NinjaOne is not connected. Open Connections to review client mappings.
      </p>
    );
  return (
    <div className={s.stack}>
      {!!insights.length && (
        <section className={s.card}>
          <h3>Device attention items</h3>
          {insights.map((insight, index) => (
            <div className={s.row} key={index}>
              <div>
                <p className={s.rowTitle}>{insight.title}</p>
                <p className={s.muted}>{insight.detail}</p>
              </div>
              <span
                className={`${s.pill} ${insight.severity === "high" ? s.danger : ""}`}
              >
                {insight.severity}
              </span>
            </div>
          ))}
        </section>
      )}
      {!!ages.length && (
        <details>
          <summary className={s.button}>Device age breakdown</summary>
          <div className={s.technical}>
            <ClientNinjaOneDevices
              organizationId={organizationId}
              devices={devices}
            />
          </div>
        </details>
      )}
      <CGRecordTable
        label="Devices"
        columns={[
          { key: "status", label: "Connection" },
          { key: "type", label: "Type" },
          { key: "os", label: "Operating system" },
          { key: "user", label: "Last user" },
        ]}
        rows={devices.map((device) => ({
          id: String(device.id),
          title: device.system_name,
          values: {
            status:
              device.is_offline === null
                ? "Unknown"
                : device.is_offline
                  ? "Offline"
                  : "Online",
            type: device.node_class
              ? humanizeLabel(device.node_class)
              : "Unknown",
            os: device.os_name,
            user: device.last_logged_on_user,
          },
          details: Object.entries(device)
            .filter(([key]) => key !== "id")
            .map(([key, value]) => ({
              label: humanizeLabel(key),
              value:
                value === null
                  ? null
                  : key === "is_offline"
                    ? value
                      ? "Offline"
                      : "Online"
                    : key.endsWith("_bytes") && typeof value === "number"
                      ? `${(value / 1024 ** 3).toFixed(1)} GB`
                      : String(value),
            })),
        }))}
        empty="No device inventory is stored for this client. Refresh NinjaOne to retrieve the latest available data."
      />
    </div>
  );
}
export function ClientContactRecords(
  props: ComponentProps<typeof ClientContactsPanel>,
) {
  return (
    <div className={s.stack}>
      <section className={s.card}>
        <div className={s.cardHeader}>
          <h3>Primary contact</h3>
          <span className={s.pill}>
            {props.hasAutotaskMapping ? "Autotask-linked" : "Client record"}
          </span>
        </div>
        <p className={s.rowTitle}>
          {props.primaryContactName || "Not provided"}
        </p>
        {props.primaryContactEmail && (
          <a className={s.muted} href={`mailto:${props.primaryContactEmail}`}>
            {props.primaryContactEmail}
          </a>
        )}
        <p className={s.muted} style={{ marginTop: 12 }}>
          The primary contact may be updated by an Autotask sync.
        </p>
      </section>
      <CGRecordTable
        label="Contacts"
        columns={[{ key: "email", label: "Email" }]}
        rows={props.contacts.map((contact) => ({
          id: contact.id,
          title: contact.name,
          values: { email: contact.email },
        }))}
        tools={
          props.canManageClients &&
          props.hasAutotaskMapping && (
            <AutotaskContactPicker
              searchAction={props.searchAutotaskAction}
              addAction={props.addFromAutotaskAction}
            />
          )
        }
        renderDetail={(row) => (
          <div className={s.toolbar}>
            {row.values.email && (
              <a className={s.button} href={`mailto:${row.values.email}`}>
                Compose email
              </a>
            )}
            {props.canManageClients && (
              <DeleteButton
                label="Remove contact"
                action={props.removeAction.bind(null, row.id)}
                confirmText={`Remove ${row.title} from this client’s contacts?`}
              />
            )}
          </div>
        )}
        empty="No additional contacts yet."
      />
    </div>
  );
}
