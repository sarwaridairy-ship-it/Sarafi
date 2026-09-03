-- Final web completion: close the reconciliation approval separation-of-duties
-- gap and make every named finance report return an intentional read model.

create or replace function public.approve_cashbox_close(target_id uuid)
returns public.cashbox_closes
language plpgsql
security definer
set search_path = ''
as $$
declare
  close_row public.cashbox_closes;
  actor_id uuid := (select auth.uid());
  role_value text;
  variance_row record;
  event_id uuid;
  entry_id uuid;
  cash_account uuid;
  variance_account uuid;
  client_id text := 'variance:' || target_id::text;
begin
  perform public.require_aal2();
  select * into close_row from public.cashbox_closes where id = target_id for update;
  if close_row.id is null then raise exception 'Cashbox close not found'; end if;
  select role_code into role_value from public.organization_memberships
    where organization_id = close_row.organization_id and user_id = actor_id and active = true;
  if role_value not in ('owner', 'manager') then raise exception 'Only an owner or manager can approve variance'; end if;
  if close_row.closed_by = actor_id then raise exception 'You cannot approve your own cashbox close'; end if;
  if close_row.status <> 'submitted' then raise exception 'Cashbox close is not awaiting approval'; end if;

  for variance_row in select * from public.cashbox_close_lines where close_id = target_id and variance_amount <> 0 loop
    insert into public.financial_events (organization_id, branch_id, event_type, immutable_reference, occurred_at, created_by, client_command_id, metadata)
    values (close_row.organization_id, close_row.branch_id, 'cash_variance_adjustment', 'variance-' || target_id || '-' || variance_row.currency_code,
      now(), actor_id, client_id || ':' || variance_row.currency_code,
      jsonb_build_object('close_id', target_id, 'currency', variance_row.currency_code, 'variance', variance_row.variance_amount))
    returning id into event_id;
    insert into public.journal_entries (organization_id, branch_id, financial_event_id, status, occurred_at, posted_at, created_by, posted_by, memo)
    values (close_row.organization_id, close_row.branch_id, event_id, 'posted', now(), now(), actor_id, actor_id, close_row.variance_reason)
    returning id into entry_id;
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code, cashbox_id)
    values (close_row.organization_id, 'cashbox:' || close_row.cashbox_id || ':' || variance_row.currency_code,
      'Cashbox ' || variance_row.currency_code, 'asset', variance_row.currency_code, close_row.cashbox_id)
    on conflict (organization_id, code) do update set active = true returning id into cash_account;
    insert into public.ledger_accounts (organization_id, code, name, category, currency_code)
    values (close_row.organization_id,
      case when variance_row.variance_amount < 0 then 'expense:cash-shortage:' else 'income:cash-overage:' end || variance_row.currency_code,
      case when variance_row.variance_amount < 0 then 'Cash shortage ' else 'Cash overage ' end || variance_row.currency_code,
      case when variance_row.variance_amount < 0 then 'expense' else 'income' end, variance_row.currency_code)
    on conflict (organization_id, code) do update set active = true returning id into variance_account;
    if variance_row.variance_amount < 0 then
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit)
      values (close_row.organization_id, entry_id, variance_account, variance_row.currency_code, abs(variance_row.variance_amount), abs(variance_row.variance_amount));
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit)
      values (close_row.organization_id, entry_id, cash_account, variance_row.currency_code, abs(variance_row.variance_amount), abs(variance_row.variance_amount));
    else
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_debit, base_debit)
      values (close_row.organization_id, entry_id, cash_account, variance_row.currency_code, variance_row.variance_amount, variance_row.variance_amount);
      insert into public.journal_lines (organization_id, journal_entry_id, account_id, currency_code, native_credit, base_credit)
      values (close_row.organization_id, entry_id, variance_account, variance_row.currency_code, variance_row.variance_amount, variance_row.variance_amount);
    end if;
  end loop;

  update public.cashbox_closes set status = 'approved', approved_by = actor_id, approved_at = now()
  where id = target_id returning * into close_row;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (close_row.organization_id, actor_id, 'cashbox_close_approved', jsonb_build_object('close_id', target_id));
  return close_row;
end;
$$;

