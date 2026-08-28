# Step 17: Recovery Drill and Reconciliation

The repository now has an executable post-restore reconciliation check. It does not
perform the provider restore itself because Supabase backup/PITR restore is controlled
by the project owner and requires a separate target project.

## Required provider action

Record the linked project plan, backup retention, PITR availability, restore timestamp,
RPO, RTO, operator, and isolated target project. Restore a production-like backup into
that target. Never restore production data into local development or a shared test
project.

## Validate the restored target

Create an env file containing the target URL, anon key, cashier test credentials, and
restored organization ID. Run the snapshot before restore and retain its JSON output as
the expected baseline. After restore, run:

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