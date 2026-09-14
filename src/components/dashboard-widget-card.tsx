import Link from "next/link";

/** Each accent is a full set, not just one color: a saturated icon tile
 * (white glyph on solid color), a tinted card body, and matching bar/dot
 * colors for whatever the card renders inside. The point is that a card
 * reads as "the blue one" / "the purple one" from across the room — a pale
 * icon on a plain white card didn't do that. */
const ACCENTS = {
  blue: {
    body: "bg-gradient-to-br from-blue-50 via-white to-white",
    border: "border-blue-100",
    tile: "bg-blue-500",
    number: "text-blue-600",
    label: "text-blue-700/70",
    bar: "bg-blue-500",
    dot: "bg-blue-400",
  },
  amber: {
    body: "bg-gradient-to-br from-amber-50 via-white to-white",
    border: "border-amber-100",
    tile: "bg-amber-500",
    number: "text-amber-600",
    label: "text-amber-700/70",
    bar: "bg-amber-500",
    dot: "bg-amber-400",
  },
  purple: {
    body: "bg-gradient-to-br from-purple-50 via-white to-white",
    border: "border-purple-100",
    tile: "bg-purple-500",
    number: "text-purple-600",
    label: "text-purple-700/70",
    bar: "bg-purple-500",
    dot: "bg-purple-400",
  },
  indigo: {
    body: "bg-gradient-to-br from-indigo-50 via-white to-white",
    border: "border-indigo-100",
    tile: "bg-indigo-500",
    number: "text-indigo-600",
    label: "text-indigo-700/70",
    bar: "bg-indigo-500",
    dot: "bg-indigo-400",
  },
  teal: {
    body: "bg-gradient-to-br from-teal-50 via-white to-white",
    border: "border-teal-100",
    tile: "bg-teal-500",
    number: "text-teal-600",
    label: "text-teal-700/70",
    bar: "bg-teal-500",
    dot: "bg-teal-400",
  },
  emerald: {
    body: "bg-gradient-to-br from-emerald-50 via-white to-white",
    border: "border-emerald-100",
    tile: "bg-emerald-500",
    number: "text-emerald-600",
    label: "text-emerald-700/70",
    bar: "bg-emerald-500",
    dot: "bg-emerald-400",
  },
  pink: {
    body: "bg-gradient-to-br from-pink-50 via-white to-white",
    border: "border-pink-100",
    tile: "bg-pink-500",
    number: "text-pink-600",
    label: "text-pink-700/70",
    bar: "bg-pink-500",
    dot: "bg-pink-400",
  },
} as const;

export type DashboardAccent = keyof typeof ACCENTS;

/** The page's headline card — one gradient block answering "how much is on
 * me right now", with the breakdown underneath. Deliberately the only
 * gradient on the page: it stays the thing your eye lands on first. */
export function DashboardHeroCard({
  greeting,
  subtitle,
  total,
  stats,
}: {
  greeting: string;
  subtitle: string;
  total: number;
  stats: { label: string; value: number; href: string }[];
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand via-rose-500 to-amber-400 p-6 text-white shadow-lg sm:p-8">
      <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 right-24 h-44 w-44 rounded-full bg-white/10 blur-3xl" />

      <div className="relative">
        <p className="text-sm font-medium text-white/85">{greeting}</p>
        <div className="mt-2 flex items-end gap-3">
          <span className="text-6xl font-bold leading-none tabular-nums">{total}</span>
          <span className="pb-1 text-sm text-white/85">{subtitle}</span>
        </div>

        {stats.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/25 pt-4 sm:grid-cols-4">
            {stats.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="rounded-xl px-2 py-1 transition-colors hover:bg-white/15"
              >
                <p className="text-2xl font-bold tabular-nums">{s.value}</p>
                <p className="text-xs text-white/80">{s.label}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One colorful stat card — a big number up top (click anywhere in the
 * header to jump to the page it summarizes), a short list of the actual
 * items underneath so the number isn't the only thing there. Every widget
 * uses this same shell so the whole dashboard reads as one coherent grid
 * rather than a pile of one-off layouts. */
export function DashboardWidgetCard({
  title,
  count,
  countLabel,
  icon: Icon,
  accent,
  href,
  urgent = false,
  children,
}: {
  title: string;
  count: number;
  countLabel: string;
  icon: (props: { className?: string }) => React.ReactNode;
  accent: DashboardAccent;
  href: string;
  /** A small red "!" badge on the card's corner — for when something inside
   * it genuinely needs eyes on it right now (something overdue, something
   * waiting on a decision), not just "here's a count." */
  urgent?: boolean;
  children: React.ReactNode;
}) {
  const colors = ACCENTS[accent];
  return (
    <div
      className={`relative rounded-2xl border ${colors.border} ${colors.body} shadow-sm transition-shadow hover:shadow-md`}
    >
      {urgent && (
        <span
          className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow ring-2 ring-white"
          title="Needs attention"
          aria-hidden="true"
        >
          !
        </span>
      )}
      <Link href={href} className="flex items-center justify-between gap-3 rounded-t-2xl px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${colors.tile} text-white shadow-sm`}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
            <p className={`truncate text-xs font-medium ${colors.label}`}>{countLabel}</p>
          </div>
        </div>
        <span className={`shrink-0 text-4xl font-bold tabular-nums ${colors.number}`}>{count}</span>
      </Link>
      <div className="mx-3 mb-3 overflow-hidden rounded-xl bg-white/80 ring-1 ring-slate-100">{children}</div>
    </div>
  );
}

/** A labelled bar — the relative-load rows in Team Workload, and anywhere
 * else a number reads better as a length than a digit. */
export function DashboardBar({
  accent,
  value,
  max,
}: {
  accent: DashboardAccent;
  value: number;
  max: number;
}) {
  const pct = max > 0 ? Math.max(6, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${ACCENTS[accent].bar}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function DashboardDot({ accent }: { accent: DashboardAccent }) {
  return <span className={`h-2 w-2 shrink-0 rounded-full ${ACCENTS[accent].dot}`} aria-hidden="true" />;
}
