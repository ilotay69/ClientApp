// Minimal NordLayer MSP API client — no SDK, same plain-fetch style as
// autotask.ts/ninjaone.ts/huntress.ts/bitdefender.ts/wizer.ts. Verified
// against NordLayer's own official "NordLayer MSP API Documentation" PDF
// (linked from help.nordlayer.com's API key management article) — a
// complete, current spec with exact request/response shapes, the most
// solidly confirmed integration in this app so far. REST/JSON over HTTPS,
// base URL https://partner-api.nordlayer.com/msp/v1, auth via a static
// "Authorization: ApiKey <key>" header (the docs' preferred header; an
// "x-api-key: <key>" alternative also exists but isn't used here) — no
// OAuth token to mint or cache.
import { assertAsciiHeaderValue } from "@/lib/ascii-check";

export type NordLayerCredentials = {
  apiKey: string;
};

const BASE_URL = "https://partner-api.nordlayer.com/msp/v1";

function nordLayerHeaders(creds: NordLayerCredentials): HeadersInit {
  assertAsciiHeaderValue(creds.apiKey, "NordLayer API key");
  return { Authorization: `ApiKey ${creds.apiKey}` };
}

async function nordLayerGet(creds: NordLayerCredentials, path: string) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: nordLayerHeaders(creds) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NordLayer API request failed (${res.status}): ${text}`);
  }
  return res.json();
}

/** Confirms the credentials actually work via one cheap authenticated
 * call — a 1-item organizations page, which also doubles as the first
 * real proof the "list every client organization" call works. */
export async function testNordLayerConnection(
  creds: NordLayerCredentials
): Promise<{ ok: boolean; error?: string }> {
  try {
    await nordLayerGet(creds, "/organizations?limit=1&offset=0");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export type NordLayerOrganization = {
  identifier: string;
  title: string;
  planIdentifier: string | null;
};

const PAGE_LIMIT = 200;
const PAGE_SAFETY_CAP = 20;

/** Every organization under this MSP partner account — confirmed against
 * NordLayer's own docs: GET /organizations returns a plain array (not a
 * page/items wrapper), limit/offset pagination up to 200 per page. For a
 * future per-client mapping picker, the same role ninjaone_organization_id/
 * autotask_company_id/BitdefenderCompany/WizerCustomer play for their own
 * integrations. */
export async function fetchNordLayerOrganizations(
  creds: NordLayerCredentials
): Promise<NordLayerOrganization[]> {
  type RawOrg = { identifier: string; title: string; plan_identifier?: string };
  const orgs: NordLayerOrganization[] = [];

  for (let page = 0; page < PAGE_SAFETY_CAP; page++) {
    const offset = page * PAGE_LIMIT;
    const items = (await nordLayerGet(creds, `/organizations?limit=${PAGE_LIMIT}&offset=${offset}`)) as RawOrg[];
    for (const o of items) {
      orgs.push({ identifier: o.identifier, title: o.title, planIdentifier: o.plan_identifier ?? null });
    }
    if (items.length < PAGE_LIMIT) break;
  }

  return orgs;
}
