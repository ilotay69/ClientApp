import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions, isStaffRole } from "@/lib/permissions";
import { buildAuthorizeUrl } from "@/lib/microsoft-graph";
import { resolveAppUrl } from "@/lib/app-url";

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

  const appUrl = resolveAppUrl(request.url);

  if (!user) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }

  // Staff only. Routes under /api are exempt from the auth gate in
  // src/lib/supabase/middleware.ts, so this is the only check there is — and
  // without it a client-portal login could connect their own mailbox, which
  // would then get ingested into CG's database and run through CG's AI
  // provider on CG's bill by the mailbox-review actions.
  const me = await getMyPermissions(supabase);
  if (!isStaffRole(me?.role)) {
    return NextResponse.redirect(new URL("/", appUrl));
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
