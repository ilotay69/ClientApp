// Minimal Bitdefender GravityZone Cloud API client — no SDK, same
// plain-fetch style as autotask.ts/ninjaone.ts/huntress.ts. Verified
// against Bitdefender's own live docs (fetched via the Browser tool, since
// the docs site is JS-rendered and not directly WebFetch-able): the API is
// JSON-RPC 2.0 over HTTPS POST (never GET — a non-POST request gets 405),
// authenticated via static HTTP Basic Auth where the API key is the
// username and the password is an empty string. Two fixed cloud hostnames
// depending on region: cloud.gravityzone.bitdefender.com (non-EU) or
// cloudgz.gravityzone.bitdefender.com (EU). Rate limit is 10 requests/second
// per API key (429 + Retry-After if exceeded). Most APIs are v1.0, but a
// few (e.g. getIncidentsList) only exist under v1.1/v1.2 — the version is
// part of the URL, not the request body.
import { assertAsciiHeaderValue } from "@/lib/ascii-check";

export type BitdefenderCredentials = {
  region: string; // e.g. "cloud.gravityzone.bitdefender.com" or "cloudgz.gravityzone.bitdefender.com"
  apiKey: string;
};

function bitdefenderHeaders(creds: BitdefenderCredentials): HeadersInit {
  assertAsciiHeaderValue(creds.apiKey, "Bitdefender API key");
  const token = Buffer.from(`${creds.apiKey}:`).toString("base64");
  return { Authorization: `Basic ${token}`, "Content-Type": "application/json" };
}

type JsonRpcError = { code: number; message: string; data?: { details?: string } };

/** One JSON-RPC 2.0 call against a given GravityZone service module (e.g.
 * "network", "network/computers", "incidents") — every Bitdefender API
 * call is a POST with this envelope, never a GET with query params,
 * unlike every other integration in this app. `version` defaults to
 * "v1.0" since that's what most modules use, but some methods (like
 * getIncidentsList) only exist under a later version. */
