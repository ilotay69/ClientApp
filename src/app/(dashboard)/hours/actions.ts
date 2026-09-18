"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import {
  fetchResourceHoursSummary,
  fetchResourceDayEntries,
  fetchHoursByGroup,
  fetchNonBillableHoursByGroup,
  lastBusinessDayBefore,
  ymd,
  type ResourceHoursRow,
  type ResourceDayEntry,
  type HoursByGroupRow,
} from "@/lib/resource-hours";
import { fetchTimeEntriesForAnalysis, type TimeEntryForAnalysis } from "@/lib/time-entry-insights";
import { buildContractUsagePdf } from "@/lib/contract-usage-pdf";
import { buildContractUsageClientEmail } from "@/lib/resend";
import { getEmailTemplate, applyTemplateVars } from "@/lib/email-templates";
import { getBlockHoursReportCc, logBlockHoursReportSend } from "@/lib/block-hours-report-send";
import { sendMailAsSharedMailbox, type SharedMailboxAttachment } from "@/lib/microsoft-graph";
import { getSharedMailboxSettings, getValidSharedMailboxToken } from "@/lib/shared-mailbox";
import {
  fetchContractBlockHours,
  fetchContractUsageForCompany,
  type ContractBlockHoursRow,
  type ContractUsageRow,
} from "@/lib/contract-hours";
import { fetchAgingOpenTickets, type AgingTicketRow } from "@/lib/ticket-aging";
import { searchTicketsForCompany, type AutotaskTicketSearchRow } from "@/lib/autotask";

/** Live from Autotask, on demand — not synced/stored anywhere, since "hours
 * worked today" is only ever meaningful as of right now, not as a cached
 * value that goes stale the moment someone logs more time. */
export async function fetchResourceHoursAction(): Promise<
  { rows: ResourceHoursRow[]; todayDate: string; yesterdayDate: string } | { error: string }
> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    const rows = await fetchResourceHoursSummary(settings.credentials, settings.zoneUrl);
    const now = new Date();
    // Handed back alongside the rows so the widget's "Today"/"Yesterday"
    // links can point at the exact dateWorked this summary itself used —
    // "yesterday" is the last business day, not the last calendar day (see
    // lastBusinessDayBefore), so the widget must not recompute it itself.
    return { rows, todayDate: ymd(now), yesterdayDate: ymd(lastBusinessDayBefore(now)) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load hours." };
  }
}

/** The Team Hours widget's drill-down — every technician's individual time
 * entries for one day, live from Autotask (or just one technician's, if
 * resourceId is passed). Same permission as the widget itself
 * (view_lookups): whoever can see the summary can see what makes it up. */
export async function fetchResourceDayEntriesAction(
  dateStr: string,
  resourceId?: string | null
): Promise<{ entries: ResourceDayEntry[] } | { error: string }> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { error: "Invalid date." };
  }
  let parsedId: number | null = null;
  if (resourceId) {
    parsedId = Number(resourceId);
    if (!Number.isFinite(parsedId)) return { error: "Invalid resource." };
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    const entries = await fetchResourceDayEntries(admin, settings.credentials, settings.zoneUrl, parsedId, dateStr);
    return { entries };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load time entries." };
  }
}

const MAX_LOOKUP_DAYS = 365;

/** Flexible "last N days" lookup, by client or by resource — live from
 * Autotask, nothing stored. Days is clamped so an accidental huge number
 * doesn't turn into a very slow, very large Autotask pull. */
export async function fetchHoursByGroupAction(
  groupBy: "client" | "resource",
  days: number
): Promise<{ rows: HoursByGroupRow[] } | { error: string }> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }

  const clampedDays = Math.min(Math.max(Math.trunc(days) || 1, 1), MAX_LOOKUP_DAYS);

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    const rows = await fetchHoursByGroup(
      admin,
      settings.credentials,
      settings.zoneUrl,
      groupBy,
      clampedDays
    );
    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load hours." };
  }
}

/** The itemized list behind the summary numbers above — every individual
 * time entry logged on the last business day, live from Autotask, nothing
 * stored. "Yesterday" is the last business day, same definition as the
 * summary report (a Monday shows Friday's entries, not Sunday's). */
export async function fetchYesterdayTimeEntriesAction(): Promise<
  { entries: TimeEntryForAnalysis[] } | { error: string }
> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  const yesterdayStr = ymd(lastBusinessDayBefore(new Date()));

  try {
    const entries = await fetchTimeEntriesForAnalysis(
      admin,
      settings.credentials,
      settings.zoneUrl,
      yesterdayStr,
      yesterdayStr
    );
    return { entries };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load time entries." };
  }
}

/** Non-billable hours, grouped by client or resource, over the last N days
 * — same flexible shape as fetchHoursByGroupAction, restricted to entries
 * flagged isNonBillable in Autotask. */
export async function fetchNonBillableHoursByGroupAction(
  groupBy: "client" | "resource",
  days: number
): Promise<{ rows: HoursByGroupRow[] } | { error: string }> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }

  const clampedDays = Math.min(Math.max(Math.trunc(days) || 1, 1), MAX_LOOKUP_DAYS);

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    const rows = await fetchNonBillableHoursByGroup(
      admin,
      settings.credentials,
      settings.zoneUrl,
      groupBy,
      clampedDays
    );
    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load hours." };
  }
}

