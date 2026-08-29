# Production Readiness

## Stage 1 status

- [x] Typed web foundation
- [x] Responsive owner dashboard slice
- [x] Local new-trade interaction
- [x] Build and lint pass
- [x] Secret-safe environment template
- [x] Initial architecture and threat notes

## Current production environment — 2026-08-29

The repository is linked to GitHub, the production Vercel project, and Supabase project `vbvwuqzqtcorassvotke`. Local and remote migration history match through `20260829063603`; linked schema lint passes with no errors. The public web application is live at `https://sarafi-swart.vercel.app/`. Remaining release gates are authenticated human UAT, qualified Dari/Pashto review, Afghan legal/compliance sign-off, and provider backup/restore evidence—not repository linking or migration reconciliation.

## Stage 2 status

- [x] Immutable multi-currency ledger migration
- [x] Tenant-scoped RLS policies
- [x] Decimal weighted-average FX costing
- [x] Atomic/idempotent posting contract
- [x] Reversal model preserving original history
- [x] Opening balance domain support
- [x] Cross-currency trade domain support
- [x] Six focused ledger tests pass
- [x] Apply migrations to the supplied Supabase project and pass live schema lint

## Stage 3 status

- [x] Expanded organization roles: owner, manager, accountant, cashier, viewer, compliance officer
- [x] Branch and cashbox access model
- [x] Approval requests with expiry, decision reason, audit event, and self-approval denial
- [x] Device registry with trusted/untrusted/revoked state
- [x] Security audit event model
- [x] Browser-safe Supabase client boundary
- [x] Four access-control tests plus two Supabase configuration tests
- [ ] Configure Supabase Auth email verification, password reset, and TOTP MFA in the live project
- [ ] Run authenticated cross-tenant RLS, approval RPC, device revocation, and Realtime integration tests

## Stage 4 status

- [x] Quick actions for all core daily workflows
- [x] Buy, sell, and cross-currency exchange domain commands
- [x] Partial debt creation and settlement model
- [x] Cashbox transfer and bank movement commands
- [x] Expense, income, owner investment, and withdrawal commands
- [x] Stable multilingual-ready receipt references
- [x] Feature-flagged Hawala send workflow
- [x] Daily operations persistence migration with tenant RLS
- [x] 20 local domain tests and browser trade journey pass
- [x] Connect all operation forms to authenticated Supabase RPC calls
- [x] Run live ledger reconciliation and end-to-end SQL tests after migrations are applied

## Stage 5 status

- [x] Authorized rate-board and historical-rate persistence model
- [x] Retail, wholesale, VIP, and branch override fields
- [x] Decimal two-way rate calculator
- [x] Weighted-average cost and partial-sale valuation logic
- [x] Separate realized profit and unrealized valuation change
- [x] Native position and location-balance views
- [x] Valuation rate sets and rebuildable daily snapshots
- [x] Owner-facing rate board and native balance surface
- [x] 25 local tests including randomized cost-basis invariants
- [x] Connect rate/valuation screens to authenticated Supabase queries and RPCs
- [ ] Run live snapshot, negative-inventory, and reporting reconciliation tests

## Stage 6 status

- [x] English, Afghanistan Dari, and Pashto translation resources
- [x] Translation key coverage tests for all shipped resource keys
- [x] Document-level RTL direction switching for Dari and Pashto
- [x] Decimal and direction-safe calculator preserved in the cashier surface
- [x] Explicit online/offline and stale/degraded-mode status messaging
- [x] Encrypted identity-bound offline draft model
- [x] No automatic offline financial replay
- [x] Conflict preservation without false posted status
- [x] Tenant and role-scoped global search model
- [x] Offline draft storage with tenant/user/device binding
- [x] 31 local tests and browser journey pass
- [ ] Persist encrypted outbox in IndexedDB/mobile SQLite with OS-secure key storage
- [x] Retire authoritative offline sync; online financial posting remains server-idempotent
- [ ] Complete native speaker localization review and full-screen string extraction
- [ ] Measure launch/network performance budgets on target Android hardware

## Stage 7 status

- [x] Ledger-derived report builders and profit summaries
- [x] Cashbox close and explicit per-currency variance model
- [x] Trial balance and realized-profit reporting views
- [x] Report export audit model and CSV export with metadata
- [x] Notification preferences and organization/user/type deduplication
- [x] Live Business owner control strip
- [x] Reconciliation, export, notification, and report tests
- [x] Apply migration and verify report views against live ledger data
- [ ] Connect Realtime events, push delivery, and reconnect/refetch behavior
- [x] Add PDF and thermal receipt generation with export authorization checks
- [x] Add report filters and counterparty running statements to live screens

## Stage 8 status

- [x] Official DAB and FinTRACA source review attempted and limitations documented
- [x] Versioned, configurable compliance rule sets
- [x] KYC profile and restricted identity-document model
- [x] Compliance alerts/cases with human review workflow
- [x] Pluggable sanctions-screening boundary that fails closed when unconfigured
- [x] Compliance report/submission reference fields
- [x] Append-only audit checkpoints with hash-chain support
- [x] Private storage bucket with MIME and size restrictions
- [x] CSP and browser security headers
- [x] Stage 8 migration applied to live Supabase and schema lint passes
- [x] 39 local tests, E2E, build, lint, and dependency audit pass
- [ ] Afghan compliance/legal professional verifies current DAB/FinTRACA materials, thresholds, forms, and retention
- [ ] Configure an approved live sanctions provider
- [ ] Configure provider backups/PITR, object backup, RPO/RTO, and complete a staging restore drill
- [ ] Run live authenticated security/RLS, upload abuse, rate-limit, and audit tamper tests

