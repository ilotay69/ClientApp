import { createAdminClient } from "@/lib/supabase/server";
import { getM365ClientSettings, getValidM365Token } from "@/lib/m365-client-credentials";
import {
  fetchUserRegistrationDetails,
  fetchUserSignInActivity,
  fetchPrivilegedRoleAssignments,
} from "@/lib/m365-partner";
import { fetchConfiguredM365Clients, type ClientLookupError } from "@/lib/m365-lookups";

type Admin = ReturnType<typeof createAdminClient>;

export type ItdrUserRow = {
  clientName: string;
  userPrincipalName: string;
  displayName: string;
  issues: string[];
};

const INACTIVE_DAYS_THRESHOLD = 90;

/** One tenant's identity-risk signals, combined per user — no MFA,
 * inactive-but-enabled, or holding a privileged role — tagged onto the
 * same row per user rather than three separate tables, since "this one
 * person is both a Global Admin and has no MFA" is the finding that
 * actually matters, not three disconnected lists. Reuses the same
 * per-user fetchers the M365 rollup lookups already use. */
async function buildItdrRowsForOneClient(token: string, clientName: string): Promise<ItdrUserRow[]> {
  const [regDetails, signInActivity, privilegedRoles] = await Promise.all([
    fetchUserRegistrationDetails(token),
    fetchUserSignInActivity(token),
    fetchPrivilegedRoleAssignments(token),
  ]);

  const now = Date.now();
  const issuesByKey = new Map<string, { displayName: string; issues: string[] }>();

  for (const u of regDetails) {
    if (u.user_type === "guest") continue;
    if (u.is_mfa_registered) continue;
    const entry = issuesByKey.get(u.user_principal_name) ?? { displayName: u.user_display_name, issues: [] };
    entry.issues.push(u.is_admin ? "No MFA (admin)" : "No MFA");
    issuesByKey.set(u.user_principal_name, entry);
  }

  for (const u of signInActivity) {
    if (!u.account_enabled) continue;
    const days = u.last_successful_sign_in
      ? Math.floor((now - new Date(u.last_successful_sign_in).getTime()) / 86_400_000)
      : null;
    if (days !== null && days < INACTIVE_DAYS_THRESHOLD) continue;
    const entry = issuesByKey.get(u.user_principal_name) ?? { displayName: u.display_name, issues: [] };
    entry.issues.push(days === null ? "Never signed in" : `Inactive ${days}d`);
    issuesByKey.set(u.user_principal_name, entry);
  }

  for (const r of privilegedRoles) {
    const key = r.member_upn ?? r.member_display_name;
    const entry = issuesByKey.get(key) ?? { displayName: r.member_display_name, issues: [] };
    entry.issues.push(r.role_name);
    issuesByKey.set(key, entry);
  }

  return [...issuesByKey.entries()].map(([key, { displayName, issues }]) => ({
    clientName,
    userPrincipalName: key,
    displayName,
    issues,
  }));
}

/** clientId === null means every M365-configured client (account-wide,
 * same per-client failure isolation as the other M365 rollups); a
 * specific clientId scopes to that one tenant only. */
export async function fetchItdrRows(
  admin: Admin,
  clientId: string | null
): Promise<{ rows: ItdrUserRow[]; errors: ClientLookupError[] }> {
  if (clientId) {
    const { data: client } = await admin.from("clients").select("name").eq("id", clientId).maybeSingle();
    const clientName = client?.name ?? "Unknown client";
    const settings = await getM365ClientSettings(admin, clientId);
    if (!settings) {
      return {
        rows: [],
        errors: [{ clientId, clientName, error: "This client isn't connected to Microsoft 365 yet." }],
      };
    }
    try {
      const token = await getValidM365Token(admin, clientId, settings);
      return { rows: await buildItdrRowsForOneClient(token, clientName), errors: [] };
    } catch (err) {
      return {
        rows: [],
        errors: [{ clientId, clientName, error: err instanceof Error ? err.message : "Unknown error" }],
      };
    }
  }

  const clients = await fetchConfiguredM365Clients(admin);
  const rows: ItdrUserRow[] = [];
  const errors: ClientLookupError[] = [];

  await Promise.all(
    clients.map(async (c) => {
      try {
        const token = await getValidM365Token(admin, c.clientId, c.settings);
        rows.push(...(await buildItdrRowsForOneClient(token, c.clientName)));
      } catch (err) {
        errors.push({
          clientId: c.clientId,
          clientName: c.clientName,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    })
  );

  return { rows, errors };
}
