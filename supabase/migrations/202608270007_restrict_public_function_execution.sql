-- PostgREST inherits PUBLIC function grants unless PUBLIC is explicitly revoked.
revoke execute on all functions in schema public from public;

-- Explicit client RPC allow-list.
grant execute on function public.create_business(jsonb) to authenticated;
grant execute on function public.record_fx_trade(jsonb) to authenticated;
grant execute on function public.record_operation(jsonb) to authenticated;
grant execute on function public.current_rate(uuid, text, text, uuid, uuid) to authenticated;
grant execute on function public.record_debt(jsonb) to authenticated;
grant execute on function public.settle_debt(jsonb) to authenticated;
grant execute on function public.submit_cashbox_close(uuid) to authenticated;
grant execute on function public.decide_approval(uuid, text, text) to authenticated;
grant execute on function public.record_compliance_alert(uuid, uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.get_owner_dashboard(uuid, date) to authenticated;
grant execute on function public.record_cashbox_close(jsonb) to authenticated;
grant execute on function public.approve_cashbox_close(uuid) to authenticated;
grant execute on function public.record_hawala_send(jsonb) to authenticated;
grant execute on function public.record_report_export(jsonb) to authenticated;
grant execute on function public.record_opening_balance(jsonb) to authenticated;
grant execute on function public.request_reversal(jsonb) to authenticated;
grant execute on function public.record_sensitive_document_access(uuid, uuid, text) to authenticated;
grant execute on function public.register_device(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.revoke_device(uuid, text) to authenticated;
grant execute on function public.set_membership_active(uuid, boolean, text) to authenticated;
grant execute on function public.accept_offline_command(uuid, text, uuid, text) to authenticated;
