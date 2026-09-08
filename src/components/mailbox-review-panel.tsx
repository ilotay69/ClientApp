"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { reviewMyMailbox, type MailboxReviewState, type SnapshotSender } from "@/app/(dashboard)/dashboard/actions";

const initialState: MailboxReviewState = { error: null, result: null };

const FOCUS_PLACEHOLDER = `What do you want to know? For example:
"What's waiting on my reply, ranked by how overdue it is?"
"Summarize any conversations about pricing, quotes, or contract renewals."
"Find any client complaints or escalations."
Leave blank for the default: who's waiting on whom, most overdue first.`;

/** Appends any of `emails` not already present (case-insensitive) to a
 * comma-separated field's current text — so adding an already-listed
 * sender again is a no-op instead of a duplicate. */
function addTerms(current: string, emails: string[]): string {
  const terms = current
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const existing = new Set(terms.map((t) => t.toLowerCase()));
  for (const email of emails) {
    if (!existing.has(email.toLowerCase())) {
      terms.push(email);
      existing.add(email.toLowerCase());
    }
  }
  return terms.join(", ");
}

function SenderPicker({
  fetchSendersAction,
  onAddExclude,
  onAddNeverStore,
}: {
  fetchSendersAction: () => Promise<{ senders: SnapshotSender[] } | { error: string }>;
  onAddExclude: (emails: string[]) => void;
  onAddNeverStore: (emails: string[]) => void;
}) {
  const [senders, setSenders] = useState<SnapshotSender[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, startLoad] = useTransition();

  const load = () => {
    setError(null);
    startLoad(async () => {
      const result = await fetchSendersAction();
      if ("error" in result) {
        setError(result.error);
      } else {
        setSenders(result.senders);
        setChecked(new Set());
      }
    });
  };

  const toggle = (email: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  if (!senders) {
    return (
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="text-xs text-brand underline hover:text-brand-dark disabled:opacity-60"
      >
        {loading ? "Loading senders…" : error ? "Retry loading senders" : "Pick from senders in your mailbox"}
      </button>
    );
  }

  if (senders.length === 0) {
    return <p className="text-xs text-slate-400">No senders found yet in your synced mailbox.</p>;
  }

  return (
    <div className="rounded-md border border-slate-200 p-2">
      <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
        {senders.map((s) => (
          <label key={s.email} className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={checked.has(s.email)}
              onChange={() => toggle(s.email)}
              className="rounded border-slate-300"
            />
            <span className="truncate">
              {s.name ? `${s.name} <${s.email}>` : s.email} ({s.count})
            </span>
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
        <span className="text-xs text-slate-500">{checked.size} selected</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={checked.size === 0}
            onClick={() => {
              onAddExclude([...checked]);
              setChecked(new Set());
            }}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            + Exclude from analysis
          </button>
          <button
            type="button"
            disabled={checked.size === 0}
            onClick={() => {
              onAddNeverStore([...checked]);
              setChecked(new Set());
            }}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            + Never store
          </button>
        </div>
      </div>
    </div>
  );
}

export function MailboxReviewPanel({
  initialDays = 30,
  initialExcludes = "",
  initialNeverStore = "",
  fetchSendersAction,
}: {
  initialDays?: number;
  initialExcludes?: string;
  initialNeverStore?: string;
  fetchSendersAction: () => Promise<{ senders: SnapshotSender[] } | { error: string }>;
}) {
  const [state, formAction, pending] = useActionState(reviewMyMailbox, initialState);
  const [days, setDays] = useState(initialDays);
  const [excludes, setExcludes] = useState(initialExcludes);
  const [neverStore, setNeverStore] = useState(initialNeverStore);
  const result = state.result;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Mailbox review</h2>
        <p className="text-xs text-slate-500">
          Reads from a local copy of your mailbox (Deleted Items, Junk, and Drafts excluded) kept
          in sync roughly every 30 minutes — not a live scan each time. Automated notifications,
          newsletters, and alerts are filtered out automatically, on top of anything you exclude
          yourself below.
        </p>

        <form action={formAction} className="mt-3 space-y-2">
          <textarea
            name="focus"
            rows={4}
            placeholder={FOCUS_PLACEHOLDER}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />

          <SenderPicker
            fetchSendersAction={fetchSendersAction}
            onAddExclude={(emails) => setExcludes((prev) => addTerms(prev, emails))}
            onAddNeverStore={(emails) => setNeverStore((prev) => addTerms(prev, emails))}
          />

          <label className="block text-xs text-slate-600">
            Exclude senders/subjects containing (optional) — hides matches from this analysis only
            <input
              type="text"
              name="excludes"
              value={excludes}
              onChange={(e) => setExcludes(e.target.value)}
              placeholder="e.g. CG Helpdesk, billing, no-reply"
              className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm placeholder:text-slate-400"
            />
          </label>
          <label className="block text-xs text-slate-600">
            Never store emails from (optional) — these are never saved to the local copy at all,
            and any already stored are deleted immediately when you save
            <input
              type="text"
              name="neverStore"
              value={neverStore}
              onChange={(e) => setNeverStore(e.target.value)}
              placeholder="e.g. personal@gmail.com, hr@cgtechnologies.com"
              className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm placeholder:text-slate-400"
            />
          </label>
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

          <p className="text-xs text-slate-400">
            Based on your last {days} day{days === 1 ? "" : "s"}, synced{" "}
            {result.syncedAsOf ? new Date(result.syncedAsOf).toLocaleString() : "just now"}.
          </p>
        </div>
      )}
    </div>
  );
}
