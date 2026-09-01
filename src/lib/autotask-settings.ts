import { createAdminClient } from "@/lib/supabase/server";
import type { AutotaskCredentials } from "@/lib/autotask";

type Admin = ReturnType<typeof createAdminClient>;

export type AutotaskSettings = {
  credentials: AutotaskCredentials;
  zoneUrl: string | null;
};

/** Reads the singleton Autotask credentials row via the admin client — same
 * shape/spirit as getActiveAiSettings. Returns null if not configured yet. */
export async function getAutotaskSettings(admin: Admin): Promise<AutotaskSettings | null> {
  const { data: row } = await admin
    .from("autotask_settings")
    .select("username, secret, integration_code, zone_url")
    .eq("id", true)
    .maybeSingle();

  if (!row || !row.username || !row.secret || !row.integration_code) return null;

  return {
    credentials: {
      username: row.username,
      secret: row.secret,
      integrationCode: row.integration_code,
    },
    zoneUrl: row.zone_url,
  };
}
