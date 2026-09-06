// Microsoft 365 per-client helpers. No SDK — plain fetch, mirroring the
// style of autotask.ts/ninjaone.ts: each client has its OWN Azure AD app
// registration (created by that client's admin, in their own tenant) with
// APPLICATION (app-only) Graph permissions, admin-consented once. This
// replaced an earlier GDAP/OBO design — GDAP's cross-tenant refresh-token
// exchange hit an unresolvable wall where a customer tenant's Conditional
// Access policy required MFA that a non-interactive background flow could
// never satisfy (AADSTS50076), even with the right claims requested
// up front. Plain client-credentials auth sidesteps that entirely: app-only
// tokens don't route through the same per-user Conditional Access checks,
// and each client's credentials are fully independent — no shared refresh
// token, no rotation, no cross-tenant exchange.

export type M365ClientCredentials = {
  tenantId: string;
  appClientId: string;
  appClientSecret: string;
};

function authority(tenantId: string) {
  return `https://login.microsoftonline.com/${tenantId}`;
}

export type M365Token = { accessToken: string; expiresAt: string };

/** Plain OAuth2 client-credentials grant, scoped to exactly one tenant —
 * no refresh token, no interactive step. Requires the app registration's
 * Application permissions (LicenseAssignment.Read.All,
 * SecurityEvents.Read.All) to have been admin-consented in that tenant. */
export async function fetchAppOnlyToken(creds: M365ClientCredentials): Promise<M365Token> {
  const res = await fetch(`${authority(creds.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.appClientId,
      client_secret: creds.appClientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft 365 token request failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error("Microsoft 365 token response did not include an access_token.");

  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
  };
}

async function graphGet(accessToken: string, path: string) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft Graph request failed (${res.status}): ${text}`);
  }
  return res.json();
}

/** Confirms the credentials actually work via one trivial authenticated
 * call, not just that a token was issued. Uses /subscribedSkus rather than
 * /organization — the latter needs Organization.Read.All, a permission
 * this integration never asks for, so it would 403 even on correctly
 * configured credentials. /subscribedSkus is covered by
 * LicenseAssignment.Read.All, which the sync itself already requires.
 * $select is used instead of $top — /subscribedSkus doesn't support
 * custom page sizes and 400s on $top. */
