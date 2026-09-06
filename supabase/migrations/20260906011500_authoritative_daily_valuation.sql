-- Daily operators enter native amounts only. The server resolves and records the
-- base-currency value from the active shop rate and overwrites journal base values.
create or replace function public.authoritative_base_amount(
  target_org uuid,
  target_branch uuid,
  currency_input text,
  amount_input numeric,
  allow_stale boolean default false
)
returns numeric
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  currency_value text := upper(trim(currency_input));
  base_currency_value text;
  rate_value numeric;
  effective_value timestamptz;
begin
  if target_org is null or currency_value is null or amount_input is null or amount_input < 0 then
    raise exception 'A valid organization, currency, and amount are required';
  end if;

  select upper(base_currency_code) into base_currency_value
  from public.organizations
  where id = target_org;
  if base_currency_value is null then raise exception 'Organization base currency is unavailable'; end if;
  if currency_value = base_currency_value then return round(amount_input, 12); end if;

  select (r.buy_rate + r.sell_rate) / 2, r.effective_from
    into rate_value, effective_value
  from public.rate_board_entries r
  where r.organization_id = target_org
    and r.from_currency = currency_value
    and r.to_currency = base_currency_value
    and r.active
    and r.effective_from <= now()
    and (r.branch_id is null or r.branch_id = target_branch)
  order by (r.branch_id is not null) desc, r.effective_from desc
  limit 1;

  if rate_value is null then raise exception 'RATE_MISSING: Publish a current shop rate before posting this currency'; end if;
  if not allow_stale and effective_value < now() - interval '24 hours' then
    raise exception 'RATE_STALE: Review or publish the shop rate before posting';
  end if;
  return round(amount_input * rate_value, 12);
end;
$$;

revoke all on function public.authoritative_base_amount(uuid, uuid, text, numeric, boolean) from public, anon, authenticated;

-- Keep every daily journal authoritative even if an old client submits a base value.
create or replace function public.enforce_authoritative_daily_journal_value()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_kind public.financial_event_type;
  branch_value uuid;
begin
  select fe.event_type, je.branch_id into event_kind, branch_value
  from public.journal_entries je
  join public.financial_events fe on fe.id = je.financial_event_id
  where je.id = new.journal_entry_id;

  if event_kind in (
    'opening_balance', 'receive_money', 'pay_money', 'transfer_cash',
    'record_expense', 'record_income', 'owner_investment', 'owner_withdrawal',
    'bank_deposit', 'bank_withdrawal'
  ) then
    if coalesce(new.native_debit, 0) <> 0 then
      new.base_debit := public.authoritative_base_amount(new.organization_id, branch_value, new.currency_code, new.native_debit, false);
    else
      new.base_debit := 0;
    end if;
    if coalesce(new.native_credit, 0) <> 0 then
      new.base_credit := public.authoritative_base_amount(new.organization_id, branch_value, new.currency_code, new.native_credit, false);
    else
      new.base_credit := 0;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_authoritative_daily_journal_value() from public, anon, authenticated;
drop trigger if exists journal_lines_authoritative_daily_value on public.journal_lines;
create trigger journal_lines_authoritative_daily_value
before insert on public.journal_lines
for each row execute function public.enforce_authoritative_daily_journal_value();

-- Patch the current command functions in place so native-only clients are accepted.
do $patch$
declare
  definition text;
  revised text;
