-- Approval execution runs as the approver; do not reuse the requester device identity.
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
      posted_entry := public.record_fx_trade((request.payload_summary - 'device_id') || jsonb_build_object('approval_id', request.id));
    end if;
  end if;
  update public.approval_requests set status = decision, decided_by = auth.uid(), decided_at = now(), decision_reason = trim(decision_reason_input) where id = target_id returning * into request;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
    values (request.organization_id, auth.uid(), 'approval_decided', jsonb_build_object('approval_id', request.id, 'decision', decision, 'requester', request.requested_by, 'posted_entry_id', posted_entry.id, 'aal', auth.jwt()->>'aal'));
  return request;
end;
$$;
