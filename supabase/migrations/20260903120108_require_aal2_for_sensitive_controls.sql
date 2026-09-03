-- Feature entitlement changes and regulatory-report decisions are sensitive
-- control actions. Require a verified second factor before they are recorded.
do $$
declare
  function_definition text;
  corrected_definition text;
begin
  select pg_get_functiondef('public.set_organization_feature_state(uuid,text,boolean)'::regprocedure) into function_definition;
  corrected_definition := replace(
    function_definition,
    'if not public.is_org_owner(target_org) and not public.is_platform_admin() then raise exception ''Feature management access required''; end if;',
    'if not public.is_org_owner(target_org) and not public.is_platform_admin() then raise exception ''Feature management access required''; end if;' || chr(10) || '  perform public.require_aal2();'
  );
  if corrected_definition = function_definition then raise exception 'Feature-state guard was not found'; end if;
  execute corrected_definition;

  select pg_get_functiondef('public.decide_compliance_alert(uuid,text,text)'::regprocedure) into function_definition;
  corrected_definition := replace(
    function_definition,
    'if length(trim(coalesce(reason_input, ''''))) < 2 then raise exception ''Review reason is required''; end if;',
    'if length(trim(coalesce(reason_input, ''''))) < 2 then raise exception ''Review reason is required''; end if;' || chr(10) || '  if status_input = ''reported'' then perform public.require_aal2(); end if;'
  );
  if corrected_definition = function_definition then raise exception 'Compliance-alert reason guard was not found'; end if;
  execute corrected_definition;

  select pg_get_functiondef('public.save_compliance_case(jsonb)'::regprocedure) into function_definition;
  corrected_definition := replace(
    function_definition,
    'if status_value = ''submitted'' and length(trim(coalesce(command->>''submitted_reference'', ''''))) < 2 then raise exception ''Submission reference is required''; end if;',
    'if status_value = ''submitted'' and length(trim(coalesce(command->>''submitted_reference'', ''''))) < 2 then raise exception ''Submission reference is required''; end if;' || chr(10) || '  if status_value = ''submitted'' then perform public.require_aal2(); end if;'
  );
  if corrected_definition = function_definition then raise exception 'Compliance-case submission guard was not found'; end if;
  execute corrected_definition;
end;
$$;
