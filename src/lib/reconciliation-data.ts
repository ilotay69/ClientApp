import { createAdminClient } from "@/lib/supabase/server";
import { friendlyM365SkuName } from "@/lib/m365-sku-names";
import { DEVICE_CLASS_LABELS, type DeviceClass } from "@/lib/device-classes";

export { DEVICE_CLASS_LABELS, type DeviceClass };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

export type ServiceLicenseMapping = {
  id: string;
  serviceName: string;
  skuPartNumber: string;
};

export type ServiceDeviceMapping = {
  id: string;
  serviceName: string;
  deviceClass: DeviceClass;
};

/** Case/whitespace-insensitive key for matching a contracted service name
 * against a stored mapping — the mapping itself is still stored/displayed
 * with whatever exact casing staff typed, this is only used for lookups. */
function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/** NinjaOne's own node_class strings (e.g. "WINDOWS_WORKSTATION",
 * "WINDOWS_SERVER", "MAC") collapsed into the 3 fixed buckets billing
 * actually cares about — a rough-but-reliable substring match rather than
 * an exhaustive enum, since NinjaOne's own class list is longer than what
 * any MSP contract typically bills by unit. */
function bucketNodeClass(nodeClass: string | null): DeviceClass {
  const nc = (nodeClass ?? "").toUpperCase();
  if (nc.includes("MAC")) return "mac";
  if (nc.includes("SERVER")) return "server";
  return "workstation";
}

export async function fetchServiceLicenseMappings(
  admin: AdminClient = createAdminClient()
): Promise<ServiceLicenseMapping[]> {
  const { data, error } = await admin
    .from("service_license_mappings")
    .select("id, service_name, sku_part_number")
    .order("service_name");
  if (error) {
    console.error("fetchServiceLicenseMappings failed", error);
    return [];
  }
  return (data ?? []).map(
    (m: { id: string; service_name: string; sku_part_number: string }) => ({
      id: m.id,
      serviceName: m.service_name,
      skuPartNumber: m.sku_part_number,
    })
  );
}

export async function fetchServiceDeviceMappings(
  admin: AdminClient = createAdminClient()
): Promise<ServiceDeviceMapping[]> {
  const { data, error } = await admin
    .from("service_device_mappings")
    .select("id, service_name, device_class")
    .order("service_name");
  if (error) {
    console.error("fetchServiceDeviceMappings failed", error);
    return [];
  }
  return (data ?? []).map((m: { id: string; service_name: string; device_class: DeviceClass }) => ({
    id: m.id,
    serviceName: m.service_name,
    deviceClass: m.device_class,
  }));
}

export type ReconciliationWaiver = { note: string; waivedAt: string; waivedByName: string | null };

/** All current waivers, keyed by `${clientId}:${source}:${normalizedServiceName}` —
 * loaded once and sliced per client rather than queried per client, same
 * bulk-then-group approach as fetchReconciliationSummaryForAllClients. */
async function fetchWaiverMap(
  admin: AdminClient
): Promise<Map<string, ReconciliationWaiver>> {
  const { data, error } = await admin
    .from("reconciliation_waivers")
    .select("client_id, source, service_name, note, waived_at, profiles(full_name)");
  if (error) {
    console.error("fetchWaiverMap failed", error);
    return new Map();
  }
  const map = new Map<string, ReconciliationWaiver>();
  for (const w of data ?? []) {
    const profile = Array.isArray(w.profiles) ? w.profiles[0] : w.profiles;
    map.set(`${w.client_id}:${w.source}:${normalize(w.service_name)}`, {
      note: w.note,
      waivedAt: w.waived_at,
      waivedByName: profile?.full_name ?? null,
    });
  }
  return map;
}

export type ReconciliationRow = {
  /** null only for "unmapped" — there's nothing to waive or fix source-side
   * until staff say which system this service should be checked against. */
  source: "m365" | "ninjaone" | null;
  serviceName: string;
  contractedQuantity: number;
  /** Friendly licence name, or a device-class label ("Workstations") —
   * whichever this row's source actually is. */
  mappedLabel: string | null;
  /** Null only when mapped but the source system shows zero/no matching
   * units at all (distinct from a genuine 0-unit mismatch). */
  actualUnits: number | null;
  status: "matched" | "mismatch" | "unmapped" | "license_missing";
  waiver: ReconciliationWaiver | null;
};

export type UnmatchedLicenseRow = {
  skuPartNumber: string;
  friendlyName: string;
  enabledUnits: number;
};

export type UnmatchedDeviceRow = {
  deviceClass: DeviceClass;
  label: string;
  count: number;
};

