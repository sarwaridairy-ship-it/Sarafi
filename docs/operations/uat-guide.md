# SARAFI Stage 9 UAT Guide

## Test setup

Use a staging Supabase project with synthetic data only. Create one owner, manager, accountant, cashier, viewer, compliance officer, two branches, two cashboxes, AFN/USD/EUR currencies, and two counterparties. Record the build version, migration version, device/browser, language, and timezone.

## Full-day owner workflow

1. Owner creates/activates the business and reviews opening balances.
2. Cashier opens an assigned cashbox and verifies expected AFN/USD balances.
3. Manager changes the USD/AFN rate; cashier sees the authorized current rate.
4. Cashier buys 10,000 USD for 690,000 AFN and verifies the receipt.
5. Cashier sells 5,000 USD for the expected amount and verifies realized profit uses carrying cost.
6. Cashier performs a USD/EUR exchange without creating two customer-facing trades.
7. Cashier creates a 3,000 USD receivable and settles 1,250 USD.
8. Accountant records an expense; owner investment is checked as equity, not income.
9. Manager transfers cash from safe to counter; net assets and profit do not change.
10. Cashier requests an approval-required reversal; requester cannot approve their own request.
11. Owner approves the reversal with a reason; both original and reversal remain visible.
12. Owner watches activity from a second authorized device and verifies reconnect refetches state.
13. Cashier closes one cashbox with an exact count and another with a 1,000 AFN shortage.
14. Manager reviews the shortage reason and the resulting variance workflow.
15. Owner reviews P&L, trial balance, currency position, and Where Is My Money.
16. Owner exports CSV/PDF/print output and confirms business name, filters, timezone, generated time, and valuation basis.
17. Repeat core flow in English, Dari, and Pashto; verify RTL, mixed currency codes, dates, and receipts.
18. Disconnect the cashier device, verify financial posting controls are disabled, save an explicitly labelled draft if needed, reconnect, and verify the draft is not auto-submitted.
19. Reconnect after an authoritative balance change and verify the command becomes Sync Conflict, never Posted.

## Acceptance evidence

Attach screenshots or exported artifacts, Supabase query results, receipt references, audit IDs, and tester initials for each step. Classify every issue as blocking, high, medium, low, or accepted non-blocking. No blocking/high issue may move to production.
