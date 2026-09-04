import { createAdminClient } from "@/lib/supabase/server";
import type { HuduCredentials } from "@/lib/hudu";

type Admin = ReturnType<typeof createAdminClient>;

/** Reads the singleton Hudu credentials row via the admin client — same
 * shape/spirit as getAutotaskSettings/getNinjaOneSettings. Returns null if
 * not configured yet. */
export async function getHuduSettings(admin: Admin): Promise<HuduCredentials | null> {
  const { data: row } = await admin
    .from("hudu_settings")
    .select("base_url, api_key")
    .eq("id", true)
    .maybeSingle();

  if (!row || !row.base_url || !row.api_key) return null;

  return { baseUrl: row.base_url, apiKey: row.api_key };
}
