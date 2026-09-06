# SARAFI Final Workflow Re-Audit and Release Record

Date: 2026-09-06  
Scope: supplied SARAFI premium/workflow re-audit documents, production web application, linked Supabase project, automated engineering acceptance, and Vercel production release  
Baseline commit: `5a74a146a8f401c10eddf7bc02ff71028ff669df`  
Production source commit: `1185fc94cbb0548835d92dc2a2b61ccdfb88cf77`  
Branch at implementation time: `main`  
Production URL: https://sarafi-swart.vercel.app  
Production deployment: `dpl_A9uSTZhpe5xsED4NEbEM1osxepSU` (`READY`, target `production`)  
Immutable deployment URL: https://sarafi-342o8attc-shafiullah-s-projects1.vercel.app  
Deployment inspector: https://vercel.com/shafiullah-s-projects1/sarafi/A9uSTZhpe5xsED4NEbEM1osxepSU

## Decision and claim boundary

All implementation, database, automated verification, visual-evidence, performance, and production-deployment work under engineering control for the supplied workflow prompt is complete.

This report does not convert external evidence into software evidence. The prompt's literal final acceptance remains dependent on signed human Dari/Pashto and role-based UAT, Afghan legal/compliance approval, provider contracts or credentials, physical-printer acceptance, and any separately requested native/offline release. Those gates are listed explicitly at the end.

## Source documents

The requirements were taken from, and checked against:

- `SARAFI_Full_Workflow_Reaudit_and_Calm_Premium_Master_Prompt (1).md` (primary and latest workflow command);
- `SARAFI_Current_State_Reaudit_and_Corrected_Master_Prompt_v2 (1).pdf`;
- `SARAFI_Premium_Reaudit_Master_Redesign_Prompt.pdf`.

The documents were treated as product requirements, not as authority to fabricate evidence or bypass repository, provider, security, or human-acceptance boundaries.

## Current-to-new route map

All routes are rooted at `/app/:organizationId`. The hosting rewrite now serves every nested `/app/:path*` route through the SPA entry point, so direct navigation and browser refresh are supported in production.

| Previous surface | Current route |
| --- | --- |
| Dashboard state | `/home` |
| Modal/launcher transaction entry | `/transactions/new` |
| Buy, Sell, Exchange | `/transactions/new/fx?side=BUY_FX`, `SELL_FX`, or `EXCHANGE_FX` |
| Opening money | `/transactions/new/opening-money` |
| Money in | `/transactions/new/money-in` |
| Money out | `/transactions/new/money-out` |
| Move money | `/transactions/new/move-money` |
| Debt entry | `/transactions/new/debt` |
| Hawala entry | `/transactions/new/hawala` |
| Correction launcher | `/transactions/new/correction` |
| Transaction history | `/transactions` |
| Transaction detail | `/transactions/:transactionId` |
| My Money | `/money` |
| Customers | `/customers` |
| Customer detail | `/customers/:customerId` |
| Activity | `/activity` |
| Cashbox close | `/cashbox-close` |
| Reports | `/reports` |
| Reconciliation | `/reconciliation` |
| Control center | `/control` |
| Today's rates | `/control/rates` |
| Team/devices | `/control/team` |
| Business settings | `/control/business` |
| Security | `/control/security` |
| Billing | `/control/billing` |
| Compliance | `/compliance` |
| Compliance case | `/compliance/cases/:caseId` |

## Stable role navigation and capabilities

Every role receives exactly five primary destinations. No generic More or hidden overflow navigation remains.

| Role | Five primary destinations | Posting/control posture |
| --- | --- | --- |
| Owner | Home; Make a Transaction; My Money; Activity; Control Center | Full business operations, ownership, security, billing and administration |
| Business administrator | Home; Make a Transaction; Customers; Activity; Manage Sarafi | Delegated operations, team, security and business control; ownership/billing remain owner-specific |
| Manager | Home; Make a Transaction; Cashboxes; Activity; Team | Financial posting, reconciliation, approvals and scoped team operations |
| Cashier | Home; Make a Transaction; Customers; My Activity; Close Cashbox | Assigned financial posting and cashbox work; no administration |
| Accountant | Home; Transactions; Reports; Debts; Reconcile | Reporting/reconciliation only; direct posting routes fail closed |
| Compliance officer | Home; Hawala; Reviews; Cases; Search | Compliance and review routes; no ordinary financial posting |
| Viewer | Home; Money; Transactions; Reports; Search | Read-only; financial entry controls and direct posting routes are denied |

