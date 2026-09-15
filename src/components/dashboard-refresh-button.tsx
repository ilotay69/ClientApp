"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { IconRefresh } from "@/components/icons";

/** router.refresh() re-runs the Dashboard's Server Component with fresh
 * data, and (since the page hands every client-fetched widget a key that's
 * regenerated on each server render) also remounts those widgets so their
 * own useEffect-on-mount fetch runs again instead of showing stale rows. */
export function DashboardRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-60"
    >
      <IconRefresh className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
      {isPending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
