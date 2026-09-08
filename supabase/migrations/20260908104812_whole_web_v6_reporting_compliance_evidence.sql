-- SARAFI whole-web v6: immutable report sources and pre-post compliance evidence.

-- One structured, expiring, default-deny authority contract is consumed by the
-- browser and can also be asserted by RPC, RLS and trigger acceptance tests.
create or replace function public.get_my_capabilities(target_org uuid)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  with membership as materialized (
    select m.id, m.organization_id, m.role_code
    from public.organization_memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.active
      and public.is_platform_user_active()
    limit 1
  ), capabilities as materialized (
    select d.capability_code
    from membership m
    cross join public.capability_definitions d
    where public.has_capability(m.organization_id, d.capability_code, '{}'::jsonb)
  ), branches as materialized (
    select b.id
    from membership m
    join public.branches b on b.organization_id = m.organization_id and b.active
    where not exists (
      select 1 from public.organization_branch_access ba0 where ba0.membership_id = m.id
    ) or exists (
      select 1 from public.organization_branch_access ba
      where ba.membership_id = m.id and ba.branch_id = b.id
    )
  ), cashboxes as materialized (
    select c.id
    from membership m
    join public.cashboxes c on c.organization_id = m.organization_id and c.active
    where not exists (
      select 1 from public.organization_cashbox_access ca0 where ca0.membership_id = m.id
    ) or exists (
      select 1 from public.organization_cashbox_access ca
      where ca.membership_id = m.id and ca.cashbox_id = c.id
    )
  ), contract as (
    select jsonb_build_object(
      'default_deny', true,
      'active', true,
      'organization_id', m.organization_id,
      'membership_id', m.id,
      'role_code', m.role_code,
      'capabilities', coalesce((select jsonb_agg(c.capability_code order by c.capability_code) from capabilities c), '[]'::jsonb),
      'branch_ids', coalesce((select jsonb_agg(b.id order by b.id) from branches b), '[]'::jsonb),
      'cashbox_ids', coalesce((select jsonb_agg(c.id order by c.id) from cashboxes c), '[]'::jsonb),
      'transaction_types', coalesce((
        select jsonb_agg(c.capability_code order by c.capability_code)
        from capabilities c
        where c.capability_code like 'financial.post.%'
          or c.capability_code like 'debt.%'
          or c.capability_code like 'hawala.%'
          or c.capability_code = 'owner.capital.post'
      ), '[]'::jsonb),
      'amount_limits', coalesce((
        select jsonb_object_agg(o.capability_code, o.limits)
        from public.membership_capability_overrides o
        where o.membership_id = m.id and o.allowed and o.limits <> '{}'::jsonb
          and (o.expires_at is null or o.expires_at > now())
      ), '{}'::jsonb),
      'rate_override_limits', coalesce((
        select jsonb_object_agg(o.capability_code, o.limits)
        from public.membership_capability_overrides o
        where o.membership_id = m.id and o.allowed
          and o.capability_code in ('financial.post.fx', 'rates.manage')
          and o.limits <> '{}'::jsonb
          and (o.expires_at is null or o.expires_at > now())
      ), '{}'::jsonb),
      'capability_scopes', coalesce((
        select jsonb_object_agg(o.capability_code, jsonb_build_object(
          'allowed', o.allowed,
          'branch_ids', to_jsonb(o.branch_ids),
          'cashbox_ids', to_jsonb(o.cashbox_ids),
          'limits', o.limits
        ))
        from public.membership_capability_overrides o
        where o.membership_id = m.id
          and (o.expires_at is null or o.expires_at > now())
      ), '{}'::jsonb),
      'hawala_permissions', coalesce((select jsonb_agg(c.capability_code order by c.capability_code) from capabilities c where c.capability_code like 'hawala.%'), '[]'::jsonb),
      'document_permissions', coalesce((select jsonb_agg(c.capability_code order by c.capability_code) from capabilities c where c.capability_code like 'documents.%'), '[]'::jsonb),
      'approval_permissions', coalesce((select jsonb_agg(c.capability_code order by c.capability_code) from capabilities c where c.capability_code like 'approval.%'), '[]'::jsonb),
      'security_permissions', coalesce((
        select jsonb_agg(c.capability_code order by c.capability_code)
        from capabilities c
        where c.capability_code like 'security.%'
          or c.capability_code in ('team.manage', 'team.capabilities.manage', 'ownership.transfer', 'owner.delete')
      ), '[]'::jsonb),
      'issued_at', now(),
      'expires_in_seconds', least(300, greatest(0, coalesce((
        select extract(epoch from min(o.expires_at) - now())
        from public.membership_capability_overrides o
        where o.membership_id = m.id and o.expires_at > now()
      ), 300)))::integer,
      'expires_at', least(
        now() + interval '5 minutes',
        coalesce((
          select min(o.expires_at)
          from public.membership_capability_overrides o
          where o.membership_id = m.id and o.expires_at > now()
        ), now() + interval '5 minutes')
      )
    ) as value
    from membership m
  )
  select coalesce((select contract.value from contract), jsonb_build_object(
    'default_deny', true,
    'active', false,
    'organization_id', target_org,
    'membership_id', null,
    'role_code', null,
    'capabilities', '[]'::jsonb,
    'branch_ids', '[]'::jsonb,
    'cashbox_ids', '[]'::jsonb,
    'transaction_types', '[]'::jsonb,
    'amount_limits', '{}'::jsonb,
    'rate_override_limits', '{}'::jsonb,
    'capability_scopes', '{}'::jsonb,
    'hawala_permissions', '[]'::jsonb,
    'document_permissions', '[]'::jsonb,
    'approval_permissions', '[]'::jsonb,
    'security_permissions', '[]'::jsonb,
    'issued_at', now(),
    'expires_in_seconds', 0,
    'expires_at', now()
  ));
$$;

revoke all on function public.get_my_capabilities(uuid) from public, anon;
grant execute on function public.get_my_capabilities(uuid) to authenticated;

create table public.client_telemetry_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (event_name in ('rpc_error', 'render_error', 'route_error')),
  release_version text not null check (length(release_version) between 1 and 120),
  route text not null check (length(route) between 1 and 300 and route not like '%?%'),
  rpc_name text not null check (rpc_name ~ '^[a-z0-9_]{2,100}$'),
  rpc_error_code text not null check (rpc_error_code ~ '^[A-Za-z0-9_:-]{2,100}$'),
  correlation_id uuid not null unique,
  http_status integer check (http_status between 400 and 599),
  online boolean,
  created_at timestamptz not null default now()
);

create index client_telemetry_events_org_created_idx
  on public.client_telemetry_events (organization_id, created_at desc);

alter table public.client_telemetry_events enable row level security;
revoke all on public.client_telemetry_events from public, anon, authenticated;

