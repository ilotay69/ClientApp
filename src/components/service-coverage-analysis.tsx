"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { ServiceCoverageCategory } from "@/lib/service-coverage-insights";

type AnalyzeResult =
  | { categories: ServiceCoverageCategory[]; clients: { id: string; name: string }[] }
  | { error: string };

export function ServiceCoverageAnalysis({
  action,
}: {
  action: () => Promise<AnalyzeResult>;
}) {
  const [categories, setCategories] = useState<ServiceCoverageCategory[] | null>(null);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, startAnalyze] = useTransition();
  const [query, setQuery] = useState("");

  const runAnalyze = () => {
    setError(null);
    startAnalyze(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        setCategories(null);
      } else {
        setCategories(result.categories);
        setClients(result.clients);
      }
    });
  };

  // Name -> id, so client names in the report can link straight to their
  // page — useful for actually following up on an upsell target instead
  // of just reading a name.
  const clientIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clients) map.set(c.name, c.id);
    return map;
  }, [clients]);

  const q = query.trim().toLowerCase();
  const matchesQuery = (c: ServiceCoverageCategory) =>
    !q || c.category.toLowerCase().includes(q) || c.matchedServices.some((s) => s.toLowerCase().includes(q));

  const filtered = categories?.filter(matchesQuery) ?? null;
  const gaps = filtered?.filter((c) => c.missingClients.length > 0) ?? null;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Services Deployed</h2>
            <p className="text-xs text-slate-500">
              Reads every client&apos;s active Autotask contracted services — nothing to set up
              here — groups them into categories (MDR, backup, etc.), and flags clients missing one
              entirely. A different vendor for the same category still counts as covered — search a
              category below (e.g. &quot;MDR&quot;) to see who already has it (cross-vendor) and who
              doesn&apos;t, for upsell targeting.
            </p>
          </div>
          <button
            type="button"
            onClick={runAnalyze}
            disabled={analyzing}
            className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {analyzing ? "Analyzing…" : "Analyze coverage"}
          </button>
        </div>

        {error && <p className="px-5 py-2 text-sm text-red-600">{error}</p>}

        {categories && (
          <div className="border-b border-slate-200 px-5 py-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a service or category (e.g. MDR, backup, patching)…"
              className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
        )}

        {gaps && (
          <div className="divide-y divide-slate-100">
            {gaps.map((g, i) => (
              <div key={i} className="px-5 py-2">
                <p className="text-sm font-medium text-slate-900">{g.category}</p>
                {g.matchedServices.length > 0 && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Covers: {g.matchedServices.join(", ")}
                  </p>
                )}
                <p className="mt-1 text-sm text-slate-700">
                  Missing for: <ClientNames names={g.missingClients} clientIdByName={clientIdByName} />
                </p>
              </div>
            ))}
            {gaps.length === 0 && (
              <p className="px-5 py-6 text-center text-sm text-slate-500">
                {q
                  ? "No matching category has any coverage gap."
                  : "No real coverage gaps found — every client has at least one matching service in each category the catalog supports."}
              </p>
            )}
          </div>
        )}
      </div>

      {filtered && filtered.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-2">
            <h2 className="text-sm font-semibold text-slate-900">Coverage by category — who has it</h2>
            <p className="text-xs text-slate-500">
              The reverse view of the same analysis above: every category found, and which clients
              are already covered — any vendor counts.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {filtered.map((c, i) => (
              <div key={i} className="px-5 py-2">
                <p className="text-sm font-medium text-slate-900">{c.category}</p>
                {c.matchedServices.length > 0 && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Covers: {c.matchedServices.join(", ")}
                  </p>
                )}
                <p className="mt-1 text-sm text-slate-700">
                  {c.coveredClients.length > 0 ? (
                    <>
                      Covered ({c.coveredClients.length}):{" "}
                      <ClientNames names={c.coveredClients} clientIdByName={clientIdByName} />
                    </>
                  ) : (
                    "No clients currently covered."
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {categories && q && filtered && filtered.length === 0 && (
        <p className="text-center text-sm text-slate-500">
          No category matches &quot;{query}&quot;.
        </p>
      )}
    </div>
  );
}

function ClientNames({
  names,
  clientIdByName,
}: {
  names: string[];
  clientIdByName: Map<string, string>;
}) {
  return (
    <>
      {names.map((name, i) => {
        const id = clientIdByName.get(name);
        return (
          <span key={name}>
            {i > 0 && ", "}
            {id ? (
              <Link href={`/clients/${id}`} className="text-brand hover:underline">
                {name}
              </Link>
            ) : (
              name
            )}
          </span>
        );
      })}
    </>
  );
}
