-- Delegated business administrator: operational control without changing ownership.
alter table public.organization_memberships drop constraint if exists organization_memberships_role_code_check;
alter table public.organization_memberships add constraint organization_memberships_role_code_check
  check (role_code in ('owner', 'business_admin', 'manager', 'accountant', 'cashier', 'viewer', 'compliance_officer'));

create or replace function public.has_org_permission(target_org uuid, required_permission text)
returns boolean language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = target_org and m.user_id = (select auth.uid()) and m.active
      and (m.role_code in ('owner', 'business_admin')
        or (required_permission in ('financial:overview', 'team:manage', 'organization:manage') and m.role_code in ('owner', 'business_admin'))
        or (required_permission = 'financial:post' and m.role_code in ('manager', 'cashier'))
        or (required_permission = 'financial:report' and m.role_code in ('manager', 'accountant', 'viewer'))
        or (required_permission = 'approval:decide' and m.role_code in ('manager', 'owner', 'business_admin'))
        or (required_permission = 'compliance:review' and m.role_code in ('owner', 'business_admin', 'compliance_officer'))
        or (required_permission = 'security:manage' and m.role_code in ('owner', 'business_admin'))));
$$;
revoke all on function public.has_org_permission(uuid, text) from public;
grant execute on function public.has_org_permission(uuid, text) to authenticated;
