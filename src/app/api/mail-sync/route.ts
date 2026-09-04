import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncMailConnection } from "@/lib/mail-sync";
import type { MailConnection } from "@/lib/types";

export const dynamic = "force-dynamic";

// PAUSED 2026-09-04: a Conditional Access policy in the tenant is blocking
// token refresh for the connected mailbox (AADSTS53003), so every cron run
// was just failing anyway — paused here to stop hitting Microsoft's token
// endpoint with a doomed request every run until that's sorted out. This
// only short-circuits the CRON-triggered route; the manual "Sync now" /
// "Sync my mailbox" buttons still work normally, so it's fine to keep
// testing those. Flip this back to false once resolved.
const PAUSED = true;

/**
 * Syncs every connected mailbox. Call this on a schedule with header
 * `X-Cron-Secret: <CRON_SECRET>`, same secret as the reminders job. Each
 * run also does a full mailbox-wide scan for messages currently flagged
 * for follow-up (not just new mail), so this needs to run at least once
 * or twice a day for that to feel current — a Railway Cron Job set to
 * that cadence (e.g. every 30–60 minutes is fine too, just more often
 * than strictly needed for the flag scan specifically).
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (PAUSED) {
    return NextResponse.json({ paused: true, synced: 0, results: [] });
  }

  const admin = createAdminClient();
  const { data: connections } = await admin.from("mail_connections").select("*");

  const results = [];
  for (const connection of (connections ?? []) as MailConnection[]) {
    try {
      const result = await syncMailConnection(admin, connection);
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
