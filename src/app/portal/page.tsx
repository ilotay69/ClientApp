import Link from "next/link";
import { requirePortalSession } from "@/lib/portal";
import { createAdminClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/permissions";
import {
  fetchPortalContractMonth,
  fetchPortalDevices,
  fetchPortalSecureScore,
  fetchPortalLicences,
  fetchPortalTickets,
  currentMonth,
} from "@/lib/portal-data";
import {
  PortalPageHeader,
  StatCard,
  PortalCard,
  EmptyRow,
  RingGauge,
} from "@/components/portal-ui";
import { TrendChart } from "@/components/charts/trend-chart";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PortalOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const { preview } = await searchParams;
  const session = await requirePortalSession(preview);
  if (!session) return <StaffClientPicker />;

  const [contracts, devices, secureScore, licences, tickets] = await Promise.all([
    fetchPortalContractMonth(session, currentMonth()),
    fetchPortalDevices(session),
    fetchPortalSecureScore(session),
    fetchPortalLicences(session),
    fetchPortalTickets(session),
  ]);

  const onlineDevices = devices.devices.filter((d) => d.isOffline === false).length;
  const hoursRemaining = contracts.blocks.reduce((sum, b) => sum + b.remaining, 0);
  const hoursPurchased = contracts.blocks.reduce((sum, b) => sum + b.purchased, 0);
  const licencesAssigned = licences.licences.reduce((s, l) => s + l.consumedUnits, 0);
  const licencesTotal = licences.licences.reduce((s, l) => s + l.enabledUnits, 0);

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="Your IT at a glance"
        subtitle="A read-only summary of your services with CG Technologies."
        isPreview={session.isPreview}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Contract hours remaining"
          value={contracts.blocks.length > 0 ? hoursRemaining.toFixed(1) : "—"}
          hint={
            contracts.blocks.length > 0
              ? `of ${hoursPurchased.toFixed(1)} purchased`
              : contracts.unavailableReason ?? "No active block this month"
          }
          tone={
            contracts.blocks.length === 0
              ? "neutral"
              : hoursRemaining <= 0
                ? "bad"
                : hoursPurchased > 0 && hoursRemaining / hoursPurchased < 0.2
                  ? "warn"
                  : "good"
          }
        />
        <StatCard
          label="Devices online"
          value={devices.linked ? `${onlineDevices}/${devices.devices.length}` : "—"}
          hint={devices.linked ? "monitored endpoints" : "Not linked yet"}
          tone={
            !devices.linked || devices.devices.length === 0
              ? "neutral"
              : onlineDevices === devices.devices.length
                ? "good"
                : "warn"
          }
        />
        <StatCard
          label="Microsoft 365 licences"
          value={licences.linked ? `${licencesAssigned}/${licencesTotal}` : "—"}
          hint={licences.linked ? "assigned of available" : "Not linked yet"}
        />
        <StatCard
          label="Open tickets"
          value={tickets.linked ? String(tickets.open.length) : "—"}
          hint={tickets.linked ? "with our service desk" : "Not linked yet"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PortalCard
          title="Security posture"
          action={
            <Link
              href={session.isPreview ? `/portal/security?preview=${preview}` : "/portal/security"}
              className="text-xs font-medium text-brand underline"
            >
              Details
            </Link>
          }
        >
          {secureScore ? (
            <div className="px-5 py-6">
              <RingGauge
                percent={secureScore.percent}
                label="Microsoft Secure Score"
                sublabel={`${secureScore.currentScore} of ${secureScore.maxScore} points`}
              />
              {secureScore.lastSyncedAt && (
                <p className="mt-3 text-center text-xs text-slate-400">
                  Last measured {formatDate(secureScore.lastSyncedAt)}
                </p>
              )}
            </div>
          ) : (
            <EmptyRow>Security scoring isn&apos;t set up for your tenant yet.</EmptyRow>
          )}
        </PortalCard>

        <PortalCard
          title="Tickets raised, last 6 months"
          action={
            <Link
              href={session.isPreview ? `/portal/contracts?preview=${preview}` : "/portal/contracts"}
              className="text-xs font-medium text-brand underline"
            >
              Contract hours
            </Link>
          }
        >
          {tickets.createdByMonth.length > 0 ? (
            <div className="px-2 py-4">
              {/* No valueFormat: TrendChart is a Client Component, and React
                  forbids passing a plain function across the Server->Client
                  boundary — entity-trend-chart.tsx documents this after it
                  crashed a page. Its default formatter is fine here. */}
              <TrendChart
                series={[{ name: "Tickets", color: "#2563eb", points: tickets.createdByMonth }]}
                type="bar"
                emptyMessage="No tickets raised in this period."
              />
            </div>
          ) : (
            <EmptyRow>No ticket history available.</EmptyRow>
          )}
        </PortalCard>
      </div>
    </div>
  );
}

/**
 * Shown when signed-in STAFF reach /portal with no ?preview= chosen — so an
 * Owner can check what a client actually sees. A client-portal login never
 * reaches this: requirePortalSession only returns null for staff.
 *
 * requireStaff() is re-checked here rather than trusted from the caller,
 * because this is the one portal view that lists every client's name.
 */
async function StaffClientPicker() {
  if (!(await requireStaff())) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">No access</h1>
        <p className="mt-2 text-sm text-slate-500">This area isn&apos;t available to you.</p>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data: clients } = await admin
    .from("clients")
    .select("id, name")
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Preview a client portal</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick a client to see exactly what their read-only portal shows. Nothing here is
          editable.
        </p>
      </div>

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
        {(clients ?? []).length === 0 ? (
          <EmptyRow>No clients yet.</EmptyRow>
        ) : (
          (clients ?? []).map((c: { id: string; name: string }) => (
            <Link
              key={c.id}
              href={`/portal?preview=${c.id}`}
              className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50"
            >
              <span className="text-slate-900">{c.name}</span>
              <span className="text-xs text-brand underline">Preview</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
