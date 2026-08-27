-- Require a verified Supabase MFA session for security-sensitive actions.
create or replace function public.require_aal2()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then raise exception 'AAL2 is required for this action'; end if;
  return true;
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
  perform public.require_aal2();
  select organization_id into target_org from public.devices where id = target_device;
  if target_org is null or not public.has_org_permission(target_org, 'security:manage') then raise exception 'Security management permission required'; end if;
  if length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'Revocation reason is required'; end if;
  update public.devices set status = 'revoked', revoked_at = now() where id = target_device returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, target_device_id, event_type, metadata)
    values (target_org, auth.uid(), target_device, 'device_revoked', jsonb_build_object('reason', trim(reason_input), 'aal', auth.jwt()->>'aal'));
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
  perform public.require_aal2();
  select organization_id, user_id into target_org, target_user from public.organization_memberships where id = target_membership;
  if target_org is null or not public.has_org_permission(target_org, 'security:manage') then raise exception 'Security management permission required'; end if;
  if length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'Membership status reason is required'; end if;
  update public.organization_memberships set active = active_input where id = target_membership returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, target_user_id, event_type, metadata)
    values (target_org, auth.uid(), target_user, case when active_input then 'membership_reactivated' else 'membership_revoked' end, jsonb_build_object('reason', trim(reason_input), 'active', active_input, 'aal', auth.jwt()->>'aal'));
  return result;
end;
$$;

create or replace function public.decide_approval(target_id uuid, decision text, decision_reason_input text)
returns public.approval_requests
language plpgsql
security definer
set search_path = public
as $$
declare request public.approval_requests;
declare approver_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into request from public.approval_requests where id = target_id for update;
  if request.id is null then raise exception 'Approval request not found'; end if;
  if request.status <> 'pending' then raise exception 'Approval request is no longer pending'; end if;
  if request.requested_by = auth.uid() then raise exception 'Self-approval is not allowed'; end if;
  if now() >= request.expires_at then raise exception 'Approval request has expired'; end if;
  if decision not in ('approved', 'rejected') or length(trim(decision_reason_input)) = 0 then raise exception 'Valid decision and reason are required'; end if;
  select role_code into approver_role from public.organization_memberships where organization_id = request.organization_id and user_id = auth.uid() and active;
  if approver_role not in ('owner', 'manager') then raise exception 'User cannot decide approvals'; end if;
  if decision = 'approved' then perform public.require_aal2(); end if;
  update public.approval_requests set status = decision, decided_by = auth.uid(), decided_at = now(), decision_reason = trim(decision_reason_input) where id = target_id returning * into request;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata) values (request.organization_id, auth.uid(), 'approval_decided', jsonb_build_object('approval_id', request.id, 'decision', decision, 'requester', request.requested_by, 'aal', auth.jwt()->>'aal'));
  return request;
end;
$$;

create or replace function public.sync_offline_fx_command(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = public
as $$
declare device_value uuid := nullif(command->>'device_id', '')::uuid;
declare org_value uuid := nullif(command->>'organization_id', '')::uuid;
begin
  perform public.require_active_device(org_value, device_value);
  return public.record_fx_trade(command);
end;
$$;

revoke all on function public.require_aal2() from public;
revoke all on function public.sync_offline_fx_command(jsonb) from public;
grant execute on function public.sync_offline_fx_command(jsonb) to authenticated;
