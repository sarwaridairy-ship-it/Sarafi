-- Premium web control plane: scoped workspaces, trusted browser devices,
-- platform administration, subscriptions, and auditable payment activation.
-- Platform administrators never receive access to tenant financial tables.

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  admin_role text not null default 'administrator'
    check (admin_role in ('super_admin', 'administrator', 'billing_admin', 'support')),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(display_name)) between 2 and 100)
);

create table public.platform_user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended')),
  reason text,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now(),
  check (status = 'active' or length(trim(coalesce(reason, ''))) >= 3)
);

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  name_en text not null,
  name_dari text not null,
  name_pashto text not null,
  description_en text not null default '',
  description_dari text not null default '',
  description_pashto text not null default '',
  price_afn numeric(18,2) not null check (price_afn >= 0),
  billing_interval text not null default 'monthly'
    check (billing_interval in ('monthly', 'yearly')),
  employee_limit integer not null check (employee_limit >= 1),
  branch_limit integer not null check (branch_limit >= 1),
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_provider_configs (
  code text primary key check (code ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  name_en text not null,
  name_dari text not null,
  name_pashto text not null,
  instructions_en text not null default '',
  instructions_dari text not null default '',
  instructions_pashto text not null default '',
  provider_mode text not null check (provider_mode in ('manual_review', 'hosted_gateway')),
  state text not null default 'disabled'
    check (state in ('disabled', 'configuration_required', 'live')),
  public_checkout_url text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  check (provider_mode <> 'hosted_gateway' or state <> 'live' or public_checkout_url is not null)
);

create table public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null default 'trial'
    check (status in ('trial', 'pending_payment', 'active', 'past_due', 'suspended', 'expired', 'cancelled')),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  activated_by uuid references auth.users(id),
  suspension_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'suspended' or length(trim(coalesce(suspension_reason, ''))) >= 3)
);

create table public.subscription_payment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  provider_code text not null references public.payment_provider_configs(code),
  amount_afn numeric(18,2) not null check (amount_afn > 0),
  payer_reference text,
  payer_note text,
  status text not null default 'submitted'
    check (status in ('awaiting_payment', 'submitted', 'under_review', 'approved', 'rejected', 'cancelled')),
  requested_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  review_note text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (reviewed_by is null or reviewed_by <> requested_by)
);

create table public.platform_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id),
  event_type text not null,
  target_organization_id uuid references public.organizations(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index platform_admins_active_idx on public.platform_admins (user_id) where active;
create index platform_user_access_suspended_idx on public.platform_user_access (user_id) where status = 'suspended';
create index subscription_plans_published_idx on public.subscription_plans (sort_order, id) where status = 'published';
create index organization_subscriptions_status_idx on public.organization_subscriptions (status, updated_at desc);
create index subscription_payment_org_date_idx on public.subscription_payment_requests (organization_id, requested_at desc);
create index subscription_payment_review_idx on public.subscription_payment_requests (status, requested_at) where status in ('submitted', 'under_review');
create unique index subscription_payment_one_open_idx
  on public.subscription_payment_requests (organization_id, plan_id)
  where status in ('awaiting_payment', 'submitted', 'under_review');
create index platform_audit_date_idx on public.platform_audit_events (created_at desc);
create index platform_audit_org_date_idx on public.platform_audit_events (target_organization_id, created_at desc) where target_organization_id is not null;

insert into public.subscription_plans (
  code, name_en, name_dari, name_pashto,
  description_en, description_dari, description_pashto,
  price_afn, billing_interval, employee_limit, branch_limit, features, status, sort_order
) values
  ('starter', 'Small shop', 'صرافی کوچک', 'کوچنۍ صرافي',
   'One branch with the essential daily tools.', 'یک شعبه با ابزارهای ضروری روزانه.', 'یوه څانګه او د ورځني کار اړین وسایل.',
   1000, 'monthly', 5, 1, '{"reports":true,"devices":true,"compliance":false}'::jsonb, 'published', 10),
  ('business', 'Growing business', 'صرافی در حال رشد', 'پراخېدونکې صرافي',
   'More employees, branches, reports, and compliance controls.', 'کارمندان، شعبه‌ها، گزارش‌ها و کنترول بیشتر.', 'ډېر کارکوونکي، څانګې، راپورونه او کنترول.',
   2500, 'monthly', 25, 5, '{"reports":true,"devices":true,"compliance":true}'::jsonb, 'published', 20)
on conflict (code) do nothing;

insert into public.payment_provider_configs (
  code, name_en, name_dari, name_pashto,
  instructions_en, instructions_dari, instructions_pashto, provider_mode, state
) values
  ('manual_review', 'Bank or office payment', 'پرداخت بانکی یا در دفتر', 'بانکي یا د دفتر تادیه',
   'Pay using the account shared by SARAFI, then enter the receipt reference. An administrator checks and activates the plan.',
   'به حساب معرفی‌شده صرافی پرداخت کنید، سپس شماره رسید را بنویسید. مدیر آن را بررسی و بسته را فعال می‌کند.',
   'د صرافي ورکړل شوي حساب ته پیسې ورکړئ، بیا د رسید شمېره ولیکئ. مدیر یې ګوري او بسته فعالوي.',
   'manual_review', 'live'),
  ('hesabpay', 'HesabPay', 'حساب‌پی', 'حساب‌پی',
   'Online checkout becomes available after secure merchant credentials and webhooks are configured.',
   'پرداخت آنلاین پس از تنظیم مصئون حساب تجارتی و پیام تأیید فعال می‌شود.',
   'انلاین تادیه د خوندي سوداګریز حساب او تایید پیغام له تنظیم وروسته فعالېږي.',
   'hosted_gateway', 'configuration_required'),
  ('aps_gateway', 'APS / bank gateway', 'درگاه بانکی APS', 'د APS بانکي دروازه',
   'Activation requires a contracted bank or APS merchant setup.',
   'فعال‌سازی به قرارداد بانکی یا حساب تجارتی APS نیاز دارد.',
   'فعالول د بانک یا APS سوداګریز تړون ته اړتیا لري.',
   'hosted_gateway', 'configuration_required')
on conflict (code) do nothing;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = (select auth.uid()) and active
  );
