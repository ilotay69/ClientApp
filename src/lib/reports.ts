import { formatDate, humanizeLabel } from "@/lib/format";
import { fetchClientHoursSummary, fetchResourceHoursSummary, lastBusinessDayBefore, ymd } from "@/lib/resource-hours";
import { fetchTimeEntriesForAnalysis } from "@/lib/time-entry-insights";
import { fetchContractBlockHours } from "@/lib/contract-hours";
import { fetchAgingOpenTickets } from "@/lib/ticket-aging";
import type { AutotaskCredentials } from "@/lib/autotask";
import { fetchForticloudDeviceInventory } from "@/lib/forticloud-lookups";
import type { ForticloudCredentials } from "@/lib/forticloud";
import { fetchGravityZoneEndpointInventory } from "@/lib/bitdefender-lookups";
import type { BitdefenderCredentials } from "@/lib/bitdefender";
import { fetchWizerCompanyMetrics } from "@/lib/wizer-lookups";
import type { WizerCredentials } from "@/lib/wizer";
import {
  fetchOfflineDevicesAccountWide,
  fetchDiskAlertsAccountWide,
  fetchAgingHardwareAccountWide,
  fetchOsEolAccountWide,
} from "@/lib/device-lookups";
import { fetchAntivirusAlertsAccountWide, fetchMissingPatchesAccountWide } from "@/lib/device-security-lookups";
import type { NinjaOneCredentials } from "@/lib/ninjaone";
import {
  fetchSecureScoreRollup,
  fetchLicenseUtilizationRollup,
  fetchMfaGapsRollup,
  fetchInactiveAccountsRollup,
  fetchPrivilegedRolesRollup,
  fetchMailboxUsageRollup,
  type ClientLookupError,
} from "@/lib/m365-lookups";

