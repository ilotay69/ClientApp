import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncSharedMailboxMessages } from "@/lib/shared-mailbox-sync";

export const dynamic = "force-dynamic";

/**
 * Scans the shared recruitment mailbox (ops@cgtechnologies.com) for
 * candidate replies. Call this periodically (e.g. every 15-30 min from a
 * Railway cron trigger) with header `X-Cron-Secret: <CRON_SECRET>`.
 *
 * Unlike /api/mail-sync (paused — delegated OAuth refresh hits AADSTS53003
 * with no interactive user present), this uses app-only Graph auth with no
 * refresh token at all, so it's safe to run unattended on a normal cadence.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  try {
    const result = await syncSharedMailboxMessages(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("candidate-messages-sync failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Sync failed." },
      { status: 500 }
    );
  }
}
