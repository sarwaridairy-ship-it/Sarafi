-- Launch policy: disconnected clients may retain drafts, but never submit financial commands.
drop function if exists public.sync_offline_fx_command(jsonb);
drop function if exists public.accept_offline_command(uuid, text, uuid, text);
