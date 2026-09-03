-- Close the remaining production-web control gaps from the master build command.
-- Native packaging and authoritative offline posting remain intentionally out of scope.

alter table public.organizations
  add column if not exists license_number text,
  add column if not exists license_expires_on date;

alter table public.organization_settings
  add column if not exists date_display text not null default 'both'
    check (date_display in ('gregorian', 'solar_hijri', 'both')),
  add column if not exists digit_display text not null default 'western'
    check (digit_display in ('western', 'localized')),
  add column if not exists default_cost_basis text not null default 'weighted_average'
    check (default_cost_basis = 'weighted_average'),
  add column if not exists approval_threshold_base numeric(38,12) not null default 0
    check (approval_threshold_base >= 0),
  add column if not exists cashier_profit_hidden boolean not null default true,
  add column if not exists receipt_number_pattern text not null default '{PREFIX}-{YYYY}-{SEQ}';

create table if not exists public.support_access_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  support_user_id uuid not null references auth.users(id) on delete cascade,
  requested_scope text[] not null default array['diagnostics']::text[],
  reason text not null,
  requested_hours integer not null default 2 check (requested_hours between 1 and 24),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'revoked', 'expired')),
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_reason text,
  grant_id uuid references public.support_access_grants(id),
  check (cardinality(requested_scope) > 0),
  check (requested_scope <@ array['diagnostics', 'configuration', 'security_events']::text[])
);

create unique index if not exists support_access_one_pending_idx
  on public.support_access_requests (organization_id, support_user_id)
  where status = 'pending';

create table if not exists public.platform_app_versions (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('web', 'android', 'ios')),
  minimum_version text not null,
  recommended_version text not null,
  force_update boolean not null default false,
  release_notes_en text not null default '',
  release_notes_dari text not null default '',
  release_notes_pashto text not null default '',
  active boolean not null default true,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (platform)
);

create table if not exists public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  announcement_type text not null default 'maintenance'
    check (announcement_type in ('maintenance', 'security', 'service')),
  message_en text not null,
  message_dari text not null,
  message_pashto text not null,
  active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

alter table public.support_access_requests enable row level security;
alter table public.platform_app_versions enable row level security;
alter table public.platform_announcements enable row level security;

revoke all on public.support_access_requests from anon, authenticated;
revoke all on public.platform_app_versions from anon, authenticated;
revoke all on public.platform_announcements from anon, authenticated;

create or replace function public.is_org_owner(target_org uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_platform_user_active() and exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.active
      and m.role_code = 'owner'
  );
$$;

create or replace function public.has_active_support_access(target_org uuid, required_scope text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_platform_admin() and exists (
    select 1
    from public.support_access_grants g
    where g.organization_id = target_org
      and g.support_user_id = (select auth.uid())
      and g.revoked_at is null
      and g.expires_at > now()
      and required_scope = any(g.scope)
  );
$$;

create or replace function public.get_organization_control_plane(target_org uuid)
returns jsonb
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_org_member(target_org) then raise exception 'Organization membership required'; end if;
  select jsonb_build_object(
    'organization', jsonb_build_object(
      'id', o.id,
      'display_name', o.display_name,
      'legal_name', o.legal_name,
      'license_number', o.license_number,
      'license_expires_on', o.license_expires_on
    ),
    'settings', to_jsonb(s),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'timezone', b.timezone, 'active', b.active) order by b.created_at)
      from public.branches b where b.organization_id = target_org
    ), '[]'::jsonb),
    'cashboxes', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'branch_id', c.branch_id, 'active', c.active) order by c.created_at)
      from public.cashboxes c where c.organization_id = target_org
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', ec.id, 'name', ec.name, 'active', ec.active) order by ec.name)
      from public.expense_categories ec where ec.organization_id = target_org
    ), '[]'::jsonb),
    'features', coalesce((
      select jsonb_agg(jsonb_build_object('code', f.feature_code, 'enabled', f.enabled) order by f.feature_code)
      from public.organization_features f where f.organization_id = target_org
    ), '[]'::jsonb),
    'rate_groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rg.id, 'name', rg.name, 'code', rg.code, 'active', rg.active,
        'rates', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', rbe.id, 'branch_id', rbe.branch_id, 'from_currency', rbe.from_currency,
            'to_currency', rbe.to_currency, 'buy_rate', rbe.buy_rate,
            'sell_rate', rbe.sell_rate, 'spread_tolerance', rbe.spread_tolerance,
            'effective_from', rbe.effective_from, 'active', rbe.active
          ) order by rbe.effective_from desc)
          from public.rate_board_entries rbe where rbe.rate_group_id = rg.id
        ), '[]'::jsonb)
      ) order by rg.name)
      from public.rate_groups rg where rg.organization_id = target_org
    ), '[]'::jsonb),
    'valuation_sets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', vrs.id, 'name', vrs.name, 'base_currency', vrs.base_currency,
        'effective_at', vrs.effective_at, 'source', vrs.source, 'active', vrs.active,
        'rates', coalesce((
          select jsonb_agg(jsonb_build_object('currency_code', vr.currency_code, 'rate', vr.rate) order by vr.currency_code)
          from public.valuation_rates vr where vr.rate_set_id = vrs.id
        ), '[]'::jsonb)
      ) order by vrs.effective_at desc)
      from public.valuation_rate_sets vrs where vrs.organization_id = target_org
    ), '[]'::jsonb),
    'periods', coalesce((
      select jsonb_agg(to_jsonb(ap) order by ap.starts_on desc)
      from public.accounting_periods ap where ap.organization_id = target_org
    ), '[]'::jsonb),
    'support_requests', case when public.is_org_owner(target_org) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sar.id, 'reason', sar.reason, 'requested_scope', sar.requested_scope,
        'requested_hours', sar.requested_hours, 'status', sar.status,
        'requested_at', sar.requested_at, 'decided_at', sar.decided_at,
        'expires_at', sag.expires_at
      ) order by sar.requested_at desc)
      from public.support_access_requests sar
      left join public.support_access_grants sag on sag.id = sar.grant_id
      where sar.organization_id = target_org
    ), '[]'::jsonb) else '[]'::jsonb end,
    'security_events', coalesce((
      select jsonb_agg(to_jsonb(se) order by se.created_at desc)
      from (
        select id, event_type, target_user_id, target_device_id, metadata, created_at
        from public.security_audit_events
        where organization_id = target_org
        order by created_at desc limit 100
      ) se
    ), '[]'::jsonb)
  ) into result
  from public.organizations o
  join public.organization_settings s on s.organization_id = o.id
  where o.id = target_org;
  if result is null then raise exception 'Organization not found'; end if;
  return result;
