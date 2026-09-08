-- SARAFI whole-project v5 integrity correction.
--
-- This forward-only migration closes the independently reproduced authorization,
-- Hawala, document, dashboard, debt, and rate-control gaps. Browser roles receive
-- no direct mutation grants; every write is authorized by public.has_capability.

-- ---------------------------------------------------------------------------
-- One default-deny capability authority
-- ---------------------------------------------------------------------------

alter table public.membership_capability_overrides
  add column if not exists expires_at timestamptz;

insert into public.capability_definitions (capability_code, description, owner_only) values
  ('dashboard.owner', 'View the owner and delegated business-administrator dashboard', false),
  ('dashboard.manager', 'View the operational manager dashboard', false),
  ('dashboard.accountant', 'View the accounting dashboard', false),
  ('dashboard.cashier', 'View the assigned cashier dashboard without profit', false),
  ('dashboard.viewer', 'View the read-only audit dashboard', false),
  ('dashboard.compliance', 'View the compliance dashboard', false),
  ('transactions.view', 'View permitted transaction history and details', false),
  ('debt.view', 'View permitted debt records', false),
  ('debt.create.receivable', 'Record a customer receivable', false),
  ('debt.create.payable', 'Record an organization payable', false),
  ('debt.settle.receivable', 'Collect an outstanding receivable', false),
  ('debt.settle.payable', 'Pay an outstanding payable', false),
  ('hawala.view', 'View permitted Hawala records', false),
  ('hawala.send', 'Create an outgoing Hawala transfer', false),
  ('hawala.incoming', 'Record an incoming Hawala instruction', false),
  ('hawala.payout', 'Pay an incoming Hawala beneficiary', false),
  ('hawala.transition', 'Advance a non-cash Hawala lifecycle state', false),
  ('hawala.settle', 'Settle an open Hawala partner statement line', false),
  ('documents.list', 'List private document metadata', false),
  ('documents.upload', 'Upload an approved private document', false),
  ('documents.view', 'View a private document', false),
  ('documents.download', 'Download a private document', false),
  ('documents.archive', 'Place a private document under archive or legal-hold control', false)
on conflict (capability_code) do update
set description = excluded.description, owner_only = excluded.owner_only;

delete from public.role_capabilities
where role_code in ('manager', 'cashier', 'viewer')
  and capability_code in ('documents.list', 'documents.upload', 'documents.view', 'documents.download', 'documents.archive');

delete from public.role_capabilities
where role_code = 'accountant'
  and capability_code in ('debt.settle.receivable', 'debt.settle.payable', 'hawala.settle');

delete from public.role_capabilities
where role_code = 'business_admin'
  and capability_code in ('financial.post.fx', 'financial.post.money', 'financial.post.opening');

insert into public.role_capabilities (role_code, capability_code)
select role_code, capability_code
from (values
  ('owner', array[
    'dashboard.owner','transactions.view','debt.view','debt.create.receivable','debt.create.payable',
    'debt.settle.receivable','debt.settle.payable','hawala.view','hawala.send','hawala.incoming',
    'hawala.payout','hawala.transition','hawala.settle','documents.list','documents.upload',
    'documents.view','documents.download','documents.archive'
  ]::text[]),
  ('business_admin', array[
    'dashboard.owner','transactions.view','debt.view','debt.create.receivable','debt.create.payable',
    'debt.settle.receivable','debt.settle.payable','hawala.view','hawala.send','hawala.incoming',
    'hawala.payout','hawala.transition','hawala.settle','documents.list','documents.upload',
    'documents.view','documents.download','documents.archive'
  ]::text[]),
  ('manager', array[
    'dashboard.manager','transactions.view','debt.view','debt.create.receivable','debt.create.payable',
    'debt.settle.receivable','debt.settle.payable','hawala.view','hawala.send','hawala.incoming',
    'hawala.payout','hawala.transition','hawala.settle','rates.manage'
  ]::text[]),
  ('accountant', array[
    'dashboard.accountant','transactions.view','debt.view','hawala.view'
  ]::text[]),
  ('cashier', array[
    'dashboard.cashier','transactions.view','debt.view','debt.create.receivable',
    'debt.settle.receivable','hawala.view','hawala.send','hawala.incoming','hawala.payout',
    'hawala.transition'
  ]::text[]),
  ('viewer', array['dashboard.viewer','transactions.view','debt.view','hawala.view']::text[]),
  ('compliance_officer', array[
    'dashboard.compliance','transactions.view','hawala.view','documents.list','documents.upload',
    'documents.view','documents.download','documents.archive'
  ]::text[])
) defaults(role_code, capability_codes)
cross join lateral unnest(defaults.capability_codes) capability_code
on conflict do nothing;

create or replace function public.has_capability(
  target_org uuid,
  capability text,
  optional_scope jsonb default '{}'::jsonb
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  with membership as (
    select m.id, m.role_code, m.mfa_required
    from public.organization_memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.active
      and public.is_platform_user_active()
    limit 1
  ), decision as (
    select
      m.id,
      m.mfa_required,
      coalesce(o.allowed, rc.capability_code is not null) as allowed,
      coalesce(o.branch_ids, '{}'::uuid[]) as override_branches,
      coalesce(o.cashbox_ids, '{}'::uuid[]) as override_cashboxes,
      coalesce(o.limits, '{}'::jsonb) as limits,
      o.expires_at
    from membership m
    left join public.role_capabilities rc
      on rc.role_code = m.role_code and rc.capability_code = capability
    left join public.membership_capability_overrides o
      on o.membership_id = m.id and o.capability_code = capability
    left join public.capability_definitions d on d.capability_code = capability
    where d.capability_code is not null
      and (not d.owner_only or m.role_code = 'owner')
  )
  select coalesce(bool_or(
    decision.allowed
    and (decision.expires_at is null or decision.expires_at > now())
    and (
      not coalesce((optional_scope->>'requires_active_plan')::boolean, false)
      or exists (
        select 1
        from public.organization_subscriptions s
        where s.organization_id = target_org
          and s.status in ('active', 'trial', 'past_due')
          and (s.status <> 'trial' or s.trial_ends_at is null or s.trial_ends_at > now())
          and (s.current_period_end is null or s.current_period_end > now() or s.status = 'past_due')
      )
    )
    and (
      nullif(optional_scope->>'plan_feature', '') is null
      or exists (
        select 1
        from public.organization_subscriptions s
        join public.subscription_plans p on p.id = s.plan_id
        where s.organization_id = target_org
          and coalesce((p.features->>(optional_scope->>'plan_feature'))::boolean, false)
      )
    )
    and (
      nullif(optional_scope->>'feature', '') is null
      or exists (
        select 1 from public.organization_features f
        where f.organization_id = target_org
          and f.feature_code = optional_scope->>'feature'
          and f.enabled
      )
    )
    and (
      nullif(optional_scope->>'branch_id', '') is null
      or (
        (
          cardinality(decision.override_branches) = 0
          and (
            not exists (select 1 from public.organization_branch_access ba0 where ba0.membership_id = decision.id)
            or exists (
              select 1 from public.organization_branch_access ba
              where ba.membership_id = decision.id
                and ba.branch_id = (optional_scope->>'branch_id')::uuid
            )
          )
        )
        or (optional_scope->>'branch_id')::uuid = any(decision.override_branches)
      )
    )
    and (
      nullif(optional_scope->>'cashbox_id', '') is null
      or (
        (
          cardinality(decision.override_cashboxes) = 0
          and (
            not exists (select 1 from public.organization_cashbox_access ca0 where ca0.membership_id = decision.id)
            or exists (
              select 1 from public.organization_cashbox_access ca
              where ca.membership_id = decision.id
                and ca.cashbox_id = (optional_scope->>'cashbox_id')::uuid
            )
          )
        )
        or (optional_scope->>'cashbox_id')::uuid = any(decision.override_cashboxes)
      )
    )
    and (
      nullif(optional_scope->>'amount_base', '') is null
      or (
        optional_scope->>'amount_base' ~ '^[+-]?[0-9]+([.][0-9]+)?$'
        and (
          not (decision.limits ? 'max_transaction_amount_base')
          or abs((optional_scope->>'amount_base')::numeric)
            <= (decision.limits->>'max_transaction_amount_base')::numeric
        )
      )
    )
    and (
      nullif(optional_scope->>'amount_native', '') is null
      or (
        optional_scope->>'amount_native' ~ '^[+-]?[0-9]+([.][0-9]+)?$'
        and (
          not (decision.limits ? 'max_native_amount')
          or abs((optional_scope->>'amount_native')::numeric)
            <= (decision.limits->>'max_native_amount')::numeric
        )
        and (
          nullif(optional_scope->>'currency', '') is null
          or not (coalesce(decision.limits->'currency_limits', '{}'::jsonb) ? upper(optional_scope->>'currency'))
          or abs((optional_scope->>'amount_native')::numeric)
            <= (decision.limits->'currency_limits'->>upper(optional_scope->>'currency'))::numeric
        )
      )
    )
    and (
      not (
        decision.mfa_required
        or coalesce((decision.limits->>'requires_mfa')::boolean, false)
        or coalesce((optional_scope->>'requires_mfa')::boolean, false)
      )
      or coalesce((select auth.jwt()->>'aal'), 'aal1') = 'aal2'
    )
    and (
      not (
        coalesce((decision.limits->>'requires_trusted_device')::boolean, false)
        or coalesce((optional_scope->>'requires_trusted_device')::boolean, false)
      )
      or exists (
        select 1
        from public.devices dv
        where dv.id = nullif(optional_scope->>'device_id', '')::uuid
          and dv.organization_id = target_org
          and dv.user_id = (select auth.uid())
          and dv.status = 'trusted'
      )
    )
  )), false)
  from decision;
$$;

revoke all on function public.has_capability(uuid, text, jsonb) from public, anon;
grant execute on function public.has_capability(uuid, text, jsonb) to authenticated;

-- The old role-string trigger contradicted the capability wrapper (notably for
-- business administrators). Subscription state is now passed through the single
-- capability trigger below.
drop trigger if exists enforce_premium_financial_actor_before_insert on public.financial_events;

create or replace function public.enforce_financial_event_capability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  required_capability text;
  workflow text := coalesce(new.metadata->>'workflow_type', '');
begin
  if (select auth.role()) = 'service_role' then return new; end if;
  required_capability := case
    when new.event_type::text in ('buy_fx', 'sell_fx', 'exchange_fx') then 'financial.post.fx'
    when workflow = 'debt_receivable_create' then 'debt.create.receivable'
    when workflow = 'debt_payable_create' then 'debt.create.payable'
    when workflow = 'debt_receivable_settle' then 'debt.settle.receivable'
    when workflow = 'debt_payable_settle' then 'debt.settle.payable'
    when workflow = 'hawala_outgoing' then 'hawala.send'
    when workflow = 'hawala_incoming' then 'hawala.incoming'
    when workflow = 'hawala_beneficiary_payout' then 'hawala.payout'
    when workflow = 'hawala_partner_settlement' then 'hawala.settle'
    when new.event_type::text in ('debt_created', 'debt_settled', 'record_debt', 'settle_debt') then 'financial.post.debt'
    when new.event_type::text = 'reversal' then 'financial.reverse'
    when new.event_type::text like 'hawala%' or new.immutable_reference like 'hawala-%' then 'financial.post.hawala'
    when new.event_type::text in ('owner_investment', 'owner_withdrawal') then 'owner.capital.post'
    when new.event_type::text = 'opening_balance' then 'financial.post.opening'
    else 'financial.post.money'
  end;
  perform public.require_capability(
    new.organization_id,
    required_capability,
    jsonb_strip_nulls(jsonb_build_object(
      'branch_id', new.branch_id,
      'cashbox_id', new.metadata->>'cashbox_id',
      'amount_native', coalesce(new.metadata->>'amount', new.metadata->>'settlement_amount'),
      'amount_base', coalesce(new.metadata->>'base_amount', new.metadata->>'base_value'),
      'currency', new.metadata->>'currency',
      'feature', case when required_capability like 'hawala.%' then 'hawala' else null end,
      'requires_active_plan', true,
      'requires_trusted_device', coalesce((new.metadata->>'requires_trusted_device')::boolean, false),
      'requires_mfa', coalesce((new.metadata->>'requires_mfa')::boolean, false),
      'device_id', new.metadata->>'device_id'
    ))
  );
  return new;
end;
$$;

revoke all on function public.enforce_financial_event_capability() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hawala canonical identity, accounting evidence, and partner statements
-- ---------------------------------------------------------------------------

alter table public.approval_requests
  add column if not exists draft_payload jsonb,
  add column if not exists consumed_at timestamptz,
  add column if not exists consumed_by uuid references auth.users(id),
  add column if not exists consumed_journal_entry_id uuid references public.journal_entries(id);

alter table public.hawala_transfers
  add column if not exists direction text,
  add column if not exists workflow_type text,
  add column if not exists hawala_partner_id uuid references public.hawala_partners(id),
  add column if not exists beneficiary_counterparty_id uuid references public.counterparties(id),
  add column if not exists base_amount numeric(38,12),
  add column if not exists fee_base_amount numeric(38,12) not null default 0,
  add column if not exists payout_journal_entry_id uuid references public.journal_entries(id),
  add column if not exists payout_receipt_id uuid references public.receipts(id),
  add column if not exists payout_paid_at timestamptz,
  add column if not exists cancelled_reason text,
  add column if not exists integrity_state text not null default 'valid';

alter table public.hawala_transfers drop constraint if exists hawala_transfers_status_check;
alter table public.hawala_transfers
  add constraint hawala_transfers_status_check
  check (status in ('created', 'funded', 'sent', 'ready', 'paid', 'completed', 'cancelled'));
alter table public.hawala_transfers drop constraint if exists hawala_transfers_direction_check;
alter table public.hawala_transfers
  add constraint hawala_transfers_direction_check
  check (direction is null or direction in ('outgoing', 'incoming'));
alter table public.hawala_transfers drop constraint if exists hawala_transfers_workflow_check;
alter table public.hawala_transfers
  add constraint hawala_transfers_workflow_check
  check (workflow_type is null or workflow_type in ('hawala_outgoing', 'hawala_incoming'));
alter table public.hawala_transfers drop constraint if exists hawala_transfers_integrity_state_check;
alter table public.hawala_transfers
  add constraint hawala_transfers_integrity_state_check
  check (integrity_state in ('valid', 'review_required'));

insert into public.hawala_partners (organization_id, counterparty_id, name, active)
select c.organization_id, c.id, c.display_name, c.risk_status <> 'blocked'
from public.counterparties c
where c.counterparty_type in ('saraf', 'hawala_partner')
  and not exists (
    select 1 from public.hawala_partners hp
    where hp.organization_id = c.organization_id and hp.counterparty_id = c.id
  );

update public.hawala_transfers h
set hawala_partner_id = hp.id
from public.hawala_partners hp
where h.hawala_partner_id is null
  and h.partner_id = hp.counterparty_id
  and h.organization_id = hp.organization_id;

update public.hawala_transfers h
set direction = case when fe.immutable_reference like 'hawala-incoming-%' then 'incoming' else 'outgoing' end,
    workflow_type = case when fe.immutable_reference like 'hawala-incoming-%' then 'hawala_incoming' else 'hawala_outgoing' end,
    base_amount = coalesce(
      nullif(fe.metadata->>'base_amount', '')::numeric,
      (select max(greatest(jl.base_debit, jl.base_credit)) from public.journal_lines jl where jl.journal_entry_id = h.journal_entry_id),
      h.amount
    ),
    fee_base_amount = coalesce(nullif(fe.metadata->>'fee_base_amount', '')::numeric, h.fee, 0)
from public.journal_entries je
join public.financial_events fe on fe.id = je.financial_event_id
where je.id = h.journal_entry_id
  and (h.direction is null or h.workflow_type is null or h.base_amount is null);

update public.hawala_transfers
set direction = coalesce(direction, 'outgoing'),
    workflow_type = coalesce(workflow_type, 'hawala_outgoing'),
    base_amount = coalesce(base_amount, amount);

update public.hawala_transfers h
set payout_journal_entry_id = evidence.journal_entry_id,
    payout_receipt_id = evidence.receipt_id,
    payout_paid_at = evidence.posted_at
from (
  select distinct on (h0.id)
    h0.id as transfer_id,
    je.id as journal_entry_id,
    r.id as receipt_id,
    je.posted_at
  from public.hawala_transfers h0
  join public.financial_events fe
    on fe.organization_id = h0.organization_id
   and fe.immutable_reference like 'hawala-payout-%'
   and coalesce(fe.metadata->>'transfer_id', '') = h0.id::text
  join public.journal_entries je on je.financial_event_id = fe.id and je.status = 'posted'
  left join public.receipts r on r.journal_entry_id = je.id
  order by h0.id, je.posted_at desc
) evidence
where h.id = evidence.transfer_id and h.status = 'paid';

update public.hawala_transfers
set integrity_state = 'review_required'
where status = 'paid' and (payout_journal_entry_id is null or payout_receipt_id is null);

alter table public.hawala_transfers alter column direction set not null;
alter table public.hawala_transfers alter column workflow_type set not null;
alter table public.hawala_transfers alter column base_amount set not null;
alter table public.hawala_transfers
  add constraint hawala_transfers_base_amount_check check (base_amount > 0 and fee_base_amount >= 0);

create unique index if not exists hawala_payout_journal_unique
  on public.hawala_transfers (payout_journal_entry_id) where payout_journal_entry_id is not null;
create unique index if not exists hawala_payout_receipt_unique
  on public.hawala_transfers (payout_receipt_id) where payout_receipt_id is not null;
create index if not exists hawala_transfer_partner_statement_idx
  on public.hawala_transfers (organization_id, hawala_partner_id, currency_code, direction, status);
create index if not exists hawala_reference_normalized_idx
  on public.hawala_transfers (organization_id, upper(trim(reference_code)));

alter table public.hawala_status_events
  add column if not exists previous_status text,
  add column if not exists next_status text,
  add column if not exists reason text,
  add column if not exists journal_entry_id uuid references public.journal_entries(id);
update public.hawala_status_events set next_status = status where next_status is null;

create table if not exists public.hawala_integrity_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transfer_id uuid not null references public.hawala_transfers(id) on delete cascade,
  issue_code text not null,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved', 'accepted_legacy')),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  resolution_reason text,
  created_at timestamptz not null default now(),
  unique (transfer_id, issue_code)
);

