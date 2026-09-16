-- A second editable body field, alongside subject/intro — used by the
-- Quarterly Review template for the "how to get help" line next to the
-- Acknowledge button (was a hardcoded sentence in resend.ts before this).
-- Nullable since not every template needs one (Block of Hours Usage
-- Report doesn't have an Acknowledge button at all).
alter table public.email_templates add column if not exists note text;