end;
$$;

create or replace function public.update_organization_control_settings(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid := (command->>'organization_id')::uuid;
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
  if not public.is_org_owner(target_org) then raise exception 'Owner access required'; end if;
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
     or previous.offline_limit_base is distinct from offline_value then
    perform public.require_aal2();
  end if;
  update public.organization_settings
  set default_language = language_value,
      timezone = timezone_value,
      receipt_prefix = receipt_value,
      negative_cash_allowed = negative_value,
      date_display = date_value,
      digit_display = digit_value,
      approval_threshold_base = approval_value,
      offline_limit_base = offline_value,
      cashier_profit_hidden = cashier_profit_value,
      updated_at = now()
  where organization_id = target_org
  returning * into result;
  update public.organizations set timezone = timezone_value where id = target_org;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (target_org, (select auth.uid()), 'organization_controls_updated', jsonb_build_object(
    'date_display', date_value, 'digit_display', digit_value,
    'approval_threshold_base', approval_value, 'offline_limit_base', offline_value,
    'negative_cash_allowed', negative_value, 'cashier_profit_hidden', cashier_profit_value
  ));
  return to_jsonb(result);
end;
$$;

create or replace function public.update_organization_profile(
  target_org uuid,
  display_name_input text,
  legal_name_input text,
  license_number_input text default null,
  license_expires_input date default null
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare result public.organizations;
begin
  if not public.is_org_owner(target_org) then raise exception 'Owner access required'; end if;
  if length(trim(coalesce(display_name_input, ''))) < 2 or length(trim(coalesce(legal_name_input, ''))) < 2 then
    raise exception 'Business names are required';
  end if;
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
language plpgsql
security definer
set search_path = ''
as $$
declare result public.branches;
begin
  if not public.is_org_owner(target_org) then raise exception 'Owner access required'; end if;
  if length(trim(coalesce(name_input, ''))) < 2 then raise exception 'Branch name is required'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = timezone_input) then raise exception 'Unsupported timezone'; end if;
  insert into public.branches (organization_id, name, timezone)
  values (target_org, trim(name_input), timezone_input) returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (target_org, (select auth.uid()), 'branch_created', jsonb_build_object('branch_id', result.id, 'name', result.name));
  return result;
end;
$$;

create or replace function public.set_organization_branch_state(target_branch uuid, active_input boolean, reason_input text)
returns public.branches
language plpgsql
security definer
set search_path = ''
as $$
declare result public.branches;
begin
  select * into result from public.branches where id = target_branch for update;
  if result.id is null or not public.is_org_owner(result.organization_id) then raise exception 'Owner access required'; end if;
  if length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'Reason is required'; end if;
  if not active_input and exists (select 1 from public.cashboxes c where c.branch_id = target_branch and c.active) then
    raise exception 'Deactivate branch cashboxes first';
  end if;
  update public.branches set active = active_input where id = target_branch returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (result.organization_id, (select auth.uid()), 'branch_state_changed', jsonb_build_object('branch_id', result.id, 'active', active_input, 'reason', trim(reason_input)));
  return result;
end;
$$;

create or replace function public.create_organization_cashbox(target_org uuid, target_branch uuid, name_input text)
returns public.cashboxes
language plpgsql
security definer
set search_path = ''
as $$
declare result public.cashboxes;
begin
  if not public.is_org_owner(target_org) then raise exception 'Owner access required'; end if;
  if length(trim(coalesce(name_input, ''))) < 2 then raise exception 'Cashbox name is required'; end if;
  if not exists (select 1 from public.branches where id = target_branch and organization_id = target_org and active) then raise exception 'Active branch required'; end if;
  insert into public.cashboxes (organization_id, branch_id, name)
  values (target_org, target_branch, trim(name_input)) returning * into result;
  insert into public.money_accounts (organization_id, branch_id, cashbox_id, name, account_type, created_by)
  values (target_org, target_branch, result.id, result.name, 'cashbox', (select auth.uid()));
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (target_org, (select auth.uid()), 'cashbox_created', jsonb_build_object('cashbox_id', result.id, 'branch_id', target_branch, 'name', result.name));
  return result;
end;
$$;

create or replace function public.set_organization_cashbox_state(target_cashbox uuid, active_input boolean, reason_input text)
returns public.cashboxes
language plpgsql
security definer
set search_path = ''
as $$
declare result public.cashboxes; balance_value numeric;
begin
  select * into result from public.cashboxes where id = target_cashbox for update;
  if result.id is null or not public.is_org_owner(result.organization_id) then raise exception 'Owner access required'; end if;
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
language plpgsql
security definer
set search_path = ''
as $$
declare result public.expense_categories;
begin
  if not public.is_org_owner(target_org) then raise exception 'Owner access required'; end if;
  if length(trim(coalesce(name_input, ''))) < 2 then raise exception 'Category name is required'; end if;
  insert into public.expense_categories (organization_id, name, active)
  values (target_org, trim(name_input), active_input)
  on conflict (organization_id, name) do update set active = excluded.active
  returning * into result;
  return result;
end;
$$;

create or replace function public.set_organization_feature_state(target_org uuid, feature_input text, enabled_input boolean)
returns public.organization_features
language plpgsql
security definer
set search_path = ''
as $$
declare result public.organization_features;
begin
  if not public.is_org_owner(target_org) and not public.is_platform_admin() then raise exception 'Feature management access required'; end if;
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
language plpgsql
security definer
set search_path = ''
as $$
declare result public.rate_groups; clean_code text := lower(regexp_replace(trim(coalesce(code_input, '')), '[^a-zA-Z0-9_-]+', '-', 'g'));
begin
  if not public.has_org_permission(target_org, 'organization:manage') then raise exception 'Organization management permission required'; end if;
  if length(trim(coalesce(name_input, ''))) < 2 or length(clean_code) < 2 then raise exception 'Rate group name and code are required'; end if;
  insert into public.rate_groups (organization_id, name, code) values (target_org, trim(name_input), clean_code) returning * into result;
  return result;
end;
$$;

create or replace function public.set_rate_group_exchange_rate(
  target_org uuid,
  target_group uuid,
  target_branch uuid,
  source_currency text,
  target_currency text,
  buy_rate_input numeric,
  sell_rate_input numeric,
  spread_tolerance_input numeric default null
)
returns public.rate_board_entries
language plpgsql
security definer
set search_path = ''
as $$
declare result public.rate_board_entries;
begin
  if not public.has_org_permission(target_org, 'organization:manage') then raise exception 'Rate management permission required'; end if;
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
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid := (command->>'organization_id')::uuid;
  base_value text;
  result public.valuation_rate_sets;
  rate_item jsonb;
  currency_value text;
  rate_value numeric;
begin
  if not public.has_org_permission(target_org, 'organization:manage') then raise exception 'Valuation management permission required'; end if;
  select base_currency_code into base_value from public.organization_settings where organization_id = target_org;
  if base_value is null then raise exception 'Organization settings not found'; end if;
  if jsonb_array_length(coalesce(command->'rates', '[]'::jsonb)) = 0 then raise exception 'At least one valuation rate is required'; end if;
  update public.valuation_rate_sets set active = false where organization_id = target_org and active;
  insert into public.valuation_rate_sets (organization_id, name, base_currency, effective_at, created_by, source)
  values (target_org, trim(command->>'name'), base_value, coalesce((command->>'effective_at')::timestamptz, now()), (select auth.uid()), 'owner')
  returning * into result;
  for rate_item in select * from jsonb_array_elements(command->'rates') loop
    currency_value := upper(rate_item->>'currency_code');
    rate_value := (rate_item->>'rate')::numeric;
    if currency_value = base_value or rate_value is null or rate_value <= 0 then raise exception 'Invalid valuation rate'; end if;
    if not exists (select 1 from public.organization_currencies where organization_id = target_org and currency_code = currency_value and enabled) then raise exception 'Valuation currency is not enabled'; end if;
    insert into public.valuation_rates (rate_set_id, organization_id, currency_code, base_currency, rate)
    values (result.id, target_org, currency_value, base_value, rate_value);
  end loop;
  return result;
end;
$$;

create or replace function public.get_reconciliation_workspace(target_org uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_org_member(target_org) then raise exception 'Organization membership required'; end if;
  select jsonb_build_object(
    'closes', coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'branch_id', c.branch_id, 'branch_name', b.name,
      'cashbox_id', c.cashbox_id, 'cashbox_name', cb.name,
      'business_date', c.business_date, 'status', c.status,
      'submitted_at', c.submitted_at, 'approved_at', c.approved_at,
      'variance_reason', c.variance_reason,
      'closed_by_current_user', c.closed_by = (select auth.uid()),
      'lines', coalesce((
        select jsonb_agg(jsonb_build_object(
          'currency_code', l.currency_code, 'expected_amount', l.expected_amount,
          'counted_amount', l.counted_amount, 'variance_amount', l.variance_amount
        ) order by l.currency_code)
        from public.cashbox_close_lines l where l.close_id = c.id
      ), '[]'::jsonb)
    ) order by c.submitted_at desc), '[]'::jsonb)
  ) into result
  from public.cashbox_closes c
  join public.branches b on b.id = c.branch_id
  join public.cashboxes cb on cb.id = c.cashbox_id
  where c.organization_id = target_org;
  return coalesce(result, jsonb_build_object('closes', '[]'::jsonb));
