-- Close legacy suspension/capability bypasses without changing existing records.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.is_platform_user_active() and exists (
    select 1 from public.platform_admins
    where user_id = (select auth.uid()) and active
  );
$function$
;

CREATE OR REPLACE FUNCTION public.commit_import(command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  org_id uuid := (command->>'organization_id')::uuid;
  actor_id uuid := (select auth.uid());
  branch_id_value uuid;
  import_key_value text := nullif(trim(command->>'import_key'), '');
  kind text := lower(command->>'kind');
  rows jsonb := coalesce(command->'rows', '[]'::jsonb);
  existing public.import_batches;
  batch_id uuid;
  row_item jsonb;
  row_number integer := 0;
  created_count integer := 0;
  counterparty_id uuid;
begin
  if actor_id is null or not public.is_platform_user_active() then raise exception 'PLATFORM_ACCOUNT_INACTIVE'; end if;
  perform public.require_capability(org_id, 'data.import', '{}'::jsonb);
  if import_key_value is null or length(import_key_value) > 128 then raise exception 'import_key is required'; end if;
  if jsonb_typeof(rows) is distinct from 'array' then raise exception 'IMPORT_ROWS_INVALID'; end if;
  if jsonb_array_length(rows) not between 1 and 1000 then raise exception 'IMPORT_ROWS_INVALID: Use 1 to 1000 rows'; end if;
  if kind is null or kind not in ('counterparties', 'opening_balances', 'debts') then raise exception 'Unsupported import kind'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':import:' || import_key_value, 0));
  select * into existing from public.import_batches batch where batch.organization_id = org_id and batch.import_key = import_key_value;
  if existing.id is not null then return jsonb_build_object('batch_id', existing.id, 'status', 'already_committed', 'row_count', existing.row_count); end if;
  insert into public.import_batches (organization_id, import_key, import_kind, row_count, committed_by) values (org_id, import_key_value, kind, jsonb_array_length(rows), actor_id) returning id into batch_id;
  for row_item in select value from jsonb_array_elements(rows) loop
    row_number := row_number + 1;
    branch_id_value := coalesce(nullif(row_item->>'branch_id', '')::uuid, nullif(command->>'branch_id', '')::uuid);
    if branch_id_value is null or not public.can_access_branch_v6(org_id, branch_id_value, 'data.import') then
      raise exception 'CAPABILITY_REQUIRED:data.import.branch';
    end if;
    if kind = 'counterparties' then
      if nullif(trim(row_item->>'display_name'), '') is null then raise exception 'Row %: display_name is required', row_number; end if;
      if row_item->>'counterparty_type' not in ('walk_in', 'customer', 'saraf', 'hawala_partner', 'supplier', 'employee', 'other') then raise exception 'Row %: counterparty_type is invalid', row_number; end if;
      select id into counterparty_id from public.create_counterparty_v6(row_item || jsonb_build_object('organization_id', org_id, 'branch_id', branch_id_value));
      update public.counterparties set email = nullif(trim(row_item->>'email'), '')
        where id = counterparty_id and organization_id = org_id and branch_id = branch_id_value;
    elsif kind = 'opening_balances' then
      perform public.record_opening_balance(jsonb_build_object('organization_id', org_id, 'branch_id', branch_id_value, 'cashbox_id', row_item->>'cashbox_id', 'currency', row_item->>'currency', 'amount', row_item->>'amount', 'base_value', row_item->>'base_value', 'memo', 'Import ' || import_key_value || ' row ' || row_number, 'client_command_id', import_key_value || ':opening:' || row_number));
    else
      select id into counterparty_id from public.counterparties where organization_id = org_id and (id::text = nullif(trim(row_item->>'counterparty_id'), '') or lower(display_name) = lower(nullif(trim(row_item->>'counterparty_reference'), ''))) limit 1;
      if counterparty_id is null then raise exception 'Row %: counterparty reference is not found in this organization', row_number; end if;
      perform public.record_debt(jsonb_build_object('organization_id', org_id, 'branch_id', branch_id_value, 'counterparty_id', counterparty_id, 'direction', row_item->>'direction', 'currency', row_item->>'currency', 'amount', row_item->>'amount', 'location', row_item->>'location', 'memo', 'Import ' || import_key_value || ' row ' || row_number, 'client_command_id', import_key_value || ':debt:' || row_number));
    end if;
    created_count := created_count + 1;
  end loop;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata) values (org_id, actor_id, 'import_committed', jsonb_build_object('batch_id', batch_id, 'kind', kind, 'row_count', created_count));
  return jsonb_build_object('batch_id', batch_id, 'status', 'committed', 'row_count', created_count);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_compliance_alert(target_org uuid, target_rule uuid, target_event uuid, alert_kind text, alert_evidence jsonb)
 RETURNS compliance_alerts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result public.compliance_alerts;
begin
  if not public.has_org_permission(target_org, 'compliance:review') then raise exception 'Compliance permission required'; end if;
  if not exists (select 1 from public.compliance_rule_sets where id = target_rule and organization_id = target_org) then raise exception 'Rule set tenant mismatch'; end if;
  if target_event is not null and not exists (select 1 from public.financial_events where id = target_event and organization_id = target_org) then raise exception 'Event tenant mismatch'; end if;
  insert into public.compliance_alerts (organization_id, rule_set_id, source_event_id, alert_type, evidence) values (target_org, target_rule, target_event, alert_kind, alert_evidence) returning * into result;
  return result;
end; $function$
;

-- Preserve only the existing authenticated API surface.
revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.commit_import(jsonb) from public, anon;
revoke all on function public.record_compliance_alert(uuid,uuid,uuid,text,jsonb) from public, anon;
grant execute on function public.is_platform_admin(), public.commit_import(jsonb), public.record_compliance_alert(uuid,uuid,uuid,text,jsonb) to authenticated;
