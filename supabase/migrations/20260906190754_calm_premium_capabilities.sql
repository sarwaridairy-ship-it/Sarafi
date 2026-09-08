-- SARAFI calm-premium authorization foundation.
--
-- This migration deliberately replaces role-string decisions with one capability
-- source. Existing command implementations are retained behind private-to-clients
-- wrappers so authorization runs before idempotency reads, locks, or writes.

create table if not exists public.capability_definitions (
  capability_code text primary key,
  description text not null,
  owner_only boolean not null default false,
  created_at timestamptz not null default now(),
  constraint capability_definitions_code_check
    check (capability_code ~ '^[a-z][a-z0-9_.:-]{2,80}$')
);

create table if not exists public.role_capabilities (
  role_code text not null,
  capability_code text not null references public.capability_definitions(capability_code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_code, capability_code),
  constraint role_capabilities_role_check
    check (role_code in ('owner', 'business_admin', 'manager', 'accountant', 'cashier', 'viewer', 'compliance_officer'))
);

create table if not exists public.membership_capability_overrides (
  membership_id uuid not null references public.organization_memberships(id) on delete cascade,
  capability_code text not null references public.capability_definitions(capability_code) on delete cascade,
  allowed boolean not null,
  branch_ids uuid[] not null default '{}',
  cashbox_ids uuid[] not null default '{}',
  limits jsonb not null default '{}'::jsonb,
  granted_by uuid references auth.users(id),
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (membership_id, capability_code),
  constraint membership_capability_reason_check check (length(trim(reason)) between 2 and 300)
);

create index if not exists membership_capability_overrides_capability_idx
  on public.membership_capability_overrides (capability_code, membership_id);

create or replace function public.capability_limits_are_valid(candidate jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    jsonb_typeof(coalesce(candidate, '{}'::jsonb)) = 'object'
    and case
      when not (coalesce(candidate, '{}'::jsonb) ? 'max_transaction_amount_base') then true
      when jsonb_typeof(candidate->'max_transaction_amount_base') = 'number' then
        (candidate->>'max_transaction_amount_base')::numeric >= 0
      else false
    end
    and case
      when not (coalesce(candidate, '{}'::jsonb) ? 'max_native_amount') then true
      when jsonb_typeof(candidate->'max_native_amount') = 'number' then
        (candidate->>'max_native_amount')::numeric >= 0
      else false
    end
    and case
      when not (coalesce(candidate, '{}'::jsonb) ? 'currency_limits') then true
      when jsonb_typeof(candidate->'currency_limits') = 'object' then
        not exists (
          select 1
          from jsonb_each(candidate->'currency_limits') item
          where item.key !~ '^[A-Z]{3}$'
             or case
                  when jsonb_typeof(item.value) = 'number' then (item.value #>> '{}')::numeric < 0
                  else true
                end
        )
      else false
    end;
$$;

alter table public.membership_capability_overrides
  drop constraint if exists membership_capability_limits_check;
alter table public.membership_capability_overrides
  add constraint membership_capability_limits_check
  check (public.capability_limits_are_valid(limits));

alter table public.capability_definitions enable row level security;
alter table public.role_capabilities enable row level security;
alter table public.membership_capability_overrides enable row level security;
revoke all on public.capability_definitions, public.role_capabilities, public.membership_capability_overrides
  from public, anon, authenticated;
revoke all on function public.capability_limits_are_valid(jsonb) from public, anon, authenticated;

insert into public.capability_definitions (capability_code, description, owner_only) values
  ('workspace.view', 'Open an assigned organization workspace', false),
  ('financial.overview', 'Review business financial summaries', false),
  ('financial.post.fx', 'Post currency exchange transactions', false),
  ('financial.post.money', 'Post ordinary money in, money out, and movement transactions', false),
  ('financial.post.debt', 'Create and settle debts', false),
  ('financial.post.hawala', 'Operate Hawala journeys', false),
  ('financial.post.opening', 'Record opening money', false),
  ('financial.reverse', 'Request an immutable correction by reversing a posted entry', false),
  ('financial.report', 'Review and export financial reports', false),
  ('customers.manage', 'Create and update customer and counterparty records', false),
  ('reconciliation.submit', 'Count and submit a cashbox close', false),
  ('reconciliation.approve', 'Approve or reject a cashbox close', false),
  ('approval.request', 'Request an approval while preserving a transaction draft', false),
  ('approval.decide', 'Approve or reject another user request', false),
  ('team.view', 'Review people, invitations, requests, devices, and role limits', false),
  ('team.invite', 'Invite a worker with an explicit assignment', false),
  ('team.manage', 'Manage non-owner team memberships and devices', false),
  ('team.capabilities.manage', 'Delegate granular non-owner capabilities and limits', false),
  ('rates.manage', 'Publish shop exchange rates', false),
  ('money_accounts.manage', 'Manage cashboxes, bank, safe, and partner accounts', false),
  ('organization.manage', 'Manage business and branch settings', false),
  ('security.manage', 'Manage organization security controls', false),
  ('compliance.review', 'Review compliance alerts and cases', false),
  ('data.import', 'Import organization data', false),
  ('billing.manage', 'Manage the owner billing relationship', true),
  ('ownership.transfer', 'Transfer organization ownership', true),
  ('owner.delete', 'Delete or deactivate the organization owner', true),
  ('owner.capital.post', 'Post owner capital and owner withdrawal entries', true)
on conflict (capability_code) do update
set description = excluded.description, owner_only = excluded.owner_only;

insert into public.role_capabilities (role_code, capability_code)
select role_code, capability_code
from (values
  ('owner', array[
    'workspace.view','financial.overview','financial.post.fx','financial.post.money','financial.post.debt',
    'financial.post.hawala','financial.post.opening','financial.report','customers.manage',
    'financial.reverse',
    'reconciliation.submit','reconciliation.approve','approval.request','approval.decide',
    'team.view','team.invite','team.manage','team.capabilities.manage','rates.manage',
    'money_accounts.manage','organization.manage','security.manage','compliance.review','data.import',
    'billing.manage','ownership.transfer','owner.delete','owner.capital.post'
  ]::text[]),
  ('business_admin', array[
    'workspace.view','financial.overview','financial.post.fx','financial.post.money','financial.post.debt',
    'financial.post.hawala','financial.post.opening','financial.report','customers.manage',
    'financial.reverse',
    'reconciliation.submit','reconciliation.approve','approval.request','approval.decide',
    'team.view','team.invite','team.manage','team.capabilities.manage','rates.manage',
    'money_accounts.manage','organization.manage','security.manage','compliance.review','data.import'
  ]::text[]),
  ('manager', array[
    'workspace.view','financial.overview','financial.post.fx','financial.post.money','financial.post.debt',
    'financial.post.hawala','financial.report','customers.manage','reconciliation.submit',
    'financial.reverse',
    'reconciliation.approve','approval.request','approval.decide','team.view'
  ]::text[]),
  ('accountant', array[
    'workspace.view','financial.overview','financial.report','reconciliation.submit','team.view'
  ]::text[]),
  ('cashier', array[
    'workspace.view','financial.post.fx','financial.post.money','financial.post.debt',
    'financial.post.hawala','customers.manage','reconciliation.submit','approval.request'
  ]::text[]),
  ('viewer', array['workspace.view','financial.overview','financial.report']::text[]),
  ('compliance_officer', array['workspace.view','financial.overview','team.view','compliance.review']::text[])
) defaults(role_code, capability_codes)
cross join lateral unnest(defaults.capability_codes) capability_code
on conflict do nothing;

create or replace function public.has_capability(
  target_org uuid,
  capability text,
  optional_scope jsonb default '{}'::jsonb
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  with membership as (
    select m.id, m.role_code
    from public.organization_memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.active
    limit 1
  ), decision as (
    select
      m.id,
      coalesce(o.allowed, rc.capability_code is not null) as allowed,
      coalesce(o.branch_ids, '{}'::uuid[]) as override_branches,
      coalesce(o.cashbox_ids, '{}'::uuid[]) as override_cashboxes,
      coalesce(o.limits, '{}'::jsonb) as limits
    from membership m
    left join public.role_capabilities rc
      on rc.role_code = m.role_code and rc.capability_code = capability
    left join public.membership_capability_overrides o
      on o.membership_id = m.id and o.capability_code = capability
    left join public.capability_definitions d on d.capability_code = capability
    where d.capability_code is not null
      and (not d.owner_only or m.role_code = 'owner')
  )
  select coalesce(bool_or(
    decision.allowed
    and (
      nullif(optional_scope->>'branch_id', '') is null
      or (
        (
          cardinality(decision.override_branches) = 0
          and (
            not exists (select 1 from public.organization_branch_access ba0 where ba0.membership_id = decision.id)
            or exists (
              select 1 from public.organization_branch_access ba
              where ba.membership_id = decision.id
                and ba.branch_id = (optional_scope->>'branch_id')::uuid
            )
          )
        )
        or (optional_scope->>'branch_id')::uuid = any(decision.override_branches)
      )
    )
    and (
      nullif(optional_scope->>'cashbox_id', '') is null
      or (
        (
          cardinality(decision.override_cashboxes) = 0
          and (
            not exists (select 1 from public.organization_cashbox_access ca0 where ca0.membership_id = decision.id)
            or exists (
              select 1 from public.organization_cashbox_access ca
              where ca.membership_id = decision.id
                and ca.cashbox_id = (optional_scope->>'cashbox_id')::uuid
            )
          )
        )
        or (optional_scope->>'cashbox_id')::uuid = any(decision.override_cashboxes)
      )
    )
    and (
      nullif(optional_scope->>'amount_base', '') is null
      or (
        optional_scope->>'amount_base' ~ '^[+-]?[0-9]+([.][0-9]+)?$'
        and (
          not (decision.limits ? 'max_transaction_amount_base')
          or abs((optional_scope->>'amount_base')::numeric) <= (decision.limits->>'max_transaction_amount_base')::numeric
        )
      )
    )
    and (
      nullif(optional_scope->>'amount_native', '') is null
      or (
        optional_scope->>'amount_native' ~ '^[+-]?[0-9]+([.][0-9]+)?$'
        and (
          (
            not (decision.limits ? 'max_native_amount')
            or abs((optional_scope->>'amount_native')::numeric) <= (decision.limits->>'max_native_amount')::numeric
          )
          and (
            nullif(optional_scope->>'currency', '') is null
            or not (coalesce(decision.limits->'currency_limits', '{}'::jsonb) ? upper(optional_scope->>'currency'))
            or abs((optional_scope->>'amount_native')::numeric)
              <= (decision.limits->'currency_limits'->>upper(optional_scope->>'currency'))::numeric
          )
        )
      )
    )
  ), false)
  from decision;
$$;

create or replace function public.require_capability(
  target_org uuid,
  capability text,
  optional_scope jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if not public.has_capability(target_org, capability, coalesce(optional_scope, '{}'::jsonb)) then
    raise exception 'CAPABILITY_REQUIRED:%', capability using errcode = '42501';
  end if;
end;
$$;

create or replace function public.get_effective_capabilities(target_org uuid)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(d.capability_code order by d.capability_code), '[]'::jsonb)
  from public.capability_definitions d
  where public.has_capability(target_org, d.capability_code, '{}'::jsonb);
$$;

create or replace function public.has_org_permission(target_org uuid, required_permission text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when required_permission = 'financial:post' then
      public.has_capability(target_org, 'financial.post.fx', '{}'::jsonb)
      or public.has_capability(target_org, 'financial.post.money', '{}'::jsonb)
      or public.has_capability(target_org, 'financial.post.debt', '{}'::jsonb)
      or public.has_capability(target_org, 'financial.post.hawala', '{}'::jsonb)
      or public.has_capability(target_org, 'financial.post.opening', '{}'::jsonb)
      or public.has_capability(target_org, 'owner.capital.post', '{}'::jsonb)
    else public.has_capability(
      target_org,
      case required_permission
        when 'financial:overview' then 'financial.overview'
        when 'financial:report' then 'financial.report'
        when 'reconciliation:manage' then 'reconciliation.approve'
        when 'team:manage' then 'team.manage'
        when 'approval:decide' then 'approval.decide'
        when 'compliance:review' then 'compliance.review'
        when 'security:manage' then 'security.manage'
        when 'organization:manage' then 'organization.manage'
        else 'capability.invalid'
      end,
      '{}'::jsonb
    )
  end;
$$;

create or replace function public.get_my_workspace_context()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when not public.is_platform_user_active() then '[]'::jsonb
    else coalesce(jsonb_agg(jsonb_build_object(
      'membership_id', m.id,
      'organization_id', m.organization_id,
      'organization_name', o.display_name,
      'role_code', m.role_code,
      'mfa_required', m.mfa_required,
      'capabilities', public.get_effective_capabilities(m.organization_id),
      'branches', coalesce((
        select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.created_at)
        from public.branches b
        where b.organization_id = m.organization_id and b.active
          and (
            not exists (select 1 from public.organization_branch_access ba0 where ba0.membership_id = m.id)
            or exists (select 1 from public.organization_branch_access ba where ba.membership_id = m.id and ba.branch_id = b.id)
          )
      ), '[]'::jsonb),
      'cashboxes', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'branch_id', c.branch_id) order by c.created_at)
        from public.cashboxes c
        where c.organization_id = m.organization_id and c.active
          and (
            not exists (select 1 from public.organization_cashbox_access ca0 where ca0.membership_id = m.id)
            or exists (select 1 from public.organization_cashbox_access ca where ca.membership_id = m.id and ca.cashbox_id = c.id)
          )
      ), '[]'::jsonb),
      'subscription', coalesce((
        select jsonb_build_object('status', s.status, 'period_end', coalesce(s.current_period_end, s.trial_ends_at), 'plan_code', p.code)
        from public.organization_subscriptions s
        join public.subscription_plans p on p.id = s.plan_id
        where s.organization_id = m.organization_id
      ), '{}'::jsonb)
    ) order by m.created_at), '[]'::jsonb)
    end
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid()) and m.active;
$$;

