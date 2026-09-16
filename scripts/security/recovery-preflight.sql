-- Read-only SARAFI source inventory. Execute on the intended source project.
-- Retain that project's reference separately with this result.
-- Missing relations/permissions must fail; never replace missing evidence with zero.
-- No job commands, URLs, credentials, object paths, or customer records are returned.
begin read only;
set local statement_timeout = '15s';
select jsonb_build_object(
  'captured_at', now(),
  'active_cron_jobs', (select count(*) from cron.job where active),
  'queued_http_requests', (select count(*) from net.http_request_queue),
  'foreign_servers', (select count(*) from pg_foreign_server),
  'outbound_extensions', (select coalesce(jsonb_agg(extname order by extname), '[]'::jsonb)
    from pg_extension where extname in ('pg_net', 'http', 'wrappers', 'postgres_fdw', 'dblink')),
  'vault_secrets', (select count(*) from vault.secrets),
  'storage_objects', (select count(*) from storage.objects)
) as recovery_preflight;
commit;
