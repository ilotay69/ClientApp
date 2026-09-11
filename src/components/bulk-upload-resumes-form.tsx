"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { IndeterminateProgressBar } from "@/components/progress-bar";

type BulkUploadState = {
  error: string | null;
  success: string | null;
  created?: number;
  failures?: string[];
};

// One file per request, not a small batch — next.config.ts caps a Server
// Action's request body at 25MB (sized for exactly one resume up to the
// 20MB per-file limit, with headroom for multipart overhead), so even 3
// files together can already blow past that if they're not tiny, failing
// immediately rather than timing out. One at a time guarantees every
// request looks exactly like the already-proven single-file upload path.
// It also keeps each request short, avoiding the separate timeout risk a
// long-running batched request would have (same class of issue already
// fixed once for resume screening).
const UPLOAD_CHUNK_SIZE = 1;

/** Collapsed behind a button by default, same pattern as AddCandidateForm —
 * stays open after a save (rather than collapsing like that form does) so
 * the result summary (created count + any per-file failures) is still
 * visible; the file picker itself resets so staff can immediately upload
 * another batch without reopening this. */
export function BulkUploadResumesForm({
  action,
}: {
  action: (prev: BulkUploadState, formData: FormData) => Promise<BulkUploadState>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BulkUploadState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function runUpload(e: FormEvent) {
    e.preventDefault();
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) {
      setResult({ error: "Choose one or more resume files.", success: null });
      return;
    }
    const fileArray = Array.from(files);

    setResult(null);
    startTransition(async () => {
      let created = 0;
      const failures: string[] = [];
      for (let i = 0; i < fileArray.length; i += UPLOAD_CHUNK_SIZE) {
        const chunk = fileArray.slice(i, i + UPLOAD_CHUNK_SIZE);
        const chunkFormData = new FormData();
        for (const file of chunk) chunkFormData.append("files", file);

        const outcome = await action({ error: null, success: null }, chunkFormData);
        // No `created` at all means this chunk never even got to
        // processing files (permission denied, etc.) — a real stop, not
        // just some files in the chunk failing individually.
        if (outcome.created === undefined) {
          setResult(outcome);
          return;
        }
        created += outcome.created;
        failures.push(...(outcome.failures ?? []));

        const done = i + UPLOAD_CHUNK_SIZE >= fileArray.length;
        setResult({
          error: null,
          success:
            `Added ${created} candidate${created === 1 ? "" : "s"}` +
            (failures.length > 0 ? `. ${failures.length} failed: ${failures.join(", ")}` : "") +
            (done ? "." : "…"),
        });
      }
      formRef.current?.reset();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
      >
        + Bulk upload resumes
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={runUpload}
      className="w-full space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div>
        <label className="block text-xs font-medium text-slate-700">Resume files</label>
        <p className="mt-0.5 text-xs text-slate-400">
          Select one or more PDF or Word (.docx) files — each becomes its own new
          candidate, not screened yet.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          name="files"
          multiple
          required
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="mt-1 w-full text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
        {pending && <IndeterminateProgressBar />}
      </div>
      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
      {result?.success && <p className="text-sm text-emerald-600">{result.success}</p>}
    </form>
  );
}
