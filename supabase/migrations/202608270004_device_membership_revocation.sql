-- Authoritative device and membership lifecycle for immediate revocation checks.
create or replace function public.require_active_device(target_org uuid, target_device uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if target_device is null then raise exception 'Device is required'; end if;
  if not exists (
    select 1 from public.devices d
    where d.id = target_device
      and d.organization_id = target_org
      and d.user_id = auth.uid()
      and d.status = 'trusted'
      and d.revoked_at is null
  ) then
    raise exception 'Device is revoked, untrusted, or not assigned to this user';
  end if;
  update public.devices set last_seen_at = now() where id = target_device;
  return true;
end;
$$;

create or replace function public.register_device(
  target_org uuid,
  friendly_name_input text,
  fingerprint_hash_input text,
  app_version_input text,
  target_branch uuid default null
)
returns public.devices
language plpgsql
security definer
set search_path = public
as $$
declare result public.devices;
declare membership_id_value uuid;
begin
  select id into membership_id_value from public.organization_memberships where organization_id = target_org and user_id = auth.uid() and active;
  if membership_id_value is null then raise exception 'Active organization membership required'; end if;
  if target_branch is not null and not exists (select 1 from public.branches where id = target_branch and organization_id = target_org and active) then raise exception 'Branch does not belong to organization'; end if;
  if length(trim(coalesce(friendly_name_input, ''))) < 2 or length(trim(coalesce(fingerprint_hash_input, ''))) < 16 then raise exception 'Valid device identity is required'; end if;
  insert into public.devices (organization_id, user_id, friendly_name, device_fingerprint_hash, app_version, status, last_branch_id)
    values (target_org, auth.uid(), trim(friendly_name_input), trim(fingerprint_hash_input), trim(app_version_input), 'trusted', target_branch)
    on conflict (organization_id, device_fingerprint_hash) do update set friendly_name = excluded.friendly_name, app_version = excluded.app_version, last_branch_id = excluded.last_branch_id, status = 'trusted', revoked_at = null, last_seen_at = now()
    returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, target_device_id, event_type, metadata)
    values (target_org, auth.uid(), result.id, 'device_registered', jsonb_build_object('friendly_name', result.friendly_name));
  return result;
end;
$$;

create or replace function public.revoke_device(target_device uuid, reason_input text)
returns public.devices
language plpgsql
security definer
set search_path = public
as $$
declare result public.devices;
declare target_org uuid;
begin
  select organization_id into target_org from public.devices where id = target_device;
  if target_org is null or not public.has_org_permission(target_org, 'security:manage') then raise exception 'Security management permission required'; end if;
  if length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'Revocation reason is required'; end if;
  update public.devices set status = 'revoked', revoked_at = now() where id = target_device returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, target_device_id, event_type, metadata)
    values (target_org, auth.uid(), target_device, 'device_revoked', jsonb_build_object('reason', trim(reason_input)));
  return result;
end;
$$;

create or replace function public.set_membership_active(target_membership uuid, active_input boolean, reason_input text)
returns public.organization_memberships
language plpgsql
security definer
set search_path = public
as $$
declare result public.organization_memberships;
declare target_org uuid;
declare target_user uuid;
begin
  select organization_id, user_id into target_org, target_user from public.organization_memberships where id = target_membership;
  if target_org is null or not public.has_org_permission(target_org, 'security:manage') then raise exception 'Security management permission required'; end if;
  if length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'Membership status reason is required'; end if;
  update public.organization_memberships set active = active_input where id = target_membership returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, target_user_id, event_type, metadata)
    values (target_org, auth.uid(), target_user, case when active_input then 'membership_reactivated' else 'membership_revoked' end, jsonb_build_object('reason', trim(reason_input), 'active', active_input));
  return result;
end;
$$;

create or replace function public.enforce_financial_actor_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare actor_role text;
declare device_value uuid;
begin
  select role_code into actor_role from public.organization_memberships where organization_id = new.organization_id and user_id = auth.uid() and active;
  if actor_role is null then raise exception 'Active organization membership required'; end if;
  device_value := nullif(new.metadata->>'device_id', '')::uuid;
  if actor_role = 'cashier' then
    perform public.require_active_device(new.organization_id, device_value);
  elsif device_value is not null then
    perform public.require_active_device(new.organization_id, device_value);
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_financial_actor_security_before_insert on public.financial_events;
create trigger enforce_financial_actor_security_before_insert
  before insert on public.financial_events
  for each row execute function public.enforce_financial_actor_security();

revoke all on function public.require_active_device(uuid, uuid) from public;
revoke all on function public.register_device(uuid, text, text, text, uuid) from public;
revoke all on function public.revoke_device(uuid, text) from public;
revoke all on function public.set_membership_active(uuid, boolean, text) from public;
grant execute on function public.require_active_device(uuid, uuid) to authenticated;
grant execute on function public.register_device(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.revoke_device(uuid, text) to authenticated;
grant execute on function public.set_membership_active(uuid, boolean, text) to authenticated;
