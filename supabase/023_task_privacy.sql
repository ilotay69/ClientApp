-- CG Technologies Client Tracker — personal (private) tasks.
--
-- A personal task is someone's own to-do item, not a shared team task —
-- it never gets a client, project, or assignee, and it must only be
-- visible to the person who created it. That's enforced here at the RLS
-- level, not just by how the app queries — the same posture as every
-- other privacy boundary in this schema (a page filtering what it shows
-- is not the same guarantee as the database refusing to return the row).
--
-- Run this in the Supabase SQL Editor AFTER 022_client_documents.sql.

alter table public.tasks add column if not exists is_personal boolean not null default false;

drop policy if exists "tasks full access for authenticated" on public.tasks;

create policy "tasks readable" on public.tasks
  for select using (
    auth.role() = 'authenticated' and (not is_personal or created_by = auth.uid())
  );

create policy "tasks insertable" on public.tasks
  for insert with check (
    auth.role() = 'authenticated' and (not is_personal or created_by = auth.uid())
  );

create policy "tasks updatable" on public.tasks
  for update using (
    auth.role() = 'authenticated' and (not is_personal or created_by = auth.uid())
  ) with check (
    auth.role() = 'authenticated' and (not is_personal or created_by = auth.uid())
  );

create policy "tasks deletable" on public.tasks
  for delete using (
    auth.role() = 'authenticated' and (not is_personal or created_by = auth.uid())
  );
