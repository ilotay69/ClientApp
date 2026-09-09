// Hand-written types mirroring supabase/schema.sql (+ 002/003/004 migrations).
// If the schema changes, update these to match (or generate them with
// `supabase gen types typescript` once the Supabase CLI is linked to the project).

/** 'client' is a customer's read-only portal login, NOT a staff role — it
 * holds no permissions and is barred from the whole staff app. Use
 * isStaffRole() from @/lib/permissions rather than comparing against it
 * directly. */
export type UserRole = "owner" | "manager" | "tech" | "sales_rep" | "client";
export type ProjectStatus =
  | "planning"
  | "active"
  | "on_hold"
  | "completed"
  | "cancelled";
export type TouchpointContactMethod = "email" | "call" | "meeting";
export type ReminderKind = "touchpoint" | "project" | "task" | "service_check";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  /** Which client this portal login belongs to. Non-null exactly when
   * role === 'client' — the database enforces both directions (see the
   * profiles_client_id_matches_role constraint in 064). */
  client_id: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  notes: string | null;
  owner_id: string | null;
  autotask_company_id: number | null;
  ninjaone_organization_id: number | null;
  m365_tenant_id: string | null;
  huntress_organization_id: number | null;
  forticloud_account_id: string | null;
  ninjaone_last_synced_at: string | null;
  m365_last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutotaskTicket {
  id: number;
  client_id: string;
  ticket_number: string | null;
  title: string;
  description: string | null;
  resolution: string | null;
  status: string | null;
  priority: string | null;
  queue_name: string | null;
  assigned_resource_name: string | null;
  due_date: string | null;
  opened_at: string | null;
  last_activity_at: string | null;
  last_synced_at: string;
}

export interface AutotaskContractService {
  id: number;
  client_id: string;
  contract_id: number;
  contract_name: string;
  contract_status: string | null;
  service_id: number;
  service_name: string;
  description: string | null;
  quantity: number | null;
  last_synced_at: string;
}

export interface M365LicenseSummary {
  id: number;
  client_id: string;
  sku_part_number: string;
  consumed_units: number;
  enabled_units: number;
  suspended_units: number;
  capability_status: string | null;
  last_synced_at: string;
}

export interface M365SecureScore {
  client_id: string;
  current_score: number;
  max_score: number;
  licensed_user_count: number | null;
  score_created_date_time: string | null;
  last_synced_at: string;
}

export interface M365SecureScoreGap {
  id: number;
  client_id: string;
  control_name: string;
  title: string | null;
  category: string | null;
  current_score: number;
  max_score: number | null;
  remediation: string | null;
  action_url: string | null;
  tier: string | null;
  implementation_cost: string | null;
  last_synced_at: string;
}

export interface NinjaOneDevice {
  id: number;
  client_id: string;
  system_name: string;
  node_class: string | null;
  is_offline: boolean | null;
  last_contact: string | null;
  os_name: string | null;
  os_version: string | null;
  manufacturer: string | null;
  model: string | null;
  last_logged_on_user: string | null;
  detail: unknown;
  raw: unknown;
  last_synced_at: string;
}

export interface ClientContact {
  id: string;
  client_id: string;
  name: string;
  email: string | null;
  created_at: string;
}

export type ClientInteractionType = "note" | "call" | "meeting" | "quote" | "review" | "check_in";