insert into public.hawala_integrity_reviews (organization_id, transfer_id, issue_code, evidence)
select organization_id, id, 'PAID_WITHOUT_PAYOUT_EVIDENCE', jsonb_build_object(
  'status', status,
  'payout_journal_entry_id', payout_journal_entry_id,
  'payout_receipt_id', payout_receipt_id
)
from public.hawala_transfers
where integrity_state = 'review_required'
on conflict (transfer_id, issue_code) do nothing;

with duplicate_references as (
  select organization_id, upper(trim(reference_code)) as normalized_reference
  from public.hawala_transfers
  where direction = 'incoming' and status = 'ready'
  group by organization_id, upper(trim(reference_code))
  having count(*) > 1
), marked as (
  update public.hawala_transfers h
  set integrity_state = 'review_required'
  from duplicate_references d
  where h.organization_id = d.organization_id
    and upper(trim(h.reference_code)) = d.normalized_reference
    and h.direction = 'incoming' and h.status = 'ready'
  returning h.organization_id, h.id, h.reference_code
)
insert into public.hawala_integrity_reviews (organization_id, transfer_id, issue_code, evidence)
select organization_id, id, 'DUPLICATE_READY_REFERENCE', jsonb_build_object(
  'reference_code', reference_code,
  'normalized_reference', upper(trim(reference_code))
)
from marked
on conflict (transfer_id, issue_code) do nothing;

create unique index if not exists hawala_ready_incoming_reference_unique
  on public.hawala_transfers (organization_id, (upper(trim(reference_code))))
  where direction = 'incoming' and status = 'ready' and integrity_state = 'valid';

create table if not exists public.hawala_partner_statement_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transfer_id uuid not null unique references public.hawala_transfers(id) on delete restrict,
  partner_id uuid not null references public.hawala_partners(id) on delete restrict,
  direction text not null check (direction in ('payable', 'receivable')),
  currency_code text not null references public.currencies(code),
  original_amount numeric(38,12) not null check (original_amount > 0),
  base_amount numeric(38,12) not null check (base_amount > 0),
  settled_amount numeric(38,12) not null default 0 check (settled_amount >= 0 and settled_amount <= original_amount),
  status text not null default 'open' check (status in ('open', 'partial', 'settled', 'review_required')),
  originating_journal_entry_id uuid not null references public.journal_entries(id),
  last_settlement_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists hawala_partner_statement_open_idx
  on public.hawala_partner_statement_lines (organization_id, partner_id, currency_code, direction, status);

insert into public.hawala_partner_statement_lines (
  organization_id, transfer_id, partner_id, direction, currency_code,
  original_amount, base_amount, settled_amount, status, originating_journal_entry_id
)
select h.organization_id, h.id, h.hawala_partner_id,
  case when h.direction = 'incoming' then 'receivable' else 'payable' end,
  h.currency_code, h.amount, h.base_amount,
  least(h.amount, coalesce((
    select sum(s.amount) from public.hawala_settlements s
    where s.transfer_id = h.id and s.partner_id = h.hawala_partner_id
  ), 0)),
  case
    when h.integrity_state = 'review_required' then 'review_required'
    when coalesce((select sum(s.amount) from public.hawala_settlements s where s.transfer_id = h.id and s.partner_id = h.hawala_partner_id), 0) >= h.amount then 'settled'
    when coalesce((select sum(s.amount) from public.hawala_settlements s where s.transfer_id = h.id and s.partner_id = h.hawala_partner_id), 0) > 0 then 'partial'
    else 'open'
  end,
  h.journal_entry_id
from public.hawala_transfers h
where h.hawala_partner_id is not null and h.journal_entry_id is not null
on conflict (transfer_id) do nothing;

alter table public.hawala_integrity_reviews enable row level security;
alter table public.hawala_partner_statement_lines enable row level security;
revoke all on public.hawala_integrity_reviews, public.hawala_partner_statement_lines
  from public, anon, authenticated;

create policy hawala_integrity_review_read on public.hawala_integrity_reviews
  for select to authenticated
  using (public.has_capability(organization_id, 'hawala.settle', '{}'::jsonb));
create policy hawala_partner_statement_read on public.hawala_partner_statement_lines
  for select to authenticated
  using (public.has_capability(organization_id, 'hawala.view', '{}'::jsonb));

create or replace function public.enforce_hawala_paid_invariant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'paid' and (
    new.direction <> 'incoming'
    or new.payout_journal_entry_id is null
    or new.payout_receipt_id is null
    or new.payout_paid_at is null
  ) then
    raise exception 'HAWALA_PAYOUT_EVIDENCE_REQUIRED: Paid requires one incoming payout journal and receipt';
  end if;
  if new.payout_journal_entry_id is not null and not exists (
    select 1 from public.journal_entries je
    where je.id = new.payout_journal_entry_id
      and je.organization_id = new.organization_id
      and je.status = 'posted'
  ) then
    raise exception 'HAWALA_PAYOUT_JOURNAL_INVALID: The payout journal is not a posted organization entry';
  end if;
  if new.payout_receipt_id is not null and not exists (
    select 1 from public.receipts r
    where r.id = new.payout_receipt_id
      and r.organization_id = new.organization_id
      and r.journal_entry_id = new.payout_journal_entry_id
  ) then
    raise exception 'HAWALA_PAYOUT_RECEIPT_INVALID: The payout receipt does not belong to the payout journal';
  end if;
  return new;
end;
$$;

drop trigger if exists hawala_paid_evidence_before_write on public.hawala_transfers;
create trigger hawala_paid_evidence_before_write
before insert or update of status, payout_journal_entry_id, payout_receipt_id, payout_paid_at
on public.hawala_transfers
for each row execute function public.enforce_hawala_paid_invariant();

revoke all on function public.enforce_hawala_paid_invariant() from public, anon, authenticated;

drop policy if exists hawala_org_read on public.hawala_transfers;
create policy hawala_capability_read on public.hawala_transfers
  for select to authenticated
  using (public.has_capability(
    organization_id,
    'hawala.view',
    jsonb_build_object('branch_id', branch_id)
  ));

create or replace function public.get_hawala_partners(target_org uuid)
returns table (id uuid, counterparty_id uuid, name text, active boolean)
language sql
security definer
stable
set search_path = ''
as $$
  select hp.id, hp.counterparty_id, hp.name, hp.active
  from public.hawala_partners hp
  where hp.organization_id = target_org
    and hp.active
    and public.has_capability(target_org, 'hawala.view', '{}'::jsonb)
  order by hp.name, hp.id;
$$;

create or replace function public.record_hawala_send(command jsonb)
returns public.hawala_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  branch_id_value uuid := nullif(command->>'branch_id', '')::uuid;
  partner_id_value uuid := nullif(command->>'hawala_partner_id', '')::uuid;
  destination_id uuid := nullif(command->>'destination_money_account_id', '')::uuid;
  actor_id uuid := (select auth.uid());
  client_id text := nullif(trim(command->>'client_command_id'), '');
  amount_value numeric := nullif(command->>'amount', '')::numeric;
  fee_value numeric := coalesce(nullif(command->>'fee', '')::numeric, 0);
  currency_value text := upper(trim(command->>'currency'));
  destination_value text := nullif(trim(command->>'destination_location'), '');
  beneficiary_value text := nullif(trim(command->>'beneficiary_name'), '');
  reference_value text := upper(nullif(trim(command->>'reference_code'), ''));
  beneficiary_id_value uuid := nullif(command->>'beneficiary_counterparty_id', '')::uuid;
  partner public.hawala_partners;
  money public.money_accounts;
  existing_event public.financial_events;
  existing_transfer public.hawala_transfers;
  base_amount_value numeric;
  fee_base_value numeric;
  event_id uuid;
  entry_id uuid;
  transfer_id uuid := gen_random_uuid();
  cash_account uuid;
  partner_account uuid;
  fee_account uuid;
  result public.hawala_transfers;
begin
  if actor_id is null then raise exception 'AUTH_REQUIRED: Authentication required'; end if;
  if org_id is null or branch_id_value is null or partner_id_value is null or destination_id is null then
    raise exception 'HAWALA_DETAILS_REQUIRED: Organization, branch, partner, and receiving account are required';
  end if;
  if client_id is null or beneficiary_value is null or destination_value is null or reference_value is null then
    raise exception 'HAWALA_DETAILS_REQUIRED: Beneficiary, destination, reference, and command id are required';
  end if;
  if length(reference_value) < 4 or length(reference_value) > 80 then
    raise exception 'HAWALA_REFERENCE_INVALID: Reference code must contain 4 to 80 characters';
  end if;
  if amount_value is null or amount_value <= 0 or fee_value < 0 then
    raise exception 'HAWALA_AMOUNT_INVALID: Hawala amount and fee are invalid';
  end if;

  command := public.prepare_inline_rate(command, 'hawala_send');
  base_amount_value := public.authoritative_base_amount(org_id, branch_id_value, currency_value, amount_value, false);
  fee_base_value := public.authoritative_base_amount(org_id, branch_id_value, currency_value, fee_value, false);
  perform public.require_capability(org_id, 'hawala.send', jsonb_build_object(
    'branch_id', branch_id_value,
    'amount_native', amount_value,
    'amount_base', base_amount_value,
    'currency', currency_value,
    'feature', 'hawala',
    'requires_active_plan', true
  ));

  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || client_id, 0));
  select * into existing_event
  from public.financial_events
  where organization_id = org_id and client_command_id = client_id;
  if existing_event.id is not null then
    select h.* into existing_transfer
    from public.hawala_transfers h
    where h.organization_id = org_id
      and h.journal_entry_id in (
        select je.id from public.journal_entries je where je.financial_event_id = existing_event.id
      )
    limit 1;
    if existing_transfer.id is null then
      raise exception 'IDEMPOTENCY_CONFLICT: Command id belongs to another operation';
    end if;
    return existing_transfer;
  end if;

  if exists (
    select 1 from public.hawala_transfers h
    where h.organization_id = org_id and upper(trim(h.reference_code)) = reference_value
  ) then raise exception 'HAWALA_REFERENCE_EXISTS: Reference code already exists'; end if;
  if not exists (
    select 1 from public.branches b
    where b.id = branch_id_value and b.organization_id = org_id and b.active
  ) then raise exception 'BRANCH_UNAVAILABLE: Branch is inactive or belongs to another organization'; end if;

  select hp.* into partner
  from public.hawala_partners hp
  left join public.counterparties cp on cp.id = hp.counterparty_id
  where hp.id = partner_id_value and hp.organization_id = org_id and hp.active
    and coalesce(cp.risk_status, 'standard') <> 'blocked';
  if partner.id is null then raise exception 'HAWALA_PARTNER_UNAVAILABLE: Choose an active approved Hawala partner'; end if;

  if beneficiary_id_value is not null and not exists (
    select 1 from public.counterparties cp
    where cp.id = beneficiary_id_value and cp.organization_id = org_id and cp.risk_status <> 'blocked'
  ) then raise exception 'BENEFICIARY_UNAVAILABLE: Beneficiary record is unavailable or blocked'; end if;

  select ma.* into money
  from public.money_accounts ma
  where ma.id = destination_id and ma.organization_id = org_id and ma.active;
  if money.id is null or not public.user_can_use_money_account(org_id, money.id) then
    raise exception 'MONEY_ACCOUNT_UNAVAILABLE: Receiving account is unavailable';
  end if;
  if money.branch_id is not null and money.branch_id <> branch_id_value then
    raise exception 'MONEY_ACCOUNT_SCOPE: Receiving account belongs to another branch';
  end if;

  command := command || jsonb_build_object(
    'workflow_type', 'hawala_outgoing',
    'direction', 'outgoing',
    'hawala_partner_id', partner.id,
    'partner_name', partner.name,
    'reference_code', reference_value,
    'currency', currency_value,
    'amount', amount_value,
    'base_amount', base_amount_value,
    'fee_base_amount', fee_base_value,
    'money_account_id', money.id,
    'cashbox_id', money.cashbox_id,
    'source_account_name', 'Customer outside',
    'destination_account_name', money.name,
    'source_account_kind', 'customer_outside',
    'destination_account_kind', 'money_account',
    'money_flow_version', 5
  );

  insert into public.financial_events (
    organization_id, branch_id, counterparty_id, event_type, immutable_reference,
    occurred_at, created_by, client_command_id, metadata
  ) values (
    org_id, branch_id_value, beneficiary_id_value, 'receive_money', 'hawala-outgoing-' || transfer_id,
    coalesce(nullif(command->>'occurred_at', '')::timestamptz, now()), actor_id, client_id, command
  ) returning id into event_id;

  insert into public.journal_entries (
    organization_id, branch_id, financial_event_id, status, occurred_at,
    posted_at, created_by, posted_by, memo
  ) values (
    org_id, branch_id_value, event_id, 'posted',
    coalesce(nullif(command->>'occurred_at', '')::timestamptz, now()), now(), actor_id, actor_id,
    nullif(trim(command->>'memo'), '')
  ) returning id into entry_id;

  cash_account := public.ensure_money_ledger_account(org_id, money.id, currency_value);
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
  values (
    org_id,
    'hawala:partner-payable:' || partner.id || ':' || currency_value,
    'Hawala payable · ' || partner.name || ' · ' || currency_value,
    'liability', currency_value
  ) on conflict (organization_id, code) do update set name = excluded.name, active = true
  returning id into partner_account;

  insert into public.journal_lines (
    organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit
  ) values (org_id, entry_id, cash_account, currency_value, amount_value, base_amount_value);
  insert into public.journal_lines (
    organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit
  ) values (org_id, entry_id, partner_account, currency_value, amount_value, base_amount_value);

  if fee_value > 0 then
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
    values (
      org_id, 'income:hawala-fee:' || currency_value,
      'Hawala fee income · ' || currency_value, 'income', currency_value
    ) on conflict (organization_id, code) do update set name = excluded.name, active = true
    returning id into fee_account;
    insert into public.journal_lines (
      organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit
    ) values (org_id, entry_id, cash_account, currency_value, fee_value, fee_base_value);
    insert into public.journal_lines (
      organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit
    ) values (org_id, entry_id, fee_account, currency_value, fee_value, fee_base_value);
  end if;

  insert into public.hawala_transfers (
    id, organization_id, branch_id, sender_id, beneficiary_counterparty_id,
    beneficiary_name, origin_location, destination_location, partner_id,
    hawala_partner_id, currency_code, amount, fee, reference_code, status,
    journal_entry_id, direction, workflow_type, base_amount, fee_base_amount
  ) values (
    transfer_id, org_id, branch_id_value, beneficiary_id_value, beneficiary_id_value,
    beneficiary_value, money.name, destination_value, partner.counterparty_id,
    partner.id, currency_value, amount_value, fee_value, reference_value, 'funded',
    entry_id, 'outgoing', 'hawala_outgoing', base_amount_value, fee_base_value
  ) returning * into result;

  insert into public.hawala_status_events (
    transfer_id, status, previous_status, next_status, reason, actor_user_id, journal_entry_id
  ) values (result.id, 'funded', null, 'funded', 'Customer funds received', actor_id, entry_id);
  insert into public.hawala_partner_statement_lines (
    organization_id, transfer_id, partner_id, direction, currency_code,
    original_amount, base_amount, originating_journal_entry_id
  ) values (org_id, result.id, partner.id, 'payable', currency_value, amount_value, base_amount_value, entry_id);
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id)
  values (org_id, client_id, entry_id);
  return result;
end;
$$;

create or replace function public.record_hawala_incoming(command jsonb)
returns public.hawala_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  branch_id_value uuid := nullif(command->>'branch_id', '')::uuid;
  partner_id_value uuid := nullif(command->>'hawala_partner_id', '')::uuid;
  actor_id uuid := (select auth.uid());
  client_id text := nullif(trim(command->>'client_command_id'), '');
  amount_value numeric := nullif(command->>'amount', '')::numeric;
  fee_value numeric := coalesce(nullif(command->>'fee', '')::numeric, 0);
  currency_value text := upper(trim(command->>'currency'));
  origin_value text := nullif(trim(command->>'origin_location'), '');
  destination_value text := nullif(trim(command->>'destination_location'), '');
  beneficiary_value text := nullif(trim(command->>'beneficiary_name'), '');
  reference_value text := upper(nullif(trim(command->>'reference_code'), ''));
  beneficiary_id_value uuid := nullif(command->>'beneficiary_counterparty_id', '')::uuid;
  partner public.hawala_partners;
  existing_event public.financial_events;
  existing_transfer public.hawala_transfers;
  base_amount_value numeric;
  fee_base_value numeric;
  event_id uuid;
  entry_id uuid;
  transfer_id uuid := gen_random_uuid();
  partner_account uuid;
  beneficiary_account uuid;
  result public.hawala_transfers;
