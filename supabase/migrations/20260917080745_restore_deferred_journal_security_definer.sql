-- Deferred constraint triggers execute after the client RPC has returned to the
-- authenticated role. Retain privileged read access to protected journal lines
-- without exposing this trigger function as a callable browser API.
create or replace function public.assert_posted_entry_balanced()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  line_count bigint;
  debit numeric;
  credit numeric;
begin
  if new.status = 'posted' then
    select count(*), coalesce(sum(base_debit), 0), coalesce(sum(base_credit), 0)
      into line_count, debit, credit
    from public.journal_lines
    where journal_entry_id = new.id;
    if line_count < 2 then
      raise exception 'Journal entry % must contain at least two lines', new.id;
    end if;
    if debit <> credit then
      raise exception 'Journal entry % is not balanced', new.id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.assert_posted_entry_balanced()
  from public, anon, authenticated;