The browser route gate and database permission checks use the same role set, including `business_admin`. A regression test now verifies the delegated administrator permissions in the TypeScript domain model, and live security acceptance verifies tenant/RLS/role enforcement.

## Retired architecture

The following sources were removed from the active implementation and protected by static regression gates:

- `showMoreNavigation` state and handlers in `src/App.tsx`;
- desktop and mobile More controls, including `mobile-more-menu`, in `src/App.tsx` and `src/App.css`;
- `activeNav === "Trade"` as the primary workflow authority;
- `showTrade` and the blocking daily-transaction modal architecture;
- duplicate navigation paths that required closing one workflow to discover another;
- the React-to-standalone-opening-page redirect; opening and authentication now hand off in the same application document.

The main daily transaction forms are full route-backed working surfaces. A secondary dialog remains only where it is semantically appropriate (for example a receipt/success interaction), not as the primary transaction-center architecture.

## Transaction-center inventory

The dedicated transaction center exposes these visible families without leaving or closing another workflow:

1. Buy currency;
2. Sell currency;
3. Exchange currency;
4. Receive money;
5. Pay money;
6. Transfer cash;
7. Expense;
8. Income;
9. Owner investment;
10. Owner withdrawal;
11. Bank deposit;
12. Bank withdrawal;
13. Opening money;
14. Record receivable or payable debt;
15. Send Hawala;
16. Record incoming Hawala;
17. Pay Hawala receiver;
18. Settle Hawala partner;
19. Correction through an existing transaction detail.

Opening and all non-FX money operations accept native currency amounts only. Daily users do not enter accounting base values or choose ledger accounts.

## FX rate resolution

The rate workflow is resolved inside the FX route:

| Scenario | Result |
| --- | --- |
| Current rate | Current buy/sell shop rate is shown read-only and used according to the shop's perspective |
| Missing rate | Authorized owner/business administrator may enter it once and optionally publish it as the new shop rate |
| Inline override | User enables a transaction-only rate and must provide a reason; outside-tolerance cashier use creates an approval request |
| Stale rate | The form identifies the old rate and requires either a reasoned continuation or a replacement rate |
| Cashier approval | Draft remains open while approval is requested; it is not discarded or auto-posted |
| Accounting values | Server derives authoritative AFN/base values; client-supplied accounting values are rejected/ignored by authoritative RPCs |

The six automated rate journeys (current, missing, publish, override, stale and cashier approval/draft preservation) pass. The `get_transaction_rate_context` RPC supplies the effective rate context, and the database validates stale/mismatched rate use at posting time.

## Transaction subtype API/RPC map

| Transaction family | Client boundary | Authoritative RPC |
| --- | --- | --- |
| Buy/Sell/Exchange | `postFxTrade` | `record_fx_trade` |
| Rate approval | `requestFxTradeApproval` | `request_fx_trade_approval` |
| Rate context | `getTransactionRateContext` | `get_transaction_rate_context` |
| Publish shop rate | `setExchangeRate` | `set_exchange_rate` |
| Receive/pay/transfer/expense/income/capital/bank movements | `recordOperation` | `record_operation` |
| Opening money | `recordOpeningBalance` | `record_opening_balance` |
| Debt creation | `recordDebt` | `record_debt` |
| Debt settlement | `settleDebt` | `settle_debt` |
| Hawala send | `recordHawalaSend` | `record_hawala_send` |
| Hawala incoming | `recordHawalaIncoming` | `record_hawala_incoming` |
| Hawala payout | `payHawalaBeneficiary` | `pay_hawala_beneficiary` |
| Hawala partner settlement | `settleHawalaPartner` | `settle_hawala_partner` |
| Hawala status transition | `transitionHawalaStatus` | `transition_hawala_status` |
| Correction/reversal | `requestReversal` | `request_reversal` |
| Cashbox close | `recordCashboxClose` | `record_cashbox_close` |
| Cashbox approval/rejection | `approveCashboxClose` / `rejectCashboxClose` | `approve_cashbox_close` / `reject_cashbox_close` |
| Transaction history/detail | `listJournalEntries` / `listCompleteJournalEntries` | `get_transaction_history` / `get_transaction_history_page` |
| Customer creation | `createCounterparty` | `create_counterparty` |

All financial commands carry idempotency/client-command identity where applicable. The concurrency suite proves one economic effect under retries and races.

## Hawala lifecycle and accounting evidence

The implemented lifecycle supports send, incoming obligation, readiness/status transitions, beneficiary payout, paid state, and partner settlement. Payout verifies status, account scope and available native balance. Partner settlement validates the partner, paid transfer and remaining settlement balance and posts against the liability rather than reporting false income.

