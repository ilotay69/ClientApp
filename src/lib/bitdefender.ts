// Minimal Bitdefender GravityZone Cloud API client — no SDK, same
// plain-fetch style as autotask.ts/ninjaone.ts/huntress.ts. Verified
// against Bitdefender's own on-premise Control Center API PDF guide (the
// cloud reference site is JS-rendered and not directly fetchable, same
// limitation already hit with NinjaOne/Huntress — the PDF documents the
// identical JSON-RPC protocol/auth, just for a customer-hosted server
// instead of Bitdefender's cloud) plus web-search-confirmed cloud specifics:
// the API is JSON-RPC 2.0 over HTTPS POST (never GET — a non-POST request
// gets 405), authenticated via static HTTP Basic Auth where the API key is
// the username and the password is an empty string. Two fixed cloud
// hostnames depending on region: cloud.gravityzone.bitdefender.com
// (non-EU) or cloudgz.gravityzone.bitdefender.com (EU). Rate limit is 10
// requests/second per API key (429 + Retry-After if exceeded).
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
 * "companies", "network/computers") — every Bitdefender API call is a POST
 * with this envelope, never a GET with query params, unlike every other
 * integration in this app. */
async function gravityZoneCall<T>(
  creds: BitdefenderCredentials,
  service: string,
  method: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any> = {}
): Promise<T> {
  const region = creds.region.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const res = await fetch(`https://${region}/api/v1.0/jsonrpc/${service}`, {
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
