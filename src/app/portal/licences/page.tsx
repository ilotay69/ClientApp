import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal";
import { readPortalFilters, portalFilterHref } from "@/lib/portal-filters";
import { fetchLicencesSection, LARGE_SKU_SEAT_THRESHOLD } from "@/lib/portal-sections";
import { PortalPageHeader, PortalCard, StatCard, EmptyRow, ProportionBar } from "@/components/portal-ui";
import { PortalFilterBar } from "@/components/portal-filter-bar";
import { PortalUnavailable } from "@/components/portal-unavailable";

export const dynamic = "force-dynamic";

export default async function PortalLicencesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preview = typeof params.preview === "string" ? params.preview : undefined;
  const session = await requirePortalSession(preview, "licences");
  if (!session) redirect("/portal");

  const filters = readPortalFilters("licences", params);
  const { rows, totalBeforeFilter, unavailableReason, lastSyncedAt, facets, hiddenLargeCount, showingLarge } =
    await fetchLicencesSection(session, filters);

  // Totals follow the filtered rows on purpose: the download does too, and
  // a header that disagreed with the table under it would be worse than no
  // header at all.
  const assigned = rows.reduce((s, r) => s + r.consumed, 0);
  const purchased = rows.reduce((s, r) => s + r.purchased, 0);
  const spare = purchased - assigned;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="Microsoft 365"
        subtitle="Licences on your tenant, how many are assigned, and what's sitting spare."
        isPreview={session.isPreview}
        lastSyncedAt={lastSyncedAt}
      />

      {unavailableReason ? (
        <PortalUnavailable>{unavailableReason}</PortalUnavailable>
      ) : (
        <>
          <PortalFilterBar
            section="licences"
            searchPlaceholder="Search subscriptions…"
            downloads={{ csv: true, pdf: true }}
            resultLabel={`${rows.length} of ${totalBeforeFilter} subscriptions`}
            selects={[{ key: "usage", label: "Utilisation", options: facets.usage ?? [] }]}
          />

          {hiddenLargeCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
              <span>
                {showingLarge
                  ? `Showing ${hiddenLargeCount} free or unlimited subscription${hiddenLargeCount === 1 ? "" : "s"} with more than ${LARGE_SKU_SEAT_THRESHOLD.toLocaleString()} seats.`
                  : `${hiddenLargeCount} free or unlimited subscription${hiddenLargeCount === 1 ? "" : "s"} with more than ${LARGE_SKU_SEAT_THRESHOLD.toLocaleString()} seats ${hiddenLargeCount === 1 ? "is" : "are"} hidden.`}
              </span>
              <Link
                href={portalFilterHref("/portal/licences", filters, preview, {
                  showLarge: showingLarge ? null : "1",
                })}
                className="font-medium text-brand underline"
              >
                {showingLarge ? "Hide them" : "Show them anyway"}
              </Link>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Licences assigned" value={String(assigned)} />
            <StatCard label="Licences purchased" value={String(purchased)} />
            <StatCard
              label="Unassigned"
              value={String(spare)}
              hint={spare > 0 ? "paid for but not in use" : "fully allocated"}
              tone={spare > 0 ? "warn" : "good"}
            />
          </div>

          <PortalCard title="By subscription">
            {rows.length === 0 ? (
              <EmptyRow>
                {totalBeforeFilter === 0
                  ? "No licence data has synced for your Microsoft 365 tenant yet."
                  : "No subscriptions match these filters."}
              </EmptyRow>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Subscription</th>
                      <th className="px-5 py-2 text-right font-medium text-slate-500">Purchased</th>
                      <th className="px-5 py-2 text-right font-medium text-slate-500">Assigned</th>
                      <th className="px-5 py-2 text-right font-medium text-slate-500">Available</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Utilisation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.skuPartNumber}>
                        <td className="px-5 py-2">
                          <p className="font-medium text-slate-900">{r.name}</p>
                          <p className="text-xs text-slate-400">{r.skuPartNumber}</p>
                        </td>
                        <td className="px-5 py-2 text-right text-slate-600">{r.purchased}</td>
                        <td className="px-5 py-2 text-right text-slate-600">{r.consumed}</td>
                        <td className="px-5 py-2 text-right text-slate-600">{r.available}</td>
                        <td className="w-56 px-5 py-2">
                          <ProportionBar
                            label=""
                            used={r.consumed}
                            total={r.purchased}
                            valueLabel={`${r.percentUsed}% · ${r.status}`}
                            neutral
                          />
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
