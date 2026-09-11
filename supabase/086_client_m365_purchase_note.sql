-- ============================================================================
-- Free-text note per client for how their Microsoft 365 licences are
-- purchased (e.g. "Direct from Microsoft" vs "Through TD Synnex") — nothing
-- in Microsoft's own APIs exposes purchase-channel/reseller info for a
-- tenant's own subscribedSkus, so this is a manual, staff-maintained note
-- rather than anything synced.
--
-- Run this in the Supabase SQL Editor AFTER 085.
-- ============================================================================

alter table public.clients add column if not exists m365_license_purchase_note text;
