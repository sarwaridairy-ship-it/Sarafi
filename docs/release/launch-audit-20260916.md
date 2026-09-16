# SARAFI launch audit — 16 September 2026

## Decision: HOLD public real-money launch

This is not a 100% completion certificate. Automated inspection, authenticated API
tests, live schema checks and a reachable site are different evidence classes.
Neither an empty backup file nor a financial snapshot proves recovery.

The candidate is on `codex/exact-instruction-v10`, proposed in
[review #2](https://github.com/sarwaridairy-ship-it/Sarafi/pull/2). The latest
commit's CI checks and `release-evidence/test-manifest.json` are authoritative for
its test results. Do not substitute a previous SHA's report. The production alias
was still on `3e2ae5bc9f06a719a149b1079c2d7422ed6a7a5e` at this audit boundary.

## Corrections completed in this continuation

- Exact decimal-string daily rate context; high-precision midpoint/tolerance math.
- Clearing a manual rate prevents saving; an automatic context cannot bypass it.
- A missing-rate request explicitly requests a branch daily-rate update, not
  permission to post an arbitrary transaction. MFA, role/branch capability,
  expiry, no self-approval, and no replay are checked server-side. Cashiers keep
  their draft and receive the new rate in place, then review/post normally.
- Managers see the exact branch and currency before publishing. English, Dari,
  and Pashto approval layouts fit phones, tablets and desktops. Visual review
  caught and corrected a vertically squeezed mobile description that a simple
  no-overflow test did not catch.
- Hawala own-draft evidence checks use the outer attachment organization and
  recipient branch. Raw ledger read permissions remain restricted.
- Finite-number constraints reject NaN and infinities in financial tables.
- Same-origin camera permission enables QR scanning without allowing arbitrary
  embedded origins to use the camera.
- Inspection, authenticated security, and seven-role reports are retained in
  separate folders with a commit-bound manifest. Authenticated API tests run
  once, independently of browser builds. CI rebuilds the entire database schema.
- The recovery checker reads all result pages, requests decimal strings, and
  checks each posted journal instead of trusting a global total. It explicitly
  does not claim to perform a restore and requires a quiescent target.
- The final skipped-test audit found and fixed shared-browser offline draft
  isolation. Hydration now filters shop/user/device/cashbox, identity changes
  remount the view, failed saves do not linger as saved drafts, and one awaited
  durable write replaces duplicate background writes. IndexedDB waits for commit
  and concurrent tabs cannot replace the winning encryption key. The formerly
  skipped encrypted-draft reload/tamper browser regression is enabled again.

## Observed verification

| Evidence | Result and boundary |
|---|---|
| Local unit tests | 169 passed, 2 explicit skips |
| TypeScript / lint | Passed |
| Production build | Passed; not itself a release approval |
| New Chromium regressions | 10 passed; EN/Dari/Pashto at 360/768/1366 and empty-manual-rate guard |
| Authenticated role/security API contracts | 9 passed; real fixture users, not inspection identities |
| Live daily-rate certification | 23 passed, 0 failed; dedicated security business; disposable device revoked |
| Exact posting readback | Duplicate submissions returned one entry; checked journals each contain two lines, debit = credit = 0.700000000000 AFN and rate = 70.000000000000000000 |
| Production migrations | Through `20260916090000_rate_request_review_context`; lint has no errors |
| Isolated schema replay | Full reset/lint succeeded; this is not a production-data restore |
| Revised recovery checker | Live read-only fixture snapshot: 10 posted journals, no invalid journals; exact totals 18003.08 AFN each side; no restore claimed |
| Public-site owner smoke | Authenticated security-fixture owner home loads after the new database migrations |

Full three-browser and authenticated CI must pass for the **final** candidate SHA;
consult the PR checks and retained stage manifest rather than this static table.
Test mutations were limited to dedicated security fixtures, not real shop entries.
No customer financial history was deleted or rewritten.

## Outstanding release gates

1. **Verified backup and restore:** local attempted schema/data dumps are both
   zero bytes. No provider restore into a private, isolated target is proved.
   The last provider check showed no available backups and PITR disabled. Choose
   an appropriate plan/retention, perform the restore, and verify RPO/RTO plus exact
   reconciliation. A fresh empty-database migration replay is not a substitute.
2. **Release protection and independent review:** main is unprotected. The
   connected Git credential has `push: true`, `admin: false`, `maintain: false`.
   Both existing GitHub environments have no protection rules. No settings were
   changed after this permission check. A repository administrator must require
   CI/migration checks, review and protected production promotion. Do not bypass
   the gate with a direct push or manual alias promotion.
3. **Human acceptance:** qualified Afghan Dari/Pashto terminology review,
   actual cashier/owner/Hawala-worker journeys, physical device/biometric tests,
   and 58mm/80mm/A4 printer acceptance remain unverified.
4. **Operational/legal approval:** backup ownership, alert response ownership,
   market-data usage rights, and applicable legal/compliance/provider sign-off
   need real evidence from the responsible people. Software tests cannot grant it.

## Deployment boundary

Database safety corrections were applied and live-tested. The new frontend must
not be advertised as the finished public release until the outstanding gates are
closed. A production-configured candidate may be deployed without assigning the
public alias for review; record its exact SHA and immutable URL separately.

The prior v1–v10 reports are historical evidence, not permanent acceptance of later
changes. Preserve the user's current product vocabulary and workflows; do not
resurrect superseded UI requirements just to satisfy old assertions.
