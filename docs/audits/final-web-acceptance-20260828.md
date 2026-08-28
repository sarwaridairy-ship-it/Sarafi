# SARAFI WEB FINAL ACCEPTANCE

**Date:** 2026-08-28

## EXECUTIVE RESULT

**OVERALL WEB UX:** PARTIAL

**READY TO BECOME NATIVE APP BLUEPRINT:** NO

**START NATIVE APP:** NO

## PRODUCTION

- **URL:** https://sarafi-swart.vercel.app/
- **Deployment URL:** https://sarafi-f14h3wf7n-shafiullah-s-projects1.vercel.app
- **Deployment ID:** Vercel URL above; `vercel inspect` could not retrieve provider metadata.
- **Git SHA:** `62654ce` is `HEAD` and `origin/main`; the deployed build used the dirty worktree containing uncommitted UX changes, so no single committed SHA can be claimed as the exact deployment source.
- **HTTP:** 200
- **Bundle observed:** `/assets/index-DCpWpz2m.js`
- **Console errors:** No console-error audit was retained; do not claim a clean production console.
- **Supabase project:** `vbvwuqzqtcorassvotke`

## TEST INVENTORY

- **Current unit count:** 60 passing, 2 intentionally skipped; 19 test files passed, 1 skipped.
- **Previous count:** Dated documents report 49 or 50 depending on the historical run.
- **Removed tests:** No test files were removed in the current working diff.
- **Skipped tests:** Provider-dependent live checks and authenticated accessibility without a configured production auth fixture.
- **UX tests:** 21/21 passed in Chromium, Firefox, and WebKit.
- **Accessibility:** Public accessibility and keyboard checks passed in all three browsers; authenticated accessibility was skipped.
- **Explanation:** Counts differ because dated reports covered different suites; the current repository run is authoritative for this acceptance pass.

## PUBLIC EXPERIENCE

- **First-time understanding:** PASS in production browser inspection.
- **Product explanation:** PASS; digital daftar for Sarafi shops is explained.
- **Language selector:** PASS; direct Dari, Pashto, and English choices.
- **CTA:** PASS; sign-in and account creation are visible.
- **Sign in:** PASS; localized entry form is visible.

## OWNER

- **Home:** Implemented locally and covered in inspection-mode browser tests.
- **My Money:** Implemented as the money-location workspace; authenticated production data not UAT-verified.
- **Where Is My Money:** Implemented with currency/location views and evidence drill-down; live authenticated fixture pending.
- **Debts:** Implemented with explicit receivable/payable wording and settlement; authenticated UAT pending.
- **Today:** Dashboard metrics exist; owner human UAT pending.
- **Employees:** Team and device workspace exists; owner UAT pending.
- **Reports:** Reports workspace exists; live export journey pending.
- **Settings:** Existing administration route exists; production UAT pending.
- **10-second USD test:** Not proven with an authenticated owner fixture.

## CASHIER

- **Home:** Primary cashier actions are visible in local inspection mode.
- **Buy:** Visible and distinct.
- **Sell:** Visible and distinct.
- **Exchange:** Visible and distinct.
- **Receive:** Visible and distinct.
- **Pay:** Visible and distinct.
- **Cashbox:** Existing cashbox/reconciliation workflow; cashier UAT pending.
- **Rates:** Read-only authorized rate display exists; live cashier UAT pending.
- **Transaction history:** Existing transactions workspace; cashier UAT pending.

## BUY/SELL

- **Buy perspective:** Local form uses “We give” and “We receive”; production authenticated confirmation/receipt not verified.
- **Sell perspective:** Local form uses “We give” and “We receive”; production authenticated confirmation/receipt not verified.
- **Rate correctness:** Domain and unit tests pass; full live journey remains pending.
- **Confirmation:** No separate human-readable confirmation screen has been proven in production.
- **Receipt:** Existing print/export capability; three-language production receipt audit pending.

## NAVIGATION

- **Desktop:** Primary navigation simplified and tested.
- **Mobile:** Responsive five-item navigation implemented and tested at 390px; public production no-overflow probe passed at 360, 390, and 430px.
- **More grouping:** Advanced sections grouped under More; browser tests pass in all three engines.
- **Technical terminology leakage:** PARTIAL; core dashboard and trade-form wording is now translated locally, but other protected screens still contain hard-coded technical wording.

## LOCALIZATION

- **English:** Technical PASS.
- **Dari technical:** Public entry and RTL PASS; protected-screen coverage PARTIAL.
- **Dari contextual/human:** PENDING competent Afghan reviewer.
- **Pashto technical:** Public entry and RTL PASS; protected-screen coverage PARTIAL.
- **Pashto contextual/human:** PENDING competent Pashto reviewer.
- **Latest translation repair:** Local dashboard and core trade-form translations pass typecheck, lint, unit tests, and a browser regression test; production redeploy is blocked by Vercel provider `fetch failed` errors.
- **English leakage:** Present in protected hard-coded messages.
- **RTL:** Public production entry PASS at required viewport probes.
- **Mixed-number bidi:** Not fully authenticated/receipt verified.