$$;

create or replace function public.is_platform_user_active()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select (select auth.uid()) is not null and not exists (
    select 1 from public.platform_user_access
    where user_id = (select auth.uid()) and status = 'suspended'
  );
$$;

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_platform_user_active() and exists (
    select 1 from public.organization_memberships
    where organization_id = target_org
      and user_id = (select auth.uid())
      and active
  );
$$;

create or replace function public.has_org_permission(target_org uuid, required_permission text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_platform_user_active() and exists (
    select 1 from public.organization_memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.active
      and (
        m.role_code = 'owner'
        or (required_permission = 'financial:post' and m.role_code in ('manager', 'cashier'))
        or (required_permission = 'financial:report' and m.role_code in ('manager', 'accountant', 'viewer'))
        or (required_permission = 'reconciliation:manage' and m.role_code in ('manager', 'accountant'))
        or (required_permission = 'approval:decide' and m.role_code = 'manager')
        or (required_permission = 'compliance:review' and m.role_code = 'compliance_officer')
      )
  );
$$;

create or replace function public.require_platform_admin(require_mfa boolean default true)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator access required'; end if;
  if require_mfa and coalesce((select auth.jwt()->>'aal'), 'aal1') <> 'aal2' then
    raise exception 'AAL2 is required for this administrator action';
  end if;
  return true;
end;
$$;

create or replace function public.create_default_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare starter_plan uuid;
begin
  select id into starter_plan from public.subscription_plans where code = 'starter';
  insert into public.organization_subscriptions (organization_id, plan_id, status, trial_ends_at)
    values (new.id, starter_plan, 'trial', now() + interval '30 days')
    on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists organizations_default_subscription on public.organizations;
create trigger organizations_default_subscription
  after insert on public.organizations
  for each row execute function public.create_default_subscription();

insert into public.organization_subscriptions (organization_id, plan_id, status, trial_ends_at)
select o.id, p.id, 'trial', now() + interval '30 days'
from public.organizations o
cross join public.subscription_plans p
where p.code = 'starter'
on conflict (organization_id) do nothing;

create or replace function public.get_my_workspace_context()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when not public.is_platform_user_active() then '[]'::jsonb
    else coalesce(jsonb_agg(jsonb_build_object(
      'membership_id', m.id,
      'organization_id', m.organization_id,
      'organization_name', o.display_name,
      'role_code', m.role_code,
      'mfa_required', m.mfa_required,
      'branches', coalesce((
        select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.created_at)
        from public.branches b
        where b.organization_id = m.organization_id and b.active
          and (
            not exists (select 1 from public.organization_branch_access ba0 where ba0.membership_id = m.id)
            or exists (select 1 from public.organization_branch_access ba where ba.membership_id = m.id and ba.branch_id = b.id)
          )
      ), '[]'::jsonb),
      'cashboxes', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'branch_id', c.branch_id) order by c.created_at)
        from public.cashboxes c
        where c.organization_id = m.organization_id and c.active
          and (
            not exists (select 1 from public.organization_cashbox_access ca0 where ca0.membership_id = m.id)
            or exists (select 1 from public.organization_cashbox_access ca where ca.membership_id = m.id and ca.cashbox_id = c.id)
          )
      ), '[]'::jsonb),
      'subscription', coalesce((
        select jsonb_build_object('status', s.status, 'period_end', coalesce(s.current_period_end, s.trial_ends_at), 'plan_code', p.code)
        from public.organization_subscriptions s
        join public.subscription_plans p on p.id = s.plan_id
        where s.organization_id = m.organization_id
      ), '{}'::jsonb)
    ) order by m.created_at), '[]'::jsonb)
    end
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid()) and m.active;
$$;

