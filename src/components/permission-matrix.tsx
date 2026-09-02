"use client";

import { useTransition } from "react";
import type { PermissionKey } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";

const EDITABLE_ROLES: { role: "manager" | "tech"; label: string }[] = [
  { role: "manager", label: "Manager" },
  { role: "tech", label: "Tech" },
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
  grants: Record<"manager" | "tech", Set<PermissionKey>>;
  action: (role: UserRole, permission: PermissionKey, enabled: boolean) => Promise<void>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-5 py-3 text-left font-medium text-slate-500">Permission</th>
            <th className="px-5 py-3 text-center font-medium text-slate-500">Owner</th>
            {EDITABLE_ROLES.map((r) => (
              <th key={r.role} className="px-5 py-3 text-center font-medium text-slate-500">
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {permissions.map((permission) => (
            <tr key={permission}>
              <td className="px-5 py-3 text-slate-900">{labels[permission]}</td>
              <td className="px-5 py-3 text-center">
                <span
                  title="Owner always has full access"
                  className="inline-flex items-center rounded-full bg-charcoal px-2.5 py-0.5 text-xs font-medium text-white"
                >
                  Full access
                </span>
              </td>
              {EDITABLE_ROLES.map((r) => (
                <td key={r.role} className="px-5 py-3 text-center">
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
  checked,
  action,
}: {
  role: UserRole;
  permission: PermissionKey;
  checked: boolean;
  action: (role: UserRole, permission: PermissionKey, enabled: boolean) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      defaultChecked={checked}
      disabled={isPending}
      onChange={(e) => {
        const enabled = e.target.checked;
        startTransition(() => {
          action(role, permission, enabled);
        });
      }}
      className="h-4 w-4 rounded border-slate-300 disabled:opacity-60"
    />
  );
}
