-- Stage 2/3 completion: authoritative, idempotent FX posting RPC.
-- Clients submit commands; this function is the only supported financial write path.

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
  existing_entry public.journal_entries;
  event_id uuid;
  entry_id uuid;
  sold_account uuid;
  bought_account uuid;
  cashbox_account uuid;
  gain_account uuid;
  loss_account uuid;
  carrying_cost numeric;
  available_quantity numeric;
  realized numeric;
  result_entry public.journal_entries;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if client_id is null or length(trim(client_id)) = 0 then raise exception 'client_command_id is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || client_id, 0));
  select je.* into existing_entry from public.journal_entries je join public.financial_events fe on fe.id = je.financial_event_id where fe.organization_id = org_id and fe.client_command_id = client_id limit 1;
  if existing_entry.id is not null then return existing_entry; end if;
  if not exists (select 1 from public.organization_memberships where organization_id = org_id and user_id = actor_id and active and role_code in ('owner', 'manager', 'cashier')) then raise exception 'User cannot post trades for this organization'; end if;
  if not exists (select 1 from public.branches where id = branch_id_value and organization_id = org_id and active) then raise exception 'Branch is not active or belongs to another organization'; end if;
  if not exists (select 1 from public.cashboxes where id = cashbox_id_value and branch_id = branch_id_value and organization_id = org_id and active) then raise exception 'Cashbox is not active or belongs to another branch'; end if;
  if sold_currency_value = bought_currency_value or sold_amount_value <= 0 or bought_amount_value <= 0 or sold_base_value <= 0 or bought_base_value <= 0 then raise exception 'Trade currencies and amounts are invalid'; end if;
  if not exists (select 1 from public.organization_currencies where organization_id = org_id and currency_code = sold_currency_value and enabled) or not exists (select 1 from public.organization_currencies where organization_id = org_id and currency_code = bought_currency_value and enabled) then raise exception 'Both currencies must be enabled for this organization'; end if;
  if side_value = 'buy_fx' and sold_base_value <> bought_base_value then raise exception 'BUY_FX consideration must balance in base currency'; end if;

  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata)
    values (org_id, branch_id_value, side_value, 'fx-' || client_id, coalesce((command->>'occurred_at')::timestamptz, now()), actor_id, client_id, command)
    returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo)
    values (org_id, branch_id_value, event_id, 'posted', coalesce((command->>'occurred_at')::timestamptz, now()), now(), actor_id, actor_id, command->>'memo')
    returning id into entry_id;

  insert into public.ledger_accounts (organization_id, code, name, category, currency_code, cashbox_id) values (org_id, 'inventory:' || sold_currency_value, 'FX inventory ' || sold_currency_value, 'asset', sold_currency_value, null) on conflict (organization_id, code) do update set active = true returning id into sold_account;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code, cashbox_id) values (org_id, 'inventory:' || bought_currency_value, 'FX inventory ' || bought_currency_value, 'asset', bought_currency_value, null) on conflict (organization_id, code) do update set active = true returning id into bought_account;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code, cashbox_id) values (org_id, 'cashbox:' || cashbox_id_value || ':' || bought_currency_value, 'Cashbox ' || bought_currency_value, 'asset', bought_currency_value, cashbox_id_value) on conflict (organization_id, code) do update set active = true returning id into cashbox_account;
  if side_value = 'buy_fx' then
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code, cashbox_id) values (org_id, 'cashbox:' || cashbox_id_value || ':' || sold_currency_value, 'Cashbox ' || sold_currency_value, 'asset', sold_currency_value, cashbox_id_value) on conflict (organization_id, code) do update set active = true returning id into cashbox_account;
  end if;

  if side_value = 'sell_fx' or side_value = 'exchange_fx' then
    select coalesce(sum(jl.native_debit - jl.native_credit), 0), coalesce(sum(jl.base_debit - jl.base_credit), 0) into available_quantity, carrying_cost from public.journal_lines jl where jl.organization_id = org_id and jl.account_id = sold_account and jl.currency_code = sold_currency_value;
    if available_quantity < sold_amount_value then raise exception 'Insufficient currency inventory'; end if;
    carrying_cost := greatest(0, carrying_cost / nullif(available_quantity, 0) * sold_amount_value);
    realized := bought_base_value - carrying_cost;
  else
    carrying_cost := bought_base_value;
    realized := 0;
  end if;

  if side_value = 'buy_fx' then
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit, applied_rate) values (org_id, entry_id, bought_account, bought_currency_value, bought_amount_value, bought_base_value, bought_base_value / bought_amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit, applied_rate) values (org_id, entry_id, cashbox_account, sold_currency_value, sold_amount_value, sold_base_value, sold_base_value / sold_amount_value);
  else
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit, applied_rate) values (org_id, entry_id, cashbox_account, bought_currency_value, bought_amount_value, bought_base_value, bought_base_value / bought_amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit, applied_rate) values (org_id, entry_id, sold_account, sold_currency_value, sold_amount_value, carrying_cost, carrying_cost / sold_amount_value);
    if realized >= 0 then
      insert into public.ledger_accounts (organization_id, code, name, category, currency_code) values (org_id, 'income:realized-fx-gain', 'Realized FX gain', 'income', base_currency_value) on conflict (organization_id, code) do update set active = true returning id into gain_account;
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, base_credit, source_metadata) values (org_id, entry_id, gain_account, base_currency_value, realized, jsonb_build_object('cost_basis', carrying_cost));
    else
      insert into public.ledger_accounts (organization_id, code, name, category, currency_code) values (org_id, 'expense:realized-fx-loss', 'Realized FX loss', 'expense', base_currency_value) on conflict (organization_id, code) do update set active = true returning id into loss_account;
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, base_debit, source_metadata) values (org_id, entry_id, loss_account, base_currency_value, abs(realized), jsonb_build_object('cost_basis', carrying_cost));
    end if;
  end if;
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id) values (org_id, client_id, entry_id);
  select * into result_entry from public.journal_entries where id = entry_id;
  return result_entry;
end;
$$;
revoke all on function public.record_fx_trade(jsonb) from public;
grant execute on function public.record_fx_trade(jsonb) to authenticated;

-- Ensure tenant IDs cannot drift across related financial rows.
create or replace function public.assert_financial_tenant_consistency() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'journal_lines' and not exists (select 1 from public.journal_entries where id = new.journal_entry_id and organization_id = new.organization_id) then raise exception 'Journal line tenant mismatch'; end if;
  if tg_table_name = 'ledger_accounts' and new.cashbox_id is not null and not exists (select 1 from public.cashboxes where id = new.cashbox_id and organization_id = new.organization_id) then raise exception 'Ledger account tenant mismatch'; end if;
  return new;
end; $$;
create trigger journal_lines_tenant_check before insert on public.journal_lines for each row execute function public.assert_financial_tenant_consistency();
create trigger ledger_accounts_tenant_check before insert or update on public.ledger_accounts for each row execute function public.assert_financial_tenant_consistency();
