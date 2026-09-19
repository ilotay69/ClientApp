-- Bulk staging data, shaped to match production's volumes so the UI,
-- dashboards and reports behave the way they do in the real thing.
-- STAGING ONLY. Everything is invented - no production data is copied.
--
-- Production row counts this mirrors (read from pg_stat_user_tables):
--   clients 95, autotask_tickets 135, ninjaone_devices 681,
--   proposals 29, projects 18, quarterly_reviews 13, alerts 103.
--
-- Safe to re-run: it refuses on a database that already looks populated,
-- which production does and staging (with only the 3-client starter seed)
-- does not.

do $$
begin
  if (select count(*) from public.clients) > 10 then
    raise exception
      'Refusing to seed: % clients already present. seed_staging_bulk.sql is for a staging project only.',
      (select count(*) from public.clients);
  end if;
end $$;

-- An owner to hang records off. Whoever signed in first.
create temporary table _owner as
  select id from public.profiles order by created_at limit 1;

-- ---------------------------------------------------------------- clients
-- Names are deliberately invented but ordinary-looking, because a client
-- list of "Test 1..95" makes it impossible to judge whether a list, search
-- or sort actually behaves.
insert into public.clients (name, primary_contact_name, primary_contact_email, primary_contact_phone, address, notes, owner_id)
select
  (array['Northwind','Contoso','Fabrikam','Tailspin','Wingtip','Proseware','Litware','Adventure Works',
         'Coho','Lucerne','Alpine Ski','Blue Yonder','City Power','Consolidated Messenger','Graphic Design',
         'Humongous','Margie''s Travel','Trey Research','Woodgrove','School of Fine Art'])[1 + (i % 20)]
  || ' ' ||
  (array['Manufacturing','Logistics','Dental','Legal','Realty','Financial','Construction','Health',
         'Consulting','Automotive','Foods','Systems','Marketing','Insurance','Engineering'])[1 + (i % 15)]
  || ' ' ||
  (array['Ltd.','Inc.','Group','Corp.','LLP'])[1 + (i % 5)],
  (array['Alex','Jordan','Sam','Riley','Casey','Morgan','Taylor','Jamie','Avery','Quinn'])[1 + (i % 10)]
  || ' ' ||
  (array['Bennett','Carver','Dalton','Ellis','Fletcher','Grant','Hayes','Ingram','Jensen','Keller'])[1 + (i % 10)],
  'nobody+c' || i || '@example.invalid',
  '416-555-' || lpad((1000 + i)::text, 4, '0'),
  (100 + i) || ' Example Street, Suite ' || (i % 40 + 1) || E'\nToronto, ON  M5V ' || lpad((i % 9 + 1)::text,1,'0') || 'A' || (i % 9 + 1),
  case when i % 7 = 0 then 'Renewal due this quarter. Fake record.' else null end,
  (select id from _owner)
from generate_series(1, 92) i;

-- ------------------------------------------------------------- contacts
insert into public.client_contacts (client_id, name, email)
select c.id,
       (array['Dana Whitfield','Chris Okonkwo','Pat Lindqvist','Robin Amari','Sky Delacroix'])[1 + (n % 5)],
       'nobody+ct' || n || '.' || left(c.id::text, 4) || '@example.invalid'
from public.clients c, generate_series(1, 2) n
where c.name not like '%(STAGING)%';

-- ------------------------------------------------------------- projects
insert into public.projects (client_id, name, status, owner_id, notes)
select c.id,
       (array['Microsoft 365 Migration','Firewall Replacement','Server Refresh','Backup Overhaul',
              'Office Relocation','Entra ID Hardening','VoIP Rollout','Wi-Fi Redesign','SharePoint Rebuild'])[1 + (row_number() over () % 9)]::text,
       (array['planning','active','active','on_hold','completed'])[1 + (row_number() over () % 5)]::public.project_status,
       (select id from _owner),
       'Fake project for staging.'
from public.clients c
where c.name not like '%(STAGING)%'
order by c.created_at
limit 18;

-- ---------------------------------------------------------------- tasks
insert into public.tasks (client_id, title, status, assigned_to, due_date, priority, notes)
select c.id,
       (array['Review backup report','Chase renewal quote','Patch domain controllers','Onboard new starter',
              'Decommission old NAS','Quarterly review prep','Check licence overage','Replace failing SSD',
              'Follow up on ticket','Update network diagram'])[1 + (i % 10)],
       (array['open','open','in_progress','waiting_client','done'])[1 + (i % 5)]::public.task_status,
       (select id from _owner),
       current_date + (((i % 30) - 10))::int,
       (array['low','medium','high'])[1 + (i % 3)]::public.task_priority,
       'Fake task for staging.'
from (select id, row_number() over (order by created_at) i from public.clients where name not like '%(STAGING)%') c
where c.i <= 45;

-- ---------------------------------------------------------- touchpoints
insert into public.touchpoints (client_id, due_date, owner_id, next_action)
select c.id, current_date + (((c.i % 60) - 20))::int, (select id from _owner), 'Fake touchpoint follow-up.'
from (select id, row_number() over (order by created_at) i from public.clients where name not like '%(STAGING)%') c
where c.i <= 40;

