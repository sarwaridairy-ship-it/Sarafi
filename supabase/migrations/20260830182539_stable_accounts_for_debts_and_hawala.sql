-- Use the same stable money-account model for debts and Hawala. This removes
-- the remaining free-text "Main Counter" account creation paths.

create or replace function public.ensure_money_ledger_account(
  target_org uuid,
  target_account uuid,
  target_currency text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  money public.money_accounts;
  result uuid;
  account_code text;
begin
  select * into money from public.money_accounts where id = target_account and organization_id = target_org and active;
  if money.id is null then raise exception 'Money account is unavailable'; end if;
  account_code := case
    when money.cashbox_id is not null then 'cashbox:' || money.cashbox_id || ':' || upper(target_currency)
    else 'money-account:' || money.id || ':' || upper(target_currency)
  end;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code, cashbox_id, money_account_id)
    values (target_org, account_code, money.name || ' · ' || upper(target_currency), 'asset', upper(target_currency), money.cashbox_id, money.id)
    on conflict (organization_id, code) do update set
      name = excluded.name,
      cashbox_id = excluded.cashbox_id,
      money_account_id = excluded.money_account_id,
      active = true
    returning id into result;
  return result;
end;
$$;

create or replace function public.require_money_account_balance(
  target_org uuid,
  target_account uuid,
  target_currency text,
  required_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  allow_negative boolean := false;
  available numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_org::text || ':' || target_account::text || ':' || upper(target_currency), 0));
  select coalesce(negative_cash_allowed, false) into allow_negative from public.organization_settings where organization_id = target_org;
  if allow_negative then return; end if;
  select coalesce(sum(jl.native_debit - jl.native_credit), 0) into available
  from public.ledger_accounts la
  join public.journal_lines jl on jl.account_id = la.id
  join public.journal_entries je on je.id = jl.journal_entry_id and je.status = 'posted'
  where la.money_account_id = target_account and jl.currency_code = upper(target_currency);
  if available < required_amount then raise exception 'The source account does not have enough money'; end if;
end;
$$;