export interface ClientInteraction {
  id: string;
  client_id: string;
  contact_id: string | null;
  type: ClientInteractionType;
  subject: string | null;
  body: string;
  next_contact_date: string | null;
  attachment_path: string | null;
  attachment_filename: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  client_id: string;
  name: string;
  status: ProjectStatus;
  start_date: string | null;
  target_end_date: string | null;
  owner_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Touchpoint {
  id: string;
  client_id: string;
  contact_method: TouchpointContactMethod | null;
  due_date: string;
  completed_at: string | null;
  outcome: string | null;
  next_action: string | null;
  owner_id: string | null;
  source_client_interaction_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReminderLogEntry {
  id: string;
  kind: ReminderKind;
  entity_id: string;
  sent_at: string;
  recipient_email: string;
}

export type EmailLinkType = "quote" | "project" | "general" | "followup";

export interface MailConnection {
  user_id: string;
  mailbox_email: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  connected_at: string;
  last_synced_at: string | null;
  review_excludes: string | null;
  review_lookback_days: number | null;
  dismissed_appointment_subjects: string[];
  snapshot_synced_at: string | null;
  sync_excluded_senders: string | null;
  resume_folder_name: string | null;
  resume_sync_last_synced_at: string | null;
}

export type ResumeVerdict = "yes" | "maybe" | "no";
export type ResumeStatus = "new" | "reviewing" | "contacted" | "rejected" | "hired";

export interface JobPosting {
  id: string;
  title: string;
  description: string;
  created_by: string | null;
  created_at: string;
}

export interface Resume {
  id: string;
  connection_user_id: string | null;
  graph_message_id: string;
  graph_attachment_id: string;
  received_at: string;
  sender_name: string | null;
  sender_email: string | null;
  subject: string | null;
  file_name: string;
  storage_path: string;
  file_size_bytes: number | null;
  content_type: string;
  job_posting_id: string | null;
  candidate_name: string | null;
  candidate_email: string | null;
  candidate_phone: string | null;
  ai_verdict: ResumeVerdict | null;
  ai_comment: string | null;
  screened_at: string | null;
  screening_error: string | null;
  status: ResumeStatus;
  imported_at: string;
}

export interface MailboxSnapshotMessageRow {
  id: string;
  user_id: string;
  graph_message_id: string;
  conversation_id: string;
  subject: string | null;
  from_name: string | null;
  from_email: string | null;
  to_name: string | null;
  to_email: string | null;
  received_at: string;
  sent_at: string | null;
  web_link: string | null;
  body_preview: string | null;
  parent_folder_id: string | null;
  is_flagged: boolean;
  synced_at: string;
}

export interface EmailLink {
  id: string;
  client_id: string;
  type: EmailLinkType;
  subject: string;
  from_name: string | null;
  from_email: string;
  received_at: string;
  web_link: string | null;
  body_preview: string | null;
  is_flagged: boolean;
  graph_message_id: string;
  connection_user_id: string | null;
  created_at: string;
}

export type SuggestionKind =
  | "follow_up"
  | "quote_follow_up"
  | "urgent_alert"
  | "new_project"
  | "opportunity"
  | "stale_contact"
  | "review_prep"
  | "other";
export type SuggestionStatus = "open" | "dismissed" | "done";
export type SuggestionPriority = "normal" | "high";

export interface Suggestion {
  id: string;
  client_id: string;
  kind: SuggestionKind;
  summary: string;
  detail: string | null;
  priority: SuggestionPriority;
  related_email_ids: string[] | null;
  status: SuggestionStatus;
  task_id: string | null;
  created_at: string;
}

export type TaskKind =
  | "email_follow_up"
  | "quote_follow_up"
  | "urgent_alert"
  | "new_project"
  | "service_check"
  | "touchpoint_action"
  | "internal"
  | "improvement"
  | "general";
export type TaskStatus =
  | "open"
  | "in_progress"
  | "on_hold"
  | "waiting_client"
  | "done"
  | "dismissed";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  client_id: string | null;
  project_id: string | null;
  kind: TaskKind;
  title: string;
  detail: string | null;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string | null;
  start_date: string | null;
  due_date: string | null;
  source_suggestion_id: string | null;
  source_touchpoint_id: string | null;
  source_service_check_id: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SalesRequestStage = "requested" | "quoted" | "approved" | "ordered" | "delivered" | "cancelled";
export type SalesRequestSource = "manual" | "mailbox_ai";

export interface SalesRequest {
  id: string;
  client_id: string | null;
  title: string;
  detail: string | null;
  stage: SalesRequestStage;
  source: SalesRequestSource;
  requested_by_name: string | null;
  requested_by_email: string | null;
  assigned_to: string | null;
  related_email_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface TaskAssignee {
  task_id: string;
  profile_id: string;
  created_at: string;
}

export interface ServiceCatalogItem {
  id: string;
  name: string;
  description: string | null;
  default_cadence_days: number;
  created_at: string;
}

export interface ClientServiceCheck {
  id: string;
  client_id: string;
  service_id: string;
  cadence_days: number | null;
  last_checked_at: string | null;
  last_checked_by: string | null;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceOffering {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface ClientService {
  client_id: string;
  service_id: string;
  created_at: string;
}

// Minimal Database type so the Supabase client stays typed without needing
// the full generated schema. Extend with `Row`/`Insert`/`Update` per table
// if you generate real types later.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
