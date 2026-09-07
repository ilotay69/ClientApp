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
  const [sort, setSort] = useState<SortState>(null);

  const load = () => {
    setFilterText("");
    setSort(null);
    startLoad(async () => {
      setPreview(await previewAction(report.key));
    });
  };

  const displayedRows = useMemo(() => {
    if (!preview || "error" in preview) return [];
    let rows = preview.rows;

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
  }, [preview, filterText, sort]);

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
              {filterText && ` ${displayedRows.length} match filter.`}
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

      {preview && !("error" in preview) && (
        <>
          <div className="border-b border-slate-100 px-5 py-2">
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter rows…"
              className="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1 text-xs focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
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
                      <td key={j} className="whitespace-nowrap px-3 py-1.5 text-slate-700">
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
