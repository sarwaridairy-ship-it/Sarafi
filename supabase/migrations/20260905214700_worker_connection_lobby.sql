alter table public.team_invitations add column if not exists connection_code_hash text;
alter table public.team_invitations drop constraint if exists team_invitations_role_code_check;
alter table public.team_invitations add constraint team_invitations_role_code_check
  check (role_code in ('business_admin', 'manager', 'accountant', 'cashier', 'viewer', 'compliance_officer'));
create unique index if not exists team_invitations_connection_code_idx
  on public.team_invitations (connection_code_hash) where connection_code_hash is not null and status = 'pending';

create or replace function public.create_worker_connection_code(target_invitation uuid)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare invitation public.team_invitations; raw_code text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into invitation from public.team_invitations where id = target_invitation for update;
  if invitation.id is null or invitation.status <> 'pending' or invitation.expires_at <= now() then
    raise exception 'A pending invitation is required';
  end if;
  if not public.has_org_permission(invitation.organization_id, 'team:manage') then
    raise exception 'Team management permission required';
  end if;
  perform public.require_aal2();
  raw_code := upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 10));
  update public.team_invitations
    set connection_code_hash = encode(extensions.digest(raw_code, 'sha256'), 'hex')
    where id = invitation.id;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
    values (invitation.organization_id, auth.uid(), 'worker_connection_code_created', jsonb_build_object('invitation_id', invitation.id, 'expires_at', invitation.expires_at));
  return jsonb_build_object('invitation_id', invitation.id, 'connection_code', raw_code, 'expires_at', invitation.expires_at);
end;
$$;

create or replace function public.accept_team_connection_code(connection_code text)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare actor_id uuid := auth.uid(); actor_email text := lower(trim(coalesce(auth.jwt()->>'email', '')));
declare normalized_code text := upper(regexp_replace(coalesce(connection_code, ''), '[^A-Za-z0-9]', '', 'g'));
declare invitation public.team_invitations; membership public.organization_memberships;
begin
  if actor_id is null or actor_email = '' then raise exception 'Sign in before connecting to a business'; end if;
  if length(normalized_code) <> 10 then raise exception 'Enter the 10-character connection code'; end if;
  select * into invitation from public.team_invitations
    where connection_code_hash = encode(extensions.digest(normalized_code, 'sha256'), 'hex') for update;
  if invitation.id is null then raise exception 'Connection code not found'; end if;
  if invitation.status <> 'pending' then raise exception 'This connection request is no longer available'; end if;
  if invitation.expires_at <= now() then
    update public.team_invitations set status = 'expired' where id = invitation.id;
    raise exception 'This connection code has expired';
  end if;
  if lower(invitation.email) <> actor_email then raise exception 'Sign in with the email address invited by the business'; end if;
  if exists (select 1 from public.organization_memberships where organization_id = invitation.organization_id and user_id = actor_id and active) then
    raise exception 'This account is already connected to the business';
  end if;
  insert into public.organization_memberships (organization_id, user_id, role_code, active, mfa_required)
    values (invitation.organization_id, actor_id, invitation.role_code, true, invitation.mfa_required)
    on conflict (organization_id, user_id) do update set role_code = excluded.role_code, active = true, mfa_required = excluded.mfa_required
    returning * into membership;
  insert into public.profiles (id, display_name) values (actor_id, invitation.display_name)
    on conflict (id) do update set display_name = excluded.display_name, updated_at = now();
  delete from public.organization_branch_access where membership_id = membership.id;
  delete from public.organization_cashbox_access where membership_id = membership.id;
  insert into public.organization_branch_access (membership_id, branch_id)
    select membership.id, branch_id from unnest(invitation.branch_ids) branch_id on conflict do nothing;
  insert into public.organization_cashbox_access (membership_id, cashbox_id)
    select membership.id, cashbox_id from unnest(invitation.cashbox_ids) cashbox_id on conflict do nothing;
  update public.team_invitations set status = 'accepted', accepted_by = actor_id, accepted_at = now() where id = invitation.id;
  insert into public.security_audit_events (organization_id, actor_user_id, target_user_id, event_type, metadata)
    values (invitation.organization_id, actor_id, actor_id, 'worker_connection_code_accepted', jsonb_build_object('invitation_id', invitation.id, 'membership_id', membership.id, 'role', membership.role_code));
  return jsonb_build_object('organization_id', invitation.organization_id, 'membership_id', membership.id, 'display_name', invitation.display_name, 'role_code', membership.role_code);