begin
  if actor_id is null then raise exception 'AUTH_REQUIRED: Authentication required'; end if;
  if org_id is null or branch_id_value is null or partner_id_value is null then
    raise exception 'HAWALA_DETAILS_REQUIRED: Organization, branch, and canonical partner are required';
  end if;
  if client_id is null or beneficiary_value is null or origin_value is null or destination_value is null or reference_value is null then
    raise exception 'HAWALA_DETAILS_REQUIRED: Beneficiary, locations, reference, and command id are required';
  end if;
  if length(reference_value) < 4 or length(reference_value) > 80 then
    raise exception 'HAWALA_REFERENCE_INVALID: Reference code must contain 4 to 80 characters';
  end if;
  if amount_value is null or amount_value <= 0 or fee_value < 0 then
    raise exception 'HAWALA_AMOUNT_INVALID: Hawala amount and fee are invalid';
  end if;

  command := public.prepare_inline_rate(command, 'hawala_incoming');
  base_amount_value := public.authoritative_base_amount(org_id, branch_id_value, currency_value, amount_value, false);
  fee_base_value := public.authoritative_base_amount(org_id, branch_id_value, currency_value, fee_value, false);
  perform public.require_capability(org_id, 'hawala.incoming', jsonb_build_object(
    'branch_id', branch_id_value,
    'amount_native', amount_value,
    'amount_base', base_amount_value,
    'currency', currency_value,
    'feature', 'hawala',
    'requires_active_plan', true
  ));

  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || client_id, 0));
  select * into existing_event
  from public.financial_events
  where organization_id = org_id and client_command_id = client_id;
  if existing_event.id is not null then
    select h.* into existing_transfer
    from public.hawala_transfers h
    where h.organization_id = org_id
      and h.journal_entry_id in (
        select je.id from public.journal_entries je where je.financial_event_id = existing_event.id
      )
    limit 1;
    if existing_transfer.id is null then raise exception 'IDEMPOTENCY_CONFLICT: Command id belongs to another operation'; end if;
    return existing_transfer;
  end if;

  if exists (
    select 1 from public.hawala_transfers h
    where h.organization_id = org_id and upper(trim(h.reference_code)) = reference_value
  ) then raise exception 'HAWALA_REFERENCE_EXISTS: Reference code already exists'; end if;
  if not exists (
    select 1 from public.branches b
    where b.id = branch_id_value and b.organization_id = org_id and b.active
  ) then raise exception 'BRANCH_UNAVAILABLE: Branch is inactive or belongs to another organization'; end if;

  select hp.* into partner
  from public.hawala_partners hp
  left join public.counterparties cp on cp.id = hp.counterparty_id
  where hp.id = partner_id_value and hp.organization_id = org_id and hp.active
    and coalesce(cp.risk_status, 'standard') <> 'blocked';
  if partner.id is null then raise exception 'HAWALA_PARTNER_UNAVAILABLE: Choose an active approved Hawala partner'; end if;
  if beneficiary_id_value is not null and not exists (
    select 1 from public.counterparties cp
    where cp.id = beneficiary_id_value and cp.organization_id = org_id and cp.risk_status <> 'blocked'
  ) then raise exception 'BENEFICIARY_UNAVAILABLE: Beneficiary record is unavailable or blocked'; end if;

  command := command || jsonb_build_object(
    'workflow_type', 'hawala_incoming',
    'direction', 'incoming',
    'hawala_partner_id', partner.id,
    'partner_name', partner.name,
    'reference_code', reference_value,
    'currency', currency_value,
    'amount', amount_value,
    'base_amount', base_amount_value,
    'fee_base_amount', fee_base_value,
    'source_account_name', partner.name,
    'destination_account_name', beneficiary_value,
    'source_account_kind', 'hawala_partner',
    'destination_account_kind', 'beneficiary_payable',
    'money_flow_version', 5
  );

  insert into public.financial_events (
    organization_id, branch_id, counterparty_id, event_type, immutable_reference,
    occurred_at, created_by, client_command_id, metadata
  ) values (
    org_id, branch_id_value, beneficiary_id_value, 'pay_money', 'hawala-incoming-' || transfer_id,
    coalesce(nullif(command->>'occurred_at', '')::timestamptz, now()), actor_id, client_id, command
  ) returning id into event_id;
  insert into public.journal_entries (
    organization_id, branch_id, financial_event_id, status, occurred_at,
    posted_at, created_by, posted_by, memo
  ) values (
    org_id, branch_id_value, event_id, 'posted',
    coalesce(nullif(command->>'occurred_at', '')::timestamptz, now()), now(), actor_id, actor_id,
    nullif(trim(command->>'memo'), '')
  ) returning id into entry_id;

  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
  values (
    org_id,
    'hawala:partner-receivable:' || partner.id || ':' || currency_value,
    'Hawala receivable · ' || partner.name || ' · ' || currency_value,
    'asset', currency_value
  ) on conflict (organization_id, code) do update set name = excluded.name, active = true
  returning id into partner_account;
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
  values (
    org_id,
    'hawala:beneficiary-payable:' || transfer_id || ':' || currency_value,
    'Hawala beneficiary payable · ' || beneficiary_value || ' · ' || currency_value,
    'liability', currency_value
  ) on conflict (organization_id, code) do update set name = excluded.name, active = true
  returning id into beneficiary_account;

  insert into public.journal_lines (
    organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit
  ) values (org_id, entry_id, partner_account, currency_value, amount_value, base_amount_value);
  insert into public.journal_lines (
    organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit
  ) values (org_id, entry_id, beneficiary_account, currency_value, amount_value, base_amount_value);

  insert into public.hawala_transfers (
    id, organization_id, branch_id, beneficiary_counterparty_id, beneficiary_name,
    origin_location, destination_location, partner_id, hawala_partner_id,
    currency_code, amount, fee, reference_code, status, journal_entry_id,
    direction, workflow_type, base_amount, fee_base_amount
  ) values (
    transfer_id, org_id, branch_id_value, beneficiary_id_value, beneficiary_value,
    origin_value, destination_value, partner.counterparty_id, partner.id,
    currency_value, amount_value, fee_value, reference_value, 'ready', entry_id,
    'incoming', 'hawala_incoming', base_amount_value, fee_base_value
  ) returning * into result;

  insert into public.hawala_status_events (
    transfer_id, status, previous_status, next_status, reason, actor_user_id, journal_entry_id
  ) values (result.id, 'ready', null, 'ready', 'Incoming partner instruction recorded', actor_id, entry_id);
  insert into public.hawala_partner_statement_lines (
    organization_id, transfer_id, partner_id, direction, currency_code,
    original_amount, base_amount, originating_journal_entry_id
  ) values (org_id, result.id, partner.id, 'receivable', currency_value, amount_value, base_amount_value, entry_id);
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id)
  values (org_id, client_id, entry_id);
  return result;
end;
$$;

create or replace function public.find_hawala_payout(
  target_org uuid,
  reference_code_input text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  result jsonb;
  transfer_row public.hawala_transfers;
  normalized_reference text := upper(trim(reference_code_input));
  matching_count bigint;
begin
  if length(normalized_reference) < 4 then return null; end if;
  select count(*) into matching_count
  from public.hawala_transfers h
  where h.organization_id = target_org
    and upper(trim(h.reference_code)) = normalized_reference
    and h.direction = 'incoming' and h.status = 'ready';
  if matching_count > 1 then
    raise exception 'HAWALA_REFERENCE_AMBIGUOUS: Multiple ready transfers use this reference; compliance review is required';
  end if;
  select h.* into transfer_row
  from public.hawala_transfers h
  where h.organization_id = target_org
    and upper(trim(h.reference_code)) = normalized_reference
    and h.direction = 'incoming'
    and h.status = 'ready'
    and h.integrity_state = 'valid';
  if transfer_row.id is null then return null; end if;
  perform public.require_capability(target_org, 'hawala.payout', jsonb_build_object(
    'branch_id', transfer_row.branch_id,
    'amount_native', transfer_row.amount,
    'amount_base', transfer_row.base_amount,
    'currency', transfer_row.currency_code,
    'feature', 'hawala',
    'requires_active_plan', true
  ));
  result := jsonb_build_object(
    'reference_code', transfer_row.reference_code,
    'beneficiary_name', transfer_row.beneficiary_name,
    'destination_location', transfer_row.destination_location,
    'currency_code', transfer_row.currency_code,
    'amount', transfer_row.amount,
    'branch_id', transfer_row.branch_id,
    'hawala_partner_id', transfer_row.hawala_partner_id
  );
  return result;
end;
$$;

create or replace function public.request_hawala_payout_approval(command jsonb)
returns public.approval_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  normalized_reference text := upper(trim(command->>'reference_code'));
  actor_id uuid := (select auth.uid());
  transfer_row public.hawala_transfers;
  existing public.approval_requests;
  result public.approval_requests;
  matching_count bigint;
begin
  select count(*) into matching_count from public.hawala_transfers h
  where h.organization_id = org_id
    and upper(trim(h.reference_code)) = normalized_reference
    and h.direction = 'incoming' and h.status = 'ready';
  if matching_count > 1 then
    raise exception 'HAWALA_REFERENCE_AMBIGUOUS: Multiple ready transfers use this reference; compliance review is required';
  end if;
  select h.* into transfer_row from public.hawala_transfers h
  where h.organization_id = org_id
    and upper(trim(h.reference_code)) = normalized_reference
    and h.direction = 'incoming' and h.status = 'ready' and h.integrity_state = 'valid';
  if transfer_row.id is null then raise exception 'HAWALA_NOT_READY: No payable incoming transfer matches this reference'; end if;
  perform public.require_capability(org_id, 'approval.request', jsonb_build_object(
    'branch_id', transfer_row.branch_id,
    'amount_base', transfer_row.base_amount
  ));
  select a.* into existing from public.approval_requests a
  where a.organization_id = org_id and a.requested_by = actor_id
    and a.action_type = 'hawala_payout' and a.status in ('pending', 'approved')
    and a.payload_summary->>'transfer_id' = transfer_row.id::text
    and a.expires_at > now()
    and a.consumed_at is null
  order by case when a.status = 'approved' then 0 else 1 end, a.requested_at desc
  limit 1;
  if existing.id is not null then return existing; end if;
  insert into public.approval_requests (
    organization_id, branch_id, requested_by, action_type, payload_summary, draft_payload,
    reason, amount_base, currency_code, expires_at
  ) values (
    org_id, transfer_row.branch_id, actor_id, 'hawala_payout',
    command || jsonb_build_object('transfer_id', transfer_row.id, 'reference_code', normalized_reference),
    command,
    coalesce(nullif(trim(command->>'approval_reason'), ''), 'Hawala payout approval required'),
    transfer_row.base_amount, transfer_row.currency_code, now() + interval '1 hour'
  ) returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (org_id, actor_id, 'approval_requested', jsonb_build_object(
    'approval_id', result.id, 'action_type', 'hawala_payout', 'transfer_id', transfer_row.id
  ));
  return result;
end;
$$;

create or replace function public.pay_hawala_beneficiary(command jsonb)
returns public.hawala_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  normalized_reference text := upper(trim(command->>'reference_code'));
  account_id_value uuid := nullif(command->>'money_account_id', '')::uuid;
  actor_id uuid := (select auth.uid());
  client_id text := nullif(trim(command->>'client_command_id'), '');
  identity_reference text := nullif(trim(command->>'recipient_identity_reference'), '');
  identity_confirmed boolean := coalesce((command->>'identity_confirmed')::boolean, false);
  approval_id_value uuid := nullif(command->>'approval_id', '')::uuid;
  transfer_row public.hawala_transfers;
  money public.money_accounts;
  existing_event public.financial_events;
  receipt_id_value uuid;
  event_id uuid;
  entry_id uuid;
  cash_account uuid;
  beneficiary_account uuid;
  threshold_value numeric := 0;
  requires_approval boolean := false;
  approval_valid boolean := false;
  matching_count bigint;
begin
  if actor_id is null then raise exception 'AUTH_REQUIRED: Authentication required'; end if;
  if org_id is null or account_id_value is null or client_id is null or length(normalized_reference) < 4 then
    raise exception 'HAWALA_PAYOUT_DETAILS_REQUIRED: Organization, exact reference, account, and command id are required';
  end if;
  if not identity_confirmed or identity_reference is null or length(identity_reference) < 2 then
    raise exception 'HAWALA_IDENTITY_REQUIRED: Confirm the recipient identity and record the checked identifier';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || client_id, 0));
  select * into existing_event
  from public.financial_events
  where organization_id = org_id and client_command_id = client_id;
  if existing_event.id is not null then
    select h.* into transfer_row from public.hawala_transfers h
    where h.organization_id = org_id and h.payout_journal_entry_id in (
      select je.id from public.journal_entries je where je.financial_event_id = existing_event.id
    ) limit 1;
    if transfer_row.id is null then raise exception 'IDEMPOTENCY_CONFLICT: Command id belongs to another operation'; end if;
    return transfer_row;
  end if;

  select count(*) into matching_count from public.hawala_transfers h
  where h.organization_id = org_id and upper(trim(h.reference_code)) = normalized_reference
    and h.direction = 'incoming' and h.status = 'ready';
  if matching_count > 1 then
    raise exception 'HAWALA_REFERENCE_AMBIGUOUS: Multiple ready transfers use this reference; compliance review is required';
  end if;

  select h.* into transfer_row
  from public.hawala_transfers h
  where h.organization_id = org_id and upper(trim(h.reference_code)) = normalized_reference
  for update;
  if transfer_row.id is null or transfer_row.direction <> 'incoming' or transfer_row.status <> 'ready' then
    raise exception 'HAWALA_NOT_READY: No payable incoming transfer matches this exact reference';
  end if;
  if transfer_row.hawala_partner_id is null or transfer_row.integrity_state <> 'valid' then
    raise exception 'HAWALA_REVIEW_REQUIRED: Canonical partner and integrity review are required before payout';
  end if;

  perform public.require_capability(org_id, 'hawala.payout', jsonb_build_object(
    'branch_id', transfer_row.branch_id,
    'amount_native', transfer_row.amount,
    'amount_base', transfer_row.base_amount,
    'currency', transfer_row.currency_code,
    'feature', 'hawala',
    'requires_active_plan', true,
    'device_id', nullif(command->>'device_id', '')
  ));

  if transfer_row.beneficiary_counterparty_id is not null then
    if exists (
      select 1 from public.counterparties cp
      where cp.id = transfer_row.beneficiary_counterparty_id
        and (cp.organization_id <> org_id or cp.risk_status = 'blocked')
    ) then raise exception 'HAWALA_KYC_BLOCKED: Beneficiary is blocked or belongs to another organization'; end if;
    if exists (
      select 1 from public.kyc_profiles kp
      where kp.organization_id = org_id
        and kp.counterparty_id = transfer_row.beneficiary_counterparty_id
        and kp.review_status <> 'approved'
    ) then raise exception 'HAWALA_KYC_REVIEW_REQUIRED: Beneficiary KYC review is not approved'; end if;
  end if;

  select coalesce(os.approval_threshold_base, 0) into threshold_value
  from public.organization_settings os where os.organization_id = org_id;
  requires_approval := threshold_value > 0 and transfer_row.base_amount >= threshold_value;
  if approval_id_value is not null then
    select exists (
      select 1 from public.approval_requests a
      where a.id = approval_id_value and a.organization_id = org_id
        and a.action_type = 'hawala_payout' and a.status = 'approved'
        and a.requested_by = actor_id and a.decided_by is not null and a.decided_by <> actor_id
        and a.expires_at > now() and a.consumed_at is null
        and a.payload_summary->>'transfer_id' = transfer_row.id::text
    ) into approval_valid;
  end if;
  if requires_approval and not approval_valid then
    raise exception 'HAWALA_APPROVAL_REQUIRED: This payout requires an approved, unexpired request';
  end if;

  select ma.* into money from public.money_accounts ma
  where ma.id = account_id_value and ma.organization_id = org_id and ma.active;
  if money.id is null or not public.user_can_use_money_account(org_id, money.id) then
    raise exception 'MONEY_ACCOUNT_UNAVAILABLE: Payout account is unavailable';
  end if;
  if money.branch_id is not null and money.branch_id <> transfer_row.branch_id then
    raise exception 'MONEY_ACCOUNT_SCOPE: Payout account belongs to another branch';
  end if;
  perform public.require_money_account_balance(org_id, money.id, transfer_row.currency_code, transfer_row.amount);

  command := command || jsonb_build_object(
    'workflow_type', 'hawala_beneficiary_payout',
    'transfer_id', transfer_row.id,
    'hawala_partner_id', transfer_row.hawala_partner_id,
    'reference_code', transfer_row.reference_code,
    'currency', transfer_row.currency_code,
    'amount', transfer_row.amount,
    'base_amount', transfer_row.base_amount,
    'money_account_id', money.id,
    'cashbox_id', money.cashbox_id,
    'identity_confirmed', true,
    'recipient_identity_reference', identity_reference,
    'approval_id', approval_id_value,
    'source_account_name', transfer_row.beneficiary_name,
    'destination_account_name', money.name,
    'source_account_kind', 'beneficiary_payable',
    'destination_account_kind', 'money_account',
    'money_flow_version', 5
  );
  insert into public.financial_events (
    organization_id, branch_id, counterparty_id, event_type, immutable_reference,
    occurred_at, created_by, client_command_id, metadata
  ) values (
    org_id, transfer_row.branch_id, transfer_row.beneficiary_counterparty_id,
    'pay_money', 'hawala-payout-' || transfer_row.id,
    now(), actor_id, client_id, command
  ) returning id into event_id;
  insert into public.journal_entries (
    organization_id, branch_id, financial_event_id, status, occurred_at,
    posted_at, created_by, posted_by, memo
  ) values (
    org_id, transfer_row.branch_id, event_id, 'posted', now(), now(), actor_id, actor_id,
    nullif(trim(command->>'memo'), '')
  ) returning id into entry_id;

  cash_account := public.ensure_money_ledger_account(org_id, money.id, transfer_row.currency_code);
  select la.id into beneficiary_account from public.ledger_accounts la
  where la.organization_id = org_id
    and la.code = 'hawala:beneficiary-payable:' || transfer_row.id || ':' || transfer_row.currency_code;
  if beneficiary_account is null then
    raise exception 'HAWALA_LEDGER_MISSING: Beneficiary payable account is unavailable';
  end if;
  insert into public.journal_lines (
    organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit
  ) values (org_id, entry_id, beneficiary_account, transfer_row.currency_code, transfer_row.amount, transfer_row.base_amount);
  insert into public.journal_lines (
    organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit
  ) values (org_id, entry_id, cash_account, transfer_row.currency_code, transfer_row.amount, transfer_row.base_amount);

  select r.id into receipt_id_value from public.receipts r where r.journal_entry_id = entry_id;
  if receipt_id_value is null then raise exception 'HAWALA_RECEIPT_MISSING: Payout receipt was not materialized'; end if;
  update public.hawala_transfers
  set status = 'paid', payout_journal_entry_id = entry_id,
      payout_receipt_id = receipt_id_value, payout_paid_at = now(), integrity_state = 'valid'
  where id = transfer_row.id
  returning * into transfer_row;
  insert into public.hawala_status_events (
    transfer_id, status, previous_status, next_status, reason, actor_user_id, journal_entry_id
  ) values (
    transfer_row.id, 'paid', 'ready', 'paid',
    'Recipient identity confirmed: ' || identity_reference, actor_id, entry_id
  );
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id)
  values (org_id, client_id, entry_id);
  if approval_id_value is not null then
    update public.approval_requests
    set consumed_at = now(), consumed_by = actor_id, consumed_journal_entry_id = entry_id
    where id = approval_id_value and organization_id = org_id
      and status = 'approved' and consumed_at is null;
    if not found then
      raise exception 'APPROVAL_CONSUMPTION_FAILED: Approval is invalid or already used';
    end if;
  end if;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (org_id, actor_id, 'hawala_beneficiary_paid', jsonb_build_object(
    'transfer_id', transfer_row.id, 'journal_entry_id', entry_id,
    'receipt_id', receipt_id_value, 'approval_id', approval_id_value,
    'identity_reference', identity_reference
  ));
  return transfer_row;
