-- SARAFI v9: exact App Lock capability split, fresh-grant enforcement, and
-- organization-controlled one-or-two image Hawala identity evidence.

insert into public.capability_definitions (capability_code, description, owner_only) values
  ('app_lock.self.manage', 'Manage the signed-in member app lock on their own trusted device', false),
  ('app_lock.policy.manage', 'Manage organization App Lock policy', false),
  ('app_lock.unlock', 'Unlock the signed-in member app on their own trusted device', false),
  ('app_lock.sensitive_action', 'Use a fresh App Lock grant for a sensitive action', false)
on conflict (capability_code) do update
set description = excluded.description, owner_only = excluded.owner_only;

insert into public.role_capabilities (role_code, capability_code)
select role_code, capability_code
from (
  values
    ('owner', array['app_lock.self.manage','app_lock.policy.manage','app_lock.unlock','app_lock.sensitive_action']::text[]),
    ('business_admin', array['app_lock.self.manage','app_lock.policy.manage','app_lock.unlock','app_lock.sensitive_action']::text[]),
    ('manager', array['app_lock.self.manage','app_lock.unlock','app_lock.sensitive_action']::text[]),
    ('accountant', array['app_lock.self.manage','app_lock.unlock','app_lock.sensitive_action']::text[]),
    ('cashier', array['app_lock.self.manage','app_lock.unlock','app_lock.sensitive_action']::text[]),
    ('compliance_officer', array['app_lock.self.manage','app_lock.unlock','app_lock.sensitive_action']::text[]),
    ('viewer', array['app_lock.self.manage','app_lock.unlock','app_lock.sensitive_action']::text[])
) as defaults(role_code, capability_codes)
cross join lateral unnest(defaults.capability_codes) as capability_code
on conflict (role_code, capability_code) do nothing;

alter table public.organization_settings
  add column if not exists hawala_tazkira_images_required smallint not null default 1,
  add column if not exists app_lock_required_roles text[] not null default '{}'::text[],
  add column if not exists app_lock_max_timeout_seconds integer not null default 900,
  add column if not exists app_lock_sensitive_reunlock_seconds integer not null default 300;

alter table public.organization_settings
  drop constraint if exists organization_settings_hawala_tazkira_images_required_check,
  drop constraint if exists organization_settings_app_lock_max_timeout_seconds_check,
  drop constraint if exists organization_settings_app_lock_sensitive_reunlock_seconds_check;
alter table public.organization_settings
  add constraint organization_settings_hawala_tazkira_images_required_check
    check (hawala_tazkira_images_required in (1, 2)),
  add constraint organization_settings_app_lock_max_timeout_seconds_check
    check (app_lock_max_timeout_seconds in (30, 60, 300, 900)),
  add constraint organization_settings_app_lock_sensitive_reunlock_seconds_check
    check (app_lock_sensitive_reunlock_seconds between 30 and 900);

