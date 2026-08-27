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
