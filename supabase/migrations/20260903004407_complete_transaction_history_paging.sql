-- Page through the complete permitted journal history for reports without exposing
-- rows outside the caller's organization, branch, or cashbox scope.
create or replace function public.get_transaction_history_page(
  target_org uuid,
  page_size integer default 100,
  page_offset integer default 0
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare result jsonb;
declare actor_membership uuid;
declare actor_role text;
begin
  select id, role_code into actor_membership, actor_role
  from public.organization_memberships
  where organization_id = target_org and user_id = (select auth.uid()) and active;
  if actor_membership is null or not public.is_platform_user_active() then
    raise exception 'Organization access required';
  end if;

  select coalesce(jsonb_agg(row_data order by occurred_at desc, entry_id desc), '[]'::jsonb) into result
  from (
    select je.occurred_at, je.id as entry_id, jsonb_build_object(
      'id', je.id, 'status', je.status, 'memo', je.memo, 'occurred_at', je.occurred_at,
      'branch_id', je.branch_id, 'event_type', fe.event_type,
      'immutable_reference', fe.immutable_reference,
      'source_account_name', fe.metadata->>'source_account_name',
      'destination_account_name', fe.metadata->>'destination_account_name',
      'source_account_kind', fe.metadata->>'source_account_kind',
      'destination_account_kind', fe.metadata->>'destination_account_kind',
      'cashbox_name', cb.name,
      'counterparty_name', cp.display_name,
      'employee_name', coalesce(nullif(trim(pr.display_name), ''), 'Team member'),
      'given_amount', fe.metadata->>'sold_amount',
      'given_currency', fe.metadata->>'sold_currency',
      'received_amount', fe.metadata->>'bought_amount',
      'received_currency', fe.metadata->>'bought_currency',
      'currency_code', coalesce(fe.metadata->>'currency', fe.metadata->>'sold_currency'),
      'amount', coalesce(fe.metadata->>'amount', fe.metadata->>'sold_amount')
    ) as row_data
    from public.journal_entries je
    join public.financial_events fe on fe.id = je.financial_event_id
    left join public.cashboxes cb on cb.id = case
      when fe.metadata->>'cashbox_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (fe.metadata->>'cashbox_id')::uuid else null end
    left join public.counterparties cp on cp.id = coalesce(fe.counterparty_id, case
      when fe.metadata->>'counterparty_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (fe.metadata->>'counterparty_id')::uuid else null end)
    left join public.profiles pr on pr.id = je.created_by
    where je.organization_id = target_org
      and (
        actor_role <> 'cashier'
        or (
          (
            not exists (select 1 from public.organization_branch_access ba0 where ba0.membership_id = actor_membership)
            or exists (
              select 1 from public.organization_branch_access ba
              where ba.membership_id = actor_membership and ba.branch_id = je.branch_id
            )
          )
          and (
            not exists (select 1 from public.organization_cashbox_access ca0 where ca0.membership_id = actor_membership)
            or cb.id is null
            or exists (
              select 1 from public.organization_cashbox_access ca
              where ca.membership_id = actor_membership and ca.cashbox_id = cb.id
            )
          )
        )
      )
    order by je.occurred_at desc, je.id desc
    limit least(greatest(page_size, 1), 1000)
    offset least(greatest(page_offset, 0), 1000000)
  ) history;
  return result;
end;
$$;

revoke all on function public.get_transaction_history_page(uuid, integer, integer) from public, anon;
grant execute on function public.get_transaction_history_page(uuid, integer, integer) to authenticated;
