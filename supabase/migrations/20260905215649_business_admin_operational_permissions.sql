-- Bring legacy operational RPC role checks into the delegated administrator model.
-- Owner-only ownership, billing, and account-master functions are intentionally untouched.
do $admin$
declare function_name text;
declare function_definition text;
begin
  foreach function_name in array array[
    'get_team_control_plane',
    'record_fx_trade',
    'record_operation',
    'record_debt',
    'settle_debt',
    'record_hawala_send',
    'record_opening_balance',
    'create_money_account',
    'set_organization_currency',
    'set_exchange_rate',
    'decide_approval',
    'approve_cashbox_close',
    'reject_cashbox_close',
    'transition_hawala_status',
    'record_hawala_incoming',
    'pay_hawala_beneficiary',
    'settle_hawala_partner'
  ] loop
    for function_definition in
      select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = function_name
    loop
      function_definition := replace(function_definition, $$role_code in ('owner', 'manager')$$, $$role_code in ('owner', 'business_admin', 'manager')$$);
      function_definition := replace(function_definition, $$role_value not in ('owner', 'manager')$$, $$role_value not in ('owner', 'business_admin', 'manager')$$);
      function_definition := replace(function_definition, $$role_value not in ('owner', 'manager', 'cashier')$$, $$role_value not in ('owner', 'business_admin', 'manager', 'cashier')$$);
      function_definition := replace(function_definition, $$role_value not in ('owner', 'manager', 'accountant', 'cashier')$$, $$role_value not in ('owner', 'business_admin', 'manager', 'accountant', 'cashier')$$);
      function_definition := replace(function_definition, $$role_code in ('owner', 'manager', 'accountant')$$, $$role_code in ('owner', 'business_admin', 'manager', 'accountant')$$);
      function_definition := replace(function_definition, $$role_code = 'owner'$$, $$role_code in ('owner', 'business_admin')$$);
      execute function_definition;
    end loop;
  end loop;
end;
$admin$;
