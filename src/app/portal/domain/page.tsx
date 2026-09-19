import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal";
import { fetchDomainSection } from "@/lib/portal-sections";
import { PortalPageHeader, PortalCard, StatCard } from "@/components/portal-ui";
import { PortalFilterBar } from "@/components/portal-filter-bar";
import { PortalUnavailable } from "@/components/portal-unavailable";
import { formatDate } from "@/lib/format";
import { IconCheck, IconAlertTriangle } from "@/components/icons";

export const dynamic = "force-dynamic";

function CheckRow({
  name,
  ok,
  detail,
  record,
}: {
  name: string;
  ok: boolean;
  detail: string;
  record?: string | null;
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      {ok ? (
        <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">
          {name} <span className="font-normal text-slate-500">— {detail}</span>
        </p>
        {record && (
          <p className="mt-0.5 break-all font-mono text-xs text-slate-500">{record}</p>
        )}
      </div>
    </div>
  );
}

export default async function PortalDomainPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preview = typeof params.preview === "string" ? params.preview : undefined;
  const session = await requirePortalSession(preview, "domain");
  if (!session) redirect("/portal");

  const { domain, report, unavailableReason } = await fetchDomainSection(session);

  // Every check is live DNS/RDAP at request time — nothing here is cached,
  // so this page is always current and never needs a "last synced" note.
  const dkimFound = report?.dkim.filter((d) => d.found).length ?? 0;
  const passing = report
    ? [report.spf.found, report.dmarc.found, dkimFound > 0].filter(Boolean).length
    : 0;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="Domain Health"
        subtitle={
          domain
            ? `Live email and DNS checks for ${domain}.`
            : "Live email and DNS checks for your domain."
        }
        isPreview={session.isPreview}
      />

      {unavailableReason || !report || !domain ? (
        <PortalUnavailable>
          {unavailableReason ?? "Domain health isn't available right now."}
        </PortalUnavailable>
      ) : (
        <>
          <PortalFilterBar section="domain" downloads={{ csv: true, pdf: true }} />

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Email protections"
              value={`${passing}/3`}
              hint="SPF, DMARC and DKIM"
              tone={passing === 3 ? "good" : passing >= 2 ? "warn" : "bad"}
            />
            <StatCard
              label="Registrar"
              value={report.whois.registrar ?? "—"}
              hint={report.whois.found ? "from the domain registry" : "not published"}
            />
            <StatCard
              label="Domain expires"
              value={report.whois.expiresAt ? formatDate(report.whois.expiresAt) : "—"}
              hint={report.whois.expiresAt ? "renewal date on record" : "not published"}
            />
          </div>

          <PortalCard title="Email authentication">
            <div className="divide-y divide-slate-100">
              <CheckRow
                name="SPF"
                ok={report.spf.found}
                detail={
                  report.spf.found
                    ? "published — tells other mail servers who may send as you"
                    : "not found — anyone can forge mail from your domain"
                }
                record={report.spf.record}
              />
              <CheckRow
                name="DMARC"
                ok={report.dmarc.found}
                detail={
                  report.dmarc.found
                    ? `published with policy "${report.dmarc.policy ?? "unspecified"}"`
                    : "not found — forged mail will not be rejected or reported"
                }
                record={report.dmarc.record}
              />
              <CheckRow
                name="DKIM"
                ok={dkimFound > 0}
                detail={
                  dkimFound > 0
                    ? `${dkimFound} signing key${dkimFound === 1 ? "" : "s"} published`
                    : "no signing keys found on the selectors we check"
                }
                record={report.dkim.find((d) => d.found)?.record ?? null}
              />
            </div>
          </PortalCard>

          <PortalCard title="Microsoft 365 DNS records">
            <div className="divide-y divide-slate-100">
              {report.subdomains.map((s) => (
                <CheckRow
                  key={s.host}
                  name={s.host}
                  ok={s.found}
                  detail={s.found ? `points to ${s.target}` : "not configured"}
                />
              ))}
            </div>
          </PortalCard>

          <PortalCard title="Mail servers">
            <div className="divide-y divide-slate-100">
              {report.dns.mx.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  No MX records found — this domain cannot receive email.
                </p>
              ) : (
                report.dns.mx
                  .slice()
                  .sort((a, b) => a.priority - b.priority)
                  .map((mx) => (
                    <div key={mx.exchange} className="flex items-center justify-between px-5 py-2.5">
                      <span className="break-all font-mono text-xs text-slate-700">{mx.exchange}</span>
                      <span className="shrink-0 text-xs text-slate-400">priority {mx.priority}</span>
                    </div>
                  ))
              )}
            </div>
          </PortalCard>
        </>
      )}
    </div>
  );
}
