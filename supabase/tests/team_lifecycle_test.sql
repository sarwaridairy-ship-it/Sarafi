-- Synthetic, rollback-only. Run in the isolated CI/local database, never hosted.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(35);

create function pg_temp.team_id(label text) returns uuid language sql immutable as $$
  select md5('SARAFI_TEAM_LIFECYCLE_' || label)::uuid;
$$;
create function pg_temp.team_signin(label text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', pg_temp.team_id(label), 'email', label || '@example.invalid', 'role', 'authenticated', 'aal', 'aal2'
  )::text, true);
end;
$$;

insert into auth.users (id, email)
  select pg_temp.team_id(label), label || '@example.invalid'
  from unnest(array['owner','admin','other','worker','tokenworker','joinworker','inactiveowner','newadmin']) label;
insert into public.organizations (id, legal_name, display_name)
  values (pg_temp.team_id('org'), 'SECURITY_TEST_TEAM', 'SECURITY_TEST_TEAM');
insert into public.branches (id, organization_id, name)
  values (pg_temp.team_id('branch-a'), pg_temp.team_id('org'), 'Synthetic branch A'),
    (pg_temp.team_id('branch-b'), pg_temp.team_id('org'), 'Synthetic branch B');
insert into public.cashboxes (id, organization_id, branch_id, name)
  values (pg_temp.team_id('cashbox-b'), pg_temp.team_id('org'), pg_temp.team_id('branch-b'), 'Synthetic cashbox B');
insert into public.organization_memberships (id, organization_id, user_id, role_code, active, mfa_required)
  select pg_temp.team_id(label || '-membership'), pg_temp.team_id('org'), pg_temp.team_id(label),
    case when label in ('owner','inactiveowner') then 'owner' when label in ('admin','other') then 'business_admin' else 'viewer' end,
    label in ('owner','admin','other'), false
  from unnest(array['owner','admin','other','worker','tokenworker','joinworker','inactiveowner']) label;
insert into public.membership_capability_overrides (membership_id, capability_code, allowed, granted_by, reason)
  select pg_temp.team_id(label || '-membership'), 'data.import', true, pg_temp.team_id('owner'), 'Old synthetic assignment'
  from unnest(array['worker','tokenworker','joinworker']) label;
insert into public.team_invitations (id, organization_id, email, display_name, role_code, token_hash, connection_code_hash,
  invited_by, expires_at, mfa_required, capability_overrides)
  select pg_temp.team_id(label || '-invite'), pg_temp.team_id('org'), label || '@example.invalid', 'Synthetic ' || label,
    'viewer', encode(extensions.digest(repeat(token_character,64),'sha256'),'hex'),
    encode(extensions.digest(connection_code,'sha256'),'hex'), pg_temp.team_id('owner'), now() + interval '1 hour', true,
    '[{"capability":"financial.report","allowed":false}]'::jsonb
  from (values ('worker','a','AB12CD34EF'), ('tokenworker','b','AB12CD34ED'), ('inactiveowner','c','AB12CD34EE')) f(label,token_character,connection_code);
insert into public.worker_join_requests (id, organization_id, requested_by, display_name, email)
  select pg_temp.team_id(label || '-request'), pg_temp.team_id('org'), pg_temp.team_id(label), 'Synthetic ' || label, label || '@example.invalid'
  from unnest(array['inactiveowner','admin','joinworker','newadmin']) label;
insert into public.platform_user_access (user_id, status, reason, changed_by)
  values (pg_temp.team_id('worker'), 'suspended', 'Synthetic suspension', pg_temp.team_id('owner')),
    (pg_temp.team_id('owner'), 'suspended', 'Synthetic suspension', pg_temp.team_id('admin'));