create or replace function public.create_counterparty(
  target_org uuid,
  display_name_input text,
  counterparty_type_input text default 'customer',
  phone_input text default null,
  notes_input text default null
)
returns public.counterparties
language plpgsql
security definer
set search_path = ''
as $$
declare result public.counterparties;
declare normalized_name text := trim(display_name_input);
begin
  if not public.has_org_permission(target_org, 'financial:post') then
    raise exception 'Customer creation permission required';
  end if;
  if length(normalized_name) < 2 or length(normalized_name) > 120 then
    raise exception 'Customer name must be between 2 and 120 characters';
  end if;
  if counterparty_type_input not in ('walk_in', 'customer', 'saraf', 'hawala_partner', 'supplier', 'employee', 'other') then
    raise exception 'Choose a valid customer type';
  end if;
  insert into public.counterparties (organization_id, display_name, phone, counterparty_type, notes)
    values (target_org, normalized_name, nullif(trim(phone_input), ''), counterparty_type_input, nullif(trim(notes_input), ''))
    returning * into result;
  return result;
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
set search_path = ''
as $$
declare result public.devices;
declare existing public.devices;
declare member_role text;
declare member_id uuid;
begin
  if not public.is_platform_user_active() then raise exception 'This user account is suspended'; end if;
  select id, role_code into member_id, member_role from public.organization_memberships
    where organization_id = target_org and user_id = (select auth.uid()) and active;
  if member_role is null then raise exception 'Active organization membership required'; end if;
  if target_branch is not null and not exists (
    select 1 from public.branches where id = target_branch and organization_id = target_org and active
  ) then raise exception 'Branch does not belong to organization'; end if;
  if target_branch is not null and member_role <> 'owner'
     and exists (select 1 from public.organization_branch_access where membership_id = member_id)
     and not exists (
       select 1 from public.organization_branch_access
       where membership_id = member_id and branch_id = target_branch
     ) then raise exception 'This employee is not assigned to the selected branch'; end if;
  if length(trim(coalesce(friendly_name_input, ''))) < 2
     or length(trim(coalesce(fingerprint_hash_input, ''))) < 32 then
    raise exception 'Valid device identity is required';
  end if;
  select * into existing from public.devices
    where organization_id = target_org and device_fingerprint_hash = trim(fingerprint_hash_input)
    for update;
  if existing.id is not null and existing.user_id <> (select auth.uid()) then
    raise exception 'This browser is linked to another employee';
  end if;
  if existing.id is null then
    insert into public.devices (
      organization_id, user_id, friendly_name, device_fingerprint_hash,
      app_version, status, last_branch_id
    ) values (
      target_org, (select auth.uid()), trim(friendly_name_input), trim(fingerprint_hash_input),
      trim(app_version_input), case when member_role = 'owner' then 'trusted' else 'untrusted' end, target_branch
    ) returning * into result;
  else
    update public.devices set
      friendly_name = trim(friendly_name_input),
      app_version = trim(app_version_input),
      last_branch_id = target_branch,
      last_seen_at = now(),
      status = case when existing.status = 'revoked' then 'revoked' when member_role = 'owner' then 'trusted' else existing.status end,
      revoked_at = case when existing.status = 'revoked' then existing.revoked_at else null end
    where id = existing.id returning * into result;
  end if;
  insert into public.security_audit_events (organization_id, actor_user_id, target_device_id, event_type, metadata)
    values (target_org, (select auth.uid()), result.id, 'device_link_checked', jsonb_build_object('status', result.status, 'friendly_name', result.friendly_name));
  return result;