create or replace function public.enforce_financial_event_capability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  required_capability text;
begin
  if (select auth.role()) = 'service_role' then return new; end if;
  required_capability := case
    when new.event_type::text in ('buy_fx', 'sell_fx', 'exchange_fx') then 'financial.post.fx'
    when new.event_type::text in ('debt_created', 'debt_settled', 'record_debt', 'settle_debt') then 'financial.post.debt'
    when new.event_type::text = 'reversal' then 'financial.reverse'
    when new.event_type::text like 'hawala%' or new.immutable_reference like 'hawala-%' then 'financial.post.hawala'
    when new.event_type::text in ('owner_investment', 'owner_withdrawal') then 'owner.capital.post'
    when new.event_type::text = 'opening_balance' then 'financial.post.opening'
    else 'financial.post.money'
  end;
  perform public.require_capability(
    new.organization_id,
    required_capability,
    jsonb_strip_nulls(jsonb_build_object(
      'branch_id', new.branch_id,
      'cashbox_id', new.metadata->>'cashbox_id',
      'amount_native', new.metadata->>'amount',
      'amount_base', coalesce(new.metadata->>'base_amount', new.metadata->>'base_value'),
      'currency', new.metadata->>'currency'
    ))
  );
  return new;
end;
$$;

drop trigger if exists financial_events_require_capability on public.financial_events;
create trigger financial_events_require_capability
before insert on public.financial_events
for each row execute function public.enforce_financial_event_capability();

revoke all on function public.has_capability(uuid, text, jsonb) from public, anon;
revoke all on function public.require_capability(uuid, text, jsonb) from public, anon;
revoke all on function public.get_effective_capabilities(uuid) from public, anon;
revoke all on function public.has_org_permission(uuid, text) from public, anon;
revoke all on function public.get_my_workspace_context() from public, anon;
revoke all on function public.enforce_financial_event_capability() from public, anon, authenticated;
grant execute on function public.has_capability(uuid, text, jsonb) to authenticated;
grant execute on function public.require_capability(uuid, text, jsonb) to authenticated;
grant execute on function public.get_effective_capabilities(uuid) to authenticated;
grant execute on function public.has_org_permission(uuid, text) to authenticated;
grant execute on function public.get_my_workspace_context() to authenticated;

-- Financial command entry points. The renamed implementations are not callable by
-- browser roles; each public wrapper authorizes before invoking legacy logic.
alter function public.record_fx_trade(jsonb) rename to record_fx_trade_capability_impl;
revoke all on function public.record_fx_trade_capability_impl(jsonb) from public, anon, authenticated;
create function public.record_fx_trade(command jsonb)
returns public.journal_entries
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_capability(
    nullif(command->>'organization_id', '')::uuid,
    'financial.post.fx',
    jsonb_strip_nulls(jsonb_build_object(
      'branch_id', nullif(command->>'branch_id', ''),
      'cashbox_id', nullif(command->>'cashbox_id', ''),
      'amount_base', greatest(nullif(command->>'sold_base_value', '')::numeric, nullif(command->>'bought_base_value', '')::numeric)
    ))
  );
  return public.record_fx_trade_capability_impl(command);
end;
$$;

alter function public.request_fx_trade_approval(jsonb) rename to request_fx_trade_approval_capability_impl;
revoke all on function public.request_fx_trade_approval_capability_impl(jsonb) from public, anon, authenticated;
create function public.request_fx_trade_approval(command jsonb)
returns public.approval_requests
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_capability(
    nullif(command->>'organization_id', '')::uuid,
    'approval.request',
    jsonb_strip_nulls(jsonb_build_object(
      'branch_id', nullif(command->>'branch_id', ''),
      'cashbox_id', nullif(command->>'cashbox_id', ''),
      'amount_base', greatest(nullif(command->>'sold_base_value', '')::numeric, nullif(command->>'bought_base_value', '')::numeric)
    ))
  );
  return public.request_fx_trade_approval_capability_impl(command);
end;
$$;

alter function public.record_operation(jsonb) rename to record_operation_capability_impl;
revoke all on function public.record_operation_capability_impl(jsonb) from public, anon, authenticated;
create function public.record_operation(command jsonb)
returns public.journal_entries
language plpgsql security definer set search_path = '' as $$
declare required_capability text;
begin
  required_capability := case
    when upper(coalesce(command->>'operation', '')) in ('OWNER_INVESTMENT', 'OWNER_WITHDRAWAL')
      then 'owner.capital.post'
    else 'financial.post.money'
  end;
  perform public.require_capability(
    nullif(command->>'organization_id', '')::uuid,
    required_capability,
    jsonb_strip_nulls(jsonb_build_object(
      'branch_id', nullif(command->>'branch_id', ''),
      'cashbox_id', nullif(command->>'cashbox_id', ''),
      'amount_native', nullif(command->>'amount', ''),
      'amount_base', coalesce(nullif(command->>'base_amount', ''), nullif(command->>'amount', '')),
      'currency', nullif(command->>'currency', '')
    ))
  );
  return public.record_operation_capability_impl(command);
end;
$$;

alter function public.record_opening_balance(jsonb) rename to record_opening_balance_capability_impl;
revoke all on function public.record_opening_balance_capability_impl(jsonb) from public, anon, authenticated;
create function public.record_opening_balance(command jsonb)
returns public.journal_entries
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_capability(
    nullif(command->>'organization_id', '')::uuid,
    'financial.post.opening',
    jsonb_strip_nulls(jsonb_build_object(
      'branch_id', nullif(command->>'branch_id', ''),
      'cashbox_id', nullif(command->>'cashbox_id', ''),
      'amount_native', nullif(command->>'amount', ''),
      'amount_base', nullif(command->>'base_value', ''),
      'currency', nullif(command->>'currency', '')
    ))
  );
  return public.record_opening_balance_capability_impl(command);
end;
$$;

