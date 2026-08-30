-- Keep the legacy reporting/materialization tables compatible with the stable
-- money-account metadata. Financial posting remains authoritative in the
-- journal; these rows support existing operational views and exports.

create or replace function public.materialize_posted_operation_v2()
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
  source_location_value text;
  destination_location_value text;
begin
  if new.status <> 'posted' then return new; end if;
  select * into event_row from public.financial_events where id = new.financial_event_id;
  operation_value := upper(event_row.event_type::text);
  metadata := event_row.metadata;
  currency_value := upper(metadata->>'currency');
  amount_value := (metadata->>'amount')::numeric;
  source_location_value := coalesce(
    nullif(trim(metadata->>'source_account_name'), ''),
    nullif(trim(metadata->>'from_location'), ''),
    nullif(trim(metadata->>'location'), ''),
    'unassigned-source'
  );
  destination_location_value := coalesce(
    nullif(trim(metadata->>'destination_account_name'), ''),
    nullif(trim(metadata->>'to_location'), ''),
    nullif(trim(metadata->>'location'), ''),
    'unassigned-destination'
  );
  location_value := coalesce(
    nullif(trim(metadata->>'location'), ''),
    nullif(trim(metadata->>'source_account_name'), ''),
    nullif(trim(metadata->>'destination_account_name'), ''),
    'unassigned'
  );

  if operation_value = 'RECORD_EXPENSE' then
    insert into public.expenses (
      organization_id, branch_id, currency_code, amount, paid_from,
      journal_entry_id, occurred_at, note
    ) values (
      event_row.organization_id, event_row.branch_id, currency_value,
      amount_value, source_location_value, new.id, new.occurred_at,
      metadata->>'memo'
    ) on conflict do nothing;
  elsif operation_value = 'RECORD_INCOME' then
    insert into public.income_events (
      organization_id, branch_id, category, currency_code, amount,
      journal_entry_id
    ) values (
      event_row.organization_id, event_row.branch_id,
      coalesce(metadata->>'category', 'other'), currency_value, amount_value,
      new.id
    ) on conflict do nothing;
  elsif operation_value in ('OWNER_INVESTMENT', 'OWNER_WITHDRAWAL') then
    insert into public.owner_capital_events (
      organization_id, owner_id, event_type, currency_code, amount,
      journal_entry_id
    ) values (
      event_row.organization_id, event_row.created_by,
      lower(replace(operation_value, 'OWNER_', '')), currency_value,
      amount_value, new.id
    ) on conflict do nothing;
  elsif operation_value in ('BANK_DEPOSIT', 'BANK_WITHDRAWAL') then
    insert into public.bank_movements (
      organization_id, branch_id, from_location, to_location, currency_code,
      amount, journal_entry_id
    ) values (
      event_row.organization_id, event_row.branch_id, source_location_value,
      destination_location_value, currency_value, amount_value, new.id
    ) on conflict do nothing;
  elsif operation_value = 'TRANSFER_CASH' then
    insert into public.cash_transfers (
      organization_id, branch_id, from_location, to_location, currency_code,
      amount, status, journal_entry_id, note
    ) values (
      event_row.organization_id, event_row.branch_id, source_location_value,
      destination_location_value, currency_value, amount_value, 'received',
      new.id, metadata->>'memo'
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.materialize_posted_operation_v2() from public, anon, authenticated;