create or replace function public.record_debt(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid := (command->>'organization_id')::uuid;
  branch_id_value uuid := (command->>'branch_id')::uuid;
  counterparty_id_value uuid := (command->>'counterparty_id')::uuid;
  actor_id uuid := auth.uid();
  client_id text := command->>'client_command_id';
  direction_value text := lower(command->>'direction');
  currency_value text := upper(command->>'currency');
  amount_value numeric := (command->>'amount')::numeric;
  base_currency_value text;
  base_amount_value numeric;
  source_id uuid := nullif(command->>'source_money_account_id', '')::uuid;
  destination_id uuid := nullif(command->>'destination_money_account_id', '')::uuid;
  selected_money public.money_accounts;
  counterparty_name text;
  membership_id_value uuid;
  role_value text;
  event_id uuid;
  entry_id uuid;
  cash_account uuid;
  debt_account uuid;
  existing_entry public.journal_entries;
  result_entry public.journal_entries;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if client_id is null or length(trim(client_id)) = 0 then raise exception 'client_command_id is required'; end if;
  if direction_value not in ('receivable', 'payable') then raise exception 'Debt direction is invalid'; end if;
  if amount_value is null or amount_value <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if not exists (select 1 from public.organization_currencies where organization_id = org_id and currency_code = currency_value and enabled) then raise exception 'Currency is not enabled for this organization'; end if;
  if direction_value = 'receivable' and source_id is null then raise exception 'Source account is required'; end if;
  if direction_value = 'payable' and destination_id is null then raise exception 'Destination account is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || client_id, 0));
  select je.* into existing_entry from public.journal_entries je join public.financial_events fe on fe.id = je.financial_event_id where fe.organization_id = org_id and fe.client_command_id = client_id limit 1;
  if existing_entry.id is not null then return existing_entry; end if;
  select id, role_code into membership_id_value, role_value from public.organization_memberships where organization_id = org_id and user_id = actor_id and active = true;
  if membership_id_value is null or role_value not in ('owner', 'manager', 'accountant', 'cashier') then raise exception 'User cannot record debts'; end if;
  if direction_value = 'receivable' and role_value = 'cashier' then raise exception 'Cashier cannot create receivables'; end if;
  if not exists (select 1 from public.branches where id = branch_id_value and organization_id = org_id and active) then raise exception 'Branch is not active or belongs to another organization'; end if;
  select display_name into counterparty_name from public.counterparties where id = counterparty_id_value and organization_id = org_id and risk_status <> 'blocked';
  if counterparty_name is null then raise exception 'Counterparty is invalid or blocked'; end if;
  select * into selected_money from public.money_accounts
    where id = case when direction_value = 'receivable' then source_id else destination_id end
      and organization_id = org_id and active;
  if selected_money.id is null or not public.user_can_use_money_account(org_id, selected_money.id) then raise exception 'Money account is unavailable'; end if;
  if selected_money.branch_id is not null and selected_money.branch_id <> branch_id_value then raise exception 'Money account belongs to another branch'; end if;
  select base_currency_code into base_currency_value from public.organizations where id = org_id;
  base_amount_value := case when currency_value = base_currency_value then amount_value else nullif(command->>'base_amount', '')::numeric end;
  if base_amount_value is null or base_amount_value <= 0 then raise exception 'Base-currency value is required for a foreign-currency debt'; end if;
  if direction_value = 'receivable' then perform public.require_money_account_balance(org_id, selected_money.id, currency_value, amount_value); end if;
  command := command || jsonb_build_object(
    'source_money_account_id', case when direction_value = 'receivable' then selected_money.id else null end,
    'destination_money_account_id', case when direction_value = 'payable' then selected_money.id else null end,
    'source_account_name', case when direction_value = 'receivable' then selected_money.name else counterparty_name end,
    'destination_account_name', case when direction_value = 'payable' then selected_money.name else counterparty_name end,
    'base_amount', base_amount_value,
    'money_flow_version', 2
  );
  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata)
    values (org_id, branch_id_value, (case when direction_value = 'receivable' then 'receive_money' else 'pay_money' end)::public.financial_event_type, 'debt-' || client_id, coalesce((command->>'occurred_at')::timestamptz, now()), actor_id, client_id, command)
    returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo)
    values (org_id, branch_id_value, event_id, 'posted', coalesce((command->>'occurred_at')::timestamptz, now()), now(), actor_id, actor_id, command->>'memo')
    returning id into entry_id;
  cash_account := public.ensure_money_ledger_account(org_id, selected_money.id, currency_value);
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
    values (org_id, direction_value || ':' || counterparty_id_value || ':' || currency_value, initcap(direction_value) || ' · ' || counterparty_name || ' · ' || currency_value, case when direction_value = 'receivable' then 'asset' else 'liability' end, currency_value)
    on conflict (organization_id, code) do update set name = excluded.name, active = true
    returning id into debt_account;
  if direction_value = 'receivable' then
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, debt_account, currency_value, amount_value, base_amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, cash_account, currency_value, amount_value, base_amount_value);
  else
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, cash_account, currency_value, amount_value, base_amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, debt_account, currency_value, amount_value, base_amount_value);
  end if;
  insert into public.debts (organization_id, branch_id, counterparty_id, direction, currency_code, original_amount, outstanding_amount, originating_entry_id, due_at, notes)
    values (org_id, branch_id_value, counterparty_id_value, direction_value, currency_value, amount_value, amount_value, entry_id, (command->>'due_at')::timestamptz, command->>'memo');
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id) values (org_id, client_id, entry_id);
  select * into result_entry from public.journal_entries where id = entry_id;
  return result_entry;
end;
$$;

