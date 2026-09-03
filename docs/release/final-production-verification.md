# SARAFI Final Production-Web Verification

**Candidate:** repository `E:\New folder`

**Verification date:** 2026-09-03

**Supabase project:** `vbvwuqzqtcorassvotke`

**Canonical web URL:** `https://sarafi-swart.vercel.app/`

**Release boundary:** web only; authoritative offline posting and native Android/iOS packages are deferred.

## Decision

**GO for the engineering-controlled production-web scope.** There is no known open software blocker in the agreed web scope. The final global business launch still requires the external sign-offs listed below.

## Executable evidence

| Check | Result |
| --- | --- |
| TypeScript | PASS |
| Lint | PASS, no warnings |
| Unit/domain tests | 71 passed, 2 intentionally skipped, 0 failed |
| Browser E2E | 198 passed, 18 intentionally environment-gated, 0 failed |
| Browser engines | Chromium, Firefox and WebKit |
| Accessibility | No critical or serious automated violations in the tested public workspace and transaction dialog |
| Responsive layouts | PASS at 360, 390, 430, 768, 1366 and 1440 px; no page-level horizontal overflow |
| Consolidated live security | 74 passed, 0 failed |
| Dedicated MFA | 6 passed, 0 failed |
| Dedicated approval | 9 passed, 0 failed |
| Concurrency/idempotency | 7 passed, 0 failed |
| Money accounts/transfers | 22 passed, 0 failed |
| Team/invitations | 7 passed, 0 failed |
| Premium roles/settings/billing | 23 passed, 0 failed |
| Master web controls | PASS; 22 named reports; owner/control/MFA denials verified |
| Journal reconciliation | Balanced in base currency; no imbalanced entry found |
| Production build | PASS |
| Initial JavaScript budget | 470.5 KB / 500 KB; PASS |
| Export loading | Report/PDF/XLSX implementation remains lazy-loaded |
| Service worker | Navigation, authentication and financial requests are network-only |
| Production dependency audit | 0 known vulnerabilities |
| Tracked secret-value scan | No matching tracked value pattern |
| Linked database schema lint | No schema errors |
| Migration reconciliation | Local and remote match through `20260903120108` |

## Completed product scope

- Premium, simple EN/Afghan-Dari/Pashto workspace with RTL, mobile opening animation, reduced-motion behavior, local terms and clear empty/error states.
- Owner onboarding, world-currency selection, branches, cashboxes, stable money accounts, opening balances and multi-business context.
- Six organization roles with server-enforced permissions, branch/cashbox scopes, invitations, trusted devices, revocation, MFA and owner/manager approvals.
- Buy, sell, direct cross-currency exchange, receive, pay, debt/payment, account transfer, expense, income, owner capital/withdrawal, bank movement, opening money, Hawala and correction/reversal workflows.
- Immutable, tenant-scoped, idempotent double-entry ledger with cost basis, AFN carrying values, profit/commission/expense separation and exact balance audit.
- Compact “Where is my money?” location/currency views, human account names, transaction source/destination evidence and customer statements.
- Rates, rate groups, history, valuation sets and explicit exchange-rate calculation.
- Twenty-two reports with paging, CSV, genuine XLSX, localized PDF, A4, 58/80 mm, WhatsApp and export history.
- Cashbox reconciliation with counted amounts, variance reason, owner/manager decision, self-approval denial and decision history.
- KYC review, compliance alerts/cases, submission references, private documents and a fail-closed sanctions-provider boundary.
- Owner billing and a separate platform-administrator area for organizations, payments, providers, plans, health, versions/notices, feature entitlements, safe support and security history.

## External gates that engineering cannot certify

1. Qualified Afghan legal/compliance approval of current DAB/FinTRACA rules, forms, thresholds and retention.
2. Contract, credentials and acceptance for an approved sanctions/name-screening provider.
3. Merchant approval, production checkout/webhook credentials and settlement sign-off for a hosted payment provider. Manual review remains the safely active method.
4. Supabase project-owner confirmation of backup/PITR retention and an isolated restore drill with recorded RPO/RTO.
5. Signed owner/manager/cashier/accountant/compliance human UAT and qualified Afghan Dari/Pashto terminology review.
6. Physical 58/80 mm printer acceptance on the business’s actual hardware.
7. Authoritative offline posting and native Android/iOS package/store work, explicitly deferred to the later phase.

## Claim

The defensible statement is: **“100% of the agreed production-web implementation and automated verification under engineering control is complete.”**

It is not defensible to claim that legal, provider, recovery, hardware, human-UAT, offline or native-app acceptance has been completed by engineering.
