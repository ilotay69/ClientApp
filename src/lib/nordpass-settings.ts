import { createAdminClient } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createAdminClient>;

export type NordPassSettings = { privateKey: string };

/** Reads the singleton NordPass credentials row via the admin client.
 * There's no API client to pair this with yet (see
 * supabase/052_nordpass_integration.sql for why) — this just lets the key
 * be saved and read back once that's built. */
export async function getNordPassSettings(admin: Admin): Promise<NordPassSettings | null> {
  const { data: row } = await admin.from("nordpass_settings").select("private_key").eq("id", true).maybeSingle();

  if (!row?.private_key) return null;

  return { privateKey: row.private_key };
}
