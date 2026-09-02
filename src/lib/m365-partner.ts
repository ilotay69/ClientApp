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
