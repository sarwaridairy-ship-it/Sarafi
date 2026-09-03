-- Respect each recipient's in-app choice when operational events create alerts.
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
      if recipient.user_id <> new.requested_by and not exists (
        select 1 from public.notification_preferences pref
        where pref.organization_id = new.organization_id
          and pref.user_id = recipient.user_id
          and pref.notification_type = notice_type
          and not pref.in_app
      ) then
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
      if not exists (
        select 1 from public.notification_preferences pref
        where pref.organization_id = new.organization_id
          and pref.user_id = recipient.user_id
          and pref.notification_type = notice_type
          and not pref.in_app
      ) then
        insert into public.notifications (organization_id, recipient_user_id, notification_type, subject_id, message)
        values (new.organization_id, recipient.user_id, notice_type, new.id::text, notice_message)
        on conflict do nothing;
      end if;
    end loop;
  elsif tg_table_name = 'cashbox_close_lines' and new.variance_amount <> 0 then
    notice_type := 'cashbox_variance';
    notice_message := 'A cashbox count has a difference that needs review.';
    for recipient in
      select m.user_id
      from public.organization_memberships m
      where m.organization_id = new.organization_id and m.active and m.role_code in ('owner', 'manager', 'accountant')
    loop
      if not exists (
        select 1 from public.notification_preferences pref
        where pref.organization_id = new.organization_id
          and pref.user_id = recipient.user_id
          and pref.notification_type = notice_type
          and not pref.in_app
      ) then
        insert into public.notifications (organization_id, recipient_user_id, notification_type, subject_id, message)
        values (new.organization_id, recipient.user_id, notice_type, new.id::text, notice_message)
        on conflict do nothing;
      end if;
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_role_notification() from public, anon, authenticated;
