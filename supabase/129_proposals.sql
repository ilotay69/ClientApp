-- ============================================================================
-- Proposals — a priced proposal built in the app, sent to a prospect as a
-- tokenised link, read and accepted by them on the web without ever logging
-- in.
--
-- Why no login: profiles.role = 'client' requires a client_id (064's check
-- constraint), and a clients row only ever comes from an active Autotask
-- company — so a prospect who hasn't signed yet structurally cannot hold a
-- portal account. Portal logins also require MFA. The tokenised public link
-- is the same shape as the quarterly-review client acknowledgment (110), and
-- is consumed by src/app/proposal-view/[token] outside the auth wall.
--
-- Run this in the Supabase SQL Editor AFTER 128.
-- ============================================================================

-- 'viewed' is deliberately NOT a status: it's derived from first_viewed_at.
-- As a status it would mean a write on every open, and would race the
-- reminder cron, which selects on status = 'sent'.
create type public.proposal_status as enum
  ('draft', 'sent', 'accepted', 'declined', 'expired', 'withdrawn');

create type public.proposal_billing_period as enum ('one_off', 'monthly');

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  -- Nullable: a brand-new prospect has no clients row at all (see the header
  -- comment). Same convention as sales_requests.client_id.
  client_id uuid references public.clients (id) on delete set null,
  -- Kept populated even when client_id is set — a snapshot of who this went
  -- to, so renaming or unlinking the client later can't rewrite history on an
  -- accepted proposal.
  prospect_company text,
  prospect_contact_name text,
  prospect_email text,
  title text not null,
  status public.proposal_status not null default 'draft',
  currency text not null default 'CAD',
  intro text,
  closing_note text,
  valid_until date,
  -- Minted once on first send and kept across resends: a prospect forwards
  -- this link to their partner or their accountant, and rotating it per send
  -- (the way quarterly_reviews.client_ack_token does) would silently break it
  -- under them. revokeProposalLinkAction nulls it when that's actually wanted.
  access_token uuid,
  owner_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  sent_at timestamptz,
  sent_to_email text,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0,
  accepted_at timestamptz,
  accepted_by_name text,
  accepted_by_email text,
  -- 'link' = the prospect accepted it themselves; 'staff' = someone said yes
  -- on the phone and a rep recorded it.
  accepted_via text,
  accepted_recorded_by uuid references public.profiles (id) on delete set null,
  declined_at timestamptz,
  decline_reason text,
  reminder_count integer not null default 0,
  last_reminder_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposals_recipient_present
    check (client_id is not null or prospect_company is not null),
  constraint proposals_accepted_via_valid
    check (accepted_via is null or accepted_via in ('link', 'staff'))
);

create unique index proposals_access_token_idx
  on public.proposals (access_token)
  where access_token is not null;
create index proposals_status_idx on public.proposals (status, created_at desc);
create index proposals_client_idx on public.proposals (client_id);
create index proposals_owner_idx on public.proposals (owner_id);

create trigger proposals_set_updated_at before update on public.proposals
  for each row execute procedure public.set_updated_at();

-- kind is plain text, not an enum, for the same reason alerts.kind is (108):
-- adding a new section kind shouldn't need a migration. Known values:
-- 'overview' | 'steps' | 'pricing' | 'next_steps' | 'custom'.
create table public.proposal_sections (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  kind text not null default 'custom',
  heading text not null,
  -- Plain text, rendered with white-space: pre-line. No rich-text editor
  -- dependency for what is, in practice, a few paragraphs.
  body text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index proposal_sections_proposal_idx
  on public.proposal_sections (proposal_id, sort_order);

-- At most one pricing section per proposal — it's a positional marker for
-- where the line-item table renders, not a container for it.
create unique index proposal_sections_pricing_idx
  on public.proposal_sections (proposal_id)
  where kind = 'pricing';

-- Line items hang off the proposal, NOT off the pricing section: reordering
-- or deleting a section must never cascade away the pricing.
--
-- Money is numeric(12,2) to match every other money column in this schema
-- (schema.sql's amount numeric(12,2)). Integer cents would be the purist
-- choice but would make this table the odd one out and force conversions in
-- the email and PDF builders.
create table public.proposal_line_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  description text not null,
  detail text,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  billing_period public.proposal_billing_period not null default 'one_off',
  -- An optional add-on the prospect ticks for themselves on the public page.
  -- is_selected is only meaningful while is_optional is true.
  is_optional boolean not null default false,
  is_selected boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint proposal_line_items_quantity_non_negative check (quantity >= 0),
  constraint proposal_line_items_unit_price_non_negative check (unit_price >= 0)
);

create index proposal_line_items_proposal_idx
  on public.proposal_line_items (proposal_id, sort_order);

-- One row per genuine open, plus the bot hits we deliberately don't count.
-- Outlook Safe Links, Proofpoint, Mimecast and Teams/Slack unfurlers all GET
-- the page; counting those would make "opened 4 times" a lie, which is the
-- one signal this whole feature exists to produce. See
-- src/components/proposal-view-beacon.tsx — the count comes from a JS beacon
-- after a dwell, never from the server render.
create table public.proposal_views (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  user_agent text,
  -- sha256(ip + PROPOSAL_VIEW_IP_SALT), computed in the app. Never the raw
  -- IP: this is a prospect's personal data and we only need it to tell two
  -- readers apart, not to identify anyone.
  ip_hash text,
  is_bot boolean not null default false,
  source text not null default 'beacon',
  constraint proposal_views_source_valid check (source in ('beacon', 'page_load'))
);

create index proposal_views_proposal_idx
  on public.proposal_views (proposal_id, viewed_at desc);

-- Staff-only, like 125. The public page never uses an authenticated client —
-- it goes through createAdminClient() (service role, bypasses RLS) and looks
-- the proposal up by access_token only, exactly like
-- getQuarterlyReviewByAckToken.
alter table public.proposals enable row level security;
create policy "proposals full access for staff" on public.proposals
  for all using (public.is_staff()) with check (public.is_staff());

alter table public.proposal_sections enable row level security;
create policy "proposal_sections full access for staff" on public.proposal_sections
  for all using (public.is_staff()) with check (public.is_staff());

alter table public.proposal_line_items enable row level security;
create policy "proposal_line_items full access for staff" on public.proposal_line_items
  for all using (public.is_staff()) with check (public.is_staff());

alter table public.proposal_views enable row level security;
create policy "proposal_views full access for staff" on public.proposal_views
  for all using (public.is_staff()) with check (public.is_staff());
