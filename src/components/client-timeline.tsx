"use client";

import { useActionState, useRef, useState } from "react";
import { formatDate } from "@/lib/format";
import type { FormState } from "@/app/(dashboard)/clients/actions";

const initialState: FormState = { error: null };

export type TimelineEntry = {
  id: string;
  type: "note" | "call" | "meeting" | "email";
  subject: string | null;
  body: string | null;
  contactName: string | null;
  date: string;
  webLink?: string | null;
  loggedBy?: string | null;
};

const FILTERS: { value: "all" | TimelineEntry["type"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "email", label: "Email" },
  { value: "note", label: "Notes" },
  { value: "call", label: "Calls" },
  { value: "meeting", label: "Meetings" },
];

const TYPE_LABELS: Record<TimelineEntry["type"], string> = {
  note: "Note",
  call: "Call",
  meeting: "Meeting",
  email: "Email",
};

export function ClientTimeline({
  entries,
  contacts,
  logAction,
}: {
  entries: TimelineEntry[];
  contacts: { id: string; name: string }[];
  logAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [filter, setFilter] = useState<"all" | TimelineEntry["type"]>("all");
  const [state, formAction, pending] = useActionState(logAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  const visible = filter === "all" ? entries : entries.filter((e) => e.type === filter);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Timeline</h2>
      </div>

      <form
        ref={formRef}
        action={async (formData: FormData) => {
          await formAction(formData);
          formRef.current?.reset();
        }}
        className="space-y-2 border-b border-slate-200 px-5 py-3"
      >
        <div className="flex flex-wrap gap-2">
          <select
            name="type"
            defaultValue="note"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="meeting">Meeting</option>
          </select>
          <select
            name="contact_id"
            defaultValue=""
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">No contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <input
          name="subject"
          placeholder="Subject (optional)"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <textarea
          name="body"
          rows={3}
          placeholder="Log a note or call summary..."
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Logging..." : "Log interaction"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2 px-5 py-3">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === f.value
                ? "bg-charcoal text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="divide-y divide-slate-100">
        {visible.length === 0 && (
          <p className="px-5 py-4 text-sm text-slate-500">Nothing here yet.</p>
        )}
        {visible.map((entry) => (
          <div key={entry.id} className="px-5 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">
                {entry.subject || TYPE_LABELS[entry.type]}
              </p>
              <span className="shrink-0 text-xs text-slate-500">{formatDate(entry.date)}</span>
            </div>
            <p className="text-xs text-slate-500">
              {TYPE_LABELS[entry.type]}
              {entry.contactName ? ` · ${entry.contactName}` : ""}
              {entry.loggedBy ? ` · logged by ${entry.loggedBy}` : ""}
            </p>
            {entry.body && <p className="mt-1 text-sm text-slate-700">{entry.body}</p>}
            {entry.webLink && (
              <a
                href={entry.webLink}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs text-slate-500 underline"
              >
                Open in Outlook
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
