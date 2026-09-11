-- SARAFI whole-project v7: authoritative money valuation snapshots.
-- This migration is forward-only. Financial facts remain ledger-derived and
-- each returned view is retained as immutable, content-addressed evidence.

-- A manual rate can be scoped to one transaction without mutating the rate
-- board. The context is transaction-local, is matched to org/branch/currency,
-- and is copied into the immutable financial-event metadata.
create or replace function public.prepare_inline_rate(command jsonb, operation_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rate_payload jsonb := command->'publish_rate';
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  branch_id_value uuid;
  source_currency_value text;
  target_currency_value text;
  buy_rate_value numeric;
  sell_rate_value numeric;
  publication_scope_value text;
  reason_value text;
  transaction_context jsonb;
begin
  if rate_payload is null or jsonb_typeof(rate_payload) <> 'object' then
    return command;
  end if;
  branch_id_value := coalesce(
    nullif(rate_payload->>'branch_id', '')::uuid,
    nullif(command->>'branch_id', '')::uuid
  );
  source_currency_value := upper(trim(rate_payload->>'source_currency'));
  target_currency_value := upper(trim(rate_payload->>'target_currency'));
  buy_rate_value := nullif(rate_payload->>'buy_rate', '')::numeric;
  sell_rate_value := nullif(rate_payload->>'sell_rate', '')::numeric;
  publication_scope_value := coalesce(nullif(rate_payload->>'publication_scope', ''), 'rate_board');
  reason_value := nullif(trim(rate_payload->>'reason'), '');

  if org_id is null or operation_kind not in (
    'money_operation', 'opening_balance', 'debt_create', 'debt_settle',
    'hawala_send', 'hawala_incoming', 'hawala_settle'
  ) then raise exception 'RATE_RESOLUTION_INVALID: Operation rate context is invalid'; end if;
  if source_currency_value is null or target_currency_value is null
     or source_currency_value = target_currency_value
     or buy_rate_value is null or buy_rate_value <= 0
     or sell_rate_value is null or sell_rate_value <= 0 then
    raise exception 'RATE_RESOLUTION_INVALID: Positive transaction rates are required';
  end if;

  if publication_scope_value = 'transaction' then
    if reason_value is null or length(reason_value) < 3 then
      raise exception 'RATE_REASON_REQUIRED: Write a short reason for the one-transaction rate';
    end if;
    transaction_context := jsonb_build_object(
      'organization_id', org_id,
      'branch_id', branch_id_value,
      'source_currency', source_currency_value,
      'target_currency', target_currency_value,
      'buy_rate', buy_rate_value,
      'sell_rate', sell_rate_value,
      'valuation_rate', (buy_rate_value + sell_rate_value) / 2,
      'reason', reason_value,
      'publication_scope', 'transaction',
      'operation_kind', operation_kind,
      'recorded_at', now()
    );
    perform set_config('sarafi.transaction_rate_context', transaction_context::text, true);
    return (command - 'publish_rate') || jsonb_build_object(
      'transaction_rate_context', transaction_context,
      'rate_published_atomically', false,
      'rate_resolution_kind', operation_kind,
      'rate_source', 'transaction_override'
    );
  end if;
  if publication_scope_value <> 'rate_board' then
    raise exception 'RATE_RESOLUTION_INVALID: Rate scope must be transaction or rate_board';
  end if;

  perform public.set_exchange_rate(
    org_id, branch_id_value, source_currency_value, target_currency_value,
    buy_rate_value, sell_rate_value
  );
  return (command - 'publish_rate') || jsonb_build_object(
    'rate_published_atomically', true,
    'rate_resolution_kind', operation_kind,
    'rate_publication_reason', reason_value,
    'rate_source', 'shop_rate'
  );
end;
$$;

create or replace function public.authoritative_base_amount(
  target_org uuid,
  target_branch uuid,
  currency_input text,
  amount_input numeric,
  allow_stale boolean default false
)
returns numeric
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  currency_value text := upper(trim(currency_input));
  base_currency_value text;
  rate_value numeric;
  effective_value timestamptz;
  max_age_minutes_value integer := 1440;
  transaction_context jsonb;
begin
  if target_org is null or currency_value is null or amount_input is null or amount_input < 0 then
    raise exception 'RATE_INPUT_INVALID: A valid organization, currency, and amount are required';
  end if;
  select upper(o.base_currency_code), coalesce(os.rate_max_age_minutes, 1440)
  into base_currency_value, max_age_minutes_value
  from public.organizations o
  left join public.organization_settings os on os.organization_id = o.id
  where o.id = target_org;
  if base_currency_value is null then raise exception 'RATE_BASE_UNAVAILABLE: Organization base currency is unavailable'; end if;
  if currency_value = base_currency_value then return round(amount_input, 12); end if;

  begin
    transaction_context := nullif(current_setting('sarafi.transaction_rate_context', true), '')::jsonb;
  exception when others then
    transaction_context := null;
  end;
  if transaction_context is not null
     and nullif(transaction_context->>'organization_id', '')::uuid = target_org
     and upper(transaction_context->>'source_currency') = currency_value
     and upper(transaction_context->>'target_currency') = base_currency_value
     and (
       nullif(transaction_context->>'branch_id', '')::uuid is null
       or nullif(transaction_context->>'branch_id', '')::uuid is not distinct from target_branch
     ) then
    rate_value := nullif(transaction_context->>'valuation_rate', '')::numeric;
    if rate_value is null or rate_value <= 0 then
      raise exception 'RATE_INVALID: The one-transaction valuation rate is invalid';
    end if;
    return round(amount_input * rate_value, 12);
  end if;

  select (r.buy_rate + r.sell_rate) / 2, r.effective_from
  into rate_value, effective_value
  from public.rate_board_entries r
  where r.organization_id = target_org
    and r.from_currency = currency_value and r.to_currency = base_currency_value
    and r.active and r.effective_from <= now()
    and (r.branch_id is null or r.branch_id = target_branch)
  order by (r.branch_id is not null) desc, r.effective_from desc
  limit 1;
  if rate_value is null then raise exception 'RATE_MISSING: Resolve the shop rate in this task before posting'; end if;
  if not allow_stale and effective_value < now() - make_interval(mins => max_age_minutes_value) then
    raise exception 'RATE_STALE: Resolve the expired shop rate in this task before posting';
  end if;
  return round(amount_input * rate_value, 12);
end;
$$;

-- Harden FX publication scope. Older clients that omit a scope retain the
-- historical explicit-publish behavior; v7 transaction-scoped rates never
-- reach set_exchange_rate and are checked against both immutable FX legs.
alter function public.record_fx_trade_v5(jsonb) rename to record_fx_trade_v7_impl;
revoke all on function public.record_fx_trade_v7_impl(jsonb) from public, anon, authenticated;

create function public.record_fx_trade_v5(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  publication jsonb;
  publish_list jsonb := '[]'::jsonb;
  transaction_list jsonb := case
    when jsonb_typeof(command->'transaction_rate_resolutions') = 'array'
      then command->'transaction_rate_resolutions'
    else '[]'::jsonb
  end;
  source_currency_value text;
  buy_rate_value numeric;
  sell_rate_value numeric;
  expected_base numeric;
begin
  if command ? 'publish_rates' and jsonb_typeof(command->'publish_rates') <> 'array' then
    raise exception 'RATE_PUBLICATION_INVALID: FX rate publications must be an array';
  end if;
  for publication in
    select value from jsonb_array_elements(coalesce(command->'publish_rates', '[]'::jsonb))
  loop
    if coalesce(nullif(publication->>'publication_scope', ''), 'rate_board') = 'transaction' then
      transaction_list := transaction_list || jsonb_build_array(publication);
    else
      publish_list := publish_list || jsonb_build_array(publication);
    end if;
  end loop;
  if jsonb_typeof(command->'publish_rate') = 'object' then
    publication := command->'publish_rate';
    if coalesce(nullif(publication->>'publication_scope', ''), 'rate_board') = 'transaction' then
      transaction_list := transaction_list || jsonb_build_array(publication);
    else
      publish_list := publish_list || jsonb_build_array(publication);
    end if;
  end if;
  if jsonb_array_length(publish_list) > 2 or jsonb_array_length(transaction_list) > 2 then
    raise exception 'RATE_PUBLICATION_INVALID: At most two FX legs may be resolved';
  end if;

  for publication in select value from jsonb_array_elements(transaction_list)
  loop
    source_currency_value := upper(trim(publication->>'source_currency'));
    buy_rate_value := nullif(publication->>'buy_rate', '')::numeric;
    sell_rate_value := nullif(publication->>'sell_rate', '')::numeric;
    if upper(publication->>'target_currency') <> upper(command->>'base_currency')
       or source_currency_value not in (upper(command->>'sold_currency'), upper(command->>'bought_currency'))
       or buy_rate_value is null or buy_rate_value <= 0
       or sell_rate_value is null or sell_rate_value <= 0
       or length(trim(coalesce(publication->>'reason', ''))) < 3 then
      raise exception 'RATE_RESOLUTION_INVALID: One-transaction FX rate, scope, and reason are required';
    end if;
    if source_currency_value = upper(command->>'sold_currency') then
      expected_base := round(nullif(command->>'sold_amount', '')::numeric * sell_rate_value, 12);
      if abs(expected_base - nullif(command->>'sold_base_value', '')::numeric) > 0.000001 then
        raise exception 'RATE_CALCULATION_INVALID: Sold leg does not match the one-transaction rate';
      end if;
    end if;
    if source_currency_value = upper(command->>'bought_currency') then
      expected_base := round(nullif(command->>'bought_amount', '')::numeric * buy_rate_value, 12);
      if abs(expected_base - nullif(command->>'bought_base_value', '')::numeric) > 0.000001 then
        raise exception 'RATE_CALCULATION_INVALID: Bought leg does not match the one-transaction rate';
      end if;
    end if;
  end loop;

  command := command - 'publish_rate' - 'publish_rates'
    || jsonb_build_object('transaction_rate_resolutions', transaction_list);
  if jsonb_array_length(publish_list) > 0 then
    command := command || jsonb_build_object('publish_rates', publish_list);
  end if;
  return public.record_fx_trade_v7_impl(command);
end;
$$;

revoke all on function public.record_fx_trade_v5(jsonb) from public, anon;
grant execute on function public.record_fx_trade_v5(jsonb) to authenticated;
revoke all on function public.prepare_inline_rate(jsonb, text) from public, anon, authenticated;
revoke all on function public.authoritative_base_amount(uuid, uuid, text, numeric, boolean) from public, anon, authenticated;

-- Compliance access is evidence-focused by default. A per-member capability
-- override can still grant a narrowly scoped financial overview when required.
delete from public.role_capabilities
where role_code = 'compliance_officer' and capability_code = 'financial.overview';

create table if not exists public.money_valuation_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  snapshot_date date not null,
  scope jsonb not null default '{}'::jsonb,
  base_currency text not null references public.currencies(code),
  comparison_currency text not null references public.currencies(code),
  valuation_rate_set_id uuid references public.valuation_rate_sets(id) on delete restrict,
  valuation_effective_at timestamptz,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, snapshot_sha256)
);

