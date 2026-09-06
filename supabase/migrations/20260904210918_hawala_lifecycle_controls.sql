-- Authoritative, append-only Hawala lifecycle transitions.
-- Journal posting remains in the creation RPC; lifecycle changes are constrained
-- here so the client cannot skip or rewrite transfer history.
create or replace function public.transition_hawala_status(command jsonb)
returns public.hawala_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  transfer_id_value uuid := (command->>'transfer_id')::uuid;
  next_status text := lower(trim(command->>'status'));
  reason_value text := nullif(trim(command->>'reason'), '');
  actor_id uuid := auth.uid();
  transfer_row public.hawala_transfers;
  role_value text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if transfer_id_value is null or next_status not in ('funded', 'sent', 'ready', 'paid', 'cancelled') then
    raise exception 'Valid Hawala transfer and lifecycle status are required';
  end if;
  select h.* into transfer_row
    from public.hawala_transfers h
    join public.organization_memberships m on m.organization_id = h.organization_id
      and m.user_id = actor_id and m.active = true
   where h.id = transfer_id_value
   for update;
  if transfer_row.id is null then raise exception 'Hawala transfer is not accessible'; end if;
  select role_code into role_value from public.organization_memberships
   where organization_id = transfer_row.organization_id and user_id = actor_id and active = true;
  if role_value not in ('owner', 'manager', 'accountant', 'cashier') then
    raise exception 'User cannot update Hawala transfers';
  end if;
  if not (
    (transfer_row.status = 'created' and next_status in ('funded', 'cancelled')) or
    (transfer_row.status = 'funded' and next_status in ('sent', 'cancelled')) or
    (transfer_row.status = 'sent' and next_status = 'ready') or
    (transfer_row.status = 'ready' and next_status = 'paid')
  ) then
    raise exception 'Invalid Hawala lifecycle transition from % to %', transfer_row.status, next_status;
  end if;
  update public.hawala_transfers set status = next_status where id = transfer_row.id returning * into transfer_row;
  insert into public.hawala_status_events (transfer_id, status, actor_user_id)
    values (transfer_row.id, next_status, actor_id);
  insert into public.auth_security_events (organization_id, user_id, event_type, metadata)
    values (transfer_row.organization_id, actor_id, 'hawala_status_changed', jsonb_build_object(
      'transfer_id', transfer_row.id, 'from', transfer_row.status, 'to', next_status, 'reason', reason_value));
  return transfer_row;
end;
$$;

revoke all on function public.transition_hawala_status(jsonb) from public;
grant execute on function public.transition_hawala_status(jsonb) to authenticated;

create index if not exists hawala_status_events_transfer_created_idx
  on public.hawala_status_events (transfer_id, created_at desc);
