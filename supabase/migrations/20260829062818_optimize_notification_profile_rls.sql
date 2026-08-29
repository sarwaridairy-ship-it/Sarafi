drop policy if exists notification_preferences_self_read on public.notification_preferences;
create policy notification_preferences_self_read
on public.notification_preferences
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists notifications_recipient_read on public.notifications;
create policy notifications_recipient_read
on public.notifications
for select
to authenticated
using (recipient_user_id = (select auth.uid()));

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));
