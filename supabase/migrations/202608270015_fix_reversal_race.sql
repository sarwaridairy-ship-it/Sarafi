-- Reversal races are serialized by the original row lock and the reversal uniqueness check.
create or replace function public.request_reversal(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  original_id uuid := (command->>'original_entry_id')::uuid;
  actor_id uuid := auth.uid();
  client_id text := command->>'client_command_id';
  reason_value text := nullif(trim(command->>'reason'), '');
  original public.journal_entries;
  event_id uuid;
  reversal_id uuid;
  line_row record;
  result_entry public.journal_entries;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if client_id is null or length(trim(client_id)) = 0 then raise exception 'client_command_id is required'; end if;
  if reason_value is null then raise exception 'A reversal reason is required'; end if;
  select * into original from public.journal_entries where id = original_id for update;
  if original.id is null or original.status <> 'posted' then raise exception 'Only a posted entry can be reversed'; end if;
  if exists (select 1 from public.reversals where original_entry_id = original_id) then raise exception 'Journal entry is already reversed'; end if;
  if not exists (select 1 from public.organization_memberships where organization_id = original.organization_id and user_id = actor_id and active and role_code in ('owner', 'manager')) then raise exception 'Only an owner or manager can reverse entries'; end if;
  perform pg_advisory_xact_lock(hashtextextended(original.organization_id::text || ':' || original_id::text, 0));
  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata)
    values (original.organization_id, original.branch_id, 'reversal', 'reversal-' || client_id, now(), actor_id, client_id, jsonb_build_object('original_entry_id', original_id, 'reason', reason_value)) returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo, reversal_of, reversal_reason)
    values (original.organization_id, original.branch_id, event_id, 'reversed', now(), now(), actor_id, actor_id, reason_value, original_id, reason_value) returning id into reversal_id;
  for line_row in select * from public.journal_lines where journal_entry_id = original_id loop
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, native_credit, base_debit, base_credit, applied_rate, source_metadata)
      values (line_row.organization_id, reversal_id, line_row.account_id, line_row.currency_code, line_row.native_credit, line_row.native_debit, line_row.base_credit, line_row.base_debit, line_row.applied_rate, jsonb_build_object('reversal_of', original_id));
  end loop;
  insert into public.reversals (organization_id, original_entry_id, reversal_entry_id, reason, requested_by)
    values (original.organization_id, original_id, reversal_id, reason_value, actor_id);
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id)
    values (original.organization_id, client_id, reversal_id);
  select * into result_entry from public.journal_entries where id = reversal_id;
  return result_entry;
end;
$$;
