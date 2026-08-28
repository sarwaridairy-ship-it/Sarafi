# Step 15: Live Auth, RLS, Tenant Isolation, and Privileged Security Evidence

Reviewed: 2026-08-27

## Existing Automated Evidence

- `tests/e2e/authenticated-security.spec.ts` covers authenticated sign-in, MFA assurance
  retrieval, own-organization reads, guessed other-tenant reads, and concurrent duplicate
  command behavior.
- The authenticated security journey and concurrent duplicate-command test were previously
  run successfully with real environment values.
- Browser authentication tests are skipped when required credentials are absent.
- Supabase migrations through `202608240031` and the Step 13 private-document migration
  were linted remotely; no schema errors were reported.
- Financial writes use security-definer RPC boundaries, active membership checks, scoped
  branch/cashbox checks, RLS, immutable posted journal entries, and idempotent command IDs.
- No service-role key is shipped to the browser.

## Certification Run: 2026-08-27

- Git: `main`, HEAD `38c1acc6bd36cc7ab7d58145a367918de886106e`.
- `origin/main` matches HEAD; worktree was clean before this evidence update.
- Production alias: `https://sarafi-swart.vercel.app`.
- Supabase project reference: `vbvwuqzqtcorassvotke`.
- Supabase CLI project verification: linked project reference exactly matched
  `vbvwuqzqtcorassvotke`; project name is `sarwaridairy-ship-it's Project` in South Asia
  (Mumbai). Only the project reference and hostname were used for verification; no
  privileged key was printed.
- Tracked migrations are present through `202608270008_restore_rls_helper_grants.sql`.
- `npx supabase db lint --linked`: passed, no schema errors.
- `npm audit --omit=dev`: passed, 0 vulnerabilities.
- Tracked-file secret scan: no credential material found; only intentional negative-test
  identifiers matched.
- `npx supabase inspect db role-stats --linked`: completed without modifying data.
- `npx playwright test tests/e2e/authenticated-security.spec.ts`: 6 skipped because
  controlled security-test credentials and organization ID were not configured in the
  terminal. No live authenticated result is claimed from this run.

## Controlled Fixture Run: 2026-08-27

- Target verification passed before writes: project ref and URL hostname matched exactly.
- Eight disposable Auth users were created with `auth.admin.createUser`, confirmed email
  for deterministic fixture automation, and labeled with `SECURITY_TEST_*` metadata.
  Passwords were generated locally and stored only in ignored `.env.security.local`.
- Two isolated businesses, memberships for owner/manager/accountant/cashier/viewer/
  compliance roles, branches, cashboxes, and cashier A1/A2 scope records were created.
- The direct authenticated public-client matrix executed with `53` passed, `0` failed,
  and `4` unsupported assertions. Unsupported areas are device revocation, membership
  revocation, private storage fixture isolation, and Realtime event isolation because
  the corresponding server workflow/test harness is not implemented.
- Cross-tenant SELECT/RPC attempts, cross-tenant writes, anonymous financial access,
  Viewer mutation, cashier A2 scope, and client-side owner escalation were denied by the
  live API/database. Assigned cashier A1 posting succeeded after the trigger repair below.
- `202608270002` removed legacy materialization trigger names. `202608270003` corrected
  table-specific `NEW` field evaluation in `assert_financial_tenant_consistency`; both
  migrations were linted and applied remotely.
- Owner A MFA assurance was observed at `aal1`; no real TOTP factor was enrolled, so AAL1
  versus AAL2 privileged-action certification remains pending.
- Supabase advisors after remediation: `0` errors and `33` warnings. Anonymous SECURITY
  DEFINER exposure and mutable search-path findings were remediated. Remaining warnings
  are authenticated SECURITY DEFINER review items, the two RLS helper grants required for
  policy evaluation, leaked-password configuration, and performance init-plan warnings.
  These are documented in the advisor remediation report.
- The privileged provisioning secret was removed from the current terminal process after
  fixture setup. It was never written to the repository or emitted in test output.
- Full Playwright matrix with Owner A configured: `69 passed`, `0 failed`, `3 skipped`.
  The three skips are the opt-in production-auth accessibility checks; the two core
  authenticated security tests ran in all three browser projects and did not skip.
- Unit suite: `56 passed` across 18 test files. Typecheck, lint, and production build
  passed. Chromium focused regression: `23 passed`, `1 skipped`.
- Closure run after device/membership/storage/Realtime implementation and grant
  remediation: `66 passed`, `0 failed`, `0 unsupported` in the direct live matrix.
- The final repeat run after RLS helper grant compatibility: `66 passed`, `0 failed`,
  `0 unsupported`.
