-- Two-market rate preferences, private subscription payment evidence, editable
-- plan terms, and server-owned localized document narratives.

alter table public.organization_currencies
  add column if not exists display_order integer not null default 999;

with ranked as (
  select organization_id, currency_code,
    row_number() over (
      partition by organization_id
      order by case currency_code
        when 'AFN' then 0 when 'USD' then 1 when 'EUR' then 2 when 'GBP' then 3
        when 'AED' then 4 when 'SAR' then 5 when 'PKR' then 6 when 'IRR' then 7
        when 'CNY' then 8 else 100 end, currency_code
    ) - 1 as next_order
  from public.organization_currencies
)
update public.organization_currencies oc
set display_order = ranked.next_order
from ranked
where ranked.organization_id = oc.organization_id
  and ranked.currency_code = oc.currency_code;

create or replace function public.set_organization_rate_currencies(
  target_org uuid,
  target_currencies text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text[];
begin
  if not public.has_capability(target_org, 'rates.manage', '{}'::jsonb)
     and not public.has_capability(target_org, 'money_accounts.manage', '{}'::jsonb) then
    raise exception 'CAPABILITY_REQUIRED:rates.manage' using errcode = '42501';
  end if;

  select coalesce(array_agg(code order by position), '{}'::text[])
  into normalized
  from (
    select upper(trim(value)) as code, min(ordinality)::integer as position
    from unnest(coalesce(target_currencies, '{}'::text[])) with ordinality as selected(value, ordinality)
    where upper(trim(value)) <> 'AFN' and trim(value) <> ''
    group by upper(trim(value))
  ) ordered;

  if cardinality(normalized) > 30 then
    raise exception 'Choose no more than 30 currencies';
  end if;
  if exists (
    select 1 from unnest(normalized) selected(code)
    where not exists (select 1 from public.currencies c where c.code = selected.code and c.active)
  ) then
    raise exception 'Choose only active currencies';
  end if;

  update public.organization_currencies
  set enabled = false, display_order = 999
  where organization_id = target_org and currency_code <> 'AFN';

  insert into public.organization_currencies (organization_id, currency_code, enabled, display_order)
  values (target_org, 'AFN', true, 0)
  on conflict (organization_id, currency_code) do update
  set enabled = true, display_order = 0;

  insert into public.organization_currencies (organization_id, currency_code, enabled, display_order)
  select target_org, selected.code, true, selected.ordinality::integer
  from unnest(normalized) with ordinality as selected(code, ordinality)
  on conflict (organization_id, currency_code) do update
  set enabled = true, display_order = excluded.display_order;

  return jsonb_build_object('currencies', normalized);
end;
$$;

revoke all on function public.set_organization_rate_currencies(uuid, text[]) from public, anon;
grant execute on function public.set_organization_rate_currencies(uuid, text[]) to authenticated;

alter table public.subscription_payment_requests
  add column if not exists receipt_storage_path text,
  add column if not exists receipt_file_name text,
  add column if not exists receipt_mime_type text,
  add column if not exists receipt_uploaded_at timestamptz;

create unique index if not exists subscription_payment_receipt_path_key
  on public.subscription_payment_requests (receipt_storage_path)
  where receipt_storage_path is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'subscription-payment-receipts',
  'subscription-payment-receipts',
  false,
  6291456,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy subscription_payment_receipt_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'subscription-payment-receipts'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id::text = (storage.foldername(name))[1]
      and membership.user_id = (select auth.uid())
      and membership.active
      and membership.role_code = 'owner'
  )
);

create policy subscription_payment_receipt_authorized_read
on storage.objects for select to authenticated
using (
  bucket_id = 'subscription-payment-receipts'
  and (
    (select public.is_platform_admin())
    or exists (
      select 1 from public.organization_memberships membership
      where membership.organization_id::text = (storage.foldername(name))[1]
        and membership.user_id = (select auth.uid())
        and membership.active
        and membership.role_code = 'owner'
    )
  )
);

create policy subscription_payment_receipt_owner_cleanup
on storage.objects for delete to authenticated
using (
  bucket_id = 'subscription-payment-receipts'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id::text = (storage.foldername(name))[1]
      and membership.user_id = (select auth.uid())
      and membership.active
      and membership.role_code = 'owner'
  )
  and not exists (
    select 1 from public.subscription_payment_requests request
    where request.receipt_storage_path = name
  )
);

