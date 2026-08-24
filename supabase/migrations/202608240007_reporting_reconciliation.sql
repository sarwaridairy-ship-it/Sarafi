-- Stage 7: owner control, reconciliation, notifications, and exports.
create table public.cashbox_closes (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, branch_id uuid not null references public.branches(id), cashbox_id uuid not null references public.cashboxes(id), closed_by uuid not null references auth.users(id), business_date date not null, status text not null default 'submitted' check (status in ('draft', 'submitted', 'approved', 'rejected')), submitted_at timestamptz not null default now(), approved_by uuid references auth.users(id), approved_at timestamptz, variance_reason text, unique (organization_id, cashbox_id, business_date)
);
create table public.cashbox_close_lines (
  id uuid primary key default gen_random_uuid(), close_id uuid not null references public.cashbox_closes(id) on delete cascade, organization_id uuid not null references public.organizations(id) on delete cascade, currency_code text not null references public.currencies(code), expected_amount numeric(38,12) not null, counted_amount numeric(38,12) not null, variance_amount numeric(38,12) generated always as (counted_amount - expected_amount) stored, check (expected_amount >= 0 and counted_amount >= 0)
);
create index cashbox_close_org_date_idx on public.cashbox_closes (organization_id, business_date desc, status);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, recipient_user_id uuid not null references auth.users(id), notification_type text not null, subject_id text not null, message text not null, status text not null default 'unread' check (status in ('unread', 'read', 'dismissed')), created_at timestamptz not null default now(), unique (organization_id, recipient_user_id, notification_type, subject_id)
);
create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, user_id uuid not null references auth.users(id), notification_type text not null, in_app boolean not null default true, push boolean not null default false, threshold_base numeric(38,12), unique (organization_id, user_id, notification_type)
);
create table public.report_exports (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, generated_by uuid not null references auth.users(id), report_name text not null, format text not null check (format in ('csv', 'pdf', 'xlsx', 'print')), filters jsonb not null default '{}'::jsonb, valuation_rate_set_id uuid references public.valuation_rate_sets(id), generated_at timestamptz not null default now(), expires_at timestamptz, storage_path text
);

create or replace view public.organization_trial_balance with (security_invoker = true) as
select je.organization_id, jl.account_id, la.code, la.name, la.category, jl.currency_code, sum(jl.base_debit) as total_debit, sum(jl.base_credit) as total_credit
from public.journal_entries je join public.journal_lines jl on jl.journal_entry_id = je.id join public.ledger_accounts la on la.id = jl.account_id
where je.status = 'posted' group by je.organization_id, jl.account_id, la.code, la.name, la.category, jl.currency_code;
create or replace view public.organization_realized_profit with (security_invoker = true) as
select je.organization_id, date_trunc('day', je.occurred_at)::date as business_date, je.branch_id, coalesce(sum(jl.base_credit) - sum(jl.base_debit), 0) as realized_profit
from public.journal_entries je join public.journal_lines jl on jl.journal_entry_id = je.id join public.ledger_accounts la on la.id = jl.account_id
where je.status = 'posted' and la.code = 'income:realized-fx-gain' group by je.organization_id, date_trunc('day', je.occurred_at)::date, je.branch_id;

create or replace function public.submit_cashbox_close(target_id uuid) returns public.cashbox_closes language plpgsql security definer set search_path = public as $$
declare result public.cashbox_closes; has_variance boolean;
begin
  select exists (select 1 from public.cashbox_close_lines where close_id = target_id and variance_amount <> 0) into has_variance;
  if not exists (select 1 from public.cashbox_closes where id = target_id and public.is_org_member(organization_id)) then raise exception 'Close record not found or not authorized'; end if;
  update public.cashbox_closes set status = case when has_variance then 'submitted' else 'approved' end where id = target_id returning * into result;
  return result;
end; $$;
revoke all on function public.submit_cashbox_close(uuid) from public;
grant execute on function public.submit_cashbox_close(uuid) to authenticated;

alter table public.cashbox_closes enable row level security; alter table public.cashbox_close_lines enable row level security; alter table public.notifications enable row level security; alter table public.notification_preferences enable row level security; alter table public.report_exports enable row level security;
create policy cashbox_closes_org_read on public.cashbox_closes for select using (public.is_org_member(organization_id));
create policy cashbox_close_lines_org_read on public.cashbox_close_lines for select using (public.is_org_member(organization_id));
create policy notifications_recipient_read on public.notifications for select using (recipient_user_id = auth.uid());
create policy notification_preferences_self_read on public.notification_preferences for select using (user_id = auth.uid());
create policy report_exports_org_read on public.report_exports for select using (public.is_org_member(organization_id));
