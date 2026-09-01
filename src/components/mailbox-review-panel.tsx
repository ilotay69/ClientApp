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

          {!result.aiAvailable && (
            <p className="text-xs text-slate-500">
              Using plain phrasing — connect an AI provider on{" "}
              <Link href="/settings/integrations" className="underline">
                Integrations
              </Link>{" "}
              for topic-aware summaries and suggested actions.
            </p>
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
