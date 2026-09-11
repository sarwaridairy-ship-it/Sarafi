-- Debts remain native-currency records. Their AFN valuation is an internal
-- accounting detail, so the counter operator must not negotiate or publish a
-- rate while creating or settling a debt. Use the latest approved shop rate
-- silently, even when it is older than the FX board freshness window. A truly
-- missing shop rate still fails safely instead of inventing a valuation.

create or replace function public.record_debt(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  direction_value text := lower(trim(command->>'direction'));
  capability_value text;
  base_amount_value numeric;
begin
  command := public.prepare_inline_rate(command, 'debt_create');
  if direction_value not in ('receivable', 'payable') then
    raise exception 'DEBT_DIRECTION_INVALID: Debt direction must be receivable or payable';
  end if;
  capability_value := case when direction_value = 'receivable'
    then 'debt.create.receivable' else 'debt.create.payable' end;
  base_amount_value := public.authoritative_base_amount(
    nullif(command->>'organization_id', '')::uuid,
    nullif(command->>'branch_id', '')::uuid,
    upper(command->>'currency'),
    nullif(command->>'amount', '')::numeric,
    true
  );
  command := command || jsonb_build_object('base_amount', base_amount_value);
  command := command || jsonb_build_object('workflow_type', 'debt_' || direction_value || '_create');
  perform public.require_capability(
    nullif(command->>'organization_id', '')::uuid,
    capability_value,
    jsonb_strip_nulls(jsonb_build_object(
      'branch_id', nullif(command->>'branch_id', ''),
      'cashbox_id', nullif(command->>'cashbox_id', ''),
      'amount_native', nullif(command->>'amount', ''),
      'amount_base', coalesce(nullif(command->>'base_amount', ''), nullif(command->>'amount', '')),
      'currency', nullif(command->>'currency', ''),
      'requires_active_plan', true,
      'device_id', nullif(command->>'device_id', '')
    ))
  );
  return public.record_debt_capability_impl(command);
end;
$$;

create or replace function public.settle_debt(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  debt_row public.debts;
  capability_value text;
  base_amount_value numeric;
begin
  select d.* into debt_row from public.debts d
  where d.id = nullif(command->>'debt_id', '')::uuid;
  if debt_row.id is null then raise exception 'DEBT_NOT_FOUND: Debt is unavailable'; end if;
  capability_value := case when debt_row.direction = 'receivable'
    then 'debt.settle.receivable' else 'debt.settle.payable' end;
  command := command || jsonb_build_object('workflow_type', 'debt_' || debt_row.direction || '_settle');
  command := public.prepare_inline_rate(
    command || jsonb_build_object(
      'organization_id', debt_row.organization_id,
      'branch_id', debt_row.branch_id,
      'currency', debt_row.currency_code
    ),
    'debt_settle'
  );
  base_amount_value := public.authoritative_base_amount(
    debt_row.organization_id, debt_row.branch_id, debt_row.currency_code,
    nullif(command->>'amount', '')::numeric, true
  );
  command := command || jsonb_build_object('base_amount', base_amount_value);
  perform public.require_capability(debt_row.organization_id, capability_value, jsonb_strip_nulls(jsonb_build_object(
    'branch_id', debt_row.branch_id,
    'cashbox_id', nullif(command->>'cashbox_id', ''),
    'amount_native', nullif(command->>'amount', ''),
    'amount_base', coalesce(nullif(command->>'base_amount', ''), nullif(command->>'amount', '')),
    'currency', debt_row.currency_code,
    'requires_active_plan', true,
    'device_id', nullif(command->>'device_id', '')
  )));
  return public.settle_debt_capability_impl(command);
end;
$$;

revoke all on function public.record_debt(jsonb) from public, anon;
revoke all on function public.settle_debt(jsonb) from public, anon;
grant execute on function public.record_debt(jsonb) to authenticated;
grant execute on function public.settle_debt(jsonb) to authenticated;
