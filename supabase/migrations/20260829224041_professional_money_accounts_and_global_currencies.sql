-- Stable money accounts, a broader localized currency catalog, and explicit
-- source/destination posting. Daily users select accounts; only owners create
-- accounts or change the currencies used by their organization.

insert into public.currencies (code, name_en, name_dari, name_pashto, symbol, minor_unit, active) values
  ('CNY', 'Chinese Yuan', 'یوان چین', 'چینايي یوان', '¥', 2, true),
  ('INR', 'Indian Rupee', 'روپیه هندی', 'هندي روپۍ', '₹', 2, true),
  ('CAD', 'Canadian Dollar', 'دالر کانادا', 'کاناډايي ډالر', 'C$', 2, true),
  ('AUD', 'Australian Dollar', 'دالر آسترالیا', 'اسټرالیايي ډالر', 'A$', 2, true),
  ('CHF', 'Swiss Franc', 'فرانک سویس', 'سویسي فرانک', 'CHF', 2, true),
  ('JPY', 'Japanese Yen', 'ین جاپان', 'جاپاني ین', '¥', 0, true),
  ('RUB', 'Russian Ruble', 'روبل روسیه', 'روسي روبل', '₽', 2, true),
  ('QAR', 'Qatari Riyal', 'ریال قطر', 'قطري ریال', 'ر.ق', 2, true),
  ('KWD', 'Kuwaiti Dinar', 'دینار کویت', 'کویټي دینار', 'د.ك', 3, true),
  ('BHD', 'Bahraini Dinar', 'دینار بحرین', 'بحریني دینار', 'د.ب', 3, true),
  ('OMR', 'Omani Rial', 'ریال عمان', 'عماني ریال', 'ر.ع.', 3, true),
  ('IQD', 'Iraqi Dinar', 'دینار عراق', 'عراقي دینار', 'ع.د', 3, true),
  ('JOD', 'Jordanian Dinar', 'دینار اردن', 'اردني دینار', 'د.ا', 3, true),
  ('EGP', 'Egyptian Pound', 'پوند مصر', 'مصري پونډ', 'E£', 2, true),
  ('UZS', 'Uzbekistani Som', 'سوم ازبکستان', 'ازبکستاني سوم', 'soʻm', 2, true),
  ('TJS', 'Tajikistani Somoni', 'سامانی تاجیکستان', 'تاجکستاني ساماني', 'ЅМ', 2, true),
  ('TMT', 'Turkmenistani Manat', 'منات ترکمنستان', 'ترکمنستاني منات', 'm', 2, true),
  ('KZT', 'Kazakhstani Tenge', 'تنگه قزاقستان', 'قزاقستاني ټینګ', '₸', 2, true),
  ('AZN', 'Azerbaijani Manat', 'منات آذربایجان', 'اذربایجاني منات', '₼', 2, true),
  ('GEL', 'Georgian Lari', 'لاری گرجستان', 'ګرجستاني لاري', '₾', 2, true),
  ('MYR', 'Malaysian Ringgit', 'رینگیت مالیزیا', 'مالیزیايي رینګیټ', 'RM', 2, true),
  ('SGD', 'Singapore Dollar', 'دالر سنگاپور', 'سنګاپوري ډالر', 'S$', 2, true),
  ('THB', 'Thai Baht', 'بات تایلند', 'تایلنډي بات', '฿', 2, true),
  ('KRW', 'South Korean Won', 'وون کوریای جنوبی', 'د سویلي کوریا وون', '₩', 0, true),
  ('HKD', 'Hong Kong Dollar', 'دالر هانگ کانگ', 'هانګ کانګي ډالر', 'HK$', 2, true),
  ('IDR', 'Indonesian Rupiah', 'روپیه اندونیزیا', 'اندونیزیايي روپۍ', 'Rp', 2, true),
  ('PHP', 'Philippine Peso', 'پزوی فلیپین', 'فلیپیني پېسو', '₱', 2, true),
  ('VND', 'Vietnamese Dong', 'دونگ ویتنام', 'ویتنامي ډونګ', '₫', 0, true),
  ('BDT', 'Bangladeshi Taka', 'تاکه بنگله‌دیش', 'بنګله‌دېشي ټاکه', '৳', 2, true),
  ('NPR', 'Nepalese Rupee', 'روپیه نیپال', 'نیپالي روپۍ', 'रू', 2, true),
  ('LKR', 'Sri Lankan Rupee', 'روپیه سریلانکا', 'سریلانکايي روپۍ', 'Rs', 2, true),
  ('NOK', 'Norwegian Krone', 'کرون ناروی', 'ناروېژي کرون', 'kr', 2, true),
  ('SEK', 'Swedish Krona', 'کرون سویدن', 'سویډني کرون', 'kr', 2, true),
  ('DKK', 'Danish Krone', 'کرون دنمارک', 'ډنمارکي کرون', 'kr', 2, true),
  ('NZD', 'New Zealand Dollar', 'دالر نیوزیلند', 'نیوزیلنډي ډالر', 'NZ$', 2, true),
  ('ZAR', 'South African Rand', 'راند افریقای جنوبی', 'د سویلي افریقا رېنډ', 'R', 2, true),
  ('BRL', 'Brazilian Real', 'ریال برازیل', 'برازیلي ریال', 'R$', 2, true),
  ('MXN', 'Mexican Peso', 'پزوی مکسیکو', 'مکسیکويي پېسو', 'MX$', 2, true),
  ('ARS', 'Argentine Peso', 'پزوی ارجنتاین', 'ارجنټایني پېسو', 'AR$', 2, true),
  ('ILS', 'Israeli New Shekel', 'شیکل جدید اسرائیل', 'اسرائیلي نوی شېکل', '₪', 2, true),
  ('PLN', 'Polish Zloty', 'زلوتی پولند', 'پولنډي زلوټي', 'zł', 2, true),
  ('CZK', 'Czech Koruna', 'کرونای چک', 'چکي کرونا', 'Kč', 2, true),
  ('HUF', 'Hungarian Forint', 'فورینت هنگری', 'هنګري فورینټ', 'Ft', 2, true),
  ('RON', 'Romanian Leu', 'لئوی رومانیا', 'رومانیايي لیو', 'lei', 2, true),
  ('BGN', 'Bulgarian Lev', 'لف بلغاریا', 'بلغاریايي لېف', 'лв', 2, true),
  ('UAH', 'Ukrainian Hryvnia', 'هریونیای اوکراین', 'اوکرایني هریونیا', '₴', 2, true)
