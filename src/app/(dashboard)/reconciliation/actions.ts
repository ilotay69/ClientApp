"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";

export type SaveMappingState = { error: string | null };

/** Creates (or replaces) the global mapping for one contracted service name
 * — applies to every client with that same service name from now on, not
 * just the one currently being reconciled. Upserts on service_name (unique)
 * so re-mapping an already-mapped service just updates it in place rather
 * than erroring. */
export async function saveServiceLicenseMapping(
  _prevState: SaveMappingState,
  formData: FormData
): Promise<SaveMappingState> {
  if (!(await requirePermission("manage_reconciliation"))) {
    return { error: "You don't have permission to do that." };
  }

  const serviceName = String(formData.get("service_name") ?? "").trim();
  const skuPartNumber = String(formData.get("sku_part_number") ?? "").trim();
  if (!serviceName || !skuPartNumber) {
    return { error: "Choose a licence to map this service to." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("service_license_mappings")
    .upsert({ service_name: serviceName, sku_part_number: skuPartNumber }, { onConflict: "service_name" });
  if (error) {
    console.error("saveServiceLicenseMapping failed", error);
    return { error: error.message };
  }

  revalidatePath("/reconciliation/licenses");
  revalidatePath("/reconciliation");
  return { error: null };
}

/** Removes a mapping — the affected service goes back to showing as
 * "unmapped" for every client, not just the one being viewed now. */
export async function deleteServiceLicenseMapping(serviceName: string): Promise<void> {
  if (!(await requirePermission("manage_reconciliation"))) return;

  const admin = createAdminClient();
  await admin.from("service_license_mappings").delete().eq("service_name", serviceName);
  revalidatePath("/reconciliation/licenses");
  revalidatePath("/reconciliation");
}

/** Same shape as saveServiceLicenseMapping, for the NinjaOne device-class
 * side of reconciliation instead of the M365 licence side. */
export async function saveServiceDeviceMapping(
  _prevState: SaveMappingState,
  formData: FormData
): Promise<SaveMappingState> {
  if (!(await requirePermission("manage_reconciliation"))) {
    return { error: "You don't have permission to do that." };
  }

  const serviceName = String(formData.get("service_name") ?? "").trim();
  const deviceClass = String(formData.get("device_class") ?? "").trim();
  if (!serviceName || !deviceClass) {
    return { error: "Choose a device class to map this service to." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("service_device_mappings")
    .upsert({ service_name: serviceName, device_class: deviceClass }, { onConflict: "service_name" });
  if (error) {
    console.error("saveServiceDeviceMapping failed", error);
    return { error: error.message };
  }

  revalidatePath("/reconciliation/licenses");
  revalidatePath("/reconciliation");
  return { error: null };
}

export async function deleteServiceDeviceMapping(serviceName: string): Promise<void> {
  if (!(await requirePermission("manage_reconciliation"))) return;

  const admin = createAdminClient();
  await admin.from("service_device_mappings").delete().eq("service_name", serviceName);
  revalidatePath("/reconciliation/licenses");
  revalidatePath("/reconciliation");
}

export type SaveWaiverState = { error: string | null };

/** Marks one client+source+service mismatch as a known, intentional
 * exception — upserts on the (client_id, source, service_name) unique
 * constraint, so re-waiving an already-waived row just updates the note/
 * author/timestamp in place. */
export async function saveReconciliationWaiver(
  _prevState: SaveWaiverState,
  formData: FormData
): Promise<SaveWaiverState> {
  const user = await requirePermission("manage_reconciliation");
  if (!user) {
    return { error: "You don't have permission to do that." };
  }

  const clientId = String(formData.get("client_id") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const serviceName = String(formData.get("service_name") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!clientId || !source || !serviceName || !note) {
    return { error: "Explain why this is being waived." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("reconciliation_waivers").upsert(
    {
      client_id: clientId,
      source,
      service_name: serviceName,
      note,
      waived_by: user.id,
      waived_at: new Date().toISOString(),
    },
    { onConflict: "client_id,source,service_name" }
  );
  if (error) {
    console.error("saveReconciliationWaiver failed", error);
    return { error: error.message };
  }

  revalidatePath("/reconciliation/licenses");
  revalidatePath("/reconciliation");
  return { error: null };
}

export async function deleteReconciliationWaiver(
  clientId: string,
  source: string,
  serviceName: string
): Promise<void> {
  if (!(await requirePermission("manage_reconciliation"))) return;

  const admin = createAdminClient();
  await admin
    .from("reconciliation_waivers")
    .delete()
    .eq("client_id", clientId)
    .eq("source", source)
    .eq("service_name", serviceName);
  revalidatePath("/reconciliation/licenses");
  revalidatePath("/reconciliation");
}
