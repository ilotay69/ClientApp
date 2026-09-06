import { createAdminClient } from "@/lib/supabase/server";
import { getValidM365Token, type M365ClientSettings } from "@/lib/m365-client-credentials";
import {
  fetchLicenseSummaryForTenant,
  fetchSecureScoreGapsForTenant,
  fetchUserRegistrationDetails,
  fetchUserSignInActivity,
  fetchPrivilegedRoleAssignments,
  fetchMailboxUsageDetail,
} from "@/lib/m365-partner";

type Admin = ReturnType<typeof createAdminClient>;

type ConfiguredClient = { clientId: string; clientName: string; settings: M365ClientSettings };

async function fetchConfiguredM365Clients(admin: Admin): Promise<ConfiguredClient[]> {
  const { data } = await admin
    .from("m365_client_credentials")
    .select(
      "client_id, app_client_id, app_client_secret, cached_access_token, token_expires_at, clients(id, name, m365_tenant_id)"
    );

  type Row = {
    client_id: string;
    app_client_id: string;
    app_client_secret: string;
    cached_access_token: string | null;
    token_expires_at: string | null;
    clients: { id: string; name: string; m365_tenant_id: string | null } | null;
  };

  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.clients?.m365_tenant_id)
    .map((r) => ({
      clientId: r.client_id,
      clientName: r.clients!.name,
      settings: {
        credentials: {
          tenantId: r.clients!.m365_tenant_id as string,
          appClientId: r.app_client_id,
          appClientSecret: r.app_client_secret,
        },
        cachedToken: r.cached_access_token,
        tokenExpiresAt: r.token_expires_at,
      },
    }));
}

export type ClientLookupError = { clientId: string; clientName: string; error: string };

/** Runs `fetchForClient` against every client with M365 credentials
 * configured, in parallel, isolating failures per client — a missing
 * Graph permission on one client's app registration (or a tenant that
 * hasn't re-consented yet) shouldn't blank out every other client's
 * results, the same per-org error isolation already used for Autotask's
 * resolveTicketCompanyIds and NinjaOne's account-wide queries. */