alter function public.record_debt(jsonb) rename to record_debt_capability_impl;
revoke all on function public.record_debt_capability_impl(jsonb) from public, anon, authenticated;
create function public.record_debt(command jsonb)
returns public.journal_entries
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_capability(
    nullif(command->>'organization_id', '')::uuid,
    'financial.post.debt',
    jsonb_strip_nulls(jsonb_build_object(
      'branch_id', nullif(command->>'branch_id', ''),
      'cashbox_id', nullif(command->>'cashbox_id', ''),
      'amount_native', nullif(command->>'amount', ''),
      'amount_base', coalesce(nullif(command->>'base_amount', ''), nullif(command->>'amount', '')),
      'currency', nullif(command->>'currency', '')
    ))
  );
  return public.record_debt_capability_impl(command);
end;
$$;

alter function public.settle_debt(jsonb) rename to settle_debt_capability_impl;
revoke all on function public.settle_debt_capability_impl(jsonb) from public, anon, authenticated;
create function public.settle_debt(command jsonb)
returns public.journal_entries
language plpgsql security definer set search_path = '' as $$
declare debt_org uuid; debt_branch uuid; debt_currency text;
begin
  select d.organization_id, d.branch_id, d.currency_code into debt_org, debt_branch, debt_currency
  from public.debts d where d.id = nullif(command->>'debt_id', '')::uuid;
  perform public.require_capability(
    debt_org,
    'financial.post.debt',
    jsonb_strip_nulls(jsonb_build_object(
      'branch_id', debt_branch,
      'cashbox_id', nullif(command->>'cashbox_id', ''),
      'amount_native', nullif(command->>'amount', ''),
      'amount_base', coalesce(nullif(command->>'base_amount', ''), nullif(command->>'amount', '')),
      'currency', debt_currency
    ))
  );
  return public.settle_debt_capability_impl(command);
end;
$$;

alter function public.record_hawala_send(jsonb) rename to record_hawala_send_capability_impl;
revoke all on function public.record_hawala_send_capability_impl(jsonb) from public, anon, authenticated;
create function public.record_hawala_send(command jsonb)
returns public.hawala_transfers
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_capability(
    nullif(command->>'organization_id', '')::uuid,
    'financial.post.hawala',
    jsonb_strip_nulls(jsonb_build_object(
      'branch_id', nullif(command->>'branch_id', ''),
      'cashbox_id', nullif(command->>'cashbox_id', ''),
      'amount_native', nullif(command->>'amount', ''),
      'amount_base', coalesce(nullif(command->>'base_amount', ''), nullif(command->>'amount', '')),
      'currency', nullif(command->>'currency', '')
    ))
  );
  return public.record_hawala_send_capability_impl(command);
end;
$$;

alter function public.record_hawala_incoming(jsonb) rename to record_hawala_incoming_capability_impl;
revoke all on function public.record_hawala_incoming_capability_impl(jsonb) from public, anon, authenticated;
create function public.record_hawala_incoming(command jsonb)
returns public.hawala_transfers
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_capability(
    nullif(command->>'organization_id', '')::uuid,
    'financial.post.hawala',
    jsonb_strip_nulls(jsonb_build_object(
      'branch_id', nullif(command->>'branch_id', ''),
      'cashbox_id', nullif(command->>'cashbox_id', ''),
      'amount_native', nullif(command->>'amount', ''),
      'amount_base', coalesce(nullif(command->>'base_amount', ''), nullif(command->>'amount', '')),
      'currency', nullif(command->>'currency', '')
    ))
  );
  return public.record_hawala_incoming_capability_impl(command);
end;
$$;

alter function public.pay_hawala_beneficiary(jsonb) rename to pay_hawala_beneficiary_capability_impl;
revoke all on function public.pay_hawala_beneficiary_capability_impl(jsonb) from public, anon, authenticated;
create function public.pay_hawala_beneficiary(command jsonb)
returns public.hawala_transfers
language plpgsql security definer set search_path = '' as $$
declare transfer_org uuid; transfer_branch uuid; transfer_amount numeric; transfer_currency text;
begin
  select h.organization_id, h.branch_id, h.amount, h.currency_code into transfer_org, transfer_branch, transfer_amount, transfer_currency
  from public.hawala_transfers h where h.id = nullif(command->>'transfer_id', '')::uuid;
  perform public.require_capability(
    transfer_org,
    'financial.post.hawala',
    jsonb_strip_nulls(jsonb_build_object('branch_id', transfer_branch, 'amount_native', transfer_amount, 'amount_base', transfer_amount, 'currency', transfer_currency))
  );
  return public.pay_hawala_beneficiary_capability_impl(command);
end;
$$;

alter function public.settle_hawala_partner(jsonb) rename to settle_hawala_partner_capability_impl;
revoke all on function public.settle_hawala_partner_capability_impl(jsonb) from public, anon, authenticated;
create function public.settle_hawala_partner(command jsonb)
returns public.hawala_settlements
language plpgsql security definer set search_path = '' as $$
declare transfer_org uuid; transfer_branch uuid; transfer_currency text;
begin
  select h.organization_id, h.branch_id, h.currency_code into transfer_org, transfer_branch, transfer_currency
  from public.hawala_transfers h where h.id = nullif(command->>'transfer_id', '')::uuid;
  perform public.require_capability(
    transfer_org,
    'financial.post.hawala',
    jsonb_strip_nulls(jsonb_build_object(
      'branch_id', transfer_branch,
      'amount_native', nullif(command->>'amount', ''),
      'amount_base', nullif(command->>'amount', ''),
      'currency', transfer_currency
    ))
  );
  return public.settle_hawala_partner_capability_impl(command);
end;
$$;

alter function public.transition_hawala_status(jsonb) rename to transition_hawala_status_capability_impl;
revoke all on function public.transition_hawala_status_capability_impl(jsonb) from public, anon, authenticated;
create function public.transition_hawala_status(command jsonb)
returns public.hawala_transfers
language plpgsql security definer set search_path = '' as $$
declare transfer_org uuid; transfer_branch uuid;
begin
  select h.organization_id, h.branch_id into transfer_org, transfer_branch
  from public.hawala_transfers h where h.id = nullif(command->>'transfer_id', '')::uuid;
  perform public.require_capability(
    transfer_org,
    'financial.post.hawala',
    jsonb_strip_nulls(jsonb_build_object('branch_id', transfer_branch))
  );
  return public.transition_hawala_status_capability_impl(command);
end;
$$;

alter function public.record_cashbox_close(jsonb) rename to record_cashbox_close_capability_impl;
revoke all on function public.record_cashbox_close_capability_impl(jsonb) from public, anon, authenticated;
create function public.record_cashbox_close(command jsonb)
returns public.cashbox_closes
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_capability(
    nullif(command->>'organization_id', '')::uuid,
    'reconciliation.submit',
    jsonb_strip_nulls(jsonb_build_object('branch_id', nullif(command->>'branch_id', ''), 'cashbox_id', nullif(command->>'cashbox_id', '')))
  );
  return public.record_cashbox_close_capability_impl(command);
end;
$$;

alter function public.request_reversal(jsonb) rename to request_reversal_capability_impl;
revoke all on function public.request_reversal_capability_impl(jsonb) from public, anon, authenticated;
create function public.request_reversal(command jsonb)
returns public.journal_entries
language plpgsql security definer set search_path = '' as $$
declare original_org uuid; original_branch uuid;
begin
  select j.organization_id, j.branch_id into original_org, original_branch
  from public.journal_entries j
  where j.id = nullif(command->>'original_entry_id', '')::uuid;
  perform public.require_capability(original_org, 'financial.reverse', jsonb_strip_nulls(jsonb_build_object('branch_id', original_branch)));
  return public.request_reversal_capability_impl(command);
end;
$$;

alter function public.record_report_export(jsonb) rename to record_report_export_capability_impl;
revoke all on function public.record_report_export_capability_impl(jsonb) from public, anon, authenticated;
create function public.record_report_export(command jsonb)
returns public.report_exports
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_capability(nullif(command->>'organization_id', '')::uuid, 'financial.report', '{}'::jsonb);
  return public.record_report_export_capability_impl(command);
end;
$$;

alter function public.submit_cashbox_close(uuid) rename to submit_cashbox_close_capability_impl;
revoke all on function public.submit_cashbox_close_capability_impl(uuid) from public, anon, authenticated;
create function public.submit_cashbox_close(target_id uuid)
returns public.cashbox_closes
language plpgsql security definer set search_path = '' as $$
declare close_org uuid; close_branch uuid; close_cashbox uuid;
begin
  select c.organization_id, c.branch_id, c.cashbox_id into close_org, close_branch, close_cashbox
  from public.cashbox_closes c where c.id = target_id;
  perform public.require_capability(close_org, 'reconciliation.submit', jsonb_strip_nulls(jsonb_build_object('branch_id', close_branch, 'cashbox_id', close_cashbox)));
  return public.submit_cashbox_close_capability_impl(target_id);
end;
$$;

alter function public.approve_cashbox_close(uuid) rename to approve_cashbox_close_capability_impl;
revoke all on function public.approve_cashbox_close_capability_impl(uuid) from public, anon, authenticated;
create function public.approve_cashbox_close(target_id uuid)
returns public.cashbox_closes
language plpgsql security definer set search_path = '' as $$
declare close_org uuid; close_branch uuid; close_cashbox uuid;
begin
  select c.organization_id, c.branch_id, c.cashbox_id into close_org, close_branch, close_cashbox
  from public.cashbox_closes c where c.id = target_id;
  perform public.require_capability(close_org, 'reconciliation.approve', jsonb_strip_nulls(jsonb_build_object('branch_id', close_branch, 'cashbox_id', close_cashbox)));
  return public.approve_cashbox_close_capability_impl(target_id);
end;
$$;

alter function public.reject_cashbox_close(uuid, text) rename to reject_cashbox_close_capability_impl;
revoke all on function public.reject_cashbox_close_capability_impl(uuid, text) from public, anon, authenticated;
create function public.reject_cashbox_close(target_id uuid, reason_input text)
returns public.cashbox_closes
language plpgsql security definer set search_path = '' as $$
declare close_org uuid; close_branch uuid; close_cashbox uuid;
begin
  select c.organization_id, c.branch_id, c.cashbox_id into close_org, close_branch, close_cashbox
  from public.cashbox_closes c where c.id = target_id;
  perform public.require_capability(close_org, 'reconciliation.approve', jsonb_strip_nulls(jsonb_build_object('branch_id', close_branch, 'cashbox_id', close_cashbox)));
  return public.reject_cashbox_close_capability_impl(target_id, reason_input);
