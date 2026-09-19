import { NextRequest } from "next/server";
import { requirePortalSession } from "@/lib/portal";
import { PORTAL_PAGE_KEYS, type PortalPageKey } from "@/lib/portal-roles";
import { readPortalFilters } from "@/lib/portal-filters";
import { buildPortalExport } from "@/lib/portal-sections";
import { toCsv, csvResponse } from "@/lib/csv";
import { buildGenericReportPdf, reportPdfResponse } from "@/lib/report-pdf";

export const dynamic = "force-dynamic";

/**
 * Every portal download, for every section, in both formats.
 *
 * The important part is the guard: requirePortalSession(preview, section)
 * is the SAME call the corresponding page makes, so a client who cannot
 * open a section cannot download it either. Route handlers run completely
 * independently of any page or layout render — a section hidden from the
 * nav is not hidden from a hand-typed URL — so this check is not a
 * duplicate of the page's, it is the only thing standing here.
 *
 * `section` is validated against PORTAL_PAGE_KEYS before it reaches
 * requirePortalSession, so an unknown value can't be smuggled past a
 * permission lookup that would simply find no matching grant.
 *
 * Filters arrive as the same query string the page was showing, and are
 * re-read through the same readPortalFilters allow-list, so the file
 * contains exactly the rows that were on screen.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const sectionParam = params.get("section") ?? "";
  if (!(PORTAL_PAGE_KEYS as readonly string[]).includes(sectionParam)) {
    return new Response("Unknown section.", { status: 400 });
  }
  const section = sectionParam as PortalPageKey;

  const format = params.get("format") === "pdf" ? "pdf" : "csv";
  const preview = params.get("preview") ?? undefined;

  // Redirects (to /login, /portal, the MFA screens) for anything that isn't
  // a usable session for THIS section. A staff member with no ?preview=
  // gets null, same as the pages.
  const session = await requirePortalSession(preview, section);
  if (!session) return new Response("Not available.", { status: 403 });

  const filters = readPortalFilters(
    section,
    Object.fromEntries([...params.entries()].map(([k, v]) => [k, v]))
  );

  const built = await buildPortalExport(session, section, filters);
  if ("error" in built) return new Response(built.error, { status: 400 });

  const slug = `${session.client.clientName}-${section}`
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  if (format === "pdf") {
    return reportPdfResponse(`${slug}.pdf`, await buildGenericReportPdf(built.title, built.data));
  }
  return csvResponse(`${slug}.csv`, toCsv(built.data.headers, built.data.rows));
}