async function runAcrossConfiguredClients<T>(
  admin: Admin,
  fetchForClient: (token: string, client: ConfiguredClient) => Promise<T[]>
): Promise<{ rows: T[]; errors: ClientLookupError[] }> {
  const clients = await fetchConfiguredM365Clients(admin);
  const rows: T[] = [];
  const errors: ClientLookupError[] = [];

  await Promise.all(
    clients.map(async (client) => {
      try {
        const token = await getValidM365Token(admin, client.clientId, client.settings);
        rows.push(...(await fetchForClient(token, client)));
      } catch (err) {
        errors.push({
          clientId: client.clientId,
          clientName: client.clientName,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    })
  );

  return { rows, errors };
}

export type SecureScoreRollupRow = {
  clientId: string;
  clientName: string;
  currentScore: number;
  maxScore: number;
  percent: number;
};

/** Every configured client's current Secure Score in one place, worst
 * first — rolls up the per-client Secure Score panel already on each
 * client's own page. Uses credentials/permissions already granted
 * (SecurityEvents.Read.All), so this works today for every client that's
 * connected. */
export async function fetchSecureScoreRollup(
  admin: Admin
): Promise<{ rows: SecureScoreRollupRow[]; errors: ClientLookupError[] }> {
  const { rows, errors } = await runAcrossConfiguredClients(admin, async (token, client) => {
    const { summary } = await fetchSecureScoreGapsForTenant(token);
    if (!summary.max_score) return [];
    return [
      {
        clientId: client.clientId,
        clientName: client.clientName,
        currentScore: summary.current_score,
        maxScore: summary.max_score,
        percent: (summary.current_score / summary.max_score) * 100,
      },
    ];
  });
  return { rows: rows.sort((a, b) => a.percent - b.percent), errors };
}

export type LicenseUtilizationRow = {
  clientId: string;
  clientName: string;
  skuPartNumber: string;
  purchased: number;
  consumed: number;
  available: number;
  percentUsed: number;
};

/** Purchased vs. consumed seats per SKU, across every configured client —
 * flags both waste (paying for unused seats) and near-limit SKUs (upsell
 * to buy more) in one sortable table. Uses credentials/permissions
 * already granted (LicenseAssignment.Read.All), so this works today. */
export async function fetchLicenseUtilizationRollup(
  admin: Admin
): Promise<{ rows: LicenseUtilizationRow[]; errors: ClientLookupError[] }> {
  const { rows, errors } = await runAcrossConfiguredClients(admin, async (token, client) => {
    const skus = await fetchLicenseSummaryForTenant(token);
    return skus
      .filter((s) => s.enabled_units > 0)
      .map((s) => ({
        clientId: client.clientId,
        clientName: client.clientName,
        skuPartNumber: s.sku_part_number,
        purchased: s.enabled_units,
        consumed: s.consumed_units,
        available: s.enabled_units - s.consumed_units,
        percentUsed: (s.consumed_units / s.enabled_units) * 100,
      }));
  });
  return { rows: rows.sort((a, b) => b.percentUsed - a.percentUsed), errors };
}

export type MfaGapRow = {
  clientId: string;
  clientName: string;
  userPrincipalName: string;
  userDisplayName: string;
  isAdmin: boolean;
};

/** Every user across every configured client who isn't registered for
 * MFA — admins sort first, since an admin account without MFA is the
 * single most severe version of this finding. Needs AuditLog.Read.All,
 * which isn't consented on any client's app registration yet — every
 * client will show up under `errors` (403) until that permission is
 * added and re-consented per tenant. */
export async function fetchMfaGapsRollup(
  admin: Admin
): Promise<{ rows: MfaGapRow[]; errors: ClientLookupError[] }> {
  const { rows, errors } = await runAcrossConfiguredClients(admin, async (token, client) => {
    const users = await fetchUserRegistrationDetails(token);
    return users
      .filter((u) => !u.is_mfa_registered && u.user_type !== "guest")
      .map((u) => ({
        clientId: client.clientId,
        clientName: client.clientName,
        userPrincipalName: u.user_principal_name,
        userDisplayName: u.user_display_name,
        isAdmin: u.is_admin,
      }));
  });
  return { rows: rows.sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin)), errors };
}

const INACTIVE_DAYS_THRESHOLD = 90;

export type InactiveAccountRow = {
  clientId: string;
  clientName: string;
  userPrincipalName: string;
  displayName: string;
  daysSinceSignIn: number | null;
};

/** Enabled (still licensed/active) accounts with no successful sign-in in
 * 90+ days, or never — a cost-saving and security-cleanup opportunity,
 * the same "offline and nobody's noticed" angle as the NinjaOne offline
 * devices lookup, just for M365 seats. Needs AuditLog.Read.All — same
 * permission as the MFA lookup, so a single new grant covers both. */
export async function fetchInactiveAccountsRollup(
  admin: Admin
): Promise<{ rows: InactiveAccountRow[]; errors: ClientLookupError[] }> {
  const now = Date.now();
  const { rows, errors } = await runAcrossConfiguredClients(admin, async (token, client) => {
    const users = await fetchUserSignInActivity(token);
    return users
      .filter((u) => u.account_enabled)
      .map((u) => ({
        clientId: client.clientId,
        clientName: client.clientName,
        userPrincipalName: u.user_principal_name,
        displayName: u.display_name,
        daysSinceSignIn: u.last_successful_sign_in
          ? Math.floor((now - new Date(u.last_successful_sign_in).getTime()) / 86_400_000)
          : null,
      }))
      .filter((r) => r.daysSinceSignIn === null || r.daysSinceSignIn >= INACTIVE_DAYS_THRESHOLD);
  });
  return { rows: rows.sort((a, b) => (b.daysSinceSignIn ?? Infinity) - (a.daysSinceSignIn ?? Infinity)), errors };
}

export type PrivilegedRoleRollupRow = {
  clientId: string;
  clientName: string;
  roleName: string;
  memberDisplayName: string;
  memberUpn: string | null;
};

/** Who holds Global Admin (or another privileged role) across every
 * configured client's tenant — "too many Global Admins" is a classic
 * audit finding, and this surfaces it without checking tenant by tenant.
 * Needs RoleManagement.Read.Directory, not consented anywhere yet. */
export async function fetchPrivilegedRolesRollup(
  admin: Admin
): Promise<{ rows: PrivilegedRoleRollupRow[]; errors: ClientLookupError[] }> {
  const { rows, errors } = await runAcrossConfiguredClients(admin, async (token, client) => {
    const assignments = await fetchPrivilegedRoleAssignments(token);
    return assignments.map((a) => ({
      clientId: client.clientId,
      clientName: client.clientName,
      roleName: a.role_name,
      memberDisplayName: a.member_display_name,
      memberUpn: a.member_upn,
    }));
  });
  return {
    rows: rows.sort((a, b) => a.clientName.localeCompare(b.clientName) || a.roleName.localeCompare(b.roleName)),
    errors,
  };
}

export type MailboxUsageRollupRow = {
  clientId: string;
  clientName: string;
  userPrincipalName: string;
  displayName: string;
  storageUsedBytes: number;
  quotaBytes: number;
  percentUsed: number;
};

/** Mailboxes across every configured client closest to their storage
 * quota — a lead-in for an Exchange Online Archiving or storage-tier
 * conversation. Needs Reports.Read.All, not consented anywhere yet. */
export async function fetchMailboxUsageRollup(
  admin: Admin
): Promise<{ rows: MailboxUsageRollupRow[]; errors: ClientLookupError[] }> {
  const { rows, errors } = await runAcrossConfiguredClients(admin, async (token, client) => {
    const mailboxes = await fetchMailboxUsageDetail(token);
    return mailboxes
      .filter((m) => m.prohibit_send_receive_quota_bytes > 0)
      .map((m) => ({
        clientId: client.clientId,
        clientName: client.clientName,
        userPrincipalName: m.user_principal_name,
        displayName: m.display_name,
        storageUsedBytes: m.storage_used_bytes,
        quotaBytes: m.prohibit_send_receive_quota_bytes,
        percentUsed: (m.storage_used_bytes / m.prohibit_send_receive_quota_bytes) * 100,
      }));
  });
  return { rows: rows.sort((a, b) => b.percentUsed - a.percentUsed), errors };
}