on conflict (code) do update set
  name_en = excluded.name_en,
  name_dari = excluded.name_dari,
  name_pashto = excluded.name_pashto,
  symbol = excluded.symbol,
  minor_unit = excluded.minor_unit,
  active = true;

create table public.money_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id),
  cashbox_id uuid unique references public.cashboxes(id),
  name text not null check (length(trim(name)) between 2 and 80),
  account_type text not null check (account_type in ('cashbox', 'safe', 'bank', 'mobile_money', 'partner', 'other')),
  reference_label text check (reference_label is null or length(trim(reference_label)) between 2 and 80),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index money_accounts_active_name_idx
  on public.money_accounts (organization_id, lower(name))
  where active;
create index money_accounts_org_branch_idx
  on public.money_accounts (organization_id, branch_id, active, name);

alter table public.ledger_accounts
  add column money_account_id uuid references public.money_accounts(id);
create index ledger_accounts_money_account_idx
  on public.ledger_accounts (money_account_id, currency_code)
  where money_account_id is not null;

-- Every existing physical cashbox becomes a stable money account.
insert into public.money_accounts (organization_id, branch_id, cashbox_id, name, account_type, created_by)
select c.organization_id, c.branch_id, c.id, c.name, 'cashbox', null
from public.cashboxes c
on conflict (cashbox_id) do update set
  name = excluded.name,
  branch_id = excluded.branch_id,
  active = true,
  updated_at = now();

-- Preserve meaningful legacy bank/place names, but stop creating more accounts
-- from typed transaction text. A cashbox with the same name wins.
insert into public.money_accounts (organization_id, branch_id, name, account_type, created_by)
select distinct
  la.organization_id,
  je.branch_id,
  trim(regexp_replace(regexp_replace(la.code, '^(location|bank):', ''), ':[A-Z]{3}$', '')),
  case when la.code like 'bank:%' then 'bank' else 'other' end,
  null::uuid