## RESPONSIVE

- **360:** Public EN/Dari/Pashto entry probe passed without horizontal overflow.
- **390:** Public entry and local mobile navigation passed.
- **430:** Public EN/Dari/Pashto entry probe passed without horizontal overflow.
- **Tablet:** Public entry probe passed at 768px.
- **Desktop:** Public entry probe passed at 1366px; 1440px not separately retained.

## BROWSERS

- **Chromium:** 21/21 UX tests passed; public accessibility passed.
- **Firefox:** 21/21 UX tests passed; public accessibility passed.
- **WebKit:** 21/21 UX tests passed; public accessibility passed.

## ACCESSIBILITY

- **Axe:** Public critical/serious violations: 0 in all three browsers.
- **Keyboard:** Public cashier actions focus correctly.
- **Focus:** Public controls verified; authenticated modal focus not fully audited.
- **Labels:** Public/auth entry labels verified; protected screens remain partial.
- **Touch targets:** Mobile navigation uses 48px minimum item height; full manual audit pending.

## PERFORMANCE

- **Initial JS:** Build output contains approximately 400 KB main application chunk plus lazy/auxiliary chunks; prior budget checks pass.
- **Initial CSS:** Approximately 20 KB production CSS.
- **LCP:** Not measured with an equivalent production lab method in this pass.
- **CLS:** Not measured in this pass.
- **Low-bandwidth:** Technical checks exist, but representative 3G/low-memory device evidence is pending.

## FINANCIAL REGRESSION

- **Buy:** Domain/unit coverage PASS; full live UX/accounting journey pending.
- **Sell:** Domain/unit coverage PASS; full live UX/accounting journey pending.
- **Exchange:** Domain/unit coverage PASS; full live UX/accounting journey pending.
- **Debt:** Unit/live selected evidence PASS; complete acceptance journey pending.
- **Transfer:** Existing domain coverage; full final live matrix pending.
- **Reversal:** Existing authoritative workflow and tests; production UAT pending.
- **My Money reconciliation:** Selected live snapshot/concurrency evidence PASS; full production owner verification pending.

## SECURITY REGRESSION

- **Tenant isolation:** Selected live evidence PASS; complete current certification remains PARTIAL.
- **Roles:** Selected owner/viewer/cashier controls PASS; authenticated UX UAT pending.
- **AAL2:** Historical fresh fixture sub-gates PASS; consolidated current manifest remains PARTIAL.
- **Approval:** Historical self/cross-tenant/idempotency/concurrency sub-gates PASS; broader certification remains PARTIAL.
- **Device/member revocation:** Evidence exists in security reports; full current rerun pending.

## HUMAN UAT

- **Owner participants:** 0 recorded.
- **Cashier participants:** 0 recorded.
- **Core completion rate:** Not measured.
- **Buy/Sell confusion:** Not measured with real participants.
- **Top 5 problems:** Protected terminology leakage; authenticated production UAT missing; human Dari review missing; human Pashto review missing; backup/restore evidence missing.

## OPEN UX ISSUES

- **BLOCKER:** None proven in the public entry surface; authenticated blocker status cannot be closed without UAT.
- **CRITICAL:** None recorded from automated public accessibility.
- **HIGH:** Protected terminology remains partial; authenticated owner/cashier UAT missing; human Dari/Pashto review missing.
- **MEDIUM:** Production screenshot matrix and low-bandwidth/real-device evidence incomplete; 1440px separate capture missing.
- **LOW:** Performance lab metrics and console-error audit not retained.

## LANGUAGE REVIEW

- **Dari:** Technical public-entry PASS; competent human review required.
- **Pashto:** Technical public-entry PASS; competent human review required.

## CREDENTIAL REMEDIATION

- **Privileged leaked credential inactive:** Not independently re-proven in this pass; prior remediation was reported. Do not claim fresh provider confirmation.
- **Secret scan:** PASS for repository files outside ignored/local files; no secret-like matches found.

## APP DECISION

**START NATIVE APP: NO**

Reasons: authenticated owner/cashier human UAT is not recorded; competent Dari/Pashto review is not recorded; protected-screen terminology remains partial; the latest translation repair is not yet deployed because Vercel returned `fetch failed`; provider backup/restore evidence remains open; the deployed build came from a dirty worktree without a single committed release SHA; and authenticated production receipt, error, role, and financial journeys remain unverified.
