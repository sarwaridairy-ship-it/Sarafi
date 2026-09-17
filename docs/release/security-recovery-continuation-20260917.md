# SARAFI security and recovery continuation — 17 September 2026

Status: **HOLD public real-money release.** Authorization is already present;
the remaining recovery and independent acceptance evidence is not. This report
does not turn automated checks into a 100% launch certificate.

## Completed and applied

- Platform administrators now lose administrator and support-grant access when
  their platform account is suspended. Previously the administrator helper only
  checked `platform_admins.active`.
- `commit_import` now requires the current `data.import` capability before any
  idempotency lookup, with account suspension and MFA enforced. The old direct
  owner/manager/accountant whitelist no longer bypasses capability denials.
- Every imported row must name an active branch belonging to the organization
  and satisfy branch-scoped import permission. Counterparties use the protected
  creation API, including its `customers.manage` permission, instead of direct
  insertion. Financial posting remains behind the existing authoritative APIs.
- The import UI binds its command to the selected branch and resets its draft
  when shop/branch context changes. This frontend change is on the candidate
  branch, not a claim of public-alias promotion. Older clients without branch
  context are intentionally rejected instead of creating unscoped records.
- Compliance alerts reject an event ID that is absent from the same organization.
- Migration `20260916214239_harden_suspension_import_and_compliance_scope.sql`
  was applied to **only** `vbvwuqzqtcorassvotke`, after an exact one-migration
  dry run. Vault, seeds and roles were not synchronized. No existing customer
  financial record was changed. Production database lint returned no errors.

## Verification

| Check | Evidence |
| --- | --- |
| Isolated full schema replay and database lint | Passed for `f7660d3dc99014f2a6aad773922727f0e2b2fc80` |
| Rollback-only pgTAP authorization tests | 25 passed; synthetic identities and all writes rolled back |
| Live migration/guard presence and anonymous import grant | All six read-only checks passed |
| Live authenticated security and seven-role tests | 10 passed, including new exact import-capability denials |
| Full current-source unit suite with live anonymous checks enabled | 215 passed, zero skipped, 39 files |
| Storage helper tests | 25 passed, including bucket/object pagination beyond 100 |
| TypeScript and lint | Passed |
| Live private Storage readability | 2 private buckets, 24 objects, 796 bytes; all bytes read and hashed |

