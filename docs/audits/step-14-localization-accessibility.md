# Step 14: English, Afghan Dari, Pashto, and Accessibility Evidence

Reviewed: 2026-08-27

## Implemented

- Translation resources exist for English, Afghan Dari, and Pashto.
- Core navigation, dashboard, cashier actions, rates, reports, debts, reconciliation, Hawala, and shell labels use translation resources where implemented.
- Language preference persists locally and switches document language and direction.
- RTL browser coverage exists for Dari and Pashto switching.
- Chromium, Firefox, and WebKit browser projects are configured.
- Axe automation checks the public workspace for critical/serious violations.
- Keyboard checks focus all five primary cashier actions.
- Form controls use labels or explicit accessible names for compact calculator and rate controls.
- Contrast failures found by Axe were corrected and the Chromium accessibility suite now passes.

## Executable Evidence

- `npx playwright test tests/e2e/accessibility.spec.ts` passes public workspace Axe and keyboard checks across Chromium, Firefox, and WebKit.
- Full browser suite passes the core responsive and RTL journeys.
- Typecheck, lint, unit tests, and production build pass.

## Human Review Gate

Human Afghan Dari terminology review and separate Pashto terminology review are not
automatically claimed. A qualified reviewer must inspect every route, validation message,
receipt/PDF, mixed Latin currency string, mobile layout, and printed RTL output and record
name, date, findings, and approval.

## Remaining Automation Gate

The production-auth accessibility test is opt-in through `SARAFI_AUTH_E2E_URL` and remains
skipped until a production-like authenticated target is configured. Full keyboard focus
trapping and screen-reader review of every modal remains a manual QA responsibility.
