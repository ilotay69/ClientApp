import { createAdminClient } from "@/lib/supabase/server";
import type { WizerCredentials } from "@/lib/wizer";

type Admin = ReturnType<typeof createAdminClient>;

/** Reads the singleton Wizer credentials row via the admin client — same
 * shape/spirit as getHuntressSettings. No token caching (the apiKey
 * header is static). Returns null if not configured yet. */
export async function getWizerSettings(admin: Admin): Promise<WizerCredentials | null> {
  const { data: row } = await admin.from("wizer_settings").select("api_key").eq("id", true).maybeSingle();

  if (!row?.api_key) return null;

  return { apiKey: row.api_key };
}
