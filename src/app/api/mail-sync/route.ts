import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncMailConnection } from "@/lib/mail-sync";
import type { MailConnection } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Syncs every connected mailbox. Call this on a schedule (e.g. a Railway
 * Cron Job every 30–60 minutes) with header `X-Cron-Secret: <CRON_SECRET>`,
 * same secret as the reminders job.
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
