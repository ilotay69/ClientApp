import {
  fetchTimeEntriesInRange,
  resolveResourceNames,
  type AutotaskCredentials,
} from "@/lib/autotask";

export type ResourceHoursRow = {
  resourceId: number;
  resourceName: string;
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
 * elsewhere in this app (e.g. task due-date defaults), not a new one. */
export async function fetchResourceHoursSummary(
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<ResourceHoursRow[]> {
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

  const byResource = new Map<number, ResourceHoursRow>();
  for (const e of entries) {
    const day = e.dateWorked.slice(0, 10);
    const row = byResource.get(e.resourceID) ?? {
      resourceId: e.resourceID,
      resourceName: "",
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
    byResource.set(e.resourceID, row);
  }

  const names = await resolveResourceNames(creds, zoneUrl, [...byResource.keys()]);
  for (const row of byResource.values()) {
    row.resourceName = names.get(row.resourceId) ?? `Resource ${row.resourceId}`;
  }

  return [...byResource.values()].sort((a, b) => b.thisMonth - a.thisMonth);
}