from public.ledger_accounts la
left join public.journal_lines jl on jl.account_id = la.id
left join public.journal_entries je on je.id = jl.journal_entry_id
where (la.code like 'location:%' or la.code like 'bank:%')
  and length(trim(regexp_replace(regexp_replace(la.code, '^(location|bank):', ''), ':[A-Z]{3}$', ''))) >= 2
  and not exists (
    select 1 from public.money_accounts ma
    where ma.organization_id = la.organization_id
      and lower(ma.name) = lower(trim(regexp_replace(regexp_replace(la.code, '^(location|bank):', ''), ':[A-Z]{3}$', '')))
      and ma.active
  )
on conflict do nothing;

update public.ledger_accounts la
set money_account_id = ma.id,
    name = ma.name || ' · ' || la.currency_code
from public.money_accounts ma
where la.organization_id = ma.organization_id
  and (
    la.cashbox_id = ma.cashbox_id
    or (
      (la.code like 'location:%' or la.code like 'bank:%')
      and lower(ma.name) = lower(trim(regexp_replace(regexp_replace(la.code, '^(location|bank):', ''), ':[A-Z]{3}$', '')))
    )
  );

alter table public.money_accounts enable row level security;
revoke all on table public.money_accounts from anon, authenticated;

create or replace function public.user_can_use_money_account(target_org uuid, target_account uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.money_accounts ma on ma.id = target_account and ma.organization_id = target_org and ma.active
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.active
      and (
        m.role_code <> 'cashier'
        or (
          ma.cashbox_id is not null
          and (
            not exists (select 1 from public.organization_branch_access ba where ba.membership_id = m.id)
            or exists (select 1 from public.organization_branch_access ba where ba.membership_id = m.id and ba.branch_id = ma.branch_id)
          )
          and (
            not exists (select 1 from public.organization_cashbox_access ca where ca.membership_id = m.id)
            or exists (select 1 from public.organization_cashbox_access ca where ca.membership_id = m.id and ca.cashbox_id = ma.cashbox_id)
          )
        )
      )
  );
$$;

create or replace function public.get_money_accounts(target_org uuid)
returns table (
  id uuid,
  name text,
  account_type text,
  branch_id uuid,
  cashbox_id uuid,
  reference_label text,
  active boolean,
  balances jsonb
)
language sql
security definer
stable
set search_path = public
as $$
  select
    ma.id,
    ma.name,
    ma.account_type,
    ma.branch_id,
    ma.cashbox_id,
    ma.reference_label,
    ma.active,
    coalesce((
      select jsonb_agg(jsonb_build_object('currency', q.currency_code, 'amount', q.amount) order by q.currency_code)
      from (
        select jl.currency_code, sum(jl.native_debit - jl.native_credit)::text as amount
        from public.ledger_accounts la
        join public.journal_lines jl on jl.account_id = la.id
        join public.journal_entries je on je.id = jl.journal_entry_id and je.status = 'posted'
        where la.money_account_id = ma.id
        group by jl.currency_code
      ) q
    ), '[]'::jsonb) as balances
  from public.money_accounts ma
  where ma.organization_id = target_org
    and ma.active
    and public.user_can_use_money_account(target_org, ma.id)
  order by
    case ma.account_type when 'cashbox' then 1 when 'safe' then 2 when 'bank' then 3 when 'mobile_money' then 4 when 'partner' then 5 else 6 end,
    ma.name;
$$;

create or replace function public.create_money_account(
  target_org uuid,
  name_input text,
  account_type_input text,
  branch_id_input uuid,
  reference_input text
)
returns public.money_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.money_accounts;
  clean_name text := trim(name_input);
  clean_type text := lower(trim(account_type_input));
  clean_reference text := nullif(trim(reference_input), '');