create or replace function public.settle_debt(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  debt_id_value uuid := (command->>'debt_id')::uuid;
  actor_id uuid := auth.uid();
  client_id text := command->>'client_command_id';
  amount_value numeric := (command->>'amount')::numeric;
  base_currency_value text;
  base_amount_value numeric;
  source_id uuid := nullif(command->>'source_money_account_id', '')::uuid;
  destination_id uuid := nullif(command->>'destination_money_account_id', '')::uuid;
  selected_money public.money_accounts;
  counterparty_name text;
  debt public.debts;
  event_id uuid;
  entry_id uuid;
  cash_account uuid;
  debt_account uuid;
  membership_id_value uuid;
  role_value text;
  existing_entry public.journal_entries;
  result_entry public.journal_entries;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if client_id is null or length(trim(client_id)) = 0 then raise exception 'client_command_id is required'; end if;
  if amount_value is null or amount_value <= 0 then raise exception 'Amount must be greater than zero'; end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(debt_id_value::text, '') || ':' || client_id, 0));
  select je.* into existing_entry from public.journal_entries je join public.financial_events fe on fe.id = je.financial_event_id where fe.client_command_id = client_id limit 1;
  if existing_entry.id is not null then return existing_entry; end if;
  select * into debt from public.debts where id = debt_id_value for update;
  if debt.id is null then raise exception 'Debt not found'; end if;
  if debt.direction = 'receivable' and destination_id is null then raise exception 'Destination account is required'; end if;
  if debt.direction = 'payable' and source_id is null then raise exception 'Source account is required'; end if;
  select id, role_code into membership_id_value, role_value from public.organization_memberships where organization_id = debt.organization_id and user_id = actor_id and active = true;
  if membership_id_value is null or role_value not in ('owner', 'manager', 'accountant', 'cashier') then raise exception 'User cannot settle this debt'; end if;
  if role_value = 'cashier' and debt.direction = 'receivable' then raise exception 'Cashier cannot settle receivables'; end if;
  if amount_value > debt.outstanding_amount then raise exception 'Settlement exceeds outstanding debt'; end if;
  select * into selected_money from public.money_accounts
    where id = case when debt.direction = 'receivable' then destination_id else source_id end
      and organization_id = debt.organization_id and active;
  if selected_money.id is null or not public.user_can_use_money_account(debt.organization_id, selected_money.id) then raise exception 'Money account is unavailable'; end if;
  if selected_money.branch_id is not null and selected_money.branch_id <> debt.branch_id then raise exception 'Money account belongs to another branch'; end if;
  select display_name into counterparty_name from public.counterparties where id = debt.counterparty_id;
  select base_currency_code into base_currency_value from public.organizations where id = debt.organization_id;
  base_amount_value := case when debt.currency_code = base_currency_value then amount_value else nullif(command->>'base_amount', '')::numeric end;
  if base_amount_value is null or base_amount_value <= 0 then raise exception 'Base-currency value is required for a foreign-currency settlement'; end if;
  if debt.direction = 'payable' then perform public.require_money_account_balance(debt.organization_id, selected_money.id, debt.currency_code, amount_value); end if;
  command := command || jsonb_build_object(
    'source_money_account_id', case when debt.direction = 'payable' then selected_money.id else null end,
    'destination_money_account_id', case when debt.direction = 'receivable' then selected_money.id else null end,
    'source_account_name', case when debt.direction = 'payable' then selected_money.name else counterparty_name end,
    'destination_account_name', case when debt.direction = 'receivable' then selected_money.name else counterparty_name end,
    'base_amount', base_amount_value,
    'money_flow_version', 2
  );
  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata)
    values (debt.organization_id, debt.branch_id, (case when debt.direction = 'receivable' then 'receive_money' else 'pay_money' end)::public.financial_event_type, 'settlement-' || client_id, now(), actor_id, client_id, command)
    returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo)
    values (debt.organization_id, debt.branch_id, event_id, 'posted', now(), now(), actor_id, actor_id, command->>'memo')
    returning id into entry_id;
  cash_account := public.ensure_money_ledger_account(debt.organization_id, selected_money.id, debt.currency_code);
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
    values (debt.organization_id, debt.direction || ':' || debt.counterparty_id || ':' || debt.currency_code, initcap(debt.direction) || ' · ' || coalesce(counterparty_name, '') || ' · ' || debt.currency_code, case when debt.direction = 'receivable' then 'asset' else 'liability' end, debt.currency_code)
    on conflict (organization_id, code) do update set name = excluded.name, active = true
    returning id into debt_account;
  if debt.direction = 'receivable' then
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (debt.organization_id, entry_id, cash_account, debt.currency_code, amount_value, base_amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (debt.organization_id, entry_id, debt_account, debt.currency_code, amount_value, base_amount_value);
  else
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (debt.organization_id, entry_id, debt_account, debt.currency_code, amount_value, base_amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (debt.organization_id, entry_id, cash_account, debt.currency_code, amount_value, base_amount_value);
  end if;
  update public.debts set outstanding_amount = outstanding_amount - amount_value where id = debt.id;
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id) values (debt.organization_id, client_id, entry_id);
  select * into result_entry from public.journal_entries where id = entry_id;
  return result_entry;
end;
$$;

create or replace function public.record_hawala_send(command jsonb)
returns public.hawala_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid := (command->>'organization_id')::uuid;
  branch_id_value uuid := (command->>'branch_id')::uuid;
  actor_id uuid := auth.uid();
  client_id text := command->>'client_command_id';
  amount_value numeric := (command->>'amount')::numeric;
  fee_value numeric := coalesce((command->>'fee')::numeric, 0);
  currency_value text := upper(command->>'currency');
  base_currency_value text;
  base_amount_value numeric;
  fee_base_value numeric;
  destination_id uuid := nullif(command->>'destination_money_account_id', '')::uuid;
  destination_money public.money_accounts;
  destination_value text := nullif(trim(command->>'destination_location'), '');
  beneficiary_value text := nullif(trim(command->>'beneficiary_name'), '');
  reference_value text := nullif(trim(command->>'reference_code'), '');
  membership_id_value uuid;
  role_value text;
  event_id uuid;
  entry_id uuid;
  cash_account uuid;
  settlement_account uuid;
  fee_account uuid;
  transfer_id uuid;
  existing_transfer public.hawala_transfers;
  existing_event public.financial_events;
  result_transfer public.hawala_transfers;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if client_id is null or length(trim(client_id)) = 0 then raise exception 'client_command_id is required'; end if;
  if beneficiary_value is null or destination_value is null or reference_value is null then raise exception 'Beneficiary, destination, and reference are required'; end if;
  if amount_value is null or amount_value <= 0 or fee_value < 0 then raise exception 'Hawala amount or fee is invalid'; end if;
  if destination_id is null then raise exception 'Destination account is required'; end if;
  if not exists (select 1 from public.organization_currencies where organization_id = org_id and currency_code = currency_value and enabled) then raise exception 'Currency is not enabled for this organization'; end if;
  if not exists (select 1 from public.organization_features where organization_id = org_id and feature_code = 'hawala' and enabled = true) then raise exception 'Hawala module is disabled'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || client_id, 0));
  select * into existing_event from public.financial_events where organization_id = org_id and client_command_id = client_id;
  if existing_event.id is not null then
    select * into existing_transfer from public.hawala_transfers where organization_id = org_id and journal_entry_id in (select id from public.journal_entries where financial_event_id = existing_event.id) limit 1;
    if existing_transfer.id is not null then return existing_transfer; end if;
  end if;
  select id, role_code into membership_id_value, role_value from public.organization_memberships where organization_id = org_id and user_id = actor_id and active = true;
  if membership_id_value is null or role_value not in ('owner', 'manager', 'accountant', 'cashier') then raise exception 'User cannot record Hawala transfers'; end if;
  if not exists (select 1 from public.branches where id = branch_id_value and organization_id = org_id and active) then raise exception 'Branch is not active or belongs to another organization'; end if;
  select * into destination_money from public.money_accounts where id = destination_id and organization_id = org_id and active;
  if destination_money.id is null or not public.user_can_use_money_account(org_id, destination_money.id) then raise exception 'Money account is unavailable'; end if;
  if destination_money.branch_id is not null and destination_money.branch_id <> branch_id_value then raise exception 'Money account belongs to another branch'; end if;
  select base_currency_code into base_currency_value from public.organizations where id = org_id;
  base_amount_value := case when currency_value = base_currency_value then amount_value else nullif(command->>'base_amount', '')::numeric end;
  fee_base_value := case when currency_value = base_currency_value then fee_value else nullif(command->>'fee_base_amount', '')::numeric end;
  if base_amount_value is null or base_amount_value <= 0 or fee_base_value is null or fee_base_value < 0 then raise exception 'Base-currency values are required for a foreign-currency Hawala'; end if;
  command := command || jsonb_build_object(
    'source_money_account_id', null,
    'destination_money_account_id', destination_money.id,
    'source_account_name', null,
    'destination_account_name', destination_money.name,
    'source_account_kind', 'customer_outside',
    'destination_account_kind', 'money_account',
    'base_amount', base_amount_value,
    'fee_base_amount', fee_base_value,
    'money_flow_version', 2
  );
  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata)
    values (org_id, branch_id_value, 'receive_money', 'hawala-' || reference_value, now(), actor_id, client_id, command)
    returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo)
    values (org_id, branch_id_value, event_id, 'posted', now(), now(), actor_id, actor_id, command->>'memo')
    returning id into entry_id;
  cash_account := public.ensure_money_ledger_account(org_id, destination_money.id, currency_value);
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
    values (org_id, 'hawala:partner-payable:' || currency_value, 'Hawala partner payable · ' || currency_value, 'liability', currency_value)
    on conflict (organization_id, code) do update set name = excluded.name, active = true
    returning id into settlement_account;
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, cash_account, currency_value, amount_value, base_amount_value);
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, settlement_account, currency_value, amount_value, base_amount_value);
  if fee_value > 0 then
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
      values (org_id, 'income:hawala-fee:' || currency_value, 'Hawala fee income · ' || currency_value, 'income', currency_value)
      on conflict (organization_id, code) do update set name = excluded.name, active = true
      returning id into fee_account;
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, cash_account, currency_value, fee_value, fee_base_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, fee_account, currency_value, fee_value, fee_base_value);
  end if;
  insert into public.hawala_transfers (organization_id, branch_id, beneficiary_name, origin_location, destination_location, currency_code, amount, fee, reference_code, status, journal_entry_id)
    values (org_id, branch_id_value, beneficiary_value, destination_money.name, destination_value, currency_value, amount_value, fee_value, reference_value, 'created', entry_id)
    returning id into transfer_id;
  insert into public.hawala_status_events (transfer_id, status, actor_user_id) values (transfer_id, 'created', actor_id);
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id) values (org_id, client_id, entry_id);
  select * into result_transfer from public.hawala_transfers where id = transfer_id;
  return result_transfer;