end;
$$;

create or replace function public.resume_approved_hawala_payout(target_approval uuid)
returns public.hawala_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval_row public.approval_requests;
  command jsonb;
  result public.hawala_transfers;
begin
  select a.* into approval_row from public.approval_requests a
  where a.id = target_approval and a.requested_by = (select auth.uid())
  for update;
  if approval_row.consumed_at is not null and approval_row.consumed_journal_entry_id is not null then
    select h.* into result from public.hawala_transfers h
    where h.organization_id = approval_row.organization_id
      and h.payout_journal_entry_id = approval_row.consumed_journal_entry_id;
    if result.id is not null then return result; end if;
  end if;
  if approval_row.id is null or approval_row.action_type <> 'hawala_payout'
     or approval_row.status <> 'approved' or approval_row.expires_at <= now()
     or approval_row.consumed_at is not null then
    raise exception 'APPROVAL_INVALID: Approved, unexpired, unused Hawala payout approval required';
  end if;
  command := coalesce(approval_row.draft_payload, approval_row.payload_summary)
    || jsonb_build_object('approval_id', approval_row.id);
  return public.pay_hawala_beneficiary(command);
end;
$$;

create or replace function public.transition_hawala_status(command jsonb)
returns public.hawala_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  transfer_id_value uuid := nullif(command->>'transfer_id', '')::uuid;
  next_status text := lower(trim(command->>'status'));
  reason_value text := nullif(trim(command->>'reason'), '');
  partner_reference text := nullif(trim(command->>'partner_payout_reference'), '');
  actor_id uuid := (select auth.uid());
  transfer_row public.hawala_transfers;
  previous_status text;
begin
  if actor_id is null then raise exception 'AUTH_REQUIRED: Authentication required'; end if;
  if transfer_id_value is null or next_status not in ('funded', 'sent', 'ready', 'completed', 'cancelled') then
    raise exception 'HAWALA_STATUS_INVALID: Paid is permitted only through the payout command';
  end if;
  if reason_value is null or length(reason_value) < 3 then
    raise exception 'HAWALA_REASON_REQUIRED: Record an auditable transition reason';
  end if;
  select h.* into transfer_row from public.hawala_transfers h
  where h.id = transfer_id_value for update;
  if transfer_row.id is null then raise exception 'HAWALA_NOT_FOUND: Transfer is unavailable'; end if;
  perform public.require_capability(transfer_row.organization_id, 'hawala.transition', jsonb_build_object(
    'branch_id', transfer_row.branch_id,
    'feature', 'hawala',
    'requires_active_plan', true
  ));
  previous_status := transfer_row.status;
  if transfer_row.direction <> 'outgoing' then
    if not (previous_status = 'ready' and next_status = 'cancelled') then
      raise exception 'HAWALA_TRANSITION_INVALID: Incoming transfers use the payout command';
    end if;
  elsif not (
    (previous_status = 'created' and next_status in ('funded', 'cancelled'))
    or (previous_status = 'funded' and next_status in ('sent', 'cancelled'))
    or (previous_status = 'sent' and next_status in ('ready', 'cancelled'))
    or (previous_status = 'ready' and next_status in ('completed', 'cancelled'))
  ) then
    raise exception 'HAWALA_TRANSITION_INVALID: Invalid transition from % to %', previous_status, next_status;
  end if;
  if next_status = 'completed' and partner_reference is null then
    raise exception 'HAWALA_PARTNER_EVIDENCE_REQUIRED: Partner payout reference is required';
  end if;
  update public.hawala_transfers
  set status = next_status,
      cancelled_reason = case when next_status = 'cancelled' then reason_value else cancelled_reason end
  where id = transfer_row.id returning * into transfer_row;
  insert into public.hawala_status_events (
    transfer_id, status, previous_status, next_status, reason, actor_user_id
  ) values (transfer_row.id, next_status, previous_status, next_status, reason_value, actor_id);
  insert into public.auth_security_events (organization_id, user_id, event_type, metadata)
  values (transfer_row.organization_id, actor_id, 'hawala_status_changed', jsonb_build_object(
    'transfer_id', transfer_row.id, 'from', previous_status, 'to', next_status,
    'reason', reason_value, 'partner_payout_reference', partner_reference
  ));
  return transfer_row;
end;
$$;

create or replace function public.get_hawala_partner_statement(
  target_org uuid,
  target_partner uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare result jsonb;
begin
  perform public.require_capability(target_org, 'hawala.view', jsonb_build_object('feature', 'hawala'));
  if not exists (
    select 1 from public.hawala_partners hp
    where hp.id = target_partner and hp.organization_id = target_org and hp.active
  ) then raise exception 'HAWALA_PARTNER_UNAVAILABLE: Partner is unavailable'; end if;
  select jsonb_build_object(
    'partner_id', target_partner,
    'totals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'currency_code', totals.currency_code,
        'payable', totals.payable,
        'receivable', totals.receivable,
        'net_receivable', totals.receivable - totals.payable
      ) order by totals.currency_code)
      from (
        select l.currency_code,
          sum(case when l.direction = 'payable' then l.original_amount - l.settled_amount else 0 end) payable,
          sum(case when l.direction = 'receivable' then l.original_amount - l.settled_amount else 0 end) receivable
        from public.hawala_partner_statement_lines l
        where l.organization_id = target_org and l.partner_id = target_partner
          and l.status in ('open', 'partial')
        group by l.currency_code
      ) totals
    ), '[]'::jsonb),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'transfer_id', l.transfer_id,
        'branch_id', h.branch_id,
        'reference_code', h.reference_code,
        'beneficiary_name', h.beneficiary_name,
        'direction', l.direction,
        'currency_code', l.currency_code,
        'original_amount', l.original_amount,
        'settled_amount', l.settled_amount,
        'remaining_amount', l.original_amount - l.settled_amount,
        'status', l.status,
        'created_at', l.created_at
      ) order by l.created_at, l.id)
      from public.hawala_partner_statement_lines l
      join public.hawala_transfers h on h.id = l.transfer_id
      where l.organization_id = target_org and l.partner_id = target_partner
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.settle_hawala_partner(command jsonb)
returns public.hawala_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  line_id_value uuid := nullif(command->>'statement_line_id', '')::uuid;
  transfer_id_value uuid := nullif(command->>'transfer_id', '')::uuid;
  claimed_partner_id uuid := nullif(command->>'hawala_partner_id', '')::uuid;
  account_id_value uuid := nullif(command->>'money_account_id', '')::uuid;
  actor_id uuid := (select auth.uid());
  client_id text := nullif(trim(command->>'client_command_id'), '');
  amount_value numeric := nullif(command->>'amount', '')::numeric;
  line_row public.hawala_partner_statement_lines;
  transfer_row public.hawala_transfers;
  money public.money_accounts;
  partner public.hawala_partners;
  existing_entry public.journal_entries;
  result public.hawala_settlements;
  base_amount_value numeric;
  event_id uuid;
  entry_id uuid;
  cash_account uuid;
  partner_account uuid;
begin
  if actor_id is null then raise exception 'AUTH_REQUIRED: Authentication required'; end if;
  if account_id_value is null or client_id is null or amount_value is null or amount_value <= 0
     or (line_id_value is null and transfer_id_value is null) then
    raise exception 'HAWALA_SETTLEMENT_DETAILS_REQUIRED: Statement line, account, amount, and command id are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(line_id_value, transfer_id_value)::text, 0));
  if line_id_value is not null then
    select l.* into line_row from public.hawala_partner_statement_lines l
    where l.id = line_id_value for update;
  else
    select l.* into line_row from public.hawala_partner_statement_lines l
    where l.transfer_id = transfer_id_value for update;
  end if;
  if line_row.id is null or line_row.status not in ('open', 'partial') then
    raise exception 'HAWALA_STATEMENT_UNAVAILABLE: Statement line is unavailable or already settled';
  end if;
  if claimed_partner_id is not null and claimed_partner_id <> line_row.partner_id then
    raise exception 'HAWALA_PARTNER_MISMATCH: Settlement partner is bound to the statement line';
  end if;
  select h.* into transfer_row from public.hawala_transfers h where h.id = line_row.transfer_id;
  select hp.* into partner from public.hawala_partners hp
  where hp.id = line_row.partner_id and hp.organization_id = line_row.organization_id and hp.active;
  if transfer_row.id is null or partner.id is null then raise exception 'HAWALA_PARTNER_UNAVAILABLE: Transfer partner is unavailable'; end if;
  if amount_value > line_row.original_amount - line_row.settled_amount then
    raise exception 'HAWALA_SETTLEMENT_EXCEEDS_BALANCE: Settlement exceeds the remaining statement balance';
  end if;
  command := public.prepare_inline_rate(
    command || jsonb_build_object(
      'organization_id', line_row.organization_id,
      'branch_id', transfer_row.branch_id,
      'currency', line_row.currency_code
    ),
    'hawala_settle'
  );
  base_amount_value := public.authoritative_base_amount(
    line_row.organization_id, transfer_row.branch_id, line_row.currency_code, amount_value, false
  );
  perform public.require_capability(line_row.organization_id, 'hawala.settle', jsonb_build_object(
    'branch_id', transfer_row.branch_id,
    'amount_native', amount_value,
    'amount_base', base_amount_value,
    'currency', line_row.currency_code,
    'feature', 'hawala',
    'requires_active_plan', true
  ));

  select je.* into existing_entry
  from public.journal_entries je join public.financial_events fe on fe.id = je.financial_event_id
  where fe.organization_id = line_row.organization_id and fe.client_command_id = client_id;
  if existing_entry.id is not null then
    select s.* into result from public.hawala_settlements s
    where s.organization_id = line_row.organization_id and s.journal_entry_id = existing_entry.id;
    if result.id is null then raise exception 'IDEMPOTENCY_CONFLICT: Command id belongs to another operation'; end if;
    return result;
  end if;

  select ma.* into money from public.money_accounts ma
  where ma.id = account_id_value and ma.organization_id = line_row.organization_id and ma.active;
  if money.id is null or not public.user_can_use_money_account(line_row.organization_id, money.id) then
    raise exception 'MONEY_ACCOUNT_UNAVAILABLE: Settlement account is unavailable';
  end if;
  if money.branch_id is not null and money.branch_id <> transfer_row.branch_id then
    raise exception 'MONEY_ACCOUNT_SCOPE: Settlement account belongs to another branch';
  end if;
  if line_row.direction = 'payable' then
    perform public.require_money_account_balance(line_row.organization_id, money.id, line_row.currency_code, amount_value);
  end if;

  command := command || jsonb_build_object(
    'workflow_type', 'hawala_partner_settlement',
    'statement_line_id', line_row.id,
    'transfer_id', transfer_row.id,
    'hawala_partner_id', partner.id,
    'partner_name', partner.name,
    'settlement_direction', line_row.direction,
    'settlement_amount', amount_value,
    'amount', amount_value,
    'base_amount', base_amount_value,
    'currency', line_row.currency_code,
    'money_account_id', money.id,
    'cashbox_id', money.cashbox_id,
    'money_flow_version', 5
  );
  insert into public.financial_events (
    organization_id, branch_id, event_type, immutable_reference, occurred_at,
    created_by, client_command_id, metadata
  ) values (
    line_row.organization_id, transfer_row.branch_id,
    case when line_row.direction = 'payable' then 'pay_money' else 'receive_money' end,
    'hawala-partner-settlement-' || line_row.id || '-' || client_id,
    now(), actor_id, client_id, command
  ) returning id into event_id;
  insert into public.journal_entries (
    organization_id, branch_id, financial_event_id, status, occurred_at,
    posted_at, created_by, posted_by, memo
  ) values (
    line_row.organization_id, transfer_row.branch_id, event_id, 'posted', now(), now(),
    actor_id, actor_id, nullif(trim(command->>'memo'), '')
  ) returning id into entry_id;

  cash_account := public.ensure_money_ledger_account(line_row.organization_id, money.id, line_row.currency_code);
  select la.id into partner_account from public.ledger_accounts la
  where la.organization_id = line_row.organization_id
    and la.code = case when line_row.direction = 'payable'
      then 'hawala:partner-payable:' || partner.id || ':' || line_row.currency_code
      else 'hawala:partner-receivable:' || partner.id || ':' || line_row.currency_code
    end;
  if partner_account is null then raise exception 'HAWALA_LEDGER_MISSING: Partner statement account is unavailable'; end if;
  if line_row.direction = 'payable' then
    insert into public.journal_lines (
      organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit
    ) values (line_row.organization_id, entry_id, partner_account, line_row.currency_code, amount_value, base_amount_value);
    insert into public.journal_lines (
      organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit
    ) values (line_row.organization_id, entry_id, cash_account, line_row.currency_code, amount_value, base_amount_value);
  else
    insert into public.journal_lines (
      organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit
    ) values (line_row.organization_id, entry_id, cash_account, line_row.currency_code, amount_value, base_amount_value);
    insert into public.journal_lines (
      organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit
    ) values (line_row.organization_id, entry_id, partner_account, line_row.currency_code, amount_value, base_amount_value);
  end if;

  insert into public.hawala_settlements (
    organization_id, transfer_id, partner_id, currency_code, amount, journal_entry_id
  ) values (
    line_row.organization_id, transfer_row.id, partner.id, line_row.currency_code, amount_value, entry_id
  ) returning * into result;
  update public.hawala_partner_statement_lines
  set settled_amount = settled_amount + amount_value,
      status = case when settled_amount + amount_value = original_amount then 'settled' else 'partial' end,
      last_settlement_at = now()
  where id = line_row.id;
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id)
  values (line_row.organization_id, client_id, entry_id);
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (line_row.organization_id, actor_id, 'hawala_partner_settled', jsonb_build_object(
    'statement_line_id', line_row.id, 'transfer_id', transfer_row.id,
    'partner_id', partner.id, 'direction', line_row.direction,
    'amount', amount_value, 'currency', line_row.currency_code, 'journal_entry_id', entry_id
  ));
  return result;
end;
$$;

revoke all on function public.get_hawala_partners(uuid) from public, anon;
revoke all on function public.record_hawala_send(jsonb) from public, anon;
revoke all on function public.record_hawala_incoming(jsonb) from public, anon;
revoke all on function public.find_hawala_payout(uuid, text) from public, anon;
revoke all on function public.request_hawala_payout_approval(jsonb) from public, anon;
revoke all on function public.pay_hawala_beneficiary(jsonb) from public, anon;
revoke all on function public.resume_approved_hawala_payout(uuid) from public, anon;
revoke all on function public.transition_hawala_status(jsonb) from public, anon;
revoke all on function public.get_hawala_partner_statement(uuid, uuid) from public, anon;
revoke all on function public.settle_hawala_partner(jsonb) from public, anon;
grant execute on function public.get_hawala_partners(uuid) to authenticated;
grant execute on function public.record_hawala_send(jsonb) to authenticated;
grant execute on function public.record_hawala_incoming(jsonb) to authenticated;
grant execute on function public.find_hawala_payout(uuid, text) to authenticated;
grant execute on function public.request_hawala_payout_approval(jsonb) to authenticated;
grant execute on function public.pay_hawala_beneficiary(jsonb) to authenticated;
grant execute on function public.resume_approved_hawala_payout(uuid) to authenticated;
grant execute on function public.transition_hawala_status(jsonb) to authenticated;
grant execute on function public.get_hawala_partner_statement(uuid, uuid) to authenticated;
grant execute on function public.settle_hawala_partner(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Granular debt authority and server-filtered read models
-- ---------------------------------------------------------------------------

-- Replace the legacy role-gated implementations explicitly. Authorization is
-- performed by the capability wrappers below; these implementations retain the
-- accounting, scope, balance, and idempotency invariants without contradicting
-- cashier receivable collection or delegated Business Administrator access.
create or replace function public.record_debt_capability_impl(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  branch_id_value uuid := nullif(command->>'branch_id', '')::uuid;
  counterparty_id_value uuid := nullif(command->>'counterparty_id', '')::uuid;
  actor_id uuid := (select auth.uid());
  client_id text := nullif(trim(command->>'client_command_id'), '');
  direction_value text := lower(command->>'direction');
  currency_value text := upper(command->>'currency');
  amount_value numeric := nullif(command->>'amount', '')::numeric;
  base_amount_value numeric := nullif(command->>'base_amount', '')::numeric;
  source_id uuid := nullif(command->>'source_money_account_id', '')::uuid;
  destination_id uuid := nullif(command->>'destination_money_account_id', '')::uuid;
  selected_money public.money_accounts;
  counterparty_name text;
  event_id uuid;
  entry_id uuid;
  cash_account uuid;
  debt_account uuid;
  existing_entry public.journal_entries;
  result_entry public.journal_entries;
begin
  if actor_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if client_id is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if direction_value not in ('receivable', 'payable') or amount_value <= 0 or base_amount_value <= 0 then
    raise exception 'DEBT_AMOUNT_INVALID';
  end if;
  if direction_value = 'receivable' and source_id is null then raise exception 'SOURCE_ACCOUNT_REQUIRED'; end if;
  if direction_value = 'payable' and destination_id is null then raise exception 'DESTINATION_ACCOUNT_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || client_id, 0));
  select je.* into existing_entry from public.journal_entries je
  join public.financial_events fe on fe.id = je.financial_event_id
  where fe.organization_id = org_id and fe.client_command_id = client_id limit 1;
  if existing_entry.id is not null then return existing_entry; end if;
  if not exists (select 1 from public.branches b where b.id = branch_id_value and b.organization_id = org_id and b.active) then
    raise exception 'BRANCH_UNAVAILABLE';
  end if;
  select c.display_name into counterparty_name from public.counterparties c
  where c.id = counterparty_id_value and c.organization_id = org_id and c.risk_status <> 'blocked';
  if counterparty_name is null then raise exception 'COUNTERPARTY_UNAVAILABLE'; end if;
  select ma.* into selected_money from public.money_accounts ma
  where ma.id = case when direction_value = 'receivable' then source_id else destination_id end
    and ma.organization_id = org_id and ma.active;
  if selected_money.id is null or not public.user_can_use_money_account(org_id, selected_money.id) then
    raise exception 'MONEY_ACCOUNT_UNAVAILABLE';
  end if;
  if selected_money.branch_id is not null and selected_money.branch_id <> branch_id_value then
    raise exception 'ACCOUNT_BRANCH_MISMATCH';
  end if;
  if direction_value = 'receivable' then
    perform public.require_money_account_balance(org_id, selected_money.id, currency_value, amount_value);
  end if;
  command := command || jsonb_build_object(
    'source_money_account_id', case when direction_value = 'receivable' then selected_money.id else null end,
    'destination_money_account_id', case when direction_value = 'payable' then selected_money.id else null end,
    'source_account_name', case when direction_value = 'receivable' then selected_money.name else counterparty_name end,
    'destination_account_name', case when direction_value = 'payable' then selected_money.name else counterparty_name end,
    'money_flow_version', 5
  );
  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata)
  values (org_id, branch_id_value, (case when direction_value = 'receivable' then 'receive_money' else 'pay_money' end)::public.financial_event_type,
    'debt-' || client_id, coalesce(nullif(command->>'occurred_at', '')::timestamptz, now()), actor_id, client_id, command)
  returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo)
  values (org_id, branch_id_value, event_id, 'posted', coalesce(nullif(command->>'occurred_at', '')::timestamptz, now()), now(), actor_id, actor_id, command->>'memo')
  returning id into entry_id;
  cash_account := public.ensure_money_ledger_account(org_id, selected_money.id, currency_value);
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
  values (org_id, direction_value || ':' || counterparty_id_value || ':' || currency_value,
    initcap(direction_value) || ' · ' || counterparty_name || ' · ' || currency_value,
    case when direction_value = 'receivable' then 'asset' else 'liability' end, currency_value)
  on conflict (organization_id, code) do update set name = excluded.name, active = true
  returning id into debt_account;
  if direction_value = 'receivable' then
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit)
    values (org_id, entry_id, debt_account, currency_value, amount_value, base_amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit)
    values (org_id, entry_id, cash_account, currency_value, amount_value, base_amount_value);
  else
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit)
    values (org_id, entry_id, cash_account, currency_value, amount_value, base_amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit)
    values (org_id, entry_id, debt_account, currency_value, amount_value, base_amount_value);
  end if;
  insert into public.debts (organization_id, branch_id, counterparty_id, direction, currency_code, original_amount, outstanding_amount, originating_entry_id, due_at, notes)
  values (org_id, branch_id_value, counterparty_id_value, direction_value, currency_value, amount_value, amount_value,
    entry_id, nullif(command->>'due_at', '')::timestamptz, command->>'memo');
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id)
  values (org_id, client_id, entry_id);
  select je.* into result_entry from public.journal_entries je where je.id = entry_id;
  return result_entry;
