import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchLicenseSummaryForTenant, fetchSecureScoreGapsForTenant } from "@/lib/m365-partner";
import { getM365PartnerSettings, getCustomerScopedToken } from "@/lib/m365-partner-settings";

export const dynamic = "force-dynamic";

/**
 * Syncs Microsoft 365 license usage for every client with a mapped
 * m365_tenant_id. Call this on a schedule (e.g. a Railway Cron Job) with
 * header `X-Cron-Secret: <CRON_SECRET>`, same secret as the other sync
 * jobs.
 *
 * Unlike the Autotask/NinjaOne sync routes, clients here MUST be processed
 * strictly sequentially (a plain for...of, no Promise.all) — each
 * cross-tenant token exchange rotates the one shared refresh token, so a
 * concurrent exchange for a different client would race against it and
 * fail (or worse, invalidate a token another in-flight request still
 * needed).
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const settings = await getM365PartnerSettings(admin);
  if (!settings?.refreshToken) {
    return NextResponse.json({ error: "Microsoft 365 isn't connected yet." }, { status: 400 });
  }

  const { data: clients } = await admin
    .from("clients")
    .select("id, m365_tenant_id")
    .not("m365_tenant_id", "is", null);

  const results = [];
  for (const client of clients ?? []) {
    try {
      const customerToken = await getCustomerScopedToken(
        admin,
        settings,
        client.m365_tenant_id as string
      );
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