select pg_temp.team_signin('worker');
set local role authenticated;
select throws_ok($$select public.create_business('{"display_name":"Should not exist"}')$$, 'P0001', 'PLATFORM_ACCOUNT_INACTIVE', 'suspended account cannot create a business');
select throws_ok($$select public.accept_team_invitation(repeat('a',64))$$, 'P0001', 'PLATFORM_ACCOUNT_INACTIVE', 'suspended account cannot accept a link');
select throws_ok($$select public.accept_team_connection_code('AB12CD34EF')$$, 'P0001', 'PLATFORM_ACCOUNT_INACTIVE', 'suspended account cannot accept a code');
select throws_ok($$select public.request_business_access('ABCDEF123456','Synthetic worker')$$, 'P0001', 'PLATFORM_ACCOUNT_INACTIVE', 'suspended account cannot request another business');
select pg_temp.team_signin('owner');
select throws_ok($$select public.create_business_admin_invitation(pg_temp.team_id('org'),'new@example.invalid','Synthetic admin')$$, '42501', 'CAPABILITY_REQUIRED:team.invite', 'suspended owner cannot issue an administrator invitation');
select throws_ok($$select public.delegate_business_admin(pg_temp.team_id('worker-membership'),true,'Synthetic delegation')$$, '42501', 'CAPABILITY_REQUIRED:team.manage', 'suspended owner cannot delegate administrator access');
select pg_temp.team_signin('admin');
select throws_ok($$select public.set_membership_active(pg_temp.team_id('owner-membership'),false,'Synthetic denial')$$, 'P0001', 'Owner or own access cannot be changed here', 'business administrator cannot suspend the owner');
select throws_ok($$select public.set_membership_active(pg_temp.team_id('admin-membership'),false,'Synthetic denial')$$, 'P0001', 'Owner or own access cannot be changed here', 'business administrator cannot suspend themselves');
select throws_ok($$select public.set_membership_active(pg_temp.team_id('other-membership'),false,'Synthetic denial')$$, 'P0001', 'Only the owner can change Business Administrator access', 'business administrator cannot suspend a peer administrator');
select throws_ok($$select public.update_team_membership(pg_temp.team_id('other-membership'),'viewer','{}','{}',true,'Synthetic demotion')$$, 'P0001', 'Only the owner can change Business Administrator access', 'legacy role API cannot demote a peer administrator');
reset role;
update public.platform_user_access set status = 'active' where user_id in (pg_temp.team_id('owner'),pg_temp.team_id('worker'));
select pg_temp.team_signin('owner');
set local role authenticated;
select lives_ok($$select public.set_membership_active(pg_temp.team_id('other-membership'),false,'Synthetic authorized revocation')$$, 'owner may revoke a delegated administrator');
select lives_ok($$select public.set_membership_active(pg_temp.team_id('other-membership'),true,'Synthetic authorized reactivation')$$, 'owner may reactivate a delegated administrator');
select pg_temp.team_signin('inactiveowner');
select throws_ok($$select public.accept_team_connection_code('AB12CD34EE')$$, 'P0001', 'An owner membership cannot be replaced by an invitation', 'connection code cannot replace inactive ownership');
select throws_ok($$select public.accept_team_invitation(repeat('c',64))$$, 'P0001', 'An owner membership cannot be replaced by an invitation', 'invitation link also preserves ownership');
select pg_temp.team_signin('owner');
select throws_ok($$select public.review_worker_join_request(pg_temp.team_id('inactiveowner-request'),'approved','viewer','{}','{}','[]','{}',false,'Synthetic review')$$, 'P0001', 'An owner membership cannot be replaced by a join request', 'join review cannot replace inactive ownership');
select throws_ok($$select public.review_worker_join_request(pg_temp.team_id('admin-request'),'approved','viewer','{}','{}','[]','{}',false,'Synthetic review')$$, 'P0001', 'This account is already connected to the business', 'stale join request cannot replace an active membership');
reset role;
insert into public.platform_user_access (user_id,status,reason,changed_by)
  values (pg_temp.team_id('joinworker'),'suspended','Synthetic suspension',pg_temp.team_id('owner'));
