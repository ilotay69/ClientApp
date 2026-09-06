import { formatDate, humanizeLabel } from "@/lib/format";
import { fetchClientHoursSummary } from "@/lib/resource-hours";
import type { AutotaskCredentials } from "@/lib/autotask";

export type ReportCell = string | number | boolean | null | undefined;
export type ReportData = { headers: string[]; rows: ReportCell[][] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = any;

/** Shared by /api/reports/clients (CSV download) and the Reports page
 * preview action — one query, one column definition, so the preview can
 * never drift from what actually downloads. */
export async function buildClientRosterReport(supabase: Supabase): Promise<ReportData> {
  const { data: clients } = await supabase
    .from("clients")
    .select(
      "name, primary_contact_name, primary_contact_email, autotask_company_id, ninjaone_organization_id, m365_tenant_id"
    )
    .order("name");

  type Row = {
    name: string;
    primary_contact_name: string | null;
    primary_contact_email: string | null;
    autotask_company_id: number | null;
    ninjaone_organization_id: number | null;
    m365_tenant_id: string | null;
  };

  return {
    headers: ["Client", "Primary contact", "Primary contact email", "Autotask mapped", "NinjaOne mapped", "M365 mapped"],
    rows: ((clients ?? []) as Row[]).map((c) => [
      c.name,
      c.primary_contact_name,
      c.primary_contact_email,
      c.autotask_company_id != null ? "Yes" : "No",
      c.ninjaone_organization_id != null ? "Yes" : "No",
      c.m365_tenant_id ? "Yes" : "No",
    ]),
  };
}

export async function buildDeviceInventoryReport(supabase: Supabase): Promise<ReportData> {
  const { data: devices } = await supabase
    .from("ninjaone_devices")
    .select(
      "system_name, node_class, is_offline, last_contact, device_created_at, manufacturer_fulfillment_date, os_name, os_version, manufacturer, model, clients(name)"
    )
    .order("system_name");

  type Row = {
    system_name: string;
    node_class: string | null;
    is_offline: boolean | null;
    last_contact: string | null;
    device_created_at: string | null;
    manufacturer_fulfillment_date: string | null;
    os_name: string | null;
    os_version: string | null;
    manufacturer: string | null;
    model: string | null;
    clients: { name: string } | null;
  };

  return {
    headers: [
      "Client",
      "Device",
      "Type",
      "Status",
      "OS",
      "OS version",
      "Manufacturer",
      "Model",
      "Manufactured / shipped",
      "First registered",
      "Last contact",
    ],
    rows: ((devices ?? []) as unknown as Row[]).map((d) => [
      d.clients?.name ?? "Unmapped",
      d.system_name,
      d.node_class ? humanizeLabel(d.node_class.toLowerCase()) : null,
      d.is_offline == null ? null : d.is_offline ? "Offline" : "Online",
      d.os_name,
      d.os_version,
      d.manufacturer,
      d.model,
      d.manufacturer_fulfillment_date ? formatDate(d.manufacturer_fulfillment_date) : null,
      d.device_created_at ? formatDate(d.device_created_at) : null,
      d.last_contact ? formatDate(d.last_contact) : null,
    ]),
  };
}

export async function buildOpenTicketsReport(supabase: Supabase): Promise<ReportData> {
  const { data: tickets } = await supabase
    .from("autotask_tickets")
    .select(
      "ticket_number, title, status, priority, queue_name, assigned_resource_name, due_date, last_activity_at, clients(name)"
    )
    .order("last_activity_at", { ascending: true });

  type Row = {
    ticket_number: string | null;
    title: string;
    status: string | null;
    priority: string | null;
    queue_name: string | null;
    assigned_resource_name: string | null;
    due_date: string | null;
    last_activity_at: string | null;
    clients: { name: string } | null;
  };

  return {
    headers: ["Client", "Ticket #", "Title", "Status", "Priority", "Queue", "Assigned to", "Due date", "Last activity"],
    rows: ((tickets ?? []) as unknown as Row[]).map((t) => [
      t.clients?.name ?? "Unmapped",
      t.ticket_number,
      t.title,
      t.status,
      t.priority,
      t.queue_name,
      t.assigned_resource_name,
      t.due_date ? formatDate(t.due_date) : null,
      t.last_activity_at ? formatDate(t.last_activity_at) : null,
    ]),
  };
}

export async function buildHoursSummaryReport(
  admin: Supabase,
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<ReportData> {
  const rows = await fetchClientHoursSummary(admin, creds, zoneUrl);
  return {
    headers: ["Client", "Today", "Yesterday", "This week", "This month"],
    rows: rows.map((r) => [r.clientName, r.today.toFixed(1), r.yesterday.toFixed(1), r.thisWeek.toFixed(1), r.thisMonth.toFixed(1)]),
  };
}
