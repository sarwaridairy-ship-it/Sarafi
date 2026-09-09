-- Keep the explicit Business Administrator delegation aligned across the V6
-- route contract, RPC entry points, and the final financial-event trigger.
-- These are operational permissions only; owner-only billing, ownership,
-- platform administration, deletion, and capital permissions remain excluded.
insert into public.role_capabilities (role_code, capability_code)
values
  ('business_admin', 'financial.post.fx'),
  ('business_admin', 'financial.post.money'),
  ('business_admin', 'financial.post.opening')
on conflict (role_code, capability_code) do nothing;
