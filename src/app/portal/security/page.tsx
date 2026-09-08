import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal";
import { fetchPortalSecureScore, fetchPortalHuntress } from "@/lib/portal-data";
import {
  PortalPageHeader,
  PortalCard,
  StatCard,
  EmptyRow,
  RingGauge,
} from "@/components/portal-ui";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PortalSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const { preview } = await searchParams;
  const session = await requirePortalSession(preview);
  if (!session) redirect("/portal");

  const [secureScore, huntress] = await Promise.all([
    fetchPortalSecureScore(session),
    fetchPortalHuntress(session),
  ]);

  const protectedAgents = huntress.agents.length;
  const stale = huntress.agents.filter((a) => {
    if (!a.lastCallbackAt) return true;
    const days = (Date.now() - new Date(a.lastCallbackAt).getTime()) / 86_400_000;
    return days > 7;
  }).length;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="Security"
        subtitle="Your Microsoft 365 security posture and endpoint protection."
        isPreview={session.isPreview}
      />

      <PortalCard title="Microsoft Secure Score">
        {secureScore ? (
          <div className="grid gap-6 px-5 py-6 lg:grid-cols-[auto_1fr]">
            <RingGauge
              percent={secureScore.percent}
              label="Secure Score"
              sublabel={`${secureScore.currentScore} of ${secureScore.maxScore} points`}
            />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Biggest opportunities to improve
              </h3>
              {secureScore.gaps.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  Nothing outstanding — every measured control is at full marks.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {secureScore.gaps.map((g) => (
                    <li
                      key={g.title}
                      className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-0"
                    >
                      <div>
                        <p className="text-sm text-slate-900">{g.title}</p>
                        {g.category && (
                          <p className="text-xs text-slate-400">{g.category}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs font-medium text-amber-600">
                        +{g.deficit.toFixed(0)} pts
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-slate-400">
                Talk to your account manager about any of these.
                {secureScore.lastSyncedAt &&
                  ` Last measured ${formatDate(secureScore.lastSyncedAt)}.`}
              </p>
            </div>
          </div>
        ) : (
          <EmptyRow>Security scoring isn&apos;t set up for your tenant yet.</EmptyRow>
        )}
      </PortalCard>

      {huntress.linked && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Protected endpoints"
              value={huntress.error ? "—" : String(protectedAgents)}
              hint="running managed EDR"
            />
            <StatCard
              label="Reporting normally"
              value={huntress.error ? "—" : String(protectedAgents - stale)}
              hint={stale > 0 ? `${stale} not seen in over a week` : "all agents checked in"}
              tone={huntress.error ? "neutral" : stale > 0 ? "warn" : "good"}
            />
          </div>

          <PortalCard title="Managed endpoint protection">
            {huntress.error ? (
              <EmptyRow>{huntress.error}</EmptyRow>
            ) : huntress.agents.length === 0 ? (
              <EmptyRow>No protected endpoints reported yet.</EmptyRow>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Endpoint</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Platform</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Defender</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Firewall</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">
                        Last check-in
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {huntress.agents.map((a) => (
                      <tr key={a.agentId}>
                        <td className="px-5 py-2 font-medium text-slate-900">{a.hostname}</td>
                        <td className="px-5 py-2 text-slate-600">
                          {a.os ?? a.platform ?? "—"}
                        </td>
                        <td className="px-5 py-2 text-slate-600">{a.defenderStatus ?? "—"}</td>
                        <td className="px-5 py-2 text-slate-600">{a.firewallStatus ?? "—"}</td>
                        <td className="px-5 py-2 text-slate-600">
                          {a.lastCallbackAt ? formatDate(a.lastCallbackAt) : "—"}
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