create or replace function public.update_app_lock_policy(target_org uuid, command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  required_roles_value text[] := coalesce(array(select jsonb_array_elements_text(coalesce(command->'required_roles', '[]'::jsonb))), '{}'::text[]);
  max_timeout_value integer := coalesce((command->>'max_timeout_seconds')::integer, 900);
  sensitive_reunlock_value integer := coalesce((command->>'sensitive_reunlock_seconds')::integer, 300);
  tazkira_images_value smallint := coalesce((command->>'hawala_tazkira_images_required')::smallint, 1);
  result public.organization_settings;
begin
  perform public.require_capability(target_org, 'app_lock.policy.manage', '{}'::jsonb);
  perform public.require_aal2();
  if exists (
    select 1 from unnest(required_roles_value) role_code
    where role_code not in ('owner','business_admin','manager','accountant','cashier','compliance_officer','viewer')
  ) then
    raise exception 'APP_LOCK_POLICY_INVALID: Unsupported role';
  end if;
  if max_timeout_value not in (30, 60, 300, 900) then
    raise exception 'APP_LOCK_POLICY_INVALID: Unsupported maximum timeout';
  end if;
  if sensitive_reunlock_value < 30 or sensitive_reunlock_value > 900 then
    raise exception 'APP_LOCK_POLICY_INVALID: Sensitive unlock duration must be between 30 and 900 seconds';
  end if;
  if tazkira_images_value not in (1, 2) then
    raise exception 'APP_LOCK_POLICY_INVALID: Hawala identity policy must require one or two images';
  end if;
  update public.organization_settings
  set app_lock_required_roles = (select coalesce(array_agg(distinct role_code order by role_code), '{}'::text[]) from unnest(required_roles_value) role_code),
      app_lock_max_timeout_seconds = max_timeout_value,
      app_lock_sensitive_reunlock_seconds = sensitive_reunlock_value,
      hawala_tazkira_images_required = tazkira_images_value,
      updated_at = now()
  where organization_id = target_org
  returning * into result;
  if result.organization_id is null then
    raise exception 'ORGANIZATION_SETTINGS_NOT_FOUND: App Lock policy could not be saved';
  end if;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (target_org, (select auth.uid()), 'app_lock_policy_updated', jsonb_build_object(
    'required_roles', result.app_lock_required_roles,
    'max_timeout_seconds', result.app_lock_max_timeout_seconds,
    'sensitive_reunlock_seconds', result.app_lock_sensitive_reunlock_seconds,
    'hawala_tazkira_images_required', result.hawala_tazkira_images_required
  ));
  return jsonb_build_object(
    'required_roles', result.app_lock_required_roles,
    'max_timeout_seconds', result.app_lock_max_timeout_seconds,
    'sensitive_reunlock_seconds', result.app_lock_sensitive_reunlock_seconds,
    'hawala_tazkira_images_required', result.hawala_tazkira_images_required
  );
end;
$$;
revoke all on function public.update_app_lock_policy(uuid, jsonb) from public, anon;
grant execute on function public.update_app_lock_policy(uuid, jsonb) to authenticated;

create or replace function public.app_unlock_grant_is_valid(
  target_org uuid,
  target_device uuid,
  raw_grant text,
  required_purpose text default 'sensitive_actions'
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select target_device is not null
    and nullif(raw_grant, '') is not null
    and public.has_capability(target_org, 'app_lock.sensitive_action', '{}'::jsonb)
    and exists (
      select 1
      from public.app_unlock_grants g
      join public.devices d on d.id = g.device_id
      where g.organization_id = target_org
        and g.user_id = (select auth.uid())
        and g.device_id = target_device
        and g.purpose = required_purpose
        and g.grant_sha256 = encode(extensions.digest(raw_grant, 'sha256'), 'hex')
        and g.revoked_at is null
        and g.expires_at > now()
        and d.organization_id = target_org
        and d.user_id = (select auth.uid())
        and d.status <> 'revoked'
    );
$$;
revoke all on function public.app_unlock_grant_is_valid(uuid, uuid, text, text) from public, anon, authenticated;

drop function if exists public.authorize_private_document_access(uuid, uuid, text);
create function public.authorize_private_document_access(
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
  capability_value text;
begin
  if requested_action not in ('view', 'download') then
    raise exception 'DOCUMENT_ACTION_INVALID: Access action must be view or download';
  end if;
  capability_value := case when requested_action = 'download' then 'documents.download' else 'documents.view' end;
  perform public.require_capability(target_org, capability_value, '{}');
  if not public.app_unlock_grant_is_valid(target_org, target_device, raw_grant, 'sensitive_actions') then
    raise exception 'APP_UNLOCK_REQUIRED: Unlock the app again before opening this private document';
  end if;
  select a.* into attachment_row
  from public.attachments a
  where a.id = target_document
    and a.organization_id = target_org
    and a.archived_at is null;
  if attachment_row.id is null then
    raise exception 'DOCUMENT_NOT_FOUND: Active private document is unavailable';
  end if;
  if attachment_row.storage_path not like target_org::text || '/' || attachment_row.entity_id::text || '/%' then
    raise exception 'DOCUMENT_PATH_INVALID: Stored path does not match document tenancy';
  end if;
  insert into public.compliance_audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id
  ) values (
    target_org, (select auth.uid()), requested_action,
    'private_document', target_document
  ) returning * into audit_row;
  return jsonb_build_object(
    'document_id', attachment_row.id,
    'storage_path', attachment_row.storage_path,
    'content_type', attachment_row.content_type,
    'size_bytes', attachment_row.size_bytes,
    'sha256', attachment_row.sha256,
    'expires_in', 300,
    'audit_event_id', audit_row.id
  );
end;
$$;
revoke all on function public.authorize_private_document_access(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.authorize_private_document_access(uuid, uuid, uuid, text, text) to authenticated;

-- Creating a Hawala-partner person must immediately create the canonical
-- partner record used by the exact endpoint model. This keeps the normal
-- customer form usable without exposing database ids to an owner.
create or replace function public.sync_hawala_partner_from_counterparty_v9()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare existing_partner_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text || ':' || new.id::text, 0));
  select hp.id into existing_partner_id
  from public.hawala_partners hp
  where hp.organization_id = new.organization_id and hp.counterparty_id = new.id
  order by hp.id limit 1 for update;
  if new.counterparty_type in ('saraf', 'hawala_partner') then
    if existing_partner_id is null then
      insert into public.hawala_partners (organization_id, counterparty_id, name, active)
      values (new.organization_id, new.id, new.display_name, new.risk_status <> 'blocked');
    else
      update public.hawala_partners
      set name = new.display_name, active = new.risk_status <> 'blocked'
      where id = existing_partner_id;
    end if;
  elsif existing_partner_id is not null then
    update public.hawala_partners set active = false where id = existing_partner_id;
  end if;
  return new;
end;
$$;
drop trigger if exists sync_hawala_partner_from_counterparty_v9 on public.counterparties;
create trigger sync_hawala_partner_from_counterparty_v9
after insert or update of display_name, counterparty_type, risk_status on public.counterparties
for each row execute function public.sync_hawala_partner_from_counterparty_v9();
revoke all on function public.sync_hawala_partner_from_counterparty_v9() from public, anon, authenticated;

-- A payout draft owns private identity evidence until the exact payout is
-- posted. Retrying reuses the same command id and images; failed financial
-- posting therefore leaves a recoverable draft rather than orphaned evidence.
create table if not exists public.hawala_payout_drafts (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transfer_id uuid not null references public.hawala_transfers(id) on delete cascade,
  recipient_branch_id uuid not null references public.branches(id),
  created_by uuid not null references auth.users(id),
  device_id uuid not null references public.devices(id),
  client_command_id text not null,
  status text not null default 'open' check (status in ('open', 'awaiting_approval', 'completed', 'expired')),
  money_account_id uuid references public.money_accounts(id),
  recipient_identity_reference text,
  completed_journal_entry_id uuid references public.journal_entries(id),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_command_id)
);

