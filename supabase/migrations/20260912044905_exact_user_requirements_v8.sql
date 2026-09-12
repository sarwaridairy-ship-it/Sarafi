-- SARAFI v8: exact available-money valuation, complete app-lock controls,
-- and human-readable Hawala recipient endpoints.

alter table public.app_lock_credentials
  add column if not exists auto_lock_seconds integer not null default 900,
  add column if not exists lock_on_background boolean not null default true;

alter table public.app_lock_credentials
  drop constraint if exists app_lock_credentials_auto_lock_seconds_check;
alter table public.app_lock_credentials
  add constraint app_lock_credentials_auto_lock_seconds_check
  check (auto_lock_seconds in (30, 60, 300, 900));

create or replace function public.get_money_valuation_snapshot(
  target_org uuid,
  target_business_date date default current_date,
  target_comparison_currency text default 'USD',
  target_scope jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  base_currency_value text;
  comparison_currency_value text := upper(trim(coalesce(target_comparison_currency, 'USD')));
  branch_scope uuid := nullif(target_scope->>'branch_id', '')::uuid;
  cashbox_scope uuid := nullif(target_scope->>'cashbox_id', '')::uuid;
  rate_set_id_value uuid;
  rate_effective_value timestamptz;
  payload_value jsonb;
  hash_value text;
  snapshot_id_value uuid;
  snapshot_created_at_value timestamptz;
begin
  perform public.require_capability(
    target_org,
    'financial.overview',
    jsonb_strip_nulls(jsonb_build_object('branch_id', branch_scope, 'cashbox_id', cashbox_scope))
  );

  select o.base_currency_code into base_currency_value
  from public.organizations o
  where o.id = target_org;
  if base_currency_value is null then
    raise exception 'ORGANIZATION_NOT_FOUND: Money valuation is unavailable';
  end if;
  if not exists (select 1 from public.currencies c where c.code = comparison_currency_value and c.active) then
    raise exception 'COMPARISON_CURRENCY_INVALID: Select an active currency';
  end if;

  select vrs.id, vrs.effective_at
    into rate_set_id_value, rate_effective_value
  from public.valuation_rate_sets vrs
  where vrs.organization_id = target_org
    and vrs.base_currency = base_currency_value
    and vrs.active
    and vrs.effective_at <= (target_business_date::timestamptz + interval '1 day')
  order by vrs.effective_at desc, vrs.created_at desc
  limit 1;

  with allowed_accounts as (
    select ma.*
    from public.money_accounts ma
    where ma.organization_id = target_org
      and ma.active
      and public.user_can_use_money_account(target_org, ma.id)
      and (branch_scope is null or ma.branch_id = branch_scope)
      and (cashbox_scope is null or ma.cashbox_id = cashbox_scope)
  ),
  available as (
    select jl.currency_code,
      sum(jl.native_debit - jl.native_credit) as amount,
      sum(jl.base_debit - jl.base_credit) as book_base
    from allowed_accounts ma
    join public.ledger_accounts la on la.money_account_id = ma.id
    join public.journal_lines jl on jl.account_id = la.id
    join public.journal_entries je on je.id = jl.journal_entry_id and je.status = 'posted'
    where je.occurred_at < target_business_date::timestamptz + interval '1 day'
    group by jl.currency_code
  ),
  debt_positions as (
    select d.currency_code,
      sum(case when d.direction = 'receivable' then d.outstanding_amount else 0 end) as receivable,
      sum(case when d.direction = 'payable' then d.outstanding_amount else 0 end) as payable
    from public.debts d
    where d.organization_id = target_org
      and d.outstanding_amount > 0
      and public.can_access_branch_v6(target_org, d.branch_id, 'financial.overview')
      and (branch_scope is null or d.branch_id = branch_scope)
    group by d.currency_code
  ),
  hawala_positions as (
    select h.currency_code,
      sum(case when l.direction = 'receivable'
        then l.original_amount - l.settled_amount
        else -(l.original_amount - l.settled_amount)
      end) as net
    from public.hawala_partner_statement_lines l
    join public.hawala_transfers h on h.id = l.transfer_id and h.organization_id = target_org
    where l.status in ('open', 'partial')
      and public.can_access_branch_v6(target_org, h.branch_id, 'financial.overview')
      and (branch_scope is null or h.branch_id = branch_scope)
    group by h.currency_code
  ),
  currency_keys as (
    select currency_code from available
    union select currency_code from debt_positions
    union select currency_code from hawala_positions
  ),
  positions as (
    select k.currency_code,
      coalesce(a.amount, 0) as available,
      coalesce(d.receivable, 0) as receivable,
      coalesce(d.payable, 0) as payable,
      coalesce(h.net, 0) as hawala_net,
      coalesce(a.book_base, 0) as book_base,
      case when k.currency_code = base_currency_value then 1::numeric else vr.rate end as valuation_rate,
      case
        when k.currency_code = base_currency_value then 'current'
        when vr.rate is null then 'missing'
        when rate_effective_value < now() - interval '1 day' then 'stale'
        else 'current'
      end as rate_status
    from currency_keys k
    left join available a using (currency_code)
    left join debt_positions d using (currency_code)
    left join hawala_positions h using (currency_code)
    left join public.valuation_rates vr
      on vr.rate_set_id = rate_set_id_value
     and vr.organization_id = target_org
     and vr.currency_code = k.currency_code
     and vr.base_currency = base_currency_value
  ),
  valued as (
    select p.*,
      (p.available + p.receivable - p.payable + p.hawala_net) as native_net,
      case when p.rate_status = 'current' then p.available * p.valuation_rate else null end as available_base,
      case when p.rate_status = 'current'
        then (p.available + p.receivable - p.payable + p.hawala_net) * p.valuation_rate
        else null end as current_base
    from positions p
  ),
  totals as (
    select
      not exists (select 1 from valued v where v.available <> 0 and v.rate_status <> 'current') as total_complete,
      coalesce(sum(case when rate_status = 'current' then available * valuation_rate end), 0) as available_valued_base,
      coalesce(sum(case when rate_status = 'current' then receivable * valuation_rate end), 0) as receivables_base,
      coalesce(sum(case when rate_status = 'current' then payable * valuation_rate end), 0) as payables_base,
      coalesce(sum(case when rate_status = 'current' then hawala_net * valuation_rate end), 0) as hawala_net_base,
      coalesce(sum(current_base), 0) as net_position_base,
      coalesce(sum(book_base), 0) as book_value_base,
      count(*) filter (where available <> 0 and rate_status <> 'current') as excluded_currency_count,
      coalesce(array_agg(currency_code order by currency_code) filter (where available <> 0 and rate_status = 'missing'), '{}'::text[]) as missing_currencies,
      coalesce(array_agg(currency_code order by currency_code) filter (where available <> 0 and rate_status = 'stale'), '{}'::text[]) as stale_currencies
    from valued
  ),
  comparison_rate as (
    select case
      when comparison_currency_value = base_currency_value then 1::numeric
      when rate_effective_value is null or rate_effective_value < now() - interval '1 day' then null
      else (select vr.rate from public.valuation_rates vr
        where vr.rate_set_id = rate_set_id_value
          and vr.organization_id = target_org
          and vr.currency_code = comparison_currency_value
          and vr.base_currency = base_currency_value)
    end as rate
  ),
  locations as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'money_account_id', ma.id,
      'name', ma.name,
      'account_type', ma.account_type,
      'branch_id', ma.branch_id,
      'cashbox_id', ma.cashbox_id,
      'balances', coalesce(b.rows, '[]'::jsonb)
    ) order by ma.account_type, ma.name), '[]'::jsonb) as rows
    from allowed_accounts ma
    left join lateral (
      select jsonb_agg(jsonb_build_object('currency_code', q.currency_code, 'amount', q.amount::text) order by q.currency_code) as rows
      from (
        select jl.currency_code, sum(jl.native_debit - jl.native_credit) as amount
        from public.ledger_accounts la
        join public.journal_lines jl on jl.account_id = la.id
        join public.journal_entries je on je.id = jl.journal_entry_id and je.status = 'posted'
        where la.money_account_id = ma.id
          and je.occurred_at < target_business_date::timestamptz + interval '1 day'
        group by jl.currency_code
      ) q
    ) b on true
  )
  select jsonb_build_object(
    'snapshot_date', target_business_date,
    'base_currency', base_currency_value,
    'comparison_currency', comparison_currency_value,
    'scope', coalesce(target_scope, '{}'::jsonb),
    'valuation_rate_set_id', rate_set_id_value,
    'valuation_effective_at', rate_effective_value,
    'quality', case when t.total_complete and cr.rate is not null then 'current' else 'partial' end,
    'total_complete', t.total_complete,
    'excluded_currency_count', t.excluded_currency_count,
    'missing_currencies', to_jsonb(t.missing_currencies),
    'stale_currencies', to_jsonb(t.stale_currencies),
    'totals', jsonb_build_object(
      'available_base', case when t.total_complete then t.available_valued_base::text else null end,
      'available_valued_base', t.available_valued_base::text,
      'receivables_base', t.receivables_base::text,
      'payables_base', t.payables_base::text,
      'hawala_net_base', t.hawala_net_base::text,
      'net_position_base', t.net_position_base::text,
      'book_value_base', t.book_value_base::text,
      'valuation_difference_base', (t.net_position_base - t.book_value_base)::text,
      'comparison_value', case when t.total_complete and cr.rate is not null and cr.rate > 0 then (t.available_valued_base / cr.rate)::text else null end,
      'comparison_rate', cr.rate::text
    ),
    'currencies', coalesce((select jsonb_agg(jsonb_build_object(
      'currency_code', v.currency_code,
      'available', v.available::text,
      'receivable', v.receivable::text,
      'payable', v.payable::text,
      'hawala_net', v.hawala_net::text,
      'native_net', v.native_net::text,
      'rate', v.valuation_rate::text,
      'rate_status', v.rate_status,
      'available_base', v.available_base::text,
      'current_base', v.current_base::text,
      'book_base', v.book_base::text
    ) order by v.currency_code) from valued v), '[]'::jsonb),
    'locations', l.rows
  ) into payload_value
  from totals t cross join comparison_rate cr cross join locations l;

  hash_value := encode(extensions.digest(payload_value::text, 'sha256'), 'hex');
  insert into public.money_valuation_snapshots (
    organization_id, snapshot_date, scope, base_currency, comparison_currency,
    valuation_rate_set_id, valuation_effective_at, snapshot_sha256, payload, created_by
  ) values (
    target_org, target_business_date, coalesce(target_scope, '{}'::jsonb), base_currency_value, comparison_currency_value,
    rate_set_id_value, rate_effective_value, hash_value, payload_value, actor_id
  ) on conflict (organization_id, snapshot_sha256) do nothing
  returning id, created_at into snapshot_id_value, snapshot_created_at_value;

  if snapshot_id_value is null then
    select s.id, s.created_at into snapshot_id_value, snapshot_created_at_value
    from public.money_valuation_snapshots s
    where s.organization_id = target_org and s.snapshot_sha256 = hash_value;
  end if;

  return payload_value || jsonb_build_object(
    'snapshot_id', snapshot_id_value,
    'snapshot_sha256', hash_value,
    'captured_at', snapshot_created_at_value
  );
