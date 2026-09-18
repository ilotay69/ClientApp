"use client";

import { useMemo, useState, useTransition } from "react";
import { IconDownload } from "@/components/icons";
import type { ReportKey, ReportPreview } from "@/app/(dashboard)/reports/actions";
import type { ReportCell } from "@/lib/reports";

export type ReportDefinition = {
  key: ReportKey;
  title: string;
  description: string;
  downloadHref: string;
  /** Header name of a column worth offering as one-click toggle chips
   * (e.g. "Status") rather than making someone type the value into the
   * free-text filter - only meaningful when that column holds a small,
   * repeated set of values. Chips are built from whatever distinct values
   * actually show up in the loaded preview, so a report never needs a
   * fixed list kept in sync by hand. */
  quickFilterColumn?: string;
};

function cell(value: ReportCell): string {
  return value == null ? "—" : String(value);
}

type SortState = { column: number; direction: "asc" | "desc" } | null;

/** One report's own preview panel — load-a-preview-then-table, same
 * pattern as every Lookups tab, plus a Download CSV link. Each report
 * gets its own instance as a GroupedTabs tab, rather than the previous
 * shared card-grid-plus-single-preview-area design, so the menu can grow
 * to a lot more reports the same way Lookups/Analysis/Integrations did.
 * Filter and sort only operate on the loaded preview rows (already
 * capped by the server), not the full export — matches this being a
 * "does this look right" preview, not a report-building tool. */
export function ReportPreviewPanel({
  report,
  previewAction,
}: {
  report: ReportDefinition;
  previewAction: (key: ReportKey) => Promise<ReportPreview | { error: string }>;
}) {
  const [preview, setPreview] = useState<ReportPreview | { error: string } | null>(null);
  const [loading, startLoad] = useTransition();
  const [filterText, setFilterText] = useState("");
  const [quickFilter, setQuickFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>(null);

  const load = () => {
    setFilterText("");
    setQuickFilter(null);
    setSort(null);
    startLoad(async () => {
      setPreview(await previewAction(report.key));
    });
  };

  const quickFilterColumnIndex =
    preview && !("error" in preview) && report.quickFilterColumn
      ? preview.headers.indexOf(report.quickFilterColumn)
      : -1;

  const quickFilterValues = useMemo(() => {
    if (!preview || "error" in preview || quickFilterColumnIndex < 0) return [];
    const values = new Set(preview.rows.map((row) => cell(row[quickFilterColumnIndex])));
    return [...values].sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, quickFilterColumnIndex]);

  const displayedRows = useMemo(() => {
    if (!preview || "error" in preview) return [];
    let rows = preview.rows;

    if (quickFilter !== null && quickFilterColumnIndex >= 0) {
      rows = rows.filter((row) => cell(row[quickFilterColumnIndex]) === quickFilter);
    }

    const needle = filterText.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((row) => row.some((value) => cell(value).toLowerCase().includes(needle)));
    }

    if (sort) {
      const { column, direction } = sort;
      rows = [...rows].sort((a, b) => {
        const av = a[column];
        const bv = b[column];
        let cmp: number;
        if (typeof av === "number" && typeof bv === "number") {
          cmp = av - bv;
        } else {
          cmp = cell(av).localeCompare(cell(bv), undefined, { numeric: true });
        }
        return direction === "asc" ? cmp : -cmp;
      });
    }

    return rows;
  }, [preview, filterText, quickFilter, quickFilterColumnIndex, sort]);

  const toggleSort = (column: number) => {
    setSort((prev) => {
      if (!prev || prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{report.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{report.description}</p>
          {preview && !("error" in preview) && (
            <p className="mt-0.5 text-xs text-slate-500">
              {preview.truncated
                ? `Showing first ${preview.rows.length} of ${preview.totalRows} rows — download for the full export.`
                : `${preview.totalRows} row${preview.totalRows === 1 ? "" : "s"}.`}
              {(filterText || quickFilter) && ` ${displayedRows.length} match filter.`}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            {loading ? "Loading…" : preview ? "Refresh preview" : "Load preview"}
          </button>
          <a
            href={report.downloadHref}
            className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
          >
            <IconDownload className="h-4 w-4" />
            Download CSV
          </a>
        </div>
      </div>

      {preview && "error" in preview && <p className="px-5 py-4 text-sm text-red-600">{preview.error}</p>}

      {preview && !("error" in preview) && preview.warnings && preview.warnings.length > 0 && (
        <div className="border-b border-amber-100 bg-amber-50 px-5 py-2">
          <p className="text-xs font-medium text-amber-800">
            Couldn't load {preview.warnings.length === 1 ? "one client" : `${preview.warnings.length} clients`}:
          </p>
          <ul className="mt-0.5 list-inside list-disc text-xs text-amber-700">
            {preview.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {preview && !("error" in preview) && (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2">
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter rows…"
              className="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1 text-xs focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            {quickFilterColumnIndex >= 0 && quickFilterValues.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setQuickFilter(null)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                    quickFilter === null
                      ? "border-brand bg-brand text-white"
                      : "border-slate-300 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  All
                </button>
                {quickFilterValues.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setQuickFilter(value)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      quickFilter === value
                        ? "border-brand bg-brand text-white"
                        : "border-slate-300 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {preview.headers.map((h, i) => (
                    <th key={h} className="whitespace-nowrap px-3 py-1.5 text-left font-medium text-slate-500">
                      <button
                        type="button"
                        onClick={() => toggleSort(i)}
                        className="flex items-center gap-1 hover:text-slate-700"
                      >
                        {h}
                        {sort?.column === i && <span>{sort.direction === "asc" ? "▲" : "▼"}</span>}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRows.map((row, i) => (
                  <tr key={i}>
                    {row.map((value, j) => (
                      <td key={j} className="max-w-xs break-words px-3 py-1.5 text-slate-700">
                        {cell(value)}
                      </td>
                    ))}
                  </tr>
                ))}
                {displayedRows.length === 0 && (
                  <tr>
                    <td colSpan={preview.headers.length} className="px-3 py-3 text-center text-slate-500">
                      {filterText ? "No rows match that filter." : "Nothing to show."}
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
