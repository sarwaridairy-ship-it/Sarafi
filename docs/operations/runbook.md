# SARAFI Operations Runbook

## Deploy

1. Keep staging and production Supabase projects separate.
2. Apply migrations in filename order with the Supabase CLI.
3. Set only public URL and anon key in the client environment.
4. Run tests, lint, build, and RLS integration checks before release.

## Incident response

Revoke affected sessions/devices, preserve audit records, stop posting if balances cannot be trusted, and reconcile from immutable journal lines. Never repair a posted event with a direct update or delete.

## Recovery

Restore a staging backup first, validate migration compatibility and ledger totals, then use the documented production restore procedure. Record the incident and recovery verification.

## Monitoring

Use [monitoring.md](monitoring.md) for error, financial-command, auth, Realtime, offline, storage, compliance, and backup signals. Never troubleshoot a suspected balance issue by editing ledger rows.
