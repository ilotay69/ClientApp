"use client";

import { useState, useTransition } from "react";
import type { ForticloudDeviceRow, ForticloudSupportStatus } from "@/lib/forticloud-lookups";

const STATUS_LABEL: Record<ForticloudSupportStatus, string> = {
  expired: "Expired",
  expiring_soon: "Expiring soon",
  active: "Active",
  unknown: "Unknown",
};

const STATUS_CLASS: Record<ForticloudSupportStatus, string> = {
  expired: "text-red-600",
  expiring_soon: "text-amber-600",
  active: "text-emerald-700",
  unknown: "text-slate-500",
};

export function ForticloudDevices({
  action,
}: {
  action: () => Promise<{ rows: ForticloudDeviceRow[] } | { error: string }>;
}) {
  const [rows, setRows] = useState<ForticloudDeviceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();

  const load = () => {
    setError(null);
    startLoad(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        setRows(null);
      } else {
        setRows(result.rows);
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">FortiCloud devices</h2>
          <p className="text-xs text-slate-500">
            Every registered device across every FortiCloud account — support/license expiration
            and hardware end-of-support date, worst status first.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : rows ? "Refresh" : "Load devices"}
        </button>
      </div>

      {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

      {rows && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Account</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Model</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Serial</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Description</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Support status</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Support ends</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Hardware EoS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr
                  key={`${r.accountLabel}-${r.serialNumber}`}
                  className={r.supportStatus === "expired" ? "bg-red-50/60" : undefined}
                >
                  <td className="px-5 py-2 text-slate-900">{r.accountLabel}</td>
                  <td className="px-5 py-2 text-slate-700">{r.productModel}</td>
                  <td className="px-5 py-2 text-slate-600">{r.serialNumber}</td>
                  <td className="px-5 py-2 text-slate-600">{r.description ?? "—"}</td>
                  <td className={`px-5 py-2 font-medium ${STATUS_CLASS[r.supportStatus]}`}>
                    {STATUS_LABEL[r.supportStatus]}
                  </td>
                  <td className="px-5 py-2 text-slate-600">
                    {r.supportEndDate ? r.supportEndDate.slice(0, 10) : "—"}
                  </td>
                  <td className="px-5 py-2 text-slate-600">{r.eosDate ? r.eosDate.slice(0, 10) : "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-4 text-center text-slate-500">
                    No devices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
