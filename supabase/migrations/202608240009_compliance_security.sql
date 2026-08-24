-- Stage 8: configurable compliance, KYC, screening boundary, and tamper-evident audit.
create table public.compliance_rule_sets (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, version text not null, source_reference text, status text not null default 'awaiting_legal_signoff' check (status in ('draft', 'active', 'retired', 'awaiting_legal_signoff')), effective_from timestamptz not null, effective_to timestamptz, transaction_threshold_afn numeric(38,12), aggregation_window_hours integer check (aggregation_window_hours > 0), kyc_threshold_afn numeric(38,12), edd_threshold_afn numeric(38,12), retention_years integer check (retention_years > 0), required_documents text[] not null default '{}', screening_required boolean not null default true, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), unique (organization_id, version)
);
create table public.kyc_profiles (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, counterparty_id uuid not null references public.counterparties(id) on delete cascade, legal_name text not null, father_name text, date_of_birth date, nationality text, identity_document_type text check (identity_document_type in ('tazkira', 'passport', 'other')), identity_document_number_encrypted bytea, identity_document_expiry date, address text, phone text, occupation_or_business text, purpose_of_funds text, source_of_funds text, risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high')), review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'review_required')), next_review_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, counterparty_id)
);
create table public.kyc_documents (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, kyc_profile_id uuid not null references public.kyc_profiles(id) on delete cascade, storage_path text not null, document_type text not null, content_sha256 text not null, uploaded_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.compliance_alerts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, rule_set_id uuid not null references public.compliance_rule_sets(id), source_event_id uuid references public.financial_events(id), alert_type text not null check (alert_type in ('large_transaction', 'kyc_required', 'edd_required', 'screening_required', 'document_missing', 'suspicious_pattern', 'risk_geography')), evidence jsonb not null default '{}'::jsonb, status text not null default 'open' check (status in ('open', 'under_review', 'cleared', 'reported')), reviewed_by uuid references auth.users(id), reviewed_at timestamptz, disposition_reason text, created_at timestamptz not null default now()
);
create index compliance_alert_queue_idx on public.compliance_alerts (organization_id, status, created_at desc);
create table public.compliance_cases (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, alert_id uuid not null references public.compliance_alerts(id), assigned_to uuid references auth.users(id), notes text, report_status text not null default 'draft' check (report_status in ('draft', 'ready', 'submitted', 'closed')), submitted_reference text, submitted_at timestamptz, created_at timestamptz not null default now()
);
create table public.sanctions_screenings (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, counterparty_id uuid not null references public.counterparties(id), provider_name text not null, source_version text not null, screened_name text not null, match_score numeric(8,6), potential_match boolean not null, details jsonb not null default '{}'::jsonb, resolution text check (resolution in ('pending', 'false_positive', 'confirmed', 'unable_to_verify')), reviewed_by uuid references auth.users(id), reviewed_at timestamptz, created_at timestamptz not null default now()
);
create table public.audit_checkpoints (
  id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id), previous_hash text not null, event_hash text not null, event_id uuid not null, created_at timestamptz not null default now(), unique (organization_id, event_id)
);

create or replace function public.prevent_audit_mutation() returns trigger language plpgsql as $$ begin raise exception 'Audit records are append-only'; end; $$;
create trigger audit_checkpoint_immutable before update or delete on public.audit_checkpoints for each row execute function public.prevent_audit_mutation();

create or replace function public.record_compliance_alert(target_org uuid, target_rule uuid, target_event uuid, alert_kind text, alert_evidence jsonb) returns public.compliance_alerts language plpgsql security definer set search_path = public as $$
declare result public.compliance_alerts;
begin
  if not public.has_org_permission(target_org, 'compliance:review') then raise exception 'Compliance permission required'; end if;
  if not exists (select 1 from public.compliance_rule_sets where id = target_rule and organization_id = target_org) then raise exception 'Rule set tenant mismatch'; end if;
  insert into public.compliance_alerts (organization_id, rule_set_id, source_event_id, alert_type, evidence) values (target_org, target_rule, target_event, alert_kind, alert_evidence) returning * into result;
  return result;
end; $$;
revoke all on function public.record_compliance_alert(uuid, uuid, uuid, text, jsonb) from public;
grant execute on function public.record_compliance_alert(uuid, uuid, uuid, text, jsonb) to authenticated;

alter table public.compliance_rule_sets enable row level security; alter table public.kyc_profiles enable row level security; alter table public.kyc_documents enable row level security; alter table public.compliance_alerts enable row level security; alter table public.compliance_cases enable row level security; alter table public.sanctions_screenings enable row level security; alter table public.audit_checkpoints enable row level security;
create policy compliance_rules_org_read on public.compliance_rule_sets for select using (public.is_org_member(organization_id));
create policy kyc_org_read on public.kyc_profiles for select using (public.has_org_permission(organization_id, 'compliance:review'));
create policy kyc_docs_org_read on public.kyc_documents for select using (public.has_org_permission(organization_id, 'compliance:review'));
create policy alerts_org_read on public.compliance_alerts for select using (public.has_org_permission(organization_id, 'compliance:review'));
create policy cases_org_read on public.compliance_cases for select using (public.has_org_permission(organization_id, 'compliance:review'));
create policy screening_org_read on public.sanctions_screenings for select using (public.has_org_permission(organization_id, 'compliance:review'));
create policy checkpoints_org_read on public.audit_checkpoints for select using (organization_id is null or public.is_org_member(organization_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('sarafi-private-documents', 'sarafi-private-documents', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf']) on conflict (id) do nothing;
create policy private_documents_read on storage.objects for select using (bucket_id = 'sarafi-private-documents' and public.is_org_member((storage.foldername(name))[1]::uuid));
create policy private_documents_insert on storage.objects for insert with check (bucket_id = 'sarafi-private-documents' and public.has_org_permission((storage.foldername(name))[1]::uuid, 'compliance:review'));