end;
$$;

create or replace function public.reject_cashbox_close(target_id uuid, reason_input text)
returns public.cashbox_closes
language plpgsql
security definer
set search_path = ''
as $$
declare result public.cashbox_closes; role_value text;
begin
  select * into result from public.cashbox_closes where id = target_id for update;
  if result.id is null then raise exception 'Cashbox close not found'; end if;
  select role_code into role_value from public.organization_memberships
  where organization_id = result.organization_id and user_id = (select auth.uid()) and active;
  if role_value not in ('owner', 'manager') then raise exception 'Owner or manager access required'; end if;
  if result.status <> 'submitted' then raise exception 'Cashbox close is not awaiting review'; end if;
  if result.closed_by = (select auth.uid()) then raise exception 'Self-approval is not allowed'; end if;
  if length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'Decision reason is required'; end if;
  perform public.require_aal2();
  update public.cashbox_closes
  set status = 'rejected', approved_by = (select auth.uid()), approved_at = now(),
      variance_reason = concat_ws(' - ', variance_reason, trim(reason_input))
  where id = target_id returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (result.organization_id, (select auth.uid()), 'cashbox_close_rejected', jsonb_build_object('close_id', result.id, 'reason', trim(reason_input)));
  return result;
end;
$$;

create or replace function public.upsert_kyc_profile(command jsonb)
returns public.kyc_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid := (command->>'organization_id')::uuid;
  target_counterparty uuid := (command->>'counterparty_id')::uuid;
  result public.kyc_profiles;
  risk_value text := coalesce(command->>'risk_level', 'medium');
  review_value text := coalesce(command->>'review_status', 'pending');