end;
$$;

alter function public.decide_approval(uuid, text, text) rename to decide_approval_capability_impl;
revoke all on function public.decide_approval_capability_impl(uuid, text, text) from public, anon, authenticated;
create function public.decide_approval(target_id uuid, decision text, decision_reason_input text)
returns public.approval_requests
language plpgsql security definer set search_path = '' as $$
declare approval_org uuid;
begin
  select a.organization_id into approval_org from public.approval_requests a where a.id = target_id;
  perform public.require_capability(approval_org, 'approval.decide', '{}'::jsonb);
  return public.decide_approval_capability_impl(target_id, decision, decision_reason_input);
end;
$$;

revoke all on function public.record_fx_trade(jsonb) from public, anon;
revoke all on function public.request_fx_trade_approval(jsonb) from public, anon;
revoke all on function public.record_operation(jsonb) from public, anon;
revoke all on function public.record_opening_balance(jsonb) from public, anon;
revoke all on function public.record_debt(jsonb) from public, anon;
revoke all on function public.settle_debt(jsonb) from public, anon;
revoke all on function public.record_hawala_send(jsonb) from public, anon;
revoke all on function public.record_hawala_incoming(jsonb) from public, anon;
revoke all on function public.pay_hawala_beneficiary(jsonb) from public, anon;
revoke all on function public.settle_hawala_partner(jsonb) from public, anon;
revoke all on function public.transition_hawala_status(jsonb) from public, anon;
revoke all on function public.record_cashbox_close(jsonb) from public, anon;
revoke all on function public.request_reversal(jsonb) from public, anon;
revoke all on function public.record_report_export(jsonb) from public, anon;
revoke all on function public.submit_cashbox_close(uuid) from public, anon;
revoke all on function public.approve_cashbox_close(uuid) from public, anon;
revoke all on function public.reject_cashbox_close(uuid, text) from public, anon;
revoke all on function public.decide_approval(uuid, text, text) from public, anon;
grant execute on function public.record_fx_trade(jsonb) to authenticated;
grant execute on function public.request_fx_trade_approval(jsonb) to authenticated;
grant execute on function public.record_operation(jsonb) to authenticated;
grant execute on function public.record_opening_balance(jsonb) to authenticated;
grant execute on function public.record_debt(jsonb) to authenticated;
grant execute on function public.settle_debt(jsonb) to authenticated;
grant execute on function public.record_hawala_send(jsonb) to authenticated;
grant execute on function public.record_hawala_incoming(jsonb) to authenticated;
grant execute on function public.pay_hawala_beneficiary(jsonb) to authenticated;
grant execute on function public.settle_hawala_partner(jsonb) to authenticated;
grant execute on function public.transition_hawala_status(jsonb) to authenticated;
grant execute on function public.record_cashbox_close(jsonb) to authenticated;
grant execute on function public.request_reversal(jsonb) to authenticated;
grant execute on function public.record_report_export(jsonb) to authenticated;
grant execute on function public.submit_cashbox_close(uuid) to authenticated;
grant execute on function public.approve_cashbox_close(uuid) to authenticated;
grant execute on function public.reject_cashbox_close(uuid, text) to authenticated;
grant execute on function public.decide_approval(uuid, text, text) to authenticated;

-- Non-financial command entry points also delegate to the same capability source.
alter function public.create_money_account(uuid, text, text, uuid, text) rename to create_money_account_capability_impl;
revoke all on function public.create_money_account_capability_impl(uuid, text, text, uuid, text) from public, anon, authenticated;
create function public.create_money_account(target_org uuid, name_input text, account_type_input text, branch_id_input uuid, reference_input text)
returns public.money_accounts
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_capability(target_org, 'money_accounts.manage', jsonb_strip_nulls(jsonb_build_object('branch_id', branch_id_input)));
  return public.create_money_account_capability_impl(target_org, name_input, account_type_input, branch_id_input, reference_input);
end;
$$;

alter function public.set_organization_currency(uuid, text, boolean) rename to set_organization_currency_capability_impl;
revoke all on function public.set_organization_currency_capability_impl(uuid, text, boolean) from public, anon, authenticated;
create function public.set_organization_currency(target_org uuid, target_currency text, enabled_input boolean)
returns public.organization_currencies
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_capability(target_org, 'money_accounts.manage', '{}'::jsonb);
  return public.set_organization_currency_capability_impl(target_org, target_currency, enabled_input);
end;
$$;

alter function public.set_exchange_rate(uuid, uuid, text, text, numeric, numeric) rename to set_exchange_rate_capability_impl;
revoke all on function public.set_exchange_rate_capability_impl(uuid, uuid, text, text, numeric, numeric) from public, anon, authenticated;
create function public.set_exchange_rate(target_org uuid, target_branch uuid, source_currency_input text, target_currency_input text, buy_rate_input numeric, sell_rate_input numeric)
returns public.rate_board_entries
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_capability(target_org, 'rates.manage', jsonb_strip_nulls(jsonb_build_object('branch_id', target_branch)));
  return public.set_exchange_rate_capability_impl(target_org, target_branch, source_currency_input, target_currency_input, buy_rate_input, sell_rate_input);
end;
$$;

revoke all on function public.create_money_account(uuid, text, text, uuid, text) from public, anon;
revoke all on function public.set_organization_currency(uuid, text, boolean) from public, anon;
revoke all on function public.set_exchange_rate(uuid, uuid, text, text, numeric, numeric) from public, anon;
grant execute on function public.create_money_account(uuid, text, text, uuid, text) to authenticated;
grant execute on function public.set_organization_currency(uuid, text, boolean) to authenticated;
grant execute on function public.set_exchange_rate(uuid, uuid, text, text, numeric, numeric) to authenticated;

-- Replace legacy owner/role gates for delegated operational administration.
-- Owner-only billing, ownership, deletion, and capital functions are intentionally
-- not changed here.
create or replace function public.create_counterparty(
  target_org uuid,
  display_name_input text,
  counterparty_type_input text default 'customer',
  phone_input text default null,
  notes_input text default null
)
returns public.counterparties
language plpgsql security definer set search_path = '' as $$
declare result public.counterparties; normalized_name text := trim(display_name_input);
begin
  perform public.require_capability(target_org, 'customers.manage', '{}'::jsonb);
  if length(normalized_name) < 2 or length(normalized_name) > 120 then raise exception 'Customer name must be between 2 and 120 characters'; end if;
  if counterparty_type_input not in ('walk_in', 'customer', 'saraf', 'hawala_partner', 'supplier', 'employee', 'other') then raise exception 'Choose a valid customer type'; end if;
  insert into public.counterparties (organization_id, display_name, phone, counterparty_type, notes)
  values (target_org, normalized_name, nullif(trim(phone_input), ''), counterparty_type_input, nullif(trim(notes_input), ''))
  returning * into result;
  return result;
end;
$$;

create or replace function public.update_organization_control_settings(command jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target_org uuid := nullif(command->>'organization_id', '')::uuid;
  previous public.organization_settings;
  result public.organization_settings;
  language_value text := coalesce(command->>'default_language', 'en');
  timezone_value text := coalesce(command->>'timezone', 'Asia/Kabul');
  receipt_value text := upper(trim(coalesce(command->>'receipt_prefix', 'SAR')));
  date_value text := coalesce(command->>'date_display', 'both');
  digit_value text := coalesce(command->>'digit_display', 'western');
  approval_value numeric := coalesce((command->>'approval_threshold_base')::numeric, 0);
  offline_value numeric := coalesce((command->>'offline_limit_base')::numeric, 0);
  negative_value boolean := coalesce((command->>'negative_cash_allowed')::boolean, false);
  cashier_profit_value boolean := coalesce((command->>'cashier_profit_hidden')::boolean, true);
begin
  perform public.require_capability(target_org, 'organization.manage', '{}'::jsonb);
  if language_value not in ('en', 'fa-AF', 'ps-AF') then raise exception 'Unsupported language'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = timezone_value) then raise exception 'Unsupported timezone'; end if;
  if receipt_value !~ '^[A-Z0-9-]{2,10}$' then raise exception 'Receipt prefix must contain 2 to 10 letters, numbers, or hyphens'; end if;
  if date_value not in ('gregorian', 'solar_hijri', 'both') then raise exception 'Unsupported date display'; end if;
  if digit_value not in ('western', 'localized') then raise exception 'Unsupported digit display'; end if;
  if approval_value < 0 or offline_value < 0 then raise exception 'Thresholds cannot be negative'; end if;
  select * into previous from public.organization_settings where organization_id = target_org for update;
  if previous.organization_id is null then raise exception 'Organization settings not found'; end if;
  if previous.negative_cash_allowed is distinct from negative_value
     or previous.approval_threshold_base is distinct from approval_value
     or previous.offline_limit_base is distinct from offline_value then perform public.require_aal2(); end if;
  update public.organization_settings
  set default_language = language_value, timezone = timezone_value, receipt_prefix = receipt_value,
      negative_cash_allowed = negative_value, date_display = date_value, digit_display = digit_value,
      approval_threshold_base = approval_value, offline_limit_base = offline_value,
      cashier_profit_hidden = cashier_profit_value, updated_at = now()
  where organization_id = target_org returning * into result;
  update public.organizations set timezone = timezone_value where id = target_org;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (target_org, (select auth.uid()), 'organization_controls_updated', jsonb_build_object(
    'date_display', date_value, 'digit_display', digit_value, 'approval_threshold_base', approval_value,
    'offline_limit_base', offline_value, 'negative_cash_allowed', negative_value,
    'cashier_profit_hidden', cashier_profit_value));
  return to_jsonb(result);
end;
$$;

