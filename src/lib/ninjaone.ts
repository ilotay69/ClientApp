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
  device_created_at: string | null;
  manufacturer_fulfillment_date: string | null;
  os_name: string | null;
  os_version: string | null;
  manufacturer: string | null;
  model: string | null;
  last_logged_on_user: string | null;
  cpu_model: string | null;
  ram_bytes: number | null;
  disk_total_bytes: number | null;
  disk_free_bytes: number | null;
  last_boot_at: string | null;
  detail: unknown;
  raw: unknown;
};

/** Confirmed (via a working third-party MCP server's actual source, not
 * docs) — NinjaOne's "queries" family are org-wide bulk attribute reports,
 * not per-device calls: /v2/queries/{report}?df=org=<id>. Each item is
 * expected to carry a deviceId to correlate back to a device, though the
 * exact field names on each report are unverified — this is best-effort,
 * checking a few plausible key names and falling back to null (never
 * throwing) so an unrecognized shape just means an empty field, not a
 * failed sync. */
async function fetchDeviceQuery(
  creds: NinjaOneCredentials,
  token: string,
  orgId: number,
  report: string
): Promise<Record<string, unknown>[]> {
  try {
    const filter = encodeURIComponent(`org=${orgId}`);
    const json = await ninjaOneGet(
      creds.region,
      token,
      `/v2/queries/${report}?df=${filter}&pageSize=1000`
    );
    const items = json?.results ?? json ?? [];
    return Array.isArray(items) ? items : [];
  } catch (err) {
    console.error(`NinjaOne ${report} query failed — omitting that detail`, err);
    return [];
  }
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function firstNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function deviceIdOf(row: Record<string, unknown>): number | null {
  const id = row.deviceId ?? row.device_id ?? row.id;
  return typeof id === "number" ? id : null;
}

/** Devices for one organization, via the confirmed df=org=<id> filter
 * syntax, enriched with OS/hardware/last-user info from the bulk "queries"
 * reports above — all org-wide calls, not one per device. Base device
 * fields (id, systemName, nodeClass, offline, lastContact, created) are
 * confirmed against NinjaOne's own public OpenAPI schema (and lastContact
 * additionally against this app's own live data); the enrichment fields
 * are best-effort and degrade to null rather than fail if the guessed key
 * names are off. */
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
    created?: number;
    references?: { warranty?: { manufacturerFulfillmentDate?: number } };
  };
  const devices = (json ?? []) as RawDevice[];

  const [computerSystems, operatingSystems, loggedOnUsers, processors, volumes, deviceHealth] =
    await Promise.all([
      fetchDeviceQuery(creds, token, orgId, "computer-systems"),
      fetchDeviceQuery(creds, token, orgId, "operating-systems"),
      fetchDeviceQuery(creds, token, orgId, "logged-on-users"),
      fetchDeviceQuery(creds, token, orgId, "processors"),
      fetchDeviceQuery(creds, token, orgId, "volumes"),
      fetchDeviceQuery(creds, token, orgId, "device-health"),
    ]);

  const computerSystemByDevice = new Map<number, Record<string, unknown>>();
  for (const row of computerSystems) {
    const id = deviceIdOf(row);
    if (id !== null) computerSystemByDevice.set(id, row);
  }
  const osByDevice = new Map<number, Record<string, unknown>>();
  for (const row of operatingSystems) {
    const id = deviceIdOf(row);
    if (id !== null) osByDevice.set(id, row);
  }
  const userByDevice = new Map<number, Record<string, unknown>>();
  for (const row of loggedOnUsers) {
    const id = deviceIdOf(row);
    if (id !== null) userByDevice.set(id, row);
  }
  // First processor row per device — enough for a model name, not summing
  // core counts across sockets.
  const processorByDevice = new Map<number, Record<string, unknown>>();
  for (const row of processors) {
    const id = deviceIdOf(row);
    if (id !== null && !processorByDevice.has(id)) processorByDevice.set(id, row);
  }
  // A device can have several volumes — sum capacity/free space across all
  // of them for one overall "disk usage" figure rather than picking one.
  const volumesByDevice = new Map<number, Record<string, unknown>[]>();
  for (const row of volumes) {
    const id = deviceIdOf(row);
    if (id === null) continue;
    const list = volumesByDevice.get(id) ?? [];
    list.push(row);
    volumesByDevice.set(id, list);
  }
  const healthByDevice = new Map<number, Record<string, unknown>>();
  for (const row of deviceHealth) {
    const id = deviceIdOf(row);
    if (id !== null) healthByDevice.set(id, row);
  }

  return devices.map((d) => {
    const cs = computerSystemByDevice.get(d.id) ?? {};
    const os = osByDevice.get(d.id) ?? {};
    const user = userByDevice.get(d.id) ?? {};
    const proc = processorByDevice.get(d.id) ?? {};
    const deviceVolumes = volumesByDevice.get(d.id) ?? [];
    const health = healthByDevice.get(d.id) ?? {};

    const diskTotals = deviceVolumes.reduce(
      (sum: { total: number; free: number; any: boolean }, v) => {
        const total = firstNumber(v, ["capacity", "size", "totalSize", "totalBytes"]);
        const free = firstNumber(v, ["freeSpace", "free", "freeBytes"]);
        return {
          total: total !== null ? sum.total + total : sum.total,
          free: free !== null ? sum.free + free : sum.free,
          any: sum.any || total !== null || free !== null,
        };
      },
      { total: 0, free: 0, any: false }
    );

    const lastBootEpoch = firstNumber(health, ["lastBootTime", "lastBoot", "bootTime"]);

    return {
      id: d.id,
      system_name: d.systemName ?? `Device ${d.id}`,
      node_class: d.nodeClass ?? null,
      is_offline: d.offline ?? null,
      // lastContact/created/manufacturerFulfillmentDate appear to be epoch
      // (seconds, with a fractional part) timestamps — confirmed against
      // NinjaOne's own OpenAPI schema (all "format: double") and this app's
      // own live data for lastContact. manufacturerFulfillmentDate is
      // NinjaOne's auto-detected (via the device's serial number, for
      // vendors it supports) hardware ship date — a real proxy for device
      // age, unlike "created" which is just when it was enrolled here. Not
      // every device has it (vendor not supported, or lookup never ran).
      last_contact: d.lastContact ? new Date(d.lastContact * 1000).toISOString() : null,
      device_created_at: d.created ? new Date(d.created * 1000).toISOString() : null,
      manufacturer_fulfillment_date: d.references?.warranty?.manufacturerFulfillmentDate
        ? new Date(d.references.warranty.manufacturerFulfillmentDate * 1000).toISOString()
        : null,
      os_name: firstString(os, ["name", "osName", "os", "releaseId", "caption"]),
      os_version: firstString(os, ["version", "osVersion", "buildNumber", "build"]),
      manufacturer: firstString(cs, ["manufacturer", "biosManufacturer", "systemManufacturer"]),
      model: firstString(cs, ["model", "systemModel"]),
      last_logged_on_user: firstString(user, ["username", "userName", "user", "lastLoggedOnUser"]),
      cpu_model: firstString(proc, ["name", "caption", "model"]),
      ram_bytes: firstNumber(cs, [
        "totalPhysicalMemory",
        "totalRam",
        "totalRAM",
        "memory",
        "physicalMemory",
      ]),
      disk_total_bytes: diskTotals.any ? diskTotals.total : null,
      disk_free_bytes: diskTotals.any ? diskTotals.free : null,
      last_boot_at: lastBootEpoch ? new Date(lastBootEpoch * 1000).toISOString() : null,
      detail: {
        computerSystem: cs,
        operatingSystem: os,
        loggedOnUser: user,
        processor: proc,
        volumes: deviceVolumes,
        health,
      },
      raw: d,
    };
  });
}
