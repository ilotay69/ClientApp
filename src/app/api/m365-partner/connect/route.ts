import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { buildPartnerAuthorizeUrl } from "@/lib/m365-partner";
import { getM365PartnerSettings } from "@/lib/m365-partner-settings";
import { resolveAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "m365_partner_connect_state";

/** Starts the one-time interactive OBO sign-in — the OBO admin account
 * signs in here (MFA required), consenting to the scopes this app
 * requested, producing the refresh token everything else depends on. */
export async function GET(request: NextRequest) {
  const appUrl = resolveAppUrl(request.url);
  const supabase = await createClient();

  if (!(await hasPermission(supabase, "manage_integrations"))) {
    return NextResponse.redirect(new URL("/dashboard", appUrl));
  }

  const admin = createAdminClient();
  const settings = await getM365PartnerSettings(admin);
  if (!settings) {
    return NextResponse.redirect(
      new URL("/settings/integrations?error=Save+the+Client+ID%2FSecret%2FTenant+ID+first", appUrl)
    );
  }

  const state = crypto.randomUUID();
  const redirectUri = new URL("/api/m365-partner/callback", appUrl).toString();
  const authorizeUrl = buildPartnerAuthorizeUrl(settings.credentials, redirectUri, state);

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