begin
  if not public.has_org_permission(target_org, 'compliance:review') then raise exception 'Compliance permission required'; end if;
  if not exists (select 1 from public.counterparties where id = target_counterparty and organization_id = target_org) then raise exception 'Counterparty not found'; end if;
  if length(trim(coalesce(command->>'legal_name', ''))) < 2 then raise exception 'Legal name is required'; end if;
  if risk_value not in ('low', 'medium', 'high') or review_value not in ('pending', 'approved', 'review_required') then raise exception 'Invalid KYC status'; end if;
  insert into public.kyc_profiles (
    organization_id, counterparty_id, legal_name, father_name, date_of_birth,
    nationality, identity_document_type, identity_document_expiry, address,
    phone, occupation_or_business, purpose_of_funds, source_of_funds,
    risk_level, review_status, next_review_at, updated_at
  ) values (
    target_org, target_counterparty, trim(command->>'legal_name'), nullif(trim(command->>'father_name'), ''),
    nullif(command->>'date_of_birth', '')::date, nullif(trim(command->>'nationality'), ''),
    nullif(command->>'identity_document_type', ''), nullif(command->>'identity_document_expiry', '')::date,
    nullif(trim(command->>'address'), ''), nullif(trim(command->>'phone'), ''),
    nullif(trim(command->>'occupation_or_business'), ''), nullif(trim(command->>'purpose_of_funds'), ''),
    nullif(trim(command->>'source_of_funds'), ''), risk_value, review_value,
    nullif(command->>'next_review_at', '')::timestamptz, now()
  )
  on conflict (organization_id, counterparty_id) do update set
    legal_name = excluded.legal_name, father_name = excluded.father_name,
    date_of_birth = excluded.date_of_birth, nationality = excluded.nationality,
    identity_document_type = excluded.identity_document_type,
    identity_document_expiry = excluded.identity_document_expiry,
    address = excluded.address, phone = excluded.phone,
    occupation_or_business = excluded.occupation_or_business,
    purpose_of_funds = excluded.purpose_of_funds, source_of_funds = excluded.source_of_funds,
    risk_level = excluded.risk_level, review_status = excluded.review_status,
    next_review_at = excluded.next_review_at, updated_at = now()
  returning * into result;
  insert into public.compliance_audit_events (organization_id, actor_user_id, action, entity_type, entity_id, reason)
  values (target_org, (select auth.uid()), 'kyc_profile_saved', 'kyc_profile', result.id, 'User-reviewed KYC profile update');
  return result;
end;
$$;

create or replace function public.decide_compliance_alert(target_alert uuid, status_input text, reason_input text)
returns public.compliance_alerts
language plpgsql
security definer
set search_path = ''
as $$
declare result public.compliance_alerts;
begin
  select * into result from public.compliance_alerts where id = target_alert for update;
  if result.id is null or not public.has_org_permission(result.organization_id, 'compliance:review') then raise exception 'Compliance permission required'; end if;
  if status_input not in ('under_review', 'cleared', 'reported') then raise exception 'Invalid alert status'; end if;
  if length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'Review reason is required'; end if;
  update public.compliance_alerts
  set status = status_input, reviewed_by = (select auth.uid()), reviewed_at = now(), disposition_reason = trim(reason_input)
  where id = target_alert returning * into result;
  insert into public.compliance_audit_events (organization_id, actor_user_id, action, entity_type, entity_id, reason)
  values (result.organization_id, (select auth.uid()), 'compliance_alert_decided', 'compliance_alert', result.id, trim(reason_input));
  return result;
end;
$$;

create or replace function public.save_compliance_case(command jsonb)
returns public.compliance_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid := (command->>'organization_id')::uuid;
  target_alert uuid := (command->>'alert_id')::uuid;
  status_value text := coalesce(command->>'report_status', 'draft');
  result public.compliance_cases;
