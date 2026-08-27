import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateSuggestions } from "@/lib/suggestions";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Generates AI suggestions for clients with recent email activity. Call this
 * on a schedule (e.g. a Railway Cron Job, once or twice a day) with header
 * `X-Cron-Secret: <CRON_SECRET>` — same secret as the other background jobs.
 * Run mail-sync first so there's fresh email data to work from.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  }

  const admin = createAdminClient();
  const result = await generateSuggestions(admin);
  return NextResponse.json(result);
}
