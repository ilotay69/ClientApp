"use client";

import { useState, useTransition } from "react";
import type { PermissionKey } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";

const EDITABLE_ROLES: { role: "manager" | "tech" | "sales_rep"; label: string }[] = [
  { role: "manager", label: "Manager" },
  { role: "tech", label: "Tech" },
  { role: "sales_rep", label: "Sales Rep" },
];

export function PermissionMatrix({
  permissions,
  labels,
  grants,
  action,
}: {
  permissions: PermissionKey[];
  labels: Record<PermissionKey, string>;
  /** enabled permission keys per editable role */
  grants: Record<"manager" | "tech" | "sales_rep", Set<PermissionKey>>;
  action: (role: UserRole, permission: PermissionKey, enabled: boolean) => Promise<{ error?: string }>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Permission</th>
            <th className="px-5 py-2 text-center font-medium text-slate-500">Owner</th>
            {EDITABLE_ROLES.map((r) => (
              <th key={r.role} className="px-5 py-2 text-center font-medium text-slate-500">
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {permissions.map((permission) => (
            <tr key={permission}>
              <td className="px-5 py-2 text-slate-900">{labels[permission]}</td>
              <td className="px-5 py-2 text-center">
                <span
                  title="Owner always has full access"
                  className="inline-flex items-center rounded-full bg-charcoal px-2.5 py-0.5 text-xs font-medium text-white"
                >
                  Full access
                </span>
              </td>
              {EDITABLE_ROLES.map((r) => (
                <td key={r.role} className="px-5 py-2 text-center">
                  <PermissionCheckbox
                    role={r.role}
                    permission={permission}
                    checked={grants[r.role].has(permission)}
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

function PermissionCheckbox({
  role,
  permission,
  checked: initialChecked,
  action,
}: {
  role: UserRole;
  permission: PermissionKey;
  checked: boolean;
  action: (role: UserRole, permission: PermissionKey, enabled: boolean) => Promise<{ error?: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  // Controlled, not defaultChecked — a defaultChecked input reflects
  // whatever the user clicked, forever, whether or not the save behind
  // it actually succeeded. This reverts on a failed save instead of
  // silently looking like it worked.
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
            const result = await action(role, permission, enabled);
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
