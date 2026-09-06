create or replace function public.get_transaction_rate_context(
  target_org uuid,
  target_branch uuid,
  source_currency text,
  target_currency text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_org_member(target_org) then
    raise exception 'Organization access required';
  end if;
  select jsonb_build_object(
    'from_currency', upper(source_currency),
    'to_currency', upper(target_currency),
    'buy_rate', r.buy_rate,
    'sell_rate', r.sell_rate,
    'spread_tolerance', coalesce(r.spread_tolerance, 0),
    'effective_from', r.effective_from,
    'branch_id', r.branch_id,
    'stale', r.effective_from < now() - interval '24 hours'
  ) into result
  from public.rate_board_entries r
  where r.organization_id = target_org
    and r.from_currency = upper(source_currency)
    and r.to_currency = upper(target_currency)
    and r.active and r.effective_from <= now()
    and (r.branch_id is null or r.branch_id = target_branch)
  order by (r.branch_id is not null) desc, r.effective_from desc
  limit 1;
  return coalesce(result, jsonb_build_object('from_currency', upper(source_currency), 'to_currency', upper(target_currency), 'stale', true));
end;
$$;
revoke all on function public.get_transaction_rate_context(uuid, uuid, text, text) from public;
grant execute on function public.get_transaction_rate_context(uuid, uuid, text, text) to authenticated;

create or replace function public.enforce_authoritative_fx_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare expected numeric; actual numeric; source text; target text; side text;
begin
  if new.event_type not in ('buy_fx', 'sell_fx') then return new; end if;
  side := new.event_type::text;
  source := upper(new.metadata->>'sold_currency');
  target := upper(new.metadata->>'bought_currency');
  select case when side = 'buy_fx' then r.buy_rate else r.sell_rate end
    into expected
  from public.rate_board_entries r
  where r.organization_id = new.organization_id and r.from_currency = source and r.to_currency = 'AFN'
    and r.active and r.effective_from <= coalesce(new.occurred_at, now())
    and (r.branch_id is null or r.branch_id = new.branch_id)
  order by (r.branch_id is not null) desc, r.effective_from desc limit 1;
  if expected is null then raise exception 'No approved current rate exists for this transaction'; end if;
  actual := case when side = 'buy_fx' then (new.metadata->>'sold_base_value')::numeric / nullif((new.metadata->>'bought_amount')::numeric, 0)
                 else (new.metadata->>'bought_base_value')::numeric / nullif((new.metadata->>'sold_amount')::numeric, 0) end;
  if abs(actual - expected) > greatest(0.000001, coalesce((new.metadata->>'rate_tolerance')::numeric, 0)) then
    raise exception 'Transaction rate is stale or does not match the approved rate';
  end if;
  return new;
end;
$$;
drop trigger if exists financial_events_authoritative_fx_rate on public.financial_events;
create trigger financial_events_authoritative_fx_rate before insert on public.financial_events
for each row execute function public.enforce_authoritative_fx_rate();
