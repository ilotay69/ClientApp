import { fetchAppOnlyGraphToken } from "@/lib/microsoft-graph";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type SharedMailboxSettings = {
  mailboxEmail: string | null;
  cachedAccessToken: string | null;
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  lastSyncErrorAt: string | null;
};

/** mailboxEmail comes from the SHARED_MAILBOX_EMAIL env var, not a DB
 * column — one source of truth for which mailbox every Graph call actually
 * targets, rather than a stored value that could drift out of sync with it. */
export async function getSharedMailboxSettings(admin: Admin): Promise<SharedMailboxSettings | null> {
  const { data } = await admin
    .from("shared_mailbox_settings")
    .select("cached_access_token, token_expires_at, last_synced_at, last_sync_error, last_sync_error_at")
    .eq("id", true)
    .maybeSingle();
  if (!data) return null;

  return {
    mailboxEmail: process.env.SHARED_MAILBOX_EMAIL ?? null,
    cachedAccessToken: data.cached_access_token,
    tokenExpiresAt: data.token_expires_at,
    lastSyncedAt: data.last_synced_at,
    lastSyncError: data.last_sync_error,
    lastSyncErrorAt: data.last_sync_error_at,
  };
}

const REFRESH_BUFFER_MS = 60_000;

/** Returns a valid app-only bearer token, minting (and caching, on the
 * singleton settings row) a new one only when the cached one is missing or
 * close to expiry — same caching shape as getValidM365Token. No
 * refresh-token complexity: an app-only token is always freely re-mintable
 * from the same client secret, so there's nothing to rotate or invalidate. */
export async function getValidSharedMailboxToken(
  admin: Admin,
  settings: SharedMailboxSettings
): Promise<string> {
  if (settings.cachedAccessToken && settings.tokenExpiresAt) {
    const expiresAt = new Date(settings.tokenExpiresAt).getTime();
    if (Date.now() < expiresAt - REFRESH_BUFFER_MS) {
      return settings.cachedAccessToken;
    }
  }

  const { accessToken, expiresAt } = await fetchAppOnlyGraphToken();
  await admin
    .from("shared_mailbox_settings")
    .update({ cached_access_token: accessToken, token_expires_at: expiresAt })
    .eq("id", true);

  return accessToken;
}

/** Clears any previously-recorded sync error — called on a successful
 * sync/send so a resolved problem doesn't keep showing as a stale red
 * banner in Settings → Integrations. */
export async function clearSharedMailboxSyncError(admin: Admin): Promise<void> {
  await admin
    .from("shared_mailbox_settings")
    .update({ last_sync_error: null, last_sync_error_at: null })
    .eq("id", true);
}

export async function recordSharedMailboxSyncError(admin: Admin, message: string): Promise<void> {
  await admin
    .from("shared_mailbox_settings")
    .update({ last_sync_error: message, last_sync_error_at: new Date().toISOString() })
    .eq("id", true);
}
