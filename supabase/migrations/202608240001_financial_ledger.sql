create extension if not exists pgcrypto;

create type public.journal_entry_status as enum ('pending_approval', 'posted', 'reversed', 'void_before_posting');
create type public.financial_event_type as enum ('opening_balance', 'buy_fx', 'sell_fx', 'exchange_fx', 'receive_money', 'pay_money', 'transfer_cash', 'record_expense', 'record_income', 'owner_investment', 'owner_withdrawal', 'bank_deposit', 'bank_withdrawal', 'cash_variance_adjustment', 'reversal');

create table public.organizations (id uuid primary key default gen_random_uuid(), legal_name text not null, display_name text not null, base_currency_code text not null default 'AFN', timezone text not null default 'Asia/Kabul', created_at timestamptz not null default now());
create table public.organization_memberships (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), user_id uuid not null references auth.users(id), role_code text not null check (role_code in ('owner', 'manager', 'cashier', 'viewer')), created_at timestamptz not null default now(), unique (organization_id, user_id));
create table public.branches (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), name text not null, timezone text not null default 'Asia/Kabul', active boolean not null default true, created_at timestamptz not null default now());
create table public.cashboxes (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id), name text not null, active boolean not null default true, created_at timestamptz not null default now());
create table public.currencies (code text primary key, name_en text not null, name_dari text not null, name_pashto text not null, symbol text not null, minor_unit smallint not null check (minor_unit between 0 and 9), active boolean not null default true);
insert into public.currencies (code, name_en, name_dari, name_pashto, symbol, minor_unit) values
  ('AFN', 'Afghan Afghani', 'افغانی', 'افغانۍ', '؋', 2),
  ('USD', 'United States Dollar', 'دالر امریکایی', 'امریکايي ډالر', '$', 2),
  ('EUR', 'Euro', 'یورو', 'یورو', '€', 2),
  ('GBP', 'British Pound', 'پوند انگلیس', 'بریتانوي پونډ', '£', 2),
  ('PKR', 'Pakistani Rupee', 'روپیه پاکستانی', 'پاکستانۍ روپۍ', '₨', 2),
  ('IRR', 'Iranian Rial', 'ریال ایرانی', 'ایراني ریال', '﷼', 0),
  ('AED', 'UAE Dirham', 'درهم امارات', 'اماراتي درهم', 'د.إ', 2),
  ('SAR', 'Saudi Riyal', 'ریال سعودی', 'سعودي ریال', '﷼', 2),
  ('TRY', 'Turkish Lira', 'لیره ترکی', 'ترکي لیره', '₺', 2)
on conflict (code) do nothing;
create table public.organization_currencies (organization_id uuid not null references public.organizations(id), currency_code text not null references public.currencies(code), enabled boolean not null default true, primary key (organization_id, currency_code));

create table public.financial_events (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid references public.branches(id), event_type public.financial_event_type not null, immutable_reference text not null, occurred_at timestamptz not null, created_at timestamptz not null default now(), created_by uuid not null references auth.users(id), device_id uuid, counterparty_id uuid, client_command_id text not null, metadata jsonb not null default '{}'::jsonb, unique (organization_id, client_command_id), unique (organization_id, immutable_reference));
create table public.journal_entries (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid references public.branches(id), financial_event_id uuid not null unique references public.financial_events(id), status public.journal_entry_status not null default 'pending_approval', occurred_at timestamptz not null, posted_at timestamptz, created_at timestamptz not null default now(), created_by uuid not null references auth.users(id), posted_by uuid references auth.users(id), memo text, reversal_of uuid references public.journal_entries(id), reversal_reason text, check ((status = 'reversed') = (reversal_of is not null)));
create table public.ledger_accounts (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), code text not null, name text not null, category text not null check (category in ('asset', 'liability', 'equity', 'income', 'expense')), currency_code text references public.currencies(code), cashbox_id uuid references public.cashboxes(id), active boolean not null default true, unique (organization_id, code));
create table public.journal_lines (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), journal_entry_id uuid not null references public.journal_entries(id), account_id uuid not null references public.ledger_accounts(id), currency_code text not null references public.currencies(code), native_debit numeric(38,12) not null default 0 check (native_debit >= 0), native_credit numeric(38,12) not null default 0 check (native_credit >= 0), base_debit numeric(38,12) not null default 0 check (base_debit >= 0), base_credit numeric(38,12) not null default 0 check (base_credit >= 0), applied_rate numeric(38,18), source_metadata jsonb not null default '{}'::jsonb, check ((native_debit = 0) <> (native_credit = 0) or (base_debit = 0 and base_credit = 0)), check ((base_debit = 0) <> (base_credit = 0) or (native_debit = 0 and native_credit = 0)));
create table public.command_receipts (organization_id uuid not null references public.organizations(id), client_command_id text not null, journal_entry_id uuid not null references public.journal_entries(id), received_at timestamptz not null default now(), primary key (organization_id, client_command_id));

