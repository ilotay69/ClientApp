import Link from "next/link";

/** Each accent is a full set, not just one color: a saturated icon tile
 * (white glyph on solid color), a tinted card body, and matching bar/dot
 * colors for whatever the card renders inside. The point is that a card
 * reads as "the blue one" / "the purple one" from across the room — a pale
 * icon on a plain white card didn't do that. */
const ACCENTS = {
  red: {
    body: "bg-gradient-to-br from-red-50 via-white to-white",
    border: "border-red-100",
    tile: "bg-red-500",
    number: "text-red-600",
    label: "text-red-700/70",
    bar: "bg-red-500",
    dot: "bg-red-400",
  },
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
  cyan: {
    body: "bg-gradient-to-br from-cyan-50 via-white to-white",
    border: "border-cyan-100",
    tile: "bg-cyan-500",
    number: "text-cyan-600",
    label: "text-cyan-700/70",
    bar: "bg-cyan-500",
    dot: "bg-cyan-400",
  },
} as const;

export type DashboardAccent = keyof typeof ACCENTS;

/** The page's headline card — one dark block answering "how much is on me
 * right now", with the breakdown underneath. Matches the sidebar's charcoal
 * rather than a bright gradient, so it reads as this app's own color, not
 * a generic marketing-dashboard hero — brand red stays just an accent
 * (the blur glow, the number) instead of the dominant hue. */
export function DashboardHeroCard({
  greeting,
  subtitle,
  total,
  stats,
  action,
}: {
  greeting: string;
  subtitle: string;
  total: number;
  stats: { label: string; value: number; href: string }[];
  action?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-charcoal p-4 text-white shadow-sm sm:p-5">
      <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-brand/25 blur-3xl" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-white/75">{greeting}</p>
          {action}
        </div>
        <div className="mt-1 flex items-end gap-2">
          <span className="text-4xl font-bold leading-none tabular-nums text-brand">{total}</span>
          <span className="pb-0.5 text-sm text-white/75">{subtitle}</span>
        </div>

        {stats.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/15 pt-3 sm:grid-cols-4">
            {stats.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="rounded-lg px-2 py-1 transition-colors hover:bg-white/10"
              >
                <p className="text-lg font-bold tabular-nums">{s.value}</p>
                <p className="text-xs text-white/65">{s.label}</p>
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
      <Link href={href} className="flex items-center justify-between gap-2.5 rounded-t-2xl px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colors.tile} text-white shadow-sm`}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
            <p className={`truncate text-xs font-medium ${colors.label}`}>{countLabel}</p>
          </div>
        </div>
        <span className={`shrink-0 text-3xl font-bold tabular-nums ${colors.number}`}>{count}</span>
      </Link>
      <div className="mx-2 mb-2 overflow-hidden rounded-xl bg-white/80 ring-1 ring-slate-100">{children}</div>
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