end;
$$;

create or replace function public.settle_debt_capability_impl(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  debt_id_value uuid := nullif(command->>'debt_id', '')::uuid;
  actor_id uuid := (select auth.uid());
  client_id text := nullif(trim(command->>'client_command_id'), '');
  amount_value numeric := nullif(command->>'amount', '')::numeric;
  base_amount_value numeric := nullif(command->>'base_amount', '')::numeric;
  source_id uuid := nullif(command->>'source_money_account_id', '')::uuid;
  destination_id uuid := nullif(command->>'destination_money_account_id', '')::uuid;
  selected_money public.money_accounts;
  counterparty_name text;
  debt public.debts;
  event_id uuid;
  entry_id uuid;
  cash_account uuid;
  debt_account uuid;
  existing_entry public.journal_entries;
  result_entry public.journal_entries;
begin
  if actor_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if client_id is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if amount_value <= 0 or base_amount_value <= 0 then raise exception 'DEBT_AMOUNT_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(debt_id_value::text, '') || ':' || client_id, 0));
  select je.* into existing_entry from public.journal_entries je
  join public.financial_events fe on fe.id = je.financial_event_id
  where fe.client_command_id = client_id limit 1;
  if existing_entry.id is not null then return existing_entry; end if;
  select d.* into debt from public.debts d where d.id = debt_id_value for update;
  if debt.id is null then raise exception 'DEBT_NOT_FOUND'; end if;
  if amount_value > debt.outstanding_amount then raise exception 'DEBT_OVERPAYMENT'; end if;
  if debt.direction = 'receivable' and destination_id is null then raise exception 'DESTINATION_ACCOUNT_REQUIRED'; end if;
  if debt.direction = 'payable' and source_id is null then raise exception 'SOURCE_ACCOUNT_REQUIRED'; end if;
  select ma.* into selected_money from public.money_accounts ma
  where ma.id = case when debt.direction = 'receivable' then destination_id else source_id end
    and ma.organization_id = debt.organization_id and ma.active;
  if selected_money.id is null or not public.user_can_use_money_account(debt.organization_id, selected_money.id) then
    raise exception 'MONEY_ACCOUNT_UNAVAILABLE';
  end if;
  if selected_money.branch_id is not null and selected_money.branch_id <> debt.branch_id then
    raise exception 'ACCOUNT_BRANCH_MISMATCH';
  end if;
  select c.display_name into counterparty_name from public.counterparties c where c.id = debt.counterparty_id;
  if debt.direction = 'payable' then
    perform public.require_money_account_balance(debt.organization_id, selected_money.id, debt.currency_code, amount_value);
  end if;
  command := command || jsonb_build_object(
    'source_money_account_id', case when debt.direction = 'payable' then selected_money.id else null end,
    'destination_money_account_id', case when debt.direction = 'receivable' then selected_money.id else null end,
    'source_account_name', case when debt.direction = 'payable' then selected_money.name else counterparty_name end,
    'destination_account_name', case when debt.direction = 'receivable' then selected_money.name else counterparty_name end,
    'money_flow_version', 5
  );
  insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata)
  values (debt.organization_id, debt.branch_id,
    (case when debt.direction = 'receivable' then 'receive_money' else 'pay_money' end)::public.financial_event_type,
    'settlement-' || client_id, now(), actor_id, client_id, command)
  returning id into event_id;
  insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo)
  values (debt.organization_id, debt.branch_id, event_id, 'posted', now(), now(), actor_id, actor_id, command->>'memo')
  returning id into entry_id;
  cash_account := public.ensure_money_ledger_account(debt.organization_id, selected_money.id, debt.currency_code);
  insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
  values (debt.organization_id, debt.direction || ':' || debt.counterparty_id || ':' || debt.currency_code,
    initcap(debt.direction) || ' · ' || coalesce(counterparty_name, '') || ' · ' || debt.currency_code,
    case when debt.direction = 'receivable' then 'asset' else 'liability' end, debt.currency_code)
  on conflict (organization_id, code) do update set name = excluded.name, active = true
  returning id into debt_account;
  if debt.direction = 'receivable' then
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit)
    values (debt.organization_id, entry_id, cash_account, debt.currency_code, amount_value, base_amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit)
    values (debt.organization_id, entry_id, debt_account, debt.currency_code, amount_value, base_amount_value);
  else
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit)
    values (debt.organization_id, entry_id, debt_account, debt.currency_code, amount_value, base_amount_value);
    insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit)
    values (debt.organization_id, entry_id, cash_account, debt.currency_code, amount_value, base_amount_value);
  end if;
  update public.debts set outstanding_amount = outstanding_amount - amount_value where id = debt.id;
  insert into public.command_receipts (organization_id, client_command_id, journal_entry_id)
  values (debt.organization_id, client_id, entry_id);
  select je.* into result_entry from public.journal_entries je where je.id = entry_id;
  return result_entry;
end;
$$;

-- The capability wrapper is the authority for reversals. The inherited
-- implementation repeated an owner/manager role list, which contradicted an
-- explicitly delegated Business Administrator capability and made retries
-- fail after the first successful commit.
create or replace function public.request_reversal_capability_impl(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_id uuid := nullif(command->>'original_entry_id', '')::uuid;
  actor_id uuid := auth.uid();
  client_id text := nullif(trim(command->>'client_command_id'), '');
  reason_value text := nullif(trim(command->>'reason'), '');
  original public.journal_entries;
  existing_entry public.journal_entries;
  event_id uuid;
  reversal_id uuid;
  line_row record;
  result_entry public.journal_entries;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if original_id is null then raise exception 'original_entry_id is required'; end if;
  if client_id is null then raise exception 'client_command_id is required'; end if;
  if reason_value is null then raise exception 'A reversal reason is required'; end if;

  select * into original
  from public.journal_entries
  where id = original_id
  for update;

  if original.id is null then raise exception 'Journal entry was not found'; end if;

  select je.* into existing_entry
  from public.command_receipts cr
  join public.journal_entries je on je.id = cr.journal_entry_id
  where cr.organization_id = original.organization_id
    and cr.client_command_id = client_id
  limit 1;

  if existing_entry.id is not null then
    if existing_entry.reversal_of = original_id then return existing_entry; end if;
    raise exception 'client_command_id was already used';
  end if;

  if original.status <> 'posted' then raise exception 'Only a posted entry can be reversed'; end if;
  if exists (select 1 from public.reversals where original_entry_id = original_id) then
    raise exception 'Journal entry is already reversed';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(original.organization_id::text || ':' || original_id::text, 0));

  insert into public.financial_events (
    organization_id, branch_id, event_type, immutable_reference, occurred_at,
    created_by, client_command_id, metadata
  ) values (
    original.organization_id, original.branch_id, 'reversal', 'reversal-' || client_id,
    now(), actor_id, client_id,
    jsonb_build_object('original_entry_id', original_id, 'reason', reason_value)
  ) returning id into event_id;

  insert into public.journal_entries (
    organization_id, branch_id, financial_event_id, status, occurred_at,
    posted_at, created_by, posted_by, memo, reversal_of, reversal_reason
  ) values (
    original.organization_id, original.branch_id, event_id, 'reversed', now(),
    now(), actor_id, actor_id, reason_value, original_id, reason_value
  ) returning id into reversal_id;

  for line_row in
    select * from public.journal_lines where journal_entry_id = original_id
  loop
    insert into public.journal_lines (
      organization_id, journal_entry_id, account_id, currency_code,
      native_debit, native_credit, base_debit, base_credit, applied_rate,
      source_metadata
    ) values (
      line_row.organization_id, reversal_id, line_row.account_id,
      line_row.currency_code, line_row.native_credit, line_row.native_debit,
      line_row.base_credit, line_row.base_debit, line_row.applied_rate,
      jsonb_build_object('reversal_of', original_id)
    );
  end loop;

  insert into public.reversals (
    organization_id, original_entry_id, reversal_entry_id, reason, requested_by
  ) values (
    original.organization_id, original_id, reversal_id, reason_value, actor_id
  );

  insert into public.command_receipts (
    organization_id, client_command_id, journal_entry_id
  ) values (
    original.organization_id, client_id, reversal_id
  );

  select * into result_entry from public.journal_entries where id = reversal_id;
  return result_entry;
end;
$$;

revoke all on function public.record_debt_capability_impl(jsonb) from public, anon, authenticated;
revoke all on function public.settle_debt_capability_impl(jsonb) from public, anon, authenticated;
revoke all on function public.request_reversal_capability_impl(jsonb) from public, anon, authenticated;

create or replace function public.record_debt(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  direction_value text := lower(trim(command->>'direction'));
  capability_value text;
  base_amount_value numeric;
begin
  command := public.prepare_inline_rate(command, 'debt_create');
  if direction_value not in ('receivable', 'payable') then
    raise exception 'DEBT_DIRECTION_INVALID: Debt direction must be receivable or payable';
  end if;
  capability_value := case when direction_value = 'receivable'
    then 'debt.create.receivable' else 'debt.create.payable' end;
  base_amount_value := public.authoritative_base_amount(
    nullif(command->>'organization_id', '')::uuid,
    nullif(command->>'branch_id', '')::uuid,
    upper(command->>'currency'),
    nullif(command->>'amount', '')::numeric,
    false
  );
  command := command || jsonb_build_object('base_amount', base_amount_value);
  command := command || jsonb_build_object('workflow_type', 'debt_' || direction_value || '_create');
  perform public.require_capability(
    nullif(command->>'organization_id', '')::uuid,
    capability_value,
    jsonb_strip_nulls(jsonb_build_object(
      'branch_id', nullif(command->>'branch_id', ''),
      'cashbox_id', nullif(command->>'cashbox_id', ''),
      'amount_native', nullif(command->>'amount', ''),
      'amount_base', coalesce(nullif(command->>'base_amount', ''), nullif(command->>'amount', '')),
      'currency', nullif(command->>'currency', ''),
      'requires_active_plan', true,
      'device_id', nullif(command->>'device_id', '')
    ))
  );
  return public.record_debt_capability_impl(command);
end;
$$;

create or replace function public.settle_debt(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  debt_row public.debts;
  capability_value text;
  base_amount_value numeric;
begin
  select d.* into debt_row from public.debts d
  where d.id = nullif(command->>'debt_id', '')::uuid;
  if debt_row.id is null then raise exception 'DEBT_NOT_FOUND: Debt is unavailable'; end if;
  capability_value := case when debt_row.direction = 'receivable'
    then 'debt.settle.receivable' else 'debt.settle.payable' end;
  command := command || jsonb_build_object('workflow_type', 'debt_' || debt_row.direction || '_settle');
  command := public.prepare_inline_rate(
    command || jsonb_build_object(
      'organization_id', debt_row.organization_id,
      'branch_id', debt_row.branch_id,
      'currency', debt_row.currency_code
    ),
    'debt_settle'
  );
  base_amount_value := public.authoritative_base_amount(
    debt_row.organization_id, debt_row.branch_id, debt_row.currency_code,
    nullif(command->>'amount', '')::numeric, false
  );
  command := command || jsonb_build_object('base_amount', base_amount_value);
  perform public.require_capability(debt_row.organization_id, capability_value, jsonb_strip_nulls(jsonb_build_object(
    'branch_id', debt_row.branch_id,
    'cashbox_id', nullif(command->>'cashbox_id', ''),
    'amount_native', nullif(command->>'amount', ''),
    'amount_base', coalesce(nullif(command->>'base_amount', ''), nullif(command->>'amount', '')),
    'currency', debt_row.currency_code,
    'requires_active_plan', true,
    'device_id', nullif(command->>'device_id', '')
  )));
  return public.settle_debt_capability_impl(command);
end;
$$;

drop policy if exists debts_org_read on public.debts;
create policy debts_capability_read on public.debts
  for select to authenticated
  using (
    public.has_capability(organization_id, 'debt.view', jsonb_build_object('branch_id', branch_id))
    and (
      direction = 'receivable'
      or public.has_capability(organization_id, 'debt.create.payable', jsonb_build_object('branch_id', branch_id))
      or public.has_capability(organization_id, 'debt.settle.payable', jsonb_build_object('branch_id', branch_id))
      or public.has_capability(organization_id, 'financial.report', '{}'::jsonb)
    )
  );

create or replace function public.get_debts_v5(target_org uuid)
returns table (
  id uuid,
  branch_id uuid,
  counterparty_id uuid,
  counterparty_name text,
  direction text,
  currency_code text,
  original_amount numeric,
  outstanding_amount numeric,
  due_at timestamptz,
  notes text,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select d.id, d.branch_id, d.counterparty_id, cp.display_name, d.direction, d.currency_code,
    d.original_amount, d.outstanding_amount, d.due_at, d.notes, d.created_at
  from public.debts d
  join public.counterparties cp on cp.id = d.counterparty_id and cp.organization_id = d.organization_id
  where d.organization_id = target_org
    and d.outstanding_amount > 0
    and public.has_capability(target_org, 'debt.view', jsonb_build_object('branch_id', d.branch_id))
    and (
      d.direction = 'receivable'
      or public.has_capability(target_org, 'debt.create.payable', jsonb_build_object('branch_id', d.branch_id))
      or public.has_capability(target_org, 'debt.settle.payable', jsonb_build_object('branch_id', d.branch_id))
      or public.has_capability(target_org, 'financial.report', '{}'::jsonb)
    )
  order by d.created_at desc, d.id desc;
$$;

create or replace function public.get_debt_detail_v5(target_org uuid, target_debt uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  debt_row public.debts;
  result jsonb;
begin
  select d.* into debt_row from public.debts d
  where d.id = target_debt and d.organization_id = target_org;
  if debt_row.id is null then return null; end if;
  if not public.has_capability(target_org, 'debt.view', jsonb_build_object('branch_id', debt_row.branch_id)) then
    raise exception 'CAPABILITY_REQUIRED:debt.view' using errcode = '42501';
  end if;
  if debt_row.direction = 'payable'
     and not public.has_capability(target_org, 'debt.create.payable', jsonb_build_object('branch_id', debt_row.branch_id))
     and not public.has_capability(target_org, 'debt.settle.payable', jsonb_build_object('branch_id', debt_row.branch_id))
     and not public.has_capability(target_org, 'financial.report', '{}'::jsonb) then
    raise exception 'CAPABILITY_REQUIRED:debt.view.payable' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', d.id,
    'branch_id', d.branch_id,
    'counterparty_id', d.counterparty_id,
    'counterparty_name', cp.display_name,
    'direction', d.direction,
    'currency_code', d.currency_code,
    'original_amount', d.original_amount,
    'outstanding_amount', d.outstanding_amount,
    'due_at', d.due_at,
    'notes', d.notes,
    'created_at', d.created_at,
    'can_settle', public.has_capability(target_org,
      case when d.direction = 'receivable' then 'debt.settle.receivable' else 'debt.settle.payable' end,
      jsonb_build_object('branch_id', d.branch_id, 'amount_native', d.outstanding_amount, 'currency', d.currency_code)
    ),
    'settlements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'amount', s.amount, 'currency_code', s.currency_code,
        'journal_entry_id', s.journal_entry_id, 'created_at', s.created_at
      ) order by s.created_at, s.id)
      from public.settlements s where s.organization_id = target_org and s.debt_id = d.id
    ), '[]'::jsonb)
  ) into result
  from public.debts d
  join public.counterparties cp on cp.id = d.counterparty_id
  where d.id = debt_row.id;
  return result;
end;
$$;

