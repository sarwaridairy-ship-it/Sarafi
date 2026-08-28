# SARAFI Final Production Verification

**Candidate:** local repository at `E:\New folder`  
**Verification date:** 2026-08-28
**Supabase project:** linked project `vbvwuqzqtcorassvotke`  
**Web URL verified:** `https://sarafi-swart.vercel.app/`
**Release status:** PARTIAL WEB ACCEPTANCE; AUTHENTICATED UAT AND HUMAN LANGUAGE SIGN-OFF PENDING

## Evidence

### Functional

- PASS: Stages 4-7 domain workflows and owner dashboard slice.
- PASS: 3 browser E2E checks: trade posting, Dari/RTL, mobile width.
- PASS: Stage 7 report/reconciliation/notification unit coverage.
- PARTIAL: The authenticated trade adapter and operation screens call live RPCs, but the full operation matrix and live report/export journey remain unproven.

### Financial

- PASS: Decimal.js money/rate/cost calculations.
- PASS: 50-run randomized ledger balance/replay tests.
- PASS: Weighted-average cost, partial sale, opening balance, debt settlement, reversal tests.
- PARTIAL: Linked schema lint is clean, but migration history has unresolved remote versions `202608270013` through `202608270016`; see [migration-reconciliation-20260828.md](../audits/migration-reconciliation-20260828.md).
- PASS: Anonymous financial access is blocked by the Supabase Auth gate; authenticated posting now resolves real organization branch/cashbox IDs.
- PASS: Step 16 live concurrency evidence passed 7/7 checks against isolated same-tenant cashier fixtures; report retained in [step-16-live-report-20260828.json](../audits/step-16-live-report-20260828.json).
- PASS: Live anonymous organization/RPC security regression checks reject unauthorized access.
- PARTIAL: Fresh MFA and approval sub-gates pass; the complete Step 15 manifest still needs one consolidated rerun with every required category. See [step-15-closure-report-20260828.json](../audits/step-15-closure-report-20260828.json).

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
- BLOCKED: Migration list shows remote versions through `202608270016`, but exact local files for `202608270013` through `202608270016` are missing; pending migrations `202608270017` and `202608270018` are frozen.
- BLOCKED: Provider backup/PITR confirmation and staging restore drill are not evidenced; the executable reconciliation check is documented in [step-17-recovery-drill.md](../audits/step-17-recovery-drill.md).
- BLOCKED: Linked schema dump/restore could not run because Docker Desktop is not available for the Supabase CLI backup path.
- PARTIAL: Realtime reconnect and push delivery require live authenticated devices.

### Release

- PASS: CI workflow and manually gated release workflow exist.
- PASS: Reproducible `npm run smoke`, `npm run build`, `npm run lint`, and dependency audit commands.
- PASS: Vercel production deployment responds with HTTP 200 at `https://sarafi-swart.vercel.app/`; deployment URL `https://sarafi-f14h3wf7n-shafiullah-s-projects1.vercel.app` was aliased to the canonical domain on 2026-08-28.
- NOT DONE: Signed Android/iOS builds or store submission.
- NOT DONE: Owner/manager/cashier/accountant UAT sign-off.

### Performance and adoption

- PASS: Initial production JavaScript shell is below the 500 KB budget and report exports are lazy-loaded; run `npm run performance:step18`.
- PASS: Service worker network-only handling prevents stale cached navigation or financial/auth success state.
- PARTIAL: Import preview validation, templates, and server onboarding foundations exist; authoritative reversible import commit is not complete.
- NOT DONE: Representative 3G, low-memory Android, 50k-transaction, and native packaging evidence.

### Web human UX

- PASS LOCALLY: Production-mode entry explains SARAFI as a digital daftar for Sarafi shops and offers direct EN/Dari/Pashto selection.
- PASS LOCALLY: Auth entry labels, actions, and status messages translate with the selected language and update RTL direction.
- PASS LOCALLY: Progressive onboarding now collects business name, currencies, and main cashbox name through the existing server onboarding RPC.
- PASS: Live Vercel public entry was rechecked after redeployment in English, Dari, and Pashto; direct language selection, RTL direction, and no-overflow checks passed at 360, 390, 430, 768, and 1366px.
- PASS: Chromium, Firefox, and WebKit UX suites each passed 21/21 tests against the production-equivalent build.
- PARTIAL: Authenticated first-time owner/cashier journeys, full protected-screen terminology migration, and human Dari/Pashto review remain pending.

## Commands and results

- `npm test`: 60 tests passing, 2 intentionally skipped.
- `npx playwright test tests/e2e/stage9.spec.ts tests/e2e/controls.spec.ts`: 21/21 passing in Chromium, Firefox, and WebKit.
- `npx playwright test tests/e2e/accessibility.spec.ts`: 2 passing and 1 intentionally skipped per browser; authenticated accessibility requires `SARAFI_AUTH_E2E_URL`.
- `npm run build`: passing.
- `npm run lint`: passing.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `npx supabase db lint --linked`: no schema errors.
- `npx supabase migration list --linked`: migrations 001-014 match remote.
- `npx supabase db lint --local`: not run successfully because Docker/local Postgres is not running at `127.0.0.1:54322`.
- Bounded secret scan: no credentials found; the sole match is the intentional `SUPABASE_SERVICE_ROLE_KEY` name in a negative security test, and `.env.local` is Git-ignored.

## Final release decision

**Public deployment is live, but final web acceptance remains PARTIAL.** Authenticated owner/cashier UAT, provider backup/restore evidence, legal/compliance sign-off, and competent Dari/Pashto review remain open. Native application work remains prohibited until those web acceptance gates are closed.
