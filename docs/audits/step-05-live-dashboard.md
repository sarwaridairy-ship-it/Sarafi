# Step 05: Live Owner Dashboard Evidence

Reviewed: 2026-08-27

## Implemented

- Production authentication is required before live dashboard access.
- Public e2e inspection uses a synthetic organization only and cannot post financial data.
- Dashboard metrics are returned by `get_owner_dashboard` from Supabase ledger/report tables.
- The live dashboard contract includes transaction count, buy/sell/exchange counts, volume, realized profit, commission income, operating expenses, net result, net position, pending approvals, reconciliation differences, positions, locations, activity, and `fresh_at`.
- Dashboard date selection is passed to the authoritative RPC.
- Current USD/AFN buy and sell rates load from `rate_board_entries` in authenticated mode.
- Failed dashboard reads render a retryable alert and do not present a successful financial state.
- Privacy mode only changes visual display and does not alter queries or authorization.
- Static transaction badge values and production rate defaults were removed; preview defaults exist only in inspection mode.

## Source Map

| Visible value | Authoritative source |
| --- | --- |
| Net position | `get_owner_dashboard.net_position_base`, derived from posted asset/liability journal lines |
| Volume | `get_owner_dashboard.volume_base`, derived from posted journal debits |
| Realized profit | `get_owner_dashboard.realized_profit`, gain and loss accounts |
| Commission | `get_owner_dashboard.commission_income`, commission income accounts |
| Expenses | `get_owner_dashboard.expenses`, expense-category journal lines |
| Net result | `get_owner_dashboard.net_result` |
| Pending approvals | `approval_requests` through `get_owner_dashboard` |
| Reconciliation difference | `cashbox_close_lines` through `get_owner_dashboard` |
| Currency positions | `fx_inventory_cost_state` through `get_owner_dashboard` |
| Money locations | posted asset `journal_lines` through `get_owner_dashboard` |
| Recent activity | posted financial events and journal entries through `get_owner_dashboard` |
| Current rate | active `rate_board_entries` queried for USD/AFN |

## Executable Evidence

- Full unit and domain test suite passes.
- Browser suite passes dashboard navigation, mobile, RTL, core actions, and error-safe UI journeys.
- Typecheck, lint, and production build pass.
- Supabase migrations through `031` are synchronized.
- `npx supabase db lint --linked` passes with no schema errors.

## Remaining Gate

Branch and cashbox-scoped dashboard filters and a complete live multi-branch dataset
require an authenticated organization with multiple branches/cashboxes. Live dashboard
reconciliation against real posted data must be run through the authenticated test harness;
no demo financial rows are created to satisfy this gate.