end;
$$;

-- Attach legacy global inventory balances to the organization's first physical
-- cashbox so existing money is not hidden when the stable model goes live.
with chosen as (
  select distinct on (ma.organization_id)
    ma.organization_id,
    ma.id,
    ma.cashbox_id,
    ma.name
  from public.money_accounts ma
  where ma.account_type = 'cashbox' and ma.active
  order by ma.organization_id, ma.created_at
)
update public.ledger_accounts la
set money_account_id = chosen.id,
    cashbox_id = chosen.cashbox_id,
    name = chosen.name || ' · ' || la.currency_code
from chosen
where la.organization_id = chosen.organization_id
  and la.code like 'inventory:%'
  and la.money_account_id is null;

create or replace function public.record_fx_trade(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid := (command->>'organization_id')::uuid;
  branch_id_value uuid := (command->>'branch_id')::uuid;
  cashbox_id_value uuid := (command->>'cashbox_id')::uuid;
  actor_id uuid := auth.uid();
  client_id text := command->>'client_command_id';
  side_value public.financial_event_type := lower(command->>'side')::public.financial_event_type;
  sold_currency_value text := upper(command->>'sold_currency');
  bought_currency_value text := upper(command->>'bought_currency');
  sold_amount_value numeric := (command->>'sold_amount')::numeric;
  bought_amount_value numeric := (command->>'bought_amount')::numeric;
  sold_base_value numeric := (command->>'sold_base_value')::numeric;
  bought_base_value numeric := (command->>'bought_base_value')::numeric;
  base_currency_value text := upper(command->>'base_currency');
  money public.money_accounts;
  existing_entry public.journal_entries;
  event_id uuid;
  entry_id uuid;
  sold_account uuid;
  bought_account uuid;
  gain_account uuid;
  loss_account uuid;
  membership_id_value uuid;
  role_value text;
  result_entry public.journal_entries;
  carrying_cost numeric;
  available_quantity numeric;
  realized numeric;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if client_id is null or length(trim(client_id)) = 0 then raise exception 'client_command_id is required'; end if;
  if side_value not in ('buy_fx', 'sell_fx', 'exchange_fx') then raise exception 'Unsupported FX trade type'; end if;
  if sold_amount_value is null or bought_amount_value is null or sold_base_value is null or bought_base_value is null then raise exception 'Trade amounts are required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || client_id, 0));
  select je.* into existing_entry from public.journal_entries je join public.financial_events fe on fe.id = je.financial_event_id where fe.organization_id = org_id and fe.client_command_id = client_id limit 1;
  if existing_entry.id is not null then return existing_entry; end if;
  select id, role_code into membership_id_value, role_value from public.organization_memberships where organization_id = org_id and user_id = actor_id and active = true;
  if membership_id_value is null or role_value not in ('owner', 'manager', 'cashier') then raise exception 'User cannot post trades for this organization'; end if;
  if not exists (select 1 from public.branches where id = branch_id_value and organization_id = org_id and active) then raise exception 'Branch is not active or belongs to another organization'; end if;
  select ma.* into money from public.money_accounts ma where ma.cashbox_id = cashbox_id_value and ma.organization_id = org_id and ma.branch_id = branch_id_value and ma.active;
  if money.id is null or not public.user_can_use_money_account(org_id, money.id) then raise exception 'Cashbox account is unavailable'; end if;
  if role_value = 'cashier' and exists (select 1 from public.organization_branch_access where membership_id = membership_id_value) and not exists (select 1 from public.organization_branch_access where membership_id = membership_id_value and branch_id = branch_id_value) then raise exception 'User is not assigned to this branch'; end if;
  if role_value = 'cashier' and exists (select 1 from public.organization_cashbox_access where membership_id = membership_id_value) and not exists (select 1 from public.organization_cashbox_access where membership_id = membership_id_value and cashbox_id = cashbox_id_value) then raise exception 'User is not assigned to this cashbox'; end if;
  if sold_currency_value = bought_currency_value or sold_amount_value <= 0 or bought_amount_value <= 0 or sold_base_value <= 0 or bought_base_value <= 0 then raise exception 'Trade currencies and amounts are invalid'; end if;
  if not exists (select 1 from public.organization_currencies where organization_id = org_id and currency_code = sold_currency_value and enabled)
     or not exists (select 1 from public.organization_currencies where organization_id = org_id and currency_code = bought_currency_value and enabled)
  then raise exception 'Both currencies must be enabled for this organization'; end if;
  if side_value = 'buy_fx' and sold_base_value <> bought_base_value then raise exception 'BUY_FX consideration must balance in base currency'; end if;
  perform public.require_money_account_balance(org_id, money.id, sold_currency_value, sold_amount_value);
  if side_value in ('sell_fx', 'exchange_fx') then
    select quantity, carrying_base_value into available_quantity, carrying_cost
    from public.fx_inventory_cost_state
    where organization_id = org_id and currency_code = sold_currency_value
    for update;
    available_quantity := coalesce(available_quantity, 0);
    carrying_cost := coalesce(carrying_cost, 0);
    if available_quantity < sold_amount_value then raise exception 'Insufficient currency inventory'; end if;
    carrying_cost := greatest(0, carrying_cost / nullif(available_quantity, 0) * sold_amount_value);
    realized := bought_base_value - carrying_cost;
  else
    carrying_cost := bought_base_value;
    realized := 0;
  end if;
  command := command || jsonb_build_object(
    'money_account_id', money.id,
    'cashbox_name', money.name,
    'source_account_name', case when side_value = 'sell_fx' then money.name else null end,
    'destination_account_name', case when side_value = 'sell_fx' then null else money.name end,
    'source_account_kind', case when side_value = 'sell_fx' then 'money_account' else 'customer_outside' end,
    'destination_account_kind', case when side_value = 'sell_fx' then 'customer_outside' else 'money_account' end,
    'money_flow_version', 2
  );
  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata)
    values (org_id, branch_id_value, side_value, 'fx-' || client_id, coalesce((command->>'occurred_at')::timestamptz, now()), actor_id, client_id, command)
    returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo)
    values (org_id, branch_id_value, event_id, 'posted', coalesce((command->>'occurred_at')::timestamptz, now()), now(), actor_id, actor_id, command->>'memo')
    returning id into entry_id;
  sold_account := public.ensure_money_ledger_account(org_id, money.id, sold_currency_value);
  bought_account := public.ensure_money_ledger_account(org_id, money.id, bought_currency_value);
  if side_value = 'buy_fx' then
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit, applied_rate) values (org_id, entry_id, bought_account, bought_currency_value, bought_amount_value, bought_base_value, bought_base_value / bought_amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit, applied_rate) values (org_id, entry_id, sold_account, sold_currency_value, sold_amount_value, sold_base_value, sold_base_value / sold_amount_value);
  else
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit, applied_rate) values (org_id, entry_id, bought_account, bought_currency_value, bought_amount_value, bought_base_value, bought_base_value / bought_amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit, applied_rate) values (org_id, entry_id, sold_account, sold_currency_value, sold_amount_value, carrying_cost, carrying_cost / sold_amount_value);
    if realized >= 0 then
      insert into public.ledger_accounts (organization_id, code, name, category, currency_code) values (org_id, 'income:realized-fx-gain', 'Realized FX gain', 'income', base_currency_value) on conflict (organization_id, code) do update set active = true returning id into gain_account;
      if realized > 0 then insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, base_credit, source_metadata) values (org_id, entry_id, gain_account, base_currency_value, realized, jsonb_build_object('cost_basis', carrying_cost)); end if;
    else
      insert into public.ledger_accounts (organization_id, code, name, category, currency_code) values (org_id, 'expense:realized-fx-loss', 'Realized FX loss', 'expense', base_currency_value) on conflict (organization_id, code) do update set active = true returning id into loss_account;
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, base_debit, source_metadata) values (org_id, entry_id, loss_account, base_currency_value, abs(realized), jsonb_build_object('cost_basis', carrying_cost));
    end if;
  end if;
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id) values (org_id, client_id, entry_id);
  if side_value = 'buy_fx' then
    insert into public.fx_inventory_cost_state (organization_id, currency_code, quantity, carrying_base_value)
      values (org_id, bought_currency_value, bought_amount_value, bought_base_value)
      on conflict (organization_id, currency_code) do update set quantity = fx_inventory_cost_state.quantity + excluded.quantity, carrying_base_value = fx_inventory_cost_state.carrying_base_value + excluded.carrying_base_value, updated_at = now();
  else
    update public.fx_inventory_cost_state set quantity = quantity - sold_amount_value, carrying_base_value = carrying_base_value - carrying_cost, updated_at = now() where organization_id = org_id and currency_code = sold_currency_value;
    if side_value = 'exchange_fx' then
      insert into public.fx_inventory_cost_state (organization_id, currency_code, quantity, carrying_base_value)
        values (org_id, bought_currency_value, bought_amount_value, bought_base_value)
        on conflict (organization_id, currency_code) do update set quantity = fx_inventory_cost_state.quantity + excluded.quantity, carrying_base_value = fx_inventory_cost_state.carrying_base_value + excluded.carrying_base_value, updated_at = now();
    end if;
  end if;
  select * into result_entry from public.journal_entries where id = entry_id;
  return result_entry;
