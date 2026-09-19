import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal";
import { readPortalFilters } from "@/lib/portal-filters";
import { fetchFortigateSection } from "@/lib/portal-sections";
import { PortalPageHeader, PortalCard, StatCard, EmptyRow } from "@/components/portal-ui";
import { PortalFilterBar } from "@/components/portal-filter-bar";
import { PortalUnavailable } from "@/components/portal-unavailable";
import { formatDate, humanizeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

function SupportPill({ status }: { status: string }) {
  const tone =
    status === "expired"
      ? "bg-red-100 text-red-700"
      : status === "expiring_soon"
        ? "bg-amber-100 text-amber-700"
        : status === "active"
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {humanizeLabel(status)}
    </span>
  );
}

export default async function PortalFortigatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preview = typeof params.preview === "string" ? params.preview : undefined;
  const session = await requirePortalSession(preview, "fortigate");
  if (!session) redirect("/portal");

  const filters = readPortalFilters("fortigate", params);
  const { rows, totalBeforeFilter, unavailableReason, facets } = await fetchFortigateSection(
    session,
    filters
  );

  const expired = rows.filter((d) => d.supportStatus === "expired").length;
  const expiringSoon = rows.filter((d) => d.supportStatus === "expiring_soon").length;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="FortiGate"
        subtitle="Your Fortinet hardware and when its support and services expire."
        isPreview={session.isPreview}
      />

      {unavailableReason ? (
        <PortalUnavailable>{unavailableReason}</PortalUnavailable>
      ) : (
        <>
          <PortalFilterBar
            section="fortigate"
            searchPlaceholder="Search by model or serial…"
            downloads={{ csv: true, pdf: false }}
            resultLabel={`${rows.length} of ${totalBeforeFilter} devices`}
            selects={[{ key: "support", label: "Support", options: facets.support ?? [] }]}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Devices" value={String(rows.length)} />
            <StatCard
              label="Expiring within 30 days"
              value={String(expiringSoon)}
              tone={expiringSoon > 0 ? "warn" : "good"}
            />
            <StatCard label="Support expired" value={String(expired)} tone={expired > 0 ? "bad" : "good"} />
          </div>

          <PortalCard title="Hardware">
            {rows.length === 0 ? (
              <EmptyRow>No FortiGate devices match these filters.</EmptyRow>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Model</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Serial</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Support</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Support ends</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">
                        Hardware end of support
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((d) => (
                      <tr key={d.serialNumber}>
                        <td className="px-5 py-2 font-medium text-slate-900">{d.productModel}</td>
                        <td className="px-5 py-2 font-mono text-xs text-slate-600">{d.serialNumber}</td>
                        <td className="px-5 py-2">
                          <SupportPill status={d.supportStatus} />
                        </td>
                        <td className="px-5 py-2 text-slate-600">
                          {d.supportEndDate ? formatDate(d.supportEndDate) : "—"}
                        </td>
                        <td className="px-5 py-2 text-slate-600">
                          {d.eosDate ? formatDate(d.eosDate) : "—"}
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