create unique index if not exists hawala_payout_drafts_active_transfer_user_idx
  on public.hawala_payout_drafts (organization_id, transfer_id, created_by)
  where status in ('open', 'awaiting_approval');
create index if not exists hawala_payout_drafts_expiry_idx
  on public.hawala_payout_drafts (expires_at)
  where status in ('open', 'awaiting_approval');

alter table public.hawala_payout_drafts enable row level security;
drop policy if exists hawala_payout_drafts_own_read_v9 on public.hawala_payout_drafts;
create policy hawala_payout_drafts_own_read_v9 on public.hawala_payout_drafts
  for select to authenticated
  using (
    created_by = (select auth.uid())
    and public.has_capability(
      organization_id,
      'hawala.payout',
      jsonb_build_object('branch_id', recipient_branch_id, 'feature', 'hawala', 'requires_active_plan', true)
    )
  );

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
  select public.has_capability(target_org, 'documents.upload', '{}'::jsonb)
    and (
      exists (
        select 1 from public.counterparties cp
        where cp.organization_id = target_org and cp.id = target_counterparty
      )
      or exists (
        select 1 from public.hawala_transfers h
        where h.id = target_counterparty
          and (h.organization_id = target_org or h.recipient_organization_id = target_org)
          and public.has_capability(target_org, 'hawala.payout', jsonb_build_object(
            'branch_id', case when h.recipient_organization_id = target_org then h.recipient_branch_id else h.branch_id end,
            'feature', 'hawala', 'requires_active_plan', true
          ))
      )
      or exists (
        select 1
        from public.hawala_payout_drafts d
        join public.hawala_transfers h on h.id = d.transfer_id
        where d.id = target_counterparty
          and d.organization_id = target_org
          and d.created_by = (select auth.uid())
          and d.status in ('open', 'awaiting_approval')
          and d.expires_at > now()
          and h.recipient_organization_id = target_org
          and h.recipient_branch_id = d.recipient_branch_id
          and h.status = 'ready'
          and public.has_capability(target_org, 'hawala.payout', jsonb_build_object(
            'branch_id', d.recipient_branch_id, 'feature', 'hawala', 'requires_active_plan', true
          ))
      )
    );
$$;
revoke all on function public.private_document_upload_target_is_valid(uuid, uuid) from public, anon;
grant execute on function public.private_document_upload_target_is_valid(uuid, uuid) to authenticated;

drop policy if exists attachments_document_insert on public.attachments;
create policy attachments_document_insert on public.attachments
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (
      entity_type like 'counterparty:%'
      or entity_type in (
        'hawala:tazkira_front', 'hawala:tazkira_back',
        'hawala_payout_draft:tazkira_front', 'hawala_payout_draft:tazkira_back'
      )
    )
    and storage_path like organization_id::text || '/' || entity_id::text || '/%'
    and public.private_document_upload_target_is_valid(organization_id, entity_id)
  );