end;
$$;

revoke all on function public.get_money_valuation_snapshot(uuid, date, text, jsonb) from public, anon;
grant execute on function public.get_money_valuation_snapshot(uuid, date, text, jsonb) to authenticated;

drop function if exists public.get_hawala_partners(uuid);
create function public.get_hawala_partners(target_org uuid)
returns table (
  id uuid,
  counterparty_id uuid,
  name text,
  active boolean,
  endpoint_type text,
  recipient_organization_id uuid,
  recipient_branch_id uuid,
  reciprocal_partner_id uuid,
  endpoint_verified_at timestamptz,
  endpoint_active boolean,
  recipient_organization_name text,
  recipient_branch_name text,
  recipient_location text
)
language sql
security definer
stable
set search_path = ''
as $$
  select hp.id, hp.counterparty_id, hp.name, hp.active, hp.endpoint_type,
    hp.recipient_organization_id, hp.recipient_branch_id, hp.reciprocal_partner_id,
    hp.endpoint_verified_at, hp.endpoint_active,
    recipient_org.display_name,
    recipient_branch.name,
    recipient_branch.name
  from public.hawala_partners hp
  left join public.organizations recipient_org on recipient_org.id = hp.recipient_organization_id
  left join public.branches recipient_branch on recipient_branch.id = hp.recipient_branch_id
  where hp.organization_id = target_org
    and hp.active
    and public.has_capability(target_org, 'hawala.view', '{}'::jsonb)
  order by hp.name, recipient_branch.name, hp.id;
$$;

revoke all on function public.get_hawala_partners(uuid) from public, anon;
grant execute on function public.get_hawala_partners(uuid) to authenticated;