create function public.create_subscription_payment_request_v2(
  target_org uuid,
  target_plan uuid,
  target_provider text,
  term_months_input smallint,
  payer_reference_input text,
  payer_note_input text,
  receipt_path_input text,
  receipt_file_name_input text,
  receipt_mime_type_input text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  request_id uuid;
  request_row public.subscription_payment_requests;
begin
  if receipt_mime_type_input not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Upload a PDF, JPG, or PNG payment receipt';
  end if;
  if length(trim(coalesce(receipt_file_name_input, ''))) < 1 then
    raise exception 'Payment receipt file name is required';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'subscription-payment-receipts'
      and object.name = receipt_path_input
      and object.owner_id = (select auth.uid())::text
      and (storage.foldername(object.name))[1] = target_org::text
      and (storage.foldername(object.name))[2] = (select auth.uid())::text
  ) then
    raise exception 'The uploaded payment receipt was not found';
  end if;

  result := public.create_subscription_payment_request(
    target_org,
    target_plan,
    target_provider,
    term_months_input,
    payer_reference_input,
    payer_note_input
  );
  request_id := (result->'request'->>'id')::uuid;

  update public.subscription_payment_requests
  set receipt_storage_path = receipt_path_input,
      receipt_file_name = left(trim(receipt_file_name_input), 180),
      receipt_mime_type = receipt_mime_type_input,
      receipt_uploaded_at = now()
  where id = request_id
  returning * into request_row;

  return jsonb_build_object(
    'request', to_jsonb(request_row),
    'checkout_url', result->'checkout_url'
  );
end;
$$;

revoke all on function public.create_subscription_payment_request(uuid, uuid, text, smallint, text, text) from public, anon, authenticated;
revoke all on function public.create_subscription_payment_request_v2(uuid, uuid, text, smallint, text, text, text, text, text) from public, anon;
grant execute on function public.create_subscription_payment_request_v2(uuid, uuid, text, smallint, text, text, text, text, text) to authenticated;

create or replace function public.set_subscription_plan_price(
  target_plan uuid,
  term_months_input smallint,
  price_afn_input numeric,
  active_input boolean
)
returns public.subscription_plan_prices
language plpgsql
security definer
set search_path = ''
as $$
declare result public.subscription_plan_prices;
begin
  perform public.require_platform_admin(true);
  if term_months_input not in (1, 3, 6, 12) then
    raise exception 'Choose a valid subscription duration';
  end if;
  if price_afn_input is null or price_afn_input <= 0 then
    raise exception 'Subscription price must be greater than zero';
  end if;
  if not exists (select 1 from public.subscription_plans where id = target_plan) then
    raise exception 'Subscription plan was not found';
  end if;

  insert into public.subscription_plan_prices (plan_id, term_months, price_afn, active)
  values (target_plan, term_months_input, price_afn_input, active_input)
  on conflict (plan_id, term_months) do update
  set price_afn = excluded.price_afn,
      active = excluded.active,
      updated_at = now()
  returning * into result;

  if term_months_input = 1 then
    update public.subscription_plans
    set price_afn = price_afn_input, updated_at = now()
    where id = target_plan;
  end if;

  insert into public.platform_audit_events (actor_user_id, event_type, metadata)
  values ((select auth.uid()), 'subscription_plan_price_changed', jsonb_build_object(
    'plan_id', target_plan,
    'term_months', term_months_input,
    'price_afn', price_afn_input,
    'active', active_input
  ));
  return result;
end;
$$;

revoke all on function public.set_subscription_plan_price(uuid, smallint, numeric, boolean) from public, anon;
grant execute on function public.set_subscription_plan_price(uuid, smallint, numeric, boolean) to authenticated;

