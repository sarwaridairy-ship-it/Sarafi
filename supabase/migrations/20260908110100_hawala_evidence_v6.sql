-- SARAFI whole-web v6: explicit Hawala identity, settlement, reference, and
-- financial-event evidence. This is forward-only and preserves v5 history.

alter table public.hawala_transfers
  add column if not exists sender_name text,
  add column if not exists receiver_name text,
  add column if not exists sender_party_id uuid references public.counterparties(id),
  add column if not exists receiver_party_id uuid references public.counterparties(id),
  add column if not exists origin_branch_id uuid references public.branches(id),
  add column if not exists destination_branch_id uuid references public.branches(id),
  add column if not exists origin_agent text,
  add column if not exists destination_agent text,
  add column if not exists compliance_decision_id uuid references public.compliance_decisions(id),
  add column if not exists settlement_state text not null default 'open',
  add column if not exists remaining_amount numeric(38,12);

alter table public.hawala_transfers drop constraint if exists hawala_settlement_state_check;
alter table public.hawala_transfers
  add constraint hawala_settlement_state_check
  check (settlement_state in ('open', 'partial', 'settled', 'review_required'));
alter table public.hawala_transfers drop constraint if exists hawala_remaining_amount_check;
alter table public.hawala_transfers
  add constraint hawala_remaining_amount_check
  check (remaining_amount is null or (remaining_amount >= 0 and remaining_amount <= amount));

update public.hawala_transfers h
set sender_name = coalesce(h.sender_name, case when h.direction = 'incoming' then coalesce(
      h.origin_agent,
      (select hp.name from public.hawala_partners hp where hp.id = h.hawala_partner_id),
      h.origin_location
    ) else null end),
    receiver_name = coalesce(h.receiver_name, h.beneficiary_name),
    receiver_party_id = coalesce(h.receiver_party_id, h.beneficiary_counterparty_id),
    origin_branch_id = coalesce(h.origin_branch_id, case when h.direction = 'outgoing' then h.branch_id end),
    destination_branch_id = coalesce(h.destination_branch_id, case when h.direction = 'incoming' then h.branch_id end),
    origin_agent = coalesce(h.origin_agent, case when h.direction = 'incoming' then (
      select hp.name from public.hawala_partners hp where hp.id = h.hawala_partner_id
    ) else h.origin_location end),
    destination_agent = coalesce(h.destination_agent, case when h.direction = 'outgoing' then (
      select hp.name from public.hawala_partners hp where hp.id = h.hawala_partner_id
    ) else h.destination_location end),
    settlement_state = case
      when h.integrity_state = 'review_required' then 'review_required'
      when (select l.status from public.hawala_partner_statement_lines l where l.transfer_id = h.id) = 'settled' then 'settled'
      when (select l.status from public.hawala_partner_statement_lines l where l.transfer_id = h.id) = 'partial' then 'partial'
      else 'open'
    end,
    remaining_amount = coalesce((
      select l.original_amount - l.settled_amount
      from public.hawala_partner_statement_lines l where l.transfer_id = h.id
    ), h.amount),
    compliance_decision_id = coalesce(
      h.compliance_decision_id,
      (
        select nullif(fe.metadata->>'compliance_decision_id', '')::uuid
        from public.journal_entries je
        join public.financial_events fe on fe.id = je.financial_event_id
        where je.id = h.journal_entry_id
      )
    );

create or replace function public.enforce_hawala_identity_v6()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_metadata jsonb := '{}'::jsonb;
  partner_name_value text;
