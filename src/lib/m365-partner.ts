// Microsoft 365 partner (CSP/GDAP) helpers. No SDK — plain fetch, mirroring
// the style of microsoft-graph.ts, but this is a SEPARATE Azure AD app
// registration (multitenant) from the one used for the mailbox feature —
// different scopes, different token lifecycle.
//
// GDAP does not support pure app-only (client-credentials) access for
// third-party apps (verified against Microsoft's own migration guide) —
// the supported pattern is "multitenant app + user + OBO": a one-time
// interactive sign-in produces a refresh token, which is then exchanged
// PER CUSTOMER TENANT to get access scoped there. Each exchange rotates
// the refresh token — callers MUST persist the new one immediately, and
// exchanges into different tenants must happen sequentially, never
// concurrently, or a rotated-out token gets reused and fails.

export type M365PartnerCredentials = {
  partnerTenantId: string;
  clientId: string;
  clientSecret: string;
};

const SCOPES =
  "offline_access LicenseAssignment.Read.All SecurityEvents.Read.All DelegatedAdminRelationship.Read.All";

function authority(tenantId: string) {
  return `https://login.microsoftonline.com/${tenantId}`;
}

// A refresh token minted without this claim can fail later with
// AADSTS50076 ("you must use multi-factor authentication") the first time
// it's exchanged into a CUSTOMER tenant whose own Conditional Access
// policy requires MFA for Graph access — even though the original sign-in
// already completed MFA. Requesting this claim explicitly up front makes
// the resulting refresh token carry a strong-enough MFA claim to satisfy
// any such tenant later, instead of failing per-tenant.
const MFA_CLAIMS = JSON.stringify({ access_token: { acr: { essential: true, value: "urn:microsoft:policies:mfa" } } });

export function buildPartnerAuthorizeUrl(
  creds: M365PartnerCredentials,
  redirectUri: string,
  state: string
) {
  const url = new URL(`${authority(creds.partnerTenantId)}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", creds.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("claims", MFA_CLAIMS);
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

async function requestToken(tenantId: string, creds: M365PartnerCredentials, params: Record<string, string>) {
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: SCOPES,
    ...params,
  });

  const res = await fetch(`${authority(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft 365 partner token request failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

/** Initial code exchange, against the PARTNER's own tenant (where the OBO
 * user signed in). */
export async function exchangePartnerCodeForTokens(
  creds: M365PartnerCredentials,
  code: string,
  redirectUri: string
) {
  return requestToken(creds.partnerTenantId, creds, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
}

export type TenantScopedToken = { accessToken: string; refreshToken: string; expiresAt: string };

/** The cross-tenant exchange that makes GDAP work: the SAME refresh token,
 * exchanged against a specific tenant's own token endpoint, yields an
 * access token scoped to that tenant — but only because of the GDAP
 * relationship, role assignment, and app consent already in place there.
 * Returns a ROTATED refresh token that the caller must persist before
 * doing anything else, and callers must never run this concurrently for
 * different tenants (the old refresh token stops working once rotated). */
export async function exchangeRefreshTokenForTenant(
  creds: M365PartnerCredentials,
  refreshToken: string,
  targetTenantId: string
): Promise<TenantScopedToken> {
  const tokens = await requestToken(targetTenantId, creds, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
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

export async function fetchSignedInUpn(accessToken: string): Promise<string> {
  const json = await graphGet(accessToken, "/me?$select=userPrincipalName");
  return json.userPrincipalName ?? "unknown";
}

export type M365Customer = { tenantId: string; displayName: string };

/** Lists the partner's GDAP customer tenants — called with a token scoped
 * to the PARTNER's own tenant (not a customer-scoped one). No confirmed
 * name-search query param usage here (consistent with this app's
 * established defensive approach elsewhere), so this fetches a page and
 * filters client-side. */
export async function listDelegatedAdminCustomers(
  accessToken: string,
  nameQuery: string
): Promise<M365Customer[]> {
  const json = await graphGet(accessToken, "/tenantRelationships/delegatedAdminCustomers?$top=300");
  const customers = (json.value ?? []) as { tenantId: string; displayName: string }[];
  const needle = nameQuery.toLowerCase();
  return customers
    .filter((c) => c.displayName?.toLowerCase().includes(needle))
    .map((c) => ({ tenantId: c.tenantId, displayName: c.displayName }));
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
