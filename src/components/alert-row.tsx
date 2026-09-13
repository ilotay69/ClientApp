"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function AlertRow({
  id,
  title,
  detail,
  href,
  action,
}: {
  id: string;
  title: string;
  detail: string | null;
  href: string | null;
  action: (alertId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function acknowledge() {
    startTransition(async () => {
      await action(id);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <Link href={href ?? "/dashboard"} className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{title}</p>
        {detail && <p className="truncate text-xs text-slate-500">{detail}</p>}
      </Link>
      <button
        type="button"
        onClick={acknowledge}
        disabled={pending}
        className="shrink-0 rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "…" : "Acknowledge"}
      </button>
    </div>
  );
}
