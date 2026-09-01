import { createAdminClient } from "@/lib/supabase/server";
import { fetchAccessToken, type NinjaOneCredentials } from "@/lib/ninjaone";

type Admin = ReturnType<typeof createAdminClient>;

export type NinjaOneSettings = {
  credentials: NinjaOneCredentials;
  cachedToken: string | null;
  tokenExpiresAt: string | null;
};

/** Reads the singleton NinjaOne credentials row via the admin client —
 * same shape/spirit as getAutotaskSettings. Returns null if not
 * configured yet. */
export async function getNinjaOneSettings(admin: Admin): Promise<NinjaOneSettings | null> {
  const { data: row } = await admin
    .from("ninjaone_settings")
    .select("region, client_id, client_secret, cached_access_token, token_expires_at")
    .eq("id", true)
    .maybeSingle();

  if (!row || !row.client_id || !row.client_secret) return null;

  return {
    credentials: {
      region: row.region,
      clientId: row.client_id,
      clientSecret: row.client_secret,
    },
    cachedToken: row.cached_access_token,
    tokenExpiresAt: row.token_expires_at,
  };
}

const REFRESH_BUFFER_MS = 60_000;

/** Returns a valid bearer token, refreshing (and persisting the refresh)
 * only when the cached one is missing or close to expiry — mirrors
 * mail-sync.ts's getValidAccessToken for Microsoft Graph. */
export async function getValidNinjaOneToken(admin: Admin, settings: NinjaOneSettings): Promise<string> {
  if (settings.cachedToken && settings.tokenExpiresAt) {
    const expiresAt = new Date(settings.tokenExpiresAt).getTime();
    if (Date.now() < expiresAt - REFRESH_BUFFER_MS) {
      return settings.cachedToken;
    }
  }

  const { token, expiresAt } = await fetchAccessToken(settings.credentials);
  await admin
    .from("ninjaone_settings")
    .update({ cached_access_token: token, token_expires_at: expiresAt })
    .eq("id", true);

  return token;
}
