import { fetchTimeEntriesInRange, type AutotaskCredentials } from "@/lib/autotask";
import { lastNWeeklyBuckets, sumIntoBuckets } from "@/lib/trend-buckets";
import type { WeeklyPoint } from "@/lib/client-hours-trend";

/** Weekly hours trend for one resource (technician) over the last N weeks
 * — simpler than the client version, since a time entry's resourceID
 * needs no company/client resolution. Live from Autotask, nothing
 * stored. */
export async function fetchResourceHoursTrend(
  creds: AutotaskCredentials,
  zoneUrl: string,
  resourceId: number,
  weeks: number
): Promise<WeeklyPoint[]> {
  const buckets = lastNWeeklyBuckets(new Date(), weeks);
  if (buckets.length === 0) return [];

  const entries = await fetchTimeEntriesInRange(creds, zoneUrl, buckets[0].start, buckets[buckets.length - 1].end);
  const relevant = entries.filter((e) => e.resourceID === resourceId);

  const values = sumIntoBuckets(
    buckets,
    relevant,
    (e) => e.dateWorked,
    (e) => e.hoursWorked
  );

  return buckets.map((b, i) => ({ label: b.label, value: values[i] }));
}
