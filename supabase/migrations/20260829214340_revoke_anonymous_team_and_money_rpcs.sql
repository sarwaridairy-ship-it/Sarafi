-- Supabase projects may carry explicit EXECUTE grants for the anon role in
-- addition to PostgreSQL's PUBLIC grant. These privileged functions must only
-- be reachable after authentication; each function performs its own tenant,
-- role, scope, invitation, and AAL2 checks after that boundary.

revoke all on function public.get_owner_dashboard(uuid, date) from public, anon;
revoke all on function public.get_money_location_evidence(uuid) from public, anon;
revoke all on function public.get_team_control_plane(uuid) from public, anon;
revoke all on function public.create_team_invitation(uuid, text, text, text, uuid[], uuid[], boolean) from public, anon;
revoke all on function public.accept_team_invitation(text) from public, anon;
revoke all on function public.cancel_team_invitation(uuid, text) from public, anon;
revoke all on function public.update_team_membership(uuid, text, uuid[], uuid[], boolean, text) from public, anon;

grant execute on function public.get_owner_dashboard(uuid, date) to authenticated;
grant execute on function public.get_money_location_evidence(uuid) to authenticated;
grant execute on function public.get_team_control_plane(uuid) to authenticated;
grant execute on function public.create_team_invitation(uuid, text, text, text, uuid[], uuid[], boolean) to authenticated;
grant execute on function public.accept_team_invitation(text) to authenticated;
grant execute on function public.cancel_team_invitation(uuid, text) to authenticated;
grant execute on function public.update_team_membership(uuid, text, uuid[], uuid[], boolean, text) to authenticated;
