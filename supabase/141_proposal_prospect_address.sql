-- The client/prospect's own mailing address, shown as the "to" side
-- alongside company_info's "from" on the public proposal page and its
-- signed-copy PDF. One free-text field (like prospect_company/
-- prospect_contact_name already are), typed once at creation and
-- editable afterward from the editor's Details card.
alter table public.proposals add column if not exists prospect_address text;