end;
$$;

create or replace function public.record_opening_balance(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid := (command->>'organization_id')::uuid;
  branch_id_value uuid := (command->>'branch_id')::uuid;
  cashbox_id_value uuid := (command->>'cashbox_id')::uuid;
  actor_id uuid := auth.uid();
  client_id text := command->>'client_command_id';
  currency_value text := upper(command->>'currency');
  amount_value numeric := (command->>'amount')::numeric;
  base_value numeric := (command->>'base_value')::numeric;
  money public.money_accounts;
  entry_id uuid;
  event_id uuid;
  cash_account uuid;
  capital_account uuid;
  existing_entry public.journal_entries;
  result_entry public.journal_entries;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if client_id is null or length(trim(client_id)) = 0 then raise exception 'client_command_id is required'; end if;
  if amount_value is null or amount_value <= 0 or base_value is null or base_value <= 0 then raise exception 'Opening balance must be positive'; end if;
  if not exists (select 1 from public.organization_memberships where organization_id = org_id and user_id = actor_id and active and role_code in ('owner', 'manager')) then raise exception 'Only an owner or manager can record opening balances'; end if;
  if not exists (select 1 from public.organization_currencies where organization_id = org_id and currency_code = currency_value and enabled) then raise exception 'Currency is not enabled for this organization'; end if;
  select ma.* into money from public.money_accounts ma where ma.cashbox_id = cashbox_id_value and ma.organization_id = org_id and ma.branch_id = branch_id_value and ma.active;
  if money.id is null or not public.user_can_use_money_account(org_id, money.id) then raise exception 'Cashbox account is unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || client_id, 0));
  select je.* into existing_entry from public.journal_entries je join public.financial_events fe on fe.id = je.financial_event_id where fe.organization_id = org_id and fe.client_command_id = client_id limit 1;
  if existing_entry.id is not null then return existing_entry; end if;
  command := command || jsonb_build_object('money_account_id', money.id, 'destination_account_name', money.name, 'money_flow_version', 2);
  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata) values (org_id, branch_id_value, 'opening_balance', 'opening-' || client_id, now(), actor_id, client_id, command) returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo) values (org_id, branch_id_value, event_id, 'posted', now(), now(), actor_id, actor_id, command->>'memo') returning id into entry_id;
  cash_account := public.ensure_money_ledger_account(org_id, money.id, currency_value);
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code) values (org_id, 'equity:opening-capital:' || currency_value, 'Opening capital · ' || currency_value, 'equity', currency_value) on conflict (organization_id, code) do update set active = true returning id into capital_account;
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, cash_account, currency_value, amount_value, base_value);
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, capital_account, currency_value, amount_value, base_value);
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id) values (org_id, client_id, entry_id);
  select * into result_entry from public.journal_entries where id = entry_id;
  return result_entry;
