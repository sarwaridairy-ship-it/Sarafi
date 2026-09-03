-- Web completion controls: remove false volatility declarations, expose safe
-- owner settings, and make operational notifications actionable.

alter function public.get_platform_admin_console() volatile;
alter function public.get_platform_organization_users(uuid) volatile;

create or replace function public.get_platform_admin_console()
returns jsonb
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare result jsonb;
begin
  perform public.require_platform_admin(false);
  select jsonb_build_object(
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'display_name', o.display_name, 'created_at', o.created_at,
        'member_count', (select count(*) from public.organization_memberships m where m.organization_id = o.id and m.active),
        'plan_code', p.code, 'subscription_status', s.status,
        'period_end', coalesce(s.current_period_end, s.trial_ends_at)
      ) order by o.created_at desc)
      from public.organizations o
      left join public.organization_subscriptions s on s.organization_id = o.id
      left join public.subscription_plans p on p.id = s.plan_id
    ), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order, p.id) from public.subscription_plans p), '[]'::jsonb),
    'providers', coalesce((select jsonb_agg(to_jsonb(pc) order by pc.code) from public.payment_provider_configs pc), '[]'::jsonb),
    'payment_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'organization_id', r.organization_id, 'organization_name', o.display_name,
        'plan_id', r.plan_id, 'plan_name', p.name_en, 'provider_code', r.provider_code,
        'amount_afn', r.amount_afn, 'payer_reference', r.payer_reference,
        'payer_note', r.payer_note, 'status', r.status, 'requested_at', r.requested_at
      ) order by r.requested_at desc)
      from public.subscription_payment_requests r
      join public.organizations o on o.id = r.organization_id
      join public.subscription_plans p on p.id = r.plan_id
      where r.status in ('submitted', 'under_review', 'awaiting_payment')
    ), '[]'::jsonb),
    'audit_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id, 'event_type', recent.event_type,
        'target_organization_id', recent.target_organization_id,
        'organization_name', recent.organization_name,
        'target_user_id', recent.target_user_id,
        'created_at', recent.created_at
      ) order by recent.created_at desc)
      from (
        select a.id, a.event_type, a.target_organization_id, o.display_name as organization_name,
          a.target_user_id, a.created_at
        from public.platform_audit_events a
        left join public.organizations o on o.id = a.target_organization_id
        order by a.created_at desc limit 100
      ) recent
    ), '[]'::jsonb),
    'counts', jsonb_build_object(
      'organizations', (select count(*) from public.organizations),
      'active_subscriptions', (select count(*) from public.organization_subscriptions where status in ('trial', 'active')),
      'pending_payments', (select count(*) from public.subscription_payment_requests where status in ('submitted', 'under_review')),
      'suspended_users', (select count(*) from public.platform_user_access where status = 'suspended')
    )
  ) into result;
  return result;
end;
$$;

create or replace function public.update_organization_settings(
  target_org uuid,
  language_input text,
  timezone_input text,
  receipt_prefix_input text,
  negative_cash_input boolean
)
returns public.organization_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.organization_settings;
  previous_negative_cash boolean;
begin
  if not public.has_org_permission(target_org, 'organization:manage') then
    raise exception 'Organization management permission required';
  end if;
  if language_input not in ('en', 'fa-AF', 'ps-AF') then
    raise exception 'Unsupported language';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = timezone_input) then
    raise exception 'Unsupported timezone';
  end if;
  if trim(coalesce(receipt_prefix_input, '')) !~ '^[A-Za-z0-9-]{2,10}$' then
    raise exception 'Receipt prefix must contain 2 to 10 letters, numbers, or hyphens';
  end if;

  select negative_cash_allowed into previous_negative_cash
  from public.organization_settings
  where organization_id = target_org
  for update;
  if previous_negative_cash is null then raise exception 'Organization settings not found'; end if;
  if negative_cash_input is distinct from previous_negative_cash then
    perform public.require_aal2();
  end if;

  update public.organization_settings
  set default_language = language_input,
      timezone = timezone_input,
      receipt_prefix = upper(trim(receipt_prefix_input)),
      negative_cash_allowed = negative_cash_input,
      updated_at = now()
  where organization_id = target_org
  returning * into result;

  update public.organizations set timezone = timezone_input where id = target_org;
  insert into public.security_audit_events (organization_id, actor_user_id, event_type, metadata)
  values (
    target_org,
    (select auth.uid()),
    'organization_settings_updated',
    jsonb_build_object(
      'default_language', language_input,
      'timezone', timezone_input,
      'receipt_prefix', upper(trim(receipt_prefix_input)),
      'negative_cash_changed', negative_cash_input is distinct from previous_negative_cash
    )
  );
  return result;