begin
  if not public.has_org_permission(target_org, 'compliance:review') then raise exception 'Compliance permission required'; end if;
  if not exists (select 1 from public.compliance_alerts where id = target_alert and organization_id = target_org) then raise exception 'Compliance alert not found'; end if;
  if status_value not in ('draft', 'ready', 'submitted', 'closed') then raise exception 'Invalid report status'; end if;
  if status_value = 'submitted' and length(trim(coalesce(command->>'submitted_reference', ''))) < 2 then raise exception 'Submission reference is required'; end if;
  insert into public.compliance_cases (organization_id, alert_id, assigned_to, notes, report_status, submitted_reference, submitted_at)
  values (target_org, target_alert, (select auth.uid()), nullif(trim(command->>'notes'), ''), status_value,
    nullif(trim(command->>'submitted_reference'), ''), case when status_value = 'submitted' then now() else null end)
  on conflict do nothing
  returning * into result;
  if result.id is null then
    update public.compliance_cases
    set assigned_to = (select auth.uid()), notes = nullif(trim(command->>'notes'), ''), report_status = status_value,
        submitted_reference = nullif(trim(command->>'submitted_reference'), ''),
        submitted_at = case when status_value = 'submitted' then coalesce(submitted_at, now()) else submitted_at end
    where organization_id = target_org and alert_id = target_alert
    returning * into result;
  end if;
  return result;
end;
$$;

create unique index if not exists compliance_cases_one_per_alert_idx on public.compliance_cases (organization_id, alert_id);

create or replace function public.get_named_financial_report(target_org uuid, report_code text, from_date date default null, to_date date default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare result jsonb; start_at timestamptz := coalesce(from_date::timestamptz, '-infinity'::timestamptz); end_at timestamptz := coalesce((to_date + 1)::timestamptz, 'infinity'::timestamptz);
begin
  if not public.has_org_permission(target_org, 'financial:report') then raise exception 'Report permission required'; end if;
  if report_code in ('trial_balance', 'balance_sheet', 'profit_loss') then
    select coalesce(jsonb_agg(row_data order by row_data->>'label'), '[]'::jsonb) into result
    from (
      select jsonb_build_object(
        'reference', la.code, 'date', to_char(coalesce(to_date, current_date), 'YYYY-MM-DD'),
        'label', la.name, 'detail', la.category,
        'amount', case
          when report_code = 'profit_loss' then sum(jl.base_credit - jl.base_debit)
          when la.category in ('asset', 'expense') then sum(jl.base_debit - jl.base_credit)
          else sum(jl.base_credit - jl.base_debit)
        end,
        'currency', coalesce(max(o.base_currency_code), 'AFN'), 'status', 'posted'
      ) row_data
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.journal_entry_id and je.status = 'posted'
      join public.ledger_accounts la on la.id = jl.account_id
      join public.organizations o on o.id = jl.organization_id
      where jl.organization_id = target_org and je.occurred_at >= start_at and je.occurred_at < end_at
        and (report_code <> 'profit_loss' or la.category in ('income', 'expense'))
        and (report_code <> 'balance_sheet' or la.category in ('asset', 'liability', 'equity'))
      group by la.code, la.name, la.category
    ) rows;
  elsif report_code in ('receivables', 'payables', 'aging') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', d.id, 'date', to_char(d.created_at, 'YYYY-MM-DD'), 'label', cp.display_name,
      'detail', case when d.due_at is null then 'no_due_date' when d.due_at < now() then 'overdue' else 'open' end,
      'amount', d.outstanding_amount, 'currency', d.currency_code, 'status', case when d.outstanding_amount = 0 then 'settled' else 'open' end
    ) order by d.created_at desc), '[]'::jsonb) into result
    from public.debts d join public.counterparties cp on cp.id = d.counterparty_id
    where d.organization_id = target_org
      and (report_code = 'aging' or d.direction = case when report_code = 'receivables' then 'receivable' else 'payable' end);
  elsif report_code = 'reconciliation' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', c.id, 'date', c.business_date, 'label', cb.name,
      'detail', coalesce(c.variance_reason, ''),
      'amount', coalesce((select sum(abs(l.variance_amount)) from public.cashbox_close_lines l where l.close_id = c.id), 0),
      'currency', 'MIXED', 'status', c.status
    ) order by c.business_date desc), '[]'::jsonb) into result
    from public.cashbox_closes c join public.cashboxes cb on cb.id = c.cashbox_id
    where c.organization_id = target_org and c.submitted_at >= start_at and c.submitted_at < end_at;
  elsif report_code = 'rate_history' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', r.id, 'date', r.effective_from, 'label', concat(r.from_currency, ' / ', r.to_currency),
      'detail', rg.name, 'amount', r.buy_rate, 'secondary_amount', r.sell_rate,
      'currency', r.to_currency, 'status', case when r.active then 'active' else 'historical' end
    ) order by r.effective_from desc), '[]'::jsonb) into result
    from public.rate_board_entries r join public.rate_groups rg on rg.id = r.rate_group_id
    where r.organization_id = target_org and r.effective_from >= start_at and r.effective_from < end_at;
  elsif report_code = 'employee_activity' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', p.id, 'date', to_char(max(fe.occurred_at), 'YYYY-MM-DD'), 'label', coalesce(p.display_name, p.id::text),
      'detail', 'financial_actions', 'amount', count(fe.id), 'currency', 'COUNT', 'status', 'recorded'
    ) order by count(fe.id) desc), '[]'::jsonb) into result
    from public.financial_events fe left join public.profiles p on p.id = fe.created_by
    where fe.organization_id = target_org and fe.occurred_at >= start_at and fe.occurred_at < end_at
    group by p.id, p.display_name;
  elsif report_code = 'security_activity' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', s.id, 'date', s.created_at, 'label', s.event_type,
      'detail', coalesce(s.target_user_id::text, s.target_device_id::text, ''),
      'amount', 0, 'currency', '', 'status', 'recorded'
    ) order by s.created_at desc), '[]'::jsonb) into result
    from public.security_audit_events s
    where s.organization_id = target_org and s.created_at >= start_at and s.created_at < end_at;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', fe.immutable_reference, 'date', fe.occurred_at, 'label', fe.event_type,
      'detail', coalesce(je.memo, ''), 'amount', coalesce(fe.metadata->>'amount', fe.metadata->>'bought_amount', fe.metadata->>'sold_amount', '0'),
      'currency', coalesce(fe.metadata->>'currency', fe.metadata->>'bought_currency', fe.metadata->>'sold_currency', ''), 'status', je.status
    ) order by fe.occurred_at desc), '[]'::jsonb) into result
    from public.financial_events fe join public.journal_entries je on je.financial_event_id = fe.id
    where fe.organization_id = target_org and fe.occurred_at >= start_at and fe.occurred_at < end_at
      and (
        report_code in ('daily_transactions', 'transaction_journal')
        or (report_code = 'fx_profit' and fe.event_type in ('buy_fx', 'sell_fx', 'exchange_fx'))
        or (report_code = 'commission' and coalesce((fe.metadata->>'fee_amount')::numeric, 0) <> 0)
        or (report_code = 'expenses' and fe.event_type = 'record_expense')
        or (report_code = 'owner_capital' and fe.event_type in ('owner_investment', 'owner_withdrawal', 'opening_balance'))
        or (report_code = 'reversals' and (je.status = 'reversed' or je.reversal_of is not null))
        or (report_code = 'cash_movement' and fe.event_type in ('transfer_cash', 'bank_deposit', 'bank_withdrawal', 'receive_money', 'pay_money'))
        or (report_code = 'hawala' and fe.event_type = 'hawala_send')
      );
  end if;
  return coalesce(result, '[]'::jsonb);
