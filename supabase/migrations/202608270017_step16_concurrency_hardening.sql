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

alter table public.fx_inventory_cost_state
  drop constraint if exists fx_inventory_cost_state_quantity_nonnegative;
alter table public.fx_inventory_cost_state
  add constraint fx_inventory_cost_state_quantity_nonnegative check (quantity >= 0);

revoke all on function public.lock_inventory_cost_state() from public;