end;
$$;

create or replace function public.revoke_device(target_device uuid, reason_input text)
returns public.devices
language plpgsql
security definer
set search_path = ''
as $$
declare result public.devices;
declare target_org uuid;
begin
  select organization_id into target_org from public.devices where id = target_device;
  if target_org is null or not public.has_org_permission(target_org, 'security:manage') then
    raise exception 'Security management permission required';
  end if;
  perform public.require_aal2();
  if length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'Revocation reason is required'; end if;
  update public.devices set status = 'revoked', revoked_at = now()
    where id = target_device returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, target_device_id, event_type, metadata)
    values (target_org, (select auth.uid()), target_device, 'device_revoked',
      jsonb_build_object('reason', trim(reason_input), 'aal', (select auth.jwt()->>'aal')));
  return result;
end;
$$;

create or replace function public.enforce_employee_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare allowed_employees integer;
declare active_employees integer;
declare pending_invitations integer;
begin
  if new.status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'pending' then return new; end if;

  perform 1 from public.organization_subscriptions
    where organization_id = new.organization_id for update;
  select p.employee_limit into allowed_employees
  from public.organization_subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.organization_id = new.organization_id;

  select count(*) into active_employees
  from public.organization_memberships
  where organization_id = new.organization_id and active and role_code <> 'owner';
  select count(*) into pending_invitations
  from public.team_invitations
  where organization_id = new.organization_id and status = 'pending' and expires_at > now();

  if allowed_employees is not null and active_employees + pending_invitations >= allowed_employees then
    raise exception 'This plan has reached its employee limit; the owner can choose a larger plan';
  end if;
  return new;
end;
$$;

drop trigger if exists team_invitations_plan_limit on public.team_invitations;
create trigger team_invitations_plan_limit
  before insert or update of status on public.team_invitations
  for each row execute function public.enforce_employee_plan_limit();

create or replace function public.trust_device(target_device uuid, reason_input text)
returns public.devices
language plpgsql
security definer
set search_path = ''
as $$
declare result public.devices;
declare target_org uuid;
begin
  select organization_id into target_org from public.devices where id = target_device;
  if target_org is null or not public.has_org_permission(target_org, 'security:manage') then
    raise exception 'Security management permission required';
  end if;
  perform public.require_aal2();
  if length(trim(coalesce(reason_input, ''))) < 2 then raise exception 'Approval reason is required'; end if;
  update public.devices set status = 'trusted', revoked_at = null, last_seen_at = now()
    where id = target_device returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, target_device_id, event_type, metadata)
    values (target_org, (select auth.uid()), target_device, 'device_trusted', jsonb_build_object('reason', trim(reason_input)));
  return result;
end;
$$;

