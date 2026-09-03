import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { syncTimeEntriesInRange } from "@/lib/time-entry-sync";
import { ymd } from "@/lib/resource-hours";

export const dynamic = "force-dynamic";

/**
 * Persists Autotask time entries into autotask_time_entries — accumulating
 * history for later analysis, unlike this app's other Autotask syncs,
 * which just cache Autotask's current state. Defaults to yesterday (plain
 * calendar day); pass ?since=YYYY-MM-DD (and optionally &until=YYYY-MM-DD,
 * defaulting to today) for a wider one-off backfill. Call this daily
 * (e.g. a Railway Cron Job) with header `X-Cron-Secret: <CRON_SECRET>`,
 * same secret as mail-sync/autotask-sync — the daily case runs one plain
 * calendar day at a time, weekends included, so no day is ever skipped or
 * needs backfilling.
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

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const sinceStr = request.nextUrl.searchParams.get("since") ?? ymd(yesterday);
  const untilStr = request.nextUrl.searchParams.get("until") ?? ymd(yesterday);

  try {
    const result = await syncTimeEntriesInRange(
      admin,
      settings.credentials,
      settings.zoneUrl,
      sinceStr,
      untilStr
    );
    return NextResponse.json({ since: sinceStr, until: untilStr, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed." },
      { status: 500 }
    );
  }
}
