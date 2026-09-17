-- A posted journal needs a real double-entry structure, not merely equal empty
-- sums. Existing data is not rewritten by this migration.

create or replace function public.assert_posted_entry_balanced()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  line_count bigint;
  debit numeric;
  credit numeric;
begin
  if new.status = 'posted' then
    select count(*), coalesce(sum(base_debit), 0), coalesce(sum(base_credit), 0)
      into line_count, debit, credit
    from public.journal_lines
    where journal_entry_id = new.id;
    if line_count < 2 then
      raise exception 'Journal entry % must contain at least two lines', new.id;
    end if;
    if debit <> credit then
      raise exception 'Journal entry % is not balanced', new.id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.get_platform_operations()
returns jsonb
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare result jsonb;
begin
  perform public.require_platform_admin(false);
  select jsonb_build_object(
    'health', jsonb_build_object(
      'database', 'healthy',
      'checked_at', now(),
      'private_storage', exists (select 1 from storage.buckets where id = 'sarafi-private-documents' and not public),
      'unbalanced_posted_entries', (
        select count(*) from (
          select je.id
          from public.journal_entries je
          left join public.journal_lines jl on jl.journal_entry_id = je.id
          where je.status = 'posted'
          group by je.id
          having count(jl.id) < 2
            or coalesce(sum(jl.base_debit), 0) <> coalesce(sum(jl.base_credit), 0)
        ) broken
      ),
      'expired_pending_approvals', (select count(*) from public.approval_requests where status = 'pending' and expires_at <= now()),
      'pending_support_requests', (select count(*) from public.support_access_requests where status = 'pending')
    ),
    'versions', coalesce((select jsonb_agg(to_jsonb(v) order by v.platform) from public.platform_app_versions v), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(a) order by a.updated_at desc) from public.platform_announcements a), '[]'::jsonb),
    'support_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'organization_id', r.organization_id, 'organization_name', o.display_name,
        'requested_scope', r.requested_scope, 'reason', r.reason,
        'requested_hours', r.requested_hours, 'status', r.status,
        'requested_at', r.requested_at, 'decided_at', r.decided_at,
        'grant_id', r.grant_id, 'expires_at', g.expires_at, 'revoked_at', g.revoked_at
      ) order by r.requested_at desc)
      from public.support_access_requests r join public.organizations o on o.id = r.organization_id
      left join public.support_access_grants g on g.id = r.grant_id
      where r.support_user_id = (select auth.uid())
    ), '[]'::jsonb),
    'organization_features', coalesce((
      select jsonb_agg(jsonb_build_object('organization_id', f.organization_id, 'feature_code', f.feature_code, 'enabled', f.enabled, 'updated_at', f.updated_at) order by f.organization_id, f.feature_code)
      from public.organization_features f
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
