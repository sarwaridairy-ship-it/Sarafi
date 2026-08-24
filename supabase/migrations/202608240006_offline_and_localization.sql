-- Stage 6: assigned offline policies and deterministic command reconciliation.
create table public.offline_policies (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade, cashbox_id uuid not null references public.cashboxes(id), max_amount_base numeric(38,12) not null check (max_amount_base > 0), allowed_operations text[] not null default array['BUY_FX', 'SELL_FX'], enabled boolean not null default false, updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(), unique (device_id, cashbox_id)
);
create table public.offline_command_receipts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, device_id uuid not null references public.devices(id), cashbox_id uuid not null references public.cashboxes(id), client_command_id text not null, local_sequence bigint not null, encrypted_payload bytea not null, status text not null default 'pending' check (status in ('pending', 'synced', 'conflict')), conflict_reason text, server_entry_id uuid references public.journal_entries(id), created_at timestamptz not null default now(), synced_at timestamptz, unique (organization_id, client_command_id), unique (device_id, local_sequence)
);
create index offline_queue_idx on public.offline_command_receipts (organization_id, device_id, status, local_sequence);
alter table public.offline_policies enable row level security; alter table public.offline_command_receipts enable row level security;
create policy offline_policy_org_read on public.offline_policies for select using (public.is_org_member(organization_id));
create policy offline_queue_org_read on public.offline_command_receipts for select using (public.is_org_member(organization_id));

create or replace function public.accept_offline_command(target_id uuid, target_status text, server_entry uuid default null, conflict_message text default null) returns public.offline_command_receipts language plpgsql security definer set search_path = public as $$
declare result public.offline_command_receipts;
begin
  if not exists (select 1 from public.offline_command_receipts q where q.id = target_id and public.is_org_member(q.organization_id)) then raise exception 'Offline command not found or not authorized'; end if;
  if target_status not in ('synced', 'conflict') then raise exception 'Invalid offline resolution'; end if;
  update public.offline_command_receipts set status = target_status, server_entry_id = server_entry, conflict_reason = conflict_message, synced_at = case when target_status = 'synced' then now() else null end where id = target_id returning * into result;
  return result;
end; $$;
revoke all on function public.accept_offline_command(uuid, text, uuid, text) from public;
grant execute on function public.accept_offline_command(uuid, text, uuid, text) to authenticated;