revoke all on function public.record_debt(jsonb) from public, anon;
revoke all on function public.settle_debt(jsonb) from public, anon;
revoke all on function public.get_debts_v5(uuid) from public, anon;
revoke all on function public.get_debt_detail_v5(uuid, uuid) from public, anon;
grant execute on function public.record_debt(jsonb) to authenticated;
grant execute on function public.settle_debt(jsonb) to authenticated;
grant execute on function public.get_debts_v5(uuid) to authenticated;
grant execute on function public.get_debt_detail_v5(uuid, uuid) to authenticated;

create or replace function public.get_counterparty_detail_v5(target_org uuid, target_counterparty uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare result jsonb;
begin
  if not (
    public.has_capability(target_org, 'customers.manage', '{}'::jsonb)
    or public.has_capability(target_org, 'debt.view', '{}'::jsonb)
    or public.has_capability(target_org, 'hawala.view', '{}'::jsonb)
    or public.has_capability(target_org, 'transactions.view', '{}'::jsonb)
  ) then
    raise exception 'CAPABILITY_REQUIRED:counterparty.view' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', cp.id,
    'display_name', cp.display_name,
    'counterparty_type', cp.counterparty_type,
    'risk_status', cp.risk_status,
    'phone', cp.phone,
    'notes', cp.notes
  ) into result
  from public.counterparties cp
  where cp.id = target_counterparty and cp.organization_id = target_org;
  return result;
end;
$$;

revoke all on function public.get_counterparty_detail_v5(uuid, uuid) from public, anon;
grant execute on function public.get_counterparty_detail_v5(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Role-specific dashboards (cashier and compliance views are data-minimized)
-- ---------------------------------------------------------------------------

create or replace function public.get_scoped_financial_dashboard(
  target_org uuid,
  target_day date,
  target_member uuid,
  target_role text,
  reveal_profit boolean default false,
  own_activity_only boolean default false
)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  with scope_flags as materialized (
    select
      exists(select 1 from public.organization_branch_access ba where ba.membership_id = target_member) as branch_scoped,
      exists(select 1 from public.organization_cashbox_access ca where ca.membership_id = target_member) as cashbox_scoped
  ), scoped_entries as materialized (
    select
      je.id, je.branch_id, je.status, je.occurred_at, je.created_by,
      fe.id as event_id, fe.immutable_reference, fe.event_type, fe.metadata
    from public.journal_entries je
    join public.financial_events fe on fe.id = je.financial_event_id and fe.organization_id = target_org
    cross join scope_flags sf
    where je.organization_id = target_org and je.status = 'posted'
      and (
        not sf.branch_scoped
        or exists (
          select 1 from public.organization_branch_access ba
          where ba.membership_id = target_member and ba.branch_id = je.branch_id
        )
      )
      and (
        not sf.cashbox_scoped
        or exists (
          select 1
          from public.journal_lines access_line
          join public.ledger_accounts access_account on access_account.id = access_line.account_id
          join public.organization_cashbox_access ca
            on ca.membership_id = target_member
           and ca.cashbox_id = coalesce(
             access_account.cashbox_id,
             case when fe.metadata->>'cashbox_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
               then (fe.metadata->>'cashbox_id')::uuid else null end
           )
          where access_line.journal_entry_id = je.id
        )
      )
  ), scoped_lines as materialized (
    select
      se.id as journal_entry_id, se.occurred_at, se.event_id, se.metadata,
      jl.currency_code, jl.native_debit, jl.native_credit, jl.base_debit, jl.base_credit,
      la.id as account_id, la.code as account_code, la.name as account_name,
      la.category, coalesce(
        la.cashbox_id,
        case when se.metadata->>'cashbox_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (se.metadata->>'cashbox_id')::uuid else null end
      ) as resolved_cashbox_id
    from scoped_entries se
    join public.journal_lines jl on jl.journal_entry_id = se.id
    join public.ledger_accounts la on la.id = jl.account_id and la.organization_id = target_org
  ), profit_totals as (
    select
      coalesce(sum(case
        when sl.account_code = 'income:realized-fx-gain' then sl.base_credit - sl.base_debit
        when sl.account_code = 'expense:realized-fx-loss' then sl.base_credit - sl.base_debit
        else 0 end), 0) as realized_profit,
      coalesce(sum(case when sl.account_code like 'income:commission:%' then sl.base_credit - sl.base_debit else 0 end), 0) as commission_income,
      coalesce(sum(case when sl.category = 'expense' then sl.base_debit - sl.base_credit else 0 end), 0) as expenses
    from scoped_lines sl where sl.occurred_at::date = target_day
  ), position_rows as (
    select
      sl.currency_code as currency,
      sum(sl.native_debit - sl.native_credit) as quantity,
      sum(sl.base_debit - sl.base_credit) as carrying_base_value
    from scoped_lines sl
    where sl.category = 'asset'
    group by sl.currency_code
  ), location_rows as (
    select
      coalesce(cb.id::text, sl.account_id::text) as location_id,
      case
        when cb.id is not null then 'cashbox'
        when sl.account_code like 'bank:%' then 'bank'
        when sl.account_code like 'location:%' then 'location'
        else 'account'
      end as location_type,
      coalesce(
        cb.name,
        case
          when sl.account_code like 'bank:%' then regexp_replace(regexp_replace(sl.account_code, '^bank:', ''), ':[A-Z]{3}$', '')
          when sl.account_code like 'location:%' then regexp_replace(regexp_replace(sl.account_code, '^location:', ''), ':[A-Z]{3}$', '')
          else sl.account_name
        end
      ) as location_name,
      sl.currency_code as currency,
      sum(sl.native_debit - sl.native_credit) as quantity
    from scoped_lines sl
    left join public.cashboxes cb on cb.id = sl.resolved_cashbox_id and cb.organization_id = target_org
    where sl.category = 'asset'
    group by coalesce(cb.id::text, sl.account_id::text),
      case when cb.id is not null then 'cashbox' when sl.account_code like 'bank:%' then 'bank' when sl.account_code like 'location:%' then 'location' else 'account' end,
      coalesce(cb.name, case when sl.account_code like 'bank:%' then regexp_replace(regexp_replace(sl.account_code, '^bank:', ''), ':[A-Z]{3}$', '') when sl.account_code like 'location:%' then regexp_replace(regexp_replace(sl.account_code, '^location:', ''), ':[A-Z]{3}$', '') else sl.account_name end),
      sl.currency_code
  ), debt_rows as (
    select d.direction, d.currency_code as currency, sum(d.outstanding_amount) as amount
    from public.debts d cross join scope_flags sf
    where d.organization_id = target_org and d.outstanding_amount > 0
      and (not sf.branch_scoped or exists (
        select 1 from public.organization_branch_access ba
        where ba.membership_id = target_member and ba.branch_id = d.branch_id
      ))
    group by d.direction, d.currency_code
  ), activity_rows as (
    select jsonb_build_object(
      'id', se.event_id,
      'reference', se.immutable_reference,
      'type', se.event_type,
      'occurred_at', se.occurred_at,
      'status', se.status
    ) as row_data, se.occurred_at
    from scoped_entries se
    where se.occurred_at::date = target_day
      and (not own_activity_only or se.created_by = (select auth.uid()))
    order by se.occurred_at desc, se.id desc
    limit 30
  )
  select jsonb_build_object(
    'organization_id', target_org,
    'business_date', target_day,
    'role_code', target_role,
    'profit_hidden', not reveal_profit,
    'fresh_at', now(),
    'transaction_count', (select count(*) from scoped_entries se where se.occurred_at::date = target_day and (not own_activity_only or se.created_by = (select auth.uid()))),
    'buy_count', (select count(*) from scoped_entries se where se.occurred_at::date = target_day and se.event_type = 'buy_fx' and (not own_activity_only or se.created_by = (select auth.uid()))),
    'sell_count', (select count(*) from scoped_entries se where se.occurred_at::date = target_day and se.event_type = 'sell_fx' and (not own_activity_only or se.created_by = (select auth.uid()))),
    'exchange_count', (select count(*) from scoped_entries se where se.occurred_at::date = target_day and se.event_type = 'exchange_fx' and (not own_activity_only or se.created_by = (select auth.uid()))),
    'volume_base', coalesce((select sum(sl.base_debit) from scoped_lines sl where sl.occurred_at::date = target_day and sl.base_debit > 0), 0),
    'realized_profit', case when reveal_profit then pt.realized_profit else null end,
    'commission_income', case when reveal_profit then pt.commission_income else null end,
    'expenses', case when reveal_profit then pt.expenses else null end,
    'net_result', case when reveal_profit then pt.realized_profit + pt.commission_income - pt.expenses else null end,
    'net_position_base', coalesce((select sum(sl.base_debit - sl.base_credit) from scoped_lines sl where sl.category in ('asset', 'liability')), 0),
    'pending_approvals', (select count(*) from public.approval_requests ar cross join scope_flags sf where ar.organization_id = target_org and ar.status = 'pending' and (not sf.branch_scoped or ar.branch_id is null or exists (select 1 from public.organization_branch_access ba where ba.membership_id = target_member and ba.branch_id = ar.branch_id))),
    'reconciliation_differences', coalesce((select sum(ccl.variance_amount) from public.cashbox_close_lines ccl join public.cashbox_closes cc on cc.id = ccl.close_id cross join scope_flags sf where cc.organization_id = target_org and cc.business_date = target_day and (not sf.branch_scoped or exists (select 1 from public.organization_branch_access ba where ba.membership_id = target_member and ba.branch_id = cc.branch_id)) and (not sf.cashbox_scoped or exists (select 1 from public.organization_cashbox_access ca where ca.membership_id = target_member and ca.cashbox_id = cc.cashbox_id))), 0),
    'positions', coalesce((select jsonb_agg(to_jsonb(pr) order by pr.currency) from position_rows pr where pr.quantity <> 0), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(lr) order by lr.location_name, lr.currency) from location_rows lr where lr.quantity <> 0), '[]'::jsonb),
    'receivables', coalesce((select jsonb_agg(jsonb_build_object('currency', dr.currency, 'amount', dr.amount) order by dr.currency) from debt_rows dr where dr.direction = 'receivable'), '[]'::jsonb),
    'payables', coalesce((select jsonb_agg(jsonb_build_object('currency', dr.currency, 'amount', dr.amount) order by dr.currency) from debt_rows dr where dr.direction = 'payable'), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(ar.row_data order by ar.occurred_at desc) from activity_rows ar), '[]'::jsonb)
  )
  from profit_totals pt;
$$;

revoke all on function public.get_scoped_financial_dashboard(uuid, date, uuid, text, boolean, boolean) from public, anon, authenticated;

create or replace function public.get_role_dashboard(target_org uuid, target_day date default current_date)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  member_id uuid;
  role_value text;
  required_capability text;
  base_dashboard jsonb;
  activity_rows jsonb;
  result jsonb;
  cashier_profit_hidden_value boolean := true;
begin
  select m.id, m.role_code into member_id, role_value
  from public.organization_memberships m
  where m.organization_id = target_org and m.user_id = (select auth.uid()) and m.active;
  if member_id is null or not public.is_platform_user_active() then
    raise exception 'WORKSPACE_ACCESS_REQUIRED: Active organization access is required';
  end if;
  required_capability := case role_value
    when 'owner' then 'dashboard.owner'
    when 'business_admin' then 'dashboard.owner'
    when 'manager' then 'dashboard.manager'
    when 'accountant' then 'dashboard.accountant'
    when 'cashier' then 'dashboard.cashier'
    when 'viewer' then 'dashboard.viewer'
    when 'compliance_officer' then 'dashboard.compliance'
    else 'capability.invalid'
  end;
  perform public.require_capability(target_org, required_capability, '{}'::jsonb);

  if role_value = 'cashier' then
    select coalesce(os.cashier_profit_hidden, true) into cashier_profit_hidden_value
    from public.organization_settings os where os.organization_id = target_org;
    result := public.get_scoped_financial_dashboard(
      target_org, target_day, member_id, role_value,
      not cashier_profit_hidden_value, true
    );
  elsif role_value = 'compliance_officer' then
    select coalesce(jsonb_agg(row_data order by occurred_at desc), '[]'::jsonb)
    into activity_rows
    from (
      select occurred_at, row_data
      from (
        select a.created_at as occurred_at, jsonb_build_object(
          'id', a.id,
          'reference', left(a.id::text, 12),
          'type', 'compliance_alert:' || a.alert_type,
          'occurred_at', a.created_at,
          'status', a.status
        ) as row_data
        from public.compliance_alerts a
        where a.organization_id = target_org and a.status in ('open', 'under_review')
        union all
        select c.created_at as occurred_at, jsonb_build_object(
          'id', c.id,
          'reference', coalesce(c.submitted_reference, left(c.id::text, 12)),
          'type', 'compliance_case',
          'occurred_at', c.created_at,
          'status', c.report_status
        ) as row_data
        from public.compliance_cases c
        where c.organization_id = target_org and c.report_status not in ('submitted', 'closed')
      ) compliance_queue
      order by occurred_at desc
      limit 30
    ) limited_queue;
    result := jsonb_build_object(
      'role_code', role_value,
      'profit_hidden', true,
      'transaction_count', jsonb_array_length(activity_rows),
      'buy_count', 0,
      'sell_count', 0,
      'exchange_count', 0,
      'volume_base', 0,
      'realized_profit', null,
      'commission_income', null,
      'expenses', null,
      'net_result', null,
      'net_position_base', null,
      'reconciliation_differences', 0,
      'pending_approvals', jsonb_array_length(activity_rows),
      'fresh_at', now(),
      'positions', '[]'::jsonb,
      'locations', '[]'::jsonb,
      'receivables', '[]'::jsonb,
      'payables', '[]'::jsonb,
      'activity', activity_rows,
      'open_compliance_alerts', (select count(*) from public.compliance_alerts a where a.organization_id = target_org and a.status <> 'closed'),
      'open_compliance_cases', (select count(*) from public.compliance_cases c where c.organization_id = target_org and c.report_status not in ('submitted', 'closed'))
    );
  elsif role_value = 'owner' then
    base_dashboard := public.get_owner_dashboard(target_org, target_day);
    result := base_dashboard || jsonb_build_object(
      'role_code', role_value,
      'profit_hidden', false
    );
  elsif role_value = 'accountant' then
    result := public.get_scoped_financial_dashboard(target_org, target_day, member_id, role_value, true, false);
  elsif role_value in ('business_admin', 'manager', 'viewer') then
    result := public.get_scoped_financial_dashboard(target_org, target_day, member_id, role_value, false, false);
  else
    raise exception 'DASHBOARD_ROLE_UNSUPPORTED: No dashboard read model exists for this role';
  end if;
  return result;
end;
$$;

revoke all on function public.get_role_dashboard(uuid, date) from public, anon;
grant execute on function public.get_role_dashboard(uuid, date) to authenticated;
revoke all on function public.get_owner_dashboard(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private documents: exact metadata/storage policies and pre-sign audit
-- ---------------------------------------------------------------------------

alter table public.attachments
  add column if not exists document_type text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id),
  add column if not exists archive_reason text,
  add column if not exists retention_until timestamptz,
  add column if not exists legal_hold boolean not null default false;

update public.attachments
set document_type = split_part(entity_type, ':', 2)
where document_type is null and entity_type like 'counterparty:%';

create index if not exists attachments_org_entity_active_idx
  on public.attachments (organization_id, entity_id, created_at desc)
  where archived_at is null;

create or replace function public.private_document_org_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare first_segment text := split_part(object_name, '/', 1);
begin
  if first_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return first_segment::uuid;
  end if;
  return null;
end;
$$;

create or replace function public.private_document_entity_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare second_segment text := split_part(object_name, '/', 2);
begin
  if second_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return second_segment::uuid;
  end if;
  return null;
end;
$$;

drop policy if exists attachments_member_read on public.attachments;
drop policy if exists attachments_compliance_insert on public.attachments;
create policy attachments_document_list on public.attachments
  for select to authenticated
  using (
    public.has_capability(organization_id, 'documents.list', '{}')
    and storage_path like organization_id::text || '/%'
  );
create policy attachments_document_insert on public.attachments
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and entity_type like 'counterparty:%'
    and storage_path like organization_id::text || '/' || entity_id::text || '/%'
    and public.has_capability(organization_id, 'documents.upload', '{}')
    and exists (
      select 1 from public.counterparties cp
      where cp.id = entity_id and cp.organization_id = organization_id
    )
  );

drop policy if exists private_documents_read on storage.objects;
drop policy if exists private_documents_insert on storage.objects;
drop policy if exists private_documents_capability_read on storage.objects;
-- Authenticated browser clients intentionally receive no storage.objects SELECT
-- policy. Short-lived reads are signed by the private-document-url Edge Function
-- only after authorize_private_document_access records the access event.
create policy private_documents_capability_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sarafi-private-documents'
    and public.private_document_org_id(name) is not null
    and public.has_capability(public.private_document_org_id(name), 'documents.upload', '{}')
    and public.private_document_entity_id(name) is not null
    and exists (
      select 1 from public.counterparties cp
      where cp.organization_id = public.private_document_org_id(name)
        and cp.id = public.private_document_entity_id(name)
    )
  );

create or replace function public.record_sensitive_document_access(
  target_org uuid,
  target_entity uuid,
  action text
)
returns public.compliance_audit_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability_value text;
  result public.compliance_audit_events;
begin
  capability_value := case action
    when 'upload' then 'documents.upload'
    when 'view' then 'documents.view'
    when 'download' then 'documents.download'
    when 'archive' then 'documents.archive'
    else 'capability.invalid'
  end;
  perform public.require_capability(target_org, capability_value, '{}');
  if not exists (
    select 1 from public.attachments a
    where a.id = target_entity and a.organization_id = target_org
  ) then raise exception 'DOCUMENT_NOT_FOUND: Private document metadata is unavailable'; end if;
  insert into public.compliance_audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id
  ) values (
    target_org, (select auth.uid()), action, 'counterparty_document', target_entity
  ) returning * into result;
  return result;
end;
$$;

