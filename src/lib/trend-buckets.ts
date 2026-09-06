export type TrendBucket = { label: string; start: string; end: string };

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shortLabel(d: Date): string {
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Monday of the week containing `d`, UTC calendar — same convention
 * already used for "this week" boundaries elsewhere (resource-hours.ts). */
function mondayOf(d: Date): Date {
  const copy = new Date(d);
  const dow = (copy.getUTCDay() + 6) % 7; // 0 = Monday
  copy.setUTCDate(copy.getUTCDate() - dow);
  return copy;
}

/** Monday-Sunday weekly buckets spanning from the Monday of startDate's
 * week through the Sunday of endDate's week (inclusive), oldest first —
 * the shared time axis every trend feature buckets its data into. */
export function buildWeeklyBuckets(startDate: Date, endDate: Date): TrendBucket[] {
  const buckets: TrendBucket[] = [];
  const lastMonday = mondayOf(endDate);
  let cursor = mondayOf(startDate);
  // Safety cap mirrors the pagination caps used elsewhere in this app —
  // a caller passing an accidentally huge range shouldn't hang forever.
  for (let i = 0; i < 260 && cursor <= lastMonday; i++) {
    const end = new Date(cursor);
    end.setUTCDate(end.getUTCDate() + 6);
    buckets.push({ label: shortLabel(cursor), start: ymd(cursor), end: ymd(end) });
    cursor = new Date(cursor);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return buckets;
}

/** Convenience for the common "last N weeks ending now" case every
 * per-client/per-resource trend picker uses. */
export function lastNWeeklyBuckets(now: Date, weekCount: number): TrendBucket[] {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (weekCount - 1) * 7);
  return buildWeeklyBuckets(start, now);
}

/** Sums values whose date falls in [start, end] into the matching bucket —
 * shared by every trend fetcher below (hours, ticket counts, ...). */
export function sumIntoBuckets<T>(
  buckets: TrendBucket[],
  items: T[],
  dateOf: (item: T) => string,
  valueOf: (item: T) => number
): number[] {
  return buckets.map((b) =>
    items
      .filter((item) => {
        const day = dateOf(item).slice(0, 10);
        return day >= b.start && day <= b.end;
      })
      .reduce((sum, item) => sum + valueOf(item), 0)
  );
}
