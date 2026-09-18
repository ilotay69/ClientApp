import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { fetchContractUsageForCompany } from "@/lib/contract-hours";
import { buildContractUsagePdf } from "@/lib/contract-usage-pdf";

export const dynamic = "force-dynamic";

/**
 * Generates the Contract Usage report as a standalone PDF, fresh from
 * Autotask every time (nothing stored) — for handing to a client directly,
 * same posture as the quarterly review PDF preview route: live data, no
 * persisted copy of this one.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  if (!(await requirePermission("view_lookups"))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { clientId } = await params;
  const admin = createAdminClient();

  const { data: client } = await admin
    .from("clients")
    .select("name, autotask_company_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client?.autotask_company_id) {
    return NextResponse.json({ error: "This client isn't linked to an Autotask company yet." }, { status: 404 });
  }

  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return NextResponse.json(
      { error: "Autotask isn't connected yet — set it up under Settings → Integrations." },
      { status: 400 }
    );
  }

  try {
    const rows = await fetchContractUsageForCompany(
      admin,
      settings.credentials,
      settings.zoneUrl,
      client.autotask_company_id
    );
    const pdf = await buildContractUsagePdf(client.name, rows);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${client.name.replace(/[^a-z0-9]+/gi, "-")}-contract-usage.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