create or replace function public.get_named_financial_report(target_org uuid, report_code text, from_date date default null, to_date date default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  result jsonb;
  start_at timestamptz := coalesce(from_date::timestamptz, '-infinity'::timestamptz);
  end_at timestamptz := coalesce((to_date + 1)::timestamptz, 'infinity'::timestamptz);
begin
  if not public.has_org_permission(target_org, 'financial:report') then raise exception 'Report permission required'; end if;

  if report_code in ('trial_balance', 'balance_sheet', 'profit_loss') then
    select coalesce(jsonb_agg(row_data order by row_data->>'label'), '[]'::jsonb) into result
    from (
      select jsonb_build_object(
        'reference', la.code, 'date', to_char(coalesce(to_date, current_date), 'YYYY-MM-DD'),
        'label', la.name, 'detail', la.category,
        'amount', case when report_code = 'profit_loss' then sum(jl.base_credit - jl.base_debit)
          when la.category in ('asset', 'expense') then sum(jl.base_debit - jl.base_credit)
          else sum(jl.base_credit - jl.base_debit) end,
        'currency', coalesce(max(o.base_currency_code), 'AFN'), 'status', 'posted'
      ) row_data
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.journal_entry_id and je.status = 'posted'
      join public.ledger_accounts la on la.id = jl.account_id
      join public.organizations o on o.id = jl.organization_id
      where jl.organization_id = target_org and je.occurred_at >= start_at and je.occurred_at < end_at
        and (report_code <> 'profit_loss' or la.category in ('income', 'expense'))
        and (report_code <> 'balance_sheet' or la.category in ('asset', 'liability', 'equity'))
      group by la.code, la.name, la.category
    ) rows;
  elsif report_code = 'branch_balance' then
    select coalesce(jsonb_agg(row_data order by row_data->>'label', row_data->>'currency'), '[]'::jsonb) into result
    from (
      select jsonb_build_object(
        'reference', b.id, 'date', to_char(coalesce(to_date, current_date), 'YYYY-MM-DD'),
        'label', b.name, 'detail', 'branch_balance',
        'amount', sum(jl.native_debit - jl.native_credit), 'currency', jl.currency_code, 'status', 'posted'
      ) row_data
      from public.journal_entries je
      join public.branches b on b.id = je.branch_id
      join public.journal_lines jl on jl.journal_entry_id = je.id
      join public.ledger_accounts la on la.id = jl.account_id and la.category = 'asset'
      where je.organization_id = target_org and je.status = 'posted' and je.occurred_at < end_at
      group by b.id, b.name, jl.currency_code
    ) rows;
  elsif report_code = 'currency_position' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', s.currency_code, 'date', to_char(coalesce(to_date, current_date), 'YYYY-MM-DD'),
      'label', s.currency_code, 'detail', 'carrying_value', 'amount', s.quantity,
      'secondary_amount', s.carrying_base_value, 'currency', s.currency_code, 'status', 'posted'
    ) order by s.currency_code), '[]'::jsonb) into result
    from public.fx_inventory_cost_state s where s.organization_id = target_org;
  elsif report_code in ('receivables', 'payables', 'aging', 'counterparty_statement') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', d.id, 'date', to_char(d.created_at, 'YYYY-MM-DD'), 'label', cp.display_name,
      'detail', case when d.due_at is null then d.direction when d.due_at < now() then 'overdue' else d.direction end,
      'amount', d.outstanding_amount, 'secondary_amount', d.original_amount,
      'currency', d.currency_code, 'status', case when d.outstanding_amount = 0 then 'settled' else 'open' end
    ) order by cp.display_name, d.created_at desc), '[]'::jsonb) into result
    from public.debts d join public.counterparties cp on cp.id = d.counterparty_id
    where d.organization_id = target_org
      and (report_code in ('aging', 'counterparty_statement') or d.direction = case when report_code = 'receivables' then 'receivable' else 'payable' end)
      and (report_code <> 'aging' or (d.outstanding_amount > 0 and d.due_at < now()));
  elsif report_code in ('fx_profit', 'commission', 'expenses') then
    select coalesce(jsonb_agg(row_data order by row_data->>'label'), '[]'::jsonb) into result
    from (
      select jsonb_build_object(
        'reference', la.code, 'date', to_char(coalesce(to_date, current_date), 'YYYY-MM-DD'),
        'label', la.name, 'detail', la.category,
        'amount', case when la.category = 'expense' then sum(jl.base_debit - jl.base_credit) else sum(jl.base_credit - jl.base_debit) end,
        'currency', coalesce(max(o.base_currency_code), 'AFN'), 'status', 'posted'
      ) row_data
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.journal_entry_id and je.status = 'posted'
      join public.ledger_accounts la on la.id = jl.account_id
      join public.organizations o on o.id = jl.organization_id
      where jl.organization_id = target_org and je.occurred_at >= start_at and je.occurred_at < end_at
        and ((report_code = 'fx_profit' and la.code in ('income:realized-fx-gain', 'expense:realized-fx-loss'))
          or (report_code = 'commission' and la.code like 'income:commission:%')
          or (report_code = 'expenses' and la.category = 'expense'))
      group by la.code, la.name, la.category
    ) rows;
  elsif report_code = 'reconciliation' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', c.id, 'date', c.business_date, 'label', cb.name, 'detail', coalesce(c.variance_reason, ''),
      'amount', coalesce((select sum(abs(l.variance_amount)) from public.cashbox_close_lines l where l.close_id = c.id), 0),
      'currency', 'MIXED', 'status', c.status
    ) order by c.business_date desc), '[]'::jsonb) into result
    from public.cashbox_closes c join public.cashboxes cb on cb.id = c.cashbox_id
    where c.organization_id = target_org and c.submitted_at >= start_at and c.submitted_at < end_at;
  elsif report_code = 'rate_history' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', r.id, 'date', r.effective_from, 'label', concat(r.from_currency, ' / ', r.to_currency),
      'detail', rg.name, 'amount', r.buy_rate, 'secondary_amount', r.sell_rate,
      'currency', r.to_currency, 'status', case when r.active then 'active' else 'historical' end
    ) order by r.effective_from desc), '[]'::jsonb) into result
    from public.rate_board_entries r join public.rate_groups rg on rg.id = r.rate_group_id
    where r.organization_id = target_org and r.effective_from >= start_at and r.effective_from < end_at;
  elsif report_code = 'employee_activity' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', p.id, 'date', to_char(max(fe.occurred_at), 'YYYY-MM-DD'), 'label', coalesce(p.display_name, p.id::text),
      'detail', 'financial_actions', 'amount', count(fe.id), 'currency', 'COUNT', 'status', 'recorded'
    ) order by count(fe.id) desc), '[]'::jsonb) into result
    from public.financial_events fe left join public.profiles p on p.id = fe.created_by
    where fe.organization_id = target_org and fe.occurred_at >= start_at and fe.occurred_at < end_at
    group by p.id, p.display_name;
  elsif report_code = 'security_activity' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', s.id, 'date', s.created_at, 'label', s.event_type,
      'detail', coalesce(s.target_user_id::text, s.target_device_id::text, ''),
      'amount', 0, 'currency', '', 'status', 'recorded'
    ) order by s.created_at desc), '[]'::jsonb) into result
    from public.security_audit_events s
    where s.organization_id = target_org and s.created_at >= start_at and s.created_at < end_at;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', fe.immutable_reference, 'date', fe.occurred_at, 'label', fe.event_type,
      'detail', coalesce(je.memo, ''),
      'amount', coalesce(fe.metadata->>'amount', fe.metadata->>'bought_amount', fe.metadata->>'sold_amount', '0'),
      'currency', coalesce(fe.metadata->>'currency', fe.metadata->>'bought_currency', fe.metadata->>'sold_currency', ''),
      'status', je.status
    ) order by fe.occurred_at desc), '[]'::jsonb) into result
    from public.financial_events fe join public.journal_entries je on je.financial_event_id = fe.id
    where fe.organization_id = target_org and fe.occurred_at >= start_at and fe.occurred_at < end_at
      and (report_code in ('daily_transactions', 'transaction_journal')
        or (report_code = 'owner_capital' and fe.event_type in ('owner_investment', 'owner_withdrawal', 'opening_balance'))
        or (report_code = 'reversals' and (je.status = 'reversed' or je.reversal_of is not null))
        or (report_code = 'cash_movement' and fe.event_type in ('transfer_cash', 'bank_deposit', 'bank_withdrawal', 'receive_money', 'pay_money'))
        or (report_code = 'hawala' and fe.event_type = 'hawala_send'));
  end if;
  return coalesce(result, '[]'::jsonb);
