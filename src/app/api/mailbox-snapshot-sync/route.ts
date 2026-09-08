import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncMailboxSnapshot } from "@/lib/mailbox-snapshot";
import type { MailConnection } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Syncs every connected mailbox's local snapshot (see mailbox-snapshot.ts).
 * Call this on a schedule with header `X-Cron-Secret: <CRON_SECRET>`, same
 * secret as the other cron jobs — a Railway Cron Job set to every 30
 * minutes matches what the mailbox review assumes when it shows "last
 * synced" to the user.
 *
 * Important: this needs the exact same token refresh path
 * (getValidAccessToken) that /api/mail-sync's cron already uses, and that
 * job is currently PAUSED because a tenant Conditional Access policy
 * blocks unattended/background token refresh (AADSTS53003) — see the
 * comment in that route. This route is deliberately NOT pre-paused (the
 * policy may only affect that specific connection, or may have since
 * changed), but if this cron starts failing with the same AADSTS53003
 * error, that's a tenant-side Conditional Access setting to fix, not a
 * bug in this code — reconnecting the mailbox will not fix it.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: connections } = await admin.from("mail_connections").select("*");

  const results = [];
  for (const connection of (connections ?? []) as MailConnection[]) {
    try {
      const result = await syncMailboxSnapshot(admin, connection);
      results.push({ mailbox: connection.mailbox_email, ...result });
    } catch (err) {
      results.push({
        mailbox: connection.mailbox_email,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ synced: results.length, results });
}
