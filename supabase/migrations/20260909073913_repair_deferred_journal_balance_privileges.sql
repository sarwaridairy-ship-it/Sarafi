-- The balance constraint is deferred until transaction end. After V6 revoked
-- direct journal-line reads, an invoker-security trigger ran as the browser role
-- and failed before it could verify balance. Keep the invariant privileged and
-- expose no callable browser API.
create or replace function public.assert_posted_entry_balanced()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  debit numeric;
  credit numeric;
begin
  if new.status = 'posted' then
    select
      coalesce(sum(jl.base_debit), 0),
      coalesce(sum(jl.base_credit), 0)
    into debit, credit
    from public.journal_lines jl
    where jl.journal_entry_id = new.id;
    if debit <> credit then
      raise exception 'Journal entry % is not balanced', new.id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.assert_posted_entry_balanced()
  from public, anon, authenticated;
