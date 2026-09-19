-- Seed data for a STAGING project. Never for production.
--
-- Deliberately tiny. Its job is not to make staging realistic — it is to
-- make staging instantly, visibly NOT production, so that "am I about to
-- click Send on a real client?" is answerable at a glance. Everything
-- here is obviously fake.
--
-- Proposals, quotes and tickets are not seeded on purpose: proposals
-- carry a trigger-assigned proposal_number and an owner FK to profiles,
-- and creating one through the UI is a better test of staging than
-- inserting one behind the app's back.
--
-- The first staff user is still created the way README.md describes:
-- sign up through the UI, then promote by hand with
--   update public.profiles set role = 'owner' where email = '<you>';

-- Refuses to run against a database that already has clients, which
-- production does and a fresh staging project does not. This is the whole
-- safety mechanism, so it stays the first statement in the file.
do $$
begin
  if (select count(*) from public.clients) > 0 then
    raise exception
      'Refusing to seed: this database already has % client row(s). seed_staging.sql is only for a fresh staging project.',
      (select count(*) from public.clients);
  end if;
end $$;

insert into public.clients (name, primary_contact_name, primary_contact_email, primary_contact_phone, notes)
values
  ('Acme Test Ltd. (STAGING)', 'Wile E. Coyote', 'nobody@example.invalid', '416-555-0100',
   'Fake client. Staging only.'),
  ('Blackrock Fictional Inc. (STAGING)', 'Jane Doe', 'nobody+2@example.invalid', '416-555-0101',
   'Fake client. Staging only.'),
  ('Sample Manufacturing Co. (STAGING)', 'John Sample', 'nobody+3@example.invalid', '416-555-0102',
   'Fake client. Staging only.');

-- example.invalid is reserved by RFC 2606 and can never be delivered to,
-- so even a misconfigured environment that tried to email these would
-- fail at DNS rather than reach a real person.
