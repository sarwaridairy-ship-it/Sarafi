-- Complete the shop-rate, one-transaction override, stale-rate, and cashier
-- approval paths. Rate tolerance is always read from the server-side rate row.
create or replace function public.enforce_authoritative_fx_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  expected numeric;
  actual numeric;
  tolerance_value numeric := 0;
  effective_value timestamptz;
  foreign_currency text;
  side text;
  role_value text;
  approval_id_value uuid := nullif(new.metadata->>'approval_id', '')::uuid;
  approval_valid boolean := false;
  override_reason_value text := nullif(trim(new.metadata->>'override_reason'), '');
  override_requested boolean := false;
  stale_value boolean := false;
begin
  if new.event_type not in ('buy_fx', 'sell_fx') then return new; end if;
  side := new.event_type::text;
  foreign_currency := upper(case when side = 'buy_fx' then new.metadata->>'bought_currency' else new.metadata->>'sold_currency' end);
  actual := case
    when side = 'buy_fx' then (new.metadata->>'sold_base_value')::numeric / nullif((new.metadata->>'bought_amount')::numeric, 0)
    else (new.metadata->>'bought_base_value')::numeric / nullif((new.metadata->>'sold_amount')::numeric, 0)
  end;
  if actual is null or actual <= 0 then raise exception 'RATE_INVALID: The transaction rate is invalid'; end if;

  select m.role_code into role_value
  from public.organization_memberships m
  where m.organization_id = new.organization_id and m.user_id = auth.uid() and m.active;

  select case when side = 'buy_fx' then r.buy_rate else r.sell_rate end,
         coalesce(r.spread_tolerance, 0), r.effective_from
    into expected, tolerance_value, effective_value
  from public.rate_board_entries r
  where r.organization_id = new.organization_id
    and r.from_currency = foreign_currency
    and r.to_currency = upper(new.metadata->>'base_currency')
    and r.active and r.effective_from <= coalesce(new.occurred_at, now())
    and (r.branch_id is null or r.branch_id = new.branch_id)
  order by (r.branch_id is not null) desc, r.effective_from desc
  limit 1;

  if approval_id_value is not null and role_value in ('owner', 'business_admin', 'manager') then
    select exists (
      select 1 from public.approval_requests a
      where a.id = approval_id_value
        and a.organization_id = new.organization_id
        and a.action_type = 'fx_trade'
        and a.status = 'pending'
        and a.expires_at > now()
    ) into approval_valid;
  end if;

  stale_value := effective_value is not null and effective_value < now() - interval '24 hours';
  override_requested := expected is null or abs(actual - expected) > greatest(0.000001, tolerance_value);

  if expected is null then
    if not approval_valid and not (role_value in ('owner', 'business_admin', 'manager') and override_reason_value is not null) then
      raise exception 'RATE_MISSING: Enter a one-transaction rate or publish a shop rate';
    end if;
  elsif stale_value and coalesce((new.metadata->>'allow_stale_rate')::boolean, false) is not true and not approval_valid then
    raise exception 'RATE_STALE: Review the old rate, enter a new rate, or request approval';
  elsif stale_value and not approval_valid and role_value = 'cashier' then
    raise exception 'RATE_APPROVAL_REQUIRED: A stale-rate transaction requires approval';
  elsif override_requested and not approval_valid
        and not (role_value in ('owner', 'business_admin', 'manager') and override_reason_value is not null) then
    raise exception 'RATE_APPROVAL_REQUIRED: The transaction rate is outside the allowed difference';
  end if;

  new.metadata := new.metadata || jsonb_build_object(
    'shop_rate', expected,
    'applied_rate', actual,
    'rate_tolerance', tolerance_value,
    'rate_effective_from', effective_value,
    'rate_was_stale', stale_value,
    'rate_source', case
      when approval_valid then 'approved_override'
      when override_requested then 'transaction_override'
      when stale_value then 'approved_stale_shop_rate'
      else 'shop_rate'
    end
  );
  return new;
end;
$$;

revoke all on function public.enforce_authoritative_fx_rate() from public, anon, authenticated;

create or replace function public.request_fx_trade_approval(command jsonb)
returns public.approval_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.approval_requests;
  actor_id uuid := auth.uid();
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  branch_id_value uuid := nullif(command->>'branch_id', '')::uuid;
  cashbox_id_value uuid := nullif(command->>'cashbox_id', '')::uuid;
  membership_id_value uuid;
  role_value text;
  side_value text := lower(command->>'side');
  client_id text := nullif(trim(command->>'client_command_id'), '');
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  select id, role_code into membership_id_value, role_value
  from public.organization_memberships
  where organization_id = org_id and user_id = actor_id and active;
  if membership_id_value is null or role_value not in ('owner', 'business_admin', 'manager', 'cashier') then raise exception 'User cannot request this approval'; end if;
  if not exists (select 1 from public.branches where id = branch_id_value and organization_id = org_id and active) then raise exception 'Branch is not active or belongs to another organization'; end if;
  if not exists (select 1 from public.cashboxes where id = cashbox_id_value and branch_id = branch_id_value and organization_id = org_id and active) then raise exception 'Cashbox is not active or belongs to another branch'; end if;
  if side_value not in ('buy_fx', 'sell_fx', 'exchange_fx') then raise exception 'Unsupported approval operation'; end if;
  if client_id is null or (command->>'sold_base_value')::numeric <= 0 or (command->>'bought_base_value')::numeric <= 0 then raise exception 'Approval amounts must be positive and identifiable'; end if;

  select a.* into result
  from public.approval_requests a
  where a.organization_id = org_id
    and a.requested_by = actor_id
    and a.action_type = 'fx_trade'
    and a.status = 'pending'
    and a.payload_summary->>'client_command_id' = client_id
  limit 1;
  if result.id is not null then return result; end if;

  command := command || jsonb_build_object('side', side_value);
  insert into public.approval_requests (organization_id, branch_id, requested_by, action_type, payload_summary, reason, amount_base, currency_code, expires_at)
    values (org_id, branch_id_value, actor_id, 'fx_trade', command, coalesce(nullif(trim(command->>'approval_reason'), ''), 'FX rate approval required'), greatest((command->>'sold_base_value')::numeric, (command->>'bought_base_value')::numeric), upper(command->>'base_currency'), now() + interval '1 hour')
    returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
    values (org_id, actor_id, 'approval_requested', jsonb_build_object('approval_id', result.id, 'action_type', result.action_type, 'amount_base', result.amount_base, 'client_command_id', client_id));
  return result;
end;
$$;

revoke all on function public.request_fx_trade_approval(jsonb) from public, anon;
grant execute on function public.request_fx_trade_approval(jsonb) to authenticated;

-- Remove variables made obsolete by authoritative daily valuation.
do $cleanup$
declare
  function_name text;
  definition text;
  revised text;
begin
  foreach function_name in array array['record_operation', 'record_debt', 'settle_debt', 'record_hawala_send'] loop
    select pg_get_functiondef(p.oid) into definition
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = function_name and pg_get_function_identity_arguments(p.oid) = 'command jsonb';
    revised := replace(definition, E'  base_currency_value text;\n', '');
    revised := replace(revised, E'  select base_currency_code into base_currency_value from public.organizations where id = org_id;\n', '');
    revised := replace(revised, E'  select base_currency_code into base_currency_value from public.organizations where id = debt.organization_id;\n', '');
    if revised = definition then raise exception '% cleanup patch did not match', function_name; end if;
    execute revised;
  end loop;
end;
$cleanup$;
