import { humanizeLabel } from "@/lib/format";

// Semantic color system — every value below maps to ONE of these tiers by
// what it *means*, not by which feature it belongs to, so the same color
// always means the same thing everywhere in the app:
//   slate   = neutral / not started / low priority / inactive
//   blue    = active / in progress / new
//   amber   = needs attention / waiting on someone / medium priority
//   red     = urgent / overdue / cancelled / high priority
//   emerald = done / completed / positive outcome
//   purple / indigo = a distinct category or kind, not a status —
//                      used only where a status color would be misleading
// When adding a new value, pick the tier by meaning first.

const NEUTRAL = "bg-slate-100 text-slate-700";
const NEUTRAL_MUTED = "bg-slate-100 text-slate-500";
const INFO = "bg-blue-100 text-blue-700";
const ATTENTION = "bg-amber-100 text-amber-800";
const URGENT = "bg-red-100 text-red-700";
const SUCCESS = "bg-emerald-100 text-emerald-700";
const CATEGORY_PURPLE = "bg-purple-100 text-purple-700";
const CATEGORY_INDIGO = "bg-indigo-100 text-indigo-700";

const COLORS: Record<string, string> = {
  // project status
  planning: NEUTRAL,
  active: INFO,
  on_hold: ATTENTION,
  completed: SUCCESS,
  cancelled: URGENT,

  // task status
  open: NEUTRAL,
  in_progress: INFO,
  waiting_client: ATTENTION,
  done: SUCCESS,
  dismissed: NEUTRAL_MUTED,

  // task / suggestion priority
  low: NEUTRAL_MUTED,
  normal: NEUTRAL,
  medium: ATTENTION,
  high: URGENT,

  // task / suggestion kind
  general: NEUTRAL,
  internal: NEUTRAL,
  other: NEUTRAL,
  new_project: INFO,
  project: INFO,
  follow_up: ATTENTION,
  quote_follow_up: ATTENTION,
  quote: ATTENTION,
  service_check: ATTENTION,
  urgent_alert: URGENT,
  stale_contact: URGENT,
  opportunity: SUCCESS,
  improvement: SUCCESS,
  review_prep: CATEGORY_INDIGO,
  touchpoint_action: CATEGORY_PURPLE,

  // touchpoint type — a category, not a status
  monthly_visit: CATEGORY_PURPLE,
  quarterly_review: CATEGORY_INDIGO,

  // roles — a hierarchy, not a status; Owner intentionally stands apart
  owner: "bg-slate-900 text-white",
  manager: INFO,
  tech: CATEGORY_PURPLE,

  // device online/offline (NinjaOne)
  online: SUCCESS,
  offline: ATTENTION,
};

export function Badge({ value }: { value: string }) {
  const classes = COLORS[value] ?? NEUTRAL;
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
