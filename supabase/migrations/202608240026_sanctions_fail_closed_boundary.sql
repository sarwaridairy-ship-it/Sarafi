-- Sanctions screening is fail-closed until an approved provider is configured.

create or replace function public.require_sanctions_provider(target_org uuid)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare provider_name_value text;
begin
  if not public.has_org_permission(target_org, 'compliance:review') then raise exception 'Compliance permission required'; end if;
  select feature_code into provider_name_value from public.organization_features where organization_id = target_org and feature_code like 'sanctions_provider:%' and enabled = true limit 1;
  if provider_name_value is null then raise exception 'No approved sanctions provider is configured'; end if;
  return provider_name_value;
end;
$$;

revoke all on function public.require_sanctions_provider(uuid) from public;
grant execute on function public.require_sanctions_provider(uuid) to authenticated;