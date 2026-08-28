# Step 17 Backup Attempt

**Date:** 2026-08-28
**Project:** `vbvwuqzqtcorassvotke`
**Result:** BLOCKED, no backup artifact produced

The repository attempted the real linked backup command:

```powershell
npx supabase db dump --linked --data-only --file test-results/step17/linked-data-backup.sql
```

Supabase CLI returned `LegacyDockerRunError`: Docker Desktop is a prerequisite for
this backup path. The host also has no `docker` or `pg_dump` executable available.
This is an environment limitation, not restore evidence.

The live financial baseline and reconciliation checker are available in
[step-17-live-snapshot-20260828.json](step-17-live-snapshot-20260828.json) and
[step-17-recovery-drill.md](step-17-recovery-drill.md). A project owner must still
perform a provider backup/PITR restore into an isolated target, retain the provider
restore record, and run the post-restore comparison before Step 17 can pass.
