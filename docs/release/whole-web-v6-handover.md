# SARAFI whole-web v6 handover

Date: 2026-09-09 (Asia/Kabul)

Branch: `codex/whole-web-v6`

Starting commit: `1e50c13fc72a632447e279d8f9071d318e4d00c8`

Verified implementation commit: `89cacc0f7ada632ad03f20a1fc154152e719b6fa`

Decision: **source implementation and the reviewed production-database forward migrations are complete for the controllable v6 scope; web production promotion remains NO-SHIP until the independent evidence gates below pass.**

This record deliberately separates implementation evidence from production evidence. Inspection mode, static contract tests, screenshots, generated audit prose, and a successful local build are not substitutes for authenticated database tests, human acceptance, or an exact deployment attestation.

## Implemented v6 correction scope

- One React Router workspace layout now owns `/app/:organizationId`, validates organization scope in a loader, resolves route sections from route handles, renders task content through `<main><Outlet /></main>`, and uses route parameters for customer, transaction, account, device, approval, Debt, Hawala, and partner deep links.
- Every role receives exactly five primary destinations from the effective capability contract. Business Administrator remains operationally capable without owner, billing, ownership-transfer, or owner-capital authority.
- Make a Transaction starts with exactly six families, then reveals only the chosen family actions. Canonical Buy, Sell, Exchange, money-in, money-out, movement, Debt, and Hawala subtype URLs open the selected task directly.
- Financial forms use plain operational language, hide ledger/base/debit/credit fields, resolve missing or stale rates in place, retain drafts through approval, and route completed operations through one receipt/detail success model.
- Hawala stores explicit direction, workflow, sender, receiver, canonical partner, server reference, payout evidence, settlement state, remaining amount, audit status, and Hawala-specific event types. Payout and partner settlement use dedicated atomic commands; reference entry includes on-device QR/Code 128 scanning with manual fallback and no image upload.
- Direct financial/customer/Debt/Hawala table fallbacks were removed from the browser. Scoped RPCs and branch/cashbox-aware database policies are the read boundary; private document access requires explicit capability and audited signed access.
- Reports freeze one server snapshot and derive screen, CSV, Excel, PDF, and print evidence from that snapshot. Export logging happens only after file generation succeeds and re-checks capability and snapshot expiry.
- Compliance decisions are immutable, rule-versioned, fail closed without an active rule set, and retain amount, aggregation-window, required-document, KYC, screening-provider, case, event, and engine-version evidence. A manual clearance is accepted only from a different reviewer and only when its rule, client command, branch, counterparty, cashbox, event/workflow, and amount match the attempted transaction; a reported case cannot authorize posting.
- Membership, device, approval, Hawala, compliance, and security-audit updates refresh an open workspace. Failed RPCs and route/render failures emit redacted release/route/code/correlation telemetry without copying transaction payloads or user-entered error details. The PWA has local icons, locale-aware manifests, and a non-interruptive update lifecycle.
- CI retains browser/PDF/screenshot/trace evidence. Production promotion now requires all seven authenticated role fixtures, a zero-to-latest database reset/lint, a signed tag bound to the exact SHA, backup/restore evidence, Dari/Pashto UAT, physical printer acceptance, legal/provider approval, and an immutable deployment attestation.
- Five post-audit forward repairs align Business Administrator posting authority, restore AAL2 on feature controls, preserve private-document uploads after raw-table revocation, run the deferred journal invariant with server privileges, and expose journal totals only through a tenant- and `financial.report`-scoped audit RPC. The `private-document-url` Edge Function is deployed with JWT verification.

## Forward migrations and linked database state

1. `20260906190754_calm_premium_capabilities.sql`
2. `20260907121336_whole_project_integrity_v5.sql`
3. `20260908104812_whole_web_v6_reporting_compliance_evidence.sql`
4. `20260908110000_hawala_event_types_v6.sql`
5. `20260908110100_hawala_evidence_v6.sql`
6. `20260908221542_repair_hawala_v6_function_lint.sql`
7. `20260909071807_align_v6_business_admin_transaction_authority.sql`
8. `20260909072352_restore_aal2_for_feature_controls.sql`
9. `20260909073052_repair_private_document_upload_policy.sql`
10. `20260909073913_repair_deferred_journal_balance_privileges.sql`
11. `20260909075231_repair_journal_balance_audit_privileges.sql`

All eleven forward migrations are applied to linked Supabase project `vbvwuqzqtcorassvotke`. The linked migration list matches local history through `20260909075231`, and a subsequent dry run reports no pending migration. The earlier Hawala lint findings were corrected by a forward migration without rewriting history. A fresh `supabase db lint --linked` attempt on 2026-09-09 could not authenticate because this workstation does not have `SUPABASE_DB_PASSWORD`; therefore a current database-lint pass is not claimed.

The `private-document-url` Edge Function is active at version 1 with JWT verification. Live acceptance proved a valid audited signed URL downloads successfully while anonymous, direct-bucket, and cross-tenant access remain denied.

Before application, a sanitized public-schema JSON recovery snapshot and exact ledger invariants were captured outside version control. At the migration boundary, post-application reconciliation retained 12 organizations, 192 financial events, 192 journal entries, 439 journal lines, equal base debit and credit totals of `346214812.233108307506`, and ledger hash `49ca3d0e68b99117907acaa78080a0fc`. Later acceptance runs added only disposable security-fixture activity, so those boundary counts are not presented as current production totals. This is migration and reconciliation evidence, not a provider backup/PITR restore drill.

