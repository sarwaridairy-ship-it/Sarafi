-- SARAFI exact-instruction v10. This migration makes the rate shown to the
-- operator the exact immutable rate used by non-FX accounting, narrows Hawala
-- identity evidence authority, and exposes an audited cleanup queue.

insert into public.capabilities (capability_code, description, owner_only)
values
  ('documents.hawala_payout.create', 'Capture private identity evidence for an assigned Hawala payout draft', false),
  ('documents.hawala_payout.view_own_draft', 'View private identity evidence attached to the current user assigned Hawala payout draft', false),
  ('documents.hawala_payout.complete', 'Use private identity evidence to complete the current user assigned Hawala payout', false)
on conflict (capability_code) do update
set description = excluded.description, owner_only = excluded.owner_only;

delete from public.role_capabilities
where role_code = 'cashier'
  and capability_code in ('documents.list', 'documents.upload', 'documents.view', 'documents.download', 'documents.archive');

insert into public.role_capabilities (role_code, capability_code)
values
  ('owner', 'documents.hawala_payout.create'),
  ('owner', 'documents.hawala_payout.view_own_draft'),
  ('owner', 'documents.hawala_payout.complete'),
  ('business_admin', 'documents.hawala_payout.create'),
  ('business_admin', 'documents.hawala_payout.view_own_draft'),
  ('business_admin', 'documents.hawala_payout.complete'),
  ('manager', 'documents.hawala_payout.create'),
  ('manager', 'documents.hawala_payout.view_own_draft'),
  ('manager', 'documents.hawala_payout.complete'),
  ('cashier', 'documents.hawala_payout.create'),
  ('cashier', 'documents.hawala_payout.view_own_draft'),
  ('cashier', 'documents.hawala_payout.complete')
on conflict do nothing;

