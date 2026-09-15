"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import {
  fetchResourceHoursSummary,
  fetchHoursByGroup,
  fetchNonBillableHoursByGroup,
  lastBusinessDayBefore,
  ymd,
  type ResourceHoursRow,
  type HoursByGroupRow,
} from "@/lib/resource-hours";
import { fetchTimeEntriesForAnalysis, type TimeEntryForAnalysis } from "@/lib/time-entry-insights";
import { fetchContractBlockHours, type ContractBlockHoursRow } from "@/lib/contract-hours";
import { fetchAgingOpenTickets, type AgingTicketRow } from "@/lib/ticket-aging";
import { searchTicketsForCompany, type AutotaskTicketSearchRow } from "@/lib/autotask";

/** Live from Autotask, on demand — not synced/stored anywhere, since "hours
 * worked today" is only ever meaningful as of right now, not as a cached
 * value that goes stale the moment someone logs more time. */
export async function fetchResourceHoursAction(): Promise<
  { rows: ResourceHoursRow[] } | { error: string }
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
    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load hours." };
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
