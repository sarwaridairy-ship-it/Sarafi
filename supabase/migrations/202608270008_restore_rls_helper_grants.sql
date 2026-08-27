-- RLS policies invoke these boolean predicates for anonymous/authenticated queries.
-- They return authorization state only and do not expose tenant rows or mutate data.
grant execute on function public.is_org_member(uuid) to anon, authenticated;
grant execute on function public.has_org_permission(uuid, text) to anon, authenticated;
