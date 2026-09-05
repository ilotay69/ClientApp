-- CG Technologies Client Tracker — lets a Timeline "quote" entry reference
-- an existing Autotask quote (name/number/status/dates + a deep link to
-- its own Autotask page) instead of only ever being an uploaded file.
-- Autotask's Quotes API has no PDF/portal-link field of its own, so the
-- deep link goes to the classic web UI's quote.asp page, which lives on a
-- different zone/hostname than the REST API (e.g. "ww3.autotask.net" vs
-- "webservices3.autotask.net") — that web zone comes back from the same
-- zoneInformation call already made when testing/saving the connection,
-- so it's captured and stored here rather than requiring a second lookup
-- per quote fetch.
alter table public.autotask_settings add column if not exists web_zone_url text;

alter table public.client_interactions add column if not exists external_link text;