begin
  if tg_op = 'INSERT' then
    select fe.metadata into event_metadata
    from public.journal_entries je
    join public.financial_events fe on fe.id = je.financial_event_id
    where je.id = new.journal_entry_id;
    select hp.name into partner_name_value
    from public.hawala_partners hp where hp.id = new.hawala_partner_id;

    new.sender_party_id := coalesce(new.sender_party_id, nullif(event_metadata->>'sender_party_id', '')::uuid);
    new.receiver_party_id := coalesce(new.receiver_party_id, nullif(event_metadata->>'receiver_party_id', '')::uuid, new.beneficiary_counterparty_id);
    new.sender_name := coalesce(new.sender_name, nullif(trim(event_metadata->>'sender_name'), ''));
    new.receiver_name := coalesce(new.receiver_name, new.beneficiary_name);
    if new.sender_name is null or new.receiver_name is null then
      raise exception 'HAWALA_PARTIES_REQUIRED: Sender and receiver identities are required';
    end if;
    new.origin_branch_id := coalesce(new.origin_branch_id, case when new.direction = 'outgoing' then new.branch_id end);
    new.destination_branch_id := coalesce(new.destination_branch_id, case when new.direction = 'incoming' then new.branch_id end);
    new.origin_agent := coalesce(new.origin_agent, case when new.direction = 'incoming' then partner_name_value else new.origin_location end);
    new.destination_agent := coalesce(new.destination_agent, case when new.direction = 'outgoing' then partner_name_value else new.destination_location end);
    new.compliance_decision_id := coalesce(new.compliance_decision_id, nullif(event_metadata->>'compliance_decision_id', '')::uuid);
    new.settlement_state := case when new.integrity_state = 'review_required' then 'review_required' else 'open' end;
    new.remaining_amount := coalesce(new.remaining_amount, new.amount);
  elsif
    new.organization_id is distinct from old.organization_id
    or new.branch_id is distinct from old.branch_id
    or new.sender_id is distinct from old.sender_id
    or new.beneficiary_counterparty_id is distinct from old.beneficiary_counterparty_id
    or new.partner_id is distinct from old.partner_id
    or new.hawala_partner_id is distinct from old.hawala_partner_id
    or new.direction is distinct from old.direction
    or new.workflow_type is distinct from old.workflow_type
    or new.currency_code is distinct from old.currency_code
    or new.amount is distinct from old.amount
    or new.base_amount is distinct from old.base_amount
    or new.fee is distinct from old.fee
    or new.fee_base_amount is distinct from old.fee_base_amount
    or new.reference_code is distinct from old.reference_code
    or new.sender_name is distinct from old.sender_name
    or new.receiver_name is distinct from old.receiver_name
    or new.sender_party_id is distinct from old.sender_party_id
    or new.receiver_party_id is distinct from old.receiver_party_id
    or new.origin_branch_id is distinct from old.origin_branch_id
    or new.destination_branch_id is distinct from old.destination_branch_id
    or new.origin_agent is distinct from old.origin_agent
    or new.destination_agent is distinct from old.destination_agent
    or new.compliance_decision_id is distinct from old.compliance_decision_id
  then
    raise exception 'HAWALA_IMMUTABLE_EVIDENCE: Hawala identity and accounting evidence cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists hawala_identity_evidence_v6 on public.hawala_transfers;
create trigger hawala_identity_evidence_v6
before insert or update on public.hawala_transfers
for each row execute function public.enforce_hawala_identity_v6();

create or replace function public.sync_hawala_settlement_evidence_v6()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.hawala_transfers
  set remaining_amount = new.original_amount - new.settled_amount,
      settlement_state = case
        when new.status = 'review_required' then 'review_required'
        when new.settled_amount = new.original_amount then 'settled'
        when new.settled_amount > 0 then 'partial'
        else 'open'
      end
  where id = new.transfer_id;
  return new;
end;
$$;

drop trigger if exists hawala_statement_sync_v6 on public.hawala_partner_statement_lines;
create trigger hawala_statement_sync_v6
after insert or update of settled_amount, status on public.hawala_partner_statement_lines
for each row execute function public.sync_hawala_settlement_evidence_v6();

create or replace function public.record_hawala_send_v6(command jsonb)
returns public.hawala_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_reference text := 'SAR-' || upper(encode(gen_random_bytes(10), 'hex'));
begin
  return public.record_hawala_send(
    (coalesce(command, '{}'::jsonb) - 'reference_code')
    || jsonb_build_object('reference_code', generated_reference, 'reference_source', 'server')
  );
end;
$$;

create or replace function public.normalize_hawala_event_type_v6()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare workflow text := coalesce(new.metadata->>'workflow_type', '');
begin
  new.event_type := case
    when workflow = 'hawala_outgoing' then 'hawala_outgoing_funded'::public.financial_event_type
    when workflow = 'hawala_incoming' then 'hawala_incoming_recorded'::public.financial_event_type
    when workflow = 'hawala_beneficiary_payout' then 'hawala_beneficiary_paid'::public.financial_event_type
    when workflow = 'hawala_partner_settlement' and new.metadata->>'settlement_direction' = 'payable'
      then 'hawala_partner_paid'::public.financial_event_type
    when workflow = 'hawala_partner_settlement' and new.metadata->>'settlement_direction' = 'receivable'
      then 'hawala_partner_collected'::public.financial_event_type
    else new.event_type
  end;
  return new;
end;
$$;

drop trigger if exists financial_events_00_normalize_hawala_v6 on public.financial_events;
create trigger financial_events_00_normalize_hawala_v6
before insert on public.financial_events
for each row execute function public.normalize_hawala_event_type_v6();

revoke all on function public.enforce_hawala_identity_v6() from public, anon, authenticated;
revoke all on function public.sync_hawala_settlement_evidence_v6() from public, anon, authenticated;
revoke all on function public.normalize_hawala_event_type_v6() from public, anon, authenticated;
revoke all on function public.record_hawala_send_v6(jsonb) from public, anon;
grant execute on function public.record_hawala_send_v6(jsonb) to authenticated;
