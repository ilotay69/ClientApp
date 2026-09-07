// Minimal Huntress REST API client — no SDK, same plain-fetch style as
// autotask.ts/ninjaone.ts/hudu.ts. Base URL https://api.huntress.io/v1,
// auth via HTTP Basic Auth (base64 of api_key:api_secret) — a static
// header on every request, no OAuth token to mint or cache. Pagination is
// an opaque page_token (not page numbers), nested under a `pagination`
// object in every response — confirmed by pulling the real OpenAPI spec
// the docs site itself loads (https://api.huntress.io/v1/swagger_doc.json,
// found via the network request the rendered docs page made — the docs
// UI itself is JS-rendered and not directly fetchable, but this is the
// same raw spec it renders from). Limit 1-500 per page, 60 requests/minute
// per account.
import { assertAsciiHeaderValue } from "@/lib/ascii-check";

export type HuntressCredentials = {
  apiKey: string;
  apiSecret: string;
};

type HuntressPagination = { next_page_token?: string | null };

function huntressHeaders(creds: HuntressCredentials): HeadersInit {
  assertAsciiHeaderValue(creds.apiKey, "Huntress API key");
  assertAsciiHeaderValue(creds.apiSecret, "Huntress API secret");
  const token = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

async function huntressGet(creds: HuntressCredentials, path: string) {
  const res = await fetch(`https://api.huntress.io/v1${path}`, { headers: huntressHeaders(creds) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Huntress API request failed (${res.status}): ${text}`);
  }
  return res.json();
}

const PAGE_SAFETY_CAP = 20;

/** Shared pagination loop — every Huntress list endpoint nests its next
 * page token under `pagination.next_page_token`, not top-level (a bug in
 * an earlier version of this file assumed top-level and silently only
 * ever returned page 1). */
async function huntressGetAllPages<T>(
  creds: HuntressCredentials,
  path: string,
  extraParams: Record<string, string>,
  itemsKey: string
): Promise<T[]> {
  const items: T[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < PAGE_SAFETY_CAP; page++) {
    const query = new URLSearchParams({ limit: "500", ...extraParams });
    if (pageToken) query.set("page_token", pageToken);
    const json: Record<string, unknown> & { pagination?: HuntressPagination } = await huntressGet(
      creds,
      `${path}?${query.toString()}`
    );
    const pageItems = (json[itemsKey] as T[] | undefined) ?? [];
    items.push(...pageItems);
    const nextToken = json.pagination?.next_page_token;
    if (!nextToken) break;
    pageToken = nextToken;
  }

  return items;
}

/** Confirms the credentials actually work via one cheap authenticated
 * call — /account is a singleton, not a list, so this doesn't depend on
 * the account actually having any organizations yet. */
export async function testHuntressConnection(
  creds: HuntressCredentials
): Promise<{ ok: boolean; error?: string }> {
  try {
    await huntressGet(creds, "/account");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export type HuntressOrganization = { id: number; name: string };

/** Every organization on this Huntress account — for a future per-client
 * mapping picker, the same role ninjaone_organization_id/
 * autotask_company_id play for their own integrations. */
export async function fetchHuntressOrganizations(creds: HuntressCredentials): Promise<HuntressOrganization[]> {
  type RawOrg = { id: number; name: string };
  const orgs = await huntressGetAllPages<RawOrg>(creds, "/organizations", {}, "organizations");
  return orgs.map((o) => ({ id: o.id, name: o.name }));
}

export type HuntressAgent = {
  id: number;
  organizationId: number;
  hostname: string;
  platform: string | null;
  os: string | null;
  version: string | null;
  edrVersion: string | null;
  lastCallbackAt: string | null;
  defenderStatus: string | null;
  defenderSubstatus: string | null;
  firewallStatus: string | null;
};

/** Every agent (protected endpoint) — account-wide by default, or scoped
 * to one organization via the confirmed `organization_id` filter param
 * (for a per-client lookup once a client is mapped to a Huntress
 * organization). Field names confirmed against Huntress's own OpenAPI
 * spec's Agent definition. The caller maps organizationId to a name via
 * fetchHuntressOrganizations. */
export async function fetchHuntressAgents(
  creds: HuntressCredentials,
  organizationId?: number
): Promise<HuntressAgent[]> {
  type RawAgent = {
    id: number;
    organization_id: number;
    hostname: string;
    platform?: string;
    os?: string;
    version?: string;
    edr_version?: string;
    last_callback_at?: string;
    defender_status?: string;
    defender_substatus?: string;
    firewall_status?: string;
  };
  const extraParams = organizationId != null ? { organization_id: String(organizationId) } : {};
  const agents = await huntressGetAllPages<RawAgent>(creds, "/agents", extraParams, "agents");
  return agents.map((a) => ({
    id: a.id,
    organizationId: a.organization_id,
    hostname: a.hostname,
    platform: a.platform ?? null,
    os: a.os ?? null,
    version: a.version ?? null,
    edrVersion: a.edr_version ?? null,
    lastCallbackAt: a.last_callback_at ?? null,
    defenderStatus: a.defender_status ?? null,
    defenderSubstatus: a.defender_substatus ?? null,
    firewallStatus: a.firewall_status ?? null,
  }));
}

export type HuntressIncidentReport = {
  id: number;
  organizationId: number;
  agentId: number | null;
  subject: string;
  severity: string | null;
  status: string;
  platform: string | null;
  sentAt: string | null;
  statusUpdatedAt: string | null;
};

/** Incident reports account-wide, filtered to one status value per call
 * (Huntress's `status` filter takes a single value, not a list) — field
 * names confirmed against Huntress's own OpenAPI spec's IncidentReport
 * definition. Confirmed status values: sent, closed, dismissed,
 * auto_remediating, deleting, partner_dismissed. */
export async function fetchHuntressIncidentReportsByStatus(
  creds: HuntressCredentials,
  status: string
): Promise<HuntressIncidentReport[]> {
  type RawIncident = {
    id: number;
    organization_id: number;
    agent_id?: number;
    subject: string;
    severity?: string;
    status: string;
    platform?: string;
    sent_at?: string;
    status_updated_at?: string;
  };
  const incidents = await huntressGetAllPages<RawIncident>(
    creds,
    "/incident_reports",
    { status },
    "incident_reports"
  );
  return incidents.map((i) => ({
    id: i.id,
    organizationId: i.organization_id,
    agentId: i.agent_id ?? null,
    subject: i.subject,
    severity: i.severity ?? null,
    status: i.status,
    platform: i.platform ?? null,
    sentAt: i.sent_at ?? null,
    statusUpdatedAt: i.status_updated_at ?? null,
  }));
}
