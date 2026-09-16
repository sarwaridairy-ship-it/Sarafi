-- Run only in the isolated CI/local database, never against a hosted project.
-- Synthetic identities and every write below disappear at ROLLBACK.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(25);

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'authorization-a@example.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'authorization-b@example.invalid');
insert into public.organizations (id, legal_name, display_name) values
  ('20000000-0000-4000-8000-000000000001', 'SECURITY_TEST_AUTH_A', 'SECURITY_TEST_AUTH_A'),
  ('20000000-0000-4000-8000-000000000002', 'SECURITY_TEST_AUTH_B', 'SECURITY_TEST_AUTH_B');
insert into public.branches (id, organization_id, name) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'SECURITY_TEST_BRANCH_A'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'SECURITY_TEST_BRANCH_B');
insert into public.organization_memberships (id, organization_id, user_id, role_code, active, mfa_required) values
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner', true, false);
insert into public.platform_admins (user_id, display_name) values
  ('10000000-0000-4000-8000-000000000001', 'SECURITY_TEST_ADMIN');
insert into public.support_access_grants (organization_id, support_user_id, approved_by, reason, scope, expires_at) values
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Synthetic grant', array['diagnostics'], now() + interval '1 hour');
insert into public.compliance_rule_sets (id, organization_id, version, effective_from, created_by) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'synthetic', now(), '10000000-0000-4000-8000-000000000001');

create function pg_temp.import_command(key_input text,
  branch_input uuid default '30000000-0000-4000-8000-000000000001',
  org_input uuid default '20000000-0000-4000-8000-000000000001') returns jsonb language sql as $$
  select jsonb_build_object('organization_id', org_input, 'branch_id', branch_input,
    'import_key', key_input, 'kind', 'counterparties', 'rows', jsonb_build_array(
      jsonb_build_object('display_name', 'Synthetic ' || key_input, 'counterparty_type', 'customer')));
$$;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select ok(public.is_platform_admin(), 'active administrator is recognized');
reset role;
insert into public.platform_user_access (user_id, status, reason, changed_by) values
  ('10000000-0000-4000-8000-000000000001', 'suspended', 'Synthetic suspension', '10000000-0000-4000-8000-000000000002');
