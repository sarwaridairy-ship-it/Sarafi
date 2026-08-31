-- Return exact server-side journal totals so acceptance checks never rely on
-- JavaScript's binary floating-point parsing of PostgREST numeric values.
create or replace function public.get_journal_balance_audit(target_org uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.is_org_member(target_org) then
    raise exception 'Organization membership required';
  end if;

  with entry_totals as (
    select
      je.id,
      coalesce(sum(jl.base_debit), 0) as debit,
      coalesce(sum(jl.base_credit), 0) as credit
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id = je.id
    where je.organization_id = target_org
      and je.status = 'posted'
    group by je.id
  )
  select jsonb_build_object(
    'balanced', count(*) filter (where debit <> credit) = 0,
    'entry_count', count(*),
    'imbalanced_entry_count', count(*) filter (where debit <> credit),
    'total_debit', coalesce(sum(debit), 0)::text,
    'total_credit', coalesce(sum(credit), 0)::text
  )
  into result
  from entry_totals;

  return result;
end;
$$;

revoke all on function public.get_journal_balance_audit(uuid) from public;
revoke execute on function public.get_journal_balance_audit(uuid) from anon;
grant execute on function public.get_journal_balance_audit(uuid) to authenticated;

comment on function public.get_journal_balance_audit(uuid) is
  'Exact tenant-scoped posted-journal balance audit for release acceptance.';