Isolated database evidence is in
[CI run 35154875407](https://github.com/sarwaridairy-ship-it/Sarafi/actions/runs/35154875407),
job `104991823444`. The initial run caught a branch-validation error-message
mismatch; the implementation was tightened to verify active branch ownership
before dispatch, and an inactive-branch test was added. No test was removed or
relaxed. The compliance-event regression uses a nonexistent event ID; it is not
presented as a completed live cross-tenant mutation test.

Authenticated financial idempotency testing is restricted to the existing
`SECURITY_TEST_` business and checks two requests create one posted entry.
Other real customer businesses were not used for mutation testing. The new
live import-denial probes use empty rows, so even a regression in authorization
cannot create a customer or financial entry.

The complete browser CI result must be checked for every code-bearing candidate
SHA; an earlier green workflow or an isolated green database job does not certify
later runtime changes or all three browser engines. The latest code-bearing SHA
and its evidence are recorded below. No fresh physical-device, printer, biometric
or native-speaker acceptance is claimed here.

## Recovery progress and limitations

`capture-storage-manifest.mjs` paginates all file buckets and objects, checks
private access and complete size metadata, reads each file into memory for a
SHA-256 checksum, and compares metadata before/after capture. Output contains
hashed object names and checksums, not document contents, URLs or credentials.
The live API inventory matches the separate read-only SQL count/size inventory.
The private checksum evidence remains under `tmp/launch-audit/`; it is not
committed. No Storage object was uploaded, replaced or deleted.

`compare-storage-manifests.mjs` rejects same-project comparisons, malformed or
public-bucket evidence, duplicate objects, missing/extra buckets and missing/
extra/changed files. A passing comparison is deliberately **not** a database
restore or release approval. See the revised
[recovery procedure](../audits/step-17-recovery-drill.md).

No backup was created by these checksum checks, and no restore was performed.
The active outbound cleanup job and copied Vault credentials still make a
one-click physical clone unsafe. An approved private isolated target and bounded
cost, reviewed logical restore, separately backed-up Storage objects, backup-time
baseline and measured RPO/RTO remain necessary. Sahibash is never a restore target.
No new paid project, subscription, top-up or add-on was purchased.

## Remaining security and release gates

The fresh provider advisor now reports 144 authenticated SECURITY DEFINER
functions, one intentionally anonymous public-status function, and 15 informational
RLS-enabled/no-policy tables. These categories were not blanket-suppressed or
declared safe. Fixed search paths do not replace authorization/call-chain review.
See the provider guidance for
[authenticated privileged functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
and [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
The previously enabled leaked-password protection warning remains absent.

## Team-lifecycle continuation

Migration `20260916221039_harden_team_account_lifecycle.sql` is now live on
SARAFI only. Ten onboarding/team APIs were hardened: suspended-account denial,
current invitation capabilities, owner/peer-administrator protection, active
member protection, matching cashier branch/cashbox assignment, and mandatory MFA
for administrator admission. Explicitly accepted invitations and re-admissions
replace old capability overrides with the newly approved assignment. No existing
memberships were bulk-rewritten.

Five unused internal authorization helpers were removed from the client RPC
surface after checking database callers and absence of client/policy references.
They remain callable internally by their privileged owning functions. This
reduces the advisor count from 149 to 144; it does not certify the remainder.

Full [CI run 35156783314](https://github.com/sarwaridairy-ship-it/Sarafi/actions/runs/35156783314)
passed for `a2234ced38d7a1303f1743459a9d89847c5c5d40`, including all three
browser engines, schema replay/lint, live anonymous checks, authenticated tests,
and **60 rollback-only pgTAP assertions**. After live deployment, database lint
returned no errors, **68/68 read-only privileged RPC boundary probes** passed,
and the **10 authenticated role/security tests** passed again. The full local
current-source suite subsequently passed **215 tests, zero skipped**, including
live anonymous checks.

`scripts/security/check-privileged-rpc-boundaries.mjs` uses only the existing
seven disposable roles and anonymous key. It asserts exact denial codes/messages
for internal helper access, platform consoles and cross-business billing, writes
no financial records and changes no access. Sanitized output is kept in ignored
`test-results/privileged-rpc/result.json`. Test accounts are verified as belonging
to the dedicated `SECURITY_TEST_` business before probing.

The RPC inventory is a timestamped pre-team-deployment source-review snapshot,
not a claim that its old definition hashes still describe deployed functions.
No full delegated-scope/limit containment or independent audit is implied by
these targeted tests. The protected production alias has not been promoted.

## Billing and payment-receipt boundary continuation

Migration `20260917064509_harden_billing_suspension_and_finite_prices.sql`
is now live on SARAFI only. It denies billing portal/payment-request access when
the user's platform account is suspended while preserving an active owner's
ability to renew a shop whose subscription itself is suspended. Browser roles
still have no direct access to the private payment-request table.

Payment-receipt Storage policies now use the guarded owner helper instead of a
raw query against the protected memberships table. Linked-receipt checks run
through a private, non-API security-definer helper, so denying general shop
settings cannot hide the payment link and make evidence deletable. The helper
returns false outside the caller's own active owner path; anonymous and `PUBLIC`
have no execute privilege. The live receipt bucket contained zero objects at the
deployment boundary, so no existing object was moved, deleted or rewritten.

Subscription plan, term-price and payment-request amounts now reject PostgreSQL
`NaN` and infinities at both the administrator API and table-constraint layers.
Read-only preflight and postflight checks found zero invalid existing values; all
three constraints are validated. No payment or subscription record was changed
by deployment or verification.

Full [CI run 35193568339](https://github.com/sarwaridairy-ship-it/Sarafi/actions/runs/35193568339)
passed for `b8963a9d0216a57fccc2aa50d87b838015f7ba6c`: **411 browser
tests** across Chromium, Firefox and WebKit; schema replay/lint; **103 pgTAP
assertions** across three rollback-only files, including all **43 new billing and
Storage assertions**; three authenticated security journeys; and all seven role
contracts. The exact live dry run and deployment contained one migration, no
seeds, role synchronization or Vault changes.

After deployment, live database lint returned no errors, the existing ten
authenticated role/security journeys passed, and the expanded non-writing
privileged-boundary probe passed **82/82** with zero financial writes and zero
access changes. The provider advisor remains at 144 authenticated privileged
functions, one intentionally anonymous public-status function and 15
informational RLS-without-policy tables; this migration added no exposed
privileged RPC. These results validate this narrow correction, not the whole
remaining RPC inventory or a public release.

## Ledger-structure and deferred-trigger continuation

Migration `20260917075058_enforce_posted_journal_structure_and_health.sql` is
live on SARAFI only. A posted journal now requires at least two lines as well as
equal base debits and credits. The platform health calculation uses a left join,
so legacy zero-line or one-line posted journals can no longer disappear from its
malformed-entry count. The read-only deployment preflight found 263 posted
journals, a minimum of two lines, and zero malformed entries; no historical
journal was rewritten by the migration.

Full [CI run 35196701875](https://github.com/sarwaridairy-ship-it/Sarafi/actions/runs/35196701875)
passed for `d55a1db07ddaa0ee8c8680f30075b94e7594988a`, including the three-browser
matrix, schema replay/lint and 107 rollback-only pgTAP assertions. The subsequent
live authenticated posting check nevertheless caught a production privilege
regression: replacing the deferred trigger function had omitted its previous
`SECURITY DEFINER` attribute. Posting failed closed with permission denied on the
protected journal-line table; it did not create a malformed posted journal.

Migration `20260917080745_restore_deferred_journal_security_definer.sql` is now
live. It restores the deferred trigger's privileged execution with an empty
search path while revoking direct execution from `PUBLIC`, `anon` and
`authenticated`. A permanent pgTAP assertion now checks all four properties,
bringing the rollback-only database suite to 108 assertions.

The first hotfix workflow's isolated database job was green, but its browser job
correctly prevented a green build after one WebKit navigation failure in the
offline-draft encryption test. The test itself left direct IndexedDB connections
open and performed redundant full navigations. Commit
`0374ce778b7170ec125c6514a955bb18da2c6c0c` closes those test-only connections
and reloads the same route once without weakening the plaintext, auto-post or
tamper-detection assertions. The repaired test passed targeted Chromium, Firefox
and WebKit execution plus three consecutive additional WebKit runs.

Full [CI run 35199942240](https://github.com/sarwaridairy-ship-it/Sarafi/actions/runs/35199942240)
then passed for that code-bearing commit: **411 browser tests**, zero failures and
zero flaky tests across Chromium, Firefox and WebKit; performance/import checks;
schema replay/lint; **108 rollback-only pgTAP assertions**; three authenticated
security journeys; and all seven role contracts. The retained evidence manifest
binds those stages to the workflow's GitHub merge commit and records their SHA-256
digests.

Final read-only live reconciliation found both ledger migrations, 271 posted
journals, a minimum of two lines and **zero malformed posted journals**. The
count increase is from repeated idempotency checks in the dedicated
`SECURITY_TEST_` business, not a rewrite of customer journals. The trigger remains
security-definer and non-executable by anonymous or authenticated browser roles;
the health function contains both the left join and structural check. Live
database lint remained clean, the 82 non-writing privileged-boundary probes and
ten authenticated role/security checks passed after the hotfix, and the public
alias was not promoted.

Independent review, signed release tag, protected production promotion, full RPC
authorization review, secure account-recovery acceptance, qualified Afghan Dari/
Pashto review, actual operator/device/printer acceptance and responsible legal/
provider/operational sign-off remain open. Existing user screenshots and PDFs
were preserved. The public alias was not promoted in this continuation.

The Supabase security skill guided explicit suspension/capability/tenant checks
and post-change verification. The React review skill guided the import context
reset; neither skill substitutes for independent human approval.
