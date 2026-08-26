# Step 06: Where Is My Money? Evidence

Reviewed: 2026-08-27

## Implemented

- Dedicated owner workspace at Cash & Accounts -> Where is my money?
- Currency-first view showing native inventory positions.
- Location-first view showing ledger-derived asset locations.
- Currency filter without forced base-currency conversion.
- Receivable/payable exposure summaries remain native and use arbitrary-precision Decimal math.
- Ledger evidence query supplies contributing posted asset lines.
- Location rows are selectable for evidence drill-down.
- Loading and incomplete-data states are explicit.
- Print snapshot action is available from the workspace.
- Mobile layout uses the existing responsive panel and balance-row system.

## Source Map

| Visible value | Source |
| --- | --- |
| Native currency total | `get_owner_dashboard.positions` from `fx_inventory_cost_state` |
| Location amount | `get_owner_dashboard.locations` from posted asset journal lines |
| Receivable/payable exposure | `listLocationEvidence` from tenant-scoped posted journal lines |
| Evidence rows | `listLocationEvidence` joined to journal entries and ledger accounts |
| Counted cash difference | `get_owner_dashboard.reconciliation_differences` |

## Executable Evidence

- Browser test covers dedicated workspace, currency-first view, location-first view, and evidence count.
- Decimal-based exposure calculation avoids binary floating-point aggregation.
- Typecheck, lint, unit tests, E2E tests, and production build pass.

## Remaining Gate

A real multi-branch and multi-cashbox organization is required to prove branch/cashbox
filtering and the under-ten-second owner lookup with production data. No demo balances
are created to manufacture this evidence.
