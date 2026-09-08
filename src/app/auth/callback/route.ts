import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

/**
 * Supabase redirects here after a "Sign in with Microsoft" login, and now
 * also after a client-portal password reset (see sendPortalPasswordReset).
 * This just exchanges the auth code for a session — it has nothing to do
 * with mailbox access (see /api/mail/callback for that separate,
 * narrower-scoped flow).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // resolveAppUrl(request.url), NOT `new URL(request.url).origin` — Railway's
  // reverse proxy can present the incoming request internally as
  // localhost:8080 rather than the public domain (documented at the top of
  // app-url.ts), and this route redirecting to that internal address is
  // exactly what surfaced as "https://localhost:8080/login?error=oauth_failed"
  // for the password-reset flow. Every other route that builds a redirect
  // target here (/api/mail/connect, /api/mail/callback) already goes through
  // resolveAppUrl() for this reason — this one just hadn't been updated yet.
  const origin = resolveAppUrl(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