set local role authenticated;
select throws_ok($$select public.review_worker_join_request(pg_temp.team_id('joinworker-request'),'approved','viewer','{}','{}','[]','{}',false,'Synthetic review')$$, 'P0001', 'PLATFORM_ACCOUNT_INACTIVE', 'join review cannot reactivate a suspended platform account');
reset role;
update public.platform_user_access set status='active' where user_id=pg_temp.team_id('joinworker');
set local role authenticated;
select throws_ok($$select public.review_worker_join_request(pg_temp.team_id('joinworker-request'),'approved','cashier',array[pg_temp.team_id('branch-a')],array[pg_temp.team_id('cashbox-b')],'[]','{}',false,'Synthetic review')$$, 'P0001', 'Every selected cashbox must belong to a selected branch', 'cashier admission rejects a mismatched cashbox branch');
select lives_ok($$select public.review_worker_join_request(pg_temp.team_id('joinworker-request'),'approved','viewer','{}','{}','[{"capability":"financial.report","allowed":false}]','{}',false,'Synthetic review')$$, 'authorized fresh join assignment succeeds');
reset role;
select is((select count(*) from public.membership_capability_overrides where membership_id=pg_temp.team_id('joinworker-membership') and capability_code='data.import'),0::bigint,'new join assignment does not inherit an old import grant');
select is((select allowed from public.membership_capability_overrides where membership_id=pg_temp.team_id('joinworker-membership') and capability_code='financial.report'),false,'new reviewed override is applied');
set local role authenticated;
select lives_ok($$select public.review_worker_join_request(pg_temp.team_id('newadmin-request'),'approved','business_admin','{}','{}','[]','{}',false,'Synthetic review')$$, 'owner may admit a new business administrator');
reset role;
select is((select mfa_required from public.organization_memberships where organization_id=pg_temp.team_id('org') and user_id=pg_temp.team_id('newadmin')),true,'administrator admission always requires MFA');
select pg_temp.team_signin('worker');
set local role authenticated;
select lives_ok($$select public.accept_team_connection_code('AB12CD34EF')$$, 'active invited worker can accept the connection code');
reset role;
select is((select count(*) from public.membership_capability_overrides where membership_id=pg_temp.team_id('worker-membership') and capability_code='data.import'),0::bigint,'accepted connection code does not revive old privileges');
select is((select allowed from public.membership_capability_overrides where membership_id=pg_temp.team_id('worker-membership') and capability_code='financial.report'),false,'accepted invitation applies its approved override bundle');
select pg_temp.team_signin('tokenworker');
set local role authenticated;
select lives_ok($$select public.accept_team_invitation(repeat('b',64))$$, 'active invited worker can accept a token');
reset role;
select is((select count(*) from public.membership_capability_overrides where membership_id=pg_temp.team_id('tokenworker-membership') and capability_code='data.import'),0::bigint,'accepted token does not revive old privileges');
select is((select count(*) from public.organizations where display_name='Should not exist'),0::bigint,'denied onboarding leaves no organization behind');
select ok(not has_function_privilege('authenticated','public.require_active_device(uuid,uuid)','execute') and not has_function_privilege('anon','public.require_active_device(uuid,uuid)','execute'),'device helper is not a client RPC');
select ok(not has_function_privilege('authenticated','public.require_aal2()','execute') and not has_function_privilege('anon','public.require_aal2()','execute'),'MFA helper is not a client RPC');
select ok(not has_function_privilege('authenticated','public.require_capability(uuid,text,jsonb)','execute') and not has_function_privilege('anon','public.require_capability(uuid,text,jsonb)','execute'),'capability helper is not a client RPC');
select ok(not has_function_privilege('authenticated','public.require_sanctions_provider(uuid)','execute') and not has_function_privilege('anon','public.require_sanctions_provider(uuid)','execute'),'provider helper is not a client RPC');
select ok(not has_function_privilege('authenticated','public.user_can_use_money_account(uuid,uuid)','execute') and not has_function_privilege('anon','public.user_can_use_money_account(uuid,uuid)','execute'),'account-use helper is not a client RPC');
insert into public.membership_capability_overrides (membership_id,capability_code,allowed,granted_by,reason)
  values (pg_temp.team_id('owner-membership'),'team.invite',false,pg_temp.team_id('owner'),'Synthetic explicit invitation denial');
select pg_temp.team_signin('owner');
set local role authenticated;
select throws_ok($$select public.create_team_invitation(pg_temp.team_id('org'),'legacy@example.invalid','Synthetic worker','viewer','{}','{}',false)$$,'42501','CAPABILITY_REQUIRED:team.invite','legacy invitation API respects an explicit invitation denial');
reset role;
select * from finish();
rollback;