create or replace function public.begin_hawala_payout_v9(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  transfer_id_value uuid := nullif(command->>'transfer_id', '')::uuid;
  device_id_value uuid := nullif(command->>'device_id', '')::uuid;
  requested_client_id text := nullif(trim(command->>'client_command_id'), '');
  actor_id uuid := (select auth.uid());
  transfer_row public.hawala_transfers;
  draft_row public.hawala_payout_drafts;
begin
  if actor_id is null then raise exception 'AUTH_REQUIRED: Authentication required'; end if;
  if org_id is null or transfer_id_value is null or device_id_value is null or requested_client_id is null then
    raise exception 'HAWALA_PAYOUT_DRAFT_DETAILS_REQUIRED: Transfer, trusted device, and command id are required';
  end if;

  update public.attachments a
  set archived_at = coalesce(a.archived_at, now()),
      archived_by = coalesce(a.archived_by, actor_id),
      archive_reason = coalesce(a.archive_reason, 'Expired uncompleted Hawala payout draft')
  where a.organization_id = org_id
    and a.archived_at is null
    and a.entity_type like 'hawala_payout_draft:%'
    and a.entity_id in (
      select d.id from public.hawala_payout_drafts d
      where d.organization_id = org_id and d.created_by = actor_id
        and d.status in ('open', 'awaiting_approval') and d.expires_at <= now()
    );
  update public.hawala_payout_drafts
  set status = 'expired', updated_at = now()
  where organization_id = org_id and created_by = actor_id
    and status in ('open', 'awaiting_approval') and expires_at <= now();

  select h.* into transfer_row
  from public.hawala_transfers h
  where h.id = transfer_id_value
    and h.recipient_organization_id = org_id
    and h.recipient_branch_id is not null
    and h.status = 'ready'
    and h.integrity_state = 'valid'
    and h.expires_at > now();
  if transfer_row.id is null then
    raise exception 'HAWALA_NOT_READY: No payable incoming transfer matches this exact Hawala';
  end if;
  perform public.require_capability(org_id, 'hawala.payout', jsonb_build_object(
    'branch_id', transfer_row.recipient_branch_id,
    'amount_native', transfer_row.amount,
    'amount_base', transfer_row.base_amount,
    'currency', transfer_row.currency_code,
    'feature', 'hawala', 'requires_active_plan', true,
    'device_id', device_id_value
  ));
  if not exists (
    select 1 from public.devices d
    where d.id = device_id_value and d.organization_id = org_id
      and d.user_id = actor_id and d.status = 'trusted'
  ) then raise exception 'TRUSTED_DEVICE_REQUIRED: Payout evidence requires the current trusted device'; end if;

  select d.* into draft_row
  from public.hawala_payout_drafts d
  where d.organization_id = org_id and d.transfer_id = transfer_id_value
    and d.created_by = actor_id and d.status in ('open', 'awaiting_approval')
    and d.expires_at > now()
  for update;
  if draft_row.id is null then
    insert into public.hawala_payout_drafts (
      organization_id, transfer_id, recipient_branch_id, created_by, device_id, client_command_id
    ) values (
      org_id, transfer_row.id, transfer_row.recipient_branch_id, actor_id, device_id_value, requested_client_id
    ) returning * into draft_row;
    insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
    values (org_id, actor_id, 'hawala_payout_draft_created', jsonb_build_object(
      'draft_id', draft_row.id, 'transfer_id', transfer_row.id, 'branch_id', transfer_row.recipient_branch_id,
      'device_id', device_id_value
    ));
  elsif draft_row.device_id <> device_id_value then
    raise exception 'HAWALA_PAYOUT_DRAFT_DEVICE_MISMATCH: Resume this payout on the trusted device that captured the evidence';
  end if;

  return jsonb_build_object(
    'id', draft_row.id,
    'transfer_id', draft_row.transfer_id,
    'client_command_id', draft_row.client_command_id,
    'status', draft_row.status,
    'expires_at', draft_row.expires_at,
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'side', split_part(a.entity_type, ':', 2),
        'sha256', a.sha256,
        'content_type', a.content_type,
        'size_bytes', a.size_bytes
      ) order by a.created_at, a.id)
      from public.attachments a
      where a.organization_id = org_id and a.entity_id = draft_row.id
        and a.entity_type in ('hawala_payout_draft:tazkira_front', 'hawala_payout_draft:tazkira_back')
        and a.archived_at is null
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.begin_hawala_payout_v9(jsonb) from public, anon;
grant execute on function public.begin_hawala_payout_v9(jsonb) to authenticated;

create or replace function public.complete_hawala_payout_v9(command jsonb)
returns public.hawala_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  draft_id_value uuid := nullif(command->>'payout_draft_id', '')::uuid;
  actor_id uuid := (select auth.uid());
  draft_row public.hawala_payout_drafts;
  transfer_row public.hawala_transfers;
  evidence_ids jsonb;
  required_images integer := 1;
begin
  if actor_id is null then raise exception 'AUTH_REQUIRED: Authentication required'; end if;
  select d.* into draft_row
  from public.hawala_payout_drafts d
  where d.id = draft_id_value and d.organization_id = org_id and d.created_by = actor_id
  for update;
  if draft_row.id is null then raise exception 'HAWALA_PAYOUT_DRAFT_REQUIRED: Begin or resume the exact payout first'; end if;
  if draft_row.status = 'completed' and draft_row.completed_journal_entry_id is not null then
    select h.* into transfer_row from public.hawala_transfers h
    where h.id = draft_row.transfer_id and h.payout_journal_entry_id = draft_row.completed_journal_entry_id;
    if transfer_row.id is not null then return transfer_row; end if;
  end if;
  if draft_row.status not in ('open', 'awaiting_approval') or draft_row.expires_at <= now() then
    raise exception 'HAWALA_PAYOUT_DRAFT_EXPIRED: Start a new payout review';
  end if;
  if nullif(command->>'device_id', '')::uuid is distinct from draft_row.device_id then
    raise exception 'HAWALA_PAYOUT_DRAFT_DEVICE_MISMATCH: Resume this payout on its trusted device';
  end if;

  select coalesce(os.hawala_tazkira_images_required, 1) into required_images
  from public.organization_settings os where os.organization_id = org_id;
  required_images := coalesce(required_images, 1);
  select coalesce(jsonb_agg(to_jsonb(a.id) order by a.created_at, a.id), '[]'::jsonb) into evidence_ids
  from public.attachments a
  where a.organization_id = org_id and a.entity_id = draft_row.id
    and a.entity_type in ('hawala_payout_draft:tazkira_front', 'hawala_payout_draft:tazkira_back')
    and a.archived_at is null and a.uploaded_by = actor_id;
  if jsonb_array_length(evidence_ids) < required_images or jsonb_array_length(evidence_ids) > 2 then
    raise exception 'HAWALA_IDENTITY_DOCUMENTS_REQUIRED: One clear Tazkira photo is required; organization policy may require two';
  end if;

  update public.hawala_payout_drafts
  set money_account_id = nullif(command->>'money_account_id', '')::uuid,
      recipient_identity_reference = nullif(trim(command->>'recipient_identity_reference'), ''),
      updated_at = now()
  where id = draft_row.id;
  transfer_row := public.pay_hawala_beneficiary(
    command || jsonb_build_object(
      'client_command_id', draft_row.client_command_id,
      'payout_draft_id', draft_row.id,
      'transfer_id', draft_row.transfer_id,
      'identity_document_ids', evidence_ids
    )
  );
  update public.hawala_payout_drafts
  set status = 'completed', completed_journal_entry_id = transfer_row.payout_journal_entry_id, updated_at = now()
  where id = draft_row.id;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (org_id, actor_id, 'hawala_payout_draft_completed', jsonb_build_object(
    'draft_id', draft_row.id, 'transfer_id', transfer_row.id,
    'journal_entry_id', transfer_row.payout_journal_entry_id,
    'identity_document_ids', evidence_ids
  ));
  return transfer_row;
