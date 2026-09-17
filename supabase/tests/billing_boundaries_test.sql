-- Synthetic metadata only, rollback-only, isolated CI/local database only.
-- Never run against a hosted project; no receipt bytes or real payments exist.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
-- Mimic the Storage API's deletion context for isolated metadata-only fixtures.
-- This does not bypass RLS; no hosted SQL or actual file object is touched.
set local storage.allow_delete_query = 'true';
select plan(43);

create function pg_temp.billing_id(label text) returns uuid language sql immutable as $$
  select md5('SARAFI_BILLING_BOUNDARY_' || label)::uuid;
$$;
create function pg_temp.billing_signin(label text, assurance text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', pg_temp.billing_id(label), 'email', label || '@example.invalid', 'role', 'authenticated', 'aal', assurance
  )::text, true);
end;
$$;
create function pg_temp.receipt_path(org_label text, user_label text, filename text) returns text language sql immutable as $$
  select pg_temp.billing_id(org_label)::text || '/' || pg_temp.billing_id(user_label)::text || '/' || filename;
$$;

insert into auth.users (id,email)
  select pg_temp.billing_id(label), label || '@example.invalid'
  from unnest(array['owner','foreign-owner','manager','platform-admin']) label;
insert into public.organizations (id,legal_name,display_name)
  select pg_temp.billing_id(label), 'SECURITY_TEST_BILLING_' || label, 'SECURITY_TEST_BILLING_' || label
  from unnest(array['org','foreign-org']) label;
insert into public.organization_memberships (id,organization_id,user_id,role_code,active,mfa_required)
  select pg_temp.billing_id(label || '-membership'), pg_temp.billing_id(org_label), pg_temp.billing_id(label), role_code, true, false
  from (values ('owner','org','owner'),('foreign-owner','foreign-org','owner'),('manager','org','business_admin')) f(label,org_label,role_code);
insert into public.platform_admins (user_id,display_name)
  values (pg_temp.billing_id('platform-admin'),'Synthetic billing administrator');
insert into public.subscription_plans (id,code,name_en,name_dari,name_pashto,price_afn,employee_limit,branch_limit,status)
  values (pg_temp.billing_id('plan'),'security-test-billing','Synthetic plan','Synthetic plan','Synthetic plan',100,5,1,'published');
insert into public.subscription_plan_prices (plan_id,term_months,price_afn)
  values (pg_temp.billing_id('plan'),1,100);
insert into public.payment_provider_configs (code,name_en,name_dari,name_pashto,provider_mode,state)
  values ('security-test-manual','Synthetic manual','Synthetic manual','Synthetic manual','manual_review','live');
-- Organization creation already provisions a subscription through its trigger.
update public.organization_subscriptions
  set plan_id=pg_temp.billing_id('plan'), status='suspended', suspension_reason='Synthetic expired shop subscription'
  where organization_id=pg_temp.billing_id('org');
insert into storage.objects (id,bucket_id,name,owner_id)
  select pg_temp.billing_id(label),'subscription-payment-receipts',pg_temp.receipt_path(org_label,user_label,label || '.pdf'),pg_temp.billing_id(user_label)::text
  from (values ('receipt','org','owner'),('unlinked','org','owner'),('foreign-receipt','foreign-org','foreign-owner')) f(label,org_label,user_label);

select pg_temp.billing_signin('owner');
set local role authenticated;
select lives_ok($$select public.get_billing_portal(pg_temp.billing_id('org'))$$,'active owner can renew a shop with a suspended subscription');
select throws_ok($$select public.get_billing_portal(pg_temp.billing_id('foreign-org'))$$,'P0001','Only the business owner can manage the plan','owner cannot read another shop billing');
select is((select count(*) from storage.objects where id=pg_temp.billing_id('receipt')),1::bigint,'active owner can read own receipt');
select is((select count(*) from storage.objects where id=pg_temp.billing_id('foreign-receipt')),0::bigint,'foreign receipt stays private');
select lives_ok($$insert into storage.objects (bucket_id,name,owner_id) values ('subscription-payment-receipts',pg_temp.receipt_path('org','owner','upload.pdf'),pg_temp.billing_id('owner')::text)$$,'owner may upload to own folder');
select throws_ok($$insert into storage.objects (bucket_id,name,owner_id) values ('subscription-payment-receipts',pg_temp.receipt_path('org','foreign-owner','bad.pdf'),pg_temp.billing_id('owner')::text)$$,'42501',null,'owner cannot upload to another user folder');
select throws_ok($$insert into storage.objects (bucket_id,name,owner_id) values ('subscription-payment-receipts',pg_temp.receipt_path('foreign-org','owner','bad.pdf'),pg_temp.billing_id('owner')::text)$$,'42501',null,'owner cannot upload to another shop');
reset role;

