"use client";

import { useTransition } from "react";
import type { UserRole } from "@/lib/types";

const ROLES: UserRole[] = ["director", "manager", "tech"];

export function RoleSelect({
  memberId,
  currentRole,
  action,
  disabled,
}: {
  memberId: string;
  currentRole: UserRole;
  action: (memberId: string, role: UserRole) => Promise<void>;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={currentRole}
      disabled={disabled || isPending}
      onChange={(e) => {
        const role = e.target.value as UserRole;
        startTransition(() => {
          action(memberId, role);
        });
      }}
      className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-60"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {r.replace("_", " ")}
        </option>
      ))}
    </select>
  );
}
