-- Create and settle a real approval-backed FX command through the authoritative posting path.
create or replace function public.request_fx_trade_approval(command jsonb)
returns public.approval_requests
language plpgsql
security definer
set search_path = public
as $$
declare result public.approval_requests;
declare actor_id uuid := auth.uid();
declare org_id uuid := nullif(command->>'organization_id', '')::uuid;
declare branch_id_value uuid := nullif(command->>'branch_id', '')::uuid;
declare cashbox_id_value uuid := nullif(command->>'cashbox_id', '')::uuid;
declare membership_id_value uuid;
declare role_value text;
begin
  select id, role_code into membership_id_value, role_value from public.organization_memberships where organization_id = org_id and user_id = actor_id and active;
  if membership_id_value is null or role_value not in ('owner', 'manager', 'cashier') then raise exception 'User cannot request this approval'; end if;
  if not exists (select 1 from public.branches where id = branch_id_value and organization_id = org_id and active) then raise exception 'Branch is not active or belongs to another organization'; end if;
  if not exists (select 1 from public.cashboxes where id = cashbox_id_value and branch_id = branch_id_value and organization_id = org_id and active) then raise exception 'Cashbox is not active or belongs to another branch'; end if;
  if command->>'side' not in ('buy_fx', 'sell_fx', 'exchange_fx') then raise exception 'Unsupported approval operation'; end if;
  if (command->>'sold_base_value')::numeric <= 0 or (command->>'bought_base_value')::numeric <= 0 then raise exception 'Approval amounts must be positive'; end if;
  if actor_id is null then raise exception 'Authentication required'; end if;
  insert into public.approval_requests (organization_id, branch_id, requested_by, action_type, payload_summary, reason, amount_base, currency_code, expires_at)
    values (org_id, branch_id_value, actor_id, 'fx_trade', command, coalesce(nullif(trim(command->>'approval_reason'), ''), 'FX trade approval required'), greatest((command->>'sold_base_value')::numeric, (command->>'bought_base_value')::numeric), upper(command->>'base_currency'), now() + interval '1 hour')
    returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
    values (org_id, actor_id, 'approval_requested', jsonb_build_object('approval_id', result.id, 'action_type', result.action_type, 'amount_base', result.amount_base));
  return result;
end;
$$;

create or replace function public.decide_approval(target_id uuid, decision text, decision_reason_input text)
returns public.approval_requests
language plpgsql
security definer
set search_path = public
as $$
declare request public.approval_requests;
declare approver_role text;
declare posted_entry public.journal_entries;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into request from public.approval_requests where id = target_id for update;
  if request.id is null then raise exception 'Approval request not found'; end if;
  if request.status <> 'pending' then raise exception 'Approval request is no longer pending'; end if;
  if request.requested_by = auth.uid() then raise exception 'Self-approval is not allowed'; end if;
  if now() >= request.expires_at then raise exception 'Approval request has expired'; end if;
  if decision not in ('approved', 'rejected') or length(trim(decision_reason_input)) = 0 then raise exception 'Valid decision and reason are required'; end if;
  select role_code into approver_role from public.organization_memberships where organization_id = request.organization_id and user_id = auth.uid() and active;
  if approver_role not in ('owner', 'manager') then raise exception 'User cannot decide approvals'; end if;
  if decision = 'approved' then
    perform public.require_aal2();
    if request.action_type = 'fx_trade' then
      posted_entry := public.record_fx_trade(request.payload_summary || jsonb_build_object('approval_id', request.id));
    end if;
  end if;
  update public.approval_requests set status = decision, decided_by = auth.uid(), decided_at = now(), decision_reason = trim(decision_reason_input) where id = target_id returning * into request;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
    values (request.organization_id, auth.uid(), 'approval_decided', jsonb_build_object('approval_id', request.id, 'decision', decision, 'requester', request.requested_by, 'posted_entry_id', posted_entry.id, 'aal', auth.jwt()->>'aal'));
  return request;
end;
$$;

revoke all on function public.request_fx_trade_approval(jsonb) from public;
grant execute on function public.request_fx_trade_approval(jsonb) to authenticated;