create index journal_entries_org_date_idx on public.journal_entries (organization_id, occurred_at desc);
create index journal_lines_entry_idx on public.journal_lines (journal_entry_id);
create index financial_events_org_type_idx on public.financial_events (organization_id, event_type, occurred_at desc);

create or replace function public.assert_posted_entry_balanced() returns trigger language plpgsql as $$
declare debit numeric; credit numeric;
begin
  if new.status = 'posted' then
    select coalesce(sum(base_debit), 0), coalesce(sum(base_credit), 0) into debit, credit from public.journal_lines where journal_entry_id = new.id;
    if debit <> credit then raise exception 'Journal entry % is not balanced', new.id; end if;
  end if;
  return new;
end; $$;
create constraint trigger posted_entry_must_balance after insert or update on public.journal_entries deferrable initially deferred for each row execute function public.assert_posted_entry_balanced();

create or replace function public.prevent_posted_mutation() returns trigger language plpgsql as $$
begin
  if old.status in ('posted', 'reversed') and (new.status <> old.status or new.memo is distinct from old.memo or new.occurred_at <> old.occurred_at) then raise exception 'Posted financial entries are immutable; use a reversal'; end if;
  return new;
end; $$;
create trigger journal_entries_immutable before update on public.journal_entries for each row execute function public.prevent_posted_mutation();
create or replace function public.prevent_journal_line_mutation() returns trigger language plpgsql as $$
begin raise exception 'Journal lines are immutable'; end; $$;
create trigger journal_lines_immutable before update or delete on public.journal_lines for each row execute function public.prevent_journal_line_mutation();

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.branches enable row level security;
alter table public.cashboxes enable row level security;
alter table public.currencies enable row level security;
alter table public.organization_currencies enable row level security;
alter table public.financial_events enable row level security;
alter table public.journal_entries enable row level security;
alter table public.ledger_accounts enable row level security;
alter table public.journal_lines enable row level security;
alter table public.command_receipts enable row level security;

create or replace function public.is_org_member(target_org uuid) returns boolean language sql security definer stable set search_path = public as $$ select exists (select 1 from public.organization_memberships where organization_id = target_org and user_id = auth.uid()); $$;
create policy organization_member_read on public.organizations for select using (public.is_org_member(id));
create policy membership_self_read on public.organization_memberships for select using (user_id = auth.uid());
create policy tenant_read on public.branches for select using (public.is_org_member(organization_id));
create policy tenant_read on public.cashboxes for select using (public.is_org_member(organization_id));
create policy tenant_read on public.organization_currencies for select using (public.is_org_member(organization_id));
create policy tenant_read on public.financial_events for select using (public.is_org_member(organization_id));
create policy tenant_read on public.journal_entries for select using (public.is_org_member(organization_id));
create policy tenant_read on public.ledger_accounts for select using (public.is_org_member(organization_id));
create policy tenant_read on public.journal_lines for select using (public.is_org_member(organization_id));
create policy tenant_read on public.command_receipts for select using (public.is_org_member(organization_id));
create policy currency_read on public.currencies for select using (active = true);
