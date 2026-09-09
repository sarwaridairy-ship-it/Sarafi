-- V6 revokes browser SELECT on counterparties, so storage/attachment policies
-- must not query that table as the calling role. This helper keeps the lookup
-- server-side while still requiring the caller's explicit document capability.
create or replace function public.private_document_upload_target_is_valid(
  target_org uuid,
  target_counterparty uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    public.has_capability(target_org, 'documents.upload', '{}'::jsonb)
    and exists (
      select 1
      from public.counterparties cp
      where cp.organization_id = target_org
        and cp.id = target_counterparty
    );
$$;

revoke all on function public.private_document_upload_target_is_valid(uuid, uuid)
  from public, anon;
grant execute on function public.private_document_upload_target_is_valid(uuid, uuid)
  to authenticated;

drop policy if exists attachments_document_insert on public.attachments;
create policy attachments_document_insert on public.attachments
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and entity_type like 'counterparty:%'
    and storage_path like organization_id::text || '/' || entity_id::text || '/%'
    and public.private_document_upload_target_is_valid(organization_id, entity_id)
  );

drop policy if exists private_documents_capability_insert on storage.objects;
create policy private_documents_capability_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sarafi-private-documents'
    and public.private_document_org_id(name) is not null
    and public.private_document_entity_id(name) is not null
    and public.private_document_upload_target_is_valid(
      public.private_document_org_id(name),
      public.private_document_entity_id(name)
    )
  );