insert into public.platform_user_access (user_id,status,reason,changed_by)
  values (pg_temp.billing_id('owner'),'suspended','Synthetic platform suspension',pg_temp.billing_id('platform-admin'));
set local role authenticated;
select throws_ok($$select public.get_billing_portal(pg_temp.billing_id('org'))$$,'P0001','Only the business owner can manage the plan','platform suspension denies billing portal');
select throws_ok($$select public.create_subscription_payment_request_v2(pg_temp.billing_id('org'),pg_temp.billing_id('plan'),'security-test-manual',1::smallint,'TEST-RECEIPT',null,pg_temp.receipt_path('org','owner','receipt.pdf'),'receipt.pdf','application/pdf')$$,'P0001','Only the business owner can request plan activation','platform suspension denies payment submission before receipt lookup');
select is((select count(*) from storage.objects where id=pg_temp.billing_id('receipt')),0::bigint,'suspended owner cannot read private receipt');
select throws_ok($$insert into storage.objects (bucket_id,name,owner_id) values ('subscription-payment-receipts',pg_temp.receipt_path('org','owner','suspended.pdf'),pg_temp.billing_id('owner')::text)$$,'42501',null,'suspended owner cannot upload');
select is((with removed as (delete from storage.objects where id=pg_temp.billing_id('unlinked') returning id) select count(*) from removed),0::bigint,'suspended owner cannot delete even unlinked receipts');
reset role;
select is((select count(*) from public.subscription_payment_requests where organization_id=pg_temp.billing_id('org')),0::bigint,'denied submission creates no payment request');
delete from public.platform_user_access where user_id=pg_temp.billing_id('owner');

-- Denial of settings permissions must not hide a linked billing request from
-- the Storage cleanup predicate. Billing renewal remains an owner-only API.
insert into public.membership_capability_overrides (membership_id,capability_code,allowed,granted_by,reason)
  values (pg_temp.billing_id('owner-membership'),'organization.manage',false,pg_temp.billing_id('owner'),'Synthetic settings denial');
set local role authenticated;
select is((public.create_subscription_payment_request_v2(pg_temp.billing_id('org'),pg_temp.billing_id('plan'),'security-test-manual',1::smallint,'TEST-RECEIPT',null,pg_temp.receipt_path('org','owner','receipt.pdf'),'receipt.pdf','application/pdf')->'request'->>'amount_afn')::numeric,100::numeric,'active owner submission uses server price despite shop subscription suspension');
select is(jsonb_array_length(public.get_billing_portal(pg_temp.billing_id('org'))->'requests'),1,'owner sees linked request despite a shop-settings capability denial');
select is((with removed as (delete from storage.objects where id=pg_temp.billing_id('receipt') returning id) select count(*) from removed),0::bigint,'linked receipt cannot be deleted when settings permission is denied');
select is((with removed as (delete from storage.objects where id=pg_temp.billing_id('unlinked') returning id) select count(*) from removed),1::bigint,'active owner may clean up own unlinked receipt');
select throws_ok($$select public.create_subscription_payment_request_v2(pg_temp.billing_id('org'),pg_temp.billing_id('plan'),'security-test-manual',1::smallint,'TEST-RECEIPT',null,pg_temp.receipt_path('org','owner','upload.pdf'),'upload.pdf',null)$$,'P0001','Upload a PDF, JPG, or PNG payment receipt','null MIME type is rejected');
reset role;
select is((select status from public.organization_subscriptions where organization_id=pg_temp.billing_id('org')),'suspended','submitting a receipt does not activate a suspended subscription');

select pg_temp.billing_signin('manager');
set local role authenticated;
select throws_ok($$select public.get_billing_portal(pg_temp.billing_id('org'))$$,'P0001','Only the business owner can manage the plan','business administrator is not the billing owner');
select throws_ok($$select public.create_subscription_payment_request_v2(pg_temp.billing_id('org'),pg_temp.billing_id('plan'),'security-test-manual',1::smallint,'TEST-RECEIPT',null,null,null,null)$$,'P0001','Only the business owner can request plan activation','business administrator cannot submit an owner payment');
select throws_ok($$select count(*) from public.subscription_payment_requests where organization_id=pg_temp.billing_id('org')$$,'42501','permission denied for table subscription_payment_requests','settings permission does not expose the private payment table to staff');
select is((select count(*) from storage.objects where id=pg_temp.billing_id('receipt')),0::bigint,'staff cannot read owner payment receipts');
select throws_ok($$select public.set_subscription_plan_price(pg_temp.billing_id('plan'),1::smallint,200,true)$$,'P0001','Platform administrator access required','shop administrator cannot change platform prices');
reset role;

