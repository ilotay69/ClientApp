"use client";

import { useState, useTransition, type ReactNode } from "react";
import { formatMoney } from "@/lib/proposal-totals";
import type { AutotaskPushPreview, AutotaskPushCompanyChoice } from "@/lib/proposal-autotask-push";

type PreviewResult = AutotaskPushPreview | { error: string };
type PushResult = { ok: true; quoteId: number } | { error: string };

/** Card shell matching the rest of the proposal page's left rail — this
 * sits among the readiness/brochure/send cards, and a bare button or a
 * loose line of grey text reads as stray content next to them. */
function AutotaskCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Autotask</p>
      {children}
    </div>
  );
}

/** "Push to Autotask" — turns this proposal into a real Autotask Quote.
 * Not an invoice: Autotask's API can't create those at all (see
 * src/lib/proposal-autotask-push.ts) - a Quote is what someone then
 * reviews and marks Won inside Autotask itself.
 *
 * Two-step by design: previewAction only ever reads (which company will
 * be used/needs creating, which lines matched a real Autotask service),
 * so nothing is written to Autotask until pushAction is explicitly
 * confirmed with whatever company choice the preview required. */
export function ProposalAutotaskPushButton({
  proposalId,
  currency,
  alreadyPushedQuoteId,
  previewAction,
  pushAction,
}: {
  proposalId: string;
  currency: string;
  alreadyPushedQuoteId: number | null;
  previewAction: (proposalId: string) => Promise<PreviewResult>;
  pushAction: (proposalId: string, companyChoice: AutotaskPushCompanyChoice | null) => Promise<PushResult>;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [companyChoice, setCompanyChoice] = useState<AutotaskPushCompanyChoice | null>(null);
  const [loading, startLoad] = useTransition();
  const [pushing, startPush] = useTransition();
  const [pushResult, setPushResult] = useState<PushResult | null>(null);
  const [pushedQuoteId, setPushedQuoteId] = useState<number | null>(alreadyPushedQuoteId);

  const openDialog = () => {
    setOpen(true);
    setPushResult(null);
    setPreview(null);
    setCompanyChoice(null);
    startLoad(async () => {
      const result = await previewAction(proposalId);
      setPreview(result);
      // Nothing to choose when there's no existing link and no name match
      // at all — creating a new company is the only option, so pick it
      // automatically rather than making someone click a single radio.
      if (!("error" in result) && result.existingCompanyId === null && result.possibleCompanyMatches.length === 0) {
        setCompanyChoice({ type: "create_new" });
      }
    });
  };

  const confirm = () => {
    startPush(async () => {
      const result = await pushAction(proposalId, companyChoice);
      setPushResult(result);
      if ("ok" in result) {
        setPushedQuoteId(result.quoteId);
        setOpen(false);
      }
    });
  };

  if (pushedQuoteId) {
    return (
      <AutotaskCard>
        <p className="mt-2 text-xs text-emerald-700">Pushed as Quote #{pushedQuoteId}.</p>
        <p className="mt-1 text-xs text-slate-500">
          Mark it Won in Autotask to turn it into an invoice.
        </p>
      </AutotaskCard>
    );
  }

  return (
    <>
      <AutotaskCard>
        <p className="mt-2 text-xs text-slate-500">
          Create the matching Quote in Autotask from this proposal&apos;s line items.
        </p>
        <button
          type="button"
          onClick={openDialog}
          className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Push to Autotask
        </button>
      </AutotaskCard>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Push to Autotask</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Creates a Quote in Autotask with this proposal&apos;s line items. Someone still needs to
              open it in Autotask and mark it Won to actually generate an invoice there.
            </p>

            {loading && <p className="mt-4 text-sm text-slate-500">Checking Autotask…</p>}

            {preview && "error" in preview && (
              <p className="mt-4 text-sm text-red-600">{preview.error}</p>
            )}

            {preview && !("error" in preview) && (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Company</p>
                  {preview.existingCompanyId !== null ? (
                    <p className="mt-1 text-sm text-slate-700">
                      Already linked to Autotask company #{preview.existingCompanyId} — used as-is.
                    </p>
                  ) : (
                    <div className="mt-1.5 space-y-1.5">
                      {preview.possibleCompanyMatches.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="radio"
                            name="company-choice"
                            checked={companyChoice?.type === "use_existing" && companyChoice.companyId === c.id}
                            onChange={() => setCompanyChoice({ type: "use_existing", companyId: c.id })}
                            className="h-4 w-4"
                          />
                          {c.companyName}{" "}
                          <span className="text-xs text-slate-400">(existing Autotask company)</span>
                        </label>
                      ))}
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="company-choice"
                          checked={companyChoice?.type === "create_new"}
                          onChange={() => setCompanyChoice({ type: "create_new" })}
                          className="h-4 w-4"
                        />
                        Create a new company &quot;{preview.companyName}&quot; in Autotask
                      </label>
                      {preview.possibleCompanyMatches.length === 0 && (
                        <p className="text-xs text-slate-400">
                          No existing Autotask company matched this name.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Line items</p>
                  <div className="mt-1.5 divide-y divide-slate-100 rounded-md border border-slate-200">
                    {preview.lines.map((line) => (
                      <div key={line.lineItemId} className="flex items-start justify-between gap-2 px-3 py-1.5 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-slate-700">{line.description}</span>
                          {/* The catalog item by name, not just "matched" —
                              an unmatched line falls back to a loose
                              contains-match, so this is the only place a
                              wrong one is catchable before it's written. */}
                          {line.matchedCatalog ? (
                            <span className="block truncate text-xs text-emerald-700">
                              → {line.matchedCatalog.name}
                            </span>
                          ) : (
                            <span className="block truncate text-xs text-amber-700">
                              → no match, uses the fallback service
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums text-slate-900">
                          {formatMoney(line.unitPrice * line.quantity, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {preview.unmatchedLineCount > 0 && !preview.fallbackServiceConfigured && (
                    <p className="mt-1.5 text-xs text-red-600">
                      {preview.unmatchedLineCount} line{preview.unmatchedLineCount === 1 ? "" : "s"} didn&apos;t
                      match a real Autotask service, and no fallback is configured yet (Settings →
                      Integrations → Autotask). Pushing will fail until one is set.
                    </p>
                  )}
                </div>

                {preview.alreadyPushed && (
                  <p className="text-xs text-amber-700">
                    This was already pushed as Quote #{preview.alreadyPushed.quoteId} — pushing again
                    will just point back to that same Quote.
                  </p>
                )}

                {pushResult && "error" in pushResult && (
                  <p className="text-sm text-red-600">{pushResult.error}</p>
                )}

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={
                      pushing ||
                      (preview.existingCompanyId === null && !companyChoice) ||
                      (preview.unmatchedLineCount > 0 && !preview.fallbackServiceConfigured)
                    }
                    onClick={confirm}
                    className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
                  >
                    {pushing ? "Pushing…" : "Confirm & Push"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
