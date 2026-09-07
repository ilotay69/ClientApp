import {
  fetchGravityZoneCompanies,
  fetchGravityZoneEndpoints,
  fetchGravityZoneIncidents,
  type BitdefenderCredentials,
} from "@/lib/bitdefender";

export type BitdefenderEndpointRow = {
  endpointId: string;
  endpointName: string;
  companyName: string;
  os: string | null;
  ip: string | null;
  productOutdated: boolean;
  lastScanDate: string | null;
};

/** Every endpoint across every company visible to this partner key —
 * getEndpointsList is scoped to one company per call, so this loops every
 * company from getCompaniesList first, the same per-organization batching
 * pattern already used for Huntress agents and NinjaOne devices. Sequential,
 * not parallel, out of respect for the confirmed 10 requests/second rate
 * limit — a real cap other integrations in this app don't have to worry
 * about (Huntress/NinjaOne have generous per-minute limits instead). */
export async function fetchGravityZoneEndpointInventory(
  creds: BitdefenderCredentials
): Promise<BitdefenderEndpointRow[]> {
  const companies = await fetchGravityZoneCompanies(creds);
  const rows: BitdefenderEndpointRow[] = [];

  for (const company of companies) {
    const endpoints = await fetchGravityZoneEndpoints(creds, company.id);
    for (const e of endpoints) {
      rows.push({
        endpointId: e.id,
        endpointName: e.name,
        companyName: company.name,
        os: e.operatingSystemVersion,
        ip: e.ip,
        productOutdated: e.productOutdated ?? false,
        lastScanDate: e.lastScanDate,
      });
    }
  }

  return rows.sort(
    (a, b) => a.companyName.localeCompare(b.companyName) || a.endpointName.localeCompare(b.endpointName)
  );
}

export type BitdefenderOpenIncidentRow = {
  incidentId: string;
  incidentNumber: number;
  companyName: string;
  detectionName: string | null;
  computerName: string | null;
  status: string;
  priority: string;
  severityScore: number;
  created: string;
  incidentLink: string | null;
};

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };

/** Every EDR/XDR incident account-wide that's still open or actively being
 * investigated — status `false_positive`/`closed`/`closed_mdr_reviewed`
 * are resolved states, so they're excluded rather than treated as "open",
 * matching the same convention as Huntress's open-incidents lookup.
 * Sorted highest priority first, then highest severity score. */
export async function fetchGravityZoneOpenIncidents(
  creds: BitdefenderCredentials
): Promise<BitdefenderOpenIncidentRow[]> {
  const incidents = await fetchGravityZoneIncidents(creds, ["open", "in_progress"]);

  return incidents
    .map((i) => ({
      incidentId: i.incidentId,
      incidentNumber: i.incidentNumber,
      companyName: i.companyName,
      detectionName: i.detectionName,
      computerName: i.computerName,
      status: i.status,
      priority: i.priority,
      severityScore: i.severityScore,
      created: i.created,
      incidentLink: i.incidentLink,
    }))
    .sort(
      (a, b) =>
        (PRIORITY_RANK[a.priority] ?? 5) - (PRIORITY_RANK[b.priority] ?? 5) || b.severityScore - a.severityScore
    );
}