end;
$$;

create or replace function public.mark_notification_state(
  target_notification uuid,
  state_input text
)
returns public.notifications
language plpgsql
security definer
set search_path = ''
as $$
declare result public.notifications;
begin
  if state_input not in ('read', 'dismissed') then raise exception 'Invalid notification state'; end if;
  update public.notifications
  set status = state_input
  where id = target_notification and recipient_user_id = (select auth.uid())
  returning * into result;
  if result.id is null then raise exception 'Notification not found'; end if;
  return result;
end;
$$;

create or replace function public.set_notification_preference(
  target_org uuid,
  notification_type_input text,
  in_app_input boolean,
  threshold_base_input numeric default null
)
returns public.notification_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare result public.notification_preferences;
begin
  if not public.is_org_member(target_org) then raise exception 'Organization membership required'; end if;
  if trim(coalesce(notification_type_input, '')) = '' then raise exception 'Notification type is required'; end if;
  insert into public.notification_preferences (
    organization_id, user_id, notification_type, in_app, push, threshold_base
  ) values (
    target_org, (select auth.uid()), trim(notification_type_input), in_app_input, false, threshold_base_input
  )
  on conflict (organization_id, user_id, notification_type)
  do update set in_app = excluded.in_app, threshold_base = excluded.threshold_base
  returning * into result;
  return result;
end;
$$;

create or replace function public.enqueue_role_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient record;
  notice_type text;
  notice_message text;
begin
  if tg_table_name = 'approval_requests' then
    notice_type := 'approval_required';
    notice_message := 'A team action is waiting for review.';
    for recipient in
      select user_id from public.organization_memberships
      where organization_id = new.organization_id and active and role_code in ('owner', 'manager')
    loop
      if recipient.user_id <> new.requested_by then
        insert into public.notifications (organization_id, recipient_user_id, notification_type, subject_id, message)
        values (new.organization_id, recipient.user_id, notice_type, new.id::text, notice_message)
        on conflict do nothing;
      end if;
    end loop;
  elsif tg_table_name = 'compliance_alerts' then
    notice_type := 'compliance_alert';
    notice_message := 'A compliance alert needs review.';
    for recipient in
      select user_id from public.organization_memberships
      where organization_id = new.organization_id and active and role_code in ('owner', 'compliance_officer')
    loop
      insert into public.notifications (organization_id, recipient_user_id, notification_type, subject_id, message)
      values (new.organization_id, recipient.user_id, notice_type, new.id::text, notice_message)
      on conflict do nothing;
    end loop;
  elsif tg_table_name = 'cashbox_close_lines' and new.variance_amount <> 0 then
    notice_type := 'cashbox_variance';
    notice_message := 'A cashbox count has a difference that needs review.';
    for recipient in
      select m.user_id
      from public.organization_memberships m
      where m.organization_id = new.organization_id and m.active and m.role_code in ('owner', 'manager', 'accountant')
    loop
      insert into public.notifications (organization_id, recipient_user_id, notification_type, subject_id, message)
      values (new.organization_id, recipient.user_id, notice_type, new.id::text, notice_message)
      on conflict do nothing;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists approval_request_notification on public.approval_requests;
create trigger approval_request_notification
  after insert on public.approval_requests
  for each row execute function public.enqueue_role_notification();

drop trigger if exists compliance_alert_notification on public.compliance_alerts;
create trigger compliance_alert_notification
  after insert on public.compliance_alerts
  for each row execute function public.enqueue_role_notification();

drop trigger if exists cashbox_variance_notification on public.cashbox_close_lines;
create trigger cashbox_variance_notification
  after insert on public.cashbox_close_lines
  for each row execute function public.enqueue_role_notification();

revoke all on function public.update_organization_settings(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.mark_notification_state(uuid, text) from public, anon;
revoke all on function public.set_notification_preference(uuid, text, boolean, numeric) from public, anon;
revoke all on function public.enqueue_role_notification() from public, anon, authenticated;
grant execute on function public.update_organization_settings(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.mark_notification_state(uuid, text) to authenticated;
grant execute on function public.set_notification_preference(uuid, text, boolean, numeric) to authenticated;
