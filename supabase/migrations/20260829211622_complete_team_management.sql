-- Complete the employee lifecycle. Invitations are tokenized, scoped, audited,
-- and accepted by the authenticated email owner. Raw auth data never reaches a
-- normal member; the owner receives only the directory fields required by UI.

create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  display_name text not null,
  role_code text not null check (role_code in ('manager', 'accountant', 'cashier', 'viewer', 'compliance_officer')),
  branch_ids uuid[] not null default '{}',
  cashbox_ids uuid[] not null default '{}',
  mfa_required boolean not null default false,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled', 'expired')),
  invited_by uuid not null references auth.users(id),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (length(trim(display_name)) between 2 and 100),
  check (expires_at > created_at)
);

create unique index team_invitations_pending_email_idx
  on public.team_invitations (organization_id, lower(email))
  where status = 'pending';
create index team_invitations_org_status_idx
  on public.team_invitations (organization_id, status, created_at desc);
create index organization_branch_access_branch_idx
  on public.organization_branch_access (branch_id, membership_id);
create index organization_cashbox_access_cashbox_idx
  on public.organization_cashbox_access (cashbox_id, membership_id);

alter table public.team_invitations enable row level security;
revoke all on table public.team_invitations from anon, authenticated;

create or replace function public.get_team_control_plane(target_org uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare result jsonb;
begin
  if not exists (select 1 from public.organization_memberships where organization_id = target_org and user_id = auth.uid() and active and role_code in ('owner', 'manager')) then raise exception 'Team supervision permission required'; end if;

  select jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'display_name', coalesce(nullif(trim(p.display_name), ''), split_part(u.email, '@', 1), 'Team member'),
        'email', u.email,
        'role_code', m.role_code,
        'active', m.active,
        'mfa_required', m.mfa_required,
        'joined_at', m.created_at,
        'is_current_user', m.user_id = auth.uid(),
        'branches', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.name) from public.organization_branch_access ba join public.branches b on b.id = ba.branch_id where ba.membership_id = m.id), '[]'::jsonb),
        'cashboxes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'branch_id', c.branch_id) order by c.name) from public.organization_cashbox_access ca join public.cashboxes c on c.id = ca.cashbox_id where ca.membership_id = m.id), '[]'::jsonb)
      ) order by m.created_at) from public.organization_memberships m left join public.profiles p on p.id = m.user_id left join auth.users u on u.id = m.user_id where m.organization_id = target_org
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'email', i.email,
        'display_name', i.display_name,
        'role_code', i.role_code,
        'mfa_required', i.mfa_required,
        'status', case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end,
        'created_at', i.created_at,
        'expires_at', i.expires_at,
        'branches', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.name) from public.branches b where b.id = any(i.branch_ids)), '[]'::jsonb),
        'cashboxes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'branch_id', c.branch_id) order by c.name) from public.cashboxes c where c.id = any(i.cashbox_ids)), '[]'::jsonb)
      ) order by i.created_at desc) from public.team_invitations i where i.organization_id = target_org and i.status = 'pending'
    ), '[]'::jsonb),
    'branches', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.created_at) from public.branches b where b.organization_id = target_org and b.active), '[]'::jsonb),
    'cashboxes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'branch_id', c.branch_id) order by c.created_at) from public.cashboxes c where c.organization_id = target_org and c.active), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id,
      'friendly_name', d.friendly_name,
      'status', d.status,
      'last_seen_at', d.last_seen_at,
      'revoked_at', d.revoked_at,
      'member_name', coalesce(nullif(trim(p.display_name), ''), split_part(u.email, '@', 1), 'Team member')
    ) order by d.last_seen_at desc) from public.devices d left join public.profiles p on p.id = d.user_id left join auth.users u on u.id = d.user_id where d.organization_id = target_org), '[]'::jsonb),
    'approvals', coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'action_type', a.action_type,
      'reason', a.reason,
      'amount_base', a.amount_base,
      'currency_code', a.currency_code,
      'status', a.status,
      'requested_at', a.requested_at,
      'requested_by_name', coalesce(nullif(trim(rp.display_name), ''), split_part(ru.email, '@', 1), 'Team member'),
      'decided_by_name', case when a.decided_by is null then null else coalesce(nullif(trim(dp.display_name), ''), split_part(du.email, '@', 1), 'Team member') end
    ) order by a.requested_at desc) from public.approval_requests a left join public.profiles rp on rp.id = a.requested_by left join auth.users ru on ru.id = a.requested_by left join public.profiles dp on dp.id = a.decided_by left join auth.users du on du.id = a.decided_by where a.organization_id = target_org), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.create_team_invitation(
  target_org uuid,
  invited_email text,
  invited_name text,
  invited_role text,
  branch_scope uuid[] default '{}',
  cashbox_scope uuid[] default '{}',
  requires_mfa boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare actor_id uuid := auth.uid();
declare normalized_email text := lower(trim(invited_email));
declare normalized_name text := trim(invited_name);
declare normalized_branches uuid[] := coalesce(array(select distinct unnest(branch_scope)), '{}'::uuid[]);
declare normalized_cashboxes uuid[] := coalesce(array(select distinct unnest(cashbox_scope)), '{}'::uuid[]);
declare invitation public.team_invitations;
declare invitation_token text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.has_org_permission(target_org, 'team:manage') then raise exception 'Team management permission required'; end if;
  perform public.require_aal2();
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'A valid employee email is required'; end if;
  if length(normalized_name) < 2 or length(normalized_name) > 100 then raise exception 'Employee name must be between 2 and 100 characters'; end if;
  if invited_role not in ('manager', 'accountant', 'cashier', 'viewer', 'compliance_officer') then raise exception 'Choose a valid employee role'; end if;
  if cardinality(normalized_branches) > 0 and exists (select 1 from unnest(normalized_branches) branch_id where not exists (select 1 from public.branches b where b.id = branch_id and b.organization_id = target_org and b.active)) then raise exception 'A selected branch is not active for this business'; end if;
  if cardinality(normalized_cashboxes) > 0 and exists (select 1 from unnest(normalized_cashboxes) cashbox_id where not exists (select 1 from public.cashboxes c where c.id = cashbox_id and c.organization_id = target_org and c.active)) then raise exception 'A selected cashbox is not active for this business'; end if;
  if invited_role = 'cashier' and (cardinality(normalized_branches) = 0 or cardinality(normalized_cashboxes) = 0) then raise exception 'A cashier must be assigned to at least one branch and cashbox'; end if;
  if invited_role = 'cashier' and exists (select 1 from public.cashboxes c where c.id = any(normalized_cashboxes) and not (c.branch_id = any(normalized_branches))) then raise exception 'Every selected cashbox must belong to a selected branch'; end if;
  if exists (select 1 from public.organization_memberships m join auth.users u on u.id = m.user_id where m.organization_id = target_org and lower(u.email) = normalized_email and m.active) then raise exception 'This email already belongs to an active team member'; end if;

  update public.team_invitations set status = 'expired' where organization_id = target_org and lower(email) = normalized_email and status = 'pending' and expires_at <= now();
  if exists (select 1 from public.team_invitations where organization_id = target_org and lower(email) = normalized_email and status = 'pending') then raise exception 'A pending invitation already exists for this email'; end if;

  invitation_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.team_invitations (organization_id, email, display_name, role_code, branch_ids, cashbox_ids, mfa_required, token_hash, invited_by, expires_at)
    values (target_org, normalized_email, normalized_name, invited_role, normalized_branches, normalized_cashboxes, requires_mfa, encode(extensions.digest(invitation_token, 'sha256'), 'hex'), actor_id, now() + interval '72 hours')
    returning * into invitation;

  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
    values (target_org, actor_id, 'team_invitation_created', jsonb_build_object('invitation_id', invitation.id, 'email', normalized_email, 'role', invited_role, 'branch_count', cardinality(normalized_branches), 'cashbox_count', cardinality(normalized_cashboxes), 'expires_at', invitation.expires_at, 'aal', auth.jwt()->>'aal'));

  return jsonb_build_object('id', invitation.id, 'invite_token', invitation_token, 'email', invitation.email, 'display_name', invitation.display_name, 'role_code', invitation.role_code, 'expires_at', invitation.expires_at);
end;
$$;

create or replace function public.accept_team_invitation(invite_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare actor_id uuid := auth.uid();
declare actor_email text := lower(trim(coalesce(auth.jwt()->>'email', '')));
declare invitation public.team_invitations;
declare membership public.organization_memberships;
begin
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

  delete from public.organization_branch_access where membership_id = membership.id;
  delete from public.organization_cashbox_access where membership_id = membership.id;
  insert into public.organization_branch_access (membership_id, branch_id) select membership.id, branch_id from unnest(invitation.branch_ids) branch_id on conflict do nothing;
  insert into public.organization_cashbox_access (membership_id, cashbox_id) select membership.id, cashbox_id from unnest(invitation.cashbox_ids) cashbox_id on conflict do nothing;

  update public.team_invitations set status = 'accepted', accepted_by = actor_id, accepted_at = now() where id = invitation.id;
  insert into public.security_audit_events (organization_id, actor_user_id, target_user_id, event_type, metadata)
    values (invitation.organization_id, actor_id, actor_id, 'team_invitation_accepted', jsonb_build_object('invitation_id', invitation.id, 'membership_id', membership.id, 'role', membership.role_code));

  return jsonb_build_object('organization_id', invitation.organization_id, 'membership_id', membership.id, 'display_name', invitation.display_name, 'role_code', membership.role_code);
end;
$$;

create or replace function public.cancel_team_invitation(target_invitation uuid, reason_input text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare invitation public.team_invitations;
begin
  select * into invitation from public.team_invitations where id = target_invitation for update;
  if invitation.id is null then raise exception 'Invitation not found'; end if;
  if not public.has_org_permission(invitation.organization_id, 'team:manage') then raise exception 'Team management permission required'; end if;
  perform public.require_aal2();
  if invitation.status <> 'pending' then raise exception 'This invitation is no longer pending'; end if;
  if length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'A cancellation reason is required'; end if;
  update public.team_invitations set status = 'cancelled', cancelled_at = now() where id = invitation.id;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
    values (invitation.organization_id, auth.uid(), 'team_invitation_cancelled', jsonb_build_object('invitation_id', invitation.id, 'email', invitation.email, 'reason', trim(reason_input), 'aal', auth.jwt()->>'aal'));
  return jsonb_build_object('id', invitation.id, 'status', 'cancelled');
end;
$$;

create or replace function public.update_team_membership(
  target_membership uuid,
  new_role text,
  branch_scope uuid[],
  cashbox_scope uuid[],
  active_input boolean,
  reason_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare membership public.organization_memberships;
declare normalized_branches uuid[] := coalesce(array(select distinct unnest(branch_scope)), '{}'::uuid[]);
declare normalized_cashboxes uuid[] := coalesce(array(select distinct unnest(cashbox_scope)), '{}'::uuid[]);
begin
  select * into membership from public.organization_memberships where id = target_membership for update;
  if membership.id is null then raise exception 'Team member not found'; end if;
  if not public.has_org_permission(membership.organization_id, 'team:manage') then raise exception 'Team management permission required'; end if;
  perform public.require_aal2();
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
$$;

revoke all on function public.get_team_control_plane(uuid) from public;
revoke all on function public.create_team_invitation(uuid, text, text, text, uuid[], uuid[], boolean) from public;
revoke all on function public.accept_team_invitation(text) from public;
revoke all on function public.cancel_team_invitation(uuid, text) from public;
revoke all on function public.update_team_membership(uuid, text, uuid[], uuid[], boolean, text) from public;
grant execute on function public.get_team_control_plane(uuid) to authenticated;
grant execute on function public.create_team_invitation(uuid, text, text, text, uuid[], uuid[], boolean) to authenticated;
grant execute on function public.accept_team_invitation(text) to authenticated;
grant execute on function public.cancel_team_invitation(uuid, text) to authenticated;
grant execute on function public.update_team_membership(uuid, text, uuid[], uuid[], boolean, text) to authenticated;
