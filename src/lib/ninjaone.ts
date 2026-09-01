// Minimal NinjaOne (NinjaRMM) Public API 2.0 helpers. No SDK — plain fetch.
// Auth is OAuth2 client-credentials (unlike Autotask's static headers), so
// callers must cache/refresh the bearer token — see ninjaone-settings.ts.
//
// Some facts here are best-effort (NinjaOne's real API reference is a
// JS-rendered app that couldn't be fetched directly during research) —
// see the plan doc for exactly which. The device filter syntax and the
// /v2/devices endpoint ARE verified against NinjaOne's own published PDF.

export type NinjaOneCredentials = {
  region: string; // e.g. "app.ninjarmm.com", "eu.ninjarmm.com", "oc.ninjarmm.com"
  clientId: string;
  clientSecret: string;
};

function apiBase(region: string) {
  return `https://${region.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
}

export type NinjaOneToken = { token: string; expiresAt: string };

/** OAuth2 client-credentials token request. Scope is fixed to "monitoring"
 * (read-only) — this integration only ever reads device inventory. */
export async function fetchAccessToken(creds: NinjaOneCredentials): Promise<NinjaOneToken> {
  const res = await fetch(`${apiBase(creds.region)}/ws/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      scope: "monitoring",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NinjaOne token request failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error("NinjaOne token response did not include an access_token.");

  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
  return { token: json.access_token, expiresAt };
}

async function ninjaOneGet(region: string, token: string, path: string) {
  const res = await fetch(`${apiBase(region)}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NinjaOne request failed (${res.status}): ${text}`);
  }
  return res.json();
}

/** Confirms the credentials actually work (not just that a token was
 * issued) via one trivial authenticated call. */
export async function testNinjaOneConnection(
  creds: NinjaOneCredentials
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { token } = await fetchAccessToken(creds);
    await ninjaOneGet(creds.region, token, "/v2/organizations?pageSize=1");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export type NinjaOneOrganization = { id: number; name: string };

/** No confirmed name-search query param on this endpoint, so fetch a page
 * and filter client-side — same defensive approach used for Autotask
 * Companies when a param couldn't be confirmed either. */
export async function searchNinjaOneOrganizations(
  creds: NinjaOneCredentials,
  token: string,
  nameQuery: string
): Promise<NinjaOneOrganization[]> {
  const json = await ninjaOneGet(creds.region, token, "/v2/organizations?pageSize=200");
  const orgs = (json ?? []) as { id: number; name: string }[];
  const needle = nameQuery.toLowerCase();
  return orgs
    .filter((o) => o.name?.toLowerCase().includes(needle))
    .map((o) => ({ id: o.id, name: o.name }));
}

export type NinjaOneDeviceRow = {
  id: number;
  system_name: string;
  node_class: string | null;
  is_offline: boolean | null;
  last_contact: string | null;
  raw: unknown;
};

/** Devices for one organization, via the confirmed df=org=<id> filter
 * syntax. Only maps fields confirmed to exist (id, systemName, nodeClass,
 * offline, lastContact) — the full raw object is kept too so nothing is
 * lost if other fields (antivirus/patch status) turn out to be present
 * under different names once real data is seen. */
export async function fetchDevicesForOrganization(
  creds: NinjaOneCredentials,
  token: string,
  orgId: number
): Promise<NinjaOneDeviceRow[]> {
  const filter = encodeURIComponent(`org=${orgId}`);
  const json = await ninjaOneGet(creds.region, token, `/v2/devices?df=${filter}`);
  type RawDevice = {
    id: number;
    systemName?: string;
    nodeClass?: string;
    offline?: boolean;
    lastContact?: number;
  };
  const devices = (json ?? []) as RawDevice[];

  return devices.map((d) => ({
    id: d.id,
    system_name: d.systemName ?? `Device ${d.id}`,
    node_class: d.nodeClass ?? null,
    is_offline: d.offline ?? null,
    // lastContact appears to be an epoch (seconds) timestamp based on
    // secondary-source examples — stored as ISO, defensively guarding
    // against it being absent.
    last_contact: d.lastContact ? new Date(d.lastContact * 1000).toISOString() : null,
    raw: d,
  }));
}
