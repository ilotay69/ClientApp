import { createAdminClient } from "@/lib/supabase/server";
import {
  fetchAppOnlyToken,
  fetchConditionalAccessPoliciesForTenant,
  fetchIntuneManagedDevicesForTenant,
  fetchIntunePoliciesForTenant,
  type M365ClientCredentials,
} from "@/lib/m365-partner";

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

/** Conditional Access + Intune devices + Intune policies, each isolated in
 * its own try/catch — shared by syncClientM365Data, autoSyncClientM365IfStale
 * (both in clients/actions.ts) and the m365-partner-sync cron route, since
 * all three need the identical delete-then-reinsert dance for these tables.
 *
 * Errors are swallowed here (only logged) — the same posture the
 * account-wide M365 rollups already use for a not-yet-consented
 * permission: a client whose admin hasn't re-consented Policy.Read.All /
 * DeviceManagementManagedDevices.Read.All / DeviceManagementConfiguration.Read.All
 * yet just keeps the "not yet available" placeholder on these three tabs,
 * rather than the whole sync failing. */
export async function syncM365ConditionalAccessAndIntune(
  admin: Admin,
  clientId: string,
  customerToken: string
): Promise<void> {
  try {
    const policies = await fetchConditionalAccessPoliciesForTenant(customerToken);
    await admin.from("m365_conditional_access_policies").delete().eq("client_id", clientId);
    if (policies.length > 0) {
      await admin
        .from("m365_conditional_access_policies")
        .insert(policies.map((p) => ({ ...p, client_id: clientId })));
    }
  } catch (err) {
    console.error("M365 Conditional Access sync failed", clientId, err);
  }

  try {
    const devices = await fetchIntuneManagedDevicesForTenant(customerToken);
    await admin.from("m365_intune_devices").delete().eq("client_id", clientId);
    if (devices.length > 0) {
      await admin.from("m365_intune_devices").insert(devices.map((d) => ({ ...d, client_id: clientId })));
    }
  } catch (err) {
    console.error("M365 Intune devices sync failed", clientId, err);
  }

  try {
    const policies = await fetchIntunePoliciesForTenant(customerToken);
    await admin.from("m365_intune_policies").delete().eq("client_id", clientId);
    if (policies.length > 0) {
      await admin.from("m365_intune_policies").insert(policies.map((p) => ({ ...p, client_id: clientId })));
    }
  } catch (err) {
    console.error("M365 Intune policies sync failed", clientId, err);
  }
}
