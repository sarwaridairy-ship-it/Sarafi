-- Internal ledger helpers are called only by trusted database functions and
-- triggers. They are not client RPC endpoints. SECURITY DEFINER would bypass
-- tenant RLS if a signed-in user could call either helper directly.

revoke execute on function public.ensure_money_ledger_account(uuid, uuid, text)
  from public, anon, authenticated;

revoke execute on function public.require_money_account_balance(uuid, uuid, text, numeric)
  from public, anon, authenticated;

-- New public functions must be exposed deliberately in their own migration.
-- Application RPCs already use explicit grants after their definitions.
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;
