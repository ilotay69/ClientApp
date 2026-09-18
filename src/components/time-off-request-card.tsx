"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";
import type { TimeOffRequest } from "@/lib/time-off";
import type { TimeOffActionState } from "@/app/(dashboard)/time-off/actions";

const noteInitialState: TimeOffActionState = { error: null };

/** One request: its own status/notes thread, plus whichever action buttons
 * apply to whoever's looking at it - Approve/Decline for an owner on a
 * still-pending one, Withdraw for the requester on their own still-pending
 * one. Notes are collapsed by default unless there already are some, so a
 * long-resolved request doesn't take up space with an empty thread. */
export function TimeOffRequestCard({
  request,
  isOwner,
  currentUserId,
  showRequester,
  decideAction,
  addNoteAction,
  withdrawAction,
}: {
  request: TimeOffRequest;
  isOwner: boolean;
  currentUserId: string;
  showRequester: boolean;
  decideAction: (id: string, decision: "approved" | "declined") => Promise<void>;
  addNoteAction: (prevState: TimeOffActionState, formData: FormData) => Promise<TimeOffActionState>;
  withdrawAction: (id: string) => Promise<void>;
}) {
  const [noteState, noteFormAction, notePending] = useActionState(addNoteAction, noteInitialState);
  const [deciding, startDecide] = useTransition();
  const [withdrawing, startWithdraw] = useTransition();
  const [showNotes, setShowNotes] = useState(request.notes.length > 0);

  const canDiscuss = isOwner || request.userId === currentUserId;
  const isPending = request.status === "pending";

  return (
    <div className="px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            {showRequester && <span className="text-sm font-medium text-slate-900">{request.userName}</span>}
            <Badge value={request.type} />
            <Badge value={request.status} />
          </div>
          <p className="mt-0.5 text-sm text-slate-700">
            {formatDate(request.startDate)}
            {request.endDate !== request.startDate && <> – {formatDate(request.endDate)}</>}
          </p>
          {request.reason && <p className="mt-0.5 text-xs text-slate-500">{request.reason}</p>}
          {request.status !== "pending" && request.decidedByName && (
            <p className="mt-0.5 text-xs text-slate-400">
              {request.status === "approved" ? "Approved" : "Declined"} by {request.decidedByName}
              {request.decidedAt ? ` on ${formatDate(request.decidedAt)}` : ""}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isOwner && isPending && (
            <>
              <button
                type="button"
                disabled={deciding}
                onClick={() => startDecide(() => decideAction(request.id, "approved"))}
                className="rounded-md border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={deciding}
                onClick={() => {
                  if (!window.confirm("Decline this request?")) return;
                  startDecide(() => decideAction(request.id, "declined"));
                }}
                className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                Decline
              </button>
            </>
          )}
          {!isOwner && isPending && request.userId === currentUserId && (
            <button
              type="button"
              disabled={withdrawing}
              onClick={() => {
                if (!window.confirm("Withdraw this request?")) return;
                startWithdraw(() => withdrawAction(request.id));
              }}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
            >
              Withdraw
            </button>
          )}
          {canDiscuss && (
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                showNotes
                  ? "border-brand bg-brand text-white"
                  : "border-slate-300 text-slate-600 hover:bg-slate-100"
              }`}
            >
              Discuss{request.notes.length > 0 ? ` (${request.notes.length})` : ""}
            </button>
          )}
        </div>
      </div>

      {canDiscuss && showNotes && (
        <div className="mt-1.5 space-y-1.5 rounded-md bg-slate-50 p-2">
          {request.notes.map((n) => (
            <div key={n.id} className="text-xs">
              {/* authorId null means this note was posted automatically
                  (the Sick auto-reply, see createTimeOffRequestAction) -
                  no human wrote it, so "Unknown" would be misleading. */}
              <span className="font-medium text-slate-700">
                {n.authorId === null ? "CG Ops" : (n.authorName ?? "Unknown")}
              </span>{" "}
              <span className="text-slate-400">{formatDate(n.createdAt)}</span>
              <p className="text-slate-600">{n.body}</p>
            </div>
          ))}
          <form action={noteFormAction} className="flex items-center gap-1.5">
            <input type="hidden" name="request_id" value={request.id} />
            <input
              type="text"
              name="body"
              placeholder="Write a note…"
              required
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-brand focus:outline-none"
            />
            <button
              type="submit"
              disabled={notePending}
              className="shrink-0 rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {notePending ? "…" : "Send"}
            </button>
          </form>
          {noteState.error && <p className="text-xs text-red-600">{noteState.error}</p>}
        </div>
      )}
    </div>
  );
}
