"use client";

// Same auto-submitting checkbox-chip approach as task-filter-bar.tsx —
// a plain GET form, filtering happens server-side in page.tsx's query
// against the URL params this produces.

function Chip({
  name,
  option,
  checked,
  radio = false,
}: {
  name: string;
  option: { value: string; label: string };
  checked: boolean;
  /** Big Firm and Years Experience are single-value filters (radio), not
   * multi-select like status/verdict (checkbox) — both selected at once on
   * a binary/threshold filter would just be a confusing no-op. */
  radio?: boolean;
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
        type={radio ? "radio" : "checkbox"}
        name={name}
        value={option.value}
        defaultChecked={checked}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        onClick={(e) => {
          // Radios can't be unchecked by clicking them again by default —
          // this lets clicking the already-selected option clear the filter.
          if (radio && checked) {
            e.preventDefault();
            const input = e.currentTarget;
            input.checked = false;
            input.form?.requestSubmit();
          }
        }}
        className="sr-only"
      />
      {option.label}
    </label>
  );
}

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
];

const VERDICT_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No" },
];

const BIG_FIRM_OPTIONS = [
  { value: "yes", label: "Big firm: Yes" },
  { value: "no", label: "Big firm: No" },
];

// Mutually-exclusive buckets, not open-ended minimums — page.tsx turns
// each into its own gte/lt range so a candidate falls into exactly one.
const YEARS_OPTIONS = [
  { value: "under3", label: "<3 yrs" },
  { value: "3to5", label: "3-5 yrs" },
  { value: "5to10", label: "5-10 yrs" },
  { value: "10plus", label: "10+ yrs" },
];

export function ResumeFilterBar({
  statuses,
  verdicts,
  bigFirm,
  minYears,
  clearHref,
}: {
  statuses: string[];
  verdicts: string[];
  bigFirm: string | null;
  minYears: string | null;
  clearHref: string;
}) {
  const hasFilters =
    statuses.length > 0 || verdicts.length > 0 || Boolean(bigFirm) || Boolean(minYears);

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
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        {BIG_FIRM_OPTIONS.map((o) => (
          <Chip
            key={`big_firm-${o.value}`}
            name="big_firm"
            option={o}
            checked={bigFirm === o.value}
            radio
          />
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        {YEARS_OPTIONS.map((o) => (
          <Chip
            key={`min_years-${o.value}`}
            name="min_years"
            option={o}
            checked={minYears === o.value}
            radio
          />
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
