-- A Cashier authorized to pay a Hawala must be able to capture and review the
-- private Tazkira evidence bound to that payout. Keep export/archive authority
-- out of the role; grant only the minimum metadata, upload, and protected-view
-- capabilities required by the camera-first payout workflow.

insert into public.role_capabilities (role_code, capability_code)
values
  ('cashier', 'documents.list'),
  ('cashier', 'documents.upload'),
  ('cashier', 'documents.view')
on conflict do nothing;