create or replace function public.get_billing_portal(target_org uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare result jsonb;
begin
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = target_org and user_id = (select auth.uid()) and active and role_code = 'owner'
  ) then raise exception 'Only the business owner can manage the plan'; end if;
  select jsonb_build_object(
    'subscription', (
      select jsonb_build_object(
        'id', s.id, 'status', s.status, 'trial_ends_at', s.trial_ends_at,
        'current_period_end', s.current_period_end, 'plan_id', p.id,
        'plan_code', p.code, 'plan_name_en', p.name_en,
        'plan_name_dari', p.name_dari, 'plan_name_pashto', p.name_pashto
      ) from public.organization_subscriptions s
        join public.subscription_plans p on p.id = s.plan_id
      where s.organization_id = target_org
    ),
    'plans', coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order, p.id) from public.subscription_plans p where p.status = 'published'), '[]'::jsonb),
    'providers', coalesce((select jsonb_agg(to_jsonb(pc) order by pc.code) from public.payment_provider_configs pc where pc.state = 'live'), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'plan_id', r.plan_id, 'provider_code', r.provider_code,
        'amount_afn', r.amount_afn, 'payer_reference', r.payer_reference,
        'status', r.status, 'requested_at', r.requested_at,
        'review_note', r.review_note
      ) order by r.requested_at desc)
      from public.subscription_payment_requests r where r.organization_id = target_org
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.create_subscription_payment_request(
  target_org uuid,
  target_plan uuid,
  target_provider text,
  payer_reference_input text,
  payer_note_input text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare plan_row public.subscription_plans;
declare provider_row public.payment_provider_configs;
declare subscription_row public.organization_subscriptions;
declare request_row public.subscription_payment_requests;
begin
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = target_org and user_id = (select auth.uid()) and active and role_code = 'owner'
  ) then raise exception 'Only the business owner can request plan activation'; end if;
  select * into plan_row from public.subscription_plans where id = target_plan and status = 'published';
  if plan_row.id is null or plan_row.price_afn <= 0 then raise exception 'This plan is not available for payment'; end if;
  select * into provider_row from public.payment_provider_configs where code = target_provider and state = 'live';
  if provider_row.code is null then raise exception 'This payment method is not active'; end if;
  if provider_row.provider_mode = 'manual_review' and length(trim(coalesce(payer_reference_input, ''))) < 3 then
    raise exception 'Receipt reference is required';
  end if;
  select * into subscription_row from public.organization_subscriptions where organization_id = target_org for update;
  if subscription_row.id is null then raise exception 'Subscription was not found'; end if;
  insert into public.subscription_payment_requests (
    organization_id, subscription_id, plan_id, provider_code, amount_afn,
    payer_reference, payer_note, status, requested_by
  ) values (
    target_org, subscription_row.id, plan_row.id, provider_row.code, plan_row.price_afn,
    nullif(trim(payer_reference_input), ''), nullif(trim(payer_note_input), ''),
    case when provider_row.provider_mode = 'manual_review' then 'submitted' else 'awaiting_payment' end,
    (select auth.uid())
  ) returning * into request_row;
  update public.organization_subscriptions set status = 'pending_payment', updated_at = now()
    where id = subscription_row.id and status not in ('active', 'suspended');
  return jsonb_build_object('request', to_jsonb(request_row), 'checkout_url', provider_row.public_checkout_url);
end;
$$;

create or replace function public.get_platform_admin_console()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare result jsonb;
begin
  perform public.require_platform_admin(false);
  select jsonb_build_object(
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'display_name', o.display_name, 'created_at', o.created_at,
        'member_count', (select count(*) from public.organization_memberships m where m.organization_id = o.id and m.active),
        'plan_code', p.code, 'subscription_status', s.status,
        'period_end', coalesce(s.current_period_end, s.trial_ends_at)
      ) order by o.created_at desc)
      from public.organizations o
      left join public.organization_subscriptions s on s.organization_id = o.id
      left join public.subscription_plans p on p.id = s.plan_id
    ), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order, p.id) from public.subscription_plans p), '[]'::jsonb),
    'providers', coalesce((select jsonb_agg(to_jsonb(pc) order by pc.code) from public.payment_provider_configs pc), '[]'::jsonb),
    'payment_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'organization_id', r.organization_id, 'organization_name', o.display_name,
        'plan_id', r.plan_id, 'plan_name', p.name_en, 'provider_code', r.provider_code,
        'amount_afn', r.amount_afn, 'payer_reference', r.payer_reference,
        'payer_note', r.payer_note, 'status', r.status, 'requested_at', r.requested_at
      ) order by r.requested_at desc)
      from public.subscription_payment_requests r
      join public.organizations o on o.id = r.organization_id
      join public.subscription_plans p on p.id = r.plan_id
      where r.status in ('submitted', 'under_review', 'awaiting_payment')
    ), '[]'::jsonb),
    'counts', jsonb_build_object(
      'organizations', (select count(*) from public.organizations),
      'active_subscriptions', (select count(*) from public.organization_subscriptions where status in ('trial', 'active')),
      'pending_payments', (select count(*) from public.subscription_payment_requests where status in ('submitted', 'under_review')),
      'suspended_users', (select count(*) from public.platform_user_access where status = 'suspended')
    )
  ) into result;
  return result;
end;
$$;

create or replace function public.get_platform_organization_users(target_org uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare result jsonb;
begin
  perform public.require_platform_admin(false);
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', m.user_id,
    'membership_id', m.id,
    'display_name', coalesce(nullif(trim(p.display_name), ''), split_part(u.email, '@', 1), 'User'),
    'email', u.email,
    'role_code', m.role_code,
    'membership_active', m.active,
    'platform_status', coalesce(a.status, 'active'),
    'platform_reason', a.reason,
    'joined_at', m.created_at
  ) order by m.created_at), '[]'::jsonb) into result
  from public.organization_memberships m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  left join public.platform_user_access a on a.user_id = m.user_id
  where m.organization_id = target_org;
  return result;
