-- This read model contains licensing, all branches/cashboxes, feature controls,
-- support requests, and security history. Keep it at the same owner boundary as
-- every mutation exposed beside it.
do $$
declare
  function_definition text;
  corrected_definition text;
begin
  select pg_get_functiondef('public.get_organization_control_plane(uuid)'::regprocedure)
  into function_definition;
  corrected_definition := replace(
    function_definition,
    'if not public.is_org_member(target_org) then raise exception ''Organization membership required''; end if;',
    'if not public.is_org_owner(target_org) then raise exception ''Owner access required''; end if;'
  );
  if corrected_definition = function_definition then
    raise exception 'Expected organization control-plane membership guard was not found';
  end if;
  execute corrected_definition;
end;
$$;
