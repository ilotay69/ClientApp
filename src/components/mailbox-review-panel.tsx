"use client";

import Link from "next/link";
import { useActionState } from "react";
import { reviewMyMailbox, type MailboxReviewState } from "@/app/(dashboard)/dashboard/actions";

const initialState: MailboxReviewState = { error: null, result: null };

export function MailboxReviewPanel() {
  const [state, formAction, pending] = useActionState(reviewMyMailbox, initialState);
  const result = state.result;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Mailbox review</h2>
          <p className="text-xs text-slate-500">
            Live read of your last 30 days — nothing here is saved.
          </p>
        </div>
        <form action={formAction}>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            {pending ? "Analyzing..." : "Analyze my mailbox"}
          </button>
        </form>
      </div>

      {state.error && (
        <p className="px-5 py-4 text-sm text-red-600">
          {state.error}{" "}
          {state.error.includes("Mailbox settings") && (
            <Link href="/settings/mail" className="underline">
              Go there
            </Link>
          )}
        </p>
      )}

      {result && (
        <div className="space-y-6 px-5 py-4">
          <p className="text-xs text-slate-500">{result.mailboxEmail}</p>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <ThreadList
              title="Awaiting your reply"
              emptyText="Nothing waiting on you."
              items={result.awaitingYourReply}
            />
            <ThreadList
              title="Awaiting their reply"
              emptyText="Nothing waiting on anyone else."
              items={result.awaitingTheirReply}
            />
          </div>

          {result.aiAvailable ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <FlaggedList title="Quotes flagged" items={result.quotesFlagged} />
              <FlaggedList title="Project mentions" items={result.projectMentions} />
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Configure an AI provider on the{" "}
              <Link href="/settings/ai" className="underline">
                AI Settings
              </Link>{" "}
              page to also see quote and project flags here.
            </p>
          )}

          {result.suggestedActions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Suggested actions
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {result.suggestedActions.map((action, i) => (
                  <li key={i}>{action}</li>
                ))}
              </ul>
            </div>
          )}

          {result.hitPageCap && (
            <p className="text-xs text-slate-400">
              Based on the most recent messages from the last 30 days — your mailbox has more
              than this scan could cover in one pass.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ThreadList({
  title,
  emptyText,
  items,
}: {
  title: string;
  emptyText: string;
  items: { subject: string; contact: string; daysPending: number; snippet: string }[];
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item, i) => (
            <li key={i} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-slate-900">{item.subject}</p>
                <span className="shrink-0 text-xs text-slate-500">{item.daysPending}d</span>
              </div>
              <p className="text-xs text-slate-500">{item.contact}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FlaggedList({
  title,
  items,
}: {
  title: string;
  items: { subject: string; contact: string; note: string }[];
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">None found.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item, i) => (
            <li key={i} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-sm font-medium text-slate-900">{item.subject}</p>
              <p className="text-xs text-slate-500">{item.contact}</p>
              <p className="mt-1 text-xs text-slate-600">{item.note}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