create or replace function public.get_transaction_rate_context(
  target_org uuid,
  target_branch uuid,
  source_currency text,
  target_currency text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  result jsonb;
  source_value text := upper(trim(source_currency));
  target_value text := upper(trim(target_currency));
  max_age_minutes_value integer := 1440;
  default_tolerance_bps numeric := 50;
begin
  perform public.require_capability(target_org, 'workspace.view', jsonb_strip_nulls(jsonb_build_object('branch_id', target_branch)));
  select os.rate_max_age_minutes, os.rate_tolerance_bps
  into max_age_minutes_value, default_tolerance_bps
  from public.organization_settings os where os.organization_id = target_org;
  max_age_minutes_value := coalesce(max_age_minutes_value, 1440);
  default_tolerance_bps := coalesce(default_tolerance_bps, 50);

  if source_value = target_value then
    return jsonb_build_object(
      'from_currency', source_value, 'to_currency', target_value,
      'context_id', encode(extensions.digest(concat_ws('|', target_org::text, coalesce(target_branch::text, 'organization'), source_value, target_value, 'base'), 'sha256'), 'hex'),
      'buy_rate', 1, 'sell_rate', 1, 'applied_rate', 1,
      'quote_direction', 'AFN_FIRST', 'operation_rate_source', 'APPROVED_DAILY',
      'spread_tolerance', 0, 'tolerance_bps', default_tolerance_bps,
      'effective_from', now(), 'expires_at', null,
      'age_seconds', 0, 'max_age_minutes', max_age_minutes_value,
      'branch_id', target_branch, 'source', 'base_currency',
      'stale', false, 'approval_required', false, 'missing', false
    );
  end if;

  select jsonb_build_object(
    'rate_id', r.id, 'rate_group_id', r.rate_group_id,
    'context_id', encode(extensions.digest(concat_ws('|', target_org::text,
      coalesce(target_branch::text, 'organization'), source_value, target_value,
      r.id::text, ((r.buy_rate + r.sell_rate) / 2)::text, r.effective_from::text), 'sha256'), 'hex'),
    'from_currency', source_value, 'to_currency', target_value,
    'buy_rate', r.buy_rate, 'sell_rate', r.sell_rate,
    'applied_rate', (r.buy_rate + r.sell_rate) / 2,
    'quote_direction', 'AFN_FIRST', 'operation_rate_source', 'APPROVED_DAILY',
    'spread_tolerance', coalesce(r.spread_tolerance, 0),
    'tolerance_bps', default_tolerance_bps,
    'effective_from', r.effective_from,
    'expires_at', r.effective_from + make_interval(mins => max_age_minutes_value),
    'age_seconds', greatest(extract(epoch from now() - r.effective_from), 0),
    'max_age_minutes', max_age_minutes_value, 'branch_id', r.branch_id,
    'source', case when r.branch_id is null then 'organization_rate' else 'branch_rate' end,
    'stale', r.effective_from < now() - make_interval(mins => max_age_minutes_value),
    'approval_required', r.effective_from < now() - make_interval(mins => max_age_minutes_value),
    'missing', false
  ) into result
  from public.rate_board_entries r
  where r.organization_id = target_org
    and r.from_currency = source_value and r.to_currency = target_value
    and r.active and r.effective_from <= now()
    and (r.branch_id is null or r.branch_id = target_branch)
  order by (r.branch_id is not null) desc, r.effective_from desc
  limit 1;

  return coalesce(result, jsonb_build_object(
    'from_currency', source_value, 'to_currency', target_value,
    'context_id', encode(extensions.digest(concat_ws('|', target_org::text,
      coalesce(target_branch::text, 'organization'), source_value, target_value, 'missing'), 'sha256'), 'hex'),
    'quote_direction', 'AFN_FIRST', 'operation_rate_source', 'APPROVED_DAILY',
    'tolerance_bps', default_tolerance_bps, 'max_age_minutes', max_age_minutes_value,
    'branch_id', target_branch, 'source', 'missing', 'stale', true,
    'approval_required', true, 'missing', true
  ));
end;
$$;
revoke all on function public.get_transaction_rate_context(uuid, uuid, text, text) from public, anon;
grant execute on function public.get_transaction_rate_context(uuid, uuid, text, text) to authenticated;

create or replace function public.prepare_inline_rate(command jsonb, operation_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rate_payload jsonb := command->'publish_rate';
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  branch_id_value uuid := coalesce(nullif(rate_payload->>'branch_id', '')::uuid, nullif(command->>'branch_id', '')::uuid);
  source_currency_value text := upper(trim(coalesce(rate_payload->>'source_currency', command->>'currency')));
  target_currency_value text := upper(trim(coalesce(rate_payload->>'target_currency', 'AFN')));
  applied_rate_value numeric := nullif(coalesce(rate_payload->>'rate', rate_payload->>'applied_rate'), '')::numeric;
  buy_rate_value numeric := nullif(rate_payload->>'buy_rate', '')::numeric;
  sell_rate_value numeric := nullif(rate_payload->>'sell_rate', '')::numeric;
  rate_mode_value text := lower(coalesce(nullif(rate_payload->>'rate_mode', ''), 'manual'));
  context_id_value text := nullif(rate_payload->>'context_id', '');
  latest_context jsonb;
  latest_rate numeric;
  difference_bps numeric;
  tolerance_bps_value numeric := 50;
  reason_value text := nullif(trim(rate_payload->>'reason'), '');
  transaction_context jsonb;
begin
  if source_currency_value = target_currency_value then return command - 'publish_rate'; end if;
  if rate_payload is null or jsonb_typeof(rate_payload) <> 'object' then
    raise exception 'OPERATION_RATE_REQUIRED: Review the exact operation rate before posting';
  end if;
  if org_id is null or operation_kind not in (
    'money_operation', 'opening_balance', 'debt_create', 'debt_settle',
    'hawala_send', 'hawala_incoming', 'hawala_settle'
  ) then raise exception 'RATE_RESOLUTION_INVALID: Operation rate context is invalid'; end if;
  if applied_rate_value is null then
    applied_rate_value := case
      when buy_rate_value is not null and sell_rate_value is not null then (buy_rate_value + sell_rate_value) / 2
      else coalesce(buy_rate_value, sell_rate_value)
    end;
  end if;
  if source_currency_value is null or target_currency_value is null
     or source_currency_value = target_currency_value
     or applied_rate_value is null or applied_rate_value <= 0
     or rate_mode_value not in ('automatic', 'manual') then
    raise exception 'RATE_RESOLUTION_INVALID: One exact positive operation rate is required';
  end if;

  latest_context := public.get_transaction_rate_context(org_id, branch_id_value, source_currency_value, target_currency_value);
  latest_rate := nullif(latest_context->>'applied_rate', '')::numeric;
  tolerance_bps_value := coalesce(nullif(latest_context->>'tolerance_bps', '')::numeric, 50);
  if rate_mode_value = 'automatic' then
    if coalesce((latest_context->>'missing')::boolean, true) or coalesce((latest_context->>'stale')::boolean, true) then
      raise exception 'RATE_UNAVAILABLE: Automatic rate is missing or stale';
    end if;
    if context_id_value is distinct from latest_context->>'context_id'
       or latest_rate is null or applied_rate_value is distinct from latest_rate then
      raise exception 'RATE_CONTEXT_CHANGED: Refresh and review the current approved rate';
    end if;
  else
    perform public.require_capability(org_id, 'rates.manage', jsonb_strip_nulls(jsonb_build_object('branch_id', branch_id_value)));
    if latest_rate is not null then
      difference_bps := abs(applied_rate_value - latest_rate) / latest_rate * 10000;
      if difference_bps > tolerance_bps_value and reason_value is null then
        raise exception 'RATE_REASON_REQUIRED: Explain this rate because it is outside the allowed difference';
      end if;
    end if;
  end if;

  transaction_context := jsonb_strip_nulls(jsonb_build_object(
    'organization_id', org_id, 'branch_id', branch_id_value,
    'source_currency', source_currency_value, 'target_currency', target_currency_value,
    'rate', applied_rate_value, 'valuation_rate', applied_rate_value,
    'quote_direction', coalesce(nullif(rate_payload->>'quote_direction', ''), 'AFN_FIRST'),
    'source', case when rate_mode_value = 'automatic' then 'APPROVED_DAILY' else 'TRANSACTION_MANUAL' end,
    'effective_at', case when rate_mode_value = 'automatic' then latest_context->>'effective_from' else now()::text end,
    'expires_at', case when rate_mode_value = 'automatic' then latest_context->>'expires_at' else null end,
    'approval_required', false, 'context_id', coalesce(context_id_value, latest_context->>'context_id'),
    'rate_mode', rate_mode_value, 'rate_side', rate_payload->>'rate_side',
    'approved_rate', latest_rate, 'entered_rate', case when rate_mode_value = 'manual' then applied_rate_value else null end,
    'difference_bps', difference_bps, 'tolerance_bps', tolerance_bps_value,
    'reason', reason_value, 'actor_user_id', (select auth.uid()),
    'device_id', nullif(command->>'device_id', ''),
    'operation_kind', operation_kind, 'recorded_at', now()
  ));
  perform set_config('sarafi.transaction_rate_context', transaction_context::text, true);
  return (command - 'publish_rate') || jsonb_build_object(
    'transaction_rate_context', transaction_context,
    'applied_operation_rate', transaction_context,
    'rate_published_atomically', false,
    'rate_resolution_kind', operation_kind,
    'rate_source', case when rate_mode_value = 'automatic' then 'approved_daily' else 'transaction_manual' end
  );
end;
$$;
revoke all on function public.prepare_inline_rate(jsonb, text) from public, anon, authenticated;

create or replace function public.authoritative_base_amount(
  target_org uuid,
  target_branch uuid,
  currency_input text,
  amount_input numeric,
  allow_stale boolean default false
)
returns numeric
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  currency_value text := upper(trim(currency_input));
  base_currency_value text;
  rate_value numeric;
  transaction_context jsonb;
begin
  if target_org is null or currency_value is null or amount_input is null or amount_input < 0 then
    raise exception 'RATE_INPUT_INVALID: A valid organization, currency, and amount are required';
  end if;
  select upper(o.base_currency_code) into base_currency_value from public.organizations o where o.id = target_org;
  if base_currency_value is null then raise exception 'RATE_BASE_UNAVAILABLE: Organization base currency is unavailable'; end if;
  if currency_value = base_currency_value then return round(amount_input, 12); end if;
  begin
    transaction_context := nullif(current_setting('sarafi.transaction_rate_context', true), '')::jsonb;
  exception when others then transaction_context := null;
  end;
  if transaction_context is null
     or nullif(transaction_context->>'organization_id', '')::uuid is distinct from target_org
     or upper(transaction_context->>'source_currency') is distinct from currency_value
     or upper(transaction_context->>'target_currency') is distinct from base_currency_value
     or (nullif(transaction_context->>'branch_id', '')::uuid is not null
         and nullif(transaction_context->>'branch_id', '')::uuid is distinct from target_branch) then
    raise exception 'OPERATION_RATE_REQUIRED: The exact reviewed operation rate is missing';
  end if;
  rate_value := nullif(transaction_context->>'rate', '')::numeric;
  if rate_value is null or rate_value <= 0 then raise exception 'RATE_INVALID: The reviewed operation rate is invalid'; end if;
  return round(amount_input * rate_value, 12);
end;
$$;
revoke all on function public.authoritative_base_amount(uuid, uuid, text, numeric, boolean) from public, anon, authenticated;

create or replace function public.apply_operation_rate_to_journal_line_v10()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare context_value jsonb; rate_value numeric; base_currency_value text;
begin
  begin context_value := nullif(current_setting('sarafi.transaction_rate_context', true), '')::jsonb;
  exception when others then context_value := null; end;
  if context_value is null then return new; end if;
  select upper(o.base_currency_code) into base_currency_value from public.organizations o where o.id = new.organization_id;
  if upper(new.currency_code) = base_currency_value then return new; end if;
  if upper(new.currency_code) is distinct from upper(context_value->>'source_currency') then
    raise exception 'RATE_CURRENCY_MISMATCH: Journal currency differs from the reviewed operation rate';
  end if;
  rate_value := nullif(context_value->>'rate', '')::numeric;
  if new.applied_rate is not null and new.applied_rate is distinct from rate_value then
    raise exception 'RATE_JOURNAL_MISMATCH: Journal rate differs from the reviewed operation rate';
  end if;
  if new.native_debit > 0 and abs(new.base_debit - round(new.native_debit * rate_value, 12)) > 0.000001 then
    raise exception 'RATE_BASE_MISMATCH: Journal debit differs from the reviewed operation rate';
  end if;
  if new.native_credit > 0 and abs(new.base_credit - round(new.native_credit * rate_value, 12)) > 0.000001 then
    raise exception 'RATE_BASE_MISMATCH: Journal credit differs from the reviewed operation rate';
  end if;
  new.applied_rate := rate_value;
  new.source_metadata := coalesce(new.source_metadata, '{}'::jsonb) || jsonb_build_object('applied_operation_rate', context_value);
  return new;
end;
$$;
drop trigger if exists zz_journal_lines_operation_rate_v10 on public.journal_lines;
create trigger zz_journal_lines_operation_rate_v10
before insert on public.journal_lines
for each row execute function public.apply_operation_rate_to_journal_line_v10();
revoke all on function public.apply_operation_rate_to_journal_line_v10() from public, anon, authenticated;

create or replace function public.request_operation_rate_approval_v10(command jsonb)
returns public.approval_requests
language plpgsql
security definer
set search_path = ''
as $$
declare org_id uuid := nullif(command->>'organization_id', '')::uuid;
  branch_id_value uuid := nullif(command->>'branch_id', '')::uuid;
  actor_id uuid := (select auth.uid()); result public.approval_requests;
  source_value text := upper(trim(command->>'source_currency'));
begin
  perform public.require_capability(org_id, 'approval.request', jsonb_strip_nulls(jsonb_build_object('branch_id', branch_id_value)));
  select a.* into result from public.approval_requests a
  where a.organization_id = org_id and a.branch_id is not distinct from branch_id_value
    and a.requested_by = actor_id and a.action_type = 'operation_rate'
    and a.status = 'pending' and a.currency_code = source_value and a.expires_at > now()
  order by a.requested_at desc limit 1;
  if result.id is not null then return result; end if;
  insert into public.approval_requests (
    organization_id, branch_id, requested_by, action_type, payload_summary,
    reason, currency_code, expires_at
  ) values (
    org_id, branch_id_value, actor_id, 'operation_rate',
    jsonb_build_object('source_currency', source_value, 'target_currency', upper(trim(command->>'target_currency')), 'context_id', command->>'context_id'),
    coalesce(nullif(trim(command->>'reason'), ''), 'Approved daily rate unavailable'), source_value, now() + interval '30 minutes'
  ) returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (org_id, actor_id, 'operation_rate_approval_requested', jsonb_build_object('approval_id', result.id, 'branch_id', branch_id_value, 'currency', source_value));
  return result;
end;
$$;
revoke all on function public.request_operation_rate_approval_v10(jsonb) from public, anon;
grant execute on function public.request_operation_rate_approval_v10(jsonb) to authenticated;

create or replace function public.private_document_upload_target_is_valid(target_org uuid, target_entity uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select (
    public.has_capability(target_org, 'documents.upload', '{}'::jsonb)
    and exists (select 1 from public.counterparties cp where cp.organization_id = target_org and cp.id = target_entity)
  ) or (
    public.has_capability(target_org, 'documents.hawala_payout.create', '{}'::jsonb)
    and exists (
      select 1 from public.hawala_payout_drafts d
      join public.hawala_transfers h on h.id = d.transfer_id
      where d.id = target_entity and d.organization_id = target_org
        and d.created_by = (select auth.uid()) and d.status in ('open', 'awaiting_approval')
        and d.expires_at > now() and h.recipient_organization_id = target_org
        and h.recipient_branch_id = d.recipient_branch_id and h.status = 'ready'
        and public.has_capability(target_org, 'hawala.payout', jsonb_build_object(
          'branch_id', d.recipient_branch_id, 'feature', 'hawala', 'requires_active_plan', true
        ))
    )
  );
$$;
revoke all on function public.private_document_upload_target_is_valid(uuid, uuid) from public, anon;
grant execute on function public.private_document_upload_target_is_valid(uuid, uuid) to authenticated;

create or replace function public.authorize_private_document_access(
  target_org uuid,
  target_document uuid,
  target_device uuid,
  raw_grant text,
  requested_action text default 'view'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attachment_row public.attachments;
  audit_row public.compliance_audit_events;
  has_general_access boolean := false;
  has_payout_access boolean := false;
begin
  if requested_action not in ('view', 'download') then
    raise exception 'DOCUMENT_ACTION_INVALID: Access action must be view or download';
  end if;
  select a.* into attachment_row
  from public.attachments a
  where a.id = target_document and a.organization_id = target_org and a.archived_at is null;
  if attachment_row.id is null then
    raise exception 'DOCUMENT_NOT_FOUND: Active private document is unavailable';
  end if;

  has_general_access := public.has_capability(
    target_org,
    case when requested_action = 'download' then 'documents.download' else 'documents.view' end,
    '{}'::jsonb
  );
  if requested_action = 'view'
     and attachment_row.entity_type in ('hawala_payout_draft:tazkira_front', 'hawala_payout_draft:tazkira_back') then
    has_payout_access := public.has_capability(target_org, 'documents.hawala_payout.view_own_draft', '{}'::jsonb)
      and exists (
        select 1 from public.hawala_payout_drafts d
        join public.hawala_transfers h on h.id = d.transfer_id
        where d.id = attachment_row.entity_id and d.organization_id = target_org
          and d.created_by = (select auth.uid()) and d.status in ('open', 'awaiting_approval')
          and d.expires_at > now() and h.recipient_organization_id = target_org
          and h.recipient_branch_id = d.recipient_branch_id and h.status = 'ready'
      );
  end if;
  if not has_general_access and not has_payout_access then
    raise exception 'CAPABILITY_REQUIRED: Private document access is not allowed';
  end if;
  if not public.app_unlock_grant_is_valid(target_org, target_device, raw_grant, 'sensitive_actions') then
    raise exception 'APP_UNLOCK_REQUIRED: Unlock the app again before opening this private document';
  end if;
  if attachment_row.storage_path not like target_org::text || '/' || attachment_row.entity_id::text || '/%' then
    raise exception 'DOCUMENT_PATH_INVALID: Stored path does not match document tenancy';
  end if;
  insert into public.compliance_audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id
  ) values (
    target_org, (select auth.uid()), requested_action, 'private_document', target_document
  ) returning * into audit_row;
  return jsonb_build_object(
    'document_id', attachment_row.id, 'storage_path', attachment_row.storage_path,
    'content_type', attachment_row.content_type, 'size_bytes', attachment_row.size_bytes,
    'sha256', attachment_row.sha256, 'expires_in', 300, 'audit_event_id', audit_row.id
  );
end;
$$;
revoke all on function public.authorize_private_document_access(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.authorize_private_document_access(uuid, uuid, uuid, text, text) to authenticated;

create or replace function public.enforce_hawala_payout_purpose_v10()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target_org uuid;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    target_org := coalesce(new.recipient_organization_id, new.organization_id);
    perform public.require_capability(target_org, 'documents.hawala_payout.complete', jsonb_strip_nulls(jsonb_build_object(
      'branch_id', new.recipient_branch_id, 'feature', 'hawala', 'requires_active_plan', true
    )));
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_hawala_payout_purpose_v10() from public, anon, authenticated;
drop trigger if exists hawala_payout_purpose_v10 on public.hawala_transfers;
create trigger hawala_payout_purpose_v10
before update of status on public.hawala_transfers
for each row execute function public.enforce_hawala_payout_purpose_v10();

drop policy if exists attachments_hawala_payout_own_read_v10 on public.attachments;
create policy attachments_hawala_payout_own_read_v10 on public.attachments
for select to authenticated
using (
  entity_type in ('hawala_payout_draft:tazkira_front', 'hawala_payout_draft:tazkira_back')
  and public.has_capability(organization_id, 'documents.hawala_payout.view_own_draft', '{}'::jsonb)
  and exists (
    select 1 from public.hawala_payout_drafts d
    where d.id = entity_id and d.organization_id = organization_id
      and d.created_by = (select auth.uid()) and d.status in ('open', 'awaiting_approval')
      and d.expires_at > now()
  )
);

drop policy if exists private_documents_capability_insert on storage.objects;
create policy private_documents_capability_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'sarafi-private-documents'
  and public.private_document_org_id(name) is not null
  and public.private_document_entity_id(name) is not null
  and public.private_document_upload_target_is_valid(
    public.private_document_org_id(name), public.private_document_entity_id(name)
  )
);

alter table public.attachments
  add column if not exists cleanup_claimed_at timestamptz,
  add column if not exists storage_deleted_at timestamptz,
  add column if not exists cleanup_attempt_count integer not null default 0,
  add column if not exists cleanup_error text;

create index if not exists attachments_hawala_evidence_cleanup_v10_idx
  on public.attachments (entity_id, created_at)
  where storage_deleted_at is null
    and entity_type in ('hawala_payout_draft:tazkira_front', 'hawala_payout_draft:tazkira_back');

create or replace function public.claim_expired_hawala_evidence_v10(batch_size integer default 100)
returns table (draft_id uuid, organization_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  return query
  with candidates as (
    select a.id
    from public.attachments a
    join public.hawala_payout_drafts d on d.id = a.entity_id and d.organization_id = a.organization_id
    where d.status in ('open', 'awaiting_approval', 'expired') and d.expires_at <= now()
      and a.entity_type in ('hawala_payout_draft:tazkira_front', 'hawala_payout_draft:tazkira_back')
      and a.storage_deleted_at is null
      and (a.cleanup_claimed_at is null or a.cleanup_claimed_at < now() - interval '10 minutes')
    order by d.expires_at, a.created_at
    limit greatest(1, least(batch_size, 500))
    for update of a skip locked
  ), claimed as (
    update public.attachments a
    set cleanup_claimed_at = now(), cleanup_attempt_count = a.cleanup_attempt_count + 1, cleanup_error = null
    where a.id in (select c.id from candidates c)
    returning a.entity_id, a.organization_id, a.storage_path
  ), marked as materialized (
    update public.hawala_payout_drafts d set status = 'expired', updated_at = now()
    where d.id in (select distinct c.entity_id from claimed c)
      and d.status in ('open', 'awaiting_approval')
    returning d.id
  )
  select c.entity_id, c.organization_id, c.storage_path from claimed c
  where (select count(*) from marked) >= 0;
end;
$$;
revoke all on function public.claim_expired_hawala_evidence_v10(integer) from public, anon, authenticated;
grant execute on function public.claim_expired_hawala_evidence_v10(integer) to service_role;

create or replace function public.finalize_hawala_evidence_cleanup_v10(
  cleaned_paths text[],
  failed_paths text[] default '{}'::text[],
  failure_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare cleaned_count integer := 0; failed_count integer := 0;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  update public.attachments a
  set storage_deleted_at = now(), archived_at = coalesce(a.archived_at, now()),
      archive_reason = coalesce(a.archive_reason, 'Expired Hawala payout evidence deleted'),
      cleanup_claimed_at = null, cleanup_error = null
  where a.storage_path = any(coalesce(cleaned_paths, '{}'::text[])) and a.storage_deleted_at is null;
  get diagnostics cleaned_count = row_count;
  update public.attachments a
  set cleanup_claimed_at = null, cleanup_error = left(coalesce(failure_message, 'Storage deletion failed'), 1000)
  where a.storage_path = any(coalesce(failed_paths, '{}'::text[])) and a.storage_deleted_at is null;
  get diagnostics failed_count = row_count;
  return jsonb_build_object('cleaned', cleaned_count, 'failed', failed_count);
end;
$$;
revoke all on function public.finalize_hawala_evidence_cleanup_v10(text[], text[], text) from public, anon, authenticated;
grant execute on function public.finalize_hawala_evidence_cleanup_v10(text[], text[], text) to service_role;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create or replace function public.configure_hawala_evidence_cleanup_v10(
  project_url_input text,
  service_role_key_input text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_secret_id uuid;
  role_secret_id uuid;
  scheduled_job_id bigint;
begin
  if project_url_input !~ '^https://[a-z0-9-]+\.supabase\.co$'
     or nullif(trim(service_role_key_input), '') is null then
    raise exception 'CLEANUP_CONFIGURATION_INVALID: Project URL and service role key are required';
  end if;

  select id into project_secret_id from vault.secrets where name = 'project_url' limit 1;
  if project_secret_id is null then
    perform vault.create_secret(project_url_input, 'project_url', 'SARAFI Edge Function base URL');
  else
    perform vault.update_secret(project_secret_id, project_url_input, 'project_url', 'SARAFI Edge Function base URL');
  end if;
  select id into role_secret_id from vault.secrets where name = 'service_role_key' limit 1;
  if role_secret_id is null then
    perform vault.create_secret(service_role_key_input, 'service_role_key', 'SARAFI scheduled cleanup authorization');
  else
    perform vault.update_secret(role_secret_id, service_role_key_input, 'service_role_key', 'SARAFI scheduled cleanup authorization');
  end if;

  perform cron.unschedule(jobid)
  from cron.job where jobname = 'sarafi-hawala-evidence-cleanup-v10';
  select cron.schedule(
    'sarafi-hawala-evidence-cleanup-v10',
    '*/5 * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
          || '/functions/v1/hawala-evidence-cleanup',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
        ),
        body := jsonb_build_object('batch_size', 100),
        timeout_milliseconds := 30000
      ) as request_id;
    $job$
  ) into scheduled_job_id;
  return scheduled_job_id;
end;
$$;
revoke all on function public.configure_hawala_evidence_cleanup_v10(text, text) from public, anon, authenticated, service_role;

-- The release process stores project_url and service_role_key in Vault. The
-- conditional keeps a clean local migration replay possible without secrets;
-- production verification fails unless this named job exists.
do $$
declare
  project_url_value text;
  service_role_key_value text;
begin
  select decrypted_secret into project_url_value from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into service_role_key_value from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if nullif(project_url_value, '') is not null and nullif(service_role_key_value, '') is not null then
    perform public.configure_hawala_evidence_cleanup_v10(project_url_value, service_role_key_value);
  else
    raise notice 'Hawala evidence cleanup schedule awaits project_url and service_role_key Vault secrets';
  end if;
end;
$$;
