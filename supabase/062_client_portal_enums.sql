-- ============================================================================
-- Client portal — enum values only.
--
-- Run this in the Supabase SQL Editor BEFORE 063.
--
-- This file adds enum values and does NOTHING ELSE. Postgres refuses to use a
-- newly-added enum value in the same transaction that added it (error 55P04,
-- "unsafe use of new value of enum type"), so the values and every statement
-- that references them have to land in separate migrations. Same split as
-- 046/047 and 059/060.
--
--   'client'              — a customer's read-only portal login. NOT a staff
--                           role: public.is_staff() (added in 064) deliberately
--                           allowlists the four staff roles rather than
--                           denylisting this one, so any role added later is
--                           locked out by default until someone says otherwise.
--   'manage_client_access' — permission to provision/revoke portal logins.
-- ============================================================================
alter type public.user_role add value if not exists 'client';
alter type public.permission_key add value if not exists 'manage_client_access';