begin
  select pg_get_functiondef('public.record_operation(jsonb)'::regprocedure) into definition;
  revised := replace(definition,
$$  select base_currency_code into base_currency_value from public.organizations where id = org_id;
  if currency_value = base_currency_value then
    base_amount_value := amount_value;
  else
    base_amount_value := nullif(command->>'base_amount', '')::numeric;
    if base_amount_value is null or base_amount_value <= 0 then raise exception 'Base-currency value is required for a foreign-currency operation'; end if;
  end if;$$,
$$  select base_currency_code into base_currency_value from public.organizations where id = org_id;
  base_amount_value := public.authoritative_base_amount(org_id, branch_id_value, currency_value, amount_value, false);$$);
  if revised = definition then raise exception 'record_operation valuation patch did not match'; end if;
  execute revised;

  select pg_get_functiondef('public.record_opening_balance(jsonb)'::regprocedure) into definition;
  revised := replace(definition,
$$  if amount_value is null or amount_value <= 0 or base_value is null or base_value <= 0 then raise exception 'Opening balance must be positive'; end if;$$,
$$  if amount_value is null or amount_value <= 0 then raise exception 'Opening balance must be positive'; end if;
  base_value := public.authoritative_base_amount(org_id, branch_id_value, currency_value, amount_value, false);
  command := command || jsonb_build_object('base_value', base_value, 'valuation_source', 'shop_rate');$$);
  if revised = definition then raise exception 'record_opening_balance valuation patch did not match'; end if;
  execute revised;

  select pg_get_functiondef('public.record_debt(jsonb)'::regprocedure) into definition;
  revised := replace(definition,
$$  select base_currency_code into base_currency_value from public.organizations where id = org_id;
  base_amount_value := case when currency_value = base_currency_value then amount_value else nullif(command->>'base_amount', '')::numeric end;
  if base_amount_value is null or base_amount_value <= 0 then raise exception 'Base-currency value is required for a foreign-currency debt'; end if;$$,
$$  select base_currency_code into base_currency_value from public.organizations where id = org_id;
  base_amount_value := public.authoritative_base_amount(org_id, branch_id_value, currency_value, amount_value, false);$$);
  if revised = definition then raise exception 'record_debt valuation patch did not match'; end if;
  execute revised;

  select pg_get_functiondef('public.settle_debt(jsonb)'::regprocedure) into definition;
  revised := replace(definition,
$$  select base_currency_code into base_currency_value from public.organizations where id = debt.organization_id;
  base_amount_value := case when debt.currency_code = base_currency_value then amount_value else nullif(command->>'base_amount', '')::numeric end;
  if base_amount_value is null or base_amount_value <= 0 then raise exception 'Base-currency value is required for a foreign-currency settlement'; end if;$$,
$$  select base_currency_code into base_currency_value from public.organizations where id = debt.organization_id;
  base_amount_value := public.authoritative_base_amount(debt.organization_id, debt.branch_id, debt.currency_code, amount_value, false);$$);
  if revised = definition then raise exception 'settle_debt valuation patch did not match'; end if;
  execute revised;

  select pg_get_functiondef('public.record_hawala_send(jsonb)'::regprocedure) into definition;
  revised := replace(definition,
$$  select base_currency_code into base_currency_value from public.organizations where id = org_id;
  base_amount_value := case when currency_value = base_currency_value then amount_value else nullif(command->>'base_amount', '')::numeric end;
  fee_base_value := case when currency_value = base_currency_value then fee_value else nullif(command->>'fee_base_amount', '')::numeric end;
  if base_amount_value is null or base_amount_value <= 0 or fee_base_value is null or fee_base_value < 0 then raise exception 'Base-currency values are required for a foreign-currency Hawala'; end if;$$,
$$  select base_currency_code into base_currency_value from public.organizations where id = org_id;
  base_amount_value := public.authoritative_base_amount(org_id, branch_id_value, currency_value, amount_value, false);
  fee_base_value := public.authoritative_base_amount(org_id, branch_id_value, currency_value, fee_value, false);$$);
  if revised = definition then raise exception 'record_hawala_send valuation patch did not match'; end if;
  execute revised;

  select pg_get_functiondef('public.record_hawala_incoming(jsonb)'::regprocedure) into definition;
  revised := replace(definition,
$$  if base_amount_value is null or base_amount_value <= 0 then raise exception 'Base-currency value is required'; end if;$$,
$$  base_amount_value := public.authoritative_base_amount(org_id, branch_id_value, currency_value, amount_value, false);
  command := command || jsonb_build_object('base_amount', base_amount_value, 'valuation_source', 'shop_rate');$$);
  if revised = definition then raise exception 'record_hawala_incoming valuation patch did not match'; end if;
  execute revised;
end;
$patch$;
