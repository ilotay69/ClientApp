"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getHuntressSettings } from "@/lib/huntress-settings";
import { fetchHuntressAgentsFull, type HuntressAgentRow } from "@/lib/huntress-lookups";
import { fetchItdrRows, type ItdrUserRow } from "@/lib/m365-itdr";
import type { ClientLookupError } from "@/lib/m365-lookups";

export type SecurityType = "edr" | "sat" | "itdr";

export type SecurityLookupResult =
  | { type: "edr"; rows: HuntressAgentRow[] }
  | { type: "itdr"; rows: ItdrUserRow[]; errors: ClientLookupError[] }
  | { error: string };

/** clientId === "" means every client (account-wide). EDR is Huntress
 * (single shared account, scoped by organization filter when one client
 * is picked). ITDR is Microsoft 365, which already has per-client
 * credentials, so "one client" vs "all clients" naturally maps to one
 * tenant vs looping every configured tenant. SAT has no confirmed data
 * source at all — Huntress's full public API (checked every tag: Agents,
 * Identities, Signals, Incident Reports, SIEM, Escalations, Reseller,
 * Remote Access) has nothing training/awareness-related, so this returns
 * an honest gap rather than fabricating something. (SIEM moved to its
 * own Lookups tab — it can't be filtered by client yet, so it didn't fit
 * this picker's per-client shape.) */
export async function getSecurityLookupAction(type: SecurityType, clientId: string): Promise<SecurityLookupResult> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();

  if (type === "sat") {
    return {
      error:
        "No Huntress endpoint exists for security awareness training data — checked their full public API (every tag: Agents, Identities, Signals, Incident Reports, SIEM, Escalations, Reseller, Remote Access) and found nothing training/awareness-related. If Huntress SAT data is available through a different account or portal, let me know and I'll dig into that specifically.",
    };
  }

  if (type === "edr") {
    const settings = await getHuntressSettings(admin);
    if (!settings) {
      return { error: "Huntress isn't connected yet — set it up under Settings → Integrations." };
    }
    try {
      if (!clientId) {
        return { type: "edr", rows: await fetchHuntressAgentsFull(settings) };
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
      return { type: "edr", rows: await fetchHuntressAgentsFull(settings, client.huntress_organization_id) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to load EDR data." };
    }
  }

  // type === "itdr"
  try {
    const { rows, errors } = await fetchItdrRows(admin, clientId || null);
    return { type: "itdr", rows, errors };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load ITDR data." };
  }
}
