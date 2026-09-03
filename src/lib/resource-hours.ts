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

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** One Autotask call covering the whole month (the broadest bucket needed),
 * then each entry is bucketed into today/yesterday/this week/this month by
 * comparing its own date against these boundaries — cheaper than four
 * separate range queries. Boundaries are UTC calendar dates, same
 * "today = new Date().toISOString().slice(0,10)" convention already used
 * elsewhere in this app (e.g. task due-date defaults), not a new one. */
export async function fetchResourceHoursSummary(
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<ResourceHoursRow[]> {
  const now = new Date();
  const todayStr = ymd(now);

  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = ymd(yesterday);

  // Week starts Monday.
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
  const weekStartStr = ymd(weekStart);

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStartStr = ymd(monthStart);

  const entries = await fetchTimeEntriesInRange(creds, zoneUrl, monthStartStr, todayStr);

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
    row.thisMonth += e.hoursWorked;
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
