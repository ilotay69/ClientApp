import { createAdminClient } from "@/lib/supabase/server";
import type { BitdefenderCredentials } from "@/lib/bitdefender";

type Admin = ReturnType<typeof createAdminClient>;

/** Reads the singleton Bitdefender GravityZone credentials row via the
 * admin client — same shape/spirit as getHuntressSettings. No token
 * caching (Basic Auth header is static). Returns null if not configured
 * yet. */
export async function getBitdefenderSettings(admin: Admin): Promise<BitdefenderCredentials | null> {
  const { data: row } = await admin
    .from("bitdefender_settings")
    .select("region, api_key")
    .eq("id", true)
    .maybeSingle();

  if (!row?.api_key) return null;

  return { region: row.region, apiKey: row.api_key };
}
