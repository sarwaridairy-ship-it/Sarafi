-- Complete the live owner dashboard metric contract.

create or replace function public.get_owner_dashboard(target_org uuid, target_day date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
declare realized_value numeric;
declare commission_value numeric;
declare expense_value numeric;
begin
  if not public.has_org_permission(target_org, 'financial:overview') then raise exception 'Financial overview permission required'; end if;
  select coalesce(sum(case when la.code = 'income:realized-fx-gain' then jl.base_credit - jl.base_debit when la.code = 'expense:realized-fx-loss' then jl.base_credit - jl.base_debit else 0 end), 0) into realized_value
    from public.journal_entries je join public.journal_lines jl on jl.journal_entry_id = je.id join public.ledger_accounts la on la.id = jl.account_id
    where je.organization_id = target_org and je.occurred_at::date = target_day and je.status = 'posted' and la.code in ('income:realized-fx-gain', 'expense:realized-fx-loss');
  select coalesce(sum(jl.base_credit - jl.base_debit), 0) into commission_value
    from public.journal_entries je join public.journal_lines jl on jl.journal_entry_id = je.id join public.ledger_accounts la on la.id = jl.account_id
    where je.organization_id = target_org and je.occurred_at::date = target_day and je.status = 'posted' and la.code like 'income:commission:%';
  select coalesce(sum(jl.base_debit - jl.base_credit), 0) into expense_value
    from public.journal_entries je join public.journal_lines jl on jl.journal_entry_id = je.id join public.ledger_accounts la on la.id = jl.account_id
    where je.organization_id = target_org and je.occurred_at::date = target_day and je.status = 'posted' and la.category = 'expense';
  select jsonb_build_object(
    'organization_id', target_org,
    'business_date', target_day,
    'fresh_at', now(),
    'transaction_count', (select count(*) from public.journal_entries where organization_id = target_org and occurred_at::date = target_day and status = 'posted'),
    'buy_count', (select count(*) from public.financial_events where organization_id = target_org and occurred_at::date = target_day and event_type = 'buy_fx'),
    'sell_count', (select count(*) from public.financial_events where organization_id = target_org and occurred_at::date = target_day and event_type = 'sell_fx'),
    'exchange_count', (select count(*) from public.financial_events where organization_id = target_org and occurred_at::date = target_day and event_type = 'exchange_fx'),
    'volume_base', coalesce((select sum(jl.base_debit) from public.journal_entries je join public.journal_lines jl on jl.journal_entry_id = je.id where je.organization_id = target_org and je.occurred_at::date = target_day and je.status = 'posted' and jl.base_debit > 0), 0),
    'realized_profit', realized_value,
    'commission_income', commission_value,
    'expenses', expense_value,
    'net_result', realized_value + commission_value - expense_value,
    'net_position_base', coalesce((select sum(jl.base_debit - jl.base_credit) from public.journal_entries je join public.journal_lines jl on jl.journal_entry_id = je.id join public.ledger_accounts la on la.id = jl.account_id where je.organization_id = target_org and je.status = 'posted' and la.category in ('asset', 'liability')), 0),
    'pending_approvals', (select count(*) from public.approval_requests where organization_id = target_org and status = 'pending'),
    'reconciliation_differences', coalesce((select sum(ccl.variance_amount) from public.cashbox_close_lines ccl join public.cashbox_closes cc on cc.id = ccl.close_id where cc.organization_id = target_org and cc.business_date = target_day), 0),
    'positions', coalesce((select jsonb_agg(jsonb_build_object('currency', currency_code, 'quantity', quantity, 'carrying_base_value', carrying_base_value) order by currency_code) from public.fx_inventory_cost_state where organization_id = target_org), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(jsonb_build_object('location', location_rows.code, 'currency', location_rows.currency_code, 'quantity', location_rows.quantity) order by location_rows.code, location_rows.currency_code) from (select la.code, jl.currency_code, sum(jl.native_debit - jl.native_credit) as quantity from public.journal_lines jl join public.journal_entries je on je.id = jl.journal_entry_id join public.ledger_accounts la on la.id = jl.account_id where je.organization_id = target_org and je.status = 'posted' and la.category = 'asset' group by la.code, jl.currency_code) location_rows), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('id', activity_rows.id, 'reference', activity_rows.immutable_reference, 'type', activity_rows.event_type, 'occurred_at', activity_rows.occurred_at, 'status', activity_rows.status) order by activity_rows.occurred_at desc) from (select fe.id, fe.immutable_reference, fe.event_type, fe.occurred_at, je.status from public.financial_events fe join public.journal_entries je on je.financial_event_id = fe.id where fe.organization_id = target_org and fe.occurred_at::date = target_day order by fe.occurred_at desc limit 50) activity_rows), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_owner_dashboard(uuid, date) from public;
grant execute on function public.get_owner_dashboard(uuid, date) to authenticated;