end;
$$;
revoke all on function public.complete_hawala_payout_v9(jsonb) from public, anon;
grant execute on function public.complete_hawala_payout_v9(jsonb) to authenticated;

create or replace function public.enforce_hawala_payout_documents_v7()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  evidence_ids jsonb;
  matching_documents integer;
  required_images integer := 1;
  evidence_org uuid;
  payout_draft_id_value uuid;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    evidence_org := coalesce(new.recipient_organization_id, new.organization_id);
    if not public.app_unlock_grant_is_valid(evidence_org, (
      select nullif(fe.metadata->>'device_id', '')::uuid
      from public.journal_entries je
      join public.financial_events fe on fe.id = je.financial_event_id
      where je.id = new.payout_journal_entry_id
    ), coalesce((
      select fe.metadata->>'app_unlock_grant'
      from public.journal_entries je
      join public.financial_events fe on fe.id = je.financial_event_id
      where je.id = new.payout_journal_entry_id
    ), ''), 'sensitive_actions') then
      raise exception 'APP_UNLOCK_REQUIRED: Unlock the app again before this payout';
    end if;

    select coalesce(os.hawala_tazkira_images_required, 1)
      into required_images
    from public.organization_settings os
    where os.organization_id = evidence_org;
    required_images := coalesce(required_images, 1);

    select fe.metadata->'identity_document_ids', nullif(fe.metadata->>'payout_draft_id', '')::uuid
      into evidence_ids, payout_draft_id_value
    from public.journal_entries je
    join public.financial_events fe on fe.id = je.financial_event_id
    where je.id = new.payout_journal_entry_id;
    if payout_draft_id_value is null
       or not exists (
         select 1 from public.hawala_payout_drafts d
         where d.id = payout_draft_id_value and d.organization_id = evidence_org
           and d.transfer_id = new.id and d.created_by = (select auth.uid())
           and d.status in ('open', 'awaiting_approval') and d.expires_at > now()
       )
       or evidence_ids is null
       or jsonb_typeof(evidence_ids) <> 'array'
       or jsonb_array_length(evidence_ids) < required_images
       or jsonb_array_length(evidence_ids) > 2 then
      raise exception 'HAWALA_IDENTITY_DOCUMENTS_REQUIRED: One clear Tazkira photo is required; organization policy may require two';
    end if;

    select count(*) into matching_documents
    from public.attachments a
    where a.organization_id = evidence_org
      and a.entity_id = payout_draft_id_value
      and a.archived_at is null
      and a.entity_type in ('hawala_payout_draft:tazkira_front', 'hawala_payout_draft:tazkira_back')
      and a.id in (
        select evidence.document_id::uuid
        from jsonb_array_elements_text(evidence_ids) as evidence(document_id)
      );
    if matching_documents <> jsonb_array_length(evidence_ids) then
      raise exception 'HAWALA_IDENTITY_DOCUMENTS_INVALID: Every private Tazkira image must belong to this exact transfer';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_hawala_payout_documents_v7() from public, anon, authenticated;

create or replace function public.resume_approved_hawala_payout(target_approval uuid)
returns public.hawala_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval_row public.approval_requests;
  command jsonb;
  result public.hawala_transfers;
begin
  select a.* into approval_row from public.approval_requests a
  where a.id = target_approval and a.requested_by = (select auth.uid()) for update;
  if approval_row.consumed_at is not null and approval_row.consumed_journal_entry_id is not null then
    select h.* into result from public.hawala_transfers h
    where h.recipient_organization_id = approval_row.organization_id
      and h.payout_journal_entry_id = approval_row.consumed_journal_entry_id;
    if result.id is not null then return result; end if;
  end if;
  if approval_row.id is null or approval_row.action_type <> 'hawala_payout'
     or approval_row.status <> 'approved' or approval_row.expires_at <= now()
     or approval_row.consumed_at is not null then
    raise exception 'APPROVAL_INVALID: Approved, unexpired, unused Hawala payout approval required';
  end if;
  command := coalesce(approval_row.draft_payload, approval_row.payload_summary)
    || jsonb_build_object('approval_id', approval_row.id);
  return public.complete_hawala_payout_v9(command);
end;
$$;
revoke all on function public.resume_approved_hawala_payout(uuid) from public, anon;
grant execute on function public.resume_approved_hawala_payout(uuid) to authenticated;

