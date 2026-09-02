-- Remove anonymous RPC execution and harden trigger-only SECURITY DEFINER functions.
revoke execute on all functions in schema public from anon;

revoke execute on function public.assert_posted_entry_balanced() from public, authenticated;
revoke execute on function public.prevent_posted_mutation() from public, authenticated;
revoke execute on function public.prevent_journal_line_mutation() from public, authenticated;
revoke execute on function public.prevent_audit_mutation() from public, authenticated;
revoke execute on function public.assert_financial_tenant_consistency() from public, authenticated;
-- Some early hosted databases briefly had this helper, but clean installs never
-- created it. Keep the historical hardening idempotent for both database shapes.
do $$
begin
  if to_regprocedure('public.materialize_debt_settlement()') is not null then
    execute 'revoke execute on function public.materialize_debt_settlement() from public, authenticated';
  end if;
end;
$$;
revoke execute on function public.materialize_fx_trade_fee() from public, authenticated;
revoke execute on function public.materialize_posted_operation() from public, authenticated;
revoke execute on function public.materialize_posted_operation_v2() from public, authenticated;
revoke execute on function public.materialize_posted_receipt() from public, authenticated;
revoke execute on function public.materialize_posted_receipt_v2() from public, authenticated;

alter function public.assert_posted_entry_balanced() set search_path = '';
alter function public.prevent_posted_mutation() set search_path = '';
alter function public.prevent_journal_line_mutation() set search_path = '';
alter function public.prevent_audit_mutation() set search_path = '';
alter function public.assert_financial_tenant_consistency() set search_path = '';
