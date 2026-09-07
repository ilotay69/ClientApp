"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { reviewMyMailbox, type MailboxReviewState } from "@/app/(dashboard)/dashboard/actions";

const initialState: MailboxReviewState = { error: null, result: null };

const FOCUS_PLACEHOLDER = `What do you want to know? For example:
"What's waiting on my reply, ranked by how overdue it is?"
"Summarize any conversations about pricing, quotes, or contract renewals."
"Find any client complaints or escalations."
Leave blank for the default: who's waiting on whom, most overdue first.`;

export function MailboxReviewPanel() {
  const [state, formAction, pending] = useActionState(reviewMyMailbox, initialState);
  const [days, setDays] = useState(30);
  const result = state.result;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Mailbox review</h2>
        <p className="text-xs text-slate-500">
          Live read of Inbox, Sent Items, and their subfolders — nothing here is saved. Automated
          notifications, newsletters, and alerts are filtered out automatically.
        </p>

        <form action={formAction} className="mt-3 space-y-2">
          <textarea
            name="focus"
            rows={4}
            placeholder={FOCUS_PLACEHOLDER}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Look back
              <input
                type="number"
                name="days"
                min={1}
                max={90}
                value={days}
                onChange={(e) => setDays(Math.min(90, Math.max(1, Number(e.target.value) || 1)))}
                className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              days (max 90)
            </label>
            <button
              type="submit"
              disabled={pending}
              className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              {pending ? "Analyzing..." : "Analyze my mailbox"}
            </button>
          </div>
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
        <div className="space-y-5 px-5 py-4">
          <p className="text-xs text-slate-500">{result.mailboxEmail}</p>

          {result.narrative.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing pending — you&apos;re all caught up.</p>
          ) : (
            <ul className="space-y-2">
              {result.narrative.map((sentence, i) => (
                <li
                  key={i}
                  className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                >
                  {sentence}
                </li>
              ))}
            </ul>
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

          {result.focusIgnored ? (
            <p className="text-xs text-amber-700">
              Your custom question needs an AI provider to answer — connect one on{" "}
              <Link href="/settings/integrations" className="underline">
                Integrations
              </Link>{" "}
              . Showing the default reply-tracking summary instead.
            </p>
          ) : (
            !result.aiAvailable && (
              <p className="text-xs text-slate-500">
                Using plain phrasing — connect an AI provider on{" "}
                <Link href="/settings/integrations" className="underline">
                  Integrations
                </Link>{" "}
                for topic-aware summaries and suggested actions.
              </p>
            )
          )}

          {result.hitPageCap && (
            <p className="text-xs text-slate-400">
              Based on the most recent messages from the last {days} day{days === 1 ? "" : "s"} — your
              mailbox has more than this scan could cover in one pass.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
