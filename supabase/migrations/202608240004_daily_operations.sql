-- Stage 4: daily Sarafi operations and first-class subledgers.
create table public.counterparties (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null, business_name text, phone text, email text,
  counterparty_type text not null check (counterparty_type in ('walk_in', 'customer', 'saraf', 'hawala_partner', 'supplier', 'employee', 'other')),
  risk_status text not null default 'standard' check (risk_status in ('standard', 'review', 'blocked')), notes text, created_at timestamptz not null default now()
);
create index counterparties_org_name_idx on public.counterparties (organization_id, display_name);

create table public.debts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id), counterparty_id uuid not null references public.counterparties(id),
  direction text not null check (direction in ('receivable', 'payable')), currency_code text not null references public.currencies(code),
  original_amount numeric(38,12) not null check (original_amount > 0), outstanding_amount numeric(38,12) not null check (outstanding_amount >= 0 and outstanding_amount <= original_amount),
  originating_entry_id uuid references public.journal_entries(id), due_at timestamptz, notes text, created_at timestamptz not null default now()
);
create index debts_org_status_idx on public.debts (organization_id, direction, outstanding_amount, due_at);

create table public.receipts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  journal_entry_id uuid not null references public.journal_entries(id), receipt_number text not null, language_code text not null default 'en' check (language_code in ('en', 'fa-AF', 'ps-AF')),
  created_at timestamptz not null default now(), unique (organization_id, receipt_number), unique (journal_entry_id)
);

create table public.cash_transfers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id), from_location text not null, to_location text not null, currency_code text not null references public.currencies(code), amount numeric(38,12) not null check (amount > 0),
  status text not null default 'initiated' check (status in ('initiated', 'handed_over', 'received', 'cancelled')), handover_employee_id uuid references auth.users(id), journal_entry_id uuid references public.journal_entries(id), note text, created_at timestamptz not null default now(), check (from_location <> to_location)
);

create table public.expense_categories (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, name text not null, active boolean not null default true, unique (organization_id, name));
create table public.expenses (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, branch_id uuid not null references public.branches(id), category_id uuid references public.expense_categories(id), currency_code text not null references public.currencies(code), amount numeric(38,12) not null check (amount > 0), paid_from text not null, counterparty_id uuid references public.counterparties(id), journal_entry_id uuid references public.journal_entries(id), occurred_at timestamptz not null default now(), note text
);

create table public.hawala_transfers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, branch_id uuid not null references public.branches(id), sender_id uuid references public.counterparties(id), beneficiary_name text not null, origin_location text not null, destination_location text not null, partner_id uuid references public.counterparties(id), currency_code text not null references public.currencies(code), amount numeric(38,12) not null check (amount > 0), fee numeric(38,12) not null default 0 check (fee >= 0), reference_code text not null, status text not null default 'created' check (status in ('created', 'funded', 'sent', 'ready', 'paid', 'cancelled')), journal_entry_id uuid references public.journal_entries(id), created_at timestamptz not null default now(), unique (organization_id, reference_code)
);

create or replace function public.record_operation(command jsonb) returns public.journal_entries language plpgsql security definer set search_path = public as $$
declare org_id uuid := (command->>'organization_id')::uuid; branch_id_value uuid := (command->>'branch_id')::uuid; actor_id uuid := auth.uid(); kind text := upper(command->>'operation'); currency_value text := upper(command->>'currency'); amount_value numeric := (command->>'amount')::numeric; location_value text := command->>'location'; entry_id uuid; event_id uuid; account_a uuid; account_b uuid; result public.journal_entries; existing_entry public.journal_entries;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  select je.* into existing_entry from public.journal_entries je join public.financial_events fe on fe.id = je.financial_event_id where fe.organization_id = org_id and fe.client_command_id = command->>'client_command_id' limit 1;
  if existing_entry.id is not null then return existing_entry; end if;
  if not exists (select 1 from public.organization_memberships where organization_id = org_id and user_id = actor_id and active and role_code in ('owner', 'manager', 'accountant')) then raise exception 'User cannot record this operation'; end if;
  if kind not in ('RECEIVE_MONEY', 'PAY_MONEY', 'TRANSFER_CASH', 'RECORD_EXPENSE', 'RECORD_INCOME', 'OWNER_INVESTMENT', 'OWNER_WITHDRAWAL', 'BANK_DEPOSIT', 'BANK_WITHDRAWAL') then raise exception 'Unsupported operation'; end if;
  if amount_value is null or amount_value <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if not exists (select 1 from public.branches where id = branch_id_value and organization_id = org_id and active) then raise exception 'Branch is not active or belongs to another organization'; end if;
  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata) values (org_id, branch_id_value, lower(kind)::public.financial_event_type, 'operation-' || (command->>'client_command_id'), now(), actor_id, command->>'client_command_id', command) returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo) values (org_id, branch_id_value, event_id, 'posted', now(), now(), actor_id, actor_id, command->>'memo') returning id into entry_id;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code) values (org_id, 'operation:' || kind || ':' || currency_value, kind || ' ' || currency_value, case when kind in ('RECORD_EXPENSE', 'OWNER_WITHDRAWAL') then 'expense' else 'asset' end, currency_value) on conflict (organization_id, code) do update set active = true returning id into account_a;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code) values (org_id, 'location:' || coalesce(location_value, 'unassigned') || ':' || currency_value, 'Location ' || currency_value, 'asset', currency_value) on conflict (organization_id, code) do update set active = true returning id into account_b;
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, account_b, currency_value, amount_value, amount_value);
  insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, account_a, currency_value, amount_value, amount_value);
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id) values (org_id, command->>'client_command_id', entry_id);
  select * into result from public.journal_entries where id = entry_id; return result;
end; $$;
revoke all on function public.record_operation(jsonb) from public;
grant execute on function public.record_operation(jsonb) to authenticated;

alter table public.counterparties enable row level security; alter table public.debts enable row level security; alter table public.receipts enable row level security; alter table public.cash_transfers enable row level security; alter table public.expense_categories enable row level security; alter table public.expenses enable row level security; alter table public.hawala_transfers enable row level security;
create policy counterparties_org_read on public.counterparties for select using (public.is_org_member(organization_id));
create policy debts_org_read on public.debts for select using (public.is_org_member(organization_id));
create policy receipts_org_read on public.receipts for select using (public.is_org_member(organization_id));
create policy transfers_org_read on public.cash_transfers for select using (public.is_org_member(organization_id));
create policy expense_categories_org_read on public.expense_categories for select using (public.is_org_member(organization_id));
create policy expenses_org_read on public.expenses for select using (public.is_org_member(organization_id));
create policy hawala_org_read on public.hawala_transfers for select using (public.is_org_member(organization_id));
