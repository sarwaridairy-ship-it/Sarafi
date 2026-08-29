# SARAFI Professional Web Completion Audit

**Date:** 2026-08-29

**Production target:** `https://sarafi-swart.vercel.app/`

**Source scope:** The two supplied SARAFI production/master command documents plus the existing repository, linked Supabase project, and live web deployment.
**Explicit exclusion:** Offline requirements. Native packaging is a separate release artifact and is not represented as complete in this web audit.

## Release statement

The web implementation is complete for automated engineering acceptance and professional presentation. It must not be described as final human/regulatory acceptance until the named external gates below are signed off.

## Requirement ledger

| Area | Status | Evidence |
|---|---|---|
| Professional product presentation | PASS | Calm green/gold visual system, semantic SVG icons, consistent controls, focus states, tables, cards, empty states, modals, desktop/mobile layouts |
| Role-based navigation | PASS | Owner, manager, accountant, cashier, compliance officer, and viewer controls remain role-scoped; desktop More menu is contained and scrollable |
| Buy, sell, exchange and daily cash operations | PASS | Authoritative authenticated RPC adapters, review-before-post interaction, online/role/branch/cashbox validation |
| Authoritative receipt journey | PASS | Posted journal entry is followed by materialized receipt lookup; user receives stable reference plus 58/80 mm print actions |
| Owner dashboard / Where is My Money | PASS | Ledger-derived owner read model, locations, positions, review queue, privacy mode, live refresh and evidence drill-down |
| People, statements and debts | PASS | Search, per-currency receivable/payable separation, document access, statements, debt creation and settlement |
| Transactions, reports and exports | PASS | Transaction history, corrections, filters, CSV/PDF/A4/thermal/WhatsApp paths and export authorization record |
| Branches, cashboxes and reconciliation | PASS | Active branch/cashbox resolution, opening money, counts, variances, close/approval workflow and location semantics |
| Team, devices and approvals | PASS | Memberships, role state, MFA requirement display, registered devices and approval inbox |
| Settings | PASS | Data-backed organization settings, cash rule, receipt prefix, timezone, enabled services and security context; preview never invents values |
| Compliance control | PASS (engineering) | Data-backed profile/rule set, provider boundary, alert/case counts and fail-closed language; preview never invents approval/provider/queue state |
| English, Dari, Pashto and RTL | PASS (automated) | Semantic translation checks and controlled desktop/mobile visual matrix; no protected-screen English leakage in Dari/Pashto |
| Accessibility | PASS (automated) | Keyboard navigation, focus trap/restore, reduced motion, visible focus and axe critical/serious checks |
| Supabase tenancy and schema | PASS | Local/remote migrations match through `20260829063603`; linked schema lint has no errors; tenant RLS and scoped RPCs are deployed |
| Security headers and browser secrets | PASS | CSP/frame/content-type/permissions headers, no service-role key in browser code, private document boundary |
| Import and onboarding | PASS | Guided business setup, CSV templates, dry run, row errors, duplicate checks, totals, confirmation and tenant-scoped commit |
| Performance | PASS (automated web budget) | Lazy report/export bundle, initial shell budget, constrained-connection and report-volume checks |
| Offline | EXCLUDED | Explicitly excluded by the user from this completion pass |
| Native Android/iOS packaging | SEPARATE | Deferred release artifact; no web-completion claim is used to imply signed native packages |

## External acceptance gates

These are not code defects and cannot honestly be converted into a software-only “100%” claim:

1. Authenticated owner, manager, cashier, accountant, and compliance-officer human UAT with representative business data.
2. Qualified Afghanistan Dari and Pashto speaker review on real devices.
3. Qualified Afghan legal/compliance approval of current DAB/FinTRACA sources, thresholds, forms, retention, and submission workflow.
4. Business selection/configuration of an approved sanctions-screening provider.
5. Provider backup/PITR confirmation and a witnessed staging restore drill.
6. Supabase leaked-password protection activation if the project is on a Pro-or-higher plan; the linked advisor currently reports it disabled.

## Verification artifacts

- Controlled screenshots: `test-results/web-ux-production/`
- Production readiness ledger: `docs/release/production-readiness.md`
- Final release scorecard: `docs/release/final-production-verification.md`
- Security and recovery procedures: `docs/audits/`
