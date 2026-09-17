-- Fail closed on platform account suspension; an expired shop subscription may
-- still be renewed by its active owner. Existing customer data is not rewritten.

CREATE OR REPLACE FUNCTION public.get_billing_portal(target_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb;
begin
  if not public.is_org_owner(target_org) then
    raise exception 'Only the business owner can manage the plan';
  end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_billing_portal_before_payment_receipts(target_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  if not public.is_org_owner(target_org) then raise exception 'Only the business owner can manage the plan'; end if;
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
    'plans', coalesce((
      select jsonb_agg(
        to_jsonb(p) || jsonb_build_object('term_prices', coalesce((
          select jsonb_agg(jsonb_build_object('term_months', pp.term_months, 'price_afn', pp.price_afn) order by pp.term_months)
          from public.subscription_plan_prices pp where pp.plan_id = p.id and pp.active
        ), '[]'::jsonb))
        order by p.sort_order, p.id
      ) from public.subscription_plans p where p.status = 'published'
    ), '[]'::jsonb),
    'providers', coalesce((select jsonb_agg(to_jsonb(pc) order by pc.code) from public.payment_provider_configs pc where pc.state = 'live'), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'plan_id', r.plan_id, 'provider_code', r.provider_code,
        'amount_afn', r.amount_afn, 'term_months', r.term_months,
        'payer_reference', r.payer_reference, 'status', r.status,
        'requested_at', r.requested_at, 'review_note', r.review_note
      ) order by r.requested_at desc)
      from public.subscription_payment_requests r where r.organization_id = target_org
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_subscription_payment_request_v2(target_org uuid, target_plan uuid, target_provider text, term_months_input smallint, payer_reference_input text, payer_note_input text, receipt_path_input text, receipt_file_name_input text, receipt_mime_type_input text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb;
  request_id uuid;
  request_row public.subscription_payment_requests;
begin
  if not public.is_org_owner(target_org) then
    raise exception 'Only the business owner can request plan activation';
  end if;
  if receipt_mime_type_input is null or receipt_mime_type_input not in ('application/pdf', 'image/jpeg', 'image/png') then
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
$function$;

CREATE OR REPLACE FUNCTION public.create_subscription_payment_request(target_org uuid, target_plan uuid, target_provider text, term_months_input smallint, payer_reference_input text, payer_note_input text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare plan_row public.subscription_plans;
declare provider_row public.payment_provider_configs;
declare subscription_row public.organization_subscriptions;
declare request_row public.subscription_payment_requests;
declare selected_price numeric(18,2);
begin
  if not public.is_org_owner(target_org) then raise exception 'Only the business owner can request plan activation'; end if;
  if term_months_input not in (1, 3, 6, 12) then raise exception 'Choose a valid subscription term'; end if;
  select * into plan_row from public.subscription_plans where id = target_plan and status = 'published';
  select pp.price_afn into selected_price from public.subscription_plan_prices pp
    where pp.plan_id = target_plan and pp.term_months = term_months_input and pp.active;
  if plan_row.id is null or selected_price is null then raise exception 'This plan and term are not available for payment'; end if;
  select * into provider_row from public.payment_provider_configs where code = target_provider and state = 'live';
  if provider_row.code is null then raise exception 'This payment method is not active'; end if;
  if provider_row.provider_mode = 'manual_review' and length(trim(coalesce(payer_reference_input, ''))) < 3 then
    raise exception 'Receipt reference is required';
  end if;
  select * into subscription_row from public.organization_subscriptions where organization_id = target_org for update;
  if subscription_row.id is null then raise exception 'Subscription was not found'; end if;
  insert into public.subscription_payment_requests (
    organization_id, subscription_id, plan_id, provider_code, amount_afn, term_months,
    payer_reference, payer_note, status, requested_by
  ) values (
    target_org, subscription_row.id, plan_row.id, provider_row.code, selected_price, term_months_input,
    nullif(trim(payer_reference_input), ''), nullif(trim(payer_note_input), ''),
    case when provider_row.provider_mode = 'manual_review' then 'submitted' else 'awaiting_payment' end,
    (select auth.uid())
  ) returning * into request_row;
  update public.organization_subscriptions set status = 'pending_payment', updated_at = now()
    where id = subscription_row.id and status not in ('active', 'suspended');
  return jsonb_build_object('request', to_jsonb(request_row), 'checkout_url', provider_row.public_checkout_url);
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_subscription_plan_price(target_plan uuid, term_months_input smallint, price_afn_input numeric, active_input boolean)
 RETURNS subscription_plan_prices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result public.subscription_plan_prices;
begin
  perform public.require_platform_admin(true);
  if term_months_input not in (1, 3, 6, 12) then
    raise exception 'Choose a valid subscription duration';
  end if;
  if price_afn_input is null or price_afn_input <= 0
    or price_afn_input::text in ('NaN', 'Infinity', '-Infinity') then
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
$function$;

-- Keep the legacy implementation helpers private after replacement.
revoke all on function public.get_billing_portal_before_payment_receipts(uuid) from public, anon, authenticated;
revoke all on function public.create_subscription_payment_request(uuid,uuid,text,smallint,text,text) from public, anon, authenticated;
revoke all on function public.get_billing_portal(uuid) from public, anon;
revoke all on function public.create_subscription_payment_request_v2(uuid,uuid,text,smallint,text,text,text,text,text) from public, anon;
revoke all on function public.set_subscription_plan_price(uuid,smallint,numeric,boolean) from public, anon;
grant execute on function public.get_billing_portal(uuid) to authenticated;
grant execute on function public.create_subscription_payment_request_v2(uuid,uuid,text,smallint,text,text,text,text,text) to authenticated;
grant execute on function public.set_subscription_plan_price(uuid,smallint,numeric,boolean) to authenticated;

-- Preserve every path, role and linked-receipt restriction. Add suspension checks
-- to all three receipt operations, without granting file replacement.
-- Billing is owner-only, not a general shop-settings permission. The receipt
-- cleanup policy must still see linked requests when organization.manage is
-- denied; otherwise RLS can hide the reference and permit deletion of evidence.
alter policy organization_payment_owner_read on public.subscription_payment_requests
using ((select public.is_org_owner(organization_id)));

create schema if not exists private authorization postgres;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.can_delete_subscription_payment_receipt(target_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folders text[] := storage.foldername(target_path);
  target_org uuid;
begin
  if coalesce(array_length(folders, 1), 0) < 2
    or folders[2] <> (select auth.uid())::text
    or not public.is_platform_user_active() then
    return false;
  end if;
  begin
    target_org := folders[1]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if not public.is_org_owner(target_org) then return false; end if;
  return not exists (
    select 1 from public.subscription_payment_requests request
    where request.receipt_storage_path = target_path
  );
end;
$$;

revoke all on function private.can_delete_subscription_payment_receipt(text) from public, anon, authenticated;
grant execute on function private.can_delete_subscription_payment_receipt(text) to authenticated;

alter policy subscription_payment_receipt_owner_insert on storage.objects
with check (
  bucket_id = 'subscription-payment-receipts'
  and (select public.is_platform_user_active())
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (select public.is_org_owner(((storage.foldername(name))[1])::uuid))
);
alter policy subscription_payment_receipt_authorized_read on storage.objects
using (
  bucket_id = 'subscription-payment-receipts'
  and (select public.is_platform_user_active())
  and (
    (select public.is_platform_admin())
    or (select public.is_org_owner(((storage.foldername(name))[1])::uuid))
  )
);
alter policy subscription_payment_receipt_owner_cleanup on storage.objects
using (
  bucket_id = 'subscription-payment-receipts'
  and (select private.can_delete_subscription_payment_receipt(name))
);

-- PostgreSQL NaN passes ordinary positive-number comparisons. These constraints
-- also protect privileged imports or future APIs that do not call the setter.
alter table public.subscription_plans
  add constraint subscription_plans_price_finite
  check (price_afn::text not in ('NaN', 'Infinity', '-Infinity')) not valid;
alter table public.subscription_plan_prices
  add constraint subscription_plan_prices_price_finite
  check (price_afn::text not in ('NaN', 'Infinity', '-Infinity')) not valid;
alter table public.subscription_payment_requests
  add constraint subscription_payment_requests_amount_finite
  check (amount_afn::text not in ('NaN', 'Infinity', '-Infinity')) not valid;
alter table public.subscription_plans validate constraint subscription_plans_price_finite;
alter table public.subscription_plan_prices validate constraint subscription_plan_prices_price_finite;
alter table public.subscription_payment_requests validate constraint subscription_payment_requests_amount_finite;
