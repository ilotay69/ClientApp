"use client";

import { useActionState } from "react";

type FormState = { error: string | null; success: string | null };
const initialState: FormState = { error: null, success: null };

export function EmailTemplateForm({
  templateKey,
  label,
  description,
  placeholders,
  currentSubject,
  currentIntro,
  saveAction,
}: {
  templateKey: string;
  label: string;
  description: string;
  placeholders: string[];
  currentSubject: string;
  currentIntro: string;
  saveAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);

  return (
    <form
      action={formAction}
      className="max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <input type="hidden" name="key" value={templateKey} />
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{label}</h2>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Subject line</label>
        <input
          type="text"
          name="subject"
          defaultValue={currentSubject}
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Cover note</label>
        <p className="mt-0.5 text-xs text-slate-500">
          The one editable paragraph in the email body — everything else (the attachment
          reference, sign-off, and any action link) stays fixed.
        </p>
        <textarea
          name="intro"
          rows={3}
          defaultValue={currentIntro}
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      {placeholders.length > 0 && (
        <p className="text-xs text-slate-500">
          Placeholders you can use in either field:{" "}
          {placeholders.map((p, i) => (
            <span key={p}>
              <code className="rounded bg-slate-100 px-1 py-0.5">{p}</code>
              {i < placeholders.length - 1 ? " " : ""}
            </span>
          ))}
        </p>
      )}

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-700">{state.success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
