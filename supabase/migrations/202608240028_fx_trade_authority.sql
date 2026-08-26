-- Validate client previews at the database boundary and post trade fees atomically.

create or replace function public.validate_fx_trade_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rate_value numeric;
  sold_amount_value numeric;
  bought_amount_value numeric;
  fee_value numeric;
  fee_currency_value text;
begin
  if new.event_type not in ('buy_fx', 'sell_fx', 'exchange_fx') then return new; end if;
  sold_amount_value := (new.metadata->>'sold_amount')::numeric;
  bought_amount_value := (new.metadata->>'bought_amount')::numeric;
  if sold_amount_value is null or bought_amount_value is null or sold_amount_value <= 0 or bought_amount_value <= 0 then raise exception 'FX amounts must be positive'; end if;
  if upper(new.metadata->>'sold_currency') = upper(new.metadata->>'bought_currency') then raise exception 'FX currencies must differ'; end if;
  if new.metadata ? 'counterparty_id' and nullif(trim(new.metadata->>'counterparty_id'), '') is not null then
    new.counterparty_id := (new.metadata->>'counterparty_id')::uuid;
    if not exists (select 1 from public.counterparties where id = new.counterparty_id and organization_id = new.organization_id and risk_status <> 'blocked') then raise exception 'Counterparty is invalid or blocked'; end if;
  end if;
  if nullif(trim(new.metadata->>'customer_rate'), '') is not null then
    rate_value := (new.metadata->>'customer_rate')::numeric;
    if rate_value <= 0 then raise exception 'Customer rate must be positive'; end if;
    if new.event_type = 'buy_fx' and abs(sold_amount_value - (bought_amount_value * rate_value)) > 0.000000000001 then raise exception 'BUY_FX amounts do not match customer rate'; end if;
    if new.event_type = 'sell_fx' and abs(bought_amount_value - (sold_amount_value * rate_value)) > 0.000000000001 then raise exception 'SELL_FX amounts do not match customer rate'; end if;
  end if;
  if nullif(trim(new.metadata->>'fee_amount'), '') is not null then
    fee_value := (new.metadata->>'fee_amount')::numeric;
    fee_currency_value := upper(new.metadata->>'fee_currency');
    if fee_value <= 0 or not exists (select 1 from public.currencies where code = fee_currency_value and active) then raise exception 'Fee is invalid'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_fx_trade_event_before_insert on public.financial_events;
create trigger validate_fx_trade_event_before_insert before insert on public.financial_events for each row execute function public.validate_fx_trade_event();

create or replace function public.materialize_fx_trade_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row public.financial_events;
  fee_value numeric;
  fee_currency_value text;
  cashbox_id_value uuid;
  cash_account uuid;
  fee_account uuid;
begin
  if new.status <> 'posted' then return new; end if;
  select * into event_row from public.financial_events where id = new.financial_event_id;
  if event_row.event_type not in ('buy_fx', 'sell_fx', 'exchange_fx') then return new; end if;
  fee_value := nullif(trim(event_row.metadata->>'fee_amount'), '')::numeric;
  if fee_value is null or fee_value <= 0 then return new; end if;
  if exists (select 1 from public.fees where journal_entry_id = new.id) then return new; end if;
  fee_currency_value := upper(event_row.metadata->>'fee_currency');
  cashbox_id_value := (event_row.metadata->>'cashbox_id')::uuid;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code, cashbox_id)
    values (event_row.organization_id, 'cashbox:' || cashbox_id_value || ':' || fee_currency_value, 'Cashbox ' || fee_currency_value, 'asset', fee_currency_value, cashbox_id_value)
    on conflict (organization_id, code) do update set active = true returning id into cash_account;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
    values (event_row.organization_id, 'income:commission:' || fee_currency_value, 'Commission income ' || fee_currency_value, 'income', fee_currency_value)
    on conflict (organization_id, code) do update set active = true returning id into fee_account;
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit, source_metadata) values (event_row.organization_id, new.id, cash_account, fee_currency_value, fee_value, fee_value, jsonb_build_object('fee', true));
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit, source_metadata) values (event_row.organization_id, new.id, fee_account, fee_currency_value, fee_value, fee_value, jsonb_build_object('fee', true));
  insert into public.fees (organization_id, amount, currency_code, direction, journal_entry_id) values (event_row.organization_id, fee_value, fee_currency_value, 'income', new.id);
  return new;
end;
$$;

drop trigger if exists materialize_fx_trade_fee_after_entry on public.journal_entries;
create trigger materialize_fx_trade_fee_after_entry after insert on public.journal_entries for each row execute function public.materialize_fx_trade_fee();