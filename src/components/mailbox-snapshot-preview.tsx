"use client";

import { useState, useTransition } from "react";
import type { SnapshotPreview } from "@/app/(dashboard)/dashboard/actions";

export function MailboxSnapshotPreview({
  action,
}: {
  action: () => Promise<SnapshotPreview | { error: string }>;
}) {
  const [data, setData] = useState<SnapshotPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();

  const load = () => {
    setError(null);
    startLoad(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        setData(null);
      } else {
        setData(result);
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">What&apos;s in the database</h2>
          <p className="text-xs text-slate-500">
            Raw contents of your synced mailbox snapshot, most recent first — a direct look at how
            far back the sync has actually gotten.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : data ? "Refresh" : "Show database contents"}
        </button>
      </div>

      {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

      {data && (
        <>
          <p className="border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs text-slate-600">
            {data.totalCount} message{data.totalCount === 1 ? "" : "s"} stored
            {data.oldestReceivedAt && (
              <>
                {" "}
                — oldest from{" "}
                <span className="font-medium text-slate-800">
                  {new Date(data.oldestReceivedAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </>
            )}
            {data.rows.length < data.totalCount && ` (showing the ${data.rows.length} most recent)`}.
          </p>
          <div className="max-h-96 overflow-y-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="whitespace-nowrap px-3 py-1.5 text-left font-medium text-slate-500">Date</th>
                  <th className="whitespace-nowrap px-3 py-1.5 text-left font-medium text-slate-500">Sender</th>
                  <th className="px-3 py-1.5 text-left font-medium text-slate-500">Subject</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">
                      {new Date(r.receivedAt).toLocaleString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-700">
                      {r.fromName ? `${r.fromName} <${r.fromEmail ?? "?"}>` : (r.fromEmail ?? "—")}
                    </td>
                    <td className="px-3 py-1.5 text-slate-900">{r.subject ?? "(no subject)"}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                      Nothing stored yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
