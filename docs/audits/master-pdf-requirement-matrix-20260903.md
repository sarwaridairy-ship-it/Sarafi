# SARAFI Master PDF Requirement Matrix

**Reviewed:** 2026-09-03

**Source:** `SARAFI_0_to_100_Master_Production_Build_Command.pdf` (45 pages, version dated 24 August 2026)

**Agreed release scope:** production web application. Authoritative offline posting and native Android/iOS packaging are explicitly deferred by the product owner.

## Completion rule

`PASS` means the repository, linked Supabase project, automated acceptance evidence, and browser review contain the required web capability. `EXTERNAL GATE` means engineering implemented the safe boundary, but a regulator, provider, project owner, hardware owner, or human reviewer must supply the final evidence. `DEFERRED` means the product owner deliberately moved that capability to a later prompt.

## Ten-stage matrix

| PDF stage | Web result | Implemented and verified |
| --- | --- | --- |
| 1. Foundation, architecture, repository, environments, design system | PASS | Existing repository preserved; typed React/Vite application; documented architecture, tenancy, threat model, environment validation, CI/release workflows, RTL/LTR design system, pinned new dependency, clean build/lint/typecheck, no tracked secret-value patterns. |
| 2. Immutable multi-currency ledger | PASS | Tenant-scoped, append-only financial events; balanced double-entry journal; stable accounts; idempotent commands; weighted-average FX inventory; opening capital; debts/settlements; transfers; reversals; constraints and journal audit. Live journal audit is balanced. |
| 3. Authentication, organizations, roles, approvals, devices | PASS | Email/password, reset and MFA screens; owner onboarding; six organization roles; branch/cashbox scopes; team invitations; trusted/untrusted/revoked devices; owner/manager approvals; self-approval and cross-tenant denial; AAL2 for sensitive controls; separate platform-administrator gate; time-limited owner-approved support access. |
| 4. Daily Sarafi operations | PASS | Buy, sell, direct cross-currency exchange, receive, pay, debt/credit, debt payment, transfer, expense, income, owner investment/withdrawal, bank deposit/withdrawal, opening money, Hawala, correction/reversal request, stable receipt, A4/PDF and 58/80 mm output. |
| 5. Rates, costing, profit, capital, position, valuation | PASS | Buy/sell rate board, rate groups, branch-aware rates, calculator, rate history, valuation rate sets, AFN carrying value, realized FX profit, commission, expenses, owner capital, currency positions, and a compact “Where is my money?” view with currency/location drill-down. |
| 6. Trilingual, RTL, search, receipt, mobile/desktop | PASS for web / DEFERRED offline authority | English, Afghan Dari, Pashto, RTL, localized financial wording, local date/digit preferences, responsive 360–1440 px layouts, keyboard/focus accessibility, global search, share/print/export, visible connection state, and fail-closed offline posting. Authoritative offline posting/storage and native secure storage are deferred. |
| 7. Dashboards, reports, reconciliation, notifications, exports | PASS | Role-specific dashboards; 22 named report families; 25-row paging; CSV, genuine XLSX, localized PDF, print, thermal and WhatsApp actions; export history; cashbox count/variance/review/history; approval queue; notifications and preferences; low-cash/operational settings. |
| 8. Compliance, security, privacy, backup/recovery | PASS for engineering controls / EXTERNAL GATES | Versioned configurable compliance profile, KYC review, alerts, cases, submission references, private documents, fail-closed screening provider boundary, RLS, restricted RPC grants, CSP/security headers, audit history, diagnostics, and recovery procedures. Afghan legal approval, live screening contract, provider backup/PITR confirmation, and isolated restore drill remain external. |
| 9. QA, accounting, security, performance, localization, UAT | PASS for automated engineering / EXTERNAL human UAT | 71 unit/domain tests pass; full browser matrix passes with zero failures; live tenant/RLS/MFA/device/approval/storage/realtime/concurrency/reconciliation suites pass; responsive and automated accessibility checks pass; shell performance budget passes. Native-language human terminology sign-off and role-based human UAT remain external. |
| 10. Production deployment, monitoring, documentation, handover | PASS for web release engineering / EXTERNAL operations | Ordered migrations applied, linked schema lint clean, release candidate built, dependency audit clean, deployment configuration and runbooks present, public health/status and administrator diagnostics implemented. Merchant/provider activation, legal sign-off, backup restore evidence, printer acceptance, and store packages are not software-only claims. |

