-- Keep rebuildable inventory cost state aligned when a posted trade is reversed.
create or replace function public.materialize_reversal_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare original_event public.financial_events;
declare original_line record;
declare sold_currency_value text;
declare bought_currency_value text;
declare sold_amount_value numeric;
declare bought_amount_value numeric;
declare sold_cost_value numeric;
declare bought_base_value numeric;
begin
  if new.reversal_of is null then return new; end if;
  select fe.* into original_event from public.journal_entries je join public.financial_events fe on fe.id = je.financial_event_id where je.id = new.reversal_of;
  if original_event.event_type not in ('buy_fx', 'sell_fx', 'exchange_fx') then return new; end if;
  sold_currency_value := upper(original_event.metadata->>'sold_currency');
  bought_currency_value := upper(original_event.metadata->>'bought_currency');
  sold_amount_value := (original_event.metadata->>'sold_amount')::numeric;
  bought_amount_value := (original_event.metadata->>'bought_amount')::numeric;
  bought_base_value := (original_event.metadata->>'bought_base_value')::numeric;
  select jl.currency_code, jl.native_credit, jl.base_credit into original_line
    from public.journal_lines jl join public.ledger_accounts la on la.id = jl.account_id
    where jl.journal_entry_id = new.reversal_of and la.code = 'inventory:' || sold_currency_value and jl.native_credit > 0 limit 1;
  sold_cost_value := coalesce(original_line.base_credit, (original_event.metadata->>'sold_base_value')::numeric);
  if original_event.event_type = 'buy_fx' then
    update public.fx_inventory_cost_state set quantity = quantity - bought_amount_value, carrying_base_value = carrying_base_value - bought_base_value, updated_at = now() where organization_id = original_event.organization_id and currency_code = bought_currency_value;
  else
    insert into public.fx_inventory_cost_state (organization_id, currency_code, quantity, carrying_base_value)
      values (original_event.organization_id, sold_currency_value, sold_amount_value, sold_cost_value)
      on conflict (organization_id, currency_code) do update set quantity = fx_inventory_cost_state.quantity + excluded.quantity, carrying_base_value = fx_inventory_cost_state.carrying_base_value + excluded.carrying_base_value, updated_at = now();
    if original_event.event_type = 'exchange_fx' then
      update public.fx_inventory_cost_state set quantity = quantity - bought_amount_value, carrying_base_value = carrying_base_value - bought_base_value, updated_at = now() where organization_id = original_event.organization_id and currency_code = bought_currency_value;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists materialize_reversal_inventory_after_entry on public.journal_entries;
create trigger materialize_reversal_inventory_after_entry after insert on public.journal_entries for each row execute function public.materialize_reversal_inventory();
