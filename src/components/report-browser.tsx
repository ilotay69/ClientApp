"use client";

import { useEffect, useState } from "react";
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

export function ReportBrowser({
  reports,
  previewAction,
}: {
  reports: ReportDefinition[];
  previewAction: (key: ReportKey) => Promise<ReportPreview | { error: string }>;
}) {
  const [selected, setSelected] = useState<ReportDefinition | null>(null);
  const [preview, setPreview] = useState<ReportPreview | { error: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setPreview(null);
    setLoading(true);
    previewAction(selected.key).then((res) => {
      setPreview(res);
      setLoading(false);
    });
  }, [selected, previewAction]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {reports.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setSelected(r)}
            className={`flex items-start justify-between gap-3 rounded-xl border bg-white p-5 text-left shadow-sm hover:border-slate-300 hover:shadow ${
              selected?.key === r.key ? "border-brand ring-1 ring-brand" : "border-slate-200"
            }`}
          >
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{r.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{r.description}</p>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{selected.title} — preview</h2>
              {preview && !("error" in preview) && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {preview.truncated
                    ? `Showing first ${preview.rows.length} of ${preview.totalRows} rows — download for the full export.`
                    : `${preview.totalRows} row${preview.totalRows === 1 ? "" : "s"}.`}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={selected.downloadHref}
                className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
              >
                <IconDownload className="h-4 w-4" />
                Download CSV
              </a>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>

          {loading && <p className="px-5 py-8 text-center text-sm text-slate-500">Loading preview…</p>}

          {preview && "error" in preview && (
            <p className="px-5 py-4 text-sm text-red-600">{preview.error}</p>
          )}

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
      )}
    </div>
  );
}
