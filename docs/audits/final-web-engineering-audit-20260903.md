# SARAFI Final Web Engineering Audit

**Date:** 2026-09-03

**Production target:** `https://sarafi-swart.vercel.app/`

**Source scope:** `SARAFI_0_to_100_Master_Production_Build_Command.pdf`, the repository, linked Supabase project, and the deployed Vercel web product.
**Explicitly deferred by the product owner:** authoritative offline posting and native Android/iOS packaging.

## Decision

The implementation and automated verification that can be completed by engineering for the agreed web scope are complete. The web candidate is ready for production deployment.

This is not a substitute for legal certification, provider contracts, a provider-managed restore drill, or signed human UAT. Those external acceptance gates remain listed below and must not be described as completed without their owners' evidence.

## Completed web scope

| Area | Result | Evidence |
| --- | --- | --- |
| Entry and onboarding | PASS | Opening story/animation, skip and reduced-motion behavior, language selection, owner sign-up, shop/branch/cashbox/currency onboarding |
| Roles and team | PASS | Owner, manager, accountant, cashier, compliance officer, and viewer presentation; scoped invitation and device controls; AAL2 owner gate |
| Financial foundation | PASS | Server-authoritative, idempotent, immutable double-entry posting and reversal model; exact live journal audit balanced across 45 entries |
| Daily work | PASS | Buy, sell, exchange, receive, pay, debts, transfers, expenses, income, owner capital, bank movement, opening money, Hawala, close and reconciliation |
| Money accounts | PASS | Stable named accounts, visible source/destination, account-to-account transfer, evidence drill-down, safe empty/summary states |
| Currencies and rates | PASS | Organization currency controls and world-currency catalog; bid/ask rates, calculator, rate history, AFN book-value validation |
| Transactions and reports | PASS | Human-readable history, correction/reversal request, 22 permission-aware report families, 25-row paging, date/status/currency filters, CSV/XLSX/PDF/A4/58 mm/80 mm/WhatsApp, visible export history |
| Search and notifications | PASS | Global people/account/transaction search; role-triggered in-app notifications; read/dismiss actions; per-user preferences enforced by the database trigger |
| Settings | PASS | Owner-editable language, timezone, receipt prefix, and negative-cash rule; non-owner read-only view; sensitive rule change requires AAL2 |
| Compliance workspace | PASS WITH EXTERNAL CONFIGURATION | Versioned rule/profile status, alerts, cases, provider state, fail-closed screening boundary; no fabricated legal approval |
| Billing and platform administration | PASS WITH PROVIDER CONFIGURATION | Owner billing portal, plans, manual payment request/history, separate MFA administrator gate, business/user suspension, payment review, provider state, versions/notices, feature entitlements, diagnostics, safe support, and administrator audit history |
| Localization and simplicity | PASS FOR ENGINEERING REVIEW | English, Afghan Dari, and Pashto; RTL; local terms; no internal feature codes in local UI; guided help; clear role and empty/error states |
| Responsive and accessible UI | PASS | Keyboard/focus checks, no critical/serious automated accessibility findings, and no horizontal overflow at 360, 390, 430, 768, 1366, and 1440 px |
| Security and tenancy | PASS FOR AUTOMATED ENGINEERING ACCEPTANCE | RLS, restricted RPC grants, cross-tenant denial, role denial, AAL2 gates, device validation, anonymous denial, CSP/security headers, private documents, and fail-closed provider boundaries |

## Final verification evidence

- Browser matrix: **198 passed, 18 intentionally skipped, 0 failed** across Chromium, Firefox, and WebKit. The intentional skips are environment/scope-specific; corresponding live role and security APIs were verified separately, while offline remains explicitly deferred.
- Unit/domain suite: **71 passed, 2 intentionally skipped, 0 failed**.
- Consolidated live security suite: **74 passed, 0 failed**, including tenant isolation, roles, devices, approvals, MFA, storage, Realtime and fixture restoration.
- Dedicated MFA certificate: **6 passed, 0 failed**; dedicated approval certificate: **9 passed, 0 failed**.
- Live concurrency/idempotency acceptance: **7 passed, 0 failed**.
- Live premium web acceptance: **23 passed, 0 failed**.
- Live money-account/ledger acceptance: **22 passed, 0 failed**; exact journal audit balanced.
- Live team and invitation acceptance: **7 passed, 0 failed**, including AAL2 enforcement.
- TypeScript, lint, production build, and browser visual/error-overlay checks: **PASS**.
- Dependency audit: **0 known production vulnerabilities**.
- Linked Supabase migration history: matched through `20260903120108`.
- Linked Supabase schema lint: **no schema errors**.
- Main application JavaScript: **470.5 KB** before gzip, under the 500 KB shell budget; report/PDF/Excel code remains lazy-loaded.

## External acceptance gates

These are not software defects and cannot be truthfully completed by code alone:

1. A qualified Afghan legal/compliance professional must approve current DAB/FinTRACA rules, thresholds, forms, retention, and operating procedures.
2. The business must contract and configure an approved sanctions/name-screening provider before screening-dependent workflows can be enabled.
3. A hosted payment provider requires merchant approval, production credentials, checkout URL, webhook verification, settlement reconciliation, and provider sign-off. Manual-review payment remains the only safely active method until then.
4. The Supabase project owner must confirm backup/PITR retention and complete an isolated restore drill with recorded RPO/RTO evidence.
5. Afghan owner, manager, cashier, accountant, and compliance users must sign the human UAT and native-language terminology review; physical 58/80 mm printer output must be accepted on target hardware.
6. Native Android/iOS packaging and authoritative offline work remain deferred to the separately requested phase.

## Claim boundary

Engineering may state: **“100% of the agreed web implementation and automated verification under our control is complete.”**

Engineering must not state: **“All legal, provider, disaster-recovery, hardware, human-language, offline, and native-app acceptance is complete.”**
