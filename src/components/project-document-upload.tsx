"use client";

import { useRef, useState, useTransition } from "react";
import type { FormState } from "@/app/(dashboard)/clients/actions";

const initialState: FormState = { error: null };

/** Uploads a PDF/Word/Excel document straight to a project's row — same
 * mechanism as the client Timeline's quote/review upload, just scoped to
 * this project instead. */
export function ProjectDocumentUpload({
  action,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await action(initialState, formData);
          if (result.error) setError(result.error);
          else formRef.current?.reset();
        });
      }}
      encType="multipart/form-data"
      className="space-y-2 border-t border-slate-100 px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="subject"
          placeholder="Label (optional — defaults to the file name)"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <input
          name="file"
          type="file"
          accept="application/pdf,.doc,.docx,.xls,.xlsx"
          required
          className="rounded-md border border-slate-300 text-sm file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        PDF, Word, or Excel, up to 20MB. A PDF opens right in the browser tab; Word/Excel will
        download or open in your Office app instead, since browsers can&apos;t render those
        inline.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
