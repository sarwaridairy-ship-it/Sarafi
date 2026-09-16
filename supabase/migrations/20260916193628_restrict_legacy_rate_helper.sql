-- The application uses get_current_rates_v6, which checks branch capability.
-- This unused legacy SECURITY DEFINER helper has no tenant guard and must not
-- be exposed as a client RPC. Keep the function for privileged internal callers.
revoke all on function public.current_rate(uuid, text, text, uuid, uuid)
  from public, anon, authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.current_rate(uuid,text,text,uuid,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.current_rate(uuid,text,text,uuid,uuid)', 'EXECUTE') then
    raise exception 'Legacy rate helper must not be executable by client roles';
  end if;
end;
$$;
