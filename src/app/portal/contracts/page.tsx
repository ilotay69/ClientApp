import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal";
import {
  fetchPortalContractMonth,
  currentMonth,
  shiftMonth,
} from "@/lib/portal-data";
import {
  PortalPageHeader,
  PortalCard,
  StatCard,
  ProportionBar,
} from "@/components/portal-ui";
import { TrendChart } from "@/components/charts/trend-chart";

export const dynamic = "force-dynamic";

/** How far either side of today the month stepper will go. Forward is
 * genuinely useful — blocks are often purchased ahead of their start date —
 * but unbounded paging would just be an invitation to hammer the Autotask
 * API with requests that can only ever come back empty. */
const MAX_MONTHS_BACK = 24;
const MAX_MONTHS_FORWARD = 3;

function normalizeMonth(raw: string | undefined): string {
  if (!raw || !/^\d{4}-\d{2}-01$/.test(raw)) return currentMonth();
  const earliest = shiftMonth(currentMonth(), -MAX_MONTHS_BACK);
  const latest = shiftMonth(currentMonth(), MAX_MONTHS_FORWARD);
  if (raw < earliest || raw > latest) return currentMonth();
  return raw;
}

function monthLabel(month: string): string {
  return new Date(`${month}T00:00:00Z`).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function PortalContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; month?: string }>;
}) {
  const { preview, month: rawMonth } = await searchParams;
  const session = await requirePortalSession(preview);
  if (!session) redirect("/portal");

  const month = normalizeMonth(rawMonth);
  const data = await fetchPortalContractMonth(session, month);

  const totalPurchased = data.blocks.reduce((s, b) => s + b.purchased, 0);
  const totalUsed = data.blocks.reduce((s, b) => s + b.used, 0);
  const totalRemaining = totalPurchased - totalUsed;

  // Stepping is plain links, not a client component — a server-rendered
  // navigation is all this needs, and it keeps the month shareable/bookmarkable.
  const stepHref = (delta: number) => {
    const target = shiftMonth(month, delta);
    const params = new URLSearchParams({ month: target });
    if (preview) params.set("preview", preview);
    return `/portal/contracts?${params.toString()}`;
  };
  const canGoBack = shiftMonth(month, -1) >= shiftMonth(currentMonth(), -MAX_MONTHS_BACK);
  const canGoForward = shiftMonth(month, 1) <= shiftMonth(currentMonth(), MAX_MONTHS_FORWARD);

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="Contract hours"
        subtitle="Prepaid block hours purchased, used and remaining."
        isPreview={session.isPreview}
      />

      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        {canGoBack ? (
          <Link
            href={stepHref(-1)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            ← Previous
          </Link>
        ) : (
          <span className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-300">
            ← Previous
          </span>
        )}

        <div className="text-center">
          <p className="text-sm font-semibold text-slate-900">{monthLabel(month)}</p>
          {month !== currentMonth() && (
            <Link
              href={
                preview
                  ? `/portal/contracts?month=${currentMonth()}&preview=${preview}`
                  : `/portal/contracts?month=${currentMonth()}`
              }
              className="text-xs text-brand underline"
            >
              Back to this month
            </Link>
          )}
        </div>

        {canGoForward ? (
          <Link
            href={stepHref(1)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Next →
          </Link>
        ) : (
          <span className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-300">
            Next →
          </span>
        )}
      </div>

      {data.unavailableReason ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">{data.unavailableReason}</p>
        </div>
      ) : data.blocks.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">
            No prepaid hour blocks covering {monthLabel(month)}.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Purchased" value={totalPurchased.toFixed(1)} hint="hours in this period" />
            <StatCard label="Used" value={totalUsed.toFixed(1)} hint="billable hours drawn down" />
            <StatCard
              label="Remaining"
              value={totalRemaining.toFixed(1)}
              hint="hours left"
              tone={
                totalRemaining <= 0
                  ? "bad"
                  : totalPurchased > 0 && totalRemaining / totalPurchased < 0.2
                    ? "warn"
                    : "good"
              }
            />
          </div>

          <PortalCard title={`Blocks covering ${monthLabel(month)}`}>
            <div className="space-y-5 px-5 py-4">
              {data.blocks.map((b) => (
                <ProportionBar
                  key={`${b.contractId}-${b.startDate}`}
                  label={b.contractName}
                  used={b.used}
                  total={b.purchased}
                  valueLabel={`${b.used.toFixed(1)} / ${b.purchased.toFixed(1)} hrs · ${Math.round(b.percentUsed)}%`}
                />
              ))}
            </div>
          </PortalCard>

          <PortalCard title={`Hours logged each day in ${monthLabel(month)}`}>
            <div className="px-2 py-4">
              <TrendChart
                series={[{ name: "Hours", color: "#2563eb", points: data.dailyUsage }]}
                type="bar"
                emptyMessage={`No time logged in ${monthLabel(month)}.`}
              />
              <p className="px-3 pt-2 text-xs text-slate-400">
                {data.totalHoursInMonth.toFixed(1)} billable hours logged this month.
              </p>
            </div>
          </PortalCard>
        </>
      )}
    </div>
  );
}
