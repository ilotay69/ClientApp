import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal";
import { readPortalFilters } from "@/lib/portal-filters";
import { fetchHuntressSection, huntressAgentIsStale } from "@/lib/portal-sections";
import { PortalPageHeader, PortalCard, StatCard, EmptyRow } from "@/components/portal-ui";
import { PortalFilterBar } from "@/components/portal-filter-bar";
import { PortalUnavailable } from "@/components/portal-unavailable";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PortalHuntressPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preview = typeof params.preview === "string" ? params.preview : undefined;
  const session = await requirePortalSession(preview, "huntress");
  if (!session) redirect("/portal");

  const filters = readPortalFilters("huntress", params);
  const { rows, totalBeforeFilter, unavailableReason, facets } = await fetchHuntressSection(
    session,
    filters
  );

  const stale = rows.filter(huntressAgentIsStale).length;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="Endpoint Protection"
        subtitle="Managed detection and response agents running on your endpoints."
        isPreview={session.isPreview}
      />

      {unavailableReason ? (
        <PortalUnavailable>{unavailableReason}</PortalUnavailable>
      ) : (
        <>
          <PortalFilterBar
            section="huntress"
            searchPlaceholder="Search endpoints…"
            downloads={{ csv: true, pdf: false }}
            resultLabel={`${rows.length} of ${totalBeforeFilter} endpoints`}
            selects={[
              {
                key: "status",
                label: "Reporting",
                options: [
                  { value: "healthy", label: "Checked in recently" },
                  { value: "stale", label: "Not seen in over a week" },
                ],
              },
              { key: "platform", label: "Platform", options: facets.platform ?? [] },
            ]}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label="Protected endpoints" value={String(rows.length)} hint="running managed EDR" />
            <StatCard
              label="Reporting normally"
              value={String(rows.length - stale)}
              hint={stale > 0 ? `${stale} not seen in over a week` : "all agents checked in"}
              tone={stale > 0 ? "warn" : "good"}
            />
          </div>

          <PortalCard title="Protected endpoints">
            {rows.length === 0 ? (
              <EmptyRow>No endpoints match these filters.</EmptyRow>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Endpoint</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Operating system</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Agent</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Defender</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Firewall</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Last check-in</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((a) => (
                      <tr key={a.id}>
                        <td className="px-5 py-2 font-medium text-slate-900">{a.hostname}</td>
                        <td className="px-5 py-2 text-slate-600">{a.os ?? a.platform ?? "—"}</td>
                        <td className="px-5 py-2 text-slate-600">
                          {[a.version, a.edrVersion].filter(Boolean).join(" / ") || "—"}
                        </td>
                        <td className="px-5 py-2 text-slate-600">{a.defenderStatus ?? "—"}</td>
                        <td className="px-5 py-2 text-slate-600">{a.firewallStatus ?? "—"}</td>
                        <td className="px-5 py-2 text-slate-600">
                          {a.lastCallbackAt ? formatDate(a.lastCallbackAt) : "—"}
                          {huntressAgentIsStale(a) && (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                              Stale
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PortalCard>
        </>
      )}
    </div>
  );
}
