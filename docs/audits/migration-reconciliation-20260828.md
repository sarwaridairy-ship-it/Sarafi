# Migration Reconciliation: 2026-08-28

This report freezes remote database changes until the migration history is repaired.
No migration-history repair command was run and no production data or schema was reset.

| Version | Local file | Remote history | SQL content recovered | Schema effect verified | Status |
|---|---|---|---|---|---|
| 202608270009 | `202608270009_aal2_and_offline_authority.sql` | present | yes, from Git | linked lint passed | matched |
| 202608270010 | `202608270010_authoritative_fx_approvals.sql` | present | yes, from Git | linked lint passed | matched |
| 202608270011 | `202608270011_approval_posting_device_context.sql` | present | yes, from Git | linked lint passed | matched |
| 202608270012 | `202608270012_retire_offline_financial_sync.sql` | present | yes, from Git | linked lint passed | matched |
| 202608270013 | missing | present | no exact local/Git artifact found | not independently verified | unresolved |
| 202608270014 | missing | present | no exact local/Git artifact found | not independently verified | unresolved |
| 202608270015 | missing | present | no exact local/Git artifact found | not independently verified | unresolved |
| 202608270016 | missing | present | no exact local/Git artifact found | not independently verified | unresolved |
| 202608270017 | `202608270017_step16_concurrency_hardening.sql` | absent | yes, new local SQL | linked lint passed; not applied | pending, frozen |
| 202608270018 | `202608270018_operation_location_semantics.sql` | absent | yes, new local SQL | linked lint passed; not applied | pending, frozen |

All local versions before `202608270009` and through `202608270012` are present and match
remote history. The remote project also contains `202608270013` through `202608270016`
without local files. They were not fabricated because their exact SQL and effects are not
recoverable from the current Git history or retained artifacts.

## Reproducibility decision

`supabase db push --linked` and `supabase db pull --linked` are blocked by the remote
history gap. Do not mark the missing versions reverted or mark `017`/`018` applied.
The next safe action is to recover the exact four migration files from the repository,
CI artifact, or Supabase migration source, then compare their DDL/functions/policies
against the live schema before applying any pending migration.

## Current remote checks

- `npx supabase db lint --linked`: no schema errors.
- `npx supabase migration list --linked`: remote `013`-`016` have no local counterpart;
  local `017` and `018` are not remote.
- `202608270018_operation_location_semantics.sql` is intentionally not applied.
