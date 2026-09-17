"use client";

import { useState, useTransition } from "react";
import type { ProposalDraftResult, ProposalActionState } from "@/app/(dashboard)/proposals/actions";

type DraftBlock = {
  field: string;
  label: string;
  text: string;
  /** Whether the section this would land in already has the rep's own
   * writing in it. Applying overwrites, so the button says so. */
  willOverwrite: boolean;
};

/** Drafts the client-facing sections from the priced line items, then shows
 * the result for review.
 *
 * Nothing is written automatically, and there's no "apply everything"
 * button. This text goes out under CG's name to someone deciding whether to
 * spend money — an AI paragraph nobody read is a liability, not a
 * time-saver. Each block is applied on its own, and a block that would
 * replace existing writing says "Replace" rather than "Use this". */
export function ProposalAiDraft({
  proposalId,
  generateAction,
  applyAction,
}: {
  proposalId: string;
  generateAction: (proposalId: string) => Promise<ProposalDraftResult>;
  applyAction: (proposalId: string, field: string, text: string) => Promise<ProposalActionState>;
}) {
  const [blocks, setBlocks] = useState<DraftBlock[] | null>(null);
  const [suggestions, setSuggestions] = useState<{ name: string; why: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [generating, startGenerate] = useTransition();

  const generate = () => {
    setError(null);
    setApplied(new Set());
    startGenerate(async () => {
      const result = await generateAction(proposalId);
      if ("error" in result) {
        setError(result.error);
        setBlocks(null);
        return;
      }

      const hasContent = (kind: string) =>
        result.targets.some((t) => t.kind === kind && t.hasContent);

      setBlocks(
        [
          { field: "overview", label: "Overview", text: result.draft.overview, willOverwrite: hasContent("overview") },
          { field: "deploying", label: "What we're deploying", text: result.draft.deploying, willOverwrite: hasContent("steps") },
          { field: "benefits", label: "What this gives you", text: result.draft.benefits, willOverwrite: hasContent("benefits") },
          { field: "pricingNote", label: "Lead-in above pricing", text: result.draft.pricingNote, willOverwrite: hasContent("pricing") },
          { field: "nextSteps", label: "Next steps", text: result.draft.nextSteps, willOverwrite: hasContent("next_steps") },
        ].filter((block) => block.text.trim().length > 0)
      );
      setSuggestions(result.draft.suggestions);
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Draft with AI</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Writes the sections from what you&apos;re quoting. Review each one before it goes in.
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {generating ? "Writing…" : blocks ? "Redraft" : "Draft sections"}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {blocks && blocks.length > 0 && (
        <div className="mt-4 space-y-3">
          {blocks.map((block) => (
            <DraftCard
              key={block.field}
              block={block}
              applied={applied.has(block.field)}
              onApply={async () => {
                const result = await applyAction(proposalId, block.field, block.text);
                if (result.ok) setApplied((prev) => new Set(prev).add(block.field));
                else setError(result.message);
              }}
            />
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
            Worth quoting too
          </p>
          <p className="mt-0.5 text-xs text-amber-700">
            Gaps the AI spotted against what you&apos;ve priced. Nothing has been added — add any
            of these from the pricing table if they fit.
          </p>
          <ul className="mt-2 space-y-1.5">
            {suggestions.map((suggestion) => (
              <li key={suggestion.name} className="text-xs text-amber-900">
                <span className="font-medium">{suggestion.name}</span> — {suggestion.why}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DraftCard({
  block,
  applied,
  onApply,
}: {
  block: DraftBlock;
  applied: boolean;
  onApply: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {block.label}
        </p>
        <button
          type="button"
          disabled={pending || applied}
          onClick={() => startTransition(() => void onApply())}
          className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-60 ${
            applied
              ? "border border-emerald-300 text-emerald-700"
              : block.willOverwrite
                ? "border border-amber-300 text-amber-800 hover:bg-amber-50"
                : "bg-brand text-white hover:bg-brand-dark"
          }`}
        >
          {applied ? "Applied" : pending ? "Applying…" : block.willOverwrite ? "Replace" : "Use this"}
        </button>
      </div>
      <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-700">
        {block.text}
      </p>
    </div>
  );
}