end;
$$;

create or replace function public.create_business_admin_invitation(target_org uuid, invited_email text, invited_name text)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare actor_id uuid := auth.uid(); normalized_email text := lower(trim(invited_email)); normalized_name text := trim(invited_name);
declare invitation public.team_invitations; invitation_token text; raw_code text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.organization_memberships where organization_id = target_org and user_id = actor_id and active and role_code = 'owner') then
    raise exception 'Only the owner can delegate business administrator access';
  end if;
  perform public.require_aal2();
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'A valid employee email is required'; end if;
  if length(normalized_name) not between 2 and 100 then raise exception 'Employee name must be between 2 and 100 characters'; end if;
  update public.team_invitations set status = 'expired' where organization_id = target_org and lower(email) = normalized_email and status = 'pending' and expires_at <= now();
  if exists (select 1 from public.team_invitations where organization_id = target_org and lower(email) = normalized_email and status = 'pending') then raise exception 'A pending invitation already exists for this email'; end if;
  invitation_token := encode(extensions.gen_random_bytes(32), 'hex');
  raw_code := upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 10));
  insert into public.team_invitations (organization_id, email, display_name, role_code, mfa_required, token_hash, connection_code_hash, invited_by, expires_at)
    values (target_org, normalized_email, normalized_name, 'business_admin', true, encode(extensions.digest(invitation_token, 'sha256'), 'hex'), encode(extensions.digest(raw_code, 'sha256'), 'hex'), actor_id, now() + interval '72 hours')
    returning * into invitation;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
    values (target_org, actor_id, 'business_admin_invitation_created', jsonb_build_object('invitation_id', invitation.id, 'email', normalized_email));
  return jsonb_build_object('id', invitation.id, 'invite_token', invitation_token, 'connection_code', raw_code, 'email', invitation.email, 'display_name', invitation.display_name, 'role_code', invitation.role_code, 'expires_at', invitation.expires_at);
end;
$$;

create or replace function public.delegate_business_admin(target_membership uuid, active_input boolean, reason_input text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare membership public.organization_memberships;
begin
  select * into membership from public.organization_memberships where id = target_membership for update;
  if membership.id is null then raise exception 'Team member not found'; end if;
  if not exists (select 1 from public.organization_memberships where organization_id = membership.organization_id and user_id = auth.uid() and active and role_code = 'owner') then
    raise exception 'Only the owner can delegate business administrator access';
  end if;
  perform public.require_aal2();
  if membership.role_code = 'owner' or membership.user_id = auth.uid() then raise exception 'Owner access cannot be delegated here'; end if;
  if length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'A reason is required'; end if;
  update public.organization_memberships set role_code = 'business_admin', active = active_input where id = membership.id returning * into membership;
  delete from public.organization_branch_access where membership_id = membership.id;
  delete from public.organization_cashbox_access where membership_id = membership.id;
  insert into public.security_audit_events (organization_id, actor_user_id, target_user_id, event_type, metadata)
    values (membership.organization_id, auth.uid(), membership.user_id, 'business_admin_delegated', jsonb_build_object('membership_id', membership.id, 'active', membership.active, 'reason', trim(reason_input)));
  return jsonb_build_object('id', membership.id, 'role_code', membership.role_code, 'active', membership.active);
end;
$$;

revoke all on function public.create_worker_connection_code(uuid) from public, anon;
revoke all on function public.accept_team_connection_code(text) from public, anon;
revoke all on function public.create_business_admin_invitation(uuid, text, text) from public, anon;
revoke all on function public.delegate_business_admin(uuid, boolean, text) from public, anon;
grant execute on function public.create_worker_connection_code(uuid) to authenticated;
grant execute on function public.accept_team_connection_code(text) to authenticated;
grant execute on function public.create_business_admin_invitation(uuid, text, text) to authenticated;
grant execute on function public.delegate_business_admin(uuid, boolean, text) to authenticated;
