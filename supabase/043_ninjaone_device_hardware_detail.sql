-- More hardware detail for the expanded device panel — same best-effort
-- enrichment approach as os_name/manufacturer/model in
-- 018_ninjaone_device_detail.sql: NinjaOne's bulk "queries" reports for
-- processors/volumes/device_health, with unconfirmed field names guessed
-- defensively (falls back to null, never fails the sync).
alter table public.ninjaone_devices add column if not exists cpu_model text;
alter table public.ninjaone_devices add column if not exists ram_bytes bigint;
alter table public.ninjaone_devices add column if not exists disk_total_bytes bigint;
alter table public.ninjaone_devices add column if not exists disk_free_bytes bigint;
alter table public.ninjaone_devices add column if not exists last_boot_at timestamptz;
