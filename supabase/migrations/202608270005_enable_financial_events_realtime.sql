-- Publish tenant-scoped financial activity to the production Realtime channel.
alter publication supabase_realtime add table public.financial_events;
