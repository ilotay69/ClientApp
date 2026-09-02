import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchLicenseSummaryForTenant, fetchSecureScoreGapsForTenant } from "@/lib/m365-partner";
import { getM365ClientSettings, getValidM365Token } from "@/lib/m365-client-credentials";

export const dynamic = "force-dynamic";

/**
 * Syncs Microsoft 365 license usage and Secure Score gaps for every client
 * with its own credentials saved. Call this on a schedule (e.g. a Railway
 * Cron Job) with header `X-Cron-Secret: <CRON_SECRET>`, same secret as the
 * other sync jobs.
 *
 * Each client has fully independent credentials (its own app registration,
 * its own tenant) — no shared token to rotate, so clients are processed
 * one after another for simplicity, but there's no correctness requirement
 * to keep it sequential the way the old GDAP design had.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: clients } = await admin
    .from("clients")
    .select("id")
    .not("m365_tenant_id", "is", null);

  const results = [];
  for (const client of clients ?? []) {
    try {
      const settings = await getM365ClientSettings(admin, client.id);
      if (!settings) {
        results.push({ clientId: client.id, error: "No credentials saved for this client." });
        continue;
      }

      const customerToken = await getValidM365Token(admin, client.id, settings);
      const licenses = await fetchLicenseSummaryForTenant(customerToken);

      await admin.from("m365_license_summary").delete().eq("client_id", client.id);
      if (licenses.length > 0) {
        await admin.from("m365_license_summary").insert(
          licenses.map((l) => ({ ...l, client_id: client.id }))
        );
      }

      const { summary, gaps } = await fetchSecureScoreGapsForTenant(customerToken);
      await admin.from("m365_secure_score").upsert({ ...summary, client_id: client.id });
      await admin.from("m365_secure_score_gaps").delete().eq("client_id", client.id);
      if (gaps.length > 0) {
        await admin.from("m365_secure_score_gaps").insert(
          gaps.map((g) => ({ ...g, client_id: client.id }))
        );
      }

      results.push({ clientId: client.id, skus: licenses.length, secureScoreGaps: gaps.length });
    } catch (err) {
      results.push({
        clientId: client.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ synced: results.length, results });
}
