// Minimal FortiCloud (Fortinet) IAM API client — no SDK, same plain-fetch
// style as autotask.ts/ninjaone.ts/huntress.ts/bitdefender.ts/wizer.ts/
// nordlayer.ts. Verified directly against Fortinet's own official
// documentation library (docs.fortinet.com), which — unlike the JS-
// rendered vendor doc sites hit for NinjaOne/Huntress/Bitdefender — was
// plain fetchable.
//
// Auth is OAuth2 "password" grant against a fixed, account-independent
// token endpoint: each FortiCloud IAM API user has its own username/
// password/client_id (the "client_id" here is Fortinet's own FortiCloud
// *service* identifier, e.g. "iam" or "assetmanagement" — not to be
// confused with this app's own `clients` table). Unlike NinjaOne/M365/
// Autotask, there's no per-tenant/per-org hierarchy to enumerate here —
// FortiCloud has no MSP-partner "list every company under this account"
// concept the way Bitdefender/Wizer/NordLayer do. That's exactly why this
// integration is modeled as a repeatable list of independent accounts
// (see supabase/053_forticloud_integration.sql) instead of one shared
// settings row: each FortiCloud account (CG-owned or a client's own) is
// its own island, with its own credentials and its own token.
import { assertAsciiHeaderValue } from "@/lib/ascii-check";

export type ForticloudCredentials = {
  apiUser: string;
  apiPassword: string;
};

const TOKEN_URL = "https://customerapiauth.fortinet.com/api/v1/oauth/token/";

export type ForticloudToken = { accessToken: string; refreshToken: string; expiresAt: string };

/** Mints a new access token via the OAuth2 "password" grant, scoped to
 * one FortiCloud service ("iam" is the general-purpose one used for the
 * connection test here). */
export async function fetchForticloudToken(
  creds: ForticloudCredentials,
  service = "iam"
): Promise<ForticloudToken> {
  assertAsciiHeaderValue(creds.apiUser, "FortiCloud API user");
  assertAsciiHeaderValue(creds.apiPassword, "FortiCloud API password");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: creds.apiUser,
      password: creds.apiPassword,
      client_id: service,
      grant_type: "password",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FortiCloud token request failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  if (json.status !== "success" || !json.access_token) {
    throw new Error(`FortiCloud token request did not succeed: ${json.message ?? "unknown error"}`);
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
  };
}

/** Refreshes a token without re-sending the password — mirrors the
 * cached-token-refresh pattern used by getValidNinjaOneToken/
 * getValidM365Token, just with FortiCloud's own refresh_token grant. */
export async function refreshForticloudToken(
  refreshToken: string,
  service = "iam"
): Promise<ForticloudToken> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", client_id: service, refresh_token: refreshToken }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FortiCloud token refresh failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  if (json.status !== "success" || !json.access_token) {
    throw new Error(`FortiCloud token refresh did not succeed: ${json.message ?? "unknown error"}`);
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
  };
}

/** Confirms the credentials actually work — mints a fresh token for the
 * "iam" service, which is the cheapest possible authenticated proof (the
 * token mint itself is the auth check; there's no separate "whoami" call
 * needed). */
export async function testForticloudConnection(
  creds: ForticloudCredentials
): Promise<{ ok: boolean; error?: string }> {
  try {
    await fetchForticloudToken(creds, "iam");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

const ASSET_MGMT_HOST = "https://support.fortinet.com/ES/api/registration/v3";

export type ForticloudEntitlement = {
  type: string | null;
  levelDescription: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type ForticloudProduct = {
  serialNumber: string;
  productModel: string;
  registrationDate: string | null;
  isDecommissioned: boolean;
  description: string | null;
  productModelEoS: string | null;
  entitlements: ForticloudEntitlement[];
};

/** Every registered device (hardware or virtual) on this FortiCloud
 * account, with its support/license entitlements and hardware End-of-
 * Support date — confirmed against Fortinet's own FortiCare Registration
 * API v3 client library (POST /products/list on
 * support.fortinet.com/ES/api/registration/v3, a different host entirely
 * from the OAuth token endpoint). Needs a token minted for the
 * "assetmanagement" service specifically, not "iam" — a token scoped to
 * the wrong service is a real, separate failure mode from bad
 * credentials. `expireBefore` is actually an entitlement-expiration
 * filter, not a no-op — Fortinet's own client library passes "now + 100
 * years" to mean "don't filter anything out," which this mirrors, since
 * the point here is the full inventory, not a pre-filtered one. */
export async function fetchForticloudProducts(creds: ForticloudCredentials): Promise<ForticloudProduct[]> {
  const token = await fetchForticloudToken(creds, "assetmanagement");
  const expireBefore = new Date();
  expireBefore.setFullYear(expireBefore.getFullYear() + 100);

  const res = await fetch(`${ASSET_MGMT_HOST}/products/list`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ serialNumber: null, expireBefore: expireBefore.toISOString() }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FortiCloud products request failed (${res.status}): ${text}`);
  }

  type RawEntitlement = { type?: string; levelDesc?: string; startDate?: string; endDate?: string };
  type RawAsset = {
    serialNumber: string;
    productModel: string;
    registrationDate?: string;
    isDecommissioned?: boolean;
    description?: string;
    productModelEoS?: string;
    entitlements?: RawEntitlement[];
  };
  const json = (await res.json()) as { error?: string; message?: string; assets?: RawAsset[] };
  if (json.error && !json.assets) {
    throw new Error(`FortiCloud products request did not succeed: ${json.message ?? json.error}`);
  }

  return (json.assets ?? []).map((a) => ({
    serialNumber: a.serialNumber,
    productModel: a.productModel,
    registrationDate: a.registrationDate ?? null,
    isDecommissioned: a.isDecommissioned ?? false,
    description: a.description ?? null,
    productModelEoS: a.productModelEoS ?? null,
    entitlements: (a.entitlements ?? []).map((e) => ({
      type: e.type ?? null,
      levelDescription: e.levelDesc ?? null,
      startDate: e.startDate ?? null,
      endDate: e.endDate ?? null,
    })),
  }));
}
