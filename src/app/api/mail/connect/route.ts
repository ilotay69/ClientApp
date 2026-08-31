import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl } from "@/lib/microsoft-graph";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "mail_connect_state";

/**
 * Starts the "connect my mailbox" flow — separate from login. Requesting
 * Mail.Read here (rather than on the login button) keeps the login prompt
 * from looking like it wants access to your email just to sign you in.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Built from NEXT_PUBLIC_APP_URL rather than request.url — behind
  // Railway's proxy, request.url can resolve to the container's internal
  // address (e.g. localhost:8080) instead of the public domain, which
  // Microsoft then rejects as a redirect_uri mismatch.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

  if (!user) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }

  const state = crypto.randomUUID();
  const redirectUri = new URL("/api/mail/callback", appUrl).toString();
  const authorizeUrl = buildAuthorizeUrl(redirectUri, state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
