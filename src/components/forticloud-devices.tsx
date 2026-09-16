"use client";

import { useMemo, useState, useTransition } from "react";
import { STATUS_RANK, type ForticloudDeviceRow, type ForticloudSupportStatus } from "@/lib/forticloud-lookups";

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

const ALL_STATUSES = Object.keys(STATUS_LABEL) as ForticloudSupportStatus[];

type SortField = "account" | "model" | "serial" | "description" | "status" | "supportEnd" | "eos";
type SortDir = "asc" | "desc";

// Nulls sort last regardless of direction — an unknown/never-set date
// isn't "smaller" than a real one, it's just missing.
function compareNullableStrings(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

export function ForticloudDevices({
  action,
}: {
  action: () => Promise<{ rows: ForticloudDeviceRow[] } | { error: string }>;
}) {
  const [rows, setRows] = useState<ForticloudDeviceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();

  const [sortField, setSortField] = useState<SortField>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<Set<ForticloudSupportStatus>>(new Set(ALL_STATUSES));
  const [accountFilter, setAccountFilter] = useState("");
  const [search, setSearch] = useState("");

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

  const toggleStatus = (status: ForticloudSupportStatus) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const toggleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const accountOptions = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.accountLabel))].sort(),
    [rows]
  );

  const visibleRows = useMemo(() => {
    if (!rows) return [];
    const query = search.trim().toLowerCase();

    const filtered = rows.filter((r) => {
      if (!statusFilter.has(r.supportStatus)) return false;
      if (accountFilter && r.accountLabel !== accountFilter) return false;
      if (
        query &&
        !r.productModel.toLowerCase().includes(query) &&
        !r.serialNumber.toLowerCase().includes(query) &&
        !(r.description ?? "").toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });

    const dirMul = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case "account":
          return dirMul * a.accountLabel.localeCompare(b.accountLabel);
        case "model":
          return dirMul * a.productModel.localeCompare(b.productModel);
        case "serial":
          return dirMul * a.serialNumber.localeCompare(b.serialNumber);
        case "description":
          return dirMul * compareNullableStrings(a.description, b.description);
        case "status":
          return dirMul * (STATUS_RANK[a.supportStatus] - STATUS_RANK[b.supportStatus]);
        case "supportEnd":
          return dirMul * compareNullableStrings(a.supportEndDate, b.supportEndDate);
        case "eos":
          return dirMul * compareNullableStrings(a.eosDate, b.eosDate);
        default:
          return 0;
      }
    });
  }, [rows, sortField, sortDir, statusFilter, accountFilter, search]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">FortiCloud devices</h2>
            <p className="text-xs text-slate-500">
              Every registered device across every FortiCloud account — support/license expiration
              and hardware end-of-support date.
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

        {rows && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-1 rounded-md border border-slate-300 p-0.5">
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    statusFilter.has(s) ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Account</label>
              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="mt-1 w-48 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              >
                <option value="">All accounts</option>
                {accountOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Search</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Model, serial, or description"
                className="mt-1 w-56 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

      {rows && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <SortHeader field="account" label="Account" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader field="model" label="Model" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader field="serial" label="Serial" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader field="description" label="Description" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader field="status" label="Support status" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader field="supportEnd" label="Support ends" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader field="eos" label="Hardware EoS" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.map((r) => (
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
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-4 text-center text-slate-500">
                    {rows.length === 0 ? "No devices found." : "No devices match these filters."}
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

function SortHeader({
  field,
  label,
  sortField,
  sortDir,
  onSort,
}: {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const isActive = sortField === field;
  return (
    <th className="px-5 py-2 text-left font-medium text-slate-500">
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`flex items-center gap-1 hover:text-slate-700 ${isActive ? "text-slate-700" : ""}`}
      >
        {label}
        <span className="w-2.5 text-[10px]" aria-hidden="true">
          {isActive ? (sortDir === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}
