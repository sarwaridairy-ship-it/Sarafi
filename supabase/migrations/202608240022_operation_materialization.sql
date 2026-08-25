-- Keep operational records synchronized with successful immutable postings.

create or replace function public.materialize_posted_operation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row public.financial_events;
  operation_value text;
  metadata jsonb;
  currency_value text;
  amount_value numeric;
  location_value text;
begin
  if new.status <> 'posted' then return new; end if;
  select * into event_row from public.financial_events where id = new.financial_event_id;
  operation_value := upper(event_row.event_type::text);
  metadata := event_row.metadata;
  currency_value := upper(metadata->>'currency');
  amount_value := (metadata->>'amount')::numeric;
  location_value := coalesce(nullif(trim(metadata->>'location'), ''), 'unassigned');
  if operation_value = 'RECORD_EXPENSE' then
    insert into public.expenses (organization_id, branch_id, currency_code, amount, paid_from, journal_entry_id, occurred_at, note)
      values (event_row.organization_id, event_row.branch_id, currency_value, amount_value, location_value, new.id, new.occurred_at, metadata->>'memo');
  elsif operation_value = 'RECORD_INCOME' then
    insert into public.income_events (organization_id, branch_id, category, currency_code, amount, journal_entry_id)
      values (event_row.organization_id, event_row.branch_id, coalesce(metadata->>'category', 'other'), currency_value, amount_value, new.id);
  elsif operation_value in ('OWNER_INVESTMENT', 'OWNER_WITHDRAWAL') then
    insert into public.owner_capital_events (organization_id, owner_id, event_type, currency_code, amount, journal_entry_id)
      values (event_row.organization_id, event_row.created_by, lower(replace(operation_value, 'OWNER_', '')), currency_value, amount_value, new.id);
  elsif operation_value in ('BANK_DEPOSIT', 'BANK_WITHDRAWAL') then
    insert into public.bank_movements (organization_id, branch_id, from_location, to_location, currency_code, amount, journal_entry_id)
      values (event_row.organization_id, event_row.branch_id, coalesce(metadata->>'from_location', location_value), coalesce(metadata->>'to_location', location_value), currency_value, amount_value, new.id);
  elsif operation_value = 'TRANSFER_CASH' then
    insert into public.cash_transfers (organization_id, branch_id, from_location, to_location, currency_code, amount, status, journal_entry_id, note)
      values (event_row.organization_id, event_row.branch_id, coalesce(metadata->>'from_location', location_value), coalesce(metadata->>'to_location', location_value), currency_value, amount_value, 'received', new.id, metadata->>'memo');
  end if;
  return new;
end;
$$;

drop trigger if exists materialize_operation_after_post on public.journal_entries;
create trigger materialize_operation_after_post after insert on public.journal_entries for each row execute function public.materialize_posted_operation();