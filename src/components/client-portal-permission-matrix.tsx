"use client";

import { useState, useTransition } from "react";
import type { ClientPortalRole, PortalPageKey } from "@/lib/portal";
import { CLIENT_PORTAL_ROLE_LABELS } from "@/lib/portal";

const ROLES: ClientPortalRole[] = ["client_tech", "client_manager", "client_owner"];

const PAGE_LABELS: Record<PortalPageKey, string> = {
  tickets: "Tickets",
  contracts: "Contracts",
  devices: "Devices",
  security: "Security",
  licences: "Microsoft 365",
};

/** Same look and pattern as PermissionMatrix (Team -> Roles & permissions),
 * for a different pair of types — client portal sub-roles and portal pages,
 * not staff roles and PermissionKeys. Overview isn't a row here at all: it
 * has no requiredPage in requirePortalSession, so every portal login always
 * reaches it regardless of what's toggled below. */
export function ClientPortalPermissionMatrix({
  pages,
  grants,
  action,
}: {
  pages: PortalPageKey[];
  grants: Record<ClientPortalRole, Set<PortalPageKey>>;
  action: (
    role: ClientPortalRole,
    page: PortalPageKey,
    enabled: boolean
  ) => Promise<{ error?: string }>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Portal page</th>
            {ROLES.map((role) => (
              <th key={role} className="px-5 py-2 text-center font-medium text-slate-500">
                {CLIENT_PORTAL_ROLE_LABELS[role]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {pages.map((page) => (
            <tr key={page}>
              <td className="px-5 py-2 text-slate-900">{PAGE_LABELS[page]}</td>
              {ROLES.map((role) => (
                <td key={role} className="px-5 py-2 text-center">
                  <PageCheckbox
                    role={role}
                    page={page}
                    checked={grants[role].has(page)}
                    action={action}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PageCheckbox({
  role,
  page,
  checked: initialChecked,
  action,
}: {
  role: ClientPortalRole;
  page: PortalPageKey;
  checked: boolean;
  action: (
    role: ClientPortalRole,
    page: PortalPageKey,
    enabled: boolean
  ) => Promise<{ error?: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  // Controlled, not defaultChecked — reverts on a failed save instead of
  // silently looking like it worked, same reasoning as PermissionCheckbox.
  const [checked, setChecked] = useState(initialChecked);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <input
        type="checkbox"
        checked={checked}
        disabled={isPending}
        onChange={(e) => {
          const enabled = e.target.checked;
          setChecked(enabled);
          setError(null);
          startTransition(async () => {
            const result = await action(role, page, enabled);
            if (result?.error) {
              setChecked(!enabled);
              setError(result.error);
            }
          });
        }}
        className="h-4 w-4 rounded border-slate-300 disabled:opacity-60"
      />
      {error && (
        <span title={error} className="max-w-20 text-center text-[10px] leading-tight text-red-600">
          Save failed
        </span>
      )}
    </div>
  );
}
