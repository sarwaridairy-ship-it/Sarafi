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
- Tracked migrations are present through `202608270001_step13_private_documents.sql`.
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
- Supabase advisors: `0` errors and `65` warnings: 4 mutable search-path warnings, 29
  anonymous SECURITY DEFINER execution warnings, 29 authenticated SECURITY DEFINER
  execution warnings, 1 leaked-password-protection warning, and 3 RLS init-plan warnings.
  These warnings require review and prevent a no-critical/high-finding claim.
- The privileged provisioning secret was removed from the current terminal process after
  fixture setup. It was never written to the repository or emitted in test output.
- Full Playwright matrix with Owner A configured: `69 passed`, `0 failed`, `3 skipped`.
  The three skips are the opt-in production-auth accessibility checks; the two core
  authenticated security tests ran in all three browser projects and did not skip.
- Unit suite: `56 passed` across 18 test files. Typecheck, lint, and production build
  passed. Chromium focused regression: `23 passed`, `1 skipped`.

## Security Controls Present

- Organization membership and active status are checked server-side.
- Tenant, branch, and cashbox scope is checked server-side for authoritative commands.
- RLS protects tenant-owned records and private document access.
- Sensitive document access is audited.
- Public inspection mode is synthetic and does not authorize real tenant writes.
- Offline commands bind tenant, user, device, and cashbox identity and fail closed on
  envelope mismatch or corrupted encrypted records.

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

Code-controlled security protections are implemented and partially exercised. Step 15 is
not claimed 100% complete until the required live multi-role and privileged-security
matrix is executed and attached with timestamps and test-account identifiers that do not
include credentials.

Current certification result: **PARTIAL**. Controlled identities now exist and the
available live matrix executed, but Step 15 is not 100% complete because four required
security categories are unsupported and real TOTP/MFA privileged-action evidence is
missing. No unrelated production data was created, modified, revoked, or deleted during
this run.

Provisioning blocker: the trusted local environment exposes only `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`. No Supabase Auth Admin credential or Dashboard provisioning
session is available to this agent. Auth users must be created through the Admin API or
Dashboard; they cannot be created by inserting into `auth.users`, and the anon key cannot
provision users or tenants.
