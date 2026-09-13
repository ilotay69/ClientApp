-- ============================================================================
-- Quarterly client system reviews — replaces the manually-built review
-- document with an in-app checklist (same sections/items as the existing
-- Word/PDF template) plus a submit → approve → send-to-client workflow.
--
-- One row per review (quarterly_reviews), one row per checklist item within
-- it (quarterly_review_items) — normalized rather than one wide row, since
-- the item list itself may change over time (see
-- src/lib/quarterly-review-sections.ts) without needing a schema migration.
--
-- Run this in the Supabase SQL Editor AFTER 101.
-- ============================================================================

create table public.quarterly_reviews (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  -- Free text, matching the sample documents' own labeling ("April 2026")
  -- rather than a strict quarter/year pair — staff may review off a
  -- slightly different cadence per client.
  review_period text not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'sent')),
  created_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  sent_at timestamptz,
  sent_to_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quarterly_reviews_client_idx on public.quarterly_reviews (client_id, created_at desc);

create trigger quarterly_reviews_set_updated_at
  before update on public.quarterly_reviews
  for each row execute function public.set_updated_at();

alter table public.quarterly_reviews enable row level security;
create policy "quarterly_reviews full access for staff" on public.quarterly_reviews
  for all using (public.is_staff()) with check (public.is_staff());

create table public.quarterly_review_items (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.quarterly_reviews (id) on delete cascade,
  -- Matches a key in QUARTERLY_REVIEW_SECTIONS
  -- (src/lib/quarterly-review-sections.ts) — not a DB enum, so the section/
  -- item list can change without a migration.
  item_key text not null,
  status text not null default 'na' check (status in ('healthy', 'attention', 'urgent', 'na')),
  comments text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  unique (review_id, item_key)
);

create index quarterly_review_items_review_idx on public.quarterly_review_items (review_id);

alter table public.quarterly_review_items enable row level security;
create policy "quarterly_review_items full access for staff" on public.quarterly_review_items
  for all using (public.is_staff()) with check (public.is_staff());
