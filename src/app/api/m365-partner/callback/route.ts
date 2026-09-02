import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { exchangePartnerCodeForTokens, fetchSignedInUpn } from "@/lib/m365-partner";
import { getM365PartnerSettings } from "@/lib/m365-partner-settings";
import { resolveAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "m365_partner_connect_state";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = resolveAppUrl(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;

  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/settings/integrations?error=${encodeURIComponent(reason)}`);

  if (!code || !state || !expectedState || state !== expectedState) {
    return fail("Microsoft 365 connection failed — the request expired or was tampered with. Try again.");
  }

  const admin = createAdminClient();
  const settings = await getM365PartnerSettings(admin);
  if (!settings) {
    return fail("Save the Client ID/Secret/Tenant ID before connecting.");
  }

  try {
    const redirectUri = new URL("/api/m365-partner/callback", origin).toString();
    const tokens = await exchangePartnerCodeForTokens(settings.credentials, code, redirectUri);
    const upn = await fetchSignedInUpn(tokens.access_token);

    await admin
      .from("m365_partner_settings")
      .update({
        cached_refresh_token: tokens.refresh_token,
        obo_user_hint: upn,
        connected_at: new Date().toISOString(),
      })
      .eq("id", true);

    const response = NextResponse.redirect(`${origin}/settings/integrations?connected=m365`);
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (err) {
    console.error("Microsoft 365 partner connection failed", err);
    return fail(err instanceof Error ? err.message : "Microsoft 365 connection failed — please try again.");
  }
}
