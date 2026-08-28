-- Preserve source/destination semantics for transfers and bank movements.

create or replace function public.record_operation(command jsonb)
returns public.journal_entries
language plpgsql security definer set search_path = public
as $$
declare
  org_id uuid := (command->>'organization_id')::uuid;
  branch_id_value uuid := (command->>'branch_id')::uuid;
  actor_id uuid := auth.uid();
  client_id text := command->>'client_command_id';
  kind text := upper(command->>'operation');
  currency_value text := upper(command->>'currency');
  amount_value numeric := (command->>'amount')::numeric;
  location_value text := coalesce(nullif(trim(command->>'location'), ''), 'unassigned');
  from_location_value text := coalesce(nullif(trim(command->>'from_location'), ''), 'unassigned');
  to_location_value text := coalesce(nullif(trim(command->>'to_location'), ''), 'unassigned');
  bank_location_value text := coalesce(nullif(trim(command->>'bank_location'), ''), 'bank');
  event_id uuid;
  entry_id uuid;
  cash_account uuid;
  source_account uuid;
  destination_account uuid;
  offset_account uuid;
  membership_id_value uuid;
  role_value text;
  result_entry public.journal_entries;
  existing_entry public.journal_entries;
  cash_debit boolean;
  offset_category text;
  offset_code text;
  offset_name text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if client_id is null or length(trim(client_id)) = 0 then raise exception 'client_command_id is required'; end if;
  if kind not in ('RECEIVE_MONEY', 'PAY_MONEY', 'TRANSFER_CASH', 'RECORD_EXPENSE', 'RECORD_INCOME', 'OWNER_INVESTMENT', 'OWNER_WITHDRAWAL', 'BANK_DEPOSIT', 'BANK_WITHDRAWAL') then raise exception 'Unsupported operation'; end if;
  if amount_value is null or amount_value <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if currency_value is null or not exists (select 1 from public.currencies where code = currency_value and active) then raise exception 'Currency is not active'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || client_id, 0));
  select je.* into existing_entry from public.journal_entries je join public.financial_events fe on fe.id = je.financial_event_id where fe.organization_id = org_id and fe.client_command_id = client_id limit 1;
  if existing_entry.id is not null then return existing_entry; end if;
  select id, role_code into membership_id_value, role_value from public.organization_memberships where organization_id = org_id and user_id = actor_id and active = true;
  if membership_id_value is null or role_value not in ('owner', 'manager', 'accountant', 'cashier') then raise exception 'User cannot record this operation'; end if;
  if not exists (select 1 from public.branches where id = branch_id_value and organization_id = org_id and active) then raise exception 'Branch is not active or belongs to another organization'; end if;
  if role_value = 'cashier' and exists (select 1 from public.organization_branch_access where membership_id = membership_id_value) and not exists (select 1 from public.organization_branch_access where membership_id = membership_id_value and branch_id = branch_id_value) then raise exception 'User is not assigned to this branch'; end if;
  if kind in ('OWNER_INVESTMENT', 'OWNER_WITHDRAWAL', 'RECORD_INCOME') and role_value = 'cashier' then raise exception 'Cashier cannot record this operation'; end if;
  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata) values (org_id, branch_id_value, lower(kind)::public.financial_event_type, 'operation-' || client_id, coalesce((command->>'occurred_at')::timestamptz, now()), actor_id, client_id, command) returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo) values (org_id, branch_id_value, event_id, 'posted', coalesce((command->>'occurred_at')::timestamptz, now()), now(), actor_id, actor_id, command->>'memo') returning id into entry_id;

  if kind = 'TRANSFER_CASH' then
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code) values (org_id, 'location:' || from_location_value || ':' || currency_value, 'Source ' || currency_value, 'asset', currency_value) on conflict (organization_id, code) do update set active = true returning id into source_account;
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code) values (org_id, 'location:' || to_location_value || ':' || currency_value, 'Destination ' || currency_value, 'asset', currency_value) on conflict (organization_id, code) do update set active = true returning id into destination_account;
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, destination_account, currency_value, amount_value, amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, source_account, currency_value, amount_value, amount_value);
  elsif kind in ('BANK_DEPOSIT', 'BANK_WITHDRAWAL') then
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code) values (org_id, 'location:' || location_value || ':' || currency_value, 'Cash location ' || currency_value, 'asset', currency_value) on conflict (organization_id, code) do update set active = true returning id into source_account;
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code) values (org_id, 'bank:' || bank_location_value || ':' || currency_value, 'Bank ' || currency_value, 'asset', currency_value) on conflict (organization_id, code) do update set active = true returning id into destination_account;
    if kind = 'BANK_DEPOSIT' then
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, destination_account, currency_value, amount_value, amount_value);
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, source_account, currency_value, amount_value, amount_value);
    else
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, source_account, currency_value, amount_value, amount_value);
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, destination_account, currency_value, amount_value, amount_value);
    end if;
  else
    if kind in ('RECEIVE_MONEY', 'RECORD_INCOME', 'OWNER_INVESTMENT') then cash_debit := true; else cash_debit := false; end if;
    if kind = 'RECORD_EXPENSE' then offset_category := 'expense'; offset_code := 'expense:' || coalesce(nullif(trim(command->>'category'), ''), 'other') || ':' || currency_value; offset_name := 'Expense ' || currency_value;
    elsif kind = 'RECORD_INCOME' then offset_category := 'income'; offset_code := 'income:' || coalesce(nullif(trim(command->>'category'), ''), 'other') || ':' || currency_value; offset_name := 'Income ' || currency_value;
    elsif kind = 'OWNER_INVESTMENT' then offset_category := 'equity'; offset_code := 'equity:owner-capital:' || currency_value; offset_name := 'Owner capital ' || currency_value;
    elsif kind = 'OWNER_WITHDRAWAL' then offset_category := 'equity'; offset_code := 'equity:owner-drawings:' || currency_value; offset_name := 'Owner drawings ' || currency_value;
    else offset_category := 'liability'; offset_code := 'operation:' || kind || ':' || currency_value; offset_name := kind || ' ' || currency_value;
    end if;
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code) values (org_id, 'location:' || location_value || ':' || currency_value, 'Location ' || currency_value, 'asset', currency_value) on conflict (organization_id, code) do update set active = true returning id into cash_account;
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code) values (org_id, offset_code, offset_name, offset_category, currency_value) on conflict (organization_id, code) do update set active = true returning id into offset_account;
    if cash_debit then
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, cash_account, currency_value, amount_value, amount_value);
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, offset_account, currency_value, amount_value, amount_value);
    else
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, offset_account, currency_value, amount_value, amount_value);
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, cash_account, currency_value, amount_value, amount_value);
    end if;
  end if;
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id) values (org_id, client_id, entry_id);
  select * into result_entry from public.journal_entries where id = entry_id;
  return result_entry;
end;
$$;

revoke all on function public.record_operation(jsonb) from public;
grant execute on function public.record_operation(jsonb) to authenticated;