Two compliance rules with source `AUTOMATED_TEST_ONLY_NOT_LEGAL_SIGNOFF` were activated only inside `SECURITY_TEST_BUSINESS_A` and `SECURITY_TEST_BUSINESS_B` to exercise technical posting paths, then retired. Final cleanup reports two retired rules, zero active test rules, no `advanced_analytics` residue in either test organization, and the temporary CNY setting disabled. These rules are not legal or provider approval.

## Verification completed in this workspace

| Gate | Result |
| --- | --- |
| TypeScript | PASS |
| Lint | PASS |
| Unit/static contracts | PASS: 121 passed, 2 intentionally environment-dependent skipped |
| Linked Supabase migration application | PASS: local/remote match through all eleven v6 migrations; remote dry run is current |
| Fresh linked database lint | BLOCKED: CLI requires the unavailable `SUPABASE_DB_PASSWORD`; no fresh pass claimed |
| Premium role/settings acceptance | PASS: 29 passed, 0 failed |
| Master controls/reports | PASS: public/anonymous boundaries, AAL2 control, reconciliation, and 22 named reports |
| Offline boundary | PASS: 5 passed, 0 failed |
| Dedicated MFA | PASS: 6 passed, 0 failed |
| Approval workflow | PASS: 9 passed, 0 failed; disposable approver retired |
| Step 15 live security/storage/realtime | PASS: 77 passed, 0 failed, including private signed-document access and tenant-scoped device Realtime |
| Step 16 concurrency/idempotency | PASS: 7 passed, 0 failed; new debit/credit delta exact and historical all-status exception count unchanged |
| Step 17 isolated reconciliation | PASS: 10 entries, 25 lines, base debit = credit = `18003.08` |
| Money accounts/transfers | PASS: 22 passed, 0 failed; 94 posted entries and zero imbalance in the owner audit RPC |
| Team/invitations | PASS: 7 passed, 0 failed; scoped invitation cancelled and temporary MFA removed |
| Authenticated seven-role Chromium | PASS: 9 passed, 0 failed across all seven roles, tenant scope, MFA state, and duplicate-command handling |
| Acceptance cleanup | PASS: both automation-only compliance rules retired; CNY restored; no feature-test residue |
| Production build | PASS: 56.41 KB gzip initial shell + 96.78 KB gzip lazy application route; 23.42 KB gzip total CSS |
| Repository bundle gate | PASS: 196.9 KB raw initial JavaScript against the 500 KB limit; exports remain lazy |
| Interactive browser inspection | PASS: six-family entry, exact receivable route, direct Debt settlement, partner-bound Hawala settlement, Hawala scan control, and delegated Business Administrator FX route |
| Vercel implementation preview | PASS: commit `89cacc0` is Ready and loaded successfully at immutable deployment `sarafi-o03j7eqi8-sarafi.vercel.app` |
| Supabase Edge Function | PASS: `private-document-url` version 1 is ACTIVE with JWT verification |
| Git whitespace validation | PASS |

The immediate workspace JavaScript and CSS budgets remain below the v6 limits of 170 KB and 35 KB gzip. The application route and export implementation are separate lazy-loaded chunks.

The all-status Step 16 fixture baseline contained four immutable historical exceptions created on 2026-08-27, each with only a very small decimal difference. Step 16 proved that no new exception was introduced and that the count remained unchanged. The separately scoped posted-entry audit subsequently reported 94 posted entries and zero imbalance. The historical evidence is retained rather than hidden or rewritten.

## Evidence still required before any 100%, premium, complete, or production-ready claim

1. Apply every migration from zero in an isolated Supabase project, run database lint, and execute test queries that prove trigger, RPC, RLS, journal, receipt, audit, concurrency, and rollback behavior. Linked forward application and reconciliation are complete, but they do not replace this clean-room gate.
2. Run the already-passing authenticated security and seven-role suites in protected release CI and retain its browser/PDF/screenshot/trace artifacts.
3. Complete the recorded Afghan participant task study, including the >=90% first-time Buy/Sell selection target and <=25-second trained Cashier target.
4. Obtain native Afghan Dari and Pashto sign-off for desktop, 390 px mobile, receipts, mixed-direction numbers, and A4 PDF output.
5. Pass physical 58 mm, 80 mm, and A4 printer checks.
6. Approve the compliance rules and sanctions-screening provider with the responsible legal/compliance owners.
7. Perform a real provider backup/PITR restore into an isolated target and reconcile exact ledger balances against approved RPO/RTO.
8. Create and verify a signed release tag, run protected release CI, deploy the exact artifact, verify production CSP/HSTS/permissions/caching/proxy behavior, and retain source/deployment/rollback attestation.

## Promotion path

The `.github/workflows/release.yml` workflow is the only approved promotion path for this release candidate. It fails closed when any required fixture, credential, evidence reference, signed tag, database reset/lint, authenticated journey, deployment, or smoke check is absent.

Until all eight independent items are complete, the truthful final status is: **v6 source correction implemented and locally verified; real-money production certification remains blocked by external acceptance evidence.**