export type ReconciliationResult = {
  rows: ReconciliationRow[];
  unmatchedLicenses: UnmatchedLicenseRow[];
  unmatchedDevices: UnmatchedDeviceRow[];
};

type RawService = { service_name: string; contract_status: string | null; quantity: number | null };
type RawLicense = { sku_part_number: string; enabled_units: number };
type RawDevice = { node_class: string | null };

/**
 * Pure per-client comparison — shared by fetchReconciliationForClient (one
 * client, its own queries) and fetchReconciliationSummaryForAllClients
 * (every client, one set of bulk queries grouped in memory) so the two
 * paths can never drift out of sync with each other.
 *
 * A contracted service maps to AT MOST one source (a licence SKU or a
 * device class) — checked in that order, licence mapping wins if somehow
 * both existed for the same service name, which the mapping UIs don't
 * allow to happen in practice.
 */
function computeClientReconciliation(
  services: RawService[],
  licenses: RawLicense[],
  devices: RawDevice[],
  licenseMappingBySameKey: Map<string, string>,
  deviceMappingBySameKey: Map<string, DeviceClass>,
  waiverMap: Map<string, ReconciliationWaiver>,
  clientId: string
): ReconciliationResult {
  // Active only — same exact-match rule the portal's own contracted-services
  // card uses ("Inactive" contains the substring "active" too).
  const activeServices = services.filter((s) => (s.contract_status ?? "").toLowerCase() === "active");

  // A client can have the same-named service across more than one active
  // contract — sum them rather than showing duplicate rows.
  const quantityByKey = new Map<string, number>();
  const displayNameByKey = new Map<string, string>();
  for (const s of activeServices) {
    const key = normalize(s.service_name);
    quantityByKey.set(key, (quantityByKey.get(key) ?? 0) + (s.quantity ?? 0));
    if (!displayNameByKey.has(key)) displayNameByKey.set(key, s.service_name);
  }

  const licenseBySku = new Map(licenses.map((l) => [l.sku_part_number, l]));
  const deviceCountByBucket = new Map<string, number>();
  for (const d of devices) {
    const bucket = bucketNodeClass(d.node_class);
    deviceCountByBucket.set(bucket, (deviceCountByBucket.get(bucket) ?? 0) + 1);
  }

  function waiverFor(source: "m365" | "ninjaone", key: string): ReconciliationWaiver | null {
    return waiverMap.get(`${clientId}:${source}:${key}`) ?? null;
  }

  const rows: ReconciliationRow[] = [...quantityByKey.entries()].map(([key, contractedQuantity]) => {
    const serviceName = displayNameByKey.get(key) ?? key;
    const mappedSku = licenseMappingBySameKey.get(key);
    const mappedDeviceClass = deviceMappingBySameKey.get(key);

    if (mappedSku) {
      const license = licenseBySku.get(mappedSku);
      if (!license) {
        return {
          source: "m365",
          serviceName,
          contractedQuantity,
          mappedLabel: friendlyM365SkuName(mappedSku),
          actualUnits: null,
          status: "license_missing",
          waiver: waiverFor("m365", key),
        };
      }
      return {
        source: "m365",
        serviceName,
        contractedQuantity,
        mappedLabel: friendlyM365SkuName(mappedSku),
        actualUnits: license.enabled_units,
        status: license.enabled_units === contractedQuantity ? "matched" : "mismatch",
        waiver: waiverFor("m365", key),
      };
    }

    if (mappedDeviceClass) {
      const actualUnits = deviceCountByBucket.get(mappedDeviceClass) ?? 0;
      return {
        source: "ninjaone",
        serviceName,
        contractedQuantity,
        mappedLabel: DEVICE_CLASS_LABELS[mappedDeviceClass],
        actualUnits: actualUnits === 0 ? null : actualUnits,
        status: actualUnits === 0 ? "license_missing" : actualUnits === contractedQuantity ? "matched" : "mismatch",
        waiver: waiverFor("ninjaone", key),
      };
    }

    return {
      source: null,
      serviceName,
      contractedQuantity,
      mappedLabel: null,
      actualUnits: null,
      status: "unmapped",
      waiver: null,
    };
  });

  // Reverse check, one per source: something the client actually has
  // provisioned/managed with no active contracted service mapped to it at
  // all — worth a look either way (a contract oversight, or the service
  // using a different unmapped name).
  const mappedSkusInUse = new Set(
    rows.filter((r) => r.source === "m365").map((r) => licenseMappingBySameKey.get(normalize(r.serviceName)))
  );
  const unmatchedLicenses: UnmatchedLicenseRow[] = licenses
    .filter((l) => l.enabled_units > 0 && !mappedSkusInUse.has(l.sku_part_number))
    .map((l) => ({
      skuPartNumber: l.sku_part_number,
      friendlyName: friendlyM365SkuName(l.sku_part_number),
      enabledUnits: l.enabled_units,
    }));

  const mappedDeviceClassesInUse = new Set(
    rows.filter((r) => r.source === "ninjaone").map((r) => deviceMappingBySameKey.get(normalize(r.serviceName)))
  );
  const unmatchedDevices: UnmatchedDeviceRow[] = (["workstation", "server", "mac"] as DeviceClass[])
    .filter((cls) => (deviceCountByBucket.get(cls) ?? 0) > 0 && !mappedDeviceClassesInUse.has(cls))
    .map((cls) => ({
      deviceClass: cls,
      label: DEVICE_CLASS_LABELS[cls],
      count: deviceCountByBucket.get(cls) ?? 0,
    }));

  return {
    rows: rows.sort((a, b) => a.serviceName.localeCompare(b.serviceName)),
    unmatchedLicenses,
    unmatchedDevices,
  };
}

