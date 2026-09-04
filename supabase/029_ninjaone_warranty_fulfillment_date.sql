-- CG Technologies Client Tracker — store NinjaOne's auto-detected hardware
-- manufacture/ship date (references.warranty.manufacturerFulfillmentDate on
-- NinjaOne's own Device schema) — a real proxy for device age, unlike
-- device_created_at which only reflects when the device was enrolled in
-- NinjaOne. Not populated for every device (depends on vendor warranty
-- lookup support and whether it's run), so the age check falls back to
-- device_created_at when this is null.
alter table public.ninjaone_devices add column if not exists manufacturer_fulfillment_date timestamptz;
