import { createAdminClient } from "@/lib/supabase/server";
import { exchangeRefreshTokenForTenant, type M365PartnerCredentials } from "@/lib/m365-partner";

type Admin = ReturnType<typeof createAdminClient>;

export type M365PartnerSettings = {
  credentials: M365PartnerCredentials;
  refreshToken: string | null;
  oboUserHint: string | null;
  connectedAt: string | null;
};

/** Reads the singleton Microsoft 365 partner credentials row via the admin
 * client — same shape/spirit as getAutotaskSettings. Returns null if the
 * app registration hasn't been configured yet (before Client ID/Secret are
 * saved). Note this can return non-null with `refreshToken: null` — saved
 * but not yet connected via the OAuth flow. */
export async function getM365PartnerSettings(admin: Admin): Promise<M365PartnerSettings | null> {
  const { data: row } = await admin
    .from("m365_partner_settings")
    .select("partner_tenant_id, client_id, client_secret, cached_refresh_token, obo_user_hint, connected_at")
    .eq("id", true)
    .maybeSingle();

  if (!row || !row.partner_tenant_id || !row.client_id || !row.client_secret) return null;

  return {
    credentials: {
      partnerTenantId: row.partner_tenant_id,
      clientId: row.client_id,
      clientSecret: row.client_secret,
    },
    refreshToken: row.cached_refresh_token ?? null,
    oboUserHint: row.obo_user_hint,
    connectedAt: row.connected_at,
  };
}

/** The cross-tenant token exchange, persisting the rotated refresh token
 * immediately so the chain doesn't break. Callers looping multiple
 * customer tenants MUST await this sequentially, never in parallel —
 * concurrent exchanges would race on which refresh token is "current". */
export async function getCustomerScopedToken(
  admin: Admin,
  settings: M365PartnerSettings,
  customerTenantId: string
): Promise<string> {
  if (!settings.refreshToken) {
    throw new Error("Microsoft 365 partner connection isn't set up yet — connect it under Settings → Integrations.");
  }

  const result = await exchangeRefreshTokenForTenant(
    settings.credentials,
    settings.refreshToken,
    customerTenantId
  );

  await admin
    .from("m365_partner_settings")
    .update({ cached_refresh_token: result.refreshToken })
    .eq("id", true);

  // Keep the in-memory copy in sync too, in case the same `settings` object
  // is reused for a subsequent sequential call in the same run.
  settings.refreshToken = result.refreshToken;

  return result.accessToken;
}
