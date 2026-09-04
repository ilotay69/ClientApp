"use client";

import { useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import type { DomainHealthReport } from "@/lib/domain-health";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`}
      aria-hidden="true"
    />
  );
}

export function DomainHealthPanel({
  action,
  initialDomain,
  title = "Domain health",
}: {
  action: (domain: string) => Promise<{ report: DomainHealthReport } | { error: string }>;
  initialDomain?: string | null;
  title?: string;
}) {
  const [domain, setDomain] = useState(initialDomain ?? "");
  const [report, setReport] = useState<DomainHealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();

  const run = () => {
    setError(null);
    startCheck(async () => {
      const result = await action(domain);
      if ("error" in result) {
        setError(result.error);
        setReport(null);
      } else {
        setReport(result.report);
      }
    });
  };

  const expiresSoon =
    report?.whois.expiresAt &&
    new Date(report.whois.expiresAt).getTime() - Date.now() < 60 * 24 * 60 * 60 * 1000;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">
          Live DNS/MX/SPF/DMARC/DKIM and registrar lookup — nothing stored.
        </p>
      </div>

      <div className="flex gap-2 px-5 py-3">
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="example.com"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={run}
          disabled={checking || !domain.trim()}
          className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {checking ? "Checking…" : "Check"}
        </button>
      </div>

      {error && <p className="px-5 pb-3 text-sm text-red-600">{error}</p>}

      {report && (
        <div className="space-y-4 border-t border-slate-100 px-5 py-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email authentication</p>
            <div className="mt-2 space-y-1.5">
              <div className="flex items-start gap-2">
                <StatusDot ok={report.spf.found} />
                <p>
                  <span className="font-medium text-slate-900">SPF</span>{" "}
                  <span className="text-slate-600">{report.spf.found ? "configured" : "not found"}</span>
                  {report.spf.record && (
                    <span className="block break-all text-xs text-slate-500">{report.spf.record}</span>
                  )}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <StatusDot ok={report.dmarc.found} />
                <p>
                  <span className="font-medium text-slate-900">DMARC</span>{" "}
                  <span className="text-slate-600">
                    {report.dmarc.found ? `configured (policy: ${report.dmarc.policy ?? "?"})` : "not found"}
                  </span>
                  {report.dmarc.record && (
                    <span className="block break-all text-xs text-slate-500">{report.dmarc.record}</span>
                  )}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <StatusDot ok={report.dkim.some((d) => d.found)} />
                <div>
                  <span className="font-medium text-slate-900">DKIM</span>{" "}
                  {report.dkim.some((d) => d.found) ? (
                    <span className="text-slate-600">
                      found under: {report.dkim.filter((d) => d.found).map((d) => d.selector).join(", ")}
                    </span>
                  ) : (
                    <span className="text-slate-600">
                      no record under common selectors — check the exact selector by hand if this
                      domain sends mail
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">DNS records</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-slate-700">MX</p>
                {report.dns.mx.length > 0 ? (
                  <ul className="text-xs text-slate-600">
                    {report.dns.mx.map((mx, i) => (
                      <li key={i}>
                        {mx.priority} {mx.exchange}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400">None found.</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-700">Nameservers</p>
                {report.dns.ns.length > 0 ? (
                  <ul className="text-xs text-slate-600">
                    {report.dns.ns.map((ns) => (
                      <li key={ns}>{ns}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400">None found.</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-700">A</p>
                <p className="text-xs text-slate-600">
                  {report.dns.a.length > 0 ? report.dns.a.join(", ") : "None found."}
                </p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Common subdomains</p>
            <p className="mt-1 text-xs text-slate-400">
              DNS has no "list everything" query — this checks a known set of expected names
              (www, autodiscover, and the rest of the M365 set), not every subdomain that exists.
            </p>
            {report.subdomains.some((s) => s.found) ? (
              <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                {report.subdomains
                  .filter((s) => s.found)
                  .map((s) => (
                    <li key={s.host}>
                      <span className="font-medium text-slate-700">{s.host}</span> ({s.type}){" "}
                      {s.target}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-400">None of the common names found.</p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Seen in SSL certificates
            </p>
            <p className="mt-1 text-xs text-slate-400">
              From public Certificate Transparency logs — every hostname that&apos;s ever had a
              cert issued for it. This is certificate history, not live DNS: a name here may no
              longer resolve to anything.
            </p>
            {report.certHistory.error ? (
              <p className="mt-2 text-xs text-red-600">{report.certHistory.error}</p>
            ) : report.certHistory.hostnames.length > 0 ? (
              <>
                <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto text-xs text-slate-600">
                  {report.certHistory.hostnames.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
                {report.certHistory.truncated && (
                  <p className="mt-1 text-xs text-slate-400">List truncated — more exist.</p>
                )}
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-400">No certificate history found.</p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Registration (RDAP)</p>
            {report.whois.found ? (
              <div className="mt-2 grid gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
                <p>
                  <span className="font-medium text-slate-700">Registrar:</span>{" "}
                  {report.whois.registrar ?? "Unknown"}
                </p>
                <p className={expiresSoon ? "font-medium text-red-600" : undefined}>
                  <span className="font-medium text-slate-700">Expires:</span>{" "}
                  {report.whois.expiresAt ? formatDate(report.whois.expiresAt) : "Unknown"}
                  {expiresSoon ? " — within 60 days" : ""}
                </p>
                <p>
                  <span className="font-medium text-slate-700">Registered:</span>{" "}
                  {report.whois.registeredAt ? formatDate(report.whois.registeredAt) : "Unknown"}
                </p>
                <p className="sm:col-span-2">
                  <span className="font-medium text-slate-700">Nameservers:</span>{" "}
                  {report.whois.nameservers.length > 0 ? report.whois.nameservers.join(", ") : "Unknown"}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                {report.whois.error ?? "No registration data found."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
