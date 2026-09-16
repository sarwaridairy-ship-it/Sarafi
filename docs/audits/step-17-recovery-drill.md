# Step 17: Recovery Drill and Reconciliation

The repository now has an executable post-restore reconciliation check. It does not
perform the provider restore itself because Supabase backup/PITR restore is controlled
by the project owner and requires a separate target project.

The checker requires Node.js 24 and a quiescent target: stop test/business writes
for the before/after snapshots. It pages through the complete tables, requests
database numerics as decimal strings, and verifies each posted journal separately.
It fails on truncated/changing page counts. This is not an atomic database snapshot
and does not itself perform or certify a restore. Create a fresh `decimal_strings_v2`
baseline; older number-encoded reports cannot establish exact decimal equality.

## Required provider action

### Mandatory external-action safety screen

Before using **Restore to a new project**, run
`scripts/security/recovery-preflight.sql` read-only on the intended source.
Save only the returned `recovery_preflight` JSON object in a private evidence file,
and retain the actual source project reference from the connection/tool record.
Within 15 minutes run:

```powershell
node scripts/security/check-recovery-preflight.mjs <private-evidence.json> <source-project-ref>
```

Exit 2 means cloning is blocked; exit 1 means the evidence is invalid or incomplete.
Exit 0 only passes this limited hazard screen, not target/cost approval, recovery
verification, or launch readiness. Re-run immediately before any approved restore.
No source writes, credential reads, or restore calls are made by this checker.

Supabase physical clones copy Vault's encryption root key and can immediately
restart cron, HTTP and external-extension activity. Disabling jobs **after** the
clone starts is too late. See the provider's
[restore limitations](https://supabase.com/docs/guides/platform/clone-project).

For SARAFI, the 16 September 2026 read-only inventory found one active cleanup
job (every five minutes), `pg_net`, two Vault secrets and 24 Storage objects.
The cleanup job uses the saved source URL and service credential. A physical
clone could therefore call the **production** cleanup endpoint. Do not use
one-click physical cloning for this source in its current state.

Instead prepare an approved private, isolated target and a reviewed logical
restore that excludes scheduled jobs, outbound queues, webhook/foreign-server
connections and live credentials before services start. Logical restore does
not automatically preserve Vault decryption; record that limitation. Never
disable production cleanup or change its credentials just to make a drill pass.
Do not reuse Sahibash's live project as a restore target. Additional project
cost and retention/deletion decisions need an explicit bounded approval.

Database backups do not include Storage file contents. Back up and verify the
private objects separately, preserving access controls, counts and checksums.
Do not copy private production data into local/shared test environments.

Record the linked project plan, backup retention, PITR availability, restore timestamp,
RPO, RTO, operator, and isolated target project. Restore a production-like backup into
that target. Never restore production data into local development or a shared test
project.

## Validate the restored target

Create an env file containing the target URL, anon key, server-only observer key,
cashier test credentials, and restored organization ID. Run the source snapshot
at the selected backup's consistency boundary and retain its JSON output as the
expected baseline. A snapshot of today's changing production data cannot serve
as the expected result for yesterday's backup. The existing checker is scoped
to one organization; run it for each included organization and separately
inventory global/auth records and Storage contents. After restore, run:

```powershell
$env:SARAFI_STEP17_ENV = ".env.step17-restore.local"
$env:SARAFI_STEP17_EXPECTED = "test-results/step17/before-restore.json"
npm run security:step17
```

The check compares organizations, memberships, branches, cashboxes, financial events,
journal entries and lines, debts, settlements, inventory positions, audit events,
posted-entry count, journal debit/credit totals, debt totals, settlement totals, and
inventory carrying values. It exits non-zero for an unbalanced journal or any mismatch.

## Completion evidence

Retain the provider restore record, migration list, schema lint output, the pre-restore
snapshot, the post-restore reconciliation report at
`test-results/step17/reconciliation-report.json`, and the RPO/RTO result. A source file,
empty dump, or screenshot is not a restore proof.
