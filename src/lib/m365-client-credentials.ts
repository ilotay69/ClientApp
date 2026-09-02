import { createAdminClient } from "@/lib/supabase/server";
import { fetchAppOnlyToken, type M365ClientCredentials } from "@/lib/m365-partner";

type Admin = ReturnType<typeof createAdminClient>;

export type M365ClientSettings = {
  credentials: M365ClientCredentials;
  cachedToken: string | null;
  tokenExpiresAt: string | null;
};

/** Reads one client's Microsoft 365 app-registration credentials — unlike
 * Autotask/NinjaOne's single shared account, this is per-client (each
 * client's own tenant, own app registration). Returns null if this client
 * hasn't been set up yet. */
export async function getM365ClientSettings(admin: Admin, clientId: string): Promise<M365ClientSettings | null> {
  const [{ data: client }, { data: row }] = await Promise.all([
    admin.from("clients").select("m365_tenant_id").eq("id", clientId).single(),
    admin
      .from("m365_client_credentials")
      .select("app_client_id, app_client_secret, cached_access_token, token_expires_at")
      .eq("client_id", clientId)
      .maybeSingle(),
  ]);

  if (!client?.m365_tenant_id || !row?.app_client_id || !row?.app_client_secret) return null;

  return {
    credentials: {
      tenantId: client.m365_tenant_id,
      appClientId: row.app_client_id,
      appClientSecret: row.app_client_secret,
    },
    cachedToken: row.cached_access_token,
    tokenExpiresAt: row.token_expires_at,
  };
}

const REFRESH_BUFFER_MS = 60_000;

/** Returns a valid bearer token for this client's tenant, minting (and
 * caching) a new one only when the cached one is missing or close to
 * expiry — mirrors getValidNinjaOneToken. No rotation/refresh-token
 * complexity here: app-only tokens are always freely re-mintable from the
 * same client secret. */
export async function getValidM365Token(
  admin: Admin,
  clientId: string,
  settings: M365ClientSettings
): Promise<string> {
  if (settings.cachedToken && settings.tokenExpiresAt) {
    const expiresAt = new Date(settings.tokenExpiresAt).getTime();
    if (Date.now() < expiresAt - REFRESH_BUFFER_MS) {
      return settings.cachedToken;
    }
  }

  const { accessToken, expiresAt } = await fetchAppOnlyToken(settings.credentials);
  await admin
    .from("m365_client_credentials")
    .update({ cached_access_token: accessToken, token_expires_at: expiresAt })
    .eq("client_id", clientId);

  return accessToken;
}