/** Prepaid/block hours remaining for every currently-active Contract Block
 * account-wide — purchased vs. used vs. remaining, sorted so clients
 * closest to running out surface first. */
export async function fetchContractBlockHoursAction(): Promise<
  { rows: ContractBlockHoursRow[] } | { error: string }
> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    const rows = await fetchContractBlockHours(admin, settings.credentials, settings.zoneUrl);
    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load contract block hours." };
  }
}

/** Same active-contract-block usage as fetchContractBlockHoursAction above,
 * scoped to one client and carrying every individual time entry under each
 * block — for a "how is this client's block actually being used" report,
 * not just the account-wide summary. */
export async function fetchContractUsageAction(
  clientId: string
): Promise<{ rows: ContractUsageRow[] } | { error: string }> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }
  if (!clientId) return { error: "Choose a client first." };

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  const { data: client } = await admin
    .from("clients")
    .select("autotask_company_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client?.autotask_company_id) {
    return { error: "This client isn't linked to an Autotask company yet." };
  }

  try {
    const rows = await fetchContractUsageForCompany(
      admin,
      settings.credentials,
      settings.zoneUrl,
      client.autotask_company_id
    );
    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load contract usage." };
  }
}

/** Emails the Contract Usage PDF straight to an address the caller types
 * in — not necessarily anyone already on file for this client — via the
 * shared mailbox, same send path as sales-request notifications and the
 * quarterly review send. Regenerated fresh from Autotask for the send
 * itself (not whatever the caller's browser last loaded), so what's
 * attached can't go stale between "Load report" and clicking Send. */
export async function sendContractUsageReportAction(
  clientId: string,
  email: string
): Promise<{ error: string | null }> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }
  const trimmedEmail = email.trim();
  if (!trimmedEmail) return { error: "Enter an email address to send to." };
  if (!clientId) return { error: "Choose a client first." };

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  const { data: client } = await admin
    .from("clients")
    .select("name, autotask_company_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client?.autotask_company_id) {
    return { error: "This client isn't linked to an Autotask company yet." };
  }

  const mailboxEmail = process.env.SHARED_MAILBOX_EMAIL;
  if (!mailboxEmail) return { error: "The shared mailbox isn't configured." };
  const mailboxSettings = await getSharedMailboxSettings(admin);
  if (!mailboxSettings) return { error: "The shared mailbox integration isn't set up yet." };

  try {
    const rows = await fetchContractUsageForCompany(
      admin,
      settings.credentials,
      settings.zoneUrl,
      client.autotask_company_id
    );
    const pdf = await buildContractUsagePdf(client.name, rows);
    const template = await getEmailTemplate(admin, "contract_usage_report");
    const templateVars = { client_name: client.name };
    const { html, text } = buildContractUsageClientEmail(
      client.name,
      rows,
      applyTemplateVars(template.intro, templateVars),
      applyTemplateVars(template.note, templateVars)
    );

    const ccEmail = await getBlockHoursReportCc(admin);
    const accessToken = await getValidSharedMailboxToken(admin, mailboxSettings);
    const attachments: SharedMailboxAttachment[] = [
      {
        filename: `${client.name} Block of Hours Usage Report.pdf`,
        contentBase64: pdf.toString("base64"),
        contentType: "application/pdf",
        isInline: false,
      },
    ];
    await sendMailAsSharedMailbox(accessToken, mailboxEmail, {
      to: trimmedEmail,
      cc: ccEmail,
      subject: applyTemplateVars(template.subject, templateVars),
      html,
      text,
      attachments,
    });
    await logBlockHoursReportSend(admin, {
      clientId,
      clientName: client.name,
      toEmail: trimmedEmail,
      ccEmail,
      error: null,
    });
    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send the report.";
    await logBlockHoursReportSend(admin, {
      clientId,
      clientName: client.name,
      toEmail: trimmedEmail,
      ccEmail: null,
      error: message,
    });
    return { error: message };
  }
}

/** Every open ticket account-wide, oldest/overdue first — for spotting
 * tickets that have sat too long or blown past their due date. */
export async function fetchAgingOpenTicketsAction(): Promise<
  { rows: AgingTicketRow[] } | { error: string }
> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    const rows = await fetchAgingOpenTickets(admin, settings.credentials, settings.zoneUrl);
    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load open tickets." };
  }
}

/** Live ticket search for one client, by subject text and open/completed
 * status — unlike Aging Tickets above (account-wide, open only, from
 * whatever's already synced), this looks up one client at a time and can
 * also find completed tickets, since that's not something the local
 * autotask_tickets cache ever holds. */
export async function searchAutotaskTicketsAction(
  clientId: string,
  subjectQuery: string,
  statusFilter: "open" | "completed"
): Promise<{ rows: AutotaskTicketSearchRow[] } | { error: string }> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }
  if (!clientId) return { error: "Choose a client first." };

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  const { data: client } = await admin
    .from("clients")
    .select("autotask_company_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client?.autotask_company_id) {
    return { error: "This client isn't linked to an Autotask company yet." };
  }

  try {
    const rows = await searchTicketsForCompany(
      settings.credentials,
      settings.zoneUrl,
      client.autotask_company_id,
      subjectQuery,
      statusFilter
    );
    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ticket search failed." };
  }
}
