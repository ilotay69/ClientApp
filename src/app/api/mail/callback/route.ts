import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, fetchMailboxEmail } from "@/lib/microsoft-graph";
import { resolveAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "mail_connect_state";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = resolveAppUrl(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;

  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/settings/mail?error=${encodeURIComponent(reason)}`);

  if (!code || !state || !expectedState || state !== expectedState) {
    return fail("Mailbox connection failed — the request expired or was tampered with. Try again.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  try {
    const redirectUri = new URL("/api/mail/callback", origin).toString();
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const mailboxEmail = await fetchMailboxEmail(tokens.access_token);

    const admin = createAdminClient();
    await admin.from("mail_connections").upsert({
      user_id: user.id,
      mailbox_email: mailboxEmail,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      connected_at: new Date().toISOString(),
    });

    const response = NextResponse.redirect(`${origin}/settings/mail?connected=1`);
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (err) {
    console.error("Mailbox connection failed", err);
    return fail("Mailbox connection failed — please try again.");
  }
}
