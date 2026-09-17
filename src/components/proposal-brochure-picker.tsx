"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ProposalBrochure } from "@/lib/proposal-brochures";

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Which library brochures go out with this proposal.
 *
 * A checked brochure does two things: it's attached to the send email, and
 * it shows as a link on the prospect's own page. One checkbox rather than
 * separate "email" / "on page" toggles — see setProposalBrochuresAction.
 *
 * Autosaves the whole set on every toggle (debounced by React's own
 * transition batching), the same "no separate Save button" posture as
 * every other field on this page. */
export function ProposalBrochurePicker({
  proposalId,
  library,
  initialSelectedIds,
  disabled,
  setAction,
}: {
  proposalId: string;
  library: ProposalBrochure[];
  initialSelectedIds: string[];
  disabled?: boolean;
  setAction: (proposalId: string, brochureIds: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelectedIds));
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    startTransition(() => {
      void setAction(proposalId, [...next]);
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Brochures</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Checked ones attach to the email and show as a link on their page.
          </p>
        </div>
        {!disabled && (
          <Link
            href="/proposals/brochures"
            className="shrink-0 text-xs text-slate-500 underline hover:text-slate-800"
          >
            Manage library
          </Link>
        )}
        {pending && <span className="text-xs text-slate-400">Saving…</span>}
      </div>

      {library.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          No brochures uploaded yet.{" "}
          <Link href="/proposals/brochures" className="underline hover:text-slate-800">
            Add one
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {library.map((b) => (
            <li key={b.id}>
              <label
                className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${
                  disabled ? "text-slate-400" : "cursor-pointer text-slate-700 hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(b.id)}
                  disabled={disabled}
                  onChange={() => toggle(b.id)}
                  className="h-4 w-4 shrink-0 rounded border-slate-300"
                />
                <span className="min-w-0 flex-1 truncate" title={b.title}>
                  {b.title}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{formatSize(b.sizeBytes)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