create or replace function public.update_organization_profile(
  target_org uuid, display_name_input text, legal_name_input text,
  license_number_input text default null, license_expires_input date default null
)
returns public.organizations
language plpgsql security definer set search_path = '' as $$
declare result public.organizations;
begin
  perform public.require_capability(target_org, 'organization.manage', '{}'::jsonb);
  if length(trim(coalesce(display_name_input, ''))) < 2 or length(trim(coalesce(legal_name_input, ''))) < 2 then raise exception 'Business names are required'; end if;
  update public.organizations
  set display_name = trim(display_name_input), legal_name = trim(legal_name_input),
      license_number = nullif(trim(license_number_input), ''), license_expires_on = license_expires_input
  where id = target_org returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (target_org, (select auth.uid()), 'organization_profile_updated', jsonb_build_object('license_recorded', result.license_number is not null));
  return result;
end;
$$;

create or replace function public.create_organization_branch(target_org uuid, name_input text, timezone_input text default 'Asia/Kabul')
returns public.branches
language plpgsql security definer set search_path = '' as $$
declare result public.branches;
begin
  perform public.require_capability(target_org, 'organization.manage', '{}'::jsonb);
  if length(trim(coalesce(name_input, ''))) < 2 then raise exception 'Branch name is required'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = timezone_input) then raise exception 'Unsupported timezone'; end if;
  insert into public.branches (organization_id, name, timezone) values (target_org, trim(name_input), timezone_input) returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (target_org, (select auth.uid()), 'branch_created', jsonb_build_object('branch_id', result.id, 'name', result.name));
  return result;
end;
$$;

create or replace function public.set_organization_branch_state(target_branch uuid, active_input boolean, reason_input text)
returns public.branches
language plpgsql security definer set search_path = '' as $$
declare result public.branches; target_org uuid;
begin
  select b.organization_id into target_org from public.branches b where b.id = target_branch;
  perform public.require_capability(target_org, 'organization.manage', jsonb_build_object('branch_id', target_branch));
  select * into result from public.branches where id = target_branch for update;
  if result.id is null then raise exception 'Branch not found'; end if;
  if length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'Reason is required'; end if;
  if not active_input and exists (select 1 from public.cashboxes c where c.branch_id = target_branch and c.active) then raise exception 'Deactivate branch cashboxes first'; end if;
  update public.branches set active = active_input where id = target_branch returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (result.organization_id, (select auth.uid()), 'branch_state_changed', jsonb_build_object('branch_id', result.id, 'active', active_input, 'reason', trim(reason_input)));
  return result;
end;
$$;

create or replace function public.create_organization_cashbox(target_org uuid, target_branch uuid, name_input text)
returns public.cashboxes
language plpgsql security definer set search_path = '' as $$
declare result public.cashboxes;
begin
  perform public.require_capability(target_org, 'money_accounts.manage', jsonb_build_object('branch_id', target_branch));
  if length(trim(coalesce(name_input, ''))) < 2 then raise exception 'Cashbox name is required'; end if;
  if not exists (select 1 from public.branches where id = target_branch and organization_id = target_org and active) then raise exception 'Active branch required'; end if;
  insert into public.cashboxes (organization_id, branch_id, name) values (target_org, target_branch, trim(name_input)) returning * into result;
  insert into public.money_accounts (organization_id, branch_id, cashbox_id, name, account_type, created_by)
  values (target_org, target_branch, result.id, result.name, 'cashbox', (select auth.uid()));
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (target_org, (select auth.uid()), 'cashbox_created', jsonb_build_object('cashbox_id', result.id, 'branch_id', target_branch, 'name', result.name));
  return result;
end;
$$;

create or replace function public.set_organization_cashbox_state(target_cashbox uuid, active_input boolean, reason_input text)
returns public.cashboxes
language plpgsql security definer set search_path = '' as $$
declare result public.cashboxes; target_org uuid; target_branch uuid; balance_value numeric;
begin
  select c.organization_id, c.branch_id into target_org, target_branch from public.cashboxes c where c.id = target_cashbox;
  perform public.require_capability(target_org, 'money_accounts.manage', jsonb_build_object('branch_id', target_branch, 'cashbox_id', target_cashbox));
  select * into result from public.cashboxes where id = target_cashbox for update;
  if result.id is null then raise exception 'Cashbox not found'; end if;
  if length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'Reason is required'; end if;
  if not active_input then
    select coalesce(sum(jl.native_debit - jl.native_credit), 0) into balance_value
    from public.journal_lines jl join public.ledger_accounts la on la.id = jl.account_id
    where jl.organization_id = result.organization_id and la.cashbox_id = target_cashbox;
    if balance_value <> 0 then raise exception 'Move all money before deactivating this cashbox'; end if;
  end if;
  update public.cashboxes set active = active_input where id = target_cashbox returning * into result;
  update public.money_accounts set active = active_input where cashbox_id = target_cashbox;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (result.organization_id, (select auth.uid()), 'cashbox_state_changed', jsonb_build_object('cashbox_id', result.id, 'active', active_input, 'reason', trim(reason_input)));
  return result;
end;
$$;

create or replace function public.upsert_expense_category(target_org uuid, name_input text, active_input boolean default true)
returns public.expense_categories
language plpgsql security definer set search_path = '' as $$
declare result public.expense_categories;
begin
  perform public.require_capability(target_org, 'organization.manage', '{}'::jsonb);
  if length(trim(coalesce(name_input, ''))) < 2 then raise exception 'Category name is required'; end if;
  insert into public.expense_categories (organization_id, name, active)
  values (target_org, trim(name_input), active_input)
  on conflict (organization_id, name) do update set active = excluded.active returning * into result;
  return result;
end;
$$;

create or replace function public.set_organization_feature_state(target_org uuid, feature_input text, enabled_input boolean)
returns public.organization_features
language plpgsql security definer set search_path = '' as $$
declare result public.organization_features;
begin
  if not public.is_platform_admin() then perform public.require_capability(target_org, 'organization.manage', '{}'::jsonb); end if;
  if trim(coalesce(feature_input, '')) not in ('hawala', 'advanced_compliance', 'advanced_analytics', 'online_payments', 'imports') then raise exception 'Unsupported feature'; end if;
  insert into public.organization_features (organization_id, feature_code, enabled, updated_at)
  values (target_org, trim(feature_input), enabled_input, now())
  on conflict (organization_id, feature_code) do update set enabled = excluded.enabled, updated_at = now()
  returning * into result;
  return result;
end;
$$;

create or replace function public.create_rate_group(target_org uuid, name_input text, code_input text)
returns public.rate_groups
language plpgsql security definer set search_path = '' as $$
declare result public.rate_groups; clean_code text := lower(regexp_replace(trim(coalesce(code_input, '')), '[^a-zA-Z0-9_-]+', '-', 'g'));
begin
  perform public.require_capability(target_org, 'rates.manage', '{}'::jsonb);
  if length(trim(coalesce(name_input, ''))) < 2 or length(clean_code) < 2 then raise exception 'Rate group name and code are required'; end if;
  insert into public.rate_groups (organization_id, name, code) values (target_org, trim(name_input), clean_code) returning * into result;
  return result;
end;
$$;

create or replace function public.set_rate_group_exchange_rate(
  target_org uuid, target_group uuid, target_branch uuid, source_currency text,
  target_currency text, buy_rate_input numeric, sell_rate_input numeric,
  spread_tolerance_input numeric default null
)
returns public.rate_board_entries
language plpgsql security definer set search_path = '' as $$
declare result public.rate_board_entries;
begin
  perform public.require_capability(target_org, 'rates.manage', jsonb_strip_nulls(jsonb_build_object('branch_id', target_branch)));
  if not exists (select 1 from public.rate_groups where id = target_group and organization_id = target_org and active) then raise exception 'Active rate group required'; end if;
  if target_branch is not null and not exists (select 1 from public.branches where id = target_branch and organization_id = target_org and active) then raise exception 'Active branch required'; end if;
  if buy_rate_input <= 0 or sell_rate_input <= 0 or coalesce(spread_tolerance_input, 0) < 0 then raise exception 'Rates must be positive'; end if;
  if upper(source_currency) = upper(target_currency) then raise exception 'Currencies must differ'; end if;
  update public.rate_board_entries set active = false
  where organization_id = target_org and rate_group_id = target_group
    and branch_id is not distinct from target_branch
    and from_currency = upper(source_currency) and to_currency = upper(target_currency) and active;
  insert into public.rate_board_entries (
    organization_id, branch_id, rate_group_id, from_currency, to_currency,
    buy_rate, sell_rate, changed_by, spread_tolerance
  ) values (
    target_org, target_branch, target_group, upper(source_currency), upper(target_currency),
    buy_rate_input, sell_rate_input, (select auth.uid()), spread_tolerance_input
  ) returning * into result;
  return result;
end;
$$;

create or replace function public.create_valuation_rate_set(command jsonb)
returns public.valuation_rate_sets
language plpgsql security definer set search_path = '' as $$
declare
  target_org uuid := nullif(command->>'organization_id', '')::uuid;
  base_value text; result public.valuation_rate_sets; rate_item jsonb;
  currency_value text; rate_value numeric;
begin
  perform public.require_capability(target_org, 'rates.manage', '{}'::jsonb);
  select base_currency_code into base_value from public.organization_settings where organization_id = target_org;
  if base_value is null then raise exception 'Organization settings not found'; end if;
  if jsonb_array_length(coalesce(command->'rates', '[]'::jsonb)) = 0 then raise exception 'At least one valuation rate is required'; end if;
  update public.valuation_rate_sets set active = false where organization_id = target_org and active;
  insert into public.valuation_rate_sets (organization_id, name, base_currency, effective_at, created_by, source)
  values (target_org, trim(command->>'name'), base_value, coalesce((command->>'effective_at')::timestamptz, now()), (select auth.uid()), 'owner')
  returning * into result;
  for rate_item in select value from jsonb_array_elements(command->'rates') loop
    currency_value := upper(rate_item->>'currency_code'); rate_value := (rate_item->>'rate')::numeric;
    if currency_value = base_value or rate_value is null or rate_value <= 0 then raise exception 'Invalid valuation rate'; end if;
    if not exists (select 1 from public.organization_currencies where organization_id = target_org and currency_code = currency_value and enabled) then raise exception 'Valuation currency is not enabled'; end if;
    insert into public.valuation_rates (rate_set_id, organization_id, currency_code, base_currency, rate)
    values (result.id, target_org, currency_value, base_value, rate_value);
  end loop;
  return result;