/**
 * Compares one client's ACTIVE contracted services against their Microsoft
 * 365 licence counts AND their NinjaOne-managed device counts, via the two
 * global mapping tables staff maintain. A service with no mapping yet shows
 * as "unmapped" rather than being silently skipped — that's the prompt for
 * staff to create one.
 */
export async function fetchReconciliationForClient(clientId: string): Promise<ReconciliationResult> {
  const admin = createAdminClient();

  const [
    { data: services, error: servicesError },
    { data: licenses, error: licensesError },
    { data: devices, error: devicesError },
    licenseMappings,
    deviceMappings,
    waiverMap,
  ] = await Promise.all([
    admin.from("autotask_contract_services").select("service_name, contract_status, quantity").eq("client_id", clientId),
    admin.from("m365_license_summary").select("sku_part_number, enabled_units").eq("client_id", clientId),
    admin.from("ninjaone_devices").select("node_class").eq("client_id", clientId),
    fetchServiceLicenseMappings(admin),
    fetchServiceDeviceMappings(admin),
    fetchWaiverMap(admin),
  ]);

  if (servicesError) console.error("fetchReconciliationForClient: services failed", servicesError);
  if (licensesError) console.error("fetchReconciliationForClient: licenses failed", licensesError);
  if (devicesError) console.error("fetchReconciliationForClient: devices failed", devicesError);

  const licenseMappingBySameKey = new Map(licenseMappings.map((m) => [normalize(m.serviceName), m.skuPartNumber]));
  const deviceMappingBySameKey = new Map(deviceMappings.map((m) => [normalize(m.serviceName), m.deviceClass]));

  return computeClientReconciliation(
    (services ?? []) as RawService[],
    (licenses ?? []) as RawLicense[],
    (devices ?? []) as RawDevice[],
    licenseMappingBySameKey,
    deviceMappingBySameKey,
    waiverMap,
    clientId
  );
}

export type ClientReconciliationSummary = {
  clientId: string;
  clientName: string;
  matched: number;
  mismatch: number;
  unmapped: number;
  missing: number;
  waived: number;
  /** mismatch + unmapped + missing, excluding anything waived — what the
   * dashboard actually sorts by. */
  needsAttention: number;
  /** Most recent last_synced_at across this client's contract services,
   * licences, and devices — so staff can tell whether these numbers are
   * from today's sync or a stale one before acting on them. Null if this
   * client has no synced rows at all yet in any source. */
  lastSyncedAt: string | null;
};

/**
 * The portfolio-wide dashboard's data source — one bulk fetch per table
 * (no client_id filter) grouped in memory by client, rather than N
 * per-client round trips. Reuses computeClientReconciliation so the
 * per-client math is identical to the detail page's own.
 */