create table public.document_templates (
  template_code text primary key,
  document_kind text not null check (document_kind in ('transaction_receipt', 'report')),
  title_en text not null,
  title_dari text not null,
  title_pashto text not null,
  body_en text not null,
  body_dari text not null,
  body_pashto text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.document_templates enable row level security;
create policy active_document_templates_read
on public.document_templates for select to authenticated
using (active);
revoke all on table public.document_templates from public, anon, authenticated;
grant select on table public.document_templates to authenticated;

insert into public.document_templates (
  template_code, document_kind, title_en, title_dari, title_pashto,
  body_en, body_dari, body_pashto
) values
('transaction.buy_fx', 'transaction_receipt', 'Currency purchase', 'خرید اسعار', 'د اسعارو پېرل',
 'The shop bought {received_amount} {received_currency} and paid {given_amount} {given_currency}.',
 'صرافی {received_amount} {received_currency} خرید و {given_amount} {given_currency} پرداخت کرد.',
 'صرافۍ {received_amount} {received_currency} وپېرل او {given_amount} {given_currency} یې ورکړل.'),
('transaction.sell_fx', 'transaction_receipt', 'Currency sale', 'فروش اسعار', 'د اسعارو پلورل',
 'The shop sold {given_amount} {given_currency} and received {received_amount} {received_currency}.',
 'صرافی {given_amount} {given_currency} فروخت و {received_amount} {received_currency} دریافت کرد.',
 'صرافۍ {given_amount} {given_currency} وپلورل او {received_amount} {received_currency} یې واخیستل.'),
('transaction.exchange_fx', 'transaction_receipt', 'Currency exchange', 'تبدیل اسعار', 'د اسعارو بدلول',
 'The shop exchanged {given_amount} {given_currency} for {received_amount} {received_currency}.',
 'صرافی {given_amount} {given_currency} را به {received_amount} {received_currency} تبدیل کرد.',
 'صرافۍ {given_amount} {given_currency} په {received_amount} {received_currency} بدل کړل.'),
('transaction.receive_money', 'transaction_receipt', 'Money received', 'پول دریافت شد', 'پیسې واخیستل شوې',
 'The shop received {amount} {currency} from {customer}.',
 'صرافی {amount} {currency} از {customer} دریافت کرد.',
 'صرافۍ له {customer} څخه {amount} {currency} واخیستل.'),
('transaction.pay_money', 'transaction_receipt', 'Money paid', 'پول پرداخت شد', 'پیسې ورکړل شوې',
 'The shop paid {amount} {currency} to {customer}.',
 'صرافی {amount} {currency} به {customer} پرداخت کرد.',
 'صرافۍ {customer} ته {amount} {currency} ورکړل.'),
('transaction.record_income', 'transaction_receipt', 'Income recorded', 'عاید ثبت شد', 'عاید ثبت شو',
 'The shop recorded income of {amount} {currency}.',
 'صرافی عاید {amount} {currency} را ثبت کرد.',
 'صرافۍ {amount} {currency} عاید ثبت کړ.'),
('transaction.record_expense', 'transaction_receipt', 'Expense recorded', 'مصرف ثبت شد', 'لګښت ثبت شو',
 'The shop recorded an expense of {amount} {currency}.',
 'صرافی مصرف {amount} {currency} را ثبت کرد.',
 'صرافۍ د {amount} {currency} لګښت ثبت کړ.'),
('transaction.owner_investment', 'transaction_receipt', 'Owner investment', 'افزایش سرمایه مالک', 'د مالک پانګه',
 'The owner added {amount} {currency} to the shop.',
 'مالک {amount} {currency} به سرمایه صرافی افزود.',
 'مالک صرافۍ ته {amount} {currency} پانګه ورزیاته کړه.'),
('transaction.owner_withdrawal', 'transaction_receipt', 'Owner withdrawal', 'برداشت مالک', 'د مالک ایستل',
 'The owner withdrew {amount} {currency} from the shop.',
 'مالک {amount} {currency} از صرافی برداشت کرد.',
 'مالک له صرافۍ څخه {amount} {currency} وایستل.'),
('transaction.transfer_cash', 'transaction_receipt', 'Money transfer', 'انتقال پول', 'د پیسو لېږد',
 'The shop moved {amount} {currency} from {source} to {destination}.',
 'صرافی {amount} {currency} را از {source} به {destination} انتقال داد.',
 'صرافۍ {amount} {currency} له {source} څخه {destination} ته ولېږدول.'),
('transaction.opening_balance', 'transaction_receipt', 'Opening money', 'پول آغاز کار', 'پیل پیسې',
 'The shop recorded opening money of {amount} {currency}.',
 'صرافی پول آغاز کار به مبلغ {amount} {currency} را ثبت کرد.',
 'صرافۍ د پیل {amount} {currency} پیسې ثبت کړې.'),
('transaction.default', 'transaction_receipt', 'Recorded transaction', 'معامله ثبت‌شده', 'ثبت شوې معامله',
 'This transaction records {amount} {currency} for {customer}.',
 'این معامله مبلغ {amount} {currency} را برای {customer} ثبت می‌کند.',
 'دا معامله د {customer} لپاره {amount} {currency} ثبتوي.'),
('report.daily_transactions', 'report', 'About this report', 'درباره این گزارش', 'د دې راپور په اړه',
 'This report lists the shop activity recorded for {period}. Only saved records matching {filters} are included.',
 'این گزارش کارهای ثبت‌شده صرافی برای {period} را نشان می‌دهد. تنها معلومات ذخیره‌شده مطابق {filters} شامل است.',
 'دا راپور د {period} لپاره د صرافۍ ثبت شوي کارونه ښيي. یوازې له {filters} سره برابر ساتل شوي معلومات پکې دي.'),
('report.filtered', 'report', 'About this report', 'درباره این گزارش', 'د دې راپور په اړه',
 'This {report_name} report covers {period}. It includes only saved records matching {filters}.',
 'گزارش {report_name} دوره {period} را نشان می‌دهد و تنها معلومات ذخیره‌شده مطابق {filters} را شامل می‌کند.',
 'د {report_name} راپور د {period} موده ښيي او یوازې له {filters} سره برابر ساتل شوي معلومات پکې شامل دي.')
on conflict (template_code) do update set
  document_kind = excluded.document_kind,
  title_en = excluded.title_en,
  title_dari = excluded.title_dari,
  title_pashto = excluded.title_pashto,
  body_en = excluded.body_en,
  body_dari = excluded.body_dari,
  body_pashto = excluded.body_pashto,
  active = true,
  updated_at = now();

alter function public.get_billing_portal(uuid) rename to get_billing_portal_before_payment_receipts;
revoke all on function public.get_billing_portal_before_payment_receipts(uuid) from public, anon, authenticated;

create function public.get_billing_portal(target_org uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare payload jsonb;
begin
  payload := public.get_billing_portal_before_payment_receipts(target_org);
  return jsonb_set(payload, '{requests}', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', request.id,
      'plan_id', request.plan_id,
      'provider_code', request.provider_code,
      'amount_afn', request.amount_afn,
      'term_months', request.term_months,
      'payer_reference', request.payer_reference,
      'payer_note', request.payer_note,
      'receipt_storage_path', request.receipt_storage_path,
      'receipt_file_name', request.receipt_file_name,
      'receipt_mime_type', request.receipt_mime_type,
      'receipt_uploaded_at', request.receipt_uploaded_at,
      'status', request.status,
      'requested_at', request.requested_at,
      'review_note', request.review_note
    ) order by request.requested_at desc)
    from public.subscription_payment_requests request
    where request.organization_id = target_org
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.get_billing_portal(uuid) from public, anon;
grant execute on function public.get_billing_portal(uuid) to authenticated;

alter function public.get_platform_admin_console() rename to get_platform_admin_console_before_payment_receipts;
revoke all on function public.get_platform_admin_console_before_payment_receipts() from public, anon, authenticated;

create function public.get_platform_admin_console()
returns jsonb
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare payload jsonb;
begin
  payload := public.get_platform_admin_console_before_payment_receipts();
  payload := jsonb_set(payload, '{plans}', coalesce((
    select jsonb_agg(
      to_jsonb(plan) || jsonb_build_object('term_prices', coalesce((
        select jsonb_agg(jsonb_build_object(
          'term_months', price.term_months,
          'price_afn', price.price_afn,
          'active', price.active
        ) order by price.term_months)
        from public.subscription_plan_prices price
        where price.plan_id = plan.id
      ), '[]'::jsonb))
      order by plan.sort_order, plan.id
    )
    from public.subscription_plans plan
  ), '[]'::jsonb));
  return jsonb_set(payload, '{payment_requests}', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', request.id,
      'organization_id', request.organization_id,
      'organization_name', organization.display_name,
      'business_reference', 'S-' || lpad(organization.business_number::text, 8, '0'),
      'plan_id', request.plan_id,
      'plan_name', plan.name_en,
      'provider_code', request.provider_code,
      'amount_afn', request.amount_afn,
      'term_months', request.term_months,
      'payer_reference', request.payer_reference,
      'payer_note', request.payer_note,
      'receipt_storage_path', request.receipt_storage_path,
      'receipt_file_name', request.receipt_file_name,
      'receipt_mime_type', request.receipt_mime_type,
      'receipt_uploaded_at', request.receipt_uploaded_at,
      'status', request.status,
      'requested_at', request.requested_at
    ) order by request.requested_at desc)
    from public.subscription_payment_requests request
    join public.organizations organization on organization.id = request.organization_id
    join public.subscription_plans plan on plan.id = request.plan_id
    where request.status in ('submitted', 'under_review', 'awaiting_payment')
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.get_platform_admin_console() from public, anon;
grant execute on function public.get_platform_admin_console() to authenticated;