## Required domain inventory

| PDF inventory family | Result | Capability evidence |
| --- | --- | --- |
| Tenancy and configuration | PASS | Organizations, settings, features, branches, currencies, organization currencies, rate groups, valuation rates, plans and subscriptions. |
| Identity and access | PASS | Profiles, memberships, branch/cashbox scope, invitations, devices, approvals, platform administrators, support requests/grants, security audit. |
| Accounting and financial events | PASS | Money/ledger accounts, financial events, journal entries/lines, command receipts, opening money, trades, transfers, income/expense, owner and bank movements, reversals. |
| People and obligations | PASS | Customers/counterparties, identity review, receivables/payables, settlements, statements, documents and risk fields. |
| Costing and position | PASS | FX inventory cost state, rate history, valuation rates, native positions, AFN carrying values and report views. |
| Reconciliation and workflow | PASS | Cashbox closes/lines, variance reasons, submitted/approved/rejected history, approval decisions and immutable evidence. |
| Compliance and audit | PASS with external provider/legal gates | Compliance profile/rules, alerts, cases, document access, provider state, append-only security/operation histories. |
| Platform operations | PASS | Organization/subscription controls, plan/payment review, provider state, app versions, maintenance/announcement publishing, feature entitlements, health metrics and diagnostics. |

## Minimum permission matrix

| Role | Verified web behavior |
| --- | --- |
| Owner | Full organization control, reports/profit/capital, team/devices, scoped approvals, rates, settings, reconciliation, billing and compliance when enabled. Sensitive actions require AAL2. |
| Manager | Operational and assigned-branch control, reports and approval capability allowed by server policy; no owner-only organization control plane. |
| Accountant | Reports, transactions and accounting review; cannot post money or manage customer/team/owner controls. |
| Cashier | Assigned cashbox daily actions, customer entry and transaction history; no owner settings, profit controls, team changes or self-approval. |
| Compliance officer | KYC, alerts, cases and compliance documents; no arbitrary financial mutation. |
| Viewer | Read-only permitted views; no financial posting or privileged configuration. |
| Platform administrator | Separate MFA gate; organizations, plans, payments, providers, health, versions, notices, feature entitlements and time-bounded support. No automatic transaction browsing. |

## Screen and workflow completeness

- Public/auth: opening animation, language selection, sign in, owner sign-up, password reset, MFA challenge, platform-admin sign-in, privacy/help.
- Onboarding: business, branch, cashbox, base/enabled world currencies, language and initial setup.
- Daily work: quick actions, trade/exchange, receipt, receive/pay, debts, transfer, expense/income, owner/bank movement, opening money and Hawala.
- Control: dashboard, money location, people/statements, transactions/correction, rates/valuation, reports/export history, reconciliation/decision history, team/invitations/devices, settings/security, billing and compliance.
- Platform: businesses, payments, providers, plans, system health, safe support, announcements/versions and security history.

## Definition-of-done outcome

All 13 PDF “real Saraf” web outcomes are implemented: business setup and starting money, scoped cashier access, fast FX including direct currency-to-currency exchange, live multi-device data, exact currency/location visibility, receivables/payables, real profit/commission/expense separation, internal cash transfer, cashbox close/variance review, correction without deletion, reports/exports, role/security controls, and understandable EN/Dari/Pashto responsive operation.

## Truthful release boundary

Engineering can claim: **100% of the agreed production-web implementation and automated verification under engineering control is complete.**

Engineering cannot replace the following evidence: Afghan legal/compliance approval, sanctions/payment provider contracts and credentials, backup/PITR restore execution by the project owner, physical printer acceptance, signed Afghan Dari/Pashto and role-based human UAT, authoritative offline posting, or native Android/iOS packages.
