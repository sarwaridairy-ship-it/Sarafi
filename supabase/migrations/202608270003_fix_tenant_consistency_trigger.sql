-- Avoid evaluating table-specific NEW fields on the wrong trigger relation.
create or replace function public.assert_financial_tenant_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'journal_lines' then
    if not exists (
      select 1 from public.journal_entries
      where id = new.journal_entry_id
        and organization_id = new.organization_id
    ) then
      raise exception 'Journal line tenant mismatch';
    end if;
  elsif tg_table_name = 'ledger_accounts' and new.cashbox_id is not null then
    if not exists (
      select 1 from public.cashboxes
      where id = new.cashbox_id
        and organization_id = new.organization_id
    ) then
      raise exception 'Ledger account tenant mismatch';
    end if;
  end if;
  return new;
end;
$$;
