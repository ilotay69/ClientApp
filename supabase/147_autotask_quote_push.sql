-- Pushing an accepted (or any) proposal to Autotask as a real Quote -
-- Autotask's REST API cannot create Invoices or BillingItems (both are
-- read/update-only), so the closest real automation is an Autotask Quote,
-- which someone then reviews and marks Won inside Autotask itself.
--
-- Every QuoteItem the Autotask API accepts must reference a real catalog
-- Service/Product - there's no way to send a plain free-text line - so a
-- fallback catalog Service is configured here for any proposal line that
-- doesn't match an existing Autotask Service by name.
alter table public.autotask_settings add column if not exists default_quote_service_id integer;
alter table public.autotask_settings add column if not exists default_quote_service_name text;

-- Tracks whether (and to what) a proposal has already been pushed, so
-- clicking "Push to Autotask" twice can't create two Quotes for the same
-- proposal.
alter table public.proposals add column if not exists autotask_quote_id integer;
alter table public.proposals add column if not exists autotask_quote_number text;
alter table public.proposals add column if not exists autotask_pushed_at timestamptz;
