-- ============================================================================
-- Lets a resume row exist BEFORE any resume file/text exists.
--
-- Run this in the Supabase SQL Editor AFTER 070.
--
-- Some applications arrive as a notification email with no attachment at
-- all (e.g. a job board saying "you have a new applicant", with a link out
-- to view the actual resume on their own site — not something this app can
-- reliably follow, see the plan discussion). Rather than silently skip
-- these, sync now creates a row for EVERY message in the watched folder,
-- not just ones with a PDF/Word attachment — the notification's own body
-- text (screening-question answers, etc. — genuinely useful context) is
-- captured either way, and staff can add the actual resume afterward via
-- upload or paste, against the row sync already created.
-- ============================================================================

alter table public.resumes
  alter column graph_attachment_id drop not null,
  alter column storage_path drop not null,
  alter column file_name drop not null,
  alter column content_type drop not null,
  alter column content_type drop default;

alter table public.resumes
  add column if not exists email_body_text text,
  add column if not exists pasted_resume_text text;

-- The old single UNIQUE constraint assumed graph_attachment_id was always
-- present. Split into two partial indexes: a message can carry several
-- attachment-based rows (one per PDF/Word file), but at most one
-- notification-only row (there's nothing to further distinguish within one
-- message once there's no attachment id).
alter table public.resumes
  drop constraint if exists resumes_graph_message_id_graph_attachment_id_key;

create unique index if not exists resumes_message_attachment_key
  on public.resumes (graph_message_id, graph_attachment_id)
  where graph_attachment_id is not null;

create unique index if not exists resumes_message_only_key
  on public.resumes (graph_message_id)
  where graph_attachment_id is null;
