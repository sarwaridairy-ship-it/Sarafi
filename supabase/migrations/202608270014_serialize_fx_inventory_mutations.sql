-- Serialize competing FX mutations by organization and sold currency before stock is read.
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
  sold_currency_value text;
begin
  if new.event_type not in ('buy_fx', 'sell_fx', 'exchange_fx') then return new; end if;
  sold_currency_value := upper(new.metadata->>'sold_currency');
  if new.event_type in ('sell_fx', 'exchange_fx') then
    perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text || ':fx-inventory:' || sold_currency_value, 0));
  end if;
  sold_amount_value := (new.metadata->>'sold_amount')::numeric;
  bought_amount_value := (new.metadata->>'bought_amount')::numeric;
  if sold_amount_value is null or bought_amount_value is null or sold_amount_value <= 0 or bought_amount_value <= 0 then raise exception 'FX amounts must be positive'; end if;
  if sold_currency_value = upper(new.metadata->>'bought_currency') then raise exception 'FX currencies must differ'; end if;
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
