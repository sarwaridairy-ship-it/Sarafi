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

The complete browser CI result must be checked for the **final** candidate SHA;
the earlier green `51f968d` workflow and an isolated green database job do not
certify later changes or all three browser engines. No fresh physical-device,
printer, biometric or native-speaker acceptance is claimed here.

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

The fresh provider advisor still reports 149 authenticated SECURITY DEFINER
functions, one intentionally anonymous public-status function, and 15 informational
RLS-enabled/no-policy tables. These categories were not blanket-suppressed or
declared safe. Fixed search paths do not replace authorization/call-chain review.
See the provider guidance for
[authenticated privileged functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
and [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
The previously enabled leaked-password protection warning remains absent.

Independent review, signed release tag, protected production promotion, full RPC
authorization review, secure account-recovery acceptance, qualified Afghan Dari/
Pashto review, actual operator/device/printer acceptance and responsible legal/
provider/operational sign-off remain open. Existing user screenshots and PDFs
were preserved. The public alias was not promoted in this continuation.

The Supabase security skill guided explicit suspension/capability/tenant checks
and post-change verification. The React review skill guided the import context
reset; neither skill substitutes for independent human approval.
