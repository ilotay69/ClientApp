import { fetchTicketsCreatedForCompany, type AutotaskCredentials } from "@/lib/autotask";
import { lastNWeeklyBuckets, sumIntoBuckets } from "@/lib/trend-buckets";
import type { WeeklyPoint } from "@/lib/client-hours-trend";

/** Weekly count of tickets opened for one client over the last N weeks —
 * every ticket regardless of current status, so a since-closed ticket
 * still counts in the week it was created. A rising trend on an
 * otherwise-stable client is often the first sign of an unstable
 * environment. Live from Autotask, nothing stored. */
export async function fetchTicketVolumeTrend(
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

  const tickets = await fetchTicketsCreatedForCompany(
    creds,
    zoneUrl,
    client.autotask_company_id,
    buckets[0].start,
    buckets[buckets.length - 1].end
  );

  const values = sumIntoBuckets(
    buckets,
    tickets,
    (t) => t.createDate,
    () => 1
  );

  return buckets.map((b, i) => ({ label: b.label, value: values[i] }));
}