create or replace function public.record_client_telemetry(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  event_value text := coalesce(nullif(command->>'event_name', ''), 'rpc_error');
  correlation_value uuid := nullif(command->>'correlation_id', '')::uuid;
  release_value text := left(coalesce(nullif(trim(command->>'release_version'), ''), 'unknown'), 120);
  route_value text := left(split_part(coalesce(nullif(trim(command->>'route'), ''), 'unknown'), '?', 1), 300);
  rpc_value text := left(coalesce(nullif(trim(command->>'rpc_name'), ''), 'unknown_rpc'), 100);
  code_value text := left(coalesce(nullif(trim(command->>'rpc_error_code'), ''), 'UNKNOWN'), 100);
  status_value integer := nullif(command->>'http_status', '')::integer;
  online_value boolean := nullif(command->>'online', '')::boolean;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if event_value not in ('rpc_error', 'render_error', 'route_error') then
    raise exception 'Telemetry event is invalid';
  end if;
  if org_id is not null and not public.is_org_member(org_id) then
    raise exception 'Organization membership required';
  end if;
  if correlation_value is null then raise exception 'Correlation ID required'; end if;
  if rpc_value !~ '^[a-z0-9_]{2,100}$' or code_value !~ '^[A-Za-z0-9_:-]{2,100}$' then
    raise exception 'Telemetry identifier is invalid';
  end if;
  if status_value is not null and (status_value < 400 or status_value > 599) then
    raise exception 'Telemetry HTTP status is invalid';
  end if;
  if (
    select count(*) >= 100
    from public.client_telemetry_events e
    where e.actor_user_id = actor_id and e.created_at >= now() - interval '1 hour'
  ) then
    return jsonb_build_object('recorded', false, 'reason', 'rate_limited');
  end if;

  insert into public.client_telemetry_events (
    organization_id, actor_user_id, event_name, release_version, route,
    rpc_name, rpc_error_code, correlation_id, http_status, online
  ) values (
    org_id, actor_id, event_value, release_value, route_value,
    rpc_value, code_value, correlation_value, status_value, online_value
  ) on conflict (correlation_id) do nothing;
  return jsonb_build_object('recorded', true, 'correlation_id', correlation_value);
end;
$$;

revoke all on function public.record_client_telemetry(jsonb) from public, anon;
grant execute on function public.record_client_telemetry(jsonb) to authenticated;

drop policy if exists security_audit_org_read on public.security_audit_events;
drop policy if exists security_audit_least_privilege_v6 on public.security_audit_events;
create policy security_audit_least_privilege_v6
on public.security_audit_events for select to authenticated
using (
  public.is_platform_user_active()
  and (
    actor_user_id = (select auth.uid())
    or target_user_id = (select auth.uid())
    or public.has_capability(organization_id, 'security.manage', '{}'::jsonb)
    or public.has_capability(organization_id, 'team.manage', '{}'::jsonb)
  )
);

-- Report generation must scope the source rows before aggregating or freezing
-- them. Recording branch/cashbox values in snapshot metadata is not sufficient.
create or replace function public.get_scoped_report_ledger_lines_v6(
  target_org uuid,
  from_value date default null,
  to_value date default null,
  branch_value uuid default null,
  cashbox_value uuid default null,
  capability_value text default 'financial.report'
)
returns table (
  journal_line_id uuid,
  journal_entry_id uuid,
  branch_id uuid,
  entry_status text,
  occurred_at timestamptz,
  created_by uuid,
  financial_event_id uuid,
  immutable_reference text,
  event_type text,
  event_metadata jsonb,
  account_id uuid,
  account_code text,
  account_name text,
  account_category text,
  currency_code text,
  native_debit numeric,
  native_credit numeric,
  base_debit numeric,
  base_credit numeric
)
language sql
security definer
stable
set search_path = ''
as $$
  with active_membership as materialized (
    select m.id
    from public.organization_memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.active
      and public.is_platform_user_active()
    limit 1
  ), scope_flags as materialized (
    select
      am.id as membership_id,
      (
        exists(select 1 from public.organization_branch_access ba where ba.membership_id = am.id)
        or exists(
          select 1 from public.membership_capability_overrides mco
          where mco.membership_id = am.id
            and mco.capability_code = capability_value
            and cardinality(mco.branch_ids) > 0
        )
      ) as branch_scoped,
      (
        exists(select 1 from public.organization_cashbox_access ca where ca.membership_id = am.id)
        or exists(
          select 1 from public.membership_capability_overrides mco
          where mco.membership_id = am.id
            and mco.capability_code = capability_value
            and cardinality(mco.cashbox_ids) > 0
        )
      ) as cashbox_scoped
    from active_membership am
  ), scoped_entries as materialized (
    select
      je.id,
      je.branch_id,
      je.status::text as entry_status,
      je.occurred_at,
      je.created_by,
      fe.id as financial_event_id,
      fe.immutable_reference,
      fe.event_type::text as event_type,
      fe.metadata as event_metadata
    from public.journal_entries je
    join public.financial_events fe
      on fe.id = je.financial_event_id
     and fe.organization_id = target_org
    cross join scope_flags sf
    where je.organization_id = target_org
      and je.occurred_at >= coalesce(from_value::timestamptz, '-infinity'::timestamptz)
      and je.occurred_at < coalesce((to_value + 1)::timestamptz, 'infinity'::timestamptz)
      and (branch_value is null or je.branch_id = branch_value)
      and (
        (je.branch_id is null and not sf.branch_scoped)
        or (je.branch_id is not null and public.has_capability(
          target_org,
          capability_value,
          jsonb_build_object('branch_id', je.branch_id)
        ))
      )
      and (
        (not sf.cashbox_scoped and cashbox_value is null)
        or exists (
          select 1
          from public.journal_lines access_line
          join public.ledger_accounts access_account on access_account.id = access_line.account_id
          cross join lateral (
            select coalesce(
              access_account.cashbox_id,
              case
                when fe.metadata->>'cashbox_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                  then (fe.metadata->>'cashbox_id')::uuid
                else null
              end
            ) as resolved_cashbox_id
          ) resolved
          where access_line.journal_entry_id = je.id
            and resolved.resolved_cashbox_id is not null
            and (cashbox_value is null or resolved.resolved_cashbox_id = cashbox_value)
            and public.has_capability(
              target_org,
              capability_value,
              jsonb_strip_nulls(jsonb_build_object(
                'branch_id', je.branch_id,
                'cashbox_id', resolved.resolved_cashbox_id
              ))
            )
        )
      )
  )
  select
    jl.id,
    se.id,
    se.branch_id,
    se.entry_status,
    se.occurred_at,
    se.created_by,
    se.financial_event_id,
    se.immutable_reference,
    se.event_type,
    se.event_metadata,
    jl.account_id,
    la.code,
    la.name,
    la.category,
    jl.currency_code,
    jl.native_debit,
    jl.native_credit,
    jl.base_debit,
    jl.base_credit
  from scoped_entries se
  join public.journal_lines jl on jl.journal_entry_id = se.id
  join public.ledger_accounts la on la.id = jl.account_id and la.organization_id = target_org;
$$;

revoke all on function public.get_scoped_report_ledger_lines_v6(uuid, date, date, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.get_scoped_named_financial_report_v6(
  target_org uuid,
  report_code text,
  from_date date default null,
  to_date date default null,
  branch_scope uuid default null,
  cashbox_scope uuid default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  result jsonb;
  code_value text := lower(trim(coalesce(report_code, '')));
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not public.is_platform_user_active() then
    raise exception 'PLATFORM_ACCOUNT_INACTIVE';
  end if;
  if not public.has_capability(
    target_org,
    'financial.report',
    jsonb_strip_nulls(jsonb_build_object('branch_id', branch_scope, 'cashbox_id', cashbox_scope))
  ) then
    raise exception 'CAPABILITY_REQUIRED:financial.report';
  end if;
  if branch_scope is not null and not exists (
    select 1 from public.branches b where b.id = branch_scope and b.organization_id = target_org
  ) then raise exception 'REPORT_SCOPE_INVALID:branch'; end if;
  if cashbox_scope is not null and not exists (
    select 1 from public.cashboxes cb
    where cb.id = cashbox_scope
      and cb.organization_id = target_org
      and (branch_scope is null or cb.branch_id = branch_scope)
  ) then raise exception 'REPORT_SCOPE_INVALID:cashbox'; end if;

  if code_value in ('trial_balance', 'balance_sheet', 'profit_loss') then
    select coalesce(jsonb_agg(row_data order by row_data->>'label'), '[]'::jsonb) into result
    from (
      select jsonb_build_object(
        'reference', sl.account_code,
        'date', to_char(coalesce(to_date, current_date), 'YYYY-MM-DD'),
        'label', sl.account_name,
        'detail', sl.account_category,
        'amount', case
          when code_value = 'profit_loss' then sum(sl.base_credit - sl.base_debit)
          when sl.account_category in ('asset', 'expense') then sum(sl.base_debit - sl.base_credit)
          else sum(sl.base_credit - sl.base_debit)
        end,
        'currency', coalesce(max(o.base_currency_code), 'AFN'),
        'status', 'posted'
      ) row_data
      from public.get_scoped_report_ledger_lines_v6(target_org, from_date, to_date, branch_scope, cashbox_scope) sl
      join public.organizations o on o.id = target_org
      where sl.entry_status = 'posted'
        and (code_value <> 'profit_loss' or sl.account_category in ('income', 'expense'))
        and (code_value <> 'balance_sheet' or sl.account_category in ('asset', 'liability', 'equity'))
      group by sl.account_code, sl.account_name, sl.account_category
    ) rows;
  elsif code_value = 'branch_balance' then
    select coalesce(jsonb_agg(row_data order by row_data->>'label', row_data->>'currency'), '[]'::jsonb) into result
    from (
      select jsonb_build_object(
        'reference', b.id,
        'date', to_char(coalesce(to_date, current_date), 'YYYY-MM-DD'),
        'label', b.name,
        'detail', 'branch_balance',
        'amount', sum(sl.native_debit - sl.native_credit),
        'currency', sl.currency_code,
        'status', 'posted'
      ) row_data
      from public.get_scoped_report_ledger_lines_v6(target_org, null, to_date, branch_scope, cashbox_scope) sl
      join public.branches b on b.id = sl.branch_id and b.organization_id = target_org
      where sl.entry_status = 'posted' and sl.account_category = 'asset'
      group by b.id, b.name, sl.currency_code
    ) rows;
  elsif code_value = 'currency_position' then
    select coalesce(jsonb_agg(row_data order by row_data->>'currency'), '[]'::jsonb) into result
    from (
      select jsonb_build_object(
        'reference', sl.currency_code,
        'date', to_char(coalesce(to_date, current_date), 'YYYY-MM-DD'),
        'label', sl.currency_code,
        'detail', 'carrying_value',
        'amount', sum(sl.native_debit - sl.native_credit),
        'secondary_amount', sum(sl.base_debit - sl.base_credit),
        'currency', sl.currency_code,
        'status', 'posted'
      ) row_data
      from public.get_scoped_report_ledger_lines_v6(target_org, null, to_date, branch_scope, cashbox_scope) sl
      where sl.entry_status = 'posted' and sl.account_category = 'asset'
      group by sl.currency_code
    ) rows;
  elsif code_value in ('receivables', 'payables', 'aging', 'counterparty_statement') then
    if cashbox_scope is not null then raise exception 'REPORT_SCOPE_UNSUPPORTED:cashbox'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', d.id,
      'date', to_char(d.created_at, 'YYYY-MM-DD'),
      'label', cp.display_name,
      'detail', case when d.due_at is null then d.direction when d.due_at < now() then 'overdue' else d.direction end,
      'amount', d.outstanding_amount,
      'secondary_amount', d.original_amount,
      'currency', d.currency_code,
      'status', case when d.outstanding_amount = 0 then 'settled' else 'open' end
    ) order by cp.display_name, d.created_at desc), '[]'::jsonb) into result
    from public.debts d
    join public.counterparties cp on cp.id = d.counterparty_id and cp.organization_id = target_org
    where d.organization_id = target_org
      and (branch_scope is null or d.branch_id = branch_scope)
      and public.has_capability(target_org, 'financial.report', jsonb_build_object('branch_id', d.branch_id))
      and (from_date is null or d.created_at >= from_date::timestamptz)
      and (to_date is null or d.created_at < (to_date + 1)::timestamptz)
      and (code_value in ('aging', 'counterparty_statement') or d.direction = case when code_value = 'receivables' then 'receivable' else 'payable' end)
      and (code_value <> 'aging' or (d.outstanding_amount > 0 and d.due_at < now()));
  elsif code_value in ('fx_profit', 'commission', 'expenses') then
    select coalesce(jsonb_agg(row_data order by row_data->>'label'), '[]'::jsonb) into result
    from (
      select jsonb_build_object(
        'reference', sl.account_code,
        'date', to_char(coalesce(to_date, current_date), 'YYYY-MM-DD'),
        'label', sl.account_name,
        'detail', sl.account_category,
        'amount', case when sl.account_category = 'expense'
          then sum(sl.base_debit - sl.base_credit)
          else sum(sl.base_credit - sl.base_debit)
        end,
        'currency', coalesce(max(o.base_currency_code), 'AFN'),
        'status', 'posted'
      ) row_data
      from public.get_scoped_report_ledger_lines_v6(target_org, from_date, to_date, branch_scope, cashbox_scope) sl
      join public.organizations o on o.id = target_org
      where sl.entry_status = 'posted'
        and ((code_value = 'fx_profit' and sl.account_code in ('income:realized-fx-gain', 'expense:realized-fx-loss'))
          or (code_value = 'commission' and sl.account_code like 'income:commission:%')
          or (code_value = 'expenses' and sl.account_category = 'expense'))
      group by sl.account_code, sl.account_name, sl.account_category
    ) rows;
  elsif code_value = 'reconciliation' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', c.id,
      'date', c.business_date,
      'label', cb.name,
      'detail', coalesce(c.variance_reason, ''),
      'amount', coalesce((select sum(abs(l.variance_amount)) from public.cashbox_close_lines l where l.close_id = c.id), 0),
      'currency', 'MIXED',
      'status', c.status
    ) order by c.business_date desc), '[]'::jsonb) into result
    from public.cashbox_closes c
    join public.cashboxes cb on cb.id = c.cashbox_id and cb.organization_id = target_org
    where c.organization_id = target_org
      and (branch_scope is null or c.branch_id = branch_scope)
      and (cashbox_scope is null or c.cashbox_id = cashbox_scope)
      and public.has_capability(target_org, 'financial.report', jsonb_build_object('branch_id', c.branch_id, 'cashbox_id', c.cashbox_id))
      and (from_date is null or c.business_date >= from_date)
      and (to_date is null or c.business_date <= to_date);
  elsif code_value = 'rate_history' then
    if cashbox_scope is not null then raise exception 'REPORT_SCOPE_UNSUPPORTED:cashbox'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', r.id,
      'date', r.effective_from,
      'label', concat(r.from_currency, ' / ', r.to_currency),
      'detail', rg.name,
      'amount', r.buy_rate,
      'secondary_amount', r.sell_rate,
      'currency', r.to_currency,
      'status', case when r.active then 'active' else 'historical' end
    ) order by r.effective_from desc), '[]'::jsonb) into result
    from public.rate_board_entries r
    join public.rate_groups rg on rg.id = r.rate_group_id and rg.organization_id = target_org
    where r.organization_id = target_org
      and (branch_scope is null or r.branch_id is null or r.branch_id = branch_scope)
      and (r.branch_id is null or public.has_capability(target_org, 'financial.report', jsonb_build_object('branch_id', r.branch_id)))
      and (from_date is null or r.effective_from >= from_date::timestamptz)
      and (to_date is null or r.effective_from < (to_date + 1)::timestamptz);
  elsif code_value = 'employee_activity' then
    select coalesce(jsonb_agg(row_data order by row_data->>'amount' desc), '[]'::jsonb) into result
    from (
      select jsonb_build_object(
        'reference', p.id,
        'date', to_char(max(sl.occurred_at), 'YYYY-MM-DD'),
        'label', coalesce(p.display_name, p.id::text),
        'detail', 'financial_actions',
        'amount', count(distinct sl.financial_event_id),
        'currency', 'COUNT',
        'status', 'recorded'
      ) row_data
      from public.get_scoped_report_ledger_lines_v6(target_org, from_date, to_date, branch_scope, cashbox_scope) sl
      left join public.profiles p on p.id = sl.created_by
      group by p.id, p.display_name
    ) rows;
  elsif code_value = 'security_activity' then
    if branch_scope is not null or cashbox_scope is not null then raise exception 'REPORT_SCOPE_UNSUPPORTED:security_activity'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', s.id,
      'date', s.created_at,
      'label', s.event_type,
      'detail', coalesce(s.target_user_id::text, s.target_device_id::text, ''),
      'amount', 0,
      'currency', '',
      'status', 'recorded'
    ) order by s.created_at desc), '[]'::jsonb) into result
    from public.security_audit_events s
    where s.organization_id = target_org
      and (from_date is null or s.created_at >= from_date::timestamptz)
      and (to_date is null or s.created_at < (to_date + 1)::timestamptz);
  else
    select coalesce(jsonb_agg(row_data order by row_data->>'date' desc), '[]'::jsonb) into result
    from (
      select distinct on (sl.financial_event_id) jsonb_build_object(
        'reference', sl.immutable_reference,
        'date', sl.occurred_at,
        'label', sl.event_type,
        'detail', coalesce(je.memo, ''),
        'amount', coalesce(sl.event_metadata->>'amount', sl.event_metadata->>'bought_amount', sl.event_metadata->>'sold_amount', '0'),
        'currency', coalesce(sl.event_metadata->>'currency', sl.event_metadata->>'bought_currency', sl.event_metadata->>'sold_currency', ''),
        'status', sl.entry_status
      ) row_data
      from public.get_scoped_report_ledger_lines_v6(target_org, from_date, to_date, branch_scope, cashbox_scope) sl
      join public.journal_entries je on je.id = sl.journal_entry_id
      where code_value in ('daily_transactions', 'transaction_journal')
        or (code_value = 'owner_capital' and sl.event_type in ('owner_investment', 'owner_withdrawal', 'opening_balance'))
        or (code_value = 'reversals' and (sl.entry_status = 'reversed' or je.reversal_of is not null))
        or (code_value = 'cash_movement' and sl.event_type in ('transfer_cash', 'bank_deposit', 'bank_withdrawal', 'receive_money', 'pay_money'))
        or (code_value = 'hawala' and sl.event_type like 'hawala_%')
      order by sl.financial_event_id, sl.occurred_at desc
    ) rows;
  end if;

  return coalesce(result, '[]'::jsonb);
