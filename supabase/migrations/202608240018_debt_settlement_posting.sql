-- Add first-class receivable/payable commands with immutable journal effects.

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
  location_value text := coalesce(nullif(trim(command->>'location'), ''), 'unassigned');
  membership_id_value uuid;
  role_value text;
  event_id uuid;
  entry_id uuid;
  cash_account uuid;
  debt_account uuid;
  debt_id uuid;
  existing_entry public.journal_entries;
  result_entry public.journal_entries;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if client_id is null or length(trim(client_id)) = 0 then raise exception 'client_command_id is required'; end if;
  if direction_value not in ('receivable', 'payable') then raise exception 'Debt direction is invalid'; end if;
  if amount_value is null or amount_value <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if not exists (select 1 from public.currencies where code = currency_value and active) then raise exception 'Currency is not active'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || client_id, 0));
  select je.* into existing_entry from public.journal_entries je join public.financial_events fe on fe.id = je.financial_event_id where fe.organization_id = org_id and fe.client_command_id = client_id limit 1;
  if existing_entry.id is not null then return existing_entry; end if;
  select id, role_code into membership_id_value, role_value from public.organization_memberships where organization_id = org_id and user_id = actor_id and active = true;
  if membership_id_value is null or role_value not in ('owner', 'manager', 'accountant', 'cashier') then raise exception 'User cannot record debts'; end if;
  if not exists (select 1 from public.branches where id = branch_id_value and organization_id = org_id and active) then raise exception 'Branch is not active or belongs to another organization'; end if;
  if not exists (select 1 from public.counterparties where id = counterparty_id_value and organization_id = org_id and risk_status <> 'blocked') then raise exception 'Counterparty is invalid or blocked'; end if;
  if direction_value = 'receivable' and role_value = 'cashier' then raise exception 'Cashier cannot create receivables'; end if;

  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata)
    values (org_id, branch_id_value, case when direction_value = 'receivable' then 'receive_money' else 'pay_money' end, 'debt-' || client_id, coalesce((command->>'occurred_at')::timestamptz, now()), actor_id, client_id, command)
    returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo)
    values (org_id, branch_id_value, event_id, 'posted', coalesce((command->>'occurred_at')::timestamptz, now()), now(), actor_id, actor_id, command->>'memo')
    returning id into entry_id;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
    values (org_id, 'location:' || location_value || ':' || currency_value, 'Location ' || currency_value, 'asset', currency_value)
    on conflict (organization_id, code) do update set active = true returning id into cash_account;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
    values (org_id, direction_value || ':' || counterparty_id_value || ':' || currency_value, initcap(direction_value) || ' ' || currency_value, case when direction_value = 'receivable' then 'asset' else 'liability' end, currency_value)
    on conflict (organization_id, code) do update set active = true returning id into debt_account;
  if direction_value = 'receivable' then
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, debt_account, currency_value, amount_value, amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, cash_account, currency_value, amount_value, amount_value);
  else
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, cash_account, currency_value, amount_value, amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, debt_account, currency_value, amount_value, amount_value);
  end if;
  insert into public.debts (organization_id, branch_id, counterparty_id, direction, currency_code, original_amount, outstanding_amount, originating_entry_id, due_at, notes)
    values (org_id, branch_id_value, counterparty_id_value, direction_value, currency_value, amount_value, amount_value, entry_id, (command->>'due_at')::timestamptz, command->>'memo') returning id into debt_id;
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
  debt public.debts;
  entry public.journal_entries;
  event_id uuid;
  entry_id uuid;
  cash_account uuid;
  debt_account uuid;
  location_value text := coalesce(nullif(trim(command->>'location'), ''), 'unassigned');
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
  select id, role_code into membership_id_value, role_value from public.organization_memberships where organization_id = debt.organization_id and user_id = actor_id and active = true;
  if membership_id_value is null or role_value not in ('owner', 'manager', 'accountant', 'cashier') then raise exception 'User cannot settle this debt'; end if;
  if role_value = 'cashier' and debt.direction = 'receivable' then raise exception 'Cashier cannot settle receivables'; end if;
  if amount_value > debt.outstanding_amount then raise exception 'Settlement exceeds outstanding debt'; end if;
  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata)
    values (debt.organization_id, debt.branch_id, case when debt.direction = 'receivable' then 'receive_money' else 'pay_money' end, 'settlement-' || client_id, now(), actor_id, client_id, command) returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo)
    values (debt.organization_id, debt.branch_id, event_id, 'posted', now(), now(), actor_id, actor_id, command->>'memo') returning id into entry_id;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
    values (debt.organization_id, 'location:' || location_value || ':' || debt.currency_code, 'Location ' || debt.currency_code, 'asset', debt.currency_code)
    on conflict (organization_id, code) do update set active = true returning id into cash_account;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
    values (debt.organization_id, debt.direction || ':' || debt.counterparty_id || ':' || debt.currency_code, initcap(debt.direction) || ' ' || debt.currency_code, case when debt.direction = 'receivable' then 'asset' else 'liability' end, debt.currency_code)
    on conflict (organization_id, code) do update set active = true returning id into debt_account;
  if debt.direction = 'receivable' then
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (debt.organization_id, entry_id, cash_account, debt.currency_code, amount_value, amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (debt.organization_id, entry_id, debt_account, debt.currency_code, amount_value, amount_value);
  else
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (debt.organization_id, entry_id, debt_account, debt.currency_code, amount_value, amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (debt.organization_id, entry_id, cash_account, debt.currency_code, amount_value, amount_value);
  end if;
  update public.debts set outstanding_amount = outstanding_amount - amount_value where id = debt.id;
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id) values (debt.organization_id, client_id, entry_id);
  select * into result_entry from public.journal_entries where id = entry_id;
  return result_entry;
end;
$$;

revoke all on function public.record_debt(jsonb) from public;
revoke all on function public.settle_debt(jsonb) from public;
grant execute on function public.record_debt(jsonb) to authenticated;
grant execute on function public.settle_debt(jsonb) to authenticated;