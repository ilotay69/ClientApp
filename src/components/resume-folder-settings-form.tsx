"use client";

import { useActionState } from "react";

type FolderNameState = { error: string | null };

export function ResumeFolderSettingsForm({
  currentFolderName,
  action,
}: {
  currentFolderName: string;
  action: (prev: FolderNameState, formData: FormData) => Promise<FolderNameState>;
}) {
  const [state, formAction, pending] = useActionState<FolderNameState, FormData>(action, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Mailbox folder to watch
        </label>
        <p className="mt-0.5 text-xs text-slate-500">
          The exact name of a folder in your own connected mailbox (top-level, or a
          child of Inbox) — e.g. &quot;Resumes&quot;.
        </p>
        <input
          type="text"
          name="folder_name"
          defaultValue={currentFolderName}
          placeholder="Resumes"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
