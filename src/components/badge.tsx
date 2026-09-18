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
  // resume screener — ai_verdict + status, matching Indeed's own applicant
  // stages (confirmed no collisions with any other value in this map)
  yes: SUCCESS,
  maybe: ATTENTION,
  no: URGENT,
  new: NEUTRAL,
  reviewing: INFO,
  contacting: ATTENTION,
  invited: ATTENTION,
  interviewing: INFO,
  second_interview: INFO,
  // Both rounds are done — waiting on a hire/reject call, same "needs
  // someone's attention" tier as submitted/needs_adjustment elsewhere.
  both_done: ATTENTION,
  rejected: URGENT,
  hired: SUCCESS,

  // license reconciliation status (confirmed no collisions above)
  matched: SUCCESS,
  mismatch: ATTENTION,
  unmapped: NEUTRAL_MUTED,
  license_missing: URGENT,

  // M365 license usage (consumed vs. enabled units) — good = every seat
  // used, underused = seats sitting idle, overused = consumed exceeds
  // enabled (shouldn't normally happen, but Graph can report it transiently)
  good: SUCCESS,
  underused: ATTENTION,
  overused: URGENT,

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

  // touchpoint contact method — a category, not a status
  email: CATEGORY_INDIGO,
  call: CATEGORY_PURPLE,
  meeting: INFO,

  // project source — a category, not a status
  autotask: CATEGORY_INDIGO,

  // time entry pattern finding
  recurring_issue: URGENT,
  inconsistent_effort: ATTENTION,

  // roles — a hierarchy, not a status; Owner intentionally stands apart
  owner: "bg-charcoal text-white",
  manager: INFO,
  tech: CATEGORY_PURPLE,
  sales_rep: CATEGORY_INDIGO,

  // device online/offline (NinjaOne)
  online: SUCCESS,
  offline: ATTENTION,

  // device type (NinjaOne) — a category, not a status
  server: CATEGORY_INDIGO,
  workstation: CATEGORY_PURPLE,
  network_device: CATEGORY_PURPLE,

  // sales request stage — "cancelled" reuses the existing project-status
  // entry above, deliberately not redefined here.
  requested: NEUTRAL,
  quoted: ATTENTION,
  approved: INFO,
  ordered: ATTENTION,
  delivered: SUCCESS,

  // sales request source — a category, not a status
  manual: NEUTRAL,
  mailbox_ai: CATEGORY_PURPLE,

  // resume screener — job_stability (not a plain yes/no boolean; frequent
  // job changes isn't "urgent", just worth a second look, so it gets the
  // "needs attention" tier rather than red)
  stable: SUCCESS,
  frequent_changes: ATTENTION,

  // resume screener — interview RSVP status ("declined" reuses the
  // existing yes/maybe/no's semantic tiers exactly, just a different name)
  accepted: SUCCESS,
  declined: URGENT,
  tentative: ATTENTION,

  // daily backup checklist item status
  ok: SUCCESS,
  issue: URGENT,
  na: NEUTRAL_MUTED,
  pending: NEUTRAL_MUTED,

  // quarterly client review item status (na reuses the entry above) —
  // "recommended" is a suggestion, not a health problem, hence the
  // category color rather than one of the status tiers.
  healthy: SUCCESS,
  attention: ATTENTION,
  urgent: URGENT,
  recommended: CATEGORY_INDIGO,

  // quarterly client review workflow status ("approved" reuses the sales-
  // request-stage entry above)
  draft: NEUTRAL,
  submitted: ATTENTION,
  sent: SUCCESS,
  // A draft the approver sent back for changes (adjustment_notes still
  // set) — distinct from a plain never-submitted draft, same tier as
  // "submitted" since it's also waiting on someone (the creator, this time).
  needs_adjustment: ATTENTION,

  // proposal status. "draft"/"accepted"/"declined" reuse the entries above
  // exactly. "sent" deliberately does NOT: for a quarterly review, sent is
  // the terminal good state (emerald), but a sent proposal is merely
  // in-flight and saying "success" would be a lie. So the proposals list
  // never renders a bare "sent" badge — ProposalEngagementPill carries that
  // state instead, with the far more useful "opened 4x" detail.
  expired: NEUTRAL_MUTED,
  withdrawn: NEUTRAL_MUTED,

  // Time off request type - a kind, not a status (pending/approved/declined
  // above already cover status for the same request).
  vacation: CATEGORY_INDIGO,
  sick: CATEGORY_PURPLE,

  // Conditional Access policy state (the raw Graph enum value, shown as-is)
  enabled: SUCCESS,
  enabledForReportingButNotEnforced: ATTENTION,
  // "disabled" reuses task-status's own entry above — same meaning either way.

  // Intune device compliance state
  compliant: SUCCESS,
  noncompliant: URGENT,
  inGracePeriod: ATTENTION,
  conflict: URGENT,
  configManager: NEUTRAL_MUTED,

  // Intune policy kind — a category, not a status
  configuration: CATEGORY_INDIGO,
  compliance: CATEGORY_PURPLE,

  // Identity Protection risk state ("dismissed" reuses task-status's own
  // entry above — same meaning either way). riskLevel itself
  // ("low"/"medium"/"high") isn't listed here at all — it already reuses
  // the priority tier entries above, which mean exactly the same thing.
  atRisk: URGENT,
  confirmedCompromised: URGENT,
  remediated: SUCCESS,
  confirmedSafe: SUCCESS,
};

export function Badge({ value, label }: { value: string; label?: string }) {
  const classes = COLORS[value] ?? NEUTRAL;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}
    >
      {label ?? humanizeLabel(value)}
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

export function FollowupBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
      Follow-up
    </span>
  );
}
