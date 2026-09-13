"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ClipboardEvent } from "react";
import { useRouter } from "next/navigation";
import { IndeterminateProgressBar } from "@/components/progress-bar";
import type { QuarterlyReviewAttachment } from "@/lib/quarterly-review-data";
import type { UploadAttachmentState } from "@/app/(dashboard)/quarterly-reviews/actions";

function AttachmentThumbnail({
  reviewId,
  attachment,
  disabled,
  deleteAction,
}: {
  reviewId: string;
  attachment: QuarterlyReviewAttachment;
  disabled: boolean;
  deleteAction: (attachmentId: string, reviewId: string) => Promise<void>;
}) {
  const [removing, setRemoving] = useState(false);

  return (
    <div className="w-48 rounded-md border border-slate-200 p-2">
      <a href={`/api/quarterly-review-attachments/${attachment.id}`} target="_blank" rel="noopener noreferrer">
        <img
          src={`/api/quarterly-review-attachments/${attachment.id}`}
          alt={attachment.label ?? attachment.fileName}
          className="h-28 w-full rounded object-cover"
        />
      </a>
      <p className="mt-1 truncate text-xs font-medium text-slate-700" title={attachment.label ?? attachment.fileName}>
        {attachment.label ?? attachment.fileName}
      </p>
      {!disabled && (
        <button
          type="button"
          disabled={removing}
          onClick={async () => {
            setRemoving(true);
            await deleteAction(attachment.id, reviewId);
          }}
          className="mt-1 text-xs font-medium text-red-600 underline disabled:opacity-60"
        >
          {removing ? "Removing…" : "Remove"}
        </button>
      )}
    </div>
  );
}

function UploadAttachmentForm({
  reviewId,
  action,
}: {
  reviewId: string;
  action: (
    reviewId: string,
    prev: UploadAttachmentState,
    formData: FormData
  ) => Promise<UploadAttachmentState>;
}) {
  const [state, formAction, pending] = useActionState<UploadAttachmentState, FormData>(
    action.bind(null, reviewId),
    { error: null }
  );
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current && !pending && !state.error) {
      submittedRef.current = false;
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => {
        submittedRef.current = true;
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <div>
        <label className="block text-xs font-medium text-slate-700">Image</label>
        <input
          type="file"
          name="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          required
          className="mt-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">
          Caption <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          type="text"
          name="label"
          placeholder="e.g. MAX-FILE, NAS Datto Backup"
          className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Uploading…" : "Upload"}
      </button>
      {pending && <IndeterminateProgressBar />}
      {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

/** A focusable drop zone for Cmd+V/Ctrl+V — no file dialog needed for a
 * screen capture already on the clipboard (Cmd+Shift+4 on Mac, Win+Shift+S
 * on Windows both put the image straight on the clipboard). Calls the
 * upload Server Action directly with a hand-built FormData rather than
 * through useActionState/a real <form> submit, since a paste event isn't a
 * form submission — router.refresh() afterward is what actually reflects
 * the new attachment, since revalidatePath alone (inside the action) only
 * marks the route stale for the NEXT navigation, not a bare function call
 * like this one. Only ever intercepts the paste when the clipboard
 * actually contains an image — plain text paste (e.g. into the caption
 * field below) passes through untouched. */
function PasteScreenshotZone({
  reviewId,
  disabled,
  action,
}: {
  reviewId: string;
  disabled: boolean;
  action: (
    reviewId: string,
    prev: UploadAttachmentState,
    formData: FormData
  ) => Promise<UploadAttachmentState>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItem = Array.from(items).find((item) => item.type.startsWith("image/"));
    if (!imageItem) return; // Not an image paste — let it through normally.

    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;

    const ext = imageItem.type.split("/")[1] || "png";
    const named = new File([file], file.name || `screenshot-${Date.now()}.${ext}`, { type: imageItem.type });

    const formData = new FormData();
    formData.set("file", named);
    formData.set("label", "");

    setMessage(null);
    startTransition(async () => {
      const result = await action(reviewId, { error: null }, formData);
      if (result.error) {
        setMessage({ error: true, text: result.error });
      } else {
        setMessage({ error: false, text: "Pasted." });
        router.refresh();
      }
    });
  }

  if (disabled) return null;

  return (
    <div
      tabIndex={0}
      onPaste={handlePaste}
      className="flex items-center justify-center rounded-md border-2 border-dashed border-slate-300 px-4 py-3 text-xs text-slate-500 focus:border-brand focus:outline-none"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          Pasting…
          <IndeterminateProgressBar />
        </span>
      ) : message ? (
        <span className={message.error ? "text-red-600" : "text-emerald-600"}>{message.text}</span>
      ) : (
        <span>Click here, then press ⌘V / Ctrl+V to paste a screenshot — no file dialog needed.</span>
      )}
    </div>
  );
}

/** The review's own "Screenshots" appendix — matches the sample document's
 * final section (server resource graphs, VM lists, backup dashboards,
 * etc.), embedded inline in the client email (see
 * sendQuarterlyReviewToClientAction) rather than left as plain
 * attachments. Locked once the review leaves "draft", same as the
 * checklist items. */
export function QuarterlyReviewScreenshots({
  reviewId,
  attachments,
  disabled,
  uploadAction,
  deleteAction,
}: {
  reviewId: string;
  attachments: QuarterlyReviewAttachment[];
  disabled: boolean;
  uploadAction: (
    reviewId: string,
    prev: UploadAttachmentState,
    formData: FormData
  ) => Promise<UploadAttachmentState>;
  deleteAction: (attachmentId: string, reviewId: string) => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">
        <p className="text-sm font-semibold text-slate-900">Screenshots</p>
      </div>
      <div className="space-y-4 p-4">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {attachments.map((a) => (
              <AttachmentThumbnail
                key={a.id}
                reviewId={reviewId}
                attachment={a}
                disabled={disabled}
                deleteAction={deleteAction}
              />
            ))}
          </div>
        )}
        {!disabled && <PasteScreenshotZone reviewId={reviewId} disabled={disabled} action={uploadAction} />}
        {!disabled && <UploadAttachmentForm reviewId={reviewId} action={uploadAction} />}
      </div>
    </div>
  );
}
