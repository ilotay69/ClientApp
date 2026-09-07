import { createAdminClient } from "@/lib/supabase/server";
import type { HuntressCredentials } from "@/lib/huntress";

type Admin = ReturnType<typeof createAdminClient>;

/** Reads the singleton Huntress credentials row via the admin client —
 * same shape/spirit as getHuduSettings. No token caching here (unlike
 * getNinjaOneSettings/getValidM365Token) — Huntress's Basic Auth header is
 * static, nothing to mint or refresh. Returns null if not configured yet. */
export async function getHuntressSettings(admin: Admin): Promise<HuntressCredentials | null> {
  const { data: row } = await admin
    .from("huntress_settings")
    .select("api_key, api_secret")
    .eq("id", true)
    .maybeSingle();

  if (!row?.api_key || !row?.api_secret) return null;

  return { apiKey: row.api_key, apiSecret: row.api_secret };
}
