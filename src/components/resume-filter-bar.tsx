"use client";

// Same auto-submitting checkbox-chip approach as task-filter-bar.tsx —
// a plain GET form, filtering happens server-side in page.tsx's query
// against the URL params this produces. Simpler than that component since
// this page has only two filter dimensions and no other tab's params to
// preserve.

function Chip({
  name,
  option,
  checked,
}: {
  name: string;
  option: { value: string; label: string };
  checked: boolean;
}) {
  return (
    <label
      className={`cursor-pointer rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
        checked
          ? "bg-charcoal text-white"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
      }`}
    >
      <input
        type="checkbox"
        name={name}
        value={option.value}
        defaultChecked={checked}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="sr-only"
      />
      {option.label}
    </label>
  );
}

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "contacted", label: "Contacted" },
  { value: "rejected", label: "Rejected" },
  { value: "hired", label: "Hired" },
];

const VERDICT_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No" },
];

export function ResumeFilterBar({
  statuses,
  verdicts,
  clearHref,
}: {
  statuses: string[];
  verdicts: string[];
  clearHref: string;
}) {
  const hasFilters = statuses.length > 0 || verdicts.length > 0;

  return (
    <form action="/recruitment" className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_OPTIONS.map((o) => (
          <Chip key={`status-${o.value}`} name="status" option={o} checked={statuses.includes(o.value)} />
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        {VERDICT_OPTIONS.map((o) => (
          <Chip key={`verdict-${o.value}`} name="verdict" option={o} checked={verdicts.includes(o.value)} />
        ))}
        {hasFilters && (
          <a href={clearHref} className="text-xs text-slate-500 underline">
            Clear filters
          </a>
        )}
      </div>
    </form>
  );
}