end;
$$;

create or replace function public.get_organization_data_export(target_org uuid)
returns jsonb
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_org_owner(target_org) then raise exception 'Owner access required'; end if;
  select jsonb_build_object(
    'generated_at', now(),
    'organization', (select to_jsonb(o) from public.organizations o where o.id = target_org),
    'settings', (select to_jsonb(s) from public.organization_settings s where s.organization_id = target_org),
    'branches', coalesce((select jsonb_agg(to_jsonb(b)) from public.branches b where b.organization_id = target_org), '[]'::jsonb),
    'cashboxes', coalesce((select jsonb_agg(to_jsonb(c)) from public.cashboxes c where c.organization_id = target_org), '[]'::jsonb),
    'money_accounts', coalesce((select jsonb_agg(to_jsonb(m)) from public.money_accounts m where m.organization_id = target_org), '[]'::jsonb),
    'counterparties', coalesce((select jsonb_agg(to_jsonb(c)) from public.counterparties c where c.organization_id = target_org), '[]'::jsonb),
    'debts', coalesce((select jsonb_agg(to_jsonb(d)) from public.debts d where d.organization_id = target_org), '[]'::jsonb),
    'financial_events', coalesce((select jsonb_agg(to_jsonb(fe)) from public.financial_events fe where fe.organization_id = target_org), '[]'::jsonb),
    'journal_entries', coalesce((select jsonb_agg(to_jsonb(je)) from public.journal_entries je where je.organization_id = target_org), '[]'::jsonb),
    'journal_lines', coalesce((select jsonb_agg(to_jsonb(jl)) from public.journal_lines jl where jl.organization_id = target_org), '[]'::jsonb),
    'receipts', coalesce((select jsonb_agg(to_jsonb(r)) from public.receipts r where r.organization_id = target_org), '[]'::jsonb),
    'rate_history', coalesce((select jsonb_agg(to_jsonb(r)) from public.rate_board_entries r where r.organization_id = target_org), '[]'::jsonb),
    'reconciliation', coalesce((select jsonb_agg(to_jsonb(c)) from public.cashbox_closes c where c.organization_id = target_org), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(to_jsonb(a)) from public.security_audit_events a where a.organization_id = target_org), '[]'::jsonb)
  ) into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (target_org, (select auth.uid()), 'organization_data_exported', jsonb_build_object('generated_at', now()));
  return result;
end;
$$;

