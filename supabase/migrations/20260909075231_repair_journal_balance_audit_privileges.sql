-- V6 intentionally revoked browser access to raw journal tables. Keep the
-- release/audit surface available through one capability-checked tenant RPC.
create or replace function public.get_journal_balance_audit(target_org uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_capability(target_org, 'financial.report', '{}'::jsonb);

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

revoke all on function public.get_journal_balance_audit(uuid) from public, anon;
grant execute on function public.get_journal_balance_audit(uuid) to authenticated;

comment on function public.get_journal_balance_audit(uuid) is
  'Exact tenant-scoped posted-journal balance audit guarded by financial.report.';