end;
$$;

revoke all on function public.create_counterparty(uuid, text, text, text, text) from public, anon;
revoke all on function public.update_organization_control_settings(jsonb) from public, anon;
revoke all on function public.update_organization_profile(uuid, text, text, text, date) from public, anon;
revoke all on function public.create_organization_branch(uuid, text, text) from public, anon;
revoke all on function public.set_organization_branch_state(uuid, boolean, text) from public, anon;
revoke all on function public.create_organization_cashbox(uuid, uuid, text) from public, anon;
revoke all on function public.set_organization_cashbox_state(uuid, boolean, text) from public, anon;
revoke all on function public.upsert_expense_category(uuid, text, boolean) from public, anon;
revoke all on function public.set_organization_feature_state(uuid, text, boolean) from public, anon;
revoke all on function public.create_rate_group(uuid, text, text) from public, anon;
revoke all on function public.set_rate_group_exchange_rate(uuid, uuid, uuid, text, text, numeric, numeric, numeric) from public, anon;
revoke all on function public.create_valuation_rate_set(jsonb) from public, anon;
grant execute on function public.create_counterparty(uuid, text, text, text, text) to authenticated;
grant execute on function public.update_organization_control_settings(jsonb) to authenticated;
grant execute on function public.update_organization_profile(uuid, text, text, text, date) to authenticated;
grant execute on function public.create_organization_branch(uuid, text, text) to authenticated;
grant execute on function public.set_organization_branch_state(uuid, boolean, text) to authenticated;
grant execute on function public.create_organization_cashbox(uuid, uuid, text) to authenticated;
grant execute on function public.set_organization_cashbox_state(uuid, boolean, text) to authenticated;
grant execute on function public.upsert_expense_category(uuid, text, boolean) to authenticated;
grant execute on function public.set_organization_feature_state(uuid, text, boolean) to authenticated;
grant execute on function public.create_rate_group(uuid, text, text) to authenticated;
grant execute on function public.set_rate_group_exchange_rate(uuid, uuid, uuid, text, text, numeric, numeric, numeric) to authenticated;
grant execute on function public.create_valuation_rate_set(jsonb) to authenticated;