async function gravityZoneCall<T>(
  creds: BitdefenderCredentials,
  service: string,
  method: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any> = {},
  version: string = "v1.0"
): Promise<T> {
  const region = creds.region.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const res = await fetch(`https://${region}/api/${version}/jsonrpc/${service}`, {
    method: "POST",
    headers: bitdefenderHeaders(creds),
    body: JSON.stringify({ id: crypto.randomUUID(), jsonrpc: "2.0", method, params }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bitdefender GravityZone request failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { result?: T; error?: JsonRpcError };
  if (json.error) {
    throw new Error(`Bitdefender GravityZone error (${json.error.code}): ${json.error.data?.details ?? json.error.message}`);
  }
  return json.result as T;
}

const PAGE_SAFETY_CAP = 50;

/** Shared pagination loop for the page/perPage/pagesCount/items response
 * shape used by both getEndpointsList and getIncidentsList. */
async function gravityZonePaginate<T>(
  creds: BitdefenderCredentials,
  service: string,
  method: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baseParams: Record<string, any>,
  version: string = "v1.0"
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= PAGE_SAFETY_CAP; page++) {
    const result = await gravityZoneCall<{ items?: T[]; pagesCount?: number }>(
      creds,
      service,
      method,
      { ...baseParams, page, perPage: 100 },
      version
    );
    items.push(...(result.items ?? []));
    if (!result.pagesCount || page >= result.pagesCount) break;
  }
  return items;
}

/** Confirms the credentials actually work via one cheap authenticated
 * call. getCompaniesList lives under the Network API module (confirmed
 * against Bitdefender's own live docs — its breadcrumb is Public API >
 * Network, not Companies, despite the method name), and is a
 * Partners-product-only method (per Bitdefender's own docs, it returns
 * empty on a Cloud Solutions-tier account rather than erroring) — since
 * this integration is set up as one shared partner-level key, that's the
 * right tier to expect, and this also happens to double as the first real
 * proof the "list every client company" call works, not just that a
 * request went through. */
export async function testBitdefenderConnection(
  creds: BitdefenderCredentials
): Promise<{ ok: boolean; error?: string }> {
  try {
    await gravityZoneCall(creds, "network", "getCompaniesList");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export type BitdefenderCompany = { id: string; name: string };

/** Every company visible to this partner API key — confirmed via
 * Bitdefender's own docs to return a flat array (result: [{id, name}]),
 * not the page/perPage/pagesCount wrapper most other GravityZone list
 * methods use. For a future per-client mapping picker, the same role
 * ninjaone_organization_id/autotask_company_id play for their own
 * integrations. */
export async function fetchGravityZoneCompanies(creds: BitdefenderCredentials): Promise<BitdefenderCompany[]> {
  const result = await gravityZoneCall<BitdefenderCompany[]>(creds, "network", "getCompaniesList");
  return result ?? [];
}

export type BitdefenderEndpoint = {
  id: string;
  name: string;
  operatingSystemVersion: string | null;
  ip: string | null;
  productOutdated: boolean | null;
  lastScanDate: string | null;
};

/** Every endpoint under one company — bulk + paginated (unlike
 * getManagedEndpointDetails, which takes one endpointId per call — an N+1
 * risk this app avoids the same way it avoids per-agent Huntress detail
 * calls). The on-premises Control Center docs describe a "computers" vs
 * "virtualmachines" service suffix for this method (network/computers),
 * but that split is on-premises-only — the cloud Partners API's own
 * Network category page lists a single flat URL
 * (CONTROL_CENTER_APIs_ACCESS_URL/v1.0/jsonrpc/network, no suffix) for
 * every Network method including this one; the suffixed form 404s against
 * the cloud gateway (confirmed against a real request). Bulk listing
 * doesn't carry malware/signature status — those fields only exist on the
 * single-endpoint detail call — but productOutdated (agent needs an
 * update) and the last successful scan date are both available in bulk
 * and are the useful "needs attention" signals at this scale. */
export async function fetchGravityZoneEndpoints(
  creds: BitdefenderCredentials,
  companyId: string
): Promise<BitdefenderEndpoint[]> {
  type RawEndpoint = {
    id: string;
    name: string;
    operatingSystemVersion?: string;
    ip?: string;
    productOutdated?: boolean;
    lastSuccessfulScan?: { date?: string };
  };
  const items = await gravityZonePaginate<RawEndpoint>(creds, "network", "getEndpointsList", {
    parentId: companyId,
    isManaged: true,
    filters: { depth: { allItemsRecursively: true } },
    options: { returnProductOutdated: true },
  });
  return items.map((e) => ({
    id: e.id,
    name: e.name,
    operatingSystemVersion: e.operatingSystemVersion ?? null,
    ip: e.ip ?? null,
    productOutdated: e.productOutdated ?? null,
    lastScanDate: e.lastSuccessfulScan?.date ?? null,
  }));
}

export type BitdefenderIncident = {
  incidentId: string;
  incidentNumber: number;
  companyId: string;
  companyName: string;
  status: string;
  priority: string;
  severityScore: number;
  detectionName: string | null;
  computerName: string | null;
  created: string;
  lastUpdated: string;
  incidentLink: string | null;
};

/** Endpoint + Organization (EDR/XDR) incidents across every company
 * visible to this key, in one call — confirmed via GravityZone's own docs
 * that each item already carries its own company {id, name}, unlike
 * endpoints/companies which need looping per company. Only exists under
 * v1.2 (confirmed — v1.0/v1.1 don't have this method). Requires a license
 * with incident access; a company without EDR/XDR just contributes no
 * rows, not an error. */
export async function fetchGravityZoneIncidents(
  creds: BitdefenderCredentials,
  statuses: string[] = ["open", "in_progress"]
): Promise<BitdefenderIncident[]> {
  type RawIncident = {
    incidentId: string;
    incidentNumber: number;
    company: { id: string; name: string };
    status: string;
    priority: string;
    severityScore: number;
    created: string;
    lastUpdated: string;
    incidentLink?: string;
    details?: { detectionName?: string; computerName?: string };
  };
  const items = await gravityZonePaginate<RawIncident>(
    creds,
    "incidents",
    "getIncidentsList",
    { filters: { status: statuses } },
    "v1.2"
  );
  return items.map((i) => ({
    incidentId: i.incidentId,
    incidentNumber: i.incidentNumber,
    companyId: i.company.id,
    companyName: i.company.name,
    status: i.status,
    priority: i.priority,
    severityScore: i.severityScore,
    detectionName: i.details?.detectionName ?? null,
    computerName: i.details?.computerName ?? null,
    created: i.created,
    lastUpdated: i.lastUpdated,
    incidentLink: i.incidentLink ?? null,
  }));
}
