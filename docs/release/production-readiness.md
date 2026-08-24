# Production Readiness

## Stage 1 status

- [x] Typed web foundation
- [x] Responsive owner dashboard slice
- [x] Local new-trade interaction
- [x] Build and lint pass
- [x] Secret-safe environment template
- [x] Initial architecture and threat notes

## Remaining blocker

The repository is not yet linked to the Supabase or GitHub remotes because their URLs and project credentials are not present in this workspace. No credential or fake connection is being committed. The next production step is to populate local `.env` from the actual Supabase project and create the first migration/RLS test suite.

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
- [ ] Connect all operation forms to authenticated Supabase RPC calls
- [ ] Run live ledger reconciliation and end-to-end SQL tests after migrations are applied

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
- [ ] Connect rate/valuation screens to authenticated Supabase queries and RPCs
- [ ] Run live snapshot, negative-inventory, and reporting reconciliation tests

## Stage 6 status

- [x] English, Afghanistan Dari, and Pashto translation resources
- [x] Translation key coverage tests for all shipped resource keys
- [x] Document-level RTL direction switching for Dari and Pashto
- [x] Decimal and direction-safe calculator preserved in the cashier surface
- [x] Explicit online/offline and pending-sync status messaging
- [x] Assigned-device/cashbox offline policy model with limits
- [x] Deterministic offline command sequence and unique command IDs
- [x] Conflict preservation without false posted status
- [x] Tenant and role-scoped global search model
- [x] Offline policy/queue Supabase migration with RLS
- [x] 31 local tests and browser journey pass
- [ ] Persist encrypted outbox in IndexedDB/mobile SQLite with OS-secure key storage
- [ ] Wire authenticated offline sync to authoritative RPCs and test reconnect against Supabase
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
- [ ] Apply migration and verify report views against live ledger data
- [ ] Connect Realtime events, push delivery, and reconnect/refetch behavior
- [ ] Add PDF/XLSX generation and authorized signed export delivery
- [ ] Add full report filters and counterparty running statements to live screens

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
- [x] Offline sync/conflict tests
- [x] Security regression tests for browser secret boundaries
- [x] Browser E2E trade journey
- [x] Browser RTL/Dari and mobile-width matrix
- [x] Synthetic 5,000-entry report performance budget test
- [x] UAT guide covering owner, manager, cashier, accountant, reconciliation, exports, and offline flow
- [x] Typecheck, build, lint, dependency audit, and live Supabase schema lint pass
- [ ] Live authenticated RLS matrix with multiple test users
- [ ] Live concurrency/TOCTOU and RPC replay tests against two cashiers
- [ ] Backup restore drill and migration rollback/forward test
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
- [ ] Public web hosting/domain/TLS deployment
- [ ] Provider backup/PITR and restore-drill evidence
- [ ] Authenticated production smoke test
- [ ] Signed Android/iOS builds and store release
- [ ] Human UAT and legal/compliance sign-off

## Inventory completion status

- [x] Required tenancy, identity, ledger, operations, people, costing, reconciliation, workflow, offline, compliance, and Hawala entities represented in the deployed schema
- [x] Explicit inventory mapping documented in [domain-inventory.md](../architecture/domain-inventory.md)
- [x] Migrations `202608240010` and `202608240011` applied to linked Supabase
- [x] Live Supabase schema lint passes after inventory deployment
- [ ] Dedicated UI routes and authenticated live forms for every inventory capability
