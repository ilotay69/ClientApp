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

// Mutually-exclusive integer-year buckets (years_experience is always a
// whole number) — page.tsx turns each into its own gte/lte range so a
// candidate falls into exactly one, with no shared boundary value.
const YEARS_OPTIONS = [
  { value: "under3", label: "<3 yrs" },
  { value: "3to5", label: "3-5 yrs" },
  { value: "6to10", label: "6-10 yrs" },
  { value: "11plus", label: "11+ yrs" },
];

const CURRENTLY_WORKING_OPTIONS = [
  { value: "yes", label: "Working: Yes" },
  { value: "no", label: "Working: No" },
];

// m365_technologies is a keyword list, not a boolean — "yes" means the
// field is non-null (some technology was evidenced), "no" means it's null.
const M365_OPTIONS = [
  { value: "yes", label: "365 Tech: Yes" },
  { value: "no", label: "365 Tech: No" },
];

const NO_RESUME_OPTION = { value: "yes", label: "No resume yet" };

export function ResumeFilterBar({
  statuses,
  verdicts,
  bigFirm,
  minYears,
  currentlyWorking,
  m365Management,
  noResumeYet,
  nameQuery,
  totalCount,
  clearHref,
}: {
  statuses: string[];
  verdicts: string[];
  bigFirm: string | null;
  minYears: string | null;
  currentlyWorking: string | null;
  m365Management: string | null;
  noResumeYet: boolean;
  nameQuery: string;
  totalCount: number;
  clearHref: string;
}) {
  const hasFilters =
    statuses.length > 0 ||
    verdicts.length > 0 ||
    Boolean(bigFirm) ||
    Boolean(minYears) ||
    Boolean(currentlyWorking) ||
    Boolean(m365Management) ||
    noResumeYet ||
    Boolean(nameQuery);

  return (
    <form action="/recruitment" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={nameQuery}
          placeholder="Search by name…"
          className="w-48 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Search
        </button>
        <span className="text-xs text-slate-500">
          {totalCount} resume{totalCount === 1 ? "" : "s"}
        </span>
      </div>
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
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        {CURRENTLY_WORKING_OPTIONS.map((o) => (
          <Chip
            key={`working-${o.value}`}
            name="working"
            option={o}
            checked={currentlyWorking === o.value}
            radio
          />
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        {M365_OPTIONS.map((o) => (
          <Chip
            key={`m365-${o.value}`}
            name="m365"
            option={o}
            checked={m365Management === o.value}
            radio
          />
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        <Chip name="no_resume" option={NO_RESUME_OPTION} checked={noResumeYet} />
        {hasFilters && (
          <a href={clearHref} className="text-xs text-slate-500 underline">
            Clear filters
          </a>
        )}
      </div>
    </form>
  );
}
