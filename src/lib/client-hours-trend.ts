import { fetchTimeEntriesInRange, resolveTicketCompanyIds, type AutotaskCredentials } from "@/lib/autotask";
import { lastNWeeklyBuckets, sumIntoBuckets } from "@/lib/trend-buckets";

export type WeeklyPoint = { label: string; value: number };

/** Weekly hours trend for one client over the last N weeks — same
 * ticket -> company -> client attribution as fetchClientHoursSummary, just
 * bucketed by week and scoped to one client instead of summed/grouped
 * across all of them. Live from Autotask, nothing stored. */
export async function fetchClientHoursTrend(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creds: AutotaskCredentials,
  zoneUrl: string,
  clientId: string,
  weeks: number
): Promise<WeeklyPoint[]> {
  const { data: client } = await admin
    .from("clients")
    .select("autotask_company_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client?.autotask_company_id) return [];

  const buckets = lastNWeeklyBuckets(new Date(), weeks);
  if (buckets.length === 0) return [];

  const entries = await fetchTimeEntriesInRange(creds, zoneUrl, buckets[0].start, buckets[buckets.length - 1].end);

  const ticketCompanyIds = await resolveTicketCompanyIds(
    creds,
    zoneUrl,
    entries.map((e) => e.ticketID).filter((id): id is number => id != null)
  );

  const relevant = entries.filter(
    (e) => e.ticketID != null && ticketCompanyIds.get(e.ticketID) === client.autotask_company_id
  );

  const values = sumIntoBuckets(
    buckets,
    relevant,
    (e) => e.dateWorked,
    (e) => e.hoursWorked
  );

  return buckets.map((b, i) => ({ label: b.label, value: values[i] }));
}
