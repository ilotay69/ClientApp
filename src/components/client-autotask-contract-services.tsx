"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";
import { humanizeLabel } from "@/lib/format";
import { CollapsibleCard } from "@/components/collapsible-card";
import { ListFilterBar, matchesQuery } from "@/components/list-filter-bar";

export type AutotaskContractServiceRow = {
  id: number;
  contract_name: string;
  contract_status: string | null;
  service_name: string;
  description: string | null;
  quantity: number | null;
};

const FILTER_THRESHOLD = 5;

export function ClientAutotaskContractServices({
  companyId,
  services,
}: {
  companyId: number | null;
  services: AutotaskContractServiceRow[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  // Status chips come from the data rather than a hardcoded list — Autotask
  // contract statuses are tenant-configurable, so anything fixed here would
  // eventually be wrong.
  const statuses = Array.from(
    new Set(services.map((s) => s.contract_status).filter((s): s is string => Boolean(s)))
  ).sort();

  const visible = services.filter((s) => {
    if (status && s.contract_status !== status) return false;
    return matchesQuery(query, s.service_name, s.contract_name, s.description);
  });

  const showFilters = services.length > FILTER_THRESHOLD;

  return (
    <CollapsibleCard title="Contracted services (Autotask)" count={visible.length}>
      {showFilters && (
        <ListFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search services…"
          toggles={statuses.map((s) => ({ value: s, label: humanizeLabel(s) }))}
          activeToggle={status}
          onToggle={setStatus}
        />
      )}
      <div className="divide-y divide-slate-100">
        {companyId === null ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            Link this client to Autotask from the Tickets tab to see its contracted services here.
          </p>
        ) : services.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            No contracted services found — click &quot;Sync now&quot; on the Tickets tab, or this
            client may have no active contracts in Autotask.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">No services match this filter.</p>
        ) : (
          visible.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-3 px-5 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  {s.service_name}
                  {s.quantity !== null ? ` × ${s.quantity}` : ""}
                </p>
                <p className="text-xs text-slate-500">
                  {s.contract_name}
                  {s.description ? ` · ${s.description}` : ""}
                </p>
              </div>
              {s.contract_status && <Badge value={s.contract_status} />}
            </div>
          ))
        )}
      </div>
    </CollapsibleCard>
  );
}
