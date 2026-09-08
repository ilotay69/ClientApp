"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { fetchForticloudDeviceInventory, type ForticloudDeviceRow } from "@/lib/forticloud-lookups";
import type { ForticloudCredentials } from "@/lib/forticloud";

export async function fetchForticloudDevicesAction(): Promise<{ rows: ForticloudDeviceRow[] } | { error: string }> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const { data } = await admin.from("forticloud_accounts").select("label, api_user, api_password");
  if (!data || data.length === 0) {
    return { error: "No FortiCloud accounts configured yet — add one under Settings → Integrations." };
  }

  const accounts = data.map((r) => ({
    label: r.label,
    creds: { apiUser: r.api_user, apiPassword: r.api_password } satisfies ForticloudCredentials,
  }));

  try {
    return { rows: await fetchForticloudDeviceInventory(accounts) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load FortiCloud devices." };
  }
}
