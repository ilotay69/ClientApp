"use client";

import { useState, useTransition } from "react";
import { InlineTextEdit } from "@/components/task-field-editor";
import { DeleteButton } from "@/components/delete-button";
import type { ProposalSection } from "@/lib/proposal-data";

/** One editable section of a proposal.
 *
 * Reordering is ▲/▼ rather than drag-and-drop on purpose: HTML5 DnD does
 * nothing at all on touch, and repricing a proposal on an iPad between
 * meetings is a case this has to work for. Buttons are also keyboard- and
 * screen-reader-operable without any extra work. */
export function ProposalSectionEditor({
  section,
  index,
  total,
  disabled,
  updateAction,
  moveAction,
  deleteAction,
}: {
  section: ProposalSection;
  index: number;
  total: number;
  disabled?: boolean;
  updateAction: (sectionId: string, field: "heading" | "body", value: string) => Promise<void>;
  moveAction: (sectionId: string, direction: "up" | "down") => Promise<void>;
  deleteAction: () => Promise<void>;
}) {
  const [body, setBody] = useState(section.body ?? "");
  const [pending, startTransition] = useTransition();

  const saveBody = () => {
    if (body === (section.body ?? "")) return;
    startTransition(() => {
      updateAction(section.id, "body", body);
    });
  };

  return (
    <section
      id={`sec-${section.id}`}
      className="scroll-mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-xs font-semibold tabular-nums tracking-[0.2em] text-slate-400">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1 text-sm font-semibold text-slate-900">
          <InlineTextEdit
            taskId={section.id}
            field="heading"
            value={section.heading}
            disabled={disabled}
            action={(id, field, value) => updateAction(id, field as "heading", value)}
          />
        </div>
        {section.kind === "pricing" && (
          <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
            Pricing
          </span>
        )}
        <div className="flex shrink-0 items-center gap-1">
          <MoveButton
            label="Move up"
            glyph="▲"
            disabled={disabled || index === 0}
            onClick={() => moveAction(section.id, "up")}
          />
          <MoveButton
            label="Move down"
            glyph="▼"
            disabled={disabled || index === total - 1}
            onClick={() => moveAction(section.id, "down")}
          />
        </div>
      </div>

      <textarea
        value={body}
        rows={5}
        disabled={disabled || pending}
        onChange={(e) => setBody(e.target.value)}
        onBlur={saveBody}
        placeholder={
          section.kind === "pricing"
            ? "Optional lead-in above the pricing table…"
            : "Write this section. Line breaks are kept as-is."
        }
        className="mt-3 w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm focus:border-brand focus:outline-none disabled:opacity-60"
      />

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-slate-400">{pending ? "Saving…" : "Saves when you click away"}</span>
        {!disabled && section.kind !== "pricing" && (
          <DeleteButton
            action={deleteAction}
            confirmText={`Delete the "${section.heading}" section?`}
            label="Remove"
          />
        )}
      </div>
    </section>
  );
}

function MoveButton({
  label,
  glyph,
  disabled,
  onClick,
}: {
  label: string;
  glyph: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled || pending}
      onClick={() => startTransition(() => void onClick())}
      className="rounded-md border border-slate-300 p-1.5 text-xs leading-none text-slate-600 hover:bg-slate-100 disabled:opacity-30"
    >
      {glyph}
    </button>
  );
}
