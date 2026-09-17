-- Client Mapping split out of manage_integrations into its own permission
-- key, mirroring the page itself moving out of Settings -> Integrations
-- into its own /settings/client-mapping page. Onboarding a new client
-- (linking their NinjaOne org / M365 tenant / Huntress org) is a
-- frequent task that shouldn't require also being trusted with API keys
-- and AI provider settings.
--
-- Seed is the NEXT migration: a value added by ALTER TYPE ... ADD VALUE
-- can't be used in the same transaction that added it (Postgres 55P04).
alter type public.permission_key add value if not exists 'manage_client_mapping';
