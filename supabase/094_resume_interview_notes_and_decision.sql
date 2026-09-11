-- ============================================================================
-- Interview notes (as many as staff want per candidate), a rolling
-- AI-generated read on how the interview process is going (regenerated
-- every time a note is saved), and a single free-text Final Decision field.
--
-- Run this in the Supabase SQL Editor AFTER 093.
-- ============================================================================

create table public.resume_interview_notes (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references public.resumes (id) on delete cascade,
  note_text text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index resume_interview_notes_resume_id_created_at_idx
  on public.resume_interview_notes (resume_id, created_at);

alter table public.resume_interview_notes enable row level security;
create policy "resume_interview_notes full access for staff" on public.resume_interview_notes
  for all using (public.is_staff()) with check (public.is_staff());

-- ai_interview_analysis holds the CURRENT rolling summary only (overwritten
-- on every new note) — the notes table above is the actual history.
-- final_decision is deliberately free text, not an enum/check: one value per
-- candidate, not a list, and open-ended rather than a fixed set of options.
alter table public.resumes
  add column if not exists ai_interview_analysis text,
  add column if not exists ai_interview_analysis_at timestamptz,
  add column if not exists final_decision text;