export async function fetchReconciliationSummaryForAllClients(): Promise<ClientReconciliationSummary[]> {
  const admin = createAdminClient();

  const [
    { data: clients },
    { data: allServices },
    { data: allLicenses },
    { data: allDevices },
    licenseMappings,
    deviceMappings,
    waiverMap,
  ] = await Promise.all([
    admin.from("clients").select("id, name").order("name"),
    admin.from("autotask_contract_services").select("client_id, service_name, contract_status, quantity, last_synced_at"),
    admin.from("m365_license_summary").select("client_id, sku_part_number, enabled_units, last_synced_at"),
    admin.from("ninjaone_devices").select("client_id, node_class, last_synced_at"),
    fetchServiceLicenseMappings(admin),
    fetchServiceDeviceMappings(admin),
    fetchWaiverMap(admin),
  ]);

  const licenseMappingBySameKey = new Map(licenseMappings.map((m) => [normalize(m.serviceName), m.skuPartNumber]));
  const deviceMappingBySameKey = new Map(deviceMappings.map((m) => [normalize(m.serviceName), m.deviceClass]));

  type SyncedRow = { client_id: string; last_synced_at: string };
  function groupByClient<T extends { client_id: string }>(rows: T[] | null): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const r of rows ?? []) {
      const list = map.get(r.client_id) ?? [];
      list.push(r);
      map.set(r.client_id, list);
    }
    return map;
  }
  const servicesByClient = groupByClient(allServices as (RawService & SyncedRow)[]);
  const licensesByClient = groupByClient(allLicenses as (RawLicense & SyncedRow)[]);
  const devicesByClient = groupByClient(allDevices as (RawDevice & SyncedRow)[]);

  function latestSyncFor(clientId: string): string | null {
    const timestamps = [
      ...(servicesByClient.get(clientId) ?? []),
      ...(licensesByClient.get(clientId) ?? []),
      ...(devicesByClient.get(clientId) ?? []),
    ].map((r) => (r as SyncedRow).last_synced_at);
    return timestamps.length > 0 ? timestamps.sort().at(-1)! : null;
  }

  const summaries: ClientReconciliationSummary[] = ((clients ?? []) as { id: string; name: string }[]).map(
    (client) => {
      const { rows } = computeClientReconciliation(
        servicesByClient.get(client.id) ?? [],
        licensesByClient.get(client.id) ?? [],
        devicesByClient.get(client.id) ?? [],
        licenseMappingBySameKey,
        deviceMappingBySameKey,
        waiverMap,
        client.id
      );

      let matched = 0;
      let mismatch = 0;
      let unmapped = 0;
      let missing = 0;
      let waived = 0;
      for (const row of rows) {
        if (row.waiver && row.status !== "matched" && row.status !== "unmapped") {
          waived += 1;
          continue;
        }
        if (row.status === "matched") matched += 1;
        else if (row.status === "mismatch") mismatch += 1;
        else if (row.status === "unmapped") unmapped += 1;
        else if (row.status === "license_missing") missing += 1;
      }

      return {
        clientId: client.id,
        clientName: client.name,
        matched,
        mismatch,
        unmapped,
        missing,
        waived,
        needsAttention: mismatch + unmapped + missing,
        lastSyncedAt: latestSyncFor(client.id),
      };
    }
  );

  return summaries.sort(
    (a, b) => b.needsAttention - a.needsAttention || a.clientName.localeCompare(b.clientName)
  );
}

/** Every distinct M365 SKU synced for ANY client — mapping is managed in
 * one place (the standalone mapping manager, not per-client), so this is
 * intentionally account-wide rather than scoped to one client. */
export async function fetchAllKnownSkus(): Promise<{ skuPartNumber: string; friendlyName: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("m365_license_summary").select("sku_part_number");
  if (error) {
    console.error("fetchAllKnownSkus failed", error);
    return [];
  }
  const unique = [...new Set(((data ?? []) as { sku_part_number: string }[]).map((l) => l.sku_part_number))];
  return unique
    .map((sku) => ({ skuPartNumber: sku, friendlyName: friendlyM365SkuName(sku) }))
    .sort((a, b) => a.friendlyName.localeCompare(b.friendlyName));
}

/** Every distinct ACTIVE contracted service name across ANY client, so the
 * mapping managers' "add a mapping" forms can offer a real pick-list (the
 * exact strings Autotask actually uses) instead of asking staff to type a
 * service name freehand and risk a typo that silently never matches.
 * Shared by both the licence and device mapping managers — a service name
 * only needs to disappear from "unmapped" once EITHER mapping exists for
 * it, handled by each manager filtering against its own mapping set. */
export async function fetchAllContractedServiceNames(): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("autotask_contract_services")
    .select("service_name, contract_status");
  if (error) {
    console.error("fetchAllContractedServiceNames failed", error);
    return [];
  }
  type Row = { service_name: string; contract_status: string | null };
  const active = ((data ?? []) as Row[]).filter(
    (s) => (s.contract_status ?? "").toLowerCase() === "active"
  );
  return [...new Set(active.map((s) => s.service_name))].sort((a, b) => a.localeCompare(b));
}
