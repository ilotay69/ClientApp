"use client";

import { useRef, useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import { DeleteButton } from "@/components/delete-button";
import { FollowupBadge } from "@/components/badge";
import type { FormState } from "@/app/(dashboard)/clients/actions";

const initialState: FormState = { error: null };

export type TimelineEntry = {
  id: string;
  type: "note" | "call" | "meeting" | "email" | "quote" | "review" | "check_in" | "document";
  subject: string | null;
  body: string | null;
  contactName: string | null;
  date: string;
  webLink?: string | null;
  /** Label for webLink — defaults to "Open in Outlook" (the only source
   * for it until quote references existed). Set explicitly for anything
   * else, e.g. "View in Autotask". */
  linkLabel?: string | null;
  loggedBy?: string | null;
  /** Set only for an uploaded document — the id to fetch /api/documents/[id]
   * with, not the storage path itself (the route mints a fresh signed URL). */
  documentId?: string | null;
  attachmentFilename?: string | null;
  /** null for an email entry — those come from email_links, not
   * client_interactions, and can't be deleted from here. */
  interactionId?: string | null;
  createdByUserId?: string | null;
  /** Set for an email entry currently flagged for follow-up in Outlook. */
  isFlagged?: boolean;
  /** Set for a check-in — also created a matching Touchpoint at this date. */
  nextContactDate?: string | null;
};

const FILTERS: { value: "all" | TimelineEntry["type"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "email", label: "Email" },
  { value: "note", label: "Notes" },
  { value: "call", label: "Calls" },
  { value: "meeting", label: "Meetings" },
  { value: "document", label: "Documents" },
];

const TYPE_LABELS: Record<TimelineEntry["type"], string> = {
  note: "Note",
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  quote: "Signed quote",
  review: "Quarterly review",
  check_in: "Check-in",
  document: "Document",
};

export function ClientTimeline({
  entries,
  contacts,
  logAction,
  uploadDocumentAction,
  deleteAction,
  currentUserId,
  canManageAllEntries,
}: {
  entries: TimelineEntry[];
  contacts: { id: string; name: string }[];
  logAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  uploadDocumentAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  deleteAction: (interactionId: string) => Promise<void>;
  currentUserId: string | null;
  canManageAllEntries: boolean;
}) {
  const [filter, setFilter] = useState<"all" | TimelineEntry["type"]>("all");

  const visible = filter === "all" ? entries : entries.filter((e) => e.type === filter);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-2">
        <h2 className="text-sm font-semibold text-slate-900">Timeline</h2>
      </div>

      <LogForm logAction={logAction} uploadDocumentAction={uploadDocumentAction} contacts={contacts} />

      <div className="flex flex-wrap gap-2 px-5 py-2">
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
          <div key={entry.id} className="px-5 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                {entry.subject || TYPE_LABELS[entry.type]}
                {entry.isFlagged && <FollowupBadge />}
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
            {entry.body && !entry.documentId && (
              <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{entry.body}</p>
            )}
            {entry.nextContactDate && (
              <p className="mt-1 text-xs font-medium text-slate-500">
                Next contact: {formatDate(entry.nextContactDate)}
              </p>
            )}
            {entry.webLink && (
              <a
                href={entry.webLink}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs text-slate-500 underline"
              >
                {entry.linkLabel ?? "Open in Outlook"}
              </a>
            )}
            {entry.documentId && (
              <div className="mt-1 flex items-center gap-3">
                <a
                  href={`/api/documents/${entry.documentId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-brand underline"
                >
                  View {entry.attachmentFilename ?? "document"}
                </a>
                <a
                  href={`/api/documents/${entry.documentId}?download=1`}
                  className="text-xs font-medium text-slate-600 underline"
                >
                  Download
                </a>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

/** One form covering both a typed note/call/meeting/check-in log and a
 * document upload — picking "Document" from the type dropdown swaps the
 * body textarea for a file picker and posts to uploadDocumentAction
 * instead of logAction. Not built on useActionState (like the old
 * LogForm was) since the action itself needs to vary per submit. */
function LogForm({
  logAction,
  uploadDocumentAction,
  contacts,
}: {
  logAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  uploadDocumentAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  contacts: { id: string; name: string }[];
}) {
  const [type, setType] = useState("note");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const isDocument = type === "document";

  return (
    <form
      ref={formRef}
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const action = isDocument ? uploadDocumentAction : logAction;
          const result = await action(initialState, formData);
          if (result.error) setError(result.error);
          else {
            formRef.current?.reset();
            setType("note");
          }
        });
      }}
      encType="multipart/form-data"
      className="space-y-2 border-b border-slate-200 px-5 py-2"
    >
      <div className="flex flex-wrap gap-2">
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="note">Note</option>
          <option value="call">Call</option>
          <option value="meeting">Meeting</option>
          <option value="document">Document</option>
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

      {isDocument ? (
        <>
          <input
            name="subject"
            placeholder="Label (optional — defaults to the file name)"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="file"
            type="file"
            accept="application/pdf,.doc,.docx,.xls,.xlsx"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs"
          />
          <p className="text-xs text-slate-500">
            PDF, Word, or Excel, up to 20MB. A PDF opens right in the browser tab; Word/Excel will
            download or open in your Office app instead, since browsers can&apos;t render those
            inline.
          </p>
        </>
      ) : (
        <>
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
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? (isDocument ? "Uploading..." : "Logging...") : isDocument ? "Upload document" : "Log interaction"}
      </button>
    </form>
  );
}
