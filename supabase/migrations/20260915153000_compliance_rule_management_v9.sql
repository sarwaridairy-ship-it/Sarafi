-- Organizations intentionally fail closed when no compliance policy is active.
-- Give an authorized, AAL2-verified administrator an auditable way to activate
-- the first policy or replace it without mutating historical rule versions.

create or replace function public.configure_compliance_rule_set_v9(command jsonb)
returns public.compliance_rule_sets
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  version_value text := trim(coalesce(command->>'version', ''));
  source_value text := nullif(trim(command->>'source_reference'), '');
  transaction_threshold numeric := nullif(command->>'transaction_threshold_afn', '')::numeric;
  aggregation_hours integer := nullif(command->>'aggregation_window_hours', '')::integer;
  kyc_threshold numeric := nullif(command->>'kyc_threshold_afn', '')::numeric;
  edd_threshold numeric := nullif(command->>'edd_threshold_afn', '')::numeric;
  retention_years_value integer := coalesce(nullif(command->>'retention_years', '')::integer, 7);
  screening_value boolean := coalesce((command->>'screening_required')::boolean, true);
  required_documents_value text[] := coalesce(
    array(select jsonb_array_elements_text(coalesce(command->'required_documents', '[]'::jsonb))),
    '{}'::text[]
  );
  result public.compliance_rule_sets;
begin
  if org_id is null then raise exception 'COMPLIANCE_ORGANIZATION_REQUIRED'; end if;
  perform public.require_capability(org_id, 'compliance.review', '{}'::jsonb);
  perform public.require_aal2();
  if version_value !~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$' then
    raise exception 'COMPLIANCE_VERSION_INVALID: Use 2 to 64 letters, numbers, dots, dashes, or underscores';
  end if;
  if source_value is null then raise exception 'COMPLIANCE_SOURCE_REQUIRED'; end if;
  if transaction_threshold is not null and transaction_threshold <= 0 then raise exception 'COMPLIANCE_THRESHOLD_INVALID'; end if;
  if aggregation_hours is not null and aggregation_hours <= 0 then raise exception 'COMPLIANCE_WINDOW_INVALID'; end if;
  if kyc_threshold is not null and kyc_threshold <= 0 then raise exception 'COMPLIANCE_KYC_THRESHOLD_INVALID'; end if;
  if edd_threshold is not null and edd_threshold <= 0 then raise exception 'COMPLIANCE_EDD_THRESHOLD_INVALID'; end if;
  if kyc_threshold is not null and transaction_threshold is not null and kyc_threshold < transaction_threshold then
    raise exception 'COMPLIANCE_THRESHOLD_ORDER_INVALID: KYC threshold must not be below the transaction-review threshold';
  end if;
  if edd_threshold is not null and kyc_threshold is not null and edd_threshold < kyc_threshold then
    raise exception 'COMPLIANCE_THRESHOLD_ORDER_INVALID: EDD threshold must not be below the KYC threshold';
  end if;
  if retention_years_value < 1 or retention_years_value > 30 then raise exception 'COMPLIANCE_RETENTION_INVALID'; end if;
  if exists (select 1 from unnest(required_documents_value) document where document !~ '^[a-z0-9][a-z0-9_:-]{1,63}$') then
    raise exception 'COMPLIANCE_DOCUMENT_CODE_INVALID';
  end if;
  if exists (
    select 1 from public.compliance_rule_sets r
    where r.organization_id = org_id and r.version = version_value
  ) then raise exception 'COMPLIANCE_VERSION_EXISTS: Rule-set versions are immutable'; end if;

  update public.compliance_rule_sets
  set status = 'retired', effective_to = coalesce(effective_to, now())
  where organization_id = org_id and status = 'active';

  insert into public.compliance_rule_sets (
    organization_id, version, source_reference, status, effective_from,
    transaction_threshold_afn, aggregation_window_hours, kyc_threshold_afn,
    edd_threshold_afn, retention_years, required_documents,
    screening_required, created_by
  ) values (
    org_id, version_value, source_value, 'active', now(),
    transaction_threshold, aggregation_hours, kyc_threshold,
    edd_threshold, retention_years_value, required_documents_value,
    screening_value, (select auth.uid())
  ) returning * into result;

  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (org_id, (select auth.uid()), 'compliance_rule_set_activated', jsonb_build_object(
    'rule_set_id', result.id,
    'version', result.version,
    'source_reference', result.source_reference,
    'screening_required', result.screening_required,
    'required_documents', result.required_documents
  ));
  return result;
end;
$$;

revoke all on function public.configure_compliance_rule_set_v9(jsonb) from public, anon;
grant execute on function public.configure_compliance_rule_set_v9(jsonb) to authenticated;
