-- SECURITY DEFINER functions in the exposed public schema must never be
-- callable anonymously. Revoke inherited and explicit public/anon execution
-- first, then restore only the authenticated application RPC allow-list.
do $$
declare
  function_record record;
begin
  for function_record in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', function_record.signature);
  end loop;
end
$$;

create or replace function public.commit_import(command jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  org_id uuid := (command->>'organization_id')::uuid;
  actor_id uuid := auth.uid();
  import_key_value text := nullif(trim(command->>'import_key'), '');
  kind text := lower(command->>'kind');
  rows jsonb := coalesce(command->'rows', '[]'::jsonb);
  existing public.import_batches;
  batch_id uuid;
  row_item jsonb;
  row_number integer := 0;
  created_count integer := 0;
  counterparty_id uuid;
  result_entry public.journal_entries;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if import_key_value is null or length(import_key_value) > 128 then raise exception 'import_key is required'; end if;
  if jsonb_array_length(rows) = 0 then raise exception 'Import rows are required'; end if;
  if kind not in ('counterparties', 'opening_balances', 'debts') then raise exception 'Unsupported import kind'; end if;
  if not exists (select 1 from public.organization_memberships where organization_id = org_id and user_id = actor_id and active and role_code in ('owner', 'manager', 'accountant')) then raise exception 'User cannot commit imports'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':import:' || import_key_value, 0));
  select * into existing from public.import_batches batch where batch.organization_id = org_id and batch.import_key = import_key_value;
  if existing.id is not null then return jsonb_build_object('batch_id', existing.id, 'status', 'already_committed', 'row_count', existing.row_count); end if;
  insert into public.import_batches (organization_id, import_key, import_kind, row_count, committed_by) values (org_id, import_key_value, kind, jsonb_array_length(rows), actor_id) returning id into batch_id;
  for row_item in select value from jsonb_array_elements(rows) loop
    row_number := row_number + 1;
    if kind = 'counterparties' then
      if nullif(trim(row_item->>'display_name'), '') is null then raise exception 'Row %: display_name is required', row_number; end if;
      if row_item->>'counterparty_type' not in ('walk_in', 'customer', 'saraf', 'hawala_partner', 'supplier', 'employee', 'other') then raise exception 'Row %: counterparty_type is invalid', row_number; end if;
      insert into public.counterparties (organization_id, display_name, counterparty_type, phone, email, notes) values (org_id, trim(row_item->>'display_name'), row_item->>'counterparty_type', nullif(trim(row_item->>'phone'), ''), nullif(trim(row_item->>'email'), ''), nullif(trim(row_item->>'notes'), '')) returning id into counterparty_id;
    elsif kind = 'opening_balances' then
      result_entry := public.record_opening_balance(jsonb_build_object('organization_id', org_id, 'branch_id', row_item->>'branch_id', 'cashbox_id', row_item->>'cashbox_id', 'currency', row_item->>'currency', 'amount', row_item->>'amount', 'base_value', row_item->>'base_value', 'memo', 'Import ' || import_key_value || ' row ' || row_number, 'client_command_id', import_key_value || ':opening:' || row_number));
    else
      select id into counterparty_id from public.counterparties where organization_id = org_id and (id::text = nullif(trim(row_item->>'counterparty_id'), '') or lower(display_name) = lower(nullif(trim(row_item->>'counterparty_reference'), ''))) limit 1;
      if counterparty_id is null then raise exception 'Row %: counterparty reference is not found in this organization', row_number; end if;
      result_entry := public.record_debt(jsonb_build_object('organization_id', org_id, 'branch_id', row_item->>'branch_id', 'counterparty_id', counterparty_id, 'direction', row_item->>'direction', 'currency', row_item->>'currency', 'amount', row_item->>'amount', 'location', row_item->>'location', 'memo', 'Import ' || import_key_value || ' row ' || row_number, 'client_command_id', import_key_value || ':debt:' || row_number));
    end if;
    created_count := created_count + 1;
  end loop;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata) values (org_id, actor_id, 'import_committed', jsonb_build_object('batch_id', batch_id, 'kind', kind, 'row_count', created_count));
  return jsonb_build_object('batch_id', batch_id, 'status', 'committed', 'row_count', created_count);
end;
$$;

revoke all on function public.commit_import(jsonb) from public;
grant execute on function public.commit_import(jsonb) to authenticated;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_permission(uuid, text) to authenticated;
grant execute on function public.record_fx_trade(jsonb) to authenticated;
grant execute on function public.record_operation(jsonb) to authenticated;
grant execute on function public.current_rate(uuid, text, text, uuid, uuid) to authenticated;
grant execute on function public.submit_cashbox_close(uuid) to authenticated;
grant execute on function public.decide_approval(uuid, text, text) to authenticated;
grant execute on function public.record_compliance_alert(uuid, uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.create_business(jsonb) to authenticated;
grant execute on function public.get_owner_dashboard(uuid, date) to authenticated;
grant execute on function public.record_debt(jsonb) to authenticated;
grant execute on function public.settle_debt(jsonb) to authenticated;
grant execute on function public.record_cashbox_close(jsonb) to authenticated;
grant execute on function public.approve_cashbox_close(uuid) to authenticated;
grant execute on function public.record_hawala_send(jsonb) to authenticated;
grant execute on function public.record_report_export(jsonb) to authenticated;
grant execute on function public.require_sanctions_provider(uuid) to authenticated;
grant execute on function public.record_opening_balance(jsonb) to authenticated;
grant execute on function public.request_reversal(jsonb) to authenticated;
grant execute on function public.record_sensitive_document_access(uuid, uuid, text) to authenticated;
grant execute on function public.require_active_device(uuid, uuid) to authenticated;
grant execute on function public.register_device(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.revoke_device(uuid, text) to authenticated;
grant execute on function public.set_membership_active(uuid, boolean, text) to authenticated;
grant execute on function public.require_aal2() to authenticated;
grant execute on function public.request_fx_trade_approval(jsonb) to authenticated;
grant execute on function public.commit_import(jsonb) to authenticated;
