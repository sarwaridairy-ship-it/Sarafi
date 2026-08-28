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

## Concurrency evidence

Apply migrations to an isolated staging project, provision two cashier identities and
known inventory, then run `npm run security:step16`. Retain
`test-results/step16/concurrency-report.json` with the release record. A failed
inventory, idempotency, journal-balance, duplicate-event, or negative-position check
is a release blocker. See [Step 16 evidence](../audits/step-16-concurrency.md).

## Financial incidents

- Auth outage: stop posting, preserve local drafts, verify session recovery, and reconcile every retry by command ID.
- Database outage: pause authoritative posting, preserve provider incident IDs, and validate ledger totals after recovery.
- Bad migration: stop promotion, capture migration and schema-advisor output, restore staging, then apply a reviewed forward migration.
- Suspected data leak: revoke sessions and devices, preserve audit evidence, scope affected organizations, and follow the security notification process.
- Duplicate posting: disable the affected command path, compare events, receipts, and journal entries by organization and command ID, then reverse only with an authorized RPC.
- Reconciliation discrepancy: stop risky posting, compare cashbox counts to immutable journal lines, record an approved variance, and never edit posted rows directly.

## Monitoring

Use [monitoring.md](monitoring.md) for error, financial-command, auth, Realtime, offline, storage, compliance, and backup signals. Never troubleshoot a suspected balance issue by editing ledger rows.
