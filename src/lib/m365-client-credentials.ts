import { createAdminClient } from "@/lib/supabase/server";
import {
  fetchAppOnlyToken,
  fetchConditionalAccessPoliciesForTenant,
  fetchIntuneManagedDevicesForTenant,
  fetchIntunePoliciesForTenant,
  fetchRiskyUsersForTenant,
  fetchRiskDetectionsForTenant,
  fetchUserRegistrationDetails,
  fetchUserSignInActivity,
  fetchMailboxUsageDetail,
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

/** Identity Protection (risky users + risk detections), MFA/sign-in audit,
 * and mailbox usage — each isolated in its own try/catch, same shared-
 * helper role as syncM365ConditionalAccessAndIntune above (called from
 * syncClientM365Data, autoSyncClientM365IfStale, and the
 * m365-partner-sync cron route).
 *
 * MFA registration and sign-in activity are fetched separately but
 * written as ONE row per user (m365_user_audit) — the same join
 * m365-itdr.ts already does for the account-wide rollup, keyed by
 * user_principal_name, just kept as real columns here instead of a
 * flattened issues[] list so the per-client tab can filter/sort on each
 * signal independently. A user present in only one of the two source
 * lists (e.g. registration details for a guest with no sign-in activity
 * recorded) still gets a row — the other fetch's fields are left at
 * their column defaults. */
export async function syncM365IdentityAndUsage(
  admin: Admin,
  clientId: string,
  customerToken: string
): Promise<void> {
  try {
    const riskyUsers = await fetchRiskyUsersForTenant(customerToken);
    await admin.from("m365_risky_users").delete().eq("client_id", clientId);
    if (riskyUsers.length > 0) {
      await admin.from("m365_risky_users").insert(riskyUsers.map((u) => ({ ...u, client_id: clientId })));
    }
  } catch (err) {
    console.error("M365 risky users sync failed", clientId, err);
  }

  try {
    const detections = await fetchRiskDetectionsForTenant(customerToken);
    await admin.from("m365_risk_detections").delete().eq("client_id", clientId);
    if (detections.length > 0) {
      await admin
        .from("m365_risk_detections")
        .insert(detections.map((d) => ({ ...d, client_id: clientId })));
    }
  } catch (err) {
    console.error("M365 risk detections sync failed", clientId, err);
  }

  try {
    const [registrations, signIns] = await Promise.all([
      fetchUserRegistrationDetails(customerToken),
      fetchUserSignInActivity(customerToken),
    ]);

    type AuditRow = {
      user_principal_name: string;
      display_name: string | null;
      is_admin: boolean;
      is_mfa_registered: boolean;
      is_mfa_capable: boolean;
      user_type: string | null;
      account_enabled: boolean;
      last_successful_sign_in: string | null;
    };
    const byUpn = new Map<string, AuditRow>();

    for (const r of registrations) {
      byUpn.set(r.user_principal_name, {
        user_principal_name: r.user_principal_name,
        display_name: r.user_display_name,
        is_admin: r.is_admin,
        is_mfa_registered: r.is_mfa_registered,
        is_mfa_capable: r.is_mfa_capable,
        user_type: r.user_type,
        account_enabled: true,
        last_successful_sign_in: null,
      });
    }
    for (const s of signIns) {
      const existing = byUpn.get(s.user_principal_name);
      if (existing) {
        existing.account_enabled = s.account_enabled;
        existing.last_successful_sign_in = s.last_successful_sign_in;
        existing.display_name = existing.display_name ?? s.display_name;
      } else {
        byUpn.set(s.user_principal_name, {
          user_principal_name: s.user_principal_name,
          display_name: s.display_name,
          is_admin: false,
          is_mfa_registered: false,
          is_mfa_capable: false,
          user_type: null,
          account_enabled: s.account_enabled,
          last_successful_sign_in: s.last_successful_sign_in,
        });
      }
    }

    const auditRows = [...byUpn.values()];
    await admin.from("m365_user_audit").delete().eq("client_id", clientId);
    if (auditRows.length > 0) {
      await admin.from("m365_user_audit").insert(auditRows.map((a) => ({ ...a, client_id: clientId })));
    }
  } catch (err) {
    console.error("M365 user audit (MFA/sign-in) sync failed", clientId, err);
  }

  try {
    const usage = await fetchMailboxUsageDetail(customerToken);
    await admin.from("m365_mailbox_usage").delete().eq("client_id", clientId);
    if (usage.length > 0) {
      await admin.from("m365_mailbox_usage").insert(
        usage.map((u) => ({
          user_principal_name: u.user_principal_name,
          display_name: u.display_name,
          storage_used_bytes: u.storage_used_bytes,
          prohibit_send_receive_quota_bytes: u.prohibit_send_receive_quota_bytes,
          client_id: clientId,
        }))
      );
    }
  } catch (err) {
    console.error("M365 mailbox usage sync failed", clientId, err);
  }
}