-- My Money uses the same approved shop rate board as transactions. Historical
-- snapshots resolve freshness against the organization's business day, never
-- against an unrelated valuation-rate set or the database server's UTC date.
create or replace function public.get_money_valuation_snapshot(
  target_org uuid,
  target_business_date date default current_date,
  target_comparison_currency text default 'USD',
  target_scope jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  base_currency_value text;
  comparison_currency_value text := upper(trim(coalesce(target_comparison_currency, 'USD')));
  branch_scope uuid := nullif(target_scope->>'branch_id', '')::uuid;
  cashbox_scope uuid := nullif(target_scope->>'cashbox_id', '')::uuid;
  business_timezone text := 'Asia/Kabul';
  maximum_rate_age_minutes integer := 1440;
  business_day_end timestamptz;
  valuation_as_of timestamptz;
  rate_effective_value timestamptz;
  payload_value jsonb;
  hash_value text;
  snapshot_id_value uuid;
  snapshot_created_at_value timestamptz;
begin
  perform public.require_capability(
    target_org,
    'financial.overview',
    jsonb_strip_nulls(jsonb_build_object('branch_id', branch_scope, 'cashbox_id', cashbox_scope))
  );

  select o.base_currency_code,
         coalesce(os.timezone, 'Asia/Kabul'),
         coalesce(os.rate_max_age_minutes, 1440)
    into base_currency_value, business_timezone, maximum_rate_age_minutes
  from public.organizations o
  left join public.organization_settings os on os.organization_id = o.id
  where o.id = target_org;
  if base_currency_value is null then
    raise exception 'ORGANIZATION_NOT_FOUND: Money valuation is unavailable';
  end if;
  if not exists (select 1 from public.currencies c where c.code = comparison_currency_value and c.active) then
    raise exception 'COMPARISON_CURRENCY_INVALID: Select an active currency';
  end if;

  business_day_end := ((target_business_date + 1)::timestamp at time zone business_timezone);
  valuation_as_of := least(now(), business_day_end);

  with allowed_accounts as (
    select ma.*
    from public.money_accounts ma
    where ma.organization_id = target_org
      and ma.active
      and public.user_can_use_money_account(target_org, ma.id)
      and (branch_scope is null or ma.branch_id = branch_scope)
      and (cashbox_scope is null or ma.cashbox_id = cashbox_scope)
  ),
  available as (
    select jl.currency_code,
      sum(jl.native_debit - jl.native_credit) as amount,
      sum(jl.base_debit - jl.base_credit) as book_base
    from allowed_accounts ma
    join public.ledger_accounts la on la.money_account_id = ma.id
    join public.journal_lines jl on jl.account_id = la.id
    join public.journal_entries je on je.id = jl.journal_entry_id and je.status = 'posted'
    where je.occurred_at < business_day_end
    group by jl.currency_code
  ),
  debt_positions as (
    select d.currency_code,
      sum(case when d.direction = 'receivable' then d.outstanding_amount else 0 end) as receivable,
      sum(case when d.direction = 'payable' then d.outstanding_amount else 0 end) as payable
    from public.debts d
    where d.organization_id = target_org
      and d.outstanding_amount > 0
      and d.created_at < business_day_end
      and public.can_access_branch_v6(target_org, d.branch_id, 'financial.overview')
      and (branch_scope is null or d.branch_id = branch_scope)
    group by d.currency_code
  ),
  hawala_positions as (
    select h.currency_code,
      sum(case when l.direction = 'receivable'
        then l.original_amount - l.settled_amount
        else -(l.original_amount - l.settled_amount)
      end) as net
    from public.hawala_partner_statement_lines l
    join public.hawala_transfers h on h.id = l.transfer_id and h.organization_id = target_org
    where l.status in ('open', 'partial')
      and h.created_at < business_day_end
      and public.can_access_branch_v6(target_org, h.branch_id, 'financial.overview')
      and (branch_scope is null or h.branch_id = branch_scope)
    group by h.currency_code
  ),
  currency_keys as (
    select currency_code from available
    union select currency_code from debt_positions
    union select currency_code from hawala_positions
  ),
  positions as (
    select k.currency_code,
      coalesce(a.amount, 0) as available,
      coalesce(d.receivable, 0) as receivable,
      coalesce(d.payable, 0) as payable,
      coalesce(h.net, 0) as hawala_net,
      coalesce(a.book_base, 0) as book_base,
      case when k.currency_code = base_currency_value then 1::numeric else rr.rate end as valuation_rate,
      case when k.currency_code = base_currency_value then valuation_as_of else rr.effective_at end as rate_effective_at,
      case when k.currency_code = base_currency_value then 'base_currency' else rr.source end as rate_source,
      case when k.currency_code = base_currency_value then null else rr.board_name end as rate_board,
      case when k.currency_code = base_currency_value then null else rr.changed_by end as rate_editor,
      case when k.currency_code = base_currency_value then null else rr.editor_name end as rate_editor_name,
      case
        when k.currency_code = base_currency_value then 'current'
        when rr.rate is null then 'missing'
        when rr.effective_at < valuation_as_of - make_interval(mins => maximum_rate_age_minutes) then 'stale'
        else 'current'
      end as rate_status
    from currency_keys k
    left join available a using (currency_code)
    left join debt_positions d using (currency_code)
    left join hawala_positions h using (currency_code)
    left join lateral (
      select candidate.rate, candidate.effective_at, candidate.source
      from (
        select (r.buy_rate + r.sell_rate) / 2 as rate,
               r.effective_from as effective_at,
               'daily_rate_board'::text as source,
               (select rg.name from public.rate_groups rg where rg.id = r.rate_group_id) as board_name,
               r.changed_by,
               coalesce((select nullif(p.display_name, '') from public.profiles p where p.id = r.changed_by), r.changed_by::text) as editor_name,
               case when r.branch_id is not null then 1 else 0 end as branch_rank,
               1 as direction_rank
        from public.rate_board_entries r
        where r.organization_id = target_org
          and r.active
          and exists (select 1 from public.rate_groups rg where rg.id = r.rate_group_id and rg.organization_id = target_org and rg.active)
          and r.from_currency = k.currency_code
          and r.to_currency = base_currency_value
          and r.effective_from <= valuation_as_of
          and ((branch_scope is null and r.branch_id is null)
            or (branch_scope is not null and (r.branch_id is null or r.branch_id = branch_scope)))
        union all
        select 1 / nullif((r.buy_rate + r.sell_rate) / 2, 0) as rate,
               r.effective_from as effective_at,
               'daily_rate_board_inverse'::text as source,
               (select rg.name from public.rate_groups rg where rg.id = r.rate_group_id) as board_name,
               r.changed_by,
               coalesce((select nullif(p.display_name, '') from public.profiles p where p.id = r.changed_by), r.changed_by::text) as editor_name,
               case when r.branch_id is not null then 1 else 0 end as branch_rank,
               0 as direction_rank
        from public.rate_board_entries r
        where r.organization_id = target_org
          and r.active
          and exists (select 1 from public.rate_groups rg where rg.id = r.rate_group_id and rg.organization_id = target_org and rg.active)
          and r.from_currency = base_currency_value
          and r.to_currency = k.currency_code
          and r.effective_from <= valuation_as_of
          and ((branch_scope is null and r.branch_id is null)
            or (branch_scope is not null and (r.branch_id is null or r.branch_id = branch_scope)))
      ) candidate
      order by candidate.branch_rank desc, candidate.direction_rank desc, candidate.effective_at desc
      limit 1
    ) rr on k.currency_code <> base_currency_value
  ),
  valued as (
    select p.*,
      (p.available + p.receivable - p.payable + p.hawala_net) as native_net,
      case when p.rate_status = 'current' then p.available * p.valuation_rate else null end as available_base,
      case when p.rate_status = 'current'
        then (p.available + p.receivable - p.payable + p.hawala_net) * p.valuation_rate
        else null end as current_base
    from positions p
  ),
  totals as (
    select
      not exists (select 1 from valued v where v.available <> 0 and v.rate_status <> 'current') as total_complete,
      coalesce(sum(case when rate_status = 'current' then available * valuation_rate end), 0) as available_valued_base,
      coalesce(sum(case when rate_status = 'current' then receivable * valuation_rate end), 0) as receivables_base,
      coalesce(sum(case when rate_status = 'current' then payable * valuation_rate end), 0) as payables_base,
      coalesce(sum(case when rate_status = 'current' then hawala_net * valuation_rate end), 0) as hawala_net_base,
      coalesce(sum(current_base), 0) as net_position_base,
      coalesce(sum(book_base), 0) as book_value_base,
      count(*) filter (where available <> 0 and rate_status <> 'current') as excluded_currency_count,
      coalesce(array_agg(currency_code order by currency_code) filter (where available <> 0 and rate_status = 'missing'), '{}'::text[]) as missing_currencies,
      coalesce(array_agg(currency_code order by currency_code) filter (where available <> 0 and rate_status = 'stale'), '{}'::text[]) as stale_currencies,
      max(rate_effective_at) filter (where currency_code <> base_currency_value) as latest_effective_at
    from valued
  ),
  comparison_rate as (
    select case when comparison_currency_value = base_currency_value then 1::numeric else rr.rate end as rate,
      case
        when comparison_currency_value = base_currency_value then 'current'
        when rr.rate is null then 'missing'
        when rr.effective_at < valuation_as_of - make_interval(mins => maximum_rate_age_minutes) then 'stale'
        else 'current'
      end as status
    from (select 1) seed
    left join lateral (
      select candidate.rate, candidate.effective_at
      from (
        select (r.buy_rate + r.sell_rate) / 2 as rate, r.effective_from as effective_at,
               case when r.branch_id is not null then 1 else 0 end as branch_rank, 1 as direction_rank
        from public.rate_board_entries r
        where r.organization_id = target_org
          and r.active
          and exists (select 1 from public.rate_groups rg where rg.id = r.rate_group_id and rg.organization_id = target_org and rg.active)
          and r.from_currency = comparison_currency_value
          and r.to_currency = base_currency_value
          and r.effective_from <= valuation_as_of
          and ((branch_scope is null and r.branch_id is null)
            or (branch_scope is not null and (r.branch_id is null or r.branch_id = branch_scope)))
        union all
        select 1 / nullif((r.buy_rate + r.sell_rate) / 2, 0), r.effective_from,
               case when r.branch_id is not null then 1 else 0 end, 0
        from public.rate_board_entries r
        where r.organization_id = target_org
          and r.active
          and exists (select 1 from public.rate_groups rg where rg.id = r.rate_group_id and rg.organization_id = target_org and rg.active)
          and r.from_currency = base_currency_value
          and r.to_currency = comparison_currency_value
          and r.effective_from <= valuation_as_of
          and ((branch_scope is null and r.branch_id is null)
            or (branch_scope is not null and (r.branch_id is null or r.branch_id = branch_scope)))
      ) candidate
      order by candidate.branch_rank desc, candidate.direction_rank desc, candidate.effective_at desc
      limit 1
    ) rr on comparison_currency_value <> base_currency_value
  ),
  locations as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'money_account_id', ma.id,
      'name', ma.name,
      'account_type', ma.account_type,
      'branch_id', ma.branch_id,
      'cashbox_id', ma.cashbox_id,
      'balances', coalesce(b.rows, '[]'::jsonb)
    ) order by ma.account_type, ma.name), '[]'::jsonb) as rows
    from allowed_accounts ma
    left join lateral (
      select jsonb_agg(jsonb_build_object('currency_code', q.currency_code, 'amount', q.amount::text) order by q.currency_code) as rows
      from (
        select jl.currency_code, sum(jl.native_debit - jl.native_credit) as amount
        from public.ledger_accounts la
        join public.journal_lines jl on jl.account_id = la.id
        join public.journal_entries je on je.id = jl.journal_entry_id and je.status = 'posted'
        where la.money_account_id = ma.id
          and je.occurred_at < business_day_end
        group by jl.currency_code
      ) q
    ) b on true
  )
  select jsonb_build_object(
    'snapshot_date', target_business_date,
    'business_timezone', business_timezone,
    'base_currency', base_currency_value,
    'comparison_currency', comparison_currency_value,
    'scope', coalesce(target_scope, '{}'::jsonb),
    'valuation_rate_set_id', null,
    'valuation_rate_source', 'daily_rate_board',
    'active_rate_board', (select v.rate_board from valued v where v.rate_board is not null order by v.rate_effective_at desc limit 1),
    'valuation_editor_id', (select v.rate_editor from valued v where v.rate_editor is not null order by v.rate_effective_at desc limit 1),
    'valuation_editor', (select v.rate_editor_name from valued v where v.rate_editor_name is not null order by v.rate_effective_at desc limit 1),
    'valuation_effective_at', t.latest_effective_at,
    'quality', case when t.total_complete and cr.status = 'current' then 'current' else 'partial' end,
    'total_complete', t.total_complete,
    'excluded_currency_count', t.excluded_currency_count,
    'missing_currencies', to_jsonb(t.missing_currencies),
    'stale_currencies', to_jsonb(t.stale_currencies),
    'totals', jsonb_build_object(
      'available_base', case when t.total_complete then t.available_valued_base::text else null end,
      'available_valued_base', t.available_valued_base::text,
      'receivables_base', t.receivables_base::text,
      'payables_base', t.payables_base::text,
      'hawala_net_base', t.hawala_net_base::text,
      'net_position_base', t.net_position_base::text,
      'book_value_base', t.book_value_base::text,
      'valuation_difference_base', (t.net_position_base - t.book_value_base)::text,
      'comparison_value', case when t.total_complete and cr.status = 'current' and cr.rate > 0 then (t.available_valued_base / cr.rate)::text else null end,
      'comparison_rate', case when cr.status = 'current' then cr.rate::text else null end
    ),
    'currencies', coalesce((select jsonb_agg(jsonb_build_object(
      'currency_code', v.currency_code,
      'available', v.available::text,
      'receivable', v.receivable::text,
      'payable', v.payable::text,
      'hawala_net', v.hawala_net::text,
      'native_net', v.native_net::text,
      'rate', v.valuation_rate::text,
      'rate_status', v.rate_status,
      'rate_source', v.rate_source,
      'rate_board', v.rate_board,
      'rate_editor_id', v.rate_editor,
      'rate_editor', v.rate_editor_name,
      'rate_effective_at', v.rate_effective_at,
      'available_base', v.available_base::text,
      'current_base', v.current_base::text,
      'book_base', v.book_base::text
    ) order by v.currency_code) from valued v), '[]'::jsonb),
    'locations', l.rows
  ) into payload_value
  from totals t cross join comparison_rate cr cross join locations l;

  rate_effective_value := nullif(payload_value->>'valuation_effective_at', '')::timestamptz;
  hash_value := encode(extensions.digest(payload_value::text, 'sha256'), 'hex');
  insert into public.money_valuation_snapshots (
    organization_id, snapshot_date, scope, base_currency, comparison_currency,
    valuation_rate_set_id, valuation_effective_at, snapshot_sha256, payload, created_by
  ) values (
    target_org, target_business_date, coalesce(target_scope, '{}'::jsonb), base_currency_value, comparison_currency_value,
    null, rate_effective_value, hash_value, payload_value, actor_id
  ) on conflict (organization_id, snapshot_sha256) do nothing
  returning id, created_at into snapshot_id_value, snapshot_created_at_value;

  if snapshot_id_value is null then
    select s.id, s.created_at into snapshot_id_value, snapshot_created_at_value
    from public.money_valuation_snapshots s
    where s.organization_id = target_org and s.snapshot_sha256 = hash_value;
  end if;

  return payload_value || jsonb_build_object(
    'snapshot_id', snapshot_id_value,
    'snapshot_sha256', hash_value,
    'captured_at', snapshot_created_at_value
  );
end;
$$;

revoke all on function public.get_money_valuation_snapshot(uuid, date, text, jsonb) from public, anon;
grant execute on function public.get_money_valuation_snapshot(uuid, date, text, jsonb) to authenticated;
