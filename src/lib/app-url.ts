/**
 * Resolves the app's public base URL — prefer NEXT_PUBLIC_APP_URL (needed
 * because request.url can resolve to a reverse proxy's internal address,
 * e.g. Railway's localhost:8080, instead of the public domain), but never
 * let a malformed value (missing "https://", stray whitespace) throw and
 * crash the route — fall back to the request's own origin instead.
 *
 * `requestUrl` is optional so this can also be called from a Server
 * Action (e.g. sign-up), which has no `request.url` to fall back to —
 * those callers rely on NEXT_PUBLIC_APP_URL alone, which is the
 * preferred source anyway.
 */
export function resolveAppUrl(requestUrl?: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    const withScheme = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
    try {
      return new URL(withScheme).origin;
    } catch {
      // fall through
    }
  }
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      // fall through
    }
  }
  return "http://localhost:3000";
}
