# SARAFI v7 migration reconciliation

Date: 2026-09-12 (Asia/Kabul)

Branch: `codex/whole-project-v7`

Working base: `eceb0ea50f8a3506a1b28836e5b819a80eaa2ad1`, which descends from the required v5 candidate `1e50c13fc72a632447e279d8f9071d318e4d00c8` and includes the reviewed v6 forward work.

## New forward migration

`supabase/migrations/20260911195348_whole_project_v7_authority.sql`

The migration is additive or uses forward replacement of server functions. It does not delete journals, receipts, audit events, approvals, attachments, rate evidence, or historical Hawala rows.

## Reconciliation behavior

- Transaction-only manual rates remain inside immutable transaction metadata and do not publish to the shop rate board.
- Money valuation snapshots are content-addressed, server-calculated records. Missing rates are marked missing and excluded, never converted to zero.
- Existing Hawala transfers receive deterministic sender fields where the stored evidence supports it.
- Legacy Hawala rows without a verified exact destination are marked `review_required`; the migration does not guess a recipient.
- Exact-recipient columns, branch indexes, endpoint metadata, and status-event branch evidence are added without rewriting financial postings.
- Both Tazkira sides are required before the payout trigger allows `paid`.
- App-lock credentials and unlock-grant hashes are server-only tables with browser grants revoked.

## Verification state

- Linked project: `vbvwuqzqtcorassvotke`.
- The first production push was rejected transactionally because an existing helper parameter name must be preserved; no partial migration was recorded.
- The helper signature was corrected in commit `7153e5e9040654778497947fb8a7aee716f6206d` and the production push then completed successfully.
- `supabase db push --linked --dry-run --include-all` after deployment: successful and reports the remote database is up to date.
- The `app-lock` Edge Function version 1 is ACTIVE with JWT verification enabled.
- A fresh linked `supabase db lint` could not authenticate because this workstation has no `SUPABASE_DB_PASSWORD`. No database-lint result is claimed.
- A zero-to-latest isolated reset, authenticated RLS suite, and provider backup/PITR restore drill remain release gates.

## Roll-forward and rollback

Before migration, capture a provider backup/PITR point and reconcile organization, event, journal, line, receipt, attachment, Hawala, and rate counts plus base debit/credit totals. If the UI fails, restore the previous immutable Vercel artifact and retain the additive schema. If a v7 function fails, ship a forward corrective migration. Never use a destructive down migration to remove financial evidence. A database restore is reserved for catastrophic failure and must reconcile every transaction accepted after the restore point.
