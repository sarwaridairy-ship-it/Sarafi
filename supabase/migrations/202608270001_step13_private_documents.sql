-- Private counterparty document writes and access audit. Retention is append-only; no delete policy is granted.
create policy attachments_compliance_insert on public.attachments for insert with check (public.has_org_permission(organization_id, 'compliance:review'));

create or replace function public.record_sensitive_document_access(target_org uuid, target_entity uuid, action text)
returns public.compliance_audit_events
language plpgsql security definer set search_path = public
as $$
declare result public.compliance_audit_events;
begin
  if action not in ('upload', 'view', 'download', 'share', 'archive') then raise exception 'Invalid document access action'; end if;
  if not public.has_org_permission(target_org, 'compliance:review') then raise exception 'Compliance permission required'; end if;
  insert into public.compliance_audit_events (organization_id, actor_user_id, action, entity_type, entity_id)
    values (target_org, auth.uid(), action, 'counterparty_document', target_entity)
    returning * into result;
  return result;
end;
$$;
revoke all on function public.record_sensitive_document_access(uuid, uuid, text) from public;
grant execute on function public.record_sensitive_document_access(uuid, uuid, text) to authenticated;
