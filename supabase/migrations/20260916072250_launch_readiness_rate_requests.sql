-- A missing-rate request asks for a branch daily rate. It never grants authority
-- to post a transaction. The requester reviews and posts through the usual RPC,
-- which checks the exact current context again and stores its immutable rate.
-- Decimal values cross JSON as strings so no JavaScript number conversion can
-- change the exact rate that the server later compares during posting.
alter function public.get_transaction_rate_context(uuid, uuid, text, text) rename to get_transaction_rate_context_numeric_v11;
revoke all on function public.get_transaction_rate_context_numeric_v11(uuid, uuid, text, text) from public, anon, authenticated;
create function public.get_transaction_rate_context(target_org uuid, target_branch uuid, source_currency text, target_currency text)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare result jsonb;
begin
  result := public.get_transaction_rate_context_numeric_v11(target_org, target_branch, source_currency, target_currency);
  return (result - 'buy_rate' - 'sell_rate' - 'applied_rate' - 'tolerance_bps') || jsonb_strip_nulls(jsonb_build_object(
    'buy_rate', result->>'buy_rate', 'sell_rate', result->>'sell_rate',
    'applied_rate', result->>'applied_rate', 'tolerance_bps', result->>'tolerance_bps'));
end;
$$;
revoke all on function public.get_transaction_rate_context(uuid, uuid, text, text) from public, anon;
grant execute on function public.get_transaction_rate_context(uuid, uuid, text, text) to authenticated;

create or replace function public.request_operation_rate_approval_v10(command jsonb)
returns public.approval_requests
language plpgsql security definer set search_path = '' as $$
declare
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  branch_value uuid := nullif(command->>'branch_id', '')::uuid;
  actor_id uuid := (select auth.uid());
  source_value text := upper(trim(command->>'source_currency'));
  target_value text := upper(trim(command->>'target_currency'));
  result public.approval_requests;
begin
  perform public.require_capability(org_id, 'approval.request', jsonb_build_object('branch_id', branch_value));
  if branch_value is null or not exists (
    select 1 from public.branches b where b.id = branch_value and b.organization_id = org_id and b.active
  ) then raise exception 'BRANCH_INVALID'; end if;
  if source_value is null or target_value is distinct from 'AFN' or source_value = target_value
     or not exists (select 1 from public.organization_currencies c where c.organization_id = org_id and c.currency_code = source_value and c.enabled)
  then raise exception 'RATE_CURRENCY_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|', org_id, branch_value, actor_id, source_value, 'daily-rate-request'), 0));
  select a.* into result from public.approval_requests a
  where a.organization_id = org_id and a.branch_id = branch_value
    and a.requested_by = actor_id and a.action_type = 'operation_rate'
    and a.currency_code = source_value and a.status = 'pending' and a.expires_at > now()
  order by a.requested_at desc limit 1;
  if result.id is not null then return result; end if;
  insert into public.approval_requests (
    organization_id, branch_id, requested_by, action_type, payload_summary, reason, currency_code, expires_at
  ) values (
    org_id, branch_value, actor_id, 'operation_rate',
    jsonb_build_object('purpose', 'daily_rate_refresh', 'source_currency', source_value,
      'target_currency', target_value, 'context_id', command->>'context_id'),
    'Daily rate update requested', source_value, now() + interval '30 minutes'
  ) returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (org_id, actor_id, 'operation_rate_approval_requested', jsonb_build_object(
    'approval_id', result.id, 'branch_id', branch_value, 'currency', source_value, 'purpose', 'daily_rate_refresh'));
  return result;
end;
$$;
revoke all on function public.request_operation_rate_approval_v10(jsonb) from public, anon;
grant execute on function public.request_operation_rate_approval_v10(jsonb) to authenticated;

create function public.get_my_operation_rate_request_v11(target_request uuid)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare request public.approval_requests;
begin
  select a.* into request from public.approval_requests a
  where a.id = target_request and a.requested_by = (select auth.uid()) and a.action_type = 'operation_rate';
  if request.id is null then raise exception 'APPROVAL_NOT_FOUND'; end if;
  perform public.require_capability(request.organization_id, 'approval.request', jsonb_build_object('branch_id', request.branch_id));
  return jsonb_build_object('status', request.status, 'expires_at', request.expires_at);
end;
$$;
revoke all on function public.get_my_operation_rate_request_v11(uuid) from public, anon;
grant execute on function public.get_my_operation_rate_request_v11(uuid) to authenticated;

alter function public.decide_approval(uuid, text, text) rename to decide_approval_before_daily_rate_v11;
revoke all on function public.decide_approval_before_daily_rate_v11(uuid, text, text) from public, anon, authenticated;

