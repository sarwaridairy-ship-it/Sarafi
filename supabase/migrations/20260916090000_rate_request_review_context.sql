-- Keep the existing team authorization intact, but make the exact branch and
-- request lifetime visible before a manager publishes its daily rates.
alter function public.get_team_control_plane(uuid) rename to get_team_control_plane_before_branch_v11;
revoke all on function public.get_team_control_plane_before_branch_v11(uuid) from public, anon, authenticated;

create function public.get_team_control_plane(target_org uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  result := public.get_team_control_plane_before_branch_v11(target_org);
  return jsonb_set(result, '{approvals}', coalesce((
    select jsonb_agg(item.value || jsonb_build_object(
      'branch_id', a.branch_id,
      'branch_name', b.name,
      'expires_at', a.expires_at,
      'is_current_requester', a.requested_by = (select auth.uid()),
      'status', case when a.status = 'pending' and a.expires_at <= now() then 'expired' else a.status end
    ) order by item.ordinality)
    from jsonb_array_elements(result->'approvals') with ordinality item(value, ordinality)
    join public.approval_requests a on a.id = (item.value->>'id')::uuid and a.organization_id = target_org
    left join public.branches b on b.id = a.branch_id and b.organization_id = target_org
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.get_team_control_plane(uuid) from public, anon;
grant execute on function public.get_team_control_plane(uuid) to authenticated;