end;
$$;

create or replace function public.decide_subscription_payment(
  target_request uuid,
  decision text,
  review_note_input text
)
returns public.subscription_payment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare request_row public.subscription_payment_requests;
declare plan_row public.subscription_plans;
declare next_end timestamptz;
begin
  perform public.require_platform_admin(true);
  if decision not in ('approved', 'rejected') then raise exception 'Choose approve or reject'; end if;
  if length(trim(coalesce(review_note_input, ''))) < 3 then raise exception 'Administrator note is required'; end if;
  select * into request_row from public.subscription_payment_requests where id = target_request for update;
  if request_row.id is null or request_row.status not in ('submitted', 'under_review') then
    raise exception 'Payment request is no longer available';
  end if;
  select * into plan_row from public.subscription_plans where id = request_row.plan_id;
  next_end := case when plan_row.billing_interval = 'yearly' then now() + interval '1 year' else now() + interval '1 month' end;
  update public.subscription_payment_requests set
    status = decision, reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = trim(review_note_input)
    where id = target_request returning * into request_row;
  if decision = 'approved' then
    update public.organization_subscriptions set
      plan_id = request_row.plan_id, status = 'active', current_period_start = now(),
      current_period_end = next_end, activated_by = (select auth.uid()),
      suspension_reason = null, updated_at = now()
      where id = request_row.subscription_id;
  end if;
  insert into public.platform_audit_events (actor_user_id, event_type, target_organization_id, metadata)
    values ((select auth.uid()), 'subscription_payment_' || decision, request_row.organization_id,
      jsonb_build_object('request_id', request_row.id, 'amount_afn', request_row.amount_afn, 'note', trim(review_note_input)));
  return request_row;
end;
$$;

create or replace function public.set_platform_user_access(
  target_user uuid,
  target_status text,
  reason_input text
)
returns public.platform_user_access
language plpgsql
security definer
set search_path = ''
as $$
declare result public.platform_user_access;
begin
  perform public.require_platform_admin(true);
  if target_user = (select auth.uid()) then raise exception 'An administrator cannot suspend their own account'; end if;
  if target_status not in ('active', 'suspended') then raise exception 'Choose a valid user status'; end if;
  if length(trim(coalesce(reason_input, ''))) < 3 then raise exception 'Reason is required'; end if;
  insert into public.platform_user_access (user_id, status, reason, changed_by, changed_at)
    values (target_user, target_status, trim(reason_input), (select auth.uid()), now())
    on conflict (user_id) do update set status = excluded.status, reason = excluded.reason,
      changed_by = excluded.changed_by, changed_at = excluded.changed_at
    returning * into result;
  insert into public.platform_audit_events (actor_user_id, event_type, target_user_id, metadata)
    values ((select auth.uid()), 'platform_user_' || target_status, target_user, jsonb_build_object('reason', trim(reason_input)));
  return result;
end;
$$;

create or replace function public.set_subscription_status(
  target_org uuid,
  target_status text,
  reason_input text
)
returns public.organization_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare result public.organization_subscriptions;
begin
  perform public.require_platform_admin(true);
  if target_status not in ('trial', 'active', 'past_due', 'suspended', 'expired', 'cancelled') then
    raise exception 'Choose a valid subscription status';
  end if;
  if target_status in ('suspended', 'cancelled') and length(trim(coalesce(reason_input, ''))) < 3 then
    raise exception 'Reason is required';
  end if;
  update public.organization_subscriptions set status = target_status,
    suspension_reason = case when target_status = 'suspended' then trim(reason_input) else null end,
    updated_at = now()
    where organization_id = target_org returning * into result;
  if result.id is null then raise exception 'Organization subscription was not found'; end if;
  insert into public.platform_audit_events (actor_user_id, event_type, target_organization_id, metadata)
    values ((select auth.uid()), 'subscription_status_changed', target_org,
      jsonb_build_object('status', target_status, 'reason', nullif(trim(reason_input), '')));
  return result;
end;
$$;

