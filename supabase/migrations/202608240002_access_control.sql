-- Stage 3: authentication-adjacent organization control plane.
-- Supabase Auth owns passwords, email verification, reset, sessions, and MFA enrollment.
-- This migration owns application authorization, devices, approvals, and audit visibility.

drop policy if exists membership_self_read on public.organization_memberships;
alter table public.organization_memberships drop constraint if exists organization_memberships_role_code_check;
alter table public.organization_memberships add constraint organization_memberships_role_code_check check (role_code in ('owner', 'manager', 'accountant', 'cashier', 'viewer', 'compliance_officer'));

create table public.organization_branch_access (
  membership_id uuid not null references public.organization_memberships(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  primary key (membership_id, branch_id)
);
create table public.organization_cashbox_access (
  membership_id uuid not null references public.organization_memberships(id) on delete cascade,
  cashbox_id uuid not null references public.cashboxes(id) on delete cascade,
  primary key (membership_id, cashbox_id)
);
alter table public.organization_memberships add column if not exists active boolean not null default true;
alter table public.organization_memberships add column if not exists mfa_required boolean not null default false;

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  friendly_name text not null,
  device_fingerprint_hash text not null,
  app_version text not null,
  status text not null default 'untrusted' check (status in ('trusted', 'untrusted', 'revoked')),
  last_branch_id uuid references public.branches(id),
  push_token text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (organization_id, device_fingerprint_hash)
);
create index devices_org_user_idx on public.devices (organization_id, user_id, status);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id),
  requested_by uuid not null references auth.users(id),
  action_type text not null,
  payload_summary jsonb not null,
  reason text not null,
  amount_base numeric(38,12),
  currency_code text references public.currencies(code),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_reason text,
  check (decided_by is null or decided_by <> requested_by)
);
create index approval_queue_idx on public.approval_requests (organization_id, status, expires_at);

create table public.security_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  actor_user_id uuid references auth.users(id),
  event_type text not null,
  target_user_id uuid references auth.users(id),
  target_device_id uuid references public.devices(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index security_audit_org_date_idx on public.security_audit_events (organization_id, created_at desc);

create or replace function public.has_org_permission(target_org uuid, required_permission text) returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = target_org and m.user_id = auth.uid() and m.active = true
    and (m.role_code = 'owner' or (required_permission = 'financial:post' and m.role_code in ('manager', 'cashier')) or (required_permission = 'financial:report' and m.role_code in ('manager', 'accountant', 'viewer')) or (required_permission = 'approval:decide' and m.role_code in ('manager', 'owner')) or (required_permission = 'compliance:review' and m.role_code in ('owner', 'compliance_officer')) or (required_permission = 'security:manage' and m.role_code = 'owner'))
  );
$$;

alter table public.organization_branch_access enable row level security;
alter table public.organization_cashbox_access enable row level security;
alter table public.devices enable row level security;
alter table public.approval_requests enable row level security;
alter table public.security_audit_events enable row level security;
create policy branch_access_read on public.organization_branch_access for select using (exists (select 1 from public.organization_memberships m where m.id = membership_id and public.is_org_member(m.organization_id)));
create policy cashbox_access_read on public.organization_cashbox_access for select using (exists (select 1 from public.organization_memberships m where m.id = membership_id and public.is_org_member(m.organization_id)));
create policy devices_org_read on public.devices for select using (public.is_org_member(organization_id));
create policy approvals_org_read on public.approval_requests for select using (public.is_org_member(organization_id));
create policy security_audit_org_read on public.security_audit_events for select using (public.is_org_member(organization_id));

create or replace function public.decide_approval(target_id uuid, decision text, decision_reason text) returns public.approval_requests language plpgsql security definer set search_path = public as $$
declare request public.approval_requests; approver_role text;
begin
  select * into request from public.approval_requests where id = target_id for update;
  if request.id is null then raise exception 'Approval request not found'; end if;
  if request.requested_by = auth.uid() then raise exception 'Self-approval is not allowed'; end if;
  if now() >= request.expires_at then raise exception 'Approval request has expired'; end if;
  if decision not in ('approved', 'rejected') or length(trim(decision_reason)) = 0 then raise exception 'Valid decision and reason are required'; end if;
  select role_code into approver_role from public.organization_memberships where organization_id = request.organization_id and user_id = auth.uid() and active;
  if approver_role not in ('owner', 'manager') then raise exception 'User cannot decide approvals'; end if;
  update public.approval_requests set status = decision, decided_by = auth.uid(), decided_at = now(), decision_reason = trim(decision_reason) where id = target_id returning * into request;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata) values (request.organization_id, auth.uid(), 'approval_decided', jsonb_build_object('approval_id', request.id, 'decision', decision));
  return request;
end; $$;
