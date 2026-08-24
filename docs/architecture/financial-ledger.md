# SARAFI Financial Ledger

## Invariants

1. Every financial event belongs to exactly one organization.
2. Posted events are immutable; corrections are reversals or adjustments.
3. Native currency amounts are authoritative and stored as decimal/NUMERIC values.
4. Commands are idempotent and execute atomically on the server.
5. Derived balances are rebuildable from the ledger.
6. Every event records actor, device, branch, event time, and sync/creation time.

## First production posting path

`record_fx_trade(command)` will validate organization membership, device status, currency enablement, cashbox availability, approval thresholds, and idempotency key before writing the trade, ledger entries, audit event, and derived balance updates in one database transaction.

The current dashboard intentionally does not claim this local demo state is authoritative.
