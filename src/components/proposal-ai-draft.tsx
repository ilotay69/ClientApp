"use client";

import { useState, useTransition } from "react";
import type { ProposalDraftResult, ProposalActionState } from "@/app/(dashboard)/proposals/actions";

type DraftBlock = {
  field: string;
  text: string;
  /** Whether the section this lands in already has the rep's own writing
   * in it - drives the single overwrite confirm below, not a per-block
   * button any more. */
  willOverwrite: boolean;
};

/** Drafts the client-facing sections from the priced line items and writes
 * them straight into the real, already-editable section fields below -
 * there's no separate read-only preview/apply step. The text lands where
 * you'll actually read, edit, or delete it, same as anything you'd have
 * typed yourself.
 *
 * The one thing this still guards against: silently clobbering writing a
 * rep already did. If any target section already has content, one confirm
 * covers the whole batch before anything is overwritten - a first-time
 * draft into empty sections never prompts at all. */
export function ProposalAiDraft({
  proposalId,
  generateAction,
  applyAction,
}: {
  proposalId: string;
  generateAction: (proposalId: string) => Promise<ProposalDraftResult>;
  applyAction: (proposalId: string, field: string, text: string) => Promise<ProposalActionState>;
}) {
  const [suggestions, setSuggestions] = useState<{ name: string; why: string }[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [generating, startGenerate] = useTransition();

  const generate = () => {
    setStatus(null);
    startGenerate(async () => {
      const result = await generateAction(proposalId);
      if ("error" in result) {
        setStatus({ ok: false, message: result.error });
        return;
      }

      const hasContent = (kind: string) =>
        result.targets.some((t) => t.kind === kind && t.hasContent);

      const blocks: DraftBlock[] = [
        { field: "overview", text: result.draft.overview, willOverwrite: hasContent("overview") },
        { field: "deploying", text: result.draft.deploying, willOverwrite: hasContent("steps") },
        { field: "benefits", text: result.draft.benefits, willOverwrite: hasContent("benefits") },
        { field: "pricingNote", text: result.draft.pricingNote, willOverwrite: hasContent("pricing") },
        { field: "nextSteps", text: result.draft.nextSteps, willOverwrite: hasContent("next_steps") },
      ].filter((block) => block.text.trim().length > 0);

      setSuggestions(result.draft.suggestions);

      if (blocks.length === 0) {
        setStatus({ ok: false, message: "The AI provider returned nothing usable. Try again." });
        return;
      }

      if (
        blocks.some((b) => b.willOverwrite) &&
        !window.confirm(
          "This replaces existing writing in one or more sections with the AI draft. Continue?"
        )
      ) {
        return;
      }

      let applied = 0;
      for (const block of blocks) {
        const res = await applyAction(proposalId, block.field, block.text);
        if (res.ok) applied++;
        else {
          setStatus({ ok: false, message: res.message });
          return;
        }
      }
      setStatus({
        ok: true,
        message: `Drafted ${applied} section${applied === 1 ? "" : "s"} - edit them directly below.`,
      });
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Draft with AI</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Writes the sections below from what you&apos;re quoting - edit or delete anything it
            writes, same as your own text.
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {generating ? "Writing…" : "Draft sections"}
        </button>
      </div>

      {status && (
        <p className={`mt-3 text-xs ${status.ok ? "text-emerald-700" : "text-red-600"}`}>
          {status.message}
        </p>
      )}

      {suggestions.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
            Worth quoting too
          </p>
          <p className="mt-0.5 text-xs text-amber-700">
            Gaps the AI spotted against what you&apos;ve priced. Nothing has been added - add any
            of these from the pricing table if they fit.
          </p>
          <ul className="mt-2 space-y-1.5">
            {suggestions.map((suggestion) => (
              <li key={suggestion.name} className="text-xs text-amber-900">
                <span className="font-medium">{suggestion.name}</span> - {suggestion.why}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
