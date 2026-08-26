# Step 07: Counterparties, Debt Book, and Statements Evidence

Reviewed: 2026-08-27

## Implemented

- People workspace with tenant-scoped counterparty loading.
- Search by counterparty display name.
- Risk-blocked counterparties are excluded by the API query.
- Native per-currency receivable/payable totals are shown separately.
- Outstanding debt records are selectable from the Debts workspace.
- Partial settlement uses the authoritative `settle_debt` RPC and row locking.
- Settlement cannot exceed the outstanding amount.
- Settlement materialization preserves a link to the original debt and journal entry.
- Debt creation validates counterparty organization and blocked status.

## Executable Evidence

- Browser test covers People search and no-match behavior.
- Domain tests cover debt creation, partial settlement, over-settlement rejection, and exact Decimal remaining balance.
- Supabase remote lint passes with all migrations synchronized.

## Remaining Gate

A complete statement timeline for every trade, fee, receive/pay event, settlement,
reversal, actor, and device requires authenticated seeded counterparties and live
journal data. The current People view exposes debt statements and native balances;
full counterparty editing, documents, credit limits, WhatsApp sharing, and complete
statement filters remain subsequent implementation scope.
