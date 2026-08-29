# SARAFI Web Final Acceptance

**Date:** 2026-08-29  
**Scope:** web production acceptance; native packaging and authoritative offline posting deferred by instruction

## Executive result

**ENGINEERING WEB UX:** PASS FOR DEPLOYMENT  
**HUMAN UAT:** PENDING  
**OVERALL ACCEPTANCE:** PARTIAL  
**READY TO BECOME NATIVE APP BLUEPRINT:** NO  
**START NATIVE APP:** NO

The remaining “NO” is not caused by a known blocker in the audited web UI. It is caused by required external evidence that automation cannot manufacture: real owner/cashier UAT, competent Dari/Pashto human review, authenticated production journeys, and physical receipt-printer checks.

## Release baseline

- Branch before release commit: `main`
- Baseline HEAD/origin-main: `9e3beef8c2c946e11bf8422f712ae057fc1db4a3`
- Release commit: the commit containing this report; resolve with `git rev-parse HEAD` at deployment
- Node: `v24.19.0`
- Package: `sarafi-exchange-os@0.0.0`
- Supabase project ref: `vbvwuqzqtcorassvotke`
- Vercel project: `sarafi` (`prj_K0cO23MJOgFXggnjM65dDrEuTMZ5`)
- Canonical production URL: https://sarafi-swart.vercel.app/
- No database migration was added, altered, or applied in this UX phase.

## Test inventory

- Unit suite: 62 passed, 2 intentionally skipped; 20 test files passed and 1 was skipped.
- The count increased from 60 because two thermal-receipt rendering/escaping tests were added during visual acceptance.
- Test files removed: 0.
- Test files added: localization, role UX, controlled screenshots, low-bandwidth performance, and thermal receipt coverage.
- Provider-dependent tests: authenticated security and authenticated accessibility require explicit live configuration.
- Deferred test: encrypted offline draft workflow, per the explicit offline/package deferral.
- Final browser matrix: 124 passed, 14 intentionally skipped, 0 failed, 0 retries, serial single-worker run.
- Browser skips: 9 authenticated provider-dependent checks, 3 explicitly deferred offline-draft checks, and 2 non-Chromium skips for the Chromium-only CDP network profile.

## Public experience

- Product and audience are explained in plain language.
- Core benefits are visible before sign-in.
- Direct English/دری/پښتو selector is available.
- Sign in and account creation are obvious.
- “Exchange OS” is removed from public title and manifest copy.

## Owner and cashier experience

- Owner: Home, My money, money locations/evidence, Customers & debts, Transactions, Reports, Team & Devices, Cashbox check, Rates, Settings.
- Cashier: Buy, Sell, Exchange, Receive, Pay, Cashbox check, Settings; owner-only controls are not shown.
- Viewer: financial entry actions and New transaction are visibly disabled.
- Primary navigation remains Home, New transaction, My money, Customers & debts, Transactions, More.
- More is grouped into Business, Team, Settings, and Advanced.

## Buy, Sell, and Exchange

- Buy 1,000 USD at 70.25: We receive 1,000 USD; We give 70,250 AFN; confirmation repeats the same values.
- Sell 1,000 USD at the configured 70.35 fixture: We give 1,000 USD; We receive 70,350 AFN; confirmation repeats the same values.
- Buy and Sell use distinct read-only authorized rates and exact decimal domain calculations.
- Exchange does not invent a USD/EUR rate from USD/AFN. Without an approved pair rate it fails closed with a plain explanation.
- Invalid/zero amounts remain in the dialog with a safe error.

## Localization and RTL

- English technical/contextual: PASS.
- Afghanistan Dari technical/contextual: PASS in audited routes.
- Pashto technical/contextual: PASS in audited routes.
- Rendered English leakage detector: PASS for Dari and Pashto, excluding intentional codes/proper names.
- Dari→Pashto contamination regression: PASS.
- Mixed money/rate direction: PASS in representative visual review.
- Competent human Dari/Pashto approval: PENDING.

