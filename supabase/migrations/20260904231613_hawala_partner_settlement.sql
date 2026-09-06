create or replace function public.settle_hawala_partner(command jsonb)
returns public.hawala_settlements
language plpgsql security definer set search_path = public
as $$
declare
  transfer_id_value uuid := (command->>'transfer_id')::uuid;
  partner_id_value uuid := (command->>'partner_id')::uuid;
  account_id_value uuid := (command->>'money_account_id')::uuid;
  actor_id uuid := auth.uid(); client_id text := command->>'client_command_id';
  amount_value numeric := (command->>'amount')::numeric;
  h public.hawala_transfers; partner public.hawala_partners; money public.money_accounts;
  role_value text; settled_value numeric; event_id uuid; entry_id uuid; cash_account uuid; payable_account uuid;
  result public.hawala_settlements; existing_entry public.journal_entries;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if transfer_id_value is null or partner_id_value is null or account_id_value is null or client_id is null or amount_value is null or amount_value <= 0 then
    raise exception 'Partner settlement details are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(transfer_id_value::text || ':' || partner_id_value::text, 0));
  select je.* into existing_entry from public.journal_entries je join public.financial_events fe on fe.id = je.financial_event_id where fe.client_command_id = client_id limit 1;
  if existing_entry.id is not null then select * into result from public.hawala_settlements where journal_entry_id = existing_entry.id limit 1; return result; end if;
  select * into h from public.hawala_transfers where id = transfer_id_value for update;
  select * into partner from public.hawala_partners where id = partner_id_value and organization_id = h.organization_id and active;
  if h.id is null or partner.id is null then raise exception 'Hawala transfer or partner is unavailable'; end if;
  if h.status <> 'paid' then raise exception 'Partner settlement requires a paid Hawala transfer'; end if;
  select role_code into role_value from public.organization_memberships where organization_id = h.organization_id and user_id = actor_id and active;
  if role_value not in ('owner', 'manager', 'accountant') then raise exception 'User cannot settle a Hawala partner'; end if;
  select coalesce(sum(amount), 0) into settled_value from public.hawala_settlements where transfer_id = h.id and partner_id = partner.id;
  if amount_value > h.amount - settled_value then raise exception 'Settlement exceeds the remaining partner balance'; end if;
  select * into money from public.money_accounts where id = account_id_value and organization_id = h.organization_id and active;
  if money.id is null or not public.user_can_use_money_account(h.organization_id, money.id) then raise exception 'Settlement account is unavailable'; end if;
  perform public.require_money_account_balance(h.organization_id, money.id, h.currency_code, amount_value);
  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata)
    values (h.organization_id, h.branch_id, 'pay_money', 'hawala-settlement-' || client_id, now(), actor_id, client_id, command) returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo)
    values (h.organization_id, h.branch_id, event_id, 'posted', now(), now(), actor_id, actor_id, command->>'memo') returning id into entry_id;
  cash_account := public.ensure_money_ledger_account(h.organization_id, money.id, h.currency_code);
  select id into payable_account from public.ledger_accounts where organization_id = h.organization_id and code = 'hawala:partner-payable:' || h.currency_code;
  if payable_account is null then raise exception 'Partner payable account is unavailable'; end if;
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (h.organization_id, entry_id, payable_account, h.currency_code, amount_value, amount_value);
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (h.organization_id, entry_id, cash_account, h.currency_code, amount_value, amount_value);
  insert into public.hawala_settlements (organization_id, transfer_id, partner_id, currency_code, amount, journal_entry_id) values (h.organization_id, h.id, partner.id, h.currency_code, amount_value, entry_id) returning * into result;
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id) values (h.organization_id, client_id, entry_id);
  return result;
end;
$$;

revoke all on function public.settle_hawala_partner(jsonb) from public;
grant execute on function public.settle_hawala_partner(jsonb) to authenticated;
