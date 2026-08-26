-- Generate a stable receipt record for every newly posted journal entry.

create sequence if not exists public.receipt_number_sequence;

create or replace function public.materialize_posted_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix_value text;
begin
  if new.status <> 'posted' then return new; end if;
  select coalesce(receipt_prefix, 'SAR') into prefix_value from public.organization_settings where organization_id = new.organization_id;
  insert into public.receipts (organization_id, journal_entry_id, receipt_number, language_code)
    values (new.organization_id, new.id, prefix_value || '-' || lpad(nextval('public.receipt_number_sequence')::text, 8, '0'), 'en')
    on conflict (journal_entry_id) do nothing;
  return new;
end;
$$;

drop trigger if exists materialize_posted_receipt_after_entry on public.journal_entries;
create trigger materialize_posted_receipt_after_entry after insert on public.journal_entries for each row execute function public.materialize_posted_receipt();