## Stage 9 status

- [x] Unit, domain, permission, validation, costing, reporting, and localization tests
- [x] Randomized accounting invariant and replay tests
- [x] Offline draft, legacy queue, encryption, and no-auto-replay tests
- [x] Security regression tests for browser secret boundaries
- [x] Browser E2E trade journey
- [x] Browser RTL/Dari and mobile-width matrix
- [x] Synthetic 5,000-entry report performance budget test
- [x] UAT guide covering owner, manager, cashier, accountant, reconciliation, exports, and offline flow
- [x] Typecheck, build, lint, dependency audit, and live Supabase schema lint pass
- [ ] Live authenticated RLS matrix with multiple test users; fresh MFA and approval sub-gates pass, full manifest consolidation remains
- [x] Live concurrency/TOCTOU and RPC replay tests against two same-tenant cashiers; 7/7 checks passed and report retained in [step-16-live-report-20260828.json](../audits/step-16-live-report-20260828.json) ([procedure](../audits/step-16-concurrency.md))
- [ ] Backup restore drill and migration rollback/forward test; use the executable [Step 17 recovery procedure](../audits/step-17-recovery-drill.md)
- [x] Reconcile local and remote migration history; all versions match through `20260829063603`
- [ ] Human Afghan Dari/Pashto terminology and device UAT sign-off
- [ ] Android/iOS device matrix and realistic network performance evidence

## Stage 10 status

- [x] Manual release workflow with protected production promotion gate
- [x] CI smoke command covering typecheck, lint, unit tests, E2E, and build
- [x] PWA manifest and production service-worker shell
- [x] Final production verification scorecard
- [x] Monitoring and incident response runbook
- [x] Live Supabase migration list and schema lint evidence
- [x] Production dependency audit clean
- [x] Public web hosting/domain/TLS deployment
- [ ] Provider backup/PITR and restore-drill evidence; reconciliation runner is available but provider restore is still required
- [ ] Authenticated production smoke test
- [ ] Signed Android/iOS builds and store release
- [ ] Human UAT and legal/compliance sign-off

## Stage 11 status

- [x] Initial app shell stays under the 500 KB budget and large report export code is lazy-loaded
- [x] Service worker never falls back to cached navigation or financial/auth responses
- [x] CSV import templates, dry-run validation, duplicate detection, and Decimal totals
- [x] User-facing CSV import preview with row-level errors, totals, and non-mutating dry run
- [ ] 3G/low-memory/50k-transaction device evidence and full PWA reconnect matrix
- [x] User-facing import confirmation and tenant-scoped authoritative commit implementation
- [x] Authenticated report export uses the active tenant and reconciliation reads posted entries with Decimal arithmetic
- [x] Transfer and bank movement RPC semantics preserve source/destination asset locations
- [ ] Native mobile package only after web/PWA acceptance

## Inventory completion status

- [x] Required tenancy, identity, ledger, operations, people, costing, reconciliation, workflow, offline, compliance, and Hawala entities represented in the deployed schema
- [x] Explicit inventory mapping documented in [domain-inventory.md](../architecture/domain-inventory.md)
- [x] Migrations `202608240010` and `202608240011` applied to linked Supabase
- [x] Live Supabase schema lint passes after inventory deployment
- [x] Dedicated UI workspaces for daily operations, money locations, people, debts, transactions, rates, reports, reconciliation, team/devices, settings, compliance, import, and Hawala
- [ ] Authenticated live human-UAT evidence for every role and inventory capability

## Live integration closure

- [x] Owner dashboard read model deployed as `get_owner_dashboard` and wired to the authenticated client
- [x] Dashboard refreshes from authoritative Supabase state after successful posting
- [x] Placeholder branch/cashbox IDs removed from financial posting
- [x] Anonymous live organization/RPC security regression tests pass
- [x] Production vendor chunk split reduced initial bundle to approximately 312 KB
- [x] Provision controlled multi-user identities for authenticated concurrency evidence; Step 16 runner and fixture report are retained
- [x] Complete operation-form live adapters
- [ ] Complete authenticated production owner/cashier dashboard smoke and human UAT journey

## Professional web completion — 2026-08-29

- [x] Calm production visual system replaces prototype/neon presentation
- [x] Consistent professional controls, tables, cards, empty states, focus styles, and semantic icons
- [x] Desktop More menu is contained, scrollable, and fully reachable at 768px height
- [x] Data-backed Settings workspace; preview mode never invents shop values
- [x] Data-backed Compliance control workspace; approval/provider/queue state is never guessed
- [x] Immediate post-trade success receipt with stable materialized receipt lookup and 58/80 mm printing
- [x] Controlled English, Dari, and Pashto desktop/mobile screenshot matrix includes Settings and Compliance
- [x] 360px, 390px, 430px, 768px, 1366px, and 1440px no-overflow checks
- [ ] Qualified native-speaker Dari/Pashto sign-off
- [ ] Authenticated human UAT and Afghan legal/compliance sign-off
