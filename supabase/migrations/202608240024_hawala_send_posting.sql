-- Add the first authoritative Hawala send workflow behind an organization feature flag.

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
  origin_value text := coalesce(nullif(trim(command->>'origin_location'), ''), 'unassigned');
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
  if not exists (select 1 from public.currencies where code = currency_value and active) then raise exception 'Currency is not active'; end if;
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
  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata)
    values (org_id, branch_id_value, 'pay_money', 'hawala-' || reference_value, now(), actor_id, client_id, command) returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo)
    values (org_id, branch_id_value, event_id, 'posted', now(), now(), actor_id, actor_id, command->>'memo') returning id into entry_id;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
    values (org_id, 'location:' || origin_value || ':' || currency_value, 'Location ' || currency_value, 'asset', currency_value)
    on conflict (organization_id, code) do update set active = true returning id into cash_account;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
    values (org_id, 'hawala:partner-payable:' || currency_value, 'Hawala partner payable ' || currency_value, 'liability', currency_value)
    on conflict (organization_id, code) do update set active = true returning id into settlement_account;
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, settlement_account, currency_value, amount_value, amount_value);
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, cash_account, currency_value, amount_value, amount_value);
  if fee_value > 0 then
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
      values (org_id, 'income:hawala-fee:' || currency_value, 'Hawala fee income ' || currency_value, 'income', currency_value)
      on conflict (organization_id, code) do update set active = true returning id into fee_account;
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, cash_account, currency_value, fee_value, fee_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, fee_account, currency_value, fee_value, fee_value);
  end if;
  insert into public.hawala_transfers (organization_id, branch_id, beneficiary_name, origin_location, destination_location, currency_code, amount, fee, reference_code, status, journal_entry_id)
    values (org_id, branch_id_value, beneficiary_value, origin_value, destination_value, currency_value, amount_value, fee_value, reference_value, 'created', entry_id) returning id into transfer_id;
  insert into public.hawala_status_events (transfer_id, status, actor_user_id) values (transfer_id, 'created', actor_id);
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id) values (org_id, client_id, entry_id);
  select * into result_transfer from public.hawala_transfers where id = transfer_id;
  return result_transfer;
end;
$$;

revoke all on function public.record_hawala_send(jsonb) from public;
grant execute on function public.record_hawala_send(jsonb) to authenticated;