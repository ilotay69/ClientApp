import Link from "next/link";

const ACCENTS = {
  blue: { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-100" },
  red: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-100" },
  amber: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-100" },
  purple: { bg: "bg-purple-50", text: "text-purple-700", ring: "ring-purple-100" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-700", ring: "ring-indigo-100" },
  teal: { bg: "bg-teal-50", text: "text-teal-700", ring: "ring-teal-100" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-100" },
  pink: { bg: "bg-pink-50", text: "text-pink-700", ring: "ring-pink-100" },
} as const;

export type DashboardAccent = keyof typeof ACCENTS;

/** One colorful stat card for the Dashboard — a big number up top (click
 * anywhere in the header to jump to the page it summarizes), a short list
 * of the actual items underneath so the number isn't the only thing
 * there. Every widget on the page uses this same shell so the whole
 * dashboard reads as one coherent grid rather than a pile of one-off
 * layouts. */
export function DashboardWidgetCard({
  title,
  count,
  countLabel,
  icon: Icon,
  accent,
  href,
  children,
}: {
  title: string;
  count: number;
  countLabel: string;
  icon: (props: { className?: string }) => React.ReactNode;
  accent: DashboardAccent;
  href: string;
  children: React.ReactNode;
}) {
  const colors = ACCENTS[accent];
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <Link href={href} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${colors.bg} ${colors.text} ring-4 ${colors.ring}`}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
            <p className="truncate text-xs text-slate-500">{countLabel}</p>
          </div>
        </div>
        <span className={`shrink-0 text-3xl font-bold tabular-nums ${colors.text}`}>{count}</span>
      </Link>
      <div className="border-t border-slate-100">{children}</div>
    </div>
  );
}