export async function testM365ClientConnection(
  creds: M365ClientCredentials
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { accessToken } = await fetchAppOnlyToken(creds);
    await graphGet(accessToken, "/subscribedSkus?$select=skuId");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export type M365LicenseRow = {
  sku_part_number: string;
  consumed_units: number;
  enabled_units: number;
  suspended_units: number;
  capability_status: string | null;
};

/** Verified against Microsoft's own subscribedSkus docs — exact field
 * names, not guessed. */
export async function fetchLicenseSummaryForTenant(customerAccessToken: string): Promise<M365LicenseRow[]> {
  const json = await graphGet(customerAccessToken, "/subscribedSkus");
  type RawSku = {
    skuPartNumber: string;
    consumedUnits: number;
    capabilityStatus?: string;
    prepaidUnits?: { enabled?: number; suspended?: number };
  };
  const skus = (json.value ?? []) as RawSku[];

  return skus.map((s) => ({
    sku_part_number: s.skuPartNumber,
    consumed_units: s.consumedUnits,
    enabled_units: s.prepaidUnits?.enabled ?? 0,
    suspended_units: s.prepaidUnits?.suspended ?? 0,
    capability_status: s.capabilityStatus ?? null,
  }));
}

export type M365SecureScoreSummary = {
  current_score: number;
  max_score: number;
  licensed_user_count: number | null;
  score_created_date_time: string | null;
};

export type M365SecureScoreGap = {
  control_name: string;
  title: string | null;
  category: string | null;
  current_score: number;
  max_score: number | null;
  remediation: string | null;
  action_url: string | null;
  tier: string | null;
  implementation_cost: string | null;
};

/** Verified against Microsoft's own docs — /security/secureScores gives
 * the tenant's current score plus a controlScores array (per-control
 * score earned, keyed by controlName); /security/secureScoreControlProfiles
 * gives the full catalog of controls (title, remediation, actionUrl, tier)
 * keyed by id. The join key (controlName == profile id, e.g. both being
 * "PWAgePolicyNew") is confirmed via Microsoft's own Q&A guidance, not
 * guessed. Only controls with real headroom (current < max) are returned
 * — a fully-implemented control isn't a "gap." */
export async function fetchSecureScoreGapsForTenant(
  customerAccessToken: string
): Promise<{ summary: M365SecureScoreSummary; gaps: M365SecureScoreGap[] }> {
  const [scoreJson, profilesJson] = await Promise.all([
    graphGet(customerAccessToken, "/security/secureScores?$top=1"),
    graphGet(customerAccessToken, "/security/secureScoreControlProfiles"),
  ]);

  type RawControlScore = { controlCategory: string; controlName: string; description: string; score: number };
  type RawScore = {
    currentScore: number;
    maxScore: number;
    licensedUserCount?: number;
    createdDateTime?: string;
    controlScores?: RawControlScore[];
  };
  const score = (scoreJson.value?.[0] ?? {}) as RawScore;

  type RawProfile = {
    id: string;
    title?: string;
    controlCategory?: string;
    maxScore?: number;
    remediation?: string;
    actionUrl?: string;
    tier?: string;
    implementationCost?: string;
  };
  const profiles = (profilesJson.value ?? []) as RawProfile[];
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const gaps: M365SecureScoreGap[] = (score.controlScores ?? [])
    .map((c) => {
      const profile = profileById.get(c.controlName);
      const maxScore = profile?.maxScore ?? null;
      return {
        control_name: c.controlName,
        title: profile?.title ?? c.description ?? c.controlName,
        category: profile?.controlCategory ?? c.controlCategory ?? null,
        current_score: c.score,
        max_score: maxScore,
        remediation: profile?.remediation ?? null,
        action_url: profile?.actionUrl ?? null,
        tier: profile?.tier ?? null,
        implementation_cost: profile?.implementationCost ?? null,
      };
    })
    .filter((g) => g.max_score !== null && g.current_score < g.max_score)
    .sort((a, b) => (b.max_score! - b.current_score) - (a.max_score! - a.current_score));

  return {
    summary: {
      current_score: score.currentScore,
      max_score: score.maxScore,
      licensed_user_count: score.licensedUserCount ?? null,
      score_created_date_time: score.createdDateTime ?? null,
    },
    gaps,
  };
}

export type M365UserRegistrationRow = {
  user_principal_name: string;
  user_display_name: string;
  is_admin: boolean;
  is_mfa_registered: boolean;
  is_mfa_capable: boolean;
  user_type: string | null;
};

/** Verified against Microsoft's own docs — GET
 * /reports/authenticationMethods/userRegistrationDetails, requiring
 * AuditLog.Read.All (NOT Reports.Read.All, despite living under
 * /reports — confirmed on Microsoft's own permissions table for this
 * specific operation). Not consented in any client's app registration
 * today — every call here 403s until that's added and re-consented per
 * client; callers isolate that per client rather than failing the whole
 * rollup. */
export async function fetchUserRegistrationDetails(
  customerAccessToken: string
): Promise<M365UserRegistrationRow[]> {
  const json = await graphGet(customerAccessToken, "/reports/authenticationMethods/userRegistrationDetails");
  type Raw = {
    userPrincipalName: string;
    userDisplayName: string;
    isAdmin?: boolean;
    isMfaRegistered?: boolean;
    isMfaCapable?: boolean;
    userType?: string;
  };
  return ((json.value ?? []) as Raw[]).map((u) => ({
    user_principal_name: u.userPrincipalName,
    user_display_name: u.userDisplayName,
    is_admin: u.isAdmin ?? false,
    is_mfa_registered: u.isMfaRegistered ?? false,
    is_mfa_capable: u.isMfaCapable ?? false,
    user_type: u.userType ?? null,
  }));
}

export type M365UserActivityRow = {
  user_principal_name: string;
  display_name: string;
  account_enabled: boolean;
  last_successful_sign_in: string | null;
};

/** Verified against Microsoft's own docs — signInActivity is a property on
 * /users, requiring AuditLog.Read.All (same permission as
 * userRegistrationDetails above, so a single new grant covers both this
 * and the MFA lookup). lastSuccessfulSignInDateTime (not the older
 * lastSignInDateTime, which records attempts, successful or not) is used
 * per Microsoft's own guidance for building an inactive-users report.
 * Paginated via @odata.nextLink — a real tenant's user list can exceed
 * one page. */
export async function fetchUserSignInActivity(customerAccessToken: string): Promise<M365UserActivityRow[]> {
  type Raw = {
    userPrincipalName: string;
    displayName: string;
    accountEnabled?: boolean;
    signInActivity?: { lastSuccessfulSignInDateTime?: string };
  };
  const rows: M365UserActivityRow[] = [];
  let path: string | null =
    "/users?$select=userPrincipalName,displayName,accountEnabled,signInActivity&$top=999";
  for (let page = 0; page < 20 && path; page++) {
    const json: { value?: Raw[]; "@odata.nextLink"?: string } = await graphGet(customerAccessToken, path);
    for (const u of json.value ?? []) {
      rows.push({
        user_principal_name: u.userPrincipalName,
        display_name: u.displayName,
        account_enabled: u.accountEnabled ?? true,
        last_successful_sign_in: u.signInActivity?.lastSuccessfulSignInDateTime ?? null,
      });
    }
    path = json["@odata.nextLink"] ? json["@odata.nextLink"].replace("https://graph.microsoft.com/v1.0", "") : null;
  }
  return rows;
}

export type M365PrivilegedRoleRow = {
  role_name: string;
  member_display_name: string;
  member_upn: string | null;
};

/** The classic directoryRoles API rather than the newer unified RBAC API
 * (Microsoft's docs suggest the latter, but the classic one is simpler
 * and still fully supported) — requires RoleManagement.Read.Directory.
 * A role only appears in /directoryRoles at all once at least one
 * principal has ever been assigned it, so this lists the tenant's
 * activated roles first, then only fetches members for the ones on this
 * privileged-role allowlist (not all ~30 possible roles) — both to keep
 * the call count down and because most of the other roles aren't a
 * security-relevant "who has the keys" concern the way these are. */
const PRIVILEGED_ROLE_NAMES = [
  "Global Administrator",
  "Privileged Role Administrator",
  "Privileged Authentication Administrator",
  "Security Administrator",
  "User Administrator",
  "Exchange Administrator",
  "SharePoint Administrator",
  "Application Administrator",
  "Cloud Application Administrator",
  "Authentication Administrator",
  "Conditional Access Administrator",
];

export async function fetchPrivilegedRoleAssignments(
  customerAccessToken: string
): Promise<M365PrivilegedRoleRow[]> {
  const rolesJson = await graphGet(customerAccessToken, "/directoryRoles?$select=id,displayName");
  type RawRole = { id: string; displayName: string };
  const roles = ((rolesJson.value ?? []) as RawRole[]).filter((r) => PRIVILEGED_ROLE_NAMES.includes(r.displayName));

  const rows: M365PrivilegedRoleRow[] = [];
  for (const role of roles) {
    type RawMember = { displayName?: string; userPrincipalName?: string; mail?: string };
    const membersJson = await graphGet(customerAccessToken, `/directoryRoles/${role.id}/members`);
    for (const m of (membersJson.value ?? []) as RawMember[]) {
      rows.push({
        role_name: role.displayName,
        member_display_name: m.displayName ?? "Unknown",
        member_upn: m.userPrincipalName ?? m.mail ?? null,
      });
    }
  }
  return rows;
}

export type M365MailboxUsageRow = {
  user_principal_name: string;
  display_name: string;
  storage_used_bytes: number;
  prohibit_send_receive_quota_bytes: number;
};

/** Verified against Microsoft's own docs — getMailboxUsageDetail requires
 * Reports.Read.All and, unlike every other Graph call in this file,
 * returns a 302 redirect to a CSV download rather than JSON directly.
 * fetch() follows redirects by default, so the body read here is already
 * the CSV. Period D7 (Microsoft's shortest window) is used purely to get
 * the current snapshot each column reports as-of, not to limit history —
 * mailbox size/quota are point-in-time figures, not the accumulated
 * behavior over the period the way the other D-values would suggest. */
export async function fetchMailboxUsageDetail(customerAccessToken: string): Promise<M365MailboxUsageRow[]> {
  const res = await fetch("https://graph.microsoft.com/v1.0/reports/getMailboxUsageDetail(period='D7')", {
    headers: { Authorization: `Bearer ${customerAccessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft Graph mailbox usage report failed (${res.status}): ${text}`);
  }
  const csv = await res.text();
  return parseMailboxUsageCsv(csv);
}

/** Minimal quote-aware CSV line splitter — Display Name can contain a
 * comma (e.g. "Smith, John"), so a naive split(",") would misalign
 * columns for exactly the field most likely to have one. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseMailboxUsageCsv(csv: string): M365MailboxUsageRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  const col = (name: string) => headers.indexOf(name);
  const upnCol = col("User Principal Name");
  const nameCol = col("Display Name");
  const storageCol = col("Storage Used (Byte)");
  const quotaCol = col("Prohibit Send/Receive Quota (Byte)");
  const deletedCol = col("Is Deleted");

  return lines
    .slice(1)
    .map(splitCsvLine)
    .filter((f) => f[deletedCol]?.trim().toLowerCase() !== "true")
    .map((f) => ({
      user_principal_name: f[upnCol] ?? "",
      display_name: f[nameCol] ?? "",
      storage_used_bytes: Number(f[storageCol]) || 0,
      prohibit_send_receive_quota_bytes: Number(f[quotaCol]) || 0,
    }))
    .filter((r) => r.user_principal_name);
}
