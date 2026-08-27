import { humanizeLabel } from "@/lib/format";

const COLORS: Record<string, string> = {
  // quotes
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  follow_up_needed: "bg-amber-100 text-amber-800",
  won: "bg-emerald-100 text-emerald-700",
  lost: "bg-red-100 text-red-700",
  // projects
  planning: "bg-slate-100 text-slate-700",
  active: "bg-blue-100 text-blue-700",
  on_hold: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
  // touchpoints
  personal_checkin: "bg-purple-100 text-purple-700",
  quarterly_review: "bg-indigo-100 text-indigo-700",
  // linked emails
  general: "bg-slate-100 text-slate-700",
  // suggestion kinds
  follow_up: "bg-amber-100 text-amber-800",
  opportunity: "bg-emerald-100 text-emerald-700",
  stale_contact: "bg-red-100 text-red-700",
  qbr_prep: "bg-indigo-100 text-indigo-700",
  other: "bg-slate-100 text-slate-700",
  // roles
  admin: "bg-slate-900 text-white",
  sales: "bg-blue-100 text-blue-700",
  account_manager: "bg-purple-100 text-purple-700",
};

export function Badge({ value }: { value: string }) {
  const classes = COLORS[value] ?? "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}
    >
      {humanizeLabel(value)}
    </span>
  );
}

export function OverdueBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
      Overdue
    </span>
  );
}
