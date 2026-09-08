-- SARAFI whole-web v6: reserve explicit Hawala accounting event labels.
--
-- Keep enum changes in their own committed migration. PostgreSQL requires a
-- newly-added enum value to be committed before a later migration can use it
-- in functions or triggers.

alter type public.financial_event_type add value if not exists 'hawala_outgoing_funded';
alter type public.financial_event_type add value if not exists 'hawala_incoming_recorded';
alter type public.financial_event_type add value if not exists 'hawala_beneficiary_paid';
alter type public.financial_event_type add value if not exists 'hawala_partner_paid';
alter type public.financial_event_type add value if not exists 'hawala_partner_collected';