end;
$$;

revoke all on function public.approve_cashbox_close(uuid) from public, anon;
grant execute on function public.approve_cashbox_close(uuid) to authenticated;
revoke all on function public.get_named_financial_report(uuid, text, date, date) from public, anon;
grant execute on function public.get_named_financial_report(uuid, text, date, date) to authenticated;

create or replace function public.get_public_platform_status()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'web_version', (
      select jsonb_build_object(
        'minimum_version', v.minimum_version,
        'recommended_version', v.recommended_version,
        'force_update', v.force_update,
        'release_notes_en', v.release_notes_en,
        'release_notes_dari', v.release_notes_dari,
        'release_notes_pashto', v.release_notes_pashto,
        'updated_at', v.updated_at
      )
      from public.platform_app_versions v
      where v.platform = 'web' and v.active
      limit 1
    ),
    'announcements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'type', a.announcement_type,
        'message_en', a.message_en,
        'message_dari', a.message_dari,
        'message_pashto', a.message_pashto
      ) order by a.updated_at desc)
      from public.platform_announcements a
      where a.active
        and (a.starts_at is null or a.starts_at <= now())
        and (a.ends_at is null or a.ends_at > now())
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_public_platform_status() from public;
grant execute on function public.get_public_platform_status() to anon, authenticated;