create function public.decide_approval(target_id uuid, decision text, decision_reason_input text)
returns public.approval_requests language plpgsql security definer set search_path = '' as $$
begin
  if decision = 'approved' and exists (
    select 1 from public.approval_requests a where a.id = target_id and a.action_type = 'operation_rate'
  ) then raise exception 'DAILY_RATE_UPDATE_REQUIRED: Publish the branch daily rates with this request'; end if;
  return public.decide_approval_before_daily_rate_v11(target_id, decision, decision_reason_input);
end;
$$;
revoke all on function public.decide_approval(uuid, text, text) from public, anon;
grant execute on function public.decide_approval(uuid, text, text) to authenticated;

create function public.resolve_operation_rate_request_v11(
  target_request uuid, buy_rate_input numeric, sell_rate_input numeric, decision_reason_input text
)
returns public.approval_requests language plpgsql security definer set search_path = '' as $$
declare request public.approval_requests; published public.rate_board_entries;
begin
  select a.* into request from public.approval_requests a where a.id = target_request for update;
  if request.id is null then raise exception 'APPROVAL_NOT_FOUND'; end if;
  perform public.require_capability(request.organization_id, 'approval.decide', jsonb_build_object('branch_id', request.branch_id));
  perform public.require_capability(request.organization_id, 'rates.manage', jsonb_build_object('branch_id', request.branch_id));
  perform public.require_aal2();
  if request.action_type <> 'operation_rate' or request.status <> 'pending' then raise exception 'APPROVAL_NOT_PENDING'; end if;
  if request.requested_by = (select auth.uid()) then raise exception 'APPROVAL_SELF_DECISION_DENIED'; end if;
  if request.expires_at <= now() then raise exception 'APPROVAL_EXPIRED'; end if;
  if buy_rate_input is null or sell_rate_input is null or buy_rate_input <= 0 or sell_rate_input <= 0
     or buy_rate_input::text in ('NaN', 'Infinity', '-Infinity') or sell_rate_input::text in ('NaN', 'Infinity', '-Infinity')
     or buy_rate_input > sell_rate_input then raise exception 'RATE_INVALID'; end if;
  if request.branch_id is null or request.payload_summary->>'target_currency' is distinct from 'AFN' then
    raise exception 'RATE_CURRENCY_INVALID';
  end if;
  published := public.set_exchange_rate(request.organization_id, request.branch_id,
    request.currency_code, 'AFN', buy_rate_input, sell_rate_input);
  update public.approval_requests set payload_summary = payload_summary || jsonb_build_object(
    'purpose', 'daily_rate_refresh', 'published_rate_id', published.id,
    'buy_rate', published.buy_rate, 'sell_rate', published.sell_rate,
    'applied_rate', (published.buy_rate + published.sell_rate) / 2
  ) where id = request.id;
  request := public.decide_approval_before_daily_rate_v11(request.id, 'approved', decision_reason_input);
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (request.organization_id, (select auth.uid()), 'daily_rate_request_resolved', jsonb_build_object(
    'approval_id', request.id, 'rate_id', published.id, 'branch_id', request.branch_id,
    'execution_mode', 'daily_rate_only_requester_reviews_transaction'));
  return request;
end;
$$;
revoke all on function public.resolve_operation_rate_request_v11(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.resolve_operation_rate_request_v11(uuid, numeric, numeric, text) to authenticated;

-- Explicitly qualify the outer row: the earlier unqualified organization_id
-- resolved to the inner draft's column and became a tautology.
drop policy if exists attachments_hawala_payout_own_read_v10 on public.attachments;
create policy attachments_hawala_payout_own_read_v10 on public.attachments
for select to authenticated using (
  attachments.entity_type in ('hawala_payout_draft:tazkira_front', 'hawala_payout_draft:tazkira_back')
  and exists (
    select 1 from public.hawala_payout_drafts d
    where d.id = attachments.entity_id and d.organization_id = attachments.organization_id
      and d.created_by = (select auth.uid()) and d.status in ('open', 'awaiting_approval') and d.expires_at > now()
      and public.has_capability(attachments.organization_id, 'documents.hawala_payout.view_own_draft', jsonb_build_object('branch_id', d.recipient_branch_id))
  )
);

-- PostgreSQL numeric NaN passes a simple >= 0 check and compares equal to
-- itself. Reject special values at storage so they cannot poison a balanced
-- journal, a daily quote, a debt, or an inventory calculation through any RPC.
do $$
declare item record;
begin
  for item in
    select c.relname as table_name,
      string_agg(format('(%I is null or %I not in (''NaN''::numeric, ''Infinity''::numeric, ''-Infinity''::numeric))', a.attname, a.attname), ' and ' order by a.attnum) as predicate
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
      and a.atttypid = 'numeric'::regtype
      and c.relname in ('journal_lines', 'rate_board_entries', 'debts', 'settlements',
        'fx_inventory_cost_state', 'fx_inventory_movements', 'hawala_transfers', 'hawala_statement_lines')
    group by c.relname
  loop
    execute format('alter table public.%I add constraint %I check (%s)', item.table_name, item.table_name || '_finite_values_v11', item.predicate);
  end loop;
end;
$$;
