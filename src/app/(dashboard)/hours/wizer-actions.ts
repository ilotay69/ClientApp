"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getWizerSettings } from "@/lib/wizer-settings";
import { fetchWizerCompanyMetrics, type WizerCompanyMetricsRow } from "@/lib/wizer-lookups";

export async function fetchWizerCompanyMetricsAction(): Promise<
  { rows: WizerCompanyMetricsRow[] } | { error: string }
> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const settings = await getWizerSettings(admin);
  if (!settings) {
    return { error: "Wizer isn't connected yet — set it up under Settings → Integrations." };
  }
  try {
    return { rows: await fetchWizerCompanyMetrics(settings) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load Wizer training metrics." };
  }
}
