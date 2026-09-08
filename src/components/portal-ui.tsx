import Link from "next/link";
import { formatDate } from "@/lib/format";

/** Header for every portal page: whose data this is, plus a loud banner when
 * a staff member is previewing rather than the client themselves — so nobody
 * mistakes a preview for what they're actually looking at. */
export function PortalPageHeader({
  companyName,
  title,
  subtitle,
  isPreview,
  lastSyncedAt,
}: {
  companyName: string;
  title: string;
  subtitle?: string;
  isPreview: boolean;
  lastSyncedAt?: string | null;
}) {
  return (
    <div className="space-y-3">
      {isPreview && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span className="font-medium">Staff preview.</span> You are viewing{" "}
          {companyName}&apos;s portal as they would see it.{" "}
          <Link href="/dashboard" className="underline">
            Back to the dashboard
          </Link>
        </div>
      )}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {companyName}
        </p>
        <h1 className="mt-0.5 text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        {lastSyncedAt && (
          <p className="mt-1 text-xs text-slate-400">
            Last updated {formatDate(lastSyncedAt)}
          </p>
        )}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    neutral: "text-slate-900",
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-red-600",
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function PortalCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-slate-500">{children}</p>;
}

/**
 * Dependency-free SVG ring gauge — same reason TrendChart is hand-rolled
 * (no charting library installed, and one can't be added without npm here).
 * Used for Secure Score and licence utilisation.
 */
export function RingGauge({
  percent,
  label,
  sublabel,
}: {
  percent: number;
  label: string;
  sublabel?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  const stroke =
    clamped >= 70 ? "#059669" : clamped >= 40 ? "#d97706" : "#dc2626";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 140" className="h-36 w-36" role="img" aria-label={`${label}: ${clamped}%`}>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          // Start at 12 o'clock rather than 3.
          transform="rotate(-90 70 70)"
        />
        <text
          x="70"
          y="70"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-slate-900"
          style={{ fontSize: "26px", fontWeight: 600 }}
        >
          {clamped}%
        </text>
      </svg>
      <p className="mt-1 text-sm font-medium text-slate-900">{label}</p>
      {sublabel && <p className="text-xs text-slate-500">{sublabel}</p>}
    </div>
  );
}

/** Horizontal proportion bar, for "X of Y licences assigned" style rows. */
export function ProportionBar({
  used,
  total,
  label,
  valueLabel,
}: {
  used: number;
  total: number;
  label: string;
  valueLabel: string;
}) {
  const percent = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const tone = percent >= 95 ? "bg-red-500" : percent >= 80 ? "bg-amber-500" : "bg-brand";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm text-slate-900" title={label}>
          {label}
        </span>
        <span className="shrink-0 text-xs text-slate-500">{valueLabel}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
