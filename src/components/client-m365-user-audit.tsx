"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/badge";
import { formatAge } from "@/lib/format";
import { CollapsibleCard } from "@/components/collapsible-card";
import { ListFilterBar, matchesQuery } from "@/components/list-filter-bar";

const FILTER_THRESHOLD = 5;
const INACTIVE_DAYS_THRESHOLD = 90;

export type M365UserAuditRow = {
  id: number;
  user_principal_name: string;
  display_name: string | null;
  is_admin: boolean;
  is_mfa_registered: boolean;
  is_mfa_capable: boolean;
  user_type: string | null;
  account_enabled: boolean;
  last_successful_sign_in: string | null;
};

function isInactive(row: M365UserAuditRow): boolean {
  if (!row.account_enabled) return false;
  if (!row.last_successful_sign_in) return true;
  const days = Math.floor((Date.now() - new Date(row.last_successful_sign_in).getTime()) / 86_400_000);
  return days >= INACTIVE_DAYS_THRESHOLD;
}

/** Requires AuditLog.Read.All, admin-consented on this client's own Azure
 * app registration. One row per user, joining two Graph calls
 * (userRegistrationDetails + signInActivity) by UPN — the same join
 * m365-itdr.ts already does for the account-wide rollup, kept here as
 * real columns so this tab can filter on MFA/inactivity independently
 * rather than a flattened issues list. Guests are shown, not filtered out
 * — a guest with no MFA is still a real gap, just one a rep may weigh
 * differently. */
export function ClientM365UserAudit({
  tenantId,
  users,
}: {
  tenantId: string | null;
  users: M365UserAuditRow[];
}) {
  const [query, setQuery] = useState("");
  const [toggle, setToggle] = useState<string | null>(null);

  const flagged = useMemo(
    () => ({
      noMfa: users.filter((u) => !u.is_mfa_registered).length,
      inactive: users.filter(isInactive).length,
      admins: users.filter((u) => u.is_admin).length,
    }),
    [users]
  );

  const visible = users.filter((u) => {
    if (toggle === "no_mfa" && u.is_mfa_registered) return false;
    if (toggle === "inactive" && !isInactive(u)) return false;
    if (toggle === "admins" && !u.is_admin) return false;
    return matchesQuery(query, u.display_name, u.user_principal_name);
  });

  const showFilters = users.length > FILTER_THRESHOLD;

  return (
    <CollapsibleCard title="MFA & sign-in" count={visible.length}>
      {showFilters && (
        <ListFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search users…"
          toggles={[
            { value: "no_mfa", label: `No MFA (${flagged.noMfa})` },
            { value: "inactive", label: `Inactive (${flagged.inactive})` },
            { value: "admins", label: `Admins (${flagged.admins})` },
          ]}
          activeToggle={toggle}
          onToggle={setToggle}
        />
      )}
      <div className="divide-y divide-slate-100">
        {tenantId === null ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            Link this client to Microsoft 365 using the button at the top of the page to see its
            MFA registration and sign-in activity here.
          </p>
        ) : users.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            No audit data found. Click &quot;Sync M365&quot; at the top of the page — if it still
            shows nothing, confirm this client&apos;s Azure app registration has AuditLog.Read.All
            admin-consented.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">No users match this filter.</p>
        ) : (
          visible.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 px-5 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {u.display_name ?? u.user_principal_name}
                  {u.is_admin && <span className="ml-1.5 text-xs text-slate-400">(admin)</span>}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {u.last_successful_sign_in
                    ? `Last sign-in ${formatAge(u.last_successful_sign_in)} ago`
                    : "Never signed in"}
                  {!u.account_enabled && " · account disabled"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isInactive(u) && <Badge value="attention" label="Inactive" />}
                <Badge
                  value={u.is_mfa_registered ? "compliant" : "noncompliant"}
                  label={u.is_mfa_registered ? "MFA registered" : "No MFA"}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </CollapsibleCard>
  );
}
