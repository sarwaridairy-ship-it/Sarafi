# SARAFI Web Human UX Audit

**Engineering audit date:** 2026-08-29

**Production target:** https://sarafi-swart.vercel.app/

**Scope:** web only; native packaging and authoritative offline posting are excluded
**Evidence:** production-equivalent build, Chromium/Firefox/WebKit, Axe, controlled screenshots, read-only live reconciliation

## Result

The web interface is technically ready for production deployment and controlled human UAT. Core daily work is presented as Home, New transaction, My money, Customers & debts, Transactions, and grouped More. English, Afghanistan Dari, and Pashto render semantically at runtime; direct Dari-to-Pashto switching no longer leaves mixed copy.

This is not a claim that real-Saraf or native-language human UAT has passed. Those gates require external participants and remain open.

## First-time comprehension

| Question | Current answer visible without documentation | Engineering result |
|---|---|---|
| What is SARAFI? | A simple digital daftar for Sarafi shops. | PASS |
| What is it for? | Buying/selling currency, locating money, tracking debts, controlling cashboxes/employees, and seeing results. | PASS |
| How do I start? | Direct Sign in/Create account actions. | PASS |
| How do I choose a language? | English, دری, and پښتو are direct choices. | PASS |
| Can a cashier find ordinary work? | Buy, Sell, Exchange, Receive, and Pay are on Home. | PASS technically; human timing pending |
| Can an owner find money? | My money is first-level navigation with currency/location views. | PASS technically; human 10-second test pending |

## Issue ledger

| ID | Severity | Area | Finding | Resolution | Status/evidence |
|---|---:|---|---|---|---|
| UX-001 | CRITICAL | Buy accounting meaning | Buy treated the entered amount as AFN, so 1,000 could preview as 14.28 USD. | Cashier always enters foreign amount. Buy 1,000 USD at 70.25 now repeats “We receive 1,000 USD / We give 70,250 AFN” in form and confirmation. | FIXED; unit and three-browser exact-value tests |
| UX-002 | CRITICAL | Exchange pricing | USD/EUR could reuse the USD/AFN sell rate, creating a false cross-currency value. | Exchange fails closed when no approved direct pair rate exists and tells the user an authorized rate must be added. | FIXED SAFE; three-browser regression test. Configuring a real pair remains an operational requirement. |
| UX-003 | HIGH | Language switching | A DOM mutation translator could leave Dari text after switching to Pashto. | All core copy now renders semantically from language state. | FIXED; direct Dari→Pashto contamination regression |
| UX-004 | HIGH | Protected-screen localization | Daily workspaces contained English/technical strings in RTL languages. | Team, My money, Customers/Sarafs, Transactions, Rates, Reports, Debts, Cashbox check, Hawala, import, onboarding, dialogs, empty states, and errors use semantic copy. | FIXED technically; route-wide English-leak scan in Dari/Pashto |
| UX-005 | HIGH | Navigation/roles | Owner controls competed with cashier work and More was a flat technical surface. | Six primary destinations; More grouped into Business, Team, Settings, and Advanced. Cashier/viewer visibility and disabled states are role-aware. | FIXED; role and responsive browser tests |
| UX-006 | HIGH | Error safety | Backend/RPC wording could reach ordinary users. | Core failures are sanitized into task-focused messages; raw backend details are not rendered in daily workflows. | FIXED in audited routes; authenticated denial wording still needs production UAT |
| UX-007 | MEDIUM | Load reliability | Google Fonts blocked page `load` for up to 30 seconds on constrained/filtered connections. | Removed remote font dependency; robust system fonts cover Latin, Dari, and Pashto. | FIXED; full matrix page loads generally under four seconds |
| UX-008 | MEDIUM | WebKit keyboard behavior | Safari/WebKit did not always focus a clicked trigger, so modal focus restoration could target the page body. | Modal opener stores the actual trigger element; Escape restores it. | FIXED; full WebKit keyboard suite |
| UX-009 | MEDIUM | Mobile width | The live-business controls could overflow narrow screens. | Mobile grid and six-item bottom navigation fit 360/390/430 widths. | FIXED; exact viewport overflow tests |
| UX-010 | MEDIUM | Money evidence | Inspection My money waited on a live backend and could remain at Loading. | Controlled inspection is deterministic; production still uses authoritative calls. | FIXED; evidence drill-down test |
| UX-011 | MEDIUM | Thermal receipt | Preview opening could return an unwritable window; receipt was hard-coded English/RTL and accepted unescaped values. | 58mm/80mm HTML is escaped, language/direction aware, and keeps money values isolated LTR. | FIXED technically; physical printer and authenticated receipt UAT pending |
| UX-012 | LOW | Financial precision display | Computed values exposed internal 12-decimal precision. | UI displays two decimals while server commands retain exact decimal precision. | FIXED; visual reinspection and browser tests |

## Language and terminology review

- English: engineering review PASS.
- Afghanistan Dari: core-route technical/contextual review PASS; RTL and money direction visually inspected.
- Pashto: core-route technical/contextual review PASS; no Dari or English fallback detected on audited routes.
- Human language gate: PENDING. No claim of competent native-review approval is made.
- Codes such as AFN, USD, EUR, CSV, PDF, and the SARAFI name are intentionally retained.

## Visual evidence

The controlled set under `test-results/web-ux-production/` contains public, owner, cashier, Buy, Sell, My money, Customers & debts, Transactions, and More screenshots in all three languages, plus 390px owner/More views. No real customer or production financial data is included.

Representative images visually reviewed:

- Pashto owner Home at 390px
- Dari Buy confirmation at desktop
- English grouped More at 390px
- Pashto My money at desktop

## Evidence boundary and UAT gate

Engineering automation cannot establish that an ordinary Afghan Saraf understands the product without help. Required external closure:

1. Two Saraf owners and two cashiers complete the scripted tasks without coaching.
2. A competent Afghanistan Dari reviewer approves terminology.
3. A competent Pashto reviewer approves terminology.
4. Authenticated production owner/cashier journeys and receipts are verified with controlled credentials.
5. 58mm/80mm output is checked on actual supported printer hardware.

Until these are recorded, `START NATIVE APP = NO`.