set local role authenticated;
select ok(not public.is_platform_admin(), 'suspension overrides administrator membership');
select ok(not public.has_active_support_access('20000000-0000-4000-8000-000000000002', 'diagnostics'), 'suspended support user cannot reuse a grant');
select throws_ok($$select public.get_platform_operations()$$, 'P0001', 'Platform administrator access required', 'suspended admin cannot read platform operations');
select throws_ok($$select public.commit_import(pg_temp.import_command('suspended'))$$, 'P0001', 'PLATFORM_ACCOUNT_INACTIVE', 'suspended owner cannot import');
reset role;
update public.platform_user_access set status = 'active' where user_id = '10000000-0000-4000-8000-000000000001';
update public.organization_memberships set role_code = 'manager' where id = '60000000-0000-4000-8000-000000000001';
set local role authenticated;
select ok(not public.has_capability('20000000-0000-4000-8000-000000000001', 'data.import', '{}'), 'manager has no default import capability');
select throws_ok($$select public.commit_import(pg_temp.import_command('manager'))$$, '42501', 'CAPABILITY_REQUIRED:data.import', 'legacy manager role does not bypass import capability');
reset role;
update public.organization_memberships set role_code = 'accountant' where id = '60000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.commit_import(pg_temp.import_command('accountant'))$$, '42501', 'CAPABILITY_REQUIRED:data.import', 'accountant cannot bypass import capability');
reset role;
update public.organization_memberships set role_code = 'business_admin' where id = '60000000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$select public.commit_import(pg_temp.import_command('authorized'))$$, 'capable business administrator can import');
reset role;
select is((select count(*) from public.counterparties where organization_id = '20000000-0000-4000-8000-000000000001' and branch_id = '30000000-0000-4000-8000-000000000001'), 1::bigint, 'imported customer is bound to its branch');
set local role authenticated;
select is(public.commit_import(pg_temp.import_command('authorized'))->>'status', 'already_committed', 'authorized import replay is idempotent');
select throws_ok($$select public.commit_import(pg_temp.import_command('foreign-org', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002'))$$, '42501', 'CAPABILITY_REQUIRED:data.import', 'another organization cannot be imported into');
select throws_ok($$select public.commit_import(pg_temp.import_command('foreign-branch', '30000000-0000-4000-8000-000000000002'))$$, 'P0001', 'CAPABILITY_REQUIRED:data.import.branch', 'foreign branch is rejected');
select throws_ok($$select public.commit_import(pg_temp.import_command('no-branch', null))$$, 'P0001', 'CAPABILITY_REQUIRED:data.import.branch', 'unscoped customer import is rejected');
reset role;
update public.branches set active = false where id = '30000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.commit_import(pg_temp.import_command('inactive-branch'))$$, 'P0001', 'CAPABILITY_REQUIRED:data.import.branch', 'inactive branch cannot receive imports');
reset role;
update public.branches set active = true where id = '30000000-0000-4000-8000-000000000001';
update public.organization_memberships set role_code = 'owner' where id = '60000000-0000-4000-8000-000000000001';
insert into public.membership_capability_overrides (membership_id, capability_code, allowed, granted_by, reason)
  values ('60000000-0000-4000-8000-000000000001', 'data.import', false, '10000000-0000-4000-8000-000000000002', 'Synthetic denial');
set local role authenticated;
select throws_ok($$select public.commit_import(pg_temp.import_command('override-denied'))$$, '42501', 'CAPABILITY_REQUIRED:data.import', 'explicit import denial applies to owners');
reset role;
delete from public.membership_capability_overrides where membership_id = '60000000-0000-4000-8000-000000000001';
insert into public.membership_capability_overrides (membership_id, capability_code, allowed, granted_by, reason)
  values ('60000000-0000-4000-8000-000000000001', 'customers.manage', false, '10000000-0000-4000-8000-000000000002', 'Synthetic denial');
set local role authenticated;
select throws_ok($$select public.commit_import(pg_temp.import_command('customer-denied'))$$, 'P0001', 'CAPABILITY_REQUIRED:customers.manage', 'import does not bypass customer creation authorization');
reset role;
delete from public.membership_capability_overrides where membership_id = '60000000-0000-4000-8000-000000000001';
update public.organization_memberships set mfa_required = true where id = '60000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.commit_import(pg_temp.import_command('mfa-denied'))$$, '42501', 'CAPABILITY_REQUIRED:data.import', 'MFA-required member cannot import at AAL1');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
select lives_ok($$select public.commit_import(pg_temp.import_command('mfa-allowed'))$$, 'AAL2 restores authorized import access');
select ok(not has_function_privilege('anon', 'public.current_rate(uuid,text,text,uuid,uuid)', 'EXECUTE'), 'anonymous legacy rate helper remains revoked');
select ok(not has_function_privilege('authenticated', 'public.current_rate(uuid,text,text,uuid,uuid)', 'EXECUTE'), 'authenticated legacy rate helper remains revoked');
select throws_ok($$select public.record_compliance_alert('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','kyc_required','{}')$$, 'P0001', 'Event tenant mismatch', 'unowned event cannot be linked to compliance alert');
select lives_ok($$select public.record_compliance_alert('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',null,'kyc_required','{}')$$, 'authorized non-event alert still works');
select throws_ok($$select public.record_compliance_alert('20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001',null,'kyc_required','{}')$$, 'P0001', 'Compliance permission required', 'alert cannot be created in another organization');
reset role;
select is((select count(*) from public.import_batches where organization_id = '20000000-0000-4000-8000-000000000001'), 2::bigint, 'failed imports leave no committed batch');
select * from finish();
rollback;
