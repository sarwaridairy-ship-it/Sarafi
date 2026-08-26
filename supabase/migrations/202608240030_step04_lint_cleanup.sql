-- Remove unused variables from Step 04 functions without rewriting applied migrations.

create or replace function public.record_opening_balance(command jsonb)
returns public.journal_entries
language plpgsql security definer set search_path = public
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
  if not exists (select 1 from public.branches where id = branch_id_value and organization_id = org_id and active) then raise exception 'Branch is not active or belongs to another organization'; end if;
  if not exists (select 1 from public.cashboxes where id = cashbox_id_value and branch_id = branch_id_value and organization_id = org_id and active) then raise exception 'Cashbox is not active or belongs to another branch'; end if;
  if not exists (select 1 from public.currencies where code = currency_value and active) then raise exception 'Currency is not active'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || client_id, 0));
  select je.* into existing_entry from public.journal_entries je join public.financial_events fe on fe.id = je.financial_event_id where fe.organization_id = org_id and fe.client_command_id = client_id limit 1;
  if existing_entry.id is not null then return existing_entry; end if;
  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata) values (org_id, branch_id_value, 'opening_balance', 'opening-' || client_id, now(), actor_id, client_id, command) returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo) values (org_id, branch_id_value, event_id, 'posted', now(), now(), actor_id, actor_id, command->>'memo') returning id into entry_id;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code, cashbox_id) values (org_id, 'cashbox:' || cashbox_id_value || ':' || currency_value, 'Cashbox ' || currency_value, 'asset', currency_value, cashbox_id_value) on conflict (organization_id, code) do update set active = true returning id into cash_account;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code) values (org_id, 'equity:opening-capital:' || currency_value, 'Opening capital ' || currency_value, 'equity', currency_value) on conflict (organization_id, code) do update set active = true returning id into capital_account;
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, cash_account, currency_value, amount_value, base_value);
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, capital_account, currency_value, amount_value, base_value);
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id) values (org_id, client_id, entry_id);
  select * into result_entry from public.journal_entries where id = entry_id;
  return result_entry;
end;
$$;

create or replace function public.request_reversal(command jsonb)
returns public.journal_entries
language plpgsql security definer set search_path = public
as $$
declare
  original_id uuid := (command->>'original_entry_id')::uuid;
  actor_id uuid := auth.uid();
  client_id text := command->>'client_command_id';
  reason_value text := nullif(trim(command->>'reason'), '');
  original public.journal_entries;
  event_id uuid;
  reversal_id uuid;
  line_row record;
  result_entry public.journal_entries;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if client_id is null or length(trim(client_id)) = 0 then raise exception 'client_command_id is required'; end if;
  if reason_value is null then raise exception 'A reversal reason is required'; end if;
  select * into original from public.journal_entries where id = original_id for update;
  if original.id is null or original.status <> 'posted' then raise exception 'Only a posted entry can be reversed'; end if;
  if not exists (select 1 from public.organization_memberships where organization_id = original.organization_id and user_id = actor_id and active and role_code in ('owner', 'manager')) then raise exception 'Only an owner or manager can reverse entries'; end if;
  perform pg_advisory_xact_lock(hashtextextended(original.organization_id::text || ':' || client_id, 0));
  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata) values (original.organization_id, original.branch_id, 'reversal', 'reversal-' || client_id, now(), actor_id, client_id, jsonb_build_object('original_entry_id', original_id, 'reason', reason_value)) returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo, reversal_of, reversal_reason) values (original.organization_id, original.branch_id, event_id, 'reversed', now(), now(), actor_id, actor_id, reason_value, original_id, reason_value) returning id into reversal_id;
  for line_row in select * from public.journal_lines where journal_entry_id = original_id loop
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, native_credit, base_debit, base_credit, applied_rate, source_metadata) values (line_row.organization_id, reversal_id, line_row.account_id, line_row.currency_code, line_row.native_credit, line_row.native_debit, line_row.base_credit, line_row.base_debit, line_row.applied_rate, jsonb_build_object('reversal_of', original_id));
  end loop;
  update public.journal_entries set status = 'reversed' where id = original_id;
  insert into public.reversals (organization_id, original_entry_id, reversal_entry_id, reason, requested_by) values (original.organization_id, original_id, reversal_id, reason_value, actor_id) on conflict (original_entry_id) do nothing;
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id) values (original.organization_id, client_id, reversal_id);
  select * into result_entry from public.journal_entries where id = reversal_id;
  return result_entry;
end;
$$;

revoke all on function public.record_opening_balance(jsonb) from public;
revoke all on function public.request_reversal(jsonb) from public;
grant execute on function public.record_opening_balance(jsonb) to authenticated;
grant execute on function public.request_reversal(jsonb) to authenticated;