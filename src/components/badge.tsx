import { humanizeLabel } from "@/lib/format";

const COLORS: Record<string, string> = {
  // projects
  planning: "bg-slate-100 text-slate-700",
  active: "bg-blue-100 text-blue-700",
  on_hold: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
  // touchpoints
  monthly_visit: "bg-purple-100 text-purple-700",
  quarterly_review: "bg-indigo-100 text-indigo-700",
  // linked emails
  general: "bg-slate-100 text-slate-700",
  quote: "bg-amber-100 text-amber-800",
  project: "bg-blue-100 text-blue-700",
  // suggestion kinds
  follow_up: "bg-amber-100 text-amber-800",
  quote_follow_up: "bg-amber-100 text-amber-800",
  urgent_alert: "bg-red-100 text-red-700",
  new_project: "bg-blue-100 text-blue-700",
  opportunity: "bg-emerald-100 text-emerald-700",
  stale_contact: "bg-red-100 text-red-700",
  review_prep: "bg-indigo-100 text-indigo-700",
  other: "bg-slate-100 text-slate-700",
  // suggestion priority
  high: "bg-red-100 text-red-700",
  normal: "bg-slate-100 text-slate-700",
  // roles
  director: "bg-slate-900 text-white",
  manager: "bg-blue-100 text-blue-700",
  tech: "bg-purple-100 text-purple-700",
  // task status
  open: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  on_hold: "bg-amber-100 text-amber-800",
  waiting_client: "bg-purple-100 text-purple-700",
  done: "bg-emerald-100 text-emerald-700",
  dismissed: "bg-slate-100 text-slate-500",
  // task kinds (share colors with the suggestion kinds they come from above:
  // email_follow_up/quote_follow_up/urgent_alert/new_project already covered)
  service_check: "bg-amber-100 text-amber-800",
  touchpoint_action: "bg-purple-100 text-purple-700",
  internal: "bg-slate-100 text-slate-700",
  improvement: "bg-emerald-100 text-emerald-700",
  // task priority
  low: "bg-slate-100 text-slate-500",
  medium: "bg-amber-100 text-amber-800",
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