Migration-backed row locking, append-only audit events and live acceptance tests cover the transition rules. The live suites reported balanced journals, no duplicate economic effect and no negative inventory.

## Transaction detail and correction

- Selecting a transaction navigates immediately to `/transactions/:transactionId`.
- The route survives refresh and shows the business-readable source, destination, currencies, amounts, status and immutable reference.
- Back navigation is explicit.
- Success offers View transaction and New similar actions.
- Correction is available only from the selected transaction detail and uses the authoritative reversal request. It never appears below the list.

## Worker connection and onboarding

The owner can create branch/cashbox-scoped invitations and a ten-character connection code. A worker who has authenticated but has no workspace receives a dedicated connection lobby. Accepting the code resolves the assigned membership, role, branch and cashbox before entering the workspace. QR support is lazy-loaded to keep the initial bundle within budget.

## Reports, localization and visual system

- English, Afghan Dari and Pashto are runtime-switchable; Dari/Pashto use RTL layout and local wording.
- Automated leakage tests cover core routes and direct Dari-to-Pashto switching.
- Daily reports use vector/selectable text and embedded local Noto Sans Arabic fonts instead of rasterized page images.
- The interface uses the consolidated calm visual system, role-specific homes, consistent panels, spacing, status treatments and responsive navigation.
- Route-level lazy loading separates professional settings/compliance and platform administration from the initial application shell.

## Database migrations and linked status

New workflow migrations:

- `20260904210918_hawala_lifecycle_controls.sql`;
- `20260904231303_hawala_operating_journeys.sql`;
- `20260904231613_hawala_partner_settlement.sql`;
- `20260905211516_business_admin_role.sql`;
- `20260905213138_authoritative_transaction_rate_context.sql`;
- `20260905214700_worker_connection_lobby.sql`;
- `20260905215649_business_admin_operational_permissions.sql`;
- `20260906011500_authoritative_daily_valuation.sql`;
- `20260906014500_fx_rate_workflow.sql`.

The linked Supabase migration history matches the local history through `20260906014500_fx_rate_workflow.sql`. `supabase db lint --linked --fail-on error` reports no schema errors.

Rollback rules:

- do not reset or destructively rewrite production migration history;
- correct database behavior with a reviewed forward migration;
- a web release can be rolled back by promoting the prior READY Vercel deployment/alias;
- if a schema change must be reversed, first preserve data and deploy a compatibility migration before rolling the web client back.

## Changed-file summary

| Area | Principal files |
| --- | --- |
| Shell, routes and workflows | `src/App.tsx`, `src/main.tsx`, `src/OpeningExperience.tsx`, `src/AppIcon.tsx` |
| Design and responsive behavior | `src/App.css`, `src/professional.css`, `public/sarafi-opening.html`, `public/sarafi-opening.js` |
| Financial/domain boundaries | `src/lib/financialApi.ts`, `src/lib/exports.ts`, `src/domain/commands.ts`, `src/domain/access.ts` |
| Localization | `src/lib/i18n.ts`, `src/lib/uxCopy.ts`, `public/fonts/NotoSansArabic-*.ttf` |
| Lazy-loaded workspaces | `src/ProfessionalWorkspace.tsx`, `src/PlatformWorkspace.tsx` |
| Browser/unit acceptance | `src/*.test.ts`, `src/domain/*.test.ts`, `tests/e2e/*.spec.ts` |
| Live acceptance fixtures | `scripts/security/run-premium-web-acceptance.mjs`, `run-money-accounts-acceptance.mjs`, `run-step16-concurrency.mjs` |
| Hosting/build | `package.json`, `package-lock.json`, `playwright.config.ts`, `vercel.json` |
| Database | nine migrations listed above |
| Evidence artifacts | `reports/`, `scripts/reports/`, `output/pdf/`, `test-results/web-ux-production/` |

## Exact verification record

