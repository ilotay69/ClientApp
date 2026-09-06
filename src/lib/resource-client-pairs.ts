import {
  fetchTimeEntriesInRange,
  resolveTicketCompanyIds,
  resolveResourceNames,
  type AutotaskCredentials,
} from "@/lib/autotask";
import { ymd } from "@/lib/resource-hours";

export type ResourceClientPairRow = {
  resourceId: string;
  resourceName: string;
  clientId: string | null;
  clientName: string;
  hours: number;
  daysWorked: number;
};

/** Every (resource, client) pair with time logged in the last N days, with
 * both total hours and the count of distinct days worked on that client —
 * "40 hours over 3 long days" reads very differently from "40 hours spread
 * across 18 days", so both are shown rather than just the summed hours
 * the other lookups use. Sorted by hours descending — who's working the
 * most on which clients, at a glance. Live from Autotask, nothing
 * stored. */
export async function fetchResourceClientPairs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creds: AutotaskCredentials,
  zoneUrl: string,
  days: number
): Promise<ResourceClientPairRow[]> {
  const today = new Date();
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const entries = await fetchTimeEntriesInRange(creds, zoneUrl, ymd(since), ymd(today));

  const resourceNames = await resolveResourceNames(
    creds,
    zoneUrl,
    entries.map((e) => e.resourceID)
  );
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
      (c: { id: string; name: string; autotask_company_id: number }): [number, { id: string; name: string }] => [
        c.autotask_company_id,
        { id: c.id, name: c.name },
      ]
    )
  );

  const byPair = new Map<string, ResourceClientPairRow & { daySet: Set<string> }>();
  for (const e of entries) {
    const companyId = e.ticketID != null ? ticketCompanyIds.get(e.ticketID) : undefined;
    const client = companyId != null ? clientByCompanyId.get(companyId) : undefined;
    const key = `${e.resourceID}::${client?.id ?? "unattributed"}`;
    const row =
      byPair.get(key) ??
      ({
        resourceId: String(e.resourceID),
        resourceName: resourceNames.get(e.resourceID) ?? `Resource ${e.resourceID}`,
        clientId: client?.id ?? null,
        clientName: client?.name ?? "Unattributed",
        hours: 0,
        daysWorked: 0,
        daySet: new Set<string>(),
      } satisfies ResourceClientPairRow & { daySet: Set<string> });
    row.hours += e.hoursWorked;
    row.daySet.add(e.dateWorked.slice(0, 10));
    byPair.set(key, row);
  }

  return [...byPair.values()]
    .map((r) => ({
      resourceId: r.resourceId,
      resourceName: r.resourceName,
      clientId: r.clientId,
      clientName: r.clientName,
      hours: r.hours,
      daysWorked: r.daySet.size,
    }))
    .sort((a, b) => b.hours - a.hours);
}
