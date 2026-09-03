import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { syncTimeEntriesForDate } from "@/lib/time-entry-sync";
import { ymd } from "@/lib/resource-hours";

export const dynamic = "force-dynamic";

/**
 * Persists yesterday's Autotask time entries (or a specific date via
 * ?date=YYYY-MM-DD) into autotask_time_entries — accumulating history for
 * later analysis, unlike this app's other Autotask syncs, which just
 * cache Autotask's current state. Call this daily (e.g. a Railway Cron
 * Job) with header `X-Cron-Secret: <CRON_SECRET>`, same secret as
 * mail-sync/autotask-sync. Runs one plain calendar day at a time,
 * weekends included — an empty weekend sync is harmless, and running
 * daily means no day is ever skipped or needs backfilling.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return NextResponse.json({ error: "Autotask isn't configured yet." }, { status: 400 });
  }

  const requestedDate = request.nextUrl.searchParams.get("date");
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateStr = requestedDate ?? ymd(yesterday);

  try {
    const result = await syncTimeEntriesForDate(admin, settings.credentials, settings.zoneUrl, dateStr);
    return NextResponse.json({ date: dateStr, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed." },
      { status: 500 }
    );
  }
}
