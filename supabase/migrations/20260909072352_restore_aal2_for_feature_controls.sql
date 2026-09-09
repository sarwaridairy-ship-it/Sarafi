-- The capability migration replaced this function after its original AAL2
-- hardening migration. Re-state the complete definition so delegated
-- authorization and step-up authentication are both enforced.
create or replace function public.set_organization_feature_state(
  target_org uuid,
  feature_input text,
  enabled_input boolean
)
returns public.organization_features
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.organization_features;
begin
  if not public.is_platform_admin() then
    perform public.require_capability(target_org, 'organization.manage', '{}'::jsonb);
  end if;
  perform public.require_aal2();
  if trim(coalesce(feature_input, '')) not in (
    'hawala',
    'advanced_compliance',
    'advanced_analytics',
    'online_payments',
    'imports'
  ) then
    raise exception 'Unsupported feature';
  end if;
  insert into public.organization_features (organization_id, feature_code, enabled, updated_at)
  values (target_org, trim(feature_input), enabled_input, now())
  on conflict (organization_id, feature_code) do update
    set enabled = excluded.enabled, updated_at = now()
  returning * into result;
  return result;
end;
$$;

revoke all on function public.set_organization_feature_state(uuid, text, boolean)
  from public, anon;
grant execute on function public.set_organization_feature_state(uuid, text, boolean)
  to authenticated;
