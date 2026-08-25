-- Add ledger-backed cashbox close and explicit variance posting.

create or replace function public.record_cashbox_close(command jsonb)
returns public.cashbox_closes
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid := (command->>'organization_id')::uuid;
  branch_id_value uuid := (command->>'branch_id')::uuid;
  cashbox_id_value uuid := (command->>'cashbox_id')::uuid;
  business_date_value date := coalesce((command->>'business_date')::date, current_date);
  actor_id uuid := auth.uid();
  lines jsonb := coalesce(command->'counts', '[]'::jsonb);
  count_item jsonb;
  currency_value text;
  counted_value numeric;
  expected_value numeric;
  close_id uuid;
  result public.cashbox_closes;
  role_value text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  select role_code into role_value from public.organization_memberships where organization_id = org_id and user_id = actor_id and active = true;
  if role_value not in ('owner', 'manager', 'accountant', 'cashier') then raise exception 'User cannot close this cashbox'; end if;
  if not exists (select 1 from public.branches where id = branch_id_value and organization_id = org_id and active) then raise exception 'Branch is not active or belongs to another organization'; end if;
  if not exists (select 1 from public.cashboxes where id = cashbox_id_value and branch_id = branch_id_value and organization_id = org_id and active) then raise exception 'Cashbox is not active or belongs to another branch'; end if;
  if jsonb_array_length(lines) = 0 then raise exception 'At least one cash count is required'; end if;
  insert into public.cashbox_closes (organization_id, branch_id, cashbox_id, closed_by, business_date, status, variance_reason)
    values (org_id, branch_id_value, cashbox_id_value, actor_id, business_date_value, 'submitted', nullif(trim(command->>'variance_reason'), '')) returning id into close_id;
  for count_item in select * from jsonb_array_elements(lines) loop
    currency_value := upper(count_item->>'currency');
    counted_value := (count_item->>'counted_amount')::numeric;
    if counted_value is null or counted_value < 0 then raise exception 'Counted amount must be zero or greater'; end if;
    select coalesce(sum(jl.native_debit - jl.native_credit), 0) into expected_value
      from public.journal_lines jl join public.ledger_accounts la on la.id = jl.account_id
      where jl.organization_id = org_id and la.cashbox_id = cashbox_id_value and jl.currency_code = currency_value;
    insert into public.cashbox_close_lines (close_id, organization_id, currency_code, expected_amount, counted_amount) values (close_id, org_id, currency_value, expected_value, counted_value);
  end loop;
  if exists (select 1 from public.cashbox_close_lines where close_id = close_id and variance_amount <> 0) and nullif(trim(command->>'variance_reason'), '') is null then raise exception 'A reason is required for cash variance'; end if;
  update public.cashbox_closes set status = case when exists (select 1 from public.cashbox_close_lines where cashbox_close_lines.close_id = record_cashbox_close.close_id and variance_amount <> 0) then 'submitted' else 'approved' end where id = close_id returning * into result;
  return result;
end;
$$;

create or replace function public.approve_cashbox_close(target_id uuid)
returns public.cashbox_closes
language plpgsql
security definer
set search_path = public
as $$
declare
  close_row public.cashbox_closes;
  actor_id uuid := auth.uid();
  role_value text;
  variance_row record;
  event_id uuid;
  entry_id uuid;
  cash_account uuid;
  variance_account uuid;
  client_id text := 'variance:' || target_id::text;
begin
  select * into close_row from public.cashbox_closes where id = target_id for update;
  if close_row.id is null then raise exception 'Cashbox close not found'; end if;
  select role_code into role_value from public.organization_memberships where organization_id = close_row.organization_id and user_id = actor_id and active = true;
  if role_value not in ('owner', 'manager') then raise exception 'Only an owner or manager can approve variance'; end if;
  if close_row.status <> 'submitted' then raise exception 'Cashbox close is not awaiting approval'; end if;
  for variance_row in select * from public.cashbox_close_lines where close_id = target_id and variance_amount <> 0 loop
    insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata)
      values (close_row.organization_id, close_row.branch_id, 'cash_variance_adjustment', 'variance-' || target_id || '-' || variance_row.currency_code, now(), actor_id, client_id || ':' || variance_row.currency_code, jsonb_build_object('close_id', target_id, 'currency', variance_row.currency_code, 'variance', variance_row.variance_amount)) returning id into event_id;
    insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo)
      values (close_row.organization_id, close_row.branch_id, event_id, 'posted', now(), now(), actor_id, actor_id, close_row.variance_reason) returning id into entry_id;
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code, cashbox_id)
      values (close_row.organization_id, 'cashbox:' || close_row.cashbox_id || ':' || variance_row.currency_code, 'Cashbox ' || variance_row.currency_code, 'asset', variance_row.currency_code)
      on conflict (organization_id, code) do update set active = true returning id into cash_account;
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
      values (close_row.organization_id, case when variance_row.variance_amount < 0 then 'expense:cash-shortage:' else 'income:cash-overage:' end || variance_row.currency_code, case when variance_row.variance_amount < 0 then 'Cash shortage ' else 'Cash overage ' end || variance_row.currency_code, case when variance_row.variance_amount < 0 then 'expense' else 'income' end, variance_row.currency_code)
      on conflict (organization_id, code) do update set active = true returning id into variance_account;
    if variance_row.variance_amount < 0 then
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (close_row.organization_id, entry_id, variance_account, variance_row.currency_code, abs(variance_row.variance_amount), abs(variance_row.variance_amount));
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (close_row.organization_id, entry_id, cash_account, variance_row.currency_code, abs(variance_row.variance_amount), abs(variance_row.variance_amount));
    else
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (close_row.organization_id, entry_id, cash_account, variance_row.currency_code, variance_row.variance_amount, variance_row.variance_amount);
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (close_row.organization_id, entry_id, variance_account, variance_row.currency_code, variance_row.variance_amount, variance_row.variance_amount);
    end if;
  end loop;
  update public.cashbox_closes set status = 'approved', approved_by = actor_id, approved_at = now() where id = target_id returning * into close_row;
  return close_row;
end;
$$;

revoke all on function public.record_cashbox_close(jsonb) from public;
revoke all on function public.approve_cashbox_close(uuid) from public;
grant execute on function public.record_cashbox_close(jsonb) to authenticated;
grant execute on function public.approve_cashbox_close(uuid) to authenticated;