end;
$$;

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
  money_account_id_value uuid;
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
  select id into money_account_id_value from public.money_accounts where organization_id = event_row.organization_id and cashbox_id = cashbox_id_value and active;
  cash_account := public.ensure_money_ledger_account(event_row.organization_id, money_account_id_value, fee_currency_value);
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
    values (event_row.organization_id, 'income:commission:' || fee_currency_value, 'Commission income · ' || fee_currency_value, 'income', fee_currency_value)
    on conflict (organization_id, code) do update set active = true returning id into fee_account;
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit, source_metadata) values (event_row.organization_id, new.id, cash_account, fee_currency_value, fee_value, fee_value, jsonb_build_object('fee', true));
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit, source_metadata) values (event_row.organization_id, new.id, fee_account, fee_currency_value, fee_value, fee_value, jsonb_build_object('fee', true));
  insert into public.fees (organization_id, amount, currency_code, direction, journal_entry_id) values (event_row.organization_id, fee_value, fee_currency_value, 'income', new.id);
  return new;
end;
$$;

revoke all on function public.ensure_money_ledger_account(uuid, uuid, text) from public, anon;
revoke all on function public.require_money_account_balance(uuid, uuid, text, numeric) from public, anon;
revoke all on function public.record_debt(jsonb) from public, anon;
revoke all on function public.settle_debt(jsonb) from public, anon;
revoke all on function public.record_hawala_send(jsonb) from public, anon;
revoke all on function public.record_fx_trade(jsonb) from public, anon;
revoke all on function public.record_opening_balance(jsonb) from public, anon;
grant execute on function public.record_debt(jsonb) to authenticated;
grant execute on function public.settle_debt(jsonb) to authenticated;
grant execute on function public.record_hawala_send(jsonb) to authenticated;
grant execute on function public.record_fx_trade(jsonb) to authenticated;
grant execute on function public.record_opening_balance(jsonb) to authenticated;
