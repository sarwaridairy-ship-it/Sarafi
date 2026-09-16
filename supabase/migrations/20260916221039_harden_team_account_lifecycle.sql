-- Harden legacy onboarding/team paths. Existing records are not rewritten.
-- New invitations/re-admission replace former capability overrides; current invitations apply their approved bundle through the existing trigger.

CREATE OR REPLACE FUNCTION public.create_business(command jsonb)
 RETURNS organizations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor_id uuid := auth.uid();
  organization_row public.organizations;
  branch_id_value uuid;
  cashbox_id_value uuid;
  business_name text := trim(command->>'display_name');
  base_currency text := upper(coalesce(command->>'base_currency_code', 'AFN'));
  selected_currencies jsonb := coalesce(command->'currencies', '["AFN", "USD"]'::jsonb);
begin
  if not public.is_platform_user_active() then raise exception 'PLATFORM_ACCOUNT_INACTIVE'; end if;
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
  insert into public.branches (organization_id, name, timezone)
    values (organization_row.id, coalesce(command->>'branch_name', 'Main Branch'), organization_row.timezone)
    returning id into branch_id_value;
  insert into public.cashboxes (organization_id, branch_id, name)
    values (organization_row.id, branch_id_value, coalesce(command->>'cashbox_name', 'Main Counter'))
    returning id into cashbox_id_value;
  insert into public.money_accounts (organization_id, branch_id, cashbox_id, name, account_type, created_by)
    values (organization_row.id, branch_id_value, cashbox_id_value, coalesce(command->>'cashbox_name', 'Main Counter'), 'cashbox', actor_id);
  insert into public.organization_currencies (organization_id, currency_code)
    select organization_row.id, upper(value #>> '{}') from jsonb_array_elements(selected_currencies)
    where exists (select 1 from public.currencies c where c.code = upper(value #>> '{}') and c.active)
    on conflict do nothing;
  insert into public.organization_currencies (organization_id, currency_code, enabled)
    values (organization_row.id, base_currency, true)
    on conflict (organization_id, currency_code) do update set enabled = true;
  return organization_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_team_invitation(invite_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
declare actor_id uuid := auth.uid();
declare actor_email text := lower(trim(coalesce(auth.jwt()->>'email', '')));
declare invitation public.team_invitations;
declare membership public.organization_memberships;
begin
  if not public.is_platform_user_active() then raise exception 'PLATFORM_ACCOUNT_INACTIVE'; end if;
  if actor_id is null or actor_email = '' then raise exception 'Sign in with the invited email address'; end if;
  if invite_token is null or length(trim(invite_token)) <> 64 then raise exception 'This invitation link is invalid'; end if;

  select * into invitation from public.team_invitations where token_hash = encode(extensions.digest(trim(invite_token), 'sha256'), 'hex') for update;
  if invitation.id is null then raise exception 'This invitation link is invalid'; end if;
  if invitation.status <> 'pending' then raise exception 'This invitation is no longer available'; end if;
  if invitation.expires_at <= now() then
    update public.team_invitations set status = 'expired' where id = invitation.id;
    raise exception 'This invitation has expired';
  end if;
  if lower(invitation.email) <> actor_email then raise exception 'Sign in with the email address that received this invitation'; end if;
  if exists (select 1 from public.organization_memberships where organization_id = invitation.organization_id and user_id = actor_id and active) then raise exception 'This account is already an active member of the business'; end if;
  if exists (select 1 from public.organization_memberships where organization_id = invitation.organization_id and user_id = actor_id and role_code = 'owner') then raise exception 'An owner membership cannot be replaced by an invitation'; end if;

  insert into public.organization_memberships (organization_id, user_id, role_code, active, mfa_required)
    values (invitation.organization_id, actor_id, invitation.role_code, true, invitation.mfa_required)
    on conflict (organization_id, user_id) do update set role_code = excluded.role_code, active = true, mfa_required = excluded.mfa_required
    returning * into membership;

  insert into public.profiles (id, display_name)
    values (actor_id, invitation.display_name)
    on conflict (id) do update set display_name = excluded.display_name, updated_at = now();

  -- A new accepted assignment must not inherit privileges from a former role.
  delete from public.membership_capability_overrides where membership_id = membership.id;
  delete from public.organization_branch_access where membership_id = membership.id;
  delete from public.organization_cashbox_access where membership_id = membership.id;
  insert into public.organization_branch_access (membership_id, branch_id) select membership.id, branch_id from unnest(invitation.branch_ids) branch_id on conflict do nothing;
  insert into public.organization_cashbox_access (membership_id, cashbox_id) select membership.id, cashbox_id from unnest(invitation.cashbox_ids) cashbox_id on conflict do nothing;

  update public.team_invitations set status = 'accepted', accepted_by = actor_id, accepted_at = now() where id = invitation.id;
  insert into public.security_audit_events (organization_id, actor_user_id, target_user_id, event_type, metadata)
    values (invitation.organization_id, actor_id, actor_id, 'team_invitation_accepted', jsonb_build_object('invitation_id', invitation.id, 'membership_id', membership.id, 'role', membership.role_code));

  return jsonb_build_object('organization_id', invitation.organization_id, 'membership_id', membership.id, 'display_name', invitation.display_name, 'role_code', membership.role_code);
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_team_connection_code(connection_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
declare actor_id uuid := auth.uid(); actor_email text := lower(trim(coalesce(auth.jwt()->>'email', '')));
declare normalized_code text := upper(regexp_replace(coalesce(connection_code, ''), '[^A-Za-z0-9]', '', 'g'));
declare invitation public.team_invitations; membership public.organization_memberships;
begin
  if not public.is_platform_user_active() then raise exception 'PLATFORM_ACCOUNT_INACTIVE'; end if;
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
  if exists (select 1 from public.organization_memberships where organization_id = invitation.organization_id and user_id = actor_id and role_code = 'owner') then
    raise exception 'An owner membership cannot be replaced by an invitation';
  end if;
  insert into public.organization_memberships (organization_id, user_id, role_code, active, mfa_required)
    values (invitation.organization_id, actor_id, invitation.role_code, true, invitation.mfa_required)
    on conflict (organization_id, user_id) do update set role_code = excluded.role_code, active = true, mfa_required = excluded.mfa_required
    returning * into membership;
  insert into public.profiles (id, display_name) values (actor_id, invitation.display_name)
    on conflict (id) do update set display_name = excluded.display_name, updated_at = now();
  -- A new accepted assignment must not inherit privileges from a former role.
  delete from public.membership_capability_overrides where membership_id = membership.id;
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
$function$;

CREATE OR REPLACE FUNCTION public.request_business_access(connection_code text, requested_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  actor_email text := lower(trim(coalesce(auth.jwt()->>'email', '')));
  normalized_code text := upper(regexp_replace(coalesce(connection_code, ''), '[^A-Za-z0-9]', '', 'g'));
  join_code public.organization_join_codes;
  request_row public.worker_join_requests;
begin
  if not public.is_platform_user_active() then raise exception 'PLATFORM_ACCOUNT_INACTIVE'; end if;
  if actor_id is null or actor_email = '' then raise exception 'Sign in before requesting access'; end if;
  if length(normalized_code) <> 12 then raise exception 'Enter the 12-character business code'; end if;
  if length(trim(requested_name)) not between 2 and 100 then raise exception 'Your name must be between 2 and 100 characters'; end if;
  select * into join_code from public.organization_join_codes
  where code_hash = encode(extensions.digest(normalized_code, 'sha256'), 'hex') and active
    and (expires_at is null or expires_at > now())
  for update;
  if join_code.id is null then raise exception 'Business code not found or expired'; end if;
  if exists (
    select 1 from public.organization_memberships
    where organization_id = join_code.organization_id and user_id = actor_id and active
  ) then raise exception 'This account is already connected to the business'; end if;
  if exists (
    select 1 from public.worker_join_requests
    where organization_id = join_code.organization_id and requested_by = actor_id and status = 'pending'
  ) then raise exception 'Your request is already waiting for review'; end if;
  insert into public.worker_join_requests (organization_id, requested_by, display_name, email)
  values (join_code.organization_id, actor_id, trim(requested_name), actor_email)
  returning * into request_row;
  insert into public.security_audit_events (organization_id, actor_user_id, target_user_id, event_type, metadata)
  values (join_code.organization_id, actor_id, actor_id, 'worker_join_requested', jsonb_build_object('request_id', request_row.id, 'join_code_id', join_code.id));
  return jsonb_build_object('request_id', request_row.id, 'organization_id', request_row.organization_id, 'status', request_row.status);
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_business_admin_invitation(target_org uuid, invited_email text, invited_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
declare actor_id uuid := auth.uid(); normalized_email text := lower(trim(invited_email)); normalized_name text := trim(invited_name);
declare invitation public.team_invitations; invitation_token text; raw_code text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.organization_memberships where organization_id = target_org and user_id = actor_id and active and role_code = 'owner') then
    raise exception 'Only the owner can delegate business administrator access';
  end if;
  perform public.require_capability(target_org, 'team.invite', '{}'::jsonb);
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
$function$;

CREATE OR REPLACE FUNCTION public.delegate_business_admin(target_membership uuid, active_input boolean, reason_input text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare membership public.organization_memberships;
begin
  select * into membership from public.organization_memberships where id = target_membership for update;
  if membership.id is null then raise exception 'Team member not found'; end if;
  if not exists (select 1 from public.organization_memberships where organization_id = membership.organization_id and user_id = auth.uid() and active and role_code = 'owner') then
    raise exception 'Only the owner can delegate business administrator access';
  end if;
  perform public.require_capability(membership.organization_id, 'team.manage', '{}'::jsonb);
  perform public.require_capability(membership.organization_id, 'team.capabilities.manage', '{}'::jsonb);
  perform public.require_aal2();
  if membership.role_code = 'owner' or membership.user_id = auth.uid() then raise exception 'Owner access cannot be delegated here'; end if;
  if length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'A reason is required'; end if;
  update public.organization_memberships set role_code = 'business_admin', active = active_input, mfa_required = true where id = membership.id returning * into membership;
  delete from public.organization_branch_access where membership_id = membership.id;
  delete from public.organization_cashbox_access where membership_id = membership.id;
  insert into public.security_audit_events (organization_id, actor_user_id, target_user_id, event_type, metadata)
    values (membership.organization_id, auth.uid(), membership.user_id, 'business_admin_delegated', jsonb_build_object('membership_id', membership.id, 'active', membership.active, 'reason', trim(reason_input)));
  return jsonb_build_object('id', membership.id, 'role_code', membership.role_code, 'active', membership.active);
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_team_membership(target_membership uuid, new_role text, branch_scope uuid[], cashbox_scope uuid[], active_input boolean, reason_input text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare membership public.organization_memberships;
declare normalized_branches uuid[] := coalesce(array(select distinct unnest(branch_scope)), '{}'::uuid[]);
declare normalized_cashboxes uuid[] := coalesce(array(select distinct unnest(cashbox_scope)), '{}'::uuid[]);
begin
  select * into membership from public.organization_memberships where id = target_membership for update;
  if membership.id is null then raise exception 'Team member not found'; end if;
  if not public.has_org_permission(membership.organization_id, 'team:manage') then raise exception 'Team management permission required'; end if;
  perform public.require_aal2();
  if membership.role_code = 'business_admin' and not public.is_org_owner(membership.organization_id) then
    raise exception 'Only the owner can change Business Administrator access';
  end if;
  if membership.role_code = 'owner' or membership.user_id = auth.uid() then raise exception 'Your own owner access cannot be changed here'; end if;
  if new_role not in ('manager', 'accountant', 'cashier', 'viewer', 'compliance_officer') then raise exception 'Choose a valid employee role'; end if;
  if length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'A reason for this access change is required'; end if;
  if cardinality(normalized_branches) > 0 and exists (select 1 from unnest(normalized_branches) branch_id where not exists (select 1 from public.branches b where b.id = branch_id and b.organization_id = membership.organization_id and b.active)) then raise exception 'A selected branch is not active for this business'; end if;
  if cardinality(normalized_cashboxes) > 0 and exists (select 1 from unnest(normalized_cashboxes) cashbox_id where not exists (select 1 from public.cashboxes c where c.id = cashbox_id and c.organization_id = membership.organization_id and c.active)) then raise exception 'A selected cashbox is not active for this business'; end if;
  if new_role = 'cashier' and active_input and (cardinality(normalized_branches) = 0 or cardinality(normalized_cashboxes) = 0) then raise exception 'An active cashier must be assigned to at least one branch and cashbox'; end if;
  if new_role = 'cashier' and exists (select 1 from public.cashboxes c where c.id = any(normalized_cashboxes) and not (c.branch_id = any(normalized_branches))) then raise exception 'Every selected cashbox must belong to a selected branch'; end if;

  update public.organization_memberships set role_code = new_role, active = active_input where id = membership.id returning * into membership;
  delete from public.organization_branch_access where membership_id = membership.id;
  delete from public.organization_cashbox_access where membership_id = membership.id;
  insert into public.organization_branch_access (membership_id, branch_id) select membership.id, branch_id from unnest(normalized_branches) branch_id on conflict do nothing;
  insert into public.organization_cashbox_access (membership_id, cashbox_id) select membership.id, cashbox_id from unnest(normalized_cashboxes) cashbox_id on conflict do nothing;

  insert into public.security_audit_events (organization_id, actor_user_id, target_user_id, event_type, metadata)
    values (membership.organization_id, auth.uid(), membership.user_id, 'team_membership_updated', jsonb_build_object('membership_id', membership.id, 'role', membership.role_code, 'active', membership.active, 'reason', trim(reason_input), 'branch_count', cardinality(normalized_branches), 'cashbox_count', cardinality(normalized_cashboxes), 'aal', auth.jwt()->>'aal'));

  return jsonb_build_object('id', membership.id, 'role_code', membership.role_code, 'active', membership.active);
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_membership_active(target_membership uuid, active_input boolean, reason_input text)
 RETURNS organization_memberships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare result public.organization_memberships;
declare target_org uuid;
declare target_user uuid;
begin
  perform public.require_aal2();
  select organization_id, user_id into target_org, target_user from public.organization_memberships where id = target_membership for update;
  if target_org is null or not public.has_org_permission(target_org, 'security:manage') then raise exception 'Security management permission required'; end if;
  if target_user = auth.uid() or exists (
    select 1 from public.organization_memberships where id = target_membership and role_code = 'owner'
  ) then raise exception 'Owner or own access cannot be changed here'; end if;
  if exists (select 1 from public.organization_memberships where id = target_membership and role_code = 'business_admin')
    and not public.is_org_owner(target_org) then
    raise exception 'Only the owner can change Business Administrator access';
  end if;
  if length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'Membership status reason is required'; end if;
  update public.organization_memberships set active = active_input where id = target_membership returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, target_user_id, event_type, metadata)
    values (target_org, auth.uid(), target_user, case when active_input then 'membership_reactivated' else 'membership_revoked' end, jsonb_build_object('reason', trim(reason_input), 'active', active_input, 'aal', auth.jwt()->>'aal'));
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.review_worker_join_request(target_request uuid, decision_input text, role_input text DEFAULT NULL::text, branch_scope uuid[] DEFAULT '{}'::uuid[], cashbox_scope uuid[] DEFAULT '{}'::uuid[], capability_overrides_input jsonb DEFAULT '[]'::jsonb, limits_input jsonb DEFAULT '{}'::jsonb, requires_mfa boolean DEFAULT true, reason_input text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare previous_member public.organization_memberships; request_row public.worker_join_requests; membership public.organization_memberships; item jsonb; actor_role text;
begin
  select * into request_row from public.worker_join_requests where id = target_request for update;
  if request_row.id is null then raise exception 'Join request not found'; end if;
  perform public.require_capability(request_row.organization_id, 'team.manage', '{}'::jsonb);
  perform public.require_aal2();
  if request_row.status <> 'pending' then raise exception 'This join request has already been reviewed'; end if;
  if lower(decision_input) not in ('approved', 'rejected') then raise exception 'Choose approve or reject'; end if;
  if length(trim(reason_input)) < 2 then raise exception 'A review reason is required'; end if;
  if not public.capability_limits_are_valid(coalesce(limits_input, '{}'::jsonb)) then
    raise exception 'Capability limits must be non-negative numbers with uppercase three-letter currency keys';
  end if;

  if lower(decision_input) = 'approved' then
    select role_code into actor_role from public.organization_memberships
    where organization_id = request_row.organization_id and user_id = (select auth.uid()) and active;
    select * into previous_member from public.organization_memberships
      where organization_id = request_row.organization_id and user_id = request_row.requested_by for update;
    if previous_member.role_code = 'owner' then raise exception 'An owner membership cannot be replaced by a join request'; end if;
    if previous_member.active then raise exception 'This account is already connected to the business'; end if;
    if previous_member.role_code = 'business_admin' and actor_role <> 'owner' then
      raise exception 'Only the owner can change Business Administrator access';
    end if;
    if exists (select 1 from public.platform_user_access where user_id = request_row.requested_by and status = 'suspended') then
      raise exception 'PLATFORM_ACCOUNT_INACTIVE';
    end if;
    if role_input not in ('business_admin', 'manager', 'accountant', 'cashier', 'viewer', 'compliance_officer') then raise exception 'Choose a valid worker role'; end if;
    if role_input = 'business_admin' and not exists (
      select 1 from public.organization_memberships
      where organization_id = request_row.organization_id and user_id = (select auth.uid()) and active and role_code = 'owner'
    ) then raise exception 'Only the owner can approve a business administrator'; end if;
    if role_input = 'cashier' and (cardinality(coalesce(branch_scope, '{}')) = 0 or cardinality(coalesce(cashbox_scope, '{}')) = 0) then
      raise exception 'A cashier must be assigned to a branch and cashbox';
    end if;
    if exists (select 1 from unnest(coalesce(branch_scope, '{}'::uuid[])) id where not exists (select 1 from public.branches b where b.id = id and b.organization_id = request_row.organization_id and b.active)) then raise exception 'A selected branch is not active for this business'; end if;
    if exists (select 1 from unnest(coalesce(cashbox_scope, '{}'::uuid[])) id where not exists (select 1 from public.cashboxes c where c.id = id and c.organization_id = request_row.organization_id and c.active)) then raise exception 'A selected cashbox is not active for this business'; end if;
    if role_input = 'cashier' and exists (
      select 1 from public.cashboxes c where c.id = any(coalesce(cashbox_scope, '{}'))
        and not (c.branch_id = any(coalesce(branch_scope, '{}')))
    ) then raise exception 'Every selected cashbox must belong to a selected branch'; end if;
    if jsonb_typeof(coalesce(capability_overrides_input, '[]'::jsonb)) <> 'array' then raise exception 'Capability assignment must be a list'; end if;
    insert into public.organization_memberships (organization_id, user_id, role_code, active, mfa_required)
    values (request_row.organization_id, request_row.requested_by, role_input, true, case when role_input = 'business_admin' then true else requires_mfa end)
    on conflict (organization_id, user_id) do update
      set role_code = excluded.role_code, active = true, mfa_required = excluded.mfa_required
    returning * into membership;
    insert into public.profiles (id, display_name) values (request_row.requested_by, request_row.display_name)
    on conflict (id) do update set display_name = excluded.display_name, updated_at = now();
    -- Re-admission is an explicitly reviewed new assignment, not an old grant revival.
    delete from public.membership_capability_overrides where membership_id = membership.id;
    delete from public.organization_branch_access where membership_id = membership.id;
    delete from public.organization_cashbox_access where membership_id = membership.id;
    insert into public.organization_branch_access (membership_id, branch_id)
      select membership.id, selected_id from unnest(coalesce(branch_scope, '{}')) selected_id on conflict do nothing;
    insert into public.organization_cashbox_access (membership_id, cashbox_id)
      select membership.id, selected_id from unnest(coalesce(cashbox_scope, '{}')) selected_id on conflict do nothing;
    for item in select value from jsonb_array_elements(coalesce(capability_overrides_input, '[]'::jsonb)) loop
      if exists (select 1 from public.capability_definitions d where d.capability_code = item->>'capability' and d.owner_only) then
        raise exception 'Owner-only capabilities cannot be delegated';
      end if;
      if not exists (select 1 from public.capability_definitions d where d.capability_code = item->>'capability') then
        raise exception 'Unknown capability in join request';
      end if;
      if coalesce((item->>'allowed')::boolean, true) and actor_role <> 'owner'
         and not public.has_capability(request_row.organization_id, item->>'capability', '{}'::jsonb) then
        raise exception 'A delegated administrator cannot grant a capability they do not hold';
      end if;
      insert into public.membership_capability_overrides
        (membership_id, capability_code, allowed, branch_ids, cashbox_ids, limits, granted_by, reason)
      values (
        membership.id,
        item->>'capability',
        coalesce((item->>'allowed')::boolean, true),
        coalesce(branch_scope, '{}'),
        coalesce(cashbox_scope, '{}'),
        coalesce(limits_input, '{}'),
        (select auth.uid()),
        trim(reason_input)
      )
      on conflict (membership_id, capability_code) do update
      set allowed = excluded.allowed, branch_ids = excluded.branch_ids, cashbox_ids = excluded.cashbox_ids,
          limits = excluded.limits, granted_by = excluded.granted_by, reason = excluded.reason, updated_at = now();
    end loop;
  end if;

  update public.worker_join_requests
  set status = lower(decision_input), decided_at = now(), decided_by = (select auth.uid()),
      decision_reason = trim(reason_input), assigned_role = case when lower(decision_input) = 'approved' then role_input else null end,
      branch_ids = coalesce(branch_scope, '{}'), cashbox_ids = coalesce(cashbox_scope, '{}'),
      capability_overrides = coalesce(capability_overrides_input, '[]'), limits = coalesce(limits_input, '{}'),
      mfa_required = case when role_input = 'business_admin' then true else requires_mfa end
  where id = request_row.id;
  insert into public.security_audit_events (organization_id, actor_user_id, target_user_id, event_type, metadata)
  values (
    request_row.organization_id,
    (select auth.uid()),
    request_row.requested_by,
    'worker_join_reviewed',
    jsonb_build_object('request_id', request_row.id, 'decision', lower(decision_input), 'role', role_input, 'branch_ids', coalesce(branch_scope, '{}'), 'cashbox_ids', coalesce(cashbox_scope, '{}'), 'mfa_required', requires_mfa, 'device_review_required', true, 'reason', trim(reason_input))
  );
  return jsonb_build_object('request_id', request_row.id, 'status', lower(decision_input), 'membership_id', membership.id);
end;
$function$;

revoke all on function public.create_business(jsonb) from public, anon;
grant execute on function public.create_business(jsonb) to authenticated;
revoke all on function public.accept_team_invitation(text) from public, anon;
grant execute on function public.accept_team_invitation(text) to authenticated;
revoke all on function public.accept_team_connection_code(text) from public, anon;
grant execute on function public.accept_team_connection_code(text) to authenticated;
revoke all on function public.request_business_access(text,text) from public, anon;
grant execute on function public.request_business_access(text,text) to authenticated;
revoke all on function public.create_business_admin_invitation(uuid,text,text) from public, anon;
grant execute on function public.create_business_admin_invitation(uuid,text,text) to authenticated;
revoke all on function public.delegate_business_admin(uuid,boolean,text) from public, anon;
grant execute on function public.delegate_business_admin(uuid,boolean,text) to authenticated;
revoke all on function public.update_team_membership(uuid,text,uuid[],uuid[],boolean,text) from public, anon;
grant execute on function public.update_team_membership(uuid,text,uuid[],uuid[],boolean,text) to authenticated;
revoke all on function public.set_membership_active(uuid,boolean,text) from public, anon;
grant execute on function public.set_membership_active(uuid,boolean,text) to authenticated;
revoke all on function public.review_worker_join_request(uuid,text,text,uuid[],uuid[],jsonb,jsonb,boolean,text) from public, anon;
grant execute on function public.review_worker_join_request(uuid,text,text,uuid[],uuid[],jsonb,jsonb,boolean,text) to authenticated;

-- Internal helpers are reached only through the guarded SECURITY DEFINER APIs.
-- No application/Edge client, RLS policy, view or invoker function calls them.
revoke all on function public.require_active_device(uuid,uuid) from public, anon, authenticated;
revoke all on function public.require_aal2() from public, anon, authenticated;
revoke all on function public.require_capability(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.require_sanctions_provider(uuid) from public, anon, authenticated;
revoke all on function public.user_can_use_money_account(uuid,uuid) from public, anon, authenticated;