export type ReportCell = string | number | boolean | null | undefined;
export type ReportData = {
  headers: string[];
  rows: ReportCell[][];
  /** Per-client failures for a report that queries every configured
   * client independently (the M365 rollups below) — a missing Graph
   * permission on one client's app registration shouldn't blank the whole
   * report, but silently dropping that client's rows with no indication
   * would let a real gap in the data go unnoticed. Preview-only: the CSV
   * download itself is just headers/rows, since a spreadsheet isn't a
   * good place for "3 clients failed" prose. */
  warnings?: string[];
};

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
      "system_name, node_class, is_offline, last_contact, device_created_at, manufacturer_fulfillment_date, os_name, os_version, manufacturer, model, cpu_model, ram_bytes, disk_total_bytes, disk_free_bytes, clients(name)"
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
    cpu_model: string | null;
    ram_bytes: number | null;
    disk_total_bytes: number | null;
    disk_free_bytes: number | null;
    clients: { name: string } | null;
  };

  // Same GB rounding as the Devices tab/portal — a raw byte count means
  // nothing to whoever opens this CSV.
  const gb = (bytes: number | null): string | null => (bytes && bytes > 0 ? `${Math.round(bytes / 1024 ** 3)} GB` : null);
  const diskUsed = (total: number | null, free: number | null): string | null => {
    if (!total || total <= 0) return null;
    const usedPct = Math.round(((total - (free ?? 0)) / total) * 100);
    return `${usedPct}% of ${gb(total)}`;
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
      "CPU",
      "RAM",
      "Disk used",
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
      d.cpu_model,
      gb(d.ram_bytes),
      diskUsed(d.disk_total_bytes, d.disk_free_bytes),
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

/** Per-resource version of the client summary above — same four columns,
 * one row per Autotask resource instead of per client. Moved over from
 * the Lookups page's "Resource Hours" tab; that tab's OTHER half (the
 * flexible by-client-or-resource / N-days picker, HoursLookup) stays
 * Lookups-only — it's parameterized by what the user picks, not a fixed
 * dataset a static CSV download can represent. */
export async function buildResourceHoursReport(
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<ReportData> {
  const rows = await fetchResourceHoursSummary(creds, zoneUrl);
  return {
    headers: ["Resource", "Today", "Yesterday", "This week", "This month"],
    rows: rows.map((r) => [
      r.resourceName,
      r.today.toFixed(1),
      r.yesterday.toFixed(1),
      r.thisWeek.toFixed(1),
      r.thisMonth.toFixed(1),
    ]),
  };
}

/** Every individual time entry from the last business day — "yesterday"
 * meaning the last business day, same definition the Lookups tab used
 * (a Monday shows Friday's entries, not Sunday's). Zero parameters, so
 * it's a real report despite being date-scoped: the date itself isn't a
 * user choice, it's always "the last business day as of now". */
export async function buildYesterdayTimeEntriesReport(
  admin: Supabase,
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<ReportData> {
  const yesterdayStr = ymd(lastBusinessDayBefore(new Date()));
  const entries = await fetchTimeEntriesForAnalysis(admin, creds, zoneUrl, yesterdayStr, yesterdayStr);
  return {
    headers: ["Client", "Resource", "Ticket #", "Hours", "Date", "Notes"],
    rows: entries.map((e) => [
      e.clientName,
      e.resourceName,
      e.ticketId,
      e.hoursWorked.toFixed(2),
      formatDate(e.dateWorked),
      e.summaryNotes,
    ]),
  };
}

/** Prepaid/block hours remaining for every active Contract Block,
 * account-wide — purchased vs. used vs. remaining. Distinct from
 * "Block of hrs usage" (already in Reports): that one is a single
 * client's block with its own line items and an email-to-client button;
 * this is the account-wide summary across every client at once. */
export async function buildContractBlockHoursReport(
  admin: Supabase,
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<ReportData> {
  const rows = await fetchContractBlockHours(admin, creds, zoneUrl);
  return {
    headers: ["Client", "Contract", "Purchased", "Used", "Remaining", "% used", "Start", "End"],
    rows: rows.map((r) => [
      r.clientName,
      r.contractName,
      r.purchased.toFixed(1),
      r.used.toFixed(1),
      r.remaining.toFixed(1),
      `${Math.round(r.percentUsed)}%`,
      formatDate(r.startDate),
      formatDate(r.endDate),
    ]),
  };
}

/** Every open ticket account-wide, oldest/most-overdue first. */
export async function buildAgingTicketsReport(
  admin: Supabase,
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<ReportData> {
  const rows = await fetchAgingOpenTickets(admin, creds, zoneUrl);
  return {
    headers: ["Client", "Ticket", "Queue", "Assigned to", "Days open", "Due date", "Overdue"],
    rows: rows.map((r) => [
      r.clientName,
      r.title,
      r.queueName,
      r.assignedResourceName,
      r.daysOpen,
      r.dueDate ? formatDate(r.dueDate) : null,
      r.isOverdue ? "Yes" : "No",
    ]),
  };
}

/** Live from every FortiCloud account on file — same fetcher as the
 * FortiCloud Devices lookup, not stored anywhere. */
export async function buildForticloudDevicesReport(
  accounts: { label: string; creds: ForticloudCredentials }[]
): Promise<ReportData> {
  const rows = await fetchForticloudDeviceInventory(accounts);
  return {
    headers: ["Account", "Model", "Serial", "Description", "Support status", "Support ends", "Hardware EoS"],
    rows: rows.map((r) => [
      r.accountLabel,
      r.productModel,
      r.serialNumber,
      r.description,
      humanizeLabel(r.supportStatus),
      r.supportEndDate ? formatDate(r.supportEndDate) : null,
      r.eosDate ? formatDate(r.eosDate) : null,
    ]),
  };
}

/** Live from GravityZone across every company visible to the partner key —
 * same fetcher as the Bitdefender Endpoints lookup, not stored anywhere. */
export async function buildBitdefenderEndpointsReport(creds: BitdefenderCredentials): Promise<ReportData> {
  const rows = await fetchGravityZoneEndpointInventory(creds);
  return {
    headers: ["Company", "Endpoint", "OS", "IP", "Agent", "Last scan"],
    rows: rows.map((r) => [
      r.companyName,
      r.endpointName,
      r.os,
      r.ip,
      r.productOutdated ? "Needs update" : "Up to date",
      r.lastScanDate ? formatDate(r.lastScanDate) : null,
    ]),
  };
}

/** Live across every Wizer customer company — same fetcher as the Wizer
 * Training & Phishing lookup, not stored anywhere. */
export async function buildWizerMetricsReport(creds: WizerCredentials): Promise<ReportData> {
  const rows = await fetchWizerCompanyMetrics(creds);
  return {
    headers: [
      "Company",
      "Users registered",
      "Users total",
      "Training completed",
      "Training assigned",
      "Phishing participated",
      "Phishing clicked",
      "Phishing reported",
    ],
    rows: rows.map((r) => [
      r.companyName,
      r.usersRegistered,
      r.usersTotal,
      r.trainingCompleted,
      r.trainingAssigned,
      r.phishingParticipated,
      r.phishingClicked,
      r.phishingReported,
    ]),
  };
}

/** These four are plain reads of the ninjaone_devices table (synced hourly
 * by the ninjaone-sync cron) — no live NinjaOne call, so no settings guard
 * is needed in the caller beyond the permission check, same as the
 * Lookups tabs they're moved from. */
export async function buildOfflineDevicesReport(admin: Supabase): Promise<ReportData> {
  const rows = await fetchOfflineDevicesAccountWide(admin);
  return {
    headers: ["Client", "Device", "Type", "Days offline", "Last contact"],
    rows: rows.map((r) => [
      r.clientName,
      r.systemName,
      r.nodeClass ? humanizeLabel(r.nodeClass.toLowerCase()) : null,
      r.daysOffline,
      r.lastContact ? formatDate(r.lastContact) : null,
    ]),
  };
}

export async function buildDiskAlertsReport(admin: Supabase): Promise<ReportData> {
  const rows = await fetchDiskAlertsAccountWide(admin);
  return {
    headers: ["Client", "Device", "Disk used", "% used"],
    rows: rows.map((r) => [
      r.clientName,
      r.systemName,
      `${Math.round(r.totalBytes / 1024 ** 3)} GB`,
      `${Math.round(r.percentUsed)}%`,
    ]),
  };
}

/** Split into two reports rather than one "Hardware Lifecycle" report —
 * aging hardware (by age in years) and OS end-of-life (by EOL date) are
 * different row shapes with no natural shared column set, unlike the
 * Lookups tab which could just stack two independent tables in one UI. */
export async function buildAgingHardwareReport(admin: Supabase): Promise<ReportData> {
  const rows = await fetchAgingHardwareAccountWide(admin);
  return {
    headers: ["Client", "Device", "Type", "Age (years)"],
    rows: rows.map((r) => [r.clientName, r.systemName, humanizeLabel(r.deviceType), r.ageYears.toFixed(1)]),
  };
}

export async function buildOsEolReport(admin: Supabase): Promise<ReportData> {
  const rows = await fetchOsEolAccountWide(admin);
  return {
    headers: ["Client", "Device", "OS", "End of life", "Days to EOL"],
    rows: rows.map((r) => [r.clientName, r.systemName, r.osName, `${r.eolLabel} (${formatDate(r.eolDate)})`, r.daysToEol]),
  };
}

/** These two need a live per-organization NinjaOne call (antivirus/patch
 * status isn't synced into ninjaone_devices) — same as the Lookups tabs,
 * the integration must be connected. */
export async function buildAntivirusAlertsReport(
  admin: Supabase,
  creds: NinjaOneCredentials,
  token: string
): Promise<ReportData> {
  const rows = await fetchAntivirusAlertsAccountWide(admin, creds, token);
  return {
    headers: ["Client", "Device", "Product", "State", "Definitions"],
    rows: rows.map((r) => [r.clientName, r.deviceName, r.productName, r.productState, r.definitionStatus]),
  };
}

export async function buildMissingPatchesReport(
  admin: Supabase,
  creds: NinjaOneCredentials,
  token: string
): Promise<ReportData> {
  const rows = await fetchMissingPatchesAccountWide(admin, creds, token);
  return {
    headers: ["Client", "Device", "Patch", "KB", "Severity", "Status"],
    rows: rows.map((r) => [r.clientName, r.deviceName, r.patchName, r.kbNumber, r.severity, r.status]),
  };
}

/** Shared by all six M365 rollup reports below — turns per-client
 * failures (a missing Graph permission, a not-yet-consented app
 * registration) into a short warnings list rather than either silently
 * dropping that client's rows or failing the whole report. */
function clientErrorWarnings(errors: ClientLookupError[]): string[] | undefined {
  if (errors.length === 0) return undefined;
  return errors.map((e) => `${e.clientName}: ${e.error}`);
}

export async function buildSecureScoreRollupReport(admin: Supabase): Promise<ReportData> {
  const { rows, errors } = await fetchSecureScoreRollup(admin);
  return {
    headers: ["Client", "Score", "Max", "%"],
    rows: rows.map((r) => [r.clientName, r.currentScore, r.maxScore, `${Math.round(r.percent)}%`]),
    warnings: clientErrorWarnings(errors),
  };
}

export async function buildLicenseUtilizationRollupReport(admin: Supabase): Promise<ReportData> {
  const { rows, errors } = await fetchLicenseUtilizationRollup(admin);
  return {
    headers: ["Client", "SKU", "Purchased", "Consumed", "Available", "% used"],
    rows: rows.map((r) => [
      r.clientName,
      r.skuPartNumber,
      r.purchased,
      r.consumed,
      r.available,
      `${Math.round(r.percentUsed)}%`,
    ]),
    warnings: clientErrorWarnings(errors),
  };
}

export async function buildMfaGapsRollupReport(admin: Supabase): Promise<ReportData> {
  const { rows, errors } = await fetchMfaGapsRollup(admin);
  return {
    headers: ["Client", "User", "Display name", "Admin"],
    rows: rows.map((r) => [r.clientName, r.userPrincipalName, r.userDisplayName, r.isAdmin ? "Yes" : "No"]),
    warnings: clientErrorWarnings(errors),
  };
}

export async function buildInactiveAccountsRollupReport(admin: Supabase): Promise<ReportData> {
  const { rows, errors } = await fetchInactiveAccountsRollup(admin);
  return {
    headers: ["Client", "User", "Display name", "Days since sign-in"],
    rows: rows.map((r) => [
      r.clientName,
      r.userPrincipalName,
      r.displayName,
      r.daysSinceSignIn ?? "Never signed in",
    ]),
    warnings: clientErrorWarnings(errors),
  };
}

export async function buildPrivilegedRolesRollupReport(admin: Supabase): Promise<ReportData> {
  const { rows, errors } = await fetchPrivilegedRolesRollup(admin);
  return {
    headers: ["Client", "Role", "Member", "UPN"],
    rows: rows.map((r) => [r.clientName, r.roleName, r.memberDisplayName, r.memberUpn]),
    warnings: clientErrorWarnings(errors),
  };
}

export async function buildMailboxUsageRollupReport(admin: Supabase): Promise<ReportData> {
  const { rows, errors } = await fetchMailboxUsageRollup(admin);
  return {
    headers: ["Client", "User", "Display name", "Storage used", "Quota", "% used"],
    rows: rows.map((r) => [
      r.clientName,
      r.userPrincipalName,
      r.displayName,
      `${Math.round(r.storageUsedBytes / 1024 ** 3)} GB`,
      `${Math.round(r.quotaBytes / 1024 ** 3)} GB`,
      `${Math.round(r.percentUsed)}%`,
    ]),
    warnings: clientErrorWarnings(errors),
  };
}
