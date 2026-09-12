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

// Matches Indeed's own applicant status stages, plus "invited" for a
// candidate who's been sent an interview invite/booking link but hasn't
// interviewed yet.
const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "contacting", label: "Contacting" },
  { value: "invited", label: "Invited" },
  { value: "interviewing", label: "Interviewing" },
  { value: "rejected", label: "Rejected" },
  { value: "hired", label: "Hired" },
];

const VERDICT_OPTIONS = [
  { value: "yes", label: "AI: Yes" },
  { value: "maybe", label: "AI: Maybe" },
  { value: "no", label: "AI: No" },
];

const OUR_VERDICT_OPTIONS = [
  { value: "yes", label: "Our: Yes" },
  { value: "maybe", label: "Our: Maybe" },
  { value: "no", label: "Our: No" },
];

const BIG_FIRM_OPTIONS = [
  { value: "yes", label: "Big firm: Yes" },
  { value: "no", label: "Big firm: No" },
];

// Integer-year buckets (years_experience is always a whole number), no two
// sharing a boundary value — multi-select, so page.tsx ORs together
// whichever buckets are checked rather than picking just one.
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

const GTA_OPTIONS = [
  { value: "yes", label: "GTA: Yes" },
  { value: "no", label: "GTA: No" },
];

const STABILITY_OPTIONS = [
  { value: "stable", label: "Stable" },
  { value: "frequent_changes", label: "Frequent changes" },
];

const CANADA_OPTIONS = [
  { value: "yes", label: "Last job: CA" },
  { value: "no", label: "Last job: Not CA" },
];

const NO_RESUME_OPTION = { value: "yes", label: "No resume yet" };

// A one-click preset, not a toggle chip — a plain link to a URL carrying
// only these params, so navigating to it both resets every other filter
// and sets exactly this set in one go, with no extra client-side logic
// needed to "clear then apply".
const AUTO_SUGGEST_HREF =
  "/recruitment?verdict=yes&big_firm=no&min_years=3to5&min_years=6to10&working=yes&gta=yes&m365=yes&stability=stable&canada=yes";

export function ResumeFilterBar({
  statuses,
  verdicts,
  ourVerdicts,
  bigFirm,
  minYears,
  currentlyWorking,
  m365Management,
  gta,
  stability,
  canada,
  noResumeYet,
  nameQuery,
  clearHref,
}: {
  statuses: string[];
  verdicts: string[];
  ourVerdicts: string[];
  bigFirm: string | null;
  minYears: string[];
  currentlyWorking: string | null;
  m365Management: string | null;
  gta: string | null;
  stability: string | null;
  canada: string | null;
  noResumeYet: boolean;
  nameQuery: string;
  clearHref: string;
}) {
  const hasFilters =
    statuses.length > 0 ||
    verdicts.length > 0 ||
    ourVerdicts.length > 0 ||
    Boolean(bigFirm) ||
    minYears.length > 0 ||
    Boolean(currentlyWorking) ||
    Boolean(m365Management) ||
    Boolean(gta) ||
    Boolean(stability) ||
    Boolean(canada) ||
    noResumeYet ||
    Boolean(nameQuery);

  return (
    <form action="/recruitment" className="space-y-2">
      {/* The name search box itself lives in RecruitmentTable's toolbar, next
          to "Screen selected" — but ?q= is one filter among several, so it
          rides along as a hidden field in this same auto-submitting form
          rather than needing its own separate submission. */}
      <input type="hidden" name="q" value={nameQuery} />
      <div className="flex flex-wrap items-center gap-1.5">
        <a
          href={AUTO_SUGGEST_HREF}
          className="rounded-md bg-brand px-2.5 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Auto Suggest
        </a>
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        {STATUS_OPTIONS.map((o) => (
          <Chip key={`status-${o.value}`} name="status" option={o} checked={statuses.includes(o.value)} />
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        {VERDICT_OPTIONS.map((o) => (
          <Chip key={`verdict-${o.value}`} name="verdict" option={o} checked={verdicts.includes(o.value)} />
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        {OUR_VERDICT_OPTIONS.map((o) => (
          <Chip
            key={`our_verdict-${o.value}`}
            name="our_verdict"
            option={o}
            checked={ourVerdicts.includes(o.value)}
          />
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
            checked={minYears.includes(o.value)}
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
        {GTA_OPTIONS.map((o) => (
          <Chip key={`gta-${o.value}`} name="gta" option={o} checked={gta === o.value} radio />
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        {STABILITY_OPTIONS.map((o) => (
          <Chip
            key={`stability-${o.value}`}
            name="stability"
            option={o}
            checked={stability === o.value}
            radio
          />
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        {CANADA_OPTIONS.map((o) => (
          <Chip
            key={`canada-${o.value}`}
            name="canada"
            option={o}
            checked={canada === o.value}
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
