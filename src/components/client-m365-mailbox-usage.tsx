"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";
import { CollapsibleCard } from "@/components/collapsible-card";
import { ListFilterBar, matchesQuery } from "@/components/list-filter-bar";

const FILTER_THRESHOLD = 5;

export type M365MailboxUsageRow = {
  id: number;
  user_principal_name: string;
  display_name: string | null;
  storage_used_bytes: number;
  prohibit_send_receive_quota_bytes: number;
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 GB";
  const gb = bytes / 1024 ** 3;
  return gb >= 1000 ? `${(gb / 1024).toFixed(1)} TB` : `${gb.toFixed(1)} GB`;
}

function percentUsed(row: M365MailboxUsageRow): number | null {
  if (!row.prohibit_send_receive_quota_bytes) return null;
  return Math.round((row.storage_used_bytes / row.prohibit_send_receive_quota_bytes) * 100);
}

/** Requires Reports.Read.All, admin-consented on this client's own Azure
 * app registration. fetchMailboxUsageDetail (m365-partner.ts) downloads
 * Microsoft's own CSV report rather than a JSON endpoint — see that
 * function's own comment for why. */
export function ClientM365MailboxUsage({
  tenantId,
  mailboxes,
}: {
  tenantId: string | null;
  mailboxes: M365MailboxUsageRow[];
}) {
  const [query, setQuery] = useState("");
  const [toggle, setToggle] = useState<string | null>(null);

  const nearQuota = (m: M365MailboxUsageRow) => {
    const pct = percentUsed(m);
    return pct !== null && pct >= 90;
  };

  const visible = mailboxes.filter((m) => {
    if (toggle === "near_quota" && !nearQuota(m)) return false;
    return matchesQuery(query, m.display_name, m.user_principal_name);
  });

  const showFilters = mailboxes.length > FILTER_THRESHOLD;

  return (
    <CollapsibleCard title="Mailbox usage" count={visible.length}>
      {showFilters && (
        <ListFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search mailboxes…"
          toggles={[{ value: "near_quota", label: "Near quota" }]}
          activeToggle={toggle}
          onToggle={setToggle}
        />
      )}
      <div className="divide-y divide-slate-100">
        {tenantId === null ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            Link this client to Microsoft 365 using the button at the top of the page to see its
            mailbox usage here.
          </p>
        ) : mailboxes.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            No mailbox usage data found. Click &quot;Sync M365&quot; at the top of the page — if it
            still shows nothing, confirm this client&apos;s Azure app registration has
            Reports.Read.All admin-consented.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">No mailboxes match this filter.</p>
        ) : (
          visible.map((m) => {
            const pct = percentUsed(m);
            return (
              <div key={m.id} className="flex items-center justify-between gap-3 px-5 py-2">
                <p className="min-w-0 truncate text-sm font-medium text-slate-900">
                  {m.display_name ?? m.user_principal_name}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm text-slate-600">
                    {formatBytes(m.storage_used_bytes)}
                    {m.prohibit_send_receive_quota_bytes > 0 &&
                      ` / ${formatBytes(m.prohibit_send_receive_quota_bytes)}`}
                    {pct !== null && ` (${pct}%)`}
                  </span>
                  {nearQuota(m) && <Badge value="high" />}
                </div>
              </div>
            );
          })
        )}
      </div>
    </CollapsibleCard>
  );
}
