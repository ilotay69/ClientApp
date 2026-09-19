"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TimelineEntry } from "@/components/client-timeline";
import type { FormState } from "@/app/(dashboard)/clients/actions";
import { DeleteButton } from "@/components/delete-button";
import { AnimatedDialog } from "@/components/ui/animated-dialog";
import { CGSelect } from "@/components/ui/cg-select";
import { CGDocumentDropzone } from "@/components/ui/document-dropzone";
import { CGConfirmDiscard } from "@/components/ui/confirm-discard";
import {
  StatefulButton,
  useActionFeedback,
} from "@/components/ui/stateful-button";
import { formatDate } from "@/lib/format";
import s from "@/components/ui/client-surfaces.module.css";

const labels: Record<TimelineEntry["type"], string> = {
  note: "Note",
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  quote: "Signed quote",
  review: "Quarterly review",
  check_in: "Check-in",
  document: "Document",
};
export type InteractionActions = {
  log: (state: FormState, data: FormData) => Promise<FormState>;
  upload: (state: FormState, data: FormData) => Promise<FormState>;
  remove: (id: string) => Promise<void>;
};
export function ClientActivityComposer({
  contacts,
  actions,
  document = false,
  initialOpen = false,
}: {
  contacts: { id: string; name: string }[];
  actions: InteractionActions;
  document?: boolean;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [type, setType] = useState(document ? "document" : "note");
  const [contact, setContact] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [discard, setDiscard] = useState(false);
  const feedback = useActionFeedback();
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const dirty = Boolean(subject || body || file || contact);
  const pending = feedback.status === "pending";
  useEffect(() => {
    if (!open || !dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [open, dirty]);
  function changeOpen(next: boolean) {
    if (!next && pending) return;
    if (!next && dirty) {
      setDiscard(true);
      return;
    }
    setOpen(next);
  }
  return (
    <>
      <button
        ref={trigger}
        className={document ? s.button : s.primary}
        onClick={() => setOpen(true)}
      >
        {document ? "Upload document" : "Log interaction"}
      </button>
      {notice && (
        <span role="status" className={s.muted}>
          {notice}
        </span>
      )}
      <AnimatedDialog
        open={open}
        onOpenChange={changeOpen}
        title={type === "document" ? "Upload a document" : "Log an interaction"}
        description="Save this to the client’s activity record."
        variant="drawer"
        className={s.drawer}
        finalFocus={trigger}
      >
        <form
          className={`${s.workspace} ${s.form}`}
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            const data = new FormData();
            data.set("type", type);
            data.set("subject", subject);
            data.set("contact_id", contact);
            data.set("body", body);
            if (file) data.set("file", file);
            const ok = await feedback.run(async () => {
              if (type === "document" && !file)
                return { ok: false, error: "Choose a document first." };
              const result = await (
                type === "document" ? actions.upload : actions.log
              )({ error: null }, data);
              return result.error === null
                ? { ok: true }
                : {
                    ok: false,
                    error:
                      result.error ?? "The interaction could not be saved.",
                  };
            });
            if (ok) {
              setNotice(
                type === "document" ? "Document uploaded" : "Interaction saved",
              );
              setSubject("");
              setBody("");
              setContact("");
              setFile(null);
              setOpen(false);
              router.refresh();
            }
          }}
        >
          <div className={s.formGrid}>
            <div className={s.field}>
              <span>Type</span>
              <CGSelect
                label="Interaction type"
                value={type}
                disabled={pending}
                onChange={setType}
                options={[
                  { value: "note", label: "Note" },
                  { value: "call", label: "Call" },
                  { value: "meeting", label: "Meeting" },
                  { value: "document", label: "Document" },
                ]}
              />
            </div>
            <div className={s.field}>
              <span>Contact</span>
              <CGSelect
                searchable
                label="Interaction contact"
                value={contact}
                disabled={pending}
                onChange={setContact}
                options={[
                  { value: "", label: "No contact" },
                  ...contacts.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>
          </div>
          <label className={s.field}>
            Subject{" "}
            <input
              className={s.input}
              disabled={pending}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={
                type === "document"
                  ? "Optional — defaults to file name"
                  : "Optional subject"
              }
            />
          </label>
          {type === "document" ? (
            <CGDocumentDropzone
              file={file}
              onChange={setFile}
              disabled={pending}
            />
          ) : (
            <label className={s.field}>
              Notes
              <textarea
                className={s.input}
                value={body}
                disabled={pending}
                required
                rows={7}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Add a note or conversation summary…"
              />
            </label>
          )}
          {feedback.error && (
            <p role="alert" className={s.error}>
              {feedback.error}
            </p>
          )}
          <div className={s.formFooter}>
            <button
              type="button"
              className={s.button}
              disabled={pending}
              onClick={() => changeOpen(false)}
            >
              Cancel
            </button>
            <StatefulButton
              className={s.primary}
              type="submit"
              status={feedback.status}
              pendingLabel={type === "document" ? "Uploading…" : "Saving…"}
            >
              {type === "document" ? "Upload document" : "Save interaction"}
            </StatefulButton>
          </div>
        </form>
        <CGConfirmDiscard
          open={discard}
          onKeep={() => setDiscard(false)}
          onDiscard={() => {
            setDiscard(false);
            setSubject("");
            setBody("");
            setContact("");
            setFile(null);
            setOpen(false);
          }}
        />
      </AnimatedDialog>
    </>
  );
}

export function CGActivityFeed({
  entries,
  compact = false,
}: {
  entries: TimelineEntry[];
  compact?: boolean;
}) {
  const [selected, setSelected] = useState<TimelineEntry | null>(null);
  return (
    <>
      <ol className={s.feed}>
        {entries.map((entry, index) => (
          <li className={s.feedItem} key={entry.id}>
            {!compact &&
              (index === 0 ||
                entries[index - 1].date.slice(0, 10) !==
                  entry.date.slice(0, 10)) && (
                <p className={s.feedDate}>{formatDate(entry.date)}</p>
              )}
            <button
              className={s.rowTitle}
              style={{ textAlign: "left" }}
              onClick={() => setSelected(entry)}
            >
              {entry.subject || labels[entry.type]}
            </button>
            <p className={s.muted}>
              {labels[entry.type]}
              {entry.contactName ? ` · ${entry.contactName}` : ""}
              {compact ? ` · ${formatDate(entry.date)}` : ""}
            </p>
            {!compact && (
              <>
                <p className={s.muted}>
                  {entry.loggedBy ? `Logged by ${entry.loggedBy}` : ""}
                </p>
                {entry.body && (
                  <p className={s.feedBody}>
                    {entry.body.length > 240
                      ? `${entry.body.slice(0, 240)}…`
                      : entry.body}
                  </p>
                )}
                <EntryLinks entry={entry} />
              </>
            )}
          </li>
        ))}
      </ol>
      {!entries.length && <p className={s.muted}>No activity recorded yet.</p>}
      <AnimatedDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={
          selected?.subject || (selected ? labels[selected.type] : "Activity")
        }
        variant="drawer"
        className={s.drawer}
      >
        {selected && (
          <div className={`${s.workspace} ${s.stack}`}>
            <p className={s.muted}>
              {formatDate(selected.date)}
              {selected.loggedBy ? ` · ${selected.loggedBy}` : ""}
              {selected.contactName ? ` · ${selected.contactName}` : ""}
            </p>
            {selected.body && <p className={s.feedBody}>{selected.body}</p>}
            {selected.nextContactDate && (
              <p>Next contact: {formatDate(selected.nextContactDate)}</p>
            )}
            <EntryLinks entry={selected} />
          </div>
        )}
      </AnimatedDialog>
    </>
  );
}
function EntryLinks({ entry }: { entry: TimelineEntry }) {
  const safeLink =
    entry.webLink && /^https?:\/\//i.test(entry.webLink) ? entry.webLink : null;
  return (
    <div className={s.toolbar} style={{ marginTop: 8 }}>
      {entry.documentId && (
        <>
          <a
            className={s.button}
            href={`/api/documents/${encodeURIComponent(entry.documentId)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open {entry.attachmentFilename ?? "document"}
          </a>
          <a
            className={s.button}
            href={`/api/documents/${encodeURIComponent(entry.documentId)}?download=1`}
          >
            Download
          </a>
        </>
      )}
      {safeLink && (
        <a
          className={s.button}
          href={safeLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          {entry.linkLabel || "Open in Outlook"} ↗
        </a>
      )}
      {entry.isFlagged && (
        <span className={`${s.pill} ${s.danger}`}>Flagged for follow-up</span>
      )}
    </div>
  );
}
export function ClientActivity({
  entries,
  contacts,
  actions,
  userId,
  canManage,
  documentsOnly = false,
}: {
  entries: TimelineEntry[];
  contacts: { id: string; name: string }[];
  actions: InteractionActions;
  userId: string | null;
  canManage: boolean;
  documentsOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [limit, setLimit] = useState(40);
  const visible = entries.filter(
    (entry) =>
      (!documentsOnly || Boolean(entry.documentId)) &&
      (type === "all" || entry.type === type) &&
      [entry.subject, entry.body, entry.contactName, entry.attachmentFilename]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <div className={s.stack}>
      <div className={s.toolbar}>
        <input
          className={`${s.input} ${s.search}`}
          aria-label={documentsOnly ? "Search documents" : "Search activity"}
          placeholder={documentsOnly ? "Search documents…" : "Search activity…"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(40);
          }}
        />
        {!documentsOnly && (
          <CGSelect
            label="Activity type"
            value={type}
            onChange={(value) => {
              setType(value);
              setLimit(40);
            }}
            options={[
              { value: "all", label: "All activity" },
              ...Object.entries(labels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
        )}
        <ClientActivityComposer
          contacts={contacts}
          actions={actions}
          document={documentsOnly}
        />
      </div>
      <section className={s.card}>
        {documentsOnly ? (
          visible.slice(0, limit).map((entry) => (
            <div className={s.row} key={entry.id}>
              <div>
                <p className={s.rowTitle}>
                  {entry.subject || entry.attachmentFilename}
                </p>
                <p className={s.muted}>
                  {formatDate(entry.date)}
                  {entry.loggedBy ? ` · ${entry.loggedBy}` : ""}
                </p>
                <EntryLinks entry={entry} />
              </div>
              {(canManage || entry.createdByUserId === userId) &&
                entry.interactionId && (
                  <DeleteButton
                    label="Remove"
                    action={actions.remove.bind(null, entry.interactionId)}
                    confirmText="Remove this document and its activity entry?"
                  />
                )}
            </div>
          ))
        ) : (
          <CGActivityFeed entries={visible.slice(0, limit)} />
        )}
        {documentsOnly && !visible.length && (
          <div className={s.empty}>No documents match this view.</div>
        )}
        {!documentsOnly &&
          visible.some(
            (e) =>
              e.interactionId && (canManage || e.createdByUserId === userId),
          ) && (
            <details style={{ marginTop: 24 }}>
              <summary className={s.muted}>Manage activity entries</summary>
              {visible
                .slice(0, limit)
                .filter(
                  (e) =>
                    e.interactionId &&
                    (canManage || e.createdByUserId === userId),
                )
                .map((entry) => (
                  <div className={s.row} key={entry.id}>
                    <span>{entry.subject || labels[entry.type]}</span>
                    <DeleteButton
                      label="Remove"
                      action={actions.remove.bind(null, entry.interactionId!)}
                      confirmText="Remove this interaction from the client record?"
                    />
                  </div>
                ))}
            </details>
          )}
        {visible.length > limit && (
          <button
            className={s.button}
            style={{ marginTop: 20 }}
            onClick={() => setLimit(limit + 40)}
          >
            Show more ({visible.length - limit} remaining)
          </button>
        )}
      </section>
      <p className={s.muted}>
        {documentsOnly
          ? "Protected client documents. Knowledge base and password vault integrations will appear here when available."
          : "Client interactions and the latest 20 linked emails. Project-specific entries remain with their project."}
      </p>
    </div>
  );
}
