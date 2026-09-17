"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatAge } from "@/lib/format";
import type { ProposalActionState } from "@/app/(dashboard)/proposals/actions";

type Action = () => Promise<ProposalActionState>;

/** Everything you do to a proposal once the writing is done: send it, chase
 * it, record what happened to it.
 *
 * Before sending, it's an email box and one button gated on the readiness
 * checklist. After sending, it becomes the follow-up console — the link to
 * copy into a chat, what's happened to it so far, and the four ways a
 * proposal actually ends (accepted on a call, declined, revised, or
 * withdrawn). */
export function ProposalSendPanel({
  status,
  defaultEmail,
  blockers,
  viewUrl,
  sentAt,
  sentToEmail,
  viewCount,
  lastViewedAt,
  reminderCount,
  sendAction,
  markAcceptedAction,
  declineAction,
  withdrawAction,
  reviseAction,
  revokeLinkAction,
}: {
  status: string;
  defaultEmail: string;
  blockers: string[];
  viewUrl: string | null;
  sentAt: string | null;
  sentToEmail: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  reminderCount: number;
  sendAction: (toEmail: string) => Promise<ProposalActionState>;
  markAcceptedAction: (name: string) => Promise<ProposalActionState>;
  declineAction: (reason: string) => Promise<ProposalActionState>;
  withdrawAction: Action;
  reviseAction: Action;
  revokeLinkAction: Action;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [acceptedBy, setAcceptedBy] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [result, setResult] = useState<ProposalActionState | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<ProposalActionState>) => {
    setResult(null);
    startTransition(async () => setResult(await fn()));
  };

  const isDraft = status === "draft";
  const isSent = status === "sent";
  const isClosed = !isDraft && !isSent;

  // Polls for the "Opened"/"Reminders" stats while a proposal is actually
  // out for signature — a rep watching this page after sending it sees an
  // open land without a manual reload. Stops once it's no longer "sent"
  // (accepted/declined/withdrawn — nothing left to watch for), and only
  // fires while the tab is actually visible, so a forgotten background tab
  // doesn't keep polling. router.refresh() re-runs the page's own Server
  // Component fetch, same mechanism as DashboardRefreshButton — one
  // indexed lookup by id, negligible load even run continuously by a
  // couple of open tabs.
  useEffect(() => {
    if (!isSent) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 10_000);
    return () => clearInterval(id);
  }, [isSent, router]);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">
        {isDraft ? "Send to client" : "Follow up"}
      </h2>

      {isDraft && (
        <>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Send to
            </span>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com, another@company.com"
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
            />
            <span className="mt-1 block text-xs text-slate-400">
              Separate multiple addresses with a comma or semicolon.
            </span>
          </label>

          {blockers.length > 0 && (
            <p className="text-xs text-amber-700">
              Finish the readiness checklist first — {blockers[0]}
            </p>
          )}

          <button
            type="button"
            disabled={pending || blockers.length > 0 || !email.trim()}
            onClick={() => run(() => sendAction(email))}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send proposal"}
          </button>
          <p className="text-xs text-slate-400">
            No PDF is attached — the email drives them to the link, which is where opens are
            counted and where they can accept.
          </p>
        </>
      )}

      {!isDraft && viewUrl && (
        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Their link
          </span>
          <div className="flex gap-2">
            <input
              readOnly
              value={viewUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600"
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(viewUrl).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {!isDraft && !viewUrl && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The link has been revoked — anyone opening it now sees an invalid-link page. Sending
          again will issue a new one.
        </p>
      )}

      {sentAt && (
        <dl className="space-y-1 text-xs text-slate-500">
          <Line label="Sent">
            {formatDate(sentAt)}
            {sentToEmail ? ` to ${sentToEmail}` : ""}
          </Line>
          <Line label="Opened">
            {viewCount === 0
              ? "Not yet"
              : `${viewCount}× · last ${formatAge(lastViewedAt)} ago`}
          </Line>
          {reminderCount > 0 && (
            <Line label="Reminders">
              {reminderCount} sent
            </Line>
          )}
        </dl>
      )}

      {isSent && (
        <div className="space-y-3 border-t border-slate-200 pt-3">
          <button
            type="button"
            disabled={pending || !email.trim()}
            onClick={() => run(() => sendAction(email))}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send a reminder"}
          </button>

          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Accepted on a call?
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={acceptedBy}
                onChange={(e) => setAcceptedBy(e.target.value)}
                placeholder="Who accepted it"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                disabled={pending || !acceptedBy.trim()}
                onClick={() => run(() => markAcceptedAction(acceptedBy))}
                className="shrink-0 rounded-md border border-emerald-300 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                Record
              </button>
            </div>
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              They said no
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Why, if they said"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => declineAction(declineReason))}
                className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Declined
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <SmallButton pending={pending} onClick={() => run(reviseAction)}>
              Revise
            </SmallButton>
            <SmallButton pending={pending} onClick={() => run(withdrawAction)}>
              Withdraw
            </SmallButton>
            <SmallButton pending={pending} onClick={() => run(revokeLinkAction)}>
              Revoke link
            </SmallButton>
          </div>
        </div>
      )}

      {isClosed && (
        <div className="border-t border-slate-200 pt-3">
          <SmallButton pending={pending} onClick={() => run(reviseAction)}>
            Reopen as draft
          </SmallButton>
        </div>
      )}

      {result && (
        <p className={`text-xs ${result.ok ? "text-emerald-700" : "text-red-600"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      {/* min-w-0 lets a flex child shrink below its content's intrinsic
          width — without it, a long value (several semicolon-joined email
          addresses) refused to wrap and overflowed past the card's edge,
          into whatever sat next to it. break-words forces a wrap even
          without whitespace to break at, since an email/address list has
          none. */}
      <dd className="min-w-0 flex-1 text-right break-words text-slate-600">{children}</dd>
    </div>
  );
}

function SmallButton({
  pending,
  onClick,
  children,
}: {
  pending: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
