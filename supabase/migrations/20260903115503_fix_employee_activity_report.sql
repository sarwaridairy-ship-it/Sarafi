-- Aggregate employee activity in a subquery before building the JSON array.
-- PostgreSQL does not allow max/count aggregates inside jsonb_agg directly.
do $$
declare
  function_definition text;
  corrected_definition text;
  branch_start integer;
  branch_end integer;
  replacement text := $branch$
  elsif report_code = 'employee_activity' then
    select coalesce(jsonb_agg(row_data order by action_count desc), '[]'::jsonb) into result
    from (
      select jsonb_build_object(
        'reference', p.id, 'date', to_char(max(fe.occurred_at), 'YYYY-MM-DD'),
        'label', coalesce(p.display_name, p.id::text), 'detail', 'financial_actions',
        'amount', count(fe.id), 'currency', 'COUNT', 'status', 'recorded'
      ) row_data, count(fe.id) action_count
      from public.financial_events fe left join public.profiles p on p.id = fe.created_by
      where fe.organization_id = target_org and fe.occurred_at >= start_at and fe.occurred_at < end_at
      group by p.id, p.display_name
    ) employee_rows;
$branch$;
begin
  select pg_get_functiondef('public.get_named_financial_report(uuid,text,date,date)'::regprocedure)
  into function_definition;
  branch_start := strpos(function_definition, '  elsif report_code = ''employee_activity'' then');
  branch_end := strpos(function_definition, '  elsif report_code = ''security_activity'' then');
  if branch_start = 0 or branch_end <= branch_start then
    raise exception 'Expected employee activity report branch was not found';
  end if;
  corrected_definition := substr(function_definition, 1, branch_start - 1)
    || replacement
    || substr(function_definition, branch_end);
  execute corrected_definition;
end;
$$;
