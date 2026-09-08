-- Repair function bodies flagged by plpgsql_check after the v6 rollout.
-- Keep this migration explicit so fresh installs and already-migrated projects
-- converge on the same definitions without source-text rewriting.

create or replace function public.settle_hawala_partner(command jsonb)
returns public.hawala_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  line_id_value uuid := nullif(command->>'statement_line_id', '')::uuid;
  transfer_id_value uuid := nullif(command->>'transfer_id', '')::uuid;
  claimed_partner_id uuid := nullif(command->>'hawala_partner_id', '')::uuid;
  account_id_value uuid := nullif(command->>'money_account_id', '')::uuid;
  actor_id uuid := (select auth.uid());
  client_id text := nullif(trim(command->>'client_command_id'), '');
  amount_value numeric := nullif(command->>'amount', '')::numeric;
  line_row public.hawala_partner_statement_lines;
  transfer_row public.hawala_transfers;
  money public.money_accounts;
  partner public.hawala_partners;
  existing_entry public.journal_entries;
  result public.hawala_settlements;
  base_amount_value numeric;
  event_id uuid;
  entry_id uuid;
  cash_account uuid;
  partner_account uuid;
begin
  if actor_id is null then raise exception 'AUTH_REQUIRED: Authentication required'; end if;
  if account_id_value is null or client_id is null or amount_value is null or amount_value <= 0
     or (line_id_value is null and transfer_id_value is null) then
    raise exception 'HAWALA_SETTLEMENT_DETAILS_REQUIRED: Statement line, account, amount, and command id are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(line_id_value, transfer_id_value)::text, 0));
  if line_id_value is not null then
    select l.* into line_row from public.hawala_partner_statement_lines l
    where l.id = line_id_value for update;
  else
    select l.* into line_row from public.hawala_partner_statement_lines l
    where l.transfer_id = transfer_id_value for update;
  end if;
  if line_row.id is null or line_row.status not in ('open', 'partial') then
    raise exception 'HAWALA_STATEMENT_UNAVAILABLE: Statement line is unavailable or already settled';
  end if;
  if claimed_partner_id is not null and claimed_partner_id <> line_row.partner_id then
    raise exception 'HAWALA_PARTNER_MISMATCH: Settlement partner is bound to the statement line';
  end if;
  select h.* into transfer_row from public.hawala_transfers h where h.id = line_row.transfer_id;
  select hp.* into partner from public.hawala_partners hp
  where hp.id = line_row.partner_id and hp.organization_id = line_row.organization_id and hp.active;
  if transfer_row.id is null or partner.id is null then raise exception 'HAWALA_PARTNER_UNAVAILABLE: Transfer partner is unavailable'; end if;
  if amount_value > line_row.original_amount - line_row.settled_amount then
    raise exception 'HAWALA_SETTLEMENT_EXCEEDS_BALANCE: Settlement exceeds the remaining statement balance';
  end if;
  command := public.prepare_inline_rate(
    command || jsonb_build_object(
      'organization_id', line_row.organization_id,
      'branch_id', transfer_row.branch_id,
      'currency', line_row.currency_code
    ),
    'hawala_settle'
  );
  base_amount_value := public.authoritative_base_amount(
    line_row.organization_id, transfer_row.branch_id, line_row.currency_code, amount_value, false
  );
  perform public.require_capability(line_row.organization_id, 'hawala.settle', jsonb_build_object(
    'branch_id', transfer_row.branch_id,
    'amount_native', amount_value,
    'amount_base', base_amount_value,
    'currency', line_row.currency_code,
    'feature', 'hawala',
    'requires_active_plan', true
  ));

  select je.* into existing_entry
  from public.journal_entries je join public.financial_events fe on fe.id = je.financial_event_id
  where fe.organization_id = line_row.organization_id and fe.client_command_id = client_id;
  if existing_entry.id is not null then
    select s.* into result from public.hawala_settlements s
    where s.organization_id = line_row.organization_id and s.journal_entry_id = existing_entry.id;
    if result.id is null then raise exception 'IDEMPOTENCY_CONFLICT: Command id belongs to another operation'; end if;
    return result;
  end if;

  select ma.* into money from public.money_accounts ma
  where ma.id = account_id_value and ma.organization_id = line_row.organization_id and ma.active;
  if money.id is null or not public.user_can_use_money_account(line_row.organization_id, money.id) then
    raise exception 'MONEY_ACCOUNT_UNAVAILABLE: Settlement account is unavailable';
  end if;
  if money.branch_id is not null and money.branch_id <> transfer_row.branch_id then
    raise exception 'MONEY_ACCOUNT_SCOPE: Settlement account belongs to another branch';
  end if;
  if line_row.direction = 'payable' then
    perform public.require_money_account_balance(line_row.organization_id, money.id, line_row.currency_code, amount_value);
  end if;

  command := command || jsonb_build_object(
    'workflow_type', 'hawala_partner_settlement',
    'statement_line_id', line_row.id,
    'transfer_id', transfer_row.id,
    'hawala_partner_id', partner.id,
    'partner_name', partner.name,
    'settlement_direction', line_row.direction,
    'settlement_amount', amount_value,
    'amount', amount_value,
    'base_amount', base_amount_value,
    'currency', line_row.currency_code,
    'money_account_id', money.id,
    'cashbox_id', money.cashbox_id,
    'money_flow_version', 5
  );
  insert into public.financial_events (
    organization_id, branch_id, event_type, immutable_reference, occurred_at,
    created_by, client_command_id, metadata
  ) values (
    line_row.organization_id, transfer_row.branch_id,
    (case when line_row.direction = 'payable' then 'pay_money' else 'receive_money' end)::public.financial_event_type,
    'hawala-partner-settlement-' || line_row.id || '-' || client_id,
    now(), actor_id, client_id, command
  ) returning id into event_id;
  insert into public.journal_entries (
    organization_id, branch_id, financial_event_id, status, occurred_at,
    posted_at, created_by, posted_by, memo
  ) values (
    line_row.organization_id, transfer_row.branch_id, event_id, 'posted', now(), now(),
    actor_id, actor_id, nullif(trim(command->>'memo'), '')
  ) returning id into entry_id;

  cash_account := public.ensure_money_ledger_account(line_row.organization_id, money.id, line_row.currency_code);
  select la.id into partner_account from public.ledger_accounts la
  where la.organization_id = line_row.organization_id
    and la.code = case when line_row.direction = 'payable'
      then 'hawala:partner-payable:' || partner.id || ':' || line_row.currency_code
      else 'hawala:partner-receivable:' || partner.id || ':' || line_row.currency_code
    end;
  if partner_account is null then raise exception 'HAWALA_LEDGER_MISSING: Partner statement account is unavailable'; end if;
  if line_row.direction = 'payable' then
    insert into public.journal_lines (
      organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit
    ) values (line_row.organization_id, entry_id, partner_account, line_row.currency_code, amount_value, base_amount_value);
    insert into public.journal_lines (
      organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit
    ) values (line_row.organization_id, entry_id, cash_account, line_row.currency_code, amount_value, base_amount_value);
  else
    insert into public.journal_lines (
      organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit
    ) values (line_row.organization_id, entry_id, cash_account, line_row.currency_code, amount_value, base_amount_value);
    insert into public.journal_lines (
      organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit
    ) values (line_row.organization_id, entry_id, partner_account, line_row.currency_code, amount_value, base_amount_value);
  end if;

  insert into public.hawala_settlements (
    organization_id, transfer_id, partner_id, currency_code, amount, journal_entry_id
  ) values (
    line_row.organization_id, transfer_row.id, partner.id, line_row.currency_code, amount_value, entry_id
  ) returning * into result;
  update public.hawala_partner_statement_lines
  set settled_amount = settled_amount + amount_value,
      status = case when settled_amount + amount_value = original_amount then 'settled' else 'partial' end,
      last_settlement_at = now()
  where id = line_row.id;
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id)
  values (line_row.organization_id, client_id, entry_id);
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (line_row.organization_id, actor_id, 'hawala_partner_settled', jsonb_build_object(
    'statement_line_id', line_row.id, 'transfer_id', transfer_row.id,
    'partner_id', partner.id, 'direction', line_row.direction,
    'amount', amount_value, 'currency', line_row.currency_code, 'journal_entry_id', entry_id
  ));
  return result;
end;
$$;

create or replace function public.record_hawala_send_v6(command jsonb)
returns public.hawala_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_reference text := 'SAR-' || upper(encode(extensions.gen_random_bytes(10), 'hex'));
begin
  return public.record_hawala_send(
    (coalesce(command, '{}'::jsonb) - 'reference_code')
    || jsonb_build_object('reference_code', generated_reference, 'reference_source', 'server')
  );
end;
$$;

revoke all on function public.settle_hawala_partner(jsonb) from public, anon;
revoke all on function public.record_hawala_send_v6(jsonb) from public, anon;
grant execute on function public.settle_hawala_partner(jsonb) to authenticated;
grant execute on function public.record_hawala_send_v6(jsonb) to authenticated;
