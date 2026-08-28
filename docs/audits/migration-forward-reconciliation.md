# Migration Forward Reconciliation

## Historical versus current reproduction

The linked Supabase history contains `202608270013`, `202608270014`,
`202608270015`, and `202608270016`, but the current repository contains no exact SQL
files for those versions. Git history and retained artifacts were inspected on
2026-08-28; the original contents could not be recovered. No replacement SQL was
invented and no migration-history repair command was run.

The authoritative migration list currently reports:

- Remote and local matched through `202608270012`.
- Remote-only: `202608270013` through `202608270016`.
- Local-only and frozen: `202608270017_step16_concurrency_hardening.sql`,
  `202608270018_operation_location_semantics.sql`, and
  `202608270019_authoritative_import_commit.sql`.

The linked schema lint is clean, but lint does not prove historical reproducibility.
`supabase db pull --linked` and `supabase db push --linked` are blocked by the missing
history. A current schema snapshot cannot be relabeled as the original migrations.

## Forward strategy

The safe strategy is to obtain the exact four files from the repository owner, CI
artifacts, or Supabase migration source, review their effects against the current
schema, and restore them with their original version numbers. Until then, keep new
financial migrations frozen and use a separately reviewed baseline/forward migration
against an isolated current-schema target. Never reset production, squash history, or
mark versions applied/reverted merely to make the CLI list equal.

Migration `018` changes money-location accounting and must be tested on that isolated
target before any remote application. Migration `019` adds atomic import batches and
delegates financial rows to existing authoritative RPCs; it is also frozen pending the
same reconciliation.