begin
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = target_org and user_id = auth.uid() and active and role_code = 'owner'
  ) then raise exception 'Only the owner can add money accounts'; end if;
  if length(clean_name) < 2 or length(clean_name) > 80 then raise exception 'Account name must be between 2 and 80 characters'; end if;
  if clean_type not in ('safe', 'bank', 'mobile_money', 'partner', 'other') then raise exception 'Account type is invalid'; end if;
  if branch_id_input is not null and not exists (
    select 1 from public.branches where id = branch_id_input and organization_id = target_org and active
  ) then raise exception 'Branch is not active or belongs to another organization'; end if;
  if clean_reference is not null and length(clean_reference) > 80 then raise exception 'Account reference is too long'; end if;
  insert into public.money_accounts (organization_id, branch_id, name, account_type, reference_label, created_by)
    values (target_org, branch_id_input, clean_name, clean_type, clean_reference, auth.uid())
    returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
    values (target_org, auth.uid(), 'money_account_created', jsonb_build_object('money_account_id', result.id, 'name', result.name, 'account_type', result.account_type, 'branch_id', result.branch_id));
  return result;
end;
$$;

create or replace function public.set_organization_currency(
  target_org uuid,
  target_currency text,
  enabled_input boolean
)
returns public.organization_currencies
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.organization_currencies;
  normalized_currency text := upper(trim(target_currency));
  base_currency text;
  current_balance numeric;
begin
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = target_org and user_id = auth.uid() and active and role_code = 'owner'
  ) then raise exception 'Only the owner can change shop currencies'; end if;
  if not exists (select 1 from public.currencies where code = normalized_currency and active) then raise exception 'Currency is not active'; end if;
  select base_currency_code into base_currency from public.organizations where id = target_org;
  if base_currency is null then raise exception 'Organization not found'; end if;
  if not enabled_input and normalized_currency = base_currency then raise exception 'The base currency cannot be disabled'; end if;
  if not enabled_input then
    select coalesce(sum(jl.native_debit - jl.native_credit), 0) into current_balance
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id and je.status = 'posted'
    where jl.organization_id = target_org and jl.currency_code = normalized_currency;
    if current_balance <> 0 then raise exception 'A currency with a non-zero balance cannot be disabled'; end if;
  end if;
  insert into public.organization_currencies (organization_id, currency_code, enabled)
    values (target_org, normalized_currency, enabled_input)
    on conflict (organization_id, currency_code) do update set enabled = excluded.enabled
    returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
    values (target_org, auth.uid(), 'organization_currency_changed', jsonb_build_object('currency', normalized_currency, 'enabled', enabled_input));
  return result;
end;
$$;

create or replace function public.set_exchange_rate(
  target_org uuid,
  target_branch uuid,
  source_currency_input text,
  target_currency_input text,
  buy_rate_input numeric,
  sell_rate_input numeric
)
returns public.rate_board_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.rate_board_entries;
  source_currency text := upper(trim(source_currency_input));
  target_currency text := upper(trim(target_currency_input));
  group_id uuid;
begin
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = target_org and user_id = auth.uid() and active and role_code = 'owner'
  ) then raise exception 'Only the owner can change exchange rates'; end if;
  if source_currency = target_currency or buy_rate_input <= 0 or sell_rate_input <= 0 then raise exception 'Currencies and rates are invalid'; end if;
  if not exists (select 1 from public.organization_currencies where organization_id = target_org and currency_code = source_currency and enabled)
     or not exists (select 1 from public.organization_currencies where organization_id = target_org and currency_code = target_currency and enabled)
  then raise exception 'Both currencies must be enabled for this organization'; end if;
  if target_branch is not null and not exists (select 1 from public.branches where id = target_branch and organization_id = target_org and active) then raise exception 'Branch is not active or belongs to another organization'; end if;
  insert into public.rate_groups (organization_id, name, code, active)
    values (target_org, 'Shop rate', 'shop-default', true)
    on conflict (organization_id, code) do update set active = true
    returning id into group_id;
  update public.rate_board_entries
    set active = false
    where organization_id = target_org
      and rate_group_id = group_id
      and from_currency = source_currency
      and to_currency = target_currency
      and branch_id is not distinct from target_branch
      and active;
  insert into public.rate_board_entries (organization_id, branch_id, rate_group_id, from_currency, to_currency, buy_rate, sell_rate, changed_by, active)
    values (target_org, target_branch, group_id, source_currency, target_currency, buy_rate_input, sell_rate_input, auth.uid(), true)
    returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
    values (target_org, auth.uid(), 'exchange_rate_changed', jsonb_build_object('rate_id', result.id, 'from_currency', source_currency, 'to_currency', target_currency, 'buy_rate', buy_rate_input, 'sell_rate', sell_rate_input, 'branch_id', target_branch));
  return result;
end;
$$;

create or replace function public.record_operation(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid := (command->>'organization_id')::uuid;
  branch_id_value uuid := (command->>'branch_id')::uuid;
  actor_id uuid := auth.uid();
  client_id text := command->>'client_command_id';
  kind text := upper(command->>'operation');
  currency_value text := upper(command->>'currency');
  amount_value numeric := (command->>'amount')::numeric;
  base_currency_value text;
  base_amount_value numeric;
  source_id uuid := nullif(command->>'source_money_account_id', '')::uuid;
  destination_id uuid := nullif(command->>'destination_money_account_id', '')::uuid;
  source_money public.money_accounts;
  destination_money public.money_accounts;
  event_id uuid;
  entry_id uuid;
  source_account uuid;
  destination_account uuid;
  offset_account uuid;
  membership_id_value uuid;
  role_value text;
  result_entry public.journal_entries;
  existing_entry public.journal_entries;
  cash_debit boolean;
  offset_category text;
  offset_code text;
  offset_name text;
  source_balance numeric;
  allow_negative boolean := false;
  account_code text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if client_id is null or length(trim(client_id)) = 0 then raise exception 'client_command_id is required'; end if;
  if kind not in ('RECEIVE_MONEY', 'PAY_MONEY', 'TRANSFER_CASH', 'RECORD_EXPENSE', 'RECORD_INCOME', 'OWNER_INVESTMENT', 'OWNER_WITHDRAWAL', 'BANK_DEPOSIT', 'BANK_WITHDRAWAL') then raise exception 'Unsupported operation'; end if;
  if amount_value is null or amount_value <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if not exists (select 1 from public.organization_currencies where organization_id = org_id and currency_code = currency_value and enabled) then raise exception 'Currency is not enabled for this organization'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || client_id, 0));
  select je.* into existing_entry from public.journal_entries je join public.financial_events fe on fe.id = je.financial_event_id where fe.organization_id = org_id and fe.client_command_id = client_id limit 1;
  if existing_entry.id is not null then return existing_entry; end if;
  select id, role_code into membership_id_value, role_value from public.organization_memberships where organization_id = org_id and user_id = actor_id and active = true;
  if membership_id_value is null or role_value not in ('owner', 'manager', 'accountant', 'cashier') then raise exception 'User cannot record this operation'; end if;
  if not exists (select 1 from public.branches where id = branch_id_value and organization_id = org_id and active) then raise exception 'Branch is not active or belongs to another organization'; end if;
  if role_value = 'cashier' and exists (select 1 from public.organization_branch_access where membership_id = membership_id_value) and not exists (select 1 from public.organization_branch_access where membership_id = membership_id_value and branch_id = branch_id_value) then raise exception 'User is not assigned to this branch'; end if;
  if kind in ('OWNER_INVESTMENT', 'OWNER_WITHDRAWAL', 'RECORD_INCOME') and role_value = 'cashier' then raise exception 'Cashier cannot record this operation'; end if;

  if source_id is not null then
    select * into source_money from public.money_accounts where id = source_id and organization_id = org_id and active;
    if source_money.id is null or not public.user_can_use_money_account(org_id, source_id) then raise exception 'Source account is unavailable'; end if;
    if source_money.branch_id is not null and source_money.branch_id <> branch_id_value then raise exception 'Source account belongs to another branch'; end if;
  end if;
  if destination_id is not null then
    select * into destination_money from public.money_accounts where id = destination_id and organization_id = org_id and active;
    if destination_money.id is null or not public.user_can_use_money_account(org_id, destination_id) then raise exception 'Destination account is unavailable'; end if;
    if destination_money.branch_id is not null and destination_money.branch_id <> branch_id_value then raise exception 'Destination account belongs to another branch'; end if;
  end if;
  if kind in ('TRANSFER_CASH', 'BANK_DEPOSIT', 'BANK_WITHDRAWAL') then
    if source_money.id is null or destination_money.id is null then raise exception 'Source and destination accounts are required'; end if;
    if source_money.id = destination_money.id then raise exception 'Source and destination accounts must be different'; end if;
  elsif kind in ('RECEIVE_MONEY', 'RECORD_INCOME', 'OWNER_INVESTMENT') then
    if destination_money.id is null then raise exception 'Destination account is required'; end if;
  else
    if source_money.id is null then raise exception 'Source account is required'; end if;
  end if;
  if kind = 'BANK_DEPOSIT' and destination_money.account_type <> 'bank' then raise exception 'A bank deposit must end in a bank account'; end if;
  if kind = 'BANK_WITHDRAWAL' and source_money.account_type <> 'bank' then raise exception 'A bank withdrawal must start from a bank account'; end if;

  select base_currency_code into base_currency_value from public.organizations where id = org_id;
  if currency_value = base_currency_value then
    base_amount_value := amount_value;
  else
    base_amount_value := nullif(command->>'base_amount', '')::numeric;
    if base_amount_value is null or base_amount_value <= 0 then raise exception 'Base-currency value is required for a foreign-currency operation'; end if;
  end if;

  if source_money.id is not null then
    perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || source_money.id::text || ':' || currency_value, 0));
    select coalesce(negative_cash_allowed, false) into allow_negative from public.organization_settings where organization_id = org_id;
    if not allow_negative then
      select coalesce(sum(jl.native_debit - jl.native_credit), 0) into source_balance
      from public.ledger_accounts la
      join public.journal_lines jl on jl.account_id = la.id
      join public.journal_entries je on je.id = jl.journal_entry_id and je.status = 'posted'
      where la.money_account_id = source_money.id and jl.currency_code = currency_value;
      if source_balance < amount_value then raise exception 'The source account does not have enough money'; end if;
    end if;
  end if;

  command := command || jsonb_build_object(
    'source_money_account_id', source_money.id,
    'destination_money_account_id', destination_money.id,
    'source_account_name', case when source_money.id is not null then source_money.name else null end,
    'destination_account_name', case when destination_money.id is not null then destination_money.name else null end,
    'source_account_kind', case
      when source_money.id is not null then 'money_account'
      when kind = 'RECORD_INCOME' then 'income_source'
      when kind = 'OWNER_INVESTMENT' then 'owner_personal'
      when kind = 'RECEIVE_MONEY' then 'customer_outside'
      else 'outside_account'
    end,
    'destination_account_kind', case
      when destination_money.id is not null then 'money_account'
      when kind = 'RECORD_EXPENSE' then 'expense'
      when kind = 'OWNER_WITHDRAWAL' then 'owner_personal'
      when kind = 'PAY_MONEY' then 'customer_outside'
      else 'outside_account'
    end,
    'base_amount', base_amount_value,
    'money_flow_version', 2
  );

  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata)
    values (org_id, branch_id_value, lower(kind)::public.financial_event_type, 'operation-' || client_id, coalesce((command->>'occurred_at')::timestamptz, now()), actor_id, client_id, command)
    returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo)
    values (org_id, branch_id_value, event_id, 'posted', coalesce((command->>'occurred_at')::timestamptz, now()), now(), actor_id, actor_id, command->>'memo')
    returning id into entry_id;

  if source_money.id is not null then
    account_code := case when source_money.cashbox_id is not null then 'cashbox:' || source_money.cashbox_id || ':' || currency_value else 'money-account:' || source_money.id || ':' || currency_value end;
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code, cashbox_id, money_account_id)
      values (org_id, account_code, source_money.name || ' · ' || currency_value, 'asset', currency_value, source_money.cashbox_id, source_money.id)
      on conflict (organization_id, code) do update set name = excluded.name, cashbox_id = excluded.cashbox_id, money_account_id = excluded.money_account_id, active = true
      returning id into source_account;
  end if;
  if destination_money.id is not null then
    account_code := case when destination_money.cashbox_id is not null then 'cashbox:' || destination_money.cashbox_id || ':' || currency_value else 'money-account:' || destination_money.id || ':' || currency_value end;
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code, cashbox_id, money_account_id)
      values (org_id, account_code, destination_money.name || ' · ' || currency_value, 'asset', currency_value, destination_money.cashbox_id, destination_money.id)
      on conflict (organization_id, code) do update set name = excluded.name, cashbox_id = excluded.cashbox_id, money_account_id = excluded.money_account_id, active = true
      returning id into destination_account;
  end if;

  if kind in ('TRANSFER_CASH', 'BANK_DEPOSIT', 'BANK_WITHDRAWAL') then
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, destination_account, currency_value, amount_value, base_amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, source_account, currency_value, amount_value, base_amount_value);
  else
    cash_debit := kind in ('RECEIVE_MONEY', 'RECORD_INCOME', 'OWNER_INVESTMENT');
    if kind = 'RECORD_EXPENSE' then offset_category := 'expense'; offset_code := 'expense:' || lower(coalesce(nullif(trim(command->>'category'), ''), 'other')) || ':' || currency_value; offset_name := 'Expense · ' || currency_value;
    elsif kind = 'RECORD_INCOME' then offset_category := 'income'; offset_code := 'income:' || lower(coalesce(nullif(trim(command->>'category'), ''), 'other')) || ':' || currency_value; offset_name := 'Income · ' || currency_value;
    elsif kind = 'OWNER_INVESTMENT' then offset_category := 'equity'; offset_code := 'equity:owner-capital:' || currency_value; offset_name := 'Owner capital · ' || currency_value;
    elsif kind = 'OWNER_WITHDRAWAL' then offset_category := 'equity'; offset_code := 'equity:owner-drawings:' || currency_value; offset_name := 'Owner drawings · ' || currency_value;
    else offset_category := 'liability'; offset_code := 'operation:' || lower(kind) || ':' || currency_value; offset_name := initcap(replace(lower(kind), '_', ' ')) || ' · ' || currency_value;
    end if;
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
      values (org_id, offset_code, offset_name, offset_category, currency_value)
      on conflict (organization_id, code) do update set name = excluded.name, active = true
      returning id into offset_account;
    if cash_debit then
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, destination_account, currency_value, amount_value, base_amount_value);
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, offset_account, currency_value, amount_value, base_amount_value);
    else
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit) values (org_id, entry_id, offset_account, currency_value, amount_value, base_amount_value);
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit) values (org_id, entry_id, source_account, currency_value, amount_value, base_amount_value);
    end if;
  end if;
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id) values (org_id, client_id, entry_id);
  select * into result_entry from public.journal_entries where id = entry_id;
  return result_entry;
end;
$$;

-- New businesses receive a stable money account for the opening cashbox.
create or replace function public.create_business(command jsonb)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  organization_row public.organizations;
  branch_id_value uuid;
  cashbox_id_value uuid;
  business_name text := trim(command->>'display_name');
  base_currency text := upper(coalesce(command->>'base_currency_code', 'AFN'));
  selected_currencies jsonb := coalesce(command->'currencies', '["AFN", "USD"]'::jsonb);
begin
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
$$;

revoke all on function public.user_can_use_money_account(uuid, uuid) from public, anon;
revoke all on function public.get_money_accounts(uuid) from public, anon;
revoke all on function public.create_money_account(uuid, text, text, uuid, text) from public, anon;
revoke all on function public.set_organization_currency(uuid, text, boolean) from public, anon;
revoke all on function public.set_exchange_rate(uuid, uuid, text, text, numeric, numeric) from public, anon;
revoke all on function public.record_operation(jsonb) from public, anon;
revoke all on function public.create_business(jsonb) from public, anon;
grant execute on function public.user_can_use_money_account(uuid, uuid) to authenticated;
grant execute on function public.get_money_accounts(uuid) to authenticated;
grant execute on function public.create_money_account(uuid, text, text, uuid, text) to authenticated;
grant execute on function public.set_organization_currency(uuid, text, boolean) to authenticated;
grant execute on function public.set_exchange_rate(uuid, uuid, text, text, numeric, numeric) to authenticated;
grant execute on function public.record_operation(jsonb) to authenticated;
grant execute on function public.create_business(jsonb) to authenticated;
