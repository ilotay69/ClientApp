"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getHuntressSettings } from "@/lib/huntress-settings";
import { fetchHuntressAgentAlerts, type HuntressAgentAlertRow } from "@/lib/huntress-lookups";

export type SecurityType = "edr" | "sat" | "itdr";

export type SecurityLookupResult = { rows: HuntressAgentAlertRow[] } | { error: string };

/** clientId === "" means every client (account-wide). Only EDR (Huntress)
 * is wired up so far — SAT (Wizer) and ITDR (Microsoft 365) return a
 * plain "not built yet" message rather than guessing at data that isn't
 * confirmed/ready. */
export async function getSecurityLookupAction(
  type: SecurityType,
  clientId: string
): Promise<SecurityLookupResult> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }

  if (type !== "edr") {
    return {
      error: `${type.toUpperCase()} isn't wired up yet — EDR (Huntress) is the only category built so far.`,
    };
  }

  const admin = createAdminClient();
  const settings = await getHuntressSettings(admin);
  if (!settings) {
    return { error: "Huntress isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    if (!clientId) {
      return { rows: await fetchHuntressAgentAlerts(settings) };
    }

    const { data: client } = await admin
      .from("clients")
      .select("huntress_organization_id")
      .eq("id", clientId)
      .maybeSingle();
    if (!client?.huntress_organization_id) {
      return {
        error: "This client isn't linked to a Huntress organization yet — map it from the client's own page.",
      };
    }

    return { rows: await fetchHuntressAgentAlerts(settings, client.huntress_organization_id) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load EDR data." };
  }
}
