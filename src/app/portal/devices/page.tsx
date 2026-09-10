import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal";
import { fetchPortalDevices } from "@/lib/portal-data";
import {
  PortalPageHeader,
  PortalCard,
  StatCard,
  EmptyRow,
  RingGauge,
} from "@/components/portal-ui";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Badge from @/components/badge derives its own text from the value via
 * humanizeLabel, so it can't render "Online"/"Offline" off a boolean — a
 * plain pill is clearer than bending a status vocabulary to fit. */
function StatusPill({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        online ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {online ? "Online" : "Offline"}
    </span>
  );
}

function diskLabel(free: number | null, total: number | null): string {
  if (!total || total <= 0) return "—";
  const usedPct = Math.round(((total - (free ?? 0)) / total) * 100);
  const gb = (bytes: number) => Math.round(bytes / 1024 ** 3);
  return `${usedPct}% of ${gb(total)} GB`;
}

export default async function PortalDevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const { preview } = await searchParams;
  const session = await requirePortalSession(preview, "devices");
  if (!session) redirect("/portal");

  const { devices, lastSyncedAt, linked } = await fetchPortalDevices(session);

  const online = devices.filter((d) => d.isOffline === false).length;
  const servers = devices.filter((d) =>
    (d.nodeClass ?? "").toUpperCase().includes("SERVER")
  ).length;
  const onlinePercent = devices.length > 0 ? Math.round((online / devices.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="Devices"
        subtitle="The endpoints we monitor for you."
        isPreview={session.isPreview}
        lastSyncedAt={lastSyncedAt}
      />

      {!linked ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">
            Device monitoring isn&apos;t set up for your account yet.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total devices" value={String(devices.length)} />
            <StatCard
              label="Online"
              value={String(online)}
              hint={`${devices.length - online} offline`}
              tone={online === devices.length ? "good" : "warn"}
            />
            <StatCard label="Servers" value={String(servers)} />
            <StatCard
              label="Workstations"
              value={String(devices.length - servers)}
            />
          </div>

          {devices.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
              <PortalCard title="Availability">
                <div className="px-8 py-6">
                  <RingGauge
                    percent={onlinePercent}
                    label="Devices online"
                    sublabel={`${online} of ${devices.length}`}
                  />
                </div>
              </PortalCard>

              <PortalCard title="All devices">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-2 text-left font-medium text-slate-500">Device</th>
                        <th className="px-5 py-2 text-left font-medium text-slate-500">Status</th>
                        <th className="px-5 py-2 text-left font-medium text-slate-500">
                          Operating system
                        </th>
                        <th className="px-5 py-2 text-left font-medium text-slate-500">Model</th>
                        <th className="px-5 py-2 text-left font-medium text-slate-500">Disk used</th>
                        <th className="px-5 py-2 text-left font-medium text-slate-500">
                          Last seen
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {devices.map((d) => (
                        <tr key={d.id}>
                          <td className="px-5 py-2 font-medium text-slate-900">{d.systemName}</td>
                          <td className="px-5 py-2">
                            <StatusPill online={d.isOffline === false} />
                          </td>
                          <td className="px-5 py-2 text-slate-600">{d.osName ?? "—"}</td>
                          <td className="px-5 py-2 text-slate-600">
                            {[d.manufacturer, d.model].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td className="px-5 py-2 text-slate-600">
                            {diskLabel(d.diskFreeBytes, d.diskTotalBytes)}
                          </td>
                          <td className="px-5 py-2 text-slate-600">
                            {d.lastContact ? formatDate(d.lastContact) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </PortalCard>
            </div>
          )}

          {devices.length === 0 && (
            <PortalCard title="All devices">
              <EmptyRow>No devices have synced yet.</EmptyRow>
            </PortalCard>
          )}
        </>
      )}
    </div>
  );
}