create or replace function public.authorize_private_document_access(
  target_org uuid,
  target_document uuid,
  requested_action text default 'view'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attachment_row public.attachments;
  audit_row public.compliance_audit_events;
  capability_value text;
begin
  if requested_action not in ('view', 'download') then
    raise exception 'DOCUMENT_ACTION_INVALID: Access action must be view or download';
  end if;
  capability_value := case when requested_action = 'download' then 'documents.download' else 'documents.view' end;
  perform public.require_capability(target_org, capability_value, '{}');
  select a.* into attachment_row from public.attachments a
  where a.id = target_document and a.organization_id = target_org and a.archived_at is null;
  if attachment_row.id is null then raise exception 'DOCUMENT_NOT_FOUND: Active private document is unavailable'; end if;
  if attachment_row.storage_path not like target_org::text || '/' || attachment_row.entity_id::text || '/%' then
    raise exception 'DOCUMENT_PATH_INVALID: Stored path does not match document tenancy';
  end if;
  insert into public.compliance_audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id
  ) values (
    target_org, (select auth.uid()), requested_action,
    'counterparty_document', target_document
  ) returning * into audit_row;
  return jsonb_build_object(
    'document_id', attachment_row.id,
    'storage_path', attachment_row.storage_path,
    'content_type', attachment_row.content_type,
    'size_bytes', attachment_row.size_bytes,
    'sha256', attachment_row.sha256,
    'expires_in', 300,
    'audit_event_id', audit_row.id
  );
end;
$$;

create or replace function public.archive_private_document(
  target_org uuid,
  target_document uuid,
  reason_input text,
  legal_hold_input boolean default false,
  retention_until_input timestamptz default null
)
returns public.attachments
language plpgsql
security definer
set search_path = ''
as $$
declare result public.attachments;
begin
  perform public.require_capability(target_org, 'documents.archive', '{}');
  if length(trim(coalesce(reason_input, ''))) < 3 then
    raise exception 'DOCUMENT_ARCHIVE_REASON_REQUIRED: Record an archive reason';
  end if;
  update public.attachments
  set archived_at = coalesce(archived_at, now()),
      archived_by = coalesce(archived_by, (select auth.uid())),
      archive_reason = trim(reason_input),
      legal_hold = legal_hold_input,
      retention_until = retention_until_input
  where id = target_document and organization_id = target_org
  returning * into result;
  if result.id is null then raise exception 'DOCUMENT_NOT_FOUND: Private document is unavailable'; end if;
  perform public.record_sensitive_document_access(target_org, target_document, 'archive');
  return result;
end;
$$;