- Final live matrix categories covered tenant reads/writes/RPC, role and branch/cashbox
  enforcement, device revocation, membership suspension, storage isolation, Realtime,
  anonymous denial, valid cashier posting, and idempotency.
- The required-certification manifest now contains 23 explicit IDs. Offline replay has been
  retired by product decision and replaced by `OFFLINE_FINANCIAL_POSTING_DISABLED` and
  `LEGACY_OFFLINE_COMMAND_AUTO_REPLAY_DENIED`.
- Storage isolation passed for synthetic Business A upload/download versus Business B and
  anonymous denial. Realtime passed for Business B event exclusion and Business A event
  delivery after publishing `financial_events`.
- Device registration/revocation and membership suspension were exercised through the live
  RPC boundary. Authoritative offline financial synchronization is now retired by policy.
- MFA was proven in a fresh-fixture run through TOTP enrollment, AAL1 denial, and AAL2
  allowance; the current final manifest must be rerun after the safe-degraded rebase.
- Approval security remains partial: the full requester/approver role matrix, stale-state,
  retry, and economic-effect proof was not executed.
- Step 15 therefore remains **PARTIAL**, despite the direct matrix having zero failed or
  unsupported rows for the categories implemented by the harness.
- Closure implementation now includes server-side AAL2 enforcement, an authoritative
  approval workflow, and explicit offline financial-posting retirement. Real TOTP evidence
  remains in the controlled historical run; the redefined offline policy does not weaken
  the MFA or approval gates.
- New Step 12 policy evidence is in `docs/audits/step-12-safe-degraded-mode.md`; the
  former revoked-offline-command IDs are replaced by offline decommissioning guarantees.
- Offline decommissioning guarantees are now implemented and tested: financial posting
  controls are disabled while disconnected, drafts are encrypted and marked not posted,
  reconnect has no posting callback, and retired legacy sync RPCs are removed.

## Security Controls Present

- Organization membership and active status are checked server-side.
- Tenant, branch, and cashbox scope is checked server-side for authoritative commands.
- RLS protects tenant-owned records and private document access.
- Sensitive document access is audited.
- Public inspection mode is synthetic and does not authorize real tenant writes.
- Offline drafts bind tenant, user, device, and cashbox identity and fail closed on envelope
  mismatch or corrupted encrypted records. They have no authoritative posting status.

## Required Live Certification Before Claiming 100%

The following evidence is still required with controlled test accounts and at least two
organizations:

- Owner, manager, accountant, cashier, viewer, and compliance-officer role matrix.
- Cross-tenant SELECT, INSERT, UPDATE, and DELETE denial tests, including guessed UUIDs.
- Branch and cashbox scope denial tests.
- User metadata tampering and forged client-role claims.
- Expired session, logout, revoked device, MFA/reauthentication, and recovery flows.
- Security-definer function EXECUTE grants, public exposure review, storage policies, and
  view/RLS review in the linked Supabase project.
- Repeatable concurrent idempotency evidence for each authoritative write family.

## Status

The explicit `npm run security:step15` runner now requires every credential it consumes
and writes `test-results/step15/security-report.json`. The 2026-08-28 rerun was blocked
before the matrix because Supabase returned `AAL2 is required for this action` while
resetting the fixture membership; Owner A's existing factor also prevents new factor
enrollment from AAL1. MFA and the dependent privileged fixture reset therefore remain
unverified in the current run. No security control was weakened.

Code-controlled security protections are implemented and partially exercised. Step 15 is
not claimed 100% complete until the required live multi-role and privileged-security
matrix is executed and attached with timestamps and test-account identifiers that do not
include credentials.

The fresh-identity provisioner is available as `npm run security:provision-mfa`; it
requires a trusted service-role key and writes credentials only to ignored local storage.
Approval certification is available as `npm run security:approval`; its live report is
retained in ignored test output and summarized in [step-15-closure-report-20260828.json](step-15-closure-report-20260828.json).

Current closure result: **MFA and approval sub-gates PASS**. A fresh owner reached AAL2,
wrong TOTP was denied, AAL1 privileged access was denied, AAL2 access was allowed, and
the approval self/viewer/cross-tenant/authorized/repeat/concurrent checks passed. The
complete Step 15 certification remains **PARTIAL** until the full manifest is rerun with
those fresh fixtures and every required category is retained in one report. No unrelated
production data was created, modified, revoked, or deleted during this run.

The fresh fixture was provisioned through the trusted Admin API flow. Credentials remain
in ignored local files only; no service-role key, password, TOTP secret, or token is part
of the retained report.