create or replace function public.set_membership_capability(
  target_membership uuid,
  capability text,
  allowed_input boolean,
  branch_scope uuid[] default '{}',
  cashbox_scope uuid[] default '{}',
  limits_input jsonb default '{}'::jsonb,
  reason_input text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_membership public.organization_memberships;
  member public.organization_memberships;
  capability_row public.capability_definitions;
begin
  select * into member from public.organization_memberships where id = target_membership for update;
  if member.id is null then raise exception 'Team member not found'; end if;
  perform public.require_capability(member.organization_id, 'team.capabilities.manage', '{}'::jsonb);
  perform public.require_aal2();
  select * into actor_membership from public.organization_memberships
    where organization_id = member.organization_id and user_id = (select auth.uid()) and active;
  select * into capability_row from public.capability_definitions where capability_code = capability;
  if capability_row.capability_code is null then raise exception 'Unknown capability'; end if;
  if member.role_code = 'owner' then raise exception 'Owner capabilities cannot be changed here'; end if;
  if capability_row.owner_only then raise exception 'Owner-only capabilities cannot be delegated'; end if;
  if actor_membership.role_code <> 'owner' and member.id = actor_membership.id then
    raise exception 'A delegated administrator cannot change their own capabilities';
  end if;
  if actor_membership.role_code <> 'owner' and member.role_code = 'business_admin' then
    raise exception 'Only the owner can change another business administrator';
  end if;
  if allowed_input and actor_membership.role_code <> 'owner'
     and not public.has_capability(member.organization_id, capability, '{}'::jsonb) then
    raise exception 'A delegated administrator cannot grant a capability they do not hold';
  end if;
  if length(trim(reason_input)) < 2 then raise exception 'A reason is required'; end if;
  if not public.capability_limits_are_valid(coalesce(limits_input, '{}'::jsonb)) then
    raise exception 'Capability limits must be non-negative numbers with uppercase three-letter currency keys';
  end if;
  if exists (
    select 1 from unnest(coalesce(branch_scope, '{}'::uuid[])) selected_id
    where not exists (
      select 1 from public.branches b
      where b.id = selected_id and b.organization_id = member.organization_id and b.active
    )
  ) then raise exception 'A selected branch is not active for this business'; end if;
  if exists (
    select 1 from unnest(coalesce(cashbox_scope, '{}'::uuid[])) selected_id
    where not exists (
      select 1 from public.cashboxes c
      where c.id = selected_id and c.organization_id = member.organization_id and c.active
    )
  ) then raise exception 'A selected cashbox is not active for this business'; end if;

  insert into public.membership_capability_overrides
    (membership_id, capability_code, allowed, branch_ids, cashbox_ids, limits, granted_by, reason)
  values
    (member.id, capability, allowed_input, coalesce(branch_scope, '{}'), coalesce(cashbox_scope, '{}'), coalesce(limits_input, '{}'), (select auth.uid()), trim(reason_input))
  on conflict (membership_id, capability_code) do update
  set allowed = excluded.allowed,
      branch_ids = excluded.branch_ids,
      cashbox_ids = excluded.cashbox_ids,
      limits = excluded.limits,
      granted_by = excluded.granted_by,
      reason = excluded.reason,
      updated_at = now();
  insert into public.security_audit_events (organization_id, actor_user_id, target_user_id, event_type, metadata)
  values (
    member.organization_id,
    (select auth.uid()),
    member.user_id,
    'membership_capability_changed',
    jsonb_build_object('membership_id', member.id, 'capability', capability, 'allowed', allowed_input, 'branch_ids', coalesce(branch_scope, '{}'), 'cashbox_ids', coalesce(cashbox_scope, '{}'), 'limits', coalesce(limits_input, '{}'), 'reason', trim(reason_input))
  );
  return jsonb_build_object('membership_id', member.id, 'capability', capability, 'allowed', allowed_input);
end;
$$;

revoke all on function public.set_membership_capability(uuid, text, boolean, uuid[], uuid[], jsonb, text) from public, anon;
grant execute on function public.set_membership_capability(uuid, text, boolean, uuid[], uuid[], jsonb, text) to authenticated;

create or replace function public.update_team_assignment_v4(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_membership uuid := nullif(command->>'membership_id', '')::uuid;
  member public.organization_memberships;
  actor_role text;
  new_role text := command->>'role';
  branch_scope uuid[] := coalesce(array(select distinct value::uuid from jsonb_array_elements_text(coalesce(command->'branch_ids', '[]'::jsonb))), '{}'::uuid[]);
  cashbox_scope uuid[] := coalesce(array(select distinct value::uuid from jsonb_array_elements_text(coalesce(command->'cashbox_ids', '[]'::jsonb))), '{}'::uuid[]);
  assignments jsonb := coalesce(command->'capability_overrides', '[]'::jsonb);
  limits_input jsonb := coalesce(command->'limits', '{}'::jsonb);
  active_input boolean := coalesce((command->>'active')::boolean, true);
  reason_input text := trim(command->>'reason');
  item jsonb;
  result jsonb;
begin
  select * into member from public.organization_memberships where id = target_membership;
  if member.id is null then raise exception 'Team member not found'; end if;
  perform public.require_capability(member.organization_id, 'team.manage', '{}'::jsonb);
  perform public.require_capability(member.organization_id, 'team.capabilities.manage', '{}'::jsonb);
  perform public.require_aal2();
  select role_code into actor_role from public.organization_memberships
  where organization_id = member.organization_id and user_id = (select auth.uid()) and active;
  if member.role_code = 'owner' or member.user_id = (select auth.uid()) then raise exception 'Your own access cannot be changed here'; end if;
  if (member.role_code = 'business_admin' or new_role = 'business_admin') and actor_role <> 'owner' then raise exception 'Only the owner can change Business Administrator access'; end if;
  if jsonb_typeof(assignments) <> 'array' then raise exception 'Capability assignment must be a list'; end if;
  if not public.capability_limits_are_valid(limits_input) then raise exception 'Capability limits are invalid'; end if;
  if new_role = 'business_admin' then
    result := public.delegate_business_admin(member.id, active_input, reason_input);
  else
    result := public.update_team_membership(member.id, new_role, branch_scope, cashbox_scope, active_input, reason_input);
  end if;
  for item in select value from jsonb_array_elements(assignments) loop
    perform public.set_membership_capability(
      member.id, item->>'capability', coalesce((item->>'allowed')::boolean, true),
      branch_scope, cashbox_scope, limits_input, reason_input
    );
  end loop;
  return result || jsonb_build_object('capability_overrides', assignments, 'limits', limits_input);
end;
$$;

revoke all on function public.update_team_assignment_v4(jsonb) from public, anon;
grant execute on function public.update_team_assignment_v4(jsonb) to authenticated;

alter table public.team_invitations
  add column if not exists capability_overrides jsonb not null default '[]'::jsonb,
  add column if not exists capability_limits jsonb not null default '{}'::jsonb;
alter table public.team_invitations
  drop constraint if exists team_invitations_capability_limits_check;
alter table public.team_invitations
  add constraint team_invitations_capability_limits_check
  check (public.capability_limits_are_valid(capability_limits));

create or replace function public.create_team_invitation_v4(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid := nullif(command->>'organization_id', '')::uuid;
  actor_id uuid := (select auth.uid());
  actor_role text;
  normalized_email text := lower(trim(command->>'email'));
  normalized_name text := trim(command->>'display_name');
  invited_role text := command->>'role';
  normalized_branches uuid[] := coalesce(array(select distinct value::uuid from jsonb_array_elements_text(coalesce(command->'branch_ids', '[]'::jsonb))), '{}'::uuid[]);
  normalized_cashboxes uuid[] := coalesce(array(select distinct value::uuid from jsonb_array_elements_text(coalesce(command->'cashbox_ids', '[]'::jsonb))), '{}'::uuid[]);
  requested_overrides jsonb := coalesce(command->'capability_overrides', '[]'::jsonb);
  requested_limits jsonb := coalesce(command->'limits', '{}'::jsonb);
  requires_mfa boolean := coalesce((command->>'requires_mfa')::boolean, true);
  invitation public.team_invitations;
  invitation_token text;
  raw_code text;
  item jsonb;
begin
  perform public.require_capability(target_org, 'team.invite', '{}'::jsonb);
  perform public.require_aal2();
  select role_code into actor_role from public.organization_memberships
  where organization_id = target_org and user_id = actor_id and active;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'A valid employee email is required'; end if;
  if length(normalized_name) not between 2 and 100 then raise exception 'Employee name must be between 2 and 100 characters'; end if;
  if invited_role not in ('manager', 'accountant', 'cashier', 'viewer', 'compliance_officer') then raise exception 'Choose a valid employee role'; end if;
  if jsonb_typeof(requested_overrides) <> 'array' then raise exception 'Capability assignment must be a list'; end if;
  if not public.capability_limits_are_valid(requested_limits) then raise exception 'Capability limits are invalid'; end if;
  if exists (select 1 from unnest(normalized_branches) id where not exists (select 1 from public.branches b where b.id = id and b.organization_id = target_org and b.active)) then raise exception 'A selected branch is not active for this business'; end if;
  if exists (select 1 from unnest(normalized_cashboxes) id where not exists (select 1 from public.cashboxes c where c.id = id and c.organization_id = target_org and c.active)) then raise exception 'A selected cashbox is not active for this business'; end if;
  if invited_role = 'cashier' and (cardinality(normalized_branches) = 0 or cardinality(normalized_cashboxes) = 0) then raise exception 'A cashier must be assigned to a branch and cashbox'; end if;
  if invited_role = 'cashier' and exists (select 1 from public.cashboxes c where c.id = any(normalized_cashboxes) and not (c.branch_id = any(normalized_branches))) then raise exception 'Every selected cashbox must belong to a selected branch'; end if;
  for item in select value from jsonb_array_elements(requested_overrides) loop
    if not exists (select 1 from public.capability_definitions d where d.capability_code = item->>'capability') then raise exception 'Unknown capability in invitation'; end if;
    if exists (select 1 from public.capability_definitions d where d.capability_code = item->>'capability' and d.owner_only) then raise exception 'Owner-only capabilities cannot be delegated'; end if;
    if coalesce((item->>'allowed')::boolean, true) and actor_role <> 'owner'
       and not public.has_capability(target_org, item->>'capability', '{}'::jsonb) then
      raise exception 'A delegated administrator cannot grant a capability they do not hold';
    end if;
  end loop;
  if exists (select 1 from public.organization_memberships m join auth.users u on u.id = m.user_id where m.organization_id = target_org and lower(u.email) = normalized_email and m.active) then raise exception 'This email already belongs to an active team member'; end if;
  update public.team_invitations set status = 'expired' where organization_id = target_org and lower(email) = normalized_email and status = 'pending' and expires_at <= now();
  if exists (select 1 from public.team_invitations where organization_id = target_org and lower(email) = normalized_email and status = 'pending') then raise exception 'A pending invitation already exists for this email'; end if;
  invitation_token := encode(extensions.gen_random_bytes(32), 'hex');
  raw_code := upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 10));
  insert into public.team_invitations (
    organization_id, email, display_name, role_code, branch_ids, cashbox_ids, mfa_required,
    token_hash, connection_code_hash, invited_by, expires_at, capability_overrides, capability_limits
  ) values (
    target_org, normalized_email, normalized_name, invited_role, normalized_branches, normalized_cashboxes, requires_mfa,
    encode(extensions.digest(invitation_token, 'sha256'), 'hex'), encode(extensions.digest(raw_code, 'sha256'), 'hex'),
    actor_id, now() + interval '72 hours', requested_overrides, requested_limits
  ) returning * into invitation;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (target_org, actor_id, 'team_invitation_created_v4', jsonb_build_object(
    'invitation_id', invitation.id, 'email', normalized_email, 'role', invited_role,
    'branch_count', cardinality(normalized_branches), 'cashbox_count', cardinality(normalized_cashboxes),
    'capability_overrides', requested_overrides, 'limits', requested_limits, 'requires_mfa', requires_mfa));
  return jsonb_build_object(
    'id', invitation.id, 'invite_token', invitation_token, 'connection_code', raw_code,
    'email', invitation.email, 'display_name', invitation.display_name,
    'role_code', invitation.role_code, 'expires_at', invitation.expires_at
  );
end;
$$;

create or replace function public.apply_team_invitation_capabilities()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare membership_id_value uuid; item jsonb;
begin
  if new.status <> 'accepted' or old.status = 'accepted' or new.accepted_by is null then return new; end if;
  select id into membership_id_value from public.organization_memberships
  where organization_id = new.organization_id and user_id = new.accepted_by and active;
  if membership_id_value is null then raise exception 'Accepted invitation membership was not created'; end if;
  for item in select value from jsonb_array_elements(coalesce(new.capability_overrides, '[]'::jsonb)) loop
    insert into public.membership_capability_overrides
      (membership_id, capability_code, allowed, branch_ids, cashbox_ids, limits, granted_by, reason)
    values (
      membership_id_value, item->>'capability', coalesce((item->>'allowed')::boolean, true),
      new.branch_ids, new.cashbox_ids, new.capability_limits, new.invited_by, 'Pre-approved team invitation assignment'
    )
    on conflict (membership_id, capability_code) do update
    set allowed = excluded.allowed, branch_ids = excluded.branch_ids, cashbox_ids = excluded.cashbox_ids,
        limits = excluded.limits, granted_by = excluded.granted_by, reason = excluded.reason, updated_at = now();
  end loop;
  return new;
end;
$$;

drop trigger if exists team_invitation_apply_capabilities on public.team_invitations;
create trigger team_invitation_apply_capabilities
after update of status on public.team_invitations
for each row execute function public.apply_team_invitation_capabilities();

create or replace function public.get_membership_capability_matrix(target_org uuid)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select case when not public.has_capability(target_org, 'team.view', '{}'::jsonb) then '[]'::jsonb else
    coalesce(jsonb_agg(jsonb_build_object(
      'membership_id', m.id,
      'role_code', m.role_code,
      'effective_capabilities', coalesce((
        select jsonb_agg(d.capability_code order by d.capability_code)
        from public.capability_definitions d
        left join public.membership_capability_overrides mo
          on mo.membership_id = m.id and mo.capability_code = d.capability_code
        where coalesce(
          mo.allowed,
          exists (select 1 from public.role_capabilities rc where rc.role_code = m.role_code and rc.capability_code = d.capability_code)
        )
          and (not d.owner_only or m.role_code = 'owner')
      ), '[]'::jsonb),
      'overrides', coalesce((
        select jsonb_agg(jsonb_build_object(
          'capability', o.capability_code, 'allowed', o.allowed, 'branch_ids', o.branch_ids,
          'cashbox_ids', o.cashbox_ids, 'limits', o.limits
        ) order by o.capability_code)
        from public.membership_capability_overrides o where o.membership_id = m.id
      ), '[]'::jsonb)
    ) order by m.created_at), '[]'::jsonb) end
  from public.organization_memberships m
  where m.organization_id = target_org;
$$;

revoke all on function public.create_team_invitation_v4(jsonb) from public, anon;
revoke all on function public.apply_team_invitation_capabilities() from public, anon, authenticated;
revoke all on function public.get_membership_capability_matrix(uuid) from public, anon;
grant execute on function public.create_team_invitation_v4(jsonb) to authenticated;
grant execute on function public.get_membership_capability_matrix(uuid) to authenticated;

-- Independent join requests are deliberately separate from pre-approved invites.
-- A request creates no membership and therefore has no access to financial data.
create table if not exists public.organization_join_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null,
  code_hash text not null,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (code_hash)
);

create index if not exists organization_join_codes_active_org_idx
  on public.organization_join_codes (organization_id, expires_at) where active;

create table if not exists public.worker_join_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  decision_reason text,
  assigned_role text check (assigned_role is null or assigned_role in ('business_admin', 'manager', 'accountant', 'cashier', 'viewer', 'compliance_officer')),
  branch_ids uuid[] not null default '{}',
  cashbox_ids uuid[] not null default '{}',
  capability_overrides jsonb not null default '[]'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  mfa_required boolean not null default true,
  device_review_required boolean not null default true
);

create unique index if not exists worker_join_requests_one_pending_idx
  on public.worker_join_requests (organization_id, requested_by) where status = 'pending';
create index if not exists worker_join_requests_review_idx
  on public.worker_join_requests (organization_id, status, requested_at desc);

alter table public.organization_join_codes enable row level security;
alter table public.worker_join_requests enable row level security;
revoke all on public.organization_join_codes, public.worker_join_requests from public, anon, authenticated;

create or replace function public.create_organization_join_code(
  target_org uuid,
  label_input text default 'Team access',
  expires_at_input timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare raw_code text; created public.organization_join_codes;
begin
  perform public.require_capability(target_org, 'team.manage', '{}'::jsonb);
  perform public.require_aal2();
  if length(trim(label_input)) not between 2 and 80 then raise exception 'A short code label is required'; end if;
  if expires_at_input is not null and expires_at_input <= now() then raise exception 'The expiry must be in the future'; end if;
  raw_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 12));
  insert into public.organization_join_codes (organization_id, label, code_hash, created_by, expires_at)
  values (target_org, trim(label_input), encode(extensions.digest(raw_code, 'sha256'), 'hex'), (select auth.uid()), expires_at_input)
  returning * into created;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (target_org, (select auth.uid()), 'organization_join_code_created', jsonb_build_object('join_code_id', created.id, 'label', created.label, 'expires_at', created.expires_at));
  return jsonb_build_object('id', created.id, 'connection_code', raw_code, 'label', created.label, 'expires_at', created.expires_at);
end;
$$;