-- ------------------------------------------------------ autotask tickets
insert into public.autotask_tickets (id, client_id, ticket_number, title, status, priority, due_date, description, last_synced_at)
select 100000 + i,
       c.id,
       'T2026' || lpad(i::text, 5, '0'),
       (array['Outlook not syncing','Printer offline','VPN drops hourly','Password reset request',
              'New laptop setup','Disk space warning','Phishing email reported','Backup job failed',
              'Slow file access','Licence assignment'])[1 + (i % 10)],
       (array['New','In Progress','Waiting Customer','Complete'])[1 + (i % 4)],
       (array['High','Medium','Low','Critical'])[1 + (i % 4)],
       now() + ((i % 20) - 5) * interval '1 day',
       'Fake ticket body for staging.',
       now()
from generate_series(1, 135) i
cross join lateral (
  select id from public.clients where name not like '%(STAGING)%' order by created_at offset (i % 92) limit 1
) c;

-- ------------------------------------------------------- ninjaone devices
insert into public.ninjaone_devices (id, client_id, system_name, node_class, is_offline, os_name, last_boot_at, last_synced_at)
select 200000 + i,
       c.id,
       (array['CG-WS','CG-LT','CG-SRV','CG-NB'])[1 + (i % 4)] || '-' || lpad(i::text, 4, '0'),
       (array['WINDOWS_WORKSTATION','WINDOWS_WORKSTATION','WINDOWS_SERVER','MAC'])[1 + (i % 4)],
       (i % 11 = 0),
       (array['Windows 11 Pro','Windows 10 Pro','Windows Server 2022','Windows Server 2019','macOS 15'])[1 + (i % 5)],
       now() - ((i % 30) * interval '1 day'),
       now()
from generate_series(1, 681) i
cross join lateral (
  select id from public.clients where name not like '%(STAGING)%' order by created_at offset (i % 92) limit 1
) c;

-- ------------------------------------------------------ quarterly reviews
insert into public.quarterly_reviews (client_id, review_period, status, created_by, summary)
select c.id,
       (array['Q1 2026','Q2 2026','Q3 2026'])[1 + (c.i % 3)],
       (array['draft','submitted','approved','sent'])[1 + (c.i % 4)],
       (select id from _owner),
       'Fake quarterly review summary for staging.'
from (select id, row_number() over (order by created_at) i from public.clients where name not like '%(STAGING)%') c
where c.i <= 13;

insert into public.quarterly_review_items (review_id, item_key, status, comments)
select r.id,
       k.key,
       (array['healthy','attention','urgent','na','recommended'])[1 + ((row_number() over ())::int % 5)],
       'Fake review item.'
from public.quarterly_reviews r
cross join (values ('backups'),('patching'),('licensing'),('security'),('hardware'),
                   ('network'),('documentation'),('training'),('renewals'),
                   ('m365_secure_score'),('endpoint_protection')) as k(key);

-- ------------------------------------------------------------- proposals
insert into public.proposals (proposal_number, client_id, prospect_company, prospect_contact_name, prospect_email,
                              title, status, currency, owner_id, created_by, valid_until, intro)
select 1000 + c.i,
       c.id,
       c.name,
       'Fake Contact',
       'nobody+p' || c.i || '@example.invalid',
       (array['Managed IT Services 2026','Security Uplift','Cloud Migration','Backup & DR',
              'Network Refresh'])[1 + (c.i % 5)],
       (array['draft','sent','sent','accepted','declined'])[1 + (c.i % 5)]::public.proposal_status,
       'CAD',
       (select id from _owner),
       (select id from _owner),
       current_date + 30,
       'Fake proposal intro for staging.'
from (select id, name, row_number() over (order by created_at) i from public.clients where name not like '%(STAGING)%') c
where c.i <= 29;

insert into public.proposal_sections (proposal_id, kind, heading, body, sort_order)
select p.id, s.kind, s.heading, 'Fake section body for staging.', s.ord
from public.proposals p
cross join (values ('overview','Overview',0),('steps','What we''ll do',1),
                   ('pricing','Quote Details',2),('next_steps','Next steps',3)) as s(kind, heading, ord);

insert into public.proposal_line_items (proposal_id, description, quantity, unit_price, billing_period, is_optional, sort_order)
select p.id, l.descr, l.qty, l.price, l.period::public.proposal_billing_period, l.opt, l.ord
from public.proposals p
cross join (values
  ('Managed IT Services - per seat', 25, 89.00, 'monthly', false, 0),
  ('Microsoft 365 Business Premium', 25, 31.90, 'monthly', false, 1),
  ('Onboarding & Setup', 1, 2500.00, 'one_off', false, 2),
  ('After-hours Support Cover', 1, 450.00, 'monthly', true, 3)
) as l(descr, qty, price, period, opt, ord);

-- ---------------------------------------------------------------- alerts
insert into public.alerts (recipient_id, kind, title, detail, href)
select (select id from _owner),
       (array['task_assigned','proposal_accepted','time_off_requested','quarterly_review_ack'])[1 + (i % 4)],
       (array['Task assigned to you','Proposal accepted','Time off requested','Client acknowledged a review'])[1 + (i % 4)],
       'Fake alert for staging.',
       '/dashboard'
from generate_series(1, 60) i;

-- --------------------------------------------------------- interactions
insert into public.client_interactions (client_id, type, body, created_by)
select c.id,
       (array['note','call','meeting','check_in'])[1 + (c.i % 4)]::public.client_interaction_type,
       'Fake interaction logged for staging.',
       (select id from _owner)
from (select id, row_number() over (order by created_at) i from public.clients where name not like '%(STAGING)%') c
where c.i <= 50;
