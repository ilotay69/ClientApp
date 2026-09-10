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
  return { error: null };
}

/** Removes a mapping — the affected service goes back to showing as
 * "unmapped" for every client, not just the one being viewed now. */
export async function deleteServiceLicenseMapping(serviceName: string): Promise<void> {
  if (!(await requirePermission("manage_reconciliation"))) return;

  const admin = createAdminClient();
  await admin.from("service_license_mappings").delete().eq("service_name", serviceName);
  revalidatePath("/reconciliation/licenses");
}
