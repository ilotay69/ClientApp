import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { resolveReportData, type ReportKey } from "@/app/(dashboard)/reports/actions";
import { buildGenericReportPdf, reportPdfResponse } from "@/lib/report-pdf";

export const dynamic = "force-dynamic";

/** One shared PDF download for every report in the catalog, driven by
 * ?key= - a table dump of the same full ReportData the report's own CSV
 * route builds (see resolveReportData), rather than a bespoke PDF per
 * report. ?title= is just display text for the PDF's own heading, passed
 * straight from the report definition the browser already has - nothing
 * sensitive, so a tampered value only mislabels someone's own download. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in.", { status: 401 });
  if (!(await hasPermission(supabase, "view_team_wide"))) {
    return new Response("You don't have permission to do that.", { status: 403 });
  }

  const key = request.nextUrl.searchParams.get("key") as ReportKey | null;
  if (!key) return new Response("Missing report key.", { status: 400 });
  const title = request.nextUrl.searchParams.get("title") || key;

  const data = await resolveReportData(key);
  if ("error" in data) return new Response(data.error, { status: 400 });

  const pdf = await buildGenericReportPdf(title, data);
  const filename = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
  return reportPdfResponse(filename, pdf);
}
