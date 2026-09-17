"use client";

import { useRef, useState, useTransition } from "react";
import type { FormState } from "@/app/(dashboard)/proposals/brochures/actions";

const initialState: FormState = { error: null };

export function ProposalBrochureUploadForm({
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
      className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="title"
          placeholder="Title (optional — defaults to the file name)"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
        <input
          name="file"
          type="file"
          accept="application/pdf,.pdf,image/png,image/jpeg,.png,.jpg,.jpeg"
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
      <p className="text-xs text-slate-500">PDF or image, up to 20MB.</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
