-- Stage 3 completion: first-owner onboarding is an atomic server command.
create or replace function public.create_business(command jsonb)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  organization_row public.organizations;
  branch_id_value uuid;
  cashbox_id_value uuid;
  business_name text := trim(command->>'display_name');
  base_currency text := upper(coalesce(command->>'base_currency_code', 'AFN'));
  selected_currencies jsonb := coalesce(command->'currencies', '["AFN", "USD"]'::jsonb);
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if business_name is null or length(business_name) < 2 then raise exception 'Business name is required'; end if;
  if not exists (select 1 from public.currencies where code = base_currency and active) then raise exception 'Base currency is not supported'; end if;
  insert into public.organizations (legal_name, display_name, base_currency_code, timezone)
    values (business_name, business_name, base_currency, coalesce(command->>'timezone', 'Asia/Kabul'))
    returning * into organization_row;
  insert into public.organization_settings (organization_id, default_language, base_currency_code, timezone)
    values (organization_row.id, coalesce(command->>'language', 'en'), base_currency, organization_row.timezone);
  insert into public.organization_memberships (organization_id, user_id, role_code, active)
    values (organization_row.id, actor_id, 'owner', true);
  insert into public.branches (organization_id, name, timezone) values (organization_row.id, coalesce(command->>'branch_name', 'Main Branch'), organization_row.timezone) returning id into branch_id_value;
  insert into public.cashboxes (organization_id, branch_id, name) values (organization_row.id, branch_id_value, coalesce(command->>'cashbox_name', 'Main Counter')) returning id into cashbox_id_value;
  insert into public.organization_currencies (organization_id, currency_code)
    select organization_row.id, value #>> '{}' from jsonb_array_elements(selected_currencies) where exists (select 1 from public.currencies c where c.code = value #>> '{}' and c.active) on conflict do nothing;
  return organization_row;
end;
$$;
revoke all on function public.create_business(jsonb) from public;
grant execute on function public.create_business(jsonb) to authenticated;
