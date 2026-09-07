"use client";

import { useState, useTransition } from "react";
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

/** One report's own preview panel — load-a-preview-then-table, same
 * pattern as every Lookups tab, plus a Download CSV link. Each report
 * gets its own instance as a GroupedTabs tab, rather than the previous
 * shared card-grid-plus-single-preview-area design, so the menu can grow
 * to a lot more reports the same way Lookups/Analysis/Integrations did. */
export function ReportPreviewPanel({
  report,
  previewAction,
}: {
  report: ReportDefinition;
  previewAction: (key: ReportKey) => Promise<ReportPreview | { error: string }>;
}) {
  const [preview, setPreview] = useState<ReportPreview | { error: string } | null>(null);
  const [loading, startLoad] = useTransition();

  const load = () => {
    startLoad(async () => {
      setPreview(await previewAction(report.key));
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
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {preview.headers.map((h) => (
                  <th key={h} className="whitespace-nowrap px-5 py-2 text-left font-medium text-slate-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((value, j) => (
                    <td key={j} className="whitespace-nowrap px-5 py-2 text-slate-700">
                      {cell(value)}
                    </td>
                  ))}
                </tr>
              ))}
              {preview.rows.length === 0 && (
                <tr>
                  <td colSpan={preview.headers.length} className="px-5 py-4 text-center text-slate-500">
                    Nothing to show.
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
