-- Require report permission and record every generated export.

create or replace function public.record_report_export(command jsonb)
returns public.report_exports
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid := (command->>'organization_id')::uuid;
  actor_id uuid := auth.uid();
  report_name_value text := nullif(trim(command->>'report_name'), '');
  format_value text := lower(command->>'format');
  result public.report_exports;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if report_name_value is null or format_value not in ('csv', 'pdf', 'xlsx', 'print') then raise exception 'Report name and supported format are required'; end if;
  if not public.has_org_permission(org_id, 'financial:report') then raise exception 'Report permission required'; end if;
  insert into public.report_exports (organization_id, generated_by, report_name, format, filters, expires_at)
    values (org_id, actor_id, report_name_value, format_value, coalesce(command->'filters', '{}'::jsonb), now() + interval '1 day') returning * into result;
  return result;
end;
$$;

revoke all on function public.record_report_export(jsonb) from public;
grant execute on function public.record_report_export(jsonb) to authenticated;