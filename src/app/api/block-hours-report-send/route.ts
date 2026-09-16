import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendBlockHoursUsageReports } from "@/lib/block-hours-report-send";

export const dynamic = "force-dynamic";

/**
 * Sends the Block of Hours Usage Report to every client on the
 * subscription list (Settings -> Integrations -> Notifications -> Block
 * of Hours Usage Report) — point a Railway cron trigger at this with
 * header `X-Cron-Secret: <CRON_SECRET>`, at whatever cadence you want the
 * report sent (e.g. monthly, on the 1st). This route has no "already sent
 * this period" guard of its own — the cron's own schedule IS the cadence,
 * same posture as every other cron in this app.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await sendBlockHoursUsageReports(admin);
  return NextResponse.json(result);
}
