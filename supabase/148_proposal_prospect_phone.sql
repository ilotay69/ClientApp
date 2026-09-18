-- Autotask refuses to create a Company without a phone number (it is one
-- of the four required fields, alongside companyName, companyType and
-- companyCategoryID), and a proposal had nowhere to record one. Collected
-- with the rest of the recipient details when the proposal is created, so
-- "Push to Autotask" already has it rather than asking at push time.
alter table public.proposals add column if not exists prospect_phone text;
