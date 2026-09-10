import { createAdminClient } from "@/lib/supabase/server";
import { friendlyM365SkuName } from "@/lib/m365-sku-names";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

export type ServiceLicenseMapping = {
  id: string;
  serviceName: string;
  skuPartNumber: string;
};

/** Case/whitespace-insensitive key for matching a contracted service name
 * against a stored mapping — the mapping itself is still stored/displayed
 * with whatever exact casing staff typed, this is only used for lookups. */
function normalize(name: string): string {
  return name.trim().toLowerCase();
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

export type ReconciliationRow = {
  serviceName: string;
  contractedQuantity: number;
  mappedSku: string | null;
  mappedSkuFriendlyName: string | null;
  /** Null only when mappedSku is set but this client has no license row for
   * that SKU at all (distinct from a genuine 0-unit mismatch). */
  licensedUnits: number | null;
  status: "matched" | "mismatch" | "unmapped" | "license_missing";
};

export type UnmatchedLicenseRow = {
  skuPartNumber: string;
  friendlyName: string;
  enabledUnits: number;
};

export type ReconciliationResult = {
  rows: ReconciliationRow[];
  unmatchedLicenses: UnmatchedLicenseRow[];
};

/**
 * Compares one client's ACTIVE contracted services (Autotask) against their
 * Microsoft 365 license counts, via the global service_license_mappings
 * table staff maintains. A service with no mapping yet shows as "unmapped"
 * rather than being silently skipped — that's the prompt for staff to
 * create one (see saveServiceLicenseMapping in reconciliation/actions.ts).
 */
export async function fetchReconciliationForClient(clientId: string): Promise<ReconciliationResult> {
  const admin = createAdminClient();

  const [{ data: services, error: servicesError }, { data: licenses, error: licensesError }, mappings] =
    await Promise.all([
      admin
        .from("autotask_contract_services")
        .select("service_name, contract_status, quantity")
        .eq("client_id", clientId),
      admin
        .from("m365_license_summary")
        .select("sku_part_number, enabled_units")
        .eq("client_id", clientId),
      fetchServiceLicenseMappings(admin),
    ]);

  if (servicesError) console.error("fetchReconciliationForClient: services failed", servicesError);
  if (licensesError) console.error("fetchReconciliationForClient: licenses failed", licensesError);

  type ServiceRow = { service_name: string; contract_status: string | null; quantity: number | null };
  type LicenseRow = { sku_part_number: string; enabled_units: number };

  // Active only — same exact-match rule the portal's own contracted-services
  // card uses ("Inactive" contains the substring "active" too).
  const activeServices = ((services ?? []) as ServiceRow[]).filter(
    (s) => (s.contract_status ?? "").toLowerCase() === "active"
  );

  // A client can have the same-named service across more than one active
  // contract — sum them rather than showing duplicate rows.
  const quantityByKey = new Map<string, number>();
  const displayNameByKey = new Map<string, string>();
  for (const s of activeServices) {
    const key = normalize(s.service_name);
    quantityByKey.set(key, (quantityByKey.get(key) ?? 0) + (s.quantity ?? 0));
    if (!displayNameByKey.has(key)) displayNameByKey.set(key, s.service_name);
  }

  const mappingBySameKey = new Map(mappings.map((m) => [normalize(m.serviceName), m.skuPartNumber]));
  const licenseBySku = new Map(((licenses ?? []) as LicenseRow[]).map((l) => [l.sku_part_number, l]));

  const rows: ReconciliationRow[] = [...quantityByKey.entries()].map(([key, contractedQuantity]) => {
    const serviceName = displayNameByKey.get(key) ?? key;
    const mappedSku = mappingBySameKey.get(key) ?? null;
    if (!mappedSku) {
      return {
        serviceName,
        contractedQuantity,
        mappedSku: null,
        mappedSkuFriendlyName: null,
        licensedUnits: null,
        status: "unmapped",
      };
    }
    const license = licenseBySku.get(mappedSku);
    if (!license) {
      return {
        serviceName,
        contractedQuantity,
        mappedSku,
        mappedSkuFriendlyName: friendlyM365SkuName(mappedSku),
        licensedUnits: null,
        status: "license_missing",
      };
    }
    return {
      serviceName,
      contractedQuantity,
      mappedSku,
      mappedSkuFriendlyName: friendlyM365SkuName(mappedSku),
      licensedUnits: license.enabled_units,
      status: license.enabled_units === contractedQuantity ? "matched" : "mismatch",
    };
  });

  // Reverse check: a license this client actually has provisioned, with no
  // contracted service mapped to it at all — worth a look either way
  // (an oversight in Autotask, or a service using a different unmapped name).
  const mappedSkusInUse = new Set(
    rows.map((r) => r.mappedSku).filter((s): s is string => s != null)
  );
  const unmatchedLicenses: UnmatchedLicenseRow[] = ((licenses ?? []) as LicenseRow[])
    .filter((l) => l.enabled_units > 0 && !mappedSkusInUse.has(l.sku_part_number))
    .map((l) => ({
      skuPartNumber: l.sku_part_number,
      friendlyName: friendlyM365SkuName(l.sku_part_number),
      enabledUnits: l.enabled_units,
    }));

  return {
    rows: rows.sort((a, b) => a.serviceName.localeCompare(b.serviceName)),
    unmatchedLicenses,
  };
}

/** Every SKU this specific client actually has, for the "map this service
 * to a license" picker — scoped to what's real for them, not every SKU
 * that's ever existed across the whole book of business. */
export async function fetchClientLicenseSkus(
  clientId: string
): Promise<{ skuPartNumber: string; friendlyName: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("m365_license_summary")
    .select("sku_part_number")
    .eq("client_id", clientId)
    .order("sku_part_number");
  if (error) {
    console.error("fetchClientLicenseSkus failed", error);
    return [];
  }
  return ((data ?? []) as { sku_part_number: string }[]).map((l) => ({
    skuPartNumber: l.sku_part_number,
    friendlyName: friendlyM365SkuName(l.sku_part_number),
  }));
}
