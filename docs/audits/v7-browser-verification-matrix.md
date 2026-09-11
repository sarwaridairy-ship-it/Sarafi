# SARAFI v7 browser verification matrix

Date: 2026-09-12

Browsers: local Chromium, Firefox, and WebKit through the inspection application at `127.0.0.1:5173`.

Automated public inspection result: 331 passed, 65 skipped, 0 failed across the three engines. The final Chromium regression after canonical route reconciliation was 121 passed and 11 skipped. Skipped cases remain explicit and principally cover authenticated linked-environment journeys or browser-specific deterministic artifact generation; they are not treated as release evidence.

Automated probes asserted `document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1` on the inspected routes. Console inspection reported no application errors.

| Journey | Widths evidenced | Result |
| --- | --- | --- |
| My Money exact snapshot | 390, 768, 1024, 1440 | Layout and exact required totals visible; no page overflow |
| Buy FX current rate | 768, 1024, 1440 | One-side compact rate row; no mega-card |
| Buy FX stale/manual rate | 390 | One inline exception; Review disabled until rate and reason |
| Transaction confirmation | 390 | Both actions visible above bottom navigation |
| Debt with USD currency | 390 | No transaction-rate resolver; no overflow |
| Hawala inbox | 390, 768, 1024, 1440 | Mobile cards, tablet drawer/rail modes, and filters visible |
| Hawala send | 390 | Exact verified endpoint selector and compact required rate |
| Hawala payout identity | 390 | Front/back evidence controls and payout action visible |
| Rate board, Sarai Shahzada | 1440 | Selected currency list with AFN buy/sell table |
| Rate board, Khorasan | 390, 1440 | Khorasan AFN rates, not an IRN-only table |
| Business settings | 390 | Responsive card hierarchy; no overflow |
| Security and access | 390 | Responsive security/app-lock controls; no overflow |
| Locked screen | 390, 1440 | Financial workspace hidden; unlock surface only |
| Transaction receipt | 390 | Compact receipt header/details; no horizontal overflow |

Retained files are in `artifacts/whole-project-v7/screenshots/`.

This is a focused engineering evidence set, not the complete authenticated release matrix. Still required in protected CI: all named roles against real server claims; cross-tenant and cross-branch denials; real approval/concurrency/idempotency flows; private-storage denials; retained traces and accessibility/performance artifacts; and isolated migrated-database evidence. Human Android/iPhone evidence is tracked separately.
