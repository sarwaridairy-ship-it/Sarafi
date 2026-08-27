# SARAFI Final Production Verification

**Candidate:** local repository at `E:\New folder`  
**Verification date:** 2026-08-25  
**Supabase project:** linked project `vbvwuqzqtcorassvotke`  
**Web URL verified:** `http://localhost:5173/`  
**Release status:** NOT RELEASED TO PUBLIC PRODUCTION

## Evidence

### Functional

- PASS: Stages 4-7 domain workflows and owner dashboard slice.
- PASS: 3 browser E2E checks: trade posting, Dari/RTL, mobile width.
- PASS: Stage 7 report/reconciliation/notification unit coverage.
- PARTIAL: The authenticated trade adapter is connected to `record_fx_trade`; the remaining operation screens are not yet all connected to live RPCs.

### Financial

- PASS: Decimal.js money/rate/cost calculations.
- PASS: 50-run randomized ledger balance/replay tests.
- PASS: Weighted-average cost, partial sale, opening balance, debt settlement, reversal tests.
- PASS: Live migrations through `202608240014` and Supabase schema lint.
- PASS: Anonymous financial access is blocked by the Supabase Auth gate; authenticated posting now resolves real organization branch/cashbox IDs.
- PARTIAL: Authenticated live RPC/concurrency/reconciliation datasets not executed.
- PASS: Live anonymous organization/RPC security regression checks reject unauthorized access.
- BLOCKED: Controlled multi-user live authorization/concurrency tests require provisioned test identities and a safe test organization dataset.

### Security

- PASS: No service-role references in migrations or browser configuration.
- PASS: RLS declarations and restricted RPC grants are present; live schema lint is clean.
- PASS: Private document bucket has non-public setting, MIME allowlist, and 5 MB limit.
- PASS: CSP, frame denial, content-type, and permissions headers configured.
- PARTIAL: Two-user authenticated RLS/BOLA, upload abuse, rate-limit, MFA bypass, and token revocation tests require provisioned test users and production configuration.

### Compliance

- PASS: Versioned configurable rules, KYC fields, alerts/cases, screening boundary, and append-only audit checkpoints.
- PASS: DAB and FinTRACA source-review outcome documented.
- BLOCKED: Official source content could not be retrieved by the build process; qualified Afghan legal/compliance sign-off is required.

### Reliability

- PASS: Offline draft encryption, stale legacy-queue handling, no-auto-replay tests, and PWA shell artifacts.
- PASS: Migration list shows `202608240001` through `202608240013` applied remotely.
- PARTIAL: Provider backup/PITR confirmation and staging restore drill are not evidenced.
- BLOCKED: Linked schema dump/restore could not run because Docker Desktop is not available for the Supabase CLI backup path.
- PARTIAL: Realtime reconnect and push delivery require live authenticated devices.

### Release

- PASS: CI workflow and manually gated release workflow exist.
- PASS: Reproducible `npm run smoke`, `npm run build`, `npm run lint`, and dependency audit commands.
- NOT DONE: Public hosting/domain/TLS deployment.
- NOT DONE: Signed Android/iOS builds or store submission.
- NOT DONE: Owner/manager/cashier/accountant UAT sign-off.

## Commands and results

- `npm test`: 49 tests passing.
- `npm run e2e`: 3 tests passing.
- `npm run build`: passing.
- `npm run lint`: passing.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `npx supabase db lint --linked`: no schema errors.
- `npx supabase migration list --linked`: migrations 001-014 match remote.
- `npx supabase db lint --local`: not run successfully because Docker/local Postgres is not running at `127.0.0.1:54322`.
- Bounded secret scan: no credentials found; the sole match is the intentional `SUPABASE_SERVICE_ROLE_KEY` name in a negative security test, and `.env.local` is Git-ignored.

## Final release decision

**Do not release to public production.** The remaining blockers are external and material: live authenticated security/concurrency testing, backup restore evidence, legal/compliance sign-off, public hosting/domain configuration, mobile signed builds, and human UAT. No demo success state should be presented as production financial truth until those gates have evidence.
