import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncAllAutotaskClients } from "@/lib/autotask-sync";

export const dynamic = "force-dynamic";

/**
 * Syncs open Autotask tickets, contract services, and Project-SLA
 * projects for every client with a mapped autotask_company_id. Call this
 * on a schedule (e.g. a Railway Cron Job) with header
 * `X-Cron-Secret: <CRON_SECRET>`, same secret as mail-sync. Same
 * replace-on-sync logic the manual "Sync Autotask" button on the
 * Projects page uses (syncAllAutotaskClients) — this route just adds the
 * cron auth and JSON response shape around it.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await syncAllAutotaskClients(admin);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
