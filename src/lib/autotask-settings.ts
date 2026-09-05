import { createAdminClient } from "@/lib/supabase/server";
import type { AutotaskCredentials } from "@/lib/autotask";

type Admin = ReturnType<typeof createAdminClient>;

export type AutotaskSettings = {
  credentials: AutotaskCredentials;
  zoneUrl: string | null;
  /** The classic web-UI zone (e.g. "https://ww3.autotask.net") — for deep
   * links to a record's own Autotask page (e.g. a quote), which have no
   * REST-accessible equivalent. Null until the connection's been tested
   * at least once since this column was added. */
  webZoneUrl: string | null;
};

/** Reads the singleton Autotask credentials row via the admin client — same
 * shape/spirit as getActiveAiSettings. Returns null if not configured yet. */
export async function getAutotaskSettings(admin: Admin): Promise<AutotaskSettings | null> {
  const { data: row } = await admin
    .from("autotask_settings")
    .select("username, secret, integration_code, zone_url, web_zone_url")
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
    webZoneUrl: row.web_zone_url,
  };
}
