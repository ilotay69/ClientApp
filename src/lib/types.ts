// Hand-written types mirroring supabase/schema.sql. If the schema changes,
// update these to match (or generate them with `supabase gen types typescript`
// once the Supabase CLI is linked to the project).

export type UserRole = "admin" | "sales" | "account_manager";
export type QuoteStatus = "draft" | "sent" | "follow_up_needed" | "won" | "lost";
export type ProjectStatus =
  | "planning"
  | "active"
  | "on_hold"
  | "completed"
  | "cancelled";
export type TouchpointType = "personal_checkin" | "quarterly_review";
export type ReminderKind = "quote" | "touchpoint" | "project";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
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
  created_at: string;
  updated_at: string;
}

export interface Quote {
  id: string;
  client_id: string;
  title: string;
  amount: number | null;
  status: QuoteStatus;
  sent_date: string | null;
  follow_up_due_date: string | null;
  last_followed_up_at: string | null;
  owner_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
  type: TouchpointType;
  due_date: string;
  completed_at: string | null;
  notes: string | null;
  owner_id: string | null;
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

export type EmailLinkType = "quote" | "project" | "general";

export interface MailConnection {
  user_id: string;
  mailbox_email: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  connected_at: string;
  last_synced_at: string | null;
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
  graph_message_id: string;
  connection_user_id: string | null;
  created_at: string;
}

export type SuggestionKind =
  | "follow_up"
  | "opportunity"
  | "stale_contact"
  | "qbr_prep"
  | "other";
export type SuggestionStatus = "open" | "dismissed" | "done";

export interface Suggestion {
  id: string;
  client_id: string;
  kind: SuggestionKind;
  summary: string;
  detail: string | null;
  related_email_ids: string[] | null;
  status: SuggestionStatus;
  created_at: string;
}

// Minimal Database type so the Supabase client stays typed without needing
// the full generated schema. Extend with `Row`/`Insert`/`Update` per table
// if you generate real types later.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
