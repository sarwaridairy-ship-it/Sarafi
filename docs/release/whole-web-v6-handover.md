# SARAFI whole-web v6 handover

Date: 2026-09-09 (Asia/Kabul)

Branch: `codex/whole-web-v6`

Starting commit: `1e50c13fc72a632447e279d8f9071d318e4d00c8`

Verified implementation commit: `e1964ad171199b891c7662f7ae01534d46ef31ff`

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

## Forward migrations and linked database state

1. `20260906190754_calm_premium_capabilities.sql`
2. `20260907121336_whole_project_integrity_v5.sql`
3. `20260908104812_whole_web_v6_reporting_compliance_evidence.sql`
4. `20260908110000_hawala_event_types_v6.sql`
5. `20260908110100_hawala_evidence_v6.sql`
6. `20260908221542_repair_hawala_v6_function_lint.sql`

All six forward migrations were transaction-preflighted against the linked schema and applied to linked Supabase project `vbvwuqzqtcorassvotke` on 2026-09-09. A post-apply forward repair corrects the two Hawala function findings reported by database lint without rewriting migration history. The linked migration list is current, a subsequent dry run reports no pending migration, and linked database lint reports no schema errors.

Before application, a sanitized public-schema JSON recovery snapshot and exact ledger invariants were captured outside version control. Post-application reconciliation retained 12 organizations, 192 financial events, 192 journal entries, 439 journal lines, equal base debit and credit totals of `346214812.233108307506`, and ledger hash `49ca3d0e68b99117907acaa78080a0fc`. This is migration and reconciliation evidence, not a provider backup/PITR restore drill.

## Verification completed in this workspace

| Gate | Result |
| --- | --- |
| TypeScript | PASS |
| Lint | PASS |
| Unit/static contracts | PASS: 116 passed, 2 environment-dependent skipped |
| PostgreSQL transaction preflight | PASS: all six pending forward migrations against the linked schema |
| Linked Supabase migration application | PASS: all six pending forward migrations applied; remote dry run is current |
| Linked database lint | PASS: no schema errors after the Hawala repair migration |
| Live ledger reconciliation | PASS: record counts, exact debit/credit totals and ledger hash unchanged |
| Production build | PASS: 56.41 KB gzip initial shell + 96.78 KB gzip lazy application route; 23.42 KB gzip total CSS |
| Repository bundle gate | PASS: 196.9 KB raw initial JavaScript against the 500 KB limit; exports remain lazy |
| Interactive browser inspection | PASS: six-family entry, exact receivable route, direct Debt settlement, partner-bound Hawala settlement, Hawala scan control, and delegated Business Administrator FX route |
| Focused Chromium objective bodies | All 17 reached completion with no reported assertion failure; Windows runner cleanup hung, so a clean suite exit is not claimed |
| Vercel implementation preview | PASS: commit `e1964ad` is Ready at immutable deployment `sarafi-kq0lhry0g-sarafi.vercel.app` |
| Git whitespace validation | PASS |

The immediate workspace JavaScript and CSS budgets remain below the v6 limits of 170 KB and 35 KB gzip. The application route and export implementation are separate lazy-loaded chunks.

## Evidence still required before any 100%, premium, complete, or production-ready claim

1. Apply every migration from zero in an isolated Supabase project, run database lint, and execute test queries that prove trigger, RPC, RLS, journal, receipt, audit, concurrency, and rollback behavior. Linked forward application and reconciliation are complete, but they do not replace this clean-room gate.
2. Run the authenticated security and seven-role browser suites with real disposable Owner, Business Administrator, Manager, Cashier, Accountant, Compliance Officer, and Viewer fixtures. Retain the CI artifacts.
3. Complete the recorded Afghan participant task study, including the >=90% first-time Buy/Sell selection target and <=25-second trained Cashier target.
4. Obtain native Afghan Dari and Pashto sign-off for desktop, 390 px mobile, receipts, mixed-direction numbers, and A4 PDF output.
5. Pass physical 58 mm, 80 mm, and A4 printer checks.
6. Approve the compliance rules and sanctions-screening provider with the responsible legal/compliance owners.
7. Perform a real provider backup/PITR restore into an isolated target and reconcile exact ledger balances against approved RPO/RTO.
8. Create and verify a signed release tag, run protected release CI, deploy the exact artifact, verify production CSP/HSTS/permissions/caching/proxy behavior, and retain source/deployment/rollback attestation.

## Promotion path

The `.github/workflows/release.yml` workflow is the only approved promotion path for this release candidate. It fails closed when any required fixture, credential, evidence reference, signed tag, database reset/lint, authenticated journey, deployment, or smoke check is absent.

Until all eight independent items are complete, the truthful final status is: **v6 source correction implemented and locally verified; real-money production certification remains blocked by external acceptance evidence.**