## Responsive and visual evidence

- Mobile: 360×800, 390×844, 430×932.
- Tablet: 768×1024.
- Desktop: 1366×768 and 1440×900.
- No horizontal overflow in the automated matrix.
- Controlled screenshot matrix: 33 non-sensitive images under `test-results/web-ux-production/`.
- Covered in all three languages: public, owner, cashier, Buy, Sell, My money, Customers & debts, Transactions, More; owner/More also at 390px.

## Browsers and accessibility

- Full production-equivalent matrix runs serially in Chromium, Firefox, and WebKit.
- WebKit modal trigger focus uses the actual clicked element and restores on Escape.
- Service workers are blocked in the web UI harness because offline packaging is deferred and repeated registration destabilized isolated WebKit contexts.
- Axe critical/serious findings on public and trade-dialog surfaces: 0.
- Keyboard reachability, focus trap, Escape close, focus restoration, labels, and responsive touch navigation: PASS.
- Authenticated production Axe check: PENDING configured auth fixture.

## Performance and constrained connection

- Main entry: approximately 446 KB raw / 129.5 KB gzip.
- Required Supabase client preload: approximately 208.6 KB raw / 54.0 KB gzip.
- CSS: approximately 21.5 KB raw / 5.5 KB gzip.
- Heavy PDF generator: lazy; no longer preloaded by the initial HTML.
- Remote Google Fonts dependency: removed.
- Project raw-entry budget: under 500 KB.
- Constrained profile: 150 ms latency, 1.6 Mbps down, 0.72 Mbps up.
- Constrained lab timings: public/sign-in 1,560 ms; owner Home 531 ms; Buy 229 ms; My money 54 ms.
- Lab LCP: 528 ms. CLS: 0. These are local production-build lab measurements, not production field telemetry.
- The report is retained in `test-results/performance-ux.json`.

## Financial and security regression

- Unit accounting/property suite: PASS.
- Live read-only reconciliation: base debit `18,003.06 AFN`; base credit `18,003.06 AFN`; PASS.
- Reconciliation gate corrected to avoid adding AFN and USD native amounts as one unit; native totals are informational across currencies.
- Retained live concurrency evidence: 7/7 PASS in `step-16-live-report-20260828.json`.
- Dependency audit: 0 vulnerabilities.
- Bounded tracked-secret scan: no secret-like values; local environment files are Git-ignored.
- Mutation-heavy MFA/membership/concurrency scripts were not rerun in this UX pass because they enroll factors, suspend test memberships, and post financial fixtures. Existing retained evidence was preserved.

## Receipt and print

- 58mm/80mm HTML is language/direction aware, escapes untrusted values, and isolates numeric money runs.
- PDF is lazy-loaded.
- Physical printer certification: PENDING actual hardware.
- Authenticated English/Dari/Pashto production receipt journey: PENDING controlled credentials.

## Human UAT

- Owner participants: 0 recorded.
- Cashier participants: 0 recorded.
- Core completion rate: not measured.
- Buy/Sell human confusion rate: not measured.
- Required sample: at least two owners and two cashiers, without coaching.

## Open issues

- BLOCKER: none found in engineering web verification.
- CRITICAL: none open; Buy perspective and unsupported Exchange pricing were corrected.
- HIGH: real owner/cashier UAT; competent Dari/Pashto review; authenticated production role/receipt/error journeys; approved rates required for each enabled Exchange pair.
- MEDIUM: physical 58mm/80mm printer verification; provider backup/restore drill remains a separate operational gate.
- LOW: production field LCP/CLS telemetry is not part of this local acceptance run.

## App decision

**START NATIVE APP: NO**

Exact reasons: no real owner/cashier participants are recorded; no competent human Dari/Pashto approval is recorded; authenticated production role/receipt/error journeys still require controlled sign-in; and physical printer output has not been certified. Offline/native packaging remains explicitly deferred.
