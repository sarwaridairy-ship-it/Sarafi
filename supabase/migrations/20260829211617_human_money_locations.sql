-- Keep accounting identifiers internal. Money-location read models resolve every
-- ledger line to a human location name before it reaches the web application.

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
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id = je.id
    join public.ledger_accounts la on la.id = jl.account_id
    where je.organization_id = target_org and je.occurred_at::date = target_day and je.status = 'posted' and la.code in ('income:realized-fx-gain', 'expense:realized-fx-loss');

  select coalesce(sum(jl.base_credit - jl.base_debit), 0) into commission_value
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id = je.id
    join public.ledger_accounts la on la.id = jl.account_id
    where je.organization_id = target_org and je.occurred_at::date = target_day and je.status = 'posted' and la.code like 'income:commission:%';

  select coalesce(sum(jl.base_debit - jl.base_credit), 0) into expense_value
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id = je.id
    join public.ledger_accounts la on la.id = jl.account_id
    where je.organization_id = target_org and je.occurred_at::date = target_day and je.status = 'posted' and la.category = 'expense';

  with money_lines as (
    select
      jl.currency_code,
      jl.native_debit - jl.native_credit as quantity,
      la.id as account_id,
      la.code as account_code,
      la.name as account_name,
      coalesce(
        la.cashbox_id,
        case
          when fe.metadata->>'cashbox_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (fe.metadata->>'cashbox_id')::uuid
          else null
        end
      ) as resolved_cashbox_id
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    join public.financial_events fe on fe.id = je.financial_event_id
    join public.ledger_accounts la on la.id = jl.account_id
    where je.organization_id = target_org and je.status = 'posted' and la.category = 'asset'
  ), location_rows as (
    select
      coalesce(cb.id::text, ml.account_id::text) as location_id,
      case
        when cb.id is not null then 'cashbox'
        when ml.account_code like 'bank:%' then 'bank'
        when ml.account_code like 'location:%' then 'location'
        else 'account'
      end as location_type,
      coalesce(
        cb.name,
        case
          when ml.account_code like 'bank:%' then regexp_replace(regexp_replace(ml.account_code, '^bank:', ''), ':[A-Z]{3}$', '')
          when ml.account_code like 'location:%' then regexp_replace(regexp_replace(ml.account_code, '^location:', ''), ':[A-Z]{3}$', '')
          else ml.account_name
        end
      ) as location_name,
      ml.currency_code,
      sum(ml.quantity) as quantity
    from money_lines ml
    left join public.cashboxes cb on cb.id = ml.resolved_cashbox_id and cb.organization_id = target_org
    group by
      coalesce(cb.id::text, ml.account_id::text),
      case when cb.id is not null then 'cashbox' when ml.account_code like 'bank:%' then 'bank' when ml.account_code like 'location:%' then 'location' else 'account' end,
      coalesce(cb.name, case when ml.account_code like 'bank:%' then regexp_replace(regexp_replace(ml.account_code, '^bank:', ''), ':[A-Z]{3}$', '') when ml.account_code like 'location:%' then regexp_replace(regexp_replace(ml.account_code, '^location:', ''), ':[A-Z]{3}$', '') else ml.account_name end),
      ml.currency_code
  )
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
    'locations', coalesce((select jsonb_agg(jsonb_build_object('location_id', location_id, 'location_type', location_type, 'location_name', location_name, 'currency', currency_code, 'quantity', quantity) order by location_name, currency_code) from location_rows where quantity <> 0), '[]'::jsonb),
    'receivables', coalesce((select jsonb_agg(jsonb_build_object('currency', currency_code, 'amount', amount) order by currency_code) from (select currency_code, sum(outstanding_amount) as amount from public.debts where organization_id = target_org and direction = 'receivable' and outstanding_amount > 0 group by currency_code) d), '[]'::jsonb),
    'payables', coalesce((select jsonb_agg(jsonb_build_object('currency', currency_code, 'amount', amount) order by currency_code) from (select currency_code, sum(outstanding_amount) as amount from public.debts where organization_id = target_org and direction = 'payable' and outstanding_amount > 0 group by currency_code) d), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('id', activity_rows.id, 'reference', activity_rows.immutable_reference, 'type', activity_rows.event_type, 'occurred_at', activity_rows.occurred_at, 'status', activity_rows.status) order by activity_rows.occurred_at desc) from (select fe.id, fe.immutable_reference, fe.event_type, fe.occurred_at, je.status from public.financial_events fe join public.journal_entries je on je.financial_event_id = fe.id where fe.organization_id = target_org and fe.occurred_at::date = target_day order by fe.occurred_at desc limit 50) activity_rows), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.get_money_location_evidence(target_org uuid)
returns table (
  id uuid,
  journal_entry_id uuid,
  currency_code text,
  native_debit numeric,
  native_credit numeric,
  occurred_at timestamptz,
  memo text,
  location_id text,
  location_type text,
  location_name text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.has_org_permission(target_org, 'financial:overview') then raise exception 'Financial overview permission required'; end if;
  return query
  with evidence as (
    select
      jl.id,
      jl.journal_entry_id,
      jl.currency_code,
      jl.native_debit,
      jl.native_credit,
      je.occurred_at,
      je.memo,
      la.id as account_id,
      la.code as account_code,
      la.name as account_name,
      coalesce(
        la.cashbox_id,
        case
          when fe.metadata->>'cashbox_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (fe.metadata->>'cashbox_id')::uuid
          else null
        end
      ) as resolved_cashbox_id
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    join public.financial_events fe on fe.id = je.financial_event_id
    join public.ledger_accounts la on la.id = jl.account_id
    where je.organization_id = target_org and je.status = 'posted' and la.category = 'asset'
  )
  select
    e.id,
    e.journal_entry_id,
    e.currency_code,
    e.native_debit,
    e.native_credit,
    e.occurred_at,
    e.memo,
    coalesce(cb.id::text, e.account_id::text),
    case when cb.id is not null then 'cashbox' when e.account_code like 'bank:%' then 'bank' when e.account_code like 'location:%' then 'location' else 'account' end,
    coalesce(cb.name, case when e.account_code like 'bank:%' then regexp_replace(regexp_replace(e.account_code, '^bank:', ''), ':[A-Z]{3}$', '') when e.account_code like 'location:%' then regexp_replace(regexp_replace(e.account_code, '^location:', ''), ':[A-Z]{3}$', '') else e.account_name end)
  from evidence e
  left join public.cashboxes cb on cb.id = e.resolved_cashbox_id and cb.organization_id = target_org
  order by e.occurred_at desc, e.id desc
  limit 500;
end;
$$;

revoke all on function public.get_owner_dashboard(uuid, date) from public;
revoke all on function public.get_money_location_evidence(uuid) from public;
grant execute on function public.get_owner_dashboard(uuid, date) to authenticated;
grant execute on function public.get_money_location_evidence(uuid) to authenticated;
