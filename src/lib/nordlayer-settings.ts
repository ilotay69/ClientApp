import { createAdminClient } from "@/lib/supabase/server";
import type { NordLayerCredentials } from "@/lib/nordlayer";

type Admin = ReturnType<typeof createAdminClient>;

/** Reads the singleton NordLayer credentials row via the admin client —
 * same shape/spirit as getWizerSettings. No token caching (the
 * Authorization header is static). Returns null if not configured yet. */
export async function getNordLayerSettings(admin: Admin): Promise<NordLayerCredentials | null> {
  const { data: row } = await admin.from("nordlayer_settings").select("api_key").eq("id", true).maybeSingle();

  if (!row?.api_key) return null;

  return { apiKey: row.api_key };
}