end;
$$;

revoke all on function public.get_scoped_named_financial_report_v6(uuid, text, date, date, uuid, uuid) from public, anon, authenticated;

-- Preserve the historical RPC name for callers, but make its default result
-- scope-aware as well. The snapshot RPC below can additionally request one
-- exact branch/cashbox.
create or replace function public.get_named_financial_report(
  target_org uuid,
  report_code text,
  from_date date default null,
  to_date date default null
)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select public.get_scoped_named_financial_report_v6(
    target_org,
    report_code,
    from_date,
    to_date,
    null,
    null
  );
$$;

revoke all on function public.get_named_financial_report(uuid, text, date, date) from public, anon;
grant execute on function public.get_named_financial_report(uuid, text, date, date) to authenticated;

-- Canonical scope helpers are SECURITY DEFINER so RLS policies can evaluate
-- membership assignments without depending on permissive membership/table RLS.
create or replace function public.can_access_branch_v6(
  target_org uuid,
  target_branch uuid,
  capability_value text
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  member_id uuid;
  is_scoped boolean;
begin
  select m.id into member_id
  from public.organization_memberships m
  where m.organization_id = target_org
    and m.user_id = (select auth.uid())
    and m.active
    and public.is_platform_user_active()
  limit 1;
  if member_id is null then return false; end if;

  select
    exists(select 1 from public.organization_branch_access ba where ba.membership_id = member_id)
    or exists(
      select 1 from public.membership_capability_overrides mco
      where mco.membership_id = member_id
        and mco.capability_code = capability_value
        and cardinality(mco.branch_ids) > 0
    )
  into is_scoped;

  if target_branch is null and is_scoped then return false; end if;
  return public.has_capability(
    target_org,
    capability_value,
    jsonb_strip_nulls(jsonb_build_object('branch_id', target_branch))
  );
end;
$$;

create or replace function public.can_access_cashbox_v6(
  target_org uuid,
  target_cashbox uuid,
  capability_value text
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  member_id uuid;
  is_scoped boolean;
begin
  select m.id into member_id
  from public.organization_memberships m
  where m.organization_id = target_org
    and m.user_id = (select auth.uid())
    and m.active
    and public.is_platform_user_active()
  limit 1;
  if member_id is null then return false; end if;

  select
    exists(select 1 from public.organization_cashbox_access ca where ca.membership_id = member_id)
    or exists(
      select 1 from public.membership_capability_overrides mco
      where mco.membership_id = member_id
        and mco.capability_code = capability_value
        and cardinality(mco.cashbox_ids) > 0
    )
  into is_scoped;

  if target_cashbox is null and is_scoped then return false; end if;
  return public.has_capability(
    target_org,
    capability_value,
    jsonb_strip_nulls(jsonb_build_object('cashbox_id', target_cashbox))
  );
end;
$$;

create or replace function public.can_read_financial_event_v6(
  target_event uuid,
  target_org uuid,
  target_branch uuid,
  event_metadata jsonb
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  metadata_cashbox uuid;
  member_id uuid;
  is_cashbox_scoped boolean;
begin
  if not public.can_access_branch_v6(target_org, target_branch, 'transactions.view') then return false; end if;

  select m.id into member_id
  from public.organization_memberships m
  where m.organization_id = target_org
    and m.user_id = (select auth.uid())
    and m.active
  limit 1;
  if member_id is null then return false; end if;

  select
    exists(select 1 from public.organization_cashbox_access ca where ca.membership_id = member_id)
    or exists(
      select 1 from public.membership_capability_overrides mco
      where mco.membership_id = member_id
        and mco.capability_code = 'transactions.view'
        and cardinality(mco.cashbox_ids) > 0
    )
  into is_cashbox_scoped;
  if not is_cashbox_scoped then return true; end if;

  if event_metadata->>'cashbox_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    metadata_cashbox := (event_metadata->>'cashbox_id')::uuid;
    if public.can_access_cashbox_v6(target_org, metadata_cashbox, 'transactions.view') then return true; end if;
  end if;

  return exists (
    select 1
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id = je.id
    join public.ledger_accounts la on la.id = jl.account_id and la.organization_id = target_org
    where je.financial_event_id = target_event
      and je.organization_id = target_org
      and la.cashbox_id is not null
      and public.can_access_cashbox_v6(target_org, la.cashbox_id, 'transactions.view')
  );
end;
$$;

revoke all on function public.can_access_branch_v6(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.can_access_cashbox_v6(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.can_read_financial_event_v6(uuid, uuid, uuid, jsonb) from public, anon, authenticated;

drop policy if exists tenant_read on public.financial_events;
create policy financial_events_scoped_read_v6 on public.financial_events
  for select to authenticated
  using (public.can_read_financial_event_v6(id, organization_id, branch_id, metadata));

drop policy if exists tenant_read on public.journal_entries;
create policy journal_entries_scoped_read_v6 on public.journal_entries
  for select to authenticated
  using (exists (
    select 1 from public.financial_events fe
    where fe.id = journal_entries.financial_event_id
      and fe.organization_id = journal_entries.organization_id
      and public.can_read_financial_event_v6(fe.id, fe.organization_id, fe.branch_id, fe.metadata)
  ));

drop policy if exists tenant_read on public.journal_lines;
create policy journal_lines_scoped_read_v6 on public.journal_lines
  for select to authenticated
  using (exists (
    select 1
    from public.journal_entries je
    join public.financial_events fe on fe.id = je.financial_event_id
    where je.id = journal_lines.journal_entry_id
      and je.organization_id = journal_lines.organization_id
      and public.can_read_financial_event_v6(fe.id, fe.organization_id, fe.branch_id, fe.metadata)
  ));

drop policy if exists tenant_read on public.ledger_accounts;
create policy ledger_accounts_scoped_read_v6 on public.ledger_accounts
  for select to authenticated
  using (
    (
      public.can_access_cashbox_v6(ledger_accounts.organization_id, ledger_accounts.cashbox_id, 'financial.overview')
      or public.can_access_cashbox_v6(ledger_accounts.organization_id, ledger_accounts.cashbox_id, 'financial.report')
    )
    and (
      ledger_accounts.cashbox_id is null
      or exists (
        select 1 from public.cashboxes cb
        where cb.id = ledger_accounts.cashbox_id
          and cb.organization_id = ledger_accounts.organization_id
          and (
            public.can_access_branch_v6(ledger_accounts.organization_id, cb.branch_id, 'financial.overview')
            or public.can_access_branch_v6(ledger_accounts.organization_id, cb.branch_id, 'financial.report')
          )
      )
    )
  );

drop policy if exists receipts_org_read on public.receipts;
create policy receipts_scoped_read_v6 on public.receipts
  for select to authenticated
  using (exists (
    select 1
    from public.journal_entries je
    join public.financial_events fe on fe.id = je.financial_event_id
    where je.id = receipts.journal_entry_id
      and je.organization_id = receipts.organization_id
      and public.can_read_financial_event_v6(fe.id, fe.organization_id, fe.branch_id, fe.metadata)
  ));

alter table public.counterparties
  add column if not exists branch_id uuid references public.branches(id) on delete restrict;

update public.counterparties cp
set branch_id = coalesce(
  (select d.branch_id from public.debts d where d.counterparty_id = cp.id order by d.created_at limit 1),
  (select fe.branch_id from public.financial_events fe where fe.counterparty_id = cp.id and fe.branch_id is not null order by fe.occurred_at limit 1),
  (select ht.branch_id from public.hawala_transfers ht where ht.sender_id = cp.id order by ht.created_at limit 1)
)
where cp.branch_id is null;

create index if not exists counterparties_org_branch_name_idx
  on public.counterparties (organization_id, branch_id, display_name);

drop policy if exists counterparties_org_read on public.counterparties;
create policy counterparties_scoped_read_v6 on public.counterparties
  for select to authenticated
  using (
    public.can_access_branch_v6(organization_id, branch_id, 'customers.manage')
    or public.can_access_branch_v6(organization_id, branch_id, 'transactions.view')
    or public.can_access_branch_v6(organization_id, branch_id, 'compliance.review')
  );

drop policy if exists contacts_member_read on public.counterparty_contacts;
create policy counterparty_contacts_scoped_read_v6 on public.counterparty_contacts
  for select to authenticated
  using (exists (select 1 from public.counterparties cp where cp.id = counterparty_id));

drop policy if exists addresses_member_read on public.counterparty_addresses;
create policy counterparty_addresses_scoped_read_v6 on public.counterparty_addresses
  for select to authenticated
  using (exists (select 1 from public.counterparties cp where cp.id = counterparty_id));

drop policy if exists tags_member_read on public.counterparty_tags;
create policy counterparty_tags_scoped_read_v6 on public.counterparty_tags
  for select to authenticated
  using (exists (select 1 from public.counterparties cp where cp.id = counterparty_id));

drop policy if exists credit_limits_member_read on public.counterparty_credit_limits;
create policy counterparty_credit_limits_scoped_read_v6 on public.counterparty_credit_limits
  for select to authenticated
  using (exists (select 1 from public.counterparties cp where cp.id = counterparty_id));

drop policy if exists counterparty_docs_member_read on public.counterparty_documents;
create policy counterparty_documents_capability_read_v6 on public.counterparty_documents
  for select to authenticated
  using (
    public.has_capability(organization_id, 'documents.list', '{}'::jsonb)
    and exists (select 1 from public.counterparties cp where cp.id = counterparty_id)
  );

create or replace function public.list_counterparties_v6(target_org uuid)
returns table (
  id uuid,
  branch_id uuid,
  display_name text,
  counterparty_type text,
  risk_status text,
  phone text,
  notes text
)
language sql
security definer
stable
set search_path = ''
as $$
  select cp.id, cp.branch_id, cp.display_name, cp.counterparty_type, cp.risk_status, cp.phone, cp.notes
  from public.counterparties cp
  where cp.organization_id = target_org
    and cp.risk_status <> 'blocked'
    and (
      public.can_access_branch_v6(target_org, cp.branch_id, 'customers.manage')
      or public.can_access_branch_v6(target_org, cp.branch_id, 'transactions.view')
      or public.can_access_branch_v6(target_org, cp.branch_id, 'compliance.review')
    )
  order by cp.display_name, cp.id;
$$;

create or replace function public.create_counterparty_v6(command jsonb)
returns public.counterparties
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid := nullif(command->>'organization_id', '')::uuid;
  branch_value uuid := nullif(command->>'branch_id', '')::uuid;
  normalized_name text := trim(coalesce(command->>'display_name', ''));
  type_value text := coalesce(command->>'counterparty_type', 'customer');
  result public.counterparties;
begin
  if branch_value is null or not exists (
    select 1 from public.branches b where b.id = branch_value and b.organization_id = target_org and b.active
  ) then raise exception 'BRANCH_REQUIRED: Choose an active assigned branch'; end if;
  if not public.can_access_branch_v6(target_org, branch_value, 'customers.manage') then
    raise exception 'CAPABILITY_REQUIRED:customers.manage';
  end if;
  if length(normalized_name) < 2 or length(normalized_name) > 120 then
    raise exception 'CUSTOMER_NAME_INVALID';
  end if;
  if type_value not in ('walk_in', 'customer', 'saraf', 'hawala_partner', 'supplier', 'employee', 'other') then
    raise exception 'CUSTOMER_TYPE_INVALID';
  end if;
  insert into public.counterparties (
    organization_id, branch_id, display_name, phone, counterparty_type, notes
  ) values (
    target_org,
    branch_value,
    normalized_name,
    nullif(trim(command->>'phone'), ''),
    type_value,
    nullif(trim(command->>'notes'), '')
  ) returning * into result;
  return result;
end;
$$;

create or replace function public.get_counterparty_detail_v6(target_org uuid, target_counterparty uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  cp public.counterparties;
begin
  select * into cp from public.counterparties
  where id = target_counterparty and organization_id = target_org;
  if cp.id is null then return null; end if;
  if not (
    public.can_access_branch_v6(target_org, cp.branch_id, 'customers.manage')
    or public.can_access_branch_v6(target_org, cp.branch_id, 'transactions.view')
    or public.can_access_branch_v6(target_org, cp.branch_id, 'compliance.review')
  ) then raise exception 'CAPABILITY_REQUIRED:customer.read'; end if;
  return to_jsonb(cp);
end;
$$;

revoke all on function public.list_counterparties_v6(uuid) from public, anon;
revoke all on function public.create_counterparty_v6(jsonb) from public, anon;
revoke all on function public.get_counterparty_detail_v6(uuid, uuid) from public, anon;
grant execute on function public.list_counterparties_v6(uuid) to authenticated;
grant execute on function public.create_counterparty_v6(jsonb) to authenticated;
grant execute on function public.get_counterparty_detail_v6(uuid, uuid) to authenticated;

create or replace function public.get_transaction_history_page(
  target_org uuid,
  page_size integer default 100,
  page_offset integer default 0
)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  with unique_entries as materialized (
    select distinct on (sl.journal_entry_id)
      sl.journal_entry_id,
      sl.branch_id,
      sl.entry_status,
      sl.occurred_at,
      sl.created_by,
      sl.financial_event_id,
      sl.immutable_reference,
      sl.event_type,
      sl.event_metadata
    from public.get_scoped_report_ledger_lines_v6(target_org, null, null, null, null, 'transactions.view') sl
    order by sl.journal_entry_id, sl.account_id
  ), page_rows as (
    select ue.occurred_at, ue.journal_entry_id, jsonb_build_object(
      'id', ue.journal_entry_id,
      'status', ue.entry_status,
      'memo', je.memo,
      'occurred_at', ue.occurred_at,
      'branch_id', ue.branch_id,
      'event_type', ue.event_type,
      'immutable_reference', ue.immutable_reference,
      'source_account_name', ue.event_metadata->>'source_account_name',
      'destination_account_name', ue.event_metadata->>'destination_account_name',
      'source_account_kind', ue.event_metadata->>'source_account_kind',
      'destination_account_kind', ue.event_metadata->>'destination_account_kind',
      'cashbox_name', cb.name,
      'counterparty_name', cp.display_name,
      'employee_name', coalesce(nullif(trim(pr.display_name), ''), 'Team member'),
      'given_amount', ue.event_metadata->>'sold_amount',
      'given_currency', ue.event_metadata->>'sold_currency',
      'received_amount', ue.event_metadata->>'bought_amount',
      'received_currency', ue.event_metadata->>'bought_currency',
      'currency_code', coalesce(ue.event_metadata->>'currency', ue.event_metadata->>'sold_currency'),
      'amount', coalesce(ue.event_metadata->>'amount', ue.event_metadata->>'sold_amount')
    ) row_data
    from unique_entries ue
    join public.journal_entries je on je.id = ue.journal_entry_id
    left join public.cashboxes cb on cb.id = case
      when ue.event_metadata->>'cashbox_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (ue.event_metadata->>'cashbox_id')::uuid else null end
    left join public.counterparties cp on cp.id = coalesce(
      (select fe.counterparty_id from public.financial_events fe where fe.id = ue.financial_event_id),
      case
        when ue.event_metadata->>'counterparty_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (ue.event_metadata->>'counterparty_id')::uuid else null end
    ) and cp.organization_id = target_org
    left join public.profiles pr on pr.id = ue.created_by
    order by ue.occurred_at desc, ue.journal_entry_id desc
    limit least(greatest(page_size, 1), 1000)
    offset least(greatest(page_offset, 0), 1000000)
  )
  select coalesce(jsonb_agg(page_rows.row_data order by page_rows.occurred_at desc, page_rows.journal_entry_id desc), '[]'::jsonb)
  from page_rows;
$$;

create or replace function public.get_transaction_history(target_org uuid, page_size integer default 50)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select public.get_transaction_history_page(target_org, least(greatest(page_size, 1), 100), 0);
$$;

create or replace function public.get_transaction_detail(target_org uuid, target_entry uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  result jsonb;
  event_row public.financial_events;
  entry_row public.journal_entries;
  cashbox_id_value uuid;
begin
  select je.* into entry_row
  from public.journal_entries je
  where je.id = target_entry and je.organization_id = target_org;
  if entry_row.id is null then return null; end if;
  select fe.* into event_row
  from public.financial_events fe
  where fe.id = entry_row.financial_event_id;
  if not public.can_read_financial_event_v6(event_row.id, target_org, event_row.branch_id, event_row.metadata) then
    raise exception 'CAPABILITY_REQUIRED:transactions.view';
  end if;
  cashbox_id_value := case
    when event_row.metadata->>'cashbox_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (event_row.metadata->>'cashbox_id')::uuid else null end;
  select jsonb_build_object(
    'id', entry_row.id,
    'status', entry_row.status,
    'memo', entry_row.memo,
    'occurred_at', entry_row.occurred_at,
    'branch_id', entry_row.branch_id,
    'event_type', event_row.event_type,
    'immutable_reference', event_row.immutable_reference,
    'source_account_name', event_row.metadata->>'source_account_name',
    'destination_account_name', event_row.metadata->>'destination_account_name',
    'source_account_kind', event_row.metadata->>'source_account_kind',
    'destination_account_kind', event_row.metadata->>'destination_account_kind',
    'cashbox_name', cb.name,
    'counterparty_name', cp.display_name,
    'employee_name', coalesce(nullif(trim(pr.display_name), ''), 'Team member'),
    'given_amount', event_row.metadata->>'sold_amount',
    'given_currency', event_row.metadata->>'sold_currency',
    'received_amount', event_row.metadata->>'bought_amount',
    'received_currency', event_row.metadata->>'bought_currency',
    'currency_code', coalesce(event_row.metadata->>'currency', event_row.metadata->>'sold_currency'),
    'amount', coalesce(event_row.metadata->>'amount', event_row.metadata->>'sold_amount')
  ) into result
  from (select 1) seed
  left join public.cashboxes cb on cb.id = cashbox_id_value and cb.organization_id = target_org
  left join public.counterparties cp on cp.id = event_row.counterparty_id and cp.organization_id = target_org
  left join public.profiles pr on pr.id = entry_row.created_by;
  return result;
end;
$$;

create or replace function public.list_hawala_transfers_v6(target_org uuid)
returns setof public.hawala_transfers
language sql
security definer
stable
set search_path = ''
as $$
  select ht.*
  from public.hawala_transfers ht
  where ht.organization_id = target_org
    and public.can_access_branch_v6(target_org, ht.branch_id, 'hawala.view')
  order by ht.created_at desc, ht.id desc;
$$;

create or replace function public.get_receipt_for_journal_v6(target_org uuid, target_entry uuid)
returns public.receipts
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  event_row public.financial_events;
  result public.receipts;
begin
  select fe.* into event_row
  from public.journal_entries je
  join public.financial_events fe on fe.id = je.financial_event_id
  where je.id = target_entry and je.organization_id = target_org;
  if event_row.id is null then return null; end if;
  if not public.can_read_financial_event_v6(event_row.id, target_org, event_row.branch_id, event_row.metadata) then
    raise exception 'CAPABILITY_REQUIRED:transactions.view';
  end if;
  select r.* into result from public.receipts r
  where r.organization_id = target_org and r.journal_entry_id = target_entry;
  return result;
end;
$$;

create or replace function public.get_cashbox_balances_v6(target_org uuid, target_cashbox uuid)
returns table (currency_code text, expected_amount numeric)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare branch_value uuid;
begin
  select cb.branch_id into branch_value from public.cashboxes cb
  where cb.id = target_cashbox and cb.organization_id = target_org and cb.active;
  if branch_value is null
    or not public.can_access_branch_v6(target_org, branch_value, 'transactions.view')
    or not public.can_access_cashbox_v6(target_org, target_cashbox, 'transactions.view') then
    raise exception 'CAPABILITY_REQUIRED:cashbox.read';
  end if;
  return query
  select jl.currency_code, sum(jl.native_debit - jl.native_credit)
  from public.journal_lines jl
  join public.ledger_accounts la on la.id = jl.account_id and la.organization_id = target_org
  join public.journal_entries je on je.id = jl.journal_entry_id and je.organization_id = target_org
  join public.financial_events fe on fe.id = je.financial_event_id
  where la.cashbox_id = target_cashbox
    and je.status = 'posted'
    and public.can_read_financial_event_v6(fe.id, target_org, fe.branch_id, fe.metadata)
  group by jl.currency_code
  order by jl.currency_code;
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
language sql
security definer
stable
set search_path = ''
as $$
  select
    sl.journal_line_id,
    sl.journal_entry_id,
    sl.currency_code,
    sl.native_debit,
    sl.native_credit,
    sl.occurred_at,
    je.memo,
    coalesce(cb.id::text, sl.account_id::text),
    case
      when cb.id is not null then 'cashbox'
      when sl.account_code like 'bank:%' then 'bank'
      when sl.account_code like 'location:%' then 'location'
      else 'account'
    end,
    coalesce(
      cb.name,
      case
        when sl.account_code like 'bank:%' then regexp_replace(regexp_replace(sl.account_code, '^bank:', ''), ':[A-Z]{3}$', '')
        when sl.account_code like 'location:%' then regexp_replace(regexp_replace(sl.account_code, '^location:', ''), ':[A-Z]{3}$', '')
        else sl.account_name
      end
    )
  from public.get_scoped_report_ledger_lines_v6(target_org, null, null, null, null, 'financial.overview') sl
  join public.journal_entries je on je.id = sl.journal_entry_id
  left join public.cashboxes cb on cb.id = coalesce(
    (select la.cashbox_id from public.ledger_accounts la where la.id = sl.account_id),
    case
      when sl.event_metadata->>'cashbox_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (sl.event_metadata->>'cashbox_id')::uuid else null end
  ) and cb.organization_id = target_org
  where sl.entry_status = 'posted' and sl.account_category = 'asset'
  order by sl.occurred_at desc, sl.journal_line_id desc
  limit 500;
$$;

create or replace function public.get_current_rates_v6(
  target_org uuid,
  target_branch uuid,
  source_currency text,
  target_currency text
)
returns table (buy_rate numeric, sell_rate numeric, from_currency text, to_currency text)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if target_branch is null or not public.can_access_branch_v6(target_org, target_branch, 'workspace.view') then
    raise exception 'CAPABILITY_REQUIRED:rate.read';
  end if;
  return query
  select r.buy_rate, r.sell_rate, r.from_currency, r.to_currency
  from public.rate_board_entries r
  where r.organization_id = target_org
    and r.from_currency = upper(source_currency)
    and r.to_currency = upper(target_currency)
    and r.active
    and (r.branch_id is null or r.branch_id = target_branch)
  order by (r.branch_id is not null) desc, r.effective_from desc
  limit 1;
end;
$$;

create or replace function public.list_rate_history_v6(target_org uuid)
returns table (
  id uuid,
  from_currency text,
  to_currency text,
  buy_rate numeric,
  sell_rate numeric,
  effective_from timestamptz,
  branch_id uuid,
  group_name text
)
language sql
security definer
stable
set search_path = ''
as $$
  select r.id, r.from_currency, r.to_currency, r.buy_rate, r.sell_rate,
    r.effective_from, r.branch_id, rg.name
  from public.rate_board_entries r
  join public.rate_groups rg on rg.id = r.rate_group_id and rg.organization_id = target_org
  where r.organization_id = target_org
    and (
      r.branch_id is null
      or public.can_access_branch_v6(target_org, r.branch_id, 'rates.manage')
      or public.can_access_branch_v6(target_org, r.branch_id, 'financial.overview')
    )
    and (
      public.has_capability(target_org, 'rates.manage', '{}'::jsonb)
      or public.has_capability(target_org, 'financial.overview', '{}'::jsonb)
    )
  order by r.effective_from desc, r.id desc
  limit 100;
$$;

create or replace function public.get_counterparty_statement_v6(target_org uuid, target_counterparty uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  cp public.counterparties;
  result jsonb;
begin
  select * into cp from public.counterparties
  where id = target_counterparty and organization_id = target_org;
  if cp.id is null then return '[]'::jsonb; end if;
  if not (
    public.can_access_branch_v6(target_org, cp.branch_id, 'transactions.view')
    or public.can_access_branch_v6(target_org, cp.branch_id, 'debt.view')
    or public.can_access_branch_v6(target_org, cp.branch_id, 'hawala.view')
  ) then raise exception 'CAPABILITY_REQUIRED:counterparty.statement'; end if;

  select coalesce(jsonb_agg(rows.row_data order by rows.occurred_at desc, rows.row_id desc), '[]'::jsonb)
  into result
  from (
    select fe.occurred_at, fe.id as row_id, jsonb_build_object(
      'id', fe.id,
      'occurred_at', fe.occurred_at,
      'event_type', fe.event_type,
      'reference', fe.immutable_reference,
      'status', je.status,
      'memo', je.memo,
      'direction', case when fe.metadata->>'direction' in ('receivable', 'payable') then fe.metadata->>'direction' else null end,
      'currency_code', fe.metadata->>'currency',
      'amount', fe.metadata->>'amount'
    ) row_data
    from public.financial_events fe
    join public.journal_entries je on je.financial_event_id = fe.id and je.organization_id = target_org
    where fe.organization_id = target_org
      and coalesce(fe.counterparty_id::text, fe.metadata->>'counterparty_id') = target_counterparty::text
      and public.can_read_financial_event_v6(fe.id, target_org, fe.branch_id, fe.metadata)
    union all
    select d.created_at, d.id, jsonb_build_object(
      'id', d.id,
      'occurred_at', d.created_at,
      'event_type', 'debt_created',
      'reference', coalesce(d.originating_entry_id::text, d.id::text),
      'status', 'posted',
      'memo', d.notes,
      'direction', d.direction,
      'currency_code', d.currency_code,
      'amount', d.original_amount
    )
    from public.debts d
    where d.organization_id = target_org
      and d.counterparty_id = target_counterparty
      and public.can_access_branch_v6(target_org, d.branch_id, 'debt.view')
    union all
    select s.created_at, s.id, jsonb_build_object(
      'id', s.id,
      'occurred_at', s.created_at,
      'event_type', 'settlement',
      'reference', coalesce(s.journal_entry_id::text, s.id::text),
      'status', 'posted',
      'memo', null,
      'direction', s.direction,
      'currency_code', s.currency_code,
      'amount', s.amount
    )
    from public.settlements s
    join public.debts d on d.id = s.debt_id and d.organization_id = target_org
    where s.organization_id = target_org
      and s.counterparty_id = target_counterparty
      and public.can_access_branch_v6(target_org, d.branch_id, 'debt.view')
  ) rows;
  return result;
end;
$$;

revoke all on function public.get_transaction_history(uuid, integer) from public, anon;
revoke all on function public.get_transaction_history_page(uuid, integer, integer) from public, anon;
revoke all on function public.get_transaction_detail(uuid, uuid) from public, anon;
revoke all on function public.list_hawala_transfers_v6(uuid) from public, anon;
revoke all on function public.get_receipt_for_journal_v6(uuid, uuid) from public, anon;
revoke all on function public.get_cashbox_balances_v6(uuid, uuid) from public, anon;
revoke all on function public.get_money_location_evidence(uuid) from public, anon;
revoke all on function public.get_current_rates_v6(uuid, uuid, text, text) from public, anon;
revoke all on function public.list_rate_history_v6(uuid) from public, anon;
revoke all on function public.get_counterparty_statement_v6(uuid, uuid) from public, anon;
grant execute on function public.get_transaction_history(uuid, integer) to authenticated;
grant execute on function public.get_transaction_history_page(uuid, integer, integer) to authenticated;
grant execute on function public.get_transaction_detail(uuid, uuid) to authenticated;
grant execute on function public.list_hawala_transfers_v6(uuid) to authenticated;
grant execute on function public.get_receipt_for_journal_v6(uuid, uuid) to authenticated;
grant execute on function public.get_cashbox_balances_v6(uuid, uuid) to authenticated;
grant execute on function public.get_money_location_evidence(uuid) to authenticated;
grant execute on function public.get_current_rates_v6(uuid, uuid, text, text) to authenticated;
grant execute on function public.list_rate_history_v6(uuid) to authenticated;
grant execute on function public.get_counterparty_statement_v6(uuid, uuid) to authenticated;

-- Raw accounting/subledger tables are not browser APIs. Revoking direct SELECT
-- makes every current web read pass through one of the scoped functions above,
-- even if a historical RLS policy was broader than the v6 contract.
revoke select on table
  public.financial_events,
  public.journal_entries,
  public.journal_lines,
  public.ledger_accounts,
  public.receipts,
  public.counterparties,
  public.counterparty_contacts,
  public.counterparty_addresses,
  public.counterparty_tags,
  public.counterparty_credit_limits,
  public.counterparty_documents,
  public.debts,
  public.settlements,
  public.hawala_transfers,
  public.hawala_partners,
  public.hawala_beneficiaries,
  public.hawala_status_events,
  public.hawala_settlements,
  public.fx_trades,
  public.fx_trade_legs,
  public.fees,
  public.bank_movements,
  public.income_events,
  public.owner_capital_events,
  public.reversals,
  public.source_events,
  public.command_idempotency,
  public.cash_transfers,
  public.expenses,
  public.cashbox_closes,
  public.cashbox_close_lines,
  public.cashbox_closures,
  public.cash_counts,
  public.cash_count_lines,
  public.cash_variances,
  public.rate_board_entries,
  public.rate_groups,
  public.fx_inventory_cost_state,
  public.currency_position_snapshots
from anon, authenticated;

revoke all on function public.create_counterparty(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.get_counterparty_detail_v5(uuid, uuid) from public, anon, authenticated;

drop policy if exists report_exports_org_read on public.report_exports;
create policy report_exports_generator_read_v6 on public.report_exports
  for select to authenticated
  using (
    generated_by = (select auth.uid())
    and public.has_capability(organization_id, 'financial.report', filters)
    and public.is_platform_user_active()
  );

create table public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  generated_by uuid not null references auth.users(id),
  report_code text not null,
  filters jsonb not null,
  rows jsonb not null,
  summary jsonb not null,
  snapshot_sha256 text not null,
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  check (jsonb_typeof(filters) = 'object'),
  check (jsonb_typeof(rows) = 'array'),
  check (jsonb_typeof(summary) = 'object')
);

create index report_snapshots_org_generated_idx
  on public.report_snapshots (organization_id, generated_at desc);

alter table public.report_snapshots enable row level security;
revoke all on public.report_snapshots from public, anon, authenticated;
grant select on public.report_snapshots to authenticated;

create policy report_snapshots_capability_read
on public.report_snapshots for select to authenticated
using (
  generated_by = (select auth.uid())
  and public.has_capability(organization_id, 'financial.report', filters)
  and public.is_platform_user_active()
);

drop trigger if exists report_snapshots_immutable on public.report_snapshots;
create trigger report_snapshots_immutable
before update or delete on public.report_snapshots
for each row execute function public.prevent_audit_mutation();

create or replace function public.create_financial_report_snapshot(command jsonb)
returns public.report_snapshots
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid := nullif(command->>'organization_id', '')::uuid;
  actor_id uuid := (select auth.uid());
  code_value text := lower(trim(coalesce(command->>'report_code', '')));
  from_value date := nullif(command->>'from_date', '')::date;
  to_value date := nullif(command->>'to_date', '')::date;
  currency_value text := nullif(upper(trim(command->>'currency')), 'ALL');
  status_value text := nullif(lower(trim(command->>'status')), 'all');
  branch_value uuid := nullif(command->>'branch_id', '')::uuid;
  cashbox_value uuid := nullif(command->>'cashbox_id', '')::uuid;
  scope_value jsonb;
  filter_value jsonb;
  source_rows jsonb;
  filtered_rows jsonb;
  summary_value jsonb;
  hash_value text;
  result public.report_snapshots;
begin
  if actor_id is null or not public.is_platform_user_active() then
    raise exception 'PLATFORM_ACCOUNT_INACTIVE';
  end if;
  if target_org is null or code_value not in (
    'daily_transactions', 'transaction_journal', 'cash_movement', 'branch_balance',
    'currency_position', 'fx_profit', 'commission', 'expenses', 'profit_loss',
    'balance_sheet', 'trial_balance', 'receivables', 'payables', 'aging',
    'counterparty_statement', 'owner_capital', 'employee_activity', 'reversals',
    'reconciliation', 'rate_history', 'security_activity', 'hawala'
  ) then raise exception 'REPORT_FILTER_INVALID'; end if;
  if from_value is not null and to_value is not null and from_value > to_value then
    raise exception 'REPORT_DATE_RANGE_INVALID';
  end if;

  scope_value := jsonb_strip_nulls(jsonb_build_object(
    'branch_id', branch_value,
    'cashbox_id', cashbox_value
  ));
  if not public.has_capability(target_org, 'financial.report', scope_value) then
    raise exception 'CAPABILITY_REQUIRED:financial.report';
  end if;

  source_rows := public.get_scoped_named_financial_report_v6(
    target_org,
    code_value,
    from_value,
    to_value,
    branch_value,
    cashbox_value
  );
  select coalesce(jsonb_agg(item order by item->>'date', item->>'reference'), '[]'::jsonb)
  into filtered_rows
  from jsonb_array_elements(coalesce(source_rows, '[]'::jsonb)) item
  where (currency_value is null or upper(item->>'currency') in (currency_value, 'MIXED', 'COUNT'))
    and (status_value is null or lower(item->>'status') = status_value);

  filter_value := jsonb_strip_nulls(jsonb_build_object(
    'report_code', code_value,
    'from_date', from_value,
    'to_date', to_value,
    'currency', currency_value,
    'status', status_value,
    'branch_id', branch_value,
    'cashbox_id', cashbox_value
  ));

  select jsonb_build_object(
    'row_count', count(*),
    'total_amount', coalesce(sum(case when item->>'amount' ~ '^-?[0-9]+([.][0-9]+)?$' then (item->>'amount')::numeric else 0 end), 0),
    'total_secondary_amount', coalesce(sum(case when item->>'secondary_amount' ~ '^-?[0-9]+([.][0-9]+)?$' then (item->>'secondary_amount')::numeric else 0 end), 0),
    'currency_totals', coalesce((
      select jsonb_object_agg(currency_code, currency_total order by currency_code)
      from (
        select coalesce(nullif(item2->>'currency', ''), 'NONE') currency_code,
          sum(case when item2->>'amount' ~ '^-?[0-9]+([.][0-9]+)?$' then (item2->>'amount')::numeric else 0 end) currency_total
        from jsonb_array_elements(filtered_rows) item2
        group by coalesce(nullif(item2->>'currency', ''), 'NONE')
      ) totals
    ), '{}'::jsonb)
  ) into summary_value
  from jsonb_array_elements(filtered_rows) item;

  hash_value := encode(extensions.digest(
    convert_to(jsonb_build_object('filters', filter_value, 'rows', filtered_rows, 'summary', summary_value)::text, 'UTF8'),
    'sha256'
  ), 'hex');

  insert into public.report_snapshots (
    organization_id, generated_by, report_code, filters, rows, summary, snapshot_sha256
  ) values (
    target_org, actor_id, code_value, filter_value, filtered_rows, summary_value, hash_value
  ) returning * into result;
  return result;
end;
$$;

alter table public.report_exports
  add column if not exists report_snapshot_id uuid references public.report_snapshots(id) on delete restrict,
  add column if not exists snapshot_sha256 text;

create index if not exists report_exports_snapshot_idx
  on public.report_exports (report_snapshot_id);

create or replace function public.record_report_export(command jsonb)
returns public.report_exports
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  actor_id uuid := (select auth.uid());
  snapshot_id_value uuid := nullif(command->>'report_snapshot_id', '')::uuid;
  report_name_value text := nullif(trim(command->>'report_name'), '');
  format_value text := lower(command->>'format');
  snapshot_row public.report_snapshots;
  result public.report_exports;
begin
  if actor_id is null or not public.is_platform_user_active() then raise exception 'PLATFORM_ACCOUNT_INACTIVE'; end if;
  if report_name_value is null or format_value not in ('csv', 'pdf', 'xlsx', 'print') then raise exception 'REPORT_EXPORT_INVALID'; end if;

  select * into snapshot_row from public.report_snapshots
  where id = snapshot_id_value
    and organization_id = org_id
    and generated_by = actor_id
    and expires_at > now();
  if snapshot_row.id is null then raise exception 'REPORT_SNAPSHOT_REQUIRED'; end if;
  if not public.has_capability(org_id, 'financial.report', snapshot_row.filters) then
    raise exception 'CAPABILITY_REQUIRED:financial.report';
  end if;

  insert into public.report_exports (
    organization_id, generated_by, report_name, format, filters, expires_at,
    report_snapshot_id, snapshot_sha256
  ) values (
    org_id, actor_id, report_name_value, format_value, snapshot_row.filters,
    snapshot_row.expires_at, snapshot_row.id, snapshot_row.snapshot_sha256
  ) returning * into result;
  return result;
end;
$$;

create table public.compliance_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  financial_event_id uuid not null unique references public.financial_events(id) deferrable initially deferred,
  rule_set_id uuid references public.compliance_rule_sets(id),
  rule_version text,
  decision text not null check (decision in ('allowed', 'manual_review_approved')),
  reasons text[] not null default '{}',
  evidence jsonb not null,
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default now(),
  check (jsonb_typeof(evidence) = 'object')
);

alter table public.compliance_decisions enable row level security;
revoke all on public.compliance_decisions from public, anon, authenticated;
grant select on public.compliance_decisions to authenticated;

create policy compliance_decisions_reviewer_read
on public.compliance_decisions for select to authenticated
using (
  public.has_capability(organization_id, 'compliance.review', '{}'::jsonb)
  and public.is_platform_user_active()
);

drop trigger if exists compliance_decisions_immutable on public.compliance_decisions;
create trigger compliance_decisions_immutable
before update or delete on public.compliance_decisions
for each row execute function public.prevent_audit_mutation();

create or replace function public.enforce_pre_post_compliance_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sensitive boolean;
  rules public.compliance_rule_sets;
  amount_value numeric := coalesce(
    nullif(new.metadata->>'base_amount', '')::numeric,
    nullif(new.metadata->>'amount_base', '')::numeric,
    nullif(new.metadata->>'sold_base_value', '')::numeric,
    0
  );
  counterparty_value uuid := coalesce(nullif(new.metadata->>'counterparty_id', '')::uuid, new.counterparty_id);
  case_value uuid := nullif(new.metadata->>'compliance_case_id', '')::uuid;
  kyc_profile_value uuid;
  kyc_status text;
  aggregate_amount_value numeric := amount_value;
  review_amount_value numeric := amount_value;
  present_documents text[] := '{}';
  documents_ok boolean := true;
  screening_provider text;
  screening_ok boolean := false;
  manual_approved boolean := false;
  reasons_value text[] := '{}';
  decision_value text := 'allowed';
  decision_id uuid := gen_random_uuid();
  evidence_value jsonb;
begin
  sensitive := new.event_type in ('buy_fx', 'sell_fx', 'exchange_fx')
    or new.metadata ? 'debt_id'
    or new.immutable_reference like 'debt-%'
    or coalesce(new.metadata->>'workflow_type', '') like 'hawala_%';
  if not sensitive then return new; end if;

  select * into rules from public.compliance_rule_sets r
  where r.organization_id = new.organization_id and r.status = 'active'
    and r.effective_from <= new.occurred_at
    and (r.effective_to is null or r.effective_to > new.occurred_at)
  order by r.effective_from desc limit 1;

  if counterparty_value is not null then
    select kp.id, kp.review_status into kyc_profile_value, kyc_status from public.kyc_profiles kp
    where kp.organization_id = new.organization_id and kp.counterparty_id = counterparty_value;
    select replace(f.feature_code, 'sanctions_provider:', '') into screening_provider
    from public.organization_features f
    where f.organization_id = new.organization_id
      and f.feature_code like 'sanctions_provider:%'
      and f.enabled
    order by f.feature_code
    limit 1;
    select exists (
      select 1 from public.sanctions_screenings ss
      where ss.organization_id = new.organization_id and ss.counterparty_id = counterparty_value
        and screening_provider is not null
        and lower(ss.provider_name) = lower(screening_provider)
        and ss.potential_match = false
        and (
          ss.resolution is null
          or (ss.resolution = 'false_positive' and ss.reviewed_at is not null)
        )
    ) into screening_ok;
  end if;

  if rules.id is not null
    and counterparty_value is not null
    and rules.aggregation_window_hours is not null
  then
    select amount_value + coalesce(sum(abs(coalesce(
      case when fe.metadata->>'base_amount' ~ '^-?[0-9]+([.][0-9]+)?$' then (fe.metadata->>'base_amount')::numeric end,
      case when fe.metadata->>'amount_base' ~ '^-?[0-9]+([.][0-9]+)?$' then (fe.metadata->>'amount_base')::numeric end,
      case when fe.metadata->>'sold_base_value' ~ '^-?[0-9]+([.][0-9]+)?$' then (fe.metadata->>'sold_base_value')::numeric end,
      0
    ))), 0)
    into aggregate_amount_value
    from public.financial_events fe
    where fe.organization_id = new.organization_id
      and coalesce(fe.counterparty_id::text, fe.metadata->>'counterparty_id') = counterparty_value::text
      and fe.occurred_at >= new.occurred_at - make_interval(hours => rules.aggregation_window_hours)
      and fe.occurred_at < new.occurred_at;
    review_amount_value := aggregate_amount_value;
  end if;

  if rules.id is not null
    and cardinality(rules.required_documents) > 0
    and review_amount_value >= coalesce(rules.kyc_threshold_afn, rules.transaction_threshold_afn, 0)
  then
    documents_ok := false;
    if kyc_profile_value is not null then
      select coalesce(array_agg(distinct kd.document_type), '{}'::text[])
      into present_documents
      from public.kyc_documents kd
      where kd.organization_id = new.organization_id
        and kd.kyc_profile_id = kyc_profile_value;
      documents_ok := rules.required_documents <@ present_documents;
    end if;
  end if;

  if case_value is not null then
    select exists (
      select 1 from public.compliance_cases cc
      join public.compliance_alerts ca
        on ca.id = cc.alert_id
       and ca.organization_id = cc.organization_id
      where cc.id = case_value and cc.organization_id = new.organization_id
        and cc.report_status in ('submitted', 'closed')
        and ca.status = 'cleared'
        and ca.rule_set_id = rules.id
        and ca.reviewed_by is not null
        and ca.reviewed_by <> new.created_by
        and ca.reviewed_at is not null
        and length(trim(coalesce(ca.disposition_reason, ''))) >= 2
        and ca.evidence->>'client_command_id' = new.client_command_id
        and ca.evidence->>'branch_id' = coalesce(new.branch_id::text, '')
        and ca.evidence->>'event_type' = new.event_type::text
        and coalesce(ca.evidence->>'workflow_type', '') = coalesce(new.metadata->>'workflow_type', '')
        and coalesce(ca.evidence->>'counterparty_id', '') = coalesce(counterparty_value::text, '')
        and coalesce(ca.evidence->>'cashbox_id', '') = coalesce(new.metadata->>'cashbox_id', '')
        and ca.evidence->>'amount_base' ~ '^[0-9]+([.][0-9]+)?$'
        and (ca.evidence->>'amount_base')::numeric = amount_value
    ) into manual_approved;
  end if;

  if rules.id is not null then
    if rules.transaction_threshold_afn is not null and review_amount_value >= rules.transaction_threshold_afn then
      reasons_value := array_append(reasons_value, 'large_transaction_review_required');
    end if;
    if rules.kyc_threshold_afn is not null and review_amount_value >= rules.kyc_threshold_afn and coalesce(kyc_status, 'missing') <> 'approved' then
      reasons_value := array_append(reasons_value, 'kyc_review_required');
    end if;
    if rules.edd_threshold_afn is not null and review_amount_value >= rules.edd_threshold_afn then
      reasons_value := array_append(reasons_value, 'enhanced_review_required');
    end if;
    if not documents_ok then
      reasons_value := array_append(reasons_value, 'required_documents_missing');
    end if;
    if rules.screening_required and counterparty_value is not null then
      if screening_provider is null then
        reasons_value := array_append(reasons_value, 'screening_provider_required');
      elsif not screening_ok then
        reasons_value := array_append(reasons_value, 'screening_evidence_required');
      end if;
    end if;
  else
    reasons_value := array_append(reasons_value, 'no_active_rule_set');
  end if;

  if rules.id is null then
    raise exception 'COMPLIANCE_CONFIGURATION_REQUIRED:no_active_rule_set';
  end if;
  if cardinality(reasons_value) > 0 and not manual_approved then
    raise exception 'COMPLIANCE_REVIEW_REQUIRED:%', array_to_string(reasons_value, ',');
  end if;
  if manual_approved then decision_value := 'manual_review_approved'; end if;

  evidence_value := jsonb_strip_nulls(jsonb_build_object(
    'rule_set_id', rules.id,
    'rule_version', rules.version,
    'rule_source_reference', rules.source_reference,
    'amount_base', amount_value,
    'aggregation_window_hours', rules.aggregation_window_hours,
    'aggregate_amount_base', aggregate_amount_value,
    'threshold_amount_base', review_amount_value,
    'counterparty_id', counterparty_value,
    'kyc_status', kyc_status,
    'required_documents', rules.required_documents,
    'present_documents', present_documents,
    'required_documents_complete', documents_ok,
    'screening_provider', screening_provider,
    'screening_evidence_current', screening_ok,
    'compliance_case_id', case_value,
    'evaluated_event_type', new.event_type,
    'evaluated_workflow', new.metadata->>'workflow_type',
    'decision_engine_version', 'sarafi-compliance-v2'
  ));

  insert into public.compliance_decisions (
    id, organization_id, financial_event_id, rule_set_id, rule_version,
    decision, reasons, evidence, decided_by
  ) values (
    decision_id, new.organization_id, new.id, rules.id, rules.version,
    decision_value, reasons_value, evidence_value, new.created_by
  );
  new.metadata := new.metadata || jsonb_build_object(
    'compliance_decision_id', decision_id,
    'compliance_decision', decision_value,
    'compliance_rule_version', coalesce(rules.version, 'unconfigured'),
    'compliance_decision_engine', 'sarafi-compliance-v2'
  );
  return new;
end;
$$;

drop trigger if exists financial_events_pre_post_compliance on public.financial_events;
create trigger financial_events_pre_post_compliance
before insert on public.financial_events
for each row execute function public.enforce_pre_post_compliance_decision();

revoke all on function public.create_financial_report_snapshot(jsonb) from public, anon;
revoke all on function public.record_report_export(jsonb) from public, anon;
revoke all on function public.enforce_pre_post_compliance_decision() from public, anon, authenticated;
grant execute on function public.create_financial_report_snapshot(jsonb) to authenticated;
grant execute on function public.record_report_export(jsonb) to authenticated;

-- Realtime is part of the authorization contract: role, device, approval and
-- compliance changes must reach an open workspace without a manual refresh.
do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'devices',
    'organization_memberships',
    'approval_requests',
    'worker_join_requests',
    'hawala_transfers',
    'compliance_alerts',
    'compliance_cases',
    'security_audit_events'
  ] loop
    if to_regclass(format('public.%I', relation_name)) is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = relation_name
      ) then
      execute format('alter publication supabase_realtime add table public.%I', relation_name);
    end if;
  end loop;
end;
$$;