| Command/check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint -- src tests` | PASS |
| `npm test` | PASS: 23 files passed, 1 intentionally skipped; 76 tests passed, 2 intentionally skipped; 0 failed |
| `npx playwright test` | PASS: 242 passed, 22 intentional skips, 0 failed across Chromium, Firefox and WebKit |
| `npx playwright test tests/e2e/screenshots.spec.ts --project=chromium` | PASS: controlled visual matrix generated |
| `npm run performance:step18` | PASS: 450,823-byte (440.3 KB) local initial JS under the 500 KB budget; export/settings/admin chunks lazy |
| `npm audit --omit=dev` | PASS: 0 known production vulnerabilities |
| `npx supabase db lint --linked --fail-on error` | PASS: no schema errors |
| `npm run security:master-web` | PASS: public status, anonymous denial, organization controls, reconciliation, MFA, 22 named reports and cashier denial |
| `npm run security:premium-web` | PASS: 23/23 |
| `npm run security:money-accounts` | PASS: 22/22; exact journal balance |
| `npm run security:team` | PASS: 7/7 |
| `npm run security:step16` | PASS: 7/7; overspend blocked, retries idempotent, journal balanced, no duplicates or negative inventory |
| `git diff --check` | PASS; line-ending notices only |
| Vercel production build | PASS: 453.06 KB main chunk; deployment READY |

The 22 Playwright skips are deliberate environment/matrix skips: credential-gated production-auth browser tests, Chromium-only direct-route/screenshot/PDF/performance matrices, and the explicitly deferred encrypted offline-draft posting path. The equivalent live backend tenant, MFA, role, idempotency and financial controls passed in the dedicated security suites.

## Screenshot evidence

`test-results/web-ux-production/` contains 69 non-sensitive controlled PNGs:

- the required 42 role-home images: 7 roles × 3 languages × desktop and 390px mobile;
- Buy, Sell, My Money, Customers, Transactions, Settings, Compliance and public-entry evidence in all three languages;
- representative business-admin desktop, accountant Dari mobile, compliance Pashto mobile and viewer desktop images were manually inspected after generation.

Automated layout acceptance additionally covers 360px, 390px, 430px, tablet, 1366px and 1440px, including RTL, keyboard reachability and critical/serious accessibility scans.

## Production verification

After deployment, the canonical alias and the direct nested URL below were checked:

`https://sarafi-swart.vercel.app/app/inspection/transactions/new/fx?side=BUY_FX`

Results:

- HTTP 200 with the SPA entry document;
- browser refresh retained the complete route and query;
- final script `/assets/index-CRFgULVP.js` loaded;
- localized sign-in handoff rendered;
- document reached `readyState=complete`;
- no console errors;
- body width 1265 at viewport width 1280 (no horizontal overflow);
- CSP, HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, permissions policy and referrer policy present.

The production check found and fixed a missing Vercel nested-route rewrite before this report was finalized. A static regression test now prevents that refresh 404 from returning.

## Definition-of-done evaluation

| Gate | Status |
| --- | --- |
| Buy/Sell completed in one route without visiting Rates | PASS automated |
| Missing/stale/overridden rate resolved inline | PASS automated and live backend |
| Dedicated transaction page, not blocking modal | PASS |
| Every transaction family and full Hawala visible | PASS |
| No More; at most five role destinations | PASS static and browser |
| Calm role-specific Home | PASS browser and visual inspection |
| No daily base-value entry | PASS static, browser and backend |
| Immediate real transaction/customer detail URLs | PASS browser |
| Correction only in transaction detail | PASS browser |
| Worker connection and lobby | PASS browser and live API |
| Role UI/server rules and mismatch regression | PASS unit, browser and live security |
| Consolidated visual system | PASS implementation and visual matrix |
| English/Dari/Pashto automated review | PASS |
| Financial/security oracles | PASS live suites |
| Preview/production evidence | PASS deployment, HTTP and real-browser checks |
| Human role/language review | EXTERNAL — not signed |
| Legal/provider/printer/native gates stated honestly | PASS in this report |

## Human UAT and external gates

No automated agent can truthfully sign a human UAT record. The following remain for their named owners:

| Required evidence | Current record |
| --- | --- |
| Busy Saraf completes the final product test without coaching | Not yet signed by a human participant |
| Cashier completes Buy 1,000 USD and prints a receipt | Not yet signed by a human participant |
| Owner/manager validates controls and approvals | Not yet signed by a human participant |
| First-time non-accountant explains and completes the workflow | Not yet signed by a human participant |
| Qualified Afghan Dari terminology review | Automated checks pass; human sign-off pending |
| Qualified Pashto terminology review | Automated checks pass; human sign-off pending |
| Physical 58mm/80mm receipt-printer acceptance | Browser/PDF output exists; physical device acceptance pending |
| Afghan legal/compliance approval | Pending qualified legal owner |
| Live sanctions/payment/provider contracts and credentials | Pending provider/merchant onboarding where applicable |
| Managed backup restore drill | Pending authorized isolated provider target and operator |
| Native Android/iOS or authoritative offline posting | Outside the completed web scope unless separately commissioned |

Accordingly, the accurate statement is: **100% of the engineering-controlled production-web implementation and automated verification requested by the supplied workflow prompt is complete and deployed.** Literal human/regulatory certification is not claimed.
