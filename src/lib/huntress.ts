// Minimal Huntress REST API client — no SDK, same plain-fetch style as
// autotask.ts/ninjaone.ts/hudu.ts. Confirmed against Huntress's own support
// docs and a community MCP server's README (Huntress's own API reference at
// api.huntress.io/docs is a JS-rendered app that couldn't be fetched
// directly, same limitation already documented for NinjaOne): base URL
// https://api.huntress.io/v1, auth via HTTP Basic Auth (base64 of
// api_key:api_secret) — a static header on every request, unlike
// Autotask/NinjaOne/M365 there's no OAuth token to mint or cache.
// Pagination is an opaque page_token (not page numbers), limit 1-500 per
// page, and Huntress enforces 60 requests/minute per account.
import { assertAsciiHeaderValue } from "@/lib/ascii-check";

export type HuntressCredentials = {
  apiKey: string;
  apiSecret: string;
};

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

const PAGE_SAFETY_CAP = 20;

/** Every organization on this Huntress account, paginated via the opaque
 * page_token Huntress uses instead of page numbers — for a future
 * per-client mapping picker, the same role ninjaone_organization_id/
 * autotask_company_id play for their own integrations. */
export async function fetchHuntressOrganizations(creds: HuntressCredentials): Promise<HuntressOrganization[]> {
  type RawOrg = { id: number; name: string };
  const orgs: HuntressOrganization[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < PAGE_SAFETY_CAP; page++) {
    const query = new URLSearchParams({ limit: "500" });
    if (pageToken) query.set("page_token", pageToken);
    const json: { organizations?: RawOrg[]; next_page_token?: string | null } = await huntressGet(
      creds,
      `/organizations?${query.toString()}`
    );
    for (const o of json.organizations ?? []) {
      orgs.push({ id: o.id, name: o.name });
    }
    if (!json.next_page_token) break;
    pageToken = json.next_page_token;
  }

  return orgs;
}
