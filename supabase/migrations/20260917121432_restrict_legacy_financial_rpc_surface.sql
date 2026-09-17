-- Keep legacy financial implementations available only to trusted server-side
-- callers. Current browser clients use the guarded, versioned wrapper RPCs.

revoke all on function public.record_fx_trade(jsonb)
  from public, anon, authenticated;
revoke all on function public.request_fx_trade_approval(jsonb)
  from public, anon, authenticated;
revoke all on function public.record_hawala_incoming(jsonb)
  from public, anon, authenticated;
revoke all on function public.record_hawala_send(jsonb)
  from public, anon, authenticated;
revoke all on function public.record_hawala_send_v6(jsonb)
  from public, anon, authenticated;

grant execute on function public.record_fx_trade(jsonb) to service_role;
grant execute on function public.request_fx_trade_approval(jsonb) to service_role;
grant execute on function public.record_hawala_incoming(jsonb) to service_role;
grant execute on function public.record_hawala_send(jsonb) to service_role;
grant execute on function public.record_hawala_send_v6(jsonb) to service_role;
