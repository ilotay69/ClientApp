import {
  fetchTimeEntriesInRange,
  resolveTicketCompanyIds,
  resolveResourceNames,
  type AutotaskCredentials,
} from "@/lib/autotask";

export type ClientHoursRow = {
  clientId: string | null;
  clientName: string;
  today: number;
  yesterday: number;
  thisWeek: number;
  thisMonth: number;
};

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "Yesterday" means the last business day, not the last calendar day — on
 * a Monday that's Friday, not Sunday, since nobody's logging time on a
 * weekend. Steps back one day at a time until it lands on a weekday. */
export function lastBusinessDayBefore(date: Date): Date {
  const d = new Date(date);
  do {
    d.setUTCDate(d.getUTCDate() - 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6); // Sun / Sat
  return d;
}

/** One Autotask call covering the whole range needed (the month, extended
 * back further if "yesterday" — the last business day — falls in the
 * previous month, e.g. checking this on the 1st or 2nd), then each entry
 * is bucketed into today/yesterday/this week/this month by comparing its
 * own date against these boundaries — cheaper than four separate range
 * queries. Boundaries are UTC calendar dates, same
 * "today = new Date().toISOString().slice(0,10)" convention already used
 * elsewhere in this app (e.g. task due-date defaults), not a new one.
 *
 * Grouped by client rather than resource — a time entry carries no
 * client/company reference of its own, so each one is attributed via its
 * ticket's companyID (resolved directly from Autotask, batched) mapped to
 * a client through this app's own clients.autotask_company_id. An entry
 * with no ticket or an unmapped company is grouped under "Unattributed"
 * rather than dropped. */
export async function fetchClientHoursSummary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<ClientHoursRow[]> {
  const now = new Date();
  const todayStr = ymd(now);

  const yesterdayStr = ymd(lastBusinessDayBefore(now));

  // Week starts Monday.
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
  const weekStartStr = ymd(weekStart);

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStartStr = ymd(monthStart);

  // Whichever is earlier — "yesterday" can fall in the previous month.
  const fetchSinceStr = yesterdayStr < monthStartStr ? yesterdayStr : monthStartStr;

  const entries = await fetchTimeEntriesInRange(creds, zoneUrl, fetchSinceStr, todayStr);

  const ticketCompanyIds = await resolveTicketCompanyIds(
    creds,
    zoneUrl,
    entries.map((e) => e.ticketID).filter((id): id is number => id != null)
  );
  const companyIds = [...new Set([...ticketCompanyIds.values()])];
  const { data: clients } = await admin
    .from("clients")
    .select("id, name, autotask_company_id")
    .in("autotask_company_id", companyIds.length > 0 ? companyIds : [-1]);
  const clientByCompanyId = new Map<number, { id: string; name: string }>(
    (clients ?? []).map(
      (c: {
        id: string;
        name: string;
        autotask_company_id: number;
      }): [number, { id: string; name: string }] => [c.autotask_company_id, { id: c.id, name: c.name }]
    )
  );

  const byClient = new Map<string, ClientHoursRow>();
  for (const e of entries) {
    const day = e.dateWorked.slice(0, 10);
    const companyId = e.ticketID != null ? ticketCompanyIds.get(e.ticketID) : undefined;
    const client = companyId != null ? clientByCompanyId.get(companyId) : undefined;
    const key = client?.id ?? "unattributed";
    const row = byClient.get(key) ?? {
      clientId: client?.id ?? null,
      clientName: client?.name ?? "Unattributed",
      today: 0,
      yesterday: 0,
      thisWeek: 0,
      thisMonth: 0,
    };
    // thisMonth is guarded explicitly now — the fetch range can start
    // earlier than the month (see fetchSinceStr above) when "yesterday"
    // falls in the previous month.
    if (day >= monthStartStr) row.thisMonth += e.hoursWorked;
    if (day >= weekStartStr) row.thisWeek += e.hoursWorked;
    if (day === todayStr) row.today += e.hoursWorked;
    if (day === yesterdayStr) row.yesterday += e.hoursWorked;
    byClient.set(key, row);
  }

  return [...byClient.values()].sort((a, b) => b.thisMonth - a.thisMonth);
}

export type HoursByGroupRow = { groupId: string | null; groupName: string; hours: number };

/** Flexible counterpart to fetchClientHoursSummary above — an arbitrary
 * "last N days" window instead of the fixed today/yesterday/week/month
 * buckets, grouped by either client or resource (technician) rather than
 * client only. Live from Autotask each time, nothing stored. */
export async function fetchHoursByGroup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creds: AutotaskCredentials,
  zoneUrl: string,
  groupBy: "client" | "resource",
  days: number
): Promise<HoursByGroupRow[]> {
  const today = new Date();
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const entries = await fetchTimeEntriesInRange(creds, zoneUrl, ymd(since), ymd(today));

  const byGroup = new Map<string, HoursByGroupRow>();

  if (groupBy === "resource") {
    const resourceNames = await resolveResourceNames(
      creds,
      zoneUrl,
      entries.map((e) => e.resourceID)
    );
    for (const e of entries) {
      const key = String(e.resourceID);
      const row = byGroup.get(key) ?? {
        groupId: key,
        groupName: resourceNames.get(e.resourceID) ?? `Resource ${e.resourceID}`,
        hours: 0,
      };
      row.hours += e.hoursWorked;
      byGroup.set(key, row);
    }
  } else {
    const ticketCompanyIds = await resolveTicketCompanyIds(
      creds,
      zoneUrl,
      entries.map((e) => e.ticketID).filter((id): id is number => id != null)
    );
    const companyIds = [...new Set([...ticketCompanyIds.values()])];
    const { data: clients } = await admin
      .from("clients")
      .select("id, name, autotask_company_id")
      .in("autotask_company_id", companyIds.length > 0 ? companyIds : [-1]);
    const clientByCompanyId = new Map<number, { id: string; name: string }>(
      (clients ?? []).map(
        (c: {
          id: string;
          name: string;
          autotask_company_id: number;
        }): [number, { id: string; name: string }] => [c.autotask_company_id, { id: c.id, name: c.name }]
      )
    );
    for (const e of entries) {
      const companyId = e.ticketID != null ? ticketCompanyIds.get(e.ticketID) : undefined;
      const client = companyId != null ? clientByCompanyId.get(companyId) : undefined;
      const key = client?.id ?? "unattributed";
      const row = byGroup.get(key) ?? {
        groupId: client?.id ?? null,
        groupName: client?.name ?? "Unattributed",
        hours: 0,
      };
      row.hours += e.hoursWorked;
      byGroup.set(key, row);
    }
  }

  return [...byGroup.values()].sort((a, b) => b.hours - a.hours);
}
