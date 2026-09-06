import {
  fetchAntivirusStatusForOrganization,
  fetchPendingOsPatchesForOrganization,
  type NinjaOneCredentials,
} from "@/lib/ninjaone";

type ClientOrg = { id: string; name: string; ninjaone_organization_id: number };

async function fetchMappedClients(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
): Promise<ClientOrg[]> {
  const { data } = await admin
    .from("clients")
    .select("id, name, ninjaone_organization_id")
    .not("ninjaone_organization_id", "is", null);
  return (data ?? []) as ClientOrg[];
}

async function fetchDeviceNames(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  deviceIds: number[]
): Promise<Map<number, string>> {
  if (deviceIds.length === 0) return new Map();
  const { data } = await admin.from("ninjaone_devices").select("id, system_name").in("id", deviceIds);
  return new Map(((data ?? []) as { id: number; system_name: string }[]).map((d) => [d.id, d.system_name]));
}

export type AntivirusAlertRow = {
  deviceId: number;
  deviceName: string;
  clientId: string;
  clientName: string;
  productName: string | null;
  productState: string;
  definitionStatus: string | null;
};

/** Every device account-wide whose antivirus isn't actively protecting it —
 * productState anything other than "on" (off, expired, snoozed, or
 * unknown). Live from NinjaOne per organization, not stored — one call per
 * client with a mapped NinjaOne org, same per-org looping the sync job
 * already does. */
export async function fetchAntivirusAlertsAccountWide(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creds: NinjaOneCredentials,
  token: string
): Promise<AntivirusAlertRow[]> {
  const clients = await fetchMappedClients(admin);

  const perClient = await Promise.all(
    clients.map(async (client) => {
      try {
        const rows = await fetchAntivirusStatusForOrganization(creds, token, client.ninjaone_organization_id);
        return rows.map((r) => ({ ...r, client }));
      } catch (err) {
        console.error(`NinjaOne antivirus-status failed for org ${client.ninjaone_organization_id}`, err);
        return [];
      }
    })
  );

  const flagged = perClient.flat().filter((r) => r.productState !== "on");
  const deviceNames = await fetchDeviceNames(
    admin,
    flagged.map((r) => r.deviceId)
  );

  return flagged.map((r) => ({
    deviceId: r.deviceId,
    deviceName: deviceNames.get(r.deviceId) ?? `Device ${r.deviceId}`,
    clientId: r.client.id,
    clientName: r.client.name,
    productName: r.productName,
    productState: r.productState ?? "unknown",
    definitionStatus: r.definitionStatus,
  }));
}

export type MissingPatchRow = {
  deviceId: number;
  deviceName: string;
  clientId: string;
  clientName: string;
  patchName: string | null;
  kbNumber: string | null;
  severity: string | null;
  status: string | null;
};

/** Every pending/failed/rejected OS patch account-wide — live from
 * NinjaOne per organization, not stored. Every row returned by the
 * underlying report is already "not installed" (see
 * fetchPendingOsPatchesForOrganization), so nothing further to filter. */
export async function fetchMissingPatchesAccountWide(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creds: NinjaOneCredentials,
  token: string
): Promise<MissingPatchRow[]> {
  const clients = await fetchMappedClients(admin);

  const perClient = await Promise.all(
    clients.map(async (client) => {
      try {
        const rows = await fetchPendingOsPatchesForOrganization(creds, token, client.ninjaone_organization_id);
        return rows.map((r) => ({ ...r, client }));
      } catch (err) {
        console.error(`NinjaOne os-patches failed for org ${client.ninjaone_organization_id}`, err);
        return [];
      }
    })
  );

  const patches = perClient.flat();
  const deviceNames = await fetchDeviceNames(
    admin,
    patches.map((r) => r.deviceId)
  );

  return patches
    .map((r) => ({
      deviceId: r.deviceId,
      deviceName: deviceNames.get(r.deviceId) ?? `Device ${r.deviceId}`,
      clientId: r.client.id,
      clientName: r.client.name,
      patchName: r.name,
      kbNumber: r.kbNumber,
      severity: r.severity,
      status: r.status,
    }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.deviceName.localeCompare(b.deviceName));
}
