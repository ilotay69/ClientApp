-- ============================================================================
-- Adds a ciphertext column beside every stored vendor credential, and drops
-- the NOT NULL on the six plaintext columns that have it so a later migration
-- can empty them.
--
-- Purely additive and safe to run against a live production with the CURRENT
-- build deployed: nothing reads the _enc columns yet, every plaintext column
-- keeps its value and keeps being read. ADD COLUMN (nullable, no default) and
-- DROP NOT NULL are both catalog-only in modern Postgres — no table rewrite,
-- sub-millisecond on tables this size (72 secret-bearing rows total).
--
-- This is phase 1 of the credential-encryption rollout. The plaintext columns
-- are NOT emptied or dropped here; that is a separate migration run only after
-- the ciphertext has been proven to decrypt back to the plaintext for every
-- row and every integration has been re-verified through a live vendor call.
--
-- Run this in the Supabase SQL Editor.
-- ============================================================================

alter table public.ai_provider_settings    add column if not exists api_key_enc text;

alter table public.autotask_settings       add column if not exists username_enc text,
                                            add column if not exists secret_enc text,
                                            add column if not exists integration_code_enc text;

alter table public.ninjaone_settings        add column if not exists client_id_enc text,
                                            add column if not exists client_secret_enc text,
                                            add column if not exists cached_access_token_enc text;

alter table public.m365_client_credentials  add column if not exists app_client_id_enc text,
                                            add column if not exists app_client_secret_enc text,
                                            add column if not exists cached_access_token_enc text;

alter table public.hudu_settings            add column if not exists base_url_enc text,
                                            add column if not exists api_key_enc text;

alter table public.huntress_settings        add column if not exists api_key_enc text,
                                            add column if not exists api_secret_enc text;

alter table public.bitdefender_settings     add column if not exists api_key_enc text;
alter table public.wizer_settings           add column if not exists api_key_enc text;
alter table public.nordlayer_settings       add column if not exists api_key_enc text;
alter table public.nordpass_settings        add column if not exists private_key_enc text;

alter table public.forticloud_accounts      add column if not exists api_user_enc text,
                                            add column if not exists api_password_enc text;

alter table public.shared_mailbox_settings  add column if not exists cached_access_token_enc text;

alter table public.mail_connections         add column if not exists access_token_enc text,
                                            add column if not exists refresh_token_enc text;

-- Six plaintext columns are NOT NULL today. The later scrub migration cannot
-- empty them until this comes off, and dropping it now is a no-op for the
-- running app: every reader already treats a missing value as "not
-- configured" and returns null rather than erroring.
alter table public.forticloud_accounts      alter column api_user         drop not null,
                                            alter column api_password     drop not null;
alter table public.m365_client_credentials  alter column app_client_id    drop not null,
                                            alter column app_client_secret drop not null;
alter table public.mail_connections         alter column access_token     drop not null,
                                            alter column refresh_token    drop not null;