revoke all on function public.private_document_org_id(text) from public, anon, authenticated;
revoke all on function public.private_document_entity_id(text) from public, anon, authenticated;
revoke all on function public.record_sensitive_document_access(uuid, uuid, text) from public, anon;
revoke all on function public.authorize_private_document_access(uuid, uuid, text) from public, anon;
revoke all on function public.archive_private_document(uuid, uuid, text, boolean, timestamptz) from public, anon;
grant execute on function public.record_sensitive_document_access(uuid, uuid, text) to authenticated;
grant execute on function public.authorize_private_document_access(uuid, uuid, text) to authenticated;
grant execute on function public.archive_private_document(uuid, uuid, text, boolean, timestamptz) to authenticated;
grant execute on function public.private_document_org_id(text) to authenticated;
grant execute on function public.private_document_entity_id(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Shared, configurable, atomic FX rate workflow
-- ---------------------------------------------------------------------------

alter table public.organization_settings
  add column if not exists rate_max_age_minutes integer not null default 1440,
  add column if not exists rate_tolerance_bps numeric(12,4) not null default 50;
alter table public.organization_settings drop constraint if exists organization_settings_rate_max_age_check;
alter table public.organization_settings
  add constraint organization_settings_rate_max_age_check check (rate_max_age_minutes between 1 and 10080);
alter table public.organization_settings drop constraint if exists organization_settings_rate_tolerance_bps_check;
alter table public.organization_settings
  add constraint organization_settings_rate_tolerance_bps_check check (rate_tolerance_bps between 0 and 10000);

create or replace function public.update_organization_control_settings(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid := nullif(command->>'organization_id', '')::uuid;
  previous public.organization_settings;
  result public.organization_settings;
  language_value text := coalesce(command->>'default_language', 'en');
  timezone_value text := coalesce(command->>'timezone', 'Asia/Kabul');
  receipt_value text := upper(trim(coalesce(command->>'receipt_prefix', 'SAR')));
  date_value text := coalesce(command->>'date_display', 'both');
  digit_value text := coalesce(command->>'digit_display', 'western');
  approval_value numeric := coalesce((command->>'approval_threshold_base')::numeric, 0);
  offline_value numeric := coalesce((command->>'offline_limit_base')::numeric, 0);
  negative_value boolean := coalesce((command->>'negative_cash_allowed')::boolean, false);
  cashier_profit_value boolean := coalesce((command->>'cashier_profit_hidden')::boolean, true);
  rate_age_value integer := coalesce((command->>'rate_max_age_minutes')::integer, 1440);
  rate_tolerance_value numeric := coalesce((command->>'rate_tolerance_bps')::numeric, 50);
begin
  perform public.require_capability(target_org, 'organization.manage', '{}'::jsonb);
  if language_value not in ('en', 'fa-AF', 'ps-AF') then raise exception 'Unsupported language'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = timezone_value) then raise exception 'Unsupported timezone'; end if;
  if receipt_value !~ '^[A-Z0-9-]{2,10}$' then raise exception 'Receipt prefix must contain 2 to 10 letters, numbers, or hyphens'; end if;
  if date_value not in ('gregorian', 'solar_hijri', 'both') then raise exception 'Unsupported date display'; end if;
  if digit_value not in ('western', 'localized') then raise exception 'Unsupported digit display'; end if;
  if approval_value < 0 or offline_value < 0 then raise exception 'Thresholds cannot be negative'; end if;
  if rate_age_value not between 1 and 10080 then raise exception 'Rate age must be between 1 and 10080 minutes'; end if;
  if rate_tolerance_value not between 0 and 10000 then raise exception 'Rate tolerance must be between 0 and 10000 basis points'; end if;
  select * into previous from public.organization_settings where organization_id = target_org for update;
  if previous.organization_id is null then raise exception 'Organization settings not found'; end if;
  if previous.negative_cash_allowed is distinct from negative_value
     or previous.approval_threshold_base is distinct from approval_value
     or previous.offline_limit_base is distinct from offline_value
     or previous.rate_max_age_minutes is distinct from rate_age_value
     or previous.rate_tolerance_bps is distinct from rate_tolerance_value then
    perform public.require_aal2();
  end if;
  update public.organization_settings
  set default_language = language_value, timezone = timezone_value, receipt_prefix = receipt_value,
      negative_cash_allowed = negative_value, date_display = date_value, digit_display = digit_value,
      approval_threshold_base = approval_value, offline_limit_base = offline_value,
      cashier_profit_hidden = cashier_profit_value, rate_max_age_minutes = rate_age_value,
      rate_tolerance_bps = rate_tolerance_value, updated_at = now()
  where organization_id = target_org returning * into result;
  update public.organizations set timezone = timezone_value where id = target_org;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (target_org, (select auth.uid()), 'organization_controls_updated', jsonb_build_object(
    'date_display', date_value, 'digit_display', digit_value, 'approval_threshold_base', approval_value,
    'offline_limit_base', offline_value, 'negative_cash_allowed', negative_value,
    'cashier_profit_hidden', cashier_profit_value, 'rate_max_age_minutes', rate_age_value,
    'rate_tolerance_bps', rate_tolerance_value));
  return to_jsonb(result);
end;
$$;

revoke all on function public.update_organization_control_settings(jsonb) from public, anon;
grant execute on function public.update_organization_control_settings(jsonb) to authenticated;

update public.approval_requests
set draft_payload = payload_summary
where action_type = 'fx_trade' and draft_payload is null;

create or replace function public.enforce_authoritative_fx_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  side_value text := new.event_type::text;
  base_currency_value text := upper(new.metadata->>'base_currency');
  actor_role text;
  approval_id_value uuid := nullif(new.metadata->>'approval_id', '')::uuid;
  approval_valid boolean := false;
  override_reason_value text := nullif(trim(new.metadata->>'override_reason'), '');
  allow_stale_value boolean := coalesce((new.metadata->>'allow_stale_rate')::boolean, false);
  max_age_minutes_value integer := 1440;
  default_tolerance_bps numeric := 50;
  leg record;
  expected_rate numeric;
  rate_id_value uuid;
  rate_tolerance numeric;
  effective_value timestamptz;
  actual_rate numeric;
  effective_tolerance_bps numeric;
  difference_bps numeric;
  stale_value boolean;
  outside_value boolean;
  validated_legs jsonb := '[]'::jsonb;
begin
  if side_value not in ('buy_fx', 'sell_fx', 'exchange_fx') then return new; end if;
  if base_currency_value is null then raise exception 'RATE_INVALID: Base currency is required'; end if;
  select m.role_code into actor_role from public.organization_memberships m
  where m.organization_id = new.organization_id and m.user_id = (select auth.uid()) and m.active;
  select os.rate_max_age_minutes, os.rate_tolerance_bps
  into max_age_minutes_value, default_tolerance_bps
  from public.organization_settings os where os.organization_id = new.organization_id;
  max_age_minutes_value := coalesce(max_age_minutes_value, 1440);
  default_tolerance_bps := coalesce(default_tolerance_bps, 50);

  if approval_id_value is not null then
    select exists (
      select 1 from public.approval_requests a
      where a.id = approval_id_value and a.organization_id = new.organization_id
        and a.action_type = 'fx_trade' and a.status = 'approved'
        and a.expires_at > now() and a.requested_by = (select auth.uid())
        and a.decided_by is not null and a.decided_by <> a.requested_by
        and a.consumed_at is null
        and a.payload_summary->>'client_command_id' = new.client_command_id
    ) into approval_valid;
  end if;

  for leg in
    select * from (values
      ('sold', upper(new.metadata->>'sold_currency'), nullif(new.metadata->>'sold_amount', '')::numeric,
        nullif(new.metadata->>'sold_base_value', '')::numeric, 'sell'),
      ('bought', upper(new.metadata->>'bought_currency'), nullif(new.metadata->>'bought_amount', '')::numeric,
        nullif(new.metadata->>'bought_base_value', '')::numeric, 'buy')
    ) as legs(leg_name, currency_code, native_amount, base_amount, rate_side)
  loop
    if leg.currency_code is null or leg.native_amount is null or leg.native_amount <= 0
       or leg.base_amount is null or leg.base_amount <= 0 then
      raise exception 'RATE_INVALID: Both FX legs require positive native and base amounts';
    end if;
    actual_rate := leg.base_amount / leg.native_amount;
    rate_id_value := null;
    if leg.currency_code = base_currency_value then
      expected_rate := 1;
      effective_value := coalesce(new.occurred_at, now());
      rate_tolerance := 0;
    else
      select r.id, case when leg.rate_side = 'buy' then r.buy_rate else r.sell_rate end,
             r.spread_tolerance, r.effective_from
      into rate_id_value, expected_rate, rate_tolerance, effective_value
      from public.rate_board_entries r
      where r.organization_id = new.organization_id
        and r.from_currency = leg.currency_code
        and r.to_currency = base_currency_value
        and r.active and r.effective_from <= coalesce(new.occurred_at, now())
        and (r.branch_id is null or r.branch_id = new.branch_id)
      order by (r.branch_id is not null) desc, r.effective_from desc
      limit 1;
    end if;

    stale_value := effective_value is not null
      and effective_value < now() - make_interval(mins => max_age_minutes_value);
    effective_tolerance_bps := greatest(
      default_tolerance_bps,
      case when expected_rate is null or expected_rate = 0 then 0
        else coalesce(rate_tolerance, 0) / expected_rate * 10000 end
    );
    difference_bps := case when expected_rate is null or expected_rate = 0 then null
      else abs(actual_rate - expected_rate) / expected_rate * 10000 end;
    outside_value := difference_bps is not null and difference_bps > effective_tolerance_bps;

    if expected_rate is null or (stale_value and not allow_stale_value) or outside_value then
      if not approval_valid then
        if actor_role not in ('owner', 'business_admin', 'manager') then
          if expected_rate is null then raise exception 'RATE_MISSING: Publish a shop rate or obtain approval'; end if;
          if stale_value then raise exception 'RATE_STALE: Refresh the shop rate or obtain approval'; end if;
          raise exception 'RATE_APPROVAL_REQUIRED: FX leg is outside the configured tolerance';
        end if;
        if override_reason_value is null or length(override_reason_value) < 3 then
          raise exception 'RATE_OVERRIDE_REASON_REQUIRED: Record a reason for the rate decision';
        end if;
        perform public.require_aal2();
      end if;
    end if;

    validated_legs := validated_legs || jsonb_build_array(jsonb_build_object(
      'leg', leg.leg_name,
      'currency', leg.currency_code,
      'rate_id', rate_id_value,
      'rate_context_id', encode(extensions.digest(concat_ws('|',
        new.organization_id::text, coalesce(new.branch_id::text, 'organization'),
        leg.currency_code, base_currency_value, coalesce(rate_id_value::text, 'base'),
        coalesce(expected_rate::text, 'missing'), coalesce(effective_value::text, 'missing')
      ), 'sha256'), 'hex'),
      'actual_rate', actual_rate,
      'shop_rate', expected_rate,
      'effective_from', effective_value,
      'stale', stale_value,
      'difference_bps', difference_bps,
      'tolerance_bps', effective_tolerance_bps
    ));
  end loop;

  new.metadata := new.metadata || jsonb_build_object(
    'rate_control_version', 5,
    'rate_validated_legs', validated_legs,
    'rate_max_age_minutes', max_age_minutes_value,
    'rate_source', case
      when approval_valid then 'approved_override'
      when override_reason_value is not null then 'transaction_override'
      else 'shop_rate'
    end
  );
  return new;
end;
$$;

create or replace function public.set_exchange_rate_capability_impl(
  target_org uuid,
  target_branch uuid,
  source_currency_input text,
  target_currency_input text,
  buy_rate_input numeric,
  sell_rate_input numeric
)
returns public.rate_board_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.rate_board_entries;
  source_currency_value text := upper(trim(source_currency_input));
  target_currency_value text := upper(trim(target_currency_input));
  group_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if source_currency_value = target_currency_value or buy_rate_input <= 0 or sell_rate_input <= 0 then
    raise exception 'RATE_INVALID';
  end if;
  if not exists (
    select 1 from public.organization_currencies c
    where c.organization_id = target_org and c.currency_code = source_currency_value and c.enabled
  ) or not exists (
    select 1 from public.organization_currencies c
    where c.organization_id = target_org and c.currency_code = target_currency_value and c.enabled
  ) then raise exception 'CURRENCY_NOT_ENABLED'; end if;
  if target_branch is not null and not exists (
    select 1 from public.branches b
    where b.id = target_branch and b.organization_id = target_org and b.active
  ) then raise exception 'BRANCH_UNAVAILABLE'; end if;
  insert into public.rate_groups (organization_id, name, code, active)
  values (target_org, 'Shop rate', 'shop-default', true)
  on conflict (organization_id, code) do update set active = true
  returning id into group_id;
  update public.rate_board_entries
  set active = false
  where organization_id = target_org and rate_group_id = group_id
    and from_currency = source_currency_value and to_currency = target_currency_value
    and branch_id is not distinct from target_branch and active;
  insert into public.rate_board_entries (
    organization_id, branch_id, rate_group_id, from_currency, to_currency,
    buy_rate, sell_rate, changed_by, active
  ) values (
    target_org, target_branch, group_id, source_currency_value, target_currency_value,
    buy_rate_input, sell_rate_input, (select auth.uid()), true
  ) returning * into result;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (target_org, (select auth.uid()), 'exchange_rate_changed', jsonb_build_object(
    'rate_id', result.id, 'from_currency', source_currency_value,
    'to_currency', target_currency_value, 'buy_rate', buy_rate_input,
    'sell_rate', sell_rate_input, 'branch_id', target_branch,
    'authorization', 'rates.manage'
  ));
  return result;
end;
$$;

revoke all on function public.set_exchange_rate_capability_impl(uuid, uuid, text, text, numeric, numeric)
from public, anon, authenticated;

create or replace function public.fx_authoritative_scope_amount(command jsonb)
returns numeric
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  branch_id_value uuid := nullif(command->>'branch_id', '')::uuid;
  base_currency_value text := upper(nullif(command->>'base_currency', ''));
  sold_currency_value text := upper(nullif(command->>'sold_currency', ''));
  bought_currency_value text := upper(nullif(command->>'bought_currency', ''));
  sold_amount_value numeric := nullif(command->>'sold_amount', '')::numeric;
  bought_amount_value numeric := nullif(command->>'bought_amount', '')::numeric;
  occurred_value timestamptz := coalesce(nullif(command->>'occurred_at', '')::timestamptz, now());
  sold_shop_rate numeric;
  bought_shop_rate numeric;
begin
  if sold_currency_value = base_currency_value then
    sold_shop_rate := 1;
  else
    select r.sell_rate into sold_shop_rate
    from public.rate_board_entries r
    where r.organization_id = org_id and r.from_currency = sold_currency_value
      and r.to_currency = base_currency_value and r.active and r.effective_from <= occurred_value
      and (r.branch_id is null or r.branch_id = branch_id_value)
    order by (r.branch_id is not null) desc, r.effective_from desc
    limit 1;
  end if;
  if bought_currency_value = base_currency_value then
    bought_shop_rate := 1;
  else
    select r.buy_rate into bought_shop_rate
    from public.rate_board_entries r
    where r.organization_id = org_id and r.from_currency = bought_currency_value
      and r.to_currency = base_currency_value and r.active and r.effective_from <= occurred_value
      and (r.branch_id is null or r.branch_id = branch_id_value)
    order by (r.branch_id is not null) desc, r.effective_from desc
    limit 1;
  end if;
  return greatest(
    coalesce(nullif(command->>'sold_base_value', '')::numeric, 0),
    coalesce(nullif(command->>'bought_base_value', '')::numeric, 0),
    coalesce(sold_amount_value * sold_shop_rate, 0),
    coalesce(bought_amount_value * bought_shop_rate, 0)
  );
end;
$$;

revoke all on function public.fx_authoritative_scope_amount(jsonb) from public, anon, authenticated;

create or replace function public.record_fx_trade_v5(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  publish_payload jsonb := command->'publish_rate';
  publish_list jsonb := case
    when jsonb_typeof(command->'publish_rates') = 'array' then command->'publish_rates'
    else '[]'::jsonb
  end;
  publication jsonb;
  approval_id_value uuid := nullif(command->>'approval_id', '')::uuid;
  scope_amount numeric;
  existing public.journal_entries;
  result public.journal_entries;
begin
  scope_amount := public.fx_authoritative_scope_amount(command);
  perform public.require_capability(org_id, 'financial.post.fx', jsonb_strip_nulls(jsonb_build_object(
    'branch_id', nullif(command->>'branch_id', ''),
    'cashbox_id', nullif(command->>'cashbox_id', ''),
    'amount_base', scope_amount,
    'requires_active_plan', true,
    'device_id', nullif(command->>'device_id', '')
  )));

  select je.* into existing
  from public.journal_entries je
  join public.financial_events fe on fe.id = je.financial_event_id
  where fe.organization_id = org_id
    and fe.client_command_id = nullif(trim(command->>'client_command_id'), '')
  limit 1;
  if existing.id is not null then return existing; end if;

  if publish_payload is not null and jsonb_typeof(publish_payload) = 'object' then
    publish_list := publish_list || jsonb_build_array(publish_payload);
  end if;
  if jsonb_array_length(publish_list) > 2 then
    raise exception 'RATE_PUBLICATION_INVALID: At most two FX legs may be published';
  end if;
  for publication in select value from jsonb_array_elements(publish_list)
  loop
    if upper(publication->>'target_currency') <> upper(command->>'base_currency')
       or upper(publication->>'source_currency') not in (
         upper(command->>'sold_currency'), upper(command->>'bought_currency')
       ) then
      raise exception 'RATE_PUBLICATION_INVALID: Published rate must match an FX leg and base currency';
    end if;
    perform public.set_exchange_rate(
      org_id,
      coalesce(nullif(publication->>'branch_id', '')::uuid, nullif(command->>'branch_id', '')::uuid),
      upper(publication->>'source_currency'),
      upper(publication->>'target_currency'),
      (publication->>'buy_rate')::numeric,
      (publication->>'sell_rate')::numeric
    );
    command := command || jsonb_build_object('rate_published_atomically', true);
  end loop;

  scope_amount := public.fx_authoritative_scope_amount(command);
  perform public.require_capability(org_id, 'financial.post.fx', jsonb_strip_nulls(jsonb_build_object(
    'branch_id', nullif(command->>'branch_id', ''),
    'cashbox_id', nullif(command->>'cashbox_id', ''),
    'amount_base', scope_amount,
    'requires_active_plan', true,
    'device_id', nullif(command->>'device_id', '')
  )));

  result := public.record_fx_trade(command - 'publish_rate' - 'publish_rates');
  if approval_id_value is not null then
    update public.approval_requests
    set consumed_at = now(), consumed_by = (select auth.uid()), consumed_journal_entry_id = result.id
    where id = approval_id_value and organization_id = org_id
      and status = 'approved' and consumed_at is null;
    if not found then raise exception 'APPROVAL_CONSUMPTION_FAILED: Approval is invalid or already used'; end if;
  end if;
  return result;
end;
$$;

create or replace function public.request_fx_trade_approval_v5(command jsonb)
returns public.approval_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.approval_requests;
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  actor_id uuid := (select auth.uid());
  client_id text := nullif(trim(command->>'client_command_id'), '');
  scope_amount numeric := public.fx_authoritative_scope_amount(command);
begin
  perform public.require_capability(org_id, 'approval.request', jsonb_strip_nulls(jsonb_build_object(
    'branch_id', nullif(command->>'branch_id', ''),
    'cashbox_id', nullif(command->>'cashbox_id', ''),
    'amount_base', scope_amount
  )));
  select a.* into result from public.approval_requests a
  where a.organization_id = org_id and a.requested_by = actor_id
    and a.action_type = 'fx_trade' and a.status in ('pending', 'approved')
    and a.payload_summary->>'client_command_id' = client_id
    and a.expires_at > now() and a.consumed_at is null
  order by case when a.status = 'approved' then 0 else 1 end, a.requested_at desc
  limit 1;
  if result.id is not null then return result; end if;
  command := command || jsonb_build_object(
    'resume_route', '/transactions/new/fx/' || replace(lower(command->>'side'), '_fx', '')
  );
  result := public.request_fx_trade_approval(command);
  update public.approval_requests
  set draft_payload = command, amount_base = scope_amount
  where id = result.id and organization_id = result.organization_id;
  return result;
end;
$$;

create or replace function public.decide_approval(target_id uuid, decision text, decision_reason_input text)
returns public.approval_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.approval_requests;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select a.* into request from public.approval_requests a where a.id = target_id for update;
  if request.id is null then raise exception 'APPROVAL_NOT_FOUND'; end if;
  perform public.require_capability(request.organization_id, 'approval.decide', jsonb_strip_nulls(jsonb_build_object(
    'branch_id', request.branch_id,
    'amount_base', request.amount_base
  )));
  if request.status <> 'pending' then raise exception 'APPROVAL_NOT_PENDING'; end if;
  if request.requested_by = (select auth.uid()) then raise exception 'APPROVAL_SELF_DECISION_DENIED'; end if;
  if now() >= request.expires_at then raise exception 'APPROVAL_EXPIRED'; end if;
  if decision not in ('approved', 'rejected') or length(trim(coalesce(decision_reason_input, ''))) < 2 then
    raise exception 'APPROVAL_DECISION_INVALID';
  end if;
  if decision = 'approved' then perform public.require_aal2(); end if;
  update public.approval_requests
  set status = decision, decided_by = (select auth.uid()), decided_at = now(),
      decision_reason = trim(decision_reason_input)
  where id = target_id
  returning * into request;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (request.organization_id, (select auth.uid()), 'approval_decided', jsonb_build_object(
    'approval_id', request.id, 'decision', decision, 'requester', request.requested_by,
    'execution_mode', case when request.action_type in ('fx_trade', 'hawala_payout')
      then 'requester_resume_required' else 'decision_only' end,
    'aal', (select auth.jwt())->>'aal'
  ));
  return request;
end;
$$;

create or replace function public.resume_approved_fx_trade(target_approval uuid)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval_row public.approval_requests;
  command jsonb;
begin
  select a.* into approval_row from public.approval_requests a
  where a.id = target_approval and a.requested_by = (select auth.uid())
  for update;
  if approval_row.id is null or approval_row.action_type <> 'fx_trade'
     or approval_row.status <> 'approved' or approval_row.expires_at <= now()
     or approval_row.consumed_at is not null then
    raise exception 'APPROVAL_INVALID: Approved, unexpired, unused FX approval required';
  end if;
  command := coalesce(approval_row.draft_payload, approval_row.payload_summary)
    || jsonb_build_object('approval_id', approval_row.id);
  return public.record_fx_trade_v5(command);
end;
$$;

create or replace function public.get_my_resumable_approval_draft(target_approval uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.is_platform_user_active() then raise exception 'PLATFORM_USER_SUSPENDED'; end if;
  select jsonb_build_object(
    'id', a.id,
    'action_type', a.action_type,
    'status', case when a.status = 'pending' and a.expires_at <= now() then 'expired' else a.status end,
    'reason', a.reason,
    'amount_base', a.amount_base,
    'currency_code', a.currency_code,
    'requested_at', a.requested_at,
    'expires_at', a.expires_at,
    'decided_at', a.decided_at,
    'decision_reason', a.decision_reason,
    'resume_route', coalesce(a.draft_payload->>'resume_route', a.payload_summary->>'resume_route'),
    'draft', coalesce(a.draft_payload, a.payload_summary),
    'consumed_at', a.consumed_at,
    'consumed_journal_entry_id', a.consumed_journal_entry_id
  ) into result
  from public.approval_requests a
  where a.id = target_approval and a.requested_by = (select auth.uid())
    and a.action_type in ('fx_trade', 'hawala_payout');
  if result is null then raise exception 'APPROVAL_NOT_FOUND'; end if;
  return result;
end;
$$;

revoke all on function public.enforce_authoritative_fx_rate() from public, anon, authenticated;
revoke all on function public.record_fx_trade_v5(jsonb) from public, anon;
revoke all on function public.request_fx_trade_approval_v5(jsonb) from public, anon;
revoke all on function public.resume_approved_fx_trade(uuid) from public, anon;
revoke all on function public.get_my_resumable_approval_draft(uuid) from public, anon;
revoke all on function public.decide_approval(uuid, text, text) from public, anon;
grant execute on function public.record_fx_trade_v5(jsonb) to authenticated;
grant execute on function public.request_fx_trade_approval_v5(jsonb) to authenticated;
grant execute on function public.resume_approved_fx_trade(uuid) to authenticated;
grant execute on function public.get_my_resumable_approval_draft(uuid) to authenticated;
grant execute on function public.decide_approval(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Shared non-FX rate resolution and exact transaction deep links
-- ---------------------------------------------------------------------------

create or replace function public.prepare_inline_rate(command jsonb, operation_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  publish_payload jsonb := command->'publish_rate';
  org_id uuid := nullif(command->>'organization_id', '')::uuid;
  branch_id_value uuid;
  source_currency_value text;
  target_currency_value text;
  buy_rate_value numeric;
  sell_rate_value numeric;
begin
  if publish_payload is null or jsonb_typeof(publish_payload) <> 'object' then
    return command;
  end if;
  branch_id_value := coalesce(
    nullif(publish_payload->>'branch_id', '')::uuid,
    nullif(command->>'branch_id', '')::uuid
  );
  source_currency_value := upper(trim(publish_payload->>'source_currency'));
  target_currency_value := upper(trim(publish_payload->>'target_currency'));
  buy_rate_value := nullif(publish_payload->>'buy_rate', '')::numeric;
  sell_rate_value := nullif(publish_payload->>'sell_rate', '')::numeric;
  if org_id is null or operation_kind not in (
    'money_operation', 'opening_balance', 'debt_create', 'debt_settle',
    'hawala_send', 'hawala_incoming', 'hawala_settle'
  ) then raise exception 'RATE_RESOLUTION_INVALID: Operation rate context is invalid'; end if;
  if source_currency_value is null or target_currency_value is null
     or source_currency_value = target_currency_value
     or buy_rate_value is null or buy_rate_value <= 0
     or sell_rate_value is null or sell_rate_value <= 0 then
    raise exception 'RATE_RESOLUTION_INVALID: Both positive shop rates are required';
  end if;
  perform public.set_exchange_rate(
    org_id, branch_id_value, source_currency_value, target_currency_value,
    buy_rate_value, sell_rate_value
  );
  return (command - 'publish_rate') || jsonb_build_object(
    'rate_published_atomically', true,
    'rate_resolution_kind', operation_kind
  );
end;
$$;

alter function public.record_operation(jsonb) rename to record_operation_v5_rate_impl;
revoke all on function public.record_operation_v5_rate_impl(jsonb) from public, anon, authenticated;
create function public.record_operation(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
begin
  command := public.prepare_inline_rate(command, 'money_operation');
  return public.record_operation_v5_rate_impl(command);
end;
$$;

alter function public.record_opening_balance(jsonb) rename to record_opening_balance_v5_rate_impl;
revoke all on function public.record_opening_balance_v5_rate_impl(jsonb) from public, anon, authenticated;
create function public.record_opening_balance(command jsonb)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
begin
  command := public.prepare_inline_rate(command, 'opening_balance');
  return public.record_opening_balance_v5_rate_impl(command);
end;
$$;

create or replace function public.get_transaction_rate_context(
  target_org uuid,
  target_branch uuid,
  source_currency text,
  target_currency text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  result jsonb;
  source_value text := upper(trim(source_currency));
  target_value text := upper(trim(target_currency));
  max_age_minutes_value integer := 1440;
  default_tolerance_bps numeric := 50;
begin
  perform public.require_capability(target_org, 'workspace.view', jsonb_strip_nulls(jsonb_build_object(
    'branch_id', target_branch
  )));
  select os.rate_max_age_minutes, os.rate_tolerance_bps
  into max_age_minutes_value, default_tolerance_bps
  from public.organization_settings os where os.organization_id = target_org;
  max_age_minutes_value := coalesce(max_age_minutes_value, 1440);
  default_tolerance_bps := coalesce(default_tolerance_bps, 50);

  if source_value = target_value then
    return jsonb_build_object(
      'from_currency', source_value, 'to_currency', target_value,
      'context_id', encode(extensions.digest(concat_ws('|', target_org::text,
        coalesce(target_branch::text, 'organization'), source_value, target_value, 'base'), 'sha256'), 'hex'),
      'buy_rate', 1, 'sell_rate', 1, 'spread_tolerance', 0,
      'tolerance_bps', default_tolerance_bps, 'effective_from', now(),
      'expires_at', now() + make_interval(mins => max_age_minutes_value),
      'age_seconds', 0, 'max_age_minutes', max_age_minutes_value,
      'branch_id', target_branch, 'source', 'base_currency', 'stale', false,
      'approval_required', false, 'missing', false
    );
  end if;

  select jsonb_build_object(
    'rate_id', r.id,
    'rate_group_id', r.rate_group_id,
    'context_id', encode(extensions.digest(concat_ws('|', target_org::text,
      coalesce(target_branch::text, 'organization'), source_value, target_value,
      r.id::text, r.buy_rate::text, r.sell_rate::text, r.effective_from::text), 'sha256'), 'hex'),
    'from_currency', source_value,
    'to_currency', target_value,
    'buy_rate', r.buy_rate,
    'sell_rate', r.sell_rate,
    'spread_tolerance', coalesce(r.spread_tolerance, 0),
    'tolerance_bps', default_tolerance_bps,
    'effective_from', r.effective_from,
    'expires_at', r.effective_from + make_interval(mins => max_age_minutes_value),
    'age_seconds', greatest(extract(epoch from now() - r.effective_from), 0),
    'max_age_minutes', max_age_minutes_value,
    'branch_id', r.branch_id,
    'source', case when r.branch_id is null then 'organization_rate' else 'branch_rate' end,
    'stale', r.effective_from < now() - make_interval(mins => max_age_minutes_value),
    'approval_required', r.effective_from < now() - make_interval(mins => max_age_minutes_value),
    'missing', false
  ) into result
  from public.rate_board_entries r
  where r.organization_id = target_org
    and r.from_currency = source_value
    and r.to_currency = target_value
    and r.active and r.effective_from <= now()
    and (r.branch_id is null or r.branch_id = target_branch)
  order by (r.branch_id is not null) desc, r.effective_from desc
  limit 1;
  return coalesce(result, jsonb_build_object(
    'from_currency', source_value, 'to_currency', target_value,
    'context_id', encode(extensions.digest(concat_ws('|', target_org::text,
      coalesce(target_branch::text, 'organization'), source_value, target_value, 'missing'), 'sha256'), 'hex'),
    'tolerance_bps', default_tolerance_bps, 'max_age_minutes', max_age_minutes_value,
    'branch_id', target_branch, 'source', 'missing', 'stale', true,
    'approval_required', true, 'missing', true
  ));
end;
$$;

create or replace function public.authoritative_base_amount(
  target_org uuid,
  target_branch uuid,
  currency_input text,
  amount_input numeric,
  allow_stale boolean default false
)
returns numeric
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  currency_value text := upper(trim(currency_input));
  base_currency_value text;
  rate_value numeric;
  effective_value timestamptz;
  max_age_minutes_value integer := 1440;
begin
  if target_org is null or currency_value is null or amount_input is null or amount_input < 0 then
    raise exception 'RATE_INPUT_INVALID: A valid organization, currency, and amount are required';
  end if;
  select upper(o.base_currency_code), coalesce(os.rate_max_age_minutes, 1440)
  into base_currency_value, max_age_minutes_value
  from public.organizations o
  left join public.organization_settings os on os.organization_id = o.id
  where o.id = target_org;
  if base_currency_value is null then raise exception 'RATE_BASE_UNAVAILABLE: Organization base currency is unavailable'; end if;
  if currency_value = base_currency_value then return round(amount_input, 12); end if;
  select (r.buy_rate + r.sell_rate) / 2, r.effective_from
  into rate_value, effective_value
  from public.rate_board_entries r
  where r.organization_id = target_org
    and r.from_currency = currency_value and r.to_currency = base_currency_value
    and r.active and r.effective_from <= now()
    and (r.branch_id is null or r.branch_id = target_branch)
  order by (r.branch_id is not null) desc, r.effective_from desc
  limit 1;
  if rate_value is null then raise exception 'RATE_MISSING: Resolve the shop rate in this task before posting'; end if;
  if not allow_stale and effective_value < now() - make_interval(mins => max_age_minutes_value) then
    raise exception 'RATE_STALE: Resolve the expired shop rate in this task before posting';
  end if;
  return round(amount_input * rate_value, 12);
end;
$$;

create or replace function public.get_transaction_detail(target_org uuid, target_entry uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  result jsonb;
  branch_id_value uuid;
  cashbox_id_value uuid;
begin
  select je.branch_id, case
    when fe.metadata->>'cashbox_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (fe.metadata->>'cashbox_id')::uuid else null end
  into branch_id_value, cashbox_id_value
  from public.journal_entries je
  join public.financial_events fe on fe.id = je.financial_event_id
  where je.id = target_entry and je.organization_id = target_org;
  if not found then return null; end if;
  perform public.require_capability(target_org, 'transactions.view', jsonb_strip_nulls(jsonb_build_object(
    'branch_id', branch_id_value, 'cashbox_id', cashbox_id_value
  )));
  select jsonb_build_object(
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
  ) into result
  from public.journal_entries je
  join public.financial_events fe on fe.id = je.financial_event_id
  left join public.cashboxes cb on cb.id = cashbox_id_value and cb.organization_id = target_org
  left join public.counterparties cp on cp.id = fe.counterparty_id and cp.organization_id = target_org
  left join public.profiles pr on pr.id = je.created_by
  where je.id = target_entry and je.organization_id = target_org;
  return result;
end;
$$;

revoke all on function public.prepare_inline_rate(jsonb, text) from public, anon, authenticated;
revoke all on function public.record_operation(jsonb) from public, anon;
revoke all on function public.record_opening_balance(jsonb) from public, anon;
revoke all on function public.get_transaction_rate_context(uuid, uuid, text, text) from public, anon;
revoke all on function public.authoritative_base_amount(uuid, uuid, text, numeric, boolean) from public, anon, authenticated;
revoke all on function public.get_transaction_detail(uuid, uuid) from public, anon;
grant execute on function public.record_operation(jsonb) to authenticated;
grant execute on function public.record_opening_balance(jsonb) to authenticated;
grant execute on function public.get_transaction_rate_context(uuid, uuid, text, text) to authenticated;
grant execute on function public.get_transaction_detail(uuid, uuid) to authenticated;