create or replace function public.request_business_access(connection_code text, requested_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_email text := lower(trim(coalesce(auth.jwt()->>'email', '')));
  normalized_code text := upper(regexp_replace(coalesce(connection_code, ''), '[^A-Za-z0-9]', '', 'g'));
  join_code public.organization_join_codes;
  request_row public.worker_join_requests;
begin
  if actor_id is null or actor_email = '' then raise exception 'Sign in before requesting access'; end if;
  if length(normalized_code) <> 12 then raise exception 'Enter the 12-character business code'; end if;
  if length(trim(requested_name)) not between 2 and 100 then raise exception 'Your name must be between 2 and 100 characters'; end if;
  select * into join_code from public.organization_join_codes
  where code_hash = encode(extensions.digest(normalized_code, 'sha256'), 'hex') and active
    and (expires_at is null or expires_at > now())
  for update;
  if join_code.id is null then raise exception 'Business code not found or expired'; end if;
  if exists (
    select 1 from public.organization_memberships
    where organization_id = join_code.organization_id and user_id = actor_id and active
  ) then raise exception 'This account is already connected to the business'; end if;
  if exists (
    select 1 from public.worker_join_requests
    where organization_id = join_code.organization_id and requested_by = actor_id and status = 'pending'
  ) then raise exception 'Your request is already waiting for review'; end if;
  insert into public.worker_join_requests (organization_id, requested_by, display_name, email)
  values (join_code.organization_id, actor_id, trim(requested_name), actor_email)
  returning * into request_row;
  insert into public.security_audit_events (organization_id, actor_user_id, target_user_id, event_type, metadata)
  values (join_code.organization_id, actor_id, actor_id, 'worker_join_requested', jsonb_build_object('request_id', request_row.id, 'join_code_id', join_code.id));
  return jsonb_build_object('request_id', request_row.id, 'organization_id', request_row.organization_id, 'status', request_row.status);
end;
$$;

create or replace function public.get_worker_join_requests(target_org uuid)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when not public.has_capability(target_org, 'team.view', '{}'::jsonb) then '[]'::jsonb
    else coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'display_name', r.display_name,
      'email', r.email,
      'status', r.status,
      'requested_at', r.requested_at,
      'assigned_role', r.assigned_role,
      'branch_ids', r.branch_ids,
      'cashbox_ids', r.cashbox_ids,
      'capability_overrides', r.capability_overrides,
      'limits', r.limits,
      'mfa_required', r.mfa_required,
      'device_review_required', r.device_review_required
    ) order by r.requested_at desc), '[]'::jsonb)
    end
  from public.worker_join_requests r
  where r.organization_id = target_org;
$$;

create or replace function public.review_worker_join_request(
  target_request uuid,
  decision_input text,
  role_input text default null,
  branch_scope uuid[] default '{}',
  cashbox_scope uuid[] default '{}',
  capability_overrides_input jsonb default '[]'::jsonb,
  limits_input jsonb default '{}'::jsonb,
  requires_mfa boolean default true,
  reason_input text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare request_row public.worker_join_requests; membership public.organization_memberships; item jsonb; actor_role text;
begin
  select * into request_row from public.worker_join_requests where id = target_request for update;
  if request_row.id is null then raise exception 'Join request not found'; end if;
  perform public.require_capability(request_row.organization_id, 'team.manage', '{}'::jsonb);
  perform public.require_aal2();
  if request_row.status <> 'pending' then raise exception 'This join request has already been reviewed'; end if;
  if lower(decision_input) not in ('approved', 'rejected') then raise exception 'Choose approve or reject'; end if;
  if length(trim(reason_input)) < 2 then raise exception 'A review reason is required'; end if;
  if not public.capability_limits_are_valid(coalesce(limits_input, '{}'::jsonb)) then
    raise exception 'Capability limits must be non-negative numbers with uppercase three-letter currency keys';
  end if;

  if lower(decision_input) = 'approved' then
    select role_code into actor_role from public.organization_memberships
    where organization_id = request_row.organization_id and user_id = (select auth.uid()) and active;
    if role_input not in ('business_admin', 'manager', 'accountant', 'cashier', 'viewer', 'compliance_officer') then raise exception 'Choose a valid worker role'; end if;
    if role_input = 'business_admin' and not exists (
      select 1 from public.organization_memberships
      where organization_id = request_row.organization_id and user_id = (select auth.uid()) and active and role_code = 'owner'
    ) then raise exception 'Only the owner can approve a business administrator'; end if;
    if role_input = 'cashier' and (cardinality(coalesce(branch_scope, '{}')) = 0 or cardinality(coalesce(cashbox_scope, '{}')) = 0) then
      raise exception 'A cashier must be assigned to a branch and cashbox';
    end if;
    if exists (select 1 from unnest(coalesce(branch_scope, '{}'::uuid[])) id where not exists (select 1 from public.branches b where b.id = id and b.organization_id = request_row.organization_id and b.active)) then raise exception 'A selected branch is not active for this business'; end if;
    if exists (select 1 from unnest(coalesce(cashbox_scope, '{}'::uuid[])) id where not exists (select 1 from public.cashboxes c where c.id = id and c.organization_id = request_row.organization_id and c.active)) then raise exception 'A selected cashbox is not active for this business'; end if;
    if jsonb_typeof(coalesce(capability_overrides_input, '[]'::jsonb)) <> 'array' then raise exception 'Capability assignment must be a list'; end if;
    insert into public.organization_memberships (organization_id, user_id, role_code, active, mfa_required)
    values (request_row.organization_id, request_row.requested_by, role_input, true, requires_mfa)
    on conflict (organization_id, user_id) do update
      set role_code = excluded.role_code, active = true, mfa_required = excluded.mfa_required
    returning * into membership;
    insert into public.profiles (id, display_name) values (request_row.requested_by, request_row.display_name)
    on conflict (id) do update set display_name = excluded.display_name, updated_at = now();
    delete from public.organization_branch_access where membership_id = membership.id;
    delete from public.organization_cashbox_access where membership_id = membership.id;
    insert into public.organization_branch_access (membership_id, branch_id)
      select membership.id, selected_id from unnest(coalesce(branch_scope, '{}')) selected_id on conflict do nothing;
    insert into public.organization_cashbox_access (membership_id, cashbox_id)
      select membership.id, selected_id from unnest(coalesce(cashbox_scope, '{}')) selected_id on conflict do nothing;
    for item in select value from jsonb_array_elements(coalesce(capability_overrides_input, '[]'::jsonb)) loop
      if exists (select 1 from public.capability_definitions d where d.capability_code = item->>'capability' and d.owner_only) then
        raise exception 'Owner-only capabilities cannot be delegated';
      end if;
      if not exists (select 1 from public.capability_definitions d where d.capability_code = item->>'capability') then
        raise exception 'Unknown capability in join request';
      end if;
      if coalesce((item->>'allowed')::boolean, true) and actor_role <> 'owner'
         and not public.has_capability(request_row.organization_id, item->>'capability', '{}'::jsonb) then
        raise exception 'A delegated administrator cannot grant a capability they do not hold';
      end if;
      insert into public.membership_capability_overrides
        (membership_id, capability_code, allowed, branch_ids, cashbox_ids, limits, granted_by, reason)
      values (
        membership.id,
        item->>'capability',
        coalesce((item->>'allowed')::boolean, true),
        coalesce(branch_scope, '{}'),
        coalesce(cashbox_scope, '{}'),
        coalesce(limits_input, '{}'),
        (select auth.uid()),
        trim(reason_input)
      )
      on conflict (membership_id, capability_code) do update
      set allowed = excluded.allowed, branch_ids = excluded.branch_ids, cashbox_ids = excluded.cashbox_ids,
          limits = excluded.limits, granted_by = excluded.granted_by, reason = excluded.reason, updated_at = now();
    end loop;
  end if;

  update public.worker_join_requests
  set status = lower(decision_input), decided_at = now(), decided_by = (select auth.uid()),
      decision_reason = trim(reason_input), assigned_role = case when lower(decision_input) = 'approved' then role_input else null end,
      branch_ids = coalesce(branch_scope, '{}'), cashbox_ids = coalesce(cashbox_scope, '{}'),
      capability_overrides = coalesce(capability_overrides_input, '[]'), limits = coalesce(limits_input, '{}'),
      mfa_required = requires_mfa
  where id = request_row.id;
  insert into public.security_audit_events (organization_id, actor_user_id, target_user_id, event_type, metadata)
  values (
    request_row.organization_id,
    (select auth.uid()),
    request_row.requested_by,
    'worker_join_reviewed',
    jsonb_build_object('request_id', request_row.id, 'decision', lower(decision_input), 'role', role_input, 'branch_ids', coalesce(branch_scope, '{}'), 'cashbox_ids', coalesce(cashbox_scope, '{}'), 'mfa_required', requires_mfa, 'device_review_required', true, 'reason', trim(reason_input))
  );
  return jsonb_build_object('request_id', request_row.id, 'status', lower(decision_input), 'membership_id', membership.id);
end;
$$;

revoke all on function public.create_organization_join_code(uuid, text, timestamptz) from public, anon;
revoke all on function public.request_business_access(text, text) from public, anon;
revoke all on function public.get_worker_join_requests(uuid) from public, anon;
revoke all on function public.review_worker_join_request(uuid, text, text, uuid[], uuid[], jsonb, jsonb, boolean, text) from public, anon;
grant execute on function public.create_organization_join_code(uuid, text, timestamptz) to authenticated;
grant execute on function public.request_business_access(text, text) to authenticated;
grant execute on function public.get_worker_join_requests(uuid) to authenticated;
grant execute on function public.review_worker_join_request(uuid, text, text, uuid[], uuid[], jsonb, jsonb, boolean, text) to authenticated;

-- Rollback plan: revoke/drop the capability, invitation, assignment, and
-- join-request RPCs added above; remove the added invitation/join-request columns;
-- drop the capability wrappers and rename every *_capability_impl function back
-- to its original name; restore the previous get_my_workspace_context(); then
-- drop the capability trigger and tables. No financial rows are rewritten here.
