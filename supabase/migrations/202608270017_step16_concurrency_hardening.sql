-- Serialize inventory state updates and make prohibited negative positions impossible.

create or replace function public.lock_inventory_cost_state() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text || ':inventory:' || new.currency_code, 0));
  return new;
end;
$$;

drop trigger if exists lock_inventory_cost_state_before_update on public.fx_inventory_cost_state;
create trigger lock_inventory_cost_state_before_update
before update on public.fx_inventory_cost_state
for each row execute function public.lock_inventory_cost_state();

-- The cost-state table is derived state. Reconcile it from the authoritative
-- inventory journal before enforcing the nonnegative invariant. This repairs
-- stale values left by the pre-serialization race without altering journal
-- history or inventing financial activity.
with inventory_totals as (
  select l.organization_id,
         l.currency_code,
         sum(coalesce(l.native_debit, 0) - coalesce(l.native_credit, 0)) as quantity,
         sum(coalesce(l.base_debit, 0) - coalesce(l.base_credit, 0)) as carrying_base_value
  from public.journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where a.code like 'inventory:%'
  group by l.organization_id, l.currency_code
)
insert into public.fx_inventory_cost_state (organization_id, currency_code, quantity, carrying_base_value, updated_at)
select organization_id, currency_code, quantity, carrying_base_value, now()
from inventory_totals
on conflict (organization_id, currency_code) do update
set quantity = excluded.quantity,
    carrying_base_value = excluded.carrying_base_value,
    updated_at = excluded.updated_at;

alter table public.fx_inventory_cost_state
  drop constraint if exists fx_inventory_cost_state_quantity_nonnegative;
alter table public.fx_inventory_cost_state
  add constraint fx_inventory_cost_state_quantity_nonnegative check (quantity >= 0);

revoke all on function public.lock_inventory_cost_state() from public;