select pg_temp.billing_signin('platform-admin','aal1');
set local role authenticated;
select is((select count(*) from storage.objects where id in (pg_temp.billing_id('receipt'),pg_temp.billing_id('foreign-receipt'))),2::bigint,'active platform administrator can review both submitted receipt files');
select throws_ok($$select public.set_subscription_plan_price(pg_temp.billing_id('plan'),1::smallint,200,true)$$,'P0001','AAL2 is required for this administrator action','platform price change requires MFA');
reset role;
select pg_temp.billing_signin('platform-admin');
set local role authenticated;
select lives_ok($$select public.set_subscription_plan_price(pg_temp.billing_id('plan'),1::smallint,200,true)$$,'MFA verified platform administrator can set a finite price');
select throws_ok($$select public.set_subscription_plan_price(pg_temp.billing_id('plan'),1::smallint,'NaN'::numeric,true)$$,'P0001','Subscription price must be greater than zero','price setter rejects NaN');
select throws_ok($$select public.set_subscription_plan_price(pg_temp.billing_id('plan'),1::smallint,'Infinity'::numeric,true)$$,'P0001','Subscription price must be greater than zero','price setter rejects infinity');
select throws_ok($$select public.set_subscription_plan_price(pg_temp.billing_id('plan'),1::smallint,'-Infinity'::numeric,true)$$,'P0001','Subscription price must be greater than zero','price setter rejects negative infinity');
select throws_ok($$select public.set_subscription_plan_price(pg_temp.billing_id('plan'),1::smallint,null,true)$$,'P0001','Subscription price must be greater than zero','price setter rejects null');
select throws_ok($$select public.set_subscription_plan_price(pg_temp.billing_id('plan'),1::smallint,0,true)$$,'P0001','Subscription price must be greater than zero','price setter rejects zero');
select throws_ok($$select public.set_subscription_plan_price(pg_temp.billing_id('plan'),1::smallint,-1,true)$$,'P0001','Subscription price must be greater than zero','price setter rejects negative prices');
reset role;
select is((select price_afn from public.subscription_plans where id=pg_temp.billing_id('plan')),200::numeric,'one-month plan display uses the valid price');
select is((select amount_afn from public.subscription_payment_requests where organization_id=pg_temp.billing_id('org')),100::numeric,'later pricing updates do not rewrite existing submitted amounts');
select throws_ok($$update public.subscription_plans set price_afn='NaN'::numeric where id=pg_temp.billing_id('plan')$$,'23514',null,'base plan constraint rejects NaN even for a privileged write');
select throws_ok($$update public.subscription_plan_prices set price_afn='NaN'::numeric where plan_id=pg_temp.billing_id('plan')$$,'23514',null,'term price constraint rejects NaN even for a privileged write');
select throws_ok($$update public.subscription_payment_requests set amount_afn='NaN'::numeric where organization_id=pg_temp.billing_id('org')$$,'23514',null,'payment amount constraint rejects NaN even for a privileged write');
insert into public.platform_user_access (user_id,status,reason,changed_by)
  values (pg_temp.billing_id('platform-admin'),'suspended','Synthetic platform suspension',pg_temp.billing_id('owner'));
set local role authenticated;
select is((select count(*) from storage.objects where id=pg_temp.billing_id('receipt')),0::bigint,'suspended platform administrator cannot read receipts');
select throws_ok($$select public.set_subscription_plan_price(pg_temp.billing_id('plan'),1::smallint,300,true)$$,'P0001','Platform administrator access required','suspended administrator cannot change prices even with MFA');
reset role;
select ok(not has_function_privilege('authenticated','public.get_billing_portal_before_payment_receipts(uuid)','execute'),'legacy portal implementation is not exposed as a client RPC');
select ok(not has_function_privilege('authenticated','public.create_subscription_payment_request(uuid,uuid,text,smallint,text,text)','execute'),'receiptless payment implementation is not exposed as a client RPC');
select is((select count(*) from public.platform_audit_events where actor_user_id=pg_temp.billing_id('platform-admin') and event_type='subscription_plan_price_changed'),1::bigint,'only successful price mutation is audited');
select * from finish();
rollback;
