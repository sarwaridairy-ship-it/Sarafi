-- Stage 5: authorized rates, valuation, positions, and daily snapshots.
create table public.rate_groups (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, code text not null, active boolean not null default true, unique (organization_id, code)
);
create table public.rate_board_entries (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id), rate_group_id uuid not null references public.rate_groups(id), from_currency text not null references public.currencies(code), to_currency text not null references public.currencies(code),
  buy_rate numeric(38,18) not null check (buy_rate > 0), sell_rate numeric(38,18) not null check (sell_rate > 0), effective_from timestamptz not null default now(), changed_by uuid not null references auth.users(id), active boolean not null default true, spread_tolerance numeric(38,18) check (spread_tolerance >= 0), created_at timestamptz not null default now(), check (from_currency <> to_currency)
);
create index rate_board_lookup_idx on public.rate_board_entries (organization_id, from_currency, to_currency, rate_group_id, effective_from desc);
create table public.valuation_rate_sets (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, base_currency text not null references public.currencies(code), effective_at timestamptz not null, created_by uuid not null references auth.users(id), source text not null default 'owner' check (source in ('owner', 'reference')), active boolean not null default true, created_at timestamptz not null default now()
);
create table public.valuation_rates (
  rate_set_id uuid not null references public.valuation_rate_sets(id) on delete cascade, organization_id uuid not null references public.organizations(id) on delete cascade,
  currency_code text not null references public.currencies(code), base_currency text not null references public.currencies(code), rate numeric(38,18) not null check (rate > 0), primary key (rate_set_id, currency_code), check (currency_code <> base_currency)
);
create table public.daily_balance_snapshots (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  snapshot_date date not null, branch_id uuid references public.branches(id), currency_code text not null references public.currencies(code), location text not null, asset_quantity numeric(38,12) not null default 0, receivable_quantity numeric(38,12) not null default 0, payable_quantity numeric(38,12) not null default 0, carrying_base_value numeric(38,12) not null default 0, valued_base_value numeric(38,12) not null default 0, unrealized_change numeric(38,12) not null default 0, reconciliation_status text not null default 'pending' check (reconciliation_status in ('pending', 'reconciled', 'variance')), valuation_rate_set_id uuid references public.valuation_rate_sets(id), rebuilt_from text not null default 'journal_lines', created_at timestamptz not null default now(), unique (organization_id, snapshot_date, branch_id, currency_code, location)
);
create index snapshot_org_date_idx on public.daily_balance_snapshots (organization_id, snapshot_date desc, currency_code);

create or replace function public.current_rate(target_org uuid, source_currency text, target_currency text, target_group uuid, target_branch uuid default null) returns numeric language sql security definer stable set search_path = public as $$
  select buy_rate from public.rate_board_entries where organization_id = target_org and from_currency = upper(source_currency) and to_currency = upper(target_currency) and rate_group_id = target_group and active and (branch_id is null or branch_id = target_branch) and effective_from <= now() order by (branch_id is not null) desc, effective_from desc limit 1;
$$;
revoke all on function public.current_rate(uuid, text, text, uuid, uuid) from public;
grant execute on function public.current_rate(uuid, text, text, uuid, uuid) to authenticated;

alter table public.rate_groups enable row level security; alter table public.rate_board_entries enable row level security; alter table public.valuation_rate_sets enable row level security; alter table public.valuation_rates enable row level security; alter table public.daily_balance_snapshots enable row level security;
create policy rate_groups_org_read on public.rate_groups for select using (public.is_org_member(organization_id));
create policy rate_board_org_read on public.rate_board_entries for select using (public.is_org_member(organization_id));
create policy valuation_sets_org_read on public.valuation_rate_sets for select using (public.is_org_member(organization_id));
create policy valuation_rates_org_read on public.valuation_rates for select using (public.is_org_member(organization_id));
create policy snapshots_org_read on public.daily_balance_snapshots for select using (public.is_org_member(organization_id));
