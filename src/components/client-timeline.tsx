"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import { DeleteButton } from "@/components/delete-button";
import type { FormState } from "@/app/(dashboard)/clients/actions";

const initialState: FormState = { error: null };

export type TimelineEntry = {
  id: string;
  type: "note" | "call" | "meeting" | "email" | "quote" | "review";
  subject: string | null;
  body: string | null;
  contactName: string | null;
  date: string;
  webLink?: string | null;
  loggedBy?: string | null;
  /** Set only for an uploaded document — the id to fetch /api/documents/[id]
   * with, not the storage path itself (the route mints a fresh signed URL). */
  documentId?: string | null;
  attachmentFilename?: string | null;
  /** null for an email entry — those come from email_links, not
   * client_interactions, and can't be deleted from here. */
  interactionId?: string | null;
  createdByUserId?: string | null;
};

const FILTERS: { value: "all" | TimelineEntry["type"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "email", label: "Email" },
  { value: "note", label: "Notes" },
  { value: "call", label: "Calls" },
  { value: "meeting", label: "Meetings" },
  { value: "quote", label: "Quotes" },
  { value: "review", label: "Reviews" },
];

const TYPE_LABELS: Record<TimelineEntry["type"], string> = {
  note: "Note",
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  quote: "Signed quote",
  review: "Quarterly review",
};

export function ClientTimeline({
  entries,
  contacts,
  logAction,
  uploadQuoteAction,
  uploadReviewAction,
  deleteAction,
  currentUserId,
  canManageAllEntries,
}: {
  entries: TimelineEntry[];
  contacts: { id: string; name: string }[];
  logAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  uploadQuoteAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  uploadReviewAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  deleteAction: (interactionId: string) => Promise<void>;
  currentUserId: string | null;
  canManageAllEntries: boolean;
}) {
  const [filter, setFilter] = useState<"all" | TimelineEntry["type"]>("all");
  const [mode, setMode] = useState<"log" | "upload">("log");

  const visible = filter === "all" ? entries : entries.filter((e) => e.type === filter);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Timeline</h2>
      </div>

      <div className="flex gap-1 border-b border-slate-200 px-5 pt-3">
        <ModeTab active={mode === "log"} onClick={() => setMode("log")}>
          Log note / call / meeting
        </ModeTab>
        <ModeTab active={mode === "upload"} onClick={() => setMode("upload")}>
          Upload quote / review
        </ModeTab>
      </div>

      {mode === "log" ? (
        <LogForm logAction={logAction} contacts={contacts} />
      ) : (
        <UploadForm
          uploadQuoteAction={uploadQuoteAction}
          uploadReviewAction={uploadReviewAction}
          contacts={contacts}
        />
      )}

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
        {visible.map((entry) => {
          const canDelete =
            Boolean(entry.interactionId) &&
            (canManageAllEntries || (currentUserId && entry.createdByUserId === currentUserId));

          return (
          <div key={entry.id} className="px-5 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">
                {entry.subject || TYPE_LABELS[entry.type]}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-slate-500">{formatDate(entry.date)}</span>
                {canDelete && (
                  <DeleteButton
                    action={() => deleteAction(entry.interactionId!)}
                    confirmText={`Remove this ${TYPE_LABELS[entry.type].toLowerCase()} from the timeline?`}
                    label="Remove"
                  />
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              {TYPE_LABELS[entry.type]}
              {entry.contactName ? ` · ${entry.contactName}` : ""}
              {entry.loggedBy ? ` · logged by ${entry.loggedBy}` : ""}
            </p>
            {entry.body && (
              <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                {entry.documentId ? truncate(entry.body, 400) : entry.body}
              </p>
            )}
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
            {entry.documentId && (
              <a
                href={`/api/documents/${entry.documentId}`}
                className="mt-1 inline-block text-xs font-medium text-brand underline"
              >
                Download {entry.attachmentFilename ?? "PDF"}
              </a>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-t-md px-3 py-1.5 text-xs font-medium ${
        active
          ? "border border-b-0 border-slate-200 bg-white text-slate-900"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function LogForm({
  logAction,
  contacts,
}: {
  logAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  contacts: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(logAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
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
  );
}

function UploadForm({
  uploadQuoteAction,
  uploadReviewAction,
  contacts,
}: {
  uploadQuoteAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  uploadReviewAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  contacts: { id: string; name: string }[];
}) {
  const [category, setCategory] = useState<"quote" | "review">("quote");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const action = category === "quote" ? uploadQuoteAction : uploadReviewAction;

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
      className="space-y-2 border-b border-slate-200 px-5 py-3"
    >
      <div className="flex flex-wrap gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as "quote" | "review")}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="quote">Signed quote</option>
          <option value="review">Quarterly review</option>
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
        placeholder="Label (optional — defaults to the file name)"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        name="file"
        type="file"
        accept="application/pdf"
        required
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs"
      />
      <p className="text-xs text-slate-500">
        PDF only, up to 20MB. Text is extracted automatically so it shows up in the timeline and
        in AI Insights.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Uploading..." : "Upload document"}
      </button>
    </form>
  );
}