create index if not exists money_valuation_snapshots_org_date_idx
  on public.money_valuation_snapshots (organization_id, snapshot_date desc, created_at desc);

alter table public.money_valuation_snapshots enable row level security;
revoke all on table public.money_valuation_snapshots from public, anon, authenticated;

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
      sum(case when l.direction = 'receivable' then l.remaining_amount else -l.remaining_amount end) as net
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
      case when p.rate_status = 'current'
        then (p.available + p.receivable - p.payable + p.hawala_net) * p.valuation_rate
        else null end as current_base
    from positions p
  ),
  totals as (
    select
      coalesce(sum(available), 0) as available_native_unmixed,
      coalesce(sum(case when rate_status = 'current' then available * valuation_rate end), 0) as available_base,
      coalesce(sum(case when rate_status = 'current' then receivable * valuation_rate end), 0) as receivables_base,
      coalesce(sum(case when rate_status = 'current' then payable * valuation_rate end), 0) as payables_base,
      coalesce(sum(case when rate_status = 'current' then hawala_net * valuation_rate end), 0) as hawala_net_base,
      coalesce(sum(current_base), 0) as net_position_base,
      coalesce(sum(book_base), 0) as book_value_base,
      count(*) filter (where rate_status <> 'current') as excluded_currency_count
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
    'quality', case when t.excluded_currency_count > 0 then 'partial' when rate_set_id_value is null and exists (select 1 from valued where currency_code <> base_currency_value) then 'partial' else 'current' end,
    'excluded_currency_count', t.excluded_currency_count,
    'totals', jsonb_build_object(
      'available_base', t.available_base::text,
      'receivables_base', t.receivables_base::text,
      'payables_base', t.payables_base::text,
      'hawala_net_base', t.hawala_net_base::text,
      'net_position_base', t.net_position_base::text,
      'book_value_base', t.book_value_base::text,
      'valuation_difference_base', (t.net_position_base - t.book_value_base)::text,
      'comparison_value', case when cr.rate is not null and cr.rate > 0 then (t.net_position_base / cr.rate)::text else null end,
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

-- App-lock secrets are managed only by the app-lock Edge Function. PINs use
-- server-side scrypt; short-lived unlock grants are stored only as SHA-256.
create table if not exists public.app_lock_credentials (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  pin_salt text not null,
  pin_hash text not null,
  kdf text not null default 'scrypt' check (kdf = 'scrypt'),
  kdf_parameters jsonb not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, device_id)
);

create table if not exists public.app_unlock_grants (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  grant_sha256 text not null unique check (grant_sha256 ~ '^[0-9a-f]{64}$'),
  authentication_method text not null check (authentication_method in ('scrypt_pin', 'passkey')),
  purpose text not null default 'sensitive_actions',
  scope jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists app_unlock_grants_lookup_idx on public.app_unlock_grants (organization_id, user_id, device_id, purpose, expires_at desc) where revoked_at is null;

alter table public.app_lock_credentials enable row level security;
alter table public.app_unlock_grants enable row level security;
revoke all on table public.app_lock_credentials, public.app_unlock_grants from public, anon, authenticated;

create or replace function public.app_unlock_grant_is_valid(
  target_org uuid,
  target_device uuid,
  raw_grant text,
  required_purpose text default 'sensitive_actions'
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when not exists (
      select 1 from public.app_lock_credentials c
      where c.organization_id = target_org and c.user_id = (select auth.uid())
    ) then true
    else exists (
      select 1 from public.app_unlock_grants g
      where g.organization_id = target_org
        and g.user_id = (select auth.uid())
        and g.device_id = target_device
        and g.purpose = required_purpose
        and g.grant_sha256 = encode(extensions.digest(coalesce(raw_grant, ''), 'sha256'), 'hex')
        and g.revoked_at is null and g.expires_at > now()
        and exists (
          select 1 from public.devices d
          where d.id = target_device and d.organization_id = target_org
            and d.user_id = (select auth.uid()) and d.status <> 'revoked'
        )
    )
  end;
$$;
revoke all on function public.app_unlock_grant_is_valid(uuid, uuid, text, text) from public, anon, authenticated;

-- The recipient columns are introduced before the storage/payout guards so
-- those guards compile against the final transfer shape in this migration.
alter table public.hawala_transfers
  add column if not exists sender_organization_id uuid references public.organizations(id),
  add column if not exists sender_branch_id uuid references public.branches(id),
  add column if not exists sender_user_id uuid references auth.users(id),
  add column if not exists recipient_type text,
  add column if not exists recipient_organization_id uuid references public.organizations(id),
  add column if not exists recipient_partner_id uuid references public.hawala_partners(id),
  add column if not exists recipient_branch_id uuid references public.branches(id),
  add column if not exists expires_at timestamptz;

-- Hawala identity evidence remains in the existing private bucket. Browser
-- clients may upload, but still receive no storage.objects SELECT policy.
create or replace function public.private_document_upload_target_is_valid(
  target_org uuid,
  target_counterparty uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.has_capability(target_org, 'documents.upload', '{}'::jsonb)
    and (
      exists (select 1 from public.counterparties cp where cp.organization_id = target_org and cp.id = target_counterparty)
      or exists (
        select 1 from public.hawala_transfers h
        where h.id = target_counterparty
          and (h.organization_id = target_org or h.recipient_organization_id = target_org)
          and public.has_capability(target_org, 'hawala.payout', jsonb_build_object(
            'branch_id', case when h.recipient_organization_id = target_org then h.recipient_branch_id else h.branch_id end,
            'feature', 'hawala', 'requires_active_plan', true
          ))
      )
    );
$$;

drop policy if exists attachments_document_insert on public.attachments;
create policy attachments_document_insert on public.attachments
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (
      entity_type like 'counterparty:%'
      or entity_type in ('hawala:tazkira_front', 'hawala:tazkira_back')
    )
    and storage_path like organization_id::text || '/' || entity_id::text || '/%'
    and public.private_document_upload_target_is_valid(organization_id, entity_id)
  );

create or replace function public.find_hawala_payout(target_org uuid, reference_code_input text)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  result jsonb;
  transfer_row public.hawala_transfers;
  normalized_reference text := upper(trim(reference_code_input));
  matching_count bigint;
begin
  if length(normalized_reference) < 4 then return null; end if;
  select count(*) into matching_count from public.hawala_transfers h
  where h.organization_id = target_org and upper(trim(h.reference_code)) = normalized_reference
    and h.direction = 'incoming' and h.status = 'ready';
  if matching_count > 1 then
    raise exception 'HAWALA_REFERENCE_AMBIGUOUS: Multiple ready transfers use this reference';
  end if;
  select h.* into transfer_row from public.hawala_transfers h
  where h.organization_id = target_org and upper(trim(h.reference_code)) = normalized_reference
    and h.direction = 'incoming' and h.status = 'ready' and h.integrity_state = 'valid';
  if transfer_row.id is null then return null; end if;
  perform public.require_capability(target_org, 'hawala.payout', jsonb_build_object(
    'branch_id', transfer_row.branch_id, 'amount_native', transfer_row.amount,
    'amount_base', transfer_row.base_amount, 'currency', transfer_row.currency_code,
    'feature', 'hawala', 'requires_active_plan', true
  ));
  result := jsonb_build_object(
    'transfer_id', transfer_row.id,
    'reference_code', transfer_row.reference_code,
    'beneficiary_name', transfer_row.beneficiary_name,
    'destination_location', transfer_row.destination_location,
    'currency_code', transfer_row.currency_code,
    'amount', transfer_row.amount,
    'branch_id', transfer_row.branch_id,
    'hawala_partner_id', transfer_row.hawala_partner_id
  );
  return result;
end;
$$;

create or replace function public.enforce_hawala_payout_documents_v7()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  evidence_ids jsonb;
  matching_documents integer;
  evidence_org uuid;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    evidence_org := coalesce(new.recipient_organization_id, new.organization_id);
    if not public.app_unlock_grant_is_valid(evidence_org, (
      select nullif(fe.metadata->>'device_id', '')::uuid
      from public.journal_entries je join public.financial_events fe on fe.id = je.financial_event_id
      where je.id = new.payout_journal_entry_id
    ), coalesce((
      select fe.metadata->>'app_unlock_grant'
      from public.journal_entries je join public.financial_events fe on fe.id = je.financial_event_id
      where je.id = new.payout_journal_entry_id
    ), ''), 'sensitive_actions') then
      raise exception 'APP_UNLOCK_REQUIRED: Unlock the app again before this payout';
    end if;
    select fe.metadata->'identity_document_ids' into evidence_ids
    from public.journal_entries je
    join public.financial_events fe on fe.id = je.financial_event_id
    where je.id = new.payout_journal_entry_id;
    if evidence_ids is null or jsonb_typeof(evidence_ids) <> 'array' or jsonb_array_length(evidence_ids) <> 2 then
      raise exception 'HAWALA_IDENTITY_DOCUMENTS_REQUIRED: Tazkira front and back are required';
    end if;
    select count(distinct a.entity_type) into matching_documents
    from public.attachments a
    where a.organization_id = evidence_org
      and a.entity_id = new.id
      and a.archived_at is null
      and a.entity_type in ('hawala:tazkira_front', 'hawala:tazkira_back')
      and a.id in (
        select evidence.document_id::uuid
        from jsonb_array_elements_text(evidence_ids) as evidence(document_id)
      );
    if matching_documents <> 2 then
      raise exception 'HAWALA_IDENTITY_DOCUMENTS_INVALID: Both private Tazkira images must belong to this transfer';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists hawala_payout_documents_v7 on public.hawala_transfers;
create trigger hawala_payout_documents_v7
before update of status on public.hawala_transfers
for each row execute function public.enforce_hawala_payout_documents_v7();

revoke all on function public.enforce_hawala_payout_documents_v7() from public, anon, authenticated;
revoke all on function public.find_hawala_payout(uuid, text) from public, anon;
grant execute on function public.find_hawala_payout(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Exact Hawala destination and recipient-scoped delivery
-- ---------------------------------------------------------------------------

alter table public.hawala_partners
  add column if not exists endpoint_type text,
  add column if not exists recipient_organization_id uuid references public.organizations(id),
  add column if not exists recipient_branch_id uuid references public.branches(id),
  add column if not exists reciprocal_partner_id uuid references public.hawala_partners(id),
  add column if not exists endpoint_verified_at timestamptz,
  add column if not exists endpoint_active boolean not null default false;

alter table public.hawala_partners drop constraint if exists hawala_partner_endpoint_type_v7;
alter table public.hawala_partners add constraint hawala_partner_endpoint_type_v7
  check (endpoint_type is null or endpoint_type in ('internal_branch', 'external_partner'));

alter table public.hawala_transfers
  add column if not exists sender_organization_id uuid references public.organizations(id),
  add column if not exists sender_branch_id uuid references public.branches(id),
  add column if not exists sender_user_id uuid references auth.users(id),
  add column if not exists recipient_type text,
  add column if not exists recipient_organization_id uuid references public.organizations(id),
  add column if not exists recipient_partner_id uuid references public.hawala_partners(id),
  add column if not exists recipient_branch_id uuid references public.branches(id),
  add column if not exists expires_at timestamptz;

-- Preserve legacy rows, but quarantine transfers whose historical free-text
-- destination cannot prove a registered endpoint. They remain auditable and
-- cannot enter the payout path until reviewed.
update public.hawala_transfers h
set sender_organization_id = coalesce(h.sender_organization_id, h.organization_id),
    sender_branch_id = coalesce(h.sender_branch_id, h.origin_branch_id, h.branch_id),
    sender_user_id = coalesce(h.sender_user_id, (
      select je.created_by from public.journal_entries je where je.id = h.journal_entry_id
    )),
    recipient_type = coalesce(h.recipient_type,
      case when h.direction = 'incoming' then 'external_partner' else coalesce(hp.endpoint_type, 'external_partner') end),
    recipient_organization_id = coalesce(h.recipient_organization_id,
      case when h.direction = 'incoming' then h.organization_id else hp.recipient_organization_id end),
    recipient_partner_id = coalesce(h.recipient_partner_id,
      case when h.direction = 'incoming' then h.hawala_partner_id else hp.reciprocal_partner_id end),
    recipient_branch_id = coalesce(h.recipient_branch_id,
      case when h.direction = 'incoming' then h.destination_branch_id else hp.recipient_branch_id end,
      case when h.direction = 'incoming' then h.branch_id end),
    expires_at = coalesce(h.expires_at, h.created_at + interval '72 hours'),
    integrity_state = case
      when h.direction = 'outgoing' and (
        hp.endpoint_active is distinct from true or hp.endpoint_verified_at is null
        or hp.recipient_organization_id is null or hp.recipient_branch_id is null
      ) then 'review_required'
      else h.integrity_state
    end
from public.hawala_partners hp
where hp.id = h.hawala_partner_id;

-- Rows without a surviving partner still receive deterministic sender fields,
-- but are explicitly held for review rather than guessed into another scope.
update public.hawala_transfers h
set sender_organization_id = coalesce(h.sender_organization_id, h.organization_id),
    sender_branch_id = coalesce(h.sender_branch_id, h.origin_branch_id, h.branch_id),
    sender_user_id = coalesce(h.sender_user_id, (
      select je.created_by from public.journal_entries je where je.id = h.journal_entry_id
    )),
    recipient_type = coalesce(h.recipient_type, 'external_partner'),
    recipient_organization_id = coalesce(h.recipient_organization_id,
      case when h.direction = 'incoming' then h.organization_id end),
    recipient_branch_id = coalesce(h.recipient_branch_id,
      case when h.direction = 'incoming' then h.destination_branch_id end,
      case when h.direction = 'incoming' then h.branch_id end),
    expires_at = coalesce(h.expires_at, h.created_at + interval '72 hours'),
    integrity_state = 'review_required'
where h.sender_organization_id is null or h.recipient_organization_id is null or h.recipient_branch_id is null;

alter table public.hawala_transfers drop constraint if exists hawala_transfers_recipient_type_v7;
alter table public.hawala_transfers add constraint hawala_transfers_recipient_type_v7
  check (recipient_type is null or recipient_type in ('internal_branch', 'external_partner'));

alter table public.hawala_transfers drop constraint if exists hawala_transfers_status_check;
alter table public.hawala_transfers add constraint hawala_transfers_status_check check (status in (
  'created', 'funded', 'completed', -- retained only for reconciled legacy history
  'draft', 'sent', 'acknowledged', 'ready', 'paid', 'cancelled', 'expired', 'review_required'
));

alter table public.hawala_status_events add column if not exists branch_id uuid references public.branches(id);

create index if not exists hawala_sender_scope_v7
  on public.hawala_transfers (sender_organization_id, sender_branch_id, created_at desc);
create index if not exists hawala_recipient_scope_v7
  on public.hawala_transfers (recipient_organization_id, recipient_branch_id, created_at desc);
create index if not exists hawala_recipient_reference_v7
  on public.hawala_transfers (recipient_organization_id, recipient_branch_id, upper(trim(reference_code)));

-- Endpoint linking is deliberately an authenticated management action. An
-- arbitrary destination name is never promoted to a network route.
create or replace function public.configure_hawala_partner_endpoint_v7(
  target_org uuid,
  target_partner uuid,
  endpoint_kind text,
  destination_org uuid,
  destination_branch uuid,
  destination_partner uuid
)
returns public.hawala_partners
language plpgsql
security definer
set search_path = ''
as $$
declare
  partner_row public.hawala_partners;
begin
  perform public.require_capability(target_org, 'organization.manage', '{}'::jsonb);
  if endpoint_kind not in ('internal_branch', 'external_partner') then
    raise exception 'HAWALA_ENDPOINT_TYPE_INVALID: Choose an internal branch or external partner';
  end if;
  if not exists (
    select 1 from public.branches b
    where b.id = destination_branch and b.organization_id = destination_org and b.active
  ) then
    raise exception 'HAWALA_ENDPOINT_BRANCH_INVALID: Destination branch is unavailable';
  end if;
  if endpoint_kind = 'internal_branch' and destination_org <> target_org then
    raise exception 'HAWALA_ENDPOINT_ORGANIZATION_INVALID: Internal branches must belong to this organization';
  end if;
  if endpoint_kind = 'external_partner' and not exists (
    select 1 from public.hawala_partners hp
    where hp.id = destination_partner and hp.organization_id = destination_org and hp.active
  ) then
    raise exception 'HAWALA_RECIPROCAL_PARTNER_REQUIRED: The recipient organization must register its matching partner';
  end if;
  update public.hawala_partners hp
  set endpoint_type = endpoint_kind,
      recipient_organization_id = destination_org,
      recipient_branch_id = destination_branch,
      reciprocal_partner_id = case when endpoint_kind = 'external_partner' then destination_partner else null end,
      endpoint_verified_at = now(),
      endpoint_active = true
  where hp.id = target_partner and hp.organization_id = target_org and hp.active
  returning hp.* into partner_row;
  if partner_row.id is null then raise exception 'HAWALA_PARTNER_UNAVAILABLE: Partner is unavailable'; end if;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (target_org, (select auth.uid()), 'hawala_endpoint_configured', jsonb_build_object(
    'partner_id', target_partner, 'endpoint_type', endpoint_kind,
    'recipient_organization_id', destination_org, 'recipient_branch_id', destination_branch,
    'reciprocal_partner_id', destination_partner
  ));
  return partner_row;
end;
$$;

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
  endpoint_active boolean
)
language sql
security definer
stable
set search_path = ''
as $$
  select hp.id, hp.counterparty_id, hp.name, hp.active, hp.endpoint_type,
    hp.recipient_organization_id, hp.recipient_branch_id, hp.reciprocal_partner_id,
    hp.endpoint_verified_at, hp.endpoint_active
  from public.hawala_partners hp
  where hp.organization_id = target_org
    and hp.active
    and public.has_capability(target_org, 'hawala.view', '{}'::jsonb)
  order by hp.name, hp.id;
$$;

create or replace function public.notify_hawala_scope_v7(
  target_org uuid,
  target_branch uuid,
  notice_type text,
  transfer_id uuid,
  notice_message text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (organization_id, recipient_user_id, notification_type, subject_id, message)
  select target_org, m.user_id, notice_type, transfer_id::text, notice_message
  from public.organization_memberships m
  left join public.membership_capability_overrides override_rule
    on override_rule.membership_id = m.id and override_rule.capability_code = 'hawala.view'
    and (override_rule.expires_at is null or override_rule.expires_at > now())
  where m.organization_id = target_org and m.active
    and coalesce(override_rule.allowed, exists (
      select 1 from public.role_capabilities rc
      where rc.role_code = m.role_code and rc.capability_code = 'hawala.view'
    ))
    and (
      target_branch = any(coalesce(override_rule.branch_ids, '{}'::uuid[]))
      or (
        cardinality(coalesce(override_rule.branch_ids, '{}'::uuid[])) = 0
        and (
          not exists (select 1 from public.organization_branch_access ba0 where ba0.membership_id = m.id)
          or exists (
            select 1 from public.organization_branch_access ba
            where ba.membership_id = m.id and ba.branch_id = target_branch
          )
        )
      )
    )
  on conflict (organization_id, recipient_user_id, notification_type, subject_id)
  do update set message = excluded.message, status = 'unread', created_at = now();
$$;

create or replace function public.record_hawala_send_v7(command jsonb)
returns public.hawala_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  partner_id_value uuid := nullif(command->>'hawala_partner_id', '')::uuid;
  requested_expiry timestamptz := coalesce(nullif(command->>'expires_at', '')::timestamptz, now() + interval '72 hours');
  partner_row public.hawala_partners;
  result public.hawala_transfers;
begin
  select hp.* into partner_row from public.hawala_partners hp
  where hp.id = partner_id_value and hp.organization_id = org_id and hp.active
  for update;
  if partner_row.id is null or not partner_row.endpoint_active or partner_row.endpoint_verified_at is null
     or partner_row.endpoint_type is null or partner_row.recipient_organization_id is null
     or partner_row.recipient_branch_id is null then
    raise exception 'HAWALA_ENDPOINT_REQUIRED: Choose a verified exact recipient organization and branch';
  end if;
  if partner_row.endpoint_type = 'external_partner' and (
    partner_row.reciprocal_partner_id is null or not exists (
      select 1 from public.hawala_partners recipient_partner
      where recipient_partner.id = partner_row.reciprocal_partner_id
        and recipient_partner.organization_id = partner_row.recipient_organization_id
        and recipient_partner.active
    )
  ) then
    raise exception 'HAWALA_RECIPROCAL_PARTNER_REQUIRED: Recipient partner link is incomplete';
  end if;
  if not exists (
    select 1 from public.branches b where b.id = partner_row.recipient_branch_id
      and b.organization_id = partner_row.recipient_organization_id and b.active
  ) then raise exception 'HAWALA_ENDPOINT_BRANCH_INVALID: Destination branch is unavailable'; end if;
  if requested_expiry <= now() or requested_expiry > now() + interval '30 days' then
    raise exception 'HAWALA_EXPIRY_INVALID: Expiry must be within the next 30 days';
  end if;

  result := public.record_hawala_send_v6(command);
  update public.hawala_transfers h
  set sender_organization_id = org_id,
      sender_branch_id = h.branch_id,
      sender_user_id = (select auth.uid()),
      recipient_type = partner_row.endpoint_type,
      recipient_organization_id = partner_row.recipient_organization_id,
      recipient_partner_id = partner_row.reciprocal_partner_id,
      recipient_branch_id = partner_row.recipient_branch_id,
      expires_at = requested_expiry,
      status = 'sent',
      integrity_state = 'valid'
  where h.id = result.id
  returning h.* into result;
  insert into public.hawala_status_events (
    transfer_id, status, previous_status, next_status, reason, actor_user_id, journal_entry_id, branch_id
  ) values (
    result.id, 'sent', 'funded', 'sent', 'Sent to verified exact recipient endpoint',
    (select auth.uid()), result.journal_entry_id, result.sender_branch_id
  );
  perform public.notify_hawala_scope_v7(
    result.recipient_organization_id, result.recipient_branch_id, 'hawala_incoming', result.id,
    'A Hawala transfer arrived for this branch.'
  );
  return result;
end;
$$;

create or replace function public.record_hawala_incoming_v7(command jsonb)
returns public.hawala_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  partner_id_value uuid := nullif(command->>'hawala_partner_id', '')::uuid;
  partner_row public.hawala_partners;
  result public.hawala_transfers;
begin
  select hp.* into partner_row from public.hawala_partners hp
  where hp.id = partner_id_value and hp.organization_id = org_id and hp.active
    and hp.endpoint_active and hp.endpoint_verified_at is not null
  for update;
  if partner_row.id is null then
    raise exception 'HAWALA_ENDPOINT_REQUIRED: Incoming instructions require a verified sending partner';
  end if;
  result := public.record_hawala_incoming(command);
  update public.hawala_transfers h
  set sender_organization_id = coalesce(partner_row.recipient_organization_id, org_id),
      sender_branch_id = coalesce(partner_row.recipient_branch_id, h.branch_id),
      sender_user_id = null,
      recipient_type = case when partner_row.recipient_organization_id = org_id then 'internal_branch' else 'external_partner' end,
      recipient_organization_id = org_id,
      recipient_partner_id = partner_row.id,
      recipient_branch_id = h.branch_id,
      expires_at = coalesce(nullif(command->>'expires_at', '')::timestamptz, now() + interval '72 hours'),
      integrity_state = 'valid'
  where h.id = result.id
  returning h.* into result;
  return result;
end;
$$;

-- Return only the active branch's sender or exact-recipient view. The same row
-- is never disclosed to an unrelated branch, tenant, count, or search result.
create or replace function public.list_hawala_transfers_v7(target_org uuid, target_branch uuid)
returns setof jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select to_jsonb(h) || jsonb_build_object(
    'direction', case
      when h.recipient_organization_id = target_org and h.recipient_branch_id = target_branch
        and not (h.sender_organization_id = target_org and h.sender_branch_id = target_branch) then 'incoming'
      when h.sender_organization_id = target_org and h.sender_branch_id = target_branch then 'outgoing'
      else h.direction
    end,
    'status', case
      when h.expires_at <= now() and h.status in ('draft', 'sent', 'acknowledged', 'ready') then 'expired'
      else h.status
    end
  )
  from public.hawala_transfers h
  where (
      h.sender_organization_id = target_org and h.sender_branch_id = target_branch
      and public.can_access_branch_v6(target_org, target_branch, 'hawala.view')
    ) or (
      h.recipient_organization_id = target_org and h.recipient_branch_id = target_branch
      and public.can_access_branch_v6(target_org, target_branch, 'hawala.view')
    )
  order by h.created_at desc, h.id desc;
$$;

drop policy if exists hawala_capability_read on public.hawala_transfers;
create policy hawala_exact_scope_read_v7 on public.hawala_transfers
for select to authenticated using (
  (
    sender_organization_id is not null and sender_branch_id is not null
    and public.has_capability(sender_organization_id, 'hawala.view', jsonb_build_object('branch_id', sender_branch_id))
  ) or (
    recipient_organization_id is not null and recipient_branch_id is not null
    and public.has_capability(recipient_organization_id, 'hawala.view', jsonb_build_object('branch_id', recipient_branch_id))
  )
);

drop policy if exists hawala_status_member_read on public.hawala_status_events;
create policy hawala_status_exact_scope_read_v7 on public.hawala_status_events
for select to authenticated using (
  exists (
    select 1
    from public.hawala_transfers h
    where h.id = transfer_id
      and (
        (
          h.sender_organization_id is not null and h.sender_branch_id is not null
          and public.has_capability(
            h.sender_organization_id,
            'hawala.view',
            jsonb_build_object('branch_id', h.sender_branch_id)
          )
        ) or (
          h.recipient_organization_id is not null and h.recipient_branch_id is not null
          and public.has_capability(
            h.recipient_organization_id,
            'hawala.view',
            jsonb_build_object('branch_id', h.recipient_branch_id)
          )
        )
      )
  )
);

-- Paid evidence can belong to the exact recipient organization even when the
-- transfer was created by another organization.
create or replace function public.enforce_hawala_paid_invariant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare payout_org uuid := coalesce(new.recipient_organization_id, new.organization_id);
begin
  if new.status = 'paid' then
    if new.direction <> 'incoming' and new.recipient_organization_id is null then
      raise exception 'HAWALA_PAYOUT_DIRECTION_INVALID: Paid requires an exact incoming recipient';
    end if;
    if new.payout_journal_entry_id is null or new.payout_receipt_id is null or new.payout_paid_at is null then
      raise exception 'HAWALA_PAYOUT_EVIDENCE_REQUIRED: Paid Hawala requires journal, receipt, and payout time';
    end if;
    if not exists (
      select 1 from public.journal_entries je
      where je.id = new.payout_journal_entry_id and je.organization_id = payout_org and je.status = 'posted'
    ) then raise exception 'HAWALA_PAYOUT_JOURNAL_INVALID: Payout journal is missing or outside recipient scope'; end if;
    if not exists (
      select 1 from public.receipts r where r.id = new.payout_receipt_id
        and r.organization_id = payout_org and r.journal_entry_id = new.payout_journal_entry_id
    ) then raise exception 'HAWALA_PAYOUT_RECEIPT_INVALID: Payout receipt does not belong to the payout journal'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.find_hawala_payout(target_org uuid, reference_code_input text)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  result jsonb;
  transfer_row public.hawala_transfers;
  normalized_reference text := upper(trim(reference_code_input));
  matching_count bigint;
begin
  if length(normalized_reference) < 4 then return null; end if;
  select count(*) into matching_count from public.hawala_transfers h
  where h.recipient_organization_id = target_org
    and upper(trim(h.reference_code)) = normalized_reference
    and h.status = 'ready' and h.integrity_state = 'valid'
    and h.expires_at > now()
    and public.can_access_branch_v6(target_org, h.recipient_branch_id, 'hawala.payout');
  if matching_count > 1 then
    raise exception 'HAWALA_REFERENCE_AMBIGUOUS: Multiple ready transfers use this reference';
  end if;
  select h.* into transfer_row from public.hawala_transfers h
  where h.recipient_organization_id = target_org
    and upper(trim(h.reference_code)) = normalized_reference
    and h.status = 'ready' and h.integrity_state = 'valid'
    and h.expires_at > now()
    and public.can_access_branch_v6(target_org, h.recipient_branch_id, 'hawala.payout');
  if transfer_row.id is null then return null; end if;
  perform public.require_capability(target_org, 'hawala.payout', jsonb_build_object(
    'branch_id', transfer_row.recipient_branch_id, 'amount_native', transfer_row.amount,
    'amount_base', transfer_row.base_amount, 'currency', transfer_row.currency_code,
    'feature', 'hawala', 'requires_active_plan', true
  ));
  result := jsonb_build_object(
    'transfer_id', transfer_row.id, 'reference_code', transfer_row.reference_code,
    'beneficiary_name', transfer_row.beneficiary_name,
    'destination_location', transfer_row.destination_location,
    'currency_code', transfer_row.currency_code, 'amount', transfer_row.amount,
    'branch_id', transfer_row.recipient_branch_id,
    'hawala_partner_id', coalesce(transfer_row.recipient_partner_id, transfer_row.hawala_partner_id)
  );
  return result;
end;
$$;

create or replace function public.transition_hawala_status_v7(command jsonb)
returns public.hawala_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid := nullif(command->>'organization_id', '')::uuid;
  transfer_id_value uuid := nullif(command->>'transfer_id', '')::uuid;
  next_status text := lower(trim(command->>'status'));
  reason_value text := nullif(trim(command->>'reason'), '');
  actor_id uuid := (select auth.uid());
  transfer_row public.hawala_transfers;
  previous_status text;
  scope_branch uuid;
  actor_side text;
begin
  if actor_id is null then raise exception 'AUTH_REQUIRED: Authentication required'; end if;
  if target_org is null or transfer_id_value is null or next_status not in (
    'draft', 'sent', 'acknowledged', 'ready', 'cancelled', 'expired', 'review_required'
  ) then raise exception 'HAWALA_STATUS_INVALID: Paid is permitted only through the payout command'; end if;
  if reason_value is null or length(reason_value) < 3 then
    raise exception 'HAWALA_REASON_REQUIRED: Record an auditable transition reason';
  end if;
  select h.* into transfer_row from public.hawala_transfers h where h.id = transfer_id_value for update;
  if transfer_row.id is null then raise exception 'HAWALA_NOT_FOUND: Transfer is unavailable'; end if;

  if transfer_row.recipient_organization_id = target_org
     and public.can_access_branch_v6(target_org, transfer_row.recipient_branch_id, 'hawala.transition') then
    actor_side := 'recipient';
    scope_branch := transfer_row.recipient_branch_id;
  elsif transfer_row.sender_organization_id = target_org
     and public.can_access_branch_v6(target_org, transfer_row.sender_branch_id, 'hawala.transition') then
    actor_side := 'sender';
    scope_branch := transfer_row.sender_branch_id;
  else
    raise exception 'HAWALA_NOT_FOUND: Transfer is unavailable';
  end if;
  perform public.require_capability(target_org, 'hawala.transition', jsonb_build_object(
    'branch_id', scope_branch, 'feature', 'hawala', 'requires_active_plan', true
  ));

  previous_status := transfer_row.status;
  if next_status = 'paid' then
    raise exception 'HAWALA_STATUS_INVALID: Paid is permitted only through the payout command';
  end if;
  if next_status in ('acknowledged', 'ready') and actor_side <> 'recipient' then
    raise exception 'HAWALA_TRANSITION_INVALID: Only the exact recipient may acknowledge or ready a transfer';
  end if;
  if next_status = 'sent' and actor_side <> 'sender' then
    raise exception 'HAWALA_TRANSITION_INVALID: Only the sender may send a transfer';
  end if;
  if not (
    (previous_status = 'draft' and next_status in ('sent', 'cancelled'))
    or (previous_status in ('created', 'funded') and next_status in ('sent', 'cancelled', 'review_required'))
    or (previous_status = 'sent' and next_status in ('acknowledged', 'cancelled', 'expired', 'review_required'))
    or (previous_status = 'acknowledged' and next_status in ('ready', 'cancelled', 'expired', 'review_required'))
    or (previous_status = 'ready' and next_status in ('cancelled', 'expired', 'review_required'))
    or (previous_status = 'review_required' and next_status in ('acknowledged', 'ready', 'cancelled'))
  ) then
    raise exception 'HAWALA_TRANSITION_INVALID: Invalid transition from % to %', previous_status, next_status;
  end if;
  if next_status = 'expired' and coalesce(transfer_row.expires_at, now() + interval '1 second') > now() then
    raise exception 'HAWALA_NOT_EXPIRED: Transfer has not reached its expiry time';
  end if;

  update public.hawala_transfers h
  set status = next_status,
      integrity_state = case when next_status = 'review_required' then 'review_required'
        when previous_status = 'review_required' then 'valid' else h.integrity_state end,
      cancelled_reason = case when next_status = 'cancelled' then reason_value else h.cancelled_reason end
  where h.id = transfer_row.id returning h.* into transfer_row;
  insert into public.hawala_status_events (
    transfer_id, status, previous_status, next_status, reason, actor_user_id, branch_id
  ) values (transfer_row.id, next_status, previous_status, next_status, reason_value, actor_id, scope_branch);
  insert into public.auth_security_events (organization_id, user_id, event_type, metadata)
  values (target_org, actor_id, 'hawala_status_changed', jsonb_build_object(
    'transfer_id', transfer_row.id, 'from', previous_status, 'to', next_status,
    'branch_id', scope_branch, 'actor_side', actor_side
  ));
  if actor_side = 'recipient' then
    perform public.notify_hawala_scope_v7(
      transfer_row.sender_organization_id, transfer_row.sender_branch_id,
      'hawala_status_changed', transfer_row.id, 'The recipient branch updated a Hawala transfer.'
    );
  else
    perform public.notify_hawala_scope_v7(
      transfer_row.recipient_organization_id, transfer_row.recipient_branch_id,
      'hawala_status_changed', transfer_row.id, 'The sender branch updated a Hawala transfer.'
    );
  end if;
  return transfer_row;
end;
$$;

create or replace function public.request_hawala_payout_approval(command jsonb)
returns public.approval_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  normalized_reference text := upper(trim(command->>'reference_code'));
  actor_id uuid := (select auth.uid());
  transfer_row public.hawala_transfers;
  existing public.approval_requests;
  result public.approval_requests;
  matching_count bigint;
begin
  select count(*) into matching_count from public.hawala_transfers h
  where h.recipient_organization_id = org_id
    and upper(trim(h.reference_code)) = normalized_reference
    and h.status = 'ready' and h.integrity_state = 'valid' and h.expires_at > now()
    and public.can_access_branch_v6(org_id, h.recipient_branch_id, 'approval.request');
  if matching_count > 1 then raise exception 'HAWALA_REFERENCE_AMBIGUOUS: Multiple ready transfers use this reference'; end if;
  select h.* into transfer_row from public.hawala_transfers h
  where h.recipient_organization_id = org_id
    and upper(trim(h.reference_code)) = normalized_reference
    and h.status = 'ready' and h.integrity_state = 'valid' and h.expires_at > now()
    and public.can_access_branch_v6(org_id, h.recipient_branch_id, 'approval.request');
  if transfer_row.id is null then raise exception 'HAWALA_NOT_READY: No payable incoming transfer matches this reference'; end if;
  perform public.require_capability(org_id, 'approval.request', jsonb_build_object(
    'branch_id', transfer_row.recipient_branch_id, 'amount_base', transfer_row.base_amount
  ));
  select a.* into existing from public.approval_requests a
  where a.organization_id = org_id and a.requested_by = actor_id
    and a.action_type = 'hawala_payout' and a.status in ('pending', 'approved')
    and a.payload_summary->>'transfer_id' = transfer_row.id::text
    and a.expires_at > now() and a.consumed_at is null
  order by case when a.status = 'approved' then 0 else 1 end, a.requested_at desc limit 1;
  if existing.id is not null then return existing; end if;
  insert into public.approval_requests (
    organization_id, branch_id, requested_by, action_type, payload_summary, draft_payload,
    reason, amount_base, currency_code, expires_at
  ) values (
    org_id, transfer_row.recipient_branch_id, actor_id, 'hawala_payout',
    command || jsonb_build_object('transfer_id', transfer_row.id, 'reference_code', normalized_reference), command,
    coalesce(nullif(trim(command->>'approval_reason'), ''), 'Hawala payout approval required'),
    transfer_row.base_amount, transfer_row.currency_code, now() + interval '1 hour'
  ) returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (org_id, actor_id, 'approval_requested', jsonb_build_object(
    'approval_id', result.id, 'action_type', 'hawala_payout', 'transfer_id', transfer_row.id
  ));
  return result;
end;
$$;

create or replace function public.pay_hawala_beneficiary(command jsonb)
returns public.hawala_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  normalized_reference text := upper(trim(command->>'reference_code'));
  account_id_value uuid := nullif(command->>'money_account_id', '')::uuid;
  actor_id uuid := (select auth.uid());
  client_id text := nullif(trim(command->>'client_command_id'), '');
  identity_reference text := nullif(trim(command->>'recipient_identity_reference'), '');
  identity_confirmed boolean := coalesce((command->>'identity_confirmed')::boolean, false);
  approval_id_value uuid := nullif(command->>'approval_id', '')::uuid;
  transfer_row public.hawala_transfers;
  money public.money_accounts;
  payout_partner public.hawala_partners;
  existing_event public.financial_events;
  receipt_id_value uuid;
  event_id uuid;
  entry_id uuid;
  cash_account uuid;
  beneficiary_account uuid;
  threshold_value numeric := 0;
  requires_approval boolean := false;
  approval_valid boolean := false;
  matching_count bigint;
begin
  if actor_id is null then raise exception 'AUTH_REQUIRED: Authentication required'; end if;
  if org_id is null or account_id_value is null or client_id is null or length(normalized_reference) < 4 then
    raise exception 'HAWALA_PAYOUT_DETAILS_REQUIRED: Organization, exact reference, account, and command id are required';
  end if;
  if not identity_confirmed or identity_reference is null or length(identity_reference) < 2 then
    raise exception 'HAWALA_IDENTITY_REQUIRED: Confirm the recipient identity and record the checked identifier';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || client_id, 0));
  select * into existing_event from public.financial_events
  where organization_id = org_id and client_command_id = client_id;
  if existing_event.id is not null then
    select h.* into transfer_row from public.hawala_transfers h
    where h.payout_journal_entry_id in (
      select je.id from public.journal_entries je where je.financial_event_id = existing_event.id
    ) limit 1;
    if transfer_row.id is null then raise exception 'IDEMPOTENCY_CONFLICT: Command id belongs to another operation'; end if;
    return transfer_row;
  end if;

  select count(*) into matching_count from public.hawala_transfers h
  where h.recipient_organization_id = org_id
    and upper(trim(h.reference_code)) = normalized_reference
    and h.status = 'ready' and h.integrity_state = 'valid' and h.expires_at > now()
    and public.can_access_branch_v6(org_id, h.recipient_branch_id, 'hawala.payout');
  if matching_count > 1 then raise exception 'HAWALA_REFERENCE_AMBIGUOUS: Multiple ready transfers use this reference'; end if;
  select h.* into transfer_row from public.hawala_transfers h
  where h.recipient_organization_id = org_id
    and upper(trim(h.reference_code)) = normalized_reference
  for update;
  if transfer_row.id is null or transfer_row.status <> 'ready' or transfer_row.integrity_state <> 'valid'
     or transfer_row.expires_at <= now() or transfer_row.recipient_branch_id is null then
    raise exception 'HAWALA_NOT_READY: No payable incoming transfer matches this exact reference';
  end if;
  if not public.can_access_branch_v6(org_id, transfer_row.recipient_branch_id, 'hawala.payout') then
    raise exception 'HAWALA_NOT_READY: No payable incoming transfer matches this exact reference';
  end if;
  select hp.* into payout_partner from public.hawala_partners hp
  where hp.id = coalesce(transfer_row.recipient_partner_id, transfer_row.hawala_partner_id)
    and hp.organization_id = org_id and hp.active;
  if transfer_row.recipient_type = 'external_partner' and payout_partner.id is null then
    raise exception 'HAWALA_REVIEW_REQUIRED: Canonical recipient partner is required before payout';
  end if;
  perform public.require_capability(org_id, 'hawala.payout', jsonb_build_object(
    'branch_id', transfer_row.recipient_branch_id, 'amount_native', transfer_row.amount,
    'amount_base', transfer_row.base_amount, 'currency', transfer_row.currency_code,
    'feature', 'hawala', 'requires_active_plan', true, 'device_id', nullif(command->>'device_id', '')
  ));

  if transfer_row.beneficiary_counterparty_id is not null and exists (
    select 1 from public.counterparties cp
    where cp.id = transfer_row.beneficiary_counterparty_id and cp.organization_id = org_id
      and cp.risk_status = 'blocked'
  ) then raise exception 'HAWALA_KYC_BLOCKED: Beneficiary is blocked'; end if;
  if transfer_row.beneficiary_counterparty_id is not null and exists (
    select 1 from public.kyc_profiles kp
    where kp.organization_id = org_id and kp.counterparty_id = transfer_row.beneficiary_counterparty_id
      and kp.review_status <> 'approved'
  ) then raise exception 'HAWALA_KYC_REVIEW_REQUIRED: Beneficiary KYC review is not approved'; end if;

  select coalesce(os.approval_threshold_base, 0) into threshold_value
  from public.organization_settings os where os.organization_id = org_id;
  requires_approval := threshold_value > 0 and transfer_row.base_amount >= threshold_value;
  if approval_id_value is not null then
    select exists (
      select 1 from public.approval_requests a where a.id = approval_id_value
        and a.organization_id = org_id and a.action_type = 'hawala_payout' and a.status = 'approved'
        and a.requested_by = actor_id and a.decided_by is not null and a.decided_by <> actor_id
        and a.expires_at > now() and a.consumed_at is null
        and a.payload_summary->>'transfer_id' = transfer_row.id::text
    ) into approval_valid;
  end if;
  if requires_approval and not approval_valid then
    raise exception 'HAWALA_APPROVAL_REQUIRED: This payout requires an approved, unexpired request';
  end if;

  select ma.* into money from public.money_accounts ma
  where ma.id = account_id_value and ma.organization_id = org_id and ma.active;
  if money.id is null or not public.user_can_use_money_account(org_id, money.id) then
    raise exception 'MONEY_ACCOUNT_UNAVAILABLE: Payout account is unavailable';
  end if;
  if money.branch_id is not null and money.branch_id <> transfer_row.recipient_branch_id then
    raise exception 'MONEY_ACCOUNT_SCOPE: Payout account belongs to another branch';
  end if;
  perform public.require_money_account_balance(org_id, money.id, transfer_row.currency_code, transfer_row.amount);

  command := command || jsonb_build_object(
    'workflow_type', 'hawala_beneficiary_payout', 'transfer_id', transfer_row.id,
    'hawala_partner_id', payout_partner.id, 'reference_code', transfer_row.reference_code,
    'currency', transfer_row.currency_code, 'amount', transfer_row.amount,
    'base_amount', transfer_row.base_amount, 'money_account_id', money.id, 'cashbox_id', money.cashbox_id,
    'identity_confirmed', true, 'recipient_identity_reference', identity_reference,
    'approval_id', approval_id_value, 'source_account_name', transfer_row.beneficiary_name,
    'destination_account_name', money.name, 'source_account_kind', 'hawala_partner_receivable',
    'destination_account_kind', 'money_account', 'money_flow_version', 7
  );
  insert into public.financial_events (
    organization_id, branch_id, counterparty_id, event_type, immutable_reference,
    occurred_at, created_by, client_command_id, metadata
  ) values (
    org_id, transfer_row.recipient_branch_id,
    case when exists (select 1 from public.counterparties cp where cp.id = transfer_row.beneficiary_counterparty_id and cp.organization_id = org_id)
      then transfer_row.beneficiary_counterparty_id else null end,
    'pay_money', 'hawala-payout-' || transfer_row.id, now(), actor_id, client_id, command
  ) returning id into event_id;
  insert into public.journal_entries (
    organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo
  ) values (
    org_id, transfer_row.recipient_branch_id, event_id, 'posted', now(), now(), actor_id, actor_id,
    nullif(trim(command->>'memo'), '')
  ) returning id into entry_id;
  cash_account := public.ensure_money_ledger_account(org_id, money.id, transfer_row.currency_code);
  select la.id into beneficiary_account from public.ledger_accounts la
  where la.organization_id = org_id
    and la.code = 'hawala:beneficiary-payable:' || transfer_row.id || ':' || transfer_row.currency_code;
  if beneficiary_account is null then
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
    values (
      org_id, 'hawala:partner-receivable:' || coalesce(payout_partner.id::text, 'internal') || ':' || transfer_row.currency_code,
      'Hawala partner receivable · ' || coalesce(payout_partner.name, 'Internal branch') || ' · ' || transfer_row.currency_code,
      'asset', transfer_row.currency_code
    ) on conflict (organization_id, code) do update set name = excluded.name, active = true
    returning id into beneficiary_account;
  end if;
  insert into public.journal_lines (
    organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit
  ) values (org_id, entry_id, beneficiary_account, transfer_row.currency_code, transfer_row.amount, transfer_row.base_amount);
  insert into public.journal_lines (
    organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit
  ) values (org_id, entry_id, cash_account, transfer_row.currency_code, transfer_row.amount, transfer_row.base_amount);
  select r.id into receipt_id_value from public.receipts r where r.journal_entry_id = entry_id;
  if receipt_id_value is null then raise exception 'HAWALA_RECEIPT_MISSING: Payout receipt was not materialized'; end if;
  update public.hawala_transfers h
  set status = 'paid', payout_journal_entry_id = entry_id, payout_receipt_id = receipt_id_value,
      payout_paid_at = now(), integrity_state = 'valid'
  where h.id = transfer_row.id returning h.* into transfer_row;
  insert into public.hawala_status_events (
    transfer_id, status, previous_status, next_status, reason, actor_user_id, journal_entry_id, branch_id
  ) values (
    transfer_row.id, 'paid', 'ready', 'paid', 'Recipient identity verified', actor_id, entry_id,
    transfer_row.recipient_branch_id
  );
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id)
  values (org_id, client_id, entry_id);
  if approval_id_value is not null then
    update public.approval_requests set consumed_at = now(), consumed_by = actor_id,
      consumed_journal_entry_id = entry_id
    where id = approval_id_value and organization_id = org_id and status = 'approved' and consumed_at is null;
    if not found then raise exception 'APPROVAL_CONSUMPTION_FAILED: Approval is invalid or already used'; end if;
  end if;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (org_id, actor_id, 'hawala_beneficiary_paid', jsonb_build_object(
    'transfer_id', transfer_row.id, 'journal_entry_id', entry_id, 'receipt_id', receipt_id_value,
    'approval_id', approval_id_value, 'identity_evidence', 'verified'
  ));
  perform public.notify_hawala_scope_v7(
    transfer_row.sender_organization_id, transfer_row.sender_branch_id,
    'hawala_paid', transfer_row.id, 'A Hawala transfer was paid by its exact recipient branch.'
  );
  perform public.notify_hawala_scope_v7(
    transfer_row.recipient_organization_id, transfer_row.recipient_branch_id,
    'hawala_paid', transfer_row.id, 'The Hawala payout and receipt were completed.'
  );
  return transfer_row;
end;
$$;

create or replace function public.resume_approved_hawala_payout(target_approval uuid)
returns public.hawala_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval_row public.approval_requests;
  command jsonb;
  result public.hawala_transfers;
begin
  select a.* into approval_row from public.approval_requests a
  where a.id = target_approval and a.requested_by = (select auth.uid()) for update;
  if approval_row.consumed_at is not null and approval_row.consumed_journal_entry_id is not null then
    select h.* into result from public.hawala_transfers h
    where h.recipient_organization_id = approval_row.organization_id
      and h.payout_journal_entry_id = approval_row.consumed_journal_entry_id;
    if result.id is not null then return result; end if;
  end if;
  if approval_row.id is null or approval_row.action_type <> 'hawala_payout'
     or approval_row.status <> 'approved' or approval_row.expires_at <= now()
     or approval_row.consumed_at is not null then
    raise exception 'APPROVAL_INVALID: Approved, unexpired, unused Hawala payout approval required';
  end if;
  command := coalesce(approval_row.draft_payload, approval_row.payload_summary)
    || jsonb_build_object('approval_id', approval_row.id);
  return public.pay_hawala_beneficiary(command);
end;
$$;

revoke all on function public.configure_hawala_partner_endpoint_v7(uuid, uuid, text, uuid, uuid, uuid) from public, anon;
revoke all on function public.get_hawala_partners(uuid) from public, anon;
revoke all on function public.record_hawala_send_v7(jsonb) from public, anon;
revoke all on function public.record_hawala_incoming_v7(jsonb) from public, anon;
revoke all on function public.list_hawala_transfers_v7(uuid, uuid) from public, anon;
revoke all on function public.find_hawala_payout(uuid, text) from public, anon;
revoke all on function public.transition_hawala_status_v7(jsonb) from public, anon;
revoke all on function public.notify_hawala_scope_v7(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.configure_hawala_partner_endpoint_v7(uuid, uuid, text, uuid, uuid, uuid) to authenticated;
grant execute on function public.get_hawala_partners(uuid) to authenticated;
grant execute on function public.record_hawala_send_v7(jsonb) to authenticated;
grant execute on function public.record_hawala_incoming_v7(jsonb) to authenticated;
grant execute on function public.list_hawala_transfers_v7(uuid, uuid) to authenticated;
grant execute on function public.find_hawala_payout(uuid, text) to authenticated;
grant execute on function public.transition_hawala_status_v7(jsonb) to authenticated;
