-- Complete the operational Hawala journeys using the existing transfer,
-- status-event and settlement tables. All monetary effects are posted through
-- balanced journal entries and each command is idempotent by client id.

create or replace function public.record_hawala_incoming(command jsonb)
returns public.hawala_transfers
language plpgsql security definer set search_path = public
as $$
declare
  org_id uuid := (command->>'organization_id')::uuid;
  branch_id_value uuid := (command->>'branch_id')::uuid;
  actor_id uuid := auth.uid(); client_id text := command->>'client_command_id';
  amount_value numeric := (command->>'amount')::numeric;
  fee_value numeric := coalesce((command->>'fee')::numeric, 0);
  currency_value text := upper(command->>'currency');
  beneficiary_value text := nullif(trim(command->>'beneficiary_name'), '');
  origin_value text := nullif(trim(command->>'origin_location'), '');
  destination_value text := nullif(trim(command->>'destination_location'), '');
  reference_value text := nullif(trim(command->>'reference_code'), '');
  base_amount_value numeric := (command->>'base_amount')::numeric;
  event_id uuid; entry_id uuid; transfer_id uuid; existing public.hawala_transfers;
  obligation_account uuid; beneficiary_account uuid; role_value text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if client_id is null or beneficiary_value is null or origin_value is null or destination_value is null or reference_value is null then raise exception 'Incoming Hawala details are required'; end if;
  if amount_value is null or amount_value <= 0 or fee_value < 0 then raise exception 'Hawala amount or fee is invalid'; end if;
  if base_amount_value is null or base_amount_value <= 0 then raise exception 'Base-currency value is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || client_id, 0));
  select h.* into existing from public.hawala_transfers h join public.journal_entries je on je.id = h.journal_entry_id join public.financial_events e on e.id = je.financial_event_id
    where h.organization_id = org_id and e.client_command_id = client_id limit 1;
  if existing.id is not null then return existing; end if;
  select role_code into role_value from public.organization_memberships where organization_id = org_id and user_id = actor_id and active;
  if role_value not in ('owner', 'manager', 'accountant', 'cashier') then raise exception 'User cannot record incoming Hawala'; end if;
  if not exists (select 1 from public.branches where id = branch_id_value and organization_id = org_id and active) then raise exception 'Branch is not active'; end if;
  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata)
    values (org_id, branch_id_value, 'receive_money', 'hawala-incoming-' || reference_value, now(), actor_id, client_id, command) returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo)
    values (org_id, branch_id_value, event_id, 'posted', now(), now(), actor_id, actor_id, command->>'memo') returning id into entry_id;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
    values (org_id, 'hawala:incoming-receivable:' || currency_value, 'Incoming Hawala receivable · ' || currency_value, 'asset', currency_value)
    on conflict (organization_id, code) do update set active = true returning id into obligation_account;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
    values (org_id, 'hawala:beneficiary-payable:' || currency_value, 'Hawala beneficiary payable · ' || currency_value, 'liability', currency_value)
    on conflict (organization_id, code) do update set active = true returning id into beneficiary_account;
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit)
    values (org_id, entry_id, obligation_account, currency_value, amount_value, base_amount_value);
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit)
    values (org_id, entry_id, beneficiary_account, currency_value, amount_value, base_amount_value);
  insert into public.hawala_transfers (organization_id, branch_id, beneficiary_name, origin_location, destination_location, currency_code, amount, fee, reference_code, status, journal_entry_id)
    values (org_id, branch_id_value, beneficiary_value, origin_value, destination_value, currency_value, amount_value, fee_value, reference_value, 'ready', entry_id) returning id into transfer_id;
  insert into public.hawala_status_events (transfer_id, status, actor_user_id) values (transfer_id, 'ready', actor_id);
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id) values (org_id, client_id, entry_id);
  select * into existing from public.hawala_transfers where id = transfer_id; return existing;
end;
$$;

create or replace function public.pay_hawala_beneficiary(command jsonb)
returns public.hawala_transfers
language plpgsql security definer set search_path = public
as $$
declare
  transfer_id_value uuid := (command->>'transfer_id')::uuid; account_id_value uuid := (command->>'money_account_id')::uuid;
  actor_id uuid := auth.uid(); client_id text := command->>'client_command_id'; h public.hawala_transfers; money public.money_accounts;
  role_value text; event_id uuid; entry_id uuid; cash_account uuid; beneficiary_account uuid; existing public.journal_entries;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if transfer_id_value is null or account_id_value is null or client_id is null then raise exception 'Payout details are required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(transfer_id_value::text, 0));
  select je.* into existing from public.journal_entries je join public.financial_events fe on fe.id = je.financial_event_id where fe.client_command_id = client_id limit 1;
  if existing.id is not null then select * into h from public.hawala_transfers where id = transfer_id_value; return h; end if;
  select * into h from public.hawala_transfers where id = transfer_id_value for update;
  if h.id is null or h.status <> 'ready' then raise exception 'Hawala transfer is not ready for beneficiary payout'; end if;
  select role_code into role_value from public.organization_memberships where organization_id = h.organization_id and user_id = actor_id and active;
  if role_value not in ('owner', 'manager', 'accountant', 'cashier') then raise exception 'User cannot pay a beneficiary'; end if;
  select * into money from public.money_accounts where id = account_id_value and organization_id = h.organization_id and active;
  if money.id is null or not public.user_can_use_money_account(h.organization_id, money.id) then raise exception 'Payout account is unavailable'; end if;
  perform public.require_money_account_balance(h.organization_id, money.id, h.currency_code, h.amount);
  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata)
    values (h.organization_id, h.branch_id, 'pay_money', 'hawala-payout-' || client_id, now(), actor_id, client_id, command) returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo)
    values (h.organization_id, h.branch_id, event_id, 'posted', now(), now(), actor_id, actor_id, command->>'memo') returning id into entry_id;
  cash_account := public.ensure_money_ledger_account(h.organization_id, money.id, h.currency_code);
  select id into beneficiary_account from public.ledger_accounts where organization_id = h.organization_id and code = 'hawala:beneficiary-payable:' || h.currency_code;
  if beneficiary_account is null then raise exception 'Beneficiary payable account is unavailable'; end if;
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (h.organization_id, entry_id, beneficiary_account, h.currency_code, h.amount, h.amount);
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (h.organization_id, entry_id, cash_account, h.currency_code, h.amount, h.amount);
  update public.hawala_transfers set status = 'paid' where id = h.id returning * into h;
  insert into public.hawala_status_events (transfer_id, status, actor_user_id) values (h.id, 'paid', actor_id);
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id) values (h.organization_id, client_id, entry_id);
  return h;
end;
$$;

revoke all on function public.record_hawala_incoming(jsonb), public.pay_hawala_beneficiary(jsonb) from public;
grant execute on function public.record_hawala_incoming(jsonb), public.pay_hawala_beneficiary(jsonb) to authenticated;