create or replace function public.get_platform_operations()
returns jsonb
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare result jsonb;
begin
  perform public.require_platform_admin(false);
  select jsonb_build_object(
    'health', jsonb_build_object(
      'database', 'healthy',
      'checked_at', now(),
      'private_storage', exists (select 1 from storage.buckets where id = 'sarafi-private-documents' and not public),
      'unbalanced_posted_entries', (
        select count(*) from (
          select je.id from public.journal_entries je join public.journal_lines jl on jl.journal_entry_id = je.id
          where je.status = 'posted' group by je.id having sum(jl.base_debit) <> sum(jl.base_credit)
        ) broken
      ),
      'expired_pending_approvals', (select count(*) from public.approval_requests where status = 'pending' and expires_at <= now()),
      'pending_support_requests', (select count(*) from public.support_access_requests where status = 'pending')
    ),
    'versions', coalesce((select jsonb_agg(to_jsonb(v) order by v.platform) from public.platform_app_versions v), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(a) order by a.updated_at desc) from public.platform_announcements a), '[]'::jsonb),
    'support_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'organization_id', r.organization_id, 'organization_name', o.display_name,
        'requested_scope', r.requested_scope, 'reason', r.reason,
        'requested_hours', r.requested_hours, 'status', r.status,
        'requested_at', r.requested_at, 'decided_at', r.decided_at,
        'grant_id', r.grant_id, 'expires_at', g.expires_at, 'revoked_at', g.revoked_at
      ) order by r.requested_at desc)
      from public.support_access_requests r join public.organizations o on o.id = r.organization_id
      left join public.support_access_grants g on g.id = r.grant_id
      where r.support_user_id = (select auth.uid())
    ), '[]'::jsonb),
    'organization_features', coalesce((
      select jsonb_agg(jsonb_build_object('organization_id', f.organization_id, 'feature_code', f.feature_code, 'enabled', f.enabled, 'updated_at', f.updated_at) order by f.organization_id, f.feature_code)
      from public.organization_features f
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.set_platform_app_version(command jsonb)
returns public.platform_app_versions
language plpgsql
security definer
set search_path = ''
as $$
declare result public.platform_app_versions; platform_value text := lower(command->>'platform');
begin
  perform public.require_platform_admin(true);
  if platform_value not in ('web', 'android', 'ios') then raise exception 'Unsupported platform'; end if;
  if length(trim(coalesce(command->>'minimum_version', ''))) < 1 or length(trim(coalesce(command->>'recommended_version', ''))) < 1 then raise exception 'Version values are required'; end if;
  insert into public.platform_app_versions (platform, minimum_version, recommended_version, force_update, release_notes_en, release_notes_dari, release_notes_pashto, active, updated_by)
  values (platform_value, trim(command->>'minimum_version'), trim(command->>'recommended_version'), coalesce((command->>'force_update')::boolean, false),
    coalesce(command->>'release_notes_en', ''), coalesce(command->>'release_notes_dari', ''), coalesce(command->>'release_notes_pashto', ''), true, (select auth.uid()))
  on conflict (platform) do update set minimum_version = excluded.minimum_version, recommended_version = excluded.recommended_version,
    force_update = excluded.force_update, release_notes_en = excluded.release_notes_en, release_notes_dari = excluded.release_notes_dari,
    release_notes_pashto = excluded.release_notes_pashto, active = true, updated_by = excluded.updated_by, updated_at = now()
  returning * into result;
  return result;
end;
$$;

create or replace function public.set_platform_announcement(command jsonb)
returns public.platform_announcements
language plpgsql
security definer
set search_path = ''
as $$
declare result public.platform_announcements;
begin
  perform public.require_platform_admin(true);
  if length(trim(coalesce(command->>'message_en', ''))) < 2 or length(trim(coalesce(command->>'message_dari', ''))) < 2 or length(trim(coalesce(command->>'message_pashto', ''))) < 2 then raise exception 'All three messages are required'; end if;
  insert into public.platform_announcements (announcement_type, message_en, message_dari, message_pashto, active, starts_at, ends_at, updated_by)
  values (coalesce(command->>'announcement_type', 'maintenance'), trim(command->>'message_en'), trim(command->>'message_dari'), trim(command->>'message_pashto'),
    coalesce((command->>'active')::boolean, false), nullif(command->>'starts_at', '')::timestamptz, nullif(command->>'ends_at', '')::timestamptz, (select auth.uid()))
  returning * into result;
  return result;
end;
$$;

create or replace function public.request_support_access(target_org uuid, scope_input text[], reason_input text, hours_input integer default 2)
returns public.support_access_requests
language plpgsql
security definer
set search_path = ''
as $$
declare result public.support_access_requests;
begin
  perform public.require_platform_admin(true);
  if not exists (select 1 from public.organizations where id = target_org) then raise exception 'Organization not found'; end if;
  if length(trim(coalesce(reason_input, ''))) < 5 then raise exception 'A clear support reason is required'; end if;
  if hours_input not between 1 and 24 then raise exception 'Support duration must be 1 to 24 hours'; end if;
  if cardinality(scope_input) = 0 or not scope_input <@ array['diagnostics', 'configuration', 'security_events']::text[] then raise exception 'Unsupported support scope'; end if;
  insert into public.support_access_requests (organization_id, support_user_id, requested_scope, reason, requested_hours)
  values (target_org, (select auth.uid()), scope_input, trim(reason_input), hours_input) returning * into result;
  insert into public.platform_audit_events (actor_user_id, event_type, target_organization_id, metadata)
  values ((select auth.uid()), 'support_access_requested', target_org, jsonb_build_object('request_id', result.id, 'scope', scope_input, 'hours', hours_input));
  return result;
end;
$$;

create or replace function public.decide_support_access(target_request uuid, decision_input text, reason_input text)
returns public.support_access_requests
language plpgsql
security definer
set search_path = ''
as $$
declare result public.support_access_requests; new_grant uuid;
begin
  select * into result from public.support_access_requests where id = target_request for update;
  if result.id is null or not public.is_org_owner(result.organization_id) then raise exception 'Owner access required'; end if;
  if result.status <> 'pending' then raise exception 'Support request is no longer pending'; end if;
  if decision_input not in ('approved', 'rejected') or length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'Decision and reason are required'; end if;
  perform public.require_aal2();
  if decision_input = 'approved' then
    insert into public.support_access_grants (organization_id, support_user_id, approved_by, reason, scope, expires_at)
    values (result.organization_id, result.support_user_id, (select auth.uid()), result.reason, result.requested_scope, now() + make_interval(hours => result.requested_hours))
    returning id into new_grant;
  end if;
  update public.support_access_requests
  set status = decision_input, decided_by = (select auth.uid()), decided_at = now(), decision_reason = trim(reason_input), grant_id = new_grant
  where id = target_request returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (result.organization_id, (select auth.uid()), 'support_access_decided', jsonb_build_object('request_id', result.id, 'decision', decision_input, 'grant_id', new_grant));
  return result;
end;
$$;

create or replace function public.revoke_support_access(target_request uuid, reason_input text)
returns public.support_access_requests
language plpgsql
security definer
set search_path = ''
as $$
declare result public.support_access_requests;
begin
  select * into result from public.support_access_requests where id = target_request for update;
  if result.id is null or (not public.is_org_owner(result.organization_id) and result.support_user_id <> (select auth.uid())) then raise exception 'Support request access required'; end if;
  if result.grant_id is null then raise exception 'No active support grant'; end if;
  if length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'Reason is required'; end if;
  update public.support_access_grants set revoked_at = now() where id = result.grant_id and revoked_at is null;
  update public.support_access_requests set status = 'revoked', decision_reason = concat_ws(' - ', decision_reason, trim(reason_input)) where id = target_request returning * into result;
  return result;
end;
$$;

create or replace function public.get_support_diagnostics(target_org uuid)
returns jsonb
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.has_active_support_access(target_org, 'diagnostics') then raise exception 'Active diagnostic support grant required'; end if;
  select jsonb_build_object(
    'organization_id', target_org,
    'checked_at', now(),
    'active_members', (select count(*) from public.organization_memberships where organization_id = target_org and active),
    'active_branches', (select count(*) from public.branches where organization_id = target_org and active),
    'active_cashboxes', (select count(*) from public.cashboxes where organization_id = target_org and active),
    'posted_entries', (select count(*) from public.journal_entries where organization_id = target_org and status = 'posted'),
    'pending_approvals', (select count(*) from public.approval_requests where organization_id = target_org and status = 'pending'),
    'last_financial_event_at', (select max(occurred_at) from public.financial_events where organization_id = target_org),
    'unbalanced_entries', (
      select count(*) from (
        select je.id from public.journal_entries je join public.journal_lines jl on jl.journal_entry_id = je.id
        where je.organization_id = target_org and je.status = 'posted'
        group by je.id having sum(jl.base_debit) <> sum(jl.base_credit)
      ) broken
    )
  ) into result;
  insert into public.platform_audit_events (actor_user_id, event_type, target_organization_id, metadata)
  values ((select auth.uid()), 'support_diagnostics_viewed', target_org, jsonb_build_object('scope', 'diagnostics'));
  return result;
end;
$$;

revoke all on function public.is_org_owner(uuid) from public, anon;
revoke all on function public.has_active_support_access(uuid, text) from public, anon;
revoke all on function public.get_organization_control_plane(uuid) from public, anon;
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
revoke all on function public.get_reconciliation_workspace(uuid) from public, anon;
revoke all on function public.reject_cashbox_close(uuid, text) from public, anon;
revoke all on function public.upsert_kyc_profile(jsonb) from public, anon;
revoke all on function public.decide_compliance_alert(uuid, text, text) from public, anon;
revoke all on function public.save_compliance_case(jsonb) from public, anon;
revoke all on function public.get_named_financial_report(uuid, text, date, date) from public, anon;
revoke all on function public.get_organization_data_export(uuid) from public, anon;
revoke all on function public.get_platform_operations() from public, anon;
revoke all on function public.set_platform_app_version(jsonb) from public, anon;
revoke all on function public.set_platform_announcement(jsonb) from public, anon;
revoke all on function public.request_support_access(uuid, text[], text, integer) from public, anon;
revoke all on function public.decide_support_access(uuid, text, text) from public, anon;
revoke all on function public.revoke_support_access(uuid, text) from public, anon;
revoke all on function public.get_support_diagnostics(uuid) from public, anon;

grant execute on function public.is_org_owner(uuid) to authenticated;
grant execute on function public.has_active_support_access(uuid, text) to authenticated;
grant execute on function public.get_organization_control_plane(uuid) to authenticated;
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
grant execute on function public.get_reconciliation_workspace(uuid) to authenticated;
grant execute on function public.reject_cashbox_close(uuid, text) to authenticated;
grant execute on function public.upsert_kyc_profile(jsonb) to authenticated;
grant execute on function public.decide_compliance_alert(uuid, text, text) to authenticated;
grant execute on function public.save_compliance_case(jsonb) to authenticated;
grant execute on function public.get_named_financial_report(uuid, text, date, date) to authenticated;
grant execute on function public.get_organization_data_export(uuid) to authenticated;
grant execute on function public.get_platform_operations() to authenticated;
grant execute on function public.set_platform_app_version(jsonb) to authenticated;
grant execute on function public.set_platform_announcement(jsonb) to authenticated;
grant execute on function public.request_support_access(uuid, text[], text, integer) to authenticated;
grant execute on function public.decide_support_access(uuid, text, text) to authenticated;
grant execute on function public.revoke_support_access(uuid, text) to authenticated;
grant execute on function public.get_support_diagnostics(uuid) to authenticated;

insert into public.platform_app_versions (
  platform, minimum_version, recommended_version, force_update,
  release_notes_en, release_notes_dari, release_notes_pashto, updated_by
)
select 'web', '1.0.0', '1.0.0', false,
  'Production web controls and reporting center.',
  'کنترول‌های نسخه وب و مرکز گزارش‌ها.',
  'د وېب کنټرولونه او د راپورونو مرکز.',
  pa.user_id
from public.platform_admins pa
order by pa.created_at
limit 1
on conflict (platform) do nothing;