create or replace function public.set_payment_provider_state(
  provider_code_input text,
  state_input text
)
returns public.payment_provider_configs
language plpgsql
security definer
set search_path = ''
as $$
declare result public.payment_provider_configs;
begin
  perform public.require_platform_admin(true);
  if state_input not in ('disabled', 'configuration_required', 'live') then raise exception 'Choose a valid provider state'; end if;
  update public.payment_provider_configs set state = state_input,
    updated_by = (select auth.uid()), updated_at = now()
    where code = provider_code_input
      and (provider_mode = 'manual_review' or state_input <> 'live' or public_checkout_url is not null)
    returning * into result;
  if result.code is null then raise exception 'Hosted gateway credentials and checkout URL are required before activation'; end if;
  insert into public.platform_audit_events (actor_user_id, event_type, metadata)
    values ((select auth.uid()), 'payment_provider_state_changed', jsonb_build_object('provider', provider_code_input, 'state', state_input));
  return result;
end;
$$;

create or replace function public.get_transaction_history(target_org uuid, page_size integer default 50)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare result jsonb;
declare actor_membership uuid;
declare actor_role text;
begin
  select id, role_code into actor_membership, actor_role
  from public.organization_memberships
  where organization_id = target_org and user_id = (select auth.uid()) and active;
  if actor_membership is null or not public.is_platform_user_active() then
    raise exception 'Organization access required';
  end if;
  select coalesce(jsonb_agg(row_data order by occurred_at desc), '[]'::jsonb) into result
  from (
    select je.occurred_at, jsonb_build_object(
      'id', je.id, 'status', je.status, 'memo', je.memo, 'occurred_at', je.occurred_at,
      'branch_id', je.branch_id, 'event_type', fe.event_type,
      'immutable_reference', fe.immutable_reference,
      'source_account_name', fe.metadata->>'source_account_name',
      'destination_account_name', fe.metadata->>'destination_account_name',
      'source_account_kind', fe.metadata->>'source_account_kind',
      'destination_account_kind', fe.metadata->>'destination_account_kind',
      'cashbox_name', cb.name,
      'counterparty_name', cp.display_name,
      'employee_name', coalesce(nullif(trim(pr.display_name), ''), 'Team member'),
      'given_amount', fe.metadata->>'sold_amount',
      'given_currency', fe.metadata->>'sold_currency',
      'received_amount', fe.metadata->>'bought_amount',
      'received_currency', fe.metadata->>'bought_currency',
      'currency_code', coalesce(fe.metadata->>'currency', fe.metadata->>'sold_currency'),
      'amount', coalesce(fe.metadata->>'amount', fe.metadata->>'sold_amount')
    ) as row_data
    from public.journal_entries je
    join public.financial_events fe on fe.id = je.financial_event_id
    left join public.cashboxes cb on cb.id = case
      when fe.metadata->>'cashbox_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (fe.metadata->>'cashbox_id')::uuid else null end
    left join public.counterparties cp on cp.id = coalesce(fe.counterparty_id, case
      when fe.metadata->>'counterparty_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (fe.metadata->>'counterparty_id')::uuid else null end)
    left join public.profiles pr on pr.id = je.created_by
    where je.organization_id = target_org
      and (
        actor_role <> 'cashier'
        or (
          (
            not exists (select 1 from public.organization_branch_access ba0 where ba0.membership_id = actor_membership)
            or exists (
              select 1 from public.organization_branch_access ba
              where ba.membership_id = actor_membership and ba.branch_id = je.branch_id
            )
          )
          and (
            not exists (select 1 from public.organization_cashbox_access ca0 where ca0.membership_id = actor_membership)
            or cb.id is null
            or exists (
              select 1 from public.organization_cashbox_access ca
              where ca.membership_id = actor_membership and ca.cashbox_id = cb.id
            )
          )
        )
      )
    order by je.occurred_at desc
    limit least(greatest(page_size, 1), 100)
  ) history;
  return result;
end;
$$;

create or replace function public.enforce_premium_financial_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare actor_role text;
declare subscription_status text;
declare trial_end timestamptz;
begin
  if not public.is_platform_user_active() then raise exception 'This user account is suspended'; end if;
  select role_code into actor_role from public.organization_memberships
    where organization_id = new.organization_id and user_id = (select auth.uid()) and active;
  if actor_role not in ('owner', 'manager', 'cashier') then
    raise exception 'This employee role cannot post money movements';
  end if;
  select status, trial_ends_at into subscription_status, trial_end
    from public.organization_subscriptions where organization_id = new.organization_id;
  if subscription_status in ('suspended', 'expired', 'cancelled') then
    raise exception 'The business plan is not active; the owner can review billing without losing records';
  end if;
  if subscription_status = 'trial' and trial_end is not null and trial_end <= now() then
    raise exception 'The trial has ended; the owner can activate a plan without losing records';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_premium_financial_actor_before_insert on public.financial_events;
create trigger enforce_premium_financial_actor_before_insert
  before insert on public.financial_events
  for each row execute function public.enforce_premium_financial_actor();

alter table public.platform_admins enable row level security;
alter table public.platform_user_access enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.payment_provider_configs enable row level security;
alter table public.organization_subscriptions enable row level security;
alter table public.subscription_payment_requests enable row level security;
alter table public.platform_audit_events enable row level security;

create policy platform_admin_self_read on public.platform_admins
  for select to authenticated using (user_id = (select auth.uid()) and active);
create policy published_plan_read on public.subscription_plans
  for select to authenticated using (status = 'published' or (select public.is_platform_admin()));
create policy live_provider_read on public.payment_provider_configs
  for select to authenticated using (state = 'live' or (select public.is_platform_admin()));
create policy organization_subscription_member_read on public.organization_subscriptions
  for select to authenticated using ((select public.is_org_member(organization_id)));
create policy organization_payment_owner_read on public.subscription_payment_requests
  for select to authenticated using ((select public.has_org_permission(organization_id, 'organization:manage')));
create policy platform_audit_admin_read on public.platform_audit_events
  for select to authenticated using ((select public.is_platform_admin()));

revoke all on table public.platform_admins from anon, authenticated;
revoke all on table public.platform_user_access from anon, authenticated;
revoke all on table public.subscription_plans from anon;
revoke all on table public.payment_provider_configs from anon;
revoke all on table public.organization_subscriptions from anon;
revoke all on table public.subscription_payment_requests from anon, authenticated;
revoke all on table public.platform_audit_events from anon, authenticated;
grant select on table public.platform_admins to authenticated;
grant select on table public.subscription_plans to authenticated;
grant select on table public.payment_provider_configs to authenticated;
grant select on table public.organization_subscriptions to authenticated;

revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.is_platform_user_active() from public, anon;
revoke execute on function public.require_platform_admin(boolean) from public, anon, authenticated;
revoke execute on function public.create_default_subscription() from public, anon, authenticated;
revoke execute on function public.get_my_workspace_context() from public, anon;
revoke execute on function public.create_counterparty(uuid, text, text, text, text) from public, anon;
revoke execute on function public.register_device(uuid, text, text, text, uuid) from public, anon;
revoke execute on function public.trust_device(uuid, text) from public, anon;
revoke execute on function public.revoke_device(uuid, text) from public, anon;
revoke execute on function public.get_billing_portal(uuid) from public, anon;
revoke execute on function public.create_subscription_payment_request(uuid, uuid, text, text, text) from public, anon;
revoke execute on function public.get_platform_admin_console() from public, anon;
revoke execute on function public.get_platform_organization_users(uuid) from public, anon;
revoke execute on function public.decide_subscription_payment(uuid, text, text) from public, anon;
revoke execute on function public.set_platform_user_access(uuid, text, text) from public, anon;
revoke execute on function public.set_subscription_status(uuid, text, text) from public, anon;
revoke execute on function public.set_payment_provider_state(text, text) from public, anon;
revoke execute on function public.get_transaction_history(uuid, integer) from public, anon;
revoke execute on function public.enforce_premium_financial_actor() from public, anon, authenticated;
revoke execute on function public.enforce_employee_plan_limit() from public, anon, authenticated;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_platform_user_active() to authenticated;
grant execute on function public.get_my_workspace_context() to authenticated;
grant execute on function public.create_counterparty(uuid, text, text, text, text) to authenticated;
grant execute on function public.register_device(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.trust_device(uuid, text) to authenticated;
grant execute on function public.revoke_device(uuid, text) to authenticated;
grant execute on function public.get_billing_portal(uuid) to authenticated;
grant execute on function public.create_subscription_payment_request(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.get_platform_admin_console() to authenticated;
grant execute on function public.get_platform_organization_users(uuid) to authenticated;
grant execute on function public.decide_subscription_payment(uuid, text, text) to authenticated;
grant execute on function public.set_platform_user_access(uuid, text, text) to authenticated;
grant execute on function public.set_subscription_status(uuid, text, text) to authenticated;
grant execute on function public.set_payment_provider_state(text, text) to authenticated;
grant execute on function public.get_transaction_history(uuid, integer) to authenticated;

-- The first platform administrator is deliberately not auto-promoted. A project
-- operator must insert one reviewed auth.users UUID into platform